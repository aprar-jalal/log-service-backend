// Concurrent-batch ingestion load test against POST /logs.
// Usage: node ingest-load.js <baseUrl> <durationSec> <concurrency> <batchSize>
import { request, Agent } from "undici";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8080";
const durationSec = Number(process.argv[3] ?? 20);
const concurrency = Number(process.argv[4] ?? 20);
const batchSize = Number(process.argv[5] ?? 500);

const agent = new Agent({ connections: concurrency + 5, pipelining: 1 });

const SERVICES = ["checkout", "auth", "search", "billing", "inventory", "notifications"];
const LEVELS = ["debug", "info", "warn", "error"];
const REGIONS = ["us-east", "us-west", "eu-west", "ap-south"];

function makeBatch(n) {
  const now = Date.now();
  const logs = [];
  for (let i = 0; i < n; i++) {
    logs.push({
      timestamp: new Date(now - Math.floor(Math.random() * 1000)).toISOString(),
      level: LEVELS[Math.floor(Math.random() * LEVELS.length)],
      service: SERVICES[Math.floor(Math.random() * SERVICES.length)],
      message: `request completed in ${Math.floor(Math.random() * 900)}ms`,
      attributes: {
        user_id: String(Math.floor(Math.random() * 100000)),
        region: REGIONS[Math.floor(Math.random() * REGIONS.length)],
        retries: Math.floor(Math.random() * 3),
        cached: Math.random() > 0.5,
      },
    });
  }
  return JSON.stringify({ logs });
}

let totalAccepted = 0;
let totalRejected = 0;
let totalRequests = 0;
let errors = 0;
const latencies = [];

const stop = Date.now() + durationSec * 1000;

async function worker() {
  while (Date.now() < stop) {
    const body = makeBatch(batchSize);
    const t0 = performance.now();
    try {
      const res = await request(`${baseUrl}/logs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        dispatcher: agent,
      });
      const json = await res.body.json();
      latencies.push(performance.now() - t0);
      totalRequests++;
      if (res.statusCode === 200) {
        totalAccepted += json.accepted ?? 0;
        totalRejected += (json.rejected ?? []).length;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }
}

const started = Date.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsedSec = (Date.now() - started) / 1000;

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;

console.log(`--- ingest load test ---`);
console.log(`duration:        ${elapsedSec.toFixed(1)}s`);
console.log(`concurrency:      ${concurrency}`);
console.log(`batch size:       ${batchSize}`);
console.log(`requests:         ${totalRequests}`);
console.log(`errors:           ${errors}`);
console.log(`accepted logs:    ${totalAccepted}`);
console.log(`rejected logs:    ${totalRejected}`);
console.log(`logs/sec:         ${(totalAccepted / elapsedSec).toFixed(0)}`);
console.log(`batch p50/p95/p99 latency (ms): ${p50.toFixed(1)} / ${p95.toFixed(1)} / ${p99.toFixed(1)}`);
