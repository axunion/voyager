import { openPath } from "@tauri-apps/plugin-opener";
import X from "lucide-solid/icons/x";
import { onCleanup, onMount, Show } from "solid-js";
import { FileList } from "./components/FileList";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import type { Entry } from "./lib/ipc";
import { explorer } from "./store/explorer";
import { tree } from "./store/tree";
import "./App.css";

function App() {
  onMount(() => {
    explorer.init();
    tree.init();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === "t") {
          e.preventDefault();
          explorer.addTab();
        } else if (key === "w") {
          e.preventDefault();
          explorer.closeTab(explorer.state.activeTabId);
        }
      } else if (e.altKey) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          explorer.goBack();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          explorer.goForward();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const handleOpen = (entry: Entry) => {
    if (entry.is_dir) {
      explorer.navigateTo(entry.path);
    } else {
      openPath(entry.path).catch((e) => explorer.setError(String(e)));
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
        />
        <div
          class="content"
          classList={{ dimmed: explorer.activeTab().loading }}
        >
          <Show
            when={
              explorer.activeTab().entries.length === 0 ||
              explorer.visibleEntries().length > 0
            }
            fallback={<div class="no-matches">No matching items</div>}
          >
            <FileList
              entries={explorer.visibleEntries()}
              selectedPath={explorer.activeTab().selectedPath}
              editing={explorer.state.editing}
              onOpen={handleOpen}
              onSelect={(entry) => explorer.select(entry.path)}
              onDropMove={(src, targetDir) =>
                explorer.moveIntoFolder(src, targetDir)
              }
              onTrash={(entry) => explorer.trashEntry(entry.path)}
              onRename={(entry) => explorer.startRename(entry.path)}
              onNewFolder={() => explorer.startCreate(true)}
              onNewFile={() => explorer.startCreate(false)}
              onCommitRename={(name) => explorer.commitRename(name)}
              onCommitCreate={(name) => explorer.commitCreate(name)}
              onCancelEdit={() => explorer.cancelEdit()}
            />
          </Show>
        </div>
      </div>
    </main>
  );
}

export default App;
