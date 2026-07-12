# 17 — Shortcuts & refresh(ショートカット拡充 + 手動リフレッシュ)

## 1. Goal

モダンなファイラーで期待される残りのキーボードショートカット(F2 / Cmd+Shift+N / Cmd+↑ / Cmd+F / Cmd+R / Cmd+1..9 / Ctrl+Tab / Home / End / PageUp / PageDown)を一括で追加し、あわせて手動リフレッシュ(`explorer.refresh()` — フィルタ・ソート・選択を保持した再読込)を導入する。グローバルショートカットの判定はテスト可能な純関数に抽出する。

## 2. Non-goals

- キーバインドのカスタマイズ・設定 UI(固定バインドのみ。設定の永続化はプロジェクト方針として対象外)
- ファイルシステム監視による自動リフレッシュ(手動のみ。watcher は常駐コスト・実装コストが大きい)
- 型先行ジャンプ(type-ahead。文字キーで行へジャンプ)
- 再帰検索(Cmd+F はあくまで既存の表示中リスト絞り込みフィルタへのフォーカス。サブディレクトリ検索は対象外)
- ズーム・フォントサイズ変更
- アプリメニュー(ネイティブメニューバー)への登録
- ツリービューのキーボード操作

## 3. Prerequisites

- 依存する spec: 13, 15(完了済みであること — refresh がソート・選択を保持するため両者の状態モデルが先に必要。Shift 付き移動キーは 15 の `rangeSelect` を使う)。14 完了済みなら `Cmd+Shift+.` も本 spec の純関数に統合する
- 前提とする既存ファイル:
  - `src/App.tsx` — グローバル keydown(現在 Mod+T / Mod+W / Alt+←→、14 完了時は Mod+Shift+. も)。ここを純関数 + switch に置き換える
  - `src/components/FileList.tsx` — リストローカルの keydown(矢印 / Enter / Delete、15 で Cmd+A / Shift+矢印 / Escape)。インライン編集入力は keydown を `stopPropagation` 済み
  - `src/lib/listNav.ts` — `entryAfterMove(entries, path, delta)`(±1 で使用中。クランプ挙動を任意 delta に一般化する)
  - `src/lib/pathSegments.ts` — パス分割(親パス算出のヘルパー追加先)
  - `src/store/explorer.ts` — `load()` と `loadSeq`。`load()` はフィルタ・選択をリセットする(この契約は不変。refresh は**別経路**)
  - `src/components/Toolbar.tsx` — フィルタ入力(Cmd+F のフォーカス先)

## 4. UI/UX behavior

バインド表。「Mod」= `metaKey || ctrlKey`(既存イディオムを維持。macOS では Cmd、Linux では Ctrl)。「入力中抑止」= フォーカスが `<input>` / `<textarea>` にあるとき発火しない:

| バインド | アクション | ハンドラ位置 | 入力中 |
| --- | --- | --- | --- |
| Mod+T / Mod+W | 新規タブ / タブを閉じる(既存) | App.tsx グローバル | 発火する |
| Alt+← / Alt+→ | 戻る / 進む(既存) | App.tsx グローバル | 発火する |
| Mod+Shift+.(14 導入済み) | 隠しファイルトグル | App.tsx グローバル | 発火する |
| Mod+1..8 | n 番目のタブへ | App.tsx グローバル | 発火する |
| Mod+9 | 末尾のタブへ(ブラウザ慣習) | App.tsx グローバル | 発火する |
| Ctrl+Tab / Ctrl+Shift+Tab | 次 / 前のタブへ(循環。両 OS とも Ctrl) | App.tsx グローバル | 発火する |
| Mod+R | `refresh()`(**`preventDefault()` 必須** — 怠ると webview 自体がリロードされ、永続化ゼロ方針ゆえ全タブ・全状態が消える) | App.tsx グローバル | 発火する |
| Mod+Shift+N | アクティブタブで New Folder(ファントム行) | App.tsx グローバル | **抑止** |
| Mod+↑ | 親ディレクトリへ | App.tsx グローバル | **抑止** |
| Mod+F | フィルタ入力へフォーカス | App.tsx グローバル | 発火する(冪等) |
| F2 | 選択がちょうど 1 件のときその行の Rename 開始(メニューと同じ条件) | FileList keydown | 自然にスコープ(リストフォーカス時のみ) |
| Home / End | cursor を先頭 / 末尾の可視エントリへ(置換選択) | FileList keydown | 同上 |
| PageUp / PageDown | cursor を `floor(コンテナ高 / 28)` 行ぶん移動(置換選択) | FileList keydown | 同上 |
| Shift + Home/End/PageUp/PageDown | 上記移動 + anchor からの範囲選択(15 の規則) | FileList keydown | 同上 |

