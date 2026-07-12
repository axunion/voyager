# 15 — Multi-select(複数選択)

## 1. Goal

ファイルリストの選択モデルを単一選択から複数選択に拡張する(Cmd/Ctrl+クリックのトグル、Shift+クリックの範囲選択、Cmd/Ctrl+A の全選択、Shift+矢印の拡張)。既存の全操作(開く・ゴミ箱・DnD 移動・コンテキストメニュー)が選択集合に対して動作するように移行する。

## 2. Non-goals

- ラバーバンド(ドラッグ矩形)選択
- ツリービュー・タブの複数選択(ファイルリストのみ)
- 複数選択時のドラッグイメージのカスタム(枚数バッジ等。ブラウザ既定のまま)
- 複数項目の一括リネーム(Rename は選択がちょうど 1 件のときのみ有効)
- クリップボード操作(spec 16)
- Home/End/PageUp/PageDown とその Shift 拡張(spec 17)
- 完全削除(Shift+Delete 等、ゴミ箱を経由しない削除。Delete は従来どおり常にゴミ箱へ)

## 3. Prerequisites

- 依存する spec: なし(12–14 と独立。ただし 12 完了後なら正規パイプラインの「可視エントリ」に対して自然に動作する)
- 前提とする既存ファイル:
  - `src/store/explorer.ts` — `TabState.selectedPath: string | null` と `select()` / `setFilter()` の `stillMatches` / `load()` の選択リセット / `commitEdit` の新規パス選択
  - `src/lib/listNav.ts` — `entryAfterMove(entries, selectedPath, delta)` / `rowId(path)`
  - `src/lib/dnd.ts` — `DRAG_TYPE` ペイロードは現在**単一パスの生文字列**。`startVoyagerDrag(e, path)` / `readVoyagerPath(e)`
  - ドロップ受け側 4 箇所: `FileItem.tsx`(フォルダ行)/ `FileList.tsx`(背景)/ `TreeNode.tsx` / `TabBar.tsx` — いずれも `readVoyagerPath` → `onDropMove(source, targetDir)`
  - `src/components/FileList.tsx` — `createSelector` による選択判定、`aria-activedescendant`、キーボードナビ
  - `src/App.tsx` — 配線と `handleOpen`

## 4. UI/UX behavior

操作マトリクス(すべて可視エントリ=ソート・フィルタ後の配列に対して動作):

| 操作 | 結果 | anchor | cursor |
| --- | --- | --- | --- |
| クリック | その 1 件に置換 | クリック行 | クリック行 |
| Cmd/Ctrl+クリック | その行の選択をトグル(他は維持) | クリック行 | クリック行 |
| Shift+クリック | anchor からクリック行までの範囲に置換 | **不変** | クリック行 |
| Cmd/Ctrl+A(リストフォーカス時) | 可視エントリ全件 | 先頭行 | 末尾行 |
| ↑ / ↓ | cursor を移動し、その 1 件に置換 | 移動先 | 移動先 |
| Shift+↑ / Shift+↓ | cursor を移動し、anchor から cursor までの範囲に置換 | 不変 | 移動先 |
| Escape(リストフォーカス時) | 選択を空にする | null | null |

- anchor が null の状態で Shift 系操作をした場合、cursor(それも null なら先頭行)を anchor として扱う
- cursor 行は `aria-activedescendant` の対象。視覚表示は選択ハイライトに加えて 1px の inset outline(`--border-color`。新色トークンなし)
- 選択中の行のコンテキストメニュー: 選択を維持したまま開き、Open / Move to Trash は**選択全体**に作用する。未選択行のコンテキストメニュー: その行に置換選択してから開く
- **Rename は選択がちょうど 1 件のときのみメニューに有効表示**(複数選択時は Kobalte の `disabled`)
- Enter / メニューの Open(複数選択時): ファイルは OS で順次開き、ディレクトリはそれぞれ**新規タブ**で開く(選択 1 件のディレクトリは従来どおりその場でナビゲート)
- Delete / メニューの Move to Trash: 選択全体を順次ゴミ箱へ。最初のエラーで停止しバナー表示、最後に 1 回だけリロード
- ドラッグ: 選択済み行をドラッグ → **選択全体**を移動。未選択行をドラッグ → その行に置換選択してから単体移動。ドロップ先 4 箇所(フォルダ行 / リスト背景 / ツリーノード / タブ)すべてで複数パスを受け付ける
- ナビゲート(`load()`)で選択・anchor・cursor はリセット。フィルタ変更でマッチしなくなった行は選択から除外される

