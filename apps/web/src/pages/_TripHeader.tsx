import type { BurnState } from "@up-travel/shared";
import { fmtDate, fmtDateLong } from "../lib/format";
import { useSheet } from "../lib/sheet";
import { TripSwitcher } from "../components/editors";
import { Icon } from "../components/Icon";

export function TripHeader({ burn }: { burn: BurnState }) {
  const sheet = useSheet();
  const complete = burn.isComplete;
  const dateStr = fmtDateLong(burn.asOf);
  return (
    <div style={{ padding: "2px 4px 6px", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => sheet.open(<TripSwitcher />)} type="button" style={{
          display: "inline-flex", alignItems: "center", gap: 6, border: 0, background: "transparent",
          cursor: "pointer", padding: 0, minWidth: 0,
        }}>
          <span style={{
            fontSize: 20, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.01em",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{burn.trip.name}</span>
          <Icon name="expand_more" size={18} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
        </button>
        <span style={{ flex: 1 }} />
        {complete
          ? <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)", background: "var(--chip)", padding: "4px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>
              {burn.plannedDays} days · done
            </span>
          : burn.trip.currentCity && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--ink-2)", fontWeight: 600, whiteSpace: "nowrap" }}>
                <Icon name="location_on" size={14} fill style={{ color: "var(--accent)", flexShrink: 0 }} />
                {burn.trip.currentCity}
              </span>
            )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!complete && (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>Day {burn.dayNumber}</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>of {burn.plannedDays}</span>
            <span style={{ color: "var(--ink-3)" }}>·</span>
          </>
        )}
        <span style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          {complete ? `${fmtDate(burn.trip.startDate)} – ${fmtDate(burn.trip.endDate)}` : dateStr}
        </span>
      </div>
    </div>
  );
}
