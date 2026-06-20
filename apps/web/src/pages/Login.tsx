import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, HttpError } from "../lib/api";
import { Card } from "../components/ui";
import { Field, Hint, PageWrap } from "./Setup";

export function Login() {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => api.auth.login(password),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
    onError: (e) => {
      if (e instanceof HttpError && e.status === 429) {
        setError("Too many attempts. Try again in ~15 minutes.");
      } else {
        setError("Wrong password.");
      }
    },
  });

  return (
    <PageWrap>
      <Card pad={22}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--ink)" }}>Up Travel</h1>
        <p style={{ marginTop: 8, fontSize: 13.5, color: "var(--ink-2)" }}>Sign in to continue.</p>

        <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
          <Field label="Password">
            <input
              type="password" autoComplete="current-password" autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
            />
          </Field>

          {error && <Hint tone="error">{error}</Hint>}

          <button
            type="submit"
            disabled={password.length === 0 || submit.isPending}
            style={{
              marginTop: 18, width: "100%", border: 0, borderRadius: 12, padding: "12px",
              background: password && !submit.isPending ? "var(--accent)" : "var(--chip)",
              color: password && !submit.isPending ? "#fff" : "var(--ink-3)",
              fontSize: 14, fontWeight: 600,
              cursor: password && !submit.isPending ? "pointer" : "not-allowed",
            }}
          >
            {submit.isPending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </Card>
    </PageWrap>
  );
}
