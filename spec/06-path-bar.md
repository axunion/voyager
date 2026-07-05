# 06 — Path bar(パンくず + パス入力)

## 1. Goal

Toolbar の現在パス表示(プレーンテキスト)を、クリック可能なパンくずに置き換える。パンくずの空白部分をクリックすると編集モード(フルパスの `<input>`)に切り替わり、任意のパスへ直接ジャンプできる。

## 2. Non-goals

- Windows パス(ドライブレター)対応 — POSIX パスのみ
- パス入力の補完・サジェスト
- 溢れたセグメントを「…」メニューに折りたたむ UI(左フェードで済ます)
- パンくずセグメントへのドロップ(D&D 対象外)
- ホームディレクトリの `~` 表示・入力展開

## 3. Prerequisites

- 依存する spec: 02(`explorer.activeTab().currentPath` / facade。厳密には Toolbar の props 経由なので 02 完了後ならなお良い、程度の依存)
- 前提とする既存ファイル:
  - `src/components/Toolbar.tsx` — `<span class={styles.path} title={...}>{currentPath}</span>` が置き換え対象。props: `currentPath / canGoBack / canGoForward / onBack / onForward`
  - `src/store/explorer.ts` — `navigateTo(path)`。失敗時は現在の一覧を保持しエラーバナー表示(`load()` の既存挙動)

## 4. UI/UX behavior

### 表示モード(デフォルト)

- パスをセグメント分割し、`/` 区切りのクリック可能な要素として表示: `/ › Users › foo › Documents`(区切りの見た目は chevron でもスラッシュでも可、控えめに)
- When: セグメントをクリック / Then: そのセグメントまでのパスへ `onNavigate(prefixPath)`
- 現在地(末尾セグメント)もクリック可能でよい(no-op 相当のナビゲートになるが害はない)
- 溢れるとき: コンテナ `overflow: hidden`、左端をフェード(先頭側が隠れ、末尾=現在地側を常に見せる)

### 編集モード

- When: パンくずの空白部分(セグメント以外)をクリック / Then: バー全体がフルパスの `<input>`(現在パスでプリフィル、全選択、オートフォーカス)に切り替わる
- Enter: `onNavigate(入力値)` を呼び、表示モードへ戻る。ナビゲート失敗時は既存の `load()` 挙動どおり現在地に留まりエラーバナーが出る(パスバーは現在パスの表示に戻る)
- Esc: キャンセルして表示モードへ
- blur: キャンセルして表示モードへ(コミットしない — 誤爆防止)
- 入力値は trim してから渡す。空文字は no-op でキャンセル扱い

## 5. State & data model

ストア変更なし。モード(表示/編集)は `PathBar` コンポーネント内のローカル signal。

セグメント分割は純粋ヘルパーに抽出:

```ts
// src/lib/pathSegments.ts — pure, unit-tested, POSIX only
export interface PathSegment {
  name: string; // display label; "/" for the root segment
  path: string; // absolute path this segment navigates to
}

// "/Users/foo/bar"  → [{name:"/",path:"/"},{name:"Users",path:"/Users"},
//                      {name:"foo",path:"/Users/foo"},{name:"bar",path:"/Users/foo/bar"}]
// "/"               → [{name:"/",path:"/"}]
// trailing slash tolerated: "/Users/" === "/Users"
// "" (not yet loaded) → []
export function splitPathSegments(path: string): PathSegment[];
```

## 6. Backend commands

なし。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/pathSegments.ts` | 新規 | `splitPathSegments` |
| `src/lib/pathSegments.test.ts` | 新規 | 上記のテスト |
| `src/components/PathBar.tsx` | 新規 | 2 モードの dumb component。props: `currentPath: string`, `onNavigate(path: string): void` |
| `src/components/PathBar.module.css` | 新規 | セグメント・フェード・input のスタイル(トークンのみ) |
| `src/components/Toolbar.tsx` | 変更 | `<span class={styles.path}>` を `<PathBar currentPath={props.currentPath} onNavigate={props.onNavigate} />` に置換。props に `onNavigate(path)` を追加 |
| `src/components/Toolbar.module.css` | 変更 | 不要になった `.path` を削除 |
| `src/App.tsx` | 変更 | `onNavigate={(p) => explorer.navigateTo(p)}` を Toolbar に配線 |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| ルート `/` を表示中 | セグメントは `/` 1 つだけ |
| 存在しない/権限のないパスを入力して Enter | エラーバナー、現在地に留まる(`load()` の既存挙動)。パスバーは現在パスの表示に戻る |
| 相対パスや `~` を入力 | そのまま `navigateTo` に渡り、バックエンドの `read_dir` が失敗してエラーバナー(特別扱いしない) |
| 空文字・空白のみで Enter | no-op、表示モードへ戻る |
| 起動直後で `currentPath` が空 | セグメントなし(空のバー)。クリックで編集モードには入れてよい |
| 非常に深いパス | 左フェードで先頭が隠れる。横スクロールはさせない |
| ファイルパス(ディレクトリでない)を入力 | `read_directory` が失敗しエラーバナー(特別扱いしない) |

## 9. Acceptance criteria

- [ ] 現在パスがクリック可能なセグメント列で表示される
- [ ] 中間セグメントのクリックでそのディレクトリへ移動する
- [ ] 空白部クリックで編集モードになり、フルパスがプリフィル・全選択される
- [ ] 有効なパスを入力して Enter で移動する
- [ ] 無効なパスで Enter → エラーバナーが出て現在地に留まる
- [ ] Esc / blur でキャンセルされ、何も起きない
- [ ] 深いパスで末尾(現在地)が常に見えている
- [ ] `pnpm test` で `pathSegments` のテストが通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

`src/lib/pathSegments.test.ts` — `splitPathSegments`:

- 通常の絶対パス(上記 docstring の例そのまま)
- ルート `/` → 1 セグメント
- 末尾スラッシュ許容(`/Users/` と `/Users` が同結果)
- 空文字 → `[]`
- 1 階層 `/Users` → 2 セグメント

### Rust

なし。

### 手動検証手順

1. 起動 → パスバーがパンくず表示になっている
2. 中間セグメント(例: ホームの親)をクリック → 移動
3. 空白部をクリック → input 化・全選択を確認
4. `/tmp` を入力して Enter → 移動(注: `/tmp` は `$HOME` 外なのでファイルの open は失敗するが、一覧表示は可能)
5. `/nonexistent` を入力して Enter → エラーバナー、現在地のまま
6. 編集モードで Esc → 表示モードへ、無変化
7. 深い階層へ移動し、末尾セグメントが見えている(左がフェード)ことを確認

## 11. Future work

- `~` 展開、入力補完
- 「…」折りたたみメニュー
- Windows パス対応
- `Cmd/Ctrl+L` で編集モードに入るショートカット
