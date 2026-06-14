import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BurnState, StayView } from "@up-travel/shared";
import { Card, Num } from "../components/ui";
import { Stepper } from "../components/sheets";
import { TxEditor, StayCreator } from "../components/editors";
import { useSheet } from "../lib/sheet";
import { api } from "../lib/api";
import { fmtDate, money0 } from "../lib/format";

export function Stays({ burn }: { burn: BurnState }) {
  const sheet = useSheet();
  const stays = burn.stays;
  const booked = stays.reduce((a, s) => a + s.totalCost, 0);
  const slept = stays.reduce((a, s) => a + s.spent, 0);
  const totalNights = stays.reduce((a, s) => a + s.nights, 0);
  const avgNight = totalNights ? Math.round(booked / totalNights) : 0;
  const today = burn.asOf;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={18} style={{ background: "var(--accent-wash)" }}>
        <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Every booking is <strong style={{ color: "var(--ink)" }}>spread evenly across the nights you sleep there</strong>, so a deposit now and a balance later both land smoothly in your daily burn, never as a spike.
        </div>
        <div style={{ display: "flex", marginTop: 14 }}>
          {[["Booked", money0(booked)], ["Slept so far", money0(slept)], ["Avg/night", money0(avgNight)]].map(([l, v], i) => (
            <div key={i} style={{ flex: 1, borderLeft: i ? "0.5px solid var(--line)" : "none", paddingLeft: i ? 14 : 0 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
              <Num style={{ fontSize: 19, fontWeight: 600, color: "var(--ink)" }}>{v}</Num>
            </div>
          ))}
        </div>
        <button onClick={() => sheet.open(<StayCreator />)} type="button" style={{
          width: "100%", marginTop: 16, border: "1px solid var(--accent)", background: "transparent",
          color: "var(--accent)", borderRadius: 12, padding: "11px", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>+ New stay</button>
      </Card>

      {stays.length === 0 && (
        <Card pad={18} style={{ textAlign: "center", color: "var(--ink-3)" }}>
          No stays yet. Tap "+ New stay" above, or from the Spend tab tap a transaction and choose "Mark as accommodation".
        </Card>
      )}

      {stays.slice().reverse().map((s) => (
        <StayCard key={s.id} stay={s} today={today} burn={burn} />
      ))}
    </div>
  );
}

function StayCard({ stay: s, today, burn }: { stay: StayView; today: string; burn: BurnState }) {
  const sheet = useSheet();
  const qc = useQueryClient();
  const setNights = useMutation({
    mutationFn: (nights: number) => api.stays.patch(s.id, { nights }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["burn"] }),
  });
  const isNow = s.checkIn <= today && s.checkOut > today;
  const isPast = s.checkOut <= today;
  const empty = s.payments.length === 0;

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{s.name}</span>
            {isNow && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accent-wash)", padding: "2px 7px", borderRadius: 99, letterSpacing: ".03em" }}>NOW</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 1 }}>
            {s.city && <>{s.city} · </>}{fmtDate(s.checkIn)} – {fmtDate(s.checkOut)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <Num style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>{money0(s.perNight)}</Num>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>per night</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 3, marginTop: 14 }}>
        {Array.from({ length: Math.min(s.nights, 31) }).map((_, i) => {
          const filled = isPast || (isNow && i < s.elapsedNights);
          return (
            <div key={i} style={{
              flex: 1, height: 22, borderRadius: 4,
              background: filled ? "var(--c-stay)" : "var(--chip)",
              opacity: filled ? (isNow && i === s.elapsedNights - 1 ? 1 : 0.85) : 1,
            }} />
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9 }}>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          {money0(s.perNight)}/night × {s.nights} = <Num style={{ color: "var(--ink-2)", fontWeight: 600 }}>{money0(s.totalCost)}</Num>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600 }}>Nights</span>
          <Stepper value={s.nights} onChange={(n) => setNights.mutate(n)} />
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 13, borderTop: "0.5px solid var(--line)" }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          How it was actually paid
        </div>
        {empty ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
            No payments linked yet. From the <strong style={{ color: "var(--ink-2)" }}>Spend</strong> tab, tap a transaction → "Mark as accommodation" → this stay.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {s.payments.map((p) => {
              const tx = burn.feed.find((x) => x.id === p.txId);
              return (
                <button key={p.txId} type="button" onClick={() => tx && sheet.open(<TxEditor tx={tx} />)} style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "7px 6px", margin: "0 -6px",
                  border: 0, borderRadius: 8, background: "transparent", cursor: "pointer", textAlign: "left",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--c-stay)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "var(--ink-2)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--mono)", whiteSpace: "nowrap" }}>{fmtDate(p.date)}</span>
                  <Num style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", width: 60, textAlign: "right" }}>{money0(p.aud)}</Num>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
