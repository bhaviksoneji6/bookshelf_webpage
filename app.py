import os
import json
import time
import re
import requests
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, send_from_directory
from datetime import datetime

app = Flask(__name__)

GOODREADS_USER_ID = "168975936"
BOOKS_FILE = "books.json"
GENRE_CACHE_FILE = "genre_cache.json"

# ── Clean genre mapping: raw Open Library subject → one of 12 labels ──────────
GENRE_MAP = {
    # Fantasy
    "fantasy": "Fantasy", "fantasy fiction": "Fantasy", "epic fantasy": "Fantasy",
    "high fantasy": "Fantasy", "dark fantasy": "Fantasy", "historical fantasy": "Fantasy",
    "middle eastern fantasy": "Fantasy", "fantasía": "Fantasy", "epic": "Fantasy",
    "ficción": "Fantasy", "ficciones": "Fantasy",
    # Science Fiction
    "science fiction": "Science Fiction", "sci-fi": "Science Fiction",
    "science-fiction": "Science Fiction", "hard sci-fi": "Science Fiction",
    "hard science-fiction": "Science Fiction", "american science fiction": "Science Fiction",
    "chinese science fiction": "Science Fiction", "science fiction & fantasy": "Science Fiction",
    "futurology": "Science Fiction",
    # Mystery & Crime
    "mystery": "Mystery & Crime", "crime fiction": "Mystery & Crime",
    "detective fiction": "Mystery & Crime", "mystery fiction": "Mystery & Crime",
    "mystery thriller": "Mystery & Crime", "mystery & detective": "Mystery & Crime",
    "detective and mystery stories": "Mystery & Crime",
    "english detective and mystery stories": "Mystery & Crime",
    "roman policier": "Mystery & Crime",
    # Thriller & Suspense
    "thriller": "Thriller & Suspense", "thrillers": "Thriller & Suspense",
    "suspense": "Thriller & Suspense", "techno-thriller": "Thriller & Suspense",
    "suspense & thriller": "Thriller & Suspense", "psychological": "Thriller & Suspense",
    "adventure fiction": "Thriller & Suspense",
    # Historical Fiction
    "historical fiction": "Historical Fiction", "historical": "Historical Fiction",
    "sagas": "Historical Fiction", "saga": "Historical Fiction",
    "history": "Historical Fiction",
    # Classic Literature
    "classics": "Classic Literature", "classic": "Classic Literature",
    "modern fiction": "Classic Literature", "literary fiction": "Classic Literature",
    "fiction classics": "Classic Literature", "coming of age": "Classic Literature",
    # Non-Fiction
    "science": "Non-Fiction", "astrophysics": "Non-Fiction", "cosmology": "Non-Fiction",
    "biography": "Non-Fiction", "philosophy": "Non-Fiction",
    "human anatomy": "Non-Fiction", "human physiology": "Non-Fiction",
    "anatomy": "Non-Fiction", "mathematics": "Non-Fiction",
    "quantum theory": "Non-Fiction", "economics": "Non-Fiction",
    "global financial crisis": "Non-Fiction", "social aspects of science": "Non-Fiction",
    "religion and science": "Non-Fiction", "astrophysics": "Non-Fiction",
    "unified field theories": "Non-Fiction", "superstring theories": "Non-Fiction",
    # Self-Help
    "self-help": "Self-Help", "self-improvement": "Self-Help",
    "self-realization": "Self-Help", "habit": "Self-Help",
    "behavior modification": "Self-Help",
    # Romance
    "romance": "Romance", "love": "Romance", "contemporary": "Romance",
    "gay love": "Romance", "male friendship": "Romance",
    # Horror & Supernatural
    "horror": "Horror & Supernatural", "supernatural": "Horror & Supernatural",
    "occult & supernatural": "Horror & Supernatural",
    # Mythology & Folklore
    "mythology": "Mythology & Folklore", "retellings": "Mythology & Folklore",
    "fairy tales": "Mythology & Folklore", "allegory": "Mythology & Folklore",
    "trojan war": "Mythology & Folklore",
    # Political & Social
    "political satire": "Political & Social", "political": "Political & Social",
    "social science": "Political & Social", "gender studies": "Political & Social",
    "imperialism": "Political & Social", "censorship": "Political & Social",
    "surveillance": "Political & Social", "domestic abuse": "Political & Social",
}

