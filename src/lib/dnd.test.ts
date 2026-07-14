import { describe, expect, it } from "vitest";
import { acceptsVoyagerDrag, DRAG_TYPE, readVoyagerPaths } from "./dnd";

function stubEvent(dataTransfer: Partial<DataTransfer> | null): DragEvent {
  return { dataTransfer } as unknown as DragEvent;
}

describe("acceptsVoyagerDrag", () => {
  it("returns true when the declared types include DRAG_TYPE", () => {
    expect(acceptsVoyagerDrag(stubEvent({ types: [DRAG_TYPE] }))).toBe(true);
  });

  it("returns false when the declared types do not include DRAG_TYPE", () => {
    expect(acceptsVoyagerDrag(stubEvent({ types: ["text/plain"] }))).toBe(
      false,
    );
  });

  it("returns false when dataTransfer is null", () => {
    expect(acceptsVoyagerDrag(stubEvent(null))).toBe(false);
  });
});

describe("readVoyagerPaths", () => {
  it("round-trips an array of paths through JSON", () => {
    const e = stubEvent({ getData: () => JSON.stringify(["/a", "/b"]) });
    expect(readVoyagerPaths(e)).toEqual(["/a", "/b"]);
  });

  it("returns an empty array for an empty payload", () => {
    const e = stubEvent({ getData: () => JSON.stringify([]) });
    expect(readVoyagerPaths(e)).toEqual([]);
  });

  it("returns an empty array when getData yields an empty string", () => {
    const e = stubEvent({ getData: () => "" });
    expect(readVoyagerPaths(e)).toEqual([]);
  });

  it("returns an empty array when dataTransfer is null", () => {
    expect(readVoyagerPaths(stubEvent(null))).toEqual([]);
  });

  it("returns an empty array for a non-JSON legacy single-path payload", () => {
    const e = stubEvent({ getData: () => "/some/path" });
    expect(readVoyagerPaths(e)).toEqual([]);
  });

  it("returns an empty array for JSON that isn't an array of strings", () => {
    const e = stubEvent({ getData: () => JSON.stringify({ a: 1 }) });
    expect(readVoyagerPaths(e)).toEqual([]);
  });
});
