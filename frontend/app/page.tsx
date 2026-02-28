"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../lib/supabase";

interface Analysis {
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

interface Book {
  source: string;
  title: string | null;
  authors: string[];
  description: string | null;
  published_date: string | null;
  categories: string[];
  rating: number | null;
  ratings_count: number | null;
  edition_count: number | null;
  thumbnail: string | null;
  link: string | null;
}

interface ResearchResult {
  concept: string;
  analysis: Analysis;
  confidence: Confidence;
  books: Book[];
}

const features = [
  {
    title: "Concept Analysis",
    description:
      "Describe your idea in plain language. Manuscript identifies the genre, themes, and target audience.",
  },
  {
    title: "Market Research",
    description:
      "AI finds comparable published books across Google Books and Open Library to map the competitive landscape.",
  },
  {
    title: "Market Assessment",
    description:
      "Understand how crowded your genre is, how enthusiastic the readership is, and how much room exists for a fresh take.",
  },
  {
    title: "Recommendations",
    description:
      "Specific, actionable suggestions to differentiate or strengthen your concept before you start writing.",
  },
];

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

export default function Home() {
  const router = useRouter();

  const [concept, setConcept] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const toolRef = useRef<HTMLElement>(null);

  // Redirect to dashboard if already signed in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      if (s) router.replace("/dashboard");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    // on success, onAuthStateChange fires and redirects to /dashboard
    setAuthLoading(false);
  };

