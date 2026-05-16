// Import SQL files at build time via Vite's ?raw suffix.
// This runs inside the vitest-pool-workers Workers runtime where Node fs is not available.
// Vite resolves the ?raw imports at transform time (in Node), so the SQL text
// is embedded as a string constant and no fs calls happen at runtime.

// @ts-expect-error — Vite ?raw imports are not typed by default
import migration0001 from "../../migrations/0001_initial.sql?raw";

const migrations: string[] = [migration0001 as string];

export async function applyMigrations(db: D1Database): Promise<void> {
  for (const sql of migrations) {
    // Drizzle migrations use `--> statement-breakpoint` as separator between DDL statements
    const statements = sql
      .split(/--> statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await db.exec(stmt.replace(/\n/g, " "));
    }
  }
}
