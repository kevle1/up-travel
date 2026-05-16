export interface ParsedItineraryEntry {
  startDate: string;
  endDate: string;
  city: string;
  country: string;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  entries: ParsedItineraryEntry[];
  errors: ParseError[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => n.toString().padStart(2, "0");

function makeDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function tryDayRangeMonth(line: string, year: number): ParsedItineraryEntry | null {
  const m = /^(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(.+?)\s*,\s*([A-Z]{2})$/.exec(line);
  if (!m) return null;
  const d1 = m[1]!;
  const d2 = m[2]!;
  const mon = m[3]!;
  const city = m[4]!;
  const cc = m[5]!;
  const monthN = MONTHS[mon.toLowerCase().slice(0, 3)];
  if (!monthN) return null;
  const s = makeDate(year, monthN, Number(d1));
  const e = makeDate(year, monthN, Number(d2));
  if (!s || !e) return null;
  return { startDate: s, endDate: e, city: city.trim(), country: cc };
}

function tryMonthDayRange(line: string, year: number): ParsedItineraryEntry | null {
  const m = /^([A-Za-z]{3,9})\s+(\d{1,2})\s*-\s*(\d{1,2})\s+(.+?)\s*,\s*([A-Z]{2})$/.exec(line);
  if (!m) return null;
  const mon = m[1]!;
  const d1 = m[2]!;
  const d2 = m[3]!;
  const city = m[4]!;
  const cc = m[5]!;
  const monthN = MONTHS[mon.toLowerCase().slice(0, 3)];
  if (!monthN) return null;
  const s = makeDate(year, monthN, Number(d1));
  const e = makeDate(year, monthN, Number(d2));
  if (!s || !e) return null;
  return { startDate: s, endDate: e, city: city.trim(), country: cc };
}

function trySlashRange(line: string, year: number): ParsedItineraryEntry | null {
  const m = /^(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})\s+(.+?)\s*,\s*([A-Z]{2})$/.exec(line);
  if (!m) return null;
  const d1 = m[1]!;
  const m1 = m[2]!;
  const d2 = m[3]!;
  const m2 = m[4]!;
  const city = m[5]!;
  const cc = m[6]!;
  const s = makeDate(year, Number(m1), Number(d1));
  const e = makeDate(year, Number(m2), Number(d2));
  if (!s || !e) return null;
  return { startDate: s, endDate: e, city: city.trim(), country: cc };
}

export function parseItinerary(input: string, year: number): ParseResult {
  const lines = input.split("\n");
  const entries: ParsedItineraryEntry[] = [];
  const errors: ParseError[] = [];
  lines.forEach((raw, i) => {
    const ln = raw.trim();
    if (ln === "" || ln.startsWith("#")) return;
    const entry =
      tryDayRangeMonth(ln, year) ?? tryMonthDayRange(ln, year) ?? trySlashRange(ln, year);
    if (!entry) {
      errors.push({ line: i + 1, message: `Unparsable line: "${ln}"` });
      return;
    }
    if (entry.endDate < entry.startDate) {
      errors.push({ line: i + 1, message: "endDate < startDate" });
      return;
    }
    entries.push(entry);
  });
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]!, b = entries[j]!;
      if (a.startDate <= b.endDate && b.startDate <= a.endDate) {
        errors.push({
          line: 0,
          message: `Entries overlap: ${a.city} (${a.startDate}–${a.endDate}) and ${b.city} (${b.startDate}–${b.endDate})`,
        });
      }
    }
  }
  return { entries, errors };
}
