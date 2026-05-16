import { app } from "./app";
import type { Env } from "./env";

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, _env: Env): Promise<void> {
    // implemented in Task 22
  },
};
