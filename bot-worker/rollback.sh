#!/usr/bin/env bash
# Points Telegram back at long polling so the Node bot can take over again.
set -euo pipefail
read -rsp "Telegram bot token: " TOKEN; echo
[ -n "$TOKEN" ] || { echo "empty token"; exit 1; }
curl -fsS -K - <<EOF | python3 -m json.tool
url = "https://api.telegram.org/bot$TOKEN/deleteWebhook"
EOF
echo "Now start the Node bot again:  cd ~/squeek-holder-bot && node src/index.ts"
