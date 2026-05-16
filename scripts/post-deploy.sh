#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @up-travel/worker db:migrate:remote
echo "Migrations applied. Now hit https://<your-worker-url>/api/setup with POST to register the Up webhook."
