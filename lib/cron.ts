/**
 * lib/cron.ts
 * 定时任务系统
 * 使用 node-cron 处理各种定时业务逻辑：
 * - 书单发布提醒（每月20号）
 * - 选书截止处理（书单发布后24h）
 * - 总结上传窗口开启（月倒数第3天12:00）
 * - 总结截止处理（下月7号）
 * - 预备榜月度清零
 * - 赏金任务过期检测（3个月）
 */

import cron from "node-cron";
import { prisma } from "./db";
import { changeJiagu } from "./jiagu";
import {
  notifyBookListPublished,
  notifySelectionDeadline,
  notifySummaryDeadline,
  notifyAllActiveUsers,
  NOTIFICATION_TYPES,
} from "./notifications";

/**
 * 初始化所有定时任务
 * 在应用启动时调用此函数
 */
export function initCronJobs() {
  console.log("🕐 正在初始化定时任务...");

  // 每月20号 9:00 - 发布白日梦书单（由NPC手动触发，此处仅提醒）
  cron.schedule("0 9 20 * *", async () => {
    console.log("📚 [CRON] 每月20号书单提醒");
    await notifyAllActiveUsers(
      NOTIFICATION_TYPES.BOOKLIST,
      "📚 今天是每月20号，白日梦书单即将发布！NPC请准备发布书单，居民请关注书单消息。"
    );
  });

  // 每小时检查一次选书截止（书单发布24h后自动关闭）
  cron.schedule("0 * * * *", async () => {
    await checkSelectionDeadlines();
  });

  // 每天 12:00 - 检查月倒数第3天，开启总结上传窗口
  cron.schedule("0 12 * * *", async () => {
    await checkSummaryWindowOpen();
  });

  // 每月7号 23:59 - 关闭总结上传窗口
  cron.schedule("59 23 7 * *", async () => {
    await closeSummaryWindow();
  });

  // 每月1号 0:00 - 预备榜月度数据归档（不清零，年度才清零）
  cron.schedule("0 0 1 * *", async () => {
    await archiveMonthlyVotes();
  });

  // 每天 0:00 - 检查赏金任务过期（3个月未接取）
  cron.schedule("0 0 * * *", async () => {
    await checkBountyTaskExpiry();
  });

  // 每天 0:00 - 检查讨论组违约
  cron.schedule("5 0 * * *", async () => {
    await checkDiscussionDeadlines();
  });

  // 每月1号 0:00 - 重置月度任务计数器（通过系统配置标记）
  cron.schedule("0 0 1 * *", async () => {
    await resetMonthlyCounters();
  });

  console.log("✅ 定时任务初始化完成");
}

/**
 * 检查并处理选书截止
 * 书单发布24小时后自动关闭，对未选书用户扣5甲骨
 */
async function checkSelectionDeadlines() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 查找已发布但仍为 selection_open 状态的书单
  const openLists = await prisma.bookList.findMany({
    where: {
      status: "selection_open",
      publishDate: { lte: twentyFourHoursAgo },
    },
  });

  for (const bookList of openLists) {
    console.log(
      `📋 [CRON] 处理书单 ${bookList.id} 选书截止，月份：${bookList.month}`
    );

    // 获取已选书的用户
    const selections = await prisma.bookSelection.findMany({
      where: { bookListId: bookList.id },
      select: { userId: true },
    });
    const selectedUserIds = new Set(selections.map((s) => s.userId));

    // 获取所有活跃用户
    const activeUsers = await prisma.user.findMany({
      where: { status: "active" },
      select: { id: true },
    });

    // 对未选书用户扣除5甲骨
    for (const user of activeUsers) {
      if (!selectedUserIds.has(user.id)) {
        await changeJiagu(
          user.id,
          -5,
          `${bookList.month}书单选书超时扣除`,
          bookList.id
        );

        // 发送通知
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: NOTIFICATION_TYPES.SELECTION,
            content: `⏰ 您未在规定时间内完成${bookList.month}书单选书，已扣除5甲骨。`,
          },
        });
      }
    }

    // 关闭书单选书
    await prisma.bookList.update({
      where: { id: bookList.id },
      data: { status: "closed" },
    });
  }
}

/**
 * 检查是否到了月倒数第3天，开启总结上传窗口
 */
