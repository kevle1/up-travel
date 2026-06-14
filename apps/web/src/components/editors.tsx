import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  upLabel, upParentName,
  type BurnState, type FeedRow, type StayView, type Trip,
} from "@up-travel/shared";
import { api } from "../lib/api";
import { useSheet } from "../lib/sheet";
import { useToast } from "../lib/toast";
import { money0, money2, fmtDate } from "../lib/format";
import { Num } from "./ui";
import { Sheet, BigButton, Field, inputStyle, CategoryInline, Stepper } from "./sheets";
import { Icon } from "./Icon";

// ── Transaction editor ────────────────────────────────────────────────────────
export function TxEditor({ tx: initialTx }: { tx: FeedRow }) {
  const sheet = useSheet();
  const toast = useToast();
  const qc = useQueryClient();
  // Read the live tx from the latest burn fetch so picking a category reflects
  // immediately after the API patch + refetch settles. Falling back to the
  // initial snapshot keeps the sheet alive while the query is loading.
  const { data: burn } = useQuery({ queryKey: ["burn"], queryFn: () => api.burn() });
  const tx = burn?.feed.find((r) => r.id === initialTx.id) ?? initialTx;

  const patch = useMutation({
    mutationFn: (body: { travelCategory?: string | null; stayId?: number | null; spreadDays?: number | null; countAsCredit?: boolean; excluded?: boolean; notes?: string | null }) =>
      api.transactions.patch(tx.id, body),
    // Re-categorising stays open (user may pick another). Excluding closes
    // the sheet and surfaces an undo toast. Re-including stays open so the
    // user can immediately re-tag or relink the row.
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["burn"] });
      if (variables.excluded === true) {
        sheet.close();
        const txId = tx.id;
        toast.show({
          message: `Excluded "${tx.description}" from totals`,
          actionLabel: "Undo",
          onAction: async () => {
            await api.transactions.patch(txId, { excluded: false });
            qc.invalidateQueries({ queryKey: ["burn"] });
          },
        });
      }
    },
  });
  const reset = useMutation({
    mutationFn: () => api.transactions.resetOverride(tx.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["burn"] }),
  });

  if (tx.isAccom) {
    return <AccomBadge tx={tx} />;
  }
  return (
    <Sheet
      title={tx.description}
      subtitle={`${money2(tx.aud)}${tx.foreign ? ` · ${tx.foreign.value.toLocaleString()} ${tx.foreign.currencyCode}` : ""} · ${fmtDate(tx.date)}`}
      onClose={sheet.close}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12,
        background: "var(--chip)", marginBottom: 16, fontSize: 12.5, color: "var(--ink-2)",
      }}>
        <span>Up tagged this</span>
        <strong style={{ color: "var(--ink)" }}>{upLabel(tx.upTag)}</strong>
        <span style={{ color: "var(--ink-3)" }}>· {upParentName(tx.upTag)}</span>
      </div>

      {tx.incoming && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "12px 14px", borderRadius: 12,
          background: "color-mix(in srgb, var(--good) 12%, transparent)",
          marginBottom: 16,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Count as credit</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>
              {tx.countsAsCredit
                ? "Subtracts from this day's burn (treats as a refund)."
                : "Incoming funds are shown but don't affect burn by default."}
            </div>
          </div>
          <Toggle
            value={tx.countsAsCredit}
            onChange={(v) => patch.mutate({ countAsCredit: v })}
          />
        </div>
      )}

      <Field label={`Tag it for your trip, counts as ${tx.bucket}`}>
        <CategoryInline
          value={tx.category}
          onChange={(id) => patch.mutate({ travelCategory: id })}
        />
      </Field>
      <button type="button" onClick={() => reset.mutate()} style={{
        border: 0, background: "none", color: "var(--ink-3)", fontSize: 12.5, cursor: "pointer",
        marginBottom: 14, textDecoration: "underline",
      }}>Reset to Up's tag</button>
      <div style={{ height: 1, background: "var(--line)", margin: "4px 0 16px" }} />

      <SpreadControl
        value={tx.spreadDays ?? 1}
        onChange={(n) => patch.mutate({ spreadDays: n > 1 ? n : null })}
      />

      <NotesField initial={tx.notes ?? ""} onSave={(v) => patch.mutate({ notes: v || null })} />

      <div style={{ height: 1, background: "var(--line)", margin: "4px 0 16px" }} />
      <BigButton kind="ghost" onClick={() => sheet.open(<StayPicker tx={tx} />)}>
        Mark as accommodation…
      </BigButton>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 9, lineHeight: 1.5 }}>
        Link this to a stay and it stops counting as a lump. Its amount joins the stay's total and spreads evenly across the nights.
      </div>
      <div style={{ marginTop: 16 }}>
        {tx.excluded ? (
          <button
            type="button"
            onClick={() => patch.mutate({ excluded: false })}
            disabled={patch.isPending}
            style={{
              width: "100%", border: 0, borderRadius: 14, padding: "14px",
              fontSize: 15.5, fontWeight: 600,
              background: "color-mix(in srgb, var(--good) 14%, transparent)",
              color: "var(--good)",
              cursor: patch.isPending ? "default" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: patch.isPending ? 0.6 : 1,
            }}
          >
            <Icon name="restart_alt" size={18} />
            Include in totals
          </button>
        ) : (
          <button
            type="button"
            onClick={() => patch.mutate({ excluded: true })}
            disabled={patch.isPending}
            style={{
              width: "100%", border: 0, borderRadius: 14, padding: "14px",
              fontSize: 15.5, fontWeight: 600,
              background: "var(--over-bg)", color: "var(--over)",
              cursor: patch.isPending ? "default" : "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: patch.isPending ? 0.6 : 1,
            }}
          >
            <Icon name="delete" size={18} />
            Exclude from totals
          </button>
        )}
      </div>
    </Sheet>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} type="button" style={{
      border: 0, cursor: "pointer", width: 38, height: 22, borderRadius: 99,
      background: value ? "var(--good)" : "var(--chip)", position: "relative",
      transition: "background .2s", flexShrink: 0,
    }}>
      <span style={{
        position: "absolute", top: 2, left: value ? 18 : 2,
        width: 18, height: 18, borderRadius: 99, background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,.2)", transition: "left .2s",
      }} />
    </button>
  );
}

