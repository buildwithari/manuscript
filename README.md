# Manuscript

Manuscript helps writers validate their book ideas before they invest months bringing them to life.

Describe your concept and Manuscript researches the market — finding comparable published books, assessing how crowded the space is, how enthusiastic readers are, and how much room exists for a fresh take. You get a market assessment, a comp pitch, a query letter hook, and actionable recommendations to strengthen your idea before you start writing.

---

## Features

### Research tool
- **Concept analysis** — Describe your idea in plain language. Manuscript identifies genre, subgenre, themes, and target audience
- **Market research** — Searches Google Books and Open Library in parallel, deduplicates results, and surfaces comparable titles with ratings, edition counts, and cover images
- **Market assessment** — Three signals: market category (Underserved Niche / Competitive / Saturated), audience enthusiasm (High / Moderate / Low), and a differentiation score (1–10)
- **Publication trend chart** — Bar chart of comparable titles published per year, showing whether the genre is rising, peaking, or declining
- **Comp pitch** — A one-line "Think X meets Y" comparable pitch suitable for query letters, generated from the analysis
- **Query letter hook** — A 2–3 sentence query letter opening paragraph, copyable with one click
- **Recommendations** — Three specific suggestions to differentiate or strengthen the concept

### Dashboard (requires account)
- **Project history** — Each concept lives in a project (like a chat). Run multiple analyses on the same idea and the model sees how it has evolved
- **Chat interface** — Claude-style layout: sidebar with project list, scrollable chat history, analysis panel on the right
- **Differentiation score timeline** — Visual chart of how the differentiation score has changed across sessions in a project
- **Book detail modal** — Click any comparable title to see full details: cover, author, publication date, ratings, description, and a direct link to Google Books or Open Library
- **Resizable right panel** — Drag to adjust the analysis panel width
- **Export to PDF** — One-click export of the full analysis (signals, comp pitch, query hook, recommendations, concept breakdown) as a clean print-ready document
- **Inline project rename** — Click the pencil icon to rename any project in the sidebar
- **Project delete** — Remove projects from the sidebar with the trash icon

### Landing page
- **Guest tool** — Try the full analysis without an account (results not saved)
- **Sign-up CTA** — After a guest analysis, prompt to create an account and save the work

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind v4, App Router |
| Backend | Python, FastAPI |
| AI | OpenAI `gpt-4o-mini` |
| Book data | Google Books API, Open Library API |
| Auth + DB | Supabase (PostgreSQL + auth) |
| Hosting (planned) | Vercel (frontend), AWS EC2 (backend) |

---

## Running locally

### Prerequisites
- Node.js 18+
- Python 3.11+
- A Supabase project
- OpenAI API key
- Google Books API key (optional — works without it, lower rate limits)

### 1. Clone and install

```bash
git clone https://github.com/buildwithari/manuscript.git
cd manuscript
```

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your keys:

```
OPENAI_API_KEY=
GOOGLE_BOOKS_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

Run the database schema in your Supabase SQL editor:

```bash
# Copy the contents of backend/schema.sql and run it in:
# Supabase Dashboard → SQL Editor → New query
```

Start the backend:

```bash
# From the project root
backend/venv/bin/uvicorn backend.main:app --reload
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Start the frontend:

```bash
npm run dev
```

The app runs at `http://localhost:3000`. The backend runs at `http://localhost:8000`.

---

## API endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `GET` | `/search?q=` | — | Search Google Books + Open Library |
| `POST` | `/analyze` | — | Analyze a concept (genre, themes, audience) |
| `POST` | `/research` | Optional | Full pipeline: analyze → search → score → save |
| `GET` | `/projects` | Required | List user's projects |
| `POST` | `/projects` | Required | Create a project |
| `GET` | `/projects/{id}` | Required | Get project with session history |
| `PATCH` | `/projects/{id}` | Required | Rename a project |
| `DELETE` | `/projects/{id}` | Required | Delete a project |

---

## What's next

### Hardcover API
The `HARDCOVER_API_KEY` is already in `.env.example`. Hardcover is a community-driven reading platform with richer, more opinionated ratings than Open Library — skewing toward serious readers, which is the exact audience signal that matters for literary fiction and genre fiction. Integrating it as a third data source would strengthen the audience enthusiasm signal and surface titles that Google Books and Open Library miss.

**Implementation sketch:**
- Add `fetch_hardcover()` alongside `fetch_google_books()` and `fetch_open_library()` in `main.py`
- Hardcover uses a GraphQL API — query by title/genre for comparable books
- Merge and deduplicate results the same way the existing sources are handled
- The scoring prompt already accepts a variable number of comparable titles, so no prompt changes needed

### Other ideas in the pipeline
- **Mobile layout** — the three-panel dashboard needs a responsive treatment for smaller screens
- **Session notes** — let users annotate individual sessions with freeform notes
- **Export improvements** — include the publication trend chart in the PDF export

---

*Built for writers, by someone who wanted to know if their idea was worth writing.*
