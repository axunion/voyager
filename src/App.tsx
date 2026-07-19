import { openPath } from "@tauri-apps/plugin-opener";
import X from "lucide-solid/icons/x";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  untrack,
} from "solid-js";
import { FileList } from "./components/FileList";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import { isDragActive } from "./lib/dnd";
import { filterEntries } from "./lib/filterEntries";
import type { Entry } from "./lib/ipc";
import { parentPath } from "./lib/pathSegments";
import { matchGlobalShortcut, type ShortcutInput } from "./lib/shortcuts";
import { sortEntries } from "./lib/sortEntries";
import { clipboard } from "./store/clipboard";
import { explorer } from "./store/explorer";
import { settings } from "./store/settings";
import { renderedTabIds } from "./store/tabs";
import { tree } from "./store/tree";
import "./App.css";

function App() {
  // The tab a drag started from, kept mounted (hidden) if the user switches
  // away mid-drag, so the dragged row's DOM survives the switch — see
  // spec/11-tab-hover-switch.md.
  const [dragOriginTabId, setDragOriginTabId] = createSignal<number | null>(
    null,
  );
  createEffect(() => {
    if (isDragActive()) {
      setDragOriginTabId(
        (prev) => prev ?? untrack(() => explorer.state.activeTabId),
      );
    } else {
      setDragOriginTabId(null);
    }
  });

  let filterInputRef: HTMLInputElement | undefined;

  const cycleTab = (delta: 1 | -1) => {
    const tabs = explorer.state.tabs;
    const currentIndex = tabs.findIndex(
      (t) => t.id === explorer.state.activeTabId,
    );
    const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
    explorer.activateTab(tabs[nextIndex].id);
  };

  onMount(() => {
    // Apply persisted settings (if a sidecar file exists) before the first
    // directory load so showHidden is right from the initial listing.
    // settings.init() never rejects, so no .catch is needed.
    settings.init().then(() => {
      explorer.init();
      tree.init();
    });

    const toShortcutInput = (e: KeyboardEvent): ShortcutInput => {
      const target = e.target as HTMLElement | null;
      return {
        // e.code is used for the period key since Shift+Period reports e.key
        // as ">" on a US layout, which would otherwise miss Mod+Shift+..
        key: e.code === "Period" ? "." : e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        targetIsTextInput:
          target?.tagName === "INPUT" || target?.tagName === "TEXTAREA",
      };
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Every binding requires a modifier, so skip building a ShortcutInput
      // (and its DOM tagName read) for the vast majority of keystrokes, e.g.
      // plain typing in the filter box or a rename input.
      if (!e.metaKey && !e.ctrlKey && !e.altKey) return;
      const action = matchGlobalShortcut(toShortcutInput(e));
      if (!action) return;
      e.preventDefault();
      switch (action.type) {
        case "new-tab":
          explorer.addTab();
          break;
        case "close-tab":
          explorer.closeTab(explorer.state.activeTabId);
          break;
        case "back":
          explorer.goBack();
          break;
        case "forward":
          explorer.goForward();
          break;
        case "toggle-hidden":
          toggleHidden();
          break;
        case "activate-tab": {
          const tabs = explorer.state.tabs;
          const target =
            action.index === -1 ? tabs[tabs.length - 1] : tabs[action.index];
          if (target) explorer.activateTab(target.id);
          break;
        }
        case "next-tab":
          cycleTab(1);
          break;
        case "prev-tab":
          cycleTab(-1);
          break;
        case "refresh":
          explorer.refresh();
          break;
        case "new-folder":
          explorer.startCreate(true);
          break;
        case "parent-dir": {
          const parent = parentPath(explorer.activeTab().currentPath);
          if (parent) explorer.navigateTo(parent);
          break;
        }
        case "focus-filter":
          filterInputRef?.focus();
          break;
        case "save-settings":
          handleSetPersist(true);
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const cutPaths = () => {
    const current = clipboard.content();
    return current?.mode === "cut" ? current.paths : [];
  };

  const toggleHidden = () => {
    settings.toggleShowHidden();
    explorer.reloadAllTabs();
    tree.refreshExpanded();
  };

  const handleSetPersist = (enabled: boolean) => {
    settings.setPersist(enabled).catch((e) => explorer.setError(String(e)));
  };

  const handleOpen = (entries: Entry[]) => {
    if (entries.length === 1 && entries[0].is_dir) {
      explorer.navigateTo(entries[0].path);
      return;
    }
    for (const entry of entries) {
      if (entry.is_dir) {
        explorer.addTab(entry.path);
      } else {
        openPath(entry.path).catch((e) => explorer.setError(String(e)));
      }
    }
  };

  return (
    <main class="app">
      <TabBar
        tabs={explorer.state.tabs}
        activeTabId={explorer.state.activeTabId}
        onActivate={(id) => explorer.activateTab(id)}
        onClose={(id) => explorer.closeTab(id)}
        onAdd={() => explorer.addTab()}
        onDropMove={(paths, targetDir) =>
          explorer.moveIntoFolder(paths, targetDir)
        }
      />
      <Toolbar
        currentPath={explorer.activeTab().currentPath}
        canGoBack={explorer.canGoBack()}
        canGoForward={explorer.canGoForward()}
        onBack={() => explorer.goBack()}
        onForward={() => explorer.goForward()}
        onNavigate={(p) => explorer.navigateTo(p)}
        filterQuery={explorer.activeTab().filterQuery}
        onFilterChange={(q) => explorer.setFilter(q)}
        onFilterInputRef={(el) => {
          filterInputRef = el;
        }}
        showHidden={settings.showHidden()}
        onToggleHidden={toggleHidden}
        persistEnabled={settings.persistEnabled()}
        onSetPersist={handleSetPersist}
      />
      <Show when={explorer.state.error}>
        <div class="error-banner" role="alert">
          <span>{explorer.state.error}</span>
          <button
            type="button"
            onClick={() => explorer.clearError()}
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      </Show>
      <div class="body">
        <Sidebar
          rootPath={tree.state.rootPath}
          expanded={tree.state.expanded}
          children={tree.state.children}
          loading={tree.state.loading}
          currentPath={explorer.activeTab().currentPath}
          onToggle={(path) => tree.toggle(path)}
          onNavigate={(path) => explorer.navigateTo(path)}
          onDropMove={(paths, targetDir) =>
            explorer.moveIntoFolder(paths, targetDir)
          }
        />
        <div
          class="content"
          classList={{ dimmed: explorer.activeTab().loading }}
        >
          <For
            each={renderedTabIds(explorer.state.activeTabId, dragOriginTabId())}
          >
            {(tabId) => {
              const visible = () => tabId === explorer.state.activeTabId;
              const tab = createMemo(
                () => explorer.tab(tabId) ?? explorer.activeTab(),
              );
              const sorted = createMemo(() =>
                sortEntries(tab().entries, tab().sortKey, tab().sortDir),
              );
              const entries = createMemo(() =>
                filterEntries(sorted(), tab().filterQuery),
              );
              return (
                <div class="file-pane" classList={{ hidden: !visible() }}>
                  <Show
                    when={tab().entries.length === 0 || entries().length > 0}
                    fallback={<div class="no-matches">No matching items</div>}
                  >
                    <FileList
                      entries={entries()}
                      currentPath={tab().currentPath}
                      selectedPaths={tab().selectedPaths}
                      anchor={tab().selectionAnchor}
                      cursor={tab().selectionCursor}
                      editing={visible() ? explorer.state.editing : null}
                      sortKey={tab().sortKey}
                      sortDir={tab().sortDir}
                      cutPaths={cutPaths()}
                      canPaste={clipboard.content() !== null}
                      onSort={(key) => explorer.setSort(key)}
                      onOpen={handleOpen}
                      onSelectionChange={(sel) => explorer.setSelection(sel)}
                      onDropMove={(paths, targetDir) =>
                        explorer.moveIntoFolder(paths, targetDir)
                      }
                      onTrash={(paths) => explorer.trashEntries(paths)}
                      onRename={(entry) => explorer.startRename(entry.path)}
                      onNewFolder={() => explorer.startCreate(true)}
                      onNewFile={() => explorer.startCreate(false)}
                      onCommitRename={(name) => explorer.commitRename(name)}
                      onCommitCreate={(name) => explorer.commitCreate(name)}
                      onCancelEdit={() => explorer.cancelEdit()}
                      onCopy={() => explorer.copySelection()}
                      onCut={() => explorer.cutSelection()}
                      onPaste={() => explorer.paste()}
                    />
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </main>
  );
}

export default App;
