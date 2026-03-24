/**
 * lib/notifications.ts
 * 通知系统 - 统一处理系统通知的创建和发送
 * 支持单用户通知和批量通知
 */

import { prisma } from "./db";

// 通知类型枚举
export const NOTIFICATION_TYPES = {
  SYSTEM: "system",              // 系统通知
  JIAGU: "jiagu",                // 甲骨变动
  JIAGU_WARNING: "jiagu_warning", // 甲骨余额警告
  DISCUSSION: "discussion",      // 讨论相关
  BOOKLIST: "booklist",          // 书单相关
  SELECTION: "selection",        // 选书相关
  SUMMARY: "summary",            // 总结相关
  TASK: "task",                  // 任务相关
  BREACH: "breach",              // 违约通知
  EXPEL_RISK: "expel_risk",      // 清退风险
} as const;

/**
 * 创建单个通知
 * @param userId - 接收用户ID
 * @param type - 通知类型
 * @param content - 通知内容
 * @returns 创建的通知记录
 */
export async function createNotification(
  userId: string,
  type: string,
  content: string
) {
  return await prisma.notification.create({
    data: { userId, type, content },
  });
}

/**
 * 批量创建通知（通知多个用户）
 * @param userIds - 接收用户ID数组
 * @param type - 通知类型
 * @param content - 通知内容
 */
export async function createBulkNotifications(
  userIds: string[],
  type: string,
  content: string
) {
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, content })),
  });
}

/**
 * 通知所有活跃用户（系统公告）
 * @param type - 通知类型
 * @param content - 通知内容
 */
export async function notifyAllActiveUsers(type: string, content: string) {
  const activeUsers = await prisma.user.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  const userIds = activeUsers.map((u) => u.id);
  await createBulkNotifications(userIds, type, content);
}

/**
 * 发送书单发布通知
 * @param month - 月份（YYYY-MM）
 * @param period - 期数
 */
export async function notifyBookListPublished(month: string, period: number) {
  await notifyAllActiveUsers(
    NOTIFICATION_TYPES.BOOKLIST,
    `📚 第${period}期白日梦书单（${month}）已发布！请在24小时内完成选书，超时将扣除5甲骨。`
  );
}

/**
 * 发送选书截止提醒
 * @param bookListId - 书单ID
 * @param month - 月份
 */
export async function notifySelectionDeadline(
  bookListId: string,
  month: string
) {
  // 查找尚未选书的活跃用户
  const selectedUserIds = await prisma.bookSelection.findMany({
    where: { bookListId },
    select: { userId: true },
  });
  const selectedIds = new Set(selectedUserIds.map((s) => s.userId));

  const activeUsers = await prisma.user.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  const notSelectedIds = activeUsers
    .map((u) => u.id)
    .filter((id) => !selectedIds.has(id));

  await createBulkNotifications(
    notSelectedIds,
    NOTIFICATION_TYPES.SELECTION,
    `⏰ 提醒：${month}期书单选书窗口将在2小时后关闭，请及时完成选书！`
  );
}

/**
 * 发送总结上传提醒
 * @param month - 月份
 * @param deadline - 截止时间
 */
export async function notifySummaryDeadline(month: string, deadline: Date) {
  const deadlineStr = deadline.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  await notifyAllActiveUsers(
    NOTIFICATION_TYPES.SUMMARY,
    `📝 ${month}月度总结上传窗口已开启，截止时间：${deadlineStr}。请确保文件名包含您的昵称。`
  );
}

/**
 * 发送讨论违约通知
 * @param userId - 违约用户ID
 * @param penalty - 扣除甲骨数
 * @param breachCount - 累计违约次数
 */
export async function notifyBreach(
  userId: string,
  penalty: number,
  breachCount: number
) {
  let content = "";
  if (breachCount === 1) {
    content = `⚠️ 您本月发生第1次讨论违约，已扣除${penalty}甲骨。请注意后续讨论。`;
  } else if (breachCount === 2) {
    content = `⚠️ 您本月发生第2次讨论违约，已扣除${penalty}甲骨。再次违约将面临清零清退！`;
  } else {
    content = `🚫 您已发生第${breachCount}次讨论违约，甲骨已清零，账号已被清退。`;
  }

  await createNotification(userId, NOTIFICATION_TYPES.BREACH, content);
}

/**
 * 发送甲骨变动通知
 * @param userId - 用户ID
 * @param amount - 变动数量
 * @param reason - 变动原因
 * @param newBalance - 新余额
 */
export async function notifyJiaguChange(
  userId: string,
  amount: number,
  reason: string,
  newBalance: number
) {
  const sign = amount > 0 ? "+" : "";
  const content = `💎 甲骨变动：${sign}${amount} （${reason}）| 当前余额：${newBalance}`;
  await createNotification(userId, NOTIFICATION_TYPES.JIAGU, content);
}

/**
 * 标记通知为已读
 * @param notificationId - 通知ID
 * @param userId - 用户ID（权限验证）
 */
export async function markAsRead(notificationId: string, userId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
}

/**
 * 标记用户所有通知为已读
 * @param userId - 用户ID
 */
export async function markAllAsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/**
 * 获取用户未读通知数量
 * @param userId - 用户ID
 * @returns 未读通知数量
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return await prisma.notification.count({
    where: { userId, isRead: false },
  });
}
