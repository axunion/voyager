# 07 — Filter(名前フィルタ)

## 1. Goal

表示中フォルダの一覧を名前でインクリメンタル絞り込みできる入力欄を Toolbar 右端に追加する。純フロントエンドのフィルタで、ナビゲートすると自動的にクリアされる。

## 2. Non-goals

- 再帰検索(サブフォルダの中は探さない)
- fuzzy マッチ、正規表現、glob
- マッチ箇所のハイライト表示
- フィルタ状態の永続化

## 3. Prerequisites

- 依存する spec: 02(`TabState` にフィールドを追加するため)
- 前提とする既存ファイル:
  - `src/store/explorer.ts` — `TabState` / `load()`(ロード成功時に state を差し替える箇所がリセットポイント)
  - `src/components/Toolbar.tsx` — 配置先
  - `src/App.tsx` — `FileList` に `entries` を渡している配線ポイント

## 4. UI/UX behavior

- Toolbar 右端に常設の小さな `<input>`(placeholder: `Filter`、幅 ~160px)
- When: 入力 / Then: アクティブタブの一覧が「名前に入力値を含むエントリ」(大文字小文字無視の部分一致)だけに即時絞り込まれる
- When: ナビゲート(セグメントクリック・ダブルクリック・戻る/進む、いずれも `load()` 経由)/ Then: フィルタは空にリセットされる
- フィルタはタブごと(`TabState` 保持)。タブを切り替えると、そのタブのフィルタ値が input に表示され、一覧も従う
- When: input 内で Esc / Then: フィルタをクリアして input から blur
- Given: フィルタ中、選択エントリがフィルタ結果から消えた / Then: 選択を解除する
- Given: エントリはあるがフィルタ結果 0 件 / Then: リスト部に muted な "No matching items" を 1 行表示(`--muted-color`)
- **フィルタ済みリストを `FileList` の `entries` prop に渡す**。これによりキーボードナビ(03)・D&D・Enter open は自動的に「見えているものだけ」を対象にする(追加対応不要)

## 5. State & data model

`src/store/explorer.ts` の `TabState` に追加:

```ts
interface TabState {
  // ...existing fields...
  filterQuery: string; // reset to "" by load()
}
```

facade に追加:

```ts
setFilter(query: string): void;
// sets activeTab's filterQuery; if the currently selected entry no longer
// matches, also clears selectedPath
```

フィルタ本体は純粋ヘルパーに抽出:

```ts
// src/lib/filterEntries.ts — pure, unit-tested
import type { Entry } from "./ipc";

// Case-insensitive substring match on entry.name.
// Empty/whitespace-only query returns entries unchanged (same reference is fine).
export function filterEntries(entries: Entry[], query: string): Entry[];
```

## 6. Backend commands

なし。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/filterEntries.ts` | 新規 | `filterEntries` |
| `src/lib/filterEntries.test.ts` | 新規 | 上記のテスト |
| `src/store/explorer.ts` | 変更 | `TabState.filterQuery` 追加、`load()` でリセット、`setFilter` 追加 |
| `src/components/Toolbar.tsx` | 変更 | 右端に filter input。props に `filterQuery: string` / `onFilterChange(q: string)` 追加 |
| `src/components/Toolbar.module.css` | 変更 | input のスタイル(トークンのみ) |
| `src/App.tsx` | 変更 | `FileList` へ `filterEntries(activeTab().entries, activeTab().filterQuery)` を渡す。Toolbar への配線。0 件時の "No matching items" 表示 |

`FileList.tsx` / `FileItem.tsx` は変更しない(フィルタ済み配列が渡ってくるだけ)。

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 空クエリ・空白のみ | 全件表示(フィルタなしと同じ) |
| クエリに一致 0 件 | "No matching items" を表示(エラーではない) |
| もともと空のフォルダ | フィルタ input は表示するが実質 no-op。"No matching items" は出さない(空フォルダの従来表示のまま) |
| 選択中エントリがフィルタで除外される | 選択解除 |
| フィルタ中にナビゲート | フィルタリセット(全件表示に戻る) |
| フィルタ中にファイル操作(リネーム・削除等)で `load()` が走る | `load()` がリセットするためフィルタは消える(仕様。再入力してもらう) |
| タブ切り替え | 各タブの `filterQuery` が独立に保持・表示される |
| フィルタ中の矢印キー / Enter / Delete / D&D | 可視リストが対象(entries prop がフィルタ済みのため自動) |

## 9. Acceptance criteria

- [ ] 入力に応じて一覧が即時絞り込まれる(大文字小文字無視の部分一致)
- [ ] 別フォルダへ移動するとフィルタが空に戻る
- [ ] タブごとにフィルタが独立している
- [ ] Esc でクリア + blur
- [ ] 一致 0 件で "No matching items" が表示される
- [ ] フィルタ中、矢印キー・Enter・Delete が見えているエントリだけを対象にする
- [ ] 選択中エントリがフィルタで消えると選択が解除される

## 10. Test plan

### Vitest(純粋ロジックのみ)

`src/lib/filterEntries.test.ts` — `filterEntries`:

- 部分一致(前方・中間・後方)
- 大文字小文字無視(`"RE"` が `"readme.md"` に一致)
- 空クエリ / 空白のみ → 全件
- 一致なし → 空配列
- 空 entries → 空配列

### Rust

なし。

### 手動検証手順

1. ファイルの多いフォルダで `re` などを入力 → 絞り込み確認
2. 大文字で入力しても同じ結果になることを確認
3. 絞り込み中に矢印キー・Enter → 見えている行だけが対象
4. 絞り込みで選択中の行が消える入力をする → 選択解除
5. 存在しない文字列 → "No matching items"
6. 別フォルダへ移動 → input が空に戻り全件表示
7. タブ 2 つでそれぞれ別のフィルタを入れ、切り替えて独立していることを確認
8. input 内で Esc → クリアされフォーカスが外れる

## 11. Future work

- fuzzy マッチ、ハイライト
- 再帰検索(別機能として設計する)
- `Cmd/Ctrl+F` でフィルタ input にフォーカス
