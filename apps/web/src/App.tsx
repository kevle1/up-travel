import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./lib/api";
import { SheetProvider } from "./lib/sheet";
import { useTheme, type ThemeMode } from "./lib/theme";
import { Today } from "./pages/Today";
import { Trends } from "./pages/Trends";
import { Spend } from "./pages/Spend";
import { Stays } from "./pages/Stays";
import { Cash } from "./pages/Cash";
import type { ChartStyle } from "./components/charts";
import { Card } from "./components/ui";
import { SyncButton } from "./components/SyncButton";
import { ExportButton } from "./components/ExportButton";
import { TripCreator } from "./components/editors";
import { Icon } from "./components/Icon";
import { useSheet } from "./lib/sheet";

type TabId = "today" | "trends" | "spend" | "stays" | "cash";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "trends", label: "Trends", icon: "monitoring" },
  { id: "spend", label: "Spend", icon: "receipt_long" },
  { id: "stays", label: "Stays", icon: "hotel" },
  { id: "cash", label: "Cash", icon: "payments" },
];

export function App() {
  return (
    <SheetProvider>
      <Shell />
    </SheetProvider>
  );
}

function Shell() {
  const [tab, setTab] = useState<TabId>("today");
  const [chartStyle, setChartStyle] = useState<ChartStyle>("bars");
  const qc = useQueryClient();
  const burnQ = useQuery({
    queryKey: ["burn"],
    queryFn: () => api.burn(),
    refetchInterval: 60_000,
    retry: false,
  });

  const noTripYet = burnQ.error?.message.startsWith("404");

  // Background sync once the user has a trip and the app is open. Watermark-
  // based, so it just asks Up "what's new since last time" — cheap. Guarded
  // by a ref so it only fires once per page load.
  const autoSync = useMutation({
    mutationFn: () => api.sync.run(false),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["burn"] });
      qc.invalidateQueries({ queryKey: ["sync", "status"] });
    },
  });
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (didAutoSync.current) return;
    if (noTripYet) return;
    if (!burnQ.data) return;
    didAutoSync.current = true;
    autoSync.mutate();
  }, [burnQ.data, noTripYet, autoSync]);

  let content: ReactNode;
  if (burnQ.isLoading) {
    content = <div style={{ color: "var(--ink-3)", padding: 12 }}>Loading…</div>;
  } else if (noTripYet) {
    content = <EmptyTrip />;
  } else if (burnQ.error || !burnQ.data) {
    content = (
      <Card pad={18} style={{ color: "var(--over)" }}>
        Couldn't load your trip. <br />
        <span style={{ color: "var(--ink-3)", fontSize: 12 }}>
          {burnQ.error instanceof Error ? burnQ.error.message : "Unknown error"}
        </span>
      </Card>
    );
  } else {
    const b = burnQ.data;
    content = tab === "today" ? <Today burn={b} />
      : tab === "trends" ? <Trends burn={b} chartStyle={chartStyle} />
      : tab === "spend" ? <Spend burn={b} />
      : tab === "stays" ? <Stays burn={b} />
      : <Cash burn={b} />;
  }

  return (
    <div className="app">
      <div className="app__scroll">
        <div className="app__header">
          <div className="app__title"><strong>Up Travel</strong> Spend Tracker</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!noTripYet && <SyncButton />}
            {!noTripYet && <ExportButton />}
            <SettingsButton chartStyle={chartStyle} onChartStyle={setChartStyle} />
          </div>
        </div>
        {content}
      </div>
      {!noTripYet && (
        <div className="app__tabbar">
          {TABS.map((tb) => {
            const on = tab === tb.id;
            return (
              <button key={tb.id} onClick={() => setTab(tb.id)} type="button" style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                border: 0, background: "transparent", cursor: "pointer", padding: "3px 0",
                color: on ? "var(--accent)" : "var(--ink-3)",
              }}>
                <Icon name={tb.icon} size={24} fill={on} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".01em" }}>{tb.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyTrip() {
  const sheet = useSheet();
  return (
    <Card pad={20} style={{ marginTop: 8 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>No trip yet</div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>
        Create a trip with a date range and budget. Then hit the sync button up top to pull your Up transactions.
      </div>
      <button onClick={() => sheet.open(<TripCreator />)} type="button" style={{
        marginTop: 16, width: "100%", border: 0, borderRadius: 12, padding: "12px",
        background: "var(--accent)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
      }}>+ Create a trip</button>
    </Card>
  );
}

function SettingsButton({
  chartStyle, onChartStyle,
}: {
  chartStyle: ChartStyle; onChartStyle: (v: ChartStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const { mode, setMode } = useTheme();
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} type="button" style={{
        border: 0, background: "var(--chip)", borderRadius: 99,
        width: 32, height: 32, cursor: "pointer", color: "var(--ink-2)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }} title="Settings">
        <Icon name="tune" size={18} />
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: 38, zIndex: 30,
          background: "var(--surface)", borderRadius: 14, padding: 14,
          border: "0.5px solid var(--line)", boxShadow: "var(--shadow)",
          minWidth: 240,
        }}>
          <Row label="Theme">
            <Segmented<ThemeMode>
              value={mode}
              onChange={setMode}
              options={[{ value: "system", label: "Auto" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
            />
          </Row>
          <Row label="Chart">
            <Segmented<ChartStyle>
              value={chartStyle}
              onChange={onChartStyle}
              options={[{ value: "bars", label: "Bars" }, { value: "area", label: "Area" }, { value: "line", label: "Line" }]}
            />
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "0.5px solid var(--line)" }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div style={{ display: "inline-flex", background: "var(--chip)", borderRadius: 99, padding: 2 }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} type="button" style={{
            border: 0, cursor: "pointer", borderRadius: 99, padding: "3px 10px",
            fontSize: 11.5, fontWeight: 600,
            background: on ? "var(--surface)" : "transparent",
            color: on ? "var(--ink)" : "var(--ink-2)",
            boxShadow: on ? "0 1px 2px rgba(0,0,0,.1)" : "none",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}
