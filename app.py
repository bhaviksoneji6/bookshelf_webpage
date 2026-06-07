import os
import re
import time
import threading
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from flask import Flask, jsonify, send_from_directory, request
from supabase import create_client, Client

app = Flask(__name__)

# ── Supabase ───────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

def get_sb() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# ── In-memory sync job tracker ─────────────────────────────────────────────────
# { user_id: { status, phase, progress, total, message } }
sync_jobs: dict = {}

# ── In-memory subject cache (persists for server lifetime) ─────────────────────
subject_cache: dict = {}

# ── Genre mapping ──────────────────────────────────────────────────────────────
GENRE_MAP = {
    "fantasy": "Fantasy", "fantasy fiction": "Fantasy", "epic fantasy": "Fantasy",
    "high fantasy": "Fantasy", "dark fantasy": "Fantasy", "historical fantasy": "Fantasy",
    "middle eastern fantasy": "Fantasy", "fantasía": "Fantasy", "epic": "Fantasy",
    "ficción": "Fantasy", "ficciones": "Fantasy",
    "science fiction": "Science Fiction", "sci-fi": "Science Fiction",
    "science-fiction": "Science Fiction", "hard sci-fi": "Science Fiction",
    "hard science-fiction": "Science Fiction", "american science fiction": "Science Fiction",
    "chinese science fiction": "Science Fiction", "science fiction & fantasy": "Science Fiction",
    "futurology": "Science Fiction",
    "mystery": "Mystery & Crime", "crime fiction": "Mystery & Crime",
    "detective fiction": "Mystery & Crime", "mystery fiction": "Mystery & Crime",
    "mystery thriller": "Mystery & Crime", "mystery & detective": "Mystery & Crime",
    "detective and mystery stories": "Mystery & Crime",
    "english detective and mystery stories": "Mystery & Crime",
    "roman policier": "Mystery & Crime",
    "thriller": "Thriller & Suspense", "thrillers": "Thriller & Suspense",
    "suspense": "Thriller & Suspense", "techno-thriller": "Thriller & Suspense",
    "suspense & thriller": "Thriller & Suspense", "psychological": "Thriller & Suspense",
    "adventure fiction": "Thriller & Suspense",
    "historical fiction": "Historical Fiction", "historical": "Historical Fiction",
    "sagas": "Historical Fiction", "saga": "Historical Fiction",
    "history": "Historical Fiction",
    "classics": "Classic Literature", "classic": "Classic Literature",
    "modern fiction": "Classic Literature", "literary fiction": "Classic Literature",
    "fiction classics": "Classic Literature", "coming of age": "Classic Literature",
    "science": "Non-Fiction", "astrophysics": "Non-Fiction", "cosmology": "Non-Fiction",
    "biography": "Non-Fiction", "philosophy": "Non-Fiction",
    "human anatomy": "Non-Fiction", "human physiology": "Non-Fiction",
    "anatomy": "Non-Fiction", "mathematics": "Non-Fiction",
    "quantum theory": "Non-Fiction", "economics": "Non-Fiction",
    "global financial crisis": "Non-Fiction", "social aspects of science": "Non-Fiction",
    "religion and science": "Non-Fiction", "unified field theories": "Non-Fiction",
    "superstring theories": "Non-Fiction",
    "self-help": "Self-Help", "self-improvement": "Self-Help",
    "self-realization": "Self-Help", "habit": "Self-Help",
    "behavior modification": "Self-Help",
    "romance": "Romance", "love": "Romance", "contemporary": "Romance",
    "gay love": "Romance",
    "horror": "Horror & Supernatural", "supernatural": "Horror & Supernatural",
    "occult & supernatural": "Horror & Supernatural",
    "mythology": "Mythology & Folklore", "retellings": "Mythology & Folklore",
    "fairy tales": "Mythology & Folklore", "allegory": "Mythology & Folklore",
    "trojan war": "Mythology & Folklore",
    "political satire": "Political & Social", "political": "Political & Social",
    "social science": "Political & Social", "gender studies": "Political & Social",
    "imperialism": "Political & Social", "censorship": "Political & Social",
    "surveillance": "Political & Social", "domestic abuse": "Political & Social",
}

