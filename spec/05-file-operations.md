# 05 — File operations(Rename / New Folder / New File)

## 1. Goal

コンテキストメニューからのリネームと新規フォルダ/ファイル作成を追加する。リネームは行のインライン編集、新規作成はリスト末尾のファントム編集行で行う(ダイアログなし)。ファイルリストの空白部分に新規作成用のコンテキストメニューを追加する。

## 2. Non-goals

- コピー / ペースト / 複製(duplicate)
- F2 などのリネームショートカット(メニュー起点のみ)
- リネームでの上書き(衝突は常にエラー)
- テンプレートからの新規ファイル、拡張子の自動付与
- ダイアログ UI(インライン編集のみ)

## 3. Prerequisites

- 依存する spec: 01(クリック=選択が確定していること)、02(編集状態をアクティブタブ文脈で扱うため)
- 前提とする既存ファイル:
  - `src-tauri/src/commands.rs` — 既存コマンドとテストのスタイル。`src-tauri/src/lib.rs` の `generate_handler!` に登録
  - `src/lib/ipc.ts` — ラッパー追加先
  - `src/store/explorer.ts` — `mutateAndReload` パターン(操作 → アクティブタブをリロード)
  - `src/components/FileItem.tsx` — 行コンテキストメニュー(Kobalte)。現在 Open / Move to Trash
  - `src/components/FileList.tsx` — リストコンテナ(空白部メニューのホスト)

## 4. UI/UX behavior

### コンテキストメニュー構成

| 場所 | 項目 |
| --- | --- |
| 行の上で右クリック | Open / **Rename** / Move to Trash |
| リストの空白部分で右クリック | **New Folder** / **New File** |

- 行の `onContextMenu` は `e.stopPropagation()` を呼ぶこと(行メニューと空白部メニューが同時に開くのを防ぐ)。**これは手動テスト項目**

### Rename(インライン編集)

- When: 行メニューの Rename / Then: その行の名前 `<span>` が `<input>`(現在名でプリフィル、全選択、オートフォーカス)に置き換わる
- Enter: コミット。`rename_entry` を呼び、成功で一覧リロード + **新パスを選択状態にする**
- Esc: キャンセル(何も変えない)
- blur(他所クリック): コミット(Finder と同じ)
- 変更なしのままコミット: no-op(バックエンドが `Ok(path)` を返す)
- 失敗(衝突・不正名): エラーバナー表示。編集状態は終了し、元の名前のまま

### New Folder / New File(ファントム編集行)

- When: 空白部メニューの New Folder(または New File)/ Then: リスト末尾に空の `<input>` を持つ**ファントム行**(フォルダ/ファイルのアイコン付き)が現れ、フォーカスされる。**この時点では FS に何も作らない**
- Enter: `create_entry` を呼び、成功で一覧リロード + 新パスを選択
- Esc / 空文字のままコミット / blur で空文字: キャンセル(FS 変化なし — "untitled folder" のようなゴミを作らない)
- blur で非空文字: コミット
- 失敗: エラーバナー表示、ファントム行は消える(入力値は保持しない)

### 編集中の挙動

- 編集中はその行のダブルクリック/ドラッグを無効化する(input 内のテキスト操作を優先)
- 編集状態はグローバルに 1 つ(アクティブタブのみ編集可能)。ナビゲート(`load()`)・タブ切り替え(`activateTab`)で編集状態は破棄される

## 5. State & data model

`src/store/explorer.ts` の `ExplorerState` にグローバルフィールドを追加:

```ts
type EditingState =
  | { mode: "rename"; path: string }
  | { mode: "create"; isDir: boolean }
  | null;

interface ExplorerState {
  tabs: TabState[];
  activeTabId: number;
  error: string | null;
  editing: EditingState; // global: only the active tab can edit
}
```

facade に追加するメソッド:

```ts
startRename(path: string): void;        // set editing
startCreate(isDir: boolean): void;      // set editing
cancelEdit(): void;                     // editing = null
commitRename(newName: string): Promise<void>;  // rename_entry → reload → select new path → editing = null
commitCreate(name: string): Promise<void>;     // create_entry(activeTab().currentPath, name, editing.isDir) → reload → select → editing = null
```

- `load()` と `activateTab()` は `editing` を null にリセットする
- commit 系は `mutateAndReload` に相乗りせず、戻り値の新パスで `select` するところまで面倒を見る(リロード後に選択を復元する唯一の操作のため)

## 6. Backend commands

`src-tauri/src/commands.rs` に追加し、`lib.rs` の `generate_handler!` に登録する:

```rust
/// Renames the entry at `path` to `new_name` within the same parent directory.
/// Returns the new path. Renaming to the same name is a no-op returning Ok(path).
#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String>
// Guards, in order:
// 1. validate_name(&new_name)?
// 2. parent = Path::new(&path).parent() — error "Invalid path: {path}" if none
// 3. if new_name == current file name → return Ok(path) (no-op)
// 4. dest = parent.join(&new_name); if dest.exists() → Err("\"{new_name}\" already exists")
// 5. fs::rename(path, dest) → Err("Failed to rename: {e}")

/// Creates a new directory (is_dir=true) or empty file (is_dir=false) named
/// `name` inside `parent`. Returns the new path.
#[tauri::command]
pub fn create_entry(parent: String, name: String, is_dir: bool) -> Result<String, String>
// Guards, in order:
// 1. validate_name(&name)?
// 2. dest = Path::new(&parent).join(&name)
// 3. dir:  fs::create_dir(&dest) — fails if exists (map to "\"{name}\" already exists" on AlreadyExists)
//    file: OpenOptions::new().write(true).create_new(true).open(&dest) — create_new is TOCTOU-safe
// 4. other io errors → Err("Failed to create: {e}")

/// Shared validation for user-supplied entry names.
fn validate_name(name: &str) -> Result<(), String>
// Rejects (with English messages):
// - empty string → "Name cannot be empty"
// - contains '/' or '\\' → "Name cannot contain path separators"
// - "." or ".." → "Invalid name"
// - starts with '.' → "Names starting with \".\" would be hidden"
//   (read_directory skips dotfiles, so a created dotfile would silently
//    disappear from the UI — reject instead of confusing the user)
```

