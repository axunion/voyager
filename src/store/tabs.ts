export function nextActiveTabId(
  tabs: { id: number }[],
  closingId: number,
  activeId: number,
): number {
  if (closingId !== activeId) return activeId;
  const index = tabs.findIndex((t) => t.id === closingId);
  const right = tabs[index + 1];
  if (right) return right.id;
  const left = tabs[index - 1];
  if (left) return left.id;
  return activeId;
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "") return "/";
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
}
