# 16 — In-app clipboard(コピー / カット / ペースト)

## 1. Goal

アプリ内クリップボードによるコピー・カット・ペーストを追加する(`Cmd/Ctrl+C / X / V` + コンテキストメニュー)。クリップボードは**アプリ内のメモリのみ**で完結し、OS のクリップボードには一切触れない — OS 側にパスや内容の痕跡を残さないことがこの機能のプライバシー上の要件である。

## 2. Non-goals

- **OS クリップボード連携**(Finder/Nautilus との相互コピペ。OS のクリップボード履歴にパスが残るため、プロジェクト方針として恒久的に対象外)
- ペースト時の衝突自動リネーム(` copy` サフィックス等。衝突は常にエラー)
- 複製(Duplicate / Cmd+D)
- コピーの進捗表示・キャンセル(逐次実行、初回エラーで停止のみ)
- ツリービュー・タブを対象としたコピー/ペースト(ファイルリストのみ)
- Escape やカット元の再カットによるクリップボードのクリア UI(上書きのみ)

## 3. Prerequisites

- 依存する spec: 15(完了済みであること — 選択集合 `selectedPaths` と `moveIntoFolder(sources, targetDir)` / 逐次実行パターンが存在する)
- 前提とする既存ファイル:
  - `src-tauri/src/commands.rs` — `move_entry` の自己包含ガード(canonicalize パターン)と衝突エラー文言。`create_entry` の `create_new`。テストスタイル
  - `src/store/explorer.ts` — `mutateAndReload` / 逐次実行 + 1 回リロードのパターン(spec 15 の `trashEntries`)
  - `src/components/FileList.tsx` — リストコンテナの keydown(`menuOpen` ガードあり)と空白部コンテキストメニュー
  - `src/components/FileItem.tsx` — 行コンテキストメニュー(Open / Rename / Move to Trash)

## 4. UI/UX behavior

| 操作 | 場所 | 結果 |
| --- | --- | --- |
| Cmd/Ctrl+C(リストフォーカス時、選択 1 件以上) | FileList keydown | クリップボード = `{ paths: 選択全体, mode: "copy" }` |
| Cmd/Ctrl+X(同上) | FileList keydown | クリップボード = `{ paths: 選択全体, mode: "cut" }` |
| Cmd/Ctrl+V(リストフォーカス時、クリップボード非空) | FileList keydown | アクティブタブの `currentPath` へペースト |
| 行メニュー Copy / Cut | FileItem メニュー | 選択全体を対象(未選択行は置換選択してから — spec 15 の規則) |
| 空白部メニュー Paste | FileList メニュー | 同上。クリップボード空のときは Kobalte `disabled` |

- Cmd+C/X/V は **FileList コンテナの keydown のみ**に束縛し、グローバルには束縛しない(フィルタ入力・パス入力・インライン編集内のネイティブなテキストコピペを無条件に守るため)
- ペースト先は常に**アクティブタブの `currentPath`**(選択中のフォルダ行ではない。ルールを 1 つに保つ)
- `copy` モード: 各パスに `copy_entry` を逐次実行。成功後もクリップボードは**維持**(同じ内容を別の場所へ繰り返しペースト可能)
- `cut` モード: 各パスに既存 `move_entry` を逐次実行。**全件成功でクリップボードをクリア**(ワンショット、Finder と同じ)。エラー時は維持(リトライ可能)
- いずれも初回エラーで停止しバナー表示、最後に 1 回リロード。処理済みの項目はそのまま(ロールバックしない)
- **カット中の視覚表示**: クリップボードが `cut` モードのあいだ、該当パスの行を `opacity: 0.5` で減光する。クリップボードはアプリグローバルなので、別タブに同じディレクトリを表示していてもそこでも減光される
- クリップボードはタブを閉じても生存し、タブをまたいで使える(コピー元タブを閉じてから別タブへペースト可能)

## 5. State & data model

