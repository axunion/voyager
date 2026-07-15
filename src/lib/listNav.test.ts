import { describe, expect, it } from "vitest";
import type { Entry } from "./ipc";
import { entryAfterMove } from "./listNav";

const base = { is_symlink: false, size: null, mtime: null };

const entries: Entry[] = [
  { name: "a", path: "/a", is_dir: false, ...base },
  { name: "b", path: "/b", is_dir: false, ...base },
  { name: "c", path: "/c", is_dir: false, ...base },
];

describe("entryAfterMove", () => {
  it("moves forward from a middle position", () => {
    expect(entryAfterMove(entries, "/b", 1)).toEqual(entries[2]);
  });

  it("moves backward from a middle position", () => {
    expect(entryAfterMove(entries, "/b", -1)).toEqual(entries[0]);
  });

  it("selects the first entry when nothing is selected and moving forward", () => {
    expect(entryAfterMove(entries, null, 1)).toEqual(entries[0]);
  });

  it("does nothing when nothing is selected and moving backward", () => {
    expect(entryAfterMove(entries, null, -1)).toBeNull();
  });

  it("does not wrap past the first entry", () => {
    expect(entryAfterMove(entries, "/a", -1)).toBeNull();
  });

  it("does not wrap past the last entry", () => {
    expect(entryAfterMove(entries, "/c", 1)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(entryAfterMove([], "/a", 1)).toBeNull();
  });

  it("treats a selectedPath missing from entries as unselected", () => {
    expect(entryAfterMove(entries, "/missing", 1)).toEqual(entries[0]);
    expect(entryAfterMove(entries, "/missing", -1)).toBeNull();
  });

  it("clamps a large forward delta to the last entry", () => {
    expect(entryAfterMove(entries, "/a", 10)).toEqual(entries[2]);
  });

  it("clamps a large backward delta to the first entry", () => {
    expect(entryAfterMove(entries, "/c", -10)).toEqual(entries[0]);
  });

  it("returns null when a large delta clamps to the already-current entry", () => {
    expect(entryAfterMove(entries, "/c", 10)).toBeNull();
    expect(entryAfterMove(entries, "/a", -10)).toBeNull();
  });
});
