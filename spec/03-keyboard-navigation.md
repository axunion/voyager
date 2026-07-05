# 03 — Keyboard navigation(キーボードナビゲーション)

## 1. Goal

ファイルリストを矢印キーで選択移動、Enter で開く(01 で実装済み)、Delete でゴミ箱へ移動できるようにする。スクリーンリーダー互換の listbox パターンを採用する。

## 2. Non-goals

- Home / End / PageUp / PageDown
- 先頭文字タイプによるジャンプ(type-ahead)
- 複数選択(Shift / Cmd クリック含む)
- `Cmd+Backspace`(macOS 流のゴミ箱ショートカット)— Delete のみ
- ツリービュー側のキーボード操作(spec 04 の範囲外、Future work)

## 3. Prerequisites

- 依存する spec: 01(Enter で開く / `FileList` の `tabindex="0"` + `onKeyDown` が存在)、02(選択がタブごとの `selectedPath` になっている)
- 前提とする既存ファイル:
  - `src/components/FileList.tsx` — `tabindex="0"` 付きコンテナ。Enter ハンドリング済み。props: `entries / selectedPath / onOpen / onSelect / onDropMove / onTrash`
  - `src/components/FileItem.tsx` — 行。`selected` prop でハイライト
  - `src/components/FileList.module.css` / `FileItem.module.css` — 行高 28px 固定

## 4. UI/UX behavior

フォーカスモデル: **単一フォーカスコンテナ + `aria-activedescendant`**(WAI-ARIA listbox パターン)。行自体はフォーカスを受けない。

採用理由(実装時に変更しない): 行は将来 virtualizer で画面外がアンマウントされる前提(`FileList.tsx` のコメント参照)。roving tabindex は行の DOM が消えるとフォーカスを失うため不採用。

- `FileList` ルート: `role="listbox"`、`tabindex="0"`、`aria-activedescendant` = 選択行の `id`(未選択時は属性なし)
- 各行(`FileItem` ルート): `role="option"`、`aria-selected={selected}`、`id={encodeURIComponent(entry.path)}`(パスに含まれる `"` や空白で id が壊れないようエンコード)

キーマトリクス(`FileList` にフォーカスがあるとき):

| キー | 動作 |
| --- | --- |
| `ArrowDown` | 次のエントリを選択。未選択なら先頭を選択。末尾ではそれ以上動かない(ラップしない) |
| `ArrowUp` | 前のエントリを選択。未選択なら何もしない。先頭ではそれ以上動かない |
| `Enter` | 選択中エントリを開く(01 で実装済み、変更しない) |
| `Delete` | 選択中エントリを `onTrash(entry)`。未選択なら何もしない |

- 矢印キーのデフォルトスクロールは `preventDefault` で抑止する
- キーボードで選択が変わったとき、その行へ `scrollIntoView({ block: "nearest" })`。**マウスクリックによる選択変更ではスクロールしない**(キー操作時のみ)

## 5. State & data model

ストア変更なし。選択インデックス計算は純粋ヘルパーに抽出する:

```ts
// src/lib/listNav.ts — pure, unit-tested
import type { Entry } from "./ipc";

// Returns the entry to select after moving by `delta` (+1 / -1),
// or null when no movement should happen.
// - selectedPath not found (or null) + delta > 0 → first entry
// - selectedPath not found (or null) + delta < 0 → null
// - clamped at both ends (no wrap): moving past an edge → null
export function entryAfterMove(
  entries: Entry[],
  selectedPath: string | null,
  delta: 1 | -1,
): Entry | null;
```

## 6. Backend commands

なし。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/listNav.ts` | 新規 | `entryAfterMove` |
| `src/lib/listNav.test.ts` | 新規 | 上記のテスト |
| `src/components/FileList.tsx` | 変更 | `role="listbox"` / `aria-activedescendant`、`onKeyDown` に ArrowUp/Down/Delete を追加(Enter は既存)。キー起因の選択変更時に `scrollIntoView`。**props は変更しない** |
| `src/components/FileItem.tsx` | 変更 | ルートに `role="option"` / `aria-selected` / `id`(encodeURIComponent したパス)を追加 |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 空のディレクトリで矢印キー | 何もしない(`entryAfterMove` が null) |
| 末尾で `ArrowDown` / 先頭で `ArrowUp` | 動かない(ラップしない) |
| 未選択で `ArrowDown` | 先頭を選択 |
| 未選択で `ArrowUp` / `Delete` | 何もしない |
| `Delete` 後のリロードで一覧が変わる | 選択は `load()` によりクリアされる(既存挙動)。連打しても未選択なので安全 |
| 選択行が画面外(スクロール済み)で矢印キー | `scrollIntoView({ block: "nearest" })` で最小移動のスクロール |
| フィルタ適用中(spec 07 実装後) | `entries` prop には可視リストが渡ってくるため追加対応不要 |

## 9. Acceptance criteria

- [ ] クリックまたは Tab で `FileList` にフォーカス後、`ArrowDown` / `ArrowUp` で選択が上下に動く
- [ ] 未選択から `ArrowDown` で先頭が選択される
- [ ] 先頭・末尾でラップしない
- [ ] 選択が画面外に出るとき自動で最小スクロールする
- [ ] `Delete` で選択中エントリがゴミ箱へ移動し、一覧がリロードされる
- [ ] `role="listbox"` / `role="option"` / `aria-activedescendant` / `aria-selected` が DOM 上に正しく付いている(devtools で確認)
- [ ] 矢印キーでウィンドウ全体がスクロールしない

## 10. Test plan

### Vitest(純粋ロジックのみ)

`src/lib/listNav.test.ts` — `entryAfterMove`:

- 中間位置から +1 / -1
- 未選択 + delta=+1 → 先頭、未選択 + delta=-1 → null
- 先頭で -1 → null、末尾で +1 → null
- 空配列 → null
- selectedPath が entries に存在しない → 未選択と同じ扱い

### Rust

なし。

### 手動検証手順

1. 起動してリストをクリック(フォーカス)
2. `ArrowDown` 連打 → 選択が下に移動し、画面外に出たら追従スクロール
3. `ArrowUp` で先頭まで戻り、さらに押しても動かないことを確認
4. 選択して Enter → 開く(01 の回帰確認)
5. テスト用ファイルを選択して `Delete` → ゴミ箱に入り一覧から消える
6. 空フォルダで矢印キー → 無反応
7. devtools の Elements で listbox/option/aria 属性を確認

## 11. Future work

- Home / End、type-ahead、複数選択
- `Cmd+Backspace` ショートカット
- ツリービューのキーボード操作
- Delete の確認ダイアログ(現状ゴミ箱行きなので復元可能、確認なしを仕様とする)
