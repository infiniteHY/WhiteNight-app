/**
 * app/(admin)/admin/summaries/page.tsx
 * 总结统计页面（管理员专用）
 */

"use client";

import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

interface Summary {
  id: string;
  userId: string;
  month: string;
  fileName: string;
  fileUrl: string;
  uploadTime: string;
  status: string;
  user: { id: string; nickname: string };
}

type WindowMode = "auto" | "open" | "closed" | "custom";

export default function AdminSummariesPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  // 上传窗口控制
  const [windowMode, setWindowMode] = useState<WindowMode>("auto");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [savingWindow, setSavingWindow] = useState(false);

  useEffect(() => {
    loadData();
    loadWindowConfig();
  }, [filterMonth]);

  const loadWindowConfig = async () => {
    try {
      const res = await fetch("/api/admin/summary-window");
      const data = await res.json();
      setWindowMode(data.mode || "auto");
      setWindowStart(data.start || "");
      setWindowEnd(data.end || "");
    } catch {}
  };

  const saveWindowConfig = async () => {
    setSavingWindow(true);
    try {
      const res = await fetch("/api/admin/summary-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: windowMode, start: windowStart, end: windowEnd }),
      });
      const data = await res.json();
      if (res.ok) setMessage(`✅ ${data.message}`);
      else setMessage(`❌ ${data.error}`);
    } catch {
      setMessage("❌ 操作失败");
    } finally {
      setSavingWindow(false);
    }
  };

  const loadData = async () => {
    try {
      const res = await fetch(`/api/summaries?month=${filterMonth}&pageSize=50`);
      const data = await res.json();
      setSummaries(data.summaries || []);
    } catch (error) {
      console.error("加载失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const approveSummary = async (summaryId: string) => {
    try {
      const res = await fetch("/api/summaries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summaryId, status: "approved" }),
      });

      if (res.ok) {
        setMessage("✅ 总结已审核通过");
        loadData();
      }
    } catch {
      setMessage("❌ 操作失败");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  const approvedCount = summaries.filter((s) => s.status === "approved").length;
  const pendingCount = summaries.filter((s) => s.status === "submitted").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">总结统计</h1>
        <p className="text-gray-600 mt-1">查看和审核月度总结</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {/* 上传窗口控制 */}
      <Card className="border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">总结上传窗口设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 模式选择 */}
          <div className="grid grid-cols-4 gap-2">
            {([
              { value: "auto", label: "自动", desc: "按系统日期" },
              { value: "open", label: "强制开放", desc: "立即允许上传" },
              { value: "closed", label: "强制关闭", desc: "禁止上传" },
              { value: "custom", label: "自定义时间", desc: "设置起止时间" },
            ] as const).map((m) => (
              <button
                key={m.value}
                onClick={() => setWindowMode(m.value)}
                className={`p-3 rounded-lg border text-left text-sm transition-colors ${
                  windowMode === m.value
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className={`font-medium ${windowMode === m.value ? "text-indigo-700" : "text-gray-700"}`}>
                  {m.label}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>

          {/* 自定义时间段 */}
          {windowMode === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>开始时间</Label>
                <Input
                  type="datetime-local"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                />
              </div>
              <div>
                <Label>结束时间</Label>
                <Input
                  type="datetime-local"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* 当前状态说明 */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {windowMode === "auto" && "当前使用自动规则：月倒数第3天12:00 至 下月7号23:59"}
              {windowMode === "open" && "⚠️ 强制开放：所有居民均可上传总结"}
              {windowMode === "closed" && "⚠️ 强制关闭：任何居民都无法上传总结"}
              {windowMode === "custom" && (windowStart && windowEnd
                ? `自定义窗口：${windowStart} 至 ${windowEnd}`
                : "请设置开始和结束时间")}
            </p>
            <Button onClick={saveWindowConfig} disabled={savingWindow} size="sm">
              {savingWindow ? "保存中..." : "保存设置"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 过滤 */}
      <div className="flex items-center space-x-3">
        <input
          type="month"
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
        />
        <div className="text-sm text-gray-500">
          已提交：{summaries.length}篇 · 已审核：{approvedCount}篇 · 待审核：{pendingCount}篇
        </div>
      </div>

      {/* 总结列表 */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600">居民</th>
                <th className="text-left px-4 py-3 text-gray-600">文件名</th>
                <th className="text-left px-4 py-3 text-gray-600">上传时间</th>
                <th className="text-left px-4 py-3 text-gray-600">状态</th>
                <th className="text-right px-4 py-3 text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((summary) => (
                <tr key={summary.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{summary.user?.nickname}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-48 truncate">
                    {summary.fileName}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {formatDateTime(summary.uploadTime)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={summary.status === "approved" ? "success" : "secondary"}>
                      {summary.status === "approved" ? "已审核" : "待审核"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <a href={summary.fileUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">查看</Button>
                      </a>
                      {summary.status === "submitted" && (
                        <Button size="sm" onClick={() => approveSummary(summary.id)}>
                          通过
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {summaries.length === 0 && (
            <div className="py-10 text-center text-gray-400">
              <FileText className="h-10 w-10 mx-auto mb-2" />
              <div>本月暂无总结提交</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
