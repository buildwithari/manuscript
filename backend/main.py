import asyncio
import os
import httpx
from fastapi import FastAPI, Query, HTTPException
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes"
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")

OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json"


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


@app.get("/search")
async def search_books(q: str = Query(..., min_length=1)):
    async with httpx.AsyncClient() as client:
        google_results, ol_results = await asyncio.gather(
            fetch_google_books(client, q),
            fetch_open_library(client, q),
        )

    return {"query": q, "results": google_results + ol_results}
