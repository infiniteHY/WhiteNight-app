/**
 * app/(resident)/booklist/page.tsx
 * 白日梦书单页面
 * - 当期书单：可选书（selection_open 状态，24h 内）
 * - 历史书单：按期展开，显示全部书目及本人选书标记
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { BookOpen, Clock, CheckCircle, Star, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ─────────────────── 类型 ─────────────────── */

interface Book {
  id: string;
  title: string;
  author: string;
  genre?: string;
  wordCount?: number;
  doubanScore?: number;
}

interface BookListItem {
  id: string;
  bookId: string;
  reason: string;
  recommenderName?: string;
  book: Book;
}

interface BookList {
  id: string;
  period: number;
  month: string;
  type: string;
  status: string;
  publishDate?: string;
  books: BookListItem[];
}

/* ─────────────────── 主组件 ─────────────────── */

export default function BookListPage() {
  const { data: session } = useSession();
  const [bookLists, setBookLists] = useState<BookList[]>([]);
  // 全部选书记录（key: bookId, value: bookListId[]）
  const [mySelectionMap, setMySelectionMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  // 当期选书状态
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // 历史书单展开状态
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  /* ════════ 数据加载 ════════ */

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [listsRes, selRes] = await Promise.all([
        fetch("/api/booklists?pageSize=50"),
        fetch("/api/selections"),
      ]);
      const [listsData, selData] = await Promise.all([listsRes.json(), selRes.json()]);

      const lists: BookList[] = listsData.bookLists || [];
      setBookLists(lists);

      // 构建 bookId → [bookListId, ...] 映射
      const map: Record<string, string[]> = {};
      for (const s of (selData.selections || [])) {
        if (!map[s.bookId]) map[s.bookId] = [];
        map[s.bookId].push(s.bookListId);
      }
      setMySelectionMap(map);

      // 默认展开最近 2 期历史书单
      const closed = lists.filter(l => l.status !== "selection_open").slice(0, 2);
      setExpandedIds(new Set(closed.map(l => l.id)));
    } catch (e) {
      console.error("加载失败", e);
    } finally {
      setLoading(false);
    }
  };

  /* ════════ 工具 ════════ */

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  const getDeadline = (publishDate: string) =>
    new Date(new Date(publishDate).getTime() + 24 * 60 * 60 * 1000);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ════════ 当期选书 ════════ */

  const toggleBookSelection = (bookId: string, alreadySelected: boolean) => {
    if (alreadySelected) return;
    setSelectedBooks(prev => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        if (next.size >= 3) { showMsg("最多只能选择 3 本书", false); return prev; }
        next.add(bookId);
      }
      setMessage(null);
      return next;
    });
  };

  const submitSelection = async (listId: string) => {
    if (selectedBooks.size === 0) { showMsg("请至少选择 1 本书", false); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookListId: listId, bookIds: Array.from(selectedBooks) }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(data.message, true);
        setSelectedBooks(new Set());
        loadAll();
      } else {
        showMsg(data.error, false);
      }
    } catch {
      showMsg("提交失败，请稍后重试", false);
    } finally {
      setSubmitting(false);
    }
  };

  /* ════════ 渲染 ════════ */

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">加载中...</div>;
  }

  const openList = bookLists.find(l => l.status === "selection_open");
  const historyLists = bookLists.filter(l => l.status !== "selection_open");

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">白日梦书单</h1>
        <p className="text-gray-500 text-sm mt-0.5">每月 20 号发布，发布后 24 小时内选书</p>
      </div>

      {/* 全局消息 */}
      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between border
          ${message.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          <span>{message.ok ? "✅" : "❌"} {message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-3 text-gray-400">×</button>
        </div>
      )}

      {/* ── 当期书单（选书中） ── */}
      {openList ? (
        <Card className="border-indigo-200 shadow-sm">
          <CardHeader className="bg-indigo-50 rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                第 {openList.period} 期白日梦书单
                <Badge variant="success" className="ml-2">选书中</Badge>
              </CardTitle>
              <span className="text-sm text-gray-500">{openList.month}</span>
            </div>
            {openList.publishDate && (
              <div className="flex items-center text-sm text-amber-600 mt-1">
                <Clock className="h-4 w-4 mr-1" />
                截止：{getDeadline(openList.publishDate).toLocaleString("zh-CN")}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-5">
            {/* 已选提示 */}
            {(() => {
              const alreadyCount = openList.books.filter(b => mySelectionMap[b.bookId]?.includes(openList.id)).length;
              return alreadyCount > 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <span className="text-green-700 text-sm">您已完成选书，共选了 {alreadyCount} 本</span>
                </div>
              ) : (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
                  <p className="text-indigo-700 text-sm">📖 请从以下书目中选择您想参与讨论的书（最多 3 本）</p>
                </div>
              );
            })()}

            <div className="space-y-3">
              {openList.books.map(item => {
                const alreadySelected = !!mySelectionMap[item.bookId]?.includes(openList.id);
                const newSelected = selectedBooks.has(item.bookId);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleBookSelection(item.bookId, alreadySelected)}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors
                      ${alreadySelected ? "border-green-400 bg-green-50" :
                        newSelected ? "border-indigo-400 bg-indigo-50" :
                        "border-gray-200 hover:border-indigo-300"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-semibold text-gray-900">《{item.book.title}》</span>
                          <span className="text-sm text-gray-500">{item.book.author}</span>
                          {item.book.doubanScore && (
                            <span className="flex items-center text-amber-500 text-xs">
                              <Star className="h-3 w-3 mr-0.5" />{item.book.doubanScore}
                            </span>
                          )}
                          {item.book.genre && (
                            <Badge variant="outline" className="text-xs">{item.book.genre}</Badge>
                          )}
                          {item.book.wordCount && (
                            <span className="text-xs text-gray-400">{(item.book.wordCount / 10000).toFixed(0)}万字</span>
                          )}
                        </div>
                        {item.recommenderName && (
                          <div className="text-xs text-indigo-500 mt-0.5">荐书人：{item.recommenderName}</div>
                        )}
                        <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{item.reason}</p>
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
                        {alreadySelected ? (
                          <CheckCircle className="h-6 w-6 text-green-500" />
                        ) : newSelected ? (
                          <div className="h-6 w-6 bg-indigo-500 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-4 w-4 text-white" />
                          </div>
                        ) : (
                          <div className="h-6 w-6 border-2 border-gray-300 rounded-full" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {openList.books.length === 0 && (
                <div className="py-10 text-center text-gray-400">
                  <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>书单暂无书目</p>
                </div>
              )}
            </div>

            {/* 提交按钮 */}
            {selectedBooks.size > 0 && (
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-sm text-gray-600">已选 {selectedBooks.size}/3 本</span>
                <Button onClick={() => submitSelection(openList.id)} disabled={submitting}>
                  {submitting ? "提交中…" : `确认选书（${selectedBooks.size} 本）`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-700">本月书单尚未发布</h3>
            <p className="text-sm text-gray-400 mt-1">每月 20 号前后发布，请耐心等待</p>
          </CardContent>
        </Card>
      )}

      {/* ── 历史书单 ── */}
      {historyLists.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">历史书单</h2>
          {historyLists.map(list => {
            const expanded = expandedIds.has(list.id);
            const myPicks = list.books.filter(b => mySelectionMap[b.bookId]?.includes(list.id));
            return (
              <Card key={list.id}>
                {/* 折叠标题 */}
                <button
                  className="w-full text-left"
                  onClick={() => toggleExpand(list.id)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">
                        第 {list.period} 期白日梦书单
                      </span>
                      <span className="text-sm text-gray-400 ml-2">{list.month}</span>
                      <span className="text-sm text-gray-400 ml-2">· {list.books.length} 本书目</span>
                      {myPicks.length > 0 && (
                        <span className="ml-2 text-xs text-indigo-500 font-medium">
                          我选了 {myPicks.length} 本
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">已关闭</Badge>
                      {expanded
                        ? <ChevronUp className="h-4 w-4 text-gray-400" />
                        : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </CardContent>
                </button>

                {/* 展开书目列表 */}
                {expanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-3">
                    {list.books.length === 0 ? (
                      <p className="text-sm text-gray-400 py-4 text-center">暂无书目记录</p>
                    ) : (
                      list.books.map(item => {
                        const isPicked = !!mySelectionMap[item.bookId]?.includes(list.id);
                        return (
                          <div
                            key={item.id}
                            className={`rounded-lg border p-3 ${isPicked ? "border-indigo-300 bg-indigo-50" : "border-gray-100 bg-gray-50"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-wrap gap-2">
                                  <span className="font-medium text-gray-900">《{item.book.title}》</span>
                                  <span className="text-sm text-gray-500">{item.book.author}</span>
                                  {item.book.doubanScore && (
                                    <span className="flex items-center text-amber-500 text-xs">
                                      <Star className="h-3 w-3 mr-0.5" />{item.book.doubanScore}
                                    </span>
                                  )}
                                  {item.book.genre && (
                                    <Badge variant="outline" className="text-xs">{item.book.genre}</Badge>
                                  )}
                                  {item.book.wordCount && (
                                    <span className="text-xs text-gray-400">{(item.book.wordCount / 10000).toFixed(0)}万字</span>
                                  )}
                                </div>
                                {item.recommenderName && (
                                  <div className="text-xs text-indigo-500 mt-0.5">荐书人：{item.recommenderName}</div>
                                )}
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.reason}</p>
                              </div>
                              {isPicked && (
                                <div className="flex-shrink-0 flex items-center gap-1 text-indigo-600 text-xs font-medium">
                                  <CheckCircle className="h-4 w-4" />
                                  我选了
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
