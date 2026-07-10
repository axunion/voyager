import Plus from "lucide-solid/icons/plus";
import X from "lucide-solid/icons/x";
import { createSelector, For, Show } from "solid-js";
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
}

export function TabBar(props: TabBarProps) {
  // O(2) updates on active-tab change instead of re-running every row's effect
  const isActive = createSelector(() => props.activeTabId);

  return (
    <div class={styles.bar} role="tablist">
      <For each={props.tabs}>
        {(tab) => {
          const label = () => basename(tab.currentPath);
          return (
            <div
              class={styles.tab}
              classList={{ [styles.active]: isActive(tab.id) }}
              role="tab"
              aria-selected={isActive(tab.id)}
              tabIndex="0"
              title={tab.currentPath}
              onClick={() => props.onActivate(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  props.onActivate(tab.id);
                }
              }}
            >
              <span class={styles.label}>{label()}</span>
              <Show when={props.tabs.length > 1}>
                <button
                  type="button"
                  class={styles.close}
                  aria-label={`Close ${label()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onClose(tab.id);
                  }}
                >
                  <X size={12} />
                </button>
              </Show>
            </div>
          );
        }}
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
