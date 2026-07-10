import { createSelector, For } from "solid-js";
import type { Entry } from "../lib/ipc";
import { entryAfterMove, rowId } from "../lib/listNav";
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

  let containerRef: HTMLDivElement | undefined;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = entryAfterMove(
        props.entries,
        props.selectedPath,
        e.key === "ArrowDown" ? 1 : -1,
      );
      if (!next) return;
      props.onSelect(next);
      containerRef
        ?.querySelector(`[id="${rowId(next.path)}"]`)
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter" || e.key === "Delete") {
      const entry = props.entries.find((it) => it.path === props.selectedPath);
      if (!entry) return;
      if (e.key === "Enter") props.onOpen(entry);
      else props.onTrash(entry);
    }
  };

  return (
    <div
      ref={containerRef}
      class={styles.list}
      role="listbox"
      tabIndex="0"
      aria-activedescendant={
        props.selectedPath ? rowId(props.selectedPath) : undefined
      }
      onKeyDown={handleKeyDown}
    >
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
