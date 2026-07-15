import * as ContextMenu from "@kobalte/core/context-menu";
import Link2 from "lucide-solid/icons/link-2";
import { createEffect, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  acceptsVoyagerDrag,
  createDragOverTarget,
  readVoyagerPaths,
} from "../lib/dnd";
import { formatMtime } from "../lib/formatMtime";
import { formatSize } from "../lib/formatSize";
import { iconFor } from "../lib/icons";
import type { Entry } from "../lib/ipc";
import { rowId } from "../lib/listNav";
import styles from "./FileItem.module.css";

interface FileItemProps {
  entry: Entry;
  selected: boolean;
  isCursor: boolean;
  isCut: boolean;
  editing: boolean;
  canRename: boolean;
  onOpen(): void;
  onSelect(entry: Entry): void;
  onToggleSelect(entry: Entry): void;
  onRangeSelect(entry: Entry): void;
  onContextMenuSelect(entry: Entry): void;
  onDragStart(entry: Entry, e: DragEvent): void;
  onDropMove(sourcePaths: string[], targetDirPath: string): void;
  onTrash(): void;
  onRename(): void;
  onCopy(): void;
  onCut(): void;
  onCommitRename(name: string): void;
  onCancelEdit(): void;
  onMenuOpenChange(open: boolean): void;
}

export function FileItem(props: FileItemProps) {
  const dropTarget = createDragOverTarget(
    (e) => props.entry.is_dir && acceptsVoyagerDrag(e),
  );
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.editing && inputRef) {
      inputRef.focus();
      inputRef.select();
    }
  });

  const handleInputKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      props.onCommitRename((e.currentTarget as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      props.onCancelEdit();
    }
  };

  const handleInputBlur = (e: FocusEvent) => {
    props.onCommitRename((e.currentTarget as HTMLInputElement).value);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    // Stops this from also reaching FileList's own background drop target
    // (bubbling would otherwise fire a second, redundant move for the same
    // drop).
    e.stopPropagation();
    dropTarget.clear();
    const sources = readVoyagerPaths(e);
    if (sources.length > 0) props.onDropMove(sources, props.entry.path);
  };

  const handleClick = (e: MouseEvent) => {
    if (e.shiftKey) {
      props.onRangeSelect(props.entry);
    } else if (e.metaKey || e.ctrlKey) {
      props.onToggleSelect(props.entry);
    } else {
      props.onSelect(props.entry);
    }
  };

  return (
    <ContextMenu.Root onOpenChange={props.onMenuOpenChange}>
      <ContextMenu.Trigger
        as="div"
        id={rowId(props.entry.path)}
        role="option"
        aria-selected={props.selected}
        class={styles.row}
        classList={{
          [styles.selected]: props.selected,
          [styles.cursor]: props.isCursor,
          [styles.cut]: props.isCut,
          [styles.dropTarget]: dropTarget.dragOver(),
        }}
        draggable={!props.editing}
        onDragStart={(e: DragEvent) => props.onDragStart(props.entry, e)}
        onDragOver={dropTarget.onDragOver}
        onDragEnter={dropTarget.onDragEnter}
        onDragLeave={dropTarget.onDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onDblClick={() => {
          if (!props.editing) props.onOpen();
        }}
        onContextMenu={(e: MouseEvent) => {
          e.stopPropagation();
          props.onContextMenuSelect(props.entry);
        }}
      >
        <div class={styles.nameCell}>
          <Dynamic
            component={iconFor(props.entry)}
            size={16}
            class={styles.icon}
          />
          <Show
            when={props.editing}
            fallback={
              <>
                <span class={styles.name}>{props.entry.name}</span>
                <Show when={props.entry.is_symlink}>
                  <span class={styles.symlinkBadge} title="Symbolic link">
                    <Link2 size={12} />
                  </span>
                </Show>
              </>
            }
          >
            <input
              ref={inputRef}
              class={styles.nameInput}
              value={props.entry.name}
              onKeyDown={handleInputKeyDown}
              onBlur={handleInputBlur}
            />
          </Show>
        </div>
        <span class={styles.size}>{formatSize(props.entry.size)}</span>
        <span class={styles.mtime}>{formatMtime(props.entry.mtime)}</span>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.menu}>
          <ContextMenu.Item
            class={styles.menuItem}
            onSelect={() => props.onOpen()}
          >
            Open
          </ContextMenu.Item>
          <Show when={props.canRename}>
            <ContextMenu.Item
              class={styles.menuItem}
              onSelect={() => props.onRename()}
            >
              Rename
            </ContextMenu.Item>
          </Show>
          <ContextMenu.Item
            class={styles.menuItem}
            onSelect={() => props.onCopy()}
          >
            Copy
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.menuItem}
            onSelect={() => props.onCut()}
          >
            Cut
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.menuItem}
            onSelect={() => props.onTrash()}
          >
            Move to Trash
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
