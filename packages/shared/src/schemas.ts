import { z } from "zod";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// ── Trip ──────────────────────────────────────────────────────────────────────
export const TripSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  startDate: IsoDate,
  endDate: IsoDate, // every trip has a fixed end date now (the design needs it)
  budgetAudCents: z.number().int().nonnegative(),
  targetDailyAudCents: z.number().int().nonnegative(),
  currentCity: z.string(), // optional but always present (empty string when blank)
  isActive: z.boolean(),
  createdAt: z.number().int(),
  archivedAt: z.number().int().nullable(),
});
export type Trip = z.infer<typeof TripSchema>;

export const TripCreateSchema = z.object({
  name: z.string().min(1),
  startDate: IsoDate,
  endDate: IsoDate,
  budgetAudCents: z.number().int().nonnegative(),
  targetDailyAudCents: z.number().int().nonnegative().optional(),
  currentCity: z.string().optional(),
}).refine((v) => v.endDate >= v.startDate, "endDate must be >= startDate");
export type TripCreate = z.infer<typeof TripCreateSchema>;

export const TripPatchSchema = z.object({
  name: z.string().min(1).optional(),
  startDate: IsoDate.optional(),
  endDate: IsoDate.optional(),
  budgetAudCents: z.number().int().nonnegative().optional(),
  targetDailyAudCents: z.number().int().nonnegative().optional(),
  currentCity: z.string().optional(),
});
export type TripPatch = z.infer<typeof TripPatchSchema>;

// ── Payment method (manual spends only) ───────────────────────────────────────
// How a manually-logged spend was paid. Up-sourced rows leave this null and
// carry Up's own cardPurchaseMethod instead. "cash" is the only value that
// draws down the cash float.
export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", hint: "Comes out of your cash on hand" },
  { id: "card", label: "Card", hint: "A card or account Up can't see" },
  { id: "other", label: "Other", hint: "Transfer, split bill, someone else paid" },
] as const;

export const PaymentMethodSchema = z.enum(["cash", "card", "other"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export function paymentLabel(m: PaymentMethod | null | undefined): string | null {
  return m ? PAYMENT_METHODS.find((p) => p.id === m)!.label : null;
}

// ── Transaction (every spend, Up-sourced or manually logged) ──────────────────
const ForeignPair = z.object({
  foreignAmount: z.number().nullable(),
  foreignCurrency: z.string().length(3).nullable(),
}).refine(
  (v) => (v.foreignAmount === null && v.foreignCurrency === null) ||
         (v.foreignAmount !== null && v.foreignCurrency !== null),
  "foreignAmount + foreignCurrency must both be set or both null",
);

export const TransactionSchema = z.object({
  id: z.string().min(1),
  tripId: z.number().int(),
  source: z.enum(["up", "manual"]),
  occurredAt: z.number().int(),
  amountAudCents: z.number().int(), // negative = spend
  description: z.string(),
  upCategoryParent: z.string().nullable(),
  upCategoryChild: z.string().nullable(),
  cardPurchaseMethod: z.string().nullable(),
  /** Set on manually-logged spends only; null on Up-sourced rows. */
  paymentMethod: PaymentMethodSchema.nullable(),
  /** Snapshot of which city the user was in when the spend happened. Set at
   *  sync/insert time from the stay that covers the date. Null if no stay
   *  covered the day. */
  city: z.string().nullable(),
  isTransfer: z.boolean(),
  isAtm: z.boolean(),
  raw: z.unknown().nullable(),
  syncedAt: z.number().int(),
}).and(ForeignPair);
export type Transaction = z.infer<typeof TransactionSchema>;

// ── Transaction override (per-trip user edits) ────────────────────────────────
export const TransactionOverrideSchema = z.object({
  txnId: z.string(),
  tripId: z.number().int(),
  travelCategory: z.string().nullable(), // travel category id; null = use Up default
  stayId: z.number().int().nullable(),   // links this tx to a stay (accommodation)
  /** Spread this txn's amount evenly across this many days starting from its
   *  occurredAt date (e.g. a 5-day transport pass). null/1 = no spread. */
  spreadDays: z.number().int().min(1).nullable(),
  /** Only meaningful for positive-amount transactions (refunds, income).
   *  When true, the refund subtracts from that day's burn. Default false. */
  countAsCredit: z.boolean(),
  excluded: z.boolean(),
  notes: z.string().nullable(),
});
export type TransactionOverride = z.infer<typeof TransactionOverrideSchema>;

export const TransactionPatchSchema = z.object({
  travelCategory: z.string().nullable().optional(),
  stayId: z.number().int().nullable().optional(),
  spreadDays: z.number().int().min(1).nullable().optional(),
  countAsCredit: z.boolean().optional(),
  excluded: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});
export type TransactionPatch = z.infer<typeof TransactionPatchSchema>;

// ── Stay (accommodation block, amortised over its nights) ─────────────────────
export const StaySchema = z.object({
  id: z.number().int(),
  tripId: z.number().int(),
  /** Display title for the stay, e.g. "Booking.com Lisbon" or "Mum's place". */
  name: z.string().min(1),
  /** Geographic city, used for the city-by-day map and cash logger. */
  city: z.string(),
  checkIn: IsoDate,
  nights: z.number().int().positive(),
});
export type Stay = z.infer<typeof StaySchema>;

export const StayCreateSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional().default(""),
  checkIn: IsoDate,
  nights: z.number().int().positive(),
});
export type StayCreate = z.infer<typeof StayCreateSchema>;

