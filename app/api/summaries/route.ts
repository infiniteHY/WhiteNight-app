/**
 * app/api/summaries/route.ts
 * 月度总结管理 API
 * 上传窗口：月倒数第3天12:00 开始，下月7号晚截止
 * 文件名须包含用户昵称
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeFile } from "fs/promises";
import { join } from "path";

/**
 * 检查当前是否在总结上传窗口期
 * 先读 SystemConfig 中的管理员设置，再按默认日期逻辑判断
 */
async function isInSummaryWindow(): Promise<boolean> {
  const [modeConfig, startConfig, endConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "summaryWindowMode" } }),
    prisma.systemConfig.findUnique({ where: { key: "summaryWindowStart" } }),
    prisma.systemConfig.findUnique({ where: { key: "summaryWindowEnd" } }),
  ]);

  const mode = modeConfig?.value || "auto";

  if (mode === "open") return true;
  if (mode === "closed") return false;
  if (mode === "custom") {
    const now = new Date();
    const start = startConfig?.value ? new Date(startConfig.value) : null;
    const end = endConfig?.value ? new Date(endConfig.value) : null;
    if (start && end) return now >= start && now <= end;
    return false;
  }

  // auto: 按默认日期逻辑
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const hour = now.getHours();

  const lastDay = new Date(year, month + 1, 0).getDate();
  const windowStart = lastDay - 2;

  if (day >= windowStart && !(day === windowStart && hour < 12)) return true;
  if (day >= 1 && day <= 7) return true;
  return false;
}

/**
 * 获取当前应该上传的月份
 * @returns YYYY-MM 格式
 */
function getSummaryMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  // 如果是1号到7号，上传的是上月的总结
  if (day >= 1 && day <= 7) {
    const lastMonth = month === 0 ? 11 : month - 1;
    const lastYear = month === 0 ? year - 1 : year;
    return `${lastYear}-${String(lastMonth + 1).padStart(2, "0")}`;
  }

  // 否则是当月的总结
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * GET /api/summaries
 * 获取总结列表
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || "";
  const userId = searchParams.get("userId") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");

  const where: Record<string, unknown> = {};
  if (month) where.month = month;
  if (userId) where.userId = userId;
  // 不传 userId 时返回所有人的总结（公开视图）

  const [summaries, total] = await Promise.all([
    prisma.summary.findMany({
      where,
      orderBy: { uploadTime: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.summary.count({ where }),
  ]);

  // 获取上传者信息
  const enriched = await Promise.all(
    summaries.map(async (summary) => {
      const user = await prisma.user.findUnique({
        where: { id: summary.userId },
        select: { id: true, nickname: true },
      });
      return { ...summary, user };
    })
  );

  return NextResponse.json({ summaries: enriched, total, page, pageSize });
}

/**
 * POST /api/summaries
 * 上传月度总结文件
 * 文件名须包含用户昵称
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  // 检查上传窗口
  if (!(await isInSummaryWindow()) && !isAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "当前不在总结上传窗口期（月倒数第3天12:00至下月7号）" },
      { status: 400 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "请选择要上传的文件" }, { status: 400 });
    }

    // 获取用户昵称
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { nickname: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 验证文件名包含用户昵称
    const fileName = file.name;
    if (!fileName.includes(user.nickname)) {
      return NextResponse.json(
        { error: `文件名必须包含您的昵称"${user.nickname}"` },
        { status: 400 }
      );
    }

    // 验证文件类型（允许 PDF、Word、图片）
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "只支持 PDF、Word 和图片格式" },
        { status: 400 }
      );
    }

    // 保存文件
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const month = getSummaryMonth();
    const uploadDir = join(process.cwd(), "public", "uploads", "summaries", month);

    // 生成唯一文件名
    const timestamp = Date.now();
    const ext = fileName.split(".").pop();
    const savedFileName = `${user.nickname}_${timestamp}.${ext}`;
    const filePath = join(uploadDir, savedFileName);

    // 确保目录存在
    const { mkdir } = await import("fs/promises");
    await mkdir(uploadDir, { recursive: true });

    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/summaries/${month}/${savedFileName}`;

    // 检查是否已上传过本月总结
    const existingSummary = await prisma.summary.findFirst({
      where: { userId: session.user.id, month },
    });

    let summary;
    if (existingSummary) {
      // 更新已有总结
      summary = await prisma.summary.update({
        where: { id: existingSummary.id },
        data: { fileUrl, fileName, uploadTime: new Date(), status: "submitted" },
      });
    } else {
      // 创建新总结记录
      summary = await prisma.summary.create({
        data: {
          userId: session.user.id,
          month,
          fileUrl,
          fileName,
          status: "submitted",
        },
      });
    }

    return NextResponse.json({ summary, fileUrl }, { status: 201 });
  } catch (error) {
    console.error("总结上传错误:", error);
    return NextResponse.json({ error: "文件上传失败" }, { status: 500 });
  }
}

/**
 * PATCH /api/summaries
 * 审核总结（管理员权限）
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const body = await request.json();
  const { summaryId, status } = body;

  if (!summaryId || !status) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  const summary = await prisma.summary.update({
    where: { id: summaryId },
    data: { status },
  });

  return NextResponse.json({ summary });
}
