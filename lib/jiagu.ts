/**
 * lib/jiagu.ts
 * 甲骨系统核心逻辑
 * 处理甲骨的获取、消耗、流水记录和清退风险检测
 */

import { prisma } from "./db";

// 甲骨获取规则常量（来源于需求文档）
export const JIAGU_RULES = {
  // 讨论奖励
  DISCUSSION_EARLY: 3,    // 月初讨论完成
  DISCUSSION_MID: 1,      // 月中讨论完成
  DISCUSSION_LATE: 0,     // 月末讨论完成

  // 任务奖励
  SIMPLE_TASK_CREATE: 1,  // 发起简单任务
  SIMPLE_TASK_JOIN: 1,    // 参与简单任务
  SHARE_TASK_CREATE: 2,   // 发起分享任务
  SHARE_TASK_JOIN: 1,     // 参与分享任务
  SHARE_TASK_EXTRA: 1,    // 分享任务每额外半小时

  // 读书相关
  NOTE_REWARD: 5,         // 读书笔记≥1000字奖励
  RECOMMENDATION_BONUS: 2, // 荐书被选中奖励（自定义）

  // 黑箱卡相关
  BLACK_BOX_RECEIVE: 8,   // 被黑箱者获得甲骨

  // 消耗规则
  RENAME_COST: 10,        // 改名消耗
  SELECTION_TIMEOUT_PENALTY: -5, // 选书超时扣除
  BLACK_BOX_COST: -10,    // 使用黑箱卡消耗
  DODGE_COST: -10,        // 使用闪避卡消耗
  DISCUSSION_BYE_COST: -8, // 使用讨论拜拜卡消耗

  // 违约惩罚
  BREACH_FIRST: -5,       // 第1次违约
  BREACH_SECOND: -10,     // 第2次违约
  // 第3次违约：清零清退

  // NPC道具卡交易手续费比例
  NPC_CARD_FEE_RATE: 0.2, // 20%手续费

  // 任务每月上限
  SIMPLE_TASK_MONTHLY_LIMIT: 5, // 简单任务每月最多5次
  SHARE_TASK_MONTHLY_LIMIT: 5,  // 分享任务每月最多5次
  SHARE_TASK_MONTHLY_MAX: 30,   // 分享任务月度甲骨上限
};

/**
 * 为用户增减甲骨并记录流水
 * @param userId - 用户ID
 * @param amount - 变动数量（正数=获得，负数=消耗）
 * @param reason - 变动原因（中文说明）
 * @param relatedId - 关联记录ID（可选）
 * @returns 更新后的用户甲骨余额
 */
export async function changeJiagu(
  userId: string,
  amount: number,
  reason: string,
  relatedId?: string
): Promise<number> {
  // 使用事务确保流水记录和余额更新的原子性
  const result = await prisma.$transaction(async (tx) => {
    // 更新用户甲骨余额
    const user = await tx.user.update({
      where: { id: userId },
      data: { jiaguBalance: { increment: amount } },
    });

    // 记录甲骨流水
    await tx.jiaguTransaction.create({
      data: {
        userId,
        amount,
        type: amount > 0 ? "earn" : "spend",
        reason,
        relatedId,
      },
    });

    // 检查是否触发清退风险（余额变为负数）
    if (user.jiaguBalance < 0) {
      await checkExpelRisk(tx, userId, user.jiaguBalance);
    }

    return user.jiaguBalance;
  });

  return result;
}

/**
 * 检查清退风险并发送通知
 * @param tx - Prisma 事务对象
 * @param userId - 用户ID
 * @param balance - 当前余额
 */
async function checkExpelRisk(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  balance: number
): Promise<void> {
  // 余额为负数时发送警告通知
  await tx.notification.create({
    data: {
      userId,
      type: "jiagu_warning",
      content: `⚠️ 您的甲骨余额为 ${balance}，已进入负数，请注意补充甲骨以避免被清退风险。`,
    },
  });
}

/**
 * 批量获取用户甲骨余额（用于排行榜等）
 * @param userIds - 用户ID数组
 * @returns 用户余额映射
 */
