import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { aud, isoDay } from "../../lib/format";
import { api, type RecentTxn } from "../../lib/api";

export function TxnRow({ t }: { t: RecentTxn }) {
  const [excluded, setExcluded] = useState(t.excluded);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.transactions.exclude(t.id, !excluded),
    onSuccess: () => {
      setExcluded(!excluded);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  return (
    <li className={`flex items-center justify-between gap-3 py-2 ${excluded ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <div className="truncate text-sm">{t.description}</div>
        <div className="text-xs text-slate-500">
          {isoDay(t.occurredAt)} · {t.upCategoryParent ?? (t.isAtm ? "cash" : "other")}
          {t.foreignCurrency ? ` · ${t.foreignCurrency}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-sm">{aud(Math.abs(t.amountAudCents))}</span>
        <button
          onClick={() => m.mutate()}
          className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          {excluded ? "Include" : "Exclude"}
        </button>
      </div>
    </li>
  );
}
