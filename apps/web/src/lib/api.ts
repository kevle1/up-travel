import type {
  BurnState, Trip, TripCreate, TripPatch, Stay, StayCreate, StayPatch,
  TransactionPatch, ManualSpendCreate,
} from "@up-travel/shared";

export class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`${status}: ${body}`);
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new HttpError(res.status, await res.text());
  return (await res.json()) as T;
}

export interface AuthMe {
  authed: boolean;
  setupRequired: boolean;
}

export const api = {
  health: () => http<{ ok: boolean }>("/api/health"),
  auth: {
    me: () => http<AuthMe>("/api/auth/me"),
    login: (password: string) =>
      http<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
    logout: () =>
      http<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  },
  setup: {
    init: (password: string, upToken: string) =>
      http<{ ok: true }>("/api/setup", {
        method: "POST", body: JSON.stringify({ password, upToken }),
      }),
    reset: () =>
      http<{ ok: true }>("/api/setup/reset", { method: "POST" }),
  },
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
    create: (body: ManualSpendCreate) =>
      http<{ id: string }>("/api/transactions", { method: "POST", body: JSON.stringify(body) }),
    patch: (id: string, body: TransactionPatch) =>
      http<{ ok: true }>(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    /** Manual spends only - the API rejects Up-sourced rows. */
    remove: (id: string) =>
      http<{ ok: true }>(`/api/transactions/${id}`, { method: "DELETE" }),
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
