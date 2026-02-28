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


@app.get("/search")
async def search_books(q: str = Query(..., min_length=1)):
    params = {"q": q, "maxResults": 10, "printType": "books"}
    if GOOGLE_BOOKS_API_KEY:
        params["key"] = GOOGLE_BOOKS_API_KEY

    async with httpx.AsyncClient() as client:
        response = await client.get(GOOGLE_BOOKS_API_URL, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Google Books API error")

    items = response.json().get("items", [])

    books = []
    for item in items:
        info = item.get("volumeInfo", {})
        books.append({
            "title": info.get("title"),
            "authors": info.get("authors", []),
            "description": info.get("description"),
            "published_date": info.get("publishedDate"),
            "categories": info.get("categories", []),
            "rating": info.get("averageRating"),
            "ratings_count": info.get("ratingsCount"),
            "thumbnail": info.get("imageLinks", {}).get("thumbnail"),
            "link": info.get("infoLink"),
        })

    return {"query": q, "results": books}


@app.get("/search/openlibrary")
async def search_openlibrary(q: str = Query(..., min_length=1)):
    params = {"q": q, "limit": 10, "fields": "title,author_name,first_publish_year,edition_count,ratings_average,ratings_count,subject"}

    async with httpx.AsyncClient() as client:
        response = await client.get(OPEN_LIBRARY_SEARCH_URL, params=params)

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Open Library API error")

    docs = response.json().get("docs", [])

    books = []
    for doc in docs:
        books.append({
            "title": doc.get("title"),
            "authors": doc.get("author_name", []),
            "first_publish_year": doc.get("first_publish_year"),
            "edition_count": doc.get("edition_count"),
            "rating": doc.get("ratings_average"),
            "ratings_count": doc.get("ratings_count"),
            "subjects": doc.get("subject", [])[:5],
        })

    return {"query": q, "results": books}
