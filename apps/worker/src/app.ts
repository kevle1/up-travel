import { Hono } from "hono";
import type { Env } from "./env";
import { authMiddleware } from "./auth/middleware";
import { ensureSchema } from "./db/migrate";
import { authRouter } from "./routes/auth";
import { setupRouter } from "./routes/setup";
import { tripsRouter } from "./routes/trips";
import { transactionsRouter } from "./routes/transactions";
import { burnRouter } from "./routes/burn";
import { staysRouter } from "./routes/stays";
import { cashLogsRouter } from "./routes/cash-logs";
import { syncRouter } from "./routes/sync";

export const app = new Hono<{ Bindings: Env }>();

// First request after a cold start runs the idempotent schema bootstrap.
// Cheap because subsequent requests in the same isolate short-circuit on a
// module-level flag.
app.use("*", async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});

// Global auth gate. The middleware skips /api/health, /api/auth/*, and
// /api/setup; everything else needs a valid session cookie.
app.use("*", authMiddleware);

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRouter);
app.route("/api/setup", setupRouter);
app.route("/api/trips", tripsRouter);
app.route("/api/transactions", transactionsRouter);
app.route("/api/burn", burnRouter);
app.route("/api/stays", staysRouter);
app.route("/api/cash-logs", cashLogsRouter);
app.route("/api/sync", syncRouter);
