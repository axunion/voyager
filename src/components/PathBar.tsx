import { createEffect, createSignal, For, Show } from "solid-js";
import { splitPathSegments } from "../lib/pathSegments";
import styles from "./PathBar.module.css";

interface PathBarProps {
  currentPath: string;
  onNavigate(path: string): void;
}

export function PathBar(props: PathBarProps) {
  const [editing, setEditing] = createSignal(false);
  const [overflowing, setOverflowing] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;
  let segmentsRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (editing() && inputRef) {
      inputRef.focus();
      inputRef.select();
    }
  });

  createEffect(() => {
    props.currentPath;
    if (segmentsRef) {
      setOverflowing(segmentsRef.scrollWidth > segmentsRef.clientWidth);
    }
  });

  const startEditing = () => setEditing(true);

  const commit = (value: string) => {
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed) props.onNavigate(trimmed);
  };

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit((e.currentTarget as HTMLInputElement).value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  };

  const handleInputBlur = () => setEditing(false);

  return (
    <div class={styles.pathBar}>
      <Show
        when={editing()}
        fallback={
          <>
            <div
              ref={segmentsRef}
              class={styles.segments}
              classList={{ [styles.faded]: overflowing() }}
            >
              <For each={[...splitPathSegments(props.currentPath)].reverse()}>
                {(segment) => (
                  <>
                    <button
                      type="button"
                      class={styles.segment}
                      onClick={() => props.onNavigate(segment.path)}
                    >
                      {segment.name}
                    </button>
                    <Show when={segment.path !== "/"}>
                      <span class={styles.separator}>›</span>
                    </Show>
                  </>
                )}
              </For>
            </div>
            <button
              type="button"
              class={styles.filler}
              onClick={startEditing}
              aria-label="Edit path"
            />
          </>
        }
      >
        <input
          ref={inputRef}
          class={styles.input}
          value={props.currentPath}
          onKeyDown={handleInputKeyDown}
          onBlur={handleInputBlur}
        />
      </Show>
    </div>
  );
}
