import { Hono } from "hono";
import type { Env } from "./env";
import { tripsRouter } from "./routes/trips";
import { transactionsRouter } from "./routes/transactions";
import { dashboardRouter } from "./routes/dashboard";
import { manualEntryRouter } from "./routes/manual-entry";
import { itineraryRouter } from "./routes/itinerary";
import { settingsRouter } from "./routes/settings";

export const app = new Hono<{ Bindings: Env }>();
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/trips", tripsRouter);
app.route("/api/transactions", transactionsRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/manual-entry", manualEntryRouter);
app.route("/api/itinerary", itineraryRouter);
app.route("/api/settings", settingsRouter);
