import { useQuery } from "@tanstack/react-query";
import { paceStatus, type BurnState } from "@up-travel/shared";
import { Card, Num, PaceBadge, StatTile, STATUS_COLOR } from "../components/ui";
import { CatList } from "../components/CatList";
import { CategoryIcon } from "../components/CategoryIcon";
import { Sparkline } from "../components/charts";
import { TripHeader } from "./_TripHeader";
import { api } from "../lib/api";
import { dayLabel, money0, relTime, signed } from "../lib/format";

export function Today({ burn }: { burn: BurnState }) {
  if (burn.isComplete) return <TripSummary burn={burn} />;

  const bankedPos = burn.banked >= 0;
  const lvlToday = paceStatus(burn.todayBurn, burn.target);
  const lvl7 = paceStatus(burn.avg7, burn.target);
  const last30 = burn.series.slice(-30);
  const runwayOk = burn.runwayDays != null && burn.runwayDays >= burn.daysLeft;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TripHeader burn={burn} />

      <div style={{ display: "flex", gap: 12 }}>
        <Card pad={16} style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Today so far</div>
          <Num style={{ fontSize: 34, fontWeight: 600, color: STATUS_COLOR[lvlToday], display: "block", marginTop: 4, letterSpacing: "-.02em" }}>{money0(burn.todayBurn)}</Num>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>of {money0(burn.target)}</div>
          <div style={{ marginTop: 9 }}><PaceBadge level={lvlToday} /></div>
        </Card>
        <Card pad={16} style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>7-day avg</div>
          <Num style={{ fontSize: 34, fontWeight: 600, color: STATUS_COLOR[lvl7], display: "block", marginTop: 4, letterSpacing: "-.02em" }}>{money0(burn.avg7)}</Num>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>vs {money0(burn.target)}</div>
          <div style={{ marginTop: 9 }}><PaceBadge level={lvl7} /></div>
        </Card>
      </div>

      <YesterdayNote burn={burn} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatTile
          label={bankedPos ? "Banked vs pace" : "Behind pace"}
          value={signed(burn.banked)}
          color={bankedPos ? "var(--good)" : "var(--over)"}
          sub={`${money0(burn.target)}/day line`}
        />
        {/* Off-pace spend leaves the day chart and the category breakdown, so
            without this line it would be invisible everywhere but the feed -
            even though it's already been taken off the budget. */}
        <StatTile
          label="Budget left"
          value={money0(burn.budgetLeft)}
          sub={burn.offPaceTotal > 0
            ? `of ${money0(burn.budget)} · ${money0(burn.offPaceTotal)} off pace`
            : `of ${money0(burn.budget)}`}
        />
      </div>

      <Card pad={16}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Where it's going</span>
          <Num style={{ fontSize: 12, color: "var(--ink-3)" }}>today · {money0(burn.todayRow.total)}</Num>
        </div>
        <CatList
          items={burn.catBreakdownToday.items}
          total={burn.catBreakdownToday.total}
          emptyNote="Nothing spent yet today. Tap Spend to log cash, or your card spend will appear here."
        />
      </Card>

      <Card pad={16}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Last 30 days</span>
          <Num style={{ fontSize: 12, color: "var(--ink-3)" }}>avg {money0(burn.avg30)}/day</Num>
        </div>
        <Sparkline data={last30} target={burn.target} height={48} color="var(--accent)" />
      </Card>

      <Card pad={16}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Money runway</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.4 }}>
              At {money0(burn.avgAll)}/day, your {money0(burn.budgetLeft)} lasts
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Num style={{ fontSize: 26, fontWeight: 600, color: runwayOk ? "var(--good)" : "var(--over)" }}>
              {burn.runwayDays ?? "∞"}
            </Num>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>days · need {burn.daysLeft}</div>
          </div>
        </div>
        {burn.runwayDays != null && (
          <div style={{ marginTop: 12, height: 8, borderRadius: 99, background: "var(--chip)", overflow: "hidden", position: "relative" }}>
            <div style={{
              position: "absolute", inset: 0,
              width: `${Math.min(100, burn.runwayDays > 0 ? (burn.daysLeft / burn.runwayDays) * 100 : 100)}%`,
              background: runwayOk ? "var(--good)" : "var(--over)", borderRadius: 99,
            }} />
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 9 }}>
          On current pace you'll finish with{" "}
          <Num style={{ fontWeight: 600, color: burn.projectedEnd >= 0 ? "var(--good)" : "var(--over)" }}>
            {signed(burn.projectedEnd)}
          </Num>
        </div>
      </Card>

      <LastSynced />
    </div>
  );
}