- refresh の挙動: アクティブタブの `currentPath` を再読込。**履歴に積まない**。`filterQuery` / `sortKey` / `sortDir` は保持。`selectedPaths` / anchor / cursor は新しいエントリ集合と交差(消えた行は選択から外れる)。失敗時は従来の `load()` 同様、現状維持 + バナー
- Home/End/PageUp/PageDown は移動後の cursor 行までスクロール(既存の `scrollIntoView` 経路)

## 5. State & data model

新規純モジュール `src/lib/shortcuts.ts`(+ colocated テスト)。既存のグローバルバインド(Mod+T/W、Alt+←→、Mod+Shift+.)も**この関数に移設**し、`App.tsx` の keydown は「変換 → switch → 実行」だけにする:

```ts
export type GlobalShortcutAction =
  | { type: "new-tab" }
  | { type: "close-tab" }
  | { type: "back" }
  | { type: "forward" }
  | { type: "toggle-hidden" }
  | { type: "activate-tab"; index: number } // 0-based; Mod+9 → { index: -1 } = last
  | { type: "next-tab" }
  | { type: "prev-tab" }
  | { type: "refresh" }
  | { type: "new-folder" }
  | { type: "parent-dir" }
  | { type: "focus-filter" };

export interface ShortcutInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  targetIsTextInput: boolean; // e.target is <input> or <textarea>
}

// Pure mapping of the binding table above. Returns null when nothing matches
// (including suppressed-while-typing cases).
export function matchGlobalShortcut(
  e: ShortcutInput,
): GlobalShortcutAction | null;
```

`src/lib/pathSegments.ts` に追加:

```ts
// "/a/b/c" → "/a/b", "/a" → "/", "/" → null (already at root). POSIX only.
export function parentPath(path: string): string | null;
```

`src/lib/listNav.ts` — `entryAfterMove` の `delta` を任意整数に一般化(端でクランプ。±1 の既存挙動は不変)。

`src/store/explorer.ts` の facade に追加:

```ts
// Reloads the active tab's currentPath WITHOUT pushing history and WITHOUT
// the load() resets: filterQuery/sortKey/sortDir are kept, selection is
// intersected with the fresh entries. Guarded by the same per-tab loadSeq.
// On failure: keep everything, show the banner (same as load()).
refresh(): Promise<void>;
```

`load()` 自体の契約(フィルタ・選択リセット、ソート保持)は変更しない。refresh は `load()` を呼ばず、`loadSeq` を共有する別の内部関数として実装する。

Mod+F の配線(dumb 規約維持): `Toolbar` に `onFilterInputRef(el: HTMLInputElement): void` prop を追加し、`App.tsx` が要素を保持して `.focus()` を呼ぶ。

## 6. Backend commands

