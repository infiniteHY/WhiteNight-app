/**
 * app/(resident)/settings/page.tsx
 * 个人设置页面
 * 支持修改密码、改名（需10甲骨）
 */

"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { User, Key, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ROLE_NAMES } from "@/lib/utils";

/**
 * 个人设置页面
 */
export default function SettingsPage() {
  const { data: session, update } = useSession();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // 改名表单
  const [nicknameForm, setNicknameForm] = useState({ newNickname: "" });

  // 修改密码表单
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleChangeNickname = async () => {
    const { newNickname } = nicknameForm;

    if (!newNickname.trim()) {
      setMessage("❌ 请输入新昵称");
      return;
    }

    if (newNickname.length > 7) {
      setMessage("❌ 昵称不能超过7个字符");
      return;
    }

    const jiaguBalance = session?.user?.jiaguBalance || 0;
    if (jiaguBalance < 10) {
      setMessage("❌ 甲骨余额不足（改名需消耗10甲骨）");
      return;
    }

    setLoading(true);
    try {
      // 调用修改昵称API（此处简化，实际应有专用API）
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session?.user?.id,
          action: "changeNickname",
          value: newNickname,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("✅ 昵称修改成功，已扣除10甲骨");
        setNicknameForm({ newNickname: "" });
        await update(); // 刷新session
      } else {
        setMessage(`❌ ${data.error || "修改失败"}`);
      }
    } catch {
      setMessage("❌ 操作失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    const { currentPassword, newPassword, confirmPassword } = passwordForm;

    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage("❌ 请填写所有密码字段");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("❌ 两次输入的新密码不一致");
      return;
    }

    if (newPassword.length < 8) {
      setMessage("❌ 新密码长度不能少于8位");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage("✅ 密码修改成功");
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        setMessage(`❌ ${data.error || "修改失败"}`);
      }
    } catch {
      setMessage("❌ 操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">个人设置</h1>
        <p className="text-gray-600 mt-1">管理您的账号信息</p>
      </div>

      {/* 全局消息 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2 text-gray-400">×</button>
        </div>
      )}

      {/* 当前账号信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="h-5 w-5 mr-2" />
            账号信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">当前昵称</div>
              <div className="font-medium mt-1">{session?.user?.nickname}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">角色</div>
              <Badge variant="outline" className="mt-1">
                {ROLE_NAMES[session?.user?.role || ""] || "未知"}
              </Badge>
            </div>
            <div>
              <div className="text-sm text-gray-500">邮箱</div>
              <div className="font-medium mt-1 text-sm">{session?.user?.email}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">甲骨余额</div>
              <div className="font-bold text-amber-600 mt-1">
                💎 {session?.user?.jiaguBalance || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 修改昵称 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">修改昵称</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              修改昵称需要消耗 <strong>10甲骨</strong>。昵称要求：≤7字，不含表情符号。
            </div>
          </div>

          <div className="space-y-2">
            <Label>新昵称</Label>
            <Input
              placeholder="请输入新昵称（≤7字）"
              value={nicknameForm.newNickname}
              onChange={(e) => setNicknameForm({ newNickname: e.target.value })}
              maxLength={7}
            />
            <div className="text-right text-xs text-gray-400">
              {nicknameForm.newNickname.length}/7
            </div>
          </div>

          <Button
            onClick={handleChangeNickname}
            disabled={loading || (session?.user?.jiaguBalance || 0) < 10}
          >
            {loading ? "修改中..." : "确认修改（消耗10甲骨）"}
          </Button>
        </CardContent>
      </Card>

      {/* 修改密码 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base">
            <Key className="h-4 w-4 mr-2" />
            修改密码
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>当前密码</Label>
            <Input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>新密码（至少8位）</Label>
            <Input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>确认新密码</Label>
            <Input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
            />
          </div>

          <Button onClick={handleChangePassword} disabled={loading}>
            {loading ? "修改中..." : "修改密码"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
