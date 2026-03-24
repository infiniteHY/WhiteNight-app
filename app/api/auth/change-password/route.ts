/**
 * app/api/auth/change-password/route.ts
 * 修改密码 API
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/change-password
 * 修改当前用户密码
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json();
  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "请填写当前密码和新密码" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "新密码长度不能少于8位" }, { status: 400 });
  }

  // 获取用户数据
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 验证当前密码
  const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordMatch) {
    return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
  }

  // 更新密码
  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newPasswordHash },
  });

  return NextResponse.json({ message: "密码修改成功" });
}
