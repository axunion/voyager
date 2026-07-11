import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";
import { createSelector, For, Show } from "solid-js";
import {
  acceptsVoyagerDrag,
  createDragOverTarget,
  readVoyagerPath,
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
  onDropMove(sourcePath: string, targetDirPath: string): void;
}

function TabItem(props: {
  tab: Tab;
  active: boolean;
  showClose: boolean;
  onActivate(id: number): void;
  onClose(id: number): void;
  onDropMove(sourcePath: string, targetDirPath: string): void;
}) {
  const dropTarget = createDragOverTarget(acceptsVoyagerDrag);
  const label = () => basename(props.tab.currentPath);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dropTarget.clear();
    const source = readVoyagerPath(e);
    if (source) props.onDropMove(source, props.tab.currentPath);
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
      onDragEnter={dropTarget.onDragEnter}
      onDragLeave={dropTarget.onDragLeave}
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
