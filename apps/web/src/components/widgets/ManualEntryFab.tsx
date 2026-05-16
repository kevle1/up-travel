import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

const CATEGORIES = ["good-life", "personal", "home", "transport"];

export function ManualEntryFab() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState("AUD");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("good-life");
  const [counts, setCounts] = useState(false);
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: async () => {
      const n = Math.round(Number(amount) * 100);
      if (currency === "AUD") {
        return api.manualEntry.create({
          amountAudCents: -Math.abs(n),
          foreignAmount: null,
          foreignCurrency: null,
          occurredAt: Date.now(),
          description,
          category,
          countsAsSpend: counts,
        });
      }
      return api.manualEntry.create({
        amountAudCents: 0,
        foreignAmount: -Math.abs(n),
        foreignCurrency: currency,
        occurredAt: Date.now(),
        description,
        category,
        countsAsSpend: counts,
      });
    },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setAmount("0");
      setDescription("");
    },
  });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-20 h-14 w-14 rounded-full bg-emerald-500 text-2xl text-slate-950 shadow-lg"
        aria-label="Add manual cash"
      >
        +
      </button>
      {open && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/60 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-2xl bg-slate-900 p-5 sm:max-w-md sm:rounded-2xl">
            <h2 className="text-lg font-semibold">Add cash</h2>
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <input
                  className="w-full rounded bg-slate-800 px-3 py-2"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  inputMode="decimal"
                />
                <select
                  className="rounded bg-slate-800 px-2 py-2"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  {[
                    "AUD",
                    "JPY",
                    "THB",
                    "EUR",
                    "USD",
                    "GBP",
                    "IDR",
                    "VND",
                    "SGD",
                    "KRW",
                    "HKD",
                    "TWD",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <input
                className="w-full rounded bg-slate-800 px-3 py-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
              />
              <select
                className="w-full rounded bg-slate-800 px-3 py-2"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={counts}
                  onChange={(e) => setCounts(e.target.checked)}
                />
                Count as additional spend (not from a tracked ATM withdrawal)
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setOpen(false)} className="px-3 py-2 text-slate-400">
                  Cancel
                </button>
                <button
                  onClick={() => m.mutate()}
                  className="rounded bg-emerald-500 px-3 py-2 text-slate-950"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
