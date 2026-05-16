import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { UpTransactionSchema } from "@up-travel/shared";
import { transactions, trips } from "../db/schema";
import { classifyUpTransaction } from "./classify";
import type { UpClient } from "../up/client";

export interface RunSyncDeps {
  db: D1Database;
  kv: KVNamespace;
  up: UpClient;
  tripId: number;
  now?: () => number;
}

const watermarkKey = (tripId: number) => `sync:watermark:${tripId}`;

export async function runSync(deps: RunSyncDeps): Promise<{ processed: number }> {
  const { db: d1, kv, up, tripId } = deps;
  const now = deps.now ?? Date.now;
  const db = drizzle(d1);

  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
  if (!trip) throw new Error(`No trip ${tripId}`);

  const watermark = (await kv.get(watermarkKey(tripId))) ?? `${trip.startDate}T00:00:00Z`;
  const spendingAccountId = await up.getSpendingAccountId();

  let processed = 0;
  let latest = watermark;

  for await (const raw of up.listTransactionsSince(watermark)) {
    const t = UpTransactionSchema.parse(raw);
    const c = classifyUpTransaction(raw, { spendingAccountId });
    if (!c.belongsToSpending) continue;

    const occurredAt = Date.parse(t.attributes.createdAt);
    const foreignAmount = t.attributes.foreignAmount?.valueInBaseUnits ?? null;
    const foreignCurrency = t.attributes.foreignAmount?.currencyCode ?? null;

    await db.insert(transactions).values({
      id: t.id,
      tripId,
      source: "up",
      occurredAt,
      amountAudCents: t.attributes.amount.valueInBaseUnits,
      foreignAmount: foreignAmount !== null ? String(foreignAmount) : null,
      foreignCurrency,
      description: t.attributes.description,
      upCategoryParent: t.relationships.parentCategory.data?.id ?? null,
      upCategoryChild: t.relationships.category.data?.id ?? null,
      isTransfer: c.isTransfer ? 1 : 0,
      isAtm: c.isAtm ? 1 : 0,
      countsAsSpend: 1,
      raw: JSON.stringify(raw),
      syncedAt: now(),
    }).onConflictDoUpdate({
      target: transactions.id,
      set: {
        occurredAt,
        amountAudCents: t.attributes.amount.valueInBaseUnits,
        foreignAmount: foreignAmount !== null ? String(foreignAmount) : null,
        foreignCurrency,
        description: t.attributes.description,
        upCategoryParent: t.relationships.parentCategory.data?.id ?? null,
        upCategoryChild: t.relationships.category.data?.id ?? null,
        isTransfer: c.isTransfer ? 1 : 0,
        isAtm: c.isAtm ? 1 : 0,
        raw: JSON.stringify(raw),
        syncedAt: now(),
      },
    });

    if (t.attributes.createdAt > latest) latest = t.attributes.createdAt;
    processed++;
  }

  if (latest !== watermark) {
    await kv.put(watermarkKey(tripId), latest);
  }
  await kv.put("sync:status", JSON.stringify({ lastRun: now(), lastError: null, inProgress: false }));
  return { processed };
}
