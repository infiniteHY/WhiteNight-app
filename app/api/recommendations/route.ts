/**
 * app/api/recommendations/route.ts
 * 荐书与预备榜投票 API
 * 普通书单要求：推荐语≥50字，字数≥5万，非网文，豆瓣≥7.5
 * 自由书单：宽松要求
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu } from "@/lib/jiagu";

/**
 * GET /api/recommendations
 * 获取荐书列表和预备榜
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || "";
  const year = searchParams.get("year") || ""; // 年度查询，格式 YYYY
  const status = searchParams.get("status") || ""; // 不传则返回所有状态
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const where: Record<string, unknown> = {};
  if (month) where.month = month;
  // 年度查询：筛选 month 以 YYYY- 开头的记录
  if (year && !month) where.month = { startsWith: `${year}-` };
  if (status) where.status = status;

  const [recommendations, total] = await Promise.all([
    prisma.recommendation.findMany({
      where,
      orderBy: { voteCount: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.recommendation.count({ where }),
  ]);

  // 本月全局已投票数（决定是否还有免费票）
  const currentMonth = new Date().toISOString().slice(0, 7);
  const myMonthVoteCount = await prisma.recommendVote.count({
    where: { userId: session.user.id, month: currentMonth },
  });

  // 获取关联数据（书籍信息和用户信息）
  const enriched = await Promise.all(
    recommendations.map(async (rec) => {
      const [book, user, bookList] = await Promise.all([
        prisma.book.findUnique({ where: { id: rec.bookId } }),
        prisma.user.findUnique({
          where: { id: rec.userId },
          select: { id: true, nickname: true },
        }),
        rec.bookListId
          ? prisma.bookList.findUnique({
              where: { id: rec.bookListId },
              select: { id: true, period: true, month: true },
            })
          : Promise.resolve(null),
      ]);

      // 当前用户对该条荐书的投票次数
      const myVoteCount = await prisma.recommendVote.count({
        where: { userId: session.user.id, recommendationId: rec.id },
      });

      return { ...rec, book, user, bookList, hasVoted: myVoteCount > 0, myVoteCount };
    })
  );

  return NextResponse.json({ recommendations: enriched, total, page, pageSize, myMonthVoteCount });
}

/**
 * POST /api/recommendations
 * 提交荐书
 * 验证书目规格和推荐语要求
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (session.user.status === "expelled" || session.user.status === "blacklisted") {
    return NextResponse.json({ error: "账号状态异常，无法荐书" }, { status: 403 });
  }

  const body = await request.json();
  const { bookId, reason, listType = "normal", recommenderName } = body;

  if (!bookId || !reason) {
    return NextResponse.json({ error: "书籍和推荐语为必填项" }, { status: 400 });
  }

  // 获取书籍信息
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) {
    return NextResponse.json({ error: "书籍不存在" }, { status: 404 });
  }

  // 验证普通书单要求
  if (listType === "normal") {
    // 推荐语长度验证（≥50字）
    if (reason.length < 50) {
      return NextResponse.json(
        { error: "普通书单推荐语不能少于50字" },
        { status: 400 }
      );
    }

    // 字数验证（≥5万字）
    if (book.wordCount && book.wordCount < 50000) {
      return NextResponse.json(
        { error: "普通书单要求书籍字数≥5万字" },
        { status: 400 }
      );
    }

    // 豆瓣评分验证（≥7.5）
    if (book.doubanScore && book.doubanScore < 7.5) {
      return NextResponse.json(
        { error: "普通书单要求豆瓣评分≥7.5" },
        { status: 400 }
      );
    }
  } else {
    // 自由书单：推荐语不能为空
    if (reason.trim().length === 0) {
      return NextResponse.json({ error: "推荐语不能为空" }, { status: 400 });
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7);

  // 检查是否本月已荐过此书
  const existingRec = await prisma.recommendation.findFirst({
    where: { userId: session.user.id, bookId, month: currentMonth },
  });

  if (existingRec) {
    return NextResponse.json(
      { error: "本月已推荐过该书" },
      { status: 400 }
    );
  }

  // 荐书人显示名：优先使用显式传入值，否则取当前用户昵称
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { nickname: true },
  });
  const finalRecommenderName = recommenderName?.trim() || user?.nickname || "匿名";

  const recommendation = await prisma.recommendation.create({
    data: {
      userId: session.user.id,
      bookId,
      reason,
      recommenderName: finalRecommenderName,
      month: currentMonth,
      status: "pending",
    },
  });

  return NextResponse.json({ recommendation }, { status: 201 });
}

/**
 * PATCH /api/recommendations
 * 预备榜投票
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json();
  const { recommendationId, action } = body;

  if (!recommendationId || !action) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const recommendation = await prisma.recommendation.findUnique({
    where: { id: recommendationId },
  });

  if (!recommendation) {
    return NextResponse.json({ error: "推荐记录不存在" }, { status: 404 });
  }

  const currentMonth = new Date().toISOString().slice(0, 7);

  if (action === "editRec") {
    if (recommendation.userId !== session.user.id) {
      return NextResponse.json({ error: "只能编辑自己的荐书" }, { status: 403 });
    }
    if (recommendation.status === "on_list") {
      return NextResponse.json({ error: "已入书单的荐书不能修改" }, { status: 400 });
    }
    const { reason, recommenderName } = body as Record<string, string>;
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: "推荐语不能为空" }, { status: 400 });
    }
    const updated = await prisma.recommendation.update({
      where: { id: recommendationId },
      data: {
        ...(reason && { reason: reason.trim() }),
        ...(recommenderName !== undefined && { recommenderName: recommenderName.trim() || null }),
      },
    });
    return NextResponse.json({ recommendation: updated });
  }

  if (action === "vote") {
    // 统计当前用户本月全局投票次数（不限于本条荐书）
    // 每月只有第一票免费，之后不管投哪本都需要付费
    const totalMonthVotes = await prisma.recommendVote.count({
      where: { userId: session.user.id, month: currentMonth },
    });

    const isPaidVote = totalMonthVotes > 0; // 本月已有任何投票则收费

    if (isPaidVote) {
      // 付费投票：扣 1 甲骨，前端应提前弹框确认
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { jiaguBalance: true },
      });
      if (!user || user.jiaguBalance < 1) {
        return NextResponse.json({ error: "甲骨不足，无法追加投票（需1甲骨/票）" }, { status: 400 });
      }
      const votedBook = await prisma.book.findUnique({ where: { id: recommendation.bookId }, select: { title: true } });
      const bookTitle = votedBook?.title || "未知书目";
      await changeJiagu(session.user.id, -1, `预备榜追加投票：《${bookTitle}》`, recommendationId);
    }

    // 记录投票并更新总票数
    await prisma.$transaction([
      prisma.recommendVote.create({
        data: { userId: session.user.id, recommendationId, month: currentMonth },
      }),
      prisma.recommendation.update({
        where: { id: recommendationId },
        data: { voteCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({
      message: isPaidVote ? "已追加投票（消耗1甲骨）" : "投票成功（免费）",
      isPaidVote,
    });
  }

  if (action === "unvote") {
    // 取消投票
    const existingVote = await prisma.recommendVote.findFirst({
      where: {
        userId: session.user.id,
        recommendationId,
        month: currentMonth,
      },
    });

    if (!existingVote) {
      return NextResponse.json({ error: "尚未投票" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.recommendVote.delete({ where: { id: existingVote.id } }),
      prisma.recommendation.update({
        where: { id: recommendationId },
        data: { voteCount: { decrement: 1 } },
      }),
    ]);

    return NextResponse.json({ message: "已取消投票" });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}

/**
 * DELETE /api/recommendations?id=xxx
 * 删除荐书（仅提交者本人，未入书单时可删）
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少荐书ID" }, { status: 400 });

    const rec = await prisma.recommendation.findUnique({ where: { id } });
    if (!rec) return NextResponse.json({ error: "荐书记录不存在" }, { status: 404 });
    if (rec.userId !== session.user.id) return NextResponse.json({ error: "只能删除自己的荐书" }, { status: 403 });
    if (rec.status === "on_list") return NextResponse.json({ error: "已入书单的荐书不能删除" }, { status: 400 });

    await prisma.$transaction([
      prisma.recommendVote.deleteMany({ where: { recommendationId: id } }),
      prisma.recommendation.delete({ where: { id } }),
    ]);

    return NextResponse.json({ message: "荐书已删除" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
