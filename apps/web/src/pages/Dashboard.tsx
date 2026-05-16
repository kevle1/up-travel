import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { aud } from "../lib/format";
import { PaceCard } from "../components/widgets/PaceCard";
import { AllowanceCard } from "../components/widgets/AllowanceCard";
import { TodayCard } from "../components/widgets/TodayCard";
import { CategoryBars } from "../components/widgets/CategoryBars";
import { CityStack } from "../components/widgets/CityStack";
import { TrendChart } from "../components/widgets/TrendChart";
import { TxnRow } from "../components/widgets/TxnRow";
import { ManualEntryFab } from "../components/widgets/ManualEntryFab";

export function Dashboard() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
    refetchInterval: 60_000,
  });
  if (q.isLoading) return <div className="text-slate-400">Loading…</div>;
  if (q.error || !q.data) return <div className="text-rose-400">Error loading dashboard</div>;
  const d = q.data;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PaceCard paceDelta={d.paceDelta} remaining={d.remaining} />
        <AllowanceCard allowance={d.dailyAllowance} daysLeft={d.daysLeft} />
        <TodayCard todaySpent={d.todaySpent} allowance={d.dailyAllowance} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3">
        <TrendChart data={d.trend} />
        <CategoryBars rows={d.byCategory} />
        <CityStack groups={d.byCity} />
        <div className="rounded-2xl bg-slate-900 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Cash on hand</div>
          <div className="mt-1 text-2xl font-semibold">{aud(d.cashOnHand)}</div>
        </div>
        <div className="rounded-2xl bg-slate-900 p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500">Recent</div>
          <ul className="mt-3 divide-y divide-slate-800">
            {d.recent.map((t) => (
              <TxnRow key={t.id} t={t} />
            ))}
          </ul>
        </div>
      </div>
      <ManualEntryFab />
    </>
  );
}
