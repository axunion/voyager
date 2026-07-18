# Voyager spec — 実装規約と記録

Tauri v2 + SolidJS ファイルエクスプローラー Voyager の設計ドキュメント。機能拡張
ロードマップ(spec 01–19)は **2026-07 に全実装が完了**し、個別の spec ファイルは
この 1 ファイルに統合した(過去の spec 本文は git 履歴を参照)。

本ファイルの本文は日本語で書く(CLAUDE.md の英語規約に対する合意済み例外。コード
識別子・型名・パス・エラーメッセージは英語のまま)。

## 実装規約

`src/` / `src-tauri/` を変更する前に必ず読むこと。完了条件は CLAUDE.md の
Completion gate を参照。

### エラー方針

- Rust コマンドは `Result<T, String>` を維持。エラーは人間可読な英語メッセージで、
  フロントは `String(e)` をバナー表示するだけ。
- フロントがエラー種別で分岐する必要が生じたら、その時点で serde タグ付き enum に
  移行する。それまでは enum 化しない。
- 書式はパスや名前をダブルクォートで含める: `Cannot read "{path}": {e}`、
  `"{name}" already exists in the destination`、`Failed to {verb}: {e}`。

### IPC

- ワイヤ上のフィールド名は snake_case(例: `is_dir`)。Rust 構造体に rename 属性を
  付けず、TS interface 側も snake_case で揃える。
- コマンド引数は TS 側 camelCase → Tauri が自動で Rust snake_case に変換する
  (例: `targetDir` → `target_dir`)。
- 新コマンドは必ず `src/lib/ipc.ts` に型付きラッパーを 1 つ追加する。
- `Entry`(`name` / `path` / `is_dir` / `is_symlink` / `size` / `mtime`)は
  Rust (`src-tauri/src/commands.rs`) と TS (`src/lib/ipc.ts`) でミラーされている。
  フィールド追加時は両方を同時に更新する。

### Rust バックエンド

- コマンドはすべて `src-tauri/src/commands.rs` に置き、`src-tauri/src/lib.rs` の
  `tauri::generate_handler![...]` に登録する。アプリ定義コマンドは capability
  (ACL) 登録不要。
- `src-tauri/capabilities/default.json` の `opener:allow-open-path` は `$HOME/**`
  スコープのまま**広げない**。capability・`tauri.conf.json` は明確な必要がない限り
  触らない。
- テストは `commands.rs` 内の `#[cfg(test)] mod tests` に追記。`tempfile::tempdir()`
  で実 FS を使い、戻り値パスとエラー文字列の部分一致 (`err.contains(...)`) を
  アサートする既存スタイルに従う。

### ストア

- リアクティブストアは `createStore` によるシングルトン facade(`src/store/explorer.ts`
  方式): モジュールレベルで `state` を作り、`state` + アクションメソッドを持つ
  plain object を export する。
- **純粋ロジックは別モジュールに抽出**して単体テストする(`src/store/history.ts` が
  先例: イミュータブルな純関数群 + 併置 `history.test.ts`)。リアクティブストア自体は
  テストしない。
- 非同期ロードは単調増加シーケンストークンでガードする(`explorer.ts` の `loadSeq`
  パターン): 最新のロードだけが state をコミットする。
- ロード失敗時は直前の一覧とパスを保持する(ユーザーがその場に留まる)。

### コンポーネント

- コンポーネントは dumb に保つ: データとコールバックは props でのみ受け取る。
  ストアへの参照は `src/App.tsx` だけが持ち、そこで配線する。
- 選択判定は `createSelector` を使う(選択変更時に全行再評価しないため)。
- ファイルリストは仮想化済み(`src/lib/virtual.ts`)。行の描画は行高 28px 固定と
  ウィンドウイングを前提に書く。
- ファイル名はコンポーネントが PascalCase(`FileItem.tsx`)+ 併置の `*.module.css`、
  lib/store は camelCase(`ipc.ts`)。1 ファイル 1 関心、~300 行を超えたら分割。

