import type { Entry } from "./ipc";

// DOM element id for a row, shared by FileItem (sets it) and FileList
// (reads it back for aria-activedescendant and scroll targeting).
export function rowId(path: string): string {
  return encodeURIComponent(path);
}

// Returns the entry to select after moving by `delta` (+1 / -1),
// or null when no movement should happen.
export function entryAfterMove(
  entries: Entry[],
  selectedPath: string | null,
  delta: 1 | -1,
): Entry | null {
  if (entries.length === 0) return null;

  const index = selectedPath
    ? entries.findIndex((e) => e.path === selectedPath)
    : -1;

  if (index === -1) {
    return delta > 0 ? entries[0] : null;
  }

  const next = entries[index + delta];
  return next ?? null;
}
