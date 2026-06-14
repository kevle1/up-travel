import { useMemo, useState } from "react";
import { travelColor, type BurnState, type CatWindow } from "@up-travel/shared";
import { Card, Num, RangeTabs, SectionLabel } from "../components/ui";
import { CatList } from "../components/CatList";
import { CategoryIcon } from "../components/CategoryIcon";
import { BurnChart, type ChartStyle } from "../components/charts";
import { fmtDate, fmtForeign, fmtMethod, money0 } from "../lib/format";

const RANGE_OPTIONS: { value: CatWindow; label: string }[] = [
  { value: "3", label: "3d" },
  { value: "7", label: "7d" },
  { value: "14", label: "14d" },
  { value: "30", label: "30d" },
  { value: "all", label: "All" },
];

export function Trends({ burn, chartStyle }: { burn: BurnState; chartStyle: ChartStyle }) {
  const [win, setWin] = useState<CatWindow>("7");
  const [catRange, setCatRange] = useState<CatWindow>("7");
  const data = useMemo(
    () => win === "all" ? burn.series : burn.series.slice(-Number(win)),
    [burn.series, win],
  );
  const avg = Math.round(data.reduce((a, r) => a + r.total, 0) / Math.max(1, data.length));
  const overDays = data.filter((d) => d.total > burn.target).length;
  const peak = data.reduce<{ total: number }>((m, d) => (d.total > m.total ? d : m), { total: 0 });
  const catView = burn.catBreakdownByWindow[catRange];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel action={
        <RangeTabs<CatWindow> value={win} onChange={setWin} options={RANGE_OPTIONS} />
      }>Daily burn</SectionLabel>
      <Card pad={16}>
        <BurnChart data={data} target={burn.target} mode={chartStyle} height={190} avgLine={avg} />
        <div style={{ display: "flex", marginTop: 12, borderTop: "0.5px solid var(--line)", paddingTop: 12 }}>
          {[["Avg", `${money0(avg)}/day`], ["Over target", `${overDays} days`], ["Peak", money0(peak.total)]].map(([l, v], i) => (
            <div key={i} style={{ flex: 1, textAlign: i === 0 ? "left" : "center" }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
              <Num style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{v}</Num>
            </div>
          ))}
        </div>
      </Card>

      <SectionLabel action={
        <RangeTabs<CatWindow> value={catRange} onChange={setCatRange} options={RANGE_OPTIONS} />
      }>Where it goes</SectionLabel>
      <Card><CatList items={catView.items} total={catView.total} /></Card>

      <SectionLabel>Biggest spends</SectionLabel>
      <Card pad={6}>
        {burn.outliers.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: "var(--ink-3)" }}>Nothing logged yet.</div>
        )}
        {burn.outliers.slice(0, 10).map((o, i, arr) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "11px 12px",
            borderBottom: i < arr.length - 1 ? "0.5px solid var(--line)" : "none",
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: 7, flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: `${travelColor(o.cat)}1f`, color: travelColor(o.cat),
            }}>
              <CategoryIcon cat={o.cat} size={14} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {o.city && <>{o.city} · </>}{fmtDate(o.date)}{o.method && <> · {fmtMethod(o.method)}</>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Num style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{money0(o.aud)}</Num>
              {o.foreign && (
                <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
                  {fmtForeign(o.foreign.value, o.foreign.currencyCode)}
                </div>
              )}
            </div>
          </div>
        ))}
      </Card>

      {!burn.isComplete && burn.daysLeft > 0 && (
        <>
          <SectionLabel>If this pace holds</SectionLabel>
          <WhatIf burn={burn} />
        </>
      )}
    </div>
  );
}

function WhatIf({ burn }: { burn: BurnState }) {
  const [daily, setDaily] = useState(Math.round(burn.avgAll));
  const endBal = Math.round((burn.budgetLeft - daily * burn.daysLeft) * 100) / 100;
  const finishes = endBal >= 0;
  return (
    <Card pad={18}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, color: "var(--ink-2)" }}>Spend for the next {burn.daysLeft} days</span>
        <Num style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>
          {money0(daily)}<span style={{ fontSize: 13, color: "var(--ink-3)" }}>/day</span>
        </Num>
      </div>
      <input type="range" min={80} max={360} step={5} value={daily} onChange={(e) => setDaily(Number(e.target.value))}
        className="wi-range" style={{ width: "100%", margin: "14px 0 6px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
        <span>A$80</span><span>safe: {money0(burn.safeDaily)}</span><span>A$360</span>
      </div>
      <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: finishes ? "var(--good-bg)" : "var(--over-bg)" }}>
        <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{finishes ? "You finish the trip with" : "You run short by"}</div>
        <Num style={{ fontSize: 30, fontWeight: 600, color: finishes ? "var(--good)" : "var(--over)" }}>{money0(Math.abs(endBal))}</Num>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 2 }}>
          {finishes ? <>spare cash at day {burn.plannedDays}</>
            : <>you'd need to cut to {money0(burn.safeDaily)}/day to break even</>}
        </div>
      </div>
    </Card>
  );
}
