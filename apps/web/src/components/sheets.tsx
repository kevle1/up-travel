import { useState, type CSSProperties, type ReactNode } from "react";
import { TRAVEL_CATEGORIES, travelCategory } from "@up-travel/shared";
import { CategoryIcon } from "./CategoryIcon";
import { Icon } from "./Icon";

export function Sheet({ title, subtitle, children, onClose }: {
  title: string; subtitle?: string; children: ReactNode; onClose: () => void;
}) {
  // flex:1 + minHeight:0 on both this wrapper and the scroll child so the
  // scroll area actually clips and scrolls when content is taller than the
  // sheet's available space. Without min-height:0 the flex item refuses to
  // shrink below its content height, so overflow:auto does nothing.
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 4px 14px", flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} type="button" style={{
          border: 0, background: "var(--chip)", width: 30, height: 30, borderRadius: 99,
          cursor: "pointer", color: "var(--ink-2)", flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div
        className="scroll-area"
        style={{
          flex: 1, minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          // A bit of bottom padding so the last button doesn't kiss the edge.
          paddingBottom: 8,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function BigButton({
  children, onClick, kind = "primary", disabled,
}: {
  children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean;
}) {
  const bg = kind === "primary" ? "var(--accent)" : kind === "danger" ? "var(--over-bg)" : "var(--chip)";
  const col = kind === "primary" ? "#fff" : kind === "danger" ? "var(--over)" : "var(--ink)";
  return (
    <button onClick={onClick} disabled={disabled} type="button" style={{
      flex: 1, width: "100%", border: 0, borderRadius: 14, padding: "14px",
      fontSize: 15.5, fontWeight: 600, cursor: disabled ? "default" : "pointer",
      background: bg, color: col, opacity: disabled ? 0.4 : 1,
    }}>{children}</button>
  );
}

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: "block", marginBottom: 14, ...style }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      {children}
    </label>
  );
}

export const inputStyle: CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: "1px solid var(--line)", background: "var(--surface)", borderRadius: 12,
  padding: "12px 13px", fontSize: 16, color: "var(--ink)", outline: "none",
};

export function CategoryInline({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {TRAVEL_CATEGORIES.map((c) => {
        const on = value === c.id;
        return (
          <button key={c.id} onClick={() => onChange(c.id)} type="button" style={{
            display: "flex", alignItems: "center", gap: 9, padding: "11px 12px",
            borderRadius: 12, cursor: "pointer", textAlign: "left",
            border: on ? "1.5px solid var(--accent)" : "1px solid var(--line)",
            background: on ? "var(--accent-wash)" : "var(--surface)",
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: `${c.color}1f`, color: c.color,
            }}>
              <CategoryIcon cat={c.id} size={14} />
            </span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{c.label}</span>
            {on && <span style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

export { travelCategory };

// Numeric stepper used by Stays for nights.
export function Stepper({ value, onChange, min = 1, max = 60 }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number;
}) {
  const btn: CSSProperties = {
    width: 26, height: 26, borderRadius: 8, border: "1px solid var(--line)",
    background: "var(--surface)", color: "var(--ink)", cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" style={btn} onClick={() => onChange(Math.max(min, value - 1))}>
        <Icon name="remove" size={16} />
      </button>
      <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600, color: "var(--ink)", minWidth: 18, textAlign: "center" }}>{value}</span>
      <button type="button" style={btn} onClick={() => onChange(Math.min(max, value + 1))}>
        <Icon name="add" size={16} />
      </button>
    </div>
  );
}

// Used in many sheets to pre-fill local state from a parent.
export function useFormState<T>(initial: T): [T, <K extends keyof T>(k: K, v: T[K]) => void, (next: T) => void] {
  const [s, setS] = useState<T>(initial);
  const set = <K extends keyof T>(k: K, v: T[K]) => setS((prev) => ({ ...prev, [k]: v }));
  return [s, set, setS];
}
