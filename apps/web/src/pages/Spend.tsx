import { useMemo, useState } from "react";
import { TRAVEL_CATEGORIES, travelColor, travelLabel, type BurnState, type FeedRow } from "@up-travel/shared";
import { Card, Num } from "../components/ui";
import { CategoryIcon } from "../components/CategoryIcon";
import { Icon } from "../components/Icon";
import { TxEditor, CashLogEditor, SpendLogger } from "../components/editors";
import { useSheet } from "../lib/sheet";
import { dayLabel, fmtForeign, fmtMethod, money0 } from "../lib/format";

export function Spend({ burn }: { burn: BurnState }) {
  const sheet = useSheet();
  const [filter, setFilter] = useState<"All" | string>("All");
  const rows = useMemo(
    () => filter === "All" ? burn.feed : burn.feed.filter((x) => x.category === filter),
    [burn.feed, filter],
  );

  // group by date (newest first; feed already sorted desc).
  const groups = useMemo(() => {
    const acc: { date: string; items: FeedRow[] }[] = [];
    let cur: { date: string; items: FeedRow[] } | null = null;
    for (const x of rows) {
      if (!cur || cur.date !== x.date) { cur = { date: x.date, items: [] }; acc.push(cur); }
      cur.items.push(x);
    }
    return acc;
  }, [rows]);

  const chips: ("All" | string)[] = ["All", ...TRAVEL_CATEGORIES.map((c) => c.id)];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 2px 0" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>Spending</div>
        <span style={{ flex: 1 }} />
        <button onClick={() => sheet.open(<SpendLogger />)} type="button" style={{
          display: "inline-flex", alignItems: "center", gap: 6, border: 0, cursor: "pointer", whiteSpace: "nowrap",
          background: "var(--accent)", color: "#fff", borderRadius: 99, padding: "8px 14px",
          fontSize: 13, fontWeight: 600,
        }}>+ Log spend</button>
      </div>

      <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2, margin: "0 -16px", padding: "0 16px" }} className="scroll-area">
        {chips.map((c) => {
          const on = filter === c;
          return (
            <button key={c} onClick={() => setFilter(c)} type="button" style={{
              flexShrink: 0, cursor: "pointer", whiteSpace: "nowrap",
              border: on ? "1px solid var(--accent)" : "1px solid var(--line)",
              background: on ? "var(--accent-wash)" : "var(--surface)",
              color: on ? "var(--accent)" : "var(--ink-2)",
              borderRadius: 99, padding: "7px 12px", fontSize: 13, fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              {c !== "All" && (
                <span style={{ color: travelColor(c), display: "inline-flex" }}>
                  <CategoryIcon cat={c} size={14} />
                </span>
              )}
              {c === "All" ? "All" : travelLabel(c)}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {groups.length === 0 && (
          <Card pad={20} style={{ textAlign: "center", color: "var(--ink-3)" }}>
            No transactions in this filter.
          </Card>
        )}
        {groups.map((g) => {
          const dayTotal = g.items.filter((x) => !x.internal && !x.isTransfer).reduce((a, x) => a + x.aud, 0);
          return (
            <div key={g.date}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px 7px" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{dayLabel(g.date)}</span>
                <Num style={{ fontSize: 12, color: "var(--ink-3)" }}>{money0(dayTotal)}</Num>
              </div>
              <Card pad={4}>
                {g.items.map((x, i) => (
                  <TxRow key={x.id} x={x} last={i === g.items.length - 1}
                    onTap={() => sheet.open(x.kind === "cashlog" ? <CashLogEditor row={x} /> : <TxEditor tx={x} />)} />
                ))}
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Build the row's metadata line as a parts array so we can join with dots
// only *between* items — avoids the leading-dot bug when an earlier field
// (e.g. method) isn't present. Title-cased labels too.
function MetaLine({ x, isTopup }: { x: FeedRow; isTopup: boolean }) {
  const parts: { text: string; color?: string }[] = [];
  const method = fmtMethod(x.method);
  if (method) parts.push({ text: method });
  if (x.excluded) parts.push({ text: "Excluded", color: "var(--ink-3)" });
  if (x.isAccom) parts.push({ text: "Stay", color: "var(--c-stay)" });
  if (x.spreadDays) parts.push({ text: `Spread ${x.spreadDays}d`, color: "var(--accent)" });
  if (x.incoming) parts.push({ text: x.countsAsCredit ? "Credit" : "Incoming", color: "var(--good)" });
  if (x.kind === "cashlog" && x.cashLogKind === "spend") parts.push({ text: "Logged", color: "var(--c-cash)" });
  if (isTopup) parts.push({ text: "Float top-up" });
  if (parts.length === 0) return null;
  return (
    <div style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span aria-hidden>·</span>}
          <span style={{ color: p.color, fontWeight: p.color ? 600 : undefined }}>{p.text}</span>
        </span>
      ))}
    </div>
  );
}

function TxRow({ x, last, onTap }: { x: FeedRow; last: boolean; onTap: () => void }) {
  const isTopup = x.internal;
  // Cash + ATM rows always read in the cash purple so the row is identifiable
  // at a glance regardless of theme, instead of fading into a neutral grey.
  // Incoming funds use the "good" green so they read as money in.
  const color = isTopup ? "var(--c-cash)"
    : x.incoming ? "var(--good)"
    : travelColor(x.category);
  // Excluded rows stay in the feed but fade so they read as inactive.
  const isExcluded = x.excluded;
  return (
    <button onClick={onTap} type="button" style={{
      width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "11px 12px",
      cursor: "pointer", border: 0, borderBottom: last ? "none" : "0.5px solid var(--line)",
      background: "transparent", textAlign: "left",
      opacity: isExcluded ? 0.45 : 1,
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: isTopup ? "var(--c-cash-wash)" : `${color}1f`,
        color,
      }}>
        <CategoryIcon cat={isTopup ? "cash" : x.category} size={16} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, color: "var(--ink)", fontWeight: 500,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          textDecoration: isExcluded ? "line-through" : undefined,
        }}>{x.description}</div>
        <MetaLine x={x} isTopup={isTopup} />
      </div>
      <div style={{ textAlign: "right" }}>
        <Num style={{
          fontSize: 14.5, fontWeight: 600,
          color: x.incoming ? "var(--good)" : isTopup ? "var(--ink-3)" : "var(--ink)",
        }}>{x.incoming ? "+" : ""}{money0(x.aud)}</Num>
        {x.foreign && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
            {fmtForeign(x.foreign.value, x.foreign.currencyCode)}
          </div>
        )}
      </div>
      <Icon name="chevron_right" size={20} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
    </button>
  );
}
