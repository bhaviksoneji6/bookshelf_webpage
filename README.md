# Bhavik's Bookshelf

Personal reading library pulled from Goodreads, hosted at **https://bookshelf-webpage.onrender.com**

---

## Syncing new books

When you've finished new books on Goodreads and want the website to reflect them:

### Step 1 — Trigger a sync on the live site

Go to **https://bookshelf-webpage.onrender.com** and click the **Sync Library** button in the top-right corner. This re-fetches your Goodreads shelf and updates genres. It takes 2–5 minutes depending on how many new books were added.

### Step 2 — Save the update permanently

Once the sync is done, run these commands locally to lock the new data into GitHub (so it survives server restarts and redeployments):

```bash
cd ~/Projects/books-webpage
git add books.json
git commit -m "sync library"
git push
```

Render will automatically redeploy with the updated data.

---

## Running locally

```bash
cd ~/Projects/books-webpage
python3 app.py
```

Then open **http://localhost:8080** in your browser.

---

## How the site works

| File | Purpose |
|---|---|
| `app.py` | Flask server — serves the page and handles Goodreads sync |
| `books.json` | Your book data (committed to repo as the source of truth) |
| `index.html` | Page structure |
| `style.css` | All styles and animations |
| `script.js` | Frontend logic — filters, 3D tilt, GSAP animations |
| `genre_cache.json` | Local cache for Open Library genre lookups (not committed) |

## Notes

- The live site on Render's free tier **sleeps after 15 min of inactivity** — the first visit after idle takes ~30 seconds to wake up.
- Genres are fetched from [Open Library](https://openlibrary.org) — free, no API key needed.
- Books without a recognised genre show no tag and will be retried on the next sync.
