import { describe, expect, it } from "vitest";
import { validateEntry } from "./validation.js";

const NOW = new Date("2026-07-20T14:32:01.123Z");

describe("validateEntry", () => {
  it("accepts a well-formed entry", () => {
    const result = validateEntry(
      {
        timestamp: "2026-07-20T14:30:00.000Z",
        level: "error",
        service: "checkout",
        message: "payment declined",
        attributes: { user_id: "42", retries: 3, ok: false },
      },
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects missing timestamp", () => {
    const result = validateEntry({ level: "info", service: "a", message: "m" }, NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects invalid timestamp", () => {
    const result = validateEntry({ timestamp: "not-a-date", level: "info", service: "a", message: "m" }, NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects timestamps more than 5 minutes in the future", () => {
    const future = new Date(NOW.getTime() + 6 * 60 * 1000).toISOString();
    const result = validateEntry({ timestamp: future, level: "info", service: "a", message: "m" }, NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects unknown levels", () => {
    const result = validateEntry(
      { timestamp: NOW.toISOString(), level: "critical", service: "a", message: "m" },
      NOW,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects empty service and message", () => {
    expect(validateEntry({ timestamp: NOW.toISOString(), level: "info", service: "", message: "m" }, NOW).ok).toBe(
      false,
    );
    expect(validateEntry({ timestamp: NOW.toISOString(), level: "info", service: "a", message: "" }, NOW).ok).toBe(
      false,
    );
  });

  it("rejects nested attribute objects and arrays", () => {
    const nested = validateEntry(
      { timestamp: NOW.toISOString(), level: "info", service: "a", message: "m", attributes: { x: { y: 1 } } },
      NOW,
    );
    expect(nested.ok).toBe(false);

    const arr = validateEntry(
      { timestamp: NOW.toISOString(), level: "info", service: "a", message: "m", attributes: { x: [1, 2] } },
      NOW,
    );
    expect(arr.ok).toBe(false);
  });

  it("defaults attributes to an empty object when omitted", () => {
    const result = validateEntry({ timestamp: NOW.toISOString(), level: "info", service: "a", message: "m" }, NOW);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.attributes).toEqual({});
  });
});
