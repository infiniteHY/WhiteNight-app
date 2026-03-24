/**
 * app/api/notifications/route.ts
 * 通知消息 API
 * 支持获取通知列表、标记已读等操作
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markAllAsRead, getUnreadCount } from "@/lib/notifications";

/**
 * GET /api/notifications
 * 获取当前用户的通知列表
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const where: Record<string, unknown> = { userId: session.user.id };
  if (unreadOnly) where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    getUnreadCount(session.user.id),
  ]);

  return NextResponse.json({
    notifications,
    total,
    page,
    pageSize,
    unreadCount,
  });
}

/**
 * PATCH /api/notifications
 * 标记通知为已读
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await request.json();
  const { notificationId, markAll } = body;

  if (markAll) {
    // 标记所有通知为已读
    await markAllAsRead(session.user.id);
    return NextResponse.json({ message: "所有通知已标记为已读" });
  }

  if (notificationId) {
    // 标记单条通知为已读
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: session.user.id },
      data: { isRead: true },
    });
    return NextResponse.json({ message: "通知已标记为已读" });
  }

  return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
}
