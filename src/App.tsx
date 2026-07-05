import { openPath } from "@tauri-apps/plugin-opener";
import X from "lucide-solid/icons/x";
import { onMount, Show } from "solid-js";
import { FileList } from "./components/FileList";
import { Toolbar } from "./components/Toolbar";
import type { Entry } from "./lib/ipc";
import { explorer } from "./store/explorer";
import "./App.css";

function App() {
  onMount(() => {
    explorer.init();
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
      <Toolbar
        currentPath={explorer.state.currentPath}
        canGoBack={explorer.canGoBack()}
        canGoForward={explorer.canGoForward()}
        onBack={() => explorer.goBack()}
        onForward={() => explorer.goForward()}
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
      <div class="content" classList={{ dimmed: explorer.state.loading }}>
        <FileList
          entries={explorer.state.entries}
          selectedPath={explorer.state.selectedPath}
          onOpen={handleOpen}
          onSelect={(entry) => explorer.select(entry.path)}
          onDropMove={(src, targetDir) =>
            explorer.moveIntoFolder(src, targetDir)
          }
          onTrash={(entry) => explorer.trashEntry(entry.path)}
        />
      </div>
    </main>
  );
}

export default App;
