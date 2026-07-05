# 09 — OS drop-in(Finder 等からのドロップ受け入れ)

## 1. Goal

OS のファイルマネージャ(Finder / Nautilus 等)からウィンドウへファイルをドロップすると、アクティブタブの現在ディレクトリへ**コピー**されるようにする。新 Rust コマンド `copy_entry` を追加する。

⚠️ この spec は `tauri.conf.json` の `dragDropEnabled` を反転する、ロードマップ中**最もリスクの高い変更**を含む。§10 のリグレッション検証を必ず実施すること。

## 2. Non-goals

- ドロップ位置による行/ツリーノード/タブへのターゲティング(ウィンドウ全体で 1 ターゲット。レシピは §11 参照)
- move セマンティクス、修飾キーによる move/copy 切り替え(常に copy)
- アプリから OS へのドラッグアウト(spec 10)
- コピーの進捗表示・キャンセル(大きいファイルは無言で待つ。既知の制限)

## 3. Prerequisites

- 依存する spec: 08(全アプリ内 D&D 面が出揃った後にフラグ反転の検証を 1 回で済ませるため)
- 前提とする既存ファイル:
  - `src-tauri/tauri.conf.json` — `app.windows[0].dragDropEnabled: false`(反転対象)
  - `src/App.tsx` — リスナー登録先(`onMount` / `onCleanup`)
  - `src/store/explorer.ts` — `activeTab().currentPath`、`mutateAndReload` パターン、`setError`
  - `src-tauri/src/commands.rs` — `move_entry` のガード実装(エラーメッセージ書式・containment チェックの参考)

## 4. UI/UX behavior

- Given: OS のファイルマネージャからファイル(複数可)をドラッグ / When: ウィンドウ上に入る(`enter`/`over`)/ Then: フルウィンドウのオーバーレイを表示: 半透明 `--drop-bg` + 中央に "Copy to <現在ディレクトリの basename>" のラベル
- When: ウィンドウ外へ出る(`leave`)またはドロップ完了 / Then: オーバーレイを消す
- When: ドロップ(`drop`, `paths` 配列を受領)/ Then: 各パスを順に `copy_entry(path, activeTab().currentPath)` する。**逐次実行し、最初のエラーで中断してバナー表示**(それまでに成功した分は残る)。最後にアクティブタブをリロード
- コピーであり move ではない(ドロップ元のファイルは残る)

セマンティクスを copy に固定する理由(実装時に変更しない):

1. ネイティブドラッグ中は修飾キーが読めない(Tauri の DragDropEvent にキー情報がない)ため move/copy の切り替えができない
2. copy は非破壊 — 誤ドロップでドロップ元からファイルが消える事故(データ損失)を構造的に防ぐ
3. `fs::rename` ベースの move はクロスボリュームで失敗するが、copy は常に機能する

## 5. State & data model

ストア変更なし。オーバーレイ表示は `App.tsx` 内のローカル signal(`osDragActive: boolean`)。

イベント購読(`App.tsx` の `onMount`):

```ts
import { getCurrentWebview } from "@tauri-apps/api/webview";

// onMount:
const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
  switch (event.payload.type) {
    case "enter":
    case "over": // set osDragActive(true)
    case "leave": // set osDragActive(false)
    case "drop": // set osDragActive(false); handle event.payload.paths
  }
});
// onCleanup: unlisten()
```

- `DragDropEvent`: `{type:"enter", paths, position} | {type:"over", position} | {type:"drop", paths, position} | {type:"leave"}`(position は `PhysicalPosition`、本 spec では未使用)
- capability 変更は不要(`core:default` が webview イベントをカバーし、`copy_entry` はアプリ定義コマンドなので ACL 不要)

## 6. Backend commands

`src-tauri/src/commands.rs` に追加し、`lib.rs` の `generate_handler!` に登録:

```rust
/// Copies `source` (file or directory, recursively) into `target_dir`,
/// keeping its file name. Returns the new path. Symlinks are followed
/// (the copy is a regular file/dir).
#[tauri::command]
pub fn copy_entry(source: String, target_dir: String) -> Result<String, String>
// Guards, in order (mirror move_entry's style and messages):
// 1. name = src.file_name() — Err("Invalid source path: {source}") if none
// 2. if src.is_dir(): canonicalize-based containment check —
//    Err("Cannot copy a folder into itself") when target_real starts_with src_real
// 3. dest = target_dir.join(name); if dest.exists() →
//    Err("\"{name}\" already exists in the destination")
// 4. file: fs::copy(src, dest)
//    dir:  recursive walk (create_dir + copy per entry; plain recursion, no new deps)
//    errors → Err("Failed to copy: {e}")
```

`src/lib/ipc.ts` に追加:

