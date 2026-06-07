# Architecture

## Overview

```
Browser
  │
  ├── GET /              → index.html + landing.css + landing.js
  ├── GET /shelf/<slug>  → shelf.html + style.css + landing.css + script.js
  │
  └── API calls
        ├── POST /api/generate
        ├── GET  /api/sync-status/<identifier>
        ├── GET  /api/books/<identifier>
        ├── POST /api/sync/<identifier>
        └── GET  /api/check-slug/<slug>
              │
              ▼
         Flask (app.py)
              │
              ├── Goodreads RSS  (fetch books)
              ├── Open Library   (fetch genres)
              └── Supabase       (store + retrieve data)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3 + Flask |
| Database | Supabase (PostgreSQL) |
| Frontend | Vanilla JS + GSAP (animations) |
| Fonts | Google Fonts — Playfair Display + Inter |
| Hosting | Render (free tier) |
| Book data | Goodreads RSS feed |
| Genre data | Open Library API |

---

## File structure

```
books-webpage/
├── app.py            Flask server — all routes and business logic
├── requirements.txt  Python dependencies
├── render.yaml       Render deployment config
├── schema.sql        Supabase table definitions (run once to set up DB)
├── .env.example      Template for local environment variables
│
├── index.html        Landing page
├── landing.css       Styles for landing page + shared nav components
├── landing.js        Landing page logic (generate shelf, load existing)
│
├── shelf.html        Per-user bookshelf page
├── style.css         All bookshelf styles and animations
├── script.js         Bookshelf logic (filters, cards, modal, sync)
│
├── README.md         Usage and setup guide
└── architecture.md   This file
```

---

## Database schema

### `users`
| Column | Type | Notes |
|---|---|---|
| `user_id` | TEXT PK | Numeric Goodreads user ID |
| `username` | TEXT | Display name (e.g. "Bhavik Soneji") |
| `slug` | TEXT UNIQUE | URL-safe name (e.g. "bhavik-soneji") |
| `profile_url` | TEXT | Full Goodreads profile URL |
| `total_books` | INTEGER | Book count at last sync |
| `last_synced` | TIMESTAMPTZ | Timestamp of last successful sync |
| `created_at` | TIMESTAMPTZ | Row creation time |

### `books`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | Auto-increment |
| `user_id` | TEXT FK → users | Owner |
| `goodreads_id` | TEXT | Goodreads book ID |
| `title` | TEXT | |
| `author` | TEXT | |
| `isbn` | TEXT | Used for Open Library lookup |
| `cover` | TEXT | Image URL from Goodreads |
| `user_rating` | INTEGER | 1–5, 0 = unrated |
| `avg_rating` | FLOAT | Goodreads community rating |
| `year_read` | TEXT | Year the user finished the book |
| `year_published` | TEXT | Original publication year |
| `link` | TEXT | Goodreads book URL |
| `description` | TEXT | Truncated to 700 chars |
| `subjects` | JSONB | Raw subject tags from Open Library |
| `primary_genre` | TEXT | One of 12 canonical genres |

Unique constraint: `(user_id, goodreads_id)` — enables safe upserts on re-sync.

---

## API routes

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/generate` | Validate Goodreads URL, start background sync if new user, redirect if existing |
| `GET` | `/api/sync-status/<id>` | Poll sync progress (id = user_id or slug) |
| `GET` | `/api/books/<id>` | Fetch all books for a shelf (id = user_id or slug) |
| `POST` | `/api/sync/<id>` | Trigger a re-sync from the shelf page |
| `GET` | `/api/check-slug/<slug>` | Check if a slug exists (for the "load existing" input) |

All routes accept either the numeric `user_id` or the `slug` as the identifier — `resolve_user()` in `app.py` handles the lookup.

---

## New user flow

```
1. User pastes Goodreads URL → POST /api/generate
2. Flask extracts numeric user_id from URL
3. If user already in DB → return {status: "exists", slug} → redirect to /shelf/<slug>
4. If new → start background thread (run_sync), return {status: "started", user_id}
5. Frontend polls GET /api/sync-status/<user_id> every 2.5s
6. run_sync phases:
     a. "fetching"  — paginate Goodreads RSS, collect all books
     b. "saving"    — upsert user + books to Supabase (no genres yet, shelf loads fast)
     c. "genres"    — for each book: query Open Library by ISBN then title+author
                      assign one primary genre from 12 canonical genres
     d. "saving"    — upsert books again with genres
7. sync_jobs[user_id] = {status: "done", slug}
8. Frontend receives "done" → redirect to /shelf/<slug>
```

---

## Slug generation

Slugs are derived from the name part of the Goodreads URL:

```
goodreads.com/user/show/168975936-bhavik-soneji
                         └── "bhavik-soneji" → slug = "bhavik-soneji"
```

Rules:
- Lowercase, hyphens only (non-alphanumeric chars stripped)
- If the slug is already taken by a different user, append the last 4 digits of their user_id (e.g. `bhavik-soneji-6936`)
- Users with no name in their URL get `user-<last4>` (e.g. `user-6936`)

---

## Genre classification

12 canonical genres (in priority order):

1. Horror & Supernatural
2. Mythology & Folklore
3. Science Fiction
4. Fantasy
5. Mystery & Crime
6. Thriller & Suspense
7. Historical Fiction
8. Classic Literature
9. Romance
10. Political & Social
11. Self-Help
12. Non-Fiction

`GENRE_MAP` in `app.py` maps ~80 raw Open Library subject strings to these 12 labels. `assign_primary_genre()` matches all subjects for a book and returns the highest-priority match. Books with no matching subject get no genre tag.

---

## Background sync design

Render's free tier kills HTTP requests after 55 seconds. A full sync (100+ books including Open Library lookups) takes 2–5 minutes. Solution:

- `POST /api/generate` or `POST /api/sync` starts a `daemon=True` Python thread and returns immediately
- Thread updates `sync_jobs[user_id]` dict in memory with phase/progress
- Frontend polls `GET /api/sync-status/<id>` every 2.5 seconds
- On completion, `sync_jobs[user_id]` = `{status: "done", slug, total}`
- Frontend redirects to the shelf

Limitation: `sync_jobs` is in-memory — if the server restarts mid-sync, the job is lost and the user would need to click Sync again to restart.
