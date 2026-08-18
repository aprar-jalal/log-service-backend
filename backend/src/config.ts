function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

function int(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 8080),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://logs:logs@postgres:5432/logs",
  // Retention: how many days of logs to keep. Enforced by dropping whole
  // day partitions, never DELETE, so it never takes long-running locks.
  retentionDays: int(process.env.RETENTION_DAYS, 30),
  // How often the retention/partition-maintenance sweep runs.
  retentionSweepIntervalMs: int(process.env.RETENTION_SWEEP_INTERVAL_MS, 60_000),
  // How many days of partitions to pre-create ahead of "now".
  partitionLookaheadDays: int(process.env.PARTITION_LOOKAHEAD_DAYS, 3),

  // --- Optional auth (see README: Authentication and API Keys) ---
  authEnabled: bool(process.env.AUTH_ENABLED, false),
  loadgenApiKey: process.env.LOADGEN_API_KEY,

  // --- Optional rate limiting (off by default, exempts the seeded key) ---
  rateLimitEnabled: bool(process.env.RATE_LIMIT_ENABLED, false),
  rateLimitPerSecond: int(process.env.RATE_LIMIT_PER_SECOND, 20_000),

  // Ingestion batch insert chunk size (rows per multi-row INSERT statement).
  insertChunkSize: int(process.env.INSERT_CHUNK_SIZE, 10000),

  // Postgres pool sizing. Kept modest since Postgres has 1 CPU / 1GB RAM.
  pgPoolMax: int(process.env.PG_POOL_MAX, 2),
};
