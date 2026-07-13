const formatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Formats unix epoch seconds with Intl.DateTimeFormat (session locale,
// year/month/day + hour/minute, 24h fixed). null -> "—".
export function formatMtime(mtime: number | null): string {
  if (mtime === null) return "—";
  return formatter.format(mtime * 1000);
}
