# Squeek Holder

[![test](https://github.com/DinhTienhz/squeek-holder-bot/actions/workflows/test.yml/badge.svg)](https://github.com/DinhTienhz/squeek-holder-bot/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A524-brightgreen.svg)](package.json)

One repo, two products for [Squeekchain](https://squeekchain.com) on Sepolia:

| Product | What it does | Live |
|---|---|---|
| **Telegram bot** | Alerts and tools for Squeekchain holders | [@SqueekHolder_Bot](https://t.me/SqueekHolder_Bot) |
| **OTC market** | Non-custodial NFT trading — list, buy, bid | <https://squeeksotc.bid/> |

Landing page for both: <https://squeek-holder-bot.chainn.workers.dev/>

## Contents

- [OTC market](#otc-market)
- [Telegram bot](#telegram-bot)
- [Running](#running)
- [Tests](#tests)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

## OTC market

Non-custodial NFT trading on Sepolia: **<https://squeeksotc.bid/>**

The market is multi-collection by design. Each collection trades through its own escrow,
so new collections can be onboarded without touching the markets already live.

| Collection | Escrow |
|---|---|
| [`0xc4c7982657f00509548f3a3a41db7fa439a6856b`](https://sepolia.etherscan.io/address/0xc4c7982657f00509548f3a3a41db7fa439a6856b) — Squeek | [`0xe0c16a29c0ad3b123600284ceb1bc1678a171799`](https://sepolia.etherscan.io/address/0xe0c16a29c0ad3b123600284ceb1bc1678a171799) |

Fee: **0.1% (10 bps)**, fixed in the escrow contract.

The escrow holds the NFT until the ETH arrives. Payment and transfer settle in the same
transaction, so there is no "send first" step and no operator in the middle. The contract has
no owner, no pause switch and no upgrade path.

### What you can do

- **List** — approve the escrow, then set a price. The NFT moves into escrow until it sells or the seller cancels.
- **Buy** — pay the listing price plus the 0.1% fee. The NFT leaves escrow and the seller is paid in the same transaction.
- **Cancel** — a seller can pull a listing back at any time; the NFT returns to them.
- **Bid** — place an ETH-backed bid at any price for the whole collection, not a specific token. Several bidders may sit at the same price.
- **Accept a bid** — any holder can sell a token into a price level. Within a level bids are served first-in, first-out, so the earliest bidder is matched first. The seller pays the 0.1% fee on this path.
- **Activity** — listings, sales and bid events are read from chain logs, so the feed works without a wallet.

### Notes

- Each escrow is bound to one collection because the NFT address is immutable. Supporting another collection means deploying one escrow for it and registering it on the site — existing markets keep running untouched.
- `cancelBid` refunds the bidder immediately; `acceptBid` pays the seller `amount - fee` in the same transaction.
- Bids are stored in a doubly linked list per price level, so cancelling a bid is O(1) and cannot be used to make acceptance progressively more expensive.
- The page reads the market, the bid book and the activity feed over public RPC — no wallet, no account needed to browse.

### Adding a collection

1. Deploy the escrow for the new ERC-721 address (the collection is a constructor argument).
2. Add an entry to the `MARKETS` registry in `public/otc.html`:

```js
{
  name: 'My collection',
  collection: '0x…',        // ERC-721 address
  escrow: '0x…',            // escrow deployed for it
  fromBlock: 12345678,      // escrow deployment block (activity feed start)
  image: 'my-sample.svg',   // card thumbnail
  tag: 'ERC-721 · Sepolia'
}
```

The collections row and the escrow switch on the page are driven by that list, so one entry is
all it takes for the market to list, price and settle a new collection.

The escrow itself is tested outside this repo with a Hardhat suite against a mock ERC-721
(list/buy/cancel, bids, FIFO ordering, fee maths, refunds, approvals) plus a gas test asserting
that cancelled bids do not inflate the cost of accepting the head bid.

## Telegram bot

Multi-user bot for Squeekchain holders (Sepolia testnet). Anyone who knows the username can
`/start` — no invite needed.

### Features

1. **Claimable above threshold** — DM when unclaimed SQK is at or above the threshold; repeats only when it doubles or after 6 hours (anti-spam)
2. **Claim optimizer** — `/claim`: batches of up to 32 tokens, total, dust, number of transactions
3. **Cooldown + /mergecheck** — pings when `cooldown → ready`, lists mergeable tokens
4. **Merge ladder** — `/ladder`: merge plan by level, cooldown block, power gain
5. **Hamster running/stopped** — alerts both ways (based on RPM + work counter rather than `coreStatus`, which can stay IDLE while the wheel spins); fires as soon as the wheel turns, confirms a stop after ~30 s of silence; includes run duration; toggle with `/hamster on|off`
6. **Block completed** — height + SQK issued (supply delta)
7. **Wallet activity** — new events (transfer/stake/merge…), excluding `rewards_claimed`
8. **Watchlist + quiet hours + digest** — 5 wallets per user, overnight silence, daily digest

Also: **English by default**, switch to Vietnamese with `/lang vi`; `/privacy`, `/delete`; admin `/stats`, `/ban`, `/unban`.

### Commands

| Command | What it does |
|---|---|
| `/start` | register + short guide |
| `/watch 0x… [name]` | add a wallet |
| `/unwatch 0x… \| name` | remove a wallet |
| `/list` | list wallets |
| `/status` | wheel status + block |
| `/claim [0x…]` | claimable SQK + number of batches (32 NFTs per batch) |
| `/mergecheck [0x…]` | Squeeks past their cooldown |
| `/threshold 0.5` | claim alert threshold |
| `/alerts on\|off` | wallet alerts |
| `/hamster on\|off` | hamster start/stop alerts |
| `/block on\|off` | block-completed alerts |
| `/digest on\|off` | daily digest |
| `/help` | command list |
| `/quiet 22:00-07:00` | quiet hours in server time |
| `/lang vi\|en` | switch language |
| `/privacy`, `/delete` | data handling |

## Running

```bash
npm ci
cp .env.example .env && chmod 600 .env   # fill in TELEGRAM_BOT_TOKEN
npm start
```

Without a token the bot runs in `DRY_RUN` (still polls data, sends nothing):

```bash
npm run dry
```

## Tests

```bash
npm test
```

73 tests: claim/cooldown/hamster rules, claim optimizer, merge ladder, message formatting
(HTML escaping, en/vi number locale), rate-limit queue, quiet hours, database (wallet limits,
dedupe, activity, meta, wipe) and worker host routing for the OTC domain.

The bot is also exercised end to end without a Telegram user: `node scripts/e2e-bot.ts`.

## Architecture

```
Bot
src/api.ts     Squeekchain API client (ETag, 429/5xx backoff, timeout)
src/format.ts  all user-facing copy (HTML, en/vi locale) — pure, tested
src/rules.ts   pure: evaluateAccount / evaluateHamster / optimizeClaim / planLadder
src/db.ts      node:sqlite (users, wallets, sent) — no native dependency
src/queue.ts   1 message/second per chat + quiet hours
src/bot.ts     grammY handlers + vi/en i18n
src/chain.ts   claimable() per token via multicall (fail-soft to the API)
src/index.ts   poll: status 15 s, wallets 45 s, digest 60 s, healthcheck 5 min

Web
src/worker.js  Cloudflare Worker: static site + OTC host routing
public/        landing page, /otc market, assets
```

The bot reads the public API at `api.squeekchain.com/v1` (`/status`, `/accounts/{address}`).
No private keys are read and no transactions are signed — every action is a link into the
official app. The market talks to the chain straight from the browser; it holds no keys either.

## Deployment

The Worker serves the landing page on `squeek-holder-bot.chainn.workers.dev` and the market on
`squeeksotc.bid`. Custom domains are managed in the Cloudflare dashboard, not in
`wrangler.toml` — a `routes` entry breaks the workers.dev host with error 1042.

Verify a deployment: `./scripts/smoke.sh` (12 checks: page, headers, assets, 404). See [DEPLOY.md](DEPLOY.md).

## Known limitations

- Claimable amounts come from the indexer API (a few blocks behind); `claimable()` reverts on this Sepolia deployment, so the optimizer labels figures as estimates when it cannot read per token
- No Discord support
- Regular alerts are dropped (not queued) during quiet hours; the digest still goes out
- Escrows are Sepolia-only; each one serves a single collection, so every new collection needs its own deployment

## License

MIT — see [LICENSE](LICENSE).