なし(フロントのみ)。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/shortcuts.ts` / `shortcuts.test.ts` | 新規 | `matchGlobalShortcut` + バインド表全網羅テスト |
| `src/lib/pathSegments.ts` / `pathSegments.test.ts` | 変更 | `parentPath` 追加 + テスト |
| `src/lib/listNav.ts` / `listNav.test.ts` | 変更 | `entryAfterMove` の任意 delta クランプ + テスト |
| `src/store/explorer.ts` | 変更 | `refresh()` 追加(`loadSeq` 共有の別経路) |
| `src/App.tsx` | 変更 | keydown を `matchGlobalShortcut` + switch に置換、全アクション配線、`onFilterInputRef` 保持 |
| `src/components/Toolbar.tsx` | 変更 | `onFilterInputRef` prop |
| `src/components/FileList.tsx` | 変更 | F2 / Home / End / PageUp / PageDown(+Shift)ハンドラ |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| Mod+R をフィルタ入力フォーカス中に押す | refresh が発火し、**webview はリロードされない**(preventDefault) |
| refresh 中に対象を選択していて、外部でそのファイルが消えていた | 選択から外れる(交差)。エラーにはならない |
| refresh がエラー(ディレクトリが消えた等) | 現状維持 + バナー(`load()` の失敗時と同じ) |
| Mod+5 でタブが 3 つしかない | no-op |
| Ctrl+Tab がタブ 1 つ | no-op(循環しても同じタブ) |
| Mod+↑ がルート `/` | no-op(`parentPath` が null) |
| Mod+Shift+N がリネーム編集中 | 入力フォーカス中のため抑止 |
| PageDown が残り行数より大きい | 末尾でクランプ(`entryAfterMove` の一般化) |
| F2 で選択 0 件・複数件 | no-op(メニューの Rename と同じ「ちょうど 1 件」規則) |
| Kobalte メニュー表示中の Home/End 等 | 既存の `menuOpen` ガードで抑止(矢印キーと同じ扱い) |
| インライン編集中の Home/End | 編集 input の `stopPropagation` によりテキストカーソル操作のまま |

## 9. Acceptance criteria

- [ ] バインド表の全項目が表どおりに動く(入力中抑止の列を含む)
- [ ] Mod+R でリストが再読込され、フィルタ・ソート・選択が保持される。履歴も増えない(戻るボタンの状態が不変)
- [ ] Mod+R で webview がリロードされない(タブ構成が保たれることで確認)
- [ ] Mod+1..9 / Ctrl+Tab のタブ切替が循環含め動く
- [ ] Mod+↑ で親へ移動し、履歴で戻れる(`navigateTo` 経由)
- [ ] Mod+F でフィルタ入力にフォーカスが移る
- [ ] `pnpm check` / `pnpm test` が通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

- `shortcuts.test.ts`: バインド表の各行(マッチする組合せ / Mod なしではマッチしない / 入力中抑止の 2 項目が `targetIsTextInput: true` で null / Mod+9 → `{ index: -1 }` / Ctrl+Shift+Tab → prev-tab / 無関係キーは null)
- `pathSegments.test.ts`: `parentPath` の通常 / 1 階層 / ルート → null / 末尾スラッシュ
- `listNav.test.ts`: 大きな delta のクランプ(先頭・末尾)/ 既存 ±1 挙動の不変

### Rust

なし。

### 手動検証手順

1. タブを 3 つ開き Mod+1 / Mod+3 / Mod+9 / Ctrl+Tab / Ctrl+Shift+Tab で切替(循環含む)
2. フィルタとソートを設定し行を選択 → Mod+R → 一覧が再読込され、フィルタ・ソート・選択・戻るボタンの状態がすべて保持
3. ターミナルで表示中ディレクトリにファイルを追加 → Mod+R → 現れる
4. フィルタ入力にフォーカスしたまま Mod+R → アプリが初期化されない(タブが保たれる)
5. Mod+↑ で親へ → Alt+← で戻れる
6. Mod+F → フィルタにフォーカス。Mod+Shift+N → ファントム行(リネーム編集中は無反応)
7. 行を 1 件選択して F2 → リネーム開始。複数選択で F2 → 無反応
8. 長いディレクトリで Home / End / PageUp / PageDown、Shift 付きで範囲が広がる

## 11. Future work

- ファイルシステム監視による自動リフレッシュ
- 型先行ジャンプ(type-ahead)
- キーバインドのヘルプオーバーレイ(Cmd+/ 等)
- ネイティブメニューバーへの登録(OS 標準の見た目でのショートカット表示)
