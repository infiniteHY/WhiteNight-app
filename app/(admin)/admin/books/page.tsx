/**
 * app/(admin)/admin/books/page.tsx
 * 书单管理页面（管理员专用）
 *
 * 功能：
 * 1. 创建 / 删除白日梦书单
 * 2. 向书单直接填写书目信息（书名、作者、荐书人、推荐语）并加入，无需先建书库
 * 3. 从"居民年度荐书表"中导入居民已荐书目
 * 4. 发布书单
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, BookOpen, Send, Trash2, Search, Download,
  ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

/* ─────────────────── 类型定义 ─────────────────── */

interface BookInfo {
  id: string;
  title: string;
  author: string;
  genre?: string;
  wordCount?: number;
  doubanScore?: number;
  pubYear?: number;
}

/** 书单中的书目条目 */
interface BookListEntry {
  id: string;
  bookId: string;
  reason: string;
  recommenderName?: string;
  voteCount: number;
  book: BookInfo;
}

interface BookList {
  id: string;
  period: number;
  month: string;
  type: string;
  status: string;
  publishDate?: string;
  books: BookListEntry[];
}

/** 居民荐书记录 */
interface ResidentRec {
  id: string;
  reason: string;
  recommenderName?: string;
  voteCount: number;
  month: string;
  status: string;
  book: BookInfo;
  user: { id: string; nickname: string };
}

const STATUS_MAP: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  selection_open: "选书中",
  closed: "已关闭",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  draft: "secondary",
  published: "default",
  selection_open: "success",
  closed: "outline",
};

/* ─────────────────── 主组件 ─────────────────── */

