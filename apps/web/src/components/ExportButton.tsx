import { useQuery } from "@tanstack/react-query";
import { paymentLabel, travelLabel, upLabel } from "@up-travel/shared";
import { api } from "../lib/api";
import { fmtMethod } from "../lib/format";
import { Icon } from "./Icon";

// CSV-safe quote: wrap fields containing comma, quote or newline; double up "s.
function csv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ExportButton() {
  const { data: burn } = useQuery({ queryKey: ["burn"], queryFn: () => api.burn() });

  const onClick = () => {
    if (!burn) return;
    // For accommodation rows, look up the stay so we can include its nights
    // count alongside the existing stay_id.
    const stayById = new Map(burn.stays.map((s) => [s.id, s]));
    const header = [
      "date", "description", "amount_aud", "foreign_amount", "foreign_currency",
      "travel_category", "up_category", "method", "city", "source",
      "is_accom", "stay_id", "stay_nights",
      "excluded", "incoming", "spread_days", "payment_method", "is_cash", "notes",
    ];
    const rows = burn.feed.map((r) => {
      const stay = r.stayId != null ? stayById.get(r.stayId) : undefined;
      return [
        r.date,
        r.description,
        r.aud.toFixed(2),
        r.foreign ? r.foreign.value.toFixed(2) : "",
        r.foreign ? r.foreign.currencyCode : "",
        travelLabel(r.category),
        upLabel(r.upTag),
        fmtMethod(r.method) ?? paymentLabel(r.paymentMethod) ?? "",
        r.city ?? "",
        r.source,
        r.isAccom ? "yes" : "",
        r.stayId ?? "",
        stay?.nights ?? "",
        r.excluded ? "yes" : "",
        r.incoming ? (r.countsAsCredit ? "credit" : "yes") : "",
        r.spreadDays ?? "",
        r.paymentMethod ?? "",
        r.isCash ? "yes" : "",
        r.notes ?? "",
      ];
    });
    const body = [header, ...rows].map((row) => row.map(csv).join(",")).join("\n");
    // Prefix with BOM so Excel detects UTF-8.
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = burn.trip.name.replace(/[^A-Za-z0-9_-]+/g, "_");
    a.href = url;
    a.download = `${safeName}_${burn.trip.startDate}_${burn.trip.endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <button onClick={onClick} type="button" disabled={!burn} title="Export trip transactions as CSV" style={{
      border: 0, background: "var(--chip)", borderRadius: 99,
      width: 30, height: 30, cursor: burn ? "pointer" : "not-allowed",
      color: "var(--ink-2)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      opacity: burn ? 1 : 0.5,
    }}>
      <Icon name="download" size={18} />
    </button>
  );
}
