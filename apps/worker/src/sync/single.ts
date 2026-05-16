import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { UpTransactionSchema } from "@up-travel/shared";
import { transactions, trips } from "../db/schema";
import { classifyUpTransaction } from "./classify";
import type { UpClient } from "../up/client";

export interface SyncSingleDeps {
  db: D1Database;
  up: UpClient;
  txnId: string;
}

export async function syncSingle(deps: SyncSingleDeps): Promise<void> {
  const db = drizzle(deps.db);
  const [trip] = await db.select().from(trips).where(eq(trips.isActive, 1));
  if (!trip) return;
  const raw = await deps.up.getTransaction(deps.txnId);
  const t = UpTransactionSchema.parse(raw);
  const spendingAccountId = await deps.up.getSpendingAccountId();
  const c = classifyUpTransaction(raw, { spendingAccountId });
  if (!c.belongsToSpending) return;
  const occurredAt = Date.parse(t.attributes.createdAt);
  const foreignAmount = t.attributes.foreignAmount?.valueInBaseUnits ?? null;
  const values = {
    id: t.id,
    tripId: trip.id,
    source: "up" as const,
    occurredAt,
    amountAudCents: t.attributes.amount.valueInBaseUnits,
    foreignAmount: foreignAmount !== null ? String(foreignAmount) : null,
    foreignCurrency: t.attributes.foreignAmount?.currencyCode ?? null,
    description: t.attributes.description,
    upCategoryParent: t.relationships.parentCategory.data?.id ?? null,
    upCategoryChild: t.relationships.category.data?.id ?? null,
    isTransfer: c.isTransfer ? 1 : 0,
    isAtm: c.isAtm ? 1 : 0,
    countsAsSpend: 1,
    raw: JSON.stringify(raw),
    syncedAt: Date.now(),
  };
  await db.insert(transactions).values(values).onConflictDoUpdate({
    target: transactions.id, set: values,
  });
}
