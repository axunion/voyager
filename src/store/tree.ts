import { homeDir } from "@tauri-apps/api/path";
import { createStore } from "solid-js/store";
import { type Entry, readDirectory } from "../lib/ipc";
import { explorer } from "./explorer";
import { settings } from "./settings";

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

// Per-path monotonic sequence token (same pattern as explorer.ts's loadSeq):
// only the most recent expand() for a given path may commit, so a refresh
// that starts while an earlier fetch for the same path is still in flight
// supersedes it instead of being dropped.
const expandSeq = new Map<string, number>();

// Always re-fetches on expand (no stale-cache handling) — this is the only
// refresh mechanism for the tree.
async function expand(path: string): Promise<void> {
  const seq = (expandSeq.get(path) ?? 0) + 1;
  expandSeq.set(path, seq);
  setState("loading", path, true);
  try {
    const entries = await readDirectory(path, settings.showHidden());
    if (expandSeq.get(path) !== seq) return;
    setState(
      "children",
      path,
      entries.filter((e) => e.is_dir),
    );
    setState("expanded", path, true);
  } catch (e) {
    if (expandSeq.get(path) !== seq) return;
    explorer.setError(String(e));
  } finally {
    if (expandSeq.get(path) === seq) setState("loading", path, false);
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

  // Re-fetches children of every expanded directory (same always-refetch
  // strategy as toggle/expand).
  async refreshExpanded(): Promise<void> {
    const paths = Object.keys(state.expanded).filter((p) => state.expanded[p]);
    await Promise.all(paths.map((p) => expand(p)));
  },
};
