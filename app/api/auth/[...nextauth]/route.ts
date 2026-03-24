/**
 * app/api/auth/[...nextauth]/route.ts
 * NextAuth.js API 路由处理器
 * 处理登录、注销、会话等认证请求
 */

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
