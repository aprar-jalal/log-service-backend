import { LOG_LEVELS, type Attributes, type RawLogEntry, type ValidatedLogEntry } from "../types.js";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export interface ValidationResult {
  ok: true;
  entry: ValidatedLogEntry;
}
export interface ValidationFailure {
  ok: false;
  reason: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateAttributes(raw: unknown): Attributes | string {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) return "attributes must be a flat object";
  const out: Attributes = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null) return `attribute '${key}' must not be null`;
    const t = typeof value;
    if (t === "object") return `attribute '${key}' must not be a nested object or array`;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      return `attribute '${key}' has unsupported type '${t}'`;
    }
    out[key] = value as Attributes[string];
  }
  return out;
}

export function validateEntry(raw: RawLogEntry, now: Date = new Date()): ValidationResult | ValidationFailure {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "entry must be an object" };
  }

  if (typeof raw.timestamp !== "string" || raw.timestamp.trim() === "") {
    return { ok: false, reason: "timestamp is required" };
  }
  const parsed = new Date(raw.timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, reason: `invalid timestamp: '${raw.timestamp}'` };
  }
  if (parsed.getTime() - now.getTime() > FIVE_MINUTES_MS) {
    return { ok: false, reason: "timestamp is more than five minutes in the future" };
  }

  if (typeof raw.level !== "string" || !LOG_LEVELS.includes(raw.level as (typeof LOG_LEVELS)[number])) {
    return { ok: false, reason: `invalid level: '${String(raw.level)}'` };
  }

  if (typeof raw.service !== "string" || raw.service.trim() === "") {
    return { ok: false, reason: "service is required and must be a non-empty string" };
  }

  if (typeof raw.message !== "string" || raw.message.trim() === "") {
    return { ok: false, reason: "message is required and must be a non-empty string" };
  }

  const attributes = validateAttributes(raw.attributes);
  if (typeof attributes === "string") {
    return { ok: false, reason: attributes };
  }

  return {
    ok: true,
    entry: {
      timestamp: parsed.toISOString(),
      level: raw.level as ValidatedLogEntry["level"],
      service: raw.service,
      message: raw.message,
      attributes,
    },
  };
}
