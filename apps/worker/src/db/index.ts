import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../env";

export function getDb(env: Env) {
  return drizzle(env.DB);
}

export * as schema from "./schema";
