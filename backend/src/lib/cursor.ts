import type { Cursor } from "../types.js";

/** Cursors are opaque to callers, base64url-encoded JSON of the last row's
 * (ts, id) — the same pair the ORDER BY / keyset predicate uses, so paging
 * is a plain index range scan rather than an OFFSET scan. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const obj = JSON.parse(json) as Partial<Cursor>;
    if (typeof obj.ts !== "string" || typeof obj.id !== "string") return null;
    if (Number.isNaN(new Date(obj.ts).getTime())) return null;
    if (!/^\d+$/.test(obj.id)) return null;
    return { ts: obj.ts, id: obj.id };
  } catch {
    return null;
  }
}
