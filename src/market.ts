/**
 * Sepolia Squeek Market escrow event reader.
 *
 * The market's escrow is a plain contract on Sepolia, so the bot reads its
 * logs straight from an RPC endpoint — no indexer, no API key.
 */
export const OTC_ESCROW = '0xe0c16a29c0ad3b123600284ceb1bc1678a171799';
export const OTC_EXPLORER = 'https://sepolia.etherscan.io';

export const MARKET_TOPICS = {
  Listed: '0x50955776c5778c3b7d968d86d8c51fb6b29a7a74c20866b533268e209fc08343',
  Sold: '0xa70b1a854695e7921b122988e216d3a6cd10ed799017c67b1ff231967e6bf56d',
  BidPlaced: '0x0e54eff26401bf69b81b26f60bd85ef47f5d85275c1d268d84f68d6897431c47',
  BidAccepted: '0xd03315470d28070614b9df363c9487f50982f0b44efc4ed078f73b48e37fca6a',
} as const;

export type MarketEvent =
  | { kind: 'list'; tokenId: string; seller: string; price: bigint; tx: string; block: number }
  | { kind: 'bid'; bidId: string; buyer: string; price: bigint; tx: string; block: number }
  | { kind: 'sold'; tokenId: string; seller: string; buyer: string; price: bigint; fee: bigint; tx: string; block: number };

type RawLog = { topics: string[]; data: string; transactionHash: string; blockNumber: string };

const word = (data: string, i: number): bigint => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);
const addrOf = (topic: string): string => `0x${topic.slice(-40)}`;

/** Decode one escrow log; returns null for anything that is not a market event. */
export function decodeMarketLog(log: RawLog): MarketEvent | null {
  const topic0 = (log.topics[0] ?? '').toLowerCase();
  const tx = log.transactionHash;
  const block = Number(log.blockNumber);
  if (!tx || !Number.isFinite(block)) return null;

  if (topic0 === MARKET_TOPICS.Listed) {
    // Listed(uint256 indexed tokenId, address indexed seller, uint256 price)
    return {
      kind: 'list',
      tokenId: BigInt(log.topics[1]).toString(),
      seller: addrOf(log.topics[2]),
      price: word(log.data, 0),
      tx,
      block,
    };
  }

  if (topic0 === MARKET_TOPICS.BidPlaced) {
    // BidPlaced(uint256 indexed bidId, address indexed buyer, uint256 price)
    return {
      kind: 'bid',
      bidId: BigInt(log.topics[1]).toString(),
      buyer: addrOf(log.topics[2]),
      price: word(log.data, 0),
      tx,
      block,
    };
  }

  if (topic0 === MARKET_TOPICS.Sold) {
    // Sold(uint256 indexed tokenId, address indexed buyer, address indexed seller, uint256 price, uint256 fee)
    return {
      kind: 'sold',
      tokenId: BigInt(log.topics[1]).toString(),
      buyer: addrOf(log.topics[2]),
      seller: addrOf(log.topics[3]),
      price: word(log.data, 0),
      fee: word(log.data, 1),
      tx,
      block,
    };
  }

  if (topic0 === MARKET_TOPICS.BidAccepted) {
    // BidAccepted(uint256 indexed bidId, uint256 indexed tokenId, address indexed buyer, address seller, uint256 price, uint256 fee)
    return {
      kind: 'sold',
      tokenId: BigInt(log.topics[2]).toString(),
      buyer: addrOf(log.topics[3]),
      seller: addrOf(`0x${log.data.slice(2 + 24, 2 + 64)}`),
      price: word(log.data, 1),
      fee: word(log.data, 2),
      tx,
      block,
    };
  }

  return null;
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`rpc ${method}: HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`rpc ${method}: ${body.error.message ?? 'error'}`);
  if (body.result === undefined) throw new Error(`rpc ${method}: empty result`);
  return body.result;
}

export async function blockNumber(url: string): Promise<number> {
  return Number(await rpc<string>(url, 'eth_blockNumber', []));
}

export type MarketCursor = { from: number; to: number };

/**
 * Pick the block window to scan. Returns null when there is nothing new.
 * The first run only records the head so the bot does not replay old events.
 */
export function nextWindow(saved: number, latest: number, maxBlocks = 300): MarketCursor | null {
  if (!saved || saved <= 0) return null;
  if (latest <= saved) return null;
  return { from: saved + 1, to: Math.min(latest, saved + maxBlocks) };
}

export async function fetchMarketLogs(url: string, from: number, to: number): Promise<RawLog[]> {
  return rpc<RawLog[]>(url, 'eth_getLogs', [{
    address: OTC_ESCROW,
    fromBlock: `0x${from.toString(16)}`,
    toBlock: `0x${to.toString(16)}`,
    topics: [[MARKET_TOPICS.Listed, MARKET_TOPICS.Sold, MARKET_TOPICS.BidPlaced, MARKET_TOPICS.BidAccepted]],
  }]);
}
