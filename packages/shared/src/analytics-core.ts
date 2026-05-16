export function dailyAllowance(remainingCents: number, daysLeft: number): number {
  if (daysLeft <= 0 || remainingCents <= 0) return 0;
  return Math.round(remainingCents / daysLeft);
}

export interface PaceInput {
  spent: number;
  daysElapsed: number;
  totalDays: number;
  budgetAudCents: number;
}

export function paceDelta({ spent, daysElapsed, totalDays, budgetAudCents }: PaceInput): number {
  if (daysElapsed <= 0 || totalDays <= 0) return 0;
  const targetDaily = budgetAudCents / totalDays;
  const actualDaily = spent / daysElapsed;
  return actualDaily - targetDaily;
}

import type { ItineraryEntry, Transaction } from "./schemas";

const ABS = (n: number) => (n < 0 ? -n : n);

// negative cents (spend) → positive total; positive cents (refund) → subtract
const spendAmount = (cents: number): number => -cents;

function countsAsSpend(t: Transaction, excluded: Set<string>): boolean {
  if (excluded.has(t.id)) return false;
  if (t.isTransfer) return false;
  if (!t.countsAsSpend) return false;
  return true;
}

export function totals(txns: Transaction[], excluded: Set<string>): { spent: number } {
  let spent = 0;
  for (const t of txns) {
    if (excluded.has(t.id)) continue;
    if (t.isTransfer) continue;
    if (!t.countsAsSpend) continue;
    spent += t.amountAudCents < 0 ? ABS(t.amountAudCents) : -t.amountAudCents;
  }
  return { spent };
}

export interface CategoryProgressRow {
  categoryKey: string;
  spent: number;
  target: number | null;
  pct: number | null;
}

export function categoryProgress(
  txns: Transaction[],
  excluded: Set<string>,
  budgets: Map<string, number>,
): CategoryProgressRow[] {
  const sums = new Map<string, number>();
  for (const t of txns) {
    if (!countsAsSpend(t, excluded)) continue;
    const key = t.isAtm ? "cash" : (t.upCategoryParent ?? "uncategorised");
    sums.set(key, (sums.get(key) ?? 0) + spendAmount(t.amountAudCents));
  }
  const keys = new Set<string>([...sums.keys(), ...budgets.keys()]);
  const rows: CategoryProgressRow[] = [];
  for (const k of keys) {
    const spent = sums.get(k) ?? 0;
    const target = budgets.get(k) ?? null;
    const pct = target && target > 0 ? spent / target : null;
    rows.push({ categoryKey: k, spent, target, pct });
  }
  return rows.sort((a, b) => b.spent - a.spent);
}

export interface CityGroup {
  label: string;
  spent: number;
}

export const EUROZONE = new Set([
  "AT","BE","CY","DE","EE","ES","FI","FR","GR","HR","IE","IT","LT","LU","LV","MT","NL","PT","SI","SK",
]);

export const CURRENCY_TO_COUNTRY: Record<string, { country: string; label: string }> = {
  JPY: { country: "JP", label: "Japan" },
  THB: { country: "TH", label: "Thailand" },
  USD: { country: "US", label: "United States" },
  GBP: { country: "GB", label: "United Kingdom" },
  EUR: { country: "EU", label: "Europe (unspecified)" },
  IDR: { country: "ID", label: "Indonesia" },
  VND: { country: "VN", label: "Vietnam" },
  SGD: { country: "SG", label: "Singapore" },
  KRW: { country: "KR", label: "South Korea" },
  HKD: { country: "HK", label: "Hong Kong" },
  TWD: { country: "TW", label: "Taiwan" },
  CHF: { country: "CH", label: "Switzerland" },
  NZD: { country: "NZ", label: "New Zealand" },
  AUD: { country: "AU", label: "Australia" },
};

function isoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function groupByCity(
  txns: Transaction[],
  excluded: Set<string>,
  itinerary: ItineraryEntry[],
): CityGroup[] {
  const groups = new Map<string, number>();
  for (const t of txns) {
    if (!countsAsSpend(t, excluded)) continue;
    const day = isoDate(t.occurredAt);
    const match = itinerary.find((e) => day >= e.startDate && day <= e.endDate);
    let label: string;
    if (match) {
      label = `${match.city}, ${match.country}`;
    } else if (t.foreignCurrency) {
      label = CURRENCY_TO_COUNTRY[t.foreignCurrency]?.label ?? `Unknown (${t.foreignCurrency})`;
    } else {
      label = "Home (AU)";
    }
    groups.set(label, (groups.get(label) ?? 0) + spendAmount(t.amountAudCents));
  }
  return [...groups.entries()].map(([label, spent]) => ({ label, spent }))
    .sort((a, b) => b.spent - a.spent);
}

export function cashOnHand(txns: Transaction[]): number {
  let withdrawn = 0;
  let consumed = 0;
  for (const t of txns) {
    if (t.isAtm) withdrawn += ABS(t.amountAudCents);
    else if (t.source === "manual" && !t.countsAsSpend) consumed += ABS(t.amountAudCents);
  }
  return withdrawn - consumed;
}

export function dailyTrend(
  txns: Transaction[],
  excluded: Set<string>,
  startDate: string,
  endDate: string,
): { date: string; spent: number }[] {
  const by = new Map<string, number>();
  for (const t of txns) {
    if (!countsAsSpend(t, excluded)) continue;
    const day = isoDate(t.occurredAt);
    by.set(day, (by.get(day) ?? 0) + spendAmount(t.amountAudCents));
  }
  const out: { date: string; spent: number }[] = [];
  let cursor = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cursor <= end) {
    const k = cursor.toISOString().slice(0, 10);
    out.push({ date: k, spent: by.get(k) ?? 0 });
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return out;
}
