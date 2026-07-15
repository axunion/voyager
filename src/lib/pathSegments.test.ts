import { describe, expect, it } from "vitest";
import { parentPath, splitPathSegments } from "./pathSegments";

describe("splitPathSegments", () => {
  it("splits a normal absolute path into root + each component", () => {
    expect(splitPathSegments("/Users/foo/bar")).toEqual([
      { name: "/", path: "/" },
      { name: "Users", path: "/Users" },
      { name: "foo", path: "/Users/foo" },
      { name: "bar", path: "/Users/foo/bar" },
    ]);
  });

  it("returns a single segment for the root", () => {
    expect(splitPathSegments("/")).toEqual([{ name: "/", path: "/" }]);
  });

  it("tolerates a trailing slash", () => {
    expect(splitPathSegments("/Users/")).toEqual(splitPathSegments("/Users"));
  });

  it("returns an empty array for an empty path", () => {
    expect(splitPathSegments("")).toEqual([]);
  });

  it("splits a single-level path into two segments", () => {
    expect(splitPathSegments("/Users")).toEqual([
      { name: "/", path: "/" },
      { name: "Users", path: "/Users" },
    ]);
  });
});

describe("parentPath", () => {
  it("returns the parent of a multi-level path", () => {
    expect(parentPath("/a/b/c")).toBe("/a/b");
  });

  it("returns root for a single-level path", () => {
    expect(parentPath("/a")).toBe("/");
  });

  it("returns null for the root", () => {
    expect(parentPath("/")).toBeNull();
  });

  it("tolerates a trailing slash", () => {
    expect(parentPath("/a/b/")).toBe(parentPath("/a/b"));
  });
});
