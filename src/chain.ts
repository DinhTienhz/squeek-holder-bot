import { createPublicClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

const ABI = parseAbi([
  'function claimable(uint8 collection, uint256[] tokenIds) view returns (uint256)',
]);

const STAKING_ABI = parseAbi([
  'function claimable(address account) view returns (uint256)',
]);

/** Exact account-level claimable from Staking. Rewards are per account, not per token. */
export async function stakingClaimable(rpcUrl: string, staking: string, account: string): Promise<bigint> {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 12_000 }) });
  return (await client.readContract({
    address: staking as `0x${string}`,
    abi: STAKING_ABI,
    functionName: 'claimable',
    args: [account as `0x${string}`],
  } as any)) as bigint;
}

/** Global staking totals straight from the contracts: SQK staked and NFTs held by Staking. */
export async function stakingTotals(
  rpcUrl: string, staking: string, nft: string,
): Promise<{ sqkStaked: bigint; nftsStaked: bigint }> {
  const call = async (to: string, data: string): Promise<bigint> => {
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
    });
    const j: any = await r.json();
    if (j.error || typeof j.result !== 'string') throw new Error(j.error?.message ?? 'eth_call failed');
    return BigInt(j.result);
  };
  const pad = (a: string) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const [sqkStaked, nftsStaked] = await Promise.all([
    call(staking, '0x817b1cd2'),                 // totalStaked()
    call(nft, '0x70a08231' + pad(staking)),      // balanceOf(staking)
  ]);
  return { sqkStaked, nftsStaked };
}

/**
 * Đọc claimable chính xác cho từng token bằng multicall.
 * Trả mảng cùng thứ tự với `tokenIds`; lỗi từng token → 0n.
 */
export async function claimablePerToken(
  rpcUrl: string,
  mining: string,
  tokenIds: string[],
  collection = 0,
  chunk = 40,
): Promise<bigint[]> {
  const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl, { timeout: 12_000 }) });
  const out: bigint[] = [];
  for (let i = 0; i < tokenIds.length; i += chunk) {
    const slice = tokenIds.slice(i, i + chunk);
    const calls = slice.map((id) => ({
      address: mining as `0x${string}`,
      abi: ABI,
      functionName: 'claimable' as const,
      args: [collection, [BigInt(id)]] as const,
    }));
    const res = await client.multicall({ contracts: calls, allowFailure: true } as any);
    const ok = res.filter((r) => r.status === 'success').length;
    // Toàn bộ revert (ABI/deployment khác) → báo lỗi để caller fallback và ghi rõ "ước lượng".
    if (ok === 0 && calls.length > 0) throw new Error('claimable() reverts on this deployment');
    for (const r of res) out.push(r.status === 'success' ? (r.result as bigint) : 0n);
  }
  return out;
}
