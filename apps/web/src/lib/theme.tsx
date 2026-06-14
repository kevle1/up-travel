import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** Resolved theme actually applied right now (after system detection). */
  resolved: "light" | "dark";
}

const ThemeCtx = createContext<ThemeState | null>(null);
const STORAGE_KEY = "up-travel:theme";

function load(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "system";
    const parsed = JSON.parse(raw) as { mode?: ThemeMode; dark?: boolean };
    return parsed.mode ?? (parsed.dark ? "dark" : "system");
  } catch {
    return "system";
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(load);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-theme", resolved);
    r.style.colorScheme = resolved;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode }));
  }, [resolved, mode]);

  const value = useMemo<ThemeState>(() => ({ mode, setMode, resolved }), [mode, resolved]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeState {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme must be used inside ThemeProvider");
  return v;
}
