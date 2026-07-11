import { describe, expect, it } from "vitest";
import { acceptsVoyagerDrag, DRAG_TYPE, readVoyagerPath } from "./dnd";

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

describe("readVoyagerPath", () => {
  it("returns the path when getData yields a value", () => {
    const e = stubEvent({ getData: () => "/some/path" });
    expect(readVoyagerPath(e)).toBe("/some/path");
  });

  it("returns null when getData yields an empty string", () => {
    const e = stubEvent({ getData: () => "" });
    expect(readVoyagerPath(e)).toBeNull();
  });

  it("returns null when dataTransfer is null", () => {
    expect(readVoyagerPath(stubEvent(null))).toBeNull();
  });
});
