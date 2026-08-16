import { describe, expect, it } from "vitest";
import { buildWhere, parseBucket, parseFilters, parseLimit, QueryParamError } from "./queryBuilder.js";

describe("parseFilters", () => {
  it("parses combined filters", () => {
    const f = parseFilters({
      service: "checkout",
      level: "error",
      since: "2026-07-20T14:00:00Z",
      until: "2026-07-20T15:00:00Z",
      "attr.user_id": "42",
      q: "declined",
    });
    expect(f.service).toBe("checkout");
    expect(f.level).toBe("error");
    expect(f.attrFilters).toEqual([{ key: "user_id", value: "42" }]);
    expect(f.q).toBe("declined");
  });

  it("rejects unsupported levels", () => {
    expect(() => parseFilters({ level: "critical" })).toThrow(QueryParamError);
  });

  it("rejects until earlier than since", () => {
    expect(() =>
      parseFilters({ since: "2026-07-20T15:00:00Z", until: "2026-07-20T14:00:00Z" }),
    ).toThrow(QueryParamError);
  });

  it("rejects invalid timestamps", () => {
    expect(() => parseFilters({ since: "not-a-date" })).toThrow(QueryParamError);
  });
});

describe("buildWhere", () => {
  it("never inlines values into SQL text", () => {
    const f = parseFilters({ service: "checkout", "attr.user_id": "42" });
    const { sql, params } = buildWhere(f);
    expect(sql).not.toContain("checkout");
    expect(sql).not.toContain("42");
    expect(params).toContain("checkout");
    expect(params).toContain("42");
  });
});

describe("parseLimit", () => {
  it("defaults to 100", () => {
    expect(parseLimit(undefined)).toBe(100);
  });
  it("rejects non-numeric limits", () => {
    expect(() => parseLimit("abc")).toThrow(QueryParamError);
  });
  it("rejects out-of-range limits", () => {
    expect(() => parseLimit("0")).toThrow(QueryParamError);
    expect(() => parseLimit("1001")).toThrow(QueryParamError);
  });
});

describe("parseBucket", () => {
  it("accepts supported bucket sizes", () => {
    expect(parseBucket("1m")).toBe(60);
    expect(parseBucket("1h")).toBe(3600);
  });
  it("rejects unsupported bucket sizes", () => {
    expect(() => parseBucket("30s")).toThrow(QueryParamError);
  });
});
