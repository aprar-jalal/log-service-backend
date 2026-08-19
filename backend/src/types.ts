export type LogLevel = "debug" | "info" | "warn" | "error";
export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

export interface RawLogEntry {
  timestamp?: unknown;
  level?: unknown;
  service?: unknown;
  message?: unknown;
  attributes?: unknown;
}

export interface ValidatedLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Attributes;
}

export interface RejectedEntry {
  index: number;
  reason: string;
}

export interface LogRow {
  id: string;
  ts: string;
  level: LogLevel;
  service: string;
  message: string;
  attributes: Attributes;
}

export interface Cursor {
  ts: string;
  id: string; 
}
