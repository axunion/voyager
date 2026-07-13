import * as ContextMenu from "@kobalte/core/context-menu";
import {
  createEffect,
  createSelector,
  createSignal,
  For,
  Show,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  acceptsVoyagerDrag,
  createDragOverTarget,
  readVoyagerPath,
} from "../lib/dnd";
import { iconFor } from "../lib/icons";
import type { Entry } from "../lib/ipc";
import { entryAfterMove, rowId } from "../lib/listNav";
import type { EditingState } from "../store/explorer";
import { FileItem } from "./FileItem";
import itemStyles from "./FileItem.module.css";
import styles from "./FileList.module.css";

interface FileListProps {
  entries: Entry[];
  currentPath: string;
  selectedPath: string | null;
  editing: EditingState;
  onOpen(entry: Entry): void;
  onSelect(entry: Entry): void;
  onDropMove(sourcePath: string, targetDirPath: string): void;
  onTrash(entry: Entry): void;
  onRename(entry: Entry): void;
  onNewFolder(): void;
  onNewFile(): void;
  onCommitRename(name: string): void;
  onCommitCreate(name: string): void;
  onCancelEdit(): void;
}

// Dumb renderer: data comes in via props only, so the <For> below can be
// swapped for a virtualizer without touching the store.
export function FileList(props: FileListProps) {
  // O(2) updates on selection change instead of re-running every row's effect
  const isSelected = createSelector(() => props.selectedPath);
  const isRenaming = createSelector(() =>
    props.editing?.mode === "rename" ? props.editing.path : null,
  );

  // Any open context menu (blank-area or row) suspends the container's own
  // arrow-key navigation, since Kobalte's menu highlight uses the same keys.
  const [menuOpen, setMenuOpen] = createSignal(false);

  let containerRef: HTMLDivElement | undefined;
  let phantomInputRef: HTMLInputElement | undefined;

  // Dropping on blank list space (not a row) moves into the directory this
  // list is showing. Guarded by `e.target === e.currentTarget` so a drop
  // that bubbled up from a row (already handled by FileItem's own drop
  // target) is left alone here — no need to touch FileItem's handlers.
  const backgroundDropTarget = createDragOverTarget(acceptsVoyagerDrag);

  // Runs `fn` only for events targeting the container itself, not ones
  // bubbled up from a row.
  const onlyForBackground = (fn: (e: DragEvent) => void) => (e: DragEvent) => {
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
    const source = readVoyagerPath(e);
    if (source) props.onDropMove(source, props.currentPath);
  };

  createEffect(() => {
    if (props.editing?.mode === "create" && phantomInputRef) {
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

  const handleKeyDown = (e: KeyboardEvent) => {
    if (menuOpen()) return;
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
    <div class={styles.container}>
      <div class={styles.header}>
        <span>Name</span>
        <span>Size</span>
        <span>Modified</span>
      </div>
      <ContextMenu.Root onOpenChange={setMenuOpen}>
        <ContextMenu.Trigger
          as="div"
          ref={containerRef}
          class={styles.list}
          classList={{ [styles.dropTarget]: backgroundDropTarget.dragOver() }}
          role="listbox"
          tabIndex="0"
          aria-activedescendant={
            props.selectedPath ? rowId(props.selectedPath) : undefined
          }
          onKeyDown={handleKeyDown}
          onDragOver={handleContainerDragOver}
          onDragEnter={handleContainerDragEnter}
          onDragLeave={backgroundDropTarget.onDragLeave}
          onDrop={handleContainerDrop}
        >
          <For each={props.entries}>
            {(entry) => (
              <FileItem
                entry={entry}
                selected={isSelected(entry.path)}
                editing={isRenaming(entry.path)}
                onOpen={props.onOpen}
                onSelect={props.onSelect}
                onDropMove={props.onDropMove}
                onTrash={props.onTrash}
                onRename={props.onRename}
                onCommitRename={props.onCommitRename}
                onCancelEdit={props.onCancelEdit}
                onMenuOpenChange={setMenuOpen}
              />
            )}
          </For>
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
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </div>
  );
}
