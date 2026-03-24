/**
 * app/(resident)/summary/page.tsx
 * 总结与笔记页面
 * 总结按月度分组展示所有人，笔记按年份可展开查看所有人
 */

"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { FileText, Upload, Info, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

interface Summary {
  id: string;
  month: string;
  fileName: string;
  fileUrl: string;
  uploadTime: string;
  status: string;
  user?: { id: string; nickname: string };
}

interface Note {
  id: string;
  userId: string;
  wordCount: number;
  content: string;
  uploadTime: string;
  rewarded: boolean;
  book?: { title: string; author: string };
  user?: { id: string; nickname: string };
}

export default function SummaryPage() {
  const { data: session } = useSession();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "note">("summary");
  const [message, setMessage] = useState("");

  // 总结上传
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 笔记提交
  const [noteForm, setNoteForm] = useState({ bookId: "", bookSearch: "", content: "" });
  const [submittingNote, setSubmittingNote] = useState(false);
  const [books, setBooks] = useState<Array<{ id: string; title: string; author: string }>>([]);

  // 年份展开状态（笔记）
  const currentYear = new Date().getFullYear().toString();
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set([currentYear]));

  // 月份展开状态（总结）
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([currentMonth]));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [summaryRes, noteRes] = await Promise.all([
        fetch("/api/summaries?pageSize=500"),
        fetch("/api/notes?pageSize=500"),
      ]);
      const [summaryData, noteData] = await Promise.all([
        summaryRes.json(),
        noteRes.json(),
      ]);
      setSummaries(summaryData.summaries || []);
      setNotes(noteData.notes || []);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadFile) { setMessage("❌ 请选择文件"); return; }
    const nickname = session?.user?.nickname || "";
    if (!uploadFile.name.includes(nickname)) {
      setMessage(`❌ 文件名必须包含您的昵称"${nickname}"`);
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", uploadFile);
    try {
      const res = await fetch("/api/summaries", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        setMessage("✅ 月度总结上传成功！");
        setUploadFile(null);
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 上传失败，请稍后重试");
    } finally {
      setUploading(false);
    }
  };

  const searchBooks = async (query: string) => {
    if (!query.trim()) { setBooks([]); return; }
    try {
      const res = await fetch(`/api/books?search=${encodeURIComponent(query)}&pageSize=5`);
      const data = await res.json();
      setBooks(data.books || []);
    } catch {}
  };

  const submitNote = async () => {
    if (!noteForm.bookId) { setMessage("❌ 请选择对应书目"); return; }
    if (!noteForm.content.trim()) { setMessage("❌ 笔记内容不能为空"); return; }
    setSubmittingNote(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: noteForm.bookId, content: noteForm.content }),
      });
      const data = await res.json();
      if (res.ok) {
        let msg = `✅ 笔记提交成功！字数：${data.wordCount}字`;
        if (data.rewardGranted) msg += `，获得${data.rewardAmount}甲骨奖励！`;
        else msg += `（字数≥1000字可获得5甲骨奖励）`;
        setMessage(msg);
        setNoteForm({ bookId: "", bookSearch: "", content: "" });
        loadData();
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch {
      setMessage("❌ 提交失败");
    } finally {
      setSubmittingNote(false);
    }
  };

  const toggleYear = (year: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const toggleMonth = (month: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });
  };

  // 按月分组总结
  const summaryByMonth = summaries.reduce((acc, s) => {
    if (!acc[s.month]) acc[s.month] = [];
    acc[s.month].push(s);
    return acc;
  }, {} as Record<string, Summary[]>);
  const months = Object.keys(summaryByMonth).sort().reverse();

  // 按年分组笔记
  const notesByYear = notes.reduce((acc, n) => {
    const year = new Date(n.uploadTime).getFullYear().toString();
    if (!acc[year]) acc[year] = [];
    acc[year].push(n);
    return acc;
  }, {} as Record<string, Note[]>);
  const years = Object.keys(notesByYear).sort().reverse();

  const wordCount = noteForm.content
    .replace(/[\s\n\r\t]/g, "")
    .replace(/[，。！？、；：""''（）【】《》…—]/g, "").length;

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">总结与笔记</h1>
        <p className="text-gray-600 mt-1">上传月度总结，提交读书笔记获取甲骨奖励</p>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.startsWith("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message}
          <button onClick={() => setMessage("")} className="ml-2 text-gray-400">×</button>
        </div>
      )}

      {/* Tab */}
      <div className="flex border-b">
        {(["summary", "note"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === tab ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500"}`}
          >
            {tab === "summary" ? "月度总结" : "读书笔记"}
          </button>
        ))}
      </div>

      {/* ─── 月度总结 Tab ─────────────────────────────────────────── */}
      {activeTab === "summary" && (
        <div className="space-y-5">
          {/* 上传说明 */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">月度总结上传规则</p>
                  <ul className="space-y-1 text-blue-700">
                    <li>• 上传窗口：月倒数第3天12:00 至 下月7号23:59</li>
                    <li>• 文件名必须包含您的昵称（{session?.user?.nickname}）</li>
                    <li>• 支持格式：PDF、Word、图片（JPG/PNG）</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 上传区域 */}
          <Card>
            <CardHeader><CardTitle>上传本月总结</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {uploadFile ? (
                  <div>
                    <FileText className="h-12 w-12 mx-auto mb-2 text-indigo-600" />
                    <p className="font-medium">{uploadFile.name}</p>
                    <p className="text-sm text-gray-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                    <Button variant="ghost" size="sm" className="mt-2 text-red-500" onClick={() => setUploadFile(null)}>移除</Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-gray-500 mb-2">点击选择文件</p>
                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="hidden" id="summary-file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                    <label htmlFor="summary-file"
                      className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 cursor-pointer">
                      选择文件
                    </label>
                  </div>
                )}
              </div>
              <Button onClick={handleFileUpload} disabled={!uploadFile || uploading} className="w-full">
                {uploading ? "上传中..." : "上传月度总结"}
              </Button>
            </CardContent>
          </Card>

          {/* 所有人总结按月分组 */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-gray-700">所有月度总结</h2>
            {months.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-gray-400">暂无总结记录</CardContent></Card>
            ) : (
              months.map((month) => {
                const isExpanded = expandedMonths.has(month);
                const list = summaryByMonth[month];
                return (
                  <div key={month} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      onClick={() => toggleMonth(month)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                        <span className="font-medium text-gray-800">{month} 月度总结</span>
                        <span className="text-sm text-gray-500">{list.length} 份</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="divide-y">
                        {list.map((summary) => (
                          <div key={summary.id} className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                              <div>
                                <span className="font-medium text-sm">{summary.user?.nickname || "未知用户"}</span>
                                <span className="text-xs text-gray-400 ml-2">{formatDateTime(summary.uploadTime)}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={summary.status === "approved" ? "success" : "secondary"} className="text-xs">
                                {summary.status === "approved" ? "已审核" : "已提交"}
                              </Badge>
                              <a href={summary.fileUrl} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm" className="text-xs h-7">查看</Button>
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ─── 读书笔记 Tab ─────────────────────────────────────────── */}
      {activeTab === "note" && (
        <div className="space-y-5">
          {/* 说明 */}
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Info className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-800">
                  📝 读书笔记字数达到 <strong>1000字</strong> 时，自动获得 <strong>5甲骨</strong> 奖励！
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 提交笔记 */}
          <Card>
            <CardHeader><CardTitle>提交读书笔记</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>对应书目</Label>
                {noteForm.bookId ? (
                  <div className="flex items-center justify-between p-3 border border-green-200 rounded-lg bg-green-50">
                    <span className="font-medium text-sm">《{noteForm.bookSearch}》</span>
                    <Button variant="ghost" size="sm" onClick={() => setNoteForm((p) => ({ ...p, bookId: "", bookSearch: "" }))}>更换</Button>
                  </div>
                ) : (
                  <div>
                    <Input placeholder="搜索书目..." value={noteForm.bookSearch}
                      onChange={(e) => { setNoteForm((p) => ({ ...p, bookSearch: e.target.value })); searchBooks(e.target.value); }} />
                    {books.length > 0 && (
                      <div className="border rounded-lg mt-1 overflow-hidden">
                        {books.map((book) => (
                          <button key={book.id} type="button"
                            className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-0 text-sm"
                            onClick={() => { setNoteForm((p) => ({ ...p, bookId: book.id, bookSearch: book.title })); setBooks([]); }}>
                            《{book.title}》— {book.author}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  笔记内容
                  <span className={`ml-2 text-sm ${wordCount >= 1000 ? "text-green-600 font-medium" : "text-gray-400"}`}>
                    {wordCount}字 {wordCount >= 1000 ? "✅ 满足奖励条件" : `（还差${1000 - wordCount}字获奖励）`}
                  </span>
                </Label>
                <Textarea rows={10} placeholder="在此输入您的读书笔记..." value={noteForm.content}
                  onChange={(e) => setNoteForm((p) => ({ ...p, content: e.target.value }))} />
              </div>

              <Button onClick={submitNote} disabled={submittingNote} className="w-full">
                {submittingNote ? "提交中..." : "提交笔记"}
              </Button>
            </CardContent>
          </Card>

          {/* 所有笔记按年份分组 */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-gray-700">所有读书笔记</h2>
            {years.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-gray-400">暂无笔记记录</CardContent></Card>
            ) : (
              years.map((year) => {
                const isExpanded = expandedYears.has(year);
                const list = notesByYear[year];
                return (
                  <div key={year} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      onClick={() => toggleYear(year)}
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                        <span className="font-medium text-gray-800">{year} 年</span>
                        <span className="text-sm text-gray-500">{list.length} 篇</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="divide-y">
                        {list.map((note) => (
                          <div key={note.id} className="px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center flex-wrap gap-2 mb-1">
                                  <span className="font-medium text-sm">{note.user?.nickname || "未知用户"}</span>
                                  {note.book && (
                                    <span className="text-sm text-gray-600">《{note.book.title}》</span>
                                  )}
                                  <span className="text-xs text-gray-400">{note.wordCount}字</span>
                                  {note.rewarded && <Badge variant="success" className="text-xs">已获奖</Badge>}
                                </div>
                                <p className="text-sm text-gray-500 line-clamp-2">{note.content}</p>
                                <p className="text-xs text-gray-400 mt-1">{formatDateTime(note.uploadTime)}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
