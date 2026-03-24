/**
 * app/api/users/me/route.ts
 * 获取当前登录用户的基本信息
 * 主要用于前端展示昵称（荐书人等场景）
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/users/me
 * 返回当前用户的昵称、甲骨余额等基本信息
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      nickname: true,
      email: true,
      role: true,
      status: true,
      jiaguBalance: true,
      joinDate: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  return NextResponse.json({ user });
}