  const handleSignUp = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (error) setAuthError(error.message);
    setAuthLoading(false);
  };

  const scrollToTool = () => {
    toolRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async () => {
    if (!concept.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("http://localhost:8000/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept }),
      });
      if (!res.ok) throw new Error("Backend error");
      setResult(await res.json());
    } catch {
      setError("Something went wrong. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-parchment/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-serif font-bold text-ink text-lg tracking-tight">
            Manuscript
          </span>
          <div className="flex items-center gap-5">
            <button
              onClick={scrollToTool}
              className="text-sm text-ink-muted hover:text-ink transition-colors"
            >
              Try Manuscript
            </button>
            <button
              onClick={() => { setAuthMode("signin"); setShowAuthModal(true); }}
              className="text-sm bg-sage text-parchment px-4 py-1.5 rounded-full hover:bg-sage-dark transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-2xl">
            <p className="text-sage text-sm font-medium uppercase tracking-widest mb-6">
              For writers
            </p>
            <h1 className="font-serif text-5xl md:text-6xl text-ink leading-tight mb-6">
              Know if your book idea is worth writing.
            </h1>
            <p className="text-ink-muted text-lg leading-relaxed mb-10 max-w-xl">
              Manuscript researches the market for your concept before you
              invest months bringing it to life. Enter your idea, get a
              confidence score, comparable titles, and recommendations in
              seconds.
            </p>
            <button
              onClick={scrollToTool}
              className="inline-flex items-center gap-2 bg-ink text-parchment px-7 py-3.5 rounded-full text-sm font-medium hover:bg-sage-dark transition-colors"
            >
              Try it yourself
              <span>→</span>
            </button>
          </div>

          {/* Images */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-3 gap-4">
            {["/image1.jpg", "/image2.jpg", "/image3.jpg"].map((src, i) => (
              <div key={i} className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-border">
                <Image src={src} alt="" fill className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="py-24 px-6 bg-surface border-y border-border">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-xl mb-16">
            <p className="text-sage text-sm font-medium uppercase tracking-widest mb-4">
              About
            </p>
            <h2 className="font-serif text-4xl text-ink mb-5">
              What is Manuscript?
            </h2>
            <p className="text-ink-muted text-base leading-relaxed">
              Most writers invest months (sometimes years!) into a concept
              before discovering the market is oversaturated, or that their idea
              needs sharper differentiation. Manuscript gives you that signal
              upfront, so you can write with confidence or refine before you
              begin.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((f) => (
              <div key={f.title} className="p-7 rounded-2xl border border-border bg-parchment">
                <div className="w-2 h-2 rounded-full bg-sage mb-5" />
                <h3 className="font-serif text-xl text-ink mb-3">{f.title}</h3>
                <p className="text-ink-muted text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tool — guest preview */}
      <section ref={toolRef} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="max-w-xl mb-12">
            <p className="text-sage text-sm font-medium uppercase tracking-widest mb-4">
              Try it yourself
            </p>
            <h2 className="font-serif text-4xl text-ink mb-5">
              Describe your concept.
            </h2>
            <p className="text-ink-muted text-base leading-relaxed">
              Write a few sentences about your book idea — the premise,
              characters, setting, genre. The more detail, the better the
              analysis.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 md:p-8">
            <textarea
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. A retired detective who can talk to cats solves murders in a small English village..."
              rows={5}
              className="w-full bg-transparent resize-none text-ink placeholder:text-ink-muted/50 text-base leading-relaxed focus:outline-none"
            />
            <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
              <span className="text-xs text-ink-muted">
                {concept.length > 0 ? `${concept.length} characters` : ""}
              </span>
              <button
                onClick={handleSubmit}
                disabled={loading || !concept.trim()}
                className="inline-flex items-center gap-2 bg-ink text-parchment px-6 py-2.5 rounded-full text-sm font-medium disabled:opacity-40 hover:bg-sage-dark transition-colors"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-parchment/30 border-t-parchment rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  "Analyze my concept →"
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-10 space-y-8">
              {/* Market assessment */}
              <div className="bg-surface border border-border rounded-2xl p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-ink-muted uppercase tracking-widest">Market</p>
                    <span className={`self-start text-sm font-medium px-3 py-1.5 rounded-full ${categoryColors[result.confidence.market_category]}`}>
                      {result.confidence.market_category}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-ink-muted uppercase tracking-widest">Audience enthusiasm</p>
                    <span className={`self-start text-sm font-medium px-3 py-1.5 rounded-full ${enthusiasmColors[result.confidence.audience_enthusiasm]}`}>
                      {result.confidence.audience_enthusiasm}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-ink-muted uppercase tracking-widest">Differentiation room</p>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className={`w-4 h-4 rounded-sm ${i < result.confidence.differentiation_score ? "bg-sage" : "bg-border"}`} />
                        ))}
                      </div>
                      <span className="text-xs text-ink-muted">{result.confidence.differentiation_score}/10</span>
                    </div>
                  </div>
                </div>

                {result.confidence.comp_pitch && (
                  <div className="bg-parchment border border-border rounded-xl px-5 py-4">
                    <p className="text-xs text-ink-muted uppercase tracking-widest mb-1.5">Comp pitch</p>
                    <p className="font-serif text-ink text-lg italic">{result.confidence.comp_pitch}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-ink-muted uppercase tracking-widest mb-3">Analysis</p>
                  <p className="text-ink text-sm leading-relaxed">{result.confidence.reasoning}</p>
                </div>

                <div>
                  <p className="text-xs text-ink-muted uppercase tracking-widest mb-3">Recommendations</p>
                  <ul className="space-y-2">
                    {result.confidence.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-3 text-sm text-ink leading-relaxed">
                        <span className="text-sage mt-0.5 shrink-0">→</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Query hook */}
              {result.confidence.query_hook && (
                <div className="bg-surface border border-border rounded-2xl p-8 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-muted uppercase tracking-widest">Query letter hook</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(result.confidence.query_hook!)}
                      className="text-xs text-ink-muted hover:text-sage transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-ink text-sm leading-relaxed">{result.confidence.query_hook}</p>
                </div>
              )}

              {/* Publication trend chart */}
              {(() => {
                const trend = buildTrend(result.books);
                if (!trend) return null;
                return (
                  <div className="bg-surface border border-border rounded-2xl p-8">
                    <p className="text-xs text-ink-muted uppercase tracking-widest mb-4">Publication trend</p>
                    <div className="flex items-end gap-px h-16">
                      {trend.years.map((year) => (
                        <div
                          key={year}
                          className="flex-1 bg-sage rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                          style={{ height: `${((trend.counts[year] || 0) / trend.max) * 100}%`, minHeight: trend.counts[year] ? "2px" : "0" }}
                          title={`${year}: ${trend.counts[year] || 0} title${(trend.counts[year] || 0) !== 1 ? "s" : ""}`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-xs text-ink-muted">{trend.years[0]}</span>
                      <span className="text-xs text-ink-muted">{trend.years[trend.years.length - 1]}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Concept analysis */}
              <div className="bg-surface border border-border rounded-2xl p-8">
                <p className="text-xs text-ink-muted uppercase tracking-widest mb-6">Concept analysis</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs text-ink-muted mb-1">Genre</p>
                    <p className="text-ink font-medium text-sm">{result.analysis.genre}</p>
                    {result.analysis.subgenre && (
                      <p className="text-ink-muted text-xs mt-0.5">{result.analysis.subgenre}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted mb-1">Audience</p>
                    <p className="text-ink text-sm leading-snug">{result.analysis.target_audience}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-ink-muted mb-2">Themes</p>
                    <div className="flex flex-wrap gap-2">
                      {result.analysis.themes.map((t) => (
                        <span key={t} className="bg-sage-light text-sage-dark text-xs px-3 py-1 rounded-full">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Books */}
              <div>
                <p className="text-xs text-ink-muted uppercase tracking-widest mb-5">
                  {result.books.length} comparable titles found
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.books.slice(0, 10).map((book, i) => (
                    <div key={i} className="bg-surface border border-border rounded-xl p-5 flex gap-4">
                      <div className="w-12 h-16 rounded-md bg-parchment border border-border shrink-0 overflow-hidden">
                        {book.thumbnail ? (
                          <Image src={book.thumbnail} alt={book.title || ""} width={48} height={64} className="object-cover w-full h-full" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-border text-lg">📖</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-ink font-medium text-sm leading-snug truncate">{book.title || "Untitled"}</p>
                        <p className="text-ink-muted text-xs mt-0.5 truncate">{book.authors.join(", ") || "Unknown author"}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {book.rating && (
                            <span className="text-xs text-ink-muted">
                              ★ {book.rating.toFixed(1)}
                              {book.ratings_count && <span className="ml-1 opacity-60">({book.ratings_count.toLocaleString()})</span>}
                            </span>
                          )}
                          {book.edition_count && <span className="text-xs text-ink-muted">{book.edition_count} editions</span>}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-sage-light text-sage-dark">
                            {book.source === "google_books" ? "Google Books" : book.source === "hardcover" ? "Hardcover" : "Open Library"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA to sign up */}
              <div className="bg-sage-light border border-sage rounded-2xl p-8 text-center">
                <p className="font-serif text-2xl text-ink mb-3">Save your research.</p>
                <p className="text-ink-muted text-sm mb-6 max-w-sm mx-auto">
                  Create an account to save your analyses, track concept evolution, and revisit your work anytime.
                </p>
                <button
                  onClick={() => { setAuthMode("signup"); setShowAuthModal(true); }}
                  className="inline-flex items-center gap-2 bg-ink text-parchment px-6 py-3 rounded-full text-sm font-medium hover:bg-sage-dark transition-colors"
                >
                  Create free account →
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Auth modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="bg-parchment rounded-2xl border border-border w-full max-w-sm p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-serif text-2xl text-ink">
                {authMode === "signin" ? "Sign in" : "Create account"}
              </h2>
              <button
                onClick={() => { setShowAuthModal(false); setAuthError(null); }}
                className="text-ink-muted hover:text-ink transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-ink-muted uppercase tracking-widest block mb-2">Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-ink text-sm focus:outline-none focus:border-sage"
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted uppercase tracking-widest block mb-2">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (authMode === "signin" ? handleSignIn() : handleSignUp())}
                  className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-ink text-sm focus:outline-none focus:border-sage"
                />
              </div>
            </div>

            {authError && (
              <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                {authError}
              </p>
            )}

            <button
              onClick={authMode === "signin" ? handleSignIn : handleSignUp}
              disabled={authLoading || !authEmail.trim() || !authPassword.trim()}
              className="w-full mt-6 bg-ink text-parchment py-3 rounded-full text-sm font-medium disabled:opacity-40 hover:bg-sage-dark transition-colors"
            >
              {authLoading ? "…" : authMode === "signin" ? "Sign in" : "Create account"}
            </button>

            <p className="text-center text-xs text-ink-muted mt-5">
              {authMode === "signin" ? "No account? " : "Already have one? "}
              <button
                onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(null); }}
                className="text-sage hover:underline"
              >
                {authMode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="font-serif text-ink text-sm">Manuscript</span>
          <div className="flex items-center gap-4">
            <span className="text-ink-muted text-xs">Built by Arundhati Bandopadhyaya</span>
            <div className="flex items-center gap-3">
              <a href="https://www.linkedin.com/in/abandopadhyaya/" target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-ink text-xs transition-colors">LinkedIn</a>
              <a href="https://github.com/buildwithari" target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-ink text-xs transition-colors">GitHub</a>
              <a href="https://buildwithari.vercel.app/" target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-ink text-xs transition-colors">Portfolio</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