新規 `src/store/clipboard.ts`(アプリグローバル・セッション限り。永続化 API を持たないこと):

```ts
import { createSignal } from "solid-js";

export type ClipboardContent = {
  paths: string[];
  mode: "copy" | "cut";
} | null;

// In-app only by design: never reads from or writes to the OS clipboard.
const [content, setContent] = createSignal<ClipboardContent>(null);

export const clipboard = {
  content,
  set(paths: string[], mode: "copy" | "cut"): void, // no-op when paths is empty
  clear(): void,
};
```

`src/store/explorer.ts` の facade に追加:

```ts
copySelection(): void;  // clipboard.set(activeTab().selectedPaths, "copy")
cutSelection(): void;   // clipboard.set(activeTab().selectedPaths, "cut")
// Sequential copy_entry / move_entry into activeTab().currentPath, stop on
// first error (banner), reload once. Clears the clipboard only after a fully
// successful cut-paste.
paste(): Promise<void>;
```

`FileList` / `FileItem` への props(dumb 規約維持、`App.tsx` で配線):

```ts
// FileList
cutPaths: string[];      // clipboard()?.mode === "cut" ? paths : []
canPaste: boolean;       // clipboard() !== null
onCopy(): void;
onCut(): void;
onPaste(): void;
// FileItem
isCut: boolean;          // via createSelector over a Set of cutPaths
```

`src/lib/ipc.ts` に追加:

```ts
export const copyEntry = (source: string, targetDir: string) =>
  invoke<string>("copy_entry", { source, targetDir });
```

## 6. Backend commands

`src-tauri/src/commands.rs` に追加し、`lib.rs` の `generate_handler!` に登録する:

