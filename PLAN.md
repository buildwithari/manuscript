# Manuscript — Project Plan

## Working Method
- **Describe first, then implement.** Before writing any code, describe what the next step does in plain terms. Discuss and confirm before implementing.
- **Small steps.** One focused change at a time. No large sweeping commits.
- **Commit after enough small changes accumulate.** Don't commit every single change, but don't let too many pile up either.
- **Restart uvicorn** whenever backend `.env` or dependencies change. Restart Next.js dev server when `next.config.ts` changes.

---

## What's Been Built

### Backend (FastAPI — `backend/`)
- `main.py` — all backend logic
- `requirements.txt` — fastapi, uvicorn, httpx, python-dotenv, openai
- `venv/` — Python virtual environment (gitignored)

**Endpoints:**
- `GET /health` — health check
- `GET /search?q=` — searches Google Books + Open Library in parallel, returns merged + deduplicated results
- `POST /analyze` — takes a concept, calls OpenAI (gpt-4o-mini) and returns genre, subgenre, themes, target audience, search queries
- `POST /research` — main endpoint: analyzes concept → searches both APIs in parallel → scores with OpenAI → returns analysis + confidence + books

**AI model:** `gpt-4o-mini` for both analysis and scoring steps. Scoring uses gpt-4o-mini because the output is structured JSON following a rubric — no need for gpt-4o at this stage. Switch to gpt-4o if quality becomes an issue (costs ~16x more).

**Scoring output (new format — not a 0-100 score):**
- `market_category`: "Underserved Niche" | "Competitive" | "Saturated"
- `audience_enthusiasm`: "High" | "Moderate" | "Low"
- `differentiation_score`: 1–10 integer
- `reasoning`: 2–3 sentences citing real market signals
- `recommendations`: list of 3 specific suggestions

Switched away from 0-100 score because the model defaulted to 75 regardless of concept. Tags are more honest and actionable.

**Data sources:**
- Google Books API (requires API key, 1000 req/day free)
- Open Library API (no API key needed, returns cover images via `cover_i`)

**CORS:** Configured for `http://localhost:3000` only. Will need updating for production.

---

### Frontend (Next.js 16 — `frontend/`)
- TypeScript, Tailwind v4, App Router
- Lora (serif, headings) + Geist Sans (body) fonts

**Pages:** Single-page app (`app/page.tsx`) with three sections:
1. **Hero** — headline, description, 3 images from `/public`, CTA button that smooth scrolls to tool
2. **About** — 4 feature cards explaining the product
3. **Try it yourself** — textarea for concept, submit button, results display

**Results display:**
- Market assessment card: market category tag, audience enthusiasm tag, differentiation bar (10 blocks)
- Concept analysis: genre, subgenre, audience, themes
- Comparable titles grid: book cover (from API thumbnail), title, author, rating, edition count, source tag

**Color scheme (academic/muted):**
- Parchment `#F5F3EE` — background (60%)
- Ink `#1C1C1A` — text (30%)
- Sage `#5C7A5C` — accent (10%)
- Tags use sage-light/sage-dark, amber, or red depending on signal

---

### Config & Infrastructure
- `.env.example` — lists `OPENAI_API_KEY`, `GOOGLE_BOOKS_API_KEY`, `HARDCOVER_API_KEY` (Hardcover not yet implemented)
- `.gitignore` — covers venv, node_modules, .env, .next, .DS_Store
- `next.config.ts` — allows images from `books.google.com` and `covers.openlibrary.org`

**Run locally:**
```bash
# Backend (from project root)
backend/venv/bin/uvicorn backend.main:app --reload

# Frontend (from /frontend)
npm run dev
```

---

## What's Planned Next

### Feature: Auth + Project History (Supabase)

**Why Supabase:** Cheapest option for MVP — free tier covers PostgreSQL + auth in one service, no separate auth provider needed, good FastAPI and Next.js SDKs.

**The concept:** Users create "projects" (one per book idea, like new chats in Claude). Each project holds multiple research sessions. When they run a new analysis on an existing project, previous sessions are passed as context to OpenAI so the feedback accounts for how the concept has evolved.

This also sets up the foundation for a future in-app writing feature (documents per project).

**Data model:**
```
projects   — id (uuid), user_id (text), title (text), created_at
sessions   — id (uuid), project_id (uuid FK), concept (text),
             analysis (jsonb), confidence (jsonb), books (jsonb), created_at

(future)
documents  — id (uuid), project_id (uuid FK), title (text), content (text), created_at
```

**Build order (small steps):**

1. **Supabase setup**
   - Install `supabase` Python SDK, add to `requirements.txt`
   - Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` to `.env.example`
   - Create `backend/schema.sql` with tables + RLS policies
   - User runs SQL in Supabase dashboard

2. **Backend auth middleware**
   - Verify Supabase JWT on protected routes
   - Extract `user_id` from token for DB operations

3. **Project CRUD endpoints**
   - `POST /projects` — create new project
   - `GET /projects` — list user's projects
   - `GET /projects/{id}` — get single project with sessions

4. **Frontend auth**
   - Install `@supabase/supabase-js` + `@supabase/ssr`
   - Login/signup UI (modal or dedicated page)
   - Session handling

5. **Frontend project UI**
   - Project list sidebar or selector
   - "New project" button
   - Active project context

6. **Wire research to projects**
   - `POST /research` accepts optional `project_id`
   - Saves session to DB after analysis
   - Returns session history alongside results

7. **History context in prompts**
   - On new analysis, fetch previous sessions for the project
   - Pass summarized history to OpenAI scoring prompt
   - Feedback accounts for concept evolution

8. **Update README** to reflect auth + project features

---

## Decisions Log
| Decision | Choice | Reason |
|---|---|---|
| Book scope | Books only (not movies/fanfic) | More tractable data sources |
| Data sources | Google Books + Open Library | Free, official APIs, stable |
| Hardcover API | In .env.example, not yet implemented | Planned for richer ratings data |
| AI model | gpt-4o-mini for all steps | ~16x cheaper than gpt-4o, good enough for structured JSON output |
| Scoring format | Tags (not 0-100) | Model defaulted to 75; tags are more honest and actionable |
| Auth/DB | Supabase | Free tier covers both auth + PostgreSQL, simplest setup |
| Frontend hosting | Vercel (planned) | Free tier, built for Next.js |
| Backend hosting | AWS EC2 (planned) | Standard, pairs with RDS if we ever move off Supabase |
