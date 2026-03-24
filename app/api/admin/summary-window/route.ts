/**
 * app/api/admin/summary-window/route.ts
 * 管理员控制月度总结上传窗口
 * mode: "auto" = 自动按日期判断 | "open" = 强制开放 | "closed" = 强制关闭 | "custom" = 自定义时间段
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const KEY_MODE = "summaryWindowMode";
const KEY_START = "summaryWindowStart";
const KEY_END = "summaryWindowEnd";

/** GET — 所有登录用户可查（前端判断是否在窗口期） */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const [modeConfig, startConfig, endConfig] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: KEY_MODE } }),
    prisma.systemConfig.findUnique({ where: { key: KEY_START } }),
    prisma.systemConfig.findUnique({ where: { key: KEY_END } }),
  ]);

  const mode = (modeConfig?.value || "auto") as "auto" | "open" | "closed" | "custom";
  const start = startConfig?.value || "";
  const end = endConfig?.value || "";

  return NextResponse.json({ mode, start, end });
}

/** POST — 管理员专用，设置窗口模式 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "权限不足" }, { status: 403 });
  }

  const body = await request.json();
  const { mode, start, end } = body as { mode: string; start?: string; end?: string };

  if (!["auto", "open", "closed", "custom"].includes(mode)) {
    return NextResponse.json({ error: "无效的模式" }, { status: 400 });
  }
  if (mode === "custom" && (!start || !end)) {
    return NextResponse.json({ error: "自定义模式需要填写开始和结束时间" }, { status: 400 });
  }

  await Promise.all([
    prisma.systemConfig.upsert({
      where: { key: KEY_MODE },
      update: { value: mode },
      create: { key: KEY_MODE, value: mode },
    }),
    prisma.systemConfig.upsert({
      where: { key: KEY_START },
      update: { value: start || "" },
      create: { key: KEY_START, value: start || "" },
    }),
    prisma.systemConfig.upsert({
      where: { key: KEY_END },
      update: { value: end || "" },
      create: { key: KEY_END, value: end || "" },
    }),
  ]);

  const labels: Record<string, string> = {
    auto: "自动（按系统日期）",
    open: "强制开放",
    closed: "强制关闭",
    custom: `自定义（${start} 至 ${end}）`,
  };

  return NextResponse.json({ mode, start, end, message: `上传窗口已设置为：${labels[mode]}` });
}
