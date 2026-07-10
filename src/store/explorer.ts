import { homeDir } from "@tauri-apps/api/path";
import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import {
  createEntry,
  type Entry,
  moveEntry,
  moveToTrash,
  readDirectory,
  renameEntry,
} from "../lib/ipc";
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

export type EditingState =
  | { mode: "rename"; path: string }
  | { mode: "create"; isDir: boolean }
  | null;

interface ExplorerState {
  tabs: TabState[];
  activeTabId: number;
  error: string | null;
  editing: EditingState; // global: only the active tab can edit
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
  editing: null,
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

function clearEditing(): void {
  setState("editing", null);
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
// `selectedPath` defaults to null (fresh listing, nothing selected); callers
// that just created/renamed an entry pass its new path to select it in one commit.
async function load(
  tabId: number,
  path: string,
  selectedPath: string | null = null,
): Promise<boolean> {
  const seq = (loadSeq.get(tabId) ?? 0) + 1;
  loadSeq.set(tabId, seq);
  if (tabIndex(tabId) === -1) return false;
  batch(() => {
    updateTab(tabId, { loading: true });
    setState("error", null);
    clearEditing();
  });
  try {
    const entries = await readDirectory(path);
    if (loadSeq.get(tabId) !== seq) return false;
    return updateTab(tabId, {
      currentPath: path,
      entries,
      selectedPath,
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

// Shared by commitRename/commitCreate: runs the IPC call, reloads `path`
// selecting the new entry, and always ends the edit session (on error too,
// per spec: the edit ends and the banner shows).
async function commitEdit(
  tabId: number,
  path: string,
  action: () => Promise<string>,
): Promise<void> {
  try {
    const newPath = await action();
    await load(tabId, path, newPath);
  } catch (e) {
    setState("error", String(e));
  } finally {
    clearEditing();
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

  startRename(path: string): void {
    setState("editing", { mode: "rename", path });
  },

  startCreate(isDir: boolean): void {
    setState("editing", { mode: "create", isDir });
  },

  cancelEdit(): void {
    clearEditing();
  },

  commitRename(newName: string): Promise<void> {
    const editing = state.editing;
    if (editing?.mode !== "rename") return Promise.resolve();
    const tabId = state.activeTabId;
    const tab = findTab(tabId);
    if (!tab) return Promise.resolve();
    return commitEdit(tabId, tab.currentPath, () =>
      renameEntry(editing.path, newName),
    );
  },

  commitCreate(name: string): Promise<void> {
    const editing = state.editing;
    if (editing?.mode !== "create") return Promise.resolve();
    const tabId = state.activeTabId;
    const tab = findTab(tabId);
    if (!tab) return Promise.resolve();
    const parent = tab.currentPath;
    return commitEdit(tabId, parent, () =>
      createEntry(parent, name, editing.isDir),
    );
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
      clearEditing();
    });
  },

  activateTab(id: number): void {
    if (tabIndex(id) === -1) return;
    batch(() => {
      setState("activeTabId", id);
      clearEditing();
    });
  },
};
