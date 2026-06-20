import schemaStatements from "./schema.sql.mjs";

// Per-isolate guard. The schema check is one extra round-trip to D1 on the
// first request after a cold start; subsequent requests in the same isolate
// short-circuit at the `ensured` flag.
let ensured = false;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (ensured) return;
  for (const sql of schemaStatements) {
    await db.prepare(sql).run();
  }
  ensured = true;
}
