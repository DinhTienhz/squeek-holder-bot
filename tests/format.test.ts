import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../src/commands.ts';
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
  const s = statusMsg('en', {
    coreStatus: 'IDLE', rpmMilli: 0, blockHeight: 5973, blockProgress: 689426642,
    settledThroughRound: 897, settledHeight: 5900,
    minted: 33157606255454000000000000n, cap: 2100000000000000000000000000n,
  }, 3);
  assert.match(s, /resting/);
  assert.match(s, /5,973/);
  assert.match(s, /68\.9%/);
  assert.match(s, /897/);
  assert.match(s, /settled 5,900/);
  assert.match(s, /SQK minted/);
  assert.match(s, /1\.58%/);
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
  assert.match(alertBlock('en', { first: 5974, last: 5974, blocks: 1, minted: 6900n * 10n ** 18n }), /Block #5,974[\s\S]*6,900\.0000 SQK minted/);
  assert.match(alertBlock('en', { first: 5974, last: 5974, blocks: 1, minted: null }), /not indexed yet/);
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

test('activityLabel: known kinds are translated, unknown pass through', async () => {
  const { activityLabel } = await import('../src/format.ts');
  assert.equal(activityLabel('en', 'nft_deposited'), 'Squeek received');
  assert.equal(activityLabel('vi', 'nft_deposited'), 'Nhận Squeek');
  assert.equal(activityLabel('en', 'nft_merged'), 'Squeek merged');
  assert.equal(activityLabel('en', 'something_new'), 'something_new');
});

test('claim và alert claim có link mở app bấm được', async () => {
  const { claimMsg, alertClaim } = await import('../src/format.ts');
  const c = claimMsg('vi', { address: '0x4e6fc32b6a0adc1cd1e13949666fe66ec40e01f2', total: 15075n * 10n ** 18n, dust: 4n * 10n ** 17n, tokens: 10, skipped: 0, batches: 1, approx: 'rpc' });
  const a = alertClaim('en', { address: '0x4e6fc32b6a0adc1cd1e13949666fe66ec40e01f2', amount: 15075n * 10n ** 18n, threshold: 5n * 10n ** 18n });
  assert.match(c, /href="https:\/\/sepolia\.squeekchain\.com\/"/);
  assert.match(a, /href="https:\/\/sepolia\.squeekchain\.com\/"/);
});


test('alertHamster: ACTIVE renders as running, IDLE as stopped', async () => {
  const { alertHamster } = await import('../src/format.ts');
  const base = { blockHeight: 7520, blockProgress: 2.5e8 };
  assert.match(alertHamster('en', { ...base, coreStatus: 'ACTIVE', rpmMilli: 4200 }), /running/i);
  assert.doesNotMatch(alertHamster('en', { ...base, coreStatus: 'ACTIVE', rpmMilli: 4200 }), /stopped/i);
  assert.match(alertHamster('vi', { ...base, coreStatus: 'IDLE', rpmMilli: 0 }), /đã dừng/i);
  assert.match(alertHamster('vi', { ...base, coreStatus: 'ACTIVE', rpmMilli: 3000 }), /đang chạy/i);
  assert.match(alertHamster('vi', { ...base, coreStatus: 'ACTIVE', rpmMilli: 3000 }), /x\.com\/squeekchain/);
  assert.match(alertHamster('en', { ...base, coreStatus: 'IDLE', rpmMilli: 0 }), /x\.com\/squeekchain/);
});


test('formatDuration: giây, phút, giờ', async () => {
  const { formatDuration } = await import('../src/format.ts');
  assert.equal(formatDuration('vi', 15_000), '15 giây');
  assert.equal(formatDuration('en', 15_000), '15s');
  assert.equal(formatDuration('vi', 90_000), '1 phút');
  assert.equal(formatDuration('en', 3_900_000), '1h 05m');
});

test('alertHamster: tin dừng có thời lượng chạy', async () => {
  const { alertHamster } = await import('../src/format.ts');
  const s = { coreStatus: 'IDLE', rpmMilli: 0, blockHeight: 7520, blockProgress: 2.5e8 };
  assert.match(alertHamster('vi', s, 15_000), /chạy 15 giây/);
  assert.match(alertHamster('en', s, 15_000), /ran 15s/);
  assert.doesNotMatch(alertHamster('vi', s, null), /chạy/);
});


test('help: liệt kê đủ mọi lệnh trong COMMANDS', async () => {
  const { help } = await import('../src/format.ts');
  const h = help('en', true);
  for (const c of COMMANDS) assert.ok(h.includes('/' + c.name), 'missing /' + c.name);
});

test('help: user thường không thấy lệnh admin, nhưng thấy /hamster', async () => {
  const { help } = await import('../src/format.ts');
  const h = help('vi');
  assert.ok(!h.includes('/ban'));
  assert.ok(h.includes('/hamster'));
  assert.ok(h.includes('/unwatch'));
});

test('alertBlock: batch settle hiển thị đúng range + số SQK 4 chữ số như app', async () => {
  const { alertBlock } = await import('../src/format.ts');
  const s = alertBlock('en', { first: 8288, last: 8332, blocks: 45, minted: 179079726535695224540562n });
  assert.match(s, /Blocks 8,288–8,332/);
  assert.match(s, /45 blocks/);
  assert.match(s, /179,079\.7265 SQK minted/);

  const vi = alertBlock('vi', { first: 8288, last: 8332, blocks: 45, minted: 179079726535695224540562n });
  assert.match(vi, /Blocks 8\.288–8\.332/);
  assert.match(vi, /179\.079,7265 SQK đã phát/);
});


test('activity: rewards_claimed có nhãn riêng, khác claim thường', async () => {
  const { activityLabel, activityList } = await import('../src/format.ts');
  assert.equal(activityLabel('vi', 'rewards_claimed'), 'Đã claim phần thưởng');
  assert.equal(activityLabel('vi', 'claimed'), 'Đã claim SQK');
  assert.equal(activityLabel('en', 'rewards_claimed'), 'Rewards claimed');

  const s = activityList('vi', {
    address: '0x4e6fc32b6a0adc1cd1e13949666fe66ec40e01f2',
    items: [
      { kind: 'rewards_claimed', amount: 1234n * 10n ** 18n, tx: '0xabc', at: '2026-11-04T04:12:00.000Z' },
      { kind: 'nft_merged', amount: null, tx: '0xdef', at: '2026-11-04T03:00:00.000Z' },
    ],
  });
  assert.match(s, /Đã claim phần thưởng · 1\.234 SQK/);
  assert.match(s, /etherscan\.io\/tx\/0xabc/);
  assert.match(s, /Merge Squeek/);
});

test('activityBatch: gộp nhiều sự kiện thành một tin', async () => {
  const { activityBatch } = await import('../src/format.ts');
  const s = activityBatch('vi', {
    address: '0x4e6fc32b6a0adc1cd1e13949666fe66ec40e01f2',
    items: [
      { kind: 'nft_deposited', amount: 0n, tx: '0xaaa' },
      { kind: 'rewards_claimed', amount: 12n * 10n ** 18n, tx: '0xbbb' },
      { kind: 'nft_merged', amount: 0n, tx: '0xccc' },
    ],
  });
  assert.match(s, /3 biến động ví/);
  assert.match(s, /Đã claim phần thưởng · 12 SQK/);
  assert.match(s, /etherscan\.io\/tx\/0xaaa/);
});
