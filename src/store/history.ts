export interface History {
  back: string[];
  forward: string[];
}

export const emptyHistory: History = { back: [], forward: [] };

export function pushPath(h: History, currentPath: string): History {
  return { back: [...h.back, currentPath], forward: [] };
}

export function stepBack(
  h: History,
  currentPath: string,
): { history: History; path: string } | null {
  const path = h.back[h.back.length - 1];
  if (path === undefined) return null;
  return {
    history: {
      back: h.back.slice(0, -1),
      forward: [...h.forward, currentPath],
    },
    path,
  };
}

export function stepForward(
  h: History,
  currentPath: string,
): { history: History; path: string } | null {
  const path = h.forward[h.forward.length - 1];
  if (path === undefined) return null;
  return {
    history: {
      back: [...h.back, currentPath],
      forward: h.forward.slice(0, -1),
    },
    path,
  };
}
