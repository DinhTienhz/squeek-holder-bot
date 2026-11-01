/**
 * Client cho API công khai của Squeekchain. Read-only, có ETag + backoff.
 */
export type Status = {
  coreStatus: string;          // SPINNING | IDLE | ...
  rpmMilli: number;
  speedMmPerSecond: number;
  cumulativeWorkUnits: string;
  blockHeight: number;
  blockProgress: number;       // 0..1e9
  settledThroughRound: number;
  generatedAt: string;
  freshness: string;
};

export type Holding = {
  tokenId: string;
  level: number;
  basePower: string;
  nextMergeHeight: number;
  mergeState: string;          // ready | cooldown | ...
  custody: string;
};

export type ActivityItem = {
  id: string;
  kind: string;
  amount: bigint;
  blockNumber: number;
  txHash: string;
  at: string;
};

export type Account = {
  address: string;
  claimable: bigint;
  tokens: Holding[];
  tokenCount: number;
};

type FetchLike = (url: string, init?: any) => Promise<any>;

export class ApiClient {
  private etags = new Map<string, string>();
  private lastBody = new Map<string, unknown>();
  private base: string;
  private fetchImpl: FetchLike;
  private timeoutMs: number;

  constructor(base: string, fetchImpl: FetchLike = fetch, timeoutMs = 12_000) {
    this.base = base;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.base}${path}`;
    let attempt = 0;
    let waitMs = 0;
    while (attempt < 3) {
      attempt += 1;
      const headers: Record<string, string> = { accept: 'application/json', 'user-agent': 'squeek-holder-bot/0.1' };
      const etag = this.etags.get(url);
      if (etag) headers['if-none-match'] = etag;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, { headers, signal: ctrl.signal });
        if (res.status === 304) {
          const cached = this.lastBody.get(url);
          if (cached) return cached as T;
        }
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers?.get?.('retry-after'));
          waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt;
          if (attempt >= 3) throw new Error(`API ${res.status} ${url}`);
        } else if (!res.ok) {
          throw new Error(`API ${res.status} ${url}`);
        } else {
          const body = (await res.json()) as T;
          const newEtag = res.headers?.get?.('etag');
          if (newEtag) this.etags.set(url, newEtag);
          this.lastBody.set(url, body);
          return body;
        }
      } catch (err) {
        if (attempt >= 3) throw err;
        waitMs = waitMs || 500 * attempt;
      } finally {
        clearTimeout(timer);
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
    throw new Error(`API failed ${url}`);
  }

  async status(): Promise<Status> {
    const d: any = await this.getJson('/status');
    const m = d.measurement ?? {};
    const a = d.builder?.anchor ?? {};
    return {
      coreStatus: String(m.coreStatus ?? 'UNKNOWN'),
      rpmMilli: Number(m.rpmMilli ?? 0),
      speedMmPerSecond: Number(m.speedMmPerSecond ?? 0),
      cumulativeWorkUnits: String(m.cumulativeWorkUnits ?? '0'),
      blockHeight: Number(a.blockHeight ?? 0),
      blockProgress: Number(a.blockProgress ?? 0),
      settledThroughRound: Number(a.settledThroughRound ?? 0),
      generatedAt: String(d.generatedAt ?? ''),
      freshness: String(m.freshness ?? 'unknown'),
    };
  }

  async account(address: string): Promise<Account> {
    const d: any = await this.getJson(`/accounts/${address}`);
    const tokens: Holding[] = (d.tokens ?? []).map((t: any) => ({
      tokenId: String(t.tokenId),
      level: Number(t.level ?? 0),
      basePower: String(t.basePower ?? '0'),
      nextMergeHeight: Number(t.nextMergeHeight ?? 0),
      mergeState: String(t.mergeState ?? 'unknown'),
      custody: String(t.custody ?? 'wallet'),
    }));
    return {
      address: String(d.account ?? address),
      claimable: BigInt(d.rewards?.claimableBaseUnits ?? '0'),
      tokens,
      tokenCount: tokens.length,
    };
  }

  async economy(): Promise<any> {
    return this.getJson('/economy/state');
  }

  async activity(address: string): Promise<ActivityItem[]> {
    const d: any = await this.getJson(`/accounts/${address}/activity`);
    return (d.activity ?? []).map((a: any) => ({
      id: String(a.id),
      kind: String(a.kind ?? 'unknown'),
      amount: BigInt(a.amountBaseUnits ?? '0'),
      blockNumber: Number(a.source?.blockNumber ?? 0),
      txHash: String(a.source?.transactionHash ?? ''),
      at: String(a.source?.blockTimestamp ?? ''),
    }));
  }
}
