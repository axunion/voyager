# 13 — Sort columns(カラムヘッダによるソート切替)

## 1. Goal

spec 12 で追加した静的なカラムヘッダをクリック可能にし、名前・サイズ・更新日時によるタブごとのソート切り替え(昇順/降順)を実現する。

## 2. Non-goals

- ソート状態の永続化(プロジェクト方針: 設定は一切ディスクに残さない。セッション内・タブ内のみ)
- 種類(拡張子)・作成日時など追加ソートキー
- dirs-first の解除オプション(ディレクトリ先頭は全キーで不変)
- ツリービューのソート変更(ツリーは Rust の既定順のまま)
- ソートメニュー UI(ヘッダクリックのみ。ツールバーやコンテキストメニューには追加しない)

## 3. Prerequisites

- 依存する spec: 12(完了済みであること — `sortEntries.ts`、ヘッダ行、正規導出パイプラインが存在する)
- 前提とする既存ファイル:
  - `src/lib/sortEntries.ts` — `sortEntries(entries, key, dir)` / `SortKey` / `SortDir`(spec 12 で作成済み。本 spec でロジック変更なし)
  - `src/store/explorer.ts` — `TabState` と facade。`load()` は `filterQuery` をリセットするが、本 spec で追加するソートは**リセットしない**
  - `src/App.tsx` — 正規導出パイプライン `sortEntries → filterEntries` の引数をタブ状態に差し替える
  - `src/components/FileList.tsx` — spec 12 の静的ヘッダ行

## 4. UI/UX behavior

操作マトリクス:

| 操作 | 現在の状態 | 結果 |
| --- | --- | --- |
| ヘッダ「Name」クリック | name 以外でソート中 | name / asc に切替 |
| ヘッダ「Name」クリック | name でソート中 | asc ⇄ desc トグル |
| ヘッダ「Size」クリック | size 以外でソート中 | size / **desc** に切替(大きい順が既定) |
| ヘッダ「Size」クリック | size でソート中 | desc ⇄ asc トグル |
| ヘッダ「Modified」クリック | mtime 以外でソート中 | mtime / **desc** に切替(新しい順が既定) |
| ヘッダ「Modified」クリック | mtime でソート中 | desc ⇄ asc トグル |

- アクティブなソートキーのヘッダに方向インジケータ(lucide `chevron-up` / `chevron-down`、size 12)を表示。他のヘッダには何も出さない
- ヘッダセルには `aria-sort="ascending" | "descending"`(アクティブキーのみ)を付与し、`<button>` として実装(キーボード到達可能)
- Given: ソートを変更した状態で別ディレクトリへ移動 / Then: ソートは維持される(`load()` はソートをリセットしない — `filterQuery` と対照的な契約であることに注意)
- Given: ソートを変更した状態で新規タブを作成 / Then: 新規タブは作成元タブのソートを継承する(`addTab()` が `currentPath` を継承するのと同じ扱い)
- ソートはタブごとに独立(タブ A を size 順にしてもタブ B は変わらない)
- ソート変更は即時にフロントで再ソート(IPC なし・リロードなし)。選択・フィルタ・編集状態はそのまま維持される

## 5. State & data model

`src/store/explorer.ts` の `TabState` に追加:

```ts
import type { SortDir, SortKey } from "../lib/sortEntries";

interface TabState {
  // ...existing fields...
  sortKey: SortKey; // NOT reset by load(); inherited by addTab()
  sortDir: SortDir;
}
```

- `makeTab()` の既定値: `sortKey: "name"`, `sortDir: "asc"`。`addTab()` は作成元タブの `sortKey` / `sortDir` を新タブにコピーする
- facade に追加:

```ts
// Applies the header-click rules: same key toggles direction, a new key
// switches to it with its default direction (name: asc, size/mtime: desc).
setSort(key: SortKey): void;
```

- クリック規則(同一キー=トグル / 新キー=既定方向)は純関数として `src/lib/sortEntries.ts` に追加し、facade はそれを呼ぶだけにする:

```ts
// src/lib/sortEntries.ts に追加
export function nextSort(
  current: { key: SortKey; dir: SortDir },
  clicked: SortKey,
): { key: SortKey; dir: SortDir };
```

- `App.tsx` のパイプラインを `sortEntries(tab().entries, tab().sortKey, tab().sortDir)` に差し替える

## 6. Backend commands

なし(フロントのみ)。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/sortEntries.ts` / `sortEntries.test.ts` | 変更 | `nextSort` 追加 + テスト |
| `src/store/explorer.ts` | 変更 | `TabState.sortKey / sortDir` + `setSort`。`makeTab` 既定値、`addTab` の継承。`load()` は触らない(ソート非リセットの確認のみ) |
| `src/components/FileList.tsx` | 変更 | ヘッダセルを button 化、`sortKey / sortDir / onSort` props 追加、インジケータと `aria-sort` |
| `src/components/FileList.module.css` | 変更 | ヘッダ button のスタイル(トークンのみ、既存ヘッダ見た目を維持) |
| `src/App.tsx` | 変更 | パイプラインにタブのソート状態を配線、`onSort` を `explorer.setSort` に接続 |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| ソート変更時に行を選択中 | 選択は維持され、行が新しい位置に移動する(選択パスは不変のため) |
| ソート変更時にフィルタ適用中 | フィルタ結果が新しい順序で表示される(パイプライン順: sort → filter) |
| ソート変更時にリネーム/作成編集中 | 編集状態は維持(編集はソートと無関係。ファントム行は常に末尾) |
| size ソートでディレクトリ | ディレクトリ群は名前昇順のまま先頭に固定(spec 12 の `sortEntries` 仕様) |
| `null` サイズ / `null` mtime | グループ内で常に最後(方向によらず。spec 12 の仕様) |
| タブを閉じて再作成 | ソートは既定値に戻る(セッション内でも永続化はタブの寿命まで) |

## 9. Acceptance criteria

- [ ] ヘッダクリックでソートキーが切り替わり、同一ヘッダ再クリックで方向がトグルする
- [ ] Size / Modified への切替時の初期方向が desc(大きい順・新しい順)
- [ ] アクティブキーのヘッダにのみ方向インジケータが出る
- [ ] 別ディレクトリへ移動してもソートが維持される
- [ ] タブごとにソートが独立し、新規タブは作成元の設定を継承する
- [ ] ソート変更で選択・フィルタが失われない
- [ ] `pnpm check` / `pnpm test` が通る(Rust 変更なしだが完了ゲートは全実行)

## 10. Test plan

### Vitest(純粋ロジックのみ)

`sortEntries.test.ts` に追加:

- `nextSort`: 同一キークリックで方向トグル / 新キー name → asc / 新キー size → desc / 新キー mtime → desc

(`sortEntries` 本体のケースは spec 12 で網羅済み)

### Rust

なし。

### 手動検証手順

1. Size ヘッダをクリック → ファイルが大きい順になり、ディレクトリは先頭のまま名前順
2. もう一度クリック → 小さい順(`—` のディレクトリを除くグループ内で null が最後)
3. Modified クリック → 新しい順。インジケータが Modified に移る
4. 行を選択して Name クリック → 選択が維持されたまま並びが変わる
5. フィルタ入力中にソート変更 → 絞り込み結果の順序だけが変わる
6. ソート変更後に別フォルダへ移動 → ソート維持。新規タブ作成 → 継承。既存の別タブ → 影響なし

## 11. Future work

- 種類(拡張子)ソート
- ソートメニュー(ヘッダ以外の起点)
- dirs-first 解除オプション
