import type { Entry } from "./ipc";

// DOM element id for a row, shared by FileItem (sets it) and FileList
// (reads it back for aria-activedescendant and scroll targeting).
export function rowId(path: string): string {
  return encodeURIComponent(path);
}

// Returns the entry to select after moving by `delta` rows, clamped to the
// list bounds (e.g. a PageDown past the last row lands on the last row), or
// null when no movement should happen (already at the clamped boundary, or
// nothing selected and moving backward).
export function entryAfterMove(
  entries: Entry[],
  selectedPath: string | null,
  delta: number,
): Entry | null {
  if (entries.length === 0) return null;

  const index = selectedPath
    ? entries.findIndex((e) => e.path === selectedPath)
    : -1;

  if (index === -1) {
    return delta > 0 ? entries[0] : null;
  }

  const target = Math.max(0, Math.min(entries.length - 1, index + delta));
  return target === index ? null : entries[target];
}
