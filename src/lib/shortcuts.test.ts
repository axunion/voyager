import { describe, expect, it } from "vitest";
import { matchGlobalShortcut, type ShortcutInput } from "./shortcuts";

const base: ShortcutInput = {
  key: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  targetIsTextInput: false,
};

const input = (overrides: Partial<ShortcutInput>): ShortcutInput => ({
  ...base,
  ...overrides,
});

describe("matchGlobalShortcut", () => {
  it("matches Mod+T as new-tab", () => {
    expect(matchGlobalShortcut(input({ key: "t", metaKey: true }))).toEqual({
      type: "new-tab",
    });
    expect(matchGlobalShortcut(input({ key: "t", ctrlKey: true }))).toEqual({
      type: "new-tab",
    });
  });

  it("matches Mod+W as close-tab", () => {
    expect(matchGlobalShortcut(input({ key: "w", metaKey: true }))).toEqual({
      type: "close-tab",
    });
  });

  it("matches Alt+ArrowLeft/ArrowRight as back/forward", () => {
    expect(
      matchGlobalShortcut(input({ key: "ArrowLeft", altKey: true })),
    ).toEqual({ type: "back" });
    expect(
      matchGlobalShortcut(input({ key: "ArrowRight", altKey: true })),
    ).toEqual({ type: "forward" });
  });

  it("matches Mod+Shift+. as toggle-hidden", () => {
    expect(
      matchGlobalShortcut(input({ key: ".", metaKey: true, shiftKey: true })),
    ).toEqual({ type: "toggle-hidden" });
  });

  it("maps Mod+1..8 to 0-based tab indices", () => {
    expect(matchGlobalShortcut(input({ key: "1", metaKey: true }))).toEqual({
      type: "activate-tab",
      index: 0,
    });
    expect(matchGlobalShortcut(input({ key: "8", metaKey: true }))).toEqual({
      type: "activate-tab",
      index: 7,
    });
  });

  it("maps Mod+9 to the last tab (index -1)", () => {
    expect(matchGlobalShortcut(input({ key: "9", metaKey: true }))).toEqual({
      type: "activate-tab",
      index: -1,
    });
  });

  it("matches Ctrl+Tab / Ctrl+Shift+Tab as next-tab/prev-tab regardless of Mod idiom", () => {
    expect(matchGlobalShortcut(input({ key: "Tab", ctrlKey: true }))).toEqual({
      type: "next-tab",
    });
    expect(
      matchGlobalShortcut(input({ key: "Tab", ctrlKey: true, shiftKey: true })),
    ).toEqual({ type: "prev-tab" });
  });

  it("matches Mod+R as refresh", () => {
    expect(matchGlobalShortcut(input({ key: "r", metaKey: true }))).toEqual({
      type: "refresh",
    });
  });

  it("matches Mod+Shift+N as new-folder", () => {
    expect(
      matchGlobalShortcut(input({ key: "n", metaKey: true, shiftKey: true })),
    ).toEqual({ type: "new-folder" });
  });

  it("matches Mod+ArrowUp as parent-dir", () => {
    expect(
      matchGlobalShortcut(input({ key: "ArrowUp", metaKey: true })),
    ).toEqual({ type: "parent-dir" });
  });

  it("matches Mod+F as focus-filter", () => {
    expect(matchGlobalShortcut(input({ key: "f", metaKey: true }))).toEqual({
      type: "focus-filter",
    });
  });

  it("does not match letters without Mod", () => {
    expect(matchGlobalShortcut(input({ key: "t" }))).toBeNull();
    expect(matchGlobalShortcut(input({ key: "r" }))).toBeNull();
  });

  it("suppresses new-folder and parent-dir while typing", () => {
    expect(
      matchGlobalShortcut(
        input({
          key: "n",
          metaKey: true,
          shiftKey: true,
          targetIsTextInput: true,
        }),
      ),
    ).toBeNull();
    expect(
      matchGlobalShortcut(
        input({ key: "ArrowUp", metaKey: true, targetIsTextInput: true }),
      ),
    ).toBeNull();
  });

  it("still fires bindings that are not suppressed while typing", () => {
    expect(
      matchGlobalShortcut(
        input({ key: "r", metaKey: true, targetIsTextInput: true }),
      ),
    ).toEqual({ type: "refresh" });
    expect(
      matchGlobalShortcut(
        input({ key: "t", metaKey: true, targetIsTextInput: true }),
      ),
    ).toEqual({ type: "new-tab" });
    expect(
      matchGlobalShortcut(
        input({ key: "f", metaKey: true, targetIsTextInput: true }),
      ),
    ).toEqual({ type: "focus-filter" });
  });

  it("returns null for unrelated keys", () => {
    expect(matchGlobalShortcut(input({ key: "ArrowDown" }))).toBeNull();
    expect(
      matchGlobalShortcut(input({ key: "ArrowDown", metaKey: true })),
    ).toBeNull();
  });
});
