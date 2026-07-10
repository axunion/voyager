import { describe, expect, it } from "vitest";
import { basename, nextActiveTabId } from "./tabs";

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
