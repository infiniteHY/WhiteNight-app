/**
 * app/(resident)/booklist/page.tsx
 * 白日梦书单页面
 * - 当期书单：可选书（selection_open 状态，24h 内）
 * - 历史书单：按期展开，显示全部书目及本人选书标记
 * - 关闭书单：展示公开选书名单，可使用黑箱卡
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { BookOpen, Clock, CheckCircle, Star, ChevronDown, ChevronUp, Users, Lock, LogOut } from "lucide-react";
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

interface RosterEntry {
  bookId: string;
  bookTitle: string;
  selectors: { id: string; nickname: string }[];
}

interface BlackBoxModal {
  bookListId: string;
  bookId: string;
  bookTitle: string;
  targetUserId: string;
}

/* ─────────────────── 主组件 ─────────────────── */

export default function BookListPage() {
  const { data: session } = useSession();
  const [bookLists, setBookLists] = useState<BookList[]>([]);
  // 全部选书记录（含 id，key: bookId, value: {listId, selId}[]）
  const [mySelections, setMySelections] = useState<Array<{ id: string; bookId: string; bookListId: string }>>([]);
  const [loading, setLoading] = useState(true);

  // 当期选书状态
  const [pendingSelect, setPendingSelect] = useState<Set<string>>(new Set());   // 即将新增
  const [pendingDeselect, setPendingDeselect] = useState<Set<string>>(new Set()); // 即将取消
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // 历史书单展开状态
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 公开选书名单（key: bookListId）
  const [publicRosters, setPublicRosters] = useState<Record<string, RosterEntry[]>>({});
  const [loadingRosters, setLoadingRosters] = useState<Set<string>>(new Set());

  // 黑箱卡 modal
  const [bbModal, setBbModal] = useState<BlackBoxModal | null>(null);
  const [bbSubmitting, setBbSubmitting] = useState(false);

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

      setMySelections((selData.selections || []).map((s: { id: string; bookId: string; bookListId: string }) => ({
        id: s.id,
        bookId: s.bookId,
        bookListId: s.bookListId,
      })));

      // 默认展开最近 2 期历史书单
      const closed = lists.filter(l => l.status !== "selection_open").slice(0, 2);
      setExpandedIds(new Set(closed.map(l => l.id)));

      // 预加载最近 2 期的公开名单
      for (const l of closed) {
        loadPublicRoster(l.id);
      }
    } catch (e) {
      console.error("加载失败", e);
    } finally {
      setLoading(false);
    }
  };

  const loadPublicRoster = async (bookListId: string) => {
    if (loadingRosters.has(bookListId) || publicRosters[bookListId]) return;
    setLoadingRosters(prev => new Set(prev).add(bookListId));
    try {
      const res = await fetch(`/api/selections?bookListId=${bookListId}`);
      const data = await res.json();
      const sels: { bookId: string; book: { id: string; title: string }; user: { id: string; nickname: string } }[] =
        data.selections || [];

      // 按 bookId 分组
      const grouped: Record<string, RosterEntry> = {};
      for (const s of sels) {
        if (!grouped[s.bookId]) {
          grouped[s.bookId] = { bookId: s.bookId, bookTitle: s.book?.title || "", selectors: [] };
        }
        if (s.user) grouped[s.bookId].selectors.push(s.user);
      }

      setPublicRosters(prev => ({ ...prev, [bookListId]: Object.values(grouped) }));
    } catch {
      // ignore
    } finally {
      setLoadingRosters(prev => { const n = new Set(prev); n.delete(bookListId); return n; });
    }
  };

  /* ════════ 工具 ════════ */

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  const getDeadline = (publishDate: string) =>
    new Date(new Date(publishDate).getTime() + 24 * 60 * 60 * 1000);

  const toggleExpand = (list: BookList) => {
    const id = list.id;
    const expanding = !expandedIds.has(id);
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    if (expanding && list.status === "closed") {
      loadPublicRoster(id);
    }
  };

  /* ════════ 当期选书 ════════ */

  const toggleBookSelectionForList = (bookId: string, currentlySaved: boolean, listId: string) => {
    setMessage(null);
    if (currentlySaved) {
      setPendingDeselect(prev => {
        const next = new Set(prev);
        next.has(bookId) ? next.delete(bookId) : next.add(bookId);
        return next;
      });
    } else {
      setPendingSelect(prev => {
        const next = new Set(prev);
        if (next.has(bookId)) {
          next.delete(bookId);
        } else {
          const savedCount = mySelections.filter(s => s.bookListId === listId && !pendingDeselect.has(s.bookId)).length;
          if (savedCount + next.size >= 3) { showMsg("最多只能选择 3 本书", false); return prev; }
          next.add(bookId);
        }
        return next;
      });
    }
  };

  const submitSelection = async (listId: string) => {
    if (pendingSelect.size === 0 && pendingDeselect.size === 0) {
      showMsg("请选择或取消书目后再提交", false); return;
    }
    setSubmitting(true);
    try {
      // 先删除取消选书的记录
      for (const bookId of pendingDeselect) {
        const sel = mySelections.find(s => s.bookId === bookId && s.bookListId === listId);
        if (sel) {
          await fetch(`/api/selections?id=${sel.id}`, { method: "DELETE" });
        }
      }

      // 再提交新增选书
      if (pendingSelect.size > 0) {
        const res = await fetch("/api/selections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookListId: listId, bookIds: Array.from(pendingSelect) }),
        });
        const data = await res.json();
        if (!res.ok) { showMsg(data.error, false); return; }
      }

      showMsg("选书已更新", true);
      setPendingSelect(new Set());
      setPendingDeselect(new Set());
      loadAll();
    } catch {
      showMsg("提交失败，请稍后重试", false);
    } finally {
      setSubmitting(false);
    }
  };

  /* ════════ 黑箱卡 ════════ */

  const openBlackBoxModal = (bookListId: string, bookId: string, bookTitle: string) => {
    setBbModal({ bookListId, bookId, bookTitle, targetUserId: "" });
  };

  const submitBlackBox = async () => {
    if (!bbModal || !bbModal.targetUserId) return;
    setBbSubmitting(true);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "useCard",
          cardType: "black_box",
          bookListId: bbModal.bookListId,
          bookId: bbModal.bookId,
          targetUserId: bbModal.targetUserId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(data.message, true);
        setBbModal(null);
      } else {
        showMsg(data.error || "操作失败", false);
      }
    } catch {
      showMsg("操作失败，请稍后重试", false);
    } finally {
      setBbSubmitting(false);
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
            {/* 状态提示 */}
            {(() => {
              const savedCount = mySelections.filter(s => s.bookListId === openList.id && !pendingDeselect.has(s.bookId)).length;
              const hasChanges = pendingSelect.size > 0 || pendingDeselect.size > 0;
              if (savedCount === 0 && !hasChanges) {
                return (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
                    <p className="text-indigo-700 text-sm">📖 请从以下书目中选择您想参与讨论的书（最多 3 本）</p>
                  </div>
                );
              }
              return (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <span className="text-green-700 text-sm">
                    已选 {savedCount + pendingSelect.size} 本
                    {hasChanges && " · 有未提交的修改，请点击确认"}
                  </span>
                </div>
              );
            })()}

            <div className="space-y-3">
              {openList.books.map(item => {
                const savedSel = mySelections.find(s => s.bookId === item.bookId && s.bookListId === openList.id);
                const isSaved = !!savedSel;
                const isMarkedForRemoval = pendingDeselect.has(item.bookId);
                const isNewlySelected = pendingSelect.has(item.bookId);

                // 视觉状态：saved(未修改)=绿 / saved(取消中)=红线 / new=靛 / 未选=灰
                const cardClass = isSaved && !isMarkedForRemoval
                  ? "border-green-400 bg-green-50"
                  : isMarkedForRemoval
                  ? "border-red-300 bg-red-50 opacity-60"
                  : isNewlySelected
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 hover:border-indigo-300";

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleBookSelectionForList(item.bookId, isSaved && !isMarkedForRemoval, openList.id)}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${cardClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className={`font-semibold ${isMarkedForRemoval ? "line-through text-gray-400" : "text-gray-900"}`}>
                            《{item.book.title}》
                          </span>
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
                        {isSaved && !isMarkedForRemoval ? (
                          <CheckCircle className="h-6 w-6 text-green-500" />
                        ) : isMarkedForRemoval ? (
                          <div className="h-6 w-6 border-2 border-red-400 rounded-full flex items-center justify-center">
                            <span className="text-red-400 text-xs font-bold">×</span>
                          </div>
                        ) : isNewlySelected ? (
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
            {(pendingSelect.size > 0 || pendingDeselect.size > 0) && (
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {pendingSelect.size > 0 && `新增 ${pendingSelect.size} 本`}
                  {pendingSelect.size > 0 && pendingDeselect.size > 0 && " · "}
                  {pendingDeselect.size > 0 && `取消 ${pendingDeselect.size} 本`}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setPendingSelect(new Set()); setPendingDeselect(new Set()); }}
                    disabled={submitting}
                  >
                    重置
                  </Button>
                  <Button onClick={() => submitSelection(openList.id)} disabled={submitting}>
                    {submitting ? "提交中…" : "确认选书"}
                  </Button>
                </div>
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
            const myPickBookIds = new Set(mySelections.filter(s => s.bookListId === list.id).map(s => s.bookId));
            const myPicks = list.books.filter(b => myPickBookIds.has(b.bookId));
            const roster = publicRosters[list.id] || [];
            const isLoadingRoster = loadingRosters.has(list.id);

            return (
              <Card key={list.id}>
                {/* 折叠标题 */}
                <button
                  className="w-full text-left"
                  onClick={() => toggleExpand(list)}
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
                        const isPicked = myPickBookIds.has(item.bookId);
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

                    {/* 公开选书名单 */}
                    <div className="mt-4 border-t pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          选书名单（公开）
                        </h3>
                      </div>

                      {isLoadingRoster ? (
                        <p className="text-xs text-gray-400 py-2">加载名单中...</p>
                      ) : roster.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">暂无选书记录</p>
                      ) : (
                        <div className="space-y-3">
                          {roster.map(entry => {
                            const iMyBook = myPickBookIds.has(entry.bookId);
                            const otherSelectors = entry.selectors.filter(u => u.id !== session?.user?.id);

                            return (
                              <div key={entry.bookId} className="bg-white rounded-lg border border-gray-200 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <span className="text-sm font-medium text-gray-800">《{entry.bookTitle}》</span>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {entry.selectors.map(u => (
                                        <span
                                          key={u.id}
                                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                            ${u.id === session?.user?.id
                                              ? "bg-indigo-100 text-indigo-700"
                                              : "bg-gray-100 text-gray-600"}`}
                                        >
                                          {u.id === session?.user?.id ? "我" : u.nickname}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  {/* 技能卡按钮：仅当本人选了此书时显示 */}
                                  {iMyBook && (
                                    <div className="flex-shrink-0 flex flex-col gap-1.5">
                                      {otherSelectors.length > 0 && (
                                        <button
                                          onClick={() => openBlackBoxModal(list.id, entry.bookId, entry.bookTitle)}
                                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors"
                                        >
                                          <Lock className="h-3 w-3" />
                                          黑箱卡 −10甲骨
                                        </button>
                                      )}
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`使用闪避卡将消耗 10 甲骨，您将不参与《${entry.bookTitle}》的讨论分组，但须提交该书的读书笔记。确认使用？`)) return;
                                          const res = await fetch("/api/admin/groups", {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                              action: "useCard",
                                              cardType: "dodge",
                                              bookListId: list.id,
                                              bookId: entry.bookId,
                                            }),
                                          });
                                          const data = await res.json();
                                          if (res.ok) showMsg(data.message, true);
                                          else showMsg(data.error || "操作失败", false);
                                        }}
                                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition-colors"
                                      >
                                        <LogOut className="h-3 w-3" />
                                        闪避卡 −10甲骨
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── 黑箱卡 Modal ── */}
      {bbModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">使用黑箱卡</h2>
              <p className="text-sm text-gray-500 mt-1">
                指定讨论伙伴：《{bbModal.bookTitle}》
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 space-y-1">
              <p>• 消耗 <strong>10 甲骨</strong>，对方获得 <strong>8 甲骨</strong>补偿</p>
              <p>• 使用后在分组时与指定伙伴自动成为一组</p>
              <p>• 每本书仅可使用一次，且须在分组前使用</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">选择目标伙伴</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(publicRosters[bbModal.bookListId] || [])
                  .find(e => e.bookId === bbModal.bookId)
                  ?.selectors.filter(u => u.id !== session?.user?.id)
                  .map(u => (
                    <label
                      key={u.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                        ${bbModal.targetUserId === u.id
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-200"}`}
                    >
                      <input
                        type="radio"
                        name="bb-target"
                        value={u.id}
                        checked={bbModal.targetUserId === u.id}
                        onChange={() => setBbModal(prev => prev ? { ...prev, targetUserId: u.id } : null)}
                        className="accent-indigo-600"
                      />
                      <span className="text-sm text-gray-800">{u.nickname}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setBbModal(null)}
                disabled={bbSubmitting}
              >
                取消
              </Button>
              <Button
                className="flex-1"
                onClick={submitBlackBox}
                disabled={!bbModal.targetUserId || bbSubmitting}
              >
                {bbSubmitting ? "提交中…" : "确认使用（−10甲骨）"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
