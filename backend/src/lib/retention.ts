import { pool } from "../db/pool.js";
import { config } from "../config.js";

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runRetentionSweep(): Promise<void> {
  const now = new Date();

  for (let offset = 0; offset <= config.partitionLookaheadDays; offset++) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() + offset);
    await pool.query("SELECT ensure_log_partition($1::date)", [toDateOnly(day)]);
  }

  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - config.retentionDays);

  const { rows } = await pool.query<{ relname: string }>(
    `SELECT c.relname
       FROM pg_inherits i
       JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'logs'::regclass
        AND c.relname ~ '^logs_\\d{4}_\\d{2}_\\d{2}$'`,
  );

  for (const { relname } of rows) {
    const match = /^logs_(\d{4})_(\d{2})_(\d{2})$/.exec(relname);
    if (!match) continue;
    const [, y, m, d] = match;
    const partitionDay = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (partitionDay.getTime() < cutoff.getTime()) {
      await pool.query("SELECT drop_log_partition($1::date)", [toDateOnly(partitionDay)]);
      console.log(`[retention] dropped expired partition ${relname}`);
    }
  }
}

export function startRetentionLoop(): NodeJS.Timeout {
  return setInterval(() => {
    runRetentionSweep().catch((err) => {
      console.error("[retention] sweep failed", err);
    });
  }, config.retentionSweepIntervalMs);
}
