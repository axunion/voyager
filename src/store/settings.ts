import { createSignal } from "solid-js";

// Session-only app-wide settings. Never persisted anywhere by design.
const [showHidden, setShowHidden] = createSignal(false);

export const settings = {
  showHidden,
  toggleShowHidden(): boolean {
    setShowHidden((v) => !v);
    return showHidden();
  },
};
