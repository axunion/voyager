# 08 — In-app DnD 拡張(ツリーノード・タブへのドロップ)

## 1. Goal

既存のアプリ内 HTML5 D&D(ファイル行 → フォルダ行の移動)を、ツリーノードとタブヘッダにも広げる。ファイル行をツリーのフォルダやタブにドロップすると、そのディレクトリへ `move_entry` される。あわせて D&D ヘルパーを共有モジュールに抽出する。

## 2. Non-goals

- OS との D&D(spec 09 / 10)
- ツリーノードやタブを**ドラッグ元**にすること(ドラッグ元はファイル行のみ)
- ドラッグホバーでのタブ自動切り替え・ツリー自動展開
- コピー動作(移動のみ。修飾キーでのコピーは対象外)

## 3. Prerequisites

- 依存する spec: 02(TabBar が存在)、04(ツリーが存在)
- 前提とする既存ファイル:
  - `src/components/FileItem.tsx` — 既存 D&D 実装。以下のパターンを持つ(抽出対象):
    - `DRAG_TYPE = "application/x-voyager-path"`(カスタム MIME)
    - dragover 中はペイロードが読めない(HTML5 protected mode)ため、`types.includes(DRAG_TYPE)` の型宣言チェックだけで受け入れ判定する
    - `dragOver` signal によるハイライト + document レベル `dragend`/`drop` リスナーでの取りこぼしクリア(キャンセルされたドラッグで dragleave が来ない webview 対策)
  - `src/store/explorer.ts` — `moveIntoFolder(source, targetDir)`(`move_entry` + アクティブタブのリロード)
  - `src/components/TreeNode.tsx`(または Sidebar 内)/ `src/components/TabBar.tsx`

## 4. UI/UX behavior

- Given: ファイル行をドラッグ中 / When: ツリーの任意のノード上にホバー / Then: ノードが `--drop-bg` でハイライト。ドロップで `move_entry(source, nodePath)` → アクティブタブがリロード
- Given: ファイル行をドラッグ中 / When: タブヘッダ上にホバー / Then: タブが `--drop-bg` でハイライト。ドロップでそのタブの `currentPath` へ `move_entry` → **アクティブタブがリロード**(ドロップ先タブはアクティブ化しない。ドロップ先タブが同じディレクトリを表示していた場合の stale は 02 の既知の制限に従う)
- ツリーノードは全てディレクトリなので全ノードがドロップターゲット
- 既存のファイル行 → フォルダ行ドロップは従来どおり動く(リグレッションさせない)
- ハイライトはドラッグがどこで終わっても確実に消える(既存のクリーンアップフォールバックを踏襲)

## 5. State & data model

ストア変更なし。共有ヘルパーを新設する(使用箇所が FileItem / TreeNode / TabBar の 3 箇所になり、抽出規約「3+ 箇所」を満たす):

```ts
// src/lib/dnd.ts — shared in-app DnD helpers
export const DRAG_TYPE = "application/x-voyager-path";

// Usable during dragover/dragenter: checks the declared type only,
// because the payload is unreadable in HTML5 protected mode.
export function acceptsVoyagerDrag(e: DragEvent): boolean;

// Usable in drop handlers: returns the dragged path, or null.
export function readVoyagerPath(e: DragEvent): string | null;

// Sets the drag payload on dragstart (path + effectAllowed = "move").
export function startVoyagerDrag(e: DragEvent, path: string): void;
```

ハイライト管理(`dragOver` signal + document フォールバック)は各コンポーネントに現状どおり実装してよい(FileItem の実装をパターンとして踏襲)。共通フックへの抽出は必須としない — 3 箇所で同型コードになったら実装者判断で `src/lib/dnd.ts` に `createDragOverSignal()` 等を足してよい。

## 6. Backend commands

