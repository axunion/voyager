export type GlobalShortcutAction =
  | { type: "new-tab" }
  | { type: "close-tab" }
  | { type: "back" }
  | { type: "forward" }
  | { type: "toggle-hidden" }
  | { type: "activate-tab"; index: number } // 0-based; Mod+9 → { index: -1 } = last
  | { type: "next-tab" }
  | { type: "prev-tab" }
  | { type: "refresh" }
  | { type: "new-folder" }
  | { type: "parent-dir" }
  | { type: "focus-filter" }
  | { type: "save-settings" };

export interface ShortcutInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  targetIsTextInput: boolean; // e.target is <input> or <textarea>
}

// Bindings suppressed while a text input/textarea has focus.
const SUPPRESSED_WHILE_TYPING = new Set<GlobalShortcutAction["type"]>([
  "new-folder",
  "parent-dir",
]);

function matchAction(e: ShortcutInput): GlobalShortcutAction | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  // Ctrl+Tab / Ctrl+Shift+Tab is always literal Ctrl on both OSes (Cmd+Tab is
  // the macOS window switcher), so this checks ctrlKey directly, not "Mod".
  if (e.ctrlKey && key === "tab") {
    return e.shiftKey ? { type: "prev-tab" } : { type: "next-tab" };
  }

  if (mod && !e.shiftKey && !e.altKey) {
    if (key === "t") return { type: "new-tab" };
    if (key === "w") return { type: "close-tab" };
    if (key === "r") return { type: "refresh" };
    if (key === "f") return { type: "focus-filter" };
    if (key === "s") return { type: "save-settings" };
    if (key === "arrowup") return { type: "parent-dir" };
    // Mod+1..8 → 0-based tab index; Mod+9 → -1 (last tab, browser convention).
    if (/^[1-9]$/.test(key)) {
      const n = Number(key);
      return { type: "activate-tab", index: n === 9 ? -1 : n - 1 };
    }
    return null;
  }

  if (mod && e.shiftKey && !e.altKey) {
    if (key === ".") return { type: "toggle-hidden" };
    if (key === "n") return { type: "new-folder" };
    return null;
  }

  if (e.altKey && !mod) {
    if (key === "arrowleft") return { type: "back" };
    if (key === "arrowright") return { type: "forward" };
  }

  return null;
}

// Pure mapping of the global shortcut binding table. Returns
// null when nothing matches, including suppressed-while-typing cases.
export function matchGlobalShortcut(
  e: ShortcutInput,
): GlobalShortcutAction | null {
  const action = matchAction(e);
  if (
    action &&
    e.targetIsTextInput &&
    SUPPRESSED_WHILE_TYPING.has(action.type)
  ) {
    return null;
  }
  return action;
}
