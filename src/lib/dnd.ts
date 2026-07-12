import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

// Shared in-app DnD helpers used by FileItem, TreeNode, and TabBar.
export const DRAG_TYPE = "application/x-voyager-path";

// Usable during dragover/dragenter: the payload is unreadable in HTML5
// protected mode at that point, so this checks the declared type only.
export function acceptsVoyagerDrag(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes(DRAG_TYPE) ?? false;
}

// Usable in drop handlers, once the payload becomes readable.
export function readVoyagerPath(e: DragEvent): string | null {
  return e.dataTransfer?.getData(DRAG_TYPE) || null;
}

// Tracks whether a voyager-origin drag is currently in progress, app-wide.
// Used to keep the drag source's tab content mounted (but hidden) across an
// active-tab switch, since only the active tab's FileList is rendered and
// unmounting the dragged row mid-drag cancels the native drag session.
const [dragActive, setDragActive] = createSignal(false);
export const isDragActive = dragActive;

// Module-scoped fallback: ends the tracked drag regardless of which element
// the browser fires these on (mirrors the dragend/drop fallback pattern in
// createDragOverTarget below). Guarded because this module is also imported
// under Vitest's node environment, where `document` doesn't exist.
if (typeof document !== "undefined") {
  const reset = () => setDragActive(false);
  document.addEventListener("dragend", reset);
  document.addEventListener("drop", reset);
}

// Sets the drag payload on dragstart.
export function startVoyagerDrag(e: DragEvent, path: string): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(DRAG_TYPE, path);
  e.dataTransfer.effectAllowed = "move";
  setDragActive(true);
}

interface DragOverTarget {
  dragOver: Accessor<boolean>;
  clear(): void;
  onDragOver(e: DragEvent): void;
  onDragEnter(e: DragEvent): void;
  onDragLeave(e: DragEvent & { currentTarget: Node }): void;
}

// Drop-target highlight state shared by FileItem/TreeNode/TabBar: tracks
// hover via dragenter/dragleave, and clears it as a fallback when a drag
// ends anywhere in the document (webviews can skip the terminal dragleave
// on a cancelled drag). `accepts` decides whether a given drag is a valid
// drop for this target (e.g. FileItem also requires the target to be a
// directory). Callers still own `onDrop` since the move logic differs.
export function createDragOverTarget(
  accepts: (e: DragEvent) => boolean,
): DragOverTarget {
  const [dragOver, setDragOver] = createSignal(false);

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

  return {
    dragOver,
    clear: () => setDragOver(false),
    onDragOver: (e) => {
      if (!accepts(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    },
    onDragEnter: (e) => {
      if (accepts(e)) setDragOver(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDragOver(false);
      }
    },
  };
}
