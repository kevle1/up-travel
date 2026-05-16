# up-travel — Design

**Status:** Draft for review
**Date:** 2026-05-16
**Owner:** Kevin

## 1. Summary

A personal trip budget tracker for a year-long trip with an $80,000 AUD target, optimised for *underspending*. Connects to Up Bank via the user's personal access token, syncs Spending-account transactions, and renders a mobile-first single-page dashboard showing whether the user is pacing ahead of or behind their target.

Designed for one-click deploy to the user's own Cloudflare account so other Up Bank customers can use it. Single-user per deployment; Cloudflare Access provides authentication (Up's terms forbid sharing a PAT).

## 2. Goals and non-goals

**Goals**

- Single mobile-first dashboard answering "am I on track?" at a glance.
- Trustworthy categorisation: by Up parent category, by city (via itinerary + currency fallback), and by date.
- Multi-trip with archive; the active trip is the dashboard, past trips view-only.
- Handle a year-long budget framing — emphasise underspend pace, monthly trends, not countdown urgency.
- One-click deploy via the Cloudflare "Deploy to Cloudflare" button, prompting only for the Up PAT.
- Locally developable with `wrangler dev` + Vite.
- Real-data tested: backfill the user's 2025-09-01 → 2025-11-06 Europe trip and validate analytics.

**Non-goals**

- CSV / data export. Out of scope.
- PWA / offline mode.
- Push notifications.
- Recurring exclusion rules.
- Photo or receipt attachments.
- Multi-user / trip-splitting.
- Multi-currency budget display (budget is always AUD).

## 3. Stack

- **Language:** TypeScript end-to-end.
- **Worker:** Hono router, Drizzle ORM on D1, zod for validation.
- **Frontend:** React + Vite, TanStack Query, Tailwind, Recharts.
- **Shared:** zod schemas + pure analytics functions in `packages/shared`.
- **Tests:** Vitest, `@cloudflare/vitest-pool-workers` for Worker integration tests against Miniflare D1 + KV.
- **Tooling:** pnpm workspaces, wrangler, eslint, prettier, drizzle-kit.

Rationale: TypeScript is the path of least resistance on Workers in 2026. React on Pages buys good chart libraries cheaply. Hono is the de facto Workers router; Drizzle the de facto D1 ORM.

## 4. Architecture

```
  Up Bank API ──┐
                │  cron + webhook
                ▼
        ┌────────────────────┐         ┌─────────────────┐
        │  Worker (Hono)     │◄────────┤ Cloudflare cron │
        │  ─────────────     │         └─────────────────┘
        │   /api/*  (Access) │
        │   /webhook/up      │◄──── Up webhook (HMAC-verified)
        │                    │
        │   binds: D1, KV    │
        │                    │
        │   FX provider ─────┼──► fawazahmed0/exchange-api (CDN)
        └────────┬───────────┘
                 │  read/write
        ┌────────┴────────┐
        │   D1            │  trips, transactions, itinerary,
        │                 │  category_budgets, txn_overrides
        └─────────────────┘
        ┌─────────────────┐
        │   KV            │  fx_rates:YYYY-MM-DD:CCY, sync_watermark,
        │                 │  sync_status, up:webhook:{id,secret}
        └─────────────────┘

        Pages (React SPA, Vite build)         ◄── browser ── user
        ─ Cloudflare Access in front                          │
                  ▲ fetch /api/* on same hostname             │
                  └──────────────────────────────────────────┘
```

Key shape decisions:

- One Worker, not two. Hono routes `/api/*` (Access-protected) and `/webhook/up` (Access-excluded, HMAC-verified). Cron is an event handler in the same Worker.
- Pages and Worker share a hostname (custom domain or Cloudflare team domain). Same-origin avoids CORS; Access applies uniformly.
- `UP_API_TOKEN` is a Worker secret set at deploy. Up-issued webhook secret is stored in KV (Worker secrets are immutable at runtime; KV is encrypted at rest, only readable by the Worker).
- All non-Up API requests from the SPA hit `/api/*` on the same origin. The PAT never reaches the client.
- Daily FX rates cached in KV with date-keyed entries; past-date rates are immutable, so cache forever.

## 5. Repo layout

