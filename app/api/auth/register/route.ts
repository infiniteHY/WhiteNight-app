/**
 * app/api/auth/register/route.ts
 * 用户注册 API
 * 支持邮箱+密码注册，需要有效的邀请码激活
 * 昵称要求：≤7字，不含表情符号
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

/**
 * 验证昵称格式
 * @param nickname - 要验证的昵称
 * @returns 验证结果和错误信息
 */
function validateNickname(nickname: string): { valid: boolean; error?: string } {
  // 检查长度（≤7个字符）
  if (nickname.length > 7) {
    return { valid: false, error: "昵称不能超过7个字符" };
  }

  if (nickname.length === 0) {
    return { valid: false, error: "昵称不能为空" };
  }

  // 检查是否包含表情符号（Emoji）
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/u;
  if (emojiRegex.test(nickname)) {
    return { valid: false, error: "昵称不能包含表情符号" };
  }

  return { valid: true };
}

/**
 * POST /api/auth/register
 * 注册新用户
 * @param request - 包含 email, password, nickname, inviteCode 的请求体
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, nickname, inviteCode } = body;

    // 基础验证
    if (!email || !password || !nickname || !inviteCode) {
      return NextResponse.json(
        { error: "邮箱、密码、昵称和邀请码均为必填项" },
        { status: 400 }
      );
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    // 验证密码长度
    if (password.length < 8) {
      return NextResponse.json(
        { error: "密码长度不能少于8位" },
        { status: 400 }
      );
    }

    // 验证昵称
    const nicknameValidation = validateNickname(nickname);
    if (!nicknameValidation.valid) {
      return NextResponse.json(
        { error: nicknameValidation.error },
        { status: 400 }
      );
    }

    // 验证邀请码
    const invite = await prisma.inviteCode.findUnique({
      where: { code: inviteCode },
    });

    if (!invite) {
      return NextResponse.json({ error: "邀请码无效" }, { status: 400 });
    }

    if (invite.usedBy) {
      return NextResponse.json(
        { error: "邀请码已被使用" },
        { status: 400 }
      );
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "邀请码已过期" }, { status: 400 });
    }

    // 检查邮箱是否已注册
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      return NextResponse.json(
        { error: "该邮箱已被注册" },
        { status: 400 }
      );
    }

    // 检查昵称是否已被使用
    const existingNickname = await prisma.user.findUnique({
      where: { nickname },
    });
    if (existingNickname) {
      return NextResponse.json(
        { error: "该昵称已被使用，请选择其他昵称" },
        { status: 400 }
      );
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 事务：创建用户并更新邀请码使用状态
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          nickname,
          role: "resident",
          status: "active",
          jiaguBalance: 0,
        },
      });

      // 标记邀请码已使用
      await tx.inviteCode.update({
        where: { id: invite.id },
        data: { usedBy: newUser.id, usedAt: new Date() },
      });

      // 发送欢迎通知
      await tx.notification.create({
        data: {
          userId: newUser.id,
          type: "system",
          content: `🎉 欢迎加入白夜读书会！您的账号已成功激活，祝您阅读愉快！`,
        },
      });

      return newUser;
    });

    return NextResponse.json({
      message: "注册成功",
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("注册错误:", error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 }
    );
  }
}
