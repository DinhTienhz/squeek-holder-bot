# squeek-monitor

Independent uptime check for the bot. A separate Worker so it survives a broken bot Worker.

- Cron `*/5 * * * *`: calls `BOT_HEALTH_URL` (default `https://squeek-bot.chainn.workers.dev/health`).
- Sends **one** Telegram message when the state flips up → down, a reminder every 6 hours while down,
  and one message on recovery. State lives in D1 (`monitor` table, same database as the bot).
- No message while healthy.

## Deploy
```
npx wrangler d1 execute squeek-bot --remote --file=schema.sql
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler deploy
```

`ALERT_CHAT_ID` and `BOT_HEALTH_URL` are plain vars in `wrangler.toml`.

## Verify
- Local: `npx wrangler dev --local` then `curl http://localhost:8787/cdn-cgi/local/scheduled`;
  with a bad `BOT_HEALTH_URL` the `monitor` row becomes `down|<ts>`.
- Remote: `npx wrangler d1 execute squeek-bot --remote --command "SELECT * FROM monitor"` →
  `up|<ts>` when the bot is healthy.
