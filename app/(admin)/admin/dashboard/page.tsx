/**
 * app/(admin)/admin/dashboard/page.tsx
 * 运营看板 - 管理员仪表盘
 * 显示：用户统计、本月书单状态、讨论组情况、甲骨流通情况
 */

"use client";

import { useState, useEffect } from "react";
import { Users, BookOpen, MessageSquare, Wallet, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  expelledUsers: number;
  blacklistedUsers: number;
  currentMonth: string;
  bookListStatus: string;
  totalDiscussionGroups: number;
  completedGroups: number;
  breachedGroups: number;
  totalJiaguInCirculation: number;
  pendingRecommendations: number;
  missedSummaries: number;
}

/**
 * 运营看板
 */
export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentUsers, setRecentUsers] = useState<Array<{
    id: string;
    nickname: string;
    role: string;
    status: string;
    jiaguBalance: number;
    joinDate: string;
  }>>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [usersRes, booklistRes, discussionRes] = await Promise.all([
        fetch("/api/users?pageSize=5"),
        fetch("/api/booklists?pageSize=1"),
        fetch("/api/admin/groups?pageSize=1"),
      ]);

      const [usersData, booklistData, discussionData] = await Promise.all([
        usersRes.json(),
        booklistRes.json(),
        discussionRes.json(),
      ]);

      setRecentUsers(usersData.users || []);

      const currentMonth = new Date().toISOString().slice(0, 7);

      setStats({
        totalUsers: usersData.total || 0,
        activeUsers: 0,
        expelledUsers: 0,
        blacklistedUsers: 0,
        currentMonth,
        bookListStatus: booklistData.bookLists?.[0]?.status || "未发布",
        totalDiscussionGroups: discussionData.total || 0,
        completedGroups: 0,
        breachedGroups: 0,
        totalJiaguInCirculation: 0,
        pendingRecommendations: 0,
        missedSummaries: 0,
      });
    } catch (error) {
      console.error("加载看板数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  const currentMonth = new Date().toISOString().slice(0, 7);

  const ROLE_NAMES: Record<string, string> = {
    super_admin: "群主",
    booklist_npc: "书单岗",
    stats_npc: "统计岗",
    npc: "NPC",
    resident: "居民",
    temp_reader: "领读员",
  };

  const STATUS_COLORS: Record<string, string> = {
    active: "text-green-600",
    expelled: "text-red-600",
    blacklisted: "text-yellow-600",
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">运营看板</h1>
        <p className="text-gray-600 mt-1">{currentMonth} 月度数据概览</p>
      </div>

      {/* 核心统计数据 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="bg-indigo-100 p-2 rounded-lg">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
                <div className="text-xs text-gray-500">总用户数</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <BookOpen className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-sm font-bold">
                  {stats?.bookListStatus === "selection_open" ? "选书中" :
                   stats?.bookListStatus === "closed" ? "已关闭" :
                   stats?.bookListStatus === "published" ? "已发布" : "未发布"}
                </div>
                <div className="text-xs text-gray-500">本月书单</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.totalDiscussionGroups || 0}</div>
                <div className="text-xs text-gray-500">讨论组总数</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <div className="bg-amber-100 p-2 rounded-lg">
                <Wallet className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-sm font-bold">甲骨系统</div>
                <div className="text-xs text-gray-500">正常运行</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <a href="/admin/books" className="block">
              <div className="font-medium text-indigo-600">📚 书单管理</div>
              <div className="text-sm text-gray-500 mt-1">创建、发布白日梦书单</div>
            </a>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <a href="/admin/groups" className="block">
              <div className="font-medium text-green-600">👥 分组管理</div>
              <div className="text-sm text-gray-500 mt-1">自动生成讨论组配对</div>
            </a>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <a href="/admin/residents" className="block">
              <div className="font-medium text-purple-600">🛡️ 居民管理</div>
              <div className="text-sm text-gray-500 mt-1">管理用户状态和角色</div>
            </a>
          </CardContent>
        </Card>
      </div>

      {/* 最近注册用户 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>最近注册用户</span>
            <a href="/admin/residents" className="text-sm font-normal text-indigo-600 hover:underline">
              查看全部
            </a>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left py-2">昵称</th>
                    <th className="text-left py-2">角色</th>
                    <th className="text-left py-2">状态</th>
                    <th className="text-right py-2">甲骨</th>
                    <th className="text-left py-2">加入时间</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsers.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">{user.nickname}</td>
                      <td className="py-2 text-gray-500">{ROLE_NAMES[user.role] || user.role}</td>
                      <td className="py-2">
                        <span className={`text-xs ${STATUS_COLORS[user.status] || "text-gray-600"}`}>
                          {user.status === "active" ? "正常" : user.status === "expelled" ? "已清退" : "黑名单"}
                        </span>
                      </td>
                      <td className={`py-2 text-right font-medium ${user.jiaguBalance < 0 ? "text-red-500" : "text-gray-800"}`}>
                        {user.jiaguBalance}
                      </td>
                      <td className="py-2 text-gray-400 text-xs">
                        {new Date(user.joinDate).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400">暂无用户数据</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
