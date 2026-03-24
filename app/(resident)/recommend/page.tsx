/**
 * app/(resident)/recommend/page.tsx
 * 荐书与预备榜页面（居民端）
 *
 * 功能：
 * - 荐书：随时可提交，不受投票开关影响
 * - 荐书单：按年份展示所有荐书记录，按票数从高到低排列
 * - 预备书单投票：仅当管理员开启投票后方可操作
 *   首次投票免费，追加投票需 1 甲骨/票
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { BookOpen, Plus, ThumbsUp, ChevronDown, ChevronUp, Lock, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/* ─────────────────── 类型 ─────────────────── */

interface Recommendation {
  id: string;
  reason: string;
  recommenderName?: string;
  voteCount: number;
  myVoteCount: number;
  hasVoted: boolean;
  status: string;
  month: string;
  book: {
    id: string;
    title: string;
    author: string;
    genre?: string;
    doubanScore?: number;
    wordCount?: number;
    pubYear?: number;
  };
  user: { id: string; nickname: string };
  bookList?: { id: string; period: number; month: string } | null;
}

/* ─────────────────── 工具 ─────────────────── */

/** 按年份分组，每组内按票数从高到低排列 */
function groupByYear(recs: Recommendation[]): Record<string, Recommendation[]> {
  const map: Record<string, Recommendation[]> = {};
  for (const r of recs) {
    const year = r.month.slice(0, 4);
    if (!map[year]) map[year] = [];
    map[year].push(r);
  }
  // 每年内按 voteCount 降序
  for (const year of Object.keys(map)) {
    map[year].sort((a, b) => b.voteCount - a.voteCount);
  }
  return map;
}

/* ─────────────────── 组件 ─────────────────── */

