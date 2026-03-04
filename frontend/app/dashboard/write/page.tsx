"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// --- Types ---

interface Chapter {
  id: string;
  novel_id: string;
  title: string;
  content: string;
  order: number;
  word_count: number;
  created_at: string;
  updated_at: string;
}

interface Novel {
  id: string;
  title: string;
  project_id: string | null;
  chapters: Chapter[];
  created_at: string;
  updated_at: string;
}

interface AIMessage {
  role: "user" | "assistant";
  content: string;
  actionLabel?: string;
}

interface GrammarIssue {
  original_text: string;
  suggestion: string;
  explanation: string;
  type: "clarity" | "pacing" | "consistency" | "voice" | "structure";
}

interface SimpleFix {
  original: string;
  corrected: string;
}

interface GrammarResult {
  corrected_html: string;
  simple_fixes: SimpleFix[];
  issues: GrammarIssue[];
}

// --- Grammar highlight extension (ProseMirror decorations, never saved) ---

const grammarHighlightKey = new PluginKey<DecorationSet>("grammarHighlight");

const GrammarHighlight = Extension.create({
  name: "grammarHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: grammarHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(grammarHighlightKey);
            if (next !== undefined) return next;
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return grammarHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});

// --- Sortable chapter item ---

function SortableChapterItem({
  chapter,
  isActive,
  onSelect,
  onRename,
  deleteMode,
  isSelected,
  onToggleSelect,
  onDelete,
}: {
  chapter: Chapter;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  deleteMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapter.title);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const commitRename = () => {
    setEditing(false);
    if (draft.trim() && draft !== chapter.title) onRename(draft.trim());
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        deleteMode
          ? isSelected ? "bg-red-50 border border-red-200" : "hover:bg-red-50/50"
          : isActive ? "bg-sage-light" : "hover:bg-parchment"
      }`}
      onClick={() => deleteMode ? onToggleSelect() : !editing && onSelect()}
    >
      {/* Checkbox (delete mode) or drag handle */}
      {deleteMode ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 accent-red-500 cursor-pointer"
        />
      ) : (
        <span
          {...attributes}
          {...listeners}
          className="shrink-0 text-ink-muted/40 hover:text-ink-muted cursor-grab active:cursor-grabbing text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
      )}

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setEditing(false); setDraft(chapter.title); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs text-ink bg-transparent border-b border-sage focus:outline-none"
          />
        ) : (
          <span
            className={`block text-xs truncate ${isActive ? "text-sage-dark font-medium" : "text-ink"}`}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
          >
            {chapter.title}
          </span>
        )}
        <span className="text-ink-muted/60 text-xs">
          {chapter.word_count > 0 ? `${chapter.word_count.toLocaleString()} words` : "Empty"}
        </span>
      </div>

      {/* Individual delete — hover only, hidden in delete mode */}
      {!deleteMode && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="hidden group-hover:block shrink-0 text-ink-muted/40 hover:text-red-500 transition-colors p-0.5"
          title="Delete chapter"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// --- Main Write page ---

export default function WritePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [novels, setNovels] = useState<Novel[]>([]);
  const [openNovelId, setOpenNovelId] = useState<string | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  // Novel title inline editing
  const [editingNovelId, setEditingNovelId] = useState<string | null>(null);
  const [editingNovelTitle, setEditingNovelTitle] = useState("");

  // Chapter title inline editing (header above editor)
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");
  const [savingChapterTitle, setSavingChapterTitle] = useState(false);

  // Auto-save state
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Delete mode
  const [deleteModeNovelId, setDeleteModeNovelId] = useState<string | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [deleteChaptersConfirm, setDeleteChaptersConfirm] = useState(false);
  const [deleteNovelConfirmId, setDeleteNovelConfirmId] = useState<string | null>(null);
  const [deleteSingleChapterConfirm, setDeleteSingleChapterConfirm] = useState<{ id: string; title: string } | null>(null);

  // AI sidebar
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiFollowUp, setAiFollowUp] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);

  // Grammar check
  const [grammarResult, setGrammarResult] = useState<GrammarResult | null>(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [dismissedIssues, setDismissedIssues] = useState<Set<number>>(new Set());
  const [activeIssueIndex, setActiveIssueIndex] = useState<number | null>(null);

  // Derived helpers
  const activeNovel = novels.find((n) => n.id === openNovelId) ?? null;
  const activeChapter = activeNovel?.chapters.find((c) => c.id === activeChapterId) ?? null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // --- Auth gate ---
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      if (!s) { router.replace("/"); return; }
      setSession(s);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // --- Load novels ---
  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/novels`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data: Novel[] = await res.json();
        setNovels(data);

        // Open novel from query param
        const paramNovelId = searchParams.get("novel");
        if (paramNovelId) {
          const target = data.find((n) => n.id === paramNovelId);
          if (target) {
            setOpenNovelId(target.id);
            if (target.chapters.length > 0) {
              setActiveChapterId(target.chapters[0].id);
              setChapterTitleDraft(target.chapters[0].title);
            }
          }
        }
      }
    })();
  }, [session, searchParams]);

  // Sync chapter title draft when active chapter changes
  useEffect(() => {
    if (activeChapter) setChapterTitleDraft(activeChapter.title);
  }, [activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Save function (used by debounce + Ctrl+S) ---
  const saveChapter = useCallback(async (chapterId: string, content: string, wordCount: number, novelId: string, token: string) => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chapters/${chapterId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content, word_count: wordCount }),
    });
    setNovels((prev) =>
      prev.map((n) =>
        n.id === novelId
          ? { ...n, chapters: n.chapters.map((c) => (c.id === chapterId ? { ...c, content, word_count: wordCount } : c)) }
          : n
      )
    );
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  // --- TipTap editor ---
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: "Begin your story…" }),
      CharacterCount,
      GrammarHighlight,
    ],
    content: activeChapter?.content ?? "",
    editorProps: {
      attributes: {
        class:
          "prose prose-lg focus:outline-none font-serif text-ink leading-relaxed min-h-[60vh]",
        style: "font-size: 18px; line-height: 1.8;",
      },
    },
    onUpdate: ({ editor }) => {
      if (!activeChapterId || !session || !openNovelId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const content = editor.getHTML();
      const wordCount = editor.storage.characterCount?.words() ?? 0;
      saveTimerRef.current = setTimeout(() => {
        saveChapter(activeChapterId, content, wordCount, openNovelId, session.access_token);
      }, 3000);
    },
  });

  // --- Ctrl+S: flush save immediately ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!editor || !activeChapterId || !session || !openNovelId) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        const content = editor.getHTML();
        const wordCount = editor.storage.characterCount?.words() ?? 0;
        saveChapter(activeChapterId, content, wordCount, openNovelId, session.access_token);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, activeChapterId, openNovelId, session, saveChapter]);

  // Load chapter content into editor when active chapter changes
  useEffect(() => {
    if (!editor || !activeChapter) return;
    if (editor.getHTML() !== activeChapter.content) {
      editor.commands.setContent(activeChapter.content || "");
    }
  }, [activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const wordCount = editor?.storage.characterCount?.words() ?? activeChapter?.word_count ?? 0;

  // --- Novel title update ---
  const commitNovelRename = async (novel: Novel, newTitle: string) => {
    if (!session || !newTitle.trim() || newTitle === novel.title) {
      setEditingNovelId(null);
      return;
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/novels/${novel.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setNovels((prev) => prev.map((n) => (n.id === novel.id ? { ...n, title: updated.title } : n)));
    }
    setEditingNovelId(null);
  };

  // --- Chapter title update ---
  const commitChapterTitle = async () => {
    if (!session || !activeChapterId || !chapterTitleDraft.trim()) return;
    if (chapterTitleDraft === activeChapter?.title) return;
    setSavingChapterTitle(true);
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chapters/${activeChapterId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: chapterTitleDraft.trim() }),
    });
    setNovels((prev) =>
      prev.map((n) =>
        n.id === openNovelId
          ? {
              ...n,
              chapters: n.chapters.map((c) =>
                c.id === activeChapterId ? { ...c, title: chapterTitleDraft.trim() } : c
              ),
            }
          : n
      )
    );
    setSavingChapterTitle(false);
  };

  // --- Create chapter ---
  const createChapter = async (novelId: string) => {
    if (!session) return;
    const novel = novels.find((n) => n.id === novelId);
    if (!novel) return;
    const nextOrder = novel.chapters.length;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/novels/${novelId}/chapters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: `Chapter ${nextOrder + 1}`, order: nextOrder }),
    });
    if (res.ok) {
      const chapter: Chapter = await res.json();
      setNovels((prev) =>
        prev.map((n) =>
          n.id === novelId ? { ...n, chapters: [...n.chapters, chapter] } : n
        )
      );
      setActiveChapterId(chapter.id);
      setChapterTitleDraft(chapter.title);
      editor?.commands.setContent("");
    }
  };

  // --- Reorder chapters via drag ---
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !activeNovel || !session) return;

      const oldIndex = activeNovel.chapters.findIndex((c) => c.id === active.id);
      const newIndex = activeNovel.chapters.findIndex((c) => c.id === over.id);
      const reordered = arrayMove(activeNovel.chapters, oldIndex, newIndex).map((c, i) => ({
        ...c,
        order: i,
      }));

      setNovels((prev) =>
        prev.map((n) => (n.id === activeNovel.id ? { ...n, chapters: reordered } : n))
      );

      // Persist each changed order
      for (const ch of reordered) {
        const original = activeNovel.chapters.find((c) => c.id === ch.id);
        if (original && original.order !== ch.order) {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chapters/${ch.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ order: ch.order }),
          });
        }
      }
    },
    [activeNovel, session]
  );

  // --- Rename chapter from sidebar ---
  const renameChapterFromSidebar = async (chapter: Chapter, newTitle: string) => {
    if (!session) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chapters/${chapter.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ title: newTitle }),
    });
    setNovels((prev) =>
      prev.map((n) =>
        n.id === openNovelId
          ? { ...n, chapters: n.chapters.map((c) => (c.id === chapter.id ? { ...c, title: newTitle } : c)) }
          : n
      )
    );
    if (activeChapterId === chapter.id) setChapterTitleDraft(newTitle);
  };

  // --- Delete selected chapters ---
  const deleteSelectedChapters = async () => {
    if (!session || selectedChapterIds.size === 0) return;
    for (const chapterId of selectedChapterIds) {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chapters/${chapterId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
    setNovels((prev) =>
      prev.map((n) =>
        n.id === deleteModeNovelId
          ? { ...n, chapters: n.chapters.filter((c) => !selectedChapterIds.has(c.id)) }
          : n
      )
    );
    if (activeChapterId && selectedChapterIds.has(activeChapterId)) {
      setActiveChapterId(null);
      editor?.commands.setContent("");
    }
    setSelectedChapterIds(new Set());
    setDeleteChaptersConfirm(false);
    setDeleteModeNovelId(null);
  };

  // --- Delete single chapter ---
  const deleteSingleChapter = async (chapterId: string) => {
    if (!session || !openNovelId) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chapters/${chapterId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setNovels((prev) =>
      prev.map((n) =>
        n.id === openNovelId
          ? { ...n, chapters: n.chapters.filter((c) => c.id !== chapterId) }
          : n
      )
    );
    if (activeChapterId === chapterId) {
      setActiveChapterId(null);
      editor?.commands.setContent("");
    }
    setDeleteSingleChapterConfirm(null);
  };

  // --- Delete novel ---
  const deleteNovel = async (novelId: string) => {
    if (!session) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/novels/${novelId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setNovels((prev) => prev.filter((n) => n.id !== novelId));
    if (openNovelId === novelId) setOpenNovelId(null);
    if (activeNovel?.id === novelId) { setActiveChapterId(null); editor?.commands.setContent(""); }
    setDeleteNovelConfirmId(null);
    setDeleteModeNovelId(null);
  };

  // --- Insert scene break ---
  const insertSceneBreak = () => {
    editor?.chain().focus().insertContent({ type: "paragraph", content: [{ type: "text", text: "* * *" }] }).run();
  };

  // --- AI assist ---
  const callAIAssist = async (action: string, label?: string) => {
    if (!session || !activeNovel || !activeChapter) return;
    setAiLoading(true);
    setActiveAction(action);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/novels/${activeNovel.id}/assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          current_chapter_content: editor?.getHTML() ?? "",
          current_chapter_title: activeChapter.title,
          conversation_history: aiMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response, actionLabel: label },
        ]);
      }
    } finally {
      setAiLoading(false);
      setActiveAction(null);
    }
  };

  const sendFollowUp = async () => {
    if (!aiFollowUp.trim() || !session || !activeNovel || !activeChapter) return;
    const userMsg: AIMessage = { role: "user", content: aiFollowUp.trim() };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiFollowUp("");
    setAiLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/novels/${activeNovel.id}/assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "chat",
          current_chapter_content: editor?.getHTML() ?? "",
          current_chapter_title: activeChapter.title,
          conversation_history: [...aiMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      }
    } finally {
      setAiLoading(false);
    }
  };

  // --- Grammar highlight helpers ---
  const setGrammarDecorations = useCallback((fixes: SimpleFix[]) => {
    if (!editor) return;
    const { state, dispatch } = editor.view;
    const decorations: Decoration[] = [];

    for (const fix of fixes) {
      const lower = fix.original.toLowerCase();
      state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return;
        let offset = 0;
        while (true) {
          const idx = node.text.toLowerCase().indexOf(lower, offset);
          if (idx === -1) break;
          decorations.push(
            Decoration.inline(pos + idx, pos + idx + fix.original.length, {
              class: "grammar-fix-highlight",
              title: `Fix: "${fix.corrected}"`,
            })
          );
          offset = idx + 1;
        }
      });
    }

    const set = DecorationSet.create(state.doc, decorations);
    dispatch(state.tr.setMeta(grammarHighlightKey, set));
  }, [editor]);

  const clearGrammarDecorations = useCallback(() => {
    if (!editor) return;
    const { state, dispatch } = editor.view;
    dispatch(state.tr.setMeta(grammarHighlightKey, DecorationSet.empty));
  }, [editor]);

  // --- Grammar check ---
  const runGrammarCheck = async () => {
    if (!session || !activeNovel || !activeChapter || !editor) return;
    setGrammarLoading(true);
    setGrammarResult(null);
    clearGrammarDecorations();
    setDismissedIssues(new Set());
    setActiveIssueIndex(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/novels/${activeNovel.id}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          action: "grammar_check",
          current_chapter_content: editor.getHTML(),
          current_chapter_title: activeChapter.title,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const result: GrammarResult = data.grammar_result;
        setGrammarResult(result);
        // Highlight simple fixes in the editor immediately
        if (result.simple_fixes?.length > 0) {
          setGrammarDecorations(result.simple_fixes);
        }
      }
    } finally {
      setGrammarLoading(false);
    }
  };

  const applySimpleFixes = () => {
    if (!grammarResult || !editor || !activeChapterId || !session || !openNovelId) return;
    clearGrammarDecorations();
    editor.commands.setContent(grammarResult.corrected_html);
    const wordCount = editor.storage.characterCount?.words() ?? 0;
    saveChapter(activeChapterId, grammarResult.corrected_html, wordCount, openNovelId, session.access_token);
    setGrammarResult((prev) => prev ? { ...prev, simple_fixes: [] } : null);
  };

  const findTextInEditor = (searchText: string): { from: number; to: number } | null => {
    if (!editor) return null;
    const lower = searchText.toLowerCase().trim();
    let result: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (result) return false;
      if (node.isText && node.text) {
        const idx = node.text.toLowerCase().indexOf(lower);
        if (idx !== -1) {
          result = { from: pos + idx, to: pos + idx + searchText.length };
        }
      }
    });
    return result;
  };

  const highlightIssueInEditor = (issue: GrammarIssue, index: number) => {
    const pos = findTextInEditor(issue.original_text);
    if (!pos || !editor) return;
    setActiveIssueIndex(index);
    editor.commands.setTextSelection(pos);
    editor.view.focus();
  };

  const applyIssueSuggestion = (issue: GrammarIssue, index: number) => {
    if (!editor || !activeChapterId || !session || !openNovelId) return;
    const pos = findTextInEditor(issue.original_text);
    if (pos) {
      editor.chain().focus().setTextSelection(pos).insertContent(issue.suggestion).run();
    }
    dismissIssue(index);
    const content = editor.getHTML();
    const wordCount = editor.storage.characterCount?.words() ?? 0;
    saveChapter(activeChapterId, content, wordCount, openNovelId, session.access_token);
  };

  const dismissIssue = (index: number) => {
    setDismissedIssues((prev) => new Set([...prev, index]));
    if (activeIssueIndex === index) setActiveIssueIndex(null);
  };

  const issueTypeColors: Record<string, string> = {
    clarity:     "bg-amber-50 text-amber-700 border-amber-200",
    pacing:      "bg-blue-50 text-blue-700 border-blue-200",
    consistency: "bg-red-50 text-red-700 border-red-200",
    voice:       "bg-purple-50 text-purple-700 border-purple-200",
    structure:   "bg-orange-50 text-orange-700 border-orange-200",
  };

  // --- Loading state ---
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
        <div className="flex items-center gap-6">
          <span className="font-serif font-bold text-ink text-base tracking-tight">Manuscript</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm text-ink-muted hover:text-ink pb-0.5 px-1 border-b-2 border-transparent hover:border-ink-muted transition-colors"
            >
              Ideate
            </button>
            <span className="text-sm font-medium text-sage-dark border-b-2 border-sage pb-0.5 px-1">
              Write
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink-muted">
            Hi, {session?.user.user_metadata?.first_name ?? session?.user.email?.split("@")[0]}
          </span>
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

        {/* Left sidebar — novel accordion */}
        <aside className="w-60 shrink-0 bg-surface border-r border-border flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto py-2">
            {novels.length === 0 ? (
              <div className="px-4 py-6 text-center space-y-2">
                <p className="text-xs text-ink-muted leading-relaxed">
                  No novels yet. Finalize an idea in Ideate to begin writing.
                </p>
                <button
                  onClick={() => router.push("/dashboard")}
                  className="text-xs text-sage-dark hover:text-sage transition-colors"
                >
                  Go to Ideate →
                </button>
              </div>
            ) : (
              novels.map((novel) => (
                <div key={novel.id} className="mb-3">
                  {/* Novel header */}
                  <div
                    className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors ${
                      openNovelId === novel.id ? "bg-parchment" : "hover:bg-parchment"
                    }`}
                    onClick={() => {
                      if (deleteModeNovelId === novel.id) return;
                      setOpenNovelId(openNovelId === novel.id ? null : novel.id);
                    }}
                  >
                    <span className="text-ink-muted/50 text-xs shrink-0">
                      {openNovelId === novel.id ? "▾" : "▸"}
                    </span>

                    {editingNovelId === novel.id ? (
                      <input
                        autoFocus
                        value={editingNovelTitle}
                        onChange={(e) => setEditingNovelTitle(e.target.value)}
                        onBlur={() => commitNovelRename(novel, editingNovelTitle)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitNovelRename(novel, editingNovelTitle);
                          if (e.key === "Escape") setEditingNovelId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 text-sm text-ink bg-transparent border-b border-sage focus:outline-none"
                      />
                    ) : (
                      <span
                        className="flex-1 text-sm text-ink truncate font-medium"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (deleteModeNovelId !== novel.id) {
                            setEditingNovelId(novel.id);
                            setEditingNovelTitle(novel.title);
                          }
                        }}
                      >
                        {novel.title}
                      </span>
                    )}

                    {/* Trash toggle — visible on hover */}
                    {deleteModeNovelId !== novel.id && editingNovelId !== novel.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModeNovelId(novel.id);
                          setSelectedChapterIds(new Set());
                          setOpenNovelId(novel.id);
                        }}
                        className="hidden group-hover:block shrink-0 text-ink-muted/50 hover:text-red-500 transition-colors p-0.5"
                        title="Delete"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    )}

                    {/* Cancel delete mode */}
                    {deleteModeNovelId === novel.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModeNovelId(null);
                          setSelectedChapterIds(new Set());
                        }}
                        className="shrink-0 text-xs text-ink-muted hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* Chapters drawer */}
                  <div
                    className="overflow-hidden transition-all duration-200 ease-in-out"
                    style={{ maxHeight: openNovelId === novel.id ? "600px" : "0px" }}
                  >
                    <div className="pl-4 pr-2 pt-1 pb-2 space-y-1">

                      {/* Delete mode controls */}
                      {deleteModeNovelId === novel.id && novel.chapters.length > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 mb-1 border-b border-red-100">
                          <input
                            type="checkbox"
                            checked={selectedChapterIds.size === novel.chapters.length}
                            onChange={() => {
                              if (selectedChapterIds.size === novel.chapters.length) {
                                setSelectedChapterIds(new Set());
                              } else {
                                setSelectedChapterIds(new Set(novel.chapters.map((c) => c.id)));
                              }
                            }}
                            className="accent-red-500 cursor-pointer"
                          />
                          <span className="text-xs text-ink-muted flex-1">Select all</span>
                          {selectedChapterIds.size > 0 && (
                            <button
                              onClick={() => setDeleteChaptersConfirm(true)}
                              className="text-xs text-red-600 font-medium hover:text-red-700 transition-colors"
                            >
                              Delete {selectedChapterIds.size}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Delete novel button — only when no chapters remain */}
                      {deleteModeNovelId === novel.id && novel.chapters.length === 0 && (
                        <button
                          onClick={() => setDeleteNovelConfirmId(novel.id)}
                          className="w-full text-xs text-red-600 font-medium border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors mb-1"
                        >
                          Delete novel
                        </button>
                      )}

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={novel.chapters.map((c) => c.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {novel.chapters.map((chapter) => (
                            <SortableChapterItem
                              key={chapter.id}
                              chapter={chapter}
                              isActive={activeChapterId === chapter.id}
                              onSelect={() => {
                                setActiveChapterId(chapter.id);
                                setChapterTitleDraft(chapter.title);
                                editor?.commands.setContent(chapter.content || "");
                              }}
                              onRename={(title) => renameChapterFromSidebar(chapter, title)}
                              onDelete={() => setDeleteSingleChapterConfirm({ id: chapter.id, title: chapter.title })}
                              deleteMode={deleteModeNovelId === novel.id}
                              isSelected={selectedChapterIds.has(chapter.id)}
                              onToggleSelect={() => {
                                setSelectedChapterIds((prev) => {
                                  const next = new Set(prev);
                                  next.has(chapter.id) ? next.delete(chapter.id) : next.add(chapter.id);
                                  return next;
                                });
                              }}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>

                      {deleteModeNovelId !== novel.id && (
                        <button
                          onClick={() => createChapter(novel.id)}
                          className="w-full mt-1 text-left text-xs text-ink-muted hover:text-sage-dark px-3 py-1.5 rounded-lg hover:bg-parchment transition-colors"
                        >
                          + New chapter
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center — editor */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {!activeChapter ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <p className="font-serif text-2xl text-ink mb-2">Your story starts here.</p>
              <p className="text-ink-muted text-sm mb-6">Add your first chapter to begin.</p>
              {activeNovel ? (
                <button
                  onClick={() => createChapter(activeNovel.id)}
                  className="bg-ink text-parchment px-5 py-2 rounded-full text-sm font-medium hover:bg-sage-dark transition-colors"
                >
                  Add first chapter
                </button>
              ) : novels.length === 0 ? null : (
                <p className="text-xs text-ink-muted">Select a novel from the sidebar.</p>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Toolbar */}
              <div className="shrink-0 bg-parchment border-b border-border px-6 py-2 flex items-center gap-3">
                <button
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    editor?.isActive("bold")
                      ? "border-sage bg-sage-light text-sage-dark"
                      : "border-border hover:border-sage text-ink-muted hover:text-ink"
                  }`}
                >
                  B
                </button>
                <button
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                  className={`text-xs px-2 py-1 rounded border transition-colors italic ${
                    editor?.isActive("italic")
                      ? "border-sage bg-sage-light text-sage-dark"
                      : "border-border hover:border-sage text-ink-muted hover:text-ink"
                  }`}
                >
                  I
                </button>
                <button
                  onClick={() => editor?.chain().focus().toggleUnderline().run()}
                  className={`text-xs px-2 py-1 rounded border transition-colors underline ${
                    editor?.isActive("underline")
                      ? "border-sage bg-sage-light text-sage-dark"
                      : "border-border hover:border-sage text-ink-muted hover:text-ink"
                  }`}
                >
                  U
                </button>
                <div className="w-px h-4 bg-border" />
                <button
                  onClick={insertSceneBreak}
                  className="text-xs px-2 py-1 rounded border border-border hover:border-sage text-ink-muted hover:text-ink transition-colors"
                  title="Insert scene break"
                >
                  * * *
                </button>
              </div>

              {/* Editor area */}
              <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-[680px] mx-auto">
                  {/* Chapter title */}
                  <input
                    value={chapterTitleDraft}
                    onChange={(e) => setChapterTitleDraft(e.target.value)}
                    onBlur={commitChapterTitle}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitChapterTitle(); editor?.commands.focus(); } }}
                    className={`w-full font-serif text-3xl text-ink font-bold mb-6 bg-transparent focus:outline-none border-b-2 ${
                      savingChapterTitle ? "border-sage/40" : "border-transparent focus:border-sage/40"
                    } transition-colors`}
                  />

                  {/* TipTap editor */}
                  <EditorContent editor={editor} />
                </div>
              </div>

              {/* Bottom bar: saved indicator + word count */}
              <div className="shrink-0 flex items-center justify-end gap-4 px-6 py-2 border-t border-border bg-parchment text-xs text-ink-muted">
                {savedFlash && (
                  <span className="text-sage-dark transition-opacity duration-500">Saved</span>
                )}
                <span>{wordCount.toLocaleString()} words</span>
              </div>
            </div>
          )}

          {/* AI toggle button */}
          <button
            onClick={() => setAiOpen((v) => !v)}
            className="fixed right-4 top-1/2 -translate-y-1/2 z-20 bg-ink text-parchment rounded-full w-9 h-9 flex items-center justify-center shadow-lg hover:bg-sage-dark transition-colors"
            title="AI Assistant"
            style={{ right: aiOpen ? "336px" : "16px" }}
          >
            ✦
          </button>
        </main>

        {/* Right AI sidebar */}
        {aiOpen && (
          <aside className="w-80 shrink-0 bg-surface border-l border-border flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-medium text-ink">AI Assistant</span>
              <button
                onClick={() => setAiOpen(false)}
                className="text-ink-muted hover:text-ink transition-colors text-sm"
              >
                ✕
              </button>
            </div>

            {!activeChapter ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <p className="text-xs text-ink-muted text-center leading-relaxed">
                  Select a chapter to use the AI assistant.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Action buttons */}
                <div className="p-4 space-y-2">
                  {[
                    { action: "get_unstuck", label: "Get unstuck", desc: "2-3 story directions" },
                    { action: "continuity_check", label: "Continuity check", desc: "Scan for inconsistencies" },
                    { action: "strengthen_scene", label: "Strengthen this scene", desc: "Pacing, tension, voice" },
                    { action: "reader_perspective", label: "What would my reader think?", desc: "Reader reaction" },
                  ].map(({ action, label, desc }) => (
                    <button
                      key={action}
                      onClick={() => { setGrammarResult(null); callAIAssist(action, label); }}
                      disabled={aiLoading || grammarLoading}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        activeAction === action
                          ? "border-sage bg-sage-light"
                          : "border-border hover:border-sage bg-parchment hover:bg-sage-light disabled:opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-ink">{label}</p>
                        {activeAction === action && (
                          <span className="w-3 h-3 border-2 border-sage/40 border-t-sage rounded-full animate-spin shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">{desc}</p>
                    </button>
                  ))}
                  {/* Fix grammar — separate treatment */}
                  <button
                    onClick={() => { setAiMessages([]); runGrammarCheck(); }}
                    disabled={aiLoading || grammarLoading}
                    className="w-full text-left px-4 py-3 rounded-xl border border-border hover:border-sage bg-parchment hover:bg-sage-light transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-ink">Fix grammar</p>
                    <p className="text-xs text-ink-muted mt-0.5">Spelling, grammar & bigger issues</p>
                  </button>
                </div>

                {/* Grammar check loading */}
                {grammarLoading && (
                  <div className="flex items-center gap-2 text-xs text-ink-muted px-4 pb-3">
                    <span className="w-3 h-3 border-2 border-ink-muted/30 border-t-ink-muted rounded-full animate-spin" />
                    Checking grammar…
                  </div>
                )}

                {/* Grammar results */}
                {grammarResult && !grammarLoading && (
                  <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
                    {/* Simple fixes */}
                    <div className="bg-parchment border border-border rounded-xl p-4 space-y-2">
                      <p className="text-xs font-medium text-ink uppercase tracking-widest">Simple fixes</p>
                      {grammarResult.simple_fixes?.length > 0 ? (
                        <>
                          <p className="text-xs text-ink-muted leading-relaxed">
                            <span className="text-ink font-medium">{grammarResult.simple_fixes.length}</span> spelling or grammar fix{grammarResult.simple_fixes.length !== 1 ? "es" : ""} highlighted in yellow. Apply them all at once.
                          </p>
                          <button
                            onClick={applySimpleFixes}
                            className="w-full text-xs font-medium text-parchment bg-sage rounded-lg py-1.5 hover:bg-sage-dark transition-colors"
                          >
                            Apply {grammarResult.simple_fixes.length} fix{grammarResult.simple_fixes.length !== 1 ? "es" : ""}
                          </button>
                        </>
                      ) : (
                        <p className="text-xs text-ink-muted">No spelling or grammar errors found.</p>
                      )}
                    </div>

                    {/* Issues requiring author input */}
                    {grammarResult.issues.filter((_, i) => !dismissedIssues.has(i)).length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-ink uppercase tracking-widest">Needs your attention</p>
                        {grammarResult.issues.map((issue, i) => {
                          if (dismissedIssues.has(i)) return null;
                          const colorClass = issueTypeColors[issue.type] ?? "bg-surface text-ink-muted border-border";
                          return (
                            <div
                              key={i}
                              className={`rounded-xl border p-3 space-y-2 cursor-pointer transition-all ${
                                activeIssueIndex === i ? "ring-2 ring-sage/50" : ""
                              } bg-parchment border-border`}
                              onClick={() => highlightIssueInEditor(issue, i)}
                            >
                              {/* Type badge */}
                              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${colorClass}`}>
                                {issue.type}
                              </span>

                              {/* Original text */}
                              <p className="text-xs text-ink-muted italic line-clamp-2">
                                "{issue.original_text}"
                              </p>

                              {/* Explanation */}
                              <p className="text-xs text-ink leading-relaxed">{issue.explanation}</p>

                              {/* Suggestion */}
                              <div className="bg-surface rounded-lg px-3 py-2">
                                <p className="text-xs text-ink-muted mb-0.5">Suggestion</p>
                                <p className="text-xs text-ink italic">"{issue.suggestion}"</p>
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); applyIssueSuggestion(issue, i); }}
                                  className="flex-1 text-xs font-medium text-parchment bg-ink rounded-lg py-1.5 hover:bg-sage-dark transition-colors"
                                >
                                  Apply
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); dismissIssue(i); }}
                                  className="flex-1 text-xs text-ink-muted border border-border rounded-lg py-1.5 hover:border-ink transition-colors"
                                >
                                  Ignore
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-muted text-center py-2">No major issues found.</p>
                    )}

                    {/* Clear grammar results */}
                    <button
                      onClick={() => { setGrammarResult(null); setDismissedIssues(new Set()); setActiveIssueIndex(null); clearGrammarDecorations(); }}
                      className="w-full text-xs text-ink-muted hover:text-ink transition-colors py-1"
                    >
                      ← Back to assistant
                    </button>
                  </div>
                )}

                {/* Conversation */}
                {!grammarResult && aiMessages.length > 0 && (
                  <div className="flex-1 overflow-y-auto flex flex-col">
                    <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
                      <span className="text-xs text-ink-muted uppercase tracking-widest">Conversation</span>
                      <button
                        onClick={() => setAiMessages([])}
                        className="text-xs text-ink-muted hover:text-ink transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={msg.role === "user" ? "text-right" : ""}>
                        {msg.role === "assistant" ? (
                          <div className="bg-parchment border border-border rounded-xl p-4 space-y-2">
                            {msg.actionLabel && (
                              <p className="text-xs text-sage font-medium">{msg.actionLabel}</p>
                            )}
                            <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            <button
                              onClick={() => navigator.clipboard.writeText(msg.content)}
                              className="text-xs text-ink-muted hover:text-sage transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                        ) : (
                          <span className="inline-block bg-ink text-parchment text-xs rounded-2xl rounded-tr-sm px-3 py-2">
                            {msg.content}
                          </span>
                        )}
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex items-center gap-2 text-xs text-ink-muted">
                        <span className="w-3 h-3 border-2 border-ink-muted/30 border-t-ink-muted rounded-full animate-spin" />
                        Thinking…
                      </div>
                    )}
                    </div>
                  </div>
                )}

                {/* Follow-up input */}
                {!grammarResult && aiMessages.length > 0 && (
                  <div className="shrink-0 border-t border-border p-3">
                    <div className="flex gap-2">
                      <input
                        value={aiFollowUp}
                        onChange={(e) => setAiFollowUp(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFollowUp(); } }}
                        placeholder="Ask anything about your novel…"
                        className="flex-1 bg-parchment border border-border rounded-xl px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-sage"
                      />
                      <button
                        onClick={sendFollowUp}
                        disabled={aiLoading || !aiFollowUp.trim()}
                        className="text-xs bg-ink text-parchment rounded-xl px-3 py-1.5 disabled:opacity-40 hover:bg-sage-dark transition-colors"
                      >
                        →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Confirm delete single chapter modal */}
      {deleteSingleChapterConfirm && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setDeleteSingleChapterConfirm(null)}
        >
          <div
            className="bg-parchment rounded-2xl border border-border w-full max-w-sm p-7 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-serif text-xl text-ink mb-1">Delete "{deleteSingleChapterConfirm.title}"?</h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                All content in this chapter will be permanently lost. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteSingleChapterConfirm(null)}
                className="flex-1 text-sm text-ink-muted border border-border rounded-xl py-2 hover:border-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteSingleChapter(deleteSingleChapterConfirm.id)}
                className="flex-1 text-sm font-medium bg-red-600 text-white rounded-xl py-2 hover:bg-red-700 transition-colors"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete chapters modal */}
      {deleteChaptersConfirm && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setDeleteChaptersConfirm(false)}
        >
          <div
            className="bg-parchment rounded-2xl border border-border w-full max-w-sm p-7 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-serif text-xl text-ink mb-1">Delete {selectedChapterIds.size} chapter{selectedChapterIds.size !== 1 ? "s" : ""}?</h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                This will permanently delete the selected chapter{selectedChapterIds.size !== 1 ? "s" : ""} and all their content. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteChaptersConfirm(false)}
                className="flex-1 text-sm text-ink-muted border border-border rounded-xl py-2 hover:border-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteSelectedChapters}
                className="flex-1 text-sm font-medium bg-red-600 text-white rounded-xl py-2 hover:bg-red-700 transition-colors"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete novel modal */}
      {deleteNovelConfirmId && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setDeleteNovelConfirmId(null)}
        >
          <div
            className="bg-parchment rounded-2xl border border-border w-full max-w-sm p-7 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="font-serif text-xl text-ink mb-1">Delete this novel?</h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                The novel will be permanently removed. Your research in Ideate is unaffected.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteNovelConfirmId(null)}
                className="flex-1 text-sm text-ink-muted border border-border rounded-xl py-2 hover:border-ink transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteNovel(deleteNovelConfirmId)}
                className="flex-1 text-sm font-medium bg-red-600 text-white rounded-xl py-2 hover:bg-red-700 transition-colors"
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