# Priority order — first match wins when a book fits multiple genres
GENRE_PRIORITY = [
    "Horror & Supernatural",
    "Mythology & Folklore",
    "Science Fiction",
    "Fantasy",
    "Mystery & Crime",
    "Thriller & Suspense",
    "Historical Fiction",
    "Classic Literature",
    "Romance",
    "Political & Social",
    "Self-Help",
    "Non-Fiction",
]


def assign_primary_genre(raw_genres):
    matched = set()
    for raw in raw_genres:
        key = raw.lower().strip()
        if key in GENRE_MAP:
            matched.add(GENRE_MAP[key])
    for genre in GENRE_PRIORITY:
        if genre in matched:
            return genre
    return ""


# ── Helpers ────────────────────────────────────────────────────────────────────

def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


SKIP_SUBJECTS = {
    "fiction", "nonfiction", "non-fiction", "accessible book", "protected daisy",
    "in library", "overdrive", "large type books", "open library", "internet archive",
    "american", "english", "british", "translated", "readable", "juvenile fiction",
    "juvenile literature", "young adult fiction", "children", "unknown", "general",
}


def normalize_subjects(raw_list):
    subjects = []
    for raw in raw_list[:30]:
        for part in re.split(r"[/,]", str(raw)):
            part = part.strip().title()
            if part.lower() in SKIP_SUBJECTS or len(part) < 3 or len(part) > 40:
                continue
            if part not in subjects:
                subjects.append(part)
        if len(subjects) >= 12:
            break
    return subjects[:12]


