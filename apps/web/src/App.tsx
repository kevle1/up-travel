import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { Trips } from "./pages/Trips";
import { Settings } from "./pages/Settings";
import { Itinerary } from "./pages/Itinerary";
import { History } from "./pages/History";

function Nav() {
  const link = "px-3 py-2 text-sm font-medium";
  const active = ({ isActive }: { isActive: boolean }) =>
    `${link} ${isActive ? "text-white" : "text-slate-400 hover:text-slate-200"}`;
  return (
    <nav className="flex gap-1 border-b border-slate-800 bg-slate-950/80 px-2 py-2 backdrop-blur sticky top-0 z-10">
      <NavLink to="/" className={active} end>
        Dashboard
      </NavLink>
      <NavLink to="/trips" className={active}>
        Trips
      </NavLink>
      <NavLink to="/itinerary" className={active}>
        Itinerary
      </NavLink>
      <NavLink to="/settings" className={active}>
        Settings
      </NavLink>
      <NavLink to="/history" className={active}>
        History
      </NavLink>
    </nav>
  );
}

export function App() {
  return (
    <div className="min-h-full">
      <Nav />
      <main className="mx-auto max-w-3xl px-3 pb-24 pt-3">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/itinerary" element={<Itinerary />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
