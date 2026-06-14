import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";

export interface ToastMessage {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss after this many ms. Default 5000. 0 = no auto-dismiss. */
  duration?: number;
}

interface ToastApi {
  show: (msg: Omit<ToastMessage, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const show = useCallback<ToastApi["show"]>((msg) => {
    const id = Math.random().toString(36).slice(2, 8);
    const next: ToastMessage = { duration: 5000, ...msg, id };
    // Only one toast at a time. Adding a new one supersedes the previous.
    setToasts([next]);
    if (next.duration && next.duration > 0) {
      const tm = setTimeout(() => dismiss(id), next.duration);
      timers.current.set(id, tm);
    }
    return id;
  }, [dismiss]);

  // Clear pending timers on unmount.
  useEffect(() => () => {
    timers.current.forEach((tm) => clearTimeout(tm));
    timers.current.clear();
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast must be used inside ToastProvider");
  return v;
}

function ToastHost({
  toasts, onDismiss,
}: {
  toasts: ToastMessage[]; onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: "fixed",
      left: 0, right: 0,
      // Sit just above where the tab bar would be on mobile, plus safe area.
      bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
      display: "flex", justifyContent: "center",
      pointerEvents: "none",
      zIndex: 50,
      padding: "0 16px",
    }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          pointerEvents: "auto",
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--surface)",
          color: "var(--ink)",
          padding: "10px 14px",
          borderRadius: 12,
          border: "0.5px solid var(--line)",
          boxShadow: "var(--shadow)",
          fontSize: 13.5,
          maxWidth: 440,
          width: "100%",
        }}>
          <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>
          {t.actionLabel && t.onAction && (
            <button
              type="button"
              onClick={() => { t.onAction!(); onDismiss(t.id); }}
              style={{
                border: 0, background: "transparent", cursor: "pointer",
                color: "var(--accent)", fontWeight: 600, fontSize: 13.5,
                fontFamily: "inherit", padding: "4px 6px",
              }}
            >{t.actionLabel}</button>
          )}
        </div>
      ))}
    </div>
  );
}