// Notes input. Auto-saves on blur (and Cmd/Ctrl+Enter) rather than per-keystroke
// so we're not hammering the API for partial words.
function NotesField({ initial, onSave }: { initial: string; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const dirty = value !== savedValue;
  const commit = () => {
    if (!dirty) return;
    onSave(value.trim());
    setSavedValue(value.trim());
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>
        Notes
      </div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
        }}
        placeholder="Anything to remember about this spend"
        rows={2}
        style={{ ...inputStyle, resize: "vertical", minHeight: 56, fontSize: 14, lineHeight: 1.4 }}
      />
      {dirty && (
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
          Unsaved · tap outside to save
        </div>
      )}
    </div>
  );
}

// Spread N: a stepper that lets the user amortise a single transaction across
// multiple days. 1 = no spread (normal). Useful for transit passes, monthly
// memberships purchased once, etc.
function SpreadControl({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Spread across days</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.4 }}>
            {value > 1
              ? `Counts as ~1/${value} of this on each of ${value} days`
              : "Counts on the transaction day only"}
          </div>
        </div>
        <Stepper value={value} onChange={onChange} min={1} max={90} />
      </div>
    </div>
  );
}

function AccomBadge({ tx }: { tx: FeedRow }) {
  const sheet = useSheet();
  const qc = useQueryClient();
  const { data: burn } = useQuery({ queryKey: ["burn"], queryFn: () => api.burn() });
  const stay = burn?.stays.find((s) => s.id === tx.stayId);
  // Unlink this tx. If it was the only payment linked to the stay, the stay
  // is now empty — delete it so it doesn't linger as a phantom nights block.
  // If other payments are still linked, leave the stay in place.
  const unlink = useMutation({
    mutationFn: async () => {
      if (tx.stayId == null) return;
      const stayBefore = burn?.stays.find((s) => s.id === tx.stayId);
      await api.transactions.patch(tx.id, { stayId: null });
      if (stayBefore && stayBefore.txIds.length <= 1) {
        await api.stays.remove(tx.stayId);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["burn"] }); sheet.close(); },
  });
  return (
    <Sheet title={tx.description} subtitle={`${money2(tx.aud)} · ${fmtDate(tx.date)}`} onClose={sheet.close}>
      <div style={{ padding: 15, borderRadius: 14, background: "var(--accent-wash)" }}>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Linked to stay</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>{stay?.name ?? "-"}</div>
        {stay?.city && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{stay.city}</div>}
        {stay && (
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6 }}>
            Part of {money0(stay.totalCost)} over {stay.nights} nights →{" "}
            <strong style={{ color: "var(--ink)" }}>{money0(stay.perNight)}/night</strong>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <BigButton kind="ghost" onClick={() => sheet.open(<StayPicker tx={tx} />)}>Move stay</BigButton>
        <BigButton kind="ghost" onClick={() => unlink.mutate()}>Unlink</BigButton>
      </div>
    </Sheet>
  );
}

