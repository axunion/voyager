# 00 — 共通規約 (Conventions)

全 spec に適用される横断ルール。各 spec の実装セッションは、対象 spec を読む前に必ずこのファイルを読むこと。

## ドキュメント言語について

spec 本文は日本語で書く(CLAUDE.md の「AI 向けファイルは英語」規約に対する、本プロジェクトで合意済みの例外)。ただしコード識別子・型名・ファイルパス・コマンド名は英語のまま記載する。**コード内のコメント・エラーメッセージ・ログは英語**(CLAUDE.md 準拠、例外なし)。

## 完了条件(全 spec 共通)

実装セッションは終了前に以下をすべて通すこと:

```sh
pnpm check          # biome check + tsc --noEmit
pnpm test           # vitest run
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

加えて、各 spec の「Acceptance criteria」を手動検証手順(Test plan 内)で確認する。

## エラー方針

- Rust コマンドは `Result<T, String>` を維持する。エラーは人間可読な英語メッセージで、フロントは `String(e)` してバナー表示するだけ。
- **再検討トリガー**: フロントエンドがエラー種別で分岐する必要が生じたら、その時点で serde タグ付き enum に移行する。それまでは enum 化しない。
- エラーメッセージの書式は既存に合わせる: パスや名前をダブルクォートで含める(例: `Cannot read "{path}": {e}`、`"{name}" already exists in the destination`)。

## IPC 規約

- ワイヤ上のフィールド名は snake_case(例: `is_dir`)。Rust 構造体に rename 属性を付けず、TS interface 側も snake_case で揃える。
- コマンド引数は TS 側 camelCase → Tauri が自動で Rust snake_case に変換する(例: `targetDir` → `target_dir`)。
- 新コマンドは必ず `src/lib/ipc.ts` に型付きラッパーを 1 つ追加する。既存例:

```ts
export const moveEntry = (source: string, targetDir: string) =>
  invoke<string>("move_entry", { source, targetDir });
```

- `Entry` は Rust (`src-tauri/src/commands.rs`) と TS (`src/lib/ipc.ts`) でミラーされている。フィールド追加時は両方を同時に更新する。

```
Entry { name: string, path: string, is_dir: boolean }
```

## Rust バックエンド規約

- コマンドはすべて `src-tauri/src/commands.rs` に置き、`src-tauri/src/lib.rs` の `tauri::generate_handler![...]` に登録する。
- **アプリ定義コマンドは capability (ACL) 登録不要**。`generate_handler!` への登録だけでフロントから呼べる。
- `src-tauri/capabilities/default.json` の `opener:allow-open-path` は `$HOME/**` スコープのまま。**広げない**(spec が明示的に指示しない限り capability・`tauri.conf.json` に触らない)。
- テストは `commands.rs` 内の `#[cfg(test)] mod tests` に追記。`tempfile::tempdir()` で実 FS を使い、戻り値パスとエラー文字列の部分一致 (`err.contains(...)`) をアサートする既存スタイルに従う。

## ストア規約

- リアクティブストアは `createStore` によるシングルトン facade(`src/store/explorer.ts` 方式): モジュールレベルで `state` を作り、`state` + アクションメソッドを持つ plain object を export する。
- **純粋ロジックは別モジュールに抽出**して単体テストする(`src/store/history.ts` が先例: イミュータブルな純関数群 + 併置 `history.test.ts`)。リアクティブストア自体はテストしない。
- 非同期ロードは単調増加シーケンストークンでガードする(`explorer.ts` の `loadSeq` パターン): 最新のロードだけが state をコミットし、追い越された古いロードは捨てる。
- ロード失敗時は直前の一覧とパスを保持する(ユーザーがその場に留まる)。

## コンポーネント規約

- コンポーネントは dumb に保つ: データとコールバックは props でのみ受け取る。ストアへの参照は `src/App.tsx` だけが持ち、そこで配線する。
- `FileList.tsx` のコメントにある通り、`<For>` は将来 virtualizer に差し替える前提。行コンポーネントはこの前提を壊さないこと。
- 選択判定は `createSelector` を使う(選択変更時に全行再評価しないため)。
- ファイル名は PascalCase(`FileItem.tsx`)+ 併置の `*.module.css`。lib/store は camelCase(`ipc.ts`)。1 ファイル 1 関心、~300 行を超えたら分割。

## CSS 規約

- コンポーネントごとに CSS Modules(`Foo.module.css` を `styles` として import)。
- **色は `src/App.css` の `:root` カスタムプロパティのみ使用**。既存トークン:
  `--border-color` / `--hover-bg` / `--selected-bg` / `--drop-bg` / `--muted-color` / `--menu-bg` / `--error-bg` / `--error-color`
- ダークモードは `@media (prefers-color-scheme: dark)` ブロックで同トークンを上書きして自動対応している。新トークンが本当に必要な場合はライト・ダーク両方に同時追加する。**色のハードコード禁止**。
- **行高は 28px 固定**(virtualizer の前提条件)。行が出現するすべての UI(ファイルリスト、ツリー、インライン編集行)で守る。
- Kobalte のメニュー類は `[data-highlighted]` 属性でスタイルする(`FileItem.module.css` 参照)。

## UI ライブラリ規約

- ヘッドレス UI(メニュー・ダイアログ等)は `@kobalte/core` のみ。**新しい UI ライブラリを追加しない**。
- アイコンは `lucide-solid/icons/<name>` の per-icon import のみ(バレル import 禁止)。
- 拡張子→アイコンのマッピングは `src/lib/icons.ts` に集約されている。

## テスト方針

- **Vitest**: 純粋ロジックモジュールのみ対象。併置 `*.test.ts`、environment は node(`vite.config.ts` 内設定)。各 spec は抽出すべき純粋モジュールを名指しする。
- **Rust**: 上記バックエンド規約の通り。
- **DOM/E2E テストは導入しない**(全 spec 共通の Non-goal)。UI 挙動は各 spec の手動検証手順で担保する。テストフレームワークの追加・変更は禁止。

## シンプルさのガードレール

- 各 spec の **Non-goals に書かれたものは実装しない**。良いアイデアを思いついたら spec の Future work に追記して止まる。
- spec の File changes 表にないファイルは原則触らない。必要になったら理由をコミットメッセージ等で明示する。
