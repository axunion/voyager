import { homeDir } from "@tauri-apps/api/path";
import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import { matchesQuery } from "../lib/filterEntries";
import {
  copyEntry,
  createEntry,
  type Entry,
  moveEntry,
  moveToTrash,
  readDirectory,
  renameEntry,
} from "../lib/ipc";
import { pruneSelection, type Selection } from "../lib/selection";
import { nextSort, type SortDir, type SortKey } from "../lib/sortEntries";
import { hiddenNameError } from "../lib/validateVisibleName";
import { clipboard } from "./clipboard";
import {
  emptyHistory,
  type History,
  pushPath,
  stepBack,
  stepForward,
} from "./history";
import { settings } from "./settings";
import { nextActiveTabId } from "./tabs";

interface TabState {
  id: number;
  currentPath: string;
  entries: Entry[];
  history: History;
  selectedPaths: string[]; // kept in visible-list order
  selectionAnchor: string | null; // range-select origin
  selectionCursor: string | null; // keyboard focus row → aria-activedescendant
  loading: boolean;
  filterQuery: string; // reset to "" by load()
  sortKey: SortKey; // NOT reset by load(); inherited by addTab()
  sortDir: SortDir;
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

function makeTab(
  path: string,
  sortKey: SortKey = "name",
  sortDir: SortDir = "asc",
): TabState {
  return {
    id: nextTabId++,
    currentPath: path,
    entries: [],
    history: emptyHistory,
    selectedPaths: [],
    selectionAnchor: null,
    selectionCursor: null,
    loading: false,
    filterQuery: "",
    sortKey,
    sortDir,
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

// Shared by load()/refreshTab(): bumps `tabId`'s loadSeq token, runs
// `beforeFetch` (if given) inside the same batch as the loading/error reset,
// fetches `path`'s entries, and commits `patchFor(entries)` if this call is
// still the most recent load for the tab. On failure, keeps the previous
// listing and shows the banner. Returns whether the commit happened.
async function withLoadGuard(
  tabId: number,
  path: string,
  patchFor: (entries: Entry[]) => Partial<TabState>,
  beforeFetch?: () => void,
): Promise<boolean> {
  const seq = (loadSeq.get(tabId) ?? 0) + 1;
  loadSeq.set(tabId, seq);
  if (tabIndex(tabId) === -1) return false;
  batch(() => {
    updateTab(tabId, { loading: true });
    setState("error", null);
    beforeFetch?.();
  });
  try {
    const entries = await readDirectory(path, settings.showHidden());
    if (loadSeq.get(tabId) !== seq) return false;
    return updateTab(tabId, { ...patchFor(entries), loading: false });
  } catch (e) {
    if (loadSeq.get(tabId) !== seq) return false;
    batch(() => {
      updateTab(tabId, { loading: false });
      setState("error", String(e));
    });
    return false;
  }
}

// On failure keeps the previous listing and path so the user stays where they were.
// `selectedPath` defaults to null (fresh listing, nothing selected); callers
// that just created/renamed an entry pass its new path to select it in one commit.
function load(
  tabId: number,
  path: string,
  selectedPath: string | null = null,
): Promise<boolean> {
  return withLoadGuard(
    tabId,
    path,
    (entries) => ({
      currentPath: path,
      entries,
      selectedPaths: selectedPath ? [selectedPath] : [],
      selectionAnchor: selectedPath,
      selectionCursor: selectedPath,
      filterQuery: "",
    }),
    clearEditing,
  );
}

// Reloads `tabId`'s currentPath without the load() resets: filterQuery,
// sortKey, sortDir are kept, and selection is intersected with the fresh
// entries. Shares `loadSeq` with load() so only the most recent of either
// wins. On failure, keeps everything and shows the banner (same as load()).
function refreshTab(tabId: number): Promise<boolean> {
  const tab = findTab(tabId);
  if (!tab) return Promise.resolve(false);
  return withLoadGuard(tabId, tab.currentPath, (entries) => {
    const pruned = pruneSelection(
      {
        paths: tab.selectedPaths,
        anchor: tab.selectionAnchor,
        cursor: tab.selectionCursor,
      },
      entries,
    );
    return {
      entries,
      selectedPaths: pruned.paths,
      selectionAnchor: pruned.anchor,
      selectionCursor: pruned.cursor,
    };
  });
}

async function navigateHistory(
  tabId: number,
  step: { history: History; path: string } | null,
): Promise<void> {
  if (step && (await load(tabId, step.path))) {
    updateTab(tabId, { history: step.history });
  }
}

// Runs `action` for each item in sequence, stopping at the first failure but
// still reloading once afterward so already-applied changes are visible; a
// failure surfaces as the error banner after that reload (load() itself
// clears the error, so this must be set last). Resolves to whether every
// item succeeded, so callers can act on full-success without re-reading state.
async function sequentialReload(
  tabId: number,
  items: string[],
  action: (item: string) => Promise<unknown>,
): Promise<boolean> {
  let error: string | null = null;
  for (const item of items) {
    try {
      await action(item);
    } catch (e) {
      error = String(e);
      break;
    }
  }
  const tab = findTab(tabId);
  if (tab) await load(tabId, tab.currentPath);
  if (error) setState("error", error);
  return error === null;
}

// Shared by commitRename/commitCreate: guards against creating/renaming to a
// name that would be hidden under the current setting (no IPC call in that
// case), then runs the IPC call, reloads `path` selecting the new entry, and
// always ends the edit session (on error too, per spec: the edit ends and
// the banner shows).
async function commitEdit(
  tabId: number,
  path: string,
  name: string,
  action: () => Promise<string>,
): Promise<void> {
  const error = hiddenNameError(name, settings.showHidden());
  if (error) {
    batch(() => {
      setState("error", error);
      clearEditing();
    });
    return;
  }
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
  tab: findTab,

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

  // Reloads every tab's currentPath concurrently (existing load(); loadSeq
  // guards make overlapping loads safe). Used by the hidden-files toggle.
  async reloadAllTabs(): Promise<void> {
    await Promise.all(state.tabs.map((t) => load(t.id, t.currentPath)));
  },

  // Manual refresh (Mod+R): reloads the active tab without pushing history
  // and without load()'s filter/selection reset — see refreshTab above.
  async refresh(): Promise<void> {
    await refreshTab(state.activeTabId);
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
    updateTab(state.activeTabId, {
      selectedPaths: [path],
      selectionAnchor: path,
      selectionCursor: path,
    });
  },

  setSelection(sel: Selection): void {
    updateTab(state.activeTabId, {
      selectedPaths: sel.paths,
      selectionAnchor: sel.anchor,
      selectionCursor: sel.cursor,
    });
  },

  setSort(key: SortKey): void {
    const tab = activeTab();
    const { key: sortKey, dir: sortDir } = nextSort(
      { key: tab.sortKey, dir: tab.sortDir },
      key,
    );
    updateTab(tab.id, { sortKey, sortDir });
  },

  setFilter(query: string): void {
    const tab = activeTab();
    const visible = tab.entries.filter((e) => matchesQuery(e, query));
    const pruned = pruneSelection(
      {
        paths: tab.selectedPaths,
        anchor: tab.selectionAnchor,
        cursor: tab.selectionCursor,
      },
      visible,
    );
    updateTab(tab.id, {
      filterQuery: query,
      selectedPaths: pruned.paths,
      selectionAnchor: pruned.anchor,
      selectionCursor: pruned.cursor,
    });
  },

  // Sequential, stop on first error, reload once. Filters out sources whose
  // path equals targetDir (a folder can't be moved into itself).
  async moveIntoFolder(sources: string[], targetDir: string): Promise<void> {
    const filtered = sources.filter((s) => s !== targetDir);
    await sequentialReload(state.activeTabId, filtered, (source) =>
      moveEntry(source, targetDir),
    );
  },

  // Sequential, stop on first error, reload once.
  async trashEntries(paths: string[]): Promise<void> {
    await sequentialReload(state.activeTabId, paths, (path) =>
      moveToTrash(path),
    );
  },

  copySelection(): void {
    clipboard.set(activeTab().selectedPaths, "copy");
  },

  cutSelection(): void {
    clipboard.set(activeTab().selectedPaths, "cut");
  },

  // Sequential copy_entry/move_entry into the active tab's currentPath, stop
  // on first error, reload once. Clears the clipboard only after a fully
  // successful cut-paste (copy stays repeatable; a failed cut stays retryable).
  async paste(): Promise<void> {
    const current = clipboard.content();
    if (!current) return;
    const { paths, mode } = current;
    const targetDir = activeTab().currentPath;
    const ipcCall = mode === "copy" ? copyEntry : moveEntry;
    const succeeded = await sequentialReload(state.activeTabId, paths, (path) =>
      ipcCall(path, targetDir),
    );
    if (mode === "cut" && succeeded) clipboard.clear();
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
    return commitEdit(tabId, tab.currentPath, newName, () =>
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
    return commitEdit(tabId, parent, name, () =>
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

  addTab(path?: string): void {
    const current = activeTab();
    const tab = makeTab(
      path ?? current.currentPath,
      current.sortKey,
      current.sortDir,
    );
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
