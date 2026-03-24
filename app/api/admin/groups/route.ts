/**
 * app/api/admin/groups/route.ts
 * 讨论分组管理 API（管理员专用）
 * 处理选书名单发布后的自动分组
 * 分组算法：二人随机配对，避开已讨论过的组合
 * 道具卡使用窗口：选书名单发布后24h内
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu } from "@/lib/jiagu";
import { createBulkNotifications, NOTIFICATION_TYPES } from "@/lib/notifications";

/**
 * 智能分组算法
 * 优先处理黑箱卡强制配对，剩余用户随机配对并避开历史组合
 */
async function generateGroups(
  bookId: string,
  bookListId: string,
  userIds: string[]
): Promise<Array<{ userA: string; userB: string }>> {
  if (userIds.length < 2) return [];

  // ── 1. 黑箱卡强制配对 ──────────────────────────────
  const blackBoxCards = await prisma.itemCard.findMany({
    where: {
      cardType: "black_box",
      status: "used",
      bookId,
      userId: { in: userIds },
      targetUser: { in: userIds },
    },
  });

  const forcedPairs: Array<{ userA: string; userB: string }> = [];
  const forcedUsers = new Set<string>();

  for (const card of blackBoxCards) {
    if (
      card.targetUser &&
      !forcedUsers.has(card.userId) &&
      !forcedUsers.has(card.targetUser)
    ) {
      forcedPairs.push({ userA: card.userId, userB: card.targetUser });
      forcedUsers.add(card.userId);
      forcedUsers.add(card.targetUser);
    }
  }

  // 剩余未被强制配对的用户
  const remaining = userIds.filter((id) => !forcedUsers.has(id));

  if (remaining.length < 2) return forcedPairs;

  // ── 2. 历史配对记录（避免重复） ────────────────────
  const historicalGroups = await prisma.discussionGroup.findMany({
    where: {
      bookId,
      OR: remaining.flatMap((id) => [{ userA: id }, { userB: id }]),
    },
    select: { userA: true, userB: true },
  });

  const pairedBefore = new Set<string>();
  for (const group of historicalGroups) {
    pairedBefore.add([group.userA, group.userB].sort().join("::"));
  }

  // ── 3. 洗牌 + 贪心匹配 ────────────────────────────
  const shuffled = [...remaining];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const pairs: Array<{ userA: string; userB: string }> = [];
  const used = new Set<string>();

  for (let i = 0; i < shuffled.length; i++) {
    if (used.has(shuffled[i])) continue;

    let matched = false;
    for (let j = i + 1; j < shuffled.length; j++) {
      if (used.has(shuffled[j])) continue;
      const pairKey = [shuffled[i], shuffled[j]].sort().join("::");
      if (!pairedBefore.has(pairKey)) {
        pairs.push({ userA: shuffled[i], userB: shuffled[j] });
        used.add(shuffled[i]);
        used.add(shuffled[j]);
        matched = true;
        break;
      }
    }

    if (!matched) {
      for (let j = i + 1; j < shuffled.length; j++) {
        if (!used.has(shuffled[j])) {
          pairs.push({ userA: shuffled[i], userB: shuffled[j] });
          used.add(shuffled[i]);
          used.add(shuffled[j]);
          break;
        }
      }
    }
  }

  return [...forcedPairs, ...pairs];
}

