// D1 schema as a list of one-statement-per-element strings. `CREATE TABLE IF
// NOT EXISTS` everywhere so the same array can be replayed at worker startup
// for first-deploy bootstrap and pre-pended to the seed script. Kept as .mjs
// so the seed script (plain Node) can import it without a TS build step.

export default [
  `CREATE TABLE IF NOT EXISTS trips (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    name text NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    budget_aud_cents integer NOT NULL,
    target_daily_aud_cents integer NOT NULL,
    current_city text DEFAULT '' NOT NULL,
    is_active integer NOT NULL,
    created_at integer NOT NULL,
    archived_at integer
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active ON trips (is_active) WHERE is_active = 1`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id text PRIMARY KEY NOT NULL,
    trip_id integer NOT NULL,
    source text NOT NULL,
    occurred_at integer NOT NULL,
    amount_aud_cents integer NOT NULL,
    foreign_amount numeric,
    foreign_currency text,
    description text NOT NULL,
    up_category_parent text,
    up_category_child text,
    card_purchase_method text,
    city text,
    is_transfer integer DEFAULT 0 NOT NULL,
    is_atm integer DEFAULT 0 NOT NULL,
    raw text,
    synced_at integer NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS transactions_trip_time ON transactions (trip_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS stays (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    trip_id integer NOT NULL,
    name text NOT NULL,
    city text DEFAULT '' NOT NULL,
    check_in text NOT NULL,
    nights integer NOT NULL,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS stays_trip ON stays (trip_id, check_in)`,
  `CREATE TABLE IF NOT EXISTS transaction_overrides (
    txn_id text NOT NULL,
    trip_id integer NOT NULL,
    travel_category text,
    stay_id integer,
    spread_days integer,
    count_as_credit integer DEFAULT 0 NOT NULL,
    excluded integer DEFAULT 0 NOT NULL,
    notes text,
    PRIMARY KEY (txn_id, trip_id),
    FOREIGN KEY (txn_id) REFERENCES transactions(id) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON UPDATE no action ON DELETE no action,
    FOREIGN KEY (stay_id) REFERENCES stays(id) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS overrides_stay ON transaction_overrides (stay_id)`,
  `CREATE TABLE IF NOT EXISTS cash_logs (
    id text PRIMARY KEY NOT NULL,
    trip_id integer NOT NULL,
    kind text NOT NULL,
    occurred_at integer NOT NULL,
    amount_aud_cents integer NOT NULL,
    foreign_amount numeric,
    foreign_currency text,
    travel_category text DEFAULT 'other' NOT NULL,
    is_cash integer DEFAULT 0 NOT NULL,
    city text,
    note text,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON UPDATE no action ON DELETE no action
  )`,
  `CREATE INDEX IF NOT EXISTS cash_logs_trip_time ON cash_logs (trip_id, occurred_at)`,
];
