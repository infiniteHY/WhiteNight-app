/**
 * lib/utils.ts
 * 通用工具函数
 * 包含样式合并、日期格式化等常用工具
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 合并 CSS 类名（Tailwind 友好）
 * @param inputs - 类名列表
 * @returns 合并后的类名字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化日期为中文格式
 * @param date - 日期对象或字符串
 * @returns 格式化的中文日期字符串
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * 格式化日期时间为中文格式
 * @param date - 日期对象或字符串
 * @returns 格式化的中文日期时间字符串
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 格式化相对时间（如：3分钟前）
 * @param date - 日期对象或字符串
 * @returns 相对时间字符串
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;

  return formatDate(d);
}

/**
 * 获取当前月份字符串
 * @returns YYYY-MM 格式
 */
export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 截断文本并添加省略号
 * @param text - 原始文本
 * @param maxLength - 最大长度
 * @returns 截断后的文本
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * 角色名称映射
 */
export const ROLE_NAMES: Record<string, string> = {
  super_admin: "群主",
  booklist_npc: "书单岗NPC",
  stats_npc: "统计岗NPC",
  npc: "普通NPC",
  resident: "普通居民",
  temp_reader: "临时领读员",
};

/**
 * 状态名称映射
 */
export const STATUS_NAMES: Record<string, string> = {
  active: "正常",
  expelled: "已清退",
  blacklisted: "黑名单",
};
