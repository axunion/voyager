import type { Entry } from "./ipc";

export type SortKey = "name" | "size" | "mtime";
export type SortDir = "asc" | "desc";

function compareName(a: Entry, b: Entry): number {
  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

function valueForKey(entry: Entry, key: SortKey): number | null {
  if (key === "size") return entry.size;
  if (key === "mtime") return entry.mtime;
  return null;
}

// Pure. Always dirs-first regardless of key/dir. Within each group:
// - name: case-insensitive name compare (current Rust order)
// - size: dirs stay name-asc (their size is null); files by size
// - mtime: both groups by mtime
// null values sort last within their group for both directions.
// Ties fall back to case-insensitive name-asc (stable, deterministic).
export function sortEntries(
  entries: Entry[],
  key: SortKey,
  dir: SortDir,
): Entry[] {
  const sign = dir === "asc" ? 1 : -1;

  return [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    if (key === "name") return sign * compareName(a, b);
    if (key === "size" && a.is_dir) return compareName(a, b);

    const av = valueForKey(a, key);
    const bv = valueForKey(b, key);
    if (av === null && bv === null) return compareName(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return compareName(a, b);
    return sign * (av < bv ? -1 : 1);
  });
}
