/**
 * app/(resident)/discussion/page.tsx
 * 讨论中心页面
 * 显示讨论组信息，支持提交讨论记录
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { MessageSquare, CheckCircle, Clock, BookOpen, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DiscussionGroup {
  id: string;
  bookId: string;
  status: string;
  phase?: string;
  deadline?: string;
  book: { id: string; title: string; author: string };
  bookList?: { id: string; month: string; period: number };
  userAInfo: { id: string; nickname: string };
  userBInfo: { id: string; nickname: string };
  leaderInfo: { id: string; nickname: string };
  records: Array<{
    id: string;
    phase: string;
    discussTime: string;
    location?: string;
  }>;
}

const PHASE_NAMES: Record<string, string> = {
  early: "月初阶段（+3甲骨）",
  mid: "月中阶段（+1甲骨）",
  late: "月末阶段（+0甲骨）",
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  pending: { label: "待开始", variant: "secondary" },
  completed: { label: "讨论完", variant: "success" },
  breached: { label: "已违约", variant: "destructive" },
};

/**
 * 讨论中心页面
 */
export default function DiscussionPage() {
  const { data: session } = useSession();
  const [groups, setGroups] = useState<DiscussionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitModal, setSubmitModal] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ recordId: string; groupId: string } | null>(null);
  const [discussForm, setDiscussForm] = useState({
    discussTime: "",
    location: "",
    phase: "",
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const res = await fetch("/api/discussions");
      const data = await res.json();
      setGroups(data.groups || []);
    } catch (error) {
      console.error("加载讨论组失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const submitDiscussion = async (groupId: string) => {
    if (!discussForm.discussTime) {
      setMessage("❌ 请填写讨论时间");
      return;
    }

    try {
      const res = await fetch("/api/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          discussTime: discussForm.discussTime,
          location: discussForm.location,
          phase: discussForm.phase || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ 讨论记录已提交${data.reward > 0 ? `，获得${data.reward}甲骨` : ""}`);
        setSubmitModal(null);
        setDiscussForm({ discussTime: "", location: "", phase: "" });
        loadGroups();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 提交失败");
    }
  };

  const saveEditDiscussion = async () => {
    if (!editModal || !discussForm.discussTime) {
      setMessage("❌ 请填写讨论时间");
      return;
    }

    try {
      const res = await fetch("/api/discussions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: editModal.recordId,
          discussTime: discussForm.discussTime,
          location: discussForm.location,
          phase: discussForm.phase || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("✅ 记录已更新");
        setEditModal(null);
        setDiscussForm({ discussTime: "", location: "", phase: "" });
        loadGroups();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 更新失败");
    }
  };

  // 获取当前应该完成的阶段
  const getCurrentPhase = () => {
    const day = new Date().getDate();
    if (day <= 10) return "early";
    if (day <= 20) return "mid";
    return "late";
  };

  // 检查某阶段是否已完成
  const isPhaseCompleted = (group: DiscussionGroup, phase: string) => {
    return group.records.some((r) => r.phase === phase);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  const currentPhase = getCurrentPhase();
  const myId = session?.user?.id;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">讨论中心</h1>
        <p className="text-gray-600 mt-1">三阶段讨论：月初+3甲骨、月中+1甲骨、月末+0甲骨</p>
      </div>

      {/* 全局消息 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2 text-gray-400">×</button>
        </div>
      )}

      {/* 讨论进度说明 */}
      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4">
            {["early", "mid", "late"].map((phase) => (
              <div
                key={phase}
                className={`text-center p-3 rounded-lg ${currentPhase === phase ? "bg-indigo-600 text-white" : "bg-white text-gray-600"}`}
              >
                <div className="font-medium text-sm">
                  {phase === "early" ? "月初" : phase === "mid" ? "月中" : "月末"}
                </div>
                <div className="text-lg font-bold mt-1">
                  +{phase === "early" ? "3" : phase === "mid" ? "1" : "0"}
                </div>
                <div className="text-xs mt-0.5">甲骨</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 我的讨论组 */}
      {groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => {
            const isMyGroup = group.userAInfo.id === myId || group.userBInfo.id === myId;
            const partner =
              group.userAInfo.id === myId ? group.userBInfo : group.userAInfo;

            return (
              <Card key={group.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        《{group.book.title}》 — {group.book.author}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {group.bookList && (
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                            第{group.bookList.period}期 · {group.bookList.month}
                          </span>
                        )}
                        <span className="text-sm text-gray-500">搭档：{partner.nickname}</span>
                      </div>
                    </div>
                    <Badge variant={STATUS_CONFIG[group.status]?.variant || "secondary"}>
                      {STATUS_CONFIG[group.status]?.label || group.status}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  {/* 三阶段进度 */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {["early", "mid", "late"].map((phase) => {
                      const completed = isPhaseCompleted(group, phase);
                      const isCurrent = currentPhase === phase;

                      return (
                        <div
                          key={phase}
                          className={`flex flex-col items-center p-3 rounded-lg border ${
                            completed
                              ? "border-green-300 bg-green-50"
                              : isCurrent
                              ? "border-indigo-300 bg-indigo-50"
                              : "border-gray-200 bg-gray-50"
                          }`}
                        >
                          {completed ? (
                            <CheckCircle className="h-6 w-6 text-green-500 mb-1" />
                          ) : isCurrent ? (
                            <Clock className="h-6 w-6 text-indigo-500 mb-1" />
                          ) : (
                            <div className="h-6 w-6 border-2 border-gray-300 rounded-full mb-1" />
                          )}
                          <div className="text-xs font-medium text-center">
                            {phase === "early" ? "月初" : phase === "mid" ? "月中" : "月末"}
                          </div>
                          {completed && (
                            <div className="text-xs text-green-600 mt-0.5">已完成</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 提交讨论按钮 */}
                  {group.status === "pending" && isMyGroup && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setSubmitModal(group.id);
                        setDiscussForm({
                          discussTime: new Date().toISOString().slice(0, 16),
                          location: "",
                          phase: currentPhase,
                        });
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      提交讨论记录
                    </Button>
                  )}

                  {/* 讨论记录 */}
                  {group.records.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-sm font-medium text-gray-700 mb-2">讨论记录</div>
                      <div className="space-y-1">
                        {group.records.map((record) => (
                          <div key={record.id} className="flex items-center justify-between text-xs text-gray-500">
                            <div className="flex items-center">
                              <CheckCircle className="h-3 w-3 text-green-500 mr-2 flex-shrink-0" />
                              <span>
                                {record.phase === "early" ? "月初" : record.phase === "mid" ? "月中" : "月末"}讨论 ·{" "}
                                {new Date(record.discussTime).toLocaleDateString("zh-CN")}
                                {record.location && ` · ${record.location}`}
                              </span>
                            </div>
                            {isMyGroup && (
                              <div className="flex items-center gap-2 ml-2">
                                <button
                                  className="text-gray-400 hover:text-indigo-500 transition-colors"
                                  title="编辑记录"
                                  onClick={() => {
                                    setEditModal({ recordId: record.id, groupId: group.id });
                                    setDiscussForm({
                                      discussTime: new Date(record.discussTime).toISOString().slice(0, 16),
                                      location: record.location || "",
                                      phase: record.phase,
                                    });
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                  title="删除记录"
                                  onClick={async () => {
                                    if (!confirm("确认删除该讨论记录？")) return;
                                    const res = await fetch(`/api/discussions?recordId=${record.id}`, { method: "DELETE" });
                                    const data = await res.json();
                                    if (res.ok) { setMessage("✅ 记录已删除"); loadGroups(); }
                                    else setMessage(`❌ ${data.error}`);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-700">暂无讨论组</h3>
            <p className="text-sm text-gray-400 mt-1">选书完成后，管理员会安排讨论分组</p>
          </CardContent>
        </Card>
      )}

      {/* 提交讨论记录模态框 */}
      {submitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>提交讨论记录</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>讨论时间</Label>
                <Input
                  type="datetime-local"
                  value={discussForm.discussTime}
                  onChange={(e) => setDiscussForm((p) => ({ ...p, discussTime: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>讨论地点/方式（可选）</Label>
                <Input
                  placeholder="如：线上视频通话、咖啡厅等"
                  value={discussForm.location}
                  onChange={(e) => setDiscussForm((p) => ({ ...p, location: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>讨论阶段</Label>
                <div className="grid grid-cols-3 gap-2">
                  {["early", "mid", "late"].map((phase) => (
                    <button
                      key={phase}
                      type="button"
                      onClick={() => setDiscussForm((p) => ({ ...p, phase }))}
                      className={`p-2 rounded border text-sm ${
                        discussForm.phase === phase
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200"
                      }`}
                    >
                      {phase === "early" ? "月初" : phase === "mid" ? "月中" : "月末"}
                    </button>
                  ))}
                </div>
              </div>

              {message && (
                <div className={`text-sm ${message.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
                  {message}
                </div>
              )}

              <div className="flex space-x-3">
                <Button className="flex-1" onClick={() => submitDiscussion(submitModal)}>
                  提交
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setSubmitModal(null);
                    setMessage("");
                  }}
                >
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 编辑讨论记录模态框 */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>编辑讨论记录</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>讨论时间</Label>
                <Input
                  type="datetime-local"
                  value={discussForm.discussTime}
                  onChange={(e) => setDiscussForm((p) => ({ ...p, discussTime: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>讨论地点/方式（可选）</Label>
                <Input
                  placeholder="如：线上视频通话、咖啡厅等"
                  value={discussForm.location}
                  onChange={(e) => setDiscussForm((p) => ({ ...p, location: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>讨论阶段</Label>
                <div className="grid grid-cols-3 gap-2">
                  {["early", "mid", "late"].map((phase) => (
                    <button
                      key={phase}
                      type="button"
                      onClick={() => setDiscussForm((p) => ({ ...p, phase }))}
                      className={`p-2 rounded border text-sm ${
                        discussForm.phase === phase
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-gray-200"
                      }`}
                    >
                      {phase === "early" ? "月初" : phase === "mid" ? "月中" : "月末"}
                    </button>
                  ))}
                </div>
              </div>

              {message && (
                <div className={`text-sm ${message.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
                  {message}
                </div>
              )}

              <div className="flex space-x-3">
                <Button className="flex-1" onClick={saveEditDiscussion}>
                  保存
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setEditModal(null);
                    setMessage("");
                  }}
                >
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
