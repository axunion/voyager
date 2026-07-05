# 02 — Tabs(マルチタブ化)

## 1. Goal

エクスプローラーを複数タブ対応にする。各タブは独立した `currentPath` / `entries` / `history` / `selectedPath` を持つ。ストアのリファクタ(マイルストーン A)と TabBar UI の追加(マイルストーン B)の 2 段階で構成する。

この spec は大きいため、**A と B を別セッションで実装してよい**。A 単体でも全既存機能が green であることが完了条件。

## 2. Non-goals

- タブ状態の永続化(再起動でタブは消えてよい)
- タブの並べ替え(ドラッグ含む)
- 中クリックでのタブクローズ
- タブごとのエラーバナー(エラーはグローバルのまま 1 本)
- タブへのファイルドロップ(spec 08)

## 3. Prerequisites

- 依存する spec: 01(open 挙動が確定していること。厳密な依存はないが実装順として先)
- 前提とする既存ファイル:
  - `src/store/explorer.ts` — 単一状態のシングルトン facade。メソッド: `init / navigateTo / goBack / goForward / select / moveIntoFolder / trashEntry / setError / clearError / canGoBack / canGoForward`。内部に `loadSeq` トークン、`load()`、`mutateAndReload()` ヘルパー
  - `src/store/history.ts` — 純粋な履歴モジュール(`History` 型、`emptyHistory / pushPath / stepBack / stepForward`)。**変更しない**
  - `src/App.tsx` — 唯一の配線ポイント。`explorer.state.currentPath` 等を参照
  - `src/components/Toolbar.tsx` / `FileList.tsx` / `FileItem.tsx` — dumb components

## 4. UI/UX behavior

### マイルストーン A(ストアのみ、UI 変更なし)

- ユーザーから見える挙動は一切変わらない。全既存機能(ナビゲート、履歴、選択、D&D 移動、ゴミ箱)がそのまま動く。

### マイルストーン B(TabBar)

- Given: 起動直後 / Then: タブが 1 つ(ホームディレクトリ)。タブバーは常時表示
- タブのラベルは `currentPath` の basename(ルート `/` の場合は `/`)。`title` 属性にフルパス
- Given: タブバー / When: `+` ボタンをクリック / Then: アクティブタブと同じパスの新タブが末尾に追加され、アクティブになる
- Given: タブが 2 つ以上 / When: タブの `×` をクリック / Then: そのタブが閉じる。アクティブタブを閉じた場合、右隣(なければ左隣)のタブがアクティブになる
- Given: タブが 1 つ / Then: `×` は表示しない(最後のタブは閉じられない)
- When: 非アクティブタブをクリック / Then: そのタブがアクティブになり、保持していたパス・一覧・選択・履歴がそのまま表示される(再ロードしない)
- キーボード: `Cmd/Ctrl+T` = 新規タブ、`Cmd/Ctrl+W` = アクティブタブを閉じる(タブが 1 つのときは何もしない)。`App.tsx` で window レベルの keydown を登録
- タブクリックは切り替えのみ。`×` クリックはタブ切り替えを引き起こさない(`stopPropagation`)

## 5. State & data model

`src/store/explorer.ts` を以下の形にリファクタする:

```ts
interface TabState {
  id: number; // monotonic counter; stable <For> key
  currentPath: string;
  entries: Entry[];
  history: History;
  selectedPath: string | null;
  loading: boolean;
}

interface ExplorerState {
  tabs: TabState[];
  activeTabId: number;
  error: string | null; // stays global: one banner regardless of which tab errored
}
```

設計判断(実装時に変更しない):

- **`activeTabId` は id であって index ではない**。クローズ時にも参照が安定し、`<For>` のキーにもそのまま使える。id はモジュールレベルの単調増加カウンタ `let nextTabId = 1` で採番する
- **`loadSeq` はモジュールレベルの `Map<number, number>`(tab id → seq)に変更**。リアクティブである必要のない bookkeeping はストアに入れない。`closeTab` でエントリを削除する
- facade に導出アクセサ `activeTab(): TabState` を追加する。`state.tabs.find((t) => t.id === state.activeTabId)` を返す(必ず存在する不変条件を維持する)
- 既存メソッド `navigateTo / goBack / goForward / select / moveIntoFolder / trashEntry / canGoBack / canGoForward` は**シグネチャ不変**のまま、アクティブタブに対して動作するよう書き換える
- 新メソッド: `addTab(): void`(アクティブタブのパスを複製して追加+アクティブ化)、`closeTab(id: number): void`、`activateTab(id: number): void`
- `init()` はタブ 1 つ(`homeDir()`)を作る
- `mutateAndReload` は**アクティブタブのみ**リロードする。同じディレクトリを表示している他タブは stale になる(そのタブを再訪するまで古い一覧のまま)。これは既知の制限であり、修正しない

タブ配列操作の純粋ロジックは `src/store/tabs.ts` に抽出する(`history.ts` 方式):

