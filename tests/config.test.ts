import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';

test('config: BOT_TOKEN alias is accepted and disables dry-run', () => {
  const cfg = loadConfig({ BOT_TOKEN: '123456:abc' });
  assert.equal(cfg.botToken, '123456:abc');
  assert.equal(cfg.dryRun, false);
});

test('config: TELEGRAM_BOT_TOKEN wins over BOT_TOKEN', () => {
  const cfg = loadConfig({ TELEGRAM_BOT_TOKEN: 'a', BOT_TOKEN: 'b' });
  assert.equal(cfg.botToken, 'a');
});

test('config: no token means dry-run', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.botToken, '');
  assert.equal(cfg.dryRun, true);
});

test('config: DRY_RUN=1 forces dry-run even with a token', () => {
  const cfg = loadConfig({ BOT_TOKEN: '123456:abc', DRY_RUN: '1' });
  assert.equal(cfg.dryRun, true);
});
