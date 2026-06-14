import { Num } from "./ui";
import { CategoryIcon } from "./CategoryIcon";
import { money0 } from "../lib/format";
import type { CatRow } from "@up-travel/shared";

export function CatList({
  items, total, emptyNote, limit,
}: {
  items: CatRow[]; total: number; emptyNote?: string; limit?: number;
}) {
  if (!total) {
    return (
      <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
        {emptyNote ?? "Nothing logged here yet."}
      </div>
    );
  }
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <div>
      <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", gap: 2, marginBottom: 16 }}>
        {shown.map((it) => (
          <div key={it.cat} title={it.label}
            style={{ width: `${(it.amount / total) * 100}%`, background: it.color }} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shown.map((it) => (
          <div key={it.cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: `${it.color}1f`, color: it.color,
            }}>
              <CategoryIcon cat={it.cat} size={13} />
            </span>
            <span style={{ flex: 1, fontSize: 14.5, color: "var(--ink)", fontWeight: 500, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
            <Num style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              {Math.round((it.amount / total) * 100)}%
            </Num>
            <Num style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 600, width: 62, textAlign: "right" }}>
              {money0(it.amount)}
            </Num>
          </div>
        ))}
      </div>
    </div>
  );
}
