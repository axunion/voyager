import { describe, expect, it } from "vitest";
import { ensureVisible, ROW_HEIGHT, visibleRange } from "./virtual";

describe("visibleRange", () => {
  it("clamps overscan at the top when scrolled to the start", () => {
    const range = visibleRange(0, 280, 1000, 8);
    expect(range.start).toBe(0);
    expect(range.padTop).toBe(0);
  });

  it("windows around the middle of a long list", () => {
    const range = visibleRange(5000 * ROW_HEIGHT, 280, 10000, 8);
    // 5000 rows scrolled past, 10 rows visible (280 / 28), overscan 8 each side.
    expect(range.start).toBe(5000 - 8);
    expect(range.end).toBe(5000 + 10 + 8);
  });

  it("clamps overscan at the end when scrolled to the bottom", () => {
    const maxScrollTop = 10000 * ROW_HEIGHT - 280;
    const range = visibleRange(maxScrollTop, 280, 10000, 8);
    expect(range.end).toBe(10000);
    expect(range.padBottom).toBe(0);
  });

  it("renders all rows with no spacers when count is below the viewport", () => {
    const range = visibleRange(0, 280, 5, 8);
    expect(range).toEqual({ start: 0, end: 5, padTop: 0, padBottom: 0 });
  });

  it("returns an empty range for zero entries", () => {
    expect(visibleRange(0, 280, 0, 8)).toEqual({
      start: 0,
      end: 0,
      padTop: 0,
      padBottom: 0,
    });
  });

  it("keeps start and end within [0, count] when overscan would push them out", () => {
    const range = visibleRange(0, 280, 3, 8);
    expect(range.start).toBe(0);
    expect(range.end).toBe(3);
  });

  it("keeps padTop + window height + padBottom equal to count * ROW_HEIGHT", () => {
    for (const scrollTop of [0, 1234, 5000 * ROW_HEIGHT, 9999 * ROW_HEIGHT]) {
      const range = visibleRange(scrollTop, 280, 10000, 8);
      const windowHeight = (range.end - range.start) * ROW_HEIGHT;
      expect(range.padTop + windowHeight + range.padBottom).toBe(
        10000 * ROW_HEIGHT,
      );
    }
  });
});

describe("ensureVisible", () => {
  it("returns null when the row is already fully visible", () => {
    expect(ensureVisible(0, 280, 5)).toBeNull();
  });

  it("scrolls up to align the top when the row is above the window", () => {
    expect(ensureVisible(500, 280, 3)).toBe(3 * ROW_HEIGHT);
  });

  it("scrolls down to align the bottom when the row is below the window", () => {
    // Viewport shows rows 0-9 (280 / 28); row 20 is below it.
    const result = ensureVisible(0, 280, 20);
    expect(result).toBe(20 * ROW_HEIGHT + ROW_HEIGHT - 280);
  });

  it("treats the exact top boundary as visible", () => {
    expect(ensureVisible(3 * ROW_HEIGHT, 280, 3)).toBeNull();
  });

  it("treats the exact bottom boundary as visible", () => {
    const scrollTop = 20 * ROW_HEIGHT + ROW_HEIGHT - 280;
    expect(ensureVisible(scrollTop, 280, 20)).toBeNull();
  });
});