### CSS

- コンポーネントごとに CSS Modules(`Foo.module.css` を `styles` として import)。
- **色は `src/App.css` の `:root` カスタムプロパティのみ使用**。既存トークン:
  `--border-color` / `--hover-bg` / `--selected-bg` / `--drop-bg` / `--muted-color` /
  `--menu-bg` / `--error-bg` / `--error-color`。**色のハードコード禁止**。
- ダークモードは `@media (prefers-color-scheme: dark)` で同トークンを上書きして
  自動対応。新トークンはライト・ダーク両方に同時追加する。
- **行高は 28px 固定**(仮想化の前提条件)。行が出現するすべての UI(ファイルリスト、
  ツリー、インライン編集行)で守る。
- Kobalte のメニュー類は `[data-highlighted]` 属性でスタイルする。

### UI ライブラリ

- ヘッドレス UI(メニュー・ダイアログ等)は `@kobalte/core` のみ。**新しい UI
  ライブラリを追加しない**。
- アイコンは `lucide-solid/icons/<name>` の per-icon import のみ(バレル import
  禁止)。拡張子→アイコンのマッピングは `src/lib/icons.ts` に集約。

### テスト方針

- **Vitest**: 純粋ロジックモジュールのみ対象。併置 `*.test.ts`、environment は node。
- **DOM/E2E テストは導入しない**。UI 挙動は手動検証で担保する。テストフレームワークの
  追加・変更は禁止。

### ポータブル性(OS 痕跡ゼロ)

不変条件の正確な意味は「設定機能を持たない」ではなく「ポータブルアプリのように
OS に痕跡を残さない」。具体的には次の 3 点(2026-07-18 に定式化):

1. **OS 状態を変えない** — インストール・起動によってレジストリ、OS 設定、
   デフォルトアプリ、ファイル関連付け等を一切変更しない。
2. **コンテンツをキャッシュしない** — アプリ自身がファイル内容を読まないため、
   キャッシュを作ることも OS 側のキャッシュ生成を誘発することもない
   (プレビュー・サムネイル非搭載はこのため)。USB ストレージ上のファイルを
   扱っても、抜いた後に痕跡が残らないこと。ただし「開く」操作は
   `tauri-plugin-opener` で OS デフォルトアプリに委譲するため、**渡した後に
   外部アプリや OS が作るキャッシュ(最近使った項目等)は保証範囲外**。
3. **OS 領域に書かない** — キャッシュ・履歴・設定ファイル・webview データを
   OS 領域(`~/Library`、AppData、XDG)に書かないこと。

- WebView はデフォルトで `~/Library/WebKit` と `~/Library/Caches` に WebsiteData /
  NetworkCache を書き込むため、`tauri.conf.json` のウィンドウ設定で
  `incognito: true` を必須とする(macOS: 非永続 WKWebsiteDataStore / Windows:
  WebView2 InPrivate / Linux: webkitgtk ephemeral context)。2026-07-18 に macOS で
  実測し、起動後に WebKit / Caches / HTTPStorages への書き込みが無いことを確認済み。
- ウィンドウサイズ・位置の永続化は検討の上で却下(どこかに書けば痕跡になる)。
  代わりに初期値 1100×700 + `center: true` を快適なデフォルトとして固定する。

#### 設定の永続化方針(opt-in サイドカー方式、2026-07-18 決定・未実装)

- デフォルトは設定ファイルなし(セッションのみ、現状どおり)。ユーザーが明示的に
  保存操作をしたときだけ、実行ファイルの隣に設定ファイル(`voyager.json`)を
  1 つ作る。起動時に存在すれば読み、無ければ純粋セッションモード。
- 「隣」の定義: Windows / Linux は実行ファイルと同じディレクトリ。macOS は
  コード署名が `.app` バンドル全体を封印しているため**バンドル内には書けず**、
  `Voyager.app` と同じ階層に置く(実行ファイル
  `Voyager.app/Contents/MacOS/voyager` から 3 階層上)。
