/**
 * app/api/notes/route.ts
 * 读书笔记 API
 * 支持笔记提交和字数统计
 * 字数≥1000字自动发放5甲骨奖励
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu, JIAGU_RULES } from "@/lib/jiagu";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";

/**
 * 统计中文文本字数
 * @param text - 文本内容
 * @returns 字数（标点符号和空格不计入）
 */
function countWords(text: string): number {
  // 移除标点符号和空白字符，统计字数
  const cleanText = text
    .replace(/[\s\n\r\t]/g, "")  // 移除空白
    .replace(/[，。！？、；：""''（）【】《》…—]/g, ""); // 移除中文标点
  return cleanText.length;
}

/**
 * GET /api/notes
 * 获取读书笔记列表
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bookId = searchParams.get("bookId") || "";
  const userId = searchParams.get("userId") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "200");

  const where: Record<string, unknown> = {};
  if (userId) where.userId = userId;
  if (bookId) where.bookId = bookId;

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { uploadTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.note.count({ where }),
  ]);

  // 获取书籍和用户信息
  const enriched = await Promise.all(
    notes.map(async (note) => {
      const [book, user] = await Promise.all([
        prisma.book.findUnique({ where: { id: note.bookId } }),
        prisma.user.findUnique({ where: { id: note.userId }, select: { id: true, nickname: true } }),
      ]);
      return { ...note, book, user };
    })
  );

  return NextResponse.json({ notes: enriched, total, page, pageSize });
}

/**
 * POST /api/notes
 * 提交读书笔记
 * 字数≥1000字时自动发放5甲骨
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (session.user.status !== "active") {
    return NextResponse.json({ error: "账号状态异常" }, { status: 403 });
  }

  const body = await request.json();
  const { bookId, content } = body;

  if (!bookId || !content) {
    return NextResponse.json({ error: "书目和笔记内容为必填项" }, { status: 400 });
  }

  if (content.trim().length === 0) {
    return NextResponse.json({ error: "笔记内容不能为空" }, { status: 400 });
  }

  // 验证书籍存在
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) {
    return NextResponse.json({ error: "书籍不存在" }, { status: 404 });
  }

  // 统计字数
  const wordCount = countWords(content);

  // 创建笔记
  const note = await prisma.note.create({
    data: {
      userId: session.user.id,
      bookId,
      content,
      wordCount,
      rewarded: false,
    },
  });

  // 字数达到1000字时发放甲骨奖励
  let rewardGranted = false;
  if (wordCount >= 1000) {
    await prisma.note.update({
      where: { id: note.id },
      data: { rewarded: true },
    });

    await changeJiagu(
      session.user.id,
      JIAGU_RULES.NOTE_REWARD,
      `读书笔记达到${wordCount}字奖励`,
      note.id
    );

    await createNotification(
      session.user.id,
      NOTIFICATION_TYPES.JIAGU,
      `📝 您的读书笔记已达到${wordCount}字，获得${JIAGU_RULES.NOTE_REWARD}甲骨奖励！`
    );

    rewardGranted = true;
  }

  return NextResponse.json(
    {
      note: { ...note, wordCount },
      wordCount,
      rewardGranted,
      rewardAmount: rewardGranted ? JIAGU_RULES.NOTE_REWARD : 0,
    },
    { status: 201 }
  );
}
