import { describe, expect, it } from "vitest";
import { formatSize } from "./formatSize";

describe("formatSize", () => {
  it("formats null as an em dash", () => {
    expect(formatSize(null)).toBe("—");
  });

  it("formats zero bytes", () => {
    expect(formatSize(0)).toBe("0 B");
  });

  it("formats sub-kilobyte sizes without decimals", () => {
    expect(formatSize(999)).toBe("999 B");
  });

  it("formats the 1000-byte boundary as kilobytes", () => {
    expect(formatSize(1000)).toBe("1.0 kB");
  });

  it("formats megabyte-scale sizes", () => {
    expect(formatSize(1234567)).toBe("1.2 MB");
  });

  it("formats gigabyte-scale sizes", () => {
    expect(formatSize(1234567890)).toBe("1.2 GB");
  });

  it("bumps to the next unit when rounding would display 1000.0", () => {
    expect(formatSize(999950)).toBe("1.0 MB");
  });
});
