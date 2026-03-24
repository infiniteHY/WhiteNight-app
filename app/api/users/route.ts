/**
 * app/api/users/route.ts
 * 用户管理 API
 * 支持用户列表查询、状态管理、角色变更等操作
 * 管理员权限才能执行大部分操作
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu } from "@/lib/jiagu";
import bcrypt from "bcryptjs";

/**
 * GET /api/users
 * 获取用户列表（管理员权限）
 * 支持分页、搜索和状态过滤
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const role = searchParams.get("role") || "";

  // 构建查询条件
  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { nickname: { contains: search } },
      { email: { contains: search } },
    ];
  }
  if (status) where.status = status;
  if (role) where.role = role;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        status: true,
        jiaguBalance: true,
        joinDate: true,
        blacklistUntil: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, pageSize });
}

/**
 * PATCH /api/users
 * 更新用户信息
 * 普通用户：可以改名（消耗10甲骨）
 * 管理员：修改角色、拉黑、清退、调整甲骨等
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json();
  const { userId, action, value, reason } = body;

  if (!userId || !action) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 改名操作：用户可以修改自己的昵称
  if (action === "changeNickname" && userId === session.user.id) {
    const newNickname = value?.trim();

    if (!newNickname || newNickname.length === 0) {
      return NextResponse.json({ error: "昵称不能为空" }, { status: 400 });
    }

    if (newNickname.length > 7) {
      return NextResponse.json({ error: "昵称不能超过7个字符" }, { status: 400 });
    }

    // 检查余额
    const RENAME_COST = 10;
    if (targetUser.jiaguBalance < RENAME_COST) {
      return NextResponse.json({ error: "甲骨余额不足（改名需10甲骨）" }, { status: 400 });
    }

    // 检查昵称是否被占用
    const existingNickname = await prisma.user.findUnique({ where: { nickname: newNickname } });
    if (existingNickname && existingNickname.id !== userId) {
      return NextResponse.json({ error: "该昵称已被使用" }, { status: 400 });
    }

    // 扣除甲骨并修改昵称
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { nickname: newNickname, jiaguBalance: { decrement: RENAME_COST } },
      });
      await tx.jiaguTransaction.create({
        data: {
          userId,
          amount: -RENAME_COST,
          type: "spend",
          reason: `改名为"${newNickname}"`,
        },
      });
    });

    return NextResponse.json({ message: "昵称修改成功" });
  }

  // 其他操作需要管理员权限
  if (!isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  // 只有群主可以修改NPC和管理员
  if (
    !isSuperAdmin(session.user.role) &&
    ["super_admin", "booklist_npc", "stats_npc", "npc"].includes(targetUser.role)
  ) {
    return NextResponse.json({ error: "权限不足，只有群主可以修改NPC账号" }, { status: 403 });
  }

  let result;

  switch (action) {
    case "expel": {
      // 清退用户
      result = await prisma.user.update({
        where: { id: userId },
        data: { status: "expelled" },
      });
      await prisma.notification.create({
        data: {
          userId,
          type: "system",
          content: `🚫 您的账号已被管理员清退。原因：${reason || "未说明"}`,
        },
      });
      break;
    }

    case "blacklist": {
      // 加入黑名单
      const blacklistUntil = value ? new Date(value) : null;
      result = await prisma.user.update({
        where: { id: userId },
        data: { status: "blacklisted", blacklistUntil },
      });
      await prisma.notification.create({
        data: {
          userId,
          type: "system",
          content: `⚠️ 您的账号已被加入黑名单。${blacklistUntil ? `解禁时间：${blacklistUntil.toLocaleDateString("zh-CN")}` : ""}原因：${reason || "未说明"}`,
        },
      });
      break;
    }

    case "restore": {
      // 恢复账号
      result = await prisma.user.update({
        where: { id: userId },
        data: { status: "active", blacklistUntil: null },
      });
      await prisma.notification.create({
        data: {
          userId,
          type: "system",
          content: "✅ 您的账号已恢复正常状态。",
        },
      });
      break;
    }

    case "changeRole": {
      // 修改角色（仅群主）
      if (!isSuperAdmin(session.user.role)) {
        return NextResponse.json({ error: "只有群主可以修改角色" }, { status: 403 });
      }
      const validRoles = ["super_admin", "booklist_npc", "stats_npc", "npc", "resident", "temp_reader"];
      if (!validRoles.includes(value)) {
        return NextResponse.json({ error: "无效的角色" }, { status: 400 });
      }
      result = await prisma.user.update({
        where: { id: userId },
        data: { role: value },
      });
      break;
    }

    case "adjustJiagu": {
      // 调整甲骨（群主权限）
      if (!isSuperAdmin(session.user.role)) {
        return NextResponse.json({ error: "只有群主可以直接调整甲骨" }, { status: 403 });
      }
      const amount = parseInt(value);
      if (isNaN(amount)) {
        return NextResponse.json({ error: "无效的甲骨数量" }, { status: 400 });
      }
      await changeJiagu(userId, amount, reason || "管理员手动调整", session.user.id);
      result = await prisma.user.findUnique({ where: { id: userId } });
      break;
    }

    case "resetPassword": {
      // 重置密码（群主权限）
      if (!isSuperAdmin(session.user.role)) {
        return NextResponse.json({ error: "只有群主可以重置密码" }, { status: 403 });
      }
      const newPasswordHash = await bcrypt.hash(value || "whitenight123", 12);
      result = await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });
      break;
    }

    default:
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
  }

  return NextResponse.json({ message: "操作成功", user: result });
}
