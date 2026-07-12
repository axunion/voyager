# 14 — Hidden files(隠しファイル表示トグル)

## 1. Goal

dotfile の表示/非表示をアプリ全体で切り替えられるようにする(ツールバーのボタン + `Cmd/Ctrl+Shift+.`)。状態はセッション内のメモリのみで保持し、ディスクには一切残さない。

## 2. Non-goals

- トグル状態の永続化(プロジェクト方針: 起動時は常に非表示から始まる)
- Windows の属性ベース隠しファイル対応(現行どおり dotfile 規約のみ)
- タブごとの独立したトグル(共有ツリーも従う必要があるためアプリ全体で 1 つ)
- 隠しファイルの見た目の差別化(減光表示など。表示されるか否かのみ)
- リロード時のフィルタ・選択の保持(トグルは既存 `load()` を使うため両者はリセットされる。保持は spec 17 の `refresh()` の領分であり本 spec では扱わない)

## 3. Prerequisites

- 依存する spec: 12(完了済みであること — `read_directory` の変更を 12 の後に固定し、同一関数の競合編集を避けるため)
- 前提とする既存ファイル:
  - `src-tauri/src/commands.rs` — `read_directory` が dotfile を無条件スキップ。`validate_name` が先頭ドット名を拒否(理由コメント: 作った直後に UI から消えるため)
  - `src/lib/ipc.ts` — `readDirectory` ラッパー
  - `src/store/explorer.ts` — `load()` が `readDirectory` を呼ぶ唯一の場所(タブ側)
  - `src/store/tree.ts` — ツリーも `readDirectory` を消費(展開時に毎回再取得する設計)
  - `src/components/Toolbar.tsx` — ボタン追加先(dumb component、props のみ)
  - `src/App.tsx` — グローバルショートカットと配線の集約先

## 4. UI/UX behavior

- ツールバー右側(フィルタ入力の隣)に eye / eye-off トグルボタン(lucide `eye` / `eye-off`、`aria-label="Show hidden files"` / `"Hide hidden files"`、`aria-pressed` 付き)
- `Cmd+Shift+.`(Linux は `Ctrl+Shift+.`)でも同じトグル(Finder と同じ割当。`App.tsx` のグローバル keydown に追加。テキスト入力フォーカス中でも発火してよい — 文字入力と競合しないため)
- Given: 非表示(既定)/ When: トグル ON / Then: **全タブ**と**ツリー**に dotfile が現れる
- When: トグル OFF / Then: 全タブ・ツリーから dotfile が消える
- トグル時は全タブを並行リロードする(既存 `load()` を使用。`loadSeq` ガードにより並行実行は安全)。ツリーは展開済みディレクトリを再取得する
- 表示 ON のあいだは dotfile 名での作成・リネームが可能になる(下記 validate 変更)。OFF のときは従来どおりフロントでエラーにする

## 5. State & data model

新規 `src/store/settings.ts`(セッション限りのアプリ全体設定。永続化 API を一切持たないこと):

```ts
import { createSignal } from "solid-js";

// Session-only app-wide settings. Never persisted anywhere by design.
const [showHidden, setShowHidden] = createSignal(false);

export const settings = {
  showHidden,
  toggleShowHidden(): boolean {
    setShowHidden((v) => !v);
    return showHidden();
  },
};
```

`src/store/explorer.ts` に facade メソッドを追加:

```ts
// Reloads every tab's currentPath concurrently (existing load(); loadSeq
// guards make overlapping loads safe). Used by the hidden-files toggle.
reloadAllTabs(): Promise<void>;
```

`src/store/tree.ts` に追加:

```ts
// Re-fetches children of every expanded directory (same always-refetch
// strategy as toggle/expand).
refreshExpanded(): Promise<void>;
```

トグルの配線は `App.tsx`(dumb component 規約維持):`settings.toggleShowHidden()` → `explorer.reloadAllTabs()` + `tree.refreshExpanded()`。`explorer.load()` と `tree` は `readDirectory(path, settings.showHidden())` を呼ぶ。

新規純関数(フロント側の作成/リネーム名ガード。Rust から移す分):

```ts
// src/lib/validateVisibleName.ts
// Returns an error message when creating/renaming to `name` would make the
// entry invisible under the current hidden-files setting, null otherwise.
// Only the leading-dot rule lives here; everything else stays in Rust.
export function hiddenNameError(name: string, showHidden: boolean): string | null;
// showHidden=true → always null. showHidden=false and name starts with "." →
// '"{name}" would be hidden' (same message as the current Rust error).
```

`commitRename` / `commitCreate`(facade)は IPC 前にこのガードを通し、エラーならバナー表示して FS には触れない。

## 6. Backend commands

`src-tauri/src/commands.rs` を変更(新コマンドなし):

