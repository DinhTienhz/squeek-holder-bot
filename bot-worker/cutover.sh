#!/usr/bin/env bash
# Switches Telegram from the Node bot to the Cloudflare Worker, in one step.
# Reads the token without echoing it and never puts it in argv.
set -euo pipefail
cd "$(dirname "$0")"

read -rsp "Telegram bot token: " TOKEN; echo
[ -n "$TOKEN" ] || { echo "empty token"; exit 1; }

printf '%s' "$TOKEN" | npx wrangler secret put TELEGRAM_BOT_TOKEN

curl -fsS -K - <<EOF | python3 -m json.tool
url = "https://api.telegram.org/bot$TOKEN/setWebhook"
data-urlencode = "url=https://squeek-bot.chainn.workers.dev/telegram"
EOF

echo
echo "Worker is now receiving updates."
echo "Stop the old process:  kill 301693   (or: pkill -f 'node src/index.ts')"
