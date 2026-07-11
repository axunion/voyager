import type { Entry } from "./ipc";

// Case-insensitive substring match of query against entry.name.
// Empty/whitespace-only query matches everything.
export function matchesQuery(entry: Entry, query: string): boolean {
  const trimmed = query.trim();
  if (trimmed === "") return true;
  return entry.name.toLowerCase().includes(trimmed.toLowerCase());
}

// Empty/whitespace-only query returns entries unchanged (same reference is fine).
export function filterEntries(entries: Entry[], query: string): Entry[] {
  if (query.trim() === "") return entries;
  return entries.filter((entry) => matchesQuery(entry, query));
}
