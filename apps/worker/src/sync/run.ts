import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { UpTransactionSchema, upMoneyToMajor } from "@up-travel/shared";
import { transactions, trips } from "../db/schema";
import { buildCityLookup } from "../db/city-lookup";
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
  const cityOf = await buildCityLookup(d1, tripId);

  let processed = 0;
  let latest = watermark;

  for await (const raw of up.listTransactionsSince(watermark)) {
    const t = UpTransactionSchema.parse(raw);
    const c = classifyUpTransaction(raw, { spendingAccountId });
    if (!c.belongsToSpending) continue;

    const occurredAt = Date.parse(t.attributes.createdAt);
    // Store the foreign side as the signed major-unit decimal (e.g. -142.30),
    // matching the user-facing semantics. amountAudCents stays as base units.
    // upMoneyToMajor() reads Up's integer base-units field rather than its
    // formatted `value` string - see the note on that function for why.
    const foreignAmount = t.attributes.foreignAmount
      ? upMoneyToMajor(t.attributes.foreignAmount)
      : null;
    // Currency travels with the amount: if we couldn't read a number, the row
    // has no foreign side at all rather than a currency labelling nothing.
    const foreignCurrency = foreignAmount === null
      ? null
      : t.attributes.foreignAmount?.currencyCode ?? null;
    const method = c.isAtm ? "ATM" : t.attributes.cardPurchaseMethod?.method ?? null;

    const values = {
      id: t.id,
      tripId,
      source: "up" as const,
      occurredAt,
      amountAudCents: t.attributes.amount.valueInBaseUnits,
      foreignAmount: foreignAmount !== null ? String(foreignAmount) : null,
      foreignCurrency,
      description: t.attributes.description,
      upCategoryParent: t.relationships.parentCategory.data?.id ?? null,
      upCategoryChild: t.relationships.category.data?.id ?? null,
      cardPurchaseMethod: method,
      city: cityOf(occurredAt),
      isTransfer: c.isTransfer ? 1 : 0,
      isAtm: c.isAtm ? 1 : 0,
      raw: JSON.stringify(raw),
      syncedAt: now(),
    };
    await db.insert(transactions).values(values).onConflictDoUpdate({
      target: transactions.id, set: values,
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