```rust
/// Copies `source` into `target_dir`, keeping its file name. Directories are
/// copied recursively. Returns the new path.
#[tauri::command]
pub fn copy_entry(source: String, target_dir: String) -> Result<String, String>
// Guards, in order:
// 1. src exists → Err("Cannot access \"{source}\": {e}") via the metadata call
// 2. if src.is_dir(): canonicalize-based containment check, same pattern as
//    move_entry → Err("Cannot copy a folder into itself")
// 3. dest = target_dir.join(file_name); if dest.exists() →
//    Err("\"{name}\" already exists in the destination")
// 4. file: fs::copy(src, dest)
//    dir:  hand-rolled recursive walk (create_dir then copy children);
//          no new crate (fs_extra is future work)
// 5. io errors → Err("Failed to copy: {e}")
// Symlinks: fs::copy follows them — the copy is the target's contents, not a
// new link. Accepted behavior (see Edge cases).
```

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src-tauri/src/commands.rs` | 変更 | `copy_entry` + 再帰コピーヘルパー + テスト |
| `src-tauri/src/lib.rs` | 変更 | `generate_handler!` に `copy_entry` 追加 |
| `src/lib/ipc.ts` | 変更 | `copyEntry` ラッパー |
| `src/store/clipboard.ts` | 新規 | アプリグローバルなクリップボードシグナル |
| `src/store/explorer.ts` | 変更 | `copySelection` / `cutSelection` / `paste` |
| `src/components/FileList.tsx` | 変更 | Cmd+C/X/V ハンドラ、空白部メニューに Paste、`cutPaths` / `canPaste` / コールバック props |
| `src/components/FileItem.tsx` | 変更 | メニューに Copy / Cut、`isCut` prop |
| `src/components/FileItem.module.css` | 変更 | `.cut { opacity: 0.5; }`(色トークン変更なし) |
| `src/App.tsx` | 変更 | クリップボード props / コールバックの配線 |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 同じディレクトリへの copy → paste | 衝突エラー(自動リネームしない本 spec の既知の帰結。バナー表示、FS 無変化) |
| フォルダを自分自身(またはその子孫)へ copy → paste | `Cannot copy a folder into itself` |
| cut → paste 先が同じディレクトリ | `move_entry` の衝突エラー(同名が既に存在)。クリップボード維持 |
| cut 後・paste 前に対象が外部でリネーム/削除される | paste 時に該当項目でエラー停止(既存エラー文言)。クリップボード維持。事前の防衛的再検証はしない |
| 逐次ペーストの途中でエラー | 停止・バナー。コピー/移動済みの項目は残る。リロード 1 回 |
| cut 中にナビゲート・タブ切替 | 減光は該当パスが表示されている場所でだけ見える。クリップボードは不変 |
| cut 中に新たに Cmd+C / Cmd+X | クリップボード上書き。旧 cut の減光は解除される |
| コピー元タブを閉じてから別タブでペースト | 成功(パスは絶対パスでタブと無関係) |
| 選択 0 件で Cmd+C / Cmd+X | no-op(クリップボード不変) |
| クリップボード空で Cmd+V | no-op。メニューの Paste は disabled |
| symlink のコピー | リンク先の内容が実体としてコピーされる(`fs::copy` が追従。許容と明記) |

## 9. Acceptance criteria

- [ ] Cmd+C → Cmd+V で別ディレクトリにコピーされる(ファイル・フォルダ再帰とも)
- [ ] Cmd+X → Cmd+V で移動され、クリップボードがクリアされる(連続 Cmd+V が no-op)
- [ ] copy モードは繰り返しペーストできる
- [ ] cut 中の行が全タブで減光され、上書き・ペースト完了で解除される
- [ ] メニューの Copy / Cut / Paste が機能し、Paste はクリップボード空で disabled
- [ ] フィルタ入力・パス入力・リネーム編集内の Cmd+C/X/V がテキスト操作のまま
- [ ] OS のクリップボードが変化しない(手動確認)
- [ ] `pnpm check` / `pnpm test` / `cargo fmt --check` / `cargo clippy` / `cargo test` が通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

なし(クリップボードはシグナル 1 本で分岐がなく、ペーストの逐次実行は IPC 直結のためストア規約どおりテスト対象外)。

### Rust

`commands.rs` のテストに追加(`tempfile`、既存スタイル):

- `copy_entry_copies_file`: 内容付きファイルのコピー(元が残る・内容一致・戻り値パス)
- `copy_entry_copies_directory_recursively`: ネストしたディレクトリ構造のコピー
- `copy_entry_collision_errors`: 衝突で `already exists`、コピー先無変化
- `copy_entry_folder_into_itself_errors`: 自己包含で `Cannot copy a folder into itself`
- `copy_entry_missing_source_errors`: 存在しないソースでエラー

### 手動検証手順

1. ファイル 2 件を選択して Cmd+C → 別フォルダで Cmd+V → 2 件コピーされ、元が残る
2. 同じ場所でもう一度 Cmd+V → 衝突エラーのバナー(自動リネームされない)
3. ネストしたフォルダを Copy → Paste → 中身ごと複製される
4. Cmd+X → 対象行が減光。別タブで同じフォルダを表示 → そこでも減光。Cmd+V → 移動し減光解除。もう一度 Cmd+V → 何も起きない
5. cut 途中で Cmd+C を打ち直す → 減光が解除され copy に置き換わる
6. 行メニューの Copy / Cut、空白メニューの Paste(空のとき disabled)を確認
7. フィルタ入力にフォーカスして Cmd+C/V → テキストのコピペとして動く(リストに影響なし)
8. 外部エディタ等で OS クリップボードに文字列を入れてから、アプリで Cmd+C → 外部に戻り Cmd+V → 元の文字列のまま(OS クリップボード不変の確認)

## 11. Future work

- ペースト衝突時の自動リネーム(` copy` サフィックス)
- Duplicate(Cmd+D = その場コピー+リネーム編集開始)
- コピー進捗ダイアログとキャンセル(大容量ディレクトリ向け)
- `fs_extra` 等による堅牢な再帰コピー(シンボリックリンク保持など)