```ts
// src/store/tabs.ts — pure helpers, unit-tested
export function nextActiveTabId(
  tabs: { id: number }[],
  closingId: number,
  activeId: number,
): number;
// closing a non-active tab → activeId unchanged
// closing the active tab → the tab to its right, else the one to its left

export function basename(path: string): string;
// "/Users/foo" → "foo", "/" → "/", trailing slash tolerated
```

(関数の分割粒度は実装時に調整してよいが、「クローズ後のアクティブ決定」と「ラベル導出」が純関数としてテスト可能であることは必須)

## 6. Backend commands

なし。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/store/explorer.ts` | 変更 (A) | 上記 `ExplorerState` へリファクタ。facade API 互換維持 + `activeTab / addTab / closeTab / activateTab` 追加 |
| `src/store/tabs.ts` | 新規 (A) | 純粋ヘルパー(`nextActiveTabId`, `basename`) |
| `src/store/tabs.test.ts` | 新規 (A) | 上記のテスト |
| `src/App.tsx` | 変更 (A/B) | A: `explorer.state.X` 参照を `explorer.activeTab().X` に置換。B: `<TabBar>` を Toolbar の上に配置、Cmd/Ctrl+T/W の keydown 登録(`onMount`/`onCleanup`) |
| `src/components/TabBar.tsx` | 新規 (B) | dumb component。props: `tabs: { id: number; label: string; fullPath: string }[]`, `activeTabId`, `onActivate(id)`, `onClose(id)`, `onAdd()` |
| `src/components/TabBar.module.css` | 新規 (B) | タブバーのスタイル。色はカスタムプロパティのみ。高さは Toolbar と揃える |

**変更しないファイル(受け入れ条件)**: `src/components/Toolbar.tsx` / `FileList.tsx` / `FileItem.tsx` の props と実装は一切変更しない。`src/store/history.ts` も変更しない。

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| アクティブタブを閉じる | 右隣、なければ左隣がアクティブに(`nextActiveTabId` の仕様) |
| 最後の 1 タブ | `×` 非表示。`Cmd/Ctrl+W` も no-op |
| タブ A でロード中にタブ B へ切り替え、A のロードが完了 | A の `loadSeq` ガードにより A のタブ状態にだけコミットされる。B の表示は影響を受けない |
| ロード中のタブを閉じる | `Map` から seq エントリを削除。遅れて resolve したロードはコミット先タブが無いため何もしない(実装時にガードすること) |
| 複数タブが同一ディレクトリを表示中に片方でファイル操作 | 操作したタブだけリロード。他方は stale(既知の制限、Non-goal) |
| タブ多数でバーが溢れる | タブバーを `overflow-x: auto`(スクロール)。ラベルは `max-width` + ellipsis |

## 9. Acceptance criteria

- [ ] (A) ストアリファクタ後、UI 無変更で既存機能すべてが動く: ナビゲート / 戻る・進む / 選択 / D&D 移動 / ゴミ箱 / エラーバナー
- [ ] (A) `Toolbar.tsx` / `FileList.tsx` / `FileItem.tsx` / `history.ts` に diff がない
- [ ] (B) `+` で新規タブ(現タブのパス複製)が開きアクティブになる
- [ ] (B) タブ切り替えで各タブのパス・一覧・選択・履歴が独立して保たれている(再ロードなしで即表示)
- [ ] (B) タブごとに戻る/進む履歴が独立している
- [ ] (B) アクティブタブを閉じると右隣(なければ左隣)がアクティブになる
- [ ] (B) タブが 1 つのとき閉じられない
- [ ] (B) `Cmd/Ctrl+T` / `Cmd/Ctrl+W` が動作する

## 10. Test plan

### Vitest(純粋ロジックのみ)

`src/store/tabs.test.ts`:

- `nextActiveTabId`: 非アクティブタブを閉じる→アクティブ不変 / アクティブ(中間)を閉じる→右隣 / アクティブ(末尾)を閉じる→左隣
- `basename`: 通常パス / ルート `/` / 末尾スラッシュ

### Rust

なし。

### 手動検証手順

1. 起動 → ホームのタブが 1 つ、`×` なし
2. `+` で新タブ → 同パスで開きアクティブ化
3. タブ 1 で `~/Documents` へ、タブ 2 で `~/Downloads` へ移動 → 切り替えても各タブのパス・スクロール前の一覧・選択が保持されている
4. タブ 1 で戻る → タブ 1 の履歴だけが動き、タブ 2 は不変
5. タブ 2 をアクティブにして `×` → タブ 1 がアクティブに
6. `Cmd/Ctrl+T` → 新タブ。`Cmd/Ctrl+W` → クローズ。1 タブで `Cmd/Ctrl+W` → 無反応
7. D&D 移動・ゴミ箱・エラーバナー(存在しないパスへの遷移等)が従来どおり動く

## 11. Future work

- タブ状態の永続化(セッション復元)
- タブの並べ替え
- 中クリッククローズ
- ファイル操作時に同一ディレクトリを表示中の他タブも再読込する
