#!/bin/sh
# Smoke test for the deployed landing page.
# Usage: ./scripts/smoke.sh [base-url]
set -eu

BASE="${1:-https://squeek-holder-bot.chainn.workers.dev}"
fail=0

check() { # label expected actual
  if [ "$2" = "$3" ]; then
    printf 'ok    %-28s %s\n' "$1" "$3"
  else
    printf 'FAIL  %-28s expected=%s got=%s\n' "$1" "$2" "$3"
    fail=1
  fi
}

code() { curl -sS -o /dev/null -m 20 -w '%{http_code}' "$1"; }

root=$(curl -sS -m 20 "$BASE/")
check "GET / status" "200" "$(code "$BASE/")"
check "title" "1" "$(printf '%s' "$root" | grep -c '<title>Squeek Holder Bot')"
tg_count=$(printf '%s' "$root" | grep -c 'https://t.me/SqueekHolder_Bot')
check "telegram link present" "yes" "$([ "$tg_count" -ge 1 ] && echo yes || echo no)"
check "canonical" "1" "$(printf '%s' "$root" | grep -c 'rel="canonical"')"
check "live panel" "1" "$(printf '%s' "$root" | grep -c 'id="live-state"')"

headers=$(curl -sSI -m 20 "$BASE/")
check "CSP header" "1" "$(printf '%s' "$headers" | grep -ci 'content-security-policy')"
check "X-Frame-Options" "1" "$(printf '%s' "$headers" | grep -ci 'x-frame-options: DENY')"

check "logo-mark.png" "200" "$(code "$BASE/logo-mark.png")"
check "favicon.ico" "200" "$(code "$BASE/favicon.ico")"
check "og.png" "200" "$(code "$BASE/og.png")"
check "unknown path -> 404" "404" "$(code "$BASE/definitely-not-a-page")"

img_headers=$(curl -sSI -m 20 "$BASE/logo-mark.png")
check "asset immutable cache" "1" "$(printf '%s' "$img_headers" | grep -ci 'immutable')"

if [ "$fail" -ne 0 ]; then
  echo "smoke: FAILED"
  exit 1
fi
echo "smoke: all checks passed"
