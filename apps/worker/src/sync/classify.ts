import { UpTransactionSchema, type UpTransaction } from "@up-travel/shared";

export interface Classification {
  belongsToSpending: boolean;
  isTransfer: boolean;
  isAtm: boolean;
}

export interface ClassifyOpts {
  spendingAccountId?: string;
}

const ATM_DESC = /\b(ATM|cash\s*withdrawal)\b/i;

export function classifyUpTransaction(raw: unknown, opts: ClassifyOpts = {}): Classification {
  const t: UpTransaction = UpTransactionSchema.parse(raw);
  const accountId = t.relationships.account.data?.id;
  const belongsToSpending = opts.spendingAccountId
    ? accountId === opts.spendingAccountId
    : true;
  const isTransfer = t.relationships.transferAccount.data !== null;
  const childCat = t.relationships.category.data?.id ?? "";
  const isAtm =
    childCat === "cash-withdrawals" ||
    ATM_DESC.test(t.attributes.rawText ?? "") ||
    ATM_DESC.test(t.attributes.description);
  return { belongsToSpending, isTransfer, isAtm };
}
