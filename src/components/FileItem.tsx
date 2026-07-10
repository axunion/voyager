import * as ContextMenu from "@kobalte/core/context-menu";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { Dynamic } from "solid-js/web";
import { iconFor } from "../lib/icons";
import type { Entry } from "../lib/ipc";
import styles from "./FileItem.module.css";

const DRAG_TYPE = "application/x-voyager-path";

interface FileItemProps {
  entry: Entry;
  selected: boolean;
  onOpen(entry: Entry): void;
  onSelect(entry: Entry): void;
  onDropMove(sourcePath: string, targetDirPath: string): void;
  onTrash(entry: Entry): void;
}

export function FileItem(props: FileItemProps) {
  const [dragOver, setDragOver] = createSignal(false);

  // Fallback for webviews that skip the terminal dragleave on cancelled drags:
  // while highlighted, any drag ending anywhere clears the highlight.
  createEffect(() => {
    if (!dragOver()) return;
    const reset = () => setDragOver(false);
    document.addEventListener("dragend", reset);
    document.addEventListener("drop", reset);
    onCleanup(() => {
      document.removeEventListener("dragend", reset);
      document.removeEventListener("drop", reset);
    });
  });

  // The payload is unreadable during dragover (HTML5 protected mode),
  // so accept/reject based on the declared type only.
  const acceptsDrop = (e: DragEvent) =>
    props.entry.is_dir && (e.dataTransfer?.types.includes(DRAG_TYPE) ?? false);

  const handleDragStart = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData(DRAG_TYPE, props.entry.path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent) => {
    if (!acceptsDrop(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const source = e.dataTransfer?.getData(DRAG_TYPE);
    if (source && source !== props.entry.path) {
      props.onDropMove(source, props.entry.path);
    }
  };

  const handleClick = () => {
    props.onSelect(props.entry);
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        as="div"
        class={styles.row}
        classList={{
          [styles.selected]: props.selected,
          [styles.dropTarget]: dragOver(),
        }}
        draggable={true}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={(e: DragEvent) => {
          if (acceptsDrop(e)) setDragOver(true);
        }}
        onDragLeave={(e: DragEvent & { currentTarget: Node }) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOver(false);
          }
        }}
        onDrop={handleDrop}
        onClick={handleClick}
        onDblClick={() => props.onOpen(props.entry)}
        onContextMenu={() => props.onSelect(props.entry)}
      >
        <Dynamic
          component={iconFor(props.entry)}
          size={16}
          class={styles.icon}
        />
        <span class={styles.name}>{props.entry.name}</span>
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
            onSelect={() => props.onTrash(props.entry)}
          >
            Move to Trash
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
