-- Run this in your Supabase SQL editor (supabase.com → project → SQL editor)

CREATE TABLE users (
  user_id      TEXT PRIMARY KEY,
  username     TEXT,
  profile_url  TEXT,
  total_books  INTEGER DEFAULT 0,
  last_synced  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE books (
  id             SERIAL PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  goodreads_id   TEXT NOT NULL,
  title          TEXT NOT NULL,
  author         TEXT    DEFAULT '',
  isbn           TEXT    DEFAULT '',
  cover          TEXT    DEFAULT '',
  user_rating    INTEGER DEFAULT 0,
  avg_rating     FLOAT   DEFAULT 0,
  year_read      TEXT    DEFAULT '',
  year_published TEXT    DEFAULT '',
  link           TEXT    DEFAULT '',
  description    TEXT    DEFAULT '',
  subjects       JSONB   DEFAULT '[]',
  primary_genre  TEXT    DEFAULT '',
  UNIQUE(user_id, goodreads_id)
);

CREATE INDEX idx_books_user_id ON books(user_id);
