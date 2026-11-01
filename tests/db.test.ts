import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addWallet, firstTime, getMeta, getUser, listWallets, markDigest, newActivity, openDb,
  pruneSent, removeWallet, setBlockAlerts, setDigest, setMeta, setQuiet, setThreshold, stats,
  upsertUser, wipeUser,
} from '../src/db.ts';

function withDb(fn: (db: ReturnType<typeof openDb>, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'sqbot-'));
  const db = openDb(join(dir, 'test.db'));
  try { fn(db, dir); } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('user mặc định + cài đặt', () => withDb((db) => {
  const u = upsertUser(db, '123');
  assert.equal(u.lang, 'en');
  assert.equal(u.alerts, 1);
  setThreshold(db, '123', 2n * 10n ** 18n);
  setQuiet(db, '123', 1320, 420);
  const u2 = getUser(db, '123')!;
  assert.equal(u2.threshold, (2n * 10n ** 18n).toString());
  assert.equal(u2.quiet_start, 1320);
}));

test('wallet: thêm, trùng, giới hạn 5, xoá theo label', () => withDb((db) => {
  upsertUser(db, '1');
  for (let i = 0; i < 5; i++) {
    const r = addWallet(db, '1', `0x${String(i).padStart(40, '0')}`, `w${i}`);
    assert.equal(r.ok, true);
  }
  assert.equal(addWallet(db, '1', `0x${'0'.repeat(40)}`, null).reason, 'exists');
  assert.equal(addWallet(db, '1', `0x${'f'.repeat(40)}`, null).reason, 'limit');
  assert.equal(listWallets(db, '1').length, 5);
  assert.equal(removeWallet(db, '1', 'w3'), 1);
  assert.equal(listWallets(db, '1').length, 4);
}));

test('firstTime chỉ đúng lần đầu (chống gửi trùng sau restart)', () => withDb((db) => {
  upsertUser(db, '9');
  assert.equal(firstTime(db, '9', 'claim:0xabc:1'), true);
  assert.equal(firstTime(db, '9', 'claim:0xabc:1'), false);
  assert.equal(firstTime(db, '9', 'claim:0xabc:2'), true);
}));

test('wipeUser xoá sạch dữ liệu', () => withDb((db) => {
  upsertUser(db, '77');
  addWallet(db, '77', `0x${'1'.repeat(40)}`, null);
  firstTime(db, '77', 'k');
  wipeUser(db, '77');
  assert.equal(getUser(db, '77'), undefined);
  assert.equal(listWallets(db, '77').length, 0);
}));

test('stats + pruneSent chạy được', () => withDb((db) => {
  upsertUser(db, 'a'); upsertUser(db, 'b');
  addWallet(db, 'a', `0x${'2'.repeat(40)}`, null);
  db.prepare("INSERT INTO sent (tg_id, key, at) VALUES ('a','old',datetime('now','-30 days'))").run();
  const before = stats(db);
  assert.deepEqual(before, { users: 2, wallets: 1, blocked: 0 });
  pruneSent(db, 14);
  const n = db.prepare('SELECT COUNT(*) AS n FROM sent').get() as { n: number };
  assert.equal(n.n, 0);
}));

test('meta set/get', () => withDb((db) => {
  assert.equal(getMeta(db, 'x'), null);
  setMeta(db, 'x', '42');
  assert.equal(getMeta(db, 'x'), '42');
  setMeta(db, 'x', '43');
  assert.equal(getMeta(db, 'x'), '43');
}));

test('newActivity: chỉ true lần đầu', () => withDb((db) => {
  assert.equal(newActivity(db, '0xABC', 'id1'), true);
  assert.equal(newActivity(db, '0xabc', 'id1'), false);
  assert.equal(newActivity(db, '0xabc', 'id2'), true);
}));

test('digest + block alerts mặc định bật', () => withDb((db) => {
  const u = upsertUser(db, '5');
  assert.equal(u.digest, 1);
  assert.equal(u.block_alerts, 1);
  setDigest(db, '5', false);
  setBlockAlerts(db, '5', false);
  markDigest(db, '5', '2026-11-01');
  const u2 = getUser(db, '5')!;
  assert.equal(u2.digest, 0);
  assert.equal(u2.block_alerts, 0);
  assert.equal(u2.last_digest, '2026-11-01');
}));
