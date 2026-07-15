import { createSignal } from "solid-js";

export type ClipboardContent = {
  paths: string[];
  mode: "copy" | "cut";
} | null;

// In-app only by design: never reads from or writes to the OS clipboard.
const [content, setContent] = createSignal<ClipboardContent>(null);

export const clipboard = {
  content,

  set(paths: string[], mode: "copy" | "cut"): void {
    if (paths.length === 0) return;
    setContent({ paths, mode });
  },

  clear(): void {
    setContent(null);
  },
};
