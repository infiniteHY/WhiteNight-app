/**
 * components/layout/sidebar.tsx
 * 侧边栏导航组件
 * 移动端友好的侧边栏
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  BookOpen,
  Home,
  MessageSquare,
  FileText,
  Users,
  Wallet,
  CheckSquare,
  Bell,
  Settings,
  BarChart,
  Shield,
  BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  icon: React.ElementType;
  label: string;
  roles?: string[]; // 为空则所有角色可见
}

// 居民导航项
const residentNavItems: NavItem[] = [
  { href: "/dashboard", icon: Home, label: "首页" },
  { href: "/booklist", icon: BookOpen, label: "白日梦书单" },
  { href: "/recommend", icon: BookMarked, label: "荐书与投票" },
  { href: "/discussion", icon: MessageSquare, label: "讨论中心" },
  { href: "/wallet", icon: Wallet, label: "甲骨钱包" },
  { href: "/summary", icon: FileText, label: "总结与笔记" },
  { href: "/tasks", icon: CheckSquare, label: "任务广场" },
  { href: "/messages", icon: Bell, label: "消息中心" },
  { href: "/settings", icon: Settings, label: "个人设置" },
];

// 管理员导航项
const adminNavItems: NavItem[] = [
  { href: "/admin/dashboard", icon: BarChart, label: "运营看板" },
  { href: "/admin/books", icon: BookOpen, label: "书单管理" },
  { href: "/admin/groups", icon: Users, label: "分组管理" },
  { href: "/admin/jiagu", icon: Wallet, label: "甲骨管理" },
  { href: "/admin/summaries", icon: FileText, label: "总结统计" },
  {
    href: "/admin/residents",
    icon: Shield,
    label: "居民管理",
    roles: ["super_admin"],
  },
  {
    href: "/admin/config",
    icon: Settings,
    label: "系统配置",
    roles: ["super_admin"],
  },
];

/**
 * 侧边栏组件
 */
export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!session) return null;

  const isAdmin = ["super_admin", "booklist_npc", "stats_npc", "npc"].includes(
    session.user.role
  );

  const navItems = isAdmin ? adminNavItems : residentNavItems;

  return (
    <aside className="w-56 min-h-screen bg-gray-50 border-r border-gray-200 hidden md:block">
      <nav className="p-4 space-y-1">
        {navItems
          .filter(
            (item) =>
              !item.roles || item.roles.includes(session.user.role)
          )
          .map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
