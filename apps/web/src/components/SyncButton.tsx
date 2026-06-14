import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Icon } from "./Icon";

// Small button shown in the trip header so you can manually pull Up data
// without waiting for the hourly cron. Especially useful in local dev where
// cron + webhooks don't fire.
export function SyncButton() {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const { data: status } = useQuery({
    queryKey: ["sync", "status"],
    queryFn: api.sync.status,
    refetchInterval: 60_000,
  });
  const sync = useMutation({
    mutationFn: (reset: boolean) => api.sync.run(reset),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["burn"] });
      qc.invalidateQueries({ queryKey: ["sync", "status"] });
      setMsg(r.ok ? `Synced ${r.processed ?? 0} txns` : `Failed: ${r.error ?? "unknown"}`);
      setTimeout(() => setMsg(null), 4000);
    },
    onError: (e) => {
      setMsg(`Failed: ${e instanceof Error ? e.message : String(e)}`);
      setTimeout(() => setMsg(null), 6000);
    },
  });

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {msg && (
        <span style={{ fontSize: 11, color: msg.startsWith("Failed") ? "var(--over)" : "var(--good)", whiteSpace: "nowrap" }}>
          {msg}
        </span>
      )}
      <button
        onClick={() => sync.mutate(false)}
        onContextMenu={(e) => { e.preventDefault(); sync.mutate(true); }}
        disabled={sync.isPending}
        type="button"
        title={status?.lastError
          ? `Last error: ${status.lastError}\nRight-click to reset watermark + full re-sync.`
          : "Pull latest from Up. Right-click to reset watermark + full re-sync."}
        style={{
          border: 0, background: "var(--chip)", borderRadius: 99,
          width: 30, height: 30, cursor: sync.isPending ? "wait" : "pointer",
          color: status?.lastError ? "var(--over)" : "var(--ink-2)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon name="refresh" size={18}
          style={{ animation: sync.isPending ? "spin 0.9s linear infinite" : undefined }} />
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