```ts
export const copyEntry = (source: string, targetDir: string) =>
  invoke<string>("copy_entry", { source, targetDir });
```

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src-tauri/tauri.conf.json` | 変更 | `app.windows[0].dragDropEnabled: false → true`(**この spec 以外で触らない**) |
| `src-tauri/src/commands.rs` | 変更 | `copy_entry` + テスト |
| `src-tauri/src/lib.rs` | 変更 | `generate_handler!` に追加 |
| `src/lib/ipc.ts` | 変更 | `copyEntry` ラッパー |
| `src/App.tsx` | 変更 | `onDragDropEvent` 購読・解除、オーバーレイ signal、drop 処理(逐次 copy → リロード) |
| `src/App.css` | 変更 | オーバーレイのスタイル(`--drop-bg`、position: fixed、pointer-events: none) |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 複数ファイルを一度にドロップ | 逐次コピー。最初のエラーで中断・バナー表示。成功済み分は残る。最後にリロード(エラー時もリロードする — 成功分を見せるため) |
| 同名ファイルが既に存在 | "already exists" エラーで中断 |
| フォルダをドロップ | 再帰コピー |
| フォルダを自分自身(の子孫)へドロップ | containment ガードでエラー |
| ドラッグがウィンドウ外へ出て戻る | leave → enter でオーバーレイが正しく点滅追従 |
| ドットファイル(`.env` 等)をドロップ | コピーは成功するが `read_directory` のスキップにより一覧に表示されない。エラーにしない(既知の挙動。バナーも出さない) |
| アプリ内 D&D 中のオーバーレイ誤表示 | 実装後に検証: アプリ内 HTML5 ドラッグで `onDragDropEvent` が発火する場合は、オーバーレイ表示を「アプリ内ドラッグ中でない」条件でガードする(§10-手動-7 で確認) |

## 9. Acceptance criteria

- [ ] Finder(macOS)/ Nautilus(Linux)からのファイルドロップで現在ディレクトリにコピーされ、一覧に現れる
- [ ] ドロップ元のファイルは消えていない(copy であること)
- [ ] フォルダのドロップで中身ごと再帰コピーされる
- [ ] 同名衝突でエラーバナーが出て、部分的に成功した分は一覧に見える
- [ ] ドラッグ進入でオーバーレイ表示、離脱・ドロップで消える
- [ ] **リグレッション: アプリ内 D&D(行→フォルダ、行→ツリー、行→タブ)が macOS / Linux で全て従来どおり動く**
- [ ] `cargo test` の追加ケースが通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

なし(ドロップ処理はイベント配線のみで純粋ロジックがない)。

### Rust

`commands.rs` に追加(既存スタイル):

- `copy_entry`: ファイルコピー成功(source 残存・dest 存在・戻り値一致)/ フォルダ再帰コピー(ネストした子まで検証)/ 衝突エラー / copy-into-self エラー

### 手動検証手順

**macOS と Linux の両方で実施すること。** Tauri は `dragDropEnabled: true` が Windows で HTML5 DnD を壊すことを公式に記しており、macOS/Linux は「動くはず」だが検証必須。

1. `pnpm tauri dev` 起動
2. Finder からファイルをウィンドウへドラッグ → オーバーレイ表示 → ドロップ → コピーされ一覧に出現、Finder 側にも残存
3. フォルダをドロップ → 再帰コピー確認
4. 同名ファイルを再度ドロップ → エラーバナー
5. 複数ファイル(1 つは同名衝突)をドロップ → 衝突までの分はコピーされ、バナー表示
6. ドラッグしてウィンドウ外へ離脱 → オーバーレイが消える
7. **リグレッション**: アプリ内 D&D 全パターン(行→フォルダ行 / 行→ツリーノード / 行→タブ)を再確認。アプリ内ドラッグ中にオーバーレイが出ないことも確認
8. 以上を Linux(Nautilus 等)でも繰り返す

### フォールバック方針(リグレッションが出た場合)

macOS/Linux でアプリ内 HTML5 DnD が壊れることが判明した場合、以下のいずれかを人間に提案して判断を仰ぐ(勝手に大改修しない):

- (a) `dragDropEnabled: false` に戻し、本 spec を取り下げる(OS ドロップを諦める)
- (b) アプリ内 D&D を pointer events ベースの自前実装に置き換える(大改修 — 別 spec を起こす)

## 11. Future work

- ドロップ位置ターゲティング: `event.payload.position`(PhysicalPosition)を `position.x / window.devicePixelRatio` で CSS ピクセルに換算し `document.elementFromPoint()` で行/ノード/タブを特定 → `data-path` 属性等でドロップ先ディレクトリを解決する
- コピー進捗表示とキャンセル(大容量対応)
- 全件成功/失敗のサマリ表示(現在は最初のエラーのみ)
