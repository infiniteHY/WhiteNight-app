/**
 * app/api/tasks/route.ts
 * 任务系统 API
 * 支持简单任务、分享任务、赏金任务
 * 简单任务：≥1h，≥5人，发起+1/参与+1，结算时发放
 * 分享任务：发起+2/参与+1，每半小时叠加，结算时发放
 * 赏金任务：结算按实际参与人数扣发布人甲骨，80%到参与者
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { changeJiagu, JIAGU_RULES } from "@/lib/jiagu";

/**
 * GET /api/tasks
 * 获取任务列表
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "";
  const status = searchParams.get("status") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  try {

  if (type === "bounty") {
    const bountyWhere = status && status !== "all" ? { status } : {};
    const [bountyTasks, total] = await Promise.all([
      prisma.bountyTask.findMany({
        where: bountyWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.bountyTask.count({ where: bountyWhere }),
    ]);

    const enriched = await Promise.all(
      bountyTasks.map(async (task) => {
        const [creator, participants] = await Promise.all([
          prisma.user.findUnique({
            where: { id: task.creatorId },
            select: { id: true, nickname: true },
          }),
          prisma.bountyParticipant.findMany({
            where: { bountyTaskId: task.id },
          }),
        ]);
        const participantUsers = await Promise.all(
          participants.map(p =>
            prisma.user.findUnique({ where: { id: p.userId }, select: { id: true, nickname: true } })
          )
        );
        const hasJoined = participants.some(p => p.userId === session.user.id);
        return { ...task, creator, participants: participantUsers.filter(Boolean), hasJoined };
      })
    );

    return NextResponse.json({ tasks: enriched, total, page, pageSize });
  }

  // 简单/分享任务
  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (status && status !== "all") where.status = status;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  const enriched = await Promise.all(
    tasks.map(async (task) => {
      const [creator, participantRecords] = await Promise.all([
        prisma.user.findUnique({
          where: { id: task.creatorId },
          select: { id: true, nickname: true },
        }),
        prisma.taskParticipant.findMany({ where: { taskId: task.id } }),
      ]);
      const participantUsers = await Promise.all(
        participantRecords.map(p =>
          prisma.user.findUnique({ where: { id: p.userId }, select: { id: true, nickname: true } })
        )
      );
      const hasJoined = participantRecords.some(p => p.userId === session.user.id);
      return {
        ...task,
        creator,
        participants: participantUsers.filter(Boolean),
        participantCount: participantRecords.length,
        hasJoined,
      };
    })
  );

  return NextResponse.json({ tasks: enriched, total, page, pageSize });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/tasks
 * 创建新任务
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (session.user.status !== "active") {
    return NextResponse.json({ error: "账号状态异常" }, { status: 403 });
  }

  const body = await request.json();
  const { type, title, description, rewardPerPerson, maxParticipants, startTime, duration, deadline } = body;

  if (!type || !title) {
    return NextResponse.json({ error: "任务类型和标题为必填项" }, { status: 400 });
  }

  // 赏金任务：不预扣甲骨，结算时按实际参与人数扣
  if (type === "bounty") {
    if (!rewardPerPerson || rewardPerPerson < 1) {
      return NextResponse.json({ error: "每人赏金至少1甲骨" }, { status: 400 });
    }
    if (!maxParticipants || maxParticipants < 1) {
      return NextResponse.json({ error: "参与人数至少1人" }, { status: 400 });
    }

    const bountyTask = await prisma.bountyTask.create({
      data: {
        creatorId: session.user.id,
        description: `${title}\n${description || ""}`.trim(),
        rewardPerPerson,
        maxParticipants,
        deadline: deadline ? new Date(deadline) : null,
        status: "open",
      },
    });

    return NextResponse.json({ task: bountyTask }, { status: 201 });
  }

  // 检查月度任务次数限制
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyCreatedCount = await prisma.task.count({
    where: {
      creatorId: session.user.id,
      type,
      createdAt: { gte: monthStart },
    },
  });

  const monthLimit =
    type === "simple"
      ? JIAGU_RULES.SIMPLE_TASK_MONTHLY_LIMIT
      : JIAGU_RULES.SHARE_TASK_MONTHLY_LIMIT;

  if (monthlyCreatedCount >= monthLimit) {
    return NextResponse.json(
      { error: `本月${type === "simple" ? "简单" : "分享"}任务发起次数已达上限（${monthLimit}次）` },
      { status: 400 }
    );
  }

  const task = await prisma.task.create({
    data: {
      type,
      creatorId: session.user.id,
      title,
      description,
      startTime: startTime ? new Date(startTime) : null,
      duration,
      deadline: deadline ? new Date(deadline) : null,
    },
  });

  // 发起人自动参与，甲骨结算时发放
  await prisma.taskParticipant.create({
    data: { taskId: task.id, userId: session.user.id },
  });

  return NextResponse.json({ task }, { status: 201 });
}

/**
 * PATCH /api/tasks
 * 加入任务/结算/编辑等操作
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { taskId, bountyTaskId, action, duration } = body as any;

  try {

  // ─── 赏金任务操作 ──────────────────────────────────────────────────

  if (action === "editBounty") {
    const bountyTask = await prisma.bountyTask.findUnique({ where: { id: bountyTaskId } });
    if (!bountyTask) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    if (bountyTask.creatorId !== session.user.id) return NextResponse.json({ error: "只有发布人可以修改" }, { status: 403 });
    if (bountyTask.status === "settled") return NextResponse.json({ error: "已结算的任务不能修改" }, { status: 400 });

    const { title, description, rewardPerPerson, maxParticipants, deadline } = body as Record<string, string>;
    const updated = await prisma.bountyTask.update({
      where: { id: bountyTaskId },
      data: {
        description: title ? `${title}\n${description || ""}`.trim() : bountyTask.description,
        ...(rewardPerPerson && { rewardPerPerson: parseInt(rewardPerPerson) }),
        ...(maxParticipants && { maxParticipants: parseInt(maxParticipants) }),
        deadline: deadline ? new Date(deadline) : bountyTask.deadline,
      },
    });
    return NextResponse.json({ task: updated });
  }

  if (action === "joinBounty") {
    const bountyTask = await prisma.bountyTask.findUnique({ where: { id: bountyTaskId } });

    if (!bountyTask || bountyTask.status !== "open") {
      return NextResponse.json({ error: "任务不存在或已结算" }, { status: 400 });
    }
    if (bountyTask.creatorId === session.user.id) {
      return NextResponse.json({ error: "不能接取自己发布的赏金任务" }, { status: 400 });
    }

    const alreadyJoined = await prisma.bountyParticipant.findFirst({
      where: { bountyTaskId, userId: session.user.id },
    });
    if (alreadyJoined) {
      return NextResponse.json({ error: "您已接取该任务" }, { status: 400 });
    }

    const currentCount = await prisma.bountyParticipant.count({ where: { bountyTaskId } });
    if (currentCount >= bountyTask.maxParticipants) {
      return NextResponse.json({ error: "参与人数已满" }, { status: 400 });
    }

    await prisma.bountyParticipant.create({
      data: { bountyTaskId, userId: session.user.id },
    });

    return NextResponse.json({ message: "已接取赏金任务" });
  }

  if (action === "settleBounty") {
    const bountyTask = await prisma.bountyTask.findUnique({ where: { id: bountyTaskId } });

    if (!bountyTask) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    if (bountyTask.status !== "open") {
      return NextResponse.json({ error: "任务已结算" }, { status: 400 });
    }
    if (bountyTask.creatorId !== session.user.id && !isAdmin(session.user.role)) {
      return NextResponse.json({ error: "只有发布人才能结算" }, { status: 403 });
    }

    const participants = await prisma.bountyParticipant.findMany({ where: { bountyTaskId } });
    const actualCount = participants.length;
    const totalCost = actualCount * bountyTask.rewardPerPerson;
    const perPersonNet = Math.floor(bountyTask.rewardPerPerson * 0.8);
    const taskTitle = bountyTask.description.split("\n")[0].substring(0, 20);

    if (actualCount === 0) {
      await prisma.bountyTask.update({ where: { id: bountyTaskId }, data: { status: "settled" } });
      return NextResponse.json({ message: "任务已结算，无人参与，未扣除甲骨", totalCost: 0 });
    }

    const creator = await prisma.user.findUnique({
      where: { id: bountyTask.creatorId },
      select: { jiaguBalance: true },
    });
    if (!creator || creator.jiaguBalance < totalCost) {
      return NextResponse.json({ error: `甲骨不足，需 ${totalCost} 甲骨（共 ${actualCount} 人 × ${bountyTask.rewardPerPerson}）` }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.bountyTask.update({ where: { id: bountyTaskId }, data: { status: "settled" } });

      await tx.user.update({ where: { id: bountyTask.creatorId }, data: { jiaguBalance: { decrement: totalCost } } });
      await tx.jiaguTransaction.create({
        data: { userId: bountyTask.creatorId, amount: -totalCost, type: "spend", reason: `赏金任务结算（${actualCount}人）：${taskTitle}`, relatedId: bountyTaskId },
      });

      for (const p of participants) {
        await tx.user.update({ where: { id: p.userId }, data: { jiaguBalance: { increment: perPersonNet } } });
        await tx.jiaguTransaction.create({
          data: { userId: p.userId, amount: perPersonNet, type: "earn", reason: `完成赏金任务（税后80%）：${taskTitle}`, relatedId: bountyTaskId },
        });
      }
    });

    return NextResponse.json({ message: `结算完成，共扣除 ${totalCost} 甲骨，每人到账 ${perPersonNet} 甲骨`, totalCost, perPersonNet, actualCount });
  }

  // ─── 简单/分享任务操作 ──────────────────────────────────────────────

  if (action === "editTask") {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    if (task.creatorId !== session.user.id) return NextResponse.json({ error: "只有发布人可以修改" }, { status: 403 });
    if (task.status === "settled") return NextResponse.json({ error: "已结算的任务不能修改" }, { status: 400 });

    const { title, description, startTime, deadline } = body as Record<string, string>;
    const dur = (body as Record<string, unknown>).duration;
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(dur !== undefined && dur !== "" && { duration: parseInt(String(dur)) }),
      },
    });
    return NextResponse.json({ task: updated });
  }

  if (action === "settleTask") {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    if (task.status !== "open") return NextResponse.json({ error: "任务已结算" }, { status: 400 });
    if (task.creatorId !== session.user.id && !isAdmin(session.user.role)) {
      return NextResponse.json({ error: "只有发布人才能结算" }, { status: 403 });
    }

    const participantRecords = await prisma.taskParticipant.findMany({ where: { taskId } });
    if (participantRecords.length === 0) {
      await prisma.task.update({ where: { id: taskId }, data: { status: "settled" } });
      return NextResponse.json({ message: "任务已结算，无人参与" });
    }

    const isSimple = task.type === "simple";
    const createReward = isSimple ? JIAGU_RULES.SIMPLE_TASK_CREATE : JIAGU_RULES.SHARE_TASK_CREATE;
    const joinReward = isSimple ? JIAGU_RULES.SIMPLE_TASK_JOIN : JIAGU_RULES.SHARE_TASK_JOIN;
    const taskLabel = isSimple ? "简单" : "分享";

    await prisma.task.update({ where: { id: taskId }, data: { status: "settled" } });

    for (const p of participantRecords) {
      if (p.userId === task.creatorId) {
        // 发起人奖励
        await changeJiagu(p.userId, createReward, `发起${taskLabel}任务结算：${task.title}`, taskId);
      } else {
        // 参与者基础奖励
        await changeJiagu(p.userId, joinReward, `参与${taskLabel}任务结算：${task.title}`, taskId);

        // 分享任务额外时长奖励
        if (!isSimple && p.duration) {
          const extraSlots = Math.floor(p.duration / 30) - 1;
          if (extraSlots > 0) {
            const extraReward = Math.min(extraSlots * JIAGU_RULES.SHARE_TASK_EXTRA, 5);
            if (extraReward > 0) {
              await changeJiagu(p.userId, extraReward, `分享任务额外时长奖励：${task.title}`, taskId);
            }
          }
        }
      }
    }

    return NextResponse.json({ message: `结算完成，已为 ${participantRecords.length} 人发放甲骨奖励` });
  }

  if (action === "join" && taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task || task.status !== "open") {
      return NextResponse.json({ error: "任务不存在或已关闭" }, { status: 400 });
    }

    const existingParticipant = await prisma.taskParticipant.findFirst({
      where: { taskId, userId: session.user.id },
    });

    if (existingParticipant) {
      return NextResponse.json({ error: "已参与该任务" }, { status: 400 });
    }

    // 检查月度参与上限
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyJoinCount = await prisma.taskParticipant.count({
      where: {
        userId: session.user.id,
        joinTime: { gte: monthStart },
      },
    });

    const monthLimit =
      task.type === "simple"
        ? JIAGU_RULES.SIMPLE_TASK_MONTHLY_LIMIT
        : JIAGU_RULES.SHARE_TASK_MONTHLY_LIMIT;

    if (monthlyJoinCount >= monthLimit * 2) {
      return NextResponse.json({ error: `本月参与任务次数已达上限` }, { status: 400 });
    }

    await prisma.taskParticipant.create({
      data: { taskId, userId: session.user.id, duration },
    });

    return NextResponse.json({ message: "已加入任务，奖励将在结算时发放" });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks
 * 删除任务（仅发布人，未结算时可删）
 * 支持 ?bountyTaskId=xxx 或 ?taskId=xxx
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const bountyTaskId = searchParams.get("bountyTaskId");
    const taskId = searchParams.get("taskId");

    if (bountyTaskId) {
      const task = await prisma.bountyTask.findUnique({ where: { id: bountyTaskId } });
      if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
      if (task.creatorId !== session.user.id) return NextResponse.json({ error: "只有发布人可以删除" }, { status: 403 });
      if (task.status === "settled") return NextResponse.json({ error: "已结算的任务不能删除" }, { status: 400 });

      await prisma.$transaction([
        prisma.bountyParticipant.deleteMany({ where: { bountyTaskId } }),
        prisma.bountyTask.delete({ where: { id: bountyTaskId } }),
      ]);

      return NextResponse.json({ message: "任务已删除" });
    }

    if (taskId) {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
      if (task.creatorId !== session.user.id) return NextResponse.json({ error: "只有发布人可以删除" }, { status: 403 });
      if (task.status === "settled") return NextResponse.json({ error: "已结算的任务不能删除" }, { status: 400 });

      await prisma.$transaction([
        prisma.taskParticipant.deleteMany({ where: { taskId } }),
        prisma.task.delete({ where: { id: taskId } }),
      ]);

      return NextResponse.json({ message: "任务已删除" });
    }

    return NextResponse.json({ error: "缺少任务ID" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "服务器错误";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
