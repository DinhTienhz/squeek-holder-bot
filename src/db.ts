import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type User = {
  tg_id: string;
  lang: string;
  quiet_start: number | null;
  quiet_end: number | null;
  threshold: string;
  alerts: number;
  blocked: number;
};

export type Wallet = { id: number; tg_id: string; address: string; label: string | null };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  tg_id       TEXT PRIMARY KEY,
  lang        TEXT NOT NULL DEFAULT 'en',
  quiet_start INTEGER,
  quiet_end   INTEGER,
  threshold   TEXT NOT NULL DEFAULT '500000000000000000',
  alerts      INTEGER NOT NULL DEFAULT 1,
  blocked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
`;

export function openDb(path: string): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  const cols = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('block_alerts')) db.exec('ALTER TABLE users ADD COLUMN block_alerts INTEGER NOT NULL DEFAULT 1');
  if (!cols.has('digest')) db.exec('ALTER TABLE users ADD COLUMN digest INTEGER NOT NULL DEFAULT 1');
  if (!cols.has('last_digest')) db.exec('ALTER TABLE users ADD COLUMN last_digest TEXT');
  return db;
}

export function upsertUser(db: DatabaseSync, tgId: string): User {
  db.prepare('INSERT OR IGNORE INTO users (tg_id) VALUES (?)').run(tgId);
  return getUser(db, tgId)!;
}

export function getUser(db: DatabaseSync, tgId: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId) as User | undefined;
}

export function setLang(db: DatabaseSync, tgId: string, lang: 'vi' | 'en'): void {
  db.prepare('UPDATE users SET lang = ? WHERE tg_id = ?').run(lang, tgId);
}

export function setQuiet(db: DatabaseSync, tgId: string, start: number | null, end: number | null): void {
  db.prepare('UPDATE users SET quiet_start = ?, quiet_end = ? WHERE tg_id = ?').run(start, end, tgId);
}

export function setThreshold(db: DatabaseSync, tgId: string, baseUnits: bigint): void {
  db.prepare('UPDATE users SET threshold = ? WHERE tg_id = ?').run(baseUnits.toString(), tgId);
}

export function setAlerts(db: DatabaseSync, tgId: string, on: boolean): void {
  db.prepare('UPDATE users SET alerts = ? WHERE tg_id = ?').run(on ? 1 : 0, tgId);
}

export function setBlocked(db: DatabaseSync, tgId: string, blocked: boolean): void {
  db.prepare('UPDATE users SET blocked = ? WHERE tg_id = ?').run(blocked ? 1 : 0, tgId);
}

export function addWallet(db: DatabaseSync, tgId: string, address: string, label: string | null, max = 5): { ok: boolean; reason?: string } {
  const count = db.prepare('SELECT COUNT(*) AS n FROM wallets WHERE tg_id = ?').get(tgId) as { n: number };
  const exists = db.prepare('SELECT 1 FROM wallets WHERE tg_id = ? AND address = ?').get(tgId, address);
  if (exists) return { ok: false, reason: 'exists' };
  if (count.n >= max) return { ok: false, reason: 'limit' };
  db.prepare('INSERT INTO wallets (tg_id, address, label) VALUES (?, ?, ?)').run(tgId, address, label);
  return { ok: true };
}

export function removeWallet(db: DatabaseSync, tgId: string, key: string): number {
  const r = db.prepare('DELETE FROM wallets WHERE tg_id = ? AND (address = ? OR lower(label) = lower(?))').run(tgId, key, key);
  return Number(r.changes ?? 0);
}

export function listWallets(db: DatabaseSync, tgId: string): Wallet[] {
  return db.prepare('SELECT * FROM wallets WHERE tg_id = ? ORDER BY id').all(tgId) as Wallet[];
}

export function allWallets(db: DatabaseSync): Wallet[] {
  return db.prepare('SELECT * FROM wallets ORDER BY id').all() as Wallet[];
}

export function walletWatchers(db: DatabaseSync): Map<string, Wallet[]> {
  const map = new Map<string, Wallet[]>();
  for (const w of allWallets(db)) {
    const key = w.address.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  return map;
}

/** true nếu đây là lần đầu thấy key (dùng để chống gửi trùng sau restart). */
export function firstTime(db: DatabaseSync, tgId: string, key: string): boolean {
  const r = db.prepare('INSERT OR IGNORE INTO sent (tg_id, key) VALUES (?, ?)').run(tgId, key);
  return Number(r.changes ?? 0) === 1;
}

export function pruneSent(db: DatabaseSync, days = 14): void {
  db.prepare("DELETE FROM sent WHERE at < datetime('now', ?)").run(`-${days} days`);
}

export function stats(db: DatabaseSync): { users: number; wallets: number; blocked: number } {
  const u = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  const w = db.prepare('SELECT COUNT(*) AS n FROM wallets').get() as { n: number };
  const b = db.prepare('SELECT COUNT(*) AS n FROM users WHERE blocked = 1').get() as { n: number };
  return { users: u.n, wallets: w.n, blocked: b.n };
}

export function wipeUser(db: DatabaseSync, tgId: string): void {
  db.prepare('DELETE FROM wallets WHERE tg_id = ?').run(tgId);
  db.prepare('DELETE FROM sent WHERE tg_id = ?').run(tgId);
  db.prepare('DELETE FROM users WHERE tg_id = ?').run(tgId);
}

export function setBlockAlerts(db: DatabaseSync, tgId: string, on: boolean): void {
  db.prepare('UPDATE users SET block_alerts = ? WHERE tg_id = ?').run(on ? 1 : 0, tgId);
}

export function setDigest(db: DatabaseSync, tgId: string, on: boolean): void {
  db.prepare('UPDATE users SET digest = ? WHERE tg_id = ?').run(on ? 1 : 0, tgId);
}

export function markDigest(db: DatabaseSync, tgId: string, day: string): void {
  db.prepare('UPDATE users SET last_digest = ? WHERE tg_id = ?').run(day, tgId);
}

export function getMeta(db: DatabaseSync, key: string): string | null {
  const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return r?.value ?? null;
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

/** true nếu activity id này chưa từng thấy cho địa chỉ đó. */
export function newActivity(db: DatabaseSync, address: string, activityId: string): boolean {
  const r = db.prepare('INSERT OR IGNORE INTO seen_activity (address, activity_id) VALUES (?, ?)').run(address.toLowerCase(), activityId);
  return Number(r.changes ?? 0) === 1;
}

export function pruneActivity(db: DatabaseSync, days = 30): void {
  db.prepare("DELETE FROM seen_activity WHERE at < datetime('now', ?)").run(`-${days} days`);
}
