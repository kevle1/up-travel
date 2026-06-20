// Honest-burn engine. Pure function: given a trip + its data + the asOf date,
// return everything every screen needs to render. Mirrors window.Burn from the
// design prototype, but server-rendered so the client can be a thin renderer.

import { upToTravel, travelBucket, travelCategory, type TravelBucket } from "./categories";
import type { Trip, Transaction, TransactionOverride, Stay, CashLog } from "./schemas";

export const BUCKETS: readonly TravelBucket[] = ["Food", "Stay", "Transport", "Activities", "Cash", "Other"];

const MS_DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => isoOf(new Date(toDate(iso).getTime() + n * MS_DAY));
const daysBetween = (a: string, b: string) =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / MS_DAY);

// Spent amount in dollars (positive). amountAudCents is negative for spend.
const spendDollars = (cents: number) => round2(-cents / 100);

export interface BurnInput {
  trip: Trip;
  transactions: readonly Transaction[];
  overrides: readonly TransactionOverride[];
  stays: readonly Stay[];
  cashLogs: readonly CashLog[];
  asOf: string; // YYYY-MM-DD; usually "today" in the trip's timezone (UTC here)
}

export type PaceStatus = "good" | "watch" | "over";

export interface BurnDay {
  date: string;
  total: number;
  Food: number; Stay: number; Transport: number; Activities: number; Cash: number; Other: number;
}

export interface CatRow {
  cat: string;
  label: string;
  bucket: TravelBucket;
  color: string;
  amount: number;
}

export interface FeedRow {
  id: string;
  occurredAt: number;
  date: string;
  description: string;
  message: string | null;
  aud: number;
  foreign: { value: number; currencyCode: string } | null;
  method: string | null;
  category: string;       // travel category id (post-override)
  upTag: string | null;   // Up child id
  bucket: TravelBucket;
  isAccom: boolean;
  stayId: number | null;
  /** If >1, this transaction's amount is spread evenly across N days from `date`. */
  spreadDays: number | null;
  /** True for positive-amount transactions (refunds, deposits, salary). */
  incoming: boolean;
  /** True if this incoming row was opted in to count against burn. */
  countsAsCredit: boolean;
  /** Only meaningful on cashlog rows: true when the user flagged the spend
   *  as "Paid in cash" (draws from the cash float). */
  isCash: boolean;
  /** User-excluded from burn totals. Row still appears in the feed (greyed)
   *  so the user can re-include it. */
  excluded: boolean;
  /** Snapshot of the city the user was in when the spend happened, or null. */
  city: string | null;
  /** Free-text notes the user attached. From transactionOverrides.notes for
   *  card transactions, or cashLogs.note for manual rows. */
  notes: string | null;
  kind: "card" | "cashlog";
  cashLogKind?: "spend" | "topup";
  internal: boolean;      // true for ATM withdrawals (float top-up, not burn)
  isTransfer: boolean;
}

export interface StayView {
  id: number;
  name: string;
  city: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  elapsedNights: number;
  txIds: string[];
  totalCost: number;
  perNight: number;
  spent: number; // amortised across elapsed nights
  payments: { txId: string; label: string; date: string; aud: number }[];
}

export type CatWindow = "3" | "7" | "14" | "30" | "all";
export const CAT_WINDOWS: CatWindow[] = ["3", "7", "14", "30", "all"];
export interface CatBreakdownView { items: CatRow[]; total: number; days: number }

export interface OutlierRow {
  date: string;
  label: string;
  aud: number;
  bucket: TravelBucket;
  cat: string;
  foreign: { value: number; currencyCode: string } | null;
  method: string | null;
  city: string;
}

