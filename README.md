# Manuscript

Manuscript helps writers go from first idea to finished draft — with market research upfront and an AI-assisted writing environment once they're ready to write.

**Ideate** — Describe your concept and Manuscript researches the market: comparable published titles, how crowded the space is, how enthusiastic readers are, and how much room exists for a fresh take. You get a market assessment, a comp pitch, a query letter hook, and actionable recommendations.

**Write** — Once you've validated your concept, carry that research into the writing phase. A distraction-free editor with chapter management and an AI assistant that already knows your genre, target audience, and comp titles.

**Live at [manuscript.help](https://manuscript.help)**

---

## Features

### Ideate (free, no account needed)
- **Concept analysis** — Describe your idea in plain language. Manuscript identifies genre, subgenre, themes, and target audience
- **Market research** — Searches Google Books, Open Library, and Hardcover in parallel, deduplicates results, and surfaces comparable titles with ratings, edition counts, and cover images
- **Market assessment** — Three signals: market category (Underserved Niche / Competitive / Saturated), audience enthusiasm (High / Moderate / Low), and a differentiation score (1–10)
- **Publication trend chart** — Bar chart of comparable titles published per year, showing whether the genre is rising, peaking, or declining
- **Comp pitch** — A one-line "Think X meets Y" comparable pitch suitable for query letters, generated from the analysis
- **Query letter hook** — A 2–3 sentence query letter opening paragraph, copyable with one click
- **Recommendations** — Three specific suggestions to differentiate or strengthen the concept

### Dashboard — Ideate tab (requires account)
- **Project history** — Each concept lives in a project. Run multiple analyses on the same idea and the model sees how it has evolved
- **Chat interface** — Sidebar with project list, scrollable chat history, analysis panel on the right
- **Differentiation score timeline** — Visual chart of how the score has changed across sessions in a project
- **Book detail modal** — Click any comparable title to see full details with a direct link to Google Books or Open Library
- **Export to PDF** — One-click export of the full analysis as a clean print-ready document
- **Finalize idea** — When a concept is ready, create a novel from it and move straight into the Write phase

### Dashboard — Write tab (requires account)
- **Novel management** — Novels are created from finalized Ideate projects; title changes sync bidirectionally between phases
- **Chapter management** — Create, rename, reorder (drag-and-drop), and delete chapters; bulk select-all delete with confirmation
- **Distraction-free editor** — TipTap rich text editor: Bold, Italic, Underline, Scene Break; max-width 680px, Lora serif, 18px at 1.8 line-height
- **Auto-save** — Debounced 3 s after last keystroke; Ctrl+S / Cmd+S for instant save; live word count
- **AI Writing Assistant** — Four context-aware actions using your market research:
  - *Get unstuck* — suggests 2–3 story directions
  - *Continuity check* — scans chapters for inconsistencies
  - *Strengthen this scene* — pacing, tension, and voice suggestions
  - *What would my reader think?* — reader-perspective reaction
- **Grammar & Style Check** — Inline highlights for spelling and grammar errors; larger issues (clarity, pacing, voice, consistency) flagged separately with explanations and suggested rewrites; apply or ignore per issue

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind v4, App Router |
| Editor | TipTap (ProseMirror), @dnd-kit/sortable |
| Backend | Python, FastAPI |
| AI | OpenAI `gpt-4o-mini` |
| Book data | Google Books API, Open Library API, Hardcover API |
| Auth + DB | Supabase (PostgreSQL + RLS + auth) |
| Hosting | Vercel (frontend), AWS EC2 behind ALB (backend) |
| Infrastructure | Terraform + Packer |
| CI/CD | GitHub Actions |

---

## Infrastructure & Deployment

The backend is deployed on AWS using an immutable infrastructure approach.

On every merge to `main` that touches `backend/` or `infra/`, GitHub Actions runs a two-job pipeline:

1. **Packer** bakes a fresh AMI — launches a temporary EC2, installs Python 3.11, copies the backend code, installs dependencies, and registers a systemd service. App secrets are never baked in.
2. **Terraform** applies the new AMI — updates the Launch Template and triggers an Auto Scaling Group instance refresh, bringing up the new instance behind the ALB before terminating the old one (blue/green, near-zero downtime).

**AWS resources managed by Terraform:**
- Application Load Balancer with HTTPS (ACM certificate, HTTP→HTTPS redirect)
- Auto Scaling Group (min/max 1) with instance refresh
- EC2 security group (port 8000 from ALB only, no direct internet access)
- IAM role with SSM Parameter Store access (secrets pulled at boot, never on disk)
- Route 53 A record for `api.manuscript.help`

**Secrets** are stored in AWS SSM Parameter Store under `/manuscript/backend/` and injected as systemd environment variables at instance boot via `boot.sh`.

**Terraform state** is stored in S3 with DynamoDB locking.

---

## Running locally

### Prerequisites
- Node.js 18+
- Python 3.11+
- A Supabase project
- OpenAI API key
- Google Books API key (optional — works without it, lower rate limits)
- Hardcover API key — [hardcover.app/account/api](https://hardcover.app/account/api)

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
HARDCOVER_API_KEY=Bearer your_token_here
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
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Start the frontend:

```bash
npm run dev
```

The app runs at `http://localhost:3000`. The backend runs at `http://localhost:8000`.

---

## API endpoints

### Public
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/search?q=` | Search Google Books + Open Library + Hardcover |
| `POST` | `/analyze` | Analyze a concept (genre, themes, audience) |
| `POST` | `/research` | Full pipeline: analyze → search → score → save |

### Projects (auth required)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/projects` | List user's projects |
| `POST` | `/projects` | Create a project |
| `GET` | `/projects/{id}` | Get project with session history |
| `PATCH` | `/projects/{id}` | Rename a project (syncs linked novel title) |
| `DELETE` | `/projects/{id}` | Delete a project |

### Novels & chapters (auth required)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/novels` | Create a novel (optionally linked to a project) |
| `GET` | `/novels` | List user's novels with nested chapters |
| `PATCH` | `/novels/{id}` | Rename a novel (syncs linked project title) |
| `DELETE` | `/novels/{id}` | Delete a novel and all its chapters |
| `POST` | `/novels/{id}/chapters` | Create a chapter |
| `PATCH` | `/chapters/{id}` | Update title, content, word count, or order |
| `DELETE` | `/chapters/{id}` | Delete a chapter |
| `POST` | `/novels/{id}/assist` | AI assistant (writing actions + grammar check) |

---

*Built by [Arundhati Bandopadhyaya](https://buildwithari.vercel.app) · [LinkedIn](https://www.linkedin.com/in/abandopadhyaya/) · [GitHub](https://github.com/buildwithari)*
