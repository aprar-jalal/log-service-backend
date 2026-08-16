export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Record<string, string | number | boolean>;
}

export interface LogsResponse {
  logs: LogEntry[];
  next_cursor: string | null;
}

export interface AggregateBucket {
  start: string;
  group: string | null;
  count: number;
}

export interface AggregateResponse {
  buckets: AggregateBucket[];
}

export interface Filters {
  service?: string;
  level?: LogLevel | "";
  since?: string;
  until?: string;
  q?: string;
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.service) params.set("service", filters.service);
  if (filters.level) params.set("level", filters.level);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  if (filters.q) params.set("q", filters.q);
  return params;
}

export async function fetchLogs(filters: Filters, cursor?: string | null): Promise<LogsResponse> {
  const params = filterParams(filters);
  params.set("limit", "50");
  if (cursor) params.set("cursor", cursor);
  return request<LogsResponse>(`/logs?${params.toString()}`);
}

export async function fetchAggregate(
  filters: Filters,
  since: string,
  until: string,
  bucket: "1m" | "5m" | "1h" | "1d",
  groupBy?: "service" | "level",
): Promise<AggregateResponse> {
  const params = filterParams(filters);
  params.set("since", since);
  params.set("until", until);
  params.set("bucket", bucket);
  if (groupBy) params.set("group_by", groupBy);
  return request<AggregateResponse>(`/logs/aggregate?${params.toString()}`);
}

export async function fetchHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
