import Fastify from "fastify";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { readiness } from "./lib/readiness.js";
import { runRetentionSweep, startRetentionLoop } from "./lib/retention.js";
import { seedLoadgenKey } from "./middleware/auth.js";
import { healthRoutes } from "./routes/health.js";
import { logRoutes } from "./routes/logs.js";
import { aggregateRoutes } from "./routes/aggregate.js";

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 25 * 1024 * 1024, // batches can be large; 25MB is generous headroom
});

// Malformed JSON must yield the same 400 contract as other bad requests,
// not a generic 500.
app.setErrorHandler((err, req, reply) => {
  if ((err as { statusCode?: number }).statusCode === 400) {
    reply.code(400).send({ error: "malformed request body" });
    return;
  }
  req.log.error(err);
  reply.code(500).send({ error: "internal server error" });
});

// --- Optional feature: rate limiting, off by default. When enabled, the
// seeded load generator key is always exempt, per the load-generator
// contract. This is a simple fixed-window counter — enough to shed load
// under a genuine spike without adding an external dependency. ---
let windowStart = Date.now();
let windowCount = 0;
app.addHook("onRequest", async (req, reply) => {
  if (!config.rateLimitEnabled) return;
  if (req.url === "/health") return;

  const authHeader = req.headers["authorization"];
  if (config.loadgenApiKey && typeof authHeader === "string" && authHeader.includes(config.loadgenApiKey)) {
    return; // seeded load generator key is always exempt
  }

  const now = Date.now();
  if (now - windowStart >= 1000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount++;
  if (windowCount > config.rateLimitPerSecond) {
    reply.code(429).header("Retry-After", "1").send({ error: "rate limit exceeded" });
  }
});

await app.register(healthRoutes);
await app.register(logRoutes);
await app.register(aggregateRoutes);

async function main(): Promise<void> {
  await runMigrations();
  await seedLoadgenKey();
  await runRetentionSweep(); // ensure current/near-future partitions exist before accepting traffic
  startRetentionLoop();

  readiness.ready = true;

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`log service listening on :${config.port}`);
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
