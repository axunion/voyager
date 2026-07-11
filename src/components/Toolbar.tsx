import ArrowLeft from "lucide-solid/icons/arrow-left";
import ArrowRight from "lucide-solid/icons/arrow-right";
import { PathBar } from "./PathBar";
import styles from "./Toolbar.module.css";

interface ToolbarProps {
  currentPath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack(): void;
  onForward(): void;
  onNavigate(path: string): void;
}

export function Toolbar(props: ToolbarProps) {
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
      <PathBar currentPath={props.currentPath} onNavigate={props.onNavigate} />
    </header>
  );
}
