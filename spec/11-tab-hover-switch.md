# 11 — タブ D&D 拡張(ホバーでのタブ自動切替・ドラッグ継続対応)

## 1. Goal

アプリ内 D&D(spec 08)でファイル行をタブヘッダ上にホバーさせている間にそのタブへ自動的に切り替え、切替後もドラッグを継続して(切替後のタブのファイルリストやツリーへ)ドロップできるようにする。

> **設計変更の記録:** 当初は「600ms ホバーでドロップ前に切り替える」案を単純に実装したが、手動検証で「タブは切り替わるが移動が実行されない」ことが判明した。原因は、ファイルリストがアクティブな1タブ分しか描画されないため、ドラッグ中にアクティブタブを切り替えるとドラッグ元の行(ネイティブ D&D のソース DOM 要素)がその場でアンマウントされ、ブラウザ(WebKit)がドロップ完了前にドラッグセッションを無効化してしまうため。次に「ドロップ完了後にタブを切り替える」方式へ変更したが、これはユーザーの想定する UX(切り替えた上でさらにドラッグを続け、切替後のタブ内の任意の場所へドロップしたい)を満たさなかった。**最終的に、ドラッグ中はドラッグ元タブの `FileList` を非表示のまま DOM に残し続けるアーキテクチャに変更し、切替そのものはドロップ前のホバーで行えるようにした。**非表示化は当初 `display:none` を想定したが、レビューで「`display:none` もドラッグセッションを切る既知のリスクがある」と指摘され、`visibility:hidden`(+ サイズ0)に変更した(手動検証済み: この方式ではドラッグは切れない)。また、切替後のペインへドロップした際「フォルダの行以外(リスト背景)へのドロップが無反応」という手動検証結果を受け、リスト背景へのドロップで「現在表示中のディレクトリへ移動」する挙動を追加した(§4 参照)。

## 2. Non-goals

- ツリーノードのホバー自動展開(spring-loaded folders。別 Future work)
- 修飾キーによるコピー動作(08 Non-goals のまま)
- OS との D&D(09 / 10。09 は回帰により保留、10 はロードマップ外)
- 3つ以上のタブを同時に裏で保持する一般化(裏で保持するのは常にドラッグ元タブ1つのみ。経由しただけの中間タブは保持しない)

## 3. Prerequisites

- 依存する spec: 08(完了済み)
- 前提とする既存ファイルと、その現在の責務:
  - `src/lib/dnd.ts` — `DRAG_TYPE`, `acceptsVoyagerDrag(e)`, `readVoyagerPath(e)`, `startVoyagerDrag(e, path)`, `createDragOverTarget(accepts)`
  - `src/components/TabBar.tsx` — `TabItem` の `dropTarget` によるハイライトと、ドロップ時の `props.onDropMove(source, tab.currentPath)` 呼び出し
  - `src/store/explorer.ts`:
    - `activateTab(id)` — 同期的に `state.activeTabId` を更新
    - `moveIntoFolder(source, targetDir)` — 呼び出し時点の `state.activeTabId` のタブを移動後にリロードする
    - `visibleEntries` — アクティブタブの `filterEntries(entries, filterQuery)` 結果を返す `createMemo`(アクティブタブ専用。他タブ向けには使えない)
  - `src/store/tabs.ts` — `basename(path)`, `nextActiveTabId(...)` などタブ関連の純粋関数群。併置テスト `tabs.test.ts`
  - `src/lib/filterEntries.ts` — `filterEntries(entries, query)`(純粋関数。任意のタブのエントリに使える)
  - `src/App.tsx` — アクティブタブの `FileList` を1つだけ描画している(本 spec の改修対象)

## 4. UI/UX behavior

- Given: ファイル行をドラッグ中 / When: 非アクティブなタブヘッダ上に 600ms 以上ホバーし続ける / Then: そのタブが自動的にアクティブになる。ドラッグは中断されず継続し、切替後のタブのファイルリストの行・タブヘッダ・サイドバーのツリーノードへそのままドロップできる
- Given: ファイル行をドラッグ中 / When: 600ms 未満で非アクティブなタブヘッダへドロップする(素早いドロップ) / Then: ドロップと同時にそのタブへ切り替え、`move_entry` を実行してリロードする(切替とドロップが同時に成立する)
- Given: ファイル行をドラッグ中でタブが切り替わった状態 / When: ドラッグ元だったタブの `FileList` はどうなるか / Then: 非表示(`visibility: hidden` + サイズ0)のまま DOM に残り続け、ユーザーからは見えない・操作もできない。ドラッグが終了(ドロップ成立または Esc 等でキャンセル)すると同時に破棄され、通常通りアクティブタブ1つだけの描画に戻る
- Given: ファイル行をドラッグ中 / When: 既にアクティブなタブヘッダ上でホバー・ドロップ / Then: 08 通り(切替不要のため何もしない)
- Given: ドラッグ中に複数タブを行き来する / When: タブ1(ドラッグ元)→タブ2→タブ3 と切り替わる / Then: 裏で保持されるのは常に「タブ1(ドラッグ元)」と「現在アクティブなタブ」の最大2つのみ。経由しただけのタブ2は保持されない
- Given: ファイル行をドラッグ中(切替の有無を問わない) / When: ファイルリストの背景(フォルダ行以外の何もない部分)へドロップする / Then: そのタブが現在表示しているディレクトリ自体へ `move_entry` される(タブヘッダへのドロップと同じ効果)。フォルダ行へのドロップはそのフォルダへ、背景へのドロップは現在のディレクトリへ、と使い分けられる