def fetch_subjects(isbn, title, author, cache):
    cache_key = isbn if isbn else f"{title[:40]}::{author[:20]}"
    if cache_key in cache:
        return cache[cache_key]

    subjects = []
    try:
        if isbn:
            resp = requests.get(
                "https://openlibrary.org/api/books",
                params={"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                key = f"ISBN:{isbn}"
                if key in data:
                    raw = [s["name"] if isinstance(s, dict) else s
                           for s in data[key].get("subjects", [])]
                    subjects = normalize_subjects(raw)

        if not subjects:
            safe_t = re.sub(r"[^\w\s]", " ", title[:40]).strip()
            safe_a = re.sub(r"[^\w\s]", " ", author[:25]).strip()
            resp = requests.get(
                "https://openlibrary.org/search.json",
                params={"title": safe_t, "author": safe_a, "limit": 1, "fields": "subject"},
                timeout=10,
            )
            if resp.status_code == 200:
                docs = resp.json().get("docs", [])
                if docs:
                    subjects = normalize_subjects(docs[0].get("subject", []))

    except Exception as e:
        print(f"  Subject error for '{title[:30]}': {e}")

    cache[cache_key] = subjects
    return subjects


# ── RSS parsing ────────────────────────────────────────────────────────────────

def get_text(element, tag):
    child = element.find(tag)
    return child.text.strip() if child is not None and child.text else ""


def fetch_rss_page(user_id, page):
    url = f"https://www.goodreads.com/review/list_rss/{user_id}"
    params = {"shelf": "read", "per_page": 200, "page": page}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    resp = requests.get(url, params=params, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.text


def parse_rss(xml_text):
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"XML parse error: {e}")
        return []

    channel = root.find("channel")
    if channel is None:
        return []

    books = []
    for item in channel.findall("item"):
        title = get_text(item, "title")
        if not title or title == "Private":
            continue

        author = get_text(item, "author_name")
        isbn   = get_text(item, "isbn13") or get_text(item, "isbn")
        cover  = (get_text(item, "book_large_image_url")
                  or get_text(item, "book_medium_image_url")
                  or get_text(item, "book_image_url"))

        user_rating_raw = get_text(item, "user_rating")
        avg_rating_raw  = get_text(item, "average_rating")
        read_at         = get_text(item, "user_read_at")
        published       = get_text(item, "book_published")
        book_id         = get_text(item, "book_id")
        link            = get_text(item, "link")
        description_html = get_text(item, "book_description")

        year_read = ""
        if read_at:
            m = re.search(r"\b(20\d\d|19\d\d)\b", read_at)
            if m:
                year_read = m.group()

        description = re.sub(r"<[^>]+>", "", description_html).strip()
        description = re.sub(r"\s+", " ", description)
        if len(description) > 700:
            description = description[:700].rsplit(" ", 1)[0] + "…"

        try:
            user_rating = int(user_rating_raw)
        except (ValueError, TypeError):
            user_rating = 0

        try:
            avg_rating = round(float(avg_rating_raw), 2)
        except (ValueError, TypeError):
            avg_rating = 0.0

        books.append({
            "id": book_id, "title": title, "author": author,
            "isbn": isbn, "cover": cover,
            "user_rating": user_rating, "avg_rating": avg_rating,
            "year_read": year_read, "year_published": published,
            "link": link, "description": description,
            "subjects": [], "primary_genre": "",
        })

    return books


# ── Main fetch ─────────────────────────────────────────────────────────────────

def fetch_and_save_books():
    print("\n📚 Starting Goodreads sync...")
    subject_cache = load_json(GENRE_CACHE_FILE, {})
    all_books = []
    page = 1

    while True:
        print(f"  Fetching page {page}...")
        try:
            xml_text  = fetch_rss_page(GOODREADS_USER_ID, page)
            page_books = parse_rss(xml_text)
            print(f"  ✓ Got {len(page_books)} books")
            if not page_books:
                break
            all_books.extend(page_books)
            if len(page_books) < 200:
                break
            page += 1
            time.sleep(2)
        except Exception as e:
            print(f"  ✗ Error on page {page}: {e}")
            break

    print(f"\n  Total books: {len(all_books)}")
    print("  Fetching subjects for genre mapping...")

    for i, book in enumerate(all_books):
        cache_key = book["isbn"] if book["isbn"] else f"{book['title'][:40]}::{book['author'][:20]}"
        if cache_key in subject_cache:
            book["subjects"] = subject_cache[cache_key]
        else:
            print(f"  [{i+1}/{len(all_books)}] {book['title'][:50]}")
            book["subjects"] = fetch_subjects(book["isbn"], book["title"], book["author"], subject_cache)
            time.sleep(0.6)

        book["primary_genre"] = assign_primary_genre(book["subjects"])

        if (i + 1) % 15 == 0:
            save_json(GENRE_CACHE_FILE, subject_cache)

    save_json(GENRE_CACHE_FILE, subject_cache)

    result = {
        "books": all_books,
        "last_updated": datetime.now().isoformat(),
        "total": len(all_books),
    }
    save_json(BOOKS_FILE, result)
    print(f"\n✅ Saved {len(all_books)} books.\n")
    return result


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/api/books")
def get_books():
    data = load_json(BOOKS_FILE, {"books": [], "total": 0, "last_updated": None})
    return jsonify(data)


@app.route("/api/update", methods=["POST"])
def update_books():
    try:
        result = fetch_and_save_books()
        return jsonify({"status": "success", "total": result["total"],
                        "last_updated": result["last_updated"]})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


if __name__ == "__main__":
    if not os.path.exists(BOOKS_FILE):
        print("No books.json found — fetching for the first time...")
        fetch_and_save_books()
    port = int(os.environ.get("PORT", 8080))
    print(f"\n🚀 Server running at http://localhost:{port}\n")
    app.run(debug=False, host="0.0.0.0", port=port)
