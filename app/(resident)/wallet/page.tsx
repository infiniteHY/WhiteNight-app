/**
 * app/(resident)/wallet/page.tsx
 * 甲骨钱包页面
 * 显示甲骨余额、流水记录和获取方式说明
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  reason: string;
  createdAt: string;
}

interface JiaguData {
  user: {
    nickname: string;
    jiaguBalance: number;
  };
  transactions: Transaction[];
  total: number;
  stats: {
    monthEarn: number;
    monthSpend: number;
  };
}

/**
 * 甲骨钱包页面
 */
export default function WalletPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<JiaguData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, earn, spend
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadWalletData();
  }, [filter, page]);

  const loadWalletData = async () => {
    try {
      const typeParam = filter !== "all" ? `&type=${filter}` : "";
      const res = await fetch(`/api/jiagu?page=${page}&pageSize=20${typeParam}`);
      const walletData = await res.json();
      setData(walletData);
    } catch (error) {
      console.error("加载钱包数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  const balance = data?.user?.jiaguBalance ?? session?.user?.jiaguBalance ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">甲骨钱包</h1>
        <p className="text-gray-600 mt-1">查看您的甲骨余额和完整流水记录</p>
      </div>

      {/* 余额卡片 */}
      <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-xl p-6 text-white">
        <div className="flex items-center space-x-3 mb-4">
          <div className="bg-white/20 p-2 rounded-lg">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <div className="text-white/80 text-sm">当前余额</div>
            <div className="text-3xl font-bold">💎 {balance}</div>
          </div>
        </div>

        {balance < 0 && (
          <div className="bg-red-500/30 rounded-lg p-3 text-sm">
            ⚠️ 余额为负，存在被清退风险！请及时参与活动补充甲骨。
          </div>
        )}
      </div>

      {/* 本月统计 */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center space-x-2 mb-1">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-sm text-gray-600">本月获得</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              +{data?.stats?.monthEarn || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center space-x-2 mb-1">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <span className="text-sm text-gray-600">本月消耗</span>
            </div>
            <div className="text-2xl font-bold text-red-500">
              -{data?.stats?.monthSpend || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 甲骨获取规则 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">甲骨获取规则</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {[
              { icon: "📖", label: "月初完成讨论", value: "+3" },
              { icon: "📖", label: "月中完成讨论", value: "+1" },
              { icon: "📖", label: "月末完成讨论", value: "+0" },
              { icon: "📝", label: "读书笔记≥1000字", value: "+5" },
              { icon: "🎯", label: "发起简单任务", value: "+1" },
              { icon: "🎯", label: "参与简单任务", value: "+1" },
              { icon: "🎤", label: "发起分享任务", value: "+2" },
              { icon: "🎤", label: "参与分享任务", value: "+1" },
              { icon: "⚠️", label: "讨论违约（第1次）", value: "-5" },
              { icon: "⚠️", label: "讨论违约（第2次）", value: "-10" },
              { icon: "✏️", label: "改名消耗", value: "-10" },
              { icon: "🃏", label: "使用黑箱卡", value: "-10" },
            ].map((rule, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center space-x-2">
                  <span>{rule.icon}</span>
                  <span className="text-gray-700">{rule.label}</span>
                </div>
                <span className={`font-bold ${rule.value.startsWith("+") ? "text-green-600" : "text-red-500"}`}>
                  {rule.value}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 流水记录 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">流水记录</CardTitle>
            <div className="flex space-x-2">
              {["all", "earn", "spend"].map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(1); }}
                  className={`px-3 py-1 rounded-full text-sm ${
                    filter === f
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {f === "all" ? "全部" : f === "earn" ? "收入" : "支出"}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data?.transactions && data.transactions.length > 0 ? (
            <div className="space-y-2">
              {data.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${tx.type === "earn" ? "bg-green-100" : "bg-red-100"}`}>
                      {tx.type === "earn" ? (
                        <ArrowUpRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">{tx.reason}</div>
                      <div className="text-xs text-gray-400">{formatDateTime(tx.createdAt)}</div>
                    </div>
                  </div>
                  <div className={`font-bold ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount}
                  </div>
                </div>
              ))}

              {/* 分页 */}
              {data.total > 20 && (
                <div className="flex justify-center space-x-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    上一页
                  </Button>
                  <span className="py-2 px-3 text-sm text-gray-600">
                    第{page}页 / 共{Math.ceil(data.total / 20)}页
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(data.total / 20)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              暂无流水记录
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
