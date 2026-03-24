/**
 * app/(auth)/register/page.tsx
 * 注册页面
 * 支持邮箱+密码注册，需要邀请码激活
 * 昵称规则：≤7字，不含表情符号
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 注册页组件
 */
export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    nickname: "",
    inviteCode: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateForm = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  /**
   * 处理注册表单提交
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 客户端验证
    if (formData.password !== formData.confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (formData.password.length < 8) {
      setError("密码长度不能少于8位");
      return;
    }

    if (formData.nickname.length > 7) {
      setError("昵称不能超过7个字符");
      return;
    }

    if (!formData.inviteCode) {
      setError("请输入邀请码");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          nickname: formData.nickname,
          inviteCode: formData.inviteCode.toUpperCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "注册失败");
        return;
      }

      setSuccess(true);
      // 3秒后跳转到登录页
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">注册成功！</h2>
            <p className="text-gray-600 mb-4">欢迎加入白夜读书会，正在跳转到登录页...</p>
            <Link href="/login">
              <Button className="w-full">立即登录</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-indigo-600 p-3 rounded-full">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">加入白夜读书会</CardTitle>
          <CardDescription>使用邀请码注册您的账号</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 错误提示 */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {/* 邀请码 */}
            <div className="space-y-2">
              <Label htmlFor="inviteCode">邀请码</Label>
              <Input
                id="inviteCode"
                type="text"
                placeholder="请输入邀请码"
                value={formData.inviteCode}
                onChange={(e) => updateForm("inviteCode", e.target.value.toUpperCase())}
                required
                disabled={loading}
                className="uppercase"
              />
              <p className="text-xs text-gray-500">向社群管理员获取邀请码</p>
            </div>

            {/* 昵称 */}
            <div className="space-y-2">
              <Label htmlFor="nickname">
                昵称
                <span className="text-gray-400 font-normal ml-2">（≤7字，不含表情）</span>
              </Label>
              <Input
                id="nickname"
                type="text"
                placeholder="请输入昵称（7字以内）"
                value={formData.nickname}
                onChange={(e) => updateForm("nickname", e.target.value)}
                required
                disabled={loading}
                maxLength={7}
              />
              <p className="text-xs text-gray-400 text-right">
                {formData.nickname.length}/7
              </p>
            </div>

            {/* 邮箱 */}
            <div className="space-y-2">
              <Label htmlFor="email">邮箱地址</Label>
              <Input
                id="email"
                type="email"
                placeholder="请输入邮箱"
                value={formData.email}
                onChange={(e) => updateForm("email", e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* 密码 */}
            <div className="space-y-2">
              <Label htmlFor="password">密码（至少8位）</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入密码"
                  value={formData.password}
                  onChange={(e) => updateForm("password", e.target.value)}
                  required
                  disabled={loading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 确认密码 */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认密码</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="请再次输入密码"
                value={formData.confirmPassword}
                onChange={(e) => updateForm("confirmPassword", e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* 注册按钮 */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册账号"}
            </Button>

            {/* 登录链接 */}
            <div className="text-center text-sm text-gray-600">
              已有账号？{" "}
              <Link href="/login" className="text-indigo-600 hover:underline font-medium">
                立即登录
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
