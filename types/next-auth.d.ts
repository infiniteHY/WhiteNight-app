/**
 * types/next-auth.d.ts
 * NextAuth.js 类型扩展
 * 扩展 Session 和 JWT 类型以包含自定义用户字段
 */

import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      nickname: string;
      jiaguBalance: number;
      status: string;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    jiaguBalance?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    nickname: string;
    jiaguBalance: number;
    status: string;
  }
}
