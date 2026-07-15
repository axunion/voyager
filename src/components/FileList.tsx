import * as ContextMenu from "@kobalte/core/context-menu";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import {
  createEffect,
  createMemo,
  createSelector,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  acceptsVoyagerDrag,
  createDragOverTarget,
  isDragActive,
  readVoyagerPaths,
  startVoyagerDrag,
} from "../lib/dnd";
import { iconFor } from "../lib/icons";
import type { Entry } from "../lib/ipc";
import { entryAfterMove, rowId } from "../lib/listNav";
import {
  bandSelect,
  emptySelection,
  rangeSelect,
  replaceSelect,
  resolveAnchor,
  type Selection,
  selectAll,
  toggleSelect,
} from "../lib/selection";
import type { SortDir, SortKey } from "../lib/sortEntries";
import { ensureVisible, type VisibleRange, visibleRange } from "../lib/virtual";
import type { EditingState } from "../store/explorer";
import { FileItem } from "./FileItem";
import itemStyles from "./FileItem.module.css";
import styles from "./FileList.module.css";

interface FileListProps {
  entries: Entry[];
  currentPath: string;
  selectedPaths: string[];
  anchor: string | null;
  cursor: string | null;
  editing: EditingState;
  sortKey: SortKey;
  sortDir: SortDir;
  cutPaths: string[];
  canPaste: boolean;
  onSort(key: SortKey): void;
  onOpen(entries: Entry[]): void;
  onSelectionChange(sel: Selection): void;
  onDropMove(sourcePaths: string[], targetDirPath: string): void;
  onTrash(paths: string[]): void;
  onRename(entry: Entry): void;
  onNewFolder(): void;
  onNewFile(): void;
  onCommitRename(name: string): void;
  onCommitCreate(name: string): void;
  onCancelEdit(): void;
  onCopy(): void;
  onCut(): void;
  onPaste(): void;
}

const HEADERS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "size", label: "Size" },
  { key: "mtime", label: "Modified" },
];

const ARIA_SORT: Record<SortDir, "ascending" | "descending"> = {
  asc: "ascending",
  desc: "descending",
};

// Below this many pixels of mouse movement, a background mousedown+mouseup
// is treated as a plain click (selection-clearing), not a rubber-band drag.
const RUBBER_BAND_THRESHOLD_PX = 4;

interface RubberBandRect {
  startY: number; // content-space: relative to the list container, scrollTop included
  currentY: number;
}

