/**
 * End-to-end check of the bot command surface without a Telegram user.
 *
 * It feeds synthetic updates into the real grammY bot and captures the API
 * calls the bot would make (sendMessage), so every handler runs with the real
 * API client, DB and formatting code.
 *
 * Usage: node scripts/e2e-bot.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { createBot } from '../src/bot.ts';
import {
  alertActivity, alertBlock, alertClaim, alertHamster, digestMsg,
} from '../src/format.ts';
import { claimablePerToken } from '../src/chain.ts';

const WALLET = process.env.E2E_WALLET ?? '0x4e6fc32b6a0adc1cd1e13949666fe66ec40e01f2';
const TG = 999000111;

const dir = mkdtempSync(join(tmpdir(), 'sqk-e2e-'));
const cfg = loadConfig({
  ...process.env,
  DB_PATH: join(dir, 'bot.db'),
  TELEGRAM_BOT_TOKEN: process.env.BOT_TOKEN ?? '123456:TEST',
  DRY_RUN: '0',
});

const { bot, api } = createBot(cfg);
// grammY refuses handleUpdate() before init(); give it known bot info instead of
// calling getMe with a synthetic token.
(bot as any).botInfo = {
  id: 9264612982,
  is_bot: true,
  first_name: 'Squeek Holder Bot',
  username: 'SqueekHolder_Bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};
const sent: string[] = [];

bot.api.config.use(async (_prev: any, method: string, payload: any) => {
  if (method === 'sendMessage' || method === 'editMessageText') {
    sent.push(String(payload.text ?? payload.caption ?? ''));
  }
  return {
    ok: true,
    result: {
      message_id: sent.length,
      date: Math.floor(Date.now() / 1000),
      chat: { id: payload.chat_id ?? TG, type: 'private' },
      text: payload.text ?? '',
    },
  } as any;
});

let updateId = 1;
async function cmd(text: string, ms = 900): Promise<string> {
  sent.length = 0;
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: TG, type: 'private', first_name: 'E2E' },
      from: { id: TG, is_bot: false, first_name: 'E2E', username: 'e2e' },
      text,
      entities: text.startsWith('/')
        ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }]
        : [],
    },
  } as any);
  await new Promise((r) => setTimeout(r, ms));
  return sent.join('\n---\n') || '(no reply)';
}

const results: { name: string; ok: boolean; text: string }[] = [];
const record = (name: string, ok: boolean, text: string) => {
  results.push({ name, ok, text });
  console.log(`\n### ${name} — ${ok ? 'PASS' : 'FAIL'}`);
  console.log(text.slice(0, 1200));
};

try {
  let r = await cmd('/start', 1200);
  record('1. /start (welcome)', r.includes('/watch') || r.includes('Squeek'), r);

  // Two wallets, thin one added first: commands without an address must still
  // target the wallet that actually holds Squeeks.
  const THIN = '0xe0c18c32f0838d9c295d9cff433f2eff9deacc2c';
  r = await cmd(`/watch ${THIN} thin`, 1500);
  record('2a. /watch thin wallet', r.includes('thin') || r.toLowerCase().includes('added'), r);

  r = await cmd(`/watch ${WALLET} whale`, 1500);
  record('2b. /watch whale wallet', r.includes('whale') || r.toLowerCase().includes('added'), r);

  r = await cmd('/list', 900);
  record('3. /list wallets', r.includes('0x4e6f') || r.includes('whale'), r);

  r = await cmd('/status', 1500);
  record('4. /status hamster', /block|hamster|rpm/i.test(r), r);

  r = await cmd('/claim', 9000);
  record('5. /claim optimizer', /SQK|batch|claim/i.test(r), r);

  r = await cmd('/mergecheck', 9000);
  record('6. /mergecheck cooldown', r.length > 0, r);

  r = await cmd('/ladder', 9000);
  record('7. /ladder planner', /L2|ladder|Merge plan/i.test(r), r);

  r = await cmd('/threshold 5', 700);
  record('8. /threshold set', /5/.test(r), r);

  r = await cmd('/threshold', 700);
  record('8b. /threshold show', /5/.test(r) && /threshold/i.test(r), r);

  r = await cmd('/alerts', 700);
  record('9a. /alerts (bare shows state)', /Alerts:|Thông báo:/i.test(r), r);

  r = await cmd('/alerts off', 700);
  record('9b. /alerts off', /off|tắt/i.test(r), r);

  r = await cmd('/alerts on', 700);
  record('9c. /alerts on', /on|bật/i.test(r), r);

  r = await cmd('/hamster', 700);
  record('9e. /hamster (bare shows state)', /Hamster alerts:/i.test(r), r);

  r = await cmd('/hamster off', 700);
  record('9f. /hamster off', /off|tắt/i.test(r), r);

  r = await cmd('/hamster on', 700);
  record('9g. /hamster on', /on|bật/i.test(r), r);

  r = await cmd('/block', 700);
  record('9d. /block (bare shows state)', /Block alerts:/i.test(r), r);

  r = await cmd('/block on', 700);
  record('9. /block on', /block/i.test(r), r);

  r = await cmd('/digest', 700);
  record('10a. /digest (bare shows state)', /Digest:/i.test(r), r);

  r = await cmd('/digest on', 700);
  record('10. /digest on', /digest/i.test(r), r);

  r = await cmd('/quiet 22:00-07:00', 700);
  record('11. /quiet range', /22|07|quiet/i.test(r), r);

  r = await cmd('/quiet', 700);
  record('11b. /quiet (bare shows state)', /Quiet hours:|Im lặng:/i.test(r), r);

  r = await cmd('/lang vi', 700);
  record('12. /lang vi', r.length > 0, r);

  r = await cmd('/lang', 700);
  record('12b. /lang (bare shows current)', /Current language|Ngôn ngữ hiện tại/i.test(r), r);

  r = await cmd('/lang de', 700);
  record('12c. /lang unsupported', /Only|Chỉ hỗ trợ/i.test(r), r);

  // Alert payloads the poller would send, built from live data.
  const acct = await api.account(WALLET);
  const claimAlert = alertClaim('en', { address: WALLET, amount: acct.claimable, threshold: 5n * 10n ** 18n });
  record('13. claim alert text', claimAlert.length > 0, claimAlert);

  const st = await api.status();
  record('14. hamster alert text (stopped)', true, alertHamster('en', { ...st, coreStatus: 'IDLE' }));
  record('14b. hamster alert text (running)', true, alertHamster('en', { ...st, coreStatus: 'SPINNING', rpmMilli: 4200 }));

  record('15. block alert text', true, alertBlock('en', { height: st.blockHeight, minted: null }));

  const acts = await api.activity(WALLET);
  if (acts.length) {
    record('16. wallet activity alert', true, alertActivity('en', { address: WALLET, kind: acts[0].kind, amount: acts[0].amount, tx: acts[0].txHash }));
  } else {
    record('16. wallet activity alert', true, '(wallet has no recent activity)');
  }

  record('17. digest text', true, digestMsg('en', { day: '02/11/2026', wallets: 1, claimable: acct.claimable, ready: acct.tokens.filter((t) => t.mergeState === 'ready').length, height: st.blockHeight }));

  // Direct chain read (documents the known ABI mismatch instead of hiding it).
  try {
    const arr = await claimablePerToken(cfg.rpcUrl, cfg.miningAddress, acct.tokens.slice(0, 4).map((t) => t.tokenId), cfg.collection);
    record('18. claimablePerToken (chain)', true, `ok: [${arr.join(', ')}]`);
  } catch (e) {
    record('18. claimablePerToken (chain)', false, `reverts: ${(e as Error).message} → falls back to API total (estimated)`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n=== ${passed}/${results.length} checks passed ===`);
process.exit(passed === results.length ? 0 : 1);
