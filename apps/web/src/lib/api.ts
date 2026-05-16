async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export const api = {
  health: () => http<{ ok: boolean }>("/api/health"),
  dashboard: () => http<DashboardPayload>("/api/dashboard"),
  trips: {
    list: () => http<TripDto[]>("/api/trips"),
    create: (body: TripCreateInput) =>
      http<TripDto>("/api/trips", { method: "POST", body: JSON.stringify(body) }),
    activate: (id: number) => http<{ ok: true }>(`/api/trips/${id}/activate`, { method: "POST" }),
    archive: (id: number) => http<{ ok: true }>(`/api/trips/${id}/archive`, { method: "POST" }),
  },
  transactions: {
    exclude: (id: string, excluded: boolean) =>
      http<{ ok: true }>(`/api/transactions/${id}/exclude`, {
        method: "POST",
        body: JSON.stringify({ excluded }),
      }),
  },
  manualEntry: {
    create: (input: ManualEntryInputDto) =>
      http<ManualEntryDto>("/api/manual-entry", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) => http<{ ok: true }>(`/api/manual-entry/${id}`, { method: "DELETE" }),
  },
  itinerary: {
    get: () => http<ItineraryEntryDto[]>("/api/itinerary"),
    save: (paste: string, year: number) =>
      http<{ entries: ItineraryEntryDto[]; errors: { line: number; message: string }[] }>(
        "/api/itinerary",
        { method: "POST", body: JSON.stringify({ paste, year }) },
      ),
  },
  settings: {
    get: () => http<SettingsDto>("/api/settings"),
    patch: (body: Partial<SettingsDto>) =>
      http<{ ok: true }>("/api/settings", { method: "PATCH", body: JSON.stringify(body) }),
  },
  setup: {
    status: () => http<{ hasPat: boolean; hasWebhook: boolean }>("/api/setup"),
    run: () =>
      http<{ hasWebhook: boolean; registered: boolean }>("/api/setup", {
        method: "POST",
        body: "{}",
      }),
  },
};

export interface TripDto {
  id: number;
  name: string;
  startDate: string;
  endDate: string | null;
  budgetAudCents: number;
  isActive: boolean;
  createdAt: number;
  archivedAt: number | null;
}
export interface TripCreateInput {
  name: string;
  startDate: string;
  endDate: string | null;
  budgetAudCents: number;
}
export interface CategoryRow {
  categoryKey: string;
  spent: number;
  target: number | null;
  pct: number | null;
}
export interface CityGroup {
  label: string;
  spent: number;
}
export interface RecentTxn {
  id: string;
  occurredAt: number;
  amountAudCents: number;
  description: string;
  upCategoryParent: string | null;
  foreignAmount: number | null;
  foreignCurrency: string | null;
  isAtm: boolean;
  source: "up" | "manual";
}
export interface DashboardPayload {
  trip: {
    id: number;
    name: string;
    startDate: string;
    endDate: string | null;
    budgetAudCents: number;
  };
  spent: number;
  remaining: number;
  daysElapsed: number;
  daysLeft: number;
  dailyAllowance: number;
  paceDelta: number;
  todaySpent: number;
  byCategory: CategoryRow[];
  byCity: CityGroup[];
  cashOnHand: number;
  trend: { date: string; spent: number }[];
  recent: RecentTxn[];
}
export interface ManualEntryInputDto {
  amountAudCents: number;
  foreignAmount: number | null;
  foreignCurrency: string | null;
  occurredAt: number;
  description: string;
  category: string;
  countsAsSpend: boolean;
}
export interface ManualEntryDto {
  id: string;
  amountAudCents: number;
  foreignAmount: number | null;
  foreignCurrency: string | null;
  countsAsSpend: boolean;
}
export interface ItineraryEntryDto {
  id?: number;
  tripId?: number;
  startDate: string;
  endDate: string;
  city: string;
  country: string;
}
export interface SettingsDto {
  startDate: string;
  endDate: string | null;
  budgetAudCents: number;
  categoryTargets: Record<string, number>;
}
