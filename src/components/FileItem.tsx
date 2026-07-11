import * as ContextMenu from "@kobalte/core/context-menu";
import { createEffect, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  acceptsVoyagerDrag,
  createDragOverTarget,
  readVoyagerPath,
  startVoyagerDrag,
} from "../lib/dnd";
import { iconFor } from "../lib/icons";
import type { Entry } from "../lib/ipc";
import { rowId } from "../lib/listNav";
import styles from "./FileItem.module.css";

interface FileItemProps {
  entry: Entry;
  selected: boolean;
  editing: boolean;
  onOpen(entry: Entry): void;
  onSelect(entry: Entry): void;
  onDropMove(sourcePath: string, targetDirPath: string): void;
  onTrash(entry: Entry): void;
  onRename(entry: Entry): void;
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

  const handleDragStart = (e: DragEvent) => {
    startVoyagerDrag(e, props.entry.path);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    dropTarget.clear();
    const source = readVoyagerPath(e);
    if (source && source !== props.entry.path) {
      props.onDropMove(source, props.entry.path);
    }
  };

  const handleClick = () => {
    props.onSelect(props.entry);
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
          [styles.dropTarget]: dropTarget.dragOver(),
        }}
        draggable={!props.editing}
        onDragStart={handleDragStart}
        onDragOver={dropTarget.onDragOver}
        onDragEnter={dropTarget.onDragEnter}
        onDragLeave={dropTarget.onDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        onDblClick={() => {
          if (!props.editing) props.onOpen(props.entry);
        }}
        onContextMenu={(e: MouseEvent) => {
          e.stopPropagation();
          props.onSelect(props.entry);
        }}
      >
        <Dynamic
          component={iconFor(props.entry)}
          size={16}
          class={styles.icon}
        />
        <Show
          when={props.editing}
          fallback={<span class={styles.name}>{props.entry.name}</span>}
        >
          <input
            ref={inputRef}
            class={styles.nameInput}
            value={props.entry.name}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
          />
        </Show>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.menu}>
          <ContextMenu.Item
            class={styles.menuItem}
            onSelect={() => props.onOpen(props.entry)}
          >
            Open
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.menuItem}
            onSelect={() => props.onRename(props.entry)}
          >
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.menuItem}
            onSelect={() => props.onTrash(props.entry)}
          >
            Move to Trash
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
