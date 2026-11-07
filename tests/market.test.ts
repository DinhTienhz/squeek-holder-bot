import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keccak256, toBytes } from 'viem';
import {
  MARKET_TOPICS, decodeMarketLog, nextWindow, type MarketEvent,
} from '../src/market.ts';
import { marketAlert } from '../src/format.ts';

const word = (n: bigint): string => n.toString(16).padStart(64, '0');
const addr = (a: string): string => a.slice(2).toLowerCase().padStart(64, '0');
const TX = `0x${'ab'.repeat(32)}`;
const SELLER = '0x1111111111111111111111111111111111111111';
const BUYER = '0x2222222222222222222222222222222222222222';

test('topic constants match the Solidity signatures', () => {
  const sig = (s: string) => keccak256(toBytes(s));
  assert.equal(MARKET_TOPICS.Listed, sig('Listed(uint256,address,uint256)'));
  assert.equal(MARKET_TOPICS.Sold, sig('Sold(uint256,address,address,uint256,uint256)'));
  assert.equal(MARKET_TOPICS.BidPlaced, sig('BidPlaced(uint256,address,uint256)'));
  assert.equal(MARKET_TOPICS.BidAccepted, sig('BidAccepted(uint256,uint256,address,address,uint256,uint256)'));
});

test('decodes a listing', () => {
  const ev = decodeMarketLog({
    topics: [MARKET_TOPICS.Listed, `0x${word(5888n)}`, `0x${addr(SELLER)}`],
    data: `0x${word(11_000_000_000_000_000n)}`,
    transactionHash: TX,
    blockNumber: '0x10',
  });
  assert.deepEqual(ev, {
    kind: 'list', tokenId: '5888', seller: SELLER, price: 11_000_000_000_000_000n, tx: TX, block: 16,
  });
});

test('decodes a bid', () => {
  const ev = decodeMarketLog({
    topics: [MARKET_TOPICS.BidPlaced, `0x${word(4n)}`, `0x${addr(BUYER)}`],
    data: `0x${word(7_000_000_000_000_000n)}`,
    transactionHash: TX,
    blockNumber: '0x20',
  });
  assert.deepEqual(ev, {
    kind: 'bid', bidId: '4', buyer: BUYER, price: 7_000_000_000_000_000n, tx: TX, block: 32,
  });
});

test('decodes a direct sale', () => {
  const ev = decodeMarketLog({
    topics: [MARKET_TOPICS.Sold, `0x${word(1n)}`, `0x${addr(BUYER)}`, `0x${addr(SELLER)}`],
    data: `0x${word(20_000_000_000_000_000n)}${word(20_000_000_000_000n)}`,
    transactionHash: TX,
    blockNumber: '0x30',
  });
  assert.deepEqual(ev, {
    kind: 'sold', tokenId: '1', seller: SELLER, buyer: BUYER,
    price: 20_000_000_000_000_000n, fee: 20_000_000_000_000n, tx: TX, block: 48,
  });
});

test('decodes a sale through acceptBid (seller comes from data)', () => {
  const ev = decodeMarketLog({
    topics: [MARKET_TOPICS.BidAccepted, `0x${word(9n)}`, `0x${word(4821n)}`, `0x${addr(BUYER)}`],
    data: `0x${addr(SELLER)}${word(5_000_000_000_000_000n)}${word(5_000_000_000_000n)}`,
    transactionHash: TX,
    blockNumber: '0x40',
  });
  assert.deepEqual(ev, {
    kind: 'sold', tokenId: '4821', seller: SELLER, buyer: BUYER,
    price: 5_000_000_000_000_000n, fee: 5_000_000_000_000n, tx: TX, block: 64,
  });
});

test('ignores unrelated logs', () => {
  assert.equal(decodeMarketLog({
    topics: [`0x${'00'.repeat(32)}`], data: '0x', transactionHash: TX, blockNumber: '0x1',
  }), null);
});

test('block window never replays history and stays bounded', () => {
  assert.equal(nextWindow(0, 100), null);
  assert.equal(nextWindow(100, 100), null);
  assert.deepEqual(nextWindow(100, 130), { from: 101, to: 130 });
  assert.deepEqual(nextWindow(100, 10_000, 300), { from: 101, to: 400 });
});

const list: MarketEvent = {
  kind: 'list', tokenId: '5888', seller: SELLER, price: 11_000_000_000_000_000n, tx: TX, block: 1,
};

test('list alert shows who moved what, where it went and the tx', () => {
  const msg = marketAlert('en', list);
  assert.match(msg, /New listing/);
  assert.match(msg, /#5888/);
  assert.match(msg, /0\.011 ETH/);
  assert.match(msg, /0x1111…1111/);
  assert.match(msg, /0xe0c1…1799/);
  assert.match(msg, new RegExp(`/tx/${TX}`));
});

test('sale alert shows both directions', () => {
  const msg = marketAlert('vi', {
    kind: 'sold', tokenId: '1', seller: SELLER, buyer: BUYER,
    price: 20_000_000_000_000_000n, fee: 20_000_000_000_000n, tx: TX,
  });
  assert.match(msg, /Đã bán/);
  assert.match(msg, /NFT: .*1111.* → .*2222/);
  assert.match(msg, /ETH: .*2222.* → .*1111/);
  assert.match(msg, /0[.,]00002 ETH/);
});

test('bid alert names the bidder and the escrow', () => {
  const msg = marketAlert('en', {
    kind: 'bid', bidId: '4', buyer: BUYER, price: 7_000_000_000_000_000n, tx: TX,
  });
  assert.match(msg, /Bid #4/);
  assert.match(msg, /0\.007 ETH/);
  assert.match(msg, /0x2222…2222/);
});
