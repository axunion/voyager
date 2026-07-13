import { describe, expect, it } from "vitest";
import type { Entry } from "./ipc";
import { sortEntries } from "./sortEntries";

const dir = (name: string, mtime: number | null = null): Entry => ({
  name,
  path: `/${name}`,
  is_dir: true,
  is_symlink: false,
  size: null,
  mtime,
});

const file = (
  name: string,
  size: number | null = null,
  mtime: number | null = null,
): Entry => ({
  name,
  path: `/${name}`,
  is_dir: false,
  is_symlink: false,
  size,
  mtime,
});

describe("sortEntries", () => {
  const mixed = [
    file("b.txt", 20, 200),
    dir("Zeta"),
    file("a.txt", 10, 100),
    dir("alpha"),
  ];

  it("keeps dirs first for every key and direction", () => {
    for (const key of ["name", "size", "mtime"] as const) {
      for (const direction of ["asc", "desc"] as const) {
        const result = sortEntries(mixed, key, direction);
        expect(result.slice(0, 2).every((e) => e.is_dir)).toBe(true);
      }
    }
  });

  it("sorts by name ascending case-insensitively", () => {
    const result = sortEntries(
      [file("Banana"), file("apple"), file("cherry")],
      "name",
      "asc",
    );
    expect(result.map((e) => e.name)).toEqual(["apple", "Banana", "cherry"]);
  });

  it("sorts by name descending", () => {
    const result = sortEntries(
      [file("apple"), file("Banana"), file("cherry")],
      "name",
      "desc",
    );
    expect(result.map((e) => e.name)).toEqual(["cherry", "Banana", "apple"]);
  });

  it("keeps dirs in name-asc order when sorting by size", () => {
    const result = sortEntries(
      [dir("zeta"), dir("alpha"), file("b.txt", 5), file("a.txt", 50)],
      "size",
      "desc",
    );
    expect(result.map((e) => e.name)).toEqual([
      "alpha",
      "zeta",
      "a.txt",
      "b.txt",
    ]);
  });

  it("sorts files by size ascending", () => {
    const result = sortEntries(
      [file("big.txt", 300), file("small.txt", 10)],
      "size",
      "asc",
    );
    expect(result.map((e) => e.name)).toEqual(["small.txt", "big.txt"]);
  });

  it("sorts by mtime ascending across both groups", () => {
    const result = sortEntries(
      [dir("newdir", 300), file("old.txt", null, 100)],
      "mtime",
      "asc",
    );
    expect(result.map((e) => e.name)).toEqual(["newdir", "old.txt"]);
  });

  it("sorts by mtime descending across both groups", () => {
    const result = sortEntries(
      [dir("newdir", 300), file("old.txt", null, 100)],
      "mtime",
      "desc",
    );
    expect(result.map((e) => e.name)).toEqual(["newdir", "old.txt"]);
  });

  it("sorts null sizes last within the files group in both directions", () => {
    const entries = [file("missing", null), file("known", 5)];
    expect(sortEntries(entries, "size", "asc").map((e) => e.name)).toEqual([
      "known",
      "missing",
    ]);
    expect(sortEntries(entries, "size", "desc").map((e) => e.name)).toEqual([
      "known",
      "missing",
    ]);
  });

  it("sorts null mtimes last within a group in both directions", () => {
    const entries = [file("missing", null, null), file("known", null, 5)];
    expect(sortEntries(entries, "mtime", "asc").map((e) => e.name)).toEqual([
      "known",
      "missing",
    ]);
    expect(sortEntries(entries, "mtime", "desc").map((e) => e.name)).toEqual([
      "known",
      "missing",
    ]);
  });

  it("falls back to name-asc for ties", () => {
    const result = sortEntries(
      [file("beta", 10), file("alpha", 10)],
      "size",
      "desc",
    );
    expect(result.map((e) => e.name)).toEqual(["alpha", "beta"]);
  });

  it("does not mutate the input array", () => {
    const entries = [file("b"), file("a")];
    const original = [...entries];
    sortEntries(entries, "name", "asc");
    expect(entries).toEqual(original);
  });
});