```
up-travel/
├── apps/
│   ├── worker/                  # Hono Worker
│   │   ├── src/
│   │   │   ├── index.ts         # fetch + scheduled handlers
│   │   │   ├── routes/          # /api/* and /webhook/up
│   │   │   ├── up/              # typed Up Bank client
│   │   │   ├── sync/            # sync orchestration
│   │   │   ├── fx/              # rate fetch + KV cache
│   │   │   ├── db/              # Drizzle schema + helpers
│   │   │   └── setup.ts         # first-run webhook registration
│   │   ├── migrations/
│   │   └── wrangler.jsonc
│   └── web/                     # React + Vite SPA
│       └── src/
│           ├── pages/           # Dashboard, Trips, Settings, History, Itinerary
│           ├── components/      # widgets
│           └── lib/api.ts       # typed fetch client
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── schemas.ts       # zod
│       │   └── analytics-core.ts
│       └── fixtures/
│           ├── up-transactions/ # curated edge cases
│           └── europe-2025/     # real backfill fixture
├── scripts/deploy-init.ts       # post-deploy migration runner
├── docs/superpowers/specs/
├── pnpm-workspace.yaml
└── README.md
```

## 6. Components

### 6.1 Worker modules

| Module | Purpose | Depends on |
|---|---|---|
| `up/client.ts` | Typed Up API wrapper: list txns with cursor pagination, list accounts, create/list/delete webhooks. 429 backoff. | `UP_API_TOKEN` |
| `sync/` | Pull Up txns since watermark, filter to Spending account, classify transfers and ATM withdrawals, upsert into D1, advance watermark. Called from cron and webhook. | `up/client`, `db`, KV |
| `fx/` | Get rate for `(date, currency → AUD)`. KV cache `fx:YYYY-MM-DD:<CCY>`. Walks back up to 7 days if today's rate not published. | KV, fawazahmed0 CDN |
| `db/schema.ts` | Drizzle schema and migrations. | D1 |
| `analytics/` | Re-exports pure functions from `@shared/analytics-core`. | shared |
| `routes/api/trips` | CRUD trips, set active. | `db` |
| `routes/api/transactions` | List/filter for active trip, toggle exclude. | `db`, `analytics` |
| `routes/api/dashboard` | Aggregate query + analytics → dashboard payload. | `db`, `analytics` |
| `routes/api/itinerary` | Parse, validate, replace itinerary entries. | `db` |
| `routes/api/manual-entry` | Create/edit/delete cash entries with FX lookup. | `db`, `fx` |
| `routes/api/settings` | Trip budget, dates, category targets. | `db` |
| `routes/api/setup` | Idempotent webhook registration, KV secret storage. | `up/client`, KV |
| `routes/webhook/up` | HMAC verify, trigger sync for affected txn. | KV, `sync` |

### 6.2 Pages modules

| Module | Purpose |
|---|---|
| `pages/Dashboard.tsx` | Single screen. Headline pace status, totals, daily allowance, today vs allowance, category progress, city breakdown, recent transactions with exclude toggle, manual-entry FAB. |
| `pages/Trips.tsx` | List, create, switch active. |
| `pages/Settings.tsx` | Budget, dates, category targets. |
| `pages/Itinerary.tsx` | Paste/edit with live-parsed preview. |
| `pages/History.tsx` | Archived trips, summary stats only. |
| `lib/api.ts` | Typed fetch wrapper, shares types with Worker via `@shared/schemas`. |
| `components/widgets/*` | `PaceCard`, `AllowanceCard`, `TodayCard`, `CategoryBars`, `CityStack`, `TrendChart`, `TxnRow`. |

### 6.3 Shared package

- `schemas.ts` — zod schemas for Up transactions (slice we care about), API request/response, `Trip`, `ItineraryEntry`, `ManualEntry`, `CategoryBudget`, `TransactionOverride`.
- `analytics-core.ts` — pure functions: `dailyAllowance`, `pace`, `categoryProgress`, `groupByCity`, `cashOnHand`.

## 7. Data model

### 7.1 D1 schema

```sql
trips(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,         -- ISO date
  end_date TEXT,                    -- nullable; open-ended year trip allowed
  budget_aud_cents INTEGER NOT NULL,
  is_active INTEGER NOT NULL,       -- 0 or 1
  created_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE UNIQUE INDEX trips_one_active
  ON trips(is_active) WHERE is_active = 1;

transactions(
  id TEXT PRIMARY KEY,              -- Up txn id, or ulid for manual
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  source TEXT NOT NULL,             -- 'up' | 'manual'
  occurred_at INTEGER NOT NULL,     -- epoch ms
  amount_aud_cents INTEGER NOT NULL,  -- signed; spend is negative
  foreign_amount NUMERIC,
  foreign_currency TEXT,
  description TEXT NOT NULL,
  up_category_parent TEXT,
  up_category_child TEXT,
  is_transfer INTEGER NOT NULL DEFAULT 0,
  is_atm INTEGER NOT NULL DEFAULT 0,
  counts_as_spend INTEGER NOT NULL DEFAULT 1,  -- manual entries default 0
  raw TEXT,                         -- JSON: full Up payload for debug
  synced_at INTEGER NOT NULL
);
CREATE INDEX transactions_trip_time
  ON transactions(trip_id, occurred_at);

transaction_overrides(
  txn_id TEXT NOT NULL REFERENCES transactions(id),
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  excluded INTEGER NOT NULL,
  notes TEXT,
  PRIMARY KEY (txn_id, trip_id)
);

itinerary_entries(
  id INTEGER PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL              -- ISO 3166-1 alpha-2
);

category_budgets(
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  category_key TEXT NOT NULL,        -- Up parent slug or specific child slug
  target_aud_cents INTEGER NOT NULL,
  PRIMARY KEY (trip_id, category_key)
);
```

