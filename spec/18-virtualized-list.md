# 18 — Virtualized list(ファイルリストの仮想化)

## 1. Goal

ファイルリストの描画を可視範囲 + オーバースキャンのウィンドウイングに置き換え、数万件のディレクトリでも軽快に動作させる(「軽量」というプロジェクト目標の中核)。行高 28px 固定という既存の不変条件を前提に、**依存を追加せず**手書きで実装する。

## 2. Non-goals

- 仮想化ライブラリの導入(`@tanstack/solid-virtual` 等 — 新規 UI ライブラリ禁止の方針に反し、固定行高では過剰)
- 可変行高対応(28px 固定が前提。この不変条件は本 spec 以降も維持される)
- ツリービューの仮想化(ファイルリストのみ)
- スクロール位置の保持・復元(ナビゲートで先頭に戻る現行挙動のまま)
- 読み込みのページング/遅延取得(`read_directory` は全件返す。仮想化は描画側のみ)

## 3. Prerequisites

- 依存する spec: 12, 13, 15, 16, 17(**すべて完了済みであること** — 行マークアップ(カラム・cursor outline・cut 減光)とキーボードナビが確定してから、FileList の描画書き換えを 1 回で済ませるため)
- 前提とする既存ファイル:
  - `src/components/FileList.tsx` — スクロールコンテナ(`ContextMenu.Trigger` / listbox / 背景ドロップ先を兼ねる)。`<For>` 全件描画。cursor 行への `scrollIntoView`(17 で index 計算化の準備あり)。末尾のファントム作成行
  - `src/lib/dnd.ts` — `isDragActive()` シグナル(spec 11 のドラッグ元隠しペイン維持に使用中)
  - `src/App.tsx` — 可視エントリのパイプラインと `renderedTabIds` による隠しペイン(spec 11)。空リスト/「No matching items」は FileList の外で処理済み
  - `spec/00-conventions.md` — 28px 行高の不変条件(本 spec がその回収先)

## 4. UI/UX behavior

- 見た目・操作は**一切変わらない**ことが要件。変わるのは大量件数での性能のみ
- Given: 10,000 件のディレクトリ / When: 表示・スクロール / Then: 描画される行 DOM は「可視行数 + オーバースキャン(上下各 8 行)」のみで、スクロールが滑らか
- キーボードナビ(↑↓ / Home / End / PageUp / PageDown): cursor 行が窓外にあってもインデックス計算でスクロールし、移動先が必ず表示される
- ファントム作成行(New Folder / New File)は常にリスト末尾に実 DOM で存在し、作成開始時に末尾までスクロールする
- 選択・cut 減光・symlink バッジなど行の状態表示は、窓外へスクロールして戻っても正しく再現される(状態はすべてパス由来のため)
- **ドラッグ中(`isDragActive()`)は窓を凍結する**: スクロール・リサイズ・エントリ変化があっても描画範囲を再計算しない。窓の再計算でドラッグ中の行の DOM が消えるとネイティブドラッグセッションが解除されるため(spec 11 と同じ理由)。また、これによりドラッグ中にポインタ下の行がずれることも防ぐ

## 5. State & data model

新規純モジュール `src/lib/virtual.ts`(+ colocated テスト):

```ts
// Mirrors the 28px row-height CSS invariant (00-conventions.md).
export const ROW_HEIGHT = 28;

export interface VisibleRange {
  start: number; // first rendered index (inclusive)
  end: number; // last rendered index (exclusive)
  padTop: number; // px height of the top spacer
  padBottom: number; // px height of the bottom spacer
}

// Pure windowing math. Clamps to [0, count]. overscan is rows added on each
// side (use 8).
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  count: number,
  overscan: number,
): VisibleRange;

// Returns the scrollTop that brings row `index` fully into view with minimal
// movement (block: "nearest" semantics), or null if it is already visible.
export function ensureVisible(
  scrollTop: number,
  viewportHeight: number,
  index: number,
): number | null;
```

`FileList.tsx` の実装方針(store 変更なし):

- `scrollTop` シグナル(コンテナの `onScroll` で更新)と `viewportHeight` シグナル(コンテナへの `ResizeObserver` 1 個で更新、`onCleanup` で disconnect)
- `range = createMemo(() => visibleRange(scrollTop(), viewportHeight(), props.entries.length, 8))`。ただし `isDragActive()` が真のあいだは**直前の値を返し続ける**(凍結)
- DOM 構造(スクロールコンテナの中身のみ変更。コンテナ自体の role / ドロップ / メニューの役割は不変):

```
<div … role="listbox">            ← 既存コンテナ
  <div style={height: padTop} />   ← 上スペーサ
  <For each={entries.slice(start, end)}> <FileItem …/> </For>
  <div style={height: padBottom} />← 下スペーサ
  {ファントム作成行(既存のまま)}
</div>
```