GENRE_PRIORITY = [
    "Horror & Supernatural", "Mythology & Folklore", "Science Fiction", "Fantasy",
    "Mystery & Crime", "Thriller & Suspense", "Historical Fiction", "Classic Literature",
    "Romance", "Political & Social", "Self-Help", "Non-Fiction",
]

SKIP_SUBJECTS = {
    "fiction", "nonfiction", "non-fiction", "accessible book", "protected daisy",
    "in library", "overdrive", "large type books", "open library", "internet archive",
    "american", "english", "british", "translated", "readable", "juvenile fiction",
    "juvenile literature", "young adult fiction", "children", "unknown", "general",
}

def assign_primary_genre(subjects: list) -> str:
    matched = set()
    for raw in subjects:
        key = raw.lower().strip()
        if key in GENRE_MAP:
            matched.add(GENRE_MAP[key])
    for genre in GENRE_PRIORITY:
        if genre in matched:
            return genre
    return ""

def normalize_subjects(raw_list: list) -> list:
    out = []
    for raw in raw_list[:30]:
        for part in re.split(r"[/,]", str(raw)):
            part = part.strip().title()
            if part.lower() in SKIP_SUBJECTS or len(part) < 3 or len(part) > 40:
                continue
            if part not in out:
                out.append(part)
        if len(out) >= 12:
            break
    return out[:12]

