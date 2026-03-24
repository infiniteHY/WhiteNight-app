/**
 * lib/auth.ts
 * NextAuth.js 认证配置
 * 使用 Credentials Provider 实现邮箱+密码登录
 * 支持角色权限和用户状态验证
 */

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

/**
 * NextAuth 配置选项
 */
export const authOptions: NextAuthOptions = {
  // 使用 JWT 策略存储会话
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30天过期
  },

  providers: [
    CredentialsProvider({
      name: "邮箱登录",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },

      /**
       * 验证用户凭证
       * @param credentials - 登录凭证（邮箱和密码）
       * @returns 用户信息或 null
       */
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("请输入邮箱和密码");
        }

        // 查找用户
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("邮箱或密码不正确");
        }

        // 检查用户状态
        if (user.status === "expelled") {
          throw new Error("账号已被清退，如有疑问请联系群主");
        }

        if (user.status === "blacklisted") {
          if (user.blacklistUntil && user.blacklistUntil > new Date()) {
            throw new Error(
              `账号已被列入黑名单，解禁时间：${user.blacklistUntil.toLocaleDateString("zh-CN")}`
            );
          }
          // 黑名单已过期，自动恢复
          await prisma.user.update({
            where: { id: user.id },
            data: { status: "active", blacklistUntil: null },
          });
        }

        // 验证密码
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!passwordMatch) {
          throw new Error("邮箱或密码不正确");
        }

        // 返回用户信息（这些数据会被编码到 JWT token 中）
        return {
          id: user.id,
          email: user.email,
          name: user.nickname,
          role: user.role,
          jiaguBalance: user.jiaguBalance,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * JWT 回调 - 将用户信息写入 token
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.nickname = user.name ?? "";
      }

      // 每次请求时从数据库刷新用户信息（含昵称，确保改名后全站同步）
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { jiaguBalance: true, status: true, role: true, nickname: true },
        });
        if (dbUser) {
          token.jiaguBalance = dbUser.jiaguBalance;
          token.status     = dbUser.status;
          token.role       = dbUser.role;
          token.nickname   = dbUser.nickname; // 昵称跟随数据库实时更新
        }
      }

      return token;
    },

    /**
     * Session 回调 - 将 token 数据暴露给前端
     */
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.nickname = token.nickname as string;
        session.user.jiaguBalance = token.jiaguBalance as number;
        session.user.status = token.status as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",        // 自定义登录页
    error: "/login",         // 错误页重定向到登录页
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// 角色权限定义
export const ROLES = {
  SUPER_ADMIN: "super_admin",
  BOOKLIST_NPC: "booklist_npc",
  STATS_NPC: "stats_npc",
  NPC: "npc",
  RESIDENT: "resident",
  TEMP_READER: "temp_reader",
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

/**
 * 检查用户是否有管理员权限
 * @param role - 用户角色
 * @returns 是否为管理员
 */
export function isAdmin(role: string): boolean {
  return (["super_admin", "booklist_npc", "stats_npc", "npc"] as string[]).includes(role);
}

/**
 * 检查用户是否为超级管理员
 * @param role - 用户角色
 * @returns 是否为超级管理员
 */
export function isSuperAdmin(role: string): boolean {
  return role === ROLES.SUPER_ADMIN;
}

/**
 * 检查用户是否可以管理书单
 * @param role - 用户角色
 * @returns 是否有书单管理权限
 */
export function canManageBookList(role: string): boolean {
  return (["super_admin", "booklist_npc"] as string[]).includes(role);
}

/**
 * 获取角色的中文名称
 * @param role - 角色标识
 * @returns 角色中文名称
 */
export function getRoleName(role: string): string {
  const roleNames: Record<string, string> = {
    super_admin: "群主",
    booklist_npc: "书单岗NPC",
    stats_npc: "统计岗NPC",
    npc: "普通NPC",
    resident: "普通居民",
    temp_reader: "临时领读员",
  };
  return roleNames[role] || "未知角色";
}
