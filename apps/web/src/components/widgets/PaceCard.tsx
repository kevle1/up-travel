import { audSigned } from "../../lib/format";
export function PaceCard({ paceDelta, remaining }: { paceDelta: number; remaining: number }) {
  const underTarget = paceDelta < 0;
  const label = underTarget ? "Under target" : paceDelta === 0 ? "On target" : "Over target";
  const colour = underTarget
    ? "text-emerald-400"
    : paceDelta === 0
      ? "text-slate-200"
      : "text-rose-400";
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">Pace</div>
      <div className={`mt-1 text-3xl font-semibold ${colour}`}>{label}</div>
      <div className="mt-1 text-sm text-slate-400">
        {audSigned(Math.round(paceDelta))}/day vs target
      </div>
      <div className="mt-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
        Remaining <span className="font-medium text-slate-200">{audSigned(remaining)}</span>
      </div>
    </div>
  );
}