export interface BurnState {
  trip: { id: number; name: string; startDate: string; endDate: string; currentCity: string; budgetAudCents: number; targetDailyAudCents: number };
  asOf: string;
  dayNumber: number;
  plannedDays: number;
  daysLeft: number;
  isComplete: boolean;
  partialToday: boolean;
  series: BurnDay[];
  todayBurn: number;
  todayRow: BurnDay;
  avgAll: number;
  avg7: number;
  avg30: number;
  cumulative: number;
  target: number; // dollars/day
  budget: number; // dollars
  budgetLeft: number;
  banked: number; // (target * completedDays) - cumCompleted
  runwayDays: number | null; // null = infinite (no spend)
  projectedTotal: number;
  projectedEnd: number;
  finalEnd: number;
  safeDaily: number;
  cashFloat: number; // dollars
  cityByDay: Record<string, { city: string }>;
  catBreakdownToday: CatBreakdownView;
  /** Keyed by window: "3", "7", "14", "30", "all" - the cat breakdown for that span ending at asOf. */
  catBreakdownByWindow: Record<CatWindow, CatBreakdownView>;
  stays: StayView[];
  feed: FeedRow[];
  /** Biggest individual spends across the whole trip, sorted desc. */
  outliers: OutlierRow[];
}

export function buildBurn(input: BurnInput): BurnState {
  const { trip, transactions, overrides, stays, cashLogs } = input;
  // Clamp asOf to the trip window. Pre-trip → start; post-trip → end.
  const asOf =
    input.asOf < trip.startDate ? trip.startDate :
    input.asOf > trip.endDate ? trip.endDate : input.asOf;

  const overrideById = new Map(overrides.map((o) => [o.txnId, o]));
  const txById = new Map(transactions.map((t) => [t.id, t]));

  // Effective per-day series window: trip start → asOf (UTC).
  const plannedDays = Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1);
  const dayKeys: string[] = [];
  for (let d = toDate(trip.startDate).getTime(); d <= toDate(asOf).getTime(); d += MS_DAY) {
    dayKeys.push(isoOf(new Date(d)));
  }
  const todayKey = dayKeys[dayKeys.length - 1]!;
  const realToday = new Date().toISOString().slice(0, 10);
  const partialToday = !trip.endDate || realToday <= trip.endDate && todayKey === realToday;
  const isComplete = asOf === trip.endDate && realToday > trip.endDate;

  const blank = (): BurnDay => ({ date: "", total: 0, Food: 0, Stay: 0, Transport: 0, Activities: 0, Cash: 0, Other: 0 });
  const daily: Record<string, BurnDay> = {};
  const catDaily: Record<string, Record<string, number>> = {};
  for (const k of dayKeys) { daily[k] = { ...blank(), date: k }; catDaily[k] = {}; }

  // ── Stays: resolve linked transactions, compute per-night cost ──────────────
  type LinkedTx = { tx: Transaction; stayId: number };
  const stayLinks: LinkedTx[] = [];
  for (const o of overrides) {
    if (o.stayId == null) continue;
    const t = txById.get(o.txnId);
    if (t) stayLinks.push({ tx: t, stayId: o.stayId });
  }
  const accomTxIds = new Set(stayLinks.map((l) => l.tx.id));

  const staysView: StayView[] = stays.map((s) => {
    const checkOut = addDays(s.checkIn, s.nights);
    const linked = stayLinks.filter((l) => l.stayId === s.id).map((l) => l.tx);
    const totalCost = round2(linked.reduce((a, t) => a + spendDollars(t.amountAudCents), 0));
    const perNight = round2(totalCost / Math.max(1, s.nights));
    const payments = linked
      .map((t) => ({
        txId: t.id,
        label: t.description,
        date: isoOf(new Date(t.occurredAt)),
        aud: round2(spendDollars(t.amountAudCents)),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const elapsedNights = Math.max(0, Math.min(
      s.nights,
      Math.floor((toDate(asOf).getTime() - toDate(s.checkIn).getTime()) / MS_DAY) + (isComplete ? 1 : 0),
    ));
    return {
      id: s.id, name: s.name, city: s.city,
      checkIn: s.checkIn, checkOut, nights: s.nights,
      elapsedNights,
      txIds: linked.map((t) => t.id),
      totalCost, perNight, payments,
      spent: round2(Math.min(s.nights, elapsedNights) * perNight),
    };
  }).sort((a, b) => (a.checkIn < b.checkIn ? -1 : 1));

  // City-by-day lookup (used by outliers + feed metadata)
  const cityByDay: Record<string, { city: string }> = {};
  for (const s of staysView) {
    if (!s.city) continue;
    for (let d = toDate(s.checkIn).getTime(); d < toDate(s.checkOut).getTime(); d += MS_DAY) {
      const k = isoOf(new Date(d));
      if (!cityByDay[k]) cityByDay[k] = { city: s.city };
    }
  }

  // ── Walk transactions ──────────────────────────────────────────────────────
  const addBucket = (k: string, bucket: TravelBucket, v: number, cat: string) => {
    const row = daily[k];
    if (!row) return;
    row[bucket] = round2(row[bucket] + v);
    row.total = round2(row.total + v);
    const cd = catDaily[k]!;
    cd[cat] = round2((cd[cat] ?? 0) + v);
  };
  const catOf = (t: Transaction): string => {
    const o = overrideById.get(t.id);
    if (o?.travelCategory) return o.travelCategory;
    return upToTravel(t.upCategoryChild);
  };

  for (const t of transactions) {
    if (t.isTransfer) continue;
    if (t.isAtm) continue; // ATM = float top-up, not burn
    const ov = overrideById.get(t.id);
    if (ov?.excluded) continue;
    if (accomTxIds.has(t.id)) continue; // accommodation handled separately
    // Positive amounts (refunds, deposits, salary) don't count in burn unless
    // the user opts in via countAsCredit. When they do, the negative dollars
    // produced by spendDollars() reduce that day's burn total naturally.
    if (t.amountAudCents > 0 && !ov?.countAsCredit) continue;
    const cat = catOf(t);
    const bucket = travelBucket(cat);
    const full = spendDollars(t.amountAudCents);
    const startKey = isoOf(new Date(t.occurredAt));
    // Optional spread: amortise across N days starting at occurredAt. Useful
    // for things like a 5-day transport pass where the lump-sum charge isn't
    // representative of single-day burn. Spread days that fall after asOf
    // are skipped (not counted yet).
    const n = ov?.spreadDays && ov.spreadDays > 1 ? ov.spreadDays : 1;
    if (n === 1) {
      addBucket(startKey, bucket, full, cat);
    } else {
      const perDay = round2(full / n);
      for (let d = 0; d < n; d++) {
        const k = addDays(startKey, d);
        if (k < trip.startDate || k > asOf) continue;
        addBucket(k, bucket, perDay, cat);
      }
    }
  }

  // User-logged cash spend counts as burn; top-ups don't.
  for (const c of cashLogs) {
    if (c.kind === "topup") continue;
    const k = isoOf(new Date(c.occurredAt));
    addBucket(k, travelBucket(c.travelCategory), round2(c.amountAudCents / 100), c.travelCategory);
  }

  // Stays: amortise total across their nights
  for (const s of staysView) {
    if (!s.perNight) continue;
    for (let d = toDate(s.checkIn).getTime(); d < toDate(s.checkOut).getTime(); d += MS_DAY) {
      const k = isoOf(new Date(d));
      if (k > asOf) break;
      addBucket(k, "Stay", s.perNight, "accommodation");
    }
  }

  const series = dayKeys.map((k) => daily[k]!);
  const N = series.length;
  const todayRow = series[N - 1]!;
  const cumulative = round2(series.reduce((a, r) => a + r.total, 0));
  const completed = partialToday ? series.slice(0, -1) : series;
  const cumCompleted = round2(completed.reduce((a, r) => a + r.total, 0));
  const completedDays = Math.max(1, completed.length);

  const target = round2(trip.targetDailyAudCents / 100);
  const budget = round2(trip.budgetAudCents / 100);

  const rollingAvg = (win: number) => {
    const rows = completed.slice(Math.max(0, completed.length - win));
    if (!rows.length) return 0;
    return round2(rows.reduce((a, r) => a + r.total, 0) / rows.length);
  };
  const avgAll = round2(cumCompleted / completedDays);
  const avg7 = rollingAvg(7);
  const avg30 = rollingAvg(30);
  const banked = round2(completedDays * target - cumCompleted);

  const budgetLeft = round2(budget - cumulative);
  const daysLeft = Math.max(0, plannedDays - N);
  const runwayDays = avgAll > 0 ? Math.round(budgetLeft / avgAll) : null;
  const projectedTotal = round2(avgAll * plannedDays);
  const projectedEnd = round2(budget - projectedTotal);
  const finalEnd = round2(budget - cumulative);
  const safeDaily = daysLeft > 0 ? round2(budgetLeft / daysLeft) : 0;

  // Cash float: Up-sourced ATM withdrawals top it up. Manual cash logs only
  // draw from it when the user flagged them as "Paid in cash" (isCash).
  let withdrawn = 0;
  let spent = 0;
  for (const t of transactions) if (t.isAtm) withdrawn += round2(spendDollars(t.amountAudCents));
  for (const c of cashLogs) {
    if (c.kind === "topup") withdrawn += round2(c.amountAudCents / 100);
    else if (c.isCash) spent += round2(c.amountAudCents / 100);
  }
  const cashFloat = round2(withdrawn - spent);

  // ── Category breakdowns over various windows ───────────────────────────────
  const breakdownOver = (keys: string[]) => {
    const totals: Record<string, number> = {};
    for (const k of keys) {
      const cd = catDaily[k] ?? {};
      for (const cat in cd) totals[cat] = round2((totals[cat] ?? 0) + cd[cat]!);
    }
    const items: CatRow[] = Object.entries(totals)
      .filter(([, amt]) => amt > 0)
      .map(([cat, amount]) => {
        const tc = travelCategory(cat);
        return { cat, label: tc.label, bucket: tc.bucket, color: tc.color, amount: round2(amount) };
      })
      .sort((a, b) => b.amount - a.amount);
    const total = round2(items.reduce((a, x) => a + x.amount, 0));
    return { items, total, days: keys.length };
  };
  const last = (n: number) => dayKeys.slice(Math.max(0, dayKeys.length - n));

  const catBreakdownToday = breakdownOver([todayKey]);
  const catBreakdownByWindow: Record<CatWindow, CatBreakdownView> = {
    "3": breakdownOver(last(3)),
    "7": breakdownOver(last(7)),
    "14": breakdownOver(last(14)),
    "30": breakdownOver(last(30)),
    "all": breakdownOver(dayKeys),
  };

  // ── Feed (Spend tab) ───────────────────────────────────────────────────────
  // Clamp to the trip window. Stay-linked transactions kept regardless so a
  // pre-trip deposit still appears. Transfers (Up's internal account-to-
  // account moves) stay hidden - they're not real spend or income. Incoming
  // amounts (refunds, salary, deposits) are shown so the user can see them
  // and optionally toggle "count as credit" to apply them against burn.
  const feed: FeedRow[] = [];
  const foreignFor = (amt: number | null, ccy: string | null) =>
    amt != null && ccy ? { value: Math.abs(amt), currencyCode: ccy } : null;
  for (const t of transactions) {
    const o = overrideById.get(t.id);
    // Excluded rows stay in the feed (greyed in UI) so the user can re-include
    // them. The burn loop above already skips them from totals.
    if (t.isTransfer) continue;
    const date = isoOf(new Date(t.occurredAt));
    const linked = accomTxIds.has(t.id);
    if (!linked && (date < trip.startDate || date > asOf)) continue;
    // Stay-linked transactions surface as Accommodation regardless of the
    // user's per-tx travel category override. The override is preserved so
    // unlinking the stay restores the original category cleanly.
    const cat = linked ? "accommodation" : catOf(t);
    const incoming = t.amountAudCents > 0;
    feed.push({
      id: t.id,
      occurredAt: t.occurredAt,
      date,
      description: t.description,
      message: null,
      // aud is the magnitude in dollars; incoming/countsAsCredit carry the sign info.
      aud: round2(Math.abs(t.amountAudCents) / 100),
      foreign: foreignFor(t.foreignAmount, t.foreignCurrency),
      method: t.cardPurchaseMethod ?? (t.isAtm ? "ATM" : null),
      category: cat,
      upTag: t.upCategoryChild,
      bucket: travelBucket(cat),
      isAccom: linked,
      stayId: o?.stayId ?? null,
      spreadDays: o?.spreadDays && o.spreadDays > 1 ? o.spreadDays : null,
      incoming,
      countsAsCredit: incoming && !!o?.countAsCredit,
      isCash: false,
      excluded: !!o?.excluded,
      city: t.city ?? cityByDay[date]?.city ?? null,
      notes: o?.notes ?? null,
      kind: "card",
      internal: t.isAtm,
      isTransfer: t.isTransfer,
    });
  }
  for (const c of cashLogs) {
    const date = isoOf(new Date(c.occurredAt));
    if (date < trip.startDate || date > asOf) continue;
    feed.push({
      id: c.id,
      occurredAt: c.occurredAt,
      date,
      description: c.note ?? travelCategory(c.travelCategory).label,
      message: null,
      aud: round2(c.amountAudCents / 100),
      foreign: foreignFor(c.foreignAmount, c.foreignCurrency),
      method: c.kind === "topup" ? "ATM" : "Cash",
      category: c.travelCategory,
      upTag: null,
      bucket: travelBucket(c.travelCategory),
      isAccom: false,
      stayId: null,
      spreadDays: null,
      incoming: false,
      countsAsCredit: false,
      isCash: c.kind === "spend" ? c.isCash : true, // topups are always cash by nature
      excluded: false,
      city: c.city ?? cityByDay[date]?.city ?? null,
      notes: c.note,
      kind: "cashlog",
      cashLogKind: c.kind,
      internal: c.kind === "topup",
      isTransfer: false,
    });
  }
  feed.sort((a, b) => b.occurredAt - a.occurredAt);

  // Outliers: biggest single spends across the whole trip window. UI takes the
  // top N; we return up to 50 so callers can show "load more" if they want.
  const outliers: OutlierRow[] = [];
  for (const t of transactions) {
    if (t.isTransfer || t.isAtm) continue;
    if (overrideById.get(t.id)?.excluded) continue;
    if (accomTxIds.has(t.id)) continue;
    if (t.amountAudCents > 0) continue;
    const date = isoOf(new Date(t.occurredAt));
    if (date < trip.startDate || date > asOf) continue;
    const cat = catOf(t);
    outliers.push({
      date, label: t.description,
      aud: round2(spendDollars(t.amountAudCents)),
      bucket: travelBucket(cat), cat,
      foreign: foreignFor(t.foreignAmount, t.foreignCurrency),
      method: t.cardPurchaseMethod,
      city: t.city ?? cityByDay[date]?.city ?? "",
    });
  }
  for (const c of cashLogs) {
    if (c.kind !== "spend") continue;
    const date = isoOf(new Date(c.occurredAt));
    if (date < trip.startDate || date > asOf) continue;
    outliers.push({
      date, label: c.note ?? travelCategory(c.travelCategory).label,
      aud: round2(c.amountAudCents / 100),
      bucket: travelBucket(c.travelCategory), cat: c.travelCategory,
      foreign: foreignFor(c.foreignAmount, c.foreignCurrency),
      method: "Cash",
      city: c.city ?? cityByDay[date]?.city ?? "",
    });
  }
  outliers.sort((a, b) => b.aud - a.aud);
  outliers.length = Math.min(outliers.length, 50);

  return {
    trip: {
      id: trip.id, name: trip.name,
      startDate: trip.startDate, endDate: trip.endDate, currentCity: trip.currentCity,
      budgetAudCents: trip.budgetAudCents, targetDailyAudCents: trip.targetDailyAudCents,
    },
    asOf, dayNumber: N, plannedDays, daysLeft,
    isComplete, partialToday,
    series, todayBurn: todayRow.total, todayRow,
    avgAll, avg7, avg30, cumulative,
    target, budget, budgetLeft, banked,
    runwayDays, projectedTotal, projectedEnd, finalEnd, safeDaily,
    cashFloat, cityByDay,
    catBreakdownToday, catBreakdownByWindow,
    stays: staysView, feed, outliers,
  };
}

export function paceStatus(value: number, target: number): PaceStatus {
  if (value <= target * 0.92) return "good";
  if (value <= target * 1.06) return "watch";
  return "over";
}
