import * as DropdownMenu from "@kobalte/core/dropdown-menu";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import ArrowRight from "lucide-solid/icons/arrow-right";
import Check from "lucide-solid/icons/check";
import Eye from "lucide-solid/icons/eye";
import Save from "lucide-solid/icons/save";
import Settings from "lucide-solid/icons/settings";
import itemStyles from "./FileItem.module.css";
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
  onFilterInputRef(el: HTMLInputElement): void;
  showHidden: boolean;
  onToggleHidden(): void;
  persistEnabled: boolean;
  onSetPersist(enabled: boolean): void;
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
      <DropdownMenu.Root>
        <DropdownMenu.Trigger class={styles.navButton} aria-label="Settings">
          <Settings size={16} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class={itemStyles.menu}>
            <DropdownMenu.CheckboxItem
              class={`${itemStyles.menuItem} ${styles.menuCheckItem}`}
              checked={props.showHidden}
              onChange={() => props.onToggleHidden()}
            >
              <span class={styles.menuIndicator}>
                <Check size={14} />
              </span>
              <Eye size={14} />
              Show hidden files
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.CheckboxItem
              class={`${itemStyles.menuItem} ${styles.menuCheckItem}`}
              checked={props.persistEnabled}
              onChange={(checked) => props.onSetPersist(checked)}
            >
              <span class={styles.menuIndicator}>
                <Check size={14} />
              </span>
              <Save size={14} />
              Remember settings
            </DropdownMenu.CheckboxItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <PathBar currentPath={props.currentPath} onNavigate={props.onNavigate} />
      <input
        ref={props.onFilterInputRef}
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
