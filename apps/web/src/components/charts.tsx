import { money0 } from "../lib/format";
import type { BurnDay } from "@up-travel/shared";

export type ChartStyle = "bars" | "area" | "line";

export function Sparkline({
  data, target, height = 44, color = "var(--accent)",
}: {
  data: BurnDay[]; target: number; height?: number; color?: string;
}) {
  const W = 300, H = height;
  if (data.length === 0) return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" />;
  const vals = data.map((d) => d.total);
  const max = Math.max(target * 1.2, ...vals) * 1.05 || 1;
  const stepX = W / Math.max(1, data.length - 1);
  const y = (v: number) => H - (v / max) * H;
  const pts = vals.map((v, i) => `${i * stepX},${y(v)}`).join(" ");
  const ty = y(target);
  const lastIdx = data.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <line x1="0" y1={ty} x2={W} y2={ty} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastIdx * stepX} cy={y(vals[lastIdx] ?? 0)} r="3.2" fill={color} />
    </svg>
  );
}

// BurnChart layers an SVG (stretched to fill) under absolutely-positioned HTML
// text labels. The text stays at natural size and proportions instead of
// getting squashed by the SVG's preserveAspectRatio=none stretch, which is
// what was happening at small N (e.g. the 3-day range). Bar widths are capped
// so small data sets don't render as huge wide blocks.
export function BurnChart({
  data, target, mode = "bars", height = 200, avgLine,
}: {
  data: BurnDay[]; target: number; mode?: ChartStyle; height?: number; avgLine?: number;
}) {
  const W = 680, H = height, padB = 22, padT = 14, padL = 4, padR = 4;
  const iw = W - padL - padR, ih = H - padB - padT;
  if (data.length === 0) {
    return <div style={{ height: H }} />;
  }
  const vals = data.map((d) => d.total);
  const max = Math.max(target * 1.35, ...vals) * 1.04 || 1;
  const n = data.length;
  // Slot-based x: each point sits at the centre of its own slot rather than
  // at the viewBox edges. Otherwise the first and last bars hang half off
  // the chart and look like they're missing (issue at low N — e.g. 3 days
  // showed only 2 bars because the edge ones were clipped by the SVG).
  const slot = iw / n;
  const x = (i: number) => padL + slot * (i + 0.5);
  // Cap so short ranges don't render as massive blocks; floor keeps long
  // ranges visible.
  const bw = Math.max(2.2, Math.min(40, slot * 0.62));
  const y = (v: number) => padT + ih - (v / max) * ih;
  const ty = y(target);

  const areaPts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const areaPath = `M ${padL},${padT + ih} L ${areaPts.replace(/ /g, " L ")} L ${padL + iw},${padT + ih} Z`;

  const ticks: { i: number; label: string }[] = [];
  let lastM: string | null = null;
  data.forEach((d, i) => {
    const m = d.date.slice(5, 7);
    if (m !== lastM) {
      ticks.push({ i, label: new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }) });
      lastM = m;
    }
  });
  // For ranges that don't span a month boundary (3d, 7d) show day numbers
  // instead so the x-axis isn't empty.
  if (ticks.length <= 1 && n <= 14) {
    ticks.length = 0;
    const step = Math.max(1, Math.ceil(n / 5));
    for (let i = 0; i < n; i += step) {
      ticks.push({
        i,
        label: new Date(`${data[i]!.date}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }),
      });
    }
  }

  // Helpers to convert chart-space coords into CSS percentage so the HTML
  // overlay sits at the right spot regardless of container width.
  const pctX = (xv: number) => `${(xv / W) * 100}%`;
  const pctY = (yv: number) => `${(yv / H) * 100}%`;

  return (
    <div style={{ position: "relative", height: H, width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
        preserveAspectRatio="none"
        style={{ display: "block", position: "absolute", inset: 0 }}>
        <line x1={padL} y1={ty} x2={padL + iw} y2={ty} stroke="var(--ink-2)" strokeWidth="1.2" strokeDasharray="4 4" opacity="0.7" vectorEffect="non-scaling-stroke" />
        {avgLine != null && (
          <line x1={padL} y1={y(avgLine)} x2={padL + iw} y2={y(avgLine)} stroke="var(--accent)" strokeWidth="1.2" opacity="0.55" vectorEffect="non-scaling-stroke" />
        )}

        {mode === "bars" && data.map((d, i) => {
          const over = d.total > target;
          return <rect key={i} x={x(i) - bw / 2} y={y(d.total)} width={bw}
            height={Math.max(0, padT + ih - y(d.total))} rx={Math.min(3, bw / 2)}
            fill={over ? "var(--over)" : "var(--accent)"} opacity={over ? 0.85 : 0.55} />;
        })}

        {mode === "area" && (
          <>
            <path d={areaPath} fill="var(--accent)" opacity="0.14" />
            <polyline points={areaPts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </>
        )}

        {mode === "line" && (
          <>
            <polyline points={areaPts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {data.map((d, i) => (i % 3 === 0 || i === n - 1) && (
              <circle key={i} cx={x(i)} cy={y(d.total)} r="2" fill={d.total > target ? "var(--over)" : "var(--accent)"} />
            ))}
          </>
        )}
      </svg>

      {/* HTML overlay so labels stay at natural size + proportions. */}
      <div style={{
        position: "absolute", left: pctX(padL + 2), top: `calc(${pctY(ty)} - 16px)`,
        fontSize: 11, fontFamily: "var(--mono)", color: "var(--ink-2)", pointerEvents: "none",
      }}>{money0(target)}/day</div>

      {ticks.map((t, k) => (
        <div key={k} style={{
          position: "absolute", left: pctX(x(t.i)), bottom: 2,
          transform: "translateX(-50%)",
          fontSize: 10.5, fontFamily: "var(--mono)", color: "var(--ink-3)",
          whiteSpace: "nowrap", pointerEvents: "none",
        }}>{t.label}</div>
      ))}
    </div>
  );
}
