import { z } from "zod";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const IsoCountry = z.string().regex(/^[A-Z]{2}$/, "must be ISO 3166-1 alpha-2");

export const TripSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  startDate: IsoDate,
  endDate: IsoDate.nullable(),
  budgetAudCents: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.number().int(),
  archivedAt: z.number().int().nullable(),
});
export type Trip = z.infer<typeof TripSchema>;

const ForeignPair = z
  .object({
    foreignAmount: z.number().nullable(),
    foreignCurrency: z.string().length(3).nullable(),
  })
  .refine(
    (v) =>
      (v.foreignAmount === null && v.foreignCurrency === null) ||
      (v.foreignAmount !== null && v.foreignCurrency !== null),
    { message: "foreignAmount and foreignCurrency must both be set or both null" },
  );

export const TransactionSchema = z
  .object({
    id: z.string().min(1),
    tripId: z.number().int(),
    source: z.enum(["up", "manual"]),
    occurredAt: z.number().int(),
    amountAudCents: z.number().int(),
    description: z.string(),
    upCategoryParent: z.string().nullable(),
    upCategoryChild: z.string().nullable(),
    isTransfer: z.boolean(),
    isAtm: z.boolean(),
    countsAsSpend: z.boolean(),
    raw: z.unknown().nullable(),
    syncedAt: z.number().int(),
  })
  .and(ForeignPair);
export type Transaction = z.infer<typeof TransactionSchema>;

export const ItineraryEntrySchema = z
  .object({
    id: z.number().int(),
    tripId: z.number().int(),
    startDate: IsoDate,
    endDate: IsoDate,
    city: z.string().min(1),
    country: IsoCountry,
  })
  .refine((v) => v.endDate >= v.startDate, "endDate must be >= startDate");
export type ItineraryEntry = z.infer<typeof ItineraryEntrySchema>;

export const ManualEntryInputSchema = z
  .object({
    amountAudCents: z.number().int(),
    foreignAmount: z.number().nullable(),
    foreignCurrency: z.string().length(3).nullable(),
    occurredAt: z.number().int(),
    description: z.string().min(1),
    category: z.string().min(1),
    countsAsSpend: z.boolean(),
  })
  .and(ForeignPair);
export type ManualEntryInput = z.infer<typeof ManualEntryInputSchema>;

export const CategoryBudgetSchema = z.object({
  tripId: z.number().int(),
  categoryKey: z.string().min(1),
  targetAudCents: z.number().int().nonnegative(),
});
export type CategoryBudget = z.infer<typeof CategoryBudgetSchema>;

const UpMoney = z.object({
  value: z.string(),
  valueInBaseUnits: z.number().int(),
  currencyCode: z.string().length(3),
});

const UpRel = z.object({
  data: z.object({ id: z.string(), type: z.string() }).nullable(),
});

export const UpTransactionSchema = z.object({
  id: z.string(),
  attributes: z.object({
    status: z.enum(["HELD", "SETTLED"]),
    rawText: z.string().nullable(),
    description: z.string(),
    amount: UpMoney,
    foreignAmount: UpMoney.nullable(),
    createdAt: z.string(),
  }),
  relationships: z.object({
    account: UpRel,
    category: UpRel,
    parentCategory: UpRel,
    transferAccount: UpRel,
  }),
});
export type UpTransaction = z.infer<typeof UpTransactionSchema>;

export const TransactionOverrideSchema = z.object({
  txnId: z.string(),
  tripId: z.number().int(),
  excluded: z.boolean(),
  notes: z.string().nullable(),
});
export type TransactionOverride = z.infer<typeof TransactionOverrideSchema>;
