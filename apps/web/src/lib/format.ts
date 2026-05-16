export const aud = (cents: number): string =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
export const audSigned = (cents: number): string =>
  cents >= 0 ? `+${aud(cents)}` : `-${aud(Math.abs(cents))}`;
export const compactNum = (n: number): string =>
  new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 }).format(n);
export const isoDay = (epochMs: number): string => new Date(epochMs).toISOString().slice(0, 10);
