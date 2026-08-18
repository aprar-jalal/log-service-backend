import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
      label: new Date(start).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      count,
    }));
}

export function AggregateChart({
  buckets,
  bucketSize,
  onBucketSizeChange,
  loading,
}: Props) {
  const points = toChartPoints(buckets);
  const total = points.reduce((sum, p) => sum + p.count, 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Log volume</h2>
          <p>Events grouped over time</p>
        </div>

        <select
          className="bucket"
          value={bucketSize}
          onChange={(e) =>
            onBucketSizeChange(
              e.target.value as "1m" | "5m" | "1h" | "1d"
            )
          }
        >
          <option value="1m">1 min</option>
          <option value="5m">5 min</option>
          <option value="1h">1 hour</option>
          <option value="1d">1 day</option>
        </select>
      </div>

      <div className="chart-total">
        <strong>{total.toLocaleString()}</strong>
        <span>Total events</span>
      </div>

      <div className="chart">
        {points.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">⌁</div>
            <strong>No data in this window</strong>
            <span>Try changing the selected time range.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points}>
              <defs>
                <linearGradient
                  id="fillCount"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#5b5ce2" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#5b5ce2" stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="#e8edf3"
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                fontSize={9}
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                stroke="#94a3b8"
                fontSize={9}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />

              <Tooltip
                contentStyle={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 7,
                  boxShadow: "0 8px 20px rgba(15,23,42,.08)",
                  fontSize: 10,
                }}
                labelStyle={{
                  color: "#64748b",
                  marginBottom: 4,
                }}
              />

              <Area
                type="monotone"
                dataKey="count"
                stroke="#5b5ce2"
                strokeWidth={2}
                fill="url(#fillCount)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