### 7.2 KV keys

| Key | Value | TTL |
|---|---|---|
| `sync:watermark:<trip_id>` | ISO ts of latest Up `createdAt` processed | none |
| `sync:status` | `{last_run, last_error, in_progress}` JSON | none |
| `fx:<YYYY-MM-DD>:<CCY>` | AUD-per-1-CCY rate, with `actual_date` if walked back | none |
| `up:webhook:id` | Up webhook id | none |
| `up:webhook:secret` | Up-issued HMAC secret | none |

### 7.3 ATM and manual-cash model

- Up transactions are flagged `is_atm = 1` when Up's child category indicates cash withdrawal (primary signal: Up's `cash-withdrawals` child category; fallback: description regex such as `/\bATM\b|cash withdrawal/i`).
- ATM transactions are real spend: `counts_as_spend = 1`. They appear in the dashboard's category breakdown under a dedicated "Cash" bucket.
- Manual cash entries default to `counts_as_spend = 0` — they are *detail*, not double-counted spend. A per-entry toggle ("This is cash that didn't come from a tracked ATM withdrawal") flips them to `counts_as_spend = 1` (covers airport exchange, cash gift, etc.).
- The "Cash on hand" stat = sum(ATM-withdrawn) − sum(manual non-counting entries). Surfaced as a small widget on the dashboard.

## 8. Data flows

### 8.1 Sync — cron (every 1h)

```
cron tick
  ├── load active trip + watermark
  ├── GET Up /transactions?filter[since]=watermark&page[size]=100 (paginated)
  ├── for each txn:
  │     ├── if account != Spending → skip
  │     ├── if relationships.transferAccount.data present → is_transfer = 1
  │     ├── if child category == 'cash-withdrawals' (or description matches) → is_atm = 1
  │     └── upsert transactions (idempotent on Up id, preserves overrides)
  ├── advance watermark to max(createdAt) processed
  └── write sync:status
```

### 8.2 Sync — webhook

```
POST /webhook/up
  ├── HMAC-verify body using KV up:webhook:secret
  ├── if TRANSACTION_CREATED|SETTLED: fetch txn by id, same upsert path
  ├── do NOT advance watermark (cron stays source of truth)
  └── 200 fast; Up retries 5xx, log errors regardless
```

### 8.3 Dashboard render

```
SPA → GET /api/dashboard?trip=active
Worker:
  ├── load trip + txns (date-bounded, transfers excluded, overrides applied)
  ├── load itinerary + category_budgets
  ├── analytics-core computes:
  │     spent, remaining, days_elapsed, days_left,
  │     burn_rate (last 7d avg, last 30d avg),
  │     daily_allowance (remaining / days_left),
  │     pace_delta (avg_daily_so_far − target_daily),
  │     today_spent, today_vs_allowance,
  │     by_category (incl. Cash bucket for ATMs),
  │     by_city (itinerary primary, currency fallback for gaps),
  │     trend (daily series), category_progress, cash_on_hand
  └── return JSON
TanStack Query refetches every 60s while page is foreground.
```

### 8.4 Manual cash entry

```
FAB tap → modal: amount, currency, date, category, notes,
                 "counts as spend?" toggle (default OFF)
POST /api/manual-entry
Worker:
  ├── if currency != AUD: fx.getRate(date, currency)
  │     ├── KV `fx:date:CCY` → hit returns immediately
  │     └── miss → fetch fawazahmed0 CDN, cache forever
  ├── insert transactions(source='manual', counts_as_spend per toggle)
  └── return new row; SPA optimistic-inserts; queries invalidate
```

### 8.5 Exclude / re-include

