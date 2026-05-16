#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Creating D1 database 'up-travel' if missing..."
if ! pnpm --filter @up-travel/worker exec wrangler d1 list | grep -q "up-travel"; then
  pnpm --filter @up-travel/worker exec wrangler d1 create up-travel
fi

echo
echo "Creating KV namespace 'UP_TRAVEL_KV' if missing..."
if ! pnpm --filter @up-travel/worker exec wrangler kv namespace list | grep -q "UP_TRAVEL_KV"; then
  pnpm --filter @up-travel/worker exec wrangler kv namespace create UP_TRAVEL_KV
fi

echo
echo "Paste the printed database_id and id values into apps/worker/wrangler.jsonc"
echo "Then run: pnpm --filter @up-travel/worker db:migrate:remote"
echo "Then run: pnpm --filter @up-travel/worker exec wrangler secret put UP_API_TOKEN"
