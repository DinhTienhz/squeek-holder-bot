CREATE TABLE IF NOT EXISTS users (
  tg_id       TEXT PRIMARY KEY,
  lang        TEXT NOT NULL DEFAULT 'en',
  quiet_start INTEGER,
  quiet_end   INTEGER,
  threshold   TEXT NOT NULL DEFAULT '500000000000000000',
  alerts      INTEGER NOT NULL DEFAULT 1,
  blocked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  block_alerts    INTEGER NOT NULL DEFAULT 1,
  digest          INTEGER NOT NULL DEFAULT 1,
  last_digest     TEXT,
  hamster_alerts  INTEGER NOT NULL DEFAULT 1,
  activity_alerts INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS wallets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id      TEXT NOT NULL,
  address    TEXT NOT NULL,
  label      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tg_id, address)
);
CREATE TABLE IF NOT EXISTS sent (
  tg_id TEXT NOT NULL,
  key   TEXT NOT NULL,
  at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tg_id, key)
);
CREATE INDEX IF NOT EXISTS sent_at ON sent (at);
CREATE INDEX IF NOT EXISTS wallets_tg ON wallets (tg_id);
CREATE INDEX IF NOT EXISTS wallets_addr ON wallets (address);
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seen_activity (
  address     TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (address, activity_id)
);
CREATE INDEX IF NOT EXISTS seen_at ON seen_activity (at);

CREATE TABLE IF NOT EXISTS snapshots (
  address TEXT PRIMARY KEY,
  state   TEXT NOT NULL,
  at      TEXT NOT NULL DEFAULT (datetime('now'))
);
