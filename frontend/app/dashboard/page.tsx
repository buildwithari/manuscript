"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";

// --- Types ---

interface Analysis {
  title?: string;
  genre: string;
  subgenre: string | null;
  themes: string[];
  target_audience: string;
  search_queries: string[];
}

interface Confidence {
  market_category: "Underserved Niche" | "Competitive" | "Saturated";
  audience_enthusiasm: "High" | "Moderate" | "Low";
  differentiation_score: number;
  reasoning: string;
  recommendations: string[];
  comp_pitch?: string;
  query_hook?: string;
}

interface Book {
  source: string;
  title: string | null;
  authors: string[];
  description: string | null;
  published_date: string | null;
  rating: number | null;
  ratings_count: number | null;
  edition_count: number | null;
  thumbnail: string | null;
  link: string | null;
}

interface ChatMessage {
  concept: string;
  analysis: Analysis;
  confidence: Confidence;
  books: Book[];
  created_at: string;
}

interface Project {
  id: string;
  title: string;
  created_at: string;
  sessions?: ChatMessage[];
}

// --- Colour maps ---

const categoryColors: Record<string, string> = {
  "Underserved Niche": "bg-sage-light text-sage-dark",
  "Competitive": "bg-amber-50 text-amber-800",
  "Saturated": "bg-red-50 text-red-800",
};

const enthusiasmColors: Record<string, string> = {
  "High": "bg-sage-light text-sage-dark",
  "Moderate": "bg-amber-50 text-amber-800",
  "Low": "bg-red-50 text-red-800",
};

// --- Helpers ---

function buildTrend(books: Book[]) {
  const counts: Record<number, number> = {};
  const currentYear = new Date().getFullYear();
  books.forEach((b) => {
    if (!b.published_date) return;
    const year = parseInt(b.published_date.slice(0, 4), 10);
    if (year >= 1990 && year <= currentYear) counts[year] = (counts[year] || 0) + 1;
  });
  if (Object.keys(counts).length === 0) return null;
  const minYear = Math.max(Math.min(...Object.keys(counts).map(Number)), currentYear - 20);
  const years = Array.from({ length: currentYear - minYear + 1 }, (_, i) => minYear + i);
  const max = Math.max(...years.map((y) => counts[y] || 0), 1);
  return { years, counts, max };
}

// --- Dashboard ---