# ── Open Library genre fetch ───────────────────────────────────────────────────
def fetch_subjects(isbn: str, title: str, author: str) -> list:
    cache_key = isbn if isbn else f"{title[:40]}::{author[:20]}"
    if cache_key in subject_cache:
        return subject_cache[cache_key]

    subjects = []
    try:
        if isbn:
            r = requests.get(
                "https://openlibrary.org/api/books",
                params={"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"},
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                key = f"ISBN:{isbn}"
                if key in data:
                    raw = [s["name"] if isinstance(s, dict) else s
                           for s in data[key].get("subjects", [])]
                    subjects = normalize_subjects(raw)

        if not subjects:
            safe_t = re.sub(r"[^\w\s]", " ", title[:40]).strip()
            safe_a = re.sub(r"[^\w\s]", " ", author[:25]).strip()
            r = requests.get(
                "https://openlibrary.org/search.json",
                params={"title": safe_t, "author": safe_a, "limit": 1, "fields": "subject"},
                timeout=10,
            )
            if r.status_code == 200:
                docs = r.json().get("docs", [])
                if docs:
                    subjects = normalize_subjects(docs[0].get("subject", []))
    except Exception as e:
        print(f"  Subject error for '{title[:30]}': {e}")

    subject_cache[cache_key] = subjects
    return subjects

# ── Goodreads RSS ──────────────────────────────────────────────────────────────
def get_text(el, tag: str) -> str:
    child = el.find(tag)
    return child.text.strip() if child is not None and child.text else ""

def fetch_rss_page(user_id: str, page: int) -> str:
    url = f"https://www.goodreads.com/review/list_rss/{user_id}"
    params = {"shelf": "read", "per_page": 200, "page": page}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    r = requests.get(url, params=params, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text

def parse_rss(xml_text: str) -> list:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
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
        read_at = get_text(item, "user_read_at")
        desc_html = get_text(item, "book_description")

        year_read = ""
        if read_at:
            m = re.search(r"\b(20\d\d|19\d\d)\b", read_at)
            if m:
                year_read = m.group()

        desc = re.sub(r"<[^>]+>", "", desc_html).strip()
        desc = re.sub(r"\s+", " ", desc)
        if len(desc) > 700:
            desc = desc[:700].rsplit(" ", 1)[0] + "…"

        try:
            user_rating = int(get_text(item, "user_rating"))
        except (ValueError, TypeError):
            user_rating = 0
        try:
            avg_rating = round(float(get_text(item, "average_rating")), 2)
        except (ValueError, TypeError):
            avg_rating = 0.0

        books.append({
            "id":             get_text(item, "book_id"),
            "title":          title,
            "author":         author,
            "isbn":           isbn,
            "cover":          cover,
            "user_rating":    user_rating,
            "avg_rating":     avg_rating,
            "year_read":      year_read,
            "year_published": get_text(item, "book_published"),
            "link":           get_text(item, "link"),
            "description":    desc,
            "subjects":       [],
            "primary_genre":  "",
        })
    return books

# ── Slug helpers ───────────────────────────────────────────────────────────────
def generate_slug(name_part: str, user_id: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name_part.lower()).strip("-")
    if not base or len(base) < 2:
        base = f"user-{user_id[-4:]}"

    # If slug is taken by a different user, append last 4 digits of user_id
    try:
        r = get_sb().table("users").select("user_id").eq("slug", base).execute()
        if r.data and r.data[0]["user_id"] != user_id:
            base = f"{base}-{user_id[-4:]}"
    except Exception:
        pass
    return base

# ── Supabase helpers ───────────────────────────────────────────────────────────
def db_upsert_user(user_id: str, username: str, profile_url: str, total: int, slug: str = ""):
    record = {
        "user_id":     user_id,
        "username":    username,
        "profile_url": profile_url,
        "total_books": total,
        "last_synced": datetime.now(timezone.utc).isoformat(),
    }
    if slug:
        record["slug"] = slug
    get_sb().table("users").upsert(record).execute()

def db_upsert_books(user_id: str, books: list):
    records = [{
        "user_id":        user_id,
        "goodreads_id":   b["id"],
        "title":          b["title"],
        "author":         b.get("author", ""),
        "isbn":           b.get("isbn", ""),
        "cover":          b.get("cover", ""),
        "user_rating":    b.get("user_rating", 0),
        "avg_rating":     b.get("avg_rating", 0.0),
        "year_read":      b.get("year_read", ""),
        "year_published": b.get("year_published", ""),
        "link":           b.get("link", ""),
        "description":    b.get("description", ""),
        "subjects":       b.get("subjects", []),
        "primary_genre":  b.get("primary_genre", ""),
    } for b in books]

    sb = get_sb()
    for i in range(0, len(records), 50):
        sb.table("books").upsert(records[i:i + 50], on_conflict="user_id,goodreads_id").execute()

def db_get_user(user_id: str) -> dict | None:
    r = get_sb().table("users").select("*").eq("user_id", user_id).execute()
    return r.data[0] if r.data else None

def db_get_user_by_slug(slug: str) -> dict | None:
    r = get_sb().table("users").select("*").eq("slug", slug).execute()
    return r.data[0] if r.data else None

def db_get_books(user_id: str) -> list:
    r = get_sb().table("books").select("*").eq("user_id", user_id).execute()
    return r.data or []

def resolve_user(identifier: str) -> dict | None:
    """Resolve either a numeric user_id or a slug to a user record."""
    if re.match(r"^\d+$", identifier):
        return db_get_user(identifier)
    return db_get_user_by_slug(identifier)

# ── Background sync ────────────────────────────────────────────────────────────
def run_sync(user_id: str, profile_url: str):
    try:
        sync_jobs[user_id] = {"status": "running", "phase": "fetching", "progress": 0, "total": 0}

        # Extract name part from URL for slug and display name
        m = re.search(r"/user/show/\d+-(.+)$", profile_url)
        name_part = m.group(1) if m else ""
        username  = name_part.replace("-", " ").title() if name_part else f"User {user_id}"
        slug      = generate_slug(name_part if name_part else f"user-{user_id[-4:]}", user_id)

        # Fetch all pages from Goodreads RSS
        all_books = []
        page = 1
        while True:
            try:
                page_books = parse_rss(fetch_rss_page(user_id, page))
            except Exception as e:
                print(f"RSS error page {page}: {e}")
                break
            if not page_books:
                break
            all_books.extend(page_books)
            if len(page_books) < 200:
                break
            page += 1
            time.sleep(2)

        sync_jobs[user_id]["total"] = len(all_books)
        sync_jobs[user_id]["phase"] = "saving"

        # Save immediately (no genres yet) so shelf loads fast
        db_upsert_user(user_id, username, profile_url, len(all_books), slug)
        db_upsert_books(user_id, all_books)

        sync_jobs[user_id]["phase"] = "genres"

        # Enrich genres in-memory then batch save
        for i, book in enumerate(all_books):
            book["subjects"]      = fetch_subjects(book["isbn"], book["title"], book["author"])
            book["primary_genre"] = assign_primary_genre(book["subjects"])
            sync_jobs[user_id]["progress"] = i + 1
            time.sleep(0.6)

        # Final save with genres
        sync_jobs[user_id]["phase"] = "saving"
        db_upsert_books(user_id, all_books)
        db_upsert_user(user_id, username, profile_url, len(all_books), slug)

        sync_jobs[user_id] = {"status": "done", "total": len(all_books), "slug": slug}

    except Exception as e:
        print(f"Sync error for {user_id}: {e}")
        sync_jobs[user_id] = {"status": "error", "message": str(e)}

# ── Routes ─────────────────────────────────────────────────────────────────────
@app.route("/")
def landing():
    return send_from_directory(".", "index.html")

@app.route("/shelf/<slug>")
def shelf(slug):
    return send_from_directory(".", "shelf.html")

@app.route("/api/generate", methods=["POST"])
def api_generate():
    data = request.get_json(silent=True) or {}
    url  = data.get("url", "").strip()

    m = re.search(r"goodreads\.com/user/show/(\d+)", url)
    if not m:
        return jsonify({"error": "Please enter a valid Goodreads profile URL"}), 400

    user_id = m.group(1)

    # Already syncing?
    if sync_jobs.get(user_id, {}).get("status") == "running":
        existing = db_get_user(user_id)
        slug = existing.get("slug", "") if existing else ""
        return jsonify({"user_id": user_id, "slug": slug, "status": "running"})

    # Already in DB?
    existing = db_get_user(user_id)
    if existing:
        return jsonify({
            "user_id":  user_id,
            "slug":     existing.get("slug", ""),
            "status":   "exists",
            "total":    existing["total_books"],
            "username": existing["username"],
        })

    # Kick off background sync
    sync_jobs[user_id] = {"status": "running", "phase": "starting", "progress": 0, "total": 0}
    threading.Thread(target=run_sync, args=(user_id, url), daemon=True).start()
    return jsonify({"user_id": user_id, "slug": "", "status": "started"})

@app.route("/api/sync-status/<identifier>")
def api_sync_status(identifier):
    user = resolve_user(identifier)
    user_id = user["user_id"] if user else identifier
    return jsonify(sync_jobs.get(user_id, {"status": "unknown"}))

@app.route("/api/books/<identifier>")
def api_books(identifier):
    user = resolve_user(identifier)
    if not user:
        return jsonify({"error": "Shelf not found"}), 404
    user_id = user["user_id"]
    books = db_get_books(user_id)
    return jsonify({
        "books":        books,
        "total":        len(books),
        "last_updated": user.get("last_synced"),
        "username":     user.get("username", ""),
        "slug":         user.get("slug", ""),
    })

@app.route("/api/sync/<identifier>", methods=["POST"])
def api_sync(identifier):
    user = resolve_user(identifier)
    if not user:
        return jsonify({"error": "Shelf not found"}), 404
    user_id = user["user_id"]
    if sync_jobs.get(user_id, {}).get("status") == "running":
        return jsonify({"status": "already_running"})
    sync_jobs[user_id] = {"status": "running", "phase": "starting", "progress": 0, "total": 0}
    threading.Thread(target=run_sync, args=(user_id, user["profile_url"]), daemon=True).start()
    return jsonify({"status": "started", "user_id": user_id})

@app.route("/api/check-slug/<slug>")
def api_check_slug(slug):
    user = db_get_user_by_slug(slug)
    if not user:
        return jsonify({"exists": False}), 404
    return jsonify({"exists": True, "slug": slug, "username": user.get("username", "")})

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"\nServer running at http://localhost:{port}\n")
    app.run(debug=False, host="0.0.0.0", port=port)
