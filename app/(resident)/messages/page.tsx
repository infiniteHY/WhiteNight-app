/**
 * app/(resident)/messages/page.tsx
 * 消息中心页面
 * 显示所有通知，支持标记已读
 */

"use client";

import { useState, useEffect } from "react";
import { Bell, CheckCheck, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  system: "🔔",
  jiagu: "💎",
  jiagu_warning: "⚠️",
  discussion: "📖",
  booklist: "📚",
  selection: "🗳️",
  summary: "📝",
  task: "✅",
  breach: "❌",
};

/**
 * 消息中心页面
 */
export default function MessagesPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadNotifications();
  }, [filter, page]);

  const loadNotifications = async () => {
    try {
      const unreadParam = filter === "unread" ? "&unreadOnly=true" : "";
      const res = await fetch(`/api/notifications?page=${page}&pageSize=20${unreadParam}`);
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("加载通知失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            消息中心
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount}条未读
              </Badge>
            )}
          </h1>
        </div>

        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <CheckCheck className="h-4 w-4 mr-2" />
            全部已读
          </Button>
        )}
      </div>

      {/* 过滤 */}
      <div className="flex space-x-2">
        {[
          { key: "all", label: "全部" },
          { key: "unread", label: "未读" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-sm ${
              filter === f.key
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 通知列表 */}
      <div className="space-y-2">
        {notifications.length > 0 ? (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className={`flex items-start space-x-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                notif.isRead
                  ? "bg-white border-gray-100 hover:bg-gray-50"
                  : "bg-indigo-50 border-indigo-200 hover:bg-indigo-100"
              }`}
              onClick={() => !notif.isRead && markAsRead(notif.id)}
            >
              <div className="text-xl flex-shrink-0">
                {TYPE_ICONS[notif.type] || "📬"}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${notif.isRead ? "text-gray-700" : "text-gray-900 font-medium"}`}>
                  {notif.content}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatRelativeTime(notif.createdAt)}
                </p>
              </div>
              {!notif.isRead && (
                <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 flex-shrink-0" />
              )}
            </div>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-gray-400">
                {filter === "unread" ? "没有未读通知" : "暂无通知"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 分页 */}
      {total > 20 && (
        <div className="flex justify-center space-x-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="py-2 text-sm text-gray-600">
            第{page}页 / 共{Math.ceil(total / 20)}页
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / 20)}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
