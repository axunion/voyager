// Pure windowing math for FileList's hand-rolled virtualization.
// Mirrors the 28px row-height CSS invariant (00-conventions.md).
export const ROW_HEIGHT = 28;

export interface VisibleRange {
  start: number; // first rendered index (inclusive)
  end: number; // last rendered index (exclusive)
  padTop: number; // px height of the top spacer
  padBottom: number; // px height of the bottom spacer
}

// Pure windowing math. Clamps to [0, count]. overscan is rows added on each
// side (use 8).
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  count: number,
  overscan: number,
): VisibleRange {
  if (count <= 0) {
    return { start: 0, end: 0, padTop: 0, padBottom: 0 };
  }

  const firstVisible = Math.floor(scrollTop / ROW_HEIGHT);
  const lastVisible = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) - 1;
  const start = Math.max(0, Math.min(count, firstVisible - overscan));
  const end = Math.max(start, Math.min(count, lastVisible + 1 + overscan));

  return {
    start,
    end,
    padTop: start * ROW_HEIGHT,
    padBottom: (count - end) * ROW_HEIGHT,
  };
}

// Returns the scrollTop that brings row `index` fully into view with minimal
// movement (block: "nearest" semantics), or null if it is already visible.
export function ensureVisible(
  scrollTop: number,
  viewportHeight: number,
  index: number,
): number | null {
  const rowTop = index * ROW_HEIGHT;
  const rowBottom = rowTop + ROW_HEIGHT;

  if (rowTop < scrollTop) return rowTop;
  if (rowBottom > scrollTop + viewportHeight) return rowBottom - viewportHeight;
  return null;
}
