/**
 * app/api/invite/route.ts
 * 邀请码管理 API
 * 创建、查询邀请码（管理员权限）
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isSuperAdmin, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

/**
 * GET /api/invite
 * 获取邀请码列表（管理员权限）
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ invites });
}

/**
 * POST /api/invite
 * 创建新邀请码（管理员权限）
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const body = await request.json();
  const { expiresAt, customCode } = body;

  // 生成邀请码
  const code = customCode || `WN${randomBytes(4).toString("hex").toUpperCase()}`;

  // 检查邀请码是否已存在
  const existing = await prisma.inviteCode.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "邀请码已存在" }, { status: 400 });
  }

  const invite = await prisma.inviteCode.create({
    data: {
      code,
      createdBy: session.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json({ invite }, { status: 201 });
}

/**
 * DELETE /api/invite?id=xxx
 * 删除邀请码（管理员权限，已使用的邀请码不可删除）
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少ID" }, { status: 400 });

  const invite = await prisma.inviteCode.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: "邀请码不存在" }, { status: 404 });
  if (invite.usedBy) return NextResponse.json({ error: "已使用的邀请码不可删除" }, { status: 400 });

  await prisma.inviteCode.delete({ where: { id } });
  return NextResponse.json({ message: "邀请码已删除" });
}
