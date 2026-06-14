import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BurnState, FeedRow } from "@up-travel/shared";
import { Card, Num, SectionLabel } from "../components/ui";
import { Icon } from "../components/Icon";
import { SpendLogger } from "../components/editors";
import { useSheet } from "../lib/sheet";
import { api } from "../lib/api";
import { fmtDate, money0 } from "../lib/format";

export function Cash({ burn }: { burn: BurnState }) {
  const sheet = useSheet();
  const qc = useQueryClient();
  const deleteCashLog = useMutation({
    mutationFn: (id: string) => api.cashLogs.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["burn"] }),
  });

  // Cash flow only: Up-sourced ATM withdrawals (card + internal), manual cash
  // topups, and manual spends that were flagged "Paid in cash". Non-cash
  // manual spends live in the Spend tab, not here, so the Withdrawn/Spent/
  // On-hand triple reconciles cleanly with the server's cashFloat.
  const cashRows = burn.feed.filter((x) =>
    (x.kind === "card" && x.internal && x.method === "ATM") ||
    (x.kind === "cashlog" && x.isCash),
  );
  const withdrawn = cashRows.filter((x) => x.cashLogKind === "topup" || (x.kind === "card" && x.internal)).reduce((a, x) => a + x.aud, 0);
  const spent = cashRows.filter((x) => x.kind === "cashlog" && x.cashLogKind === "spend").reduce((a, x) => a + x.aud, 0);
  const onHand = burn.cashFloat;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={20}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>Cash on hand</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
          <Num style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-.02em", color: "var(--c-cash)", lineHeight: 1 }}>{money0(onHand)}</Num>
          <span style={{ fontSize: 14, color: "var(--ink-3)" }}>in your wallet</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.5 }}>
          ATM withdrawals top up this float. They <strong style={{ color: "var(--ink-2)" }}>don't count as burn</strong> until you actually spend the cash. Logging cash spend draws it back down.
        </div>
        <div style={{ display: "flex", marginTop: 16, paddingTop: 14, borderTop: "0.5px solid var(--line)" }}>
          {[["Withdrawn", money0(withdrawn)], ["Spent", money0(spent)], ["On hand", money0(onHand)]].map(([l, v], i) => (
            <div key={i} style={{ flex: 1, borderLeft: i ? "0.5px solid var(--line)" : "none", paddingLeft: i ? 14 : 0 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
              <Num style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{v}</Num>
            </div>
          ))}
        </div>
        <button onClick={() => sheet.open(<SpendLogger />)} type="button" style={{
          marginTop: 16, width: "100%", border: 0, background: "var(--accent)", color: "#fff",
          borderRadius: 12, padding: "13px", fontSize: 14.5, fontWeight: 600, cursor: "pointer",
        }}>Log a cash spend</button>
      </Card>

      <SectionLabel>Cash activity</SectionLabel>
      <Card pad={6}>
        {cashRows.length === 0 && (
          <div style={{ padding: 14, fontSize: 13, color: "var(--ink-3)" }}>No cash activity yet.</div>
        )}
        {cashRows.slice(0, 30).map((e, i, arr) => (
          <CashRow key={e.id} e={e} last={i === Math.min(arr.length, 30) - 1}
            onDelete={() => deleteCashLog.mutate(e.id)} />
        ))}
      </Card>
    </div>
  );
}

function CashRow({ e, last, onDelete }: { e: FeedRow; last: boolean; onDelete: () => void }) {
  const isW = e.cashLogKind === "topup" || (e.kind === "card" && e.internal);
  const userLogged = e.kind === "cashlog";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "11px 12px",
      borderBottom: last ? "none" : "0.5px solid var(--line)",
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isW ? "var(--c-cash-wash)" : "var(--chip)",
      }}>
        <Icon name={isW ? "arrow_downward" : "arrow_upward"} size={18}
          style={{ color: isW ? "var(--c-cash)" : "var(--ink-3)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500 }}>
          {isW ? "ATM withdrawal" : e.description}
          {userLogged && <span style={{ fontSize: 11, color: "var(--c-cash)", fontWeight: 600 }}> · logged</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {fmtDate(e.date)}{e.foreign && <> · {e.foreign.value.toLocaleString()} {e.foreign.currencyCode}</>}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <Num style={{ fontSize: 14.5, fontWeight: 600, color: isW ? "var(--c-cash)" : "var(--ink)" }}>
          {isW ? "+" : "−"}{money0(e.aud)}
        </Num>
      </div>
      {userLogged && (
        <button onClick={onDelete} type="button" style={{
          border: 0, background: "var(--chip)", borderRadius: 99, color: "var(--ink-3)",
          width: 24, height: 24, cursor: "pointer", flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }} title="Delete">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}
