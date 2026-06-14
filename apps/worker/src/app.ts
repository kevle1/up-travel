import { Hono } from "hono";
import type { Env } from "./env";
import { tripsRouter } from "./routes/trips";
import { transactionsRouter } from "./routes/transactions";
import { burnRouter } from "./routes/burn";
import { staysRouter } from "./routes/stays";
import { cashLogsRouter } from "./routes/cash-logs";
import { syncRouter } from "./routes/sync";

export const app = new Hono<{ Bindings: Env }>();
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/trips", tripsRouter);
app.route("/api/transactions", transactionsRouter);
app.route("/api/burn", burnRouter);
app.route("/api/stays", staysRouter);
app.route("/api/cash-logs", cashLogsRouter);
app.route("/api/sync", syncRouter);
