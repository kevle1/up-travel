import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type SheetNode = { node: ReactNode } | null;

interface SheetApi {
  open: (node: ReactNode) => void;
  close: () => void;
}

const SheetCtx = createContext<SheetApi | null>(null);

export function SheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetNode>(null);
  const api = useMemo<SheetApi>(() => ({
    open: (node) => setSheet({ node }),
    close: () => setSheet(null),
  }), []);

  // Close on Escape.
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") api.close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet, api]);

  return (
    <SheetCtx.Provider value={api}>
      {children}
      <SheetHost sheet={sheet} onClose={api.close} />
    </SheetCtx.Provider>
  );
}

export function useSheet(): SheetApi {
  const v = useContext(SheetCtx);
  if (!v) throw new Error("useSheet must be used inside SheetProvider");
  return v;
}

function SheetHost({ sheet, onClose }: { sheet: SheetNode; onClose: () => void }) {
  const open = !!sheet;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, pointerEvents: open ? "auto" : "none" }}>
      <div onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.42)", opacity: open ? 1 : 0, transition: "opacity .22s" }} />
      <div role="dialog" aria-modal="true" style={{
        position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "90dvh",
        background: "var(--bg)", borderRadius: "24px 24px 0 0", padding: "12px 18px 30px",
        boxShadow: "0 -10px 40px rgba(0,0,0,0.3)", borderTop: "0.5px solid var(--line)",
        transform: open ? "translateY(0)" : "translateY(100%)",
        transition: "transform .28s cubic-bezier(.3,.9,.3,1)",
        display: "flex", flexDirection: "column",
        maxWidth: 480, margin: "0 auto",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 99, background: "var(--line)", margin: "0 auto 6px", flexShrink: 0 }} />
        {sheet?.node}
      </div>
    </div>
  );
}
