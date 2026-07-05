import { homeDir } from "@tauri-apps/api/path";
import { createStore } from "solid-js/store";
import { type Entry, moveEntry, moveToTrash, readDirectory } from "../lib/ipc";
import {
  emptyHistory,
  type History,
  pushPath,
  stepBack,
  stepForward,
} from "./history";

interface ExplorerState {
  currentPath: string;
  entries: Entry[];
  history: History;
  selectedPath: string | null;
  loading: boolean;
  error: string | null;
}

const [state, setState] = createStore<ExplorerState>({
  currentPath: "",
  entries: [],
  history: emptyHistory,
  selectedPath: null,
  loading: false,
  error: null,
});

// Monotonic token: only the most recent load may commit, so overlapping
// navigations cannot finish out of order and corrupt path/history.
let loadSeq = 0;

// On failure keeps the previous listing and path so the user stays where they were.
async function load(path: string): Promise<boolean> {
  const seq = ++loadSeq;
  setState({ loading: true, error: null });
  try {
    const entries = await readDirectory(path);
    if (seq !== loadSeq) return false;
    setState({
      currentPath: path,
      entries,
      selectedPath: null,
      loading: false,
    });
    return true;
  } catch (e) {
    if (seq !== loadSeq) return false;
    setState({ error: String(e), loading: false });
    return false;
  }
}

async function navigateHistory(
  step: { history: History; path: string } | null,
): Promise<void> {
  if (step && (await load(step.path))) {
    setState("history", step.history);
  }
}

async function mutateAndReload(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
    await load(state.currentPath);
  } catch (e) {
    setState({ error: String(e) });
  }
}

export const explorer = {
  state,

  async init(): Promise<void> {
    try {
      const home = await homeDir();
      await load(home);
    } catch (e) {
      setState({ error: String(e) });
    }
  },

  async navigateTo(path: string): Promise<void> {
    const prevPath = state.currentPath;
    const prevHistory = state.history;
    if (await load(path)) {
      setState("history", pushPath(prevHistory, prevPath));
    }
  },

  goBack(): Promise<void> {
    return navigateHistory(stepBack(state.history, state.currentPath));
  },

  goForward(): Promise<void> {
    return navigateHistory(stepForward(state.history, state.currentPath));
  },

  select(path: string): void {
    setState("selectedPath", path);
  },

  moveIntoFolder(source: string, targetDir: string): Promise<void> {
    return mutateAndReload(() => moveEntry(source, targetDir));
  },

  trashEntry(path: string): Promise<void> {
    return mutateAndReload(() => moveToTrash(path));
  },

  setError(message: string): void {
    setState("error", message);
  },

  clearError(): void {
    setState("error", null);
  },

  canGoBack: () => state.history.back.length > 0,
  canGoForward: () => state.history.forward.length > 0,
};
