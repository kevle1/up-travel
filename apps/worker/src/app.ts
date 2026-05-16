import { Hono } from "hono";
import type { Env } from "./env";
import { tripsRouter } from "./routes/trips";

export const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/trips", tripsRouter);
