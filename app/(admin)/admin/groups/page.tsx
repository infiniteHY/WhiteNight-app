/**
 * app/(admin)/admin/groups/page.tsx
 * 分组管理页面（管理员专用）
 * 支持自动生成讨论组和查看分组状态
 */

"use client";

import { useState, useEffect } from "react";
import { Users, Shuffle, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DiscussionGroup {
  id: string;
  bookId: string;
  bookListId: string;
  status: string;
  phase?: string;
  createdAt: string;
  book: { title: string; author: string };
  userAInfo: { id: string; nickname: string };
  userBInfo: { id: string; nickname: string };
  leaderInfo: { id: string; nickname: string };
  recordCount: number;
}

interface BookList {
  id: string;
  period: number;
  month: string;
  status: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  pending: { label: "待开始", variant: "secondary" },
  completed: { label: "讨论完", variant: "success" },
  breached: { label: "已违约", variant: "destructive" },
};

/**
 * 分组管理页面
 */
export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<DiscussionGroup[]>([]);
  const [bookLists, setBookLists] = useState<BookList[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedBookListId, setSelectedBookListId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [message, setMessage] = useState("");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    try {
      const [groupsRes, booklistRes] = await Promise.all([
        fetch(`/api/admin/groups?pageSize=50${filterStatus ? `&status=${filterStatus}` : ""}`),
        fetch("/api/booklists?pageSize=10"),
      ]);

      const [groupsData, booklistData] = await Promise.all([
        groupsRes.json(),
        booklistRes.json(),
      ]);

      setGroups(groupsData.groups || []);
      setTotal(groupsData.total || 0);
      setBookLists(booklistData.bookLists || []);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  /** 清除所选书单的所有讨论组数据 */
  const clearGroups = async () => {
    if (!selectedBookListId) { setMessage("❌ 请先选择书单"); return; }
    if (!confirm("将删除该书单所有讨论组，不可恢复。确认？")) return;
    const res = await fetch("/api/admin/groups", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clearGroups", bookListId: selectedBookListId }),
    });
    const data = await res.json();
    if (res.ok) { setMessage(`✅ ${data.message}`); loadData(); }
    else setMessage(`❌ ${data.error}`);
  };

  const generateGroups = async () => {
    if (!selectedBookListId) {
      setMessage("❌ 请选择要生成分组的书单");
      return;
    }

    if (!confirm("确认为该书单自动生成讨论分组？系统将根据选书记录进行随机配对。")) return;

    setGenerating(true);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookListId: selectedBookListId }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ ${data.message}`);
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 分组生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const completedCount = groups.filter((g) => g.status === "completed").length;
  const breachedCount = groups.filter((g) => g.status === "breached").length;
  const pendingCount = groups.filter((g) => g.status === "pending").length;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">分组管理</h1>
        <p className="text-gray-600 mt-1">管理讨论组配对和进度追踪</p>
      </div>

      {/* 全局消息 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-800">{total}</div>
            <div className="text-xs text-gray-500 mt-1">总讨论组</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <div className="text-xs text-gray-500 mt-1">已完成</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{pendingCount}</div>
            <div className="text-xs text-gray-500 mt-1">待开始</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-500">{breachedCount}</div>
            <div className="text-xs text-gray-500 mt-1">已违约</div>
          </CardContent>
        </Card>
      </div>

      {/* 生成分组 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">自动生成讨论组</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>选择书单</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              value={selectedBookListId}
              onChange={(e) => setSelectedBookListId(e.target.value)}
            >
              <option value="">请选择书单...</option>
              {bookLists.map((list) => (
                <option key={list.id} value={list.id}>
                  第{list.period}期 · {list.month} ·{" "}
                  {list.status === "closed" ? "已关闭" : list.status === "selection_open" ? "选书中" : list.status}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={generateGroups} disabled={generating || !selectedBookListId}>
              <Shuffle className="h-4 w-4 mr-2" />
              {generating ? "生成中..." : "自动分组"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-500 border-red-300 hover:bg-red-50"
              disabled={!selectedBookListId}
              onClick={clearGroups}
            >
              🗑 清除分组记录
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 过滤 */}
      <div className="flex space-x-2">
        {[
          { key: "", label: "全部" },
          { key: "pending", label: "待开始" },
          { key: "completed", label: "讨论完" },
          { key: "breached", label: "已违约" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1 rounded-full text-sm ${
              filterStatus === f.key
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 讨论组列表 */}
      <div className="space-y-3">
        {groups.length > 0 ? (
          groups.map((group) => (
            <Card key={group.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">《{group.book.title}》</span>
                      <Badge variant={STATUS_CONFIG[group.status]?.variant || "secondary"}>
                        {STATUS_CONFIG[group.status]?.label || group.status}
                      </Badge>
                    </div>
                    <div className="flex items-center space-x-1 text-sm text-gray-600 mt-1">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span>{group.userAInfo.nickname}</span>
                      <span className="text-gray-300">×</span>
                      <span>{group.userBInfo.nickname}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-2 text-gray-200" />
              <div>暂无讨论组</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
