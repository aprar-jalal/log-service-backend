import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "../db/pool.js";
import { config } from "../config.js";

export async function seedLoadgenKey(): Promise<void> {
  if (!config.authEnabled || !config.loadgenApiKey) return;
  await pool.query(
    `INSERT INTO api_keys (key, tenant, scopes)
     VALUES ($1, 'loadgen', ARRAY['ingest','query'])
     ON CONFLICT (key) DO NOTHING`,
    [config.loadgenApiKey],
  );
}

function extractKey(req: FastifyRequest): string | null {
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (m) return m[1] ?? null;
  }
  const apiKeyHeader = req.headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.length > 0) return apiKeyHeader;
  return null;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.authEnabled) return;

  const key = extractKey(req);
  if (!key) {
    reply.code(401).send({ error: "missing or malformed credential" });
    return reply;
  }

  const { rows } = await pool.query<{ tenant: string; scopes: string[] }>(
    "SELECT tenant, scopes FROM api_keys WHERE key = $1",
    [key],
  );
  const row = rows[0];
  if (!row) {
    reply.code(401).send({ error: "missing or malformed credential" });
    return reply;
  }

  const requiredScope = req.method === "POST" ? "ingest" : "query";
  if (!row.scopes.includes(requiredScope)) {
    reply.code(403).send({ error: `credential lacks '${requiredScope}' scope` });
    return reply;
  }

  (req as FastifyRequest & { tenant?: string }).tenant = row.tenant;
}
