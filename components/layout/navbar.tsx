/**
 * components/layout/navbar.tsx
 * 顶部导航栏组件
 * 仅显示品牌名称和用户信息，页面导航统一由左侧栏负责
 */

"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Bell, BookOpen, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 顶部导航栏
 * 展示：品牌 Logo、甲骨余额、消息入口、用户昵称、退出登录
 * 不再包含页面切换标签，所有导航由侧边栏 Sidebar 统一处理
 */
export default function Navbar() {
  const { data: session } = useSession();

  if (!session) return null;

  const isAdmin = ["super_admin", "booklist_npc", "stats_npc", "npc"].includes(
    session.user.role
  );

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="px-4 sm:px-6">
        <div className="flex justify-between h-14">
          {/* 左侧：品牌 Logo */}
          <div className="flex items-center">
            <Link
              href={isAdmin ? "/admin/dashboard" : "/dashboard"}
              className="flex items-center space-x-2"
            >
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <span className="font-bold text-base text-gray-900">白夜读书会</span>
            </Link>
          </div>

          {/* 右侧：用户信息区 */}
          <div className="flex items-center space-x-2">
            {/* 甲骨余额徽章 */}
            <div className="hidden sm:flex items-center space-x-1 bg-amber-50 px-3 py-1 rounded-full">
              <span className="text-amber-600 text-sm font-bold">
                💎 {session.user.jiaguBalance ?? 0}
              </span>
              <span className="text-amber-500 text-xs">甲骨</span>
            </div>

            {/* 消息通知入口 */}
            <Link href="/messages">
              <Button variant="ghost" size="icon" title="消息中心">
                <Bell className="h-5 w-5" />
              </Button>
            </Link>

            {/* 个人设置入口 */}
            <Link href="/settings">
              <Button variant="ghost" size="icon" title="个人设置">
                <Settings className="h-5 w-5" />
              </Button>
            </Link>

            {/* 当前用户昵称 */}
            <div className="hidden sm:flex items-center space-x-1 text-sm text-gray-700">
              <User className="h-4 w-4 text-gray-400" />
              <span>{session.user.nickname}</span>
            </div>

            {/* 退出登录 */}
            <Button
              variant="ghost"
              size="icon"
              title="退出登录"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
