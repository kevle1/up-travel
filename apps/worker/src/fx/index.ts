const PRIMARY = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies";
const FALLBACK = "https://currency-api.pages.dev/v1/currencies";

export interface GetRateOpts {
  kv: KVNamespace;
  date: string;
  currency: string;
  fetch?: typeof globalThis.fetch;
  maxLookback?: number;
}

export interface RateResult {
  rate: number;
  actualDate: string;
}

const pad = (n: number) => n.toString().padStart(2, "0");
function prevDate(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`) - 86_400_000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function fetchOne(
  fetchFn: typeof globalThis.fetch,
  date: string,
  currency: string,
): Promise<{ rate: number; date: string } | null> {
  const ccy = currency.toLowerCase();
  const primary = `${PRIMARY}@${date}/aud.json`;
  const fallback = `${FALLBACK}@${date}/aud.json`;
  for (const url of [primary, fallback]) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { date: string; aud: Record<string, number> };
      const audPerCcy = json.aud[ccy];
      if (!audPerCcy) continue;
      return { rate: 1 / audPerCcy, date: json.date };
    } catch {
      continue;
    }
  }
  return null;
}

export async function getRateToAud(opts: GetRateOpts): Promise<RateResult> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const cacheKey = `fx:${opts.date}:${opts.currency}`;
  const cached = await opts.kv.get(cacheKey, "json");
  if (cached && typeof (cached as { rate?: unknown }).rate === "number") {
    return cached as RateResult;
  }
  let cursor = opts.date;
  const limit = opts.maxLookback ?? 7;
  for (let i = 0; i <= limit; i++) {
    const r = await fetchOne(fetchFn, cursor, opts.currency);
    if (r) {
      const result: RateResult = { rate: r.rate, actualDate: r.date };
      await opts.kv.put(cacheKey, JSON.stringify(result));
      return result;
    }
    cursor = prevDate(cursor);
  }
  throw new Error(`FX rate unavailable for ${opts.currency} on or before ${opts.date}`);
}
