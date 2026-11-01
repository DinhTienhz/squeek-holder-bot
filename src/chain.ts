import { createPublicClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

const ABI = parseAbi([
  'function claimable(uint8 collection, uint256[] tokenIds) view returns (uint256)',
]);

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
    const res = await client.multicall({ contracts: calls, allowFailure: true });
    const ok = res.filter((r) => r.status === 'success').length;
    // Toàn bộ revert (ABI/deployment khác) → báo lỗi để caller fallback và ghi rõ "ước lượng".
    if (ok === 0 && calls.length > 0) throw new Error('claimable() reverts on this deployment');
    for (const r of res) out.push(r.status === 'success' ? (r.result as bigint) : 0n);
  }
  return out;
}
