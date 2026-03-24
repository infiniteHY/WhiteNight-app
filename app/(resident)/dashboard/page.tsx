/**
 * app/(resident)/dashboard/page.tsx
 * 居民仪表盘
 * 显示：甲骨余额、本月书单、讨论状态、最新通知
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  BookOpen,
  MessageSquare,
  Wallet,
  Bell,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, ROLE_NAMES } from "@/lib/utils";

interface DashboardData {
  user: {
    nickname: string;
    role: string;
    jiaguBalance: number;
    status: string;
  };
  currentBookList: {
    id: string;
    period: number;
    month: string;
    status: string;
    booksCount: number;
  } | null;
  mySelections: number;
  myDiscussions: {
    total: number;
    completed: number;
    pending: number;
  };
  recentNotifications: Array<{
    id: string;
    type: string;
    content: string;
    isRead: boolean;
    createdAt: string;
  }>;
  monthStats: {
    earnedJiagu: number;
    spentJiagu: number;
    notesCount: number;
  };
}

/**
 * 居民仪表盘页面
 */
export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // 并行加载所有数据
      const [booklistRes, notifRes, jiaguRes] = await Promise.all([
        fetch("/api/booklists?status=selection_open&pageSize=1"),
        fetch("/api/notifications?pageSize=5"),
        fetch("/api/jiagu"),
      ]);

      const [booklistData, notifData, jiaguData] = await Promise.all([
        booklistRes.json(),
        notifRes.json(),
        jiaguRes.json(),
      ]);

      setData({
        user: {
          nickname: session?.user?.nickname || "",
          role: session?.user?.role || "resident",
          jiaguBalance: session?.user?.jiaguBalance || 0,
          status: session?.user?.status || "active",
        },
        currentBookList: booklistData.bookLists?.[0] || null,
        mySelections: 0,
        myDiscussions: { total: 0, completed: 0, pending: 0 },
        recentNotifications: notifData.notifications || [],
        monthStats: {
          earnedJiagu: jiaguData.stats?.monthEarn || 0,
          spentJiagu: jiaguData.stats?.monthSpend || 0,
          notesCount: 0,
        },
      });
    } catch (error) {
      console.error("加载仪表盘数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  const jiaguBalance = session?.user?.jiaguBalance || 0;
  const nickname = session?.user?.nickname || "";
  const role = session?.user?.role || "resident";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 欢迎横幅 */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-1">
          你好，{nickname} 👋
        </h1>
        <p className="text-indigo-100">
          {ROLE_NAMES[role]} · 白夜读书会
        </p>

        {/* 甲骨余额 */}
        <div className="mt-4 bg-white/20 rounded-lg p-4 inline-block">
          <div className="text-indigo-100 text-sm mb-1">甲骨余额</div>
          <div className="text-3xl font-bold">
            💎 {jiaguBalance}
          </div>
          {jiaguBalance < 0 && (
            <div className="text-yellow-300 text-xs mt-1 flex items-center">
              <AlertCircle className="h-3 w-3 mr-1" />
              余额为负，注意清退风险
            </div>
          )}
        </div>
      </div>

      {/* 快速操作卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/booklist">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <BookOpen className="h-8 w-8 text-indigo-600 mb-2" />
              <div className="font-medium text-sm">白日梦书单</div>
              {data?.currentBookList && (
                <Badge variant="success" className="mt-1 text-xs">
                  选书中
                </Badge>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/discussion">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <MessageSquare className="h-8 w-8 text-green-600 mb-2" />
              <div className="font-medium text-sm">讨论中心</div>
              {data?.myDiscussions.pending ? (
                <Badge variant="warning" className="mt-1 text-xs">
                  {data.myDiscussions.pending}个待完成
                </Badge>
              ) : null}
            </CardContent>
          </Card>
        </Link>

        <Link href="/wallet">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Wallet className="h-8 w-8 text-amber-600 mb-2" />
              <div className="font-medium text-sm">甲骨钱包</div>
              <div className="text-xs text-gray-500 mt-1">
                本月+{data?.monthStats.earnedJiagu || 0}
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/messages">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4 flex flex-col items-center text-center">
              <Bell className="h-8 w-8 text-red-500 mb-2" />
              <div className="font-medium text-sm">消息中心</div>
              {data?.recentNotifications.filter((n) => !n.isRead).length ? (
                <Badge variant="destructive" className="mt-1 text-xs">
                  {data.recentNotifications.filter((n) => !n.isRead).length}条未读
                </Badge>
              ) : null}
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 当前书单状态 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <BookOpen className="h-5 w-5 mr-2 text-indigo-600" />
              本期书单
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.currentBookList ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium">第{data.currentBookList.period}期白日梦书单</div>
                    <div className="text-sm text-gray-500">{data.currentBookList.month}</div>
                  </div>
                  <Badge variant="success">选书中</Badge>
                </div>
                <div className="text-sm text-gray-600 mb-3">
                  共 {data.currentBookList.booksCount || 0} 本书目可选
                </div>
                <Link href="/booklist">
                  <Button size="sm" className="w-full">前往选书</Button>
                </Link>
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400">
                <Clock className="h-10 w-10 mx-auto mb-2" />
                <div>本月书单尚未发布</div>
                <div className="text-xs mt-1">每月20号前后发布</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 本月甲骨统计 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-amber-600" />
              本月甲骨
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                  +{data?.monthStats.earnedJiagu || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">本月获得</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-500">
                  -{data?.monthStats.spentJiagu || 0}
                </div>
                <div className="text-xs text-gray-500 mt-1">本月消耗</div>
              </div>
            </div>
            <Link href="/wallet">
              <Button variant="outline" size="sm" className="w-full mt-3">
                查看完整流水
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* 最新通知 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center">
              <Bell className="h-5 w-5 mr-2 text-red-500" />
              最新通知
            </div>
            <Link href="/messages">
              <Button variant="ghost" size="sm">查看全部</Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentNotifications && data.recentNotifications.length > 0 ? (
            <div className="space-y-3">
              {data.recentNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex items-start space-x-3 p-3 rounded-lg ${
                    notif.isRead ? "bg-gray-50" : "bg-indigo-50 border border-indigo-100"
                  }`}
                >
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{notif.content}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatRelativeTime(notif.createdAt)}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400">
              <CheckCircle className="h-10 w-10 mx-auto mb-2" />
              <div>暂无通知</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