// ── Stay picker / creator ─────────────────────────────────────────────────────
export function StayPicker({ tx }: { tx: FeedRow }) {
  const sheet = useSheet();
  const qc = useQueryClient();
  const { data: burn } = useQuery({ queryKey: ["burn"], queryFn: () => api.burn() });
  const stays = burn?.stays ?? [];
  const link = useMutation({
    mutationFn: (stayId: number) => api.transactions.patch(tx.id, { stayId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["burn"] }); sheet.close(); },
  });
  return (
    <Sheet
      title="Assign to a stay"
      subtitle={`${tx.description} · ${money2(tx.aud)}`}
      onClose={sheet.close}
    >
      <BigButton onClick={() => sheet.open(<StayCreator tx={tx} />)}>+ New stay</BigButton>
      <div style={{ fontSize: 12, color: "var(--ink-3)", margin: "18px 2px 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
        Or link to existing
      </div>
      {stays.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 2px" }}>
          No stays yet. Create one above.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {stays.slice().reverse().map((s) => (
          <button key={s.id} onClick={() => link.mutate(s.id)} type="button" style={{
            display: "flex", alignItems: "center", gap: 11, padding: "12px 13px",
            borderRadius: 12, cursor: "pointer", border: "1px solid var(--line)",
            background: "var(--surface)", textAlign: "left",
          }}>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>{s.name}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)" }}>
                {s.city && <>{s.city} · </>}{fmtDate(s.checkIn)} · {s.nights} nights · {s.txIds.length} payment{s.txIds.length === 1 ? "" : "s"}
              </span>
            </span>
            <Num style={{ fontSize: 13, color: "var(--ink-2)" }}>{money0(s.perNight)}/night</Num>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function StayCreator({ tx }: { tx?: FeedRow }) {
  const sheet = useSheet();
  const qc = useQueryClient();
  const { data: burn } = useQuery({ queryKey: ["burn"], queryFn: () => api.burn() });
  const todayIso = burn?.asOf ?? new Date().toISOString().slice(0, 10);
  const guessCity = tx ? burn?.cityByDay[tx.date] : burn?.cityByDay[todayIso];
  // Default the stay title to the tx description (merchant name) so the user
  // doesn't have to retype it. City is a separate field for the actual place,
  // pre-filled from the nearby stay's city if one exists.
  const [name, setName] = useState(tx?.description ?? "");
  const [city, setCity] = useState(guessCity?.city ?? "");
  const [nights, setNights] = useState(7);
  const [checkIn, setCheckIn] = useState(tx?.date ?? todayIso);

  const create = useMutation({
    mutationFn: async () => {
      const stay = await api.stays.create({ name, city, checkIn, nights });
      if (tx) await api.transactions.patch(tx.id, { stayId: stay.id });
      return stay;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["burn"] }); sheet.close(); },
  });

  return (
    <Sheet title="New stay" subtitle="The app spreads its total over these nights" onClose={sheet.close}>
      <Field label="Title">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kotor hostel" />
      </Field>
      <Field label="City">
        <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Kotor" />
      </Field>
      <Field label="Check-in">
        <input type="date" style={inputStyle} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
      </Field>
      <Field label="Nights">
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <Stepper value={nights} onChange={setNights} min={1} max={365} />
        </div>
      </Field>
      {tx && (
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 16, padding: 12, borderRadius: 12, background: "var(--chip)" }}>
          {tx.description} · {money0(tx.aud)} will be linked. Add other payments later from Spend and they'll spread together.
        </div>
      )}
      <BigButton onClick={() => create.mutate()} disabled={!name || create.isPending}>
        {create.isPending ? "Saving…" : `Create${tx ? " & link" : ""}`}
      </BigButton>
    </Sheet>
  );
}

// ── Cash log editor (view + delete) ───────────────────────────────────────────
// Manual spends + ATM topups don't live in /api/transactions so the regular
// TxEditor can't touch them. This sheet shows the row's details and a delete
// button; we don't surface category editing since the user can just delete and
// re-add at the desired category if it's wrong.
export function CashLogEditor({ row }: { row: FeedRow }) {
  const sheet = useSheet();
  const toast = useToast();
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.cashLogs.remove(row.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["burn"] });
      sheet.close();
      toast.show({ message: `Deleted "${row.description}"` });
    },
    onError: (e) => {
      toast.show({
        message: `Couldn't delete: ${e instanceof Error ? e.message : "unknown error"}`,
        duration: 8000,
      });
    },
  });
  const isTopup = row.cashLogKind === "topup";
  return (
    <Sheet
      title={row.description}
      subtitle={`${money2(row.aud)} · ${fmtDate(row.date)}`}
      onClose={sheet.close}
    >
      <div style={{
        display: "flex", flexDirection: "column", gap: 10,
        padding: "12px 14px", borderRadius: 12, background: "var(--chip)", marginBottom: 16,
      }}>
        <Row label="Type">
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
            {isTopup ? "Cash withdrawal" : "Manual spend"}
          </span>
        </Row>
        {!isTopup && (
          <Row label="Paid in physical cash">
            <span style={{ fontSize: 13, fontWeight: 600, color: row.isCash ? "var(--c-cash)" : "var(--ink-3)" }}>
              {row.isCash ? "Yes" : "No"}
            </span>
          </Row>
        )}
        <Row label="Category">
          <span style={{ fontSize: 13, color: "var(--ink)" }}>
            {/* Friendly label of the travel category */}
            {row.category}
          </span>
        </Row>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
        {isTopup
          ? "Deleting this top-up removes it from your cash on hand and any related activity rows."
          : row.isCash
            ? "Deleting this returns the amount to your cash on hand and removes it from burn."
            : "Deleting this removes it from burn."}
      </div>
      <button
        type="button"
        onClick={() => remove.mutate()}
        disabled={remove.isPending}
        style={{
          width: "100%", border: 0, borderRadius: 14, padding: "14px",
          fontSize: 15.5, fontWeight: 600,
          background: "var(--over-bg)", color: "var(--over)",
          cursor: remove.isPending ? "default" : "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: remove.isPending ? 0.6 : 1,
        }}
      >
        <Icon name="delete" size={18} />
        {remove.isPending ? "Deleting…" : "Delete"}
      </button>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{label}</span>
      {children}
    </div>
  );
}