/**
 * GET /api/admin/groups
 * 获取分组管理数据（管理员权限）
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const bookListId = searchParams.get("bookListId") || "";
  const status = searchParams.get("status") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const where: Record<string, unknown> = {};
  if (bookListId) where.bookListId = bookListId;
  if (status) where.status = status;

  const [groups, total] = await Promise.all([
    prisma.discussionGroup.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discussionGroup.count({ where }),
  ]);

  const enriched = await Promise.all(
    groups.map(async (group) => {
      const [book, userA, userB, leader, records] = await Promise.all([
        prisma.book.findUnique({ where: { id: group.bookId } }),
        prisma.user.findUnique({
          where: { id: group.userA },
          select: { id: true, nickname: true },
        }),
        prisma.user.findUnique({
          where: { id: group.userB },
          select: { id: true, nickname: true },
        }),
        prisma.user.findUnique({
          where: { id: group.leaderId },
          select: { id: true, nickname: true },
        }),
        prisma.discussionRecord.count({ where: { groupId: group.id } }),
      ]);
      return {
        ...group,
        book,
        userAInfo: userA,
        userBInfo: userB,
        leaderInfo: leader,
        recordCount: records,
      };
    })
  );

  return NextResponse.json({ groups: enriched, total, page, pageSize });
}

/**
 * POST /api/admin/groups
 * 自动生成讨论分组（管理员权限）
 * 基于书单选书结果自动配对
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const body = await request.json();
  const { bookListId } = body;

  if (!bookListId) {
    return NextResponse.json({ error: "缺少书单ID" }, { status: 400 });
  }

  // 获取书单信息
  const bookList = await prisma.bookList.findUnique({
    where: { id: bookListId },
  });

  if (!bookList) {
    return NextResponse.json({ error: "书单不存在" }, { status: 404 });
  }

  // 获取所有选书记录（按书目分组）
  const selections = await prisma.bookSelection.findMany({
    where: { bookListId },
  });

  // 按书目分组
  const bookUserMap = new Map<string, string[]>();
  for (const selection of selections) {
    if (!bookUserMap.has(selection.bookId)) {
      bookUserMap.set(selection.bookId, []);
    }
    bookUserMap.get(selection.bookId)!.push(selection.userId);
  }

  const createdGroups = [];

  // 为每个书目的选书者生成分组
  for (const [bookId, userIds] of bookUserMap.entries()) {
    // 奇数人数：将荐书人加入选书列表补足偶数
    if (userIds.length % 2 !== 0) {
      const rec = await prisma.recommendation.findFirst({
        where: { bookListId, bookId, status: "on_list" },
        select: { userId: true },
      });
      if (rec && !userIds.includes(rec.userId)) {
        userIds.push(rec.userId);
        // 为荐书人创建选书记录（若尚无）
        const existing = await prisma.bookSelection.findFirst({
          where: { userId: rec.userId, bookListId, bookId },
        });
        if (!existing) {
          await prisma.bookSelection.create({
            data: { userId: rec.userId, bookListId, bookId },
          });
        }
      }
    }

    // 获取该书目的领读人（临时领读员或发布NPC）
    const leader = await prisma.user.findFirst({
      where: { role: "temp_reader", status: "active" },
    });

    const leaderId = leader?.id || session.user.id;

    // 生成配对
    const pairs = await generateGroups(bookId, bookListId, userIds);

    for (const pair of pairs) {
      const group = await prisma.discussionGroup.create({
        data: {
          bookId,
          bookListId,
          userA: pair.userA,
          userB: pair.userB,
          leaderId,
          status: "pending",
        },
      });
      createdGroups.push(group);
    }
  }

  // 通知所有参与者
  const allUserIds = [...new Set(selections.map((s) => s.userId))];
  await createBulkNotifications(
    allUserIds,
    NOTIFICATION_TYPES.DISCUSSION,
    `📖 ${bookList.month}期讨论分组已公布！请查看您的讨论伙伴，祝讨论愉快！`
  );

  return NextResponse.json({
    message: `分组生成完成，共创建${createdGroups.length}个讨论组`,
    groups: createdGroups,
  });
}

/**
 * PATCH /api/admin/groups
 * 管理员调整分组或处理道具卡
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json();
  const { action, groupId, cardType, targetUserId, bookListId: cardBookListId, bookId: cardBookId } = body;

  if (action === "useCard") {
    // 使用道具卡（居民权限，无需管理员）
    if (!cardType) {
      return NextResponse.json({ error: "缺少卡片类型" }, { status: 400 });
    }

    // 黑箱卡必须提供书单和书目上下文
    if (cardType === "black_box") {
      if (!cardBookListId || !cardBookId || !targetUserId) {
        return NextResponse.json({ error: "黑箱卡需要指定书单、书目和目标用户" }, { status: 400 });
      }
      if (targetUserId === session.user.id) {
        return NextResponse.json({ error: "不能指定自己" }, { status: 400 });
      }

      // 验证窗口：书单已关闭且尚未分组
      const bookList = await prisma.bookList.findUnique({ where: { id: cardBookListId } });
      if (!bookList || bookList.status !== "closed") {
        return NextResponse.json({ error: "技能卡使用窗口：选书截止后至分组前" }, { status: 400 });
      }
      const existingGroups = await prisma.discussionGroup.count({ where: { bookListId: cardBookListId } });
      if (existingGroups > 0) {
        return NextResponse.json({ error: "分组已生成，无法再使用技能卡" }, { status: 400 });
      }

      // 验证目标用户也选了同一本书
      const targetSel = await prisma.bookSelection.findFirst({
        where: { userId: targetUserId, bookListId: cardBookListId, bookId: cardBookId },
      });
      if (!targetSel) {
        return NextResponse.json({ error: "目标用户未选择该书目" }, { status: 400 });
      }

      // 验证自己也选了该书
      const mySel = await prisma.bookSelection.findFirst({
        where: { userId: session.user.id, bookListId: cardBookListId, bookId: cardBookId },
      });
      if (!mySel) {
        return NextResponse.json({ error: "您未选择该书目" }, { status: 400 });
      }

      // 检查是否已对此书单使用过黑箱卡
      const alreadyUsed = await prisma.itemCard.findFirst({
        where: { userId: session.user.id, cardType: "black_box", bookId: cardBookId, status: "used" },
      });
      if (alreadyUsed) {
        return NextResponse.json({ error: "您已对该书目使用过黑箱卡" }, { status: 400 });
      }
    }

    const cardCosts: Record<string, number> = {
      black_box: 10,
      dodge: 10,
      discussion_bye: 8,
    };

    const cost = cardCosts[cardType];
    if (!cost) {
      return NextResponse.json({ error: "无效的卡片类型" }, { status: 400 });
    }

    if (session.user.jiaguBalance < cost) {
      return NextResponse.json({ error: "甲骨余额不足" }, { status: 400 });
    }

    await changeJiagu(session.user.id, -cost, `使用黑箱卡`, cardBookId || groupId);

    // 黑箱卡：目标用户立即获得8甲骨补偿
    if (cardType === "black_box" && targetUserId) {
      await changeJiagu(targetUserId, 8, "被黑箱卡指定，获得补偿甲骨", cardBookId || groupId);
    }

    await prisma.itemCard.create({
      data: {
        userId: session.user.id,
        cardType,
        targetUser: targetUserId || null,
        bookId: cardBookId || null,
        status: "used",
        usedAt: new Date(),
      },
    });

    return NextResponse.json({ message: "黑箱卡使用成功，将在分组时自动与目标成为一组" });
  }

  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  if (action === "updateStatus" && groupId) {
    const { status } = body;
    const updatedGroup = await prisma.discussionGroup.update({
      where: { id: groupId },
      data: { status },
    });
    return NextResponse.json({ group: updatedGroup });
  }

  const { bookListId } = body;

  /**
   * 测试工具：为书单中的所有书目，给所有活跃居民生成选书记录
   * 用于测试分组功能，不重复创建已有记录
   */
  if (action === "seedTestSelections" && bookListId) {
    // 获取书单中的所有书目
    const recs = await prisma.recommendation.findMany({
      where: { bookListId, status: "on_list" },
      select: { bookId: true },
    });
    if (recs.length === 0) {
      return NextResponse.json({ error: "书单中暂无书目" }, { status: 400 });
    }

    // 获取所有活跃居民（非管理员）
    const residents = await prisma.user.findMany({
      where: { status: "active", role: { in: ["resident", "temp_reader"] } },
      select: { id: true },
    });
    if (residents.length === 0) {
      return NextResponse.json({ error: "暂无活跃居民账号" }, { status: 400 });
    }

    let created = 0;
    for (const resident of residents) {
      for (const rec of recs) {
        // 避免重复创建
        const exists = await prisma.bookSelection.findFirst({
          where: { userId: resident.id, bookListId, bookId: rec.bookId },
        });
        if (!exists) {
          await prisma.bookSelection.create({
            data: { userId: resident.id, bookListId, bookId: rec.bookId },
          });
          created++;
        }
      }
    }
    return NextResponse.json({
      message: `测试数据生成完成：新增 ${created} 条选书记录（${residents.length} 人 × ${recs.length} 本书）`,
    });
  }

  /**
   * 清除所选书单的所有讨论组（用于重置测试）
   */
  if (action === "clearGroups" && bookListId) {
    const { count } = await prisma.discussionGroup.deleteMany({ where: { bookListId } });
    return NextResponse.json({ message: `已删除 ${count} 个讨论组` });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
