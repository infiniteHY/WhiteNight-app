/**
 * app/(admin)/admin/groups/page.tsx
 * 分组管理页面（管理员专用）
 * 讨论完成情况按选书期和时间分别显示
 */

"use client";

import { useState, useEffect } from "react";
import { Users, Shuffle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  dodged: { label: "已闪避", variant: "outline" },
};

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<DiscussionGroup[]>([]);
  const [bookLists, setBookLists] = useState<BookList[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedBookListId, setSelectedBookListId] = useState("");
  const [filterBookListId, setFilterBookListId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [viewMode, setViewMode] = useState<"period" | "time">("period");
  const [message, setMessage] = useState("");
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadData();
  }, [filterStatus, filterBookListId]);

  const loadData = async () => {
    try {
      const params = new URLSearchParams({ pageSize: "200" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterBookListId) params.set("bookListId", filterBookListId);

      const [groupsRes, booklistRes] = await Promise.all([
        fetch(`/api/admin/groups?${params}`),
        fetch("/api/booklists?pageSize=20"),
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
    if (!selectedBookListId) { setMessage("❌ 请选择要生成分组的书单"); return; }
    if (!confirm("确认为该书单自动生成讨论分组？系统将根据选书记录进行随机配对。")) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookListId: selectedBookListId }),
      });
      const data = await res.json();
      if (res.ok) { setMessage(`✅ ${data.message}`); loadData(); }
      else setMessage(`❌ ${data.error}`);
    } catch {
      setMessage("❌ 分组生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const bookListMap = Object.fromEntries(bookLists.map((bl) => [bl.id, bl]));

  // 按期分组
  const groupsByPeriod = groups.reduce<Record<string, DiscussionGroup[]>>((acc, g) => {
    if (!acc[g.bookListId]) acc[g.bookListId] = [];
    acc[g.bookListId].push(g);
    return acc;
  }, {});

  // 按时间排序
  const groupsByTime = [...groups].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const completedCount = groups.filter((g) => g.status === "completed").length;
  const breachedCount = groups.filter((g) => g.status === "breached").length;
  const pendingCount = groups.filter((g) => g.status === "pending").length;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  const GroupCard = ({ group }: { group: DiscussionGroup }) => {
    const bl = bookListMap[group.bookListId];
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">《{group.book.title}》</span>
                <Badge variant={STATUS_CONFIG[group.status]?.variant || "secondary"}>
                  {STATUS_CONFIG[group.status]?.label || group.status}
                </Badge>
                {bl && viewMode === "time" && (
                  <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    第{bl.period}期 · {bl.month}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-600 mt-1.5">
                <Users className="h-3.5 w-3.5 text-gray-400" />
                <span>{group.userAInfo.nickname}</span>
                <span className="text-gray-300">×</span>
                <span>{group.userBInfo.nickname}</span>
              </div>
            </div>
            <div className="text-xs text-gray-400 flex-shrink-0">
              {new Date(group.createdAt).toLocaleDateString("zh-CN")}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">分组管理</h1>
        <p className="text-gray-600 mt-1">管理讨论组配对和进度追踪</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {/* 统计 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "总讨论组", value: total, color: "text-gray-800" },
          { label: "已完成", value: completedCount, color: "text-green-600" },
          { label: "待开始", value: pendingCount, color: "text-blue-600" },
          { label: "已违约", value: breachedCount, color: "text-red-500" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 生成分组 */}
      <Card>
        <CardHeader><CardTitle className="text-base">自动生成讨论组</CardTitle></CardHeader>
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

      {/* 过滤 + 视图切换 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap items-center">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={filterBookListId}
            onChange={(e) => setFilterBookListId(e.target.value)}
          >
            <option value="">全部期次</option>
            {bookLists.map((list) => (
              <option key={list.id} value={list.id}>
                第{list.period}期 · {list.month}
              </option>
            ))}
          </select>
          {["", "pending", "completed", "breached", "dodged"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-sm ${
                filterStatus === s ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s === "" ? "全部" : STATUS_CONFIG[s]?.label || s}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode("period")}
            className={`px-3 py-1 rounded text-sm ${viewMode === "period" ? "bg-white shadow text-indigo-600 font-medium" : "text-gray-500"}`}
          >
            按期
          </button>
          <button
            onClick={() => setViewMode("time")}
            className={`px-3 py-1 rounded text-sm ${viewMode === "time" ? "bg-white shadow text-indigo-600 font-medium" : "text-gray-500"}`}
          >
            按时间
          </button>
        </div>
      </div>

      {/* 讨论组列表 */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-2 text-gray-200" />
            <div>暂无讨论组</div>
          </CardContent>
        </Card>
      ) : viewMode === "period" ? (
        <div className="space-y-8">
          {Object.entries(groupsByPeriod)
            .sort(([a], [b]) => (bookListMap[b]?.period || 0) - (bookListMap[a]?.period || 0))
            .map(([bookListId, periodGroups]) => {
              const bl = bookListMap[bookListId];
              const done = periodGroups.filter((g) => g.status === "completed").length;
              return (
                <div key={bookListId}>
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-semibold text-gray-800">
                      {bl ? `第${bl.period}期 · ${bl.month}` : bookListId}
                    </h3>
                    <span className="text-sm text-gray-400">
                      {periodGroups.length}组 · 完成{done}/{periodGroups.length}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden max-w-48">
                      <div
                        className="h-full bg-green-500 rounded-full"
                        style={{ width: `${periodGroups.length ? (done / periodGroups.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {periodGroups.map((g) => <GroupCard key={g.id} group={g} />)}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="space-y-2">
          {groupsByTime.map((g) => <GroupCard key={g.id} group={g} />)}
        </div>
      )}
    </div>
  );
}