export default function Dashboard() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [concept, setConcept] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(288);
  const isResizing = useRef(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(Math.min(Math.max(newWidth, 240), 560));
    };
    const onMouseUp = () => { isResizing.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // Auth gate
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      if (!s) { router.replace("/"); return; }
      setSession(s);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // Load projects when session is ready
  useEffect(() => {
    if (!session) return;
    fetchProjects(session.access_token);
  }, [session]);

  // Scroll to bottom when messages change
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchProjects = async (token: string) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setProjects(await res.json());
  };

  const selectProject = async (project: Project) => {
    setActiveProject(project);
    setMessages([]);
    setError(null);
    if (!session) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${project.id}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const data = await res.json();
      const sorted: ChatMessage[] = ((data.sessions as ChatMessage[]) || []).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setMessages(sorted);
    }
  };

  const startNewChat = () => {
    setActiveProject(null);
    setMessages([]);
    setError(null);
    setConcept("");
    textareaRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!concept.trim() || !session) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ concept, project_id: activeProject?.id ?? null }),
      });
      if (!res.ok) throw new Error("Backend error");
      const data = await res.json();

      const newMessage: ChatMessage = {
        concept: data.concept,
        analysis: data.analysis,
        confidence: data.confidence,
        books: data.books,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, newMessage]);
      setConcept("");

      // If a new project was auto-created, add it to the sidebar and select it
      if (data.project_id && !activeProject) {
        const newProject: Project = {
          id: data.project_id,
          title: data.project_title ?? data.analysis.title ?? "Untitled",
          created_at: new Date().toISOString(),
        };
        setProjects((prev) => [newProject, ...prev]);
        setActiveProject(newProject);
      }
    } catch {
      setError("Something went wrong. Make sure the backend is running.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRename = async (project: Project) => {
    if (!session || !editTitle.trim() || editTitle === project.title) {
      setEditingId(null);
      return;
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${project.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: editTitle.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, title: updated.title } : p)));
      if (activeProject?.id === project.id) setActiveProject((p) => p ? { ...p, title: updated.title } : p);
    }
    setEditingId(null);
  };

  const handleDelete = async (project: Project) => {
    if (!session) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/projects/${project.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
    if (activeProject?.id === project.id) startNewChat();
  };

  const latestMessage = messages[messages.length - 1] ?? null;

  const handleExportPDF = () => {
    if (!latestMessage || !activeProject) return;
    const m = latestMessage;
    const c = m.confidence;
    const a = m.analysis;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${activeProject.title} — Manuscript</title>
  <style>
    body { font-family: Georgia, serif; color: #1C1C1A; background: #fff; max-width: 680px; margin: 40px auto; padding: 0 24px; }
    h1 { font-size: 26px; margin-bottom: 4px; }
    .meta { color: #6B6B66; font-size: 13px; margin-bottom: 32px; font-family: sans-serif; }
    h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B6B66; font-family: sans-serif; margin: 28px 0 8px; }
    .comp { font-style: italic; font-size: 20px; margin: 0; }
    .signals { display: flex; gap: 24px; margin: 0; }
    .signal { font-family: sans-serif; font-size: 13px; }
    .signal strong { display: block; font-size: 15px; color: #1C1C1A; }
    p { font-size: 14px; line-height: 1.7; margin: 0; }
    ul { margin: 0; padding-left: 18px; }
    li { font-size: 14px; line-height: 1.7; margin-bottom: 4px; }
    .tags { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag { font-family: sans-serif; font-size: 12px; background: #EDF2ED; color: #3E5A3E; padding: 3px 10px; border-radius: 999px; }
    hr { border: none; border-top: 1px solid #E0DDD6; margin: 28px 0; }
    .footer { font-family: sans-serif; font-size: 11px; color: #6B6B66; margin-top: 40px; }
    @media print { body { margin: 24px auto; } }
  </style>
</head>
<body>
  <h1>${activeProject.title}</h1>
  <p class="meta">Generated by Manuscript · ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

  ${c.comp_pitch ? `<h2>Comp pitch</h2><p class="comp">${c.comp_pitch}</p>` : ""}
  ${c.query_hook ? `<h2>Query letter hook</h2><p>${c.query_hook}</p>` : ""}

  <hr />
  <h2>Market signals</h2>
  <div class="signals">
    <div class="signal"><strong>${c.market_category}</strong>Market</div>
    <div class="signal"><strong>${c.audience_enthusiasm}</strong>Enthusiasm</div>
    <div class="signal"><strong>${c.differentiation_score}/10</strong>Differentiation</div>
  </div>

  <hr />
  <h2>Analysis</h2>
  <p>${c.reasoning}</p>

  <hr />
  <h2>Recommendations</h2>
  <ul>${c.recommendations.map((r) => `<li>${r}</li>`).join("")}</ul>

  <hr />
  <h2>Concept breakdown</h2>
  <div class="signal" style="margin-bottom:12px"><strong>${a.genre}${a.subgenre ? ` · ${a.subgenre}` : ""}</strong>Genre</div>
  <div class="signal" style="margin-bottom:16px"><strong>${a.target_audience}</strong>Audience</div>
  <div class="tags">${a.themes.map((t) => `<span class="tag">${t}</span>`).join("")}</div>

  <p class="footer">Manuscript — manuscript.app</p>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.onload = () => w.print();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-ink-muted text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">

      {/* Top nav */}
      <nav className="shrink-0 bg-parchment border-b border-border h-12 flex items-center justify-between px-4">
        <span className="font-serif font-bold text-ink text-base tracking-tight">Manuscript</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink-muted">{session?.user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-ink-muted hover:text-ink transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Three-panel layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left sidebar */}
        <aside className="w-60 shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <button
              onClick={startNewChat}
              className="w-full text-left text-sm text-ink bg-parchment border border-border rounded-xl px-3 py-2.5 hover:border-sage transition-colors"
            >
              + New chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {projects.length === 0 ? (
              <p className="text-xs text-ink-muted px-4 py-3">No stories yet.</p>
            ) : (
              projects.map((p) => (
                <div
                  key={p.id}
                  className={`group relative flex items-center gap-1 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors ${
                    activeProject?.id === p.id ? "bg-sage-light" : "hover:bg-parchment"
                  }`}
                  onClick={() => editingId !== p.id && selectProject(p)}
                >
                  {editingId === p.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleRename(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(p);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 text-sm text-ink bg-transparent border-b border-sage focus:outline-none"
                    />
                  ) : (
                    <span className={`flex-1 text-sm truncate ${activeProject?.id === p.id ? "text-sage-dark font-medium" : "text-ink"}`}>
                      {p.title}
                    </span>
                  )}

                  {/* Edit / Delete — visible on hover */}
                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingId(p.id); setEditTitle(p.title); }}
                      className="text-ink-muted hover:text-ink p-0.5 transition-colors"
                      title="Rename"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                      className="text-ink-muted hover:text-red-600 p-0.5 transition-colors"
                      title="Delete"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center — chat */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Scrollable message history */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <p className="font-serif text-3xl text-ink mb-3">What&apos;s your book about?</p>
                <p className="text-ink-muted text-sm max-w-sm leading-relaxed">
                  Describe your concept below — premise, characters, setting, genre. The more detail, the better the analysis.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="space-y-4 max-w-2xl mx-auto w-full">
                {/* User concept */}
                <div className="flex justify-end">
                  <div className="bg-ink text-parchment rounded-2xl rounded-tr-sm px-5 py-3.5 max-w-prose">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.concept}</p>
                  </div>
                </div>

                {/* Analysis result */}
                <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
                  {/* Signals row */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-ink-muted uppercase tracking-widest">Market</p>
                      <span className={`self-start text-xs font-medium px-2.5 py-1 rounded-full ${categoryColors[msg.confidence.market_category]}`}>
                        {msg.confidence.market_category}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-ink-muted uppercase tracking-widest">Enthusiasm</p>
                      <span className={`self-start text-xs font-medium px-2.5 py-1 rounded-full ${enthusiasmColors[msg.confidence.audience_enthusiasm]}`}>
                        {msg.confidence.audience_enthusiasm}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-ink-muted uppercase tracking-widest">Differentiation</p>
                      <div className="flex items-center gap-1.5">
                        <div className="flex gap-0.5">
                          {Array.from({ length: 10 }).map((_, j) => (
                            <div key={j} className={`w-3 h-3 rounded-sm ${j < msg.confidence.differentiation_score ? "bg-sage" : "bg-border"}`} />
                          ))}
                        </div>
                        <span className="text-xs text-ink-muted">{msg.confidence.differentiation_score}/10</span>
                      </div>
                    </div>
                  </div>

                  {/* Comp pitch */}
                  {msg.confidence.comp_pitch && (
                    <div className="bg-parchment border border-border rounded-xl px-4 py-3">
                      <p className="text-xs text-ink-muted uppercase tracking-widest mb-1">Comp pitch</p>
                      <p className="font-serif text-ink text-base italic">{msg.confidence.comp_pitch}</p>
                    </div>
                  )}

                  {/* Reasoning */}
                  <p className="text-ink text-sm leading-relaxed">{msg.confidence.reasoning}</p>

                  {/* Recommendations */}
                  <ul className="space-y-1.5">
                    {msg.confidence.recommendations.map((r, j) => (
                      <li key={j} className="flex gap-2.5 text-sm text-ink-muted leading-relaxed">
                        <span className="text-sage shrink-0 mt-0.5">→</span>
                        {r}
                      </li>
                    ))}
                  </ul>

                  {/* Query hook */}
                  {msg.confidence.query_hook && (
                    <div className="bg-parchment border border-border rounded-xl px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-ink-muted uppercase tracking-widest">Query letter hook</p>
                        <button
                          onClick={() => navigator.clipboard.writeText(msg.confidence.query_hook!)}
                          className="text-xs text-ink-muted hover:text-sage transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-ink text-sm leading-relaxed">{msg.confidence.query_hook}</p>
                    </div>
                  )}

                  {/* Publication trend chart */}
                  {(() => {
                    const trend = buildTrend(msg.books);
                    if (!trend) return null;
                    return (
                      <div>
                        <p className="text-xs text-ink-muted uppercase tracking-widest mb-3">Publication trend</p>
                        <div className="flex items-end gap-px h-14">
                          {trend.years.map((year) => (
                            <div
                              key={year}
                              className="flex-1 bg-sage rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                              style={{ height: `${((trend.counts[year] || 0) / trend.max) * 100}%`, minHeight: trend.counts[year] ? "2px" : "0" }}
                              title={`${year}: ${trend.counts[year] || 0} title${(trend.counts[year] || 0) !== 1 ? "s" : ""}`}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-ink-muted">{trend.years[0]}</span>
                          <span className="text-xs text-ink-muted">{trend.years[trend.years.length - 1]}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Comparable books — scrollable strip */}
                  {msg.books.length > 0 && (
                    <div>
                      <p className="text-xs text-ink-muted uppercase tracking-widest mb-3">
                        {msg.books.length} comparable titles
                      </p>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {msg.books.map((book, j) => (
                          <button
                            key={j}
                            onClick={() => setSelectedBook(book)}
                            className="shrink-0 flex flex-col items-center gap-1.5 w-14 group"
                            title={book.title || ""}
                          >
                            <div className="w-10 h-14 rounded bg-parchment border border-border overflow-hidden group-hover:border-sage transition-colors">
                              {book.thumbnail ? (
                                <Image src={book.thumbnail} alt={book.title || ""} width={40} height={56} className="object-cover w-full h-full" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-border text-xs">📖</div>
                              )}
                            </div>
                            <p className="text-ink text-center leading-tight group-hover:text-sage-dark transition-colors" style={{ fontSize: "9px", lineHeight: "1.2" }}>
                              {(book.title || "").slice(0, 20)}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={chatBottomRef} />
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-border bg-parchment px-6 py-4">
            {error && (
              <p className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                {error}
              </p>
            )}
            <div className="max-w-2xl mx-auto bg-surface border border-border rounded-2xl px-5 py-4">
              <textarea
                ref={textareaRef}
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                }}
                placeholder={activeProject ? "Refine or continue your concept…" : "Describe your book concept…"}
                rows={3}
                className="w-full bg-transparent resize-none text-ink placeholder:text-ink-muted/50 text-sm leading-relaxed focus:outline-none"
              />
              <div className="flex items-center justify-between pt-3 border-t border-border mt-2">
                <span className="text-xs text-ink-muted">Shift+Enter for new line</span>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !concept.trim()}
                  className="inline-flex items-center gap-2 bg-ink text-parchment px-5 py-2 rounded-full text-xs font-medium disabled:opacity-40 hover:bg-sage-dark transition-colors"
                >
                  {submitting ? (
                    <>
                      <span className="w-3 h-3 border-2 border-parchment/30 border-t-parchment rounded-full animate-spin" />
                      Analyzing…
                    </>
                  ) : "Analyze →"}
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Right panel — latest analysis */}
        <aside
          style={{ width: sidebarWidth }}
          className="shrink-0 bg-surface border-l border-border overflow-y-auto relative flex"
        >
          {/* Drag handle */}
          <div
            onMouseDown={(e) => { isResizing.current = true; e.preventDefault(); }}
            className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-sage/40 transition-colors z-10"
          />

          <div className="flex-1 overflow-y-auto">
          {latestMessage ? (
            <div className="p-5 space-y-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-ink-muted uppercase tracking-widest mb-1">Project</p>
                  <p className="font-serif text-base text-ink">{activeProject?.title ?? "Untitled"}</p>
                </div>
                <button
                  onClick={handleExportPDF}
                  title="Export as PDF"
                  className="shrink-0 mt-0.5 text-xs text-ink-muted hover:text-ink border border-border rounded-lg px-2.5 py-1.5 hover:border-sage transition-colors"
                >
                  Export PDF
                </button>
              </div>

              <div>
                <p className="text-xs text-ink-muted uppercase tracking-widest mb-3">Latest analysis</p>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-ink-muted mb-1">Genre</p>
                    <p className="text-ink text-sm font-medium">{latestMessage.analysis.genre}</p>
                    {latestMessage.analysis.subgenre && (
                      <p className="text-ink-muted text-xs mt-0.5">{latestMessage.analysis.subgenre}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted mb-1">Audience</p>
                    <p className="text-ink text-sm leading-snug">{latestMessage.analysis.target_audience}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted mb-2">Themes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {latestMessage.analysis.themes.map((t) => (
                        <span key={t} className="bg-sage-light text-sage-dark text-xs px-2.5 py-1 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-ink-muted uppercase tracking-widest mb-3">Recommendations</p>
                <ul className="space-y-2">
                  {latestMessage.confidence.recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-ink leading-relaxed">
                      <span className="text-sage shrink-0 mt-0.5">→</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {latestMessage.confidence.comp_pitch && (
                <div className="bg-parchment border border-border rounded-xl px-4 py-3">
                  <p className="text-xs text-ink-muted uppercase tracking-widest mb-1">Comp pitch</p>
                  <p className="font-serif text-ink text-sm italic leading-snug">{latestMessage.confidence.comp_pitch}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-ink-muted uppercase tracking-widest mb-2">Signals</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Market</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColors[latestMessage.confidence.market_category]}`}>
                      {latestMessage.confidence.market_category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Enthusiasm</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${enthusiasmColors[latestMessage.confidence.audience_enthusiasm]}`}>
                      {latestMessage.confidence.audience_enthusiasm}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted">Differentiation</span>
                    <span className="text-xs text-ink font-medium">{latestMessage.confidence.differentiation_score}/10</span>
                  </div>
                </div>
              </div>

              {/* Query hook */}
              {latestMessage.confidence.query_hook && (
                <div className="bg-parchment border border-border rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted uppercase tracking-widest">Query hook</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(latestMessage.confidence.query_hook!)}
                      className="text-xs text-ink-muted hover:text-sage transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-ink text-xs leading-relaxed">{latestMessage.confidence.query_hook}</p>
                </div>
              )}

              {/* Differentiation score timeline */}
              {messages.length > 1 && (
                <div>
                  <p className="text-xs text-ink-muted uppercase tracking-widest mb-3">Differentiation over time</p>
                  <div className="flex items-end gap-1 h-10">
                    {messages.map((msg, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full bg-sage rounded-sm"
                          style={{ height: `${(msg.confidence.differentiation_score / 10) * 100}%` }}
                          title={`Session ${i + 1}: ${msg.confidence.differentiation_score}/10`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-ink-muted">{messages[0].confidence.differentiation_score}/10</span>
                    <span className={`text-xs font-medium ${latestMessage.confidence.differentiation_score > messages[0].confidence.differentiation_score ? "text-sage-dark" : latestMessage.confidence.differentiation_score < messages[0].confidence.differentiation_score ? "text-red-600" : "text-ink-muted"}`}>
                      {latestMessage.confidence.differentiation_score > messages[0].confidence.differentiation_score ? "↑ " : latestMessage.confidence.differentiation_score < messages[0].confidence.differentiation_score ? "↓ " : ""}
                      {latestMessage.confidence.differentiation_score}/10
                    </span>
                  </div>
                </div>
              )}

              <p className="text-xs text-ink-muted">{messages.length} session{messages.length !== 1 ? "s" : ""} in this project</p>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-6">
              <p className="text-xs text-ink-muted text-center leading-relaxed">
                Analysis details will appear here after your first submission.
              </p>
            </div>
          )}
          </div>
        </aside>

      </div>

      {/* Book detail modal */}
      {selectedBook && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setSelectedBook(null)}
        >
          <div
            className="bg-parchment rounded-2xl border border-border w-full max-w-md p-7 flex gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cover */}
            <div className="shrink-0 w-20 h-28 rounded-lg bg-surface border border-border overflow-hidden">
              {selectedBook.thumbnail ? (
                <Image src={selectedBook.thumbnail} alt={selectedBook.title || ""} width={80} height={112} className="object-cover w-full h-full" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-border text-2xl">📖</div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-serif text-lg text-ink leading-snug">{selectedBook.title || "Untitled"}</h3>
                <button
                  onClick={() => setSelectedBook(null)}
                  className="shrink-0 text-ink-muted hover:text-ink transition-colors text-base leading-none mt-0.5"
                >
                  ✕
                </button>
              </div>

              {selectedBook.authors.length > 0 && (
                <p className="text-ink-muted text-sm">{selectedBook.authors.join(", ")}</p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {selectedBook.published_date && (
                  <span className="text-xs text-ink-muted">{selectedBook.published_date}</span>
                )}
                {selectedBook.rating && (
                  <span className="text-xs text-ink-muted">
                    ★ {selectedBook.rating.toFixed(1)}
                    {selectedBook.ratings_count && (
                      <span className="opacity-60 ml-1">({selectedBook.ratings_count.toLocaleString()} ratings)</span>
                    )}
                  </span>
                )}
                {selectedBook.edition_count && (
                  <span className="text-xs text-ink-muted">{selectedBook.edition_count} editions</span>
                )}
              </div>

              {selectedBook.link ? (
                <a
                  href={selectedBook.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs px-2.5 py-1 rounded-full bg-sage-light text-sage-dark hover:bg-sage hover:text-parchment transition-colors"
                >
                  {selectedBook.source === "google_books" ? "Google Books ↗" : selectedBook.source === "hardcover" ? "Hardcover ↗" : "Open Library ↗"}
                </a>
              ) : (
                <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-sage-light text-sage-dark">
                  {selectedBook.source === "google_books" ? "Google Books" : selectedBook.source === "hardcover" ? "Hardcover" : "Open Library"}
                </span>
              )}

              {selectedBook.description && (
                <p className="text-ink-muted text-xs leading-relaxed line-clamp-6 pt-1 border-t border-border">
                  {selectedBook.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
