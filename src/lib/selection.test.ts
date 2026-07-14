import { describe, expect, it } from "vitest";
import type { Entry } from "./ipc";
import {
  bandSelect,
  emptySelection,
  pruneSelection,
  rangeSelect,
  replaceSelect,
  resolveAnchor,
  type Selection,
  selectAll,
  toggleSelect,
} from "./selection";

function entry(path: string): Entry {
  return {
    name: path,
    path,
    is_dir: false,
    is_symlink: false,
    size: null,
    mtime: null,
  };
}

const entries = ["a", "b", "c", "d", "e"].map(entry);

describe("replaceSelect", () => {
  it("selects only the given path, anchor and cursor at that path", () => {
    expect(replaceSelect("b")).toEqual({
      paths: ["b"],
      anchor: "b",
      cursor: "b",
    });
  });
});

describe("resolveAnchor", () => {
  it("leaves an already-set anchor untouched", () => {
    const sel: Selection = { paths: ["b"], anchor: "b", cursor: "b" };
    expect(resolveAnchor(entries, sel)).toEqual(sel);
  });

  it("adopts the current cursor as anchor when anchor is null", () => {
    const sel: Selection = { paths: [], anchor: null, cursor: "c" };
    expect(resolveAnchor(entries, sel)).toEqual({
      paths: [],
      anchor: "c",
      cursor: "c",
    });
  });

  it("falls back to the first entry when both anchor and cursor are null", () => {
    const sel: Selection = { paths: [], anchor: null, cursor: null };
    expect(resolveAnchor(entries, sel)).toEqual({
      paths: [],
      anchor: "a",
      cursor: null,
    });
  });

  it("stays null when anchor and cursor are null and there are no entries", () => {
    const sel: Selection = { paths: [], anchor: null, cursor: null };
    expect(resolveAnchor([], sel)).toEqual(sel);
  });
});

describe("toggleSelect", () => {
  it("adds an unselected path, anchor and cursor move to it", () => {
    const current: Selection = { paths: ["a"], anchor: "a", cursor: "a" };
    expect(toggleSelect(entries, current, "c")).toEqual({
      paths: ["a", "c"],
      anchor: "c",
      cursor: "c",
    });
  });

  it("removes an already-selected path, anchor/cursor stay at it", () => {
    const current: Selection = { paths: ["a", "c"], anchor: "c", cursor: "c" };
    expect(toggleSelect(entries, current, "c")).toEqual({
      paths: ["a"],
      anchor: "c",
      cursor: "c",
    });
  });

  it("keeps result in visible-list order regardless of toggle order", () => {
    let sel = emptySelection;
    sel = toggleSelect(entries, sel, "d");
    sel = toggleSelect(entries, sel, "a");
    sel = toggleSelect(entries, sel, "c");
    expect(sel.paths).toEqual(["a", "c", "d"]);
  });

  it("toggling the last selected path empties the selection but keeps anchor/cursor", () => {
    const current: Selection = { paths: ["b"], anchor: "b", cursor: "b" };
    expect(toggleSelect(entries, current, "b")).toEqual({
      paths: [],
      anchor: "b",
      cursor: "b",
    });
  });

  it("toggling a path absent from entries leaves paths unaffected", () => {
    const current: Selection = { paths: ["a"], anchor: "a", cursor: "a" };
    const result = toggleSelect(entries, current, "missing");
    expect(result.paths).toEqual(["a"]);
    expect(result.anchor).toBe("missing");
    expect(result.cursor).toBe("missing");
  });

  it("does not mutate its inputs", () => {
    const current: Selection = { paths: ["a"], anchor: "a", cursor: "a" };
    const currentCopy = { ...current, paths: [...current.paths] };
    toggleSelect(entries, current, "c");
    expect(current).toEqual(currentCopy);
  });
});

