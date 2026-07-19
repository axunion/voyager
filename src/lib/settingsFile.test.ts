import { describe, expect, it } from "vitest";
import {
  parsePersistedSettings,
  serializePersistedSettings,
} from "./settingsFile";

describe("parsePersistedSettings", () => {
  it("returns null for an empty file", () => {
    expect(parsePersistedSettings("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parsePersistedSettings("not json")).toBeNull();
    expect(parsePersistedSettings("{")).toBeNull();
  });

  it("returns null for JSON that is not an object", () => {
    expect(parsePersistedSettings("[1, 2]")).toBeNull();
    expect(parsePersistedSettings("42")).toBeNull();
    expect(parsePersistedSettings('"str"')).toBeNull();
    expect(parsePersistedSettings("null")).toBeNull();
    expect(parsePersistedSettings("true")).toBeNull();
  });

  it("falls back to defaults for an empty object", () => {
    expect(parsePersistedSettings("{}")).toEqual({ showHidden: false });
  });

  it("reads a valid showHidden value", () => {
    expect(parsePersistedSettings('{"showHidden": true}')).toEqual({
      showHidden: true,
    });
    expect(parsePersistedSettings('{"showHidden": false}')).toEqual({
      showHidden: false,
    });
  });

  it("falls back to the default when showHidden has the wrong type", () => {
    expect(parsePersistedSettings('{"showHidden": "yes"}')).toEqual({
      showHidden: false,
    });
  });

  it("ignores unknown keys", () => {
    expect(
      parsePersistedSettings('{"showHidden": true, "futureKey": 1}'),
    ).toEqual({ showHidden: true });
  });
});

describe("serializePersistedSettings", () => {
  it("round-trips through parse for both values", () => {
    for (const showHidden of [true, false]) {
      const raw = serializePersistedSettings({ showHidden });
      expect(parsePersistedSettings(raw)).toEqual({ showHidden });
    }
  });

  it("ends with a trailing newline", () => {
    expect(serializePersistedSettings({ showHidden: true })).toMatch(/\n$/);
  });
});
