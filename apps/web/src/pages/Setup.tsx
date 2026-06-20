import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, HttpError } from "../lib/api";
import { Card } from "../components/ui";

export function Setup() {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [upToken, setUpToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => api.setup.init(password, upToken),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
    onError: (e) => setError(e instanceof HttpError ? extractMsg(e) : "Something went wrong"),
  });

  const passwordsMatch = password.length > 0 && password === confirm;
  const ready = password.length >= 8 && passwordsMatch && upToken.trim().length > 0;

  return (
    <PageWrap>
      <Card pad={22}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Welcome to Up Travel</h1>
        <p style={{ marginTop: 8, fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>
          One-time setup. Choose a password you'll use to sign in, then paste
          your Up Bank Personal Access Token so the app can pull your transactions.
        </p>

        <Field label="Password">
          <input
            type="password" autoComplete="new-password" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="At least 8 characters"
          />
        </Field>

        <Field label="Confirm password">
          <input
            type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            placeholder="Type it again"
          />
          {confirm.length > 0 && !passwordsMatch && (
            <Hint tone="warn">Passwords don't match yet.</Hint>
          )}
        </Field>

        <Field label="Up Bank Personal Access Token">
          <input
            type="password" autoComplete="off" value={upToken}
            onChange={(e) => { setUpToken(e.target.value); setError(null); }}
            placeholder="up:yeah:..."
          />
          <Hint>
            Get one at <a href="https://api.up.com.au" target="_blank" rel="noreferrer">api.up.com.au</a>.
            It's only ever stored in your own Cloudflare account.
          </Hint>
        </Field>

        {error && <Hint tone="error">{error}</Hint>}

        <button
          type="button"
          disabled={!ready || submit.isPending}
          onClick={() => { setError(null); submit.mutate(); }}
          style={{
            marginTop: 18, width: "100%", border: 0, borderRadius: 12, padding: "12px",
            background: ready && !submit.isPending ? "var(--accent)" : "var(--chip)",
            color: ready && !submit.isPending ? "#fff" : "var(--ink-3)",
            fontSize: 14, fontWeight: 600,
            cursor: ready && !submit.isPending ? "pointer" : "not-allowed",
          }}
        >
          {submit.isPending ? "Setting up..." : "Finish setup"}
        </button>
      </Card>
    </PageWrap>
  );
}

function extractMsg(e: HttpError): string {
  try {
    const j = JSON.parse(e.body) as { error?: string };
    if (typeof j.error === "string") return j.error;
  } catch {
    // fall through
  }
  return e.body || "Something went wrong";
}

export function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 18, background: "var(--bg)",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 4 }}>{label}</div>
      <div className="field">{children}</div>
    </label>
  );
}

export function Hint({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "error" }) {
  const color = tone === "error" ? "var(--over)" : tone === "warn" ? "var(--watch)" : "var(--ink-3)";
  return <div style={{ fontSize: 12, color, marginTop: 6, lineHeight: 1.45 }}>{children}</div>;
}
