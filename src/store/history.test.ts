import { describe, expect, it } from "vitest";
import { emptyHistory, pushPath, stepBack, stepForward } from "./history";

describe("pushPath", () => {
  it("appends the current path to back and clears forward", () => {
    const h = pushPath({ back: ["/a"], forward: ["/x"] }, "/b");
    expect(h).toEqual({ back: ["/a", "/b"], forward: [] });
  });
});

describe("stepBack / stepForward", () => {
  it("returns null on empty stacks", () => {
    expect(stepBack(emptyHistory, "/a")).toBeNull();
    expect(stepForward(emptyHistory, "/a")).toBeNull();
  });

  it("round-trips back then forward to the original path", () => {
    const afterNav = pushPath(emptyHistory, "/home");
    // now at /home/docs
    const back = stepBack(afterNav, "/home/docs");
    if (!back) throw new Error("expected stepBack to succeed");
    expect(back.path).toBe("/home");

    const forward = stepForward(back.history, back.path);
    expect(forward?.path).toBe("/home/docs");
    expect(forward?.history).toEqual({ back: ["/home"], forward: [] });
  });
});
