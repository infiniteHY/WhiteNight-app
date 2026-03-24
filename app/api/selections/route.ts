/**
 * app/api/selections/route.ts
 * 选书 API
 * 居民在书单发布后24h内选书，上限3本
 * 超时不选扣5甲骨
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu } from "@/lib/jiagu";

/**
 * GET /api/selections
 * 获取选书记录
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bookListId = searchParams.get("bookListId") || "";
  const requestedUserId = searchParams.get("userId") || "";

  const where: Record<string, unknown> = {};
  if (bookListId) where.bookListId = bookListId;

  // 无 bookListId 时只返回当前用户的选书；有 bookListId 时公开返回所有人
  if (!bookListId) {
    where.userId = requestedUserId || session.user.id;
  } else if (requestedUserId) {
    where.userId = requestedUserId;
  }

  const selections = await prisma.bookSelection.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  // 获取书籍和用户信息
  const enriched = await Promise.all(
    selections.map(async (sel) => {
      const [book, user] = await Promise.all([
        prisma.book.findUnique({ where: { id: sel.bookId } }),
        prisma.user.findUnique({ where: { id: sel.userId }, select: { id: true, nickname: true } }),
      ]);
      return { ...sel, book, user };
    })
  );

  return NextResponse.json({ selections: enriched });
}

/**
 * POST /api/selections
 * 提交选书
 * 限制：24h内，最多3本
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (session.user.status !== "active") {
    return NextResponse.json({ error: "账号状态异常，无法选书" }, { status: 403 });
  }

  const body = await request.json();
  const { bookListId, bookIds, isCompanion = false } = body;

  if (!bookListId || !bookIds || !Array.isArray(bookIds)) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  // 获取书单信息
  const bookList = await prisma.bookList.findUnique({
    where: { id: bookListId },
  });

  if (!bookList) {
    return NextResponse.json({ error: "书单不存在" }, { status: 404 });
  }

  // 检查书单是否在选书窗口内
  if (bookList.status !== "selection_open") {
    return NextResponse.json(
      { error: "当前不在选书窗口期" },
      { status: 400 }
    );
  }

  // 检查是否超过24小时
  if (bookList.publishDate) {
    const deadline = new Date(
      bookList.publishDate.getTime() + 24 * 60 * 60 * 1000
    );
    if (new Date() > deadline) {
      return NextResponse.json({ error: "选书窗口已关闭" }, { status: 400 });
    }
  }

  // 检查选书数量（上限3本）
  if (bookIds.length > 3) {
    return NextResponse.json({ error: "每次最多选择3本书" }, { status: 400 });
  }

  // 检查是否已选过
  const existingSelections = await prisma.bookSelection.findMany({
    where: { userId: session.user.id, bookListId },
  });

  if (existingSelections.length > 0) {
    return NextResponse.json({ error: "本期书单已完成选书" }, { status: 400 });
  }

  // 验证书目在书单中
  const bookListBooks = await prisma.recommendation.findMany({
    where: { bookListId, status: "on_list" },
    select: { bookId: true },
  });
  const validBookIds = new Set(bookListBooks.map((b) => b.bookId));

  for (const bookId of bookIds) {
    if (!validBookIds.has(bookId)) {
      return NextResponse.json(
        { error: `书目 ${bookId} 不在当前书单中` },
        { status: 400 }
      );
    }
  }

  // 创建选书记录
  await prisma.bookSelection.createMany({
    data: bookIds.map((bookId: string) => ({
      userId: session.user.id,
      bookListId,
      bookId,
      isCompanion,
    })),
  });

  return NextResponse.json({
    message: `选书成功，共选择${bookIds.length}本`,
    count: bookIds.length,
  });
}

/**
 * DELETE /api/selections
 * 取消选书（书单未关闭时可以取消）
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const selectionId = searchParams.get("id");

  if (!selectionId) {
    return NextResponse.json({ error: "缺少选书记录ID" }, { status: 400 });
  }

  const selection = await prisma.bookSelection.findUnique({
    where: { id: selectionId },
  });

  if (!selection || selection.userId !== session.user.id) {
    return NextResponse.json({ error: "选书记录不存在或无权删除" }, { status: 404 });
  }

  // 检查书单状态
  const bookList = await prisma.bookList.findUnique({
    where: { id: selection.bookListId },
  });

  if (bookList?.status === "closed") {
    return NextResponse.json({ error: "书单已关闭，无法取消选书" }, { status: 400 });
  }

  await prisma.bookSelection.delete({ where: { id: selectionId } });

  return NextResponse.json({ message: "已取消选书" });
}
