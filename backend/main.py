import asyncio
import json
import os
import httpx
from typing import Optional
from fastapi import FastAPI, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from openai import AsyncOpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY"),
)

bearer_scheme = HTTPBearer()
optional_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    try:
        response = supabase.auth.get_user(credentials.credentials)
        return response.user.id
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer_scheme)) -> Optional[str]:
    if credentials is None:
        return None
    try:
        response = supabase.auth.get_user(credentials.credentials)
        return response.user.id
    except Exception:
        return None


class ConceptRequest(BaseModel):
    concept: str
    project_id: Optional[str] = None


class ProjectRequest(BaseModel):
    title: str


@app.get("/health")
def health():
    return {"status": "ok"}


async def fetch_google_books(client: httpx.AsyncClient, q: str) -> list:
    params = {"q": q, "maxResults": 10, "printType": "books"}
    if GOOGLE_BOOKS_API_KEY:
        params["key"] = GOOGLE_BOOKS_API_KEY

    response = await client.get(GOOGLE_BOOKS_API_URL, params=params)
    if response.status_code != 200:
        return []

    books = []
    for item in response.json().get("items", []):
        info = item.get("volumeInfo", {})
        books.append({
            "source": "google_books",
            "title": info.get("title"),
            "authors": info.get("authors", []),
            "description": info.get("description"),
            "published_date": info.get("publishedDate"),
            "categories": info.get("categories", []),
            "rating": info.get("averageRating"),
            "ratings_count": info.get("ratingsCount"),
            "edition_count": None,
            "thumbnail": info.get("imageLinks", {}).get("thumbnail"),
            "link": info.get("infoLink"),
        })
    return books


async def fetch_open_library(client: httpx.AsyncClient, q: str) -> list:
    params = {
        "q": q,
        "limit": 10,
        "fields": "title,author_name,first_publish_year,edition_count,ratings_average,ratings_count,subject,cover_i,key",
    }

    response = await client.get(OPEN_LIBRARY_SEARCH_URL, params=params)
    if response.status_code != 200:
        return []

    books = []
    for doc in response.json().get("docs", []):
        books.append({
            "source": "open_library",
            "title": doc.get("title"),
            "authors": doc.get("author_name", []),
            "description": None,
            "published_date": str(doc["first_publish_year"]) if doc.get("first_publish_year") else None,
            "categories": doc.get("subject", [])[:5],
            "rating": doc.get("ratings_average"),
            "ratings_count": doc.get("ratings_count"),
            "edition_count": doc.get("edition_count"),
            "thumbnail": f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-M.jpg" if doc.get("cover_i") else None,
            "link": f"https://openlibrary.org{doc['key']}" if doc.get("key") else None,
        })
    return books


@app.post("/analyze")
async def analyze_concept(body: ConceptRequest):
    if not body.concept.strip():
        raise HTTPException(status_code=400, detail="Concept cannot be empty")

    prompt = f"""You are a book market analyst. A writer has described their book concept below.

Extract the following and respond in JSON only, no extra text:
{{
  "genre": "primary genre",
  "subgenre": "subgenre or null",
  "themes": ["theme1", "theme2", "theme3"],
  "target_audience": "description of the target reader",
  "search_queries": ["query1", "query2"]
}}

The search_queries should be short, specific phrases optimized for finding similar published books.

Concept: {body.concept}"""

    response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )

    analysis = json.loads(response.choices[0].message.content)
    return {"concept": body.concept, "analysis": analysis}


@app.get("/search")
async def search_books(q: str = Query(..., min_length=1)):
    async with httpx.AsyncClient() as client:
        google_results, ol_results = await asyncio.gather(
            fetch_google_books(client, q),
            fetch_open_library(client, q),
        )

    return {"query": q, "results": google_results + ol_results}


def deduplicate_books(books: list) -> list:
    seen = set()
    unique = []
    for book in books:
        key = (book["title"] or "").lower().strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(book)
    return unique


