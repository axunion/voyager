import { createSignal } from "solid-js";
import { deleteSettings, loadSettings, saveSettings } from "../lib/ipc";
import {
  parsePersistedSettings,
  serializePersistedSettings,
} from "../lib/settingsFile";

// App-wide settings. Session-only by default; the opt-in sidecar file
// (voyager.json next to the executable) is the one sanctioned persistence.
const [showHidden, setShowHidden] = createSignal(false);

// True while sidecar persistence is on: settings were loaded from the file
// at startup or the user turned "Remember settings" on. Every change is
// then auto-saved. A signal because the menu checkbox reflects it.
const [persistEnabled, setPersistEnabled] = createSignal(false);

const writeFile = () =>
  saveSettings(serializePersistedSettings({ showHidden: showHidden() }));

export const settings = {
  showHidden,
  persistEnabled,

  // Applies the sidecar file if present and valid; otherwise session-only.
  // Never throws — every failure mode is a silent fallback. A corrupt file
  // does not enable auto-save (turning persistence on later repairs it).
  async init(): Promise<void> {
    try {
      const raw = await loadSettings();
      if (raw === null) return;
      const parsed = parsePersistedSettings(raw);
      if (parsed === null) return;
      setShowHidden(parsed.showHidden);
      setPersistEnabled(true);
    } catch {
      // Treat any IPC failure as "no settings file": session-only.
    }
  },

  toggleShowHidden(): boolean {
    setShowHidden((v) => !v);
    if (persistEnabled()) writeFile().catch(() => {}); // auto-save stays silent
    return showHidden();
  },

  // Turns sidecar persistence on (write the file) or off (delete it).
  // Rejects on failure so the caller can surface the error banner; the
  // flag only changes when the file operation succeeded.
  async setPersist(enabled: boolean): Promise<void> {
    if (enabled) {
      await writeFile();
    } else {
      await deleteSettings();
    }
    setPersistEnabled(enabled);
  },
};
