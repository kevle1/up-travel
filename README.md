# up-travel

Personal trip budget tracker on Cloudflare. Connects to Up Bank, renders a mobile-first dashboard for trip pacing.

See `docs/superpowers/specs/2026-05-16-up-travel-design.md` for the full design.

## Local development

```
pnpm install
pnpm --filter @up-travel/worker db:migrate:local
pnpm dev
```

- Worker: http://localhost:8787
- Web: http://localhost:5173 (proxies `/api/*` to worker)

Set `apps/worker/.dev.vars`:

```
UP_API_TOKEN=up:yeah:YOUR_PAT
```

## Deploy

(See Task 32 for filled-in deploy instructions.)
