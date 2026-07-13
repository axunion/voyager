import { describe, expect, it } from "vitest";
import { formatMtime } from "./formatMtime";

describe("formatMtime", () => {
  it("formats null as an em dash", () => {
    expect(formatMtime(null)).toBe("—");
  });

  it("formats a known epoch as a date containing the year", () => {
    // 2023-06-15T12:00:00Z — noon UTC keeps every timezone within the same year.
    const result = formatMtime(1686830400);
    expect(result).toContain("2023");
  });

  it("does not crash on negative (pre-epoch) mtime", () => {
    expect(() => formatMtime(-1000)).not.toThrow();
  });
});
