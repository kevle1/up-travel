import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
export function TrendChart({ data }: { data: { date: string; spent: number }[] }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">Daily spend</div>
      <div className="mt-3 h-40">
        <ResponsiveContainer>
          <LineChart data={data}>
            <XAxis
              dataKey="date"
              stroke="#475569"
              fontSize={10}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis
              stroke="#475569"
              fontSize={10}
              tickFormatter={(n) => `$${Math.round(n / 100)}`}
            />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }}
              formatter={(v: number) => `$${(v / 100).toFixed(2)}`}
            />
            <Line type="monotone" dataKey="spent" stroke="#34d399" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