`src/lib/ipc.ts` に追加:

```ts
export const renameEntry = (path: string, newName: string) =>
  invoke<string>("rename_entry", { path, newName });

export const createEntry = (parent: string, name: string, isDir: boolean) =>
  invoke<string>("create_entry", { parent, name, isDir });
```

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src-tauri/src/commands.rs` | 変更 | `rename_entry` / `create_entry` / `validate_name` + テスト追加 |
| `src-tauri/src/lib.rs` | 変更 | `generate_handler!` に 2 コマンド追加 |
| `src/lib/ipc.ts` | 変更 | `renameEntry` / `createEntry` ラッパー追加 |
| `src/store/explorer.ts` | 変更 | `editing` フィールド + `startRename / startCreate / cancelEdit / commitRename / commitCreate` |
| `src/components/FileItem.tsx` | 変更 | メニューに Rename 追加。`editing` prop(boolean)が真のとき名前を `<input>` 化。編集用コールバック props(`onCommitRename(name)` / `onCancelEdit`)追加。`onContextMenu` に `stopPropagation` |
| `src/components/FileList.tsx` | 変更 | コンテナを Kobalte `ContextMenu` でラップ(New Folder / New File)。`editing` が create のときファントム編集行を末尾に描画。関連 props 追加 |
| `src/components/FileList.module.css` / `FileItem.module.css` | 変更 | インライン input のスタイル(行高 28px 維持、トークンのみ) |
| `src/App.tsx` | 変更 | 新 props の配線 |

注: dumb component 規約は維持する — `FileItem` / `FileList` はストアを知らず、`editing` 状態も props で受ける。

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 先頭が `.` の名前で作成/リネーム | エラー "Names starting with \".\" would be hidden"(作れてしまうと `read_directory` のスキップで即座に UI から消え、ユーザーを混乱させるため) |
| `/` や `\` を含む名前 | エラー(パス区切り拒否) |
| 空文字でリネームコミット | エラー "Name cannot be empty"(input 側でも空は弾いてよいが、バックエンド検証が正) |
| 既存名と衝突 | エラー、元の状態を維持 |
| 同名のままリネームコミット | no-op、エラーなし |
| 大文字小文字だけ変える(macOS の大文字小文字非区別 FS) | `dest.exists()` が真になり衝突エラーになる場合がある — 既知の制限として許容(Future work) |
| 編集中にナビゲート / タブ切り替え | 編集破棄(FS 変化なし) |
| 編集中に Esc | 破棄 |
| ファントム行表示中にもう一度 New Folder | 既存のファントム行を破棄して新しい編集を開始(editing の上書き) |
| 空白部メニューが行の上でも開いてしまう | 行の `stopPropagation` で防止(手動テスト必須) |

## 9. Acceptance criteria

- [ ] 行メニューに Open / Rename / Move to Trash、空白部メニューに New Folder / New File が出る
- [ ] 行の上で右クリックしたとき空白部メニューは開かない
- [ ] Rename: インライン編集 → Enter で反映され、新しい名前の行が選択状態になる
- [ ] Rename: Esc で無変更キャンセル、blur でコミット
- [ ] New Folder / New File: Enter で作成・選択。Esc / 空文字では **FS に何も作られない**
- [ ] 衝突・不正名(空、`/` 入り、先頭 `.`)はエラーバナーが出て FS は無変化
- [ ] 編集中にナビゲートすると編集が破棄される
- [ ] `cargo test` に追加した全ケースが通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

なし(検証ロジックは Rust 側にのみ置き、フロントで重複実装しない。エラーは既存のバナー経由で表示される)。

### Rust

`commands.rs` のテストに追加(`tempfile` 使用、既存スタイル):

- `create_entry`: ファイル作成成功 / フォルダ作成成功 / 既存名で衝突エラー / 空名エラー / `/` 入りエラー / `..` エラー / 先頭ドットエラー
- `rename_entry`: 成功(旧パス消滅・新パス存在・戻り値一致)/ 衝突エラーで元ファイル維持 / 同名 no-op(`Ok` で同じパス)/ 不正名エラー
- `validate_name` はコマンド経由で検証されるため単体テスト不要(公開もしない)

### 手動検証手順

1. 空白部を右クリック → New Folder → 名前入力 → Enter → フォルダが現れ選択される
2. New File で同様にファイル作成
3. New Folder → Esc → `ls` で何も作られていないことを確認
4. 行を右クリック → Rename → 名前変更 → Enter → 反映・選択
5. Rename 中に Esc → 元のまま
6. 既存の名前にリネーム → エラーバナー、元のまま
7. `.hidden` という名前で作成 → エラーバナー
8. 行の上で右クリック → 行メニューのみが開く(New Folder が見えない)ことを確認
9. Rename 編集中に別フォルダへ移動 → 編集が消え、何も変わっていない

## 11. Future work

- コピー / ペースト / 複製
- F2 / Enter(macOS 流)でのリネーム開始
- 大文字小文字のみのリネーム対応(case-insensitive FS)
- 新規作成後にそのままリネーム編集に入るフロー(Finder 風)
