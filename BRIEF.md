# IMD JOB BRIEF — Squeek Holder Bot

> Dán phần dưới vào tile **Website** trên `explorer.imd.fun/launch`, chọn **Start from GitHub instead** và trỏ tới repo này.

## Objective

Build and harden a **multi-user Telegram bot** for Squeekchain (Ethereum Sepolia) holders. Anyone who knows the bot username must be able to `/start` and use it. No invite, no allowlist.

Start from the repository skeleton provided: keep the architecture, command names, database schema and passing tests, then complete and improve it.

## Required features (8)

1. **Claim threshold alert** — DM when unclaimed SQK ≥ user threshold; re-alert at each multiple.
2. **`/claim` optimizer** — max 32 tokens per batch, show total, dust (fractions below 1e18), number of transactions, and a deep link to the official app.
3. **Cooldown alert + `/mergecheck`** — alert when a Squeek moves `cooldown → ready`; list mergeable tokens and how many are cooling.
4. **`/ladder`** — from the wallet's tokens, plan merges per level, cooldown blocks per level, and power gain (use `nft.basePower` and `nft.cooldownBlocks` from the API).
5. **Hamster alert** — notify on `SPINNING ↔ IDLE`, include RPM.
6. **Block alert** — on each new Squeek block: height and SQK minted (delta of `supply.miningMintedBaseUnits`).
7. **Wallet movement alert** — new account activity (transfers, stake, merge…), excluding `rewards_claimed`; include amount and Etherscan link.
8. **Watchlist + quiet hours + digest** — max 5 wallets/user, `/quiet 22:00-07:00`, daily digest at a configurable hour.

## Data sources (read-only)

- `GET https://api.squeekchain.com/v1/status` — `measurement.coreStatus`, `rpmMilli`, `builder.anchor.blockHeight/blockProgress`
- `GET https://api.squeekchain.com/v1/accounts/{address}` — `rewards.claimableBaseUnits`, `tokens[]` (`level`, `mergeState`, `nextMergeHeight`)
- `GET https://api.squeekchain.com/v1/accounts/{address}/activity` — activity ids/kinds/amounts
- `GET https://api.squeekchain.com/v1/economy/state` — `nft.basePower`, `nft.cooldownBlocks`, `supply.miningMintedBaseUnits`
- Optional: `SqueekMining.claimable(uint8,uint256[])` via multicall. **This call currently reverts on the Sepolia deployment** — must fail soft and label results as estimates.

## Hard constraints

- **Never store, request or log a private key.** No transaction signing. Every action is a deep link to the official app.
- Multi-user from the first commit: no hardcoded chat id anywhere.
- Telegram rate limit: ~1 message/second per chat; queue sends and honour `retry_after` on 429.
- Idempotency: the same alert must never be sent twice after a restart (`sent` table).
- Do not notify on historical activity when a wallet is first added.
- Plain-text messages (addresses contain underscores); amounts as base units, formatted with 2 decimals.
- Node ≥ 24 running `.ts` directly, `node:sqlite` (unflagged), grammY. No build step.

## Acceptance criteria

- `npm test` passes (26 existing tests must stay green; add tests for every feature you change).
- `DRY_RUN=1` starts, polls, and exits cleanly on SIGTERM without sending anything.
- Two users watching the same wallet cause **one** API call per cycle, with separate alerts.
- Kill -9 the process: systemd restarts it and no duplicate alerts are sent.
- README documents commands, environment variables and the 24/7 setup.
