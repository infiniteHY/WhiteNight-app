/**
 * app/api/booklists/route.ts
 * 白日梦书单管理 API
 * 每月20号由NPC发布书单（普通3:1比例）
 * 书单发布后开启24h选书窗口
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canManageBookList } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyBookListPublished } from "@/lib/notifications";

/**
 * GET /api/booklists
 * 获取书单列表
 * 支持按月份和状态过滤
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || "";
  const status = searchParams.get("status") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "10");

  const where: Record<string, unknown> = {};
  if (month) where.month = month;
  if (status) where.status = status;

  const [bookLists, total] = await Promise.all([
    prisma.bookList.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.bookList.count({ where }),
  ]);

  // 获取每个书单的书目信息
  const bookListsWithBooks = await Promise.all(
    bookLists.map(async (list) => {
      const recommendations = await prisma.recommendation.findMany({
        where: { bookListId: list.id, status: "on_list" },
      });
      const bookIds = recommendations.map((r) => r.bookId);
      const books = await prisma.book.findMany({ where: { id: { in: bookIds } } });
      const booksMap = Object.fromEntries(books.map((b) => [b.id, b]));
      const recsWithBook = recommendations.map((r) => ({ ...r, book: booksMap[r.bookId] || null }));
      return { ...list, books: recsWithBook };
    })
  );

  return NextResponse.json({ bookLists: bookListsWithBooks, total, page, pageSize });
}

/**
 * POST /api/booklists
 * 创建新书单（书单岗NPC或群主权限）
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canManageBookList(session.user.role)) {
    return NextResponse.json({ error: "权限不足，需要书单岗NPC或群主权限" }, { status: 403 });
  }

  const body = await request.json();
  const { period, month, type = "normal" } = body;

  if (!period || !month) {
    return NextResponse.json({ error: "期数和月份为必填项" }, { status: 400 });
  }

  // 验证月份格式
  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(month)) {
    return NextResponse.json({ error: "月份格式应为 YYYY-MM" }, { status: 400 });
  }

  // 检查该月份是否已有书单
  const existing = await prisma.bookList.findFirst({ where: { month } });
  if (existing) {
    return NextResponse.json({ error: "该月份书单已存在" }, { status: 400 });
  }

  const bookList = await prisma.bookList.create({
    data: {
      period: parseInt(period),
      month,
      type,
      status: "draft",
    },
  });

  return NextResponse.json({ bookList }, { status: 201 });
}

/**
 * PATCH /api/booklists
 * 更新书单（发布、添加书目、关闭等）
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canManageBookList(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  // 全局 try-catch：确保任何 Prisma 异常都能返回 JSON，
  // 避免 Next.js 16 在未捕获异常时返回空 body 导致前端 JSON 解析失败
  try {
    const body = await request.json();
    // recommenderName：NPC手动添加书目时指定的荐书人名称
    // reason：书目对应的推荐语
    const { bookListId, action, bookId, recommendationId, recommenderName, reason } = body;

    if (!bookListId || !action) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const bookList = await prisma.bookList.findUnique({
      where: { id: bookListId },
    });

    if (!bookList) {
      return NextResponse.json({ error: "书单不存在" }, { status: 404 });
    }

    switch (action) {
      case "publish": {
        if (bookList.status !== "draft") {
          return NextResponse.json({ error: "只能发布草稿状态的书单" }, { status: 400 });
        }

        const bookCount = await prisma.recommendation.count({
          where: { bookListId, status: "on_list" },
        });

        if (bookCount === 0) {
          return NextResponse.json({ error: "书单中没有书目，无法发布" }, { status: 400 });
        }

        const updatedList = await prisma.bookList.update({
          where: { id: bookListId },
          data: { status: "selection_open", publishDate: new Date() },
        });

        await notifyBookListPublished(bookList.month, bookList.period);
        return NextResponse.json({ bookList: updatedList });
      }

      case "addBook": {
        if (!bookId && !recommendationId) {
          return NextResponse.json({ error: "缺少书目信息" }, { status: 400 });
        }

        if (recommendationId) {
          // 将居民荐书记录直接绑定到书单（保留原 userId/recommenderName）
          const rec = await prisma.recommendation.findUnique({ where: { id: recommendationId } });
          if (!rec) {
            return NextResponse.json({ error: "荐书记录不存在" }, { status: 404 });
          }
          await prisma.recommendation.update({
            where: { id: recommendationId },
            data: { bookListId, status: "on_list" },
          });
        } else {
          // NPC 手动添加书目：bookId 已由前端先创建好
          const currentMonth = new Date().toISOString().slice(0, 7);
          const npcUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { nickname: true },
          });
          await prisma.recommendation.create({
            data: {
              userId:          session.user.id,
              bookId,
              bookListId,
              reason:          (reason as string)?.trim() || "NPC选入白日梦书单",
              recommenderName: (recommenderName as string)?.trim() || npcUser?.nickname || "NPC",
              status:          "on_list",
              month:           currentMonth,
            },
          });
        }

        return NextResponse.json({ message: "书目已添加到书单" });
      }

      case "removeBook": {
        // 从书单移除书目，回退为 pending（居民荐书记录保留）
        await prisma.recommendation.updateMany({
          where: { bookListId, bookId },
          data: { status: "pending", bookListId: null },
        });
        return NextResponse.json({ message: "书目已从书单移除" });
      }

      case "close": {
        const updatedList = await prisma.bookList.update({
          where: { id: bookListId },
          data: { status: "closed" },
        });
        return NextResponse.json({ bookList: updatedList });
      }

      default:
        return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }
  } catch (err) {
    // 捕获 Prisma 或其他运行时错误，始终返回 JSON
    console.error("[PATCH /api/booklists]", err);
    const message = err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/booklists?id=xxx
 * 删除书单（仅草稿状态可删，书单岗NPC或群主权限）
 * 同时解除所有关联书目的绑定，将其状态回退为 pending
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !canManageBookList(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "缺少书单ID" }, { status: 400 });
  }

  const bookList = await prisma.bookList.findUnique({ where: { id } });
  if (!bookList) {
    return NextResponse.json({ error: "书单不存在" }, { status: 404 });
  }

  // 已发布/选书中的书单不允许删除，避免影响居民选书流程
  if (bookList.status !== "draft") {
    return NextResponse.json(
      { error: "只能删除草稿状态的书单" },
      { status: 400 }
    );
  }

  // 将书单关联的居民荐书记录解绑，回退为 pending 状态
  await prisma.recommendation.updateMany({
    where: { bookListId: id },
    data: { status: "pending", bookListId: null },
  });

  // 删除 NPC 直接创建（on_list 且 bookListId 为该书单）的推荐记录
  // 注意：上一步已将 bookListId 清空，这里需要删除那些由 NPC 手动新建的条目
  // 由于上一步 updateMany 已将 bookListId 设为 null，此处直接删除孤立的 NPC 条目
  // 实际上以上 updateMany 已覆盖，书单删除即可
  await prisma.bookList.delete({ where: { id } });

  return NextResponse.json({ message: "书单已删除" });
}
