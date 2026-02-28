import asyncio
import json
import os
import httpx
from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class ConceptRequest(BaseModel):
    concept: str


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
        "fields": "title,author_name,first_publish_year,edition_count,ratings_average,ratings_count,subject",
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
            "thumbnail": None,
            "link": None,
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
async def research_concept(body: ConceptRequest):
    if not body.concept.strip():
        raise HTTPException(status_code=400, detail="Concept cannot be empty")

    # Step 1: analyze the concept
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

    openai_response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    analysis = json.loads(openai_response.choices[0].message.content)

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

    # Step 3: score the concept based on analysis + comparable books
    book_summary = [
        {
            "title": b["title"],
            "authors": b["authors"],
            "rating": b["rating"],
            "ratings_count": b["ratings_count"],
            "edition_count": b["edition_count"],
        }
        for b in books[:15]
    ]

    scoring_prompt = f"""You are a book market analyst evaluating a writer's concept for market potential.

Concept: {body.concept}

Analysis:
- Genre: {analysis.get("genre")} / {analysis.get("subgenre")}
- Themes: {", ".join(analysis.get("themes", []))}
- Target audience: {analysis.get("target_audience")}

Comparable books found ({len(books)} total, showing top 15):
{json.dumps(book_summary, indent=2)}

Based on the genre, themes, competition, and comparable book performance, respond in JSON only:
{{
  "score": <integer 0-100>,
  "reasoning": "2-3 sentences explaining the score based on market signals",
  "recommendations": ["specific suggestion 1", "specific suggestion 2", "specific suggestion 3"]
}}"""

    scoring_response = await openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": scoring_prompt}],
        response_format={"type": "json_object"},
    )
    confidence = json.loads(scoring_response.choices[0].message.content)

    return {
        "concept": body.concept,
        "analysis": analysis,
        "confidence": confidence,
        "books": books,
    }
