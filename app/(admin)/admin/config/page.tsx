/**
 * app/(admin)/admin/config/page.tsx
 * 系统配置页面（群主专用）
 * 管理系统参数和全局设置
 */

"use client";

import { useState, useEffect } from "react";
import { Settings, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SystemConfig {
  id: string;
  key: string;
  value: string;
}

const CONFIG_LABELS: Record<string, string> = {
  rename_cost: "改名消耗甲骨数",
  note_min_words: "笔记最低字数（获得奖励）",
  note_reward: "笔记奖励甲骨数",
  discussion_early_reward: "月初讨论奖励",
  discussion_mid_reward: "月中讨论奖励",
  simple_task_monthly_limit: "简单任务月度上限",
  share_task_monthly_limit: "分享任务月度上限",
  share_task_monthly_max: "分享任务月度甲骨上限",
  selection_timeout_penalty: "选书超时扣除甲骨",
  breach_first_penalty: "第1次违约扣除",
  breach_second_penalty: "第2次违约扣除",
  black_box_cost: "黑箱卡消耗",
  black_box_receive: "被黑箱获得",
  dodge_cost: "闪避卡消耗",
  discussion_bye_cost: "讨论拜拜卡消耗",
};

export default function AdminConfigPage() {
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    // 实际应从数据库加载，此处展示默认配置
    const defaultConfigs: SystemConfig[] = Object.entries(CONFIG_LABELS).map(([key]) => ({
      id: key,
      key,
      value: getDefaultValue(key),
    }));

    setConfigs(defaultConfigs);
    const values: Record<string, string> = {};
    defaultConfigs.forEach((c) => { values[c.key] = c.value; });
    setEditValues(values);
    setLoading(false);
  };

  const getDefaultValue = (key: string): string => {
    const defaults: Record<string, string> = {
      rename_cost: "10",
      note_min_words: "1000",
      note_reward: "5",
      discussion_early_reward: "3",
      discussion_mid_reward: "1",
      simple_task_monthly_limit: "5",
      share_task_monthly_limit: "5",
      share_task_monthly_max: "30",
      selection_timeout_penalty: "5",
      breach_first_penalty: "5",
      breach_second_penalty: "10",
      black_box_cost: "10",
      black_box_receive: "8",
      dodge_cost: "10",
      discussion_bye_cost: "8",
    };
    return defaults[key] || "0";
  };

  const saveConfig = async (key: string) => {
    try {
      // 此处模拟保存，实际应调用API
      setMessage(`✅ 配置 "${CONFIG_LABELS[key]}" 已更新为 ${editValues[key]}`);
    } catch {
      setMessage("❌ 保存失败");
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Settings className="h-6 w-6 mr-2" />
          系统配置
        </h1>
        <p className="text-gray-600 mt-1">调整社群运营参数（修改后立即生效）</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2">×</button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">甲骨规则配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {configs.map((config) => (
            <div key={config.key} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-700">
                  {CONFIG_LABELS[config.key] || config.key}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 font-mono">{config.key}</div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <Input
                  type="number"
                  className="w-24 text-center"
                  value={editValues[config.key] || ""}
                  onChange={(e) =>
                    setEditValues((prev) => ({ ...prev, [config.key]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveConfig(config.key)}
                >
                  <Save className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <p className="text-sm text-amber-800">
            ⚠️ 注意：修改系统配置会立即影响所有用户的甲骨计算规则。请在修改前确认规则变更对社群的影响。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
