/**
 * middleware.ts
 * 路由权限中间件
 * 处理认证检查和角色权限验证
 * 保护需要登录的路由和管理员专属路由
 */

import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // 清退用户强制登出（不允许访问任何页面）
    if (token && token.status === "expelled") {
      const logoutUrl = new URL("/login", req.url);
      logoutUrl.searchParams.set("error", "expelled");
      const response = NextResponse.redirect(logoutUrl);
      response.cookies.delete("next-auth.session-token");
      response.cookies.delete("__Secure-next-auth.session-token");
      return response;
    }

    // 检查管理员路由
    if (pathname.startsWith("/admin")) {
      const adminRoles = ["super_admin", "booklist_npc", "stats_npc", "npc"];
      if (!token || !adminRoles.includes(token.role as string)) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }

    // 检查群主专属路由
    if (pathname.startsWith("/admin/config") || pathname.startsWith("/admin/residents")) {
      if (!token || token.role !== "super_admin") {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }
    }

    // 已登录用户访问登录/注册页，重定向到首页
    if (
      token &&
      (pathname === "/login" || pathname === "/register")
    ) {
      const adminRoles = ["super_admin", "booklist_npc", "stats_npc", "npc"];
      if (adminRoles.includes(token.role as string)) {
        return NextResponse.redirect(new URL("/admin/dashboard", req.url));
      }
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // 允许公开访问登录和注册页
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;
        const publicPaths = ["/login", "/register", "/api/auth"];

        if (publicPaths.some((path) => pathname.startsWith(path))) {
          return true;
        }

        return !!token;
      },
    },
  }
);

// 指定中间件匹配的路由
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/booklist/:path*",
    "/recommend/:path*",
    "/discussion/:path*",
    "/wallet/:path*",
    "/summary/:path*",
    "/tasks/:path*",
    "/messages/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/login",
    "/register",
  ],
};
