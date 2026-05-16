import { aud } from "../../lib/format";
import type { CityGroup } from "../../lib/api";
export function CityStack({ groups }: { groups: CityGroup[] }) {
  const total = groups.reduce((s, g) => s + g.spent, 0) || 1;
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">By city</div>
      <ul className="mt-3 space-y-2">
        {groups.map((g) => (
          <li key={g.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span>{g.label}</span>
              <span className="tabular-nums text-slate-400">{aud(g.spent)}</span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-slate-800">
              <div
                className="h-full rounded bg-sky-500"
                style={{ width: `${(g.spent / total) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
