import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseItinerary } from "@up-travel/shared";
import { api } from "../lib/api";

export function Itinerary() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["itinerary"], queryFn: api.itinerary.get });
  const [paste, setPaste] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const preview = parseItinerary(paste, year);

  useEffect(() => {
    if (!q.data) return;
    setPaste(
      q.data
        .map(
          (e) =>
            `${e.startDate.slice(8, 10)}-${e.endDate.slice(8, 10)} ${monthName(e.startDate)} ${e.city}, ${e.country}`,
        )
        .join("\n"),
    );
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.itinerary.save(paste, year),
    onSuccess: () => qc.invalidateQueries(),
  });

  function monthName(iso: string): string {
    return new Date(iso + "T00:00:00Z").toLocaleString("en", { month: "short" });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-slate-500">Paste itinerary</h2>
        <p className="text-xs text-slate-500">
          Examples: <code className="text-slate-300">1-10 Jun Tokyo, JP</code>,{" "}
          <code className="text-slate-300">Jun 1-10 Tokyo, JP</code>,{" "}
          <code className="text-slate-300">1/6-10/6 Tokyo, JP</code>. Blank lines and <code>#</code>{" "}
          comments are ignored.
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm">Year:</label>
          <input
            className="w-24 rounded bg-slate-800 px-2 py-1"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
        <textarea
          className="w-full min-h-[200px] rounded bg-slate-800 p-3 font-mono text-sm"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <button
          onClick={() => save.mutate()}
          disabled={preview.errors.length > 0}
          className="rounded bg-emerald-500 px-4 py-2 text-slate-950 disabled:opacity-50"
        >
          Save
        </button>
      </section>

      <section className="rounded-2xl bg-slate-900 p-5">
        <h2 className="text-sm uppercase tracking-wide text-slate-500">Preview</h2>
        {preview.errors.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-rose-400">
            {preview.errors.map((e, i) => (
              <li key={i}>
                Line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800 text-sm">
            {preview.entries.map((e, i) => (
              <li key={i} className="py-2">
                {e.startDate} → {e.endDate} · {e.city}, {e.country}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