```
TxnRow menu → PATCH /api/transactions/:id {excluded: true}
Worker → upsert transaction_overrides(txn_id, trip_id, excluded=1)
Dashboard query invalidates → analytics recomputes.
```

### 8.6 Itinerary apply

```
Paste "1-10 May Tokyo / 11-20 May Kyoto"
SPA parses live, shows per-line errors if any
POST /api/itinerary {entries}
Worker validates, replaces trip's entries atomically
analytics-core groupByCity:
  for each txn → find itinerary entry whose [start,end] contains occurred_at
  else fall back to currency → country
  (eurozone resolves to "Europe (unspecified)" until refined)
```

### 8.7 Setup (idempotent)

```
GET /api/setup → {has_pat: bool, has_webhook: bool}
POST /api/setup
  ├── if no webhook in Up for our URL:
  │     POST Up /webhooks { url: "<this-worker>/webhook/up" }
  │     → response includes secret → KV up:webhook:id + secret
  └── return current state
```

## 9. Error handling and resilience

| Failure | Response |
|---|---|
| Up API 429 / 5xx | Exponential backoff (1s, 4s, 16s) up to 3 tries; persist `last_error`; succeed-quiet next cron. |
| Up API down for hours | Cron keeps trying; dashboard shows "Synced 3h ago" so staleness is visible. |
| Webhook HMAC fails | 401, log timestamp + IP. Never act on unverified payload. |
| Webhook arrives mid-cron | Idempotent upsert on Up txn id. Either run wins. |
| Up `HELD` → `SETTLED` change | Same id, upsert overwrites. `raw` JSON preserves prior state. |
| FX rate not yet published | Walk back up to 7 days; cache entry records `actual_date` so UI can flag "rate from 14 May". |
| fawazahmed0 CDN down | Two endpoints (jsdelivr + github.io). If both fail, store with `fx_pending`; cron retries conversion. |
| D1 transient error | Drizzle retries once; surface to SPA with retry toast. |
| User rotates Up PAT | Set new `UP_API_TOKEN` secret. Existing webhook secret unaffected. |
| User deletes webhook in Up | Cron is the safety net. Re-running `POST /api/setup` re-registers. |
| No txns yet | Dashboard zero state: budget + days remaining + daily allowance only. |
| Past-dated trip start (backfill) | First sync uses `filter[since]=start_date`. Paginates fully. Used for Europe 2025 fixture replay. |
| Two active trips | Partial unique index `WHERE is_active = 1` prevents. Set-active flips atomically. |
| Webhook replay | HMAC + idempotent upsert make replay harmless. |
| Eurozone ambiguity | Bucket as "Europe (unspecified)" until itinerary refines. Visible so user knows to fill in. |
| Garbled itinerary paste | Parser returns per-line errors; nothing saved until clean. |

**Logging**

Worker logs (Cloudflare Tail) include sync run summaries, error codes, 4xx/5xx counts. Never the PAT, never the webhook secret, never transaction descriptions or amounts. `raw` JSON column is internal, never exposed via any route.

**Secrets surface**

- `UP_API_TOKEN` — Worker secret.
- `up:webhook:secret` — Up-issued, stored in KV after setup.
- No client-side storage of secrets; Cloudflare Access cookie is the only client session token.

## 10. Testing

Pyramid:

```
                    ▲  Scenario tests (~5)
                   ╱ ╲ retroactive Europe trip, full sync→render
                  ╱   ╲
                 ╱─────╲ Integration tests (~20-30)
                ╱       ╲ Worker routes vs Miniflare D1/KV
               ╱─────────╲
              ╱           ╲ Unit tests (~60-80)
             ╱_____________╲ analytics, parser, FX cache, sync logic
```

### 10.1 Unit (Vitest, no Cloudflare runtime)

- `analytics-core.test.ts` — `dailyAllowance`, `pace`, `categoryProgress`, `groupByCity`, `cashOnHand`. Property tests for edge cases: zero-day trip, future-only trip, all-excluded, all-transfers, ATM-only spend.
- `itinerary-parser.test.ts` — accepted formats (`1-10 May Tokyo`, `May 1-10 Tokyo`, `1/5-10/5 Tokyo`), invalid input, overlap, gap detection.
- `sync/classify.test.ts` — transfer detection (transferAccount present/absent), ATM detection (category + description fallback), refund/reversal shapes.
- `up/client.test.ts` — mocked fetch: pagination, 429 backoff, error mapping.
- `fx/cache.test.ts` — KV miss → fetch + store; fallback walks back days; both CDN endpoints exhausted → `fx_pending`.
- `webhook/verify.test.ts` — HMAC over canonical body; tampered payload rejected; wrong secret rejected.

