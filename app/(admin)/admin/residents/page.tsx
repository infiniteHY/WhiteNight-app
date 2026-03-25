/**
 * app/(admin)/admin/residents/page.tsx
 * 居民管理页面（群主专用）
 * 支持查看居民列表、调整状态、创建邀请码
 */

"use client";

import { useState, useEffect } from "react";
import { Search, UserX, UserCheck, Key, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ROLE_NAMES, formatDate } from "@/lib/utils";

interface User {
  id: string;
  email: string;
  nickname: string;
  role: string;
  status: string;
  jiaguBalance: number;
  joinDate: string;
  blacklistUntil?: string;
}

interface InviteCode {
  id: string;
  code: string;
  usedBy?: string;
  usedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
  active: { label: "正常", variant: "success" },
  expelled: { label: "已清退", variant: "destructive" },
  blacklisted: { label: "黑名单", variant: "warning" },
};

/**
 * 居民管理页面
 */
export default function AdminResidentsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<"users" | "invites">("users");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionForm, setActionForm] = useState({
    action: "",
    value: "",
    reason: "",
  });
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");

  useEffect(() => {
    loadData();
  }, [searchTerm, filterStatus, page]);

  const loadData = async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
      });
      if (searchTerm) params.set("search", searchTerm);
      if (filterStatus) params.set("status", filterStatus);

      const [usersRes, invitesRes] = await Promise.all([
        fetch(`/api/users?${params}`),
        fetch("/api/invite"),
      ]);

      const [usersData, invitesData] = await Promise.all([
        usersRes.json(),
        invitesRes.json(),
      ]);

      setUsers(usersData.users || []);
      setTotal(usersData.total || 0);
      setInvites(invitesData.invites || []);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async () => {
    if (!selectedUser || !actionForm.action) return;

    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          action: actionForm.action,
          value: actionForm.value,
          reason: actionForm.reason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ 操作成功：${data.message}`);
        setSelectedUser(null);
        setActionForm({ action: "", value: "", reason: "" });
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 操作失败");
    }
  };

  const createInviteCode = async () => {
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresAt: inviteExpiresAt || undefined }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ 邀请码已创建：${data.invite.code}`);
        setInviteExpiresAt("");
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 创建失败");
    }
  };

  const deleteInviteCode = async (id: string) => {
    if (!confirm("确认删除该邀请码？")) return;
    try {
      const res = await fetch(`/api/invite?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage("✅ 邀请码已删除");
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 删除失败");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">居民管理</h1>
        <p className="text-gray-600 mt-1">管理社群成员和邀请码</p>
      </div>

      {/* 全局消息 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {/* Tab */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === "users" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500"}`}
        >
          居民列表 ({total})
        </button>
        <button
          onClick={() => setActiveTab("invites")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === "invites" ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500"}`}
        >
          邀请码管理
        </button>
      </div>

      {activeTab === "users" ? (
        <div className="space-y-4">
          {/* 搜索过滤 */}
          <div className="flex space-x-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="搜索昵称或邮箱..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            >
              <option value="">全部状态</option>
              <option value="active">正常</option>
              <option value="expelled">已清退</option>
              <option value="blacklisted">黑名单</option>
            </select>
          </div>

          {/* 用户表格 */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">昵称</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">角色</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">状态</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">甲骨</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">加入时间</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{user.nickname}</div>
                        <div className="text-xs text-gray-400">{user.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ROLE_NAMES[user.role] || user.role}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_CONFIG[user.status]?.variant || "secondary"}>
                          {STATUS_CONFIG[user.status]?.label || user.status}
                        </Badge>
                      </td>
                      <td className={`px-4 py-3 text-right font-bold ${user.jiaguBalance < 0 ? "text-red-500" : "text-gray-800"}`}>
                        {user.jiaguBalance}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {formatDate(user.joinDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedUser(user)}
                        >
                          管理
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {users.length === 0 && (
                <div className="py-8 text-center text-gray-400">暂无用户</div>
              )}
            </CardContent>
          </Card>

          {/* 分页 */}
          {total > 20 && (
            <div className="flex justify-center space-x-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <span className="py-2 text-sm text-gray-600">第{page}页 / 共{Math.ceil(total / 20)}页</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)}>
                下一页
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-end gap-3 justify-end">
            <div>
              <Label className="text-xs text-gray-500">过期时间（可选）</Label>
              <Input
                type="datetime-local"
                value={inviteExpiresAt}
                onChange={(e) => setInviteExpiresAt(e.target.value)}
                className="w-48 text-sm"
              />
            </div>
            <Button onClick={createInviteCode}>
              <Key className="h-4 w-4 mr-2" />
              生成邀请码
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">邀请码</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">状态</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">使用时间</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">过期时间</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">创建时间</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.map((invite) => (
                    <tr key={invite.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <code className="bg-gray-100 px-2 py-0.5 rounded text-indigo-700 font-mono">
                          {invite.code}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={invite.usedBy ? "secondary" : "success"}>
                          {invite.usedBy ? "已使用" : "可用"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {invite.usedAt ? formatDate(invite.usedAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {invite.expiresAt ? formatDate(invite.expiresAt) : "永久"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {formatDate(invite.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!invite.usedBy && (
                          <button
                            onClick={() => deleteInviteCode(invite.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors text-xs"
                            title="删除邀请码"
                          >
                            删除
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 用户管理模态框 */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>管理用户：{selectedUser.nickname}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-gray-500">当前角色</div>
                <div>{ROLE_NAMES[selectedUser.role]}</div>
                <div className="text-gray-500">当前状态</div>
                <div>{STATUS_CONFIG[selectedUser.status]?.label}</div>
                <div className="text-gray-500">甲骨余额</div>
                <div className={selectedUser.jiaguBalance < 0 ? "text-red-500" : ""}>{selectedUser.jiaguBalance}</div>
              </div>

              <div className="space-y-2">
                <Label>操作</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={actionForm.action}
                  onChange={(e) => setActionForm((p) => ({ ...p, action: e.target.value }))}
                >
                  <option value="">请选择操作...</option>
                  <option value="expel">清退用户</option>
                  <option value="blacklist">加入黑名单</option>
                  <option value="restore">恢复账号</option>
                  <option value="changeRole">修改角色</option>
                  <option value="adjustJiagu">调整甲骨</option>
                </select>
              </div>

              {actionForm.action === "changeRole" && (
                <div className="space-y-2">
                  <Label>新角色</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={actionForm.value}
                    onChange={(e) => setActionForm((p) => ({ ...p, value: e.target.value }))}
                  >
                    <option value="">请选择...</option>
                    <option value="booklist_npc">书单岗NPC</option>
                    <option value="stats_npc">统计岗NPC</option>
                    <option value="npc">普通NPC</option>
                    <option value="resident">普通居民</option>
                    <option value="temp_reader">临时领读员</option>
                  </select>
                </div>
              )}

              {actionForm.action === "adjustJiagu" && (
                <div className="space-y-2">
                  <Label>调整数量（正数/负数）</Label>
                  <Input
                    type="number"
                    value={actionForm.value}
                    onChange={(e) => setActionForm((p) => ({ ...p, value: e.target.value }))}
                    placeholder="例：+50 或 -10"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>原因说明</Label>
                <Input
                  value={actionForm.reason}
                  onChange={(e) => setActionForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="请说明操作原因..."
                />
              </div>

              <div className="flex space-x-3">
                <Button onClick={handleUserAction} disabled={!actionForm.action}>确认操作</Button>
                <Button variant="outline" onClick={() => setSelectedUser(null)}>取消</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
