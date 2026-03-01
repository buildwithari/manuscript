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
  const [authFirstName, setAuthFirstName] = useState("");
  const [authLastName, setAuthLastName] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [signupEmailSent, setSignupEmailSent] = useState(false);

  const toolRef = useRef<HTMLElement>(null);

  // Redirect to dashboard if already signed in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      if (s) router.replace("/dashboard");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const friendlyAuthError = (msg: string): string => {
    if (msg.includes("Invalid login credentials")) return "Incorrect email or password.";
    if (msg.includes("Email not confirmed")) return "Please confirm your email before signing in.";
    if (msg.includes("User already registered")) return "An account with this email already exists.";
    if (msg.includes("Password should be at least")) return "Password must be at least 8 characters.";
    if (msg.includes("Unable to validate email address")) return "Please enter a valid email address.";
    if (msg.includes("rate limit") || msg.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
    return msg;
  };

  const pwChecks = {
    length: authPassword.length >= 8,
    uppercase: /[A-Z]/.test(authPassword),
    numberOrSpecial: /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(authPassword),
  };

  const handleSignIn = async () => {
    setAuthError(null);
    if (!isValidEmail(authEmail)) { setAuthError("Please enter a valid email address."); return; }
    if (!authPassword.trim()) { setAuthError("Password is required."); return; }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (error) setAuthError(friendlyAuthError(error.message));
    // on success, onAuthStateChange fires and redirects to /dashboard
    setAuthLoading(false);
  };

  const handleSignUp = async () => {
    setAuthError(null);
    if (!authFirstName.trim() || !authLastName.trim()) { setAuthError("First and last name are required."); return; }
    if (!isValidEmail(authEmail)) { setAuthError("Please enter a valid email address."); return; }
    if (!pwChecks.length || !pwChecks.uppercase || !pwChecks.numberOrSpecial) {
      setAuthError("Password doesn't meet the requirements listed above."); return;
    }
    if (authPassword !== authConfirmPassword) { setAuthError("Passwords do not match."); return; }
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: {
        emailRedirectTo: "https://manuscript.help",
        data: { first_name: authFirstName, last_name: authLastName },
      },
    });
    if (error) {
      setAuthError(friendlyAuthError(error.message));
    } else {
      setSignupEmailSent(true);
    }
    setAuthLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://manuscript.help/auth/callback" },
    });
    if (error) {
      setAuthError(error.message);
      setAuthLoading(false);
    }
    // On success, browser redirects — no cleanup needed
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/research`, {
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

      {/* Auth overlay — fullscreen two-column */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex">

          {/* Left column — form, parchment bg */}
          <div className="flex-1 md:flex-none md:w-1/2 bg-parchment flex flex-col overflow-y-auto">

            {/* Top bar */}
            <div className="flex items-center justify-between px-8 pt-8 shrink-0">
              <span className="[font-family:var(--font-serif)] font-bold text-ink text-lg tracking-tight">Manuscript</span>
              <button
                onClick={() => { setShowAuthModal(false); setAuthError(null); setSignupEmailSent(false); setAuthFirstName(""); setAuthLastName(""); setAuthConfirmPassword(""); }}
                className="text-ink-muted hover:text-ink transition-colors text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Form — vertically centered */}
            <div className="flex-1 flex items-center justify-center px-8 py-12">
              <div className="w-full max-w-[480px]">

                <h2 className={`text-3xl text-ink font-bold ${signupEmailSent ? "mb-6" : "[font-family:var(--font-serif)] mb-8"}`}>
                  {signupEmailSent ? "Check your inbox" : authMode === "signin" ? "Sign in" : "Create account"}
                </h2>

                {signupEmailSent ? (
                  <div className="space-y-5">
                    <p className="text-ink-muted text-sm leading-relaxed">
                      A confirmation link is on its way to <span className="text-sage font-bold">{authEmail}</span>.
                    </p>
                    <p className="text-ink-muted text-sm leading-relaxed">
                      Click the link to activate your account, then{" "}
                      <button
                        onClick={() => { setSignupEmailSent(false); setAuthMode("signin"); }}
                        className="[font-family:var(--font-serif)] italic text-sage hover:text-sage-dark underline underline-offset-2 transition-colors"
                      >
                        sign in
                      </button>
                      .
                    </p>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleGoogleSignIn}
                      disabled={authLoading}
                      className="w-full flex items-center justify-center gap-3 bg-surface border border-border rounded-full px-4 py-3 text-sm text-ink font-medium hover:border-sage hover:bg-sage-light transition-colors disabled:opacity-40"
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                        <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
                      </svg>
                      Continue with Google
                    </button>

                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-ink-muted uppercase tracking-widest">or</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-4">
                      {authMode === "signup" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-ink-muted uppercase tracking-widest block mb-2">First Name</label>
                            <input
                              type="text"
                              value={authFirstName}
                              onChange={(e) => setAuthFirstName(e.target.value)}
                              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-ink text-sm focus:outline-none focus:border-sage"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-ink-muted uppercase tracking-widest block mb-2">Last Name</label>
                            <input
                              type="text"
                              value={authLastName}
                              onChange={(e) => setAuthLastName(e.target.value)}
                              className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-ink text-sm focus:outline-none focus:border-sage"
                            />
                          </div>
                        </div>
                      )}

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
                        {authMode === "signup" && authPassword.length > 0 && (
                          <ul className="mt-2.5 space-y-1.5">
                            {[
                              { ok: pwChecks.length, label: "At least 8 characters" },
                              { ok: pwChecks.uppercase, label: "One uppercase letter" },
                              { ok: pwChecks.numberOrSpecial, label: "One number or special character" },
                            ].map(({ ok, label }) => (
                              <li key={label} className={`flex items-center gap-2 text-xs transition-colors ${ok ? "text-sage-dark" : "text-ink-muted"}`}>
                                <span className="w-3 shrink-0">{ok ? "✓" : "○"}</span>
                                {label}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {authMode === "signup" && (
                        <div>
                          <label className="text-xs text-ink-muted uppercase tracking-widest block mb-2">Confirm Password</label>
                          <input
                            type="password"
                            value={authConfirmPassword}
                            onChange={(e) => setAuthConfirmPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSignUp()}
                            className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-ink text-sm focus:outline-none focus:border-sage"
                          />
                        </div>
                      )}
                    </div>

                    {authError && (
                      <p className="mt-4 text-sm text-ink-muted leading-relaxed">
                        {authError}
                      </p>
                    )}

                    <button
                      onClick={authMode === "signin" ? handleSignIn : handleSignUp}
                      disabled={authLoading || !authEmail.trim() || !authPassword.trim() || (authMode === "signup" && (!authFirstName.trim() || !authLastName.trim() || !authConfirmPassword.trim()))}
                      className="w-full mt-6 bg-ink text-parchment py-3 rounded-full text-sm font-medium disabled:opacity-40 hover:bg-sage-dark transition-colors"
                    >
                      {authLoading ? "…" : authMode === "signin" ? "Sign in" : "Create account"}
                    </button>

                    <p className="text-center text-xs text-ink-muted mt-5">
                      {authMode === "signin" ? "No account? " : "Already have one? "}
                      <button
                        onClick={() => { setAuthMode(authMode === "signin" ? "signup" : "signin"); setAuthError(null); setAuthConfirmPassword(""); setAuthFirstName(""); setAuthLastName(""); }}
                        className="text-sage hover:underline"
                      >
                        {authMode === "signin" ? "Sign up" : "Sign in"}
                      </button>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right column — full-bleed image with overlay, desktop only */}
          <div className="hidden md:flex flex-1 relative overflow-hidden">

            {/* Full-bleed image */}
            <Image src="/auth-image.jpg" alt="" fill className="object-cover" />

            {/* Gradient overlays — darken top and bottom for legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />

            {/* Overlaid content */}
            <div className="relative z-10 flex flex-col justify-end w-full px-12 py-10">
              <div>
                <p className="font-serif italic text-parchment text-2xl leading-snug">
                  Know if your book idea<br />is worth writing.
                </p>
                <p className="text-parchment/60 text-sm mt-3 leading-relaxed max-w-xs">
                  Research the market before you invest months bringing an idea to life.
                </p>
              </div>
            </div>
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
