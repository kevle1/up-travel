import { aud } from "../../lib/format";
import type { CategoryRow } from "../../lib/api";

export function CategoryBars({ rows }: { rows: CategoryRow[] }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">By category</div>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => {
          const pct = r.pct ?? null;
          return (
            <li key={r.categoryKey}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{r.categoryKey}</span>
                <span className="tabular-nums text-slate-400">
                  {aud(r.spent)}
                  {r.target ? ` / ${aud(r.target)}` : ""}
                </span>
              </div>
              {r.target ? (
                <div className="mt-1 h-2 rounded bg-slate-800">
                  <div
                    className={`h-full rounded ${pct !== null && pct > 1 ? "bg-rose-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(100, Math.round((pct ?? 0) * 100))}%` }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