### 10.2 Integration (Vitest + `@cloudflare/vitest-pool-workers`)

Real Miniflare-backed D1 + KV per test. Boot the actual Hono app, hit it with `app.fetch(req)`.

- `routes/trips.test.ts` — create, set active (old flips inactive), archive, list.
- `routes/transactions.test.ts` — filters; exclude/re-include; dashboard aggregation respects overrides and transfers.
- `routes/manual-entry.test.ts` — AUD entry; foreign entry triggers FX (mocked CDN); `counts_as_spend` toggle affects totals.
- `routes/itinerary.test.ts` — replace-all semantics, parse errors surface.
- `routes/setup.test.ts` — first call registers webhook (mocked Up `/webhooks`); second call no-ops; deleted-and-recreate path.
- `sync/cron.test.ts` — cron handler with seeded Up fixture pages, watermark advances correctly, idempotent on re-run.
- `webhook/up.test.ts` — valid signature processes; invalid 401; replay no-ops.

### 10.3 Scenario (end-to-end, fixture-driven)

- `scenarios/europe-2025.test.ts` — load anonymised fixture (real Up data 2025-09-01 → 2025-11-06). Run full sync, fetch `/api/dashboard`, assert spent/remaining/by_category/by_city against precomputed expected values. Regression baseline for analytics changes.
- `scenarios/year-trip-pacing.test.ts` — synthetic 365-day trip, sprinkled fixture txns. Assert daily_allowance trajectory and pace_delta sign flips at expected points.
- `scenarios/transfer-noise.test.ts` — Spending ↔ Saver flows mixed with real spend; assert dashboard total matches real spend only.
- `scenarios/atm-cash-flow.test.ts` — ATM withdrawal + matching manual cash entries (counts_as_spend off) → dashboard total unchanged; cash_on_hand stat correct.
- `scenarios/eurozone-fallback.test.ts` — EUR txns spanning multiple countries with partial itinerary; assert unassigned days bucket as "Europe (unspecified)".

### 10.4 Fixtures

- `packages/shared/fixtures/up-transactions/*.json` — small curated set: AUD purchase, foreign purchase (JPY), transfer-out-to-Saver, transfer-in-from-Saver, held → settled, refund, declined, ATM withdrawal (AUD), ATM withdrawal (foreign).
- `packages/shared/fixtures/europe-2025/` — real Up data from 2025-09-01 to 2025-11-06, anonymised (descriptions replaced with `MERCHANT_<hash>`; amounts, dates, categories, accounts retained).

### 10.5 Lint and types

- `tsc --noEmit` across workspaces in CI.
- ESLint with `@typescript-eslint`, `no-floating-promises` strict.
- `drizzle-kit check` for migration drift.

### 10.6 TDD discipline

Every implementation task starts with a failing test. Particularly important for `analytics-core`: silent bugs (wrong number on a dashboard) are the worst kind here.

## 11. Deployment and local dev

### 11.1 One-click deploy

The Cloudflare "Deploy to Cloudflare" button provisions Pages + Worker + D1 (creates DB, runs migrations via post-deploy script) + KV namespace, and prompts for `UP_API_TOKEN`.

Post-deploy manual steps documented in README:

1. Enable Cloudflare Access on the Pages project, add your email. (Screenshots in README.)
2. Open the deployed URL. App auto-runs `POST /api/setup` to register the Up webhook and store the secret in KV.
3. Create your first trip (name, start date, budget). Done.

### 11.2 Local dev

```
pnpm i
pnpm --filter worker run db:migrate:local
pnpm dev   # parallel: wrangler dev + vite dev
```

- `wrangler dev` runs the Worker on :8787 with local D1 + KV (Miniflare).
- Vite dev server proxies `/api/*` and `/webhook/*` to :8787.
- `.dev.vars` holds the local `UP_API_TOKEN`.
- For local webhook testing: use cron-only locally; real webhook hits only the deployed env. (Optionally `wrangler dev --remote` for live testing.)

### 11.3 CI (GitHub Actions)

On push/PR: install → typecheck → lint → test (unit + integration + scenario) → build. No deploy from CI; deploys are user-driven via the button or `wrangler deploy`.

## 12. Coding standards

- TypeScript strict mode. No `any` outside explicit boundary types.
- No code comments unless explaining a non-obvious *why*. Identifiers and tests document *what*.
- No em-dashes in code or docs (project preference).
- Functions small, single-purpose. Pure where possible (especially `analytics-core`).
- All boundary input validated by zod schemas before reaching business logic.
- No backwards-compatibility shims for code not yet shipped.
