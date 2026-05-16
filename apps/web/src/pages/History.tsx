import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { aud } from "../lib/format";

export function History() {
  const q = useQuery({ queryKey: ["trips"], queryFn: api.trips.list });
  const archived = (q.data ?? []).filter((t) => t.archivedAt !== null);
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <h2 className="text-sm uppercase tracking-wide text-slate-500">Archived trips</h2>
      <ul className="mt-3 divide-y divide-slate-800">
        {archived.length === 0 && <li className="py-2 text-slate-400">No archived trips yet.</li>}
        {archived.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-2">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-slate-500">
                {t.startDate} → {t.endDate ?? "—"} · {aud(t.budgetAudCents)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