export default function AdminBooksPage() {
  /* ─── 全局状态 ─── */
  const [bookLists, setBookLists] = useState<BookList[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [selectedListId, setSelectedListId] = useState<string>("");

  /* ─── 创建书单 ─── */
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    period: "",
    month: new Date().toISOString().slice(0, 7),
    type: "normal",
  });

  /* ─── 预备榜投票开关 ─── */
  const [votingOpen, setVotingOpen] = useState(false);
  const [togglingVoting, setTogglingVoting] = useState(false);

  /* ─── 删除确认 ─── */
  const [deleteConfirmId, setDeleteConfirmId] = useState<string>("");

  /* ─── 手动添加书目表单（直接填写，无需搜书库） ─── */
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addForm, setAddForm] = useState({
    title: "",         // 书名（必填）
    author: "",        // 作者（必填）
    genre: "",         // 类型（选填）
    pubYear: "",       // 出版年份（选填）
    doubanScore: "",   // 豆瓣评分（选填）
    wordCount: "",     // 字数，万字为单位（选填）
    recommenderName: "", // 荐书人（必填）
    reason: "",          // 推荐语（必填）
  });
  const [addLoading, setAddLoading] = useState(false);

  /* ─── 居民年度荐书表 ─── */
  const [showYearTable, setShowYearTable] = useState(false);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [residentRecs, setResidentRecs] = useState<ResidentRec[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recSearch, setRecSearch] = useState("");

  /* ════════ 数据加载 ════════ */

  const loadBookLists = useCallback(async () => {
    try {
      const res = await fetch("/api/booklists?pageSize=30");
      const data = await res.json();
      setBookLists(data.bookLists || []);
    } catch {
      showMsg("加载书单失败", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookLists();
    fetch("/api/admin/voting")
      .then(r => r.json())
      .then(d => setVotingOpen(d.votingOpen === true))
      .catch(() => {});
  }, [loadBookLists]);

  const loadResidentRecs = async (year: string) => {
    setRecLoading(true);
    try {
      const res = await fetch(`/api/recommendations?year=${year}&status=pending&pageSize=200`);
      const data = await res.json();
      setResidentRecs(data.recommendations || []);
    } catch {
      showMsg("加载居民荐书失败", false);
    } finally {
      setRecLoading(false);
    }
  };

  /* ════════ 工具函数 ════════ */

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  /**
   * 安全解析 fetch 响应为 JSON。
   * Next.js 16 在服务端未捕获异常时可能返回空 body，
   * 直接调用 res.json() 会抛出 "Unexpected end of JSON input"。
   * 此工具先读取 text，再尝试 JSON.parse，失败时返回空对象。
   */
  const safeJson = async (res: Response): Promise<Record<string, string>> => {
    try {
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  };

  /* ════════ 书单 CRUD ════════ */

  const handleCreate = async () => {
    if (!createForm.period || !createForm.month) {
      showMsg("期数和月份为必填项", false); return;
    }
    const res = await fetch("/api/booklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const data = await safeJson(res);
    if (res.ok) {
      showMsg("书单创建成功", true);
      setShowCreate(false);
      setCreateForm({ period: "", month: new Date().toISOString().slice(0, 7), type: "normal" });
      loadBookLists();
    } else {
      showMsg(data.error || "创建失败", false);
    }
  };

  /** 删除草稿书单 */
  const handleDelete = async (listId: string) => {
    const res = await fetch(`/api/booklists?id=${listId}`, { method: "DELETE" });
    const data = await safeJson(res);
    if (res.ok) {
      showMsg("书单已删除", true);
      if (selectedListId === listId) setSelectedListId("");
      setDeleteConfirmId("");
      loadBookLists();
    } else {
      showMsg(data.error || "删除失败", false);
    }
  };

  /** 切换预备榜投票开关 */
  const handleToggleVoting = async () => {
    if (!votingOpen && !confirm("开启投票将清零所有待选荐书的票数，重新开始本轮投票。确认开启？")) return;
    setTogglingVoting(true);
    try {
      const res = await fetch("/api/admin/voting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: !votingOpen }),
      });
      const data = await res.json();
      if (res.ok) {
        setVotingOpen(!votingOpen);
        showMsg(data.message, true);
      } else {
        showMsg(data.error || "操作失败", false);
      }
    } catch {
      showMsg("操作失败", false);
    } finally {
      setTogglingVoting(false);
    }
  };

  /** 重新开启选书窗口（closed → selection_open） */
  const handleOpenSelection = async (listId: string) => {
    if (!confirm("确认重新开启选书窗口？居民将可以再次选书。")) return;
    const res = await fetch("/api/booklists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookListId: listId, action: "openSelection" }),
    });
    const data = await safeJson(res);
    if (res.ok) {
      showMsg("选书窗口已重新开启", true);
      loadBookLists();
    } else {
      showMsg(data.error || "操作失败", false);
    }
  };

  /** 关闭选书窗口（selection_open → closed） */
  const handleClose = async (listId: string) => {
    const res = await fetch("/api/booklists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookListId: listId, action: "close" }),
    });
    const data = await safeJson(res);
    if (res.ok) {
      showMsg("选书窗口已关闭，可进行分组", true);
      loadBookLists();
    } else {
      showMsg(data.error || "关闭失败", false);
    }
  };

  /** 发布书单 */
  const handlePublish = async (listId: string) => {
    if (!confirm("确认发布书单？发布后将通知所有居民并开启24小时选书窗口。")) return;
    const res = await fetch("/api/booklists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookListId: listId, action: "publish" }),
    });
    const data = await safeJson(res);
    if (res.ok) {
      showMsg("书单已发布，居民将收到通知", true);
      loadBookLists();
    } else {
      showMsg(data.error || "发布失败", false);
    }
  };

  /** 从书单移除单本书目 */
  const handleRemove = async (listId: string, bookId: string) => {
    const res = await fetch("/api/booklists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookListId: listId, action: "removeBook", bookId }),
    });
    if (res.ok) {
      showMsg("书目已移除", true);
      loadBookLists();
    }
  };

  /* ════════ 直接添加书目（自动建书 + 加入书单） ════════ */

  const handleAddBook = async () => {
    if (!selectedListId) { showMsg("请先选择书单", false); return; }

    // 前端校验必填项
    if (!addForm.title.trim()) { showMsg("书名不能为空", false); return; }
    if (!addForm.author.trim()) { showMsg("作者不能为空", false); return; }
    if (!addForm.recommenderName.trim()) { showMsg("荐书人不能为空", false); return; }
    if (!addForm.reason.trim()) { showMsg("推荐语不能为空", false); return; }

    setAddLoading(true);
    try {
      // Step 1：在书库中创建书籍记录
      const bookRes = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title.trim(),
          author: addForm.author.trim(),
          genre: addForm.genre.trim() || null,
          pubYear: addForm.pubYear ? parseInt(addForm.pubYear) : null,
          doubanScore: addForm.doubanScore ? parseFloat(addForm.doubanScore) : null,
          // wordCount 前端以"万字"为单位输入，存储时换算为字数
          wordCount: addForm.wordCount ? Math.round(parseFloat(addForm.wordCount) * 10000) : null,
        }),
      });
      const bookData = await safeJson(bookRes);
      if (!bookRes.ok) {
        showMsg(bookData.error || "书籍创建失败", false);
        return;
      }
      // 服务端返回 { book: { id, ... } }
      const bookId: string = (bookData as unknown as { book: { id: string } }).book?.id;
      if (!bookId) {
        showMsg("书籍创建失败：未获取到 ID", false);
        return;
      }

      // Step 2：将书目与荐书人、推荐语绑定到书单
      const listRes = await fetch("/api/booklists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookListId: selectedListId,
          action: "addBook",
          bookId,
          recommenderName: addForm.recommenderName.trim(),
          reason: addForm.reason.trim(),
        }),
      });
      const listData = await safeJson(listRes);
      if (!listRes.ok) {
        showMsg(listData.error || "加入书单失败", false);
        return;
      }

      showMsg(`《${addForm.title}》已加入书单`, true);
      // 重置表单（保留荐书人，方便连续添加）
      setAddForm((p) => ({
        ...p,
        title: "", author: "", genre: "", pubYear: "",
        doubanScore: "", wordCount: "", reason: "",
      }));
      loadBookLists();
    } finally {
      setAddLoading(false);
    }
  };

  /* ════════ 居民荐书表导入 ════════ */

  const handleImportRec = async (rec: ResidentRec) => {
    if (!selectedListId) { showMsg("请先选择目标书单", false); return; }
    const res = await fetch("/api/booklists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookListId: selectedListId,
        action: "addBook",
        recommendationId: rec.id,
      }),
    });
    const data = await safeJson(res);
    if (res.ok) {
      showMsg(`《${rec.book.title}》已导入书单`, true);
      loadBookLists();
    } else {
      showMsg(data.error || "导入失败", false);
    }
  };

  /* ════════ 衍生数据 ════════ */

  const selectedList = bookLists.find((l) => l.id === selectedListId);

  const filteredRecs = residentRecs.filter((r) => {
    if (!recSearch.trim()) return true;
    const q = recSearch.toLowerCase();
    return (
      r.book.title.toLowerCase().includes(q) ||
      r.book.author.toLowerCase().includes(q) ||
      (r.recommenderName || r.user.nickname).toLowerCase().includes(q)
    );
  });

  /* ════════ 渲染 ════════ */

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">加载中...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── 页面标题 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">书单管理</h1>
          <p className="text-gray-500 text-sm mt-0.5">创建白日梦书单，添加书目后发布</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={togglingVoting}
            onClick={handleToggleVoting}
            className={votingOpen ? "border-green-400 text-green-700 hover:bg-green-50" : "border-gray-300 text-gray-600"}
          >
            {votingOpen ? "🟢 预备榜投票已开启" : "⚫ 预备榜投票已关闭"}
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            创建书单
          </Button>
        </div>
      </div>

      {/* ── 全局消息 ── */}
      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between border
          ${message.ok
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-red-50 text-red-700 border-red-200"}`}>
          <span>{message.ok ? "✅" : "❌"} {message.text}</span>
          <button onClick={() => setMessage(null)} className="text-gray-400 ml-3 text-base">×</button>
        </div>
      )}

      {/* ── 创建书单面板 ── */}
      {showCreate && (
        <Card className="border-indigo-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">创建新书单</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>期数 *</Label>
                <Input
                  type="number"
                  placeholder="如：12"
                  value={createForm.period}
                  onChange={(e) => setCreateForm((p) => ({ ...p, period: e.target.value }))}
                />
              </div>
              <div>
                <Label>月份 *</Label>
                <Input
                  type="month"
                  value={createForm.month}
                  onChange={(e) => setCreateForm((p) => ({ ...p, month: e.target.value }))}
                />
              </div>
              <div>
                <Label>类型</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={createForm.type}
                  onChange={(e) => setCreateForm((p) => ({ ...p, type: e.target.value }))}
                >
                  <option value="normal">普通书单</option>
                  <option value="free">自由书单</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleCreate}>创建</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 主体两栏布局 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* ════ 左栏：书单列表 ════ */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="font-semibold text-gray-600 text-xs uppercase tracking-wider">书单列表</h2>

          {bookLists.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-gray-400">
                <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>暂无书单，点击右上角创建</p>
              </CardContent>
            </Card>
          ) : (
            bookLists.map((list) => (
              <Card
                key={list.id}
                className={`cursor-pointer transition-all ${
                  selectedListId === list.id
                    ? "border-indigo-500 shadow-md ring-1 ring-indigo-300"
                    : "hover:shadow-sm border-gray-200"
                }`}
                onClick={() => {
                  setSelectedListId(list.id);
                  setDeleteConfirmId("");
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-gray-900">
                        第 {list.period} 期 · {list.month}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {list.type === "normal" ? "普通书单" : "自由书单"} · 共 {list.books.length} 册
                      </div>
                    </div>
                    <Badge variant={STATUS_BADGE[list.status] || "secondary"}>
                      {STATUS_MAP[list.status] || list.status}
                    </Badge>
                  </div>

                  {/* 书目预览（最多3条） */}
                  {list.books.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {list.books.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="flex items-center text-xs text-gray-600 gap-1">
                          <span className="truncate flex-1">《{entry.book.title}》</span>
                          <span className="text-gray-400 flex-shrink-0">
                            {entry.recommenderName || "—"}荐
                          </span>
                        </div>
                      ))}
                      {list.books.length > 3 && (
                        <div className="text-xs text-gray-400">还有 {list.books.length - 3} 册…</div>
                      )}
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    {list.status === "draft" && (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={(e) => { e.stopPropagation(); handlePublish(list.id); }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        发布
                      </Button>
                    )}

                    {/* 关闭选书（选书中状态） */}
                    {list.status === "selection_open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("确认关闭选书窗口？关闭后居民将无法再选书，可进行分组。")) {
                            handleClose(list.id);
                          }
                        }}
                      >
                        关闭选书
                      </Button>
                    )}

                    {/* 重新开启选书（已关闭状态） */}
                    {list.status === "closed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-green-600 border-green-300 hover:bg-green-50"
                        onClick={(e) => { e.stopPropagation(); handleOpenSelection(list.id); }}
                      >
                        开启选书
                      </Button>
                    )}

                    {/* 删除按钮（草稿 or 已关闭） */}
                    {(list.status === "draft" || list.status === "closed") && (
                      deleteConfirmId === list.id ? (
                        <div
                          className="flex gap-1 flex-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1 text-xs"
                            onClick={() => handleDelete(list.id)}
                          >
                            确认删除
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => setDeleteConfirmId("")}
                          >
                            取消
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-500 hover:text-red-700 hover:border-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(list.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* ════ 右栏：详情 + 工具 ════ */}
        <div className="lg:col-span-3 space-y-4">

          {!selectedListId ? (
            <div className="text-center py-24 text-gray-400 border-2 border-dashed rounded-xl">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>← 点击左侧书单查看详情并添加书目</p>
            </div>
          ) : (
            <>
              {/* ── 当前书单书目列表 ── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      第 {selectedList?.period} 期书单
                      <span className="text-gray-400 font-normal ml-2 text-sm">
                        {selectedList?.month} ·{" "}
                        {selectedList?.type === "normal" ? "普通书单" : "自由书单"}
                      </span>
                    </span>
                    <Badge variant={STATUS_BADGE[selectedList?.status || ""] || "secondary"}>
                      {STATUS_MAP[selectedList?.status || ""] || selectedList?.status}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(selectedList?.books.length ?? 0) === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      尚无书目，使用下方工具添加
                    </div>
                  ) : (
                    <div className="divide-y">
                      {selectedList?.books.map((entry, idx) => (
                        <div key={entry.id} className="py-3.5 flex items-start gap-3">
                          <span className="text-gray-300 text-sm w-5 pt-0.5 flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">
                              《{entry.book.title}》
                              <span className="text-gray-400 font-normal text-sm ml-1.5">
                                {entry.book.author}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs">
                              <span className="text-indigo-600 font-medium">
                                荐书人：{entry.recommenderName || "—"}
                              </span>
                              {entry.book.doubanScore && (
                                <span className="text-amber-500">⭐ {entry.book.doubanScore}</span>
                              )}
                              {entry.book.pubYear && (
                                <span className="text-gray-400">{entry.book.pubYear}年</span>
                              )}
                            </div>
                            {entry.reason && (
                              <p className="mt-1.5 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                                {entry.reason}
                              </p>
                            )}
                          </div>
                          {(selectedList?.status === "draft" || selectedList?.status === "closed") && (
                            <button
                              title="从书单移除"
                              onClick={() => handleRemove(selectedList.id, entry.bookId)}
                              className="text-gray-300 hover:text-red-500 flex-shrink-0 mt-0.5 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 选书中：锁定提示 */}
              {selectedList?.status === "selection_open" && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                  ⚠️ 选书进行中，书目不可编辑。请先关闭选书窗口再做调整。
                </div>
              )}

              {/* ── 草稿或已关闭状态展示添加工具 ── */}
              {(selectedList?.status === "draft" || selectedList?.status === "closed") && (
                <>
                  {/* ━━━ 工具一：直接填写添加书目 ━━━ */}
                  <Card>
                    <CardHeader
                      className="pb-2 cursor-pointer select-none"
                      onClick={() => setShowAddPanel((p) => !p)}
                    >
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2 text-indigo-700">
                          <Plus className="h-4 w-4" />
                          添加书目
                        </span>
                        {showAddPanel
                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                          : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </CardTitle>
                    </CardHeader>

                    {showAddPanel && (
                      <CardContent className="pt-0 space-y-4">
                        {/* 书目基本信息 */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2 sm:col-span-1">
                            <Label>书名 *</Label>
                            <Input
                              placeholder="如：活着"
                              value={addForm.title}
                              onChange={(e) => setAddForm((p) => ({ ...p, title: e.target.value }))}
                            />
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Label>作者 *</Label>
                            <Input
                              placeholder="如：余华"
                              value={addForm.author}
                              onChange={(e) => setAddForm((p) => ({ ...p, author: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>
                              类型
                              <span className="text-gray-400 font-normal ml-1 text-xs">（选填）</span>
                            </Label>
                            <Input
                              placeholder="如：小说"
                              value={addForm.genre}
                              onChange={(e) => setAddForm((p) => ({ ...p, genre: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>
                              出版年份
                              <span className="text-gray-400 font-normal ml-1 text-xs">（选填）</span>
                            </Label>
                            <Input
                              type="number"
                              placeholder="如：2020"
                              value={addForm.pubYear}
                              onChange={(e) => setAddForm((p) => ({ ...p, pubYear: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>
                              豆瓣评分
                              <span className="text-gray-400 font-normal ml-1 text-xs">（选填）</span>
                            </Label>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="10"
                              placeholder="如：8.5"
                              value={addForm.doubanScore}
                              onChange={(e) => setAddForm((p) => ({ ...p, doubanScore: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>
                              字数（万字）
                              <span className="text-gray-400 font-normal ml-1 text-xs">（选填）</span>
                            </Label>
                            <Input
                              type="number"
                              placeholder="如：15"
                              value={addForm.wordCount}
                              onChange={(e) => setAddForm((p) => ({ ...p, wordCount: e.target.value }))}
                            />
                          </div>
                        </div>

                        {/* 荐书人 */}
                        <div>
                          <Label>荐书人 *</Label>
                          <Input
                            placeholder="填写推荐此书的人名"
                            value={addForm.recommenderName}
                            onChange={(e) => setAddForm((p) => ({ ...p, recommenderName: e.target.value }))}
                          />
                        </div>

                        {/* 推荐语 */}
                        <div>
                          <Label>推荐语 *</Label>
                          <Textarea
                            rows={4}
                            placeholder="填写这本书的推荐理由，将展示给所有居民…"
                            value={addForm.reason}
                            onChange={(e) => setAddForm((p) => ({ ...p, reason: e.target.value }))}
                          />
                          <div className="text-right text-xs text-gray-400 mt-1">
                            {addForm.reason.length} 字
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button onClick={handleAddBook} disabled={addLoading}>
                            <Plus className="h-4 w-4 mr-1.5" />
                            {addLoading ? "添加中…" : "加入书单"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowAddPanel(false);
                              setAddForm({
                                title: "", author: "", genre: "", pubYear: "",
                                doubanScore: "", wordCount: "",
                                recommenderName: "", reason: "",
                              });
                            }}
                          >
                            收起
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>

                  {/* ━━━ 工具二：从居民年度荐书表导入 ━━━ */}
                  <Card>
                    <CardHeader
                      className="pb-2 cursor-pointer select-none"
                      onClick={() => {
                        const next = !showYearTable;
                        setShowYearTable(next);
                        if (next && residentRecs.length === 0) loadResidentRecs(yearFilter);
                      }}
                    >
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2 text-green-700">
                          <Download className="h-4 w-4" />
                          从居民年度荐书表导入
                        </span>
                        {showYearTable
                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                          : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </CardTitle>
                    </CardHeader>

                    {showYearTable && (
                      <CardContent className="pt-0 space-y-3">
                        {/* 年份 + 搜索 */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs whitespace-nowrap">年份</Label>
                            <Input
                              type="number"
                              className="w-24 h-8 text-sm"
                              value={yearFilter}
                              onChange={(e) => setYearFilter(e.target.value)}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => loadResidentRecs(yearFilter)}
                            >
                              加载
                            </Button>
                          </div>
                          <div className="relative flex-1">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <Input
                              className="pl-8 h-8 text-sm"
                              placeholder="搜索书名 / 作者 / 荐书人…"
                              value={recSearch}
                              onChange={(e) => setRecSearch(e.target.value)}
                            />
                          </div>
                        </div>

                        {recLoading ? (
                          <div className="text-center py-6 text-gray-400 text-sm">加载中…</div>
                        ) : filteredRecs.length === 0 ? (
                          <div className="text-center py-6 text-gray-400 text-sm">
                            {residentRecs.length === 0
                              ? `${yearFilter} 年暂无居民荐书记录`
                              : "无匹配结果"}
                          </div>
                        ) : (
                          <div className="divide-y border rounded-md max-h-80 overflow-y-auto">
                            {filteredRecs.map((rec) => {
                              const alreadyIn = selectedList?.books.some(
                                (b) => b.bookId === rec.book.id
                              );
                              return (
                                <div key={rec.id} className="px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm text-gray-900 truncate">
                                      《{rec.book.title}》
                                      <span className="text-gray-400 font-normal ml-1">
                                        {rec.book.author}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                                      <span className="text-indigo-500">
                                        {rec.recommenderName || rec.user.nickname}荐
                                      </span>
                                      <span>{rec.month}</span>
                                      {rec.book.doubanScore && (
                                        <span className="text-amber-500">⭐{rec.book.doubanScore}</span>
                                      )}
                                      {rec.voteCount > 0 && (
                                        <span className="text-green-600">{rec.voteCount}票</span>
                                      )}
                                    </div>
                                    {rec.reason && (
                                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                                        {rec.reason}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant={alreadyIn ? "outline" : "default"}
                                    disabled={alreadyIn}
                                    className="flex-shrink-0 h-7 text-xs"
                                    onClick={() => handleImportRec(rec)}
                                  >
                                    {alreadyIn ? "已在书单" : "导入"}
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <p className="text-xs text-gray-400">
                          共 {filteredRecs.length} 条 · {yearFilter} 年度居民荐书
                        </p>
                      </CardContent>
                    )}
                  </Card>
                </>
              )}

              {/* 已发布状态提示 */}
              {selectedList?.status !== "draft" && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  书单已{STATUS_MAP[selectedList?.status || ""] || "发布"}，不可再修改书目。
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
