import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

const CATEGORIES = ["good-life", "personal", "home", "transport", "cash"];

export function Settings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState<string>("");
  const [budget, setBudget] = useState("0");
  const [targets, setTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!q.data) return;
    setStartDate(q.data.startDate);
    setEndDate(q.data.endDate ?? "");
    setBudget((q.data.budgetAudCents / 100).toString());
    setTargets(
      Object.fromEntries(
        Object.entries(q.data.categoryTargets).map(([k, v]) => [k, String(v / 100)]),
      ),
    );
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      api.settings.patch({
        startDate,
        endDate: endDate === "" ? null : endDate,
        budgetAudCents: Math.round(Number(budget) * 100),
        categoryTargets: Object.fromEntries(
          Object.entries(targets)
            .filter(([, v]) => v !== "" && !isNaN(Number(v)))
            .map(([k, v]) => [k, Math.round(Number(v) * 100)]),
        ),
      }),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (q.isLoading) return <div className="text-slate-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-slate-500">Trip</h2>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="rounded bg-slate-800 px-3 py-2"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            className="rounded bg-slate-800 px-3 py-2"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <input
          className="w-full rounded bg-slate-800 px-3 py-2"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          inputMode="decimal"
        />
      </section>
      <section className="rounded-2xl bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-slate-500">Category targets (AUD)</h2>
        {CATEGORIES.map((cat) => (
          <div key={cat} className="flex items-center gap-3">
            <label className="w-28 text-sm">{cat}</label>
            <input
              className="flex-1 rounded bg-slate-800 px-3 py-2"
              value={targets[cat] ?? ""}
              onChange={(e) => setTargets((p) => ({ ...p, [cat]: e.target.value }))}
              placeholder="No target"
              inputMode="decimal"
            />
          </div>
        ))}
      </section>
      <button
        onClick={() => save.mutate()}
        className="rounded bg-emerald-500 px-4 py-2 text-slate-950"
      >
        Save
      </button>
    </div>
  );
}
