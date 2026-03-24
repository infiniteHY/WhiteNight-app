/**
 * app/api/admin/voting/route.ts
 * 管理员控制预备榜投票开关
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const VOTING_KEY = "votingOpen";

/** GET /api/admin/voting — 获取当前投票开关状态（所有登录用户可查） */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const config = await prisma.systemConfig.findUnique({ where: { key: VOTING_KEY } });
  const votingOpen = config?.value === "true";
  return NextResponse.json({ votingOpen });
}

/** POST /api/admin/voting — 切换投票开关（管理员专用） */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const body = await request.json();
  const { open } = body; // boolean

  await prisma.systemConfig.upsert({
    where: { key: VOTING_KEY },
    update: { value: String(open) },
    create: { key: VOTING_KEY, value: String(open) },
  });

  // 开启投票时：清零所有 pending 荐书的票数，并删除相关投票记录
  let resetCount = 0;
  if (open) {
    const pendingRecs = await prisma.recommendation.findMany({
      where: { status: "pending" },
      select: { id: true },
    });
    const pendingIds = pendingRecs.map((r) => r.id);

    if (pendingIds.length > 0) {
      await prisma.$transaction([
        prisma.recommendVote.deleteMany({
          where: { recommendationId: { in: pendingIds } },
        }),
        prisma.recommendation.updateMany({
          where: { id: { in: pendingIds } },
          data: { voteCount: 0 },
        }),
      ]);
      resetCount = pendingIds.length;
    }
  }

  return NextResponse.json({
    votingOpen: open,
    message: open
      ? `预备榜投票已开启，${resetCount} 条荐书票数已清零`
      : "预备榜投票已关闭",
    resetCount,
  });
}
