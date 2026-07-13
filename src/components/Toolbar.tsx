import ArrowLeft from "lucide-solid/icons/arrow-left";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Eye from "lucide-solid/icons/eye";
import EyeOff from "lucide-solid/icons/eye-off";
import { PathBar } from "./PathBar";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  currentPath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack(): void;
  onForward(): void;
  onNavigate(path: string): void;
  filterQuery: string;
  onFilterChange(query: string): void;
  showHidden: boolean;
  onToggleHidden(): void;
}

export function Toolbar(props: ToolbarProps) {
  const handleFilterKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onFilterChange("");
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  return (
    <header class={styles.toolbar}>
      <button
        type="button"
        class={styles.navButton}
        disabled={!props.canGoBack}
        onClick={() => props.onBack()}
        aria-label="Back"
      >
        <ArrowLeft size={16} />
      </button>
      <button
        type="button"
        class={styles.navButton}
        disabled={!props.canGoForward}
        onClick={() => props.onForward()}
        aria-label="Forward"
      >
        <ArrowRight size={16} />
      </button>
      <button
        type="button"
        class={styles.navButton}
        onClick={() => props.onToggleHidden()}
        aria-label={
          props.showHidden ? "Hide hidden files" : "Show hidden files"
        }
        aria-pressed={props.showHidden}
      >
        {props.showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
      </button>
      <PathBar currentPath={props.currentPath} onNavigate={props.onNavigate} />
      <input
        type="text"
        class={styles.filterInput}
        placeholder="Filter"
        value={props.filterQuery}
        onInput={(e) => props.onFilterChange(e.currentTarget.value)}
        onKeyDown={handleFilterKeyDown}
      />
    </header>
  );
}
