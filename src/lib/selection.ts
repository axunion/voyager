import type { Entry } from "./ipc";

export interface Selection {
  paths: string[]; // visible-list order
  anchor: string | null; // range-select origin
  cursor: string | null; // keyboard focus row
}

export const emptySelection: Selection = {
  paths: [],
  anchor: null,
  cursor: null,
};

function visibleOrder(entries: Entry[]): string[] {
  return entries.map((e) => e.path);
}

// Shared by selectAll/bandSelect: an already visible-order path list becomes
// a Selection with anchor at the first path and cursor at the last, or
// emptySelection when there's nothing to select.
function fromOrderedPaths(paths: string[]): Selection {
  if (paths.length === 0) return emptySelection;
  return { paths, anchor: paths[0], cursor: paths[paths.length - 1] };
}

// All operate on the visible (post sort+filter) entries array.
export function replaceSelect(path: string): Selection {
  return { paths: [path], anchor: path, cursor: path };
}

// Used by Shift-click/Shift-arrow: a null (or stale) anchor adopts the
// current cursor (or the first visible row if that's also null) before
// ranging, so the extension continues from wherever the user last was
// instead of collapsing to a single row.
export function resolveAnchor(entries: Entry[], sel: Selection): Selection {
  if (sel.anchor !== null) return sel;
  return { ...sel, anchor: sel.cursor ?? entries[0]?.path ?? null };
}

export function toggleSelect(
  entries: Entry[],
  current: Selection,
  path: string,
): Selection {
  const isSelected = current.paths.includes(path);
  const paths = isSelected
    ? current.paths.filter((p) => p !== path)
    : visibleOrder(entries).filter(
        (p) => current.paths.includes(p) || p === path,
      );
  return { paths, anchor: path, cursor: path };
}

// anchor stays; selection becomes the inclusive range anchor..target.
// A null/missing anchor falls back to target (single-row range).
export function rangeSelect(
  entries: Entry[],
  current: Selection,
  target: string,
): Selection {
  const order = visibleOrder(entries);
  const anchor =
    current.anchor !== null && order.includes(current.anchor)
      ? current.anchor
      : target;
  const anchorIndex = order.indexOf(anchor);
  const targetIndex = order.indexOf(target);
  if (anchorIndex === -1 || targetIndex === -1) {
    return { paths: [target], anchor, cursor: target };
  }
  const [start, end] =
    anchorIndex <= targetIndex
      ? [anchorIndex, targetIndex]
      : [targetIndex, anchorIndex];
  return { paths: order.slice(start, end + 1), anchor, cursor: target };
}

export function selectAll(entries: Entry[]): Selection {
  return fromOrderedPaths(visibleOrder(entries));
}

// Replaces the selection with `paths` (any order/duplicates, e.g. from a
// rubber-band hit test), re-derived into visible-list order. anchor = first
// in that order, cursor = last.
export function bandSelect(entries: Entry[], paths: string[]): Selection {
  const set = new Set(paths);
  return fromOrderedPaths(visibleOrder(entries).filter((p) => set.has(p)));
}

// Drops paths no longer present in `visible`; nulls anchor/cursor if dropped.
export function pruneSelection(
  current: Selection,
  visible: Entry[],
): Selection {
  const order = new Set(visibleOrder(visible));
  return {
    paths: current.paths.filter((p) => order.has(p)),
    anchor:
      current.anchor !== null && order.has(current.anchor)
        ? current.anchor
        : null,
    cursor:
      current.cursor !== null && order.has(current.cursor)
        ? current.cursor
        : null,
  };
}
