import pg from "pg";
import { config } from "../config.js";

// Return bigint (int8) columns as JS numbers/strings safely: we keep them as
// strings (pg default) to avoid precision loss and stringify ids consistently.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.pgPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  // Prevents an idle client error from crashing the process.
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle pg client", err);
});

export async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
