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
 
  retentionDays: int(process.env.RETENTION_DAYS, 30),
  retentionSweepIntervalMs: int(process.env.RETENTION_SWEEP_INTERVAL_MS, 60_000),
  partitionLookaheadDays: int(process.env.PARTITION_LOOKAHEAD_DAYS, 3),

  authEnabled: bool(process.env.AUTH_ENABLED, false),
  loadgenApiKey: process.env.LOADGEN_API_KEY,

  rateLimitEnabled: bool(process.env.RATE_LIMIT_ENABLED, false),
  rateLimitPerSecond: int(process.env.RATE_LIMIT_PER_SECOND, 20_000),

  insertChunkSize: int(process.env.INSERT_CHUNK_SIZE, 10000),

  pgPoolMax: int(process.env.PG_POOL_MAX, 2),
};
