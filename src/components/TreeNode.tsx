import ChevronRight from "lucide-solid/icons/chevron-right";
import Folder from "lucide-solid/icons/folder";
import { For, Show } from "solid-js";
import type { Entry } from "../lib/ipc";
import styles from "./Sidebar.module.css";

interface TreeNodeProps {
  entry: { name: string; path: string };
  depth: number;
  expanded: Record<string, boolean>;
  children: Record<string, Entry[]>;
  loading: Record<string, boolean>;
  isSelected(path: string): boolean;
  onToggle(path: string): void;
  onNavigate(path: string): void;
}

// Recursive: a node renders its own row plus, when expanded, one TreeNode
// per cached child directory.
export function TreeNode(props: TreeNodeProps) {
  const isExpanded = () => props.expanded[props.entry.path] ?? false;

  return (
    <div>
      <div
        class={styles.node}
        classList={{ [styles.selected]: props.isSelected(props.entry.path) }}
        style={{ "padding-left": `${8 + props.depth * 16}px` }}
      >
        <button
          type="button"
          class={styles.chevron}
          classList={{
            [styles.expanded]: isExpanded(),
            [styles.loading]: props.loading[props.entry.path] ?? false,
          }}
          aria-label={isExpanded() ? "Collapse" : "Expand"}
          onClick={() => props.onToggle(props.entry.path)}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          class={styles.label}
          onClick={() => props.onNavigate(props.entry.path)}
        >
          <Folder size={16} class={styles.icon} />
          <span class={styles.name}>{props.entry.name}</span>
        </button>
      </div>
      <Show when={isExpanded()}>
        <For each={props.children[props.entry.path] ?? []}>
          {(child) => (
            <TreeNode
              entry={child}
              depth={props.depth + 1}
              expanded={props.expanded}
              children={props.children}
              loading={props.loading}
              isSelected={props.isSelected}
              onToggle={props.onToggle}
              onNavigate={props.onNavigate}
            />
          )}
        </For>
      </Show>
    </div>
  );
}
