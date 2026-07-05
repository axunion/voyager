import { createSelector, For } from "solid-js";
import type { Entry } from "../lib/ipc";
import { FileItem } from "./FileItem";
import styles from "./FileList.module.css";

interface FileListProps {
  entries: Entry[];
  selectedPath: string | null;
  onOpen(entry: Entry): void;
  onSelect(entry: Entry): void;
  onDropMove(sourcePath: string, targetDirPath: string): void;
  onTrash(entry: Entry): void;
}

// Dumb renderer: data comes in via props only, so the <For> below can be
// swapped for a virtualizer without touching the store.
export function FileList(props: FileListProps) {
  // O(2) updates on selection change instead of re-running every row's effect
  const isSelected = createSelector(() => props.selectedPath);
  return (
    <div class={styles.list}>
      <For each={props.entries}>
        {(entry) => (
          <FileItem
            entry={entry}
            selected={isSelected(entry.path)}
            onOpen={props.onOpen}
            onSelect={props.onSelect}
            onDropMove={props.onDropMove}
            onTrash={props.onTrash}
          />
        )}
      </For>
    </div>
  );
}
