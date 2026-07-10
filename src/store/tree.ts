import { homeDir } from "@tauri-apps/api/path";
import { createStore } from "solid-js/store";
import { type Entry, readDirectory } from "../lib/ipc";
import { explorer } from "./explorer";

interface TreeState {
  rootPath: string;
  expanded: Record<string, boolean>;
  children: Record<string, Entry[]>;
  loading: Record<string, boolean>;
}

const [state, setState] = createStore<TreeState>({
  rootPath: "",
  expanded: {},
  children: {},
  loading: {},
});

// Always re-fetches on expand (no stale-cache handling) — this is the only
// refresh mechanism for the tree. Guarded by `loading` so a click while a
// fetch is in flight doesn't trigger a duplicate fetch.
async function expand(path: string): Promise<void> {
  if (state.loading[path]) return;
  setState("loading", path, true);
  try {
    const entries = await readDirectory(path);
    setState(
      "children",
      path,
      entries.filter((e) => e.is_dir),
    );
    setState("expanded", path, true);
  } catch (e) {
    explorer.setError(String(e));
  } finally {
    setState("loading", path, false);
  }
}

export const tree = {
  state,

  async init(): Promise<void> {
    try {
      const home = await homeDir();
      setState("rootPath", home);
      await expand(home);
    } catch (e) {
      explorer.setError(String(e));
    }
  },

  async toggle(path: string): Promise<void> {
    if (state.expanded[path]) {
      setState("expanded", path, false);
      return;
    }
    await expand(path);
  },
};