## 5. State & data model

```ts
// src/lib/dnd.ts に追加
export const isDragActive: () => boolean;
// startVoyagerDrag 呼び出し時(dragstart)に true になり、document 全体の
// dragend/drop で false に戻る(モジュールスコープで一度だけ購読する)。
```

```ts
// src/store/tabs.ts に追加(純粋関数)
export function renderedTabIds(
  activeTabId: number,
  dragOriginTabId: number | null,
): number[];
// dragOriginTabId が null、またはアクティブと同じなら [activeTabId] のみ。
// それ以外は [dragOriginTabId, activeTabId](ドラッグ元を裏で保持するため)。
```

```ts
// src/App.tsx にローカル signal を追加
const [dragOriginTabId, setDragOriginTabId] = createSignal<number | null>(null);
// isDragActive() を監視する effect: true になった瞬間の activeTabId を
// (untrack で)一度だけ記録し、false に戻ったら null に戻す。
```

## 6. Backend commands

なし。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/dnd.ts` | 変更 | `isDragActive` signal を追加。`startVoyagerDrag` 内で true に設定。モジュールスコープで `document` の `dragend`/`drop` を購読し false に戻す |
| `src/store/tabs.ts` | 変更 | `renderedTabIds(activeTabId, dragOriginTabId)` 純粋関数を追加 |
| `src/store/tabs.test.ts` | 変更 | `renderedTabIds` のテストケース追加 |
| `src/App.tsx` | 変更 | `dragOriginTabId` signal と、`isDragActive()` を監視する `createEffect` を追加。content 領域を `renderedTabIds()` に基づく `<For>` へ再構成し、非表示になるタブ分は `.file-pane.hidden` のラッパーで包んで描画する。各タブの `entries` はアクティブタブなら `explorer.visibleEntries()`、非アクティブ(裏で保持中)なら `filterEntries(tab.entries, tab.filterQuery)` を直接使う。`editing` は非アクティブなタブには渡さない(常に `null`)。`FileList` に新規 `currentPath` prop を渡す |
| `src/App.css` | 変更 | `.file-pane`(表示中は `flex:1` 等、従来 `FileList` が直接子だった時と同じ flex/scroll 設定を担う)と、非表示化用の `.file-pane.hidden`(`visibility:hidden` + サイズ0。`display:none` はネイティブドラッグを切るリスクがあるため使わない) |
| `src/components/TabBar.tsx` | 変更 | `TabItem` に 600ms ホバー切替タイマーを追加(`dnd.ts` の変更により、ドロップ前の切替が安全になったため)。`onDrop` でも従来通り、切替が済んでいなければ同期的に切替 → 移動を行う |
| `src/components/FileList.tsx` | 変更 | 新規 `currentPath: string` prop を追加。ルートコンテナ自身に `createDragOverTarget(acceptsVoyagerDrag)` を追加し、`e.target === e.currentTarget` で「行そのものではなく背景への drag」であることを判定した上で `onDropMove(source, props.currentPath)` を呼ぶ。行の drop 処理(`FileItem.tsx`)には触れない(バブリングしてきたイベントは target 判定で無視されるため) |
| `src/components/FileList.module.css` | 変更 | `.dropTarget`(`--drop-bg`。背景ドロップのハイライト) |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| ホバー中に元のタブ(ドラッグ元)へ戻る | `dragOriginTabId === activeTabId` に戻るため、`renderedTabIds` は `[activeTabId]` のみとなり、通常の単一描画に戻る(ドラッグ元は最初から維持されているため問題なし) |
| ホバー中にさらに別のタブへ移動する | `renderedTabIds` は常に `[ドラッグ元, 現在のアクティブ]` の最大2つ。経由しただけの中間タブの `FileList` はその時点で破棄される |
| 非表示の `FileList` を操作しようとする | `visibility:hidden` + サイズ0のため不可視・不可操作(想定通り。ポインタイベントも実質的に到達しない) |
| ファイルリストの背景へのドロップと、フォルダ行へのドロップが同時に発生しないか | `FileList` 側は `e.target === e.currentTarget` でのみ反応するため、行の `onDrop`(バブリングでコンテナにも届く)とは排他的に扱われる。二重に `move_entry` が呼ばれることはない |
| 複数のタブを素早く連続でホバーして通過(目的地はさらに奥) | TabBar 側のホバータイマーは経由した各タブで一旦開始されるが、`dragleave` でキャンセルされる。最終的に 600ms 静止したタブでのみ切替が起こる |
| ドラッグが Esc 等でキャンセルされる | `document` の `dragend` で `isDragActive` が `false` に戻り、`dragOriginTabId` もクリアされて非表示タブが片付く |
| ホバー後すぐ(600ms 未満)にドロップ | 切替とドロップが同時に成立する(edge case ではなく正規の挙動。UI/UX behavior 参照) |
| 既存のファイル行→フォルダ行、行→ツリーノードの D&D | 変更なし(回帰させない) |
| ドラッグ元タブへホバーで一旦戻したのち `Cmd+W` でそのタブを閉じ、さらに別タブへホバーする(既知の限定的な未対応ケース) | `dragOriginTabId` は閉じられたタブの id を保持し続けたままになり、該当ペインが `explorer.activeTab()` へのフォールバックで別タブの内容に差し替わる。これは同一 `<For>` item の `entries` prop が丸ごと入れ替わることを意味し、ドラッグ元行の DOM が結果的にアンマウントされる(= 本 spec が回避しようとした問題が再発する)。発生には「ホバーでドラッグ元タブへ戻す」→「そのタブを `Cmd+W` で閉じる」という意図的な操作が必要なため未対応のまま許容する |

## 9. Acceptance criteria

- [x] ファイル行を非アクティブなタブへ 600ms 以上ホバーすると、そのタブに切り替わり、ドラッグは継続する
- [x] 切替後、そのタブのファイルリストの行やサイドバーのツリーノードへそのままドロップして移動できる
- [x] ホバー 600ms 未満の素早いドロップでも、そのタブへ切り替わった上で移動が反映される
- [x] ドラッグ元タブの内容は切替後も裏で保持され続け、ドラッグ終了時に正しく片付く(表示や操作に影響を残さない)
- [x] ファイルリストの背景(フォルダ行以外)へドロップすると、現在表示中のディレクトリへ移動する
- [x] フォルダ行へのドロップと背景へのドロップが二重に発火しない
- [x] 既存のファイル行→フォルダ行、行→ツリーノードの D&D に回帰がない
- [x] `renderedTabIds` の Vitest が通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

`src/store/tabs.test.ts` に `renderedTabIds` のケースを追加:

- `dragOriginTabId` が `null` → `[activeTabId]`
- `dragOriginTabId === activeTabId` → `[activeTabId]`(重複させない)
- `dragOriginTabId !== activeTabId` → `[dragOriginTabId, activeTabId]`(この順序)

### Rust

なし。

### 手動検証手順

1. タブを2つ用意し、それぞれ異なるディレクトリを開く
2. タブ1のファイルをタブ2のヘッダへドラッグし、600ms 以上ホバー → タブ2に自動的に切り替わることを確認。ドラッグを継続し、タブ2のファイルリスト内のフォルダ行、またはサイドバーの別ツリーノードへドロップ → 移動が成功することを確認
3. 別のファイルを素早く(600ms 未満で)タブ2のヘッダへドロップ → タブ2に切り替わった上で移動が反映されることを確認
4. ドラッグ中にタブ1(ドラッグ元)へ戻す・さらに別のタブへ移動する、を試し、表示が正しく追従すること・エラーが出ないことを確認
5. ドラッグ中に Esc でキャンセル → 隠れていたタブの内容が正しく片付き、以後の通常操作(タブ切替・ファイル操作)に影響しないことを確認
6. 別のファイルをタブ2のフォルダ行以外(リスト背景)へドロップ → タブ2が表示中のディレクトリへ移動することを確認。フォルダ行へのドロップと使い分けて、二重に実行されないことも確認
7. 従来の行→フォルダ行、行→ツリーノードの D&D 回帰確認
8. 上記操作を何度か繰り返し、タブや DOM がゴースト表示のまま残るなどの不整合がないか確認

## 11. Future work

- ツリーノードの spring-loaded 自動展開(同様のホバー遅延パターンを流用可能)
- ドラッグ元タブ以外(経由した中間タブ)も含めた複数プレビュー保持