export async function getJiaguBalances(
  userIds: string[]
): Promise<Record<string, number>> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, jiaguBalance: true },
  });

  return users.reduce(
    (acc, user) => {
      acc[user.id] = user.jiaguBalance;
      return acc;
    },
    {} as Record<string, number>
  );
}

/**
 * 获取用户甲骨流水记录
 * @param userId - 用户ID
 * @param page - 页码（从1开始）
 * @param pageSize - 每页条数
 * @returns 流水记录列表和总数
 */
export async function getJiaguHistory(
  userId: string,
  page: number = 1,
  pageSize: number = 20
) {
  const [transactions, total] = await Promise.all([
    prisma.jiaguTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.jiaguTransaction.count({ where: { userId } }),
  ]);

  return { transactions, total };
}

/**
 * 处理讨论违约 - 根据累计次数确定惩罚
 * @param userId - 违约用户ID
 * @param groupId - 讨论组ID
 * @returns 处理结果
 */
export async function handleBreach(
  userId: string,
  groupId: string
): Promise<{ action: string; penalty: number }> {
  // 统计用户历史违约次数
  const breachCount = await prisma.breach.count({ where: { userId } });
  const newCount = breachCount + 1;

  let penaltyJiagu = 0;
  let action = "";

  if (newCount === 1) {
    // 第1次违约：扣5甲骨
    penaltyJiagu = 5;
    action = "penalty_5";
    await changeJiagu(userId, -penaltyJiagu, "讨论违约（第1次）", groupId);
  } else if (newCount === 2) {
    // 第2次违约：扣10甲骨
    penaltyJiagu = 10;
    action = "penalty_10";
    await changeJiagu(userId, -penaltyJiagu, "讨论违约（第2次）", groupId);
  } else {
    // 第3次及以上：清零甲骨并标记清退
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      penaltyJiagu = user.jiaguBalance;
      action = "expelled";
      // 清零甲骨
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { jiaguBalance: 0, status: "expelled" },
        }),
        prisma.jiaguTransaction.create({
          data: {
            userId,
            amount: -penaltyJiagu,
            type: "spend",
            reason: "讨论违约（第3次）- 甲骨清零并清退",
            relatedId: groupId,
          },
        }),
      ]);
    }
  }

  // 记录违约
  await prisma.breach.create({
    data: { userId, groupId, count: newCount, penaltyJiagu },
  });

  return { action, penalty: penaltyJiagu };
}

/**
 * 计算本月任务次数（用于限制月度上限）
 * @param userId - 用户ID
 * @param taskType - 任务类型
 * @returns 本月已参与次数
 */
export async function getMonthlyTaskCount(
  userId: string,
  taskType: string
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = await (prisma.taskParticipant as any).count({
    where: {
      userId,
      joinTime: { gte: monthStart, lt: monthEnd },
      task: { type: taskType },
    },
  });

  return count;
}

/**
 * NPC道具卡交易 - 自动扣除20%手续费
 * @param buyerId - 买家用户ID
 * @param sellerId - 卖家（NPC）用户ID
 * @param cardType - 道具卡类型
 * @param price - 交易价格
 * @returns 手续费金额
 */
export async function npcCardTransaction(
  buyerId: string,
  sellerId: string,
  cardType: string,
  price: number
): Promise<number> {
  const fee = Math.floor(price * JIAGU_RULES.NPC_CARD_FEE_RATE); // 20%手续费取整
  const sellerReceive = price - fee;

  await prisma.$transaction(async (tx) => {
    // 买家扣除全额
    await tx.user.update({
      where: { id: buyerId },
      data: { jiaguBalance: { decrement: price } },
    });
    await tx.jiaguTransaction.create({
      data: {
        userId: buyerId,
        amount: -price,
        type: "spend",
        reason: `购买NPC道具卡：${cardType}`,
      },
    });

    // 卖家（NPC）收到扣除手续费后的金额
    await tx.user.update({
      where: { id: sellerId },
      data: { jiaguBalance: { increment: sellerReceive } },
    });
    await tx.jiaguTransaction.create({
      data: {
        userId: sellerId,
        amount: sellerReceive,
        type: "earn",
        reason: `NPC道具卡销售收入（已扣20%手续费）：${cardType}`,
      },
    });
  });

  return fee;
}