// Dumb renderer: data comes in via props only. Rows are windowed (see
// `range` below) rather than rendering all of props.entries at once.
export function FileList(props: FileListProps) {
  // O(1) membership check per row; createSelector still limits re-renders to
  // just the rows whose membership actually flipped.
  const selectedPathSet = createMemo(() => new Set(props.selectedPaths));
  const isSelected = createSelector<Set<string>, string>(
    selectedPathSet,
    (path, paths) => paths.has(path),
  );
  const isCursor = createSelector(() => props.cursor);
  const cutPathSet = createMemo(() => new Set(props.cutPaths));
  const isCut = createSelector<Set<string>, string>(cutPathSet, (path, paths) =>
    paths.has(path),
  );
  const isRenaming = createSelector(() =>
    props.editing?.mode === "rename" ? props.editing.path : null,
  );
  const isActiveSort = createSelector(() => props.sortKey);

  // Any open context menu (blank-area or row) suspends the container's own
  // arrow-key navigation, since Kobalte's menu highlight uses the same keys.
  const [menuOpen, setMenuOpen] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;
  let phantomInputRef: HTMLInputElement | undefined;

  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);

  // Windowing math, frozen while a native drag is in flight: recalculating
  // it mid-drag can unmount the dragged row's DOM and cancel the drag
  // session (same reasoning as the hidden-pane trick in spec 11).
  const range = createMemo<VisibleRange>(
    (prev) =>
      isDragActive()
        ? prev
        : visibleRange(scrollTop(), viewportHeight(), props.entries.length, 8),
    visibleRange(0, 0, 0, 8),
    // visibleRange() returns a fresh object every call; without a value
    // comparator, unchanged windows would still propagate to downstream
    // memos (e.g. cursorRowId) on every scroll tick, reintroducing the
    // per-frame O(n) work windowing exists to avoid.
    { equals: (a, b) => a.start === b.start && a.end === b.end },
  );

  createEffect(() => {
    if (!containerRef) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportHeight(entry.contentRect.height);
    });
    observer.observe(containerRef);
    onCleanup(() => observer.disconnect());
  });

  // Only set aria-activedescendant when the cursor row is actually rendered
  // (outside the window, its id doesn't exist in the DOM). Checked against
  // just the rendered slice (not the full entries array) so this stays
  // cheap on every cursor move even for large directories.
  const cursorRowId = createMemo(() => {
    if (!props.cursor) return undefined;
    const { start, end } = range();
    const rendered = props.entries
      .slice(start, end)
      .some((e) => e.path === props.cursor);
    return rendered ? rowId(props.cursor) : undefined;
  });

  // Keeps a DOM scrollTop write and the `scrollTop` signal in sync, so
  // `range` reflects the new position on this tick rather than waiting for
  // the next native scroll event.
  const commitScrollTop = (value: number) => {
    if (!containerRef) return;
    containerRef.scrollTop = value;
    setScrollTop(value);
  };

  // Scrolls row `index` into view, if needed.
  const scrollToIndex = (index: number) => {
    if (index < 0) return;
    const next = ensureVisible(scrollTop(), viewportHeight(), index);
    if (next !== null) commitScrollTop(next);
  };

  const currentSelection = (): Selection => ({
    paths: props.selectedPaths,
    anchor: props.anchor,
    cursor: props.cursor,
  });

  const selectedEntries = () =>
    props.entries.filter((e) => props.selectedPaths.includes(e.path));

  // Dropping on blank list space (not a row) moves into the directory this
  // list is showing. Guarded by `e.target === e.currentTarget` so a drop
  // that bubbled up from a row (already handled by FileItem's own drop
  // target) is left alone here — no need to touch FileItem's handlers.
  const backgroundDropTarget = createDragOverTarget(acceptsVoyagerDrag);

  // Runs `fn` only for events targeting the container itself, not ones
  // bubbled up from a row.
  const onlyForBackground =
    <
      E extends {
        target: EventTarget | null;
        currentTarget: EventTarget | null;
      },
    >(
      fn: (e: E) => void,
    ) =>
    (e: E) => {
      if (e.target === e.currentTarget) fn(e);
    };
  const handleContainerDragOver = onlyForBackground(
    backgroundDropTarget.onDragOver,
  );
  const handleContainerDragEnter = onlyForBackground(
    backgroundDropTarget.onDragEnter,
  );

  const handleContainerDrop = (e: DragEvent) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    backgroundDropTarget.clear();
    const sources = readVoyagerPaths(e);
    if (sources.length > 0) props.onDropMove(sources, props.currentPath);
  };

  // Clicking blank list space (not a row) clears the selection, matching
  // common file manager behavior. No-ops when a rubber-band drag (below)
  // just consumed the click via its own capturing listener.
  const handleContainerClick = onlyForBackground<MouseEvent>(() =>
    props.onSelectionChange(emptySelection),
  );

  const [rubberBand, setRubberBand] = createSignal<RubberBandRect | null>(null);

  // Rows render in the same order as props.entries, so pairing them by index
  // avoids a per-entry DOM lookup. `containerTop`/`scrollTop` are passed in
  // (read once per mousemove tick by the caller) rather than re-read here.
  const updateBandSelection = (
    containerTop: number,
    scrollTop: number,
    top: number,
    bottom: number,
  ) => {
    if (!containerRef) return;
    const rows = containerRef.querySelectorAll<HTMLElement>('[role="option"]');
    const hits: string[] = [];
    const { start } = range();
    rows.forEach((rowEl, index) => {
      const entry = props.entries[start + index];
      if (!entry) return;
      const rect = rowEl.getBoundingClientRect();
      const rowTop = rect.top - containerTop + scrollTop;
      const rowBottom = rect.bottom - containerTop + scrollTop;
      if (rowBottom >= top && rowTop <= bottom) hits.push(entry.path);
    });
    props.onSelectionChange(bandSelect(props.entries, hits));
  };

  // Stops listening for whichever rubber-band drag is currently in flight,
  // if any (re-armed by handleContainerMouseDown below). Kept separate from
  // the mouseup handler's own logic so the component-level onCleanup below
  // — needed in case the tab closes mid-drag — only ever stops listening,
  // without also running the click-suppression setup meant for a real
  // completed drag.
  let stopTracking: (() => void) | null = null;

  // Rubber-band select: mousedown on blank space starts tracking via
  // document-level listeners (so the drag survives leaving the container),
  // and only becomes a real drag past a small movement threshold — below
  // that, mouseup falls through to the plain background-click handler above.
  const handleContainerMouseDown = onlyForBackground<MouseEvent>((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    // Background mousedown normally focuses the container by default (it's
    // the nearest focusable ancestor); preventDefault above (needed to stop
    // native text-selection during a real drag) suppresses that, so restore
    // it explicitly to keep keyboard nav working right after a plain click.
    containerRef?.focus();
    if (!containerRef) return;
    const startRect = containerRef.getBoundingClientRect();
    const startScrollTop = containerRef.scrollTop;
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startY = startClientY - startRect.top + startScrollTop;
    let moved = false;

    const onMove = (moveEvent: MouseEvent) => {
      if (
        !moved &&
        Math.hypot(
          moveEvent.clientX - startClientX,
          moveEvent.clientY - startClientY,
        ) < RUBBER_BAND_THRESHOLD_PX
      ) {
        return;
      }
      moved = true;
      if (!containerRef) return;
      const containerTop = containerRef.getBoundingClientRect().top;
      const scrollTop = containerRef.scrollTop;
      const currentY = moveEvent.clientY - containerTop + scrollTop;
      setRubberBand({ startY, currentY });
      updateBandSelection(
        containerTop,
        scrollTop,
        Math.min(startY, currentY),
        Math.max(startY, currentY),
      );
    };

    const onUp = () => {
      stopTracking?.();
      stopTracking = null;
      setRubberBand(null);
      if (moved) {
        // Consumes the click event that follows this mouseup — whatever its
        // target ends up being — so it can't clear or replace the selection
        // this drag just produced. Registered on `document` (not the
        // container) since the mouseup, and thus the resulting click, may
        // land outside the list entirely (e.g. the user dragged past its
        // edge); a container-only listener would then never fire and leak.
        // The trailing removeEventListener call is a no-op if the listener
        // already consumed a click, and a safety net if it never got one.
        const suppressClick = (clickEvent: MouseEvent) => {
          clickEvent.stopPropagation();
          document.removeEventListener("click", suppressClick, true);
        };
        document.addEventListener("click", suppressClick, true);
        setTimeout(() => {
          document.removeEventListener("click", suppressClick, true);
        }, 0);
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    stopTracking = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  });

  onCleanup(() => stopTracking?.());

  createEffect(() => {
    if (props.editing?.mode === "create" && phantomInputRef && containerRef) {
      commitScrollTop(containerRef.scrollHeight - containerRef.clientHeight);
      phantomInputRef.focus();
    }
  });

  const commitOrCancelCreate = (value: string) => {
    if (value.trim() === "") {
      props.onCancelEdit();
    } else {
      props.onCommitCreate(value);
    }
  };

  const handlePhantomKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitOrCancelCreate((e.currentTarget as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      props.onCancelEdit();
    }
  };

  const handlePhantomBlur = (e: FocusEvent) => {
    commitOrCancelCreate((e.currentTarget as HTMLInputElement).value);
  };

  // Shared by arrow keys / Home / End / PageUp / PageDown: replaces (or,
  // Shift-held, range-extends) the selection to `target` and scrolls it into
  // view.
  const moveCursorTo = (target: Entry, shiftKey: boolean) => {
    const sel = shiftKey
      ? rangeSelect(
          props.entries,
          resolveAnchor(props.entries, currentSelection()),
          target.path,
        )
      : replaceSelect(target.path);
    props.onSelectionChange(sel);
    scrollToIndex(props.entries.findIndex((e) => e.path === target.path));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (menuOpen()) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      props.onSelectionChange(selectAll(props.entries));
      return;
    }
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      props.onCopy();
      return;
    }
    if (mod && e.key.toLowerCase() === "x") {
      e.preventDefault();
      props.onCut();
      return;
    }
    if (mod && e.key.toLowerCase() === "v") {
      e.preventDefault();
      props.onPaste();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      props.onSelectionChange(emptySelection);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = entryAfterMove(
        props.entries,
        props.cursor,
        e.key === "ArrowDown" ? 1 : -1,
      );
      if (next) moveCursorTo(next, e.shiftKey);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const target =
        e.key === "Home"
          ? props.entries[0]
          : props.entries[props.entries.length - 1];
      if (target) moveCursorTo(target, e.shiftKey);
      return;
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const pageSize = containerRef
        ? Math.floor(containerRef.clientHeight / 28)
        : 1;
      const next = entryAfterMove(
        props.entries,
        props.cursor,
        e.key === "PageDown" ? pageSize : -pageSize,
      );
      if (next) moveCursorTo(next, e.shiftKey);
      return;
    }
    if (e.key === "F2") {
      if (props.selectedPaths.length === 1) {
        e.preventDefault();
        handleRenameSelection();
      }
      return;
    }
    if (e.key === "Enter" || e.key === "Delete") {
      const selected = selectedEntries();
      if (selected.length === 0) return;
      if (e.key === "Enter") props.onOpen(selected);
      else props.onTrash(selected.map((it) => it.path));
    }
  };

  // Per-row FileItem callbacks, defined once and passed by reference (Solid's
  // <For> only invokes its callback once per item anyway, but hoisting these
  // keeps each row's wiring to a single line and avoids re-deriving the same
  // replaceSelect call in both onSelect and onContextMenuSelect).
  const handleOpenSelection = () => props.onOpen(selectedEntries());

  const handleSelect = (entry: Entry) =>
    props.onSelectionChange(replaceSelect(entry.path));

  const handleToggleSelect = (entry: Entry) =>
    props.onSelectionChange(
      toggleSelect(props.entries, currentSelection(), entry.path),
    );

  const handleRangeSelect = (entry: Entry) =>
    props.onSelectionChange(
      rangeSelect(
        props.entries,
        resolveAnchor(props.entries, currentSelection()),
        entry.path,
      ),
    );

  const handleContextMenuSelect = (entry: Entry) => {
    if (!isSelected(entry.path)) handleSelect(entry);
  };

  const handleRowDragStart = (entry: Entry, dragEvent: DragEvent) => {
    const wasSelected = isSelected(entry.path);
    const paths = wasSelected ? props.selectedPaths : [entry.path];
    if (!wasSelected) handleSelect(entry);
    startVoyagerDrag(dragEvent, paths);
  };

  const handleTrashSelection = () =>
    props.onTrash(selectedEntries().map((it) => it.path));

  const handleRenameSelection = () => {
    const [only] = selectedEntries();
    if (only) props.onRename(only);
  };

  return (
    <div class={styles.container}>
      <div class={styles.header}>
        <For each={HEADERS}>
          {(header) => (
            // biome-ignore lint/a11y/useSemanticElements: header is a CSS grid row, not a table; role="columnheader" on the button keeps aria-sort valid while staying keyboard-clickable
            <button
              type="button"
              role="columnheader"
              class={styles.headerButton}
              aria-sort={
                isActiveSort(header.key) ? ARIA_SORT[props.sortDir] : undefined
              }
              onClick={() => props.onSort(header.key)}
            >
              {header.label}
              <Show when={isActiveSort(header.key)}>
                <Show
                  when={props.sortDir === "asc"}
                  fallback={<ChevronDown size={12} />}
                >
                  <ChevronUp size={12} />
                </Show>
              </Show>
            </button>
          )}
        </For>
      </div>
      <ContextMenu.Root onOpenChange={setMenuOpen}>
        <ContextMenu.Trigger
          as="div"
          ref={containerRef}
          class={styles.list}
          classList={{ [styles.dropTarget]: backgroundDropTarget.dragOver() }}
          role="listbox"
          aria-multiselectable="true"
          tabIndex="0"
          aria-activedescendant={cursorRowId()}
          onKeyDown={handleKeyDown}
          onClick={handleContainerClick}
          onMouseDown={handleContainerMouseDown}
          onScroll={(e: Event) =>
            setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)
          }
          onDragOver={handleContainerDragOver}
          onDragEnter={handleContainerDragEnter}
          onDragLeave={backgroundDropTarget.onDragLeave}
          onDrop={handleContainerDrop}
        >
          <Show when={rubberBand()}>
            {(band) => (
              <div
                class={styles.rubberBand}
                style={{
                  top: `${Math.min(band().startY, band().currentY)}px`,
                  height: `${Math.abs(band().currentY - band().startY)}px`,
                }}
              />
            )}
          </Show>
          <div style={{ height: `${range().padTop}px` }} />
          <For each={props.entries.slice(range().start, range().end)}>
            {(entry) => (
              <FileItem
                entry={entry}
                selected={isSelected(entry.path)}
                isCursor={isCursor(entry.path)}
                isCut={isCut(entry.path)}
                editing={isRenaming(entry.path)}
                canRename={props.selectedPaths.length === 1}
                onOpen={handleOpenSelection}
                onSelect={handleSelect}
                onToggleSelect={handleToggleSelect}
                onRangeSelect={handleRangeSelect}
                onContextMenuSelect={handleContextMenuSelect}
                onDragStart={handleRowDragStart}
                onDropMove={props.onDropMove}
                onTrash={handleTrashSelection}
                onRename={handleRenameSelection}
                onCopy={props.onCopy}
                onCut={props.onCut}
                onCommitRename={props.onCommitRename}
                onCancelEdit={props.onCancelEdit}
                onMenuOpenChange={setMenuOpen}
              />
            )}
          </For>
          <div style={{ height: `${range().padBottom}px` }} />
          <Show when={props.editing?.mode === "create" && props.editing}>
            {(editing) => (
              <div class={styles.phantomRow}>
                <Dynamic
                  component={iconFor({
                    name: "",
                    path: "",
                    is_dir: editing().isDir,
                    is_symlink: false,
                    size: null,
                    mtime: null,
                  })}
                  size={16}
                  class={itemStyles.icon}
                />
                <input
                  ref={phantomInputRef}
                  class={itemStyles.nameInput}
                  onKeyDown={handlePhantomKeyDown}
                  onBlur={handlePhantomBlur}
                />
              </div>
            )}
          </Show>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content class={itemStyles.menu}>
            <ContextMenu.Item
              class={itemStyles.menuItem}
              onSelect={() => props.onNewFolder()}
            >
              New Folder
            </ContextMenu.Item>
            <ContextMenu.Item
              class={itemStyles.menuItem}
              onSelect={() => props.onNewFile()}
            >
              New File
            </ContextMenu.Item>
            <ContextMenu.Item
              class={itemStyles.menuItem}
              disabled={!props.canPaste}
              onSelect={() => props.onPaste()}
            >
              Paste
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </div>
  );
}
