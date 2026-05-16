import { Hono } from "hono";
import type { Env } from "./env";
import { tripsRouter } from "./routes/trips";
import { transactionsRouter } from "./routes/transactions";
import { dashboardRouter } from "./routes/dashboard";

export const app = new Hono<{ Bindings: Env }>();
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/trips", tripsRouter);
app.route("/api/transactions", transactionsRouter);
app.route("/api/dashboard", dashboardRouter);
