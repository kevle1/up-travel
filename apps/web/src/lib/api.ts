import type {
  BurnState, Trip, TripCreate, TripPatch, Stay, StayCreate, StayPatch,
  TransactionPatch, CashLog, CashLogCreate,
} from "@up-travel/shared";

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
  burn: (tripId?: number) =>
    http<BurnState>(`/api/burn${tripId != null ? `?tripId=${tripId}` : ""}`),
  trips: {
    list: () => http<Trip[]>("/api/trips"),
    create: (body: TripCreate) =>
      http<Trip>("/api/trips", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: number, body: TripPatch) =>
      http<Trip>(`/api/trips/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    activate: (id: number) =>
      http<{ ok: true }>(`/api/trips/${id}/activate`, { method: "POST" }),
    archive: (id: number) =>
      http<{ ok: true }>(`/api/trips/${id}/archive`, { method: "POST" }),
    remove: (id: number) =>
      http<{ ok: true }>(`/api/trips/${id}`, { method: "DELETE" }),
  },
  transactions: {
    patch: (id: string, body: TransactionPatch) =>
      http<{ ok: true }>(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    resetOverride: (id: string) =>
      http<{ ok: true }>(`/api/transactions/${id}/override`, { method: "DELETE" }),
  },
  stays: {
    list: () => http<Stay[]>("/api/stays"),
    create: (body: StayCreate) =>
      http<Stay>("/api/stays", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: number, body: StayPatch) =>
      http<Stay>(`/api/stays/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: number) =>
      http<{ ok: true }>(`/api/stays/${id}`, { method: "DELETE" }),
  },
  cashLogs: {
    create: (body: CashLogCreate) =>
      http<CashLog>("/api/cash-logs", { method: "POST", body: JSON.stringify(body) }),
    remove: (id: string) =>
      http<{ ok: true }>(`/api/cash-logs/${id}`, { method: "DELETE" }),
  },
  sync: {
    run: (reset = false) =>
      http<{ ok: boolean; processed?: number; error?: string }>("/api/sync", {
        method: "POST", body: JSON.stringify({ reset }),
      }),
    status: () =>
      http<{ watermark: string | null; lastRun: number | null; lastError: string | null }>(
        "/api/sync/status",
      ),
  },
};