// ── Spend logger ──────────────────────────────────────────────────────────────
// Generic manual spend entry. AUD only by design — covers paid-in-cash spends,
// reimbursements Up didn't see, split bills, etc. "Paid in cash" toggle draws
// the spend from the cash float (which Up-sourced ATM withdrawals fill).
export function SpendLogger() {
  const sheet = useSheet();
  const qc = useQueryClient();
  const { data: burn } = useQuery({ queryKey: ["burn"], queryFn: () => api.burn() });
  const todayIso = burn?.asOf ?? new Date().toISOString().slice(0, 10);
  const here = burn?.cityByDay[todayIso] ?? { city: burn?.trip.currentCity ?? "your trip" };
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso);
  const [cat, setCat] = useState("food");
  const [note, setNote] = useState("");
  const [paidInCash, setPaidInCash] = useState(false);

  const numAmount = Number(amount) || 0;

  const create = useMutation({
    mutationFn: () => api.cashLogs.create({
      kind: "spend",
      occurredAt: Date.parse(`${date}T12:00:00Z`),
      amountAudCents: Math.round(numAmount * 100),
      foreignAmount: null,
      foreignCurrency: null,
      travelCategory: cat,
      isCash: paidInCash,
      note: note || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["burn"] }); sheet.close(); },
  });

  return (
    <Sheet
      title="Log spend"
      subtitle={here.city ? `In ${here.city}` : undefined}
      onClose={sheet.close}
    >
      <Field label="Amount · AUD">
        <input
          type="number" inputMode="decimal"
          style={{ ...inputStyle, fontSize: 28, fontWeight: 600, fontFamily: "var(--mono)" }}
          value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus
        />
      </Field>
      <Field label="Date">
        <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="What for"><CategoryInline value={cat} onChange={setCat} /></Field>
      <Field label="Note (optional)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. split lunch, laundromat" />
      </Field>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "12px 14px", borderRadius: 12, background: "var(--chip)", marginBottom: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Paid in cash</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>
            Spent from withdrawn cash
          </div>
        </div>
        <Toggle value={paidInCash} onChange={setPaidInCash} />
      </div>
      <BigButton onClick={() => create.mutate()} disabled={!numAmount || create.isPending}>
        {create.isPending ? "Saving…" : "Log spend"}
      </BigButton>
    </Sheet>
  );
}

