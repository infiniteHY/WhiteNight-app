/**
 * app/(resident)/tasks/page.tsx
 * 任务广场页面
 * 显示简单任务、分享任务、赏金任务
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Plus, Users, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

type TaskType = "simple" | "share" | "bounty";

interface Task {
  id: string;
  type: string;
  title: string;
  description?: string;
  startTime?: string;
  duration?: number;
  deadline?: string;
  status: string;
  createdAt: string;
  creatorId: string;
  creator: { id: string; nickname: string };
  participants: { id: string; nickname: string }[];
  participantCount?: number;
  hasJoined?: boolean;
}

interface BountyTask {
  id: string;
  description: string;
  rewardPerPerson: number;
  maxParticipants: number;
  deadline?: string;
  status: string;
  createdAt: string;
  creatorId: string;
  creator: { id: string; nickname: string };
  participants: { id: string; nickname: string }[];
  hasJoined: boolean;
}

const TASK_TYPES = [
  { key: "simple", label: "简单任务", desc: "≥1小时，≥5人，发起/参与各+1甲骨（结算时发放）" },
  { key: "share", label: "分享任务", desc: "发起+2甲骨，参与+1甲骨，每半小时叠加（结算时发放）" },
  { key: "bounty", label: "赏金任务", desc: "设定人数和每人赏金，截止后结算" },
];

export default function TasksPage() {
  const { data: session } = useSession();
  const [activeType, setActiveType] = useState<TaskType>("simple");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bountyTasks, setBountyTasks] = useState<BountyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editTarget, setEditTarget] = useState<BountyTask | null>(null);
  const [editTaskTarget, setEditTaskTarget] = useState<Task | null>(null);
  const [message, setMessage] = useState("");

  const emptyForm = { title: "", description: "", rewardPerPerson: "", maxParticipants: "", startTime: "", duration: "", deadline: "" };
  const [createForm, setCreateForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState({ title: "", description: "", rewardPerPerson: "", maxParticipants: "", deadline: "" });
  const [editTaskForm, setEditTaskForm] = useState({ title: "", description: "", startTime: "", duration: "", deadline: "" });

  useEffect(() => {
    loadTasks();
  }, [activeType]);

  const safeJson = async (res: Response) => {
    try { const t = await res.text(); return t ? JSON.parse(t) : {}; }
    catch { return {}; }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      if (activeType === "bounty") {
        const res = await fetch("/api/tasks?type=bounty");
        const data = await safeJson(res);
        setBountyTasks(data.tasks || []);
      } else {
        const res = await fetch(`/api/tasks?type=${activeType}`);
        const data = await safeJson(res);
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error("加载任务失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTask = async (taskId: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action: "join" }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setMessage(`✅ ${data.message}`);
        loadTasks();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 操作失败");
    }
  };

  const handleSettleTask = async (taskId: string) => {
    if (!confirm("确认结算？将为所有参与者（含发起人）发放甲骨奖励。")) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action: "settleTask" }),
      });
      const data = await safeJson(res);
      if (res.ok) { setMessage(`✅ ${data.message}`); loadTasks(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ 操作失败"); }
  };

  const handleEditTask = async () => {
    if (!editTaskTarget) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editTask", taskId: editTaskTarget.id, ...editTaskForm }),
      });
      const data = await safeJson(res);
      if (res.ok) { setMessage("✅ 任务已更新"); setEditTaskTarget(null); loadTasks(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ 操作失败"); }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("确认删除该任务？")) return;
    try {
      const res = await fetch(`/api/tasks?taskId=${taskId}`, { method: "DELETE" });
      const data = await safeJson(res);
      if (res.ok) { setMessage("✅ 任务已删除"); loadTasks(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ 操作失败"); }
  };

  const handleAcceptBounty = async (bountyTaskId: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bountyTaskId, action: "joinBounty" }),
      });
      const data = await safeJson(res);
      if (res.ok) { setMessage("✅ 已接取赏金任务"); loadTasks(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ 操作失败"); }
  };

  const handleSettleBounty = async (bountyTaskId: string) => {
    if (!confirm("确认结算？将按实际参与人数从您的甲骨中扣除，并发放奖励给参与者。")) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bountyTaskId, action: "settleBounty" }),
      });
      const data = await safeJson(res);
      if (res.ok) { setMessage(`✅ ${data.message}`); loadTasks(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ 操作失败"); }
  };

  const handleEditBounty = async () => {
    if (!editTarget) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "editBounty", bountyTaskId: editTarget.id, ...editForm }),
      });
      const data = await safeJson(res);
      if (res.ok) { setMessage("✅ 任务已更新"); setEditTarget(null); loadTasks(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ 操作失败"); }
  };

  const handleDeleteBounty = async (bountyTaskId: string) => {
    if (!confirm("确认删除该赏金任务？")) return;
    try {
      const res = await fetch(`/api/tasks?bountyTaskId=${bountyTaskId}`, { method: "DELETE" });
      const data = await safeJson(res);
      if (res.ok) { setMessage("✅ 任务已删除"); loadTasks(); }
      else setMessage(`❌ ${data.error}`);
    } catch { setMessage("❌ 操作失败"); }
  };

  const handleCreateTask = async () => {
    try {
      const body: Record<string, unknown> = {
        type: activeType,
        title: createForm.title,
        description: createForm.description,
      };

      if (activeType === "bounty") {
        body.rewardPerPerson = parseInt(createForm.rewardPerPerson);
        body.maxParticipants = parseInt(createForm.maxParticipants);
        if (createForm.deadline) body.deadline = createForm.deadline;
      } else {
        if (createForm.startTime) body.startTime = createForm.startTime;
        if (createForm.duration) body.duration = parseInt(createForm.duration);
        if (createForm.deadline) body.deadline = createForm.deadline;
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await safeJson(res);
      if (res.ok) {
        setMessage("✅ 任务发布成功！");
        setShowCreateForm(false);
        setCreateForm(emptyForm);
        loadTasks();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 发布失败");
    }
  };

  const currentUserId = session?.user?.id;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">任务广场</h1>
          <p className="text-gray-600 mt-1">参与任务，获取甲骨奖励</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          发布任务
        </Button>
      </div>

      {/* 全局消息 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2 text-gray-400">×</button>
        </div>
      )}

      {/* 任务类型 Tab */}
      <div className="grid grid-cols-3 gap-3">
        {TASK_TYPES.map((type) => (
          <button
            key={type.key}
            onClick={() => setActiveType(type.key as TaskType)}
            className={`p-3 rounded-lg border text-left transition-colors ${
              activeType === type.key
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className={`font-medium text-sm ${activeType === type.key ? "text-indigo-700" : "text-gray-700"}`}>
              {type.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{type.desc}</div>
          </button>
        ))}
      </div>

      {/* 创建任务表单 */}
      {showCreateForm && (
        <Card className="border-indigo-200">
          <CardHeader>
            <CardTitle>发布{TASK_TYPES.find((t) => t.key === activeType)?.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>任务标题 *</Label>
              <Input
                value={createForm.title}
                onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="请输入任务标题"
              />
            </div>

            <div>
              <Label>任务描述</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="详细说明任务内容..."
                rows={3}
              />
            </div>

            {activeType === "bounty" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>可参与人数 *</Label>
                    <Input
                      type="number" min="1"
                      placeholder="如：3"
                      value={createForm.maxParticipants}
                      onChange={(e) => setCreateForm((p) => ({ ...p, maxParticipants: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>每人税前甲骨 *</Label>
                    <Input
                      type="number" min="1"
                      placeholder="如：5"
                      value={createForm.rewardPerPerson}
                      onChange={(e) => setCreateForm((p) => ({ ...p, rewardPerPerson: e.target.value }))}
                    />
                  </div>
                </div>
                {createForm.maxParticipants && createForm.rewardPerPerson && (
                  <p className="text-xs text-gray-500">
                    预计最大支出：{parseInt(createForm.maxParticipants) * parseInt(createForm.rewardPerPerson)} 甲骨，
                    每人实得：{Math.floor(parseInt(createForm.rewardPerPerson) * 0.8)} 甲骨（税后80%）
                  </p>
                )}
                <div>
                  <Label>截止时间（可选）</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.deadline}
                    onChange={(e) => setCreateForm((p) => ({ ...p, deadline: e.target.value }))}
                  />
                </div>
              </>
            )}

            {activeType !== "bounty" && (
              <>
                <div>
                  <Label>开始时间</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm((p) => ({ ...p, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>预计时长（分钟，简单任务≥60）</Label>
                  <Input
                    type="number"
                    min={activeType === "simple" ? "60" : "30"}
                    value={createForm.duration}
                    onChange={(e) => setCreateForm((p) => ({ ...p, duration: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>截止时间（可选）</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.deadline}
                    onChange={(e) => setCreateForm((p) => ({ ...p, deadline: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="flex space-x-3">
              <Button onClick={handleCreateTask}>发布</Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 任务列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : activeType === "bounty" ? (
        <div className="space-y-4">
          {bountyTasks.length > 0 ? (
            bountyTasks.map((task) => {
              const isCreator = task.creatorId === currentUserId;
              const isFull = task.participants.length >= task.maxParticipants;
              const isSettled = task.status === "settled";
              const perPersonNet = Math.floor(task.rewardPerPerson * 0.8);

              return (
                <Card key={task.id} className={isSettled ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className="font-medium">{task.description.split("\n")[0]}</span>
                          <Badge variant={isSettled ? "secondary" : isFull ? "outline" : "warning"} className="text-xs">
                            {isSettled ? "已结算" : isFull ? "名额已满" : "招募中"}
                          </Badge>
                          <span className="text-xs text-amber-600 font-medium">
                            💎 {task.rewardPerPerson}甲骨/人（到手{perPersonNet}）
                          </span>
                        </div>
                        {task.description.split("\n")[1] && (
                          <p className="text-sm text-gray-600 mb-2">{task.description.split("\n").slice(1).join("\n")}</p>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                          <span>发布：{task.creator.nickname}</span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {task.participants.length}/{task.maxParticipants} 人
                          </span>
                          {task.deadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              截止：{formatDateTime(task.deadline)}
                            </span>
                          )}
                        </div>
                        {task.participants.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {task.participants.map(p => (
                              <span key={p?.id} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs">
                                {p?.nickname}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                        {!isSettled && !isCreator && !task.hasJoined && !isFull && (
                          <Button size="sm" onClick={() => handleAcceptBounty(task.id)}>接取</Button>
                        )}
                        {!isSettled && !isCreator && task.hasJoined && (
                          <Badge variant="success" className="text-xs">已接取</Badge>
                        )}
                        {isCreator && !isSettled && (
                          <Button size="sm" variant="outline" onClick={() => handleSettleBounty(task.id)}>结算</Button>
                        )}
                        {isCreator && !isSettled && (
                          <Button size="sm" variant="outline" onClick={() => {
                            const lines = task.description.split("\n");
                            setEditTarget(task);
                            setEditForm({
                              title: lines[0] || "",
                              description: lines.slice(1).join("\n"),
                              rewardPerPerson: String(task.rewardPerPerson),
                              maxParticipants: String(task.maxParticipants),
                              deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "",
                            });
                          }}>编辑</Button>
                        )}
                        {isCreator && !isSettled && (
                          <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => handleDeleteBounty(task.id)}>删除</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-gray-400">暂无赏金任务</CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.length > 0 ? (
            tasks.map((task) => {
              const isCreator = task.creatorId === currentUserId;
              const isSettled = task.status === "settled";

              return (
                <Card key={task.id} className={isSettled ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2 mb-1">
                          <span className="font-medium">{task.title}</span>
                          <Badge variant={isSettled ? "secondary" : task.type === "simple" ? "outline" : "default"}>
                            {isSettled ? "已结算" : task.type === "simple" ? "简单" : "分享"}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                          <span>发起：{task.creator.nickname}</span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {task.participantCount}人参与
                          </span>
                          {task.startTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDateTime(task.startTime)}
                            </span>
                          )}
                          {task.duration && <span>{task.duration}分钟</span>}
                          {task.deadline && (
                            <span>截止：{formatDateTime(task.deadline)}</span>
                          )}
                        </div>
                        {task.participants && task.participants.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {task.participants.map(p => (
                              <span key={p?.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                                {p?.nickname}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                        {!isSettled && !isCreator && !task.hasJoined && (
                          <Button size="sm" onClick={() => handleJoinTask(task.id)}>参与</Button>
                        )}
                        {!isSettled && !isCreator && task.hasJoined && (
                          <Badge variant="success" className="text-xs">已参与</Badge>
                        )}
                        {isCreator && !isSettled && (
                          <Button size="sm" variant="outline" onClick={() => handleSettleTask(task.id)}>结算</Button>
                        )}
                        {isCreator && !isSettled && (
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditTaskTarget(task);
                            setEditTaskForm({
                              title: task.title,
                              description: task.description || "",
                              startTime: task.startTime ? new Date(task.startTime).toISOString().slice(0, 16) : "",
                              duration: task.duration ? String(task.duration) : "",
                              deadline: task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : "",
                            });
                          }}>编辑</Button>
                        )}
                        {isCreator && !isSettled && (
                          <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50"
                            onClick={() => handleDeleteTask(task.id)}>删除</Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-gray-400">
                暂无{TASK_TYPES.find((t) => t.key === activeType)?.label}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 编辑简单/分享任务模态框 */}
      {editTaskTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold">编辑{editTaskTarget.type === "simple" ? "简单" : "分享"}任务</h2>
            <div>
              <Label>任务标题 *</Label>
              <Input
                value={editTaskForm.title}
                onChange={(e) => setEditTaskForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <Label>任务描述</Label>
              <Textarea
                value={editTaskForm.description}
                onChange={(e) => setEditTaskForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <Label>开始时间</Label>
              <Input
                type="datetime-local"
                value={editTaskForm.startTime}
                onChange={(e) => setEditTaskForm((p) => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div>
              <Label>时长（分钟）</Label>
              <Input
                type="number"
                value={editTaskForm.duration}
                onChange={(e) => setEditTaskForm((p) => ({ ...p, duration: e.target.value }))}
              />
            </div>
            <div>
              <Label>截止时间</Label>
              <Input
                type="datetime-local"
                value={editTaskForm.deadline}
                onChange={(e) => setEditTaskForm((p) => ({ ...p, deadline: e.target.value }))}
              />
            </div>
            <div className="flex space-x-3 pt-2">
              <Button onClick={handleEditTask}>保存</Button>
              <Button variant="outline" onClick={() => setEditTaskTarget(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑赏金任务模态框 */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md space-y-4 p-6">
            <h2 className="text-lg font-semibold">编辑赏金任务</h2>
            <div>
              <Label>任务标题 *</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <Label>任务描述</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>可参与人数 *</Label>
                <Input
                  type="number" min="1"
                  value={editForm.maxParticipants}
                  onChange={(e) => setEditForm((p) => ({ ...p, maxParticipants: e.target.value }))}
                />
              </div>
              <div>
                <Label>每人税前甲骨 *</Label>
                <Input
                  type="number" min="1"
                  value={editForm.rewardPerPerson}
                  onChange={(e) => setEditForm((p) => ({ ...p, rewardPerPerson: e.target.value }))}
                />
              </div>
            </div>
            {editForm.maxParticipants && editForm.rewardPerPerson && (
              <p className="text-xs text-gray-500">
                预计最大支出：{parseInt(editForm.maxParticipants) * parseInt(editForm.rewardPerPerson)} 甲骨，
                每人实得：{Math.floor(parseInt(editForm.rewardPerPerson) * 0.8)} 甲骨（税后80%）
              </p>
            )}
            <div>
              <Label>截止时间（可选）</Label>
              <Input
                type="datetime-local"
                value={editForm.deadline}
                onChange={(e) => setEditForm((p) => ({ ...p, deadline: e.target.value }))}
              />
            </div>
            <div className="flex space-x-3 pt-2">
              <Button onClick={handleEditBounty}>保存</Button>
              <Button variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
