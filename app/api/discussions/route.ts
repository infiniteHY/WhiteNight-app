/**
 * app/api/discussions/route.ts
 * 讨论组管理 API
 * 支持讨论记录提交、状态查询
 * 三阶段讨论：月初+3甲骨、月中+1甲骨、月末+0甲骨
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu, JIAGU_RULES } from "@/lib/jiagu";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

/**
 * 根据讨论时间计算阶段奖励
 * @param phase - 讨论阶段
 * @returns 甲骨奖励数量
 */
function getPhaseReward(phase: string): number {
  switch (phase) {
    case "early":
      return JIAGU_RULES.DISCUSSION_EARLY; // 月初 +3
    case "mid":
      return JIAGU_RULES.DISCUSSION_MID;   // 月中 +1
    case "late":
      return JIAGU_RULES.DISCUSSION_LATE;  // 月末 +0
    default:
      return 0;
  }
}

/**
 * 获取当前月份的讨论阶段
 * @returns 阶段标识
 */
function getCurrentPhase(): string {
  const day = new Date().getDate();
  if (day <= 10) return "early";  // 1-10号
  if (day <= 20) return "mid";    // 11-20号
  return "late";                  // 21-31号
}

/**
 * GET /api/discussions
 * 获取讨论组列表
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bookListId = searchParams.get("bookListId") || "";
  const userId = searchParams.get("userId") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const where: Record<string, unknown> = {};
  if (bookListId) where.bookListId = bookListId;

  // 普通用户只能看到自己的讨论组
  if (!isAdmin(session.user.role)) {
    where.OR = [
      { userA: session.user.id },
      { userB: session.user.id },
    ];
  } else if (userId) {
    where.OR = [{ userA: userId }, { userB: userId }];
  }

  const [groups, total] = await Promise.all([
    prisma.discussionGroup.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discussionGroup.count({ where }),
  ]);

  // 获取关联数据
  const enriched = await Promise.all(
    groups.map(async (group) => {
      const [book, userA, userB, leader, records, bookList] = await Promise.all([
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
        prisma.discussionRecord.findMany({
          where: { groupId: group.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.bookList.findUnique({
          where: { id: group.bookListId },
          select: { id: true, month: true, period: true },
        }),
      ]);
      return { ...group, book, userAInfo: userA, userBInfo: userB, leaderInfo: leader, records, bookList };
    })
  );

  return NextResponse.json({ groups: enriched, total, page, pageSize });
}

/**
 * POST /api/discussions
 * 提交讨论记录
 * 根据讨论时间自动判断阶段并发放甲骨
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json();
  const { groupId, discussTime, location, phase } = body;

  if (!groupId || !discussTime) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  // 验证讨论组
  const group = await prisma.discussionGroup.findUnique({
    where: { id: groupId },
  });

  if (!group) {
    return NextResponse.json({ error: "讨论组不存在" }, { status: 404 });
  }

  // 检查权限（只有讨论组成员可以提交）
  if (
    group.userA !== session.user.id &&
    group.userB !== session.user.id &&
    !isAdmin(session.user.role)
  ) {
    return NextResponse.json({ error: "您不是该讨论组成员" }, { status: 403 });
  }

  // 确定讨论阶段
  const discussDate = new Date(discussTime);
  const day = discussDate.getDate();
  let currentPhase = phase;
  if (!currentPhase) {
    if (day <= 10) currentPhase = "early";
    else if (day <= 20) currentPhase = "mid";
    else currentPhase = "late";
  }

  // 检查该阶段是否已提交
  const existingRecord = await prisma.discussionRecord.findFirst({
    where: { groupId, phase: currentPhase },
  });

  if (existingRecord) {
    return NextResponse.json(
      { error: `${currentPhase === "early" ? "月初" : currentPhase === "mid" ? "月中" : "月末"}阶段已记录讨论` },
      { status: 400 }
    );
  }

  // 创建讨论记录
  const record = await prisma.discussionRecord.create({
    data: {
      groupId,
      discussTime: new Date(discussTime),
      location,
      phase: currentPhase,
      submittedBy: session.user.id,
    },
  });

  // 发放甲骨奖励
  const reward = getPhaseReward(currentPhase);
  if (reward > 0) {
    const phaseNames: Record<string, string> = {
      early: "月初",
      mid: "月中",
      late: "月末",
    };

    // 给两位讨论成员都发放奖励
    await Promise.all([
      changeJiagu(
        group.userA,
        reward,
        `讨论完成奖励（${phaseNames[currentPhase]}阶段）`,
        groupId
      ),
      changeJiagu(
        group.userB,
        reward,
        `讨论完成奖励（${phaseNames[currentPhase]}阶段）`,
        groupId
      ),
    ]);

    // 发送通知
    await Promise.all([
      createNotification(
        group.userA,
        NOTIFICATION_TYPES.DISCUSSION,
        `📚 讨论记录已提交，获得${reward}甲骨奖励（${phaseNames[currentPhase]}阶段）`
      ),
      createNotification(
        group.userB,
        NOTIFICATION_TYPES.DISCUSSION,
        `📚 讨论记录已提交，获得${reward}甲骨奖励（${phaseNames[currentPhase]}阶段）`
      ),
    ]);
  }

  // 提交记录即视为讨论完成
  await prisma.discussionGroup.update({
    where: { id: groupId },
    data: { status: "completed", phase: currentPhase },
  });

  return NextResponse.json({ record, reward }, { status: 201 });
}

/**
 * PATCH /api/discussions
 * 编辑已有讨论记录（讨论组成员或管理员）
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json();
  const { recordId, discussTime, location, phase } = body;

  if (!recordId) {
    return NextResponse.json({ error: "缺少记录ID" }, { status: 400 });
  }

  const record = await prisma.discussionRecord.findUnique({ where: { id: recordId } });
  if (!record) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }

  // 检查权限：只有讨论组成员或管理员可以编辑
  const group = await prisma.discussionGroup.findUnique({ where: { id: record.groupId } });
  if (!group) {
    return NextResponse.json({ error: "讨论组不存在" }, { status: 404 });
  }
  if (group.userA !== session.user.id && group.userB !== session.user.id && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "无权编辑该记录" }, { status: 403 });
  }

  const updated = await prisma.discussionRecord.update({
    where: { id: recordId },
    data: {
      ...(discussTime && { discussTime: new Date(discussTime) }),
      ...(location !== undefined && { location }),
      ...(phase && { phase }),
    },
  });

  // 若阶段发生变化，调整两位成员的甲骨差额
  if (phase && phase !== record.phase) {
    const oldReward = getPhaseReward(record.phase);
    const newReward = getPhaseReward(phase);
    const diff = newReward - oldReward;
    if (diff !== 0) {
      const phaseNames: Record<string, string> = { early: "月初", mid: "月中", late: "月末" };
      const reason = `讨论阶段调整（${phaseNames[record.phase]} → ${phaseNames[phase]}），甲骨${diff > 0 ? "补发" : "回退"}`;
      await Promise.all([
        changeJiagu(group.userA, diff, reason, group.id),
        changeJiagu(group.userB, diff, reason, group.id),
      ]);
    }
  }

  return NextResponse.json({ record: updated });
}

/**
 * DELETE /api/discussions?recordId=xxx
 * 删除讨论记录（讨论组成员或管理员）
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const recordId = searchParams.get("recordId");
  if (!recordId) {
    return NextResponse.json({ error: "缺少记录ID" }, { status: 400 });
  }

  const record = await prisma.discussionRecord.findUnique({ where: { id: recordId } });
  if (!record) {
    return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  }

  const group = await prisma.discussionGroup.findUnique({ where: { id: record.groupId } });
  if (!group) {
    return NextResponse.json({ error: "讨论组不存在" }, { status: 404 });
  }
  if (group.userA !== session.user.id && group.userB !== session.user.id && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "无权删除该记录" }, { status: 403 });
  }

  await prisma.discussionRecord.delete({ where: { id: recordId } });

  // 回退该阶段发放的甲骨奖励
  const refund = getPhaseReward(record.phase);
  if (refund > 0) {
    const phaseNames: Record<string, string> = { early: "月初", mid: "月中", late: "月末" };
    await Promise.all([
      changeJiagu(group.userA, -refund, `讨论记录删除，回退奖励（${phaseNames[record.phase]}阶段）`, group.id),
      changeJiagu(group.userB, -refund, `讨论记录删除，回退奖励（${phaseNames[record.phase]}阶段）`, group.id),
    ]);
  }

  // 删除记录后将讨论组恢复为待开始，允许重新提交
  await prisma.discussionGroup.update({
    where: { id: group.id },
    data: { status: "pending" },
  });

  return NextResponse.json({ message: "记录已删除" });
}
