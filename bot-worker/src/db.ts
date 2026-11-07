/** D1 adapter: same function names as src/db.ts, but every call is async. */
export type User = {
  tg_id: string; lang: string;
  quiet_start: number | null; quiet_end: number | null;
  threshold: string; alerts: number; blocked: number; created_at: string;
  block_alerts: number; digest: number; last_digest: string | null;
  hamster_alerts: number; activity_alerts: number;
};
export type Wallet = { id: number; tg_id: string; address: string; label: string | null };

type DB = D1Database;

export async function upsertUser(db: DB, tgId: string): Promise<User> {
  await db.prepare('INSERT OR IGNORE INTO users (tg_id) VALUES (?)').bind(tgId).run();
  return (await getUser(db, tgId))!;
}

export async function getUser(db: DB, tgId: string): Promise<User | undefined> {
  return (await db.prepare('SELECT * FROM users WHERE tg_id = ?').bind(tgId).first<User>()) ?? undefined;
}

export async function setLang(db: DB, tgId: string, lang: 'vi' | 'en'): Promise<void> {
  await db.prepare('UPDATE users SET lang = ? WHERE tg_id = ?').bind(lang, tgId).run();
}
export async function setQuiet(db: DB, tgId: string, start: number | null, end: number | null): Promise<void> {
  await db.prepare('UPDATE users SET quiet_start = ?, quiet_end = ? WHERE tg_id = ?').bind(start, end, tgId).run();
}
export async function setThreshold(db: DB, tgId: string, baseUnits: bigint): Promise<void> {
  await db.prepare('UPDATE users SET threshold = ? WHERE tg_id = ?').bind(baseUnits.toString(), tgId).run();
}
export async function setAlerts(db: DB, tgId: string, on: boolean): Promise<void> {
  await db.prepare('UPDATE users SET alerts = ? WHERE tg_id = ?').bind(on ? 1 : 0, tgId).run();
}
export async function setBlocked(db: DB, tgId: string, blocked: boolean): Promise<void> {
  await db.prepare('UPDATE users SET blocked = ? WHERE tg_id = ?').bind(blocked ? 1 : 0, tgId).run();
}
export async function setHamsterAlerts(db: DB, tgId: string, on: boolean): Promise<void> {
  await db.prepare('UPDATE users SET hamster_alerts = ? WHERE tg_id = ?').bind(on ? 1 : 0, tgId).run();
}
export async function setActivityAlerts(db: DB, tgId: string, on: boolean): Promise<void> {
  await db.prepare('UPDATE users SET activity_alerts = ? WHERE tg_id = ?').bind(on ? 1 : 0, tgId).run();
}
export async function setBlockAlerts(db: DB, tgId: string, on: boolean): Promise<void> {
  await db.prepare('UPDATE users SET block_alerts = ? WHERE tg_id = ?').bind(on ? 1 : 0, tgId).run();
}
export async function setDigest(db: DB, tgId: string, on: boolean): Promise<void> {
  await db.prepare('UPDATE users SET digest = ? WHERE tg_id = ?').bind(on ? 1 : 0, tgId).run();
}
export async function markDigest(db: DB, tgId: string, day: string): Promise<void> {
  await db.prepare('UPDATE users SET last_digest = ? WHERE tg_id = ?').bind(day, tgId).run();
}

export async function addWallet(db: DB, tgId: string, address: string, label: string | null, max = 5):
  Promise<{ ok: boolean; reason?: string }> {
  const exists = await db.prepare('SELECT 1 AS x FROM wallets WHERE tg_id = ? AND address = ?').bind(tgId, address).first();
  if (exists) return { ok: false, reason: 'exists' };
  const count = await db.prepare('SELECT COUNT(*) AS n FROM wallets WHERE tg_id = ?').bind(tgId).first<{ n: number }>();
  if ((count?.n ?? 0) >= max) return { ok: false, reason: 'limit' };
  await db.prepare('INSERT INTO wallets (tg_id, address, label) VALUES (?, ?, ?)').bind(tgId, address, label).run();
  return { ok: true };
}

export async function removeWallet(db: DB, tgId: string, key: string): Promise<number> {
  const r = await db.prepare('DELETE FROM wallets WHERE tg_id = ? AND (address = ? OR lower(label) = lower(?))')
    .bind(tgId, key, key).run();
  return Number(r.meta?.changes ?? 0);
}

export async function listWallets(db: DB, tgId: string): Promise<Wallet[]> {
  return (await db.prepare('SELECT * FROM wallets WHERE tg_id = ? ORDER BY id').bind(tgId).all<Wallet>()).results;
}

export async function allWallets(db: DB): Promise<Wallet[]> {
  return (await db.prepare('SELECT * FROM wallets ORDER BY id').all<Wallet>()).results;
}

export async function walletWatchers(db: DB): Promise<Map<string, Wallet[]>> {
  const map = new Map<string, Wallet[]>();
  for (const w of await allWallets(db)) {
    const key = w.address.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  return map;
}

export async function firstTime(db: DB, tgId: string, key: string): Promise<boolean> {
  const r = await db.prepare('INSERT OR IGNORE INTO sent (tg_id, key) VALUES (?, ?)').bind(tgId, key).run();
  return Number(r.meta?.changes ?? 0) === 1;
}

export async function pruneSent(db: DB, days = 14): Promise<void> {
  await db.prepare("DELETE FROM sent WHERE at < datetime('now', ?)").bind(`-${days} days`).run();
}

export async function stats(db: DB): Promise<{ users: number; wallets: number; blocked: number }> {
  const u = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  const w = await db.prepare('SELECT COUNT(*) AS n FROM wallets').first<{ n: number }>();
  const b = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE blocked = 1').first<{ n: number }>();
  return { users: u?.n ?? 0, wallets: w?.n ?? 0, blocked: b?.n ?? 0 };
}

export async function wipeUser(db: DB, tgId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM wallets WHERE tg_id = ?').bind(tgId),
    db.prepare('DELETE FROM sent WHERE tg_id = ?').bind(tgId),
    db.prepare('DELETE FROM users WHERE tg_id = ?').bind(tgId),
  ]);
}

export async function getMeta(db: DB, key: string): Promise<string | null> {
  const r = await db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setMeta(db: DB, key: string, value: string): Promise<void> {
  await db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value).run();
}

export async function newActivity(db: DB, address: string, activityId: string): Promise<boolean> {
  const r = await db.prepare('INSERT OR IGNORE INTO seen_activity (address, activity_id) VALUES (?, ?)')
    .bind(address.toLowerCase(), activityId).run();
  return Number(r.meta?.changes ?? 0) === 1;
}

export async function pruneActivity(db: DB, days = 30): Promise<void> {
  await db.prepare("DELETE FROM seen_activity WHERE at < datetime('now', ?)").bind(`-${days} days`).run();
}

export async function usersWith(db: DB, column: 'alerts' | 'block_alerts' | 'digest' | 'hamster_alerts'): Promise<{ tg_id: string }[]> {
  const sql = `SELECT tg_id FROM users WHERE blocked = 0 AND ${column} = 1`;
  return (await db.prepare(sql).all<{ tg_id: string }>()).results;
}
