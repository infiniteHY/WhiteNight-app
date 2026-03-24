/**
 * app/api/books/route.ts
 * 书籍管理 API
 * 支持书籍的增删改查
 * 普通书单要求：非网文、豆瓣≥7.5、字数≥5万
 * 自由书单：宽松要求
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/books
 * 获取书籍列表
 * 支持搜索和分页
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const search = searchParams.get("search") || "";
  const source = searchParams.get("source") || "";

  const where: Record<string, unknown> = { isValid: true };
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { author: { contains: search } },
    ];
  }
  if (source) where.source = source;

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.book.count({ where }),
  ]);

  return NextResponse.json({ books, total, page, pageSize });
}

/**
 * POST /api/books
 * 添加书籍
 * 居民添加时来源标记为 resident
 * 管理员添加时来源标记为 npc
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, author, genre, wordCount, pubYear, doubanScore } = body;

    if (!title?.trim() || !author?.trim()) {
      return NextResponse.json({ error: "书名和作者为必填项" }, { status: 400 });
    }

    const source = isAdmin(session.user.role) ? "npc" : "resident";

    const book = await prisma.book.create({
      data: {
        title:      (title as string).trim(),
        author:     (author as string).trim(),
        genre:      genre?.trim() || null,
        wordCount:  wordCount ? parseInt(String(wordCount)) : null,
        pubYear:    pubYear   ? parseInt(String(pubYear))   : null,
        doubanScore:doubanScore ? parseFloat(String(doubanScore)) : null,
        source,
      },
    });

    return NextResponse.json({ book }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/books]", err);
    const message = err instanceof Error ? err.message : "服务器内部错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/books
 * 软删除书籍（仅管理员）
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("id");

  if (!bookId) {
    return NextResponse.json({ error: "缺少书籍ID" }, { status: 400 });
  }

  await prisma.book.update({
    where: { id: bookId },
    data: { isValid: false },
  });

  return NextResponse.json({ message: "书籍已删除" });
}
