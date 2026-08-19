import type { FastifyInstance, FastifyRequest } from "fastify";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { validateEntry } from "../lib/validation.js";
import { buildWhere, parseFilters, parseLimit, QueryParamError } from "../lib/queryBuilder.js";
import { decodeCursor, encodeCursor } from "../lib/cursor.js";
import { requireAuth } from "../middleware/auth.js";
import type { RawLogEntry, RejectedEntry, ValidatedLogEntry } from "../types.js";

interface IngestBody {
  logs?: unknown;
}

async function insertAccepted(entries: ValidatedLogEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i += config.insertChunkSize) {
    const chunk = entries.slice(i, i + config.insertChunkSize);
    const ts: string[] = [];
    const level: string[] = [];
    const service: string[] = [];
    const message: string[] = [];
    const attributes: string[] = [];
    for (const e of chunk) {
      ts.push(e.timestamp);
      level.push(e.level);
      service.push(e.service);
      message.push(e.message);
      attributes.push(JSON.stringify(e.attributes));
    }
    
    await pool.query(
      `INSERT INTO logs (ts, level, service, message, attributes)
       SELECT * FROM unnest(
         $1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::jsonb[]
       )`,
      [ts, level, service, message, attributes],
    );
  }
}

export async function logRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: IngestBody }>("/logs", { preHandler: requireAuth }, async (req, reply) => {
    const body = req.body;
    if (typeof body !== "object" || body === null || !Array.isArray(body.logs)) {
      reply.code(400).send({ error: "request body must be an object with a 'logs' array" });
      return;
    }

    const rawLogs = body.logs as RawLogEntry[];
    const accepted: ValidatedLogEntry[] = [];
    const rejected: RejectedEntry[] = [];
    const now = new Date();

    rawLogs.forEach((raw, index) => {
      const result = validateEntry(raw, now);
      if (result.ok) {
        accepted.push(result.entry);
      } else {
        rejected.push({ index, reason: result.reason });
      }
    });

    if (accepted.length > 0) {
      // Only ever ack a batch to the caller after it is durably committed.
      await insertAccepted(accepted);
    }

    const status = accepted.length > 0 ? 200 : 400;
    reply.code(status).send({ accepted: accepted.length, rejected });
  });

  app.get("/logs", { preHandler: requireAuth }, async (req: FastifyRequest, reply) => {
    const query = req.query as Record<string, unknown>;
    let filters;
    let limit: number;
    let cursor;
    try {
      filters = parseFilters(query);
      limit = parseLimit(query.limit);
      if (query.cursor !== undefined) {
        cursor = decodeCursor(String(query.cursor));
        if (!cursor) throw new QueryParamError("invalid cursor");
      }
    } catch (err) {
      if (err instanceof QueryParamError) {
        reply.code(400).send({ error: err.message });
        return;
      }
      throw err;
    }

    const { sql: whereSql, params } = buildWhere(filters);
    const clauses: string[] = whereSql ? [whereSql.slice("WHERE ".length)] : [];
    if (cursor) {
      params.push(cursor.ts, cursor.id);
      clauses.push(`(ts, id) < ($${params.length - 1}::timestamptz, $${params.length}::bigint)`);
    }
    const finalWhere = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    params.push(limit + 1);
    const sql = `
      SELECT id, ts, level, service, message, attributes
        FROM logs
        ${finalWhere}
       ORDER BY ts DESC, id DESC
       LIMIT $${params.length}
    `;

    interface DbRow {
      id: string;
      ts: Date;
      level: string;
      service: string;
      message: string;
      attributes: Record<string, unknown>;
    }
    const { rows } = await pool.query<DbRow>(sql, params);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const logs = page.map((r) => ({
      id: String(r.id),
      timestamp: r.ts.toISOString(),
      level: r.level,
      service: r.service,
      message: r.message,
      attributes: r.attributes,
    }));

    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ ts: last.ts.toISOString(), id: String(last.id) }) : null;

    reply.code(200).send({ logs, next_cursor: nextCursor });
  });
}
