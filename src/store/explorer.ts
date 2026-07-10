import { homeDir } from "@tauri-apps/api/path";
import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import { type Entry, moveEntry, moveToTrash, readDirectory } from "../lib/ipc";
import {
  emptyHistory,
  type History,
  pushPath,
  stepBack,
  stepForward,
} from "./history";
import { nextActiveTabId } from "./tabs";

interface TabState {
  id: number;
  currentPath: string;
  entries: Entry[];
  history: History;
  selectedPath: string | null;
  loading: boolean;
}

interface ExplorerState {
  tabs: TabState[];
  activeTabId: number;
  error: string | null;
}

let nextTabId = 1;

function makeTab(path: string): TabState {
  return {
    id: nextTabId++,
    currentPath: path,
    entries: [],
    history: emptyHistory,
    selectedPath: null,
    loading: false,
  };
}

const initialTab = makeTab("");

const [state, setState] = createStore<ExplorerState>({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  error: null,
});

function findTab(id: number): TabState | undefined {
  return state.tabs.find((t) => t.id === id);
}

function activeTab(): TabState {
  const tab = findTab(state.activeTabId);
  if (!tab) throw new Error(`Active tab ${state.activeTabId} not found`);
  return tab;
}

function tabIndex(id: number): number {
  return state.tabs.findIndex((t) => t.id === id);
}

// Looks up the tab by id and merges patch into it in one commit; no-ops
// (returning false) if the tab has since been closed.
function updateTab(id: number, patch: Partial<TabState>): boolean {
  const idx = tabIndex(id);
  if (idx === -1) return false;
  setState("tabs", idx, patch);
  return true;
}

// Per-tab monotonic token: only the most recent load for a given tab may
// commit, so overlapping navigations (or a stale tab closed mid-load) cannot
// corrupt another tab's path/history.
const loadSeq = new Map<number, number>();

// On failure keeps the previous listing and path so the user stays where they were.
async function load(tabId: number, path: string): Promise<boolean> {
  const seq = (loadSeq.get(tabId) ?? 0) + 1;
  loadSeq.set(tabId, seq);
  if (tabIndex(tabId) === -1) return false;
  batch(() => {
    updateTab(tabId, { loading: true });
    setState("error", null);
  });
  try {
    const entries = await readDirectory(path);
    if (loadSeq.get(tabId) !== seq) return false;
    return updateTab(tabId, {
      currentPath: path,
      entries,
      selectedPath: null,
      loading: false,
    });
  } catch (e) {
    if (loadSeq.get(tabId) !== seq) return false;
    batch(() => {
      updateTab(tabId, { loading: false });
      setState("error", String(e));
    });
    return false;
  }
}

async function navigateHistory(
  tabId: number,
  step: { history: History; path: string } | null,
): Promise<void> {
  if (step && (await load(tabId, step.path))) {
    updateTab(tabId, { history: step.history });
  }
}

async function mutateAndReload(
  tabId: number,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
    const tab = findTab(tabId);
    if (tab) await load(tabId, tab.currentPath);
  } catch (e) {
    setState("error", String(e));
  }
}

export const explorer = {
  state,

  activeTab,

  async init(): Promise<void> {
    try {
      const home = await homeDir();
      await load(activeTab().id, home);
    } catch (e) {
      setState("error", String(e));
    }
  },

  async navigateTo(path: string): Promise<void> {
    const tab = activeTab();
    const prevPath = tab.currentPath;
    const prevHistory = tab.history;
    if (await load(tab.id, path)) {
      updateTab(tab.id, { history: pushPath(prevHistory, prevPath) });
    }
  },

  goBack(): Promise<void> {
    const tab = activeTab();
    return navigateHistory(tab.id, stepBack(tab.history, tab.currentPath));
  },

  goForward(): Promise<void> {
    const tab = activeTab();
    return navigateHistory(tab.id, stepForward(tab.history, tab.currentPath));
  },

  select(path: string): void {
    updateTab(state.activeTabId, { selectedPath: path });
  },

  moveIntoFolder(source: string, targetDir: string): Promise<void> {
    return mutateAndReload(state.activeTabId, () =>
      moveEntry(source, targetDir),
    );
  },

  trashEntry(path: string): Promise<void> {
    return mutateAndReload(state.activeTabId, () => moveToTrash(path));
  },

  setError(message: string): void {
    setState("error", message);
  },

  clearError(): void {
    setState("error", null);
  },

  canGoBack: () => activeTab().history.back.length > 0,
  canGoForward: () => activeTab().history.forward.length > 0,

  addTab(): void {
    const current = activeTab();
    const tab = makeTab(current.currentPath);
    batch(() => {
      setState("tabs", (tabs) => [...tabs, tab]);
      setState("activeTabId", tab.id);
    });
    load(tab.id, tab.currentPath);
  },

  closeTab(id: number): void {
    if (state.tabs.length <= 1) return;
    const newActiveId = nextActiveTabId(state.tabs, id, state.activeTabId);
    loadSeq.delete(id);
    batch(() => {
      setState("tabs", (tabs) => tabs.filter((t) => t.id !== id));
      setState("activeTabId", newActiveId);
    });
  },

  activateTab(id: number): void {
    if (tabIndex(id) !== -1) setState("activeTabId", id);
  },
};
