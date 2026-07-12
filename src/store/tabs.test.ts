import { describe, expect, it } from "vitest";
import { basename, nextActiveTabId, renderedTabIds } from "./tabs";

describe("nextActiveTabId", () => {
  const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("keeps the active tab unchanged when closing a non-active tab", () => {
    expect(nextActiveTabId(tabs, 1, 2)).toBe(2);
  });

  it("activates the right neighbor when closing the active tab in the middle", () => {
    expect(nextActiveTabId(tabs, 2, 2)).toBe(3);
  });

  it("activates the left neighbor when closing the active tab at the end", () => {
    expect(nextActiveTabId(tabs, 3, 3)).toBe(2);
  });
});

describe("basename", () => {
  it("returns the last path segment", () => {
    expect(basename("/Users/foo")).toBe("foo");
  });

  it("returns / for the root path", () => {
    expect(basename("/")).toBe("/");
  });

  it("tolerates a trailing slash", () => {
    expect(basename("/Users/foo/")).toBe("foo");
  });
});

describe("renderedTabIds", () => {
  it("returns only the active tab when no drag is in progress", () => {
    expect(renderedTabIds(2, null)).toEqual([2]);
  });

  it("returns only the active tab when the drag originated there", () => {
    expect(renderedTabIds(2, 2)).toEqual([2]);
  });

  it("returns origin then active when they differ", () => {
    expect(renderedTabIds(2, 1)).toEqual([1, 2]);
  });
});