export const StayPatchSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().optional(),
  checkIn: IsoDate.optional(),
  nights: z.number().int().positive().optional(),
});
export type StayPatch = z.infer<typeof StayPatchSchema>;

// ── Manual spend (user-entered, stored as a source:"manual" transaction) ──────
// Lands in the same table as Up's transactions so it behaves like any other
// spend: re-taggable, linkable to a stay, spreadable, excludable.
export const ManualSpendCreateSchema = z.object({
  /** Row label. Falls back to the travel category's label when blank. */
  description: z.string().max(200).optional(),
  occurredAt: z.number().int().optional(), // defaults to now in the route
  /** Magnitude in cents; stored negative to match Up's spend convention. */
  amountAudCents: z.number().int().positive(),
  foreignAmount: z.number().positive().nullable().optional(),
  foreignCurrency: z.string().length(3).nullable().optional(),
  travelCategory: z.string().optional(),
  paymentMethod: PaymentMethodSchema.optional().default("card"),
  notes: z.string().nullable().optional(),
});
export type ManualSpendCreate = z.infer<typeof ManualSpendCreateSchema>;

// ── Up Bank API shapes (used by sync + classify) ──────────────────────────────
const UpMoney = z.object({
  value: z.string(),
  valueInBaseUnits: z.number().int(),
  currencyCode: z.string().length(3),
});
const UpRel = z.object({ data: z.object({ id: z.string(), type: z.string() }).nullable() });

export const UpTransactionSchema = z.object({
  id: z.string(),
  attributes: z.object({
    status: z.enum(["HELD", "SETTLED"]),
    rawText: z.string().nullable(),
    description: z.string(),
    message: z.string().nullable().optional(),
    amount: UpMoney,
    foreignAmount: UpMoney.nullable(),
    cardPurchaseMethod: z.object({
      method: z.string(),
      cardNumberSuffix: z.string().nullable().optional(),
    }).nullable().optional(),
    createdAt: z.string(),
    settledAt: z.string().nullable().optional(),
  }),
  relationships: z.object({
    account: UpRel,
    category: UpRel,
    parentCategory: UpRel,
    transferAccount: UpRel,
  }),
});
export type UpTransaction = z.infer<typeof UpTransactionSchema>;
