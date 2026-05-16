import { aud } from "../../lib/format";
export function TodayCard({ todaySpent, allowance }: { todaySpent: number; allowance: number }) {
  const remaining = allowance - todaySpent;
  const over = remaining < 0;
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">Today</div>
      <div className="mt-1 text-3xl font-semibold">{aud(todaySpent)}</div>
      <div className={`mt-1 text-sm ${over ? "text-rose-400" : "text-emerald-400"}`}>
        {over ? `${aud(Math.abs(remaining))} over allowance` : `${aud(remaining)} left today`}
      </div>
    </div>
  );
}