async function checkSummaryWindowOpen() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  // 获取当月最后一天
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();

  // 月倒数第3天（即 lastDay - 2）
  if (todayDate === lastDayOfMonth - 2) {
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

    // 下月7号 23:59 为截止时间
    const nextMonth = month + 1 > 11 ? 0 : month + 1;
    const nextYear = month + 1 > 11 ? year + 1 : year;
    const deadline = new Date(nextYear, nextMonth, 7, 23, 59, 0);

    await notifySummaryDeadline(monthStr, deadline);
    console.log(`📝 [CRON] ${monthStr} 月度总结上传窗口已开启`);
  }
}

/**
 * 关闭总结上传窗口并处理未提交者
 */
async function closeSummaryWindow() {
  const now = new Date();
  // 上月月份
  const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lastMonthYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthStr = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, "0")}`;

  console.log(`📝 [CRON] 关闭 ${monthStr} 月度总结上传窗口`);

  // 获取已提交总结的用户
  const summaries = await prisma.summary.findMany({
    where: { month: monthStr },
    select: { userId: true },
  });
  const submittedUserIds = new Set(summaries.map((s) => s.userId));

  // 通知未提交的活跃用户
  const activeUsers = await prisma.user.findMany({
    where: { status: "active" },
    select: { id: true },
  });

  for (const user of activeUsers) {
    if (!submittedUserIds.has(user.id)) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: NOTIFICATION_TYPES.SUMMARY,
          content: `📝 ${monthStr} 月度总结上传窗口已关闭，您未提交本月总结。请注意按时完成。`,
        },
      });
    }
  }
}

/**
 * 归档月度投票数据（每月清零当月投票，保留累计数据）
 */
async function archiveMonthlyVotes() {
  const now = new Date();
  const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const lastMonthYear =
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const lastMonthStr = `${lastMonthYear}-${String(lastMonth).padStart(2, "0")}`;

  console.log(`🗳️ [CRON] 归档 ${lastMonthStr} 预备榜投票数据`);

  // 每年1月1日清零预备榜（年度清零）
  if (now.getMonth() === 0 && now.getDate() === 1) {
    await prisma.recommendation.updateMany({
      where: { status: "pending" },
      data: { voteCount: 0 },
    });
    console.log("🗳️ [CRON] 年度预备榜投票清零完成");
  }
}

/**
 * 检查赏金任务过期（3个月未接取自动下架，退还80%）
 */
async function checkBountyTaskExpiry() {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  // 新模型：赏金任务不预扣甲骨，过期时只需标记状态
  const expiredTasks = await prisma.bountyTask.findMany({
    where: {
      status: "open",
      createdAt: { lte: threeMonthsAgo },
    },
  });

  for (const task of expiredTasks) {
    await prisma.$transaction(async (tx) => {
      await tx.bountyTask.update({
        where: { id: task.id },
        data: { status: "settled" },
      });
      await tx.notification.create({
        data: {
          userId: task.creatorId,
          type: NOTIFICATION_TYPES.TASK,
          content: `您发布的赏金任务已因3个月无活动而自动关闭。`,
        },
      });
    });
    console.log(`💰 [CRON] 赏金任务 ${task.id} 已过期关闭`);
  }
}

/**
 * 检查讨论组截止和违约
 */
async function checkDiscussionDeadlines() {
  const now = new Date();

  // 查找已过期未完成的讨论组
  const overdueGroups = await prisma.discussionGroup.findMany({
    where: {
      status: "discussing",
      deadline: { lte: now },
    },
  });

  for (const group of overdueGroups) {
    console.log(`📖 [CRON] 处理讨论组 ${group.id} 违约`);

    // 检查是否有讨论记录
    const records = await prisma.discussionRecord.findMany({
      where: { groupId: group.id, phase: group.phase || "early" },
    });

    if (records.length === 0) {
      // 未完成讨论 - 触发违约处理
      const { handleBreach } = await import("./jiagu");

      // 对两个成员都处理
      for (const userId of [group.userA, group.userB]) {
        const result = await handleBreach(userId, group.id);

        // 如果被清退
        if (result.action === "expelled") {
          await prisma.notification.create({
            data: {
              userId,
              type: NOTIFICATION_TYPES.BREACH,
              content: "🚫 因多次违约，您的账号已被系统自动清退。",
            },
          });
        }
      }

      // 更新讨论组状态
      await prisma.discussionGroup.update({
        where: { id: group.id },
        data: { status: "breached" },
      });
    }
  }
}

/**
 * 重置月度计数器
 */
async function resetMonthlyCounters() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  console.log(`🔄 [CRON] ${monthStr} 月度计数器重置完成`);
}