// A one-glance recap of the day just gone. It sits under the two headline
// tiles because early in the day "today so far" is nearly empty and yesterday
// is the number that actually tells you how you're travelling. Hidden on the
// trip's first day, when there is no day before it.
function YesterdayNote({ burn }: { burn: BurnState }) {
  const row = burn.yesterdayRow;
  if (!row) return null;

  const spent = row.total;
  const label = dayLabel(row.date);
  const top = burn.catBreakdownYesterday?.items[0];
  const lvl = paceStatus(spent, burn.target);
  const diff = burn.target - spent;

  return (
    <Card pad={14}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: top ? `${top.color}1f` : "var(--chip)",
          color: top ? top.color : "var(--ink-3)",
        }}>
          <CategoryIcon cat={top?.cat ?? "other"} size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {spent > 0 ? (
            <>
              <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                {label} you spent{" "}
                <Num style={{ fontWeight: 700, color: STATUS_COLOR[lvl] }}>{money0(spent)}</Num>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                {diff >= 0
                  ? `${money0(diff)} under your ${money0(burn.target)} target`
                  : `${money0(-diff)} over your ${money0(burn.target)} target`}
                {top && ` · mostly ${top.label}`}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13.5, color: "var(--ink-2)" }}>
                Nothing recorded {label.toLowerCase()}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                A free day, or spend you still need to log
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function LastSynced() {
  // Polls every 30s so the relative label drifts forwards while the user is
  // looking at it.
  const { data } = useQuery({
    queryKey: ["sync", "status"],
    queryFn: api.sync.status,
    refetchInterval: 30_000,
  });
  const text = data?.lastError
    ? `Last sync failed · ${relTime(data.lastRun)}`
    : `Last synced ${relTime(data?.lastRun ?? null)}`;
  return (
    <div style={{
      fontSize: 11.5, color: data?.lastError ? "var(--over)" : "var(--ink-3)",
      textAlign: "center", padding: "4px 0 8px",
    }}>{text}</div>
  );
}

function TripSummary({ burn }: { burn: BurnState }) {
  const overBudget = burn.finalEnd < 0;
  const lvl = paceStatus(burn.avgAll, burn.target);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <TripHeader burn={burn} />
      <Card pad={20}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>How it went · avg / day</span>
          <PaceBadge level={lvl} label={lvl === "good" ? "Under target" : lvl === "watch" ? "On target" : "Over target"} />
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
          <Num style={{ fontSize: 52, fontWeight: 600, letterSpacing: "-.03em", color: STATUS_COLOR[lvl], lineHeight: 0.95 }}>{money0(burn.avgAll)}</Num>
          <span style={{ fontSize: 18, color: "var(--ink-3)", fontWeight: 500 }}>/day</span>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 7 }}>
          {burn.avgAll <= burn.target
            ? <>{money0(burn.target - burn.avgAll)} under your {money0(burn.target)} target, every day</>
            : <span style={{ color: "var(--over)" }}>{money0(burn.avgAll - burn.target)} over your {money0(burn.target)} target, every day</span>}
        </div>
        <div style={{ display: "flex", marginTop: 16, borderTop: "0.5px solid var(--line)", paddingTop: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>TOTAL SPENT</div>
            <Num style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{money0(burn.cumulative)}</Num>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>of {money0(burn.budget)}</div>
          </div>
          <div style={{ width: "0.5px", background: "var(--line)" }} />
          <div style={{ flex: 1, paddingLeft: 16 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600 }}>{overBudget ? "OVER BUDGET" : "CAME IN UNDER"}</div>
            <Num style={{ fontSize: 20, fontWeight: 600, color: overBudget ? "var(--over)" : "var(--good)" }}>{signed(burn.finalEnd)}</Num>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>across {burn.plannedDays} days</div>
          </div>
        </div>
      </Card>

      <Card pad={16}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Daily burn · whole trip</span>
          <Num style={{ fontSize: 12, color: "var(--ink-3)" }}>avg {money0(burn.avgAll)}/day</Num>
        </div>
        <Sparkline data={burn.series} target={burn.target} height={48} color="var(--accent)" />
      </Card>

      <Card pad={16}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Where it went</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>whole trip</span>
        </div>
        <CatList items={burn.catBreakdownByWindow.all.items} total={burn.catBreakdownByWindow.all.total} limit={8} />
      </Card>
    </div>
  );
}
