import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AggregateBucket } from "../api";

interface Props {
  buckets: AggregateBucket[];
  bucketSize: string;
  onBucketSizeChange: (size: "1m" | "5m" | "1h" | "1d") => void;
  loading: boolean;
}

interface ChartPoint {
  start: string;
  label: string;
  count: number;
}

function toChartPoints(buckets: AggregateBucket[]): ChartPoint[] {
  const totals = new Map<string, number>();
  for (const b of buckets) {
    totals.set(b.start, (totals.get(b.start) ?? 0) + b.count);
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([start, count]) => ({
      start,
      label: new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      count,
    }));
}

export function AggregateChart({ buckets, bucketSize, onBucketSizeChange, loading }: Props) {
  const points = toChartPoints(buckets);
  const total = points.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="eyebrow">Volume over time · {total.toLocaleString()} logs</p>
        <select
          value={bucketSize}
          onChange={(e) => onBucketSizeChange(e.target.value as "1m" | "5m" | "1h" | "1d")}
          style={{
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          <option value="1m">1m buckets</option>
          <option value="5m">5m buckets</option>
          <option value="1h">1h buckets</option>
          <option value="1d">1d buckets</option>
        </select>
      </div>
      <div style={{ height: 260, marginTop: 8 }}>
        {points.length === 0 ? (
          <div className="empty-state">{loading ? "loading…" : "no data in this window"}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <defs>
                <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4dd9c7" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#4dd9c7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#232d3a" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="#8b98a8" fontSize={11} tickLine={false} axisLine={{ stroke: "#232d3a" }} />
              <YAxis stroke="#8b98a8" fontSize={11} tickLine={false} axisLine={{ stroke: "#232d3a" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#171f2a", border: "1px solid #232d3a", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#8b98a8" }}
              />
              <Area type="monotone" dataKey="count" stroke="#4dd9c7" strokeWidth={2} fill="url(#fillCount)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
