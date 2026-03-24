/**
 * app/api/jiagu/route.ts
 * 甲骨系统 API
 * 查询甲骨余额、流水记录
 * 管理员可手动调整甲骨
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu } from "@/lib/jiagu";

/**
 * GET /api/jiagu
 * 获取甲骨流水记录
 * 普通用户只能查看自己的记录
 * 管理员可以查询任意用户
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId") || session.user.id;
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const type = searchParams.get("type") || ""; // earn 或 spend

  // 权限检查：只有管理员可以查询其他用户
  if (targetUserId !== session.user.id && !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const where: Record<string, unknown> = { userId: targetUserId };
  if (type) where.type = type;

  const [transactions, total, user] = await Promise.all([
    prisma.jiaguTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.jiaguTransaction.count({ where }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, nickname: true, jiaguBalance: true },
    }),
  ]);

  // 统计本月收支
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTransactions = await prisma.jiaguTransaction.findMany({
    where: {
      userId: targetUserId,
      createdAt: { gte: monthStart },
    },
  });

  const monthEarn = monthTransactions
    .filter((t) => t.type === "earn")
    .reduce((sum, t) => sum + t.amount, 0);

  const monthSpend = monthTransactions
    .filter((t) => t.type === "spend")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return NextResponse.json({
    user,
    transactions,
    total,
    page,
    pageSize,
    stats: { monthEarn, monthSpend },
  });
}

/**
 * POST /api/jiagu
 * 管理员手动调整甲骨
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "只有群主可以手动调整甲骨" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, amount, reason } = body;

  if (!userId || amount === undefined || !reason) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const amountNum = parseInt(amount);
  if (isNaN(amountNum) || amountNum === 0) {
    return NextResponse.json({ error: "无效的甲骨数量" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const newBalance = await changeJiagu(userId, amountNum, `管理员调整：${reason}`);

  return NextResponse.json({
    message: "甲骨调整成功",
    newBalance,
    user: { id: userId, nickname: user.nickname },
  });
}

/**
 * GET /api/jiagu/leaderboard
 * 甲骨排行榜
 */
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
