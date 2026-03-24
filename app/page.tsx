/**
 * app/page.tsx
 * 首页 - 重定向到登录页或仪表盘
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * 首页自动重定向
 * 已登录用户跳转到仪表盘，未登录跳转到登录页
 */
export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session) {
    const adminRoles = ["super_admin", "booklist_npc", "stats_npc", "npc"];
    if (adminRoles.includes(session.user.role)) {
      redirect("/admin/dashboard");
    }
    redirect("/dashboard");
  }

  redirect("/login");
}
