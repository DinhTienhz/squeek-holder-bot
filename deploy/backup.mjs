#!/usr/bin/env node
// Backup SQLite an toàn (checkpoint WAL rồi copy), giữ 7 bản gần nhất.
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dbPath = process.env.DB_PATH ?? new URL('../data/bot.db', import.meta.url).pathname;
const outDir = process.env.BACKUP_DIR ?? join(dirname(dbPath), '..', 'backup');
const keep = Number(process.env.BACKUP_KEEP ?? 7);

mkdirSync(outDir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
db.close();

const stamp = new Date().toISOString().slice(0, 10);
const dest = join(outDir, `bot-${stamp}.db`);
copyFileSync(dbPath, dest);
console.log('backup:', dest);

const files = readdirSync(outDir)
  .filter((f) => /^bot-\d{4}-\d{2}-\d{2}\.db$/.test(f))
  .map((f) => ({ f, t: statSync(join(outDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t);
for (const old of files.slice(keep)) unlinkSync(join(outDir, old.f));