- 書き込めない場合(macOS の App Translocation による読み取り専用パス起動、
  権限不足等)は、黙ってセッションモードにフォールバックする。
- **自己書き換え方式(バイナリ自身に設定を埋め込む)は不採用**。理由: macOS は
  署名破壊で起動不能になる、Windows は実行中 exe への書き込みが OS にロック
  される上に AV / SmartScreen の誤検知パターンである、Linux の AppImage は
  読み取り専用 squashfs で書けない。再検討しないこと。
- macOS の配布形態は DMG ではなく zip(展開すると `Voyager.app` が出る)を
  推奨。「Applications へドラッグ」の導線より「好きな場所に置いて使う」
  ポータブル運用と噛み合うため。
- 実装時は通常の新機能フローに従い、Goal / Non-goals / 変更ファイル /
  受け入れ基準を別途合意してから着手する。

## 新機能を追加する場合

実装前に Goal / Non-goals / 変更ファイル / 受け入れ基準を簡潔に書き出して合意する
(Non-goals は禁止事項として扱い、変更は挙げたファイルに収める)。実装後は完了
ゲートを通し、GUI 挙動は手動検証で締める。

## 実装履歴

| # | 機能 | 概要 |
| --- | --- | --- |
| 01–08, 11 | 基本 UX | 開く挙動 / タブ / キーボードナビ / ツリー / ファイル操作 / パスバー / フィルタ / アプリ内 DnD / タブホバー切替 |
| 12 | Entry metadata | サイズ・更新日時カラム + symlink 表示(sort → filter の正規導出パイプラインを確立) |
| 13 | Sort columns | カラムヘッダでソート切替 |
| 14 | Hidden files | 隠しファイル表示トグル(セッション内のみ保持) |
| 15 | Multi-select | 複数選択(Ctrl/Shift クリック) |
| 16 | Clipboard | アプリ内コピー / カット / ペースト(OS クリップボード非依存) |
| 17 | Shortcuts & refresh | ショートカット拡充 + 手動リフレッシュ |
| 19 | Rubber-band select | マウス範囲ドラッグ選択 |
| 18 | Virtualized list | ファイルリストの仮想化(全 spec の最後に実装) |

## 保留作業(調査記録)

どちらも未着手のまま取り下げ。再挑戦する場合は git 履歴の旧 spec
(`spec/09-dnd-os-drop.md` / `spec/10-dnd-drag-out.md`)に詳細な設計・検証手順がある。

### OS drop-in(旧 spec 09)— 取り下げ

Finder 等からのドロップで現在ディレクトリへコピーする機能。`tauri.conf.json` の
`dragDropEnabled: true` が **macOS でアプリ内 HTML5 D&D を壊す回帰**を確認し、
フォールバック(a)「`false` に戻して取り下げ」を選択した。要点:

- セマンティクスは copy 固定(ネイティブドラッグ中は修飾キーが読めない / 非破壊 /
  クロスボリュームでも機能する)
- 受け口は `getCurrentWebview().onDragDropEvent`(enter/over/leave/drop)
- 再挑戦するなら、アプリ内 D&D を pointer events ベースの自前実装に置き換える
  大改修(旧フォールバック(b))とセットで検討すること

### Drag-out(旧 spec 10)— ロードマップ外

アプリの行を OS へドラッグして実ファイルとして渡す機能。Tauri v2 コアには機能が
なく、現実解は CrabNebula の `tauri-plugin-drag`(capability `drag:default` が必要、
Linux/GTK の安定性が最大の懸念)。設計案は「Alt+ドラッグでネイティブドラッグアウトに
opt-in、通常ドラッグは従来のアプリ内 D&D」。旧 spec 09 の問題が未解決のため前提が
崩れており、着手には両プラットフォームでの PoC 再検証が必須。
