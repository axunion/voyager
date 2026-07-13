import { describe, expect, it } from "vitest";
import { hiddenNameError } from "./validateVisibleName";

describe("hiddenNameError", () => {
  it("always allows when hidden files are shown", () => {
    expect(hiddenNameError(".foo", true)).toBeNull();
  });

  it("rejects a leading-dot name when hidden files are not shown", () => {
    expect(hiddenNameError(".foo", false)).toBe('".foo" would be hidden');
  });

  it("allows a regular name when hidden files are not shown", () => {
    expect(hiddenNameError("foo.txt", false)).toBeNull();
  });

  it("allows an empty name (Rust owns the empty-name check)", () => {
    expect(hiddenNameError("", false)).toBeNull();
  });
});