- cursor へのスクロール: `querySelector(...).scrollIntoView` を廃止し、「可視エントリ中の cursor の index → `ensureVisible` → 非 null なら `scrollTop` 代入」に置換(17 の全移動キーがこの 1 経路に乗る)
- `aria-activedescendant`: cursor 行が描画窓内にあるときのみ設定する(窓外では該当 id の DOM が存在しないため未設定にする — ARIA 的に許容される明示的判断)
- 作成開始時(`editing.mode === "create"` になったとき)はコンテナを最下部までスクロールしてからファントム行にフォーカス(既存の `createEffect` を拡張)

## 6. Backend commands

なし(フロントのみ)。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/virtual.ts` / `virtual.test.ts` | 新規 | `ROW_HEIGHT` / `visibleRange` / `ensureVisible` + テスト |
| `src/components/FileList.tsx` | 変更 | ウィンドウイング描画(スペーサ + slice)、scroll/resize シグナル、ドラッグ中の窓凍結、cursor スクロールの index 計算化、`aria-activedescendant` の窓内条件 |
| `src/components/FileList.module.css` | 変更 | スペーサ用スタイル(必要なら)。行高 28px と既存見た目は不変 |

注: `App.tsx` と store は変更しない。触る必要が生じた場合は設計の誤りなので立ち止まって報告すること。

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| エントリ 0 件 | 従来どおり(`App.tsx` 側の分岐で FileList 自体が出ないか、空リスト。本 spec の影響なし) |
| 件数が可視行数より少ない | 全行描画、スペーサ高 0(`visibleRange` のクランプ) |
| フィルタ・ソート変更で件数/順序が急変 | `range` が memo で追随。スクロール位置が末尾を超える場合はブラウザのスクロール仕様に任せる(次のスクロールイベントで再計算) |
| 窓外の行が選択・cut 状態 | スクロールして戻ると正しく表示される(状態はパス由来) |
| ドラッグ中にスクロール・ウィンドウリサイズ | 窓は凍結され、ドラッグ中の行 DOM は消えない。ドロップ/dragend 後の再計算で追いつく |
| ドラッグ元の隠しペイン(spec 11) | 隠しペインは `visibility: hidden` でビューポート高が不定だが、窓凍結によりドラッグ開始時の描画が維持される |
| PageDown 連打で末尾へ | cursor クランプ(17)+ `ensureVisible` で末尾行が表示される |
| 窓外の cursor(例: フィルタ解除直後) | `aria-activedescendant` は未設定。次のキーボード操作でスクロールが追従する |

## 9. Acceptance criteria

- [ ] 10,000 件以上のディレクトリ(生成して用意)で初期表示・スクロールが滑らか、DOM の行数が窓 + オーバースキャンに一致する(devtools で確認)
- [ ] ↑↓ / Home / End / PageUp / PageDown で窓外への移動が正しくスクロール追従する
- [ ] 選択・cut 減光・symlink バッジが窓外往復後も正しい
- [ ] ファントム作成行が末尾に出てフォーカスされ、作成が従来どおり動く
- [ ] 行ドラッグ → タブへ 600ms ホバー → 切替先のリスト/ツリーへドロップ、が回帰していない(spec 11 のシナリオ)
- [ ] ドラッグ中のスクロールでドラッグが解除されない
- [ ] 少件数ディレクトリで見た目・操作が完全に従来どおり
- [ ] `pnpm check` / `pnpm test` が通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

- `virtual.test.ts`:
  - `visibleRange`: 先頭(scrollTop 0)/ 中間 / 末尾のクランプ / 件数 < 可視行数 / count 0 / overscan が両端で範囲外に出ない / `padTop + 窓高 + padBottom === count * ROW_HEIGHT`
  - `ensureVisible`: 窓内 → null / 上に外れている → 行頭に合う scrollTop / 下に外れている → 行末が下端に合う scrollTop / 境界ちょうど

### Rust

なし。

### 手動検証手順

1. `mkdir /tmp/many && cd /tmp/many && touch f{00001..20000}.txt` で 20,000 件を作りアプリで開く
2. 初期表示が即時で、スクロールが滑らか。devtools の Elements で行 DOM が数十件しかないことを確認
3. End → 末尾へジャンプ。Home → 先頭。PageUp/PageDown 連打で追従
4. 先頭の行を Cmd+X で cut → End で末尾へ → Home で戻る → 減光が維持されている
5. 行をドラッグしたままホイールスクロール → ドラッグが継続している(窓凍結)
6. ドラッグ → 別タブに 600ms ホバー → 切替 → 切替先のリストへドロップで移動(spec 11 回帰確認)
7. New Folder → リスト末尾までスクロールしてファントム行にフォーカス → 作成できる
8. 通常サイズのフォルダで全操作(選択・メニュー・DnD・リネーム)を一巡し、従来どおりであることを確認

## 11. Future work

- スクロール位置の保持(タブ切替・戻る/進むでの復元)
- 大規模ディレクトリの読み込みストリーミング(IPC 側のページング)
- ツリービューの仮想化
