/**
 * app/(admin)/admin/jiagu/page.tsx
 * 甲骨管理页面（管理员专用）
 * 查看甲骨流通情况，手动调整甲骨
 */

"use client";

import { useState, useEffect } from "react";
import { Wallet, TrendingUp, Search, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

interface UserJiagu {
  id: string;
  nickname: string;
  jiaguBalance: number;
  status: string;
}

interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  reason: string;
  createdAt: string;
  userNickname?: string;
}

/**
 * 甲骨管理页面
 */
export default function AdminJiaguPage() {
  const [users, setUsers] = useState<UserJiagu[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [adjustForm, setAdjustForm] = useState({
    userId: "",
    amount: "",
    reason: "",
  });
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch("/api/users?pageSize=50");
      const data = await res.json();
      setUsers(
        (data.users || []).sort(
          (a: UserJiagu, b: UserJiagu) => b.jiaguBalance - a.jiaguBalance
        )
      );
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjustForm.userId || !adjustForm.amount || !adjustForm.reason) {
      setMessage("❌ 请填写所有字段");
      return;
    }

    try {
      const res = await fetch("/api/jiagu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: adjustForm.userId,
          amount: parseInt(adjustForm.amount),
          reason: adjustForm.reason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`✅ 甲骨调整成功，${data.user.nickname} 新余额：${data.newBalance}`);
        setAdjustForm({ userId: "", amount: "", reason: "" });
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 操作失败");
    }
  };

  const filteredUsers = users.filter(
    (u) => u.nickname.includes(searchTerm) || searchTerm === ""
  );

  const totalPositive = users
    .filter((u) => u.jiaguBalance > 0)
    .reduce((sum, u) => sum + u.jiaguBalance, 0);

  const totalNegative = users.filter((u) => u.jiaguBalance < 0).length;
  const riskUsers = users.filter((u) => u.jiaguBalance < 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">甲骨管理</h1>
        <p className="text-gray-600 mt-1">查看和管理甲骨流通情况</p>
      </div>

      {/* 全局消息 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{totalPositive}</div>
            <div className="text-xs text-gray-500 mt-1">流通甲骨总量</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-700">{users.length}</div>
            <div className="text-xs text-gray-500 mt-1">参与用户数</div>
          </CardContent>
        </Card>
        <Card className={riskUsers.length > 0 ? "border-red-200 bg-red-50" : ""}>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${riskUsers.length > 0 ? "text-red-600" : "text-green-600"}`}>
              {riskUsers.length}
            </div>
            <div className="text-xs text-gray-500 mt-1">清退风险用户</div>
          </CardContent>
        </Card>
      </div>

      {/* 清退风险警告 */}
      {riskUsers.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center space-x-2 mb-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="font-medium text-red-800">以下用户甲骨余额为负，存在清退风险：</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {riskUsers.map((u) => (
                <div key={u.id} className="bg-white rounded px-2 py-1 text-sm border border-red-200">
                  <span className="font-medium">{u.nickname}</span>
                  <span className="text-red-500 ml-2">{u.jiaguBalance}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 甲骨调整 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">手动调整甲骨</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>选择用户</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                value={adjustForm.userId}
                onChange={(e) => setAdjustForm((p) => ({ ...p, userId: e.target.value }))}
              >
                <option value="">请选择用户...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nickname}（当前：{u.jiaguBalance}）
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>调整数量（正数=增加，负数=扣除）</Label>
              <Input
                type="number"
                value={adjustForm.amount}
                onChange={(e) => setAdjustForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="如：+10 或 -5"
                className="mt-1"
              />
            </div>

            <div>
              <Label>调整原因</Label>
              <Input
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="请说明调整原因..."
                className="mt-1"
              />
            </div>

            <Button onClick={handleAdjust} className="w-full">确认调整</Button>
          </CardContent>
        </Card>

        {/* 甲骨排行榜 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">甲骨排行榜</CardTitle>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-9 w-36"
                  placeholder="搜索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredUsers.map((user, index) => (
                <div key={user.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      index === 0 ? "bg-yellow-400 text-white" :
                      index === 1 ? "bg-gray-300 text-white" :
                      index === 2 ? "bg-amber-600 text-white" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{user.nickname}</div>
                      {user.status !== "active" && (
                        <Badge variant="destructive" className="text-xs">
                          {user.status === "expelled" ? "已清退" : "黑名单"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className={`font-bold ${user.jiaguBalance < 0 ? "text-red-500" : "text-amber-600"}`}>
                    💎 {user.jiaguBalance}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
