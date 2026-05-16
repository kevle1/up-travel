import { aud } from "../../lib/format";
export function AllowanceCard({ allowance, daysLeft }: { allowance: number; daysLeft: number }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">Daily allowance</div>
      <div className="mt-1 text-3xl font-semibold">{aud(allowance)}</div>
      <div className="mt-1 text-sm text-slate-400">for the next {daysLeft} days</div>
    </div>
  );
}