export default function RecommendPage() {
  const { data: session } = useSession();

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [myMonthVoteCount, setMyMonthVoteCount] = useState(0); // 本月已投总票数
  const [loading, setLoading] = useState(true);
  const [votingOpen, setVotingOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // 年份展开状态（默认展开当前年）
  const currentYear = String(new Date().getFullYear());
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set([currentYear]));

  // 付费投票确认框
  const [paidConfirm, setPaidConfirm] = useState<{ rec: Recommendation } | null>(null);

  // 编辑荐书
  const [editTarget, setEditTarget] = useState<Recommendation | null>(null);
  const [editReason, setEditReason] = useState("");

  // 荐书表单
  const [showForm, setShowForm] = useState(false);
  const [myNickname, setMyNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "", author: "", genre: "", doubanScore: "", wordCount: "",
    reason: "", listType: "normal",
  });

  /* ════════ 加载数据 ════════ */

  const loadRecs = useCallback(async () => {
    setLoading(true);
    try {
      // 加载所有荐书记录（不限状态），按票数排序
      const res = await fetch("/api/recommendations?pageSize=500");
      const data = await res.json();
      setRecs(data.recommendations || []);
      setMyMonthVoteCount(data.myMonthVoteCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecs();
    // 获取投票开关状态
    fetch("/api/admin/voting")
      .then(r => r.json())
      .then(d => setVotingOpen(d.votingOpen === true))
      .catch(() => {});
    // 获取当前用户昵称
    fetch("/api/users/me")
      .then(r => r.json())
      .then(d => { if (d.user?.nickname) setMyNickname(d.user.nickname); })
      .catch(() => {});
  }, [loadRecs]);

  /* ════════ 工具 ════════ */

  const showMsg = (text: string, ok: boolean) => {
    setMessage({ text, ok });
    setTimeout(() => setMessage(null), 4000);
  };

  const toggleYear = (year: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  };

  /* ════════ 投票 ════════ */

  const doVote = async (rec: Recommendation) => {
    try {
      const res = await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: rec.id, action: "vote" }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(data.message, true);
        setMyMonthVoteCount(prev => prev + 1);
        setRecs(prev => prev.map(r =>
          r.id === rec.id
            ? { ...r, voteCount: r.voteCount + 1, myVoteCount: r.myVoteCount + 1, hasVoted: true }
            : r
        ));
      } else {
        showMsg(data.error || "投票失败", false);
      }
    } catch {
      showMsg("投票失败，请稍后重试", false);
    }
  };

  const handleVoteClick = (rec: Recommendation) => {
    if (!votingOpen) { showMsg("预备榜投票尚未开启", false); return; }
    // 本月已有任何投票记录则收费（每月仅第一票免费）
    if (myMonthVoteCount > 0) {
      setPaidConfirm({ rec });
    } else {
      doVote(rec);
    }
  };

  /* ════════ 提交荐书 ════════ */

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.author.trim()) {
      showMsg("书名和作者不能为空", false); return;
    }
    if (form.listType === "normal" && form.reason.length < 50) {
      showMsg("普通书单推荐语需≥50字", false); return;
    }
    if (!form.reason.trim()) {
      showMsg("推荐语不能为空", false); return;
    }

    setSubmitting(true);
    try {
      // Step 1: 创建书籍
      const bookRes = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          author: form.author.trim(),
          genre: form.genre.trim() || null,
          doubanScore: form.doubanScore ? parseFloat(form.doubanScore) : null,
          wordCount: form.wordCount ? Math.round(parseFloat(form.wordCount) * 10000) : null,
        }),
      });
      const bookData = await bookRes.json();
      if (!bookRes.ok) { showMsg(bookData.error || "书籍创建失败", false); return; }

      // Step 2: 提交荐书
      const recRes = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: bookData.book.id,
          reason: form.reason,
          listType: form.listType,
        }),
      });
      const recData = await recRes.json();
      if (recRes.ok) {
        showMsg("荐书成功！", true);
        setForm({ title: "", author: "", genre: "", doubanScore: "", wordCount: "", reason: "", listType: "normal" });
        setShowForm(false);
        loadRecs();
      } else {
        showMsg(recData.error || "荐书失败", false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ════════ 编辑/删除荐书 ════════ */

  const handleEditRec = async () => {
    if (!editTarget || !editReason.trim()) return;
    try {
      const res = await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: editTarget.id, action: "editRec", reason: editReason }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("荐书已更新", true);
        setEditTarget(null);
        loadRecs();
      } else {
        showMsg(data.error || "更新失败", false);
      }
    } catch {
      showMsg("操作失败", false);
    }
  };

  const handleDeleteRec = async (rec: Recommendation) => {
    if (!confirm(`确认删除对《${rec.book.title}》的荐书？`)) return;
    try {
      const res = await fetch(`/api/recommendations?id=${rec.id}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) { showMsg("荐书已删除", true); loadRecs(); }
      else showMsg(data.error || "删除失败", false);
    } catch {
      showMsg("操作失败", false);
    }
  };

  /* ════════ 渲染 ════════ */

  const grouped = groupByYear(recs);
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── 页头 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">荐书与预备榜</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            荐书随时可提交 · 预备榜投票
            {votingOpen
              ? <span className="text-green-600 font-medium ml-1">已开启（首次免费，追加 1 甲骨/票）</span>
              : <span className="text-gray-400 ml-1">尚未开启</span>
            }
          </p>
        </div>
        <Button onClick={() => setShowForm(p => !p)}>
          <Plus className="h-4 w-4 mr-1.5" />
          荐书
        </Button>
      </div>

      {/* ── 全局消息 ── */}
      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm border flex items-center justify-between
          ${message.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
          <span>{message.ok ? "✅" : "❌"} {message.text}</span>
          <button onClick={() => setMessage(null)} className="text-gray-400 ml-3">×</button>
        </div>
      )}

      {/* ── 付费投票确认框 ── */}
      {paidConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <div className="font-semibold text-gray-900">追加投票确认</div>
            <p className="text-sm text-gray-600">
              本月免费票已使用（共投出 <strong>{myMonthVoteCount}</strong> 票）。
              <br />为《{paidConfirm.rec.book.title}》追加 1 票需消耗 <strong className="text-amber-600">1 甲骨</strong>，
              当前余额：<strong className="text-amber-600">{session?.user?.jiaguBalance ?? 0}</strong> 甲骨。
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => { doVote(paidConfirm.rec); setPaidConfirm(null); }}
              >
                确认追加（-1 甲骨）
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setPaidConfirm(null)}>
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 荐书表单 ── */}
      {showForm && (
        <Card className="border-indigo-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">提交荐书</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 书单类型 */}
            <div className="flex gap-2">
              {[
                { value: "normal", label: "普通书单", hint: "推荐语≥50字，豆瓣≥7.5" },
                { value: "free", label: "自由书单", hint: "要求宽松" },
              ].map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, listType: t.value }))}
                  className={`flex-1 p-3 rounded-lg border text-sm text-left transition-colors
                    ${form.listType === t.value ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-gray-400 text-xs mt-0.5">{t.hint}</div>
                </button>
              ))}
            </div>

            {/* 书目信息 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>书名 *</Label>
                <Input placeholder="如：活着" value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <Label>作者 *</Label>
                <Input placeholder="如：余华" value={form.author}
                  onChange={e => setForm(p => ({ ...p, author: e.target.value }))} />
              </div>
              <div>
                <Label>类型 <span className="text-gray-400 text-xs">（选填）</span></Label>
                <Input placeholder="如：小说" value={form.genre}
                  onChange={e => setForm(p => ({ ...p, genre: e.target.value }))} />
              </div>
              <div>
                <Label>豆瓣评分 <span className="text-gray-400 text-xs">（选填）</span></Label>
                <Input type="number" step="0.1" min="0" max="10" placeholder="如：8.5" value={form.doubanScore}
                  onChange={e => setForm(p => ({ ...p, doubanScore: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>字数（万字）<span className="text-gray-400 text-xs">（选填）</span></Label>
                <Input type="number" placeholder="如：15" value={form.wordCount}
                  onChange={e => setForm(p => ({ ...p, wordCount: e.target.value }))} />
              </div>
            </div>

            {/* 荐书人（只读） */}
            <div>
              <Label>荐书人</Label>
              <div className="flex items-center h-10 px-3 border rounded-md bg-gray-50 text-sm">
                <span className="text-indigo-600 font-medium">{myNickname || "（加载中）"}</span>
                <span className="text-gray-400 ml-2 text-xs">（自动填写为您的昵称）</span>
              </div>
            </div>

            {/* 推荐语 */}
            <div>
              <Label>
                推荐语 *
                {form.listType === "normal" && (
                  <span className="text-gray-400 font-normal ml-2 text-xs">（普通书单要求≥50字）</span>
                )}
              </Label>
              <Textarea rows={5} placeholder="写下您的推荐理由…"
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
              <div className="text-right text-xs text-gray-400 mt-1">
                {form.reason.length} 字
                {form.listType === "normal" && form.reason.length < 50 && (
                  <span className="text-red-400 ml-2">还需 {50 - form.reason.length} 字</span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "提交中…" : "提交荐书"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 投票未开启提示 ── */}
      {!votingOpen && (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          <Lock className="h-4 w-4 flex-shrink-0" />
          <span>预备榜投票尚未开启，管理员开启后方可投票。以下为当前荐书单，按票数排列。</span>
        </div>
      )}

      {/* ── 荐书列表（按年份分组，年内按票数排序） ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">加载中…</div>
      ) : recs.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-gray-400">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>暂无荐书记录</p>
            <Button className="mt-4" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              成为第一个荐书人
            </Button>
          </CardContent>
        </Card>
      ) : (
        years.map(year => (
          <div key={year}>
            {/* 年份折叠标题 */}
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors mb-2"
              onClick={() => toggleYear(year)}
            >
              <span className="font-semibold text-gray-700">
                {year} 年度荐书
                <span className="font-normal text-gray-400 ml-2 text-sm">
                  共 {grouped[year].length} 条
                </span>
              </span>
              {expandedYears.has(year)
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>

            {/* 该年份荐书列表 */}
            {expandedYears.has(year) && (
              <div className="space-y-3">
                {grouped[year].map(rec => (
                  <Card key={rec.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* 书目信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-2 mb-1">
                            <span className="font-semibold text-gray-900">
                              《{rec.book.title}》
                            </span>
                            <span className="text-gray-500 text-sm">{rec.book.author}</span>
                            {rec.book.doubanScore && (
                              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                ⭐ {rec.book.doubanScore}
                              </Badge>
                            )}
                            {rec.book.genre && (
                              <Badge variant="outline" className="text-xs">{rec.book.genre}</Badge>
                            )}
                            {rec.status === "on_list" && rec.bookList && (
                              <Badge className="text-xs bg-indigo-100 text-indigo-700 border-0">
                                已入选 第{rec.bookList.period}期 · {rec.bookList.month}
                              </Badge>
                            )}
                            {rec.status === "on_list" && !rec.bookList && (
                              <Badge className="text-xs bg-indigo-100 text-indigo-700 border-0">
                                已入书单
                              </Badge>
                            )}
                          </div>

                          {/* 荐书人 + 月份 */}
                          <div className="text-xs text-gray-400 mb-2">
                            <span className="text-indigo-500 font-medium">
                              {rec.recommenderName || rec.user.nickname}
                            </span>
                            <span className="mx-1.5">·</span>
                            <span>{rec.month}</span>
                            {rec.book.wordCount && (
                              <>
                                <span className="mx-1.5">·</span>
                                <span>{(rec.book.wordCount / 10000).toFixed(0)}万字</span>
                              </>
                            )}
                          </div>

                          {/* 推荐语 */}
                          <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                            {rec.reason}
                          </p>

                          {/* 自己的荐书：编辑/删除（仅 pending 状态） */}
                          {rec.user.id === session?.user?.id && rec.status === "pending" && (
                            <div className="flex gap-2 mt-2">
                              <button
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-500 transition-colors"
                                onClick={() => { setEditTarget(rec); setEditReason(rec.reason); }}
                              >
                                <Pencil className="h-3 w-3" />
                                编辑
                              </button>
                              <button
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                onClick={() => handleDeleteRec(rec)}
                              >
                                <Trash2 className="h-3 w-3" />
                                删除
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 投票区 */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-1">
                          <button
                            onClick={() => handleVoteClick(rec)}
                            disabled={!votingOpen}
                            title={
                              !votingOpen
                                ? "投票尚未开启"
                                : rec.myVoteCount > 0
                                ? `已投 ${rec.myVoteCount} 票，追加需 1 甲骨`
                                : "点击免费投票"
                            }
                            className={`flex flex-col items-center px-3 py-2 rounded-xl transition-colors
                              ${!votingOpen
                                ? "text-gray-300 cursor-not-allowed"
                                : rec.hasVoted
                                ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
                                : "text-gray-400 hover:bg-gray-100"}`}
                          >
                            <ThumbsUp className="h-5 w-5" />
                            <span className="text-sm font-bold mt-0.5">{rec.voteCount}</span>
                          </button>

                          {/* 已投次数 */}
                          {votingOpen && rec.myVoteCount > 0 && (
                            <div className="text-xs text-indigo-400">已投{rec.myVoteCount}票</div>
                          )}
                          {votingOpen && rec.myVoteCount > 0 && (
                            <div className="text-xs text-amber-500">+1甲骨</div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ))
      )}
      {/* ── 编辑荐书模态框 ── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="font-semibold text-gray-900">
              编辑荐书 —《{editTarget.book.title}》
            </div>
            <div>
              <Label>
                推荐语
                <span className="text-gray-400 font-normal ml-2 text-xs">{editReason.length} 字</span>
              </Label>
              <Textarea
                rows={6}
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleEditRec}>保存修改</Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditTarget(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
