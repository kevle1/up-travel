import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { aud } from "../lib/format";

export function Trips() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["trips"], queryFn: api.trips.list });
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [budget, setBudget] = useState("80000");

  const create = useMutation({
    mutationFn: () =>
      api.trips.create({
        name,
        startDate,
        endDate: endDate === "" ? null : endDate,
        budgetAudCents: Math.round(Number(budget) * 100),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      setName("");
      setStartDate("");
      setEndDate("");
    },
  });

  const activate = useMutation({
    mutationFn: (id: number) => api.trips.activate(id),
    onSuccess: () => qc.invalidateQueries(),
  });

  const archive = useMutation({
    mutationFn: (id: number) => api.trips.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-slate-500">New trip</h2>
        <input
          className="w-full rounded bg-slate-800 px-3 py-2"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          placeholder="Budget (AUD)"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          inputMode="decimal"
        />
        <button
          onClick={() => create.mutate()}
          disabled={!name || !startDate}
          className="rounded bg-emerald-500 px-3 py-2 text-slate-950 disabled:opacity-50"
        >
          Create
        </button>
      </section>

      <section className="rounded-2xl bg-slate-900 p-5">
        <h2 className="text-sm uppercase tracking-wide text-slate-500">Trips</h2>
        <ul className="mt-3 divide-y divide-slate-800">
          {(q.data ?? []).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <div className="font-medium">
                  {t.name}{" "}
                  {t.isActive && (
                    <span className="ml-2 rounded bg-emerald-500/20 px-2 text-xs text-emerald-300">
                      active
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {t.startDate} → {t.endDate ?? "open"} · {aud(t.budgetAudCents)}
                </div>
              </div>
              <div className="flex gap-2">
                {!t.isActive && (
                  <button
                    onClick={() => activate.mutate(t.id)}
                    className="rounded border border-slate-700 px-2 py-1 text-xs"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => archive.mutate(t.id)}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400"
                >
                  Archive
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
