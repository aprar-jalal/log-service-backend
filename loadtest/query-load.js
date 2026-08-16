// Fires repeated GET /logs and GET /logs/aggregate requests and reports
// latency percentiles. Usage: node query-load.js <baseUrl> <durationSec>
import { request, Agent } from "undici";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8080";
const durationSec = Number(process.argv[3] ?? 15);
const agent = new Agent({ connections: 10 });

async function timeRequest(path) {
  const t0 = performance.now();
  const res = await request(`${baseUrl}${path}`, { dispatcher: agent });
  await res.body.json();
  return { ms: performance.now() - t0, status: res.statusCode };
}

function percentiles(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { p50: pick(0.5), p95: pick(0.95), p99: pick(0.99) };
}

const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const until = new Date().toISOString();

const queryLatencies = [];
const aggLatencies = [];
const stop = Date.now() + durationSec * 1000;

let n = 0;
while (Date.now() < stop) {
  n++;
  const svc = ["checkout", "auth", "search", "billing", "inventory", "notifications"][n % 6];

  const q = await timeRequest(`/logs?service=${svc}&level=error&limit=100`);
  queryLatencies.push(q.ms);

  const a = await timeRequest(
    `/logs/aggregate?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=5m&group_by=service`,
  );
  aggLatencies.push(a.ms);
}

console.log(`--- query/aggregate latency (n=${n} iterations, ${durationSec}s) ---`);
console.log("GET /logs           p50/p95/p99 (ms):", JSON.stringify(percentiles(queryLatencies)));
console.log("GET /logs/aggregate p50/p95/p99 (ms):", JSON.stringify(percentiles(aggLatencies)));
