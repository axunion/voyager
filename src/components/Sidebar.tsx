import { createSelector } from "solid-js";
import type { Entry } from "../lib/ipc";
import { basename } from "../store/tabs";
import styles from "./Sidebar.module.css";
import { TreeNode } from "./TreeNode";

interface SidebarProps {
  rootPath: string;
  expanded: Record<string, boolean>;
  children: Record<string, Entry[]>;
  loading: Record<string, boolean>;
  currentPath: string;
  onToggle(path: string): void;
  onNavigate(path: string): void;
  onDropMove(sourcePath: string, targetDirPath: string): void;
}

// Dumb wrapper: no reference to the tree/explorer stores, data comes in via
// props only (wired in App.tsx).
export function Sidebar(props: SidebarProps) {
  // O(2) updates on navigation instead of re-running every node's effect
  const isSelected = createSelector(() => props.currentPath);

  return (
    <nav class={styles.sidebar}>
      <TreeNode
        entry={{ name: basename(props.rootPath), path: props.rootPath }}
        depth={0}
        expanded={props.expanded}
        children={props.children}
        loading={props.loading}
        isSelected={isSelected}
        onToggle={props.onToggle}
        onNavigate={props.onNavigate}
        onDropMove={props.onDropMove}
      />
    </nav>
  );
}
