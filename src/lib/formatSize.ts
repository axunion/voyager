const UNITS = ["B", "kB", "MB", "GB", "TB", "PB"];

// 1000-based, one decimal place (Finder-style): 0 -> "0 B", 999 -> "999 B",
// 1000 -> "1.0 kB", 1234567 -> "1.2 MB". null -> "—".
export function formatSize(size: number | null): string {
  if (size === null) return "—";
  if (size < 1000) return `${size} B`;

  let value = size;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < UNITS.length - 1) {
    value /= 1000;
    unitIndex++;
  }
  // Rounding to one decimal can push the displayed value back up to 1000
  // (e.g. 999950 -> "999.95" rounds to "1000.0"); bump to the next unit.
  if (unitIndex < UNITS.length - 1 && Number(value.toFixed(1)) >= 1000) {
    value /= 1000;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${UNITS[unitIndex]}`;
}