describe("rangeSelect", () => {
  it("replaces selection with the inclusive range from anchor to target", () => {
    const current: Selection = { paths: ["b"], anchor: "b", cursor: "b" };
    expect(rangeSelect(entries, current, "d")).toEqual({
      paths: ["b", "c", "d"],
      anchor: "b",
      cursor: "d",
    });
  });

  it("supports a target before the anchor", () => {
    const current: Selection = { paths: ["d"], anchor: "d", cursor: "d" };
    expect(rangeSelect(entries, current, "b")).toEqual({
      paths: ["b", "c", "d"],
      anchor: "d",
      cursor: "b",
    });
  });

  it("re-anchors when re-ranging from the same anchor to a new target", () => {
    const afterFirst = rangeSelect(
      entries,
      { paths: ["b"], anchor: "b", cursor: "b" },
      "d",
    );
    expect(rangeSelect(entries, afterFirst, "a")).toEqual({
      paths: ["a", "b"],
      anchor: "b",
      cursor: "a",
    });
  });

  it("falls back to a single-row range when anchor is null", () => {
    const current: Selection = { paths: [], anchor: null, cursor: null };
    expect(rangeSelect(entries, current, "c")).toEqual({
      paths: ["c"],
      anchor: "c",
      cursor: "c",
    });
  });

  it("falls back to a single-row range when anchor is missing from entries", () => {
    const current: Selection = {
      paths: ["gone"],
      anchor: "gone",
      cursor: "gone",
    };
    expect(rangeSelect(entries, current, "c")).toEqual({
      paths: ["c"],
      anchor: "c",
      cursor: "c",
    });
  });

  it("does not mutate its inputs", () => {
    const current: Selection = { paths: ["b"], anchor: "b", cursor: "b" };
    const currentCopy = { ...current, paths: [...current.paths] };
    rangeSelect(entries, current, "d");
    expect(current).toEqual(currentCopy);
  });
});

describe("selectAll", () => {
  it("selects every visible entry, anchor at first and cursor at last", () => {
    expect(selectAll(entries)).toEqual({
      paths: ["a", "b", "c", "d", "e"],
      anchor: "a",
      cursor: "e",
    });
  });

  it("returns emptySelection for an empty entry list", () => {
    expect(selectAll([])).toEqual(emptySelection);
  });
});

describe("bandSelect", () => {
  it("re-derives the given paths into visible-list order", () => {
    expect(bandSelect(entries, ["d", "b", "c"])).toEqual({
      paths: ["b", "c", "d"],
      anchor: "b",
      cursor: "d",
    });
  });

  it("ignores paths not present among the visible entries", () => {
    expect(bandSelect(entries, ["b", "ghost", "d"])).toEqual({
      paths: ["b", "d"],
      anchor: "b",
      cursor: "d",
    });
  });

  it("ignores duplicate paths", () => {
    expect(bandSelect(entries, ["b", "b", "c"])).toEqual({
      paths: ["b", "c"],
      anchor: "b",
      cursor: "c",
    });
  });

  it("returns emptySelection for an empty hit list", () => {
    expect(bandSelect(entries, [])).toEqual(emptySelection);
  });

  it("does not mutate its inputs", () => {
    const paths = ["d", "b"];
    const pathsCopy = [...paths];
    bandSelect(entries, paths);
    expect(paths).toEqual(pathsCopy);
  });
});

describe("pruneSelection", () => {
  it("drops paths no longer visible", () => {
    const current: Selection = {
      paths: ["a", "b", "c"],
      anchor: "a",
      cursor: "c",
    };
    const visible = [entry("a"), entry("c")];
    expect(pruneSelection(current, visible)).toEqual({
      paths: ["a", "c"],
      anchor: "a",
      cursor: "c",
    });
  });

  it("nulls anchor and cursor when they drop out of view", () => {
    const current: Selection = {
      paths: ["a", "b"],
      anchor: "b",
      cursor: "b",
    };
    const visible = [entry("a")];
    expect(pruneSelection(current, visible)).toEqual({
      paths: ["a"],
      anchor: null,
      cursor: null,
    });
  });

  it("empties everything when nothing remains visible", () => {
    const current: Selection = { paths: ["a", "b"], anchor: "a", cursor: "b" };
    expect(pruneSelection(current, [])).toEqual(emptySelection);
  });

  it("does not mutate its inputs", () => {
    const current: Selection = { paths: ["a", "b"], anchor: "a", cursor: "b" };
    const currentCopy = { ...current, paths: [...current.paths] };
    pruneSelection(current, [entry("a")]);
    expect(current).toEqual(currentCopy);
  });
});