/** @deprecated Use SpendLogger. Kept as an alias to avoid stale imports. */
export const CashLogger = SpendLogger;

// ── Trip switcher / creator / settings ────────────────────────────────────────
export function TripSwitcher() {
  const sheet = useSheet();
  const qc = useQueryClient();
  const { data: trips = [] } = useQuery({ queryKey: ["trips"], queryFn: api.trips.list });
  const { data: burn } = useQuery({ queryKey: ["burn"], queryFn: () => api.burn() });
  const activeId = burn?.trip.id;

  const activate = useMutation({
    mutationFn: (id: number) => api.trips.activate(id),
    onSuccess: () => { qc.invalidateQueries(); sheet.close(); },
  });

  return (
    <Sheet title="Your trips" subtitle="Each trip keeps its own budget, spend and edits" onClose={sheet.close}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {trips.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>No trips yet. Create one below.</div>
        )}
        {trips.map((t) => {
          const on = t.id === activeId;
          const done = t.endDate < new Date().toISOString().slice(0, 10);
          return (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "13px 14px",
              borderRadius: 14,
              border: on ? "1.5px solid var(--accent)" : "1px solid var(--line)",
              background: on ? "var(--accent-wash)" : "var(--surface)",
            }}>
              <button onClick={() => activate.mutate(t.id)} type="button" style={{
                flex: 1, minWidth: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{t.name}</span>
                  {done
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", background: "var(--chip)", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>DONE</span>
                    : <span style={{ fontSize: 10, fontWeight: 700, color: "var(--good)", background: "var(--good-bg)", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>LIVE</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{fmtDate(t.startDate)} – {fmtDate(t.endDate)}</div>
              </button>
              <button onClick={() => sheet.open(<TripSettings trip={t} />)} type="button" style={{
                border: 0, background: "var(--chip)", width: 30, height: 30, borderRadius: 99, cursor: "pointer", color: "var(--ink-2)", flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="tune" size={18} />
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <BigButton onClick={() => sheet.open(<TripCreator />)}>+ New trip</BigButton>
      </div>
    </Sheet>
  );
}

export function TripCreator() {
  const sheet = useSheet();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d: string, n: number) =>
    new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(plus(today, 30));
  const [budgetK, setBudgetK] = useState(6);
  const [target, setTarget] = useState(200);
  const days = Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);
  const safeBudgetPerDay = Math.round((budgetK * 1000) / days);

  const create = useMutation({
    mutationFn: () => api.trips.create({
      name,
      startDate: start,
      endDate: end,
      budgetAudCents: budgetK * 1000 * 100,
      targetDailyAudCents: target * 100,
    }),
    onSuccess: async (trip) => {
      await api.trips.activate(trip.id);
      qc.invalidateQueries();
      sheet.close();
    },
  });

  return (
    <Sheet title="New trip" subtitle="Starts empty. Connect Up or log spend as you go." onClose={sheet.close}>
      <Field label="Trip name">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Japan Spring 2026" />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Start"><input type="date" style={inputStyle} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><input type="date" style={inputStyle} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label={`Total budget · A$${(budgetK * 1000).toLocaleString("en-AU")}`}>
        <input type="range" min={1} max={120} value={budgetK} onChange={(e) => setBudgetK(Number(e.target.value))} className="wi-range" style={{ width: "100%" }} />
      </Field>
      <Field label={`Daily target · A$${target}`}>
        <input type="range" min={50} max={500} step={10} value={target} onChange={(e) => setTarget(Number(e.target.value))} className="wi-range" style={{ width: "100%" }} />
      </Field>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>
        {days} days · works out to {money0(safeBudgetPerDay)}/day to use the whole budget.
      </div>
      <BigButton onClick={() => create.mutate()} disabled={!name || create.isPending}>
        {create.isPending ? "Creating…" : "Create trip"}
      </BigButton>
    </Sheet>
  );
}

export function TripSettings({ trip }: { trip: Trip }) {
  const sheet = useSheet();
  const toast = useToast();
  const qc = useQueryClient();
  const [budget, setBudget] = useState(trip.budgetAudCents);
  const [target, setTarget] = useState(trip.targetDailyAudCents);
  const [currentCity, setCurrentCity] = useState(trip.currentCity);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const save = useMutation({
    mutationFn: () => api.trips.patch(trip.id, {
      budgetAudCents: budget, targetDailyAudCents: target, currentCity,
    }),
    onSuccess: () => { qc.invalidateQueries(); sheet.close(); },
  });
  const remove = useMutation({
    mutationFn: () => api.trips.remove(trip.id),
    onSuccess: () => {
      qc.invalidateQueries();
      sheet.close();
      toast.show({ message: `Deleted "${trip.name}"` });
    },
    onError: (e) => {
      toast.show({
        message: `Couldn't delete trip: ${e instanceof Error ? e.message : "unknown error"}`,
        duration: 8000,
      });
    },
  });
  const archive = useMutation({
    mutationFn: () => api.trips.archive(trip.id),
    onSuccess: () => { qc.invalidateQueries(); sheet.close(); },
  });

  const budgetK = Math.round(budget / 100_000);
  const days = Math.max(1, Math.round((Date.parse(`${trip.endDate}T00:00:00Z`) - Date.parse(`${trip.startDate}T00:00:00Z`)) / 86_400_000) + 1);

  return (
    <Sheet
      title={trip.name}
      subtitle={`${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)} · ${days} days`}
      onClose={sheet.close}
    >
      <Field label="Current city (shown in the header)">
        <input style={inputStyle} value={currentCity} onChange={(e) => setCurrentCity(e.target.value)} placeholder="e.g. Lisbon" />
      </Field>
      <Field label={`Total budget · A$${(budgetK * 1000).toLocaleString("en-AU")}`}>
        <input type="range" min={1} max={150} value={budgetK} onChange={(e) => setBudget(Number(e.target.value) * 100_000)} className="wi-range" style={{ width: "100%" }} />
      </Field>
      <Field label={`Daily target · A$${Math.round(target / 100)}`}>
        <input type="range" min={50} max={500} step={10} value={Math.round(target / 100)} onChange={(e) => setTarget(Number(e.target.value) * 100)} className="wi-range" style={{ width: "100%" }} />
      </Field>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 18 }}>
        {money0((budgetK * 1000) / days)}/day to spend the whole budget over the trip.
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <BigButton onClick={() => save.mutate()} disabled={save.isPending}>Save</BigButton>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <BigButton kind="ghost" onClick={() => archive.mutate()}>Archive trip</BigButton>
        <BigButton kind="danger"
          onClick={() => confirmingDelete ? remove.mutate() : setConfirmingDelete(true)}
          disabled={remove.isPending}>
          {remove.isPending ? "Deleting…" : confirmingDelete ? "Tap to confirm" : "Delete"}
        </BigButton>
      </div>
      {confirmingDelete && (
        <div style={{ fontSize: 12, color: "var(--over)", marginTop: 10, lineHeight: 1.5 }}>
          This wipes the trip plus its transactions, stays and cash logs. Tap the button again to confirm.
        </div>
      )}
    </Sheet>
  );
}

// Expose stay-with-burn helper for callers needing it.
export type { BurnState, StayView };
