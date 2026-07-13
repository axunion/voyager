import { describe, expect, it } from "vitest";
import { filterEntries } from "./filterEntries";
import type { Entry } from "./ipc";

const entry = (name: string): Entry => ({
  name,
  path: `/${name}`,
  is_dir: false,
  is_symlink: false,
  size: null,
  mtime: null,
});

const entries: Entry[] = [
  entry("readme.md"),
  entry("package.json"),
  entry("src"),
];

describe("filterEntries", () => {
  it("matches a prefix substring", () => {
    expect(filterEntries(entries, "read")).toEqual([entry("readme.md")]);
  });

  it("matches a middle substring", () => {
    expect(filterEntries(entries, "ackage")).toEqual([entry("package.json")]);
  });

  it("matches a suffix substring", () => {
    expect(filterEntries(entries, ".json")).toEqual([entry("package.json")]);
  });

  it("matches case-insensitively", () => {
    expect(filterEntries(entries, "RE")).toEqual([entry("readme.md")]);
  });

  it("returns all entries for an empty query", () => {
    expect(filterEntries(entries, "")).toEqual(entries);
  });

  it("returns all entries for a whitespace-only query", () => {
    expect(filterEntries(entries, "   ")).toEqual(entries);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterEntries(entries, "nonexistent")).toEqual([]);
  });

  it("returns an empty array for empty entries", () => {
    expect(filterEntries([], "anything")).toEqual([]);
  });
});
