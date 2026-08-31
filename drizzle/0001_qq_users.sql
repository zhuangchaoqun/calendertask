CREATE TABLE IF NOT EXISTS qq_users (
  openid TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

PRAGMA optimize;
