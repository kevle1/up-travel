import type { Env } from "./env";

export default {
  async fetch(_req: Request, _env: Env): Promise<Response> {
    return new Response("up-travel worker", { status: 200 });
  },
  async scheduled(_event: ScheduledEvent, _env: Env): Promise<void> {
    // implemented in Task 22
  },
};
