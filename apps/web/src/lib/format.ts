// Money formatters. BurnState exposes dollar values (not cents), so these
// take dollars by default; use *Cents variants when handling raw cents.

const aud0 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const aud2 = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money0 = (dollars: number): string => aud0.format(dollars);
export const money2 = (dollars: number): string => aud2.format(dollars);
export const signed = (dollars: number): string =>
  dollars >= 0 ? `+${money0(dollars)}` : `−${money0(Math.abs(dollars))}`;

export const audCents0 = (cents: number): string => money0(cents / 100);
export const audCents2 = (cents: number): string => money2(cents / 100);

export const fmtDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

export const fmtDateLong = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Foreign currency: positive decimal, 2 places, locale-grouped. e.g. 142.30 → "142.30"
export const fmtForeign = (value: number, currency: string): string => {
  const n = Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n} ${currency}`;
};

// "Today" / "Yesterday" must compare against the wall-clock today, NOT the
// trip's asOf (which clamps to the end date for completed trips and would
// wrongly label e.g. 6 Nov 2025 as "Today" months after the trip ended).
const realToday = (): string => new Date().toISOString().slice(0, 10);

// Up returns the cardPurchaseMethod as an enum-style screaming-snake string
// (CARD_ON_FILE, CONTACTLESS, ECOMMERCE…). Map the common ones to friendly
// labels and fall back to title-casing the raw value so we never hide an
// unknown method from the user.
const METHODS: Record<string, string> = {
  BAR_CODE: "Bar code",
  OCR: "OCR",
  CARD_PIN: "Card PIN",
  CARD_DETAILS: "Card",
  CARD_ON_FILE: "Card",
  ECOMMERCE: "Online",
  MAGNETIC_STRIPE: "Magstripe",
  CONTACTLESS: "Contactless",
  ATM: "ATM",
  Cash: "Cash",
};
export const fmtMethod = (raw: string | null): string | null => {
  if (!raw) return null;
  if (METHODS[raw]) return METHODS[raw];
  return raw
    .toLowerCase()
    .split(/[_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

// Relative time, designed for sync indicator strings like "just now",
// "3m ago", "2h ago", "yesterday", or an absolute date for older.
export function relTime(epochMs: number | null | undefined): string {
  if (!epochMs) return "never";
  const diff = Date.now() - epochMs;
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(epochMs).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export const dayLabel = (iso: string): string => {
  const today = realToday();
  const yest = new Date(new Date(`${today}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return "Today";
  if (iso === yest) return "Yesterday";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