## 5. State & data model

`src/store/explorer.ts` の `TabState` — `selectedPath` を置換:

```ts
interface TabState {
  // ...existing fields...
  selectedPaths: string[]; // kept in visible-list order
  selectionAnchor: string | null; // range-select origin
  selectionCursor: string | null; // keyboard focus row → aria-activedescendant
}
```

新規純モジュール `src/lib/selection.ts`(+ colocated テスト):

```ts
import type { Entry } from "./ipc";

export interface Selection {
  paths: string[]; // visible-list order
  anchor: string | null;
  cursor: string | null;
}

export const emptySelection: Selection;

// All operate on the visible (post sort+filter) entries array.
export function replaceSelect(entries: Entry[], path: string): Selection;
export function toggleSelect(
  entries: Entry[],
  current: Selection,
  path: string,
): Selection;
// anchor stays; selection becomes the inclusive range anchor..target.
// A null/missing anchor falls back to target (single-row range).
export function rangeSelect(
  entries: Entry[],
  current: Selection,
  target: string,
): Selection;
export function selectAll(entries: Entry[]): Selection;
// Drops paths no longer present in `visible`; nulls anchor/cursor if dropped.
export function pruneSelection(current: Selection, visible: Entry[]): Selection;
```

facade の変更:

```ts
select(path: string): void;                 // kept: replace-select one path
setSelection(sel: Selection): void;         // writes paths/anchor/cursor in one commit
addTab(path?: string): void;                // NEW optional arg: open at path (defaults to current behavior)
moveIntoFolder(sources: string[], targetDir: string): Promise<void>; // sequential, stop on first error, reload once. Filters out sources whose path equals targetDir.
trashEntries(paths: string[]): Promise<void>; // sequential, stop on first error, reload once
```

- クリック/キー操作の選択計算は `FileList.tsx` が `selection.ts` の純関数と `props.entries` で行い、結果を `onSelectionChange(sel)` で上げる(dumb 規約: コンポーネントはストアを知らない)
- `load(tabId, path, selectedPath)` の第 3 引数は維持し、非 null なら `selectedPaths: [p], anchor: p, cursor: p` に展開(`commitEdit` の「新規エントリを選択」がそのまま動く)
- `setFilter` の `stillMatches` は `pruneSelection` に置換
- `entryAfterMove`(`listNav.ts`)はシグネチャ不変のまま `selectionCursor` を渡して使う

`src/lib/dnd.ts` — ペイロードを**パスの JSON 配列**に変更:

```ts
export function startVoyagerDrag(e: DragEvent, paths: string[]): void; // JSON.stringify(paths)
export function readVoyagerPaths(e: DragEvent): string[]; // JSON.parse; [] on missing/invalid payload
```

`readVoyagerPath`(単数)は削除し、全呼び出し箇所を移行する。

## 6. Backend commands

