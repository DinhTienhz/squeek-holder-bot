import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addrShort, alertActivity, alertBlock, alertClaim, alertCooldown, alertHamster, claimMsg,
  digestMsg, esc, fmtInt, fullAddr, help, ladderMsg, mergeMsg, statusMsg, walletList, welcome,
} from '../src/format.ts';

test('esc thoát HTML', () => {
  assert.equal(esc('<b>&x</b>'), '&lt;b&gt;&amp;x&lt;/b&gt;');
});

test('fmtInt / addr helpers', () => {
  assert.equal(fmtInt(5973), '5,973');
  assert.equal(fmtInt(1207269n), '1,207,269');
  assert.equal(fmtInt(5973, 'vi'), '5.973');
  assert.match(addrShort('0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41'), /^<code>0x32cd…cc41<\/code>$/);
  assert.match(fullAddr('0xabc'), /^<code>0xabc<\/code>$/);
});

test('welcome + help: mặc định tiếng Anh, có lệnh chính, không quá dài', () => {
  const w = welcome('en');
  assert.match(w, /Squeek Holder Bot/);
  assert.match(w, /\/watch/);
  assert.doesNotMatch(w, /Theo dõi/);
  const h = help('en');
  assert.match(h, /COMMANDS/);
  for (const cmd of ['/watch', '/claim', '/ladder', '/quiet', '/digest', '/privacy']) assert.ok(h.includes(cmd), cmd);
  assert.ok(h.length < 4096);
  assert.ok(help('vi').includes('LỆNH'));
});

test('walletList: đánh số, nhãn được escape, có hint', () => {
  const s = walletList('en', [
    { address: '0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41', label: 'main' },
    { address: '0x4e6fc32b6a0adc1cd1e13949666fe66ec40e01f2', label: '<b>x</b>' },
  ], 5);
  assert.match(s, /Wallets<\/b> · 2\/5/);
  assert.match(s, /1\. <code>0x32cd/);
  assert.ok(s.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.match(s, /Add: \/watch/);
});

test('statusMsg: trạng thái + block + round', () => {
  const s = statusMsg('en', { coreStatus: 'IDLE', rpmMilli: 0, blockHeight: 5973, blockProgress: 689426642, settledThroughRound: 897 }, 3);
  assert.match(s, /resting/);
  assert.match(s, /5,973/);
  assert.match(s, /68\.9%/);
  assert.match(s, /897/);
});

test('claimMsg: số tiền, batch, dust, link; approx hiển thị rõ', () => {
  const s = claimMsg('en', {
    address: '0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41',
    total: 7235340000000000000000n, dust: 340000000000000000n,
    tokens: 32, skipped: 8, batches: 2, approx: 'rpc',
  });
  for (const part of ['7,235.34 SQK', 'Batch 32 tokens', '8 left out', '0.34 SQK', '2 transactions', 'could not read per-token', 'Open app']) {
    assert.ok(s.includes(part), part);
  }
});

test('ladderMsg: bước merge + power gain', () => {
  const s = ladderMsg('en', {
    address: '0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41',
    steps: [{ level: 1, merges: 2, produced: 2, cooldownBlocks: 3000 }],
    before: 2000n, after: 2200n,
  });
  assert.match(s, /L1 ×4 → L2 ×2/);
  assert.match(s, /3,000 block/);
  assert.match(s, /2,000 → 2,200 <b>\(\+200\)<\/b>/);
});

test('mergeMsg: danh sách + số đang cooldown', () => {
  const s = mergeMsg('en', {
    address: '0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41',
    ready: [{ tokenId: '8939', level: 2 }, { tokenId: '8941', level: 2 }], cooling: 7,
  });
  assert.match(s, /Mergeable \(2\)/);
  assert.match(s, /#8939 · L2/);
  assert.match(s, /7 still cooling/);
});

test('alert messages: gọn, đúng dữ liệu', () => {
  assert.match(alertClaim('en', { address: '0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41', amount: 50n * 10n ** 18n, threshold: 5n * 10n ** 17n }), /Claimable 50 SQK/);
  assert.match(alertCooldown('en', { address: '0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41', tokenId: '42' }), /Squeek #42 is off cooldown/);
  assert.match(alertHamster('en', { coreStatus: 'SPINNING', rpmMilli: 3420, blockHeight: 5973, blockProgress: 0 }), /running[\s\S]*3\.42 rpm/);
  assert.match(alertHamster('en', { coreStatus: 'IDLE', rpmMilli: 0, blockHeight: 5973, blockProgress: 5e8 }), /stopped/);
  assert.match(alertBlock('en', { height: 5974, minted: 6900n * 10n ** 18n }), /Block #5,974[\s\S]*\+6,900 SQK minted/);
  assert.match(alertBlock('en', { height: 5974, minted: null }), /no SQK minted/);
  const act = alertActivity('en', { address: '0x32cd5f4a2a93bdb558dd04b40520c3b6886acc41', kind: 'nft_transfer', amount: 12n * 10n ** 18n, tx: '0xabc' });
  assert.match(act, /Wallet activity/);
  assert.match(act, /etherscan\.io\/tx\/0xabc/);
});

test('digestMsg: 4 dòng số liệu', () => {
  const s = digestMsg('en', { day: '2026-11-01', wallets: 2, claimable: 7235340000000000000000n, ready: 3, height: 5973 });
  assert.match(s, /Digest 2026-11-01/);
  assert.match(s, /Wallets · 2/);
  assert.match(s, /Claimable · 7,235.34 SQK/);
  assert.match(s, /Mergeable · 3/);
  assert.match(s, /Block · 5,973/);
});

test('không có dòng trắng thừa ở cuối tin', () => {
  const msgs = [
    welcome('en'), help('en'), claimMsg('en', { address: '0x1', total: 0n, dust: 0n, tokens: 0, skipped: 0, batches: 0, approx: null }),
    digestMsg('en', { day: '2026-11-01', wallets: 0, claimable: 0n, ready: 0, height: 0 }),
  ];
  for (const m of msgs) {
    assert.equal(m, m.trimEnd(), 'trailing whitespace');
    assert.doesNotMatch(m, /\n\n\n/, 'double blank line');
  }
});
