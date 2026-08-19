import { LOG_LEVELS } from "../types.js";

export class QueryParamError extends Error {}

export interface ParsedFilters {
  service?: string;
  level?: string;
  since?: Date;
  until?: Date;
  attrFilters: Array<{ key: string; value: string }>;
  q?: string;
}


export function parseFilters(query: Record<string, unknown>): ParsedFilters {
  const filters: ParsedFilters = { attrFilters: [] };

  if (typeof query.service === "string" && query.service.length > 0) {
    filters.service = query.service;
  }

  if (query.level !== undefined) {
    const level = String(query.level);
    if (!LOG_LEVELS.includes(level as (typeof LOG_LEVELS)[number])) {
      throw new QueryParamError(`unsupported log level: '${level}'`);
    }
    filters.level = level;
  }

  if (query.since !== undefined) {
    const d = new Date(String(query.since));
    if (Number.isNaN(d.getTime())) throw new QueryParamError(`invalid 'since' timestamp: '${query.since}'`);
    filters.since = d;
  }

  if (query.until !== undefined) {
    const d = new Date(String(query.until));
    if (Number.isNaN(d.getTime())) throw new QueryParamError(`invalid 'until' timestamp: '${query.until}'`);
    filters.until = d;
  }

  if (filters.since && filters.until && filters.until.getTime() < filters.since.getTime()) {
    throw new QueryParamError("'until' must not be earlier than 'since'");
  }

  if (typeof query.q === "string" && query.q.length > 0) {
    filters.q = query.q;
  }

  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("attr.")) {
      const attrKey = key.slice("attr.".length);
      if (attrKey.length === 0) throw new QueryParamError("attribute filter key must not be empty");
      filters.attrFilters.push({ key: attrKey, value: String(value) });
    }
  }

  return filters;
}


export function buildWhere(filters: ParsedFilters, startParamIndex = 1): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = startParamIndex;

  if (filters.service !== undefined) {
    clauses.push(`service = $${i++}`);
    params.push(filters.service);
  }
  if (filters.level !== undefined) {
    clauses.push(`level = $${i++}`);
    params.push(filters.level);
  }
  if (filters.since !== undefined) {
    clauses.push(`ts >= $${i++}`);
    params.push(filters.since.toISOString());
  }
  if (filters.until !== undefined) {
    clauses.push(`ts < $${i++}`);
    params.push(filters.until.toISOString());
  }
  if (filters.q !== undefined) {
    clauses.push(`message ILIKE $${i++}`);
    params.push(`%${filters.q}%`);
  }
  for (const { key, value } of filters.attrFilters) {
    clauses.push(`(attributes ->> $${i++}) = $${i++}`);
    params.push(key, value);
  }

  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const BUCKET_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "1h": 3600,
  "1d": 86400,
};

export function parseBucket(raw: unknown): number {
  const s = String(raw);
  const seconds = BUCKET_SECONDS[s];
  if (!seconds) throw new QueryParamError(`invalid bucket: '${s}'. Supported: 1m, 5m, 1h, 1d`);
  return seconds;
}

export function parseGroupBy(raw: unknown): "service" | "level" | undefined {
  if (raw === undefined) return undefined;
  if (raw === "service" || raw === "level") return raw;
  throw new QueryParamError(`invalid group_by: '${String(raw)}'. Supported: service, level`);
}

export function parseLimit(raw: unknown): number {
  if (raw === undefined) return 100;
  const n = Number(raw);
  if (!Number.isInteger(n) || String(raw).trim() === "") throw new QueryParamError(`limit must be an integer`);
  if (n < 1 || n > 1000) throw new QueryParamError(`limit must be between 1 and 1000`);
  return n;
}