なし(`move_entry` / `move_to_trash` を逐次呼び出しで再利用)。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/selection.ts` / `selection.test.ts` | 新規 | 選択計算の純関数 + テスト |
| `src/lib/dnd.ts` / `dnd.test.ts` | 変更 | ペイロード JSON 配列化(`startVoyagerDrag` / `readVoyagerPaths`)、テスト追随 |
| `src/store/explorer.ts` | 変更 | `TabState` の選択 3 フィールド化、`setSelection` / `trashEntries` / `moveIntoFolder` 複数化 / `addTab(path?)`、`load` / `setFilter` / `commitEdit` の追随 |
| `src/components/FileList.tsx` | 変更 | 選択計算(クリック修飾キー・Cmd+A・Shift+矢印・Escape)、`selectedPaths` / `cursor` props、`aria-multiselectable`、ドラッグ開始の選択判定 |
| `src/components/FileItem.tsx` | 変更 | `isCursor` prop と outline、`onDragStart` をコールバック化(親が選択全体を注入)、メニューの Rename disabled 条件、Open/Trash の選択全体適用は親コールバック経由 |
| `src/components/FileItem.module.css` | 変更 | cursor outline(既存トークンのみ) |
| `src/components/TreeNode.tsx` / `TabBar.tsx` | 変更 | `readVoyagerPaths` への移行、`onDropMove(paths, dir)` 化 |
| `src/App.tsx` | 変更 | 配線の複数化(`onDropMove` / `onTrash` / `handleOpen` の複数対応、`onSelectionChange`) |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 選択全体のドラッグ先が選択内のフォルダ | facade が `source === targetDir` の項目を除外して残りを移動(フォルダを自分自身へは移動しない) |
| 逐次移動の途中でエラー(衝突等) | そこで停止・バナー表示。移動済みの項目はそのまま(ロールバックしない)。1 回リロード |
| 複数選択中にフィルタを絞る | マッチしない行が選択から外れる。cursor/anchor が外れたら null |
| 複数選択中にソート変更 | 選択集合は不変(パスベース)。`selectedPaths` の順序は次の選択操作時に可視順で再構築されるため厳密な並び替えは不要 |
| Cmd+クリックで最後の 1 件を解除 | 選択空。anchor/cursor はクリック行のまま(次の Shift 操作の起点になる) |
| 旧ビルドの単一パス形式ペイロード(JSON でない文字列) | `readVoyagerPaths` が `[]` を返しドロップは no-op(実運用ではアプリ内 DnD のみなので発生しない) |
| 複数選択で Enter、選択にディレクトリ 3 件 | 新規タブが 3 つ開く(最後に開いたタブがアクティブ) |
| フィルタ入力・インライン編集中の Cmd+A | テキスト入力の全選択のまま(リスト側は `menuOpen` ガードと同様、入力側の `stopPropagation` / フォーカス外で発火しない) |
| spec 11 のドラッグ元隠しペイン | ペイロード形式変更のみで挙動不変(手動テストで回帰確認) |

## 9. Acceptance criteria

- [ ] クリック / Cmd+クリック / Shift+クリック / Cmd+A / Shift+矢印 / Escape が操作マトリクスどおりに動く
- [ ] 選択全体の Delete(ゴミ箱)・ドラッグ移動が 4 箇所すべてのドロップ先で動く
- [ ] 未選択行のドラッグ・右クリックがその行への置換選択として振る舞う
- [ ] 複数選択時に Rename が無効化される
- [ ] 複数選択の Enter でファイルは OS で開き、ディレクトリは新規タブで開く
- [ ] フィルタ・ナビゲートでの選択リセット/プルーニングが動く
- [ ] spec 11 のタブホバー切替ドラッグが回帰していない(手動)
- [ ] `pnpm check` / `pnpm test` が通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

- `selection.test.ts`: 操作マトリクス各行 / anchor null での rangeSelect / 存在しないパスの toggle / `pruneSelection`(全滅・部分・cursor 脱落)/ paths が可視順を保つこと / 入力を破壊しないこと
- `dnd.test.ts`(追随): 配列の往復 / 空配列 / ペイロード欠落・非 JSON → `[]`

### Rust

なし。

### 手動検証手順

1. クリック → 単一選択。Cmd+クリックで 2 件目追加、もう一度で解除
2. Shift+クリックで範囲選択、続けて別行を Shift+クリック → anchor 起点で範囲が張り直る
3. Cmd+A → 全選択。Escape → 解除。Shift+↓ 連打 → 下方向に拡張
4. 3 件選択して Delete → 全部ゴミ箱へ。バナーなし・リロード 1 回
5. 3 件選択してフォルダ行へドラッグ → 全部移動。ツリーノード・タブ・リスト背景へのドロップも同様
6. 未選択行をドラッグ → その行だけが移動し、選択もその行に変わる
7. 2 件選択して右クリック → Rename が無効。Open → ファイルが開き、ディレクトリ選択なら新規タブ
8. フィルタを入力して選択の一部がマッチしなくなる → 選択から外れる
9. ドラッグ中にタブへ 600ms ホバー → タブ切替してドロップできる(spec 11 回帰確認)

## 11. Future work

- ラバーバンド選択
- 複数選択ドラッグ時の枚数バッジ(カスタムドラッグイメージ)
- ステータスバーでの選択件数・合計サイズ表示
- 一括リネーム