なし(`move_entry` を再利用)。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/dnd.ts` | 新規 | 上記ヘルパー |
| `src/lib/dnd.test.ts` | 新規 | `acceptsVoyagerDrag` / `readVoyagerPath` のテスト(DragEvent は最小限のスタブオブジェクトで可 — node 環境のため) |
| `src/components/FileItem.tsx` | 変更 | ローカルの `DRAG_TYPE` / 判定ロジックを `src/lib/dnd.ts` 使用に置き換え(挙動不変のリファクタ) |
| `src/components/TreeNode.tsx`(または Sidebar) | 変更 | dragover/enter/leave/drop ハンドラ + ハイライト。ドロップで `onDropMove(source, nodePath)` を呼ぶ props 追加 |
| `src/components/TabBar.tsx` | 変更 | タブ要素に同様のハンドラ。ドロップで `onDropMove(source, tab.fullPath)` を呼ぶ props 追加 |
| `src/components/Sidebar.module.css` / `TabBar.module.css` | 変更 | `.dropTarget` スタイル(`--drop-bg`) |
| `src/App.tsx` | 変更 | Sidebar / TabBar への `onDropMove` 配線(`explorer.moveIntoFolder`) |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| エントリを自分自身の親と同じ場所へドロップ(現在のフォルダのタブ等) | `move_entry` の dest-exists ガードで "already exists" エラー → バナー表示。特別扱いしない |
| フォルダを自分自身(またはその子孫)のツリーノードへドロップ | `move_entry` の containment ガードで "Cannot move a folder into itself" エラー |
| ドラッグ中に Esc 等でキャンセル | document フォールバックで全ハイライトが消える |
| アプリ外からのドラッグ(OS ファイル等)がツリー/タブに来る | `acceptsVoyagerDrag` が false(型宣言なし)なので無反応(OS 連携は spec 09) |
| ドロップ成功後のツリー表示 | ツリーは自動更新しない(04 の制限どおり)。ファイルリストのみリロード |
| 移動先が非アクティブタブの currentPath | 移動は実行、リロードはアクティブタブのみ。ドロップ先タブは再訪時に反映 |

## 9. Acceptance criteria

- [ ] ファイル行 → ツリーノードへのドロップで移動し、一覧がリロードされる
- [ ] ファイル行 → タブヘッダへのドロップでそのタブのディレクトリへ移動する(タブは切り替わらない)
- [ ] ドラッグホバー中のみターゲットがハイライトされ、ドラッグ終了で必ず消える
- [ ] フォルダを自分の子孫ノードへドロップするとエラーバナー(FS 無変化)
- [ ] 既存のファイル行 → フォルダ行ドロップが従来どおり動く
- [ ] `FileItem.tsx` にローカルの `DRAG_TYPE` 定義が残っていない(dnd.ts に一本化)

## 10. Test plan

### Vitest(純粋ロジックのみ)

`src/lib/dnd.test.ts`:

- `acceptsVoyagerDrag`: types に DRAG_TYPE を含む/含まない/dataTransfer null の各スタブで判定
- `readVoyagerPath`: getData が値を返す/空文字/dataTransfer null

### Rust

なし。

### 手動検証手順

1. ファイルをツリーの別フォルダノードへドラッグ → ハイライト → ドロップ → 移動確認(ドロップ先をタブで開いて実在確認)
2. タブを 2 つ用意し、ファイルをタブ 2 のヘッダへドロップ → タブ 2 に切り替えるとファイルがある
3. フォルダをツリー上の自分の子孫へドロップ → エラーバナー
4. 同じフォルダ(現在地)のタブへドロップ → "already exists" エラー
5. ドラッグを Esc でキャンセル → ハイライトが残っていない
6. 従来のリスト内ドロップ(ファイル → フォルダ行)の回帰確認

## 11. Future work

- ドラッグホバーでのツリーノード自動展開(spring-loaded folders)
- ドラッグホバーでのタブ自動切り替え
- 修飾キーでのコピー動作
- ドロップ成功後のツリー自動リフレッシュ