@app.post("/research")
async def research_concept(body: ConceptRequest, user_id: Optional[str] = Depends(get_optional_user)):
    if not body.concept.strip():
        raise HTTPException(status_code=400, detail="Concept cannot be empty")

    # Step 1: analyze the concept
    prompt = f"""You are a book market analyst. A writer has described their book concept below.

Extract the following and respond in JSON only, no extra text:
{{
  "title": "3-5 word working title for this project (evocative, not generic)",
  "genre": "primary genre",
  "subgenre": "subgenre or null",
  "themes": ["theme1", "theme2", "theme3"],
  "target_audience": "description of the target reader",
  "search_queries": ["query1", "query2"]
}}

The search_queries should be short, specific phrases optimized for finding similar published books.

Concept: {body.concept}"""

    openai_response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    analysis = json.loads(openai_response.choices[0].message.content)

    # Auto-create a project if the user is authenticated but hasn't selected one yet
    saved_project_id = body.project_id
    saved_project_title = None
    if user_id and not body.project_id:
        auto_title = analysis.get("title") or body.concept[:50]
        new_project = supabase.table("projects").insert({
            "user_id": user_id,
            "title": auto_title,
        }).execute()
        saved_project_id = new_project.data[0]["id"]
        saved_project_title = new_project.data[0]["title"]

    # Step 2: search both APIs for each query in parallel
    queries = analysis.get("search_queries", [])
    async with httpx.AsyncClient() as client:
        tasks = [
            coro
            for q in queries
            for coro in (fetch_google_books(client, q), fetch_open_library(client, q))
        ]
        results = await asyncio.gather(*tasks)

    all_books = [book for batch in results for book in batch]
    books = deduplicate_books(all_books)

    # Step 2.5: fetch prior sessions for this project to provide evolution context
    history_context = ""
    if saved_project_id and user_id:
        prev = (
            supabase.table("sessions")
            .select("concept, confidence, created_at")
            .eq("project_id", saved_project_id)
            .order("created_at", desc=False)
            .limit(3)
            .execute()
        )
        if prev.data:
            lines = []
            for i, s in enumerate(prev.data, 1):
                conf = s.get("confidence") or {}
                snippet = s["concept"][:200].replace("\n", " ")
                lines.append(
                    f"Iteration {i}: \"{snippet}\" → "
                    f"Market: {conf.get('market_category', 'N/A')}, "
                    f"Enthusiasm: {conf.get('audience_enthusiasm', 'N/A')}, "
                    f"Differentiation: {conf.get('differentiation_score', 'N/A')}/10"
                )
            history_context = "\n\nConcept evolution (previous iterations by this writer on this project):\n" + "\n".join(lines)

    # Step 3: score the concept based on analysis + comparable books
    rated_books = [b for b in books if b["rating"] is not None]
    avg_rating = round(sum(b["rating"] for b in rated_books) / len(rated_books), 2) if rated_books else None
    avg_editions = round(sum(b["edition_count"] for b in books if b["edition_count"]) / max(len([b for b in books if b["edition_count"]]), 1), 1)
    high_rated = len([b for b in rated_books if b["rating"] >= 4.0])

    market_stats = {
        "total_comparable_books": len(books),
        "books_with_ratings": len(rated_books),
        "average_rating": avg_rating,
        "books_rated_4_or_above": high_rated,
        "average_edition_count": avg_editions,
    }

    book_summary = [
        {
            "title": b["title"],
            "rating": b["rating"],
            "ratings_count": b["ratings_count"],
            "edition_count": b["edition_count"],
        }
        for b in books[:15]
    ]

    scoring_prompt = f"""You are a book market analyst evaluating a writer's concept.

Concept: {body.concept}

Genre: {analysis.get("genre")} / {analysis.get("subgenre")}
Themes: {", ".join(analysis.get("themes", []))}
Target audience: {analysis.get("target_audience")}

Market stats from comparable books:
{json.dumps(market_stats, indent=2)}

Sample comparable titles:
{json.dumps(book_summary, indent=2)}{history_context}

Evaluate the concept across three dimensions:

1. market_category — how crowded is this space?
   - "Underserved Niche": few comparables, clear gap in the market
   - "Competitive": healthy number of titles, readers exist but competition is real
   - "Saturated": many titles, hard to stand out without strong differentiation

2. audience_enthusiasm — how passionate are readers in this genre based on ratings and volume?
   - "High": strong ratings (avg 4.0+) and/or large ratings counts
   - "Moderate": mixed ratings or sparse data
   - "Low": poor ratings or very little reader engagement found

3. differentiation_score — on a scale of 1–10, how much room is there for a fresh take?
   - High score (8–10): concept has a distinctive angle not well-covered by existing titles
   - Mid score (4–7): some overlap with existing works, refinement needed
   - Low score (1–3): concept is very close to what already exists

Use the actual market data. Do not guess or default to middle values.

Respond in JSON only:
{{
  "market_category": "Underserved Niche" | "Competitive" | "Saturated",
  "audience_enthusiasm": "High" | "Moderate" | "Low",
  "differentiation_score": <integer 1-10>,
  "reasoning": "2-3 sentences citing specific signals from the market data",
  "recommendations": ["specific suggestion 1", "specific suggestion 2", "specific suggestion 3"]
}}"""

    scoring_response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": scoring_prompt}],
        response_format={"type": "json_object"},
    )
    confidence = json.loads(scoring_response.choices[0].message.content)

    # Save session to DB if we have a project (either passed in or auto-created)
    if saved_project_id and user_id:
        supabase.table("sessions").insert({
            "project_id": saved_project_id,
            "concept": body.concept,
            "analysis": analysis,
            "confidence": confidence,
            "books": books[:15],
        }).execute()

    return {
        "concept": body.concept,
        "analysis": analysis,
        "confidence": confidence,
        "books": books,
        "project_id": saved_project_id,
        "project_title": saved_project_title,
    }


# --- Project endpoints ---

@app.post("/projects")
async def create_project(body: ProjectRequest, user_id: str = Depends(get_current_user)):
    response = supabase.table("projects").insert({
        "user_id": user_id,
        "title": body.title,
    }).execute()
    return response.data[0]


@app.get("/projects")
async def list_projects(user_id: str = Depends(get_current_user)):
    response = (
        supabase.table("projects")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data


@app.get("/projects/{project_id}")
async def get_project(project_id: str, user_id: str = Depends(get_current_user)):
    response = (
        supabase.table("projects")
        .select("*, sessions(*)")
        .eq("id", project_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if response.data is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return response.data


@app.patch("/projects/{project_id}")
async def rename_project(project_id: str, body: ProjectRequest, user_id: str = Depends(get_current_user)):
    response = (
        supabase.table("projects")
        .update({"title": body.title})
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return response.data[0]


@app.delete("/projects/{project_id}")
async def delete_project(project_id: str, user_id: str = Depends(get_current_user)):
    supabase.table("projects").delete().eq("id", project_id).eq("user_id", user_id).execute()
    return {"ok": True}
