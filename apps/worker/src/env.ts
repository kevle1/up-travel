export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  UP_API_BASE: string;
  // Optional override. Setup writes a generated key to KV; this env value
  // takes precedence if set.
  AUTH_COOKIE_SECRET?: string;
}
