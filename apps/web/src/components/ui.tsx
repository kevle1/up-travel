import type { CSSProperties, ReactNode } from "react";
import type { PaceStatus } from "@up-travel/shared";

export const STATUS_COLOR: Record<PaceStatus, string> = {
  good: "var(--good)", watch: "var(--watch)", over: "var(--over)",
};
export const STATUS_BG: Record<PaceStatus, string> = {
  good: "var(--good-bg)", watch: "var(--watch-bg)", over: "var(--over-bg)",
};
export const STATUS_WORD: Record<PaceStatus, string> = {
  good: "On track", watch: "Watch it", over: "Over pace",
};

export const BUCKET_COLOR: Record<string, string> = {
  Food: "var(--c-food)", Stay: "var(--c-stay)", Transport: "var(--c-transport)",
  Activities: "var(--c-activities)", Cash: "var(--c-cash)", Other: "var(--c-other)",
};

export function Num({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={{ fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1', ...style }}>{children}</span>;
}

export function PaceBadge({ level, label }: { level: PaceStatus; label?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 8px",
      borderRadius: 999, background: STATUS_BG[level], color: STATUS_COLOR[level],
      fontSize: 12.5, fontWeight: 600, letterSpacing: ".01em", whiteSpace: "nowrap",
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[level] }} />
      {label ?? STATUS_WORD[level]}
    </span>
  );
}

export function Card({
  children, style, pad = 18, onClick,
}: { children: ReactNode; style?: CSSProperties; pad?: number; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", borderRadius: 20, padding: pad,
      border: "0.5px solid var(--line)", boxShadow: "var(--shadow)",
      ...style,
    }}>{children}</div>
  );
}

export function StatTile({ label, value, sub, color }: {
  label: string; value: ReactNode; sub?: ReactNode; color?: string;
}) {
  return (
    <Card pad={15} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <Num style={{ fontSize: 23, fontWeight: 600, color: color ?? "var(--ink)", lineHeight: 1.05, letterSpacing: "-.01em" }}>{value}</Num>
      {sub && <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{sub}</div>}
    </Card>
  );
}

export function Ring({
  value, max, size = 132, stroke = 12, color, track = "var(--ring-track)", children,
}: {
  value: number; max: number; size?: number; stroke?: number; color: string;
  track?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .6s cubic-bezier(.3,.8,.3,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
        {children}
      </div>
    </div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "4px 2px 2px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{children}</div>
      {action}
    </div>
  );
}

export function RangeTabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div style={{ display: "inline-flex", background: "var(--chip)", borderRadius: 99, padding: 3, gap: 2 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} type="button" style={{
            border: 0, cursor: "pointer", borderRadius: 99, padding: "5px 13px", fontSize: 12.5, fontWeight: 600,
            background: on ? "var(--surface)" : "transparent",
            color: on ? "var(--ink)" : "var(--ink-2)",
            boxShadow: on ? "0 1px 2px rgba(0,0,0,.1)" : "none",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}
