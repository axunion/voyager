import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";
import { createEffect, createSelector, For, Show } from "solid-js";
import {
  acceptsVoyagerDrag,
  createDragOverTarget,
  isDragActive,
  readVoyagerPaths,
} from "../lib/dnd";
import { basename } from "../store/tabs";
import styles from "./TabBar.module.css";

interface Tab {
  id: number;
  currentPath: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: number;
  onActivate(id: number): void;
  onClose(id: number): void;
  onAdd(): void;
  onDropMove(sourcePaths: string[], targetDirPath: string): void;
}

// Hovering a file drag over an inactive tab this long auto-switches to it.
// Safe to do mid-drag: App.tsx keeps the drag's origin tab mounted (hidden)
// across the switch, so the dragged row's DOM never unmounts.
const HOVER_SWITCH_DELAY_MS = 600;

function TabItem(props: {
  tab: Tab;
  active: boolean;
  showClose: boolean;
  onActivate(id: number): void;
  onClose(id: number): void;
  onDropMove(sourcePaths: string[], targetDirPath: string): void;
}) {
  const dropTarget = createDragOverTarget(acceptsVoyagerDrag);
  const label = () => basename(props.tab.currentPath);

  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  const clearHoverTimer = () => {
    if (hoverTimer !== undefined) {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
  };
  // Fallback for a drag cancelled (e.g. Esc) without a dragleave on this tab:
  // reuses the app-wide drag-tracking signal instead of each tab registering
  // its own document listener.
  createEffect(() => {
    if (!isDragActive()) clearHoverTimer();
  });

  const handleDragEnter = (e: DragEvent) => {
    dropTarget.onDragEnter(e);
    if (!props.active && acceptsVoyagerDrag(e)) {
      clearHoverTimer();
      hoverTimer = setTimeout(() => {
        hoverTimer = undefined;
        props.onActivate(props.tab.id);
      }, HOVER_SWITCH_DELAY_MS);
    }
  };

  const handleDragLeave = (e: DragEvent & { currentTarget: Node }) => {
    dropTarget.onDragLeave(e);
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      clearHoverTimer();
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    clearHoverTimer();
    dropTarget.clear();
    const sources = readVoyagerPaths(e);
    if (sources.length === 0) return;
    // Handles a drop that beat the hover timer (< 600ms): switch and move
    // together. Safe synchronously now for the same reason as the timer.
    if (!props.active) props.onActivate(props.tab.id);
    props.onDropMove(sources, props.tab.currentPath);
  };

  return (
    <div
      class={styles.tab}
      classList={{
        [styles.active]: props.active,
        [styles.dropTarget]: dropTarget.dragOver(),
      }}
      role="tab"
      aria-selected={props.active}
      tabIndex="0"
      title={props.tab.currentPath}
      onClick={() => props.onActivate(props.tab.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          props.onActivate(props.tab.id);
        }
      }}
      onDragOver={dropTarget.onDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span class={styles.label}>{label()}</span>
      <Show when={props.showClose}>
        <button
          type="button"
          class={styles.close}
          aria-label={`Close ${label()}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onClose(props.tab.id);
          }}
        >
          <X size={12} />
        </button>
      </Show>
    </div>
  );
}

export function TabBar(props: TabBarProps) {
  // O(2) updates on active-tab change instead of re-running every row's effect
  const isActive = createSelector(() => props.activeTabId);

  return (
    <div class={styles.bar} role="tablist">
      <For each={props.tabs}>
        {(tab) => (
          <TabItem
            tab={tab}
            active={isActive(tab.id)}
            showClose={props.tabs.length > 1}
            onActivate={props.onActivate}
            onClose={props.onClose}
            onDropMove={props.onDropMove}
          />
        )}
      </For>
      <button
        type="button"
        class={styles.addButton}
        aria-label="New tab"
        onClick={() => props.onAdd()}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
