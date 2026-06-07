# Shelf — Goodreads Bookshelf Display

A universal web app that turns any public Goodreads profile into a beautiful, filterable bookshelf with a permanent shareable URL.

**Live site:** https://bookshelf-webpage.onrender.com

---

## What it does

- Paste any public Goodreads profile URL on the landing page
- The app fetches all books from the read shelf, classifies each into one of 12 genres via Open Library, and stores everything in Supabase
- Each user gets a permanent shelf at `/shelf/your-name` (e.g. `/shelf/bhavik-soneji`)
- Anyone can load an existing shelf by typing the username into the landing page
- A Sync button on the shelf page re-fetches Goodreads and updates the library at any time

---

## Running locally

```bash
cd ~/Projects/books-webpage
cp .env.example .env          # fill in SUPABASE_URL and SUPABASE_KEY
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Open **http://localhost:8080** in your browser.

---

## Environment variables

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → General → Project URL |
| `SUPABASE_KEY` | Supabase → Settings → API Keys → Legacy anon key |

On Render these are set under the service's **Environment** tab.

---

## Syncing new books

1. Finish books on Goodreads (mark as read)
2. Go to your shelf page — `bookshelf-webpage.onrender.com/shelf/bhavik-soneji`
3. Click **Sync** in the top-right nav
4. Wait ~2–5 minutes for the sync to complete (progress shown on screen)

That's it. No code changes or deployments needed.

---

## Database setup (first time only)

Run the contents of `schema.sql` in the Supabase SQL Editor. This creates the `users` and `books` tables. Choose **without RLS** when prompted — all DB access goes through the Flask backend, never directly from the browser.

---

## Deployment

The app is hosted on [Render](https://render.com) (free tier) and configured via `render.yaml`. Render auto-deploys on every push to the `main` branch.

**Start command:** `gunicorn app:app`

---

## Notes

- **Cold starts:** Render's free tier sleeps after 15 minutes of inactivity. The first visit after idle takes ~30 seconds to wake up.
- **Goodreads shelf must be public:** The sync reads the Goodreads RSS feed, which requires the shelf to be set to public in Goodreads privacy settings.
- **Genre classification:** Genres are fetched from [Open Library](https://openlibrary.org) — free, no API key needed. Books without a recognised genre show no tag and will be retried on the next sync.
- **Sync timeout fix:** Syncing 100+ books takes 2–5 minutes. To avoid Render's 55-second HTTP timeout, syncs run in a background thread and the frontend polls for progress every 2.5 seconds.