```rust
#[tauri::command]
pub fn read_directory(path: String, include_hidden: bool) -> Result<Vec<Entry>, String>
// include_hidden=false: skip dotfiles (current behavior).
// include_hidden=true: include them; sorting is unchanged.
```

`validate_name` の変更 — 先頭ドット拒否を撤去する(コマンドはステートレスであり、トグル状態を知るべきでないため。ガードはフロントの `hiddenNameError` に移動):

```rust
fn validate_name(name: &str) -> Result<(), String>
// Rejects (unchanged): empty / path separators / "." / "..".
// No longer rejects other leading-dot names.
```

`src/lib/ipc.ts`:

```ts
export const readDirectory = (path: string, includeHidden: boolean) =>
  invoke<Entry[]>("read_directory", { path, includeHidden });
```

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src-tauri/src/commands.rs` | 変更 | `read_directory` に `include_hidden` 追加、`validate_name` の先頭ドット拒否撤去。テスト追随 + 追加 |
| `src/lib/ipc.ts` | 変更 | `readDirectory` の引数追加 |
| `src/store/settings.ts` | 新規 | `showHidden` シグナル(セッション限り) |
| `src/lib/validateVisibleName.ts` / `validateVisibleName.test.ts` | 新規 | `hiddenNameError` 純関数 + テスト |
| `src/store/explorer.ts` | 変更 | `load()` が `settings.showHidden()` を渡す。`reloadAllTabs` 追加。`commitRename` / `commitCreate` に `hiddenNameError` ガード |
| `src/store/tree.ts` | 変更 | `readDirectory` 呼び出しに引数追加。`refreshExpanded` 追加 |
| `src/components/Toolbar.tsx` / `Toolbar.module.css` | 変更 | eye トグルボタン(`showHidden` / `onToggleHidden` props) |
| `src/App.tsx` | 変更 | ボタン配線、`Cmd/Ctrl+Shift+.` ハンドラ、トグル時の全タブ + ツリー再読込 |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 表示 ON で `.config` を選択中に OFF へトグル | リロードで選択は消える(`load()` の既定動作。許容) |
| 表示 ON で dotfile ディレクトリに入り、その中で OFF へトグル | 現在パスは維持され、リスト内の dotfile だけが消える(親が hidden でもパス自体は有効) |
| 表示 OFF で `.foo` にリネーム/作成 | フロントの `hiddenNameError` でエラーバナー。FS 無変化 |
| 表示 ON で `.foo` を作成 | 成功し、リストに現れて選択される |
| `.` / `..` という名前 | 表示設定によらず Rust が拒否(不変) |
| トグル連打 | `loadSeq` により最後のトグル結果だけが反映される(クラッシュ・混線なし) |
| フィルタ適用中にトグル | `load()` がフィルタをリセットする(既知の仕様。Non-goals 参照) |

## 9. Acceptance criteria

- [ ] ツールバーのボタンと `Cmd/Ctrl+Shift+.` の両方で表示が切り替わる
- [ ] トグルが全タブとツリーに同時に反映される
- [ ] 表示 ON のとき dotfile の作成・リネームができ、OFF のときは従来どおりエラーになる
- [ ] アプリを再起動すると必ず非表示(既定)に戻る(ディスク上に痕跡がない)
- [ ] `pnpm check` / `pnpm test` / `cargo fmt --check` / `cargo clippy` / `cargo test` が通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

- `validateVisibleName.test.ts`: showHidden=true → 常に null / showHidden=false で `.foo` → エラーメッセージに名前を含む / 通常名 → null / 空文字 → null(空チェックは Rust の責務であってここでは扱わない)

### Rust

- `read_directory_includes_dotfiles_when_asked`: `include_hidden=true` で dotfile が含まれる
- 既存 `read_directory_skips_dotfiles` を `include_hidden=false` 引数に追随
- `create_entry_leading_dot_succeeds`: `.hidden` の作成が成功する(旧 `create_entry_leading_dot_errors` を置換)
- `create_entry_dotdot_errors` は不変で通ること

### 手動検証手順

1. 起動直後 → dotfile が見えない(既定 OFF)
2. ツールバーの eye ボタン → ホームの `.config` などが全タブ・ツリーに現れる
3. `Cmd+Shift+.` → 消える。もう一度 → 現れる
4. 表示 ON で New File → `.test-hidden` → 作成され選択される。OFF に切替 → 消える。ON に戻す → いる(後片付けに削除)
5. 表示 OFF で New File → `.foo` → エラーバナー、FS 無変化(`ls -a` で確認)
6. アプリ再起動 → OFF に戻っている

## 11. Future work

- トグル時のフィルタ・選択の保持(spec 17 の `refresh()` 導入後に載せ替え可能)
- 隠しファイルの減光表示
- Windows 属性ベースの隠しファイル対応
