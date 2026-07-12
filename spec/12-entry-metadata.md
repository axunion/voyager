# 12 — Entry metadata(サイズ・更新日時カラム + symlink 表示)

## 1. Goal

`Entry` にサイズ・更新日時・symlink フラグを追加し、ファイルリストを「名前 / サイズ / 更新日時」のカラム表示にする。symlink は名前の横のバッジアイコンで見分けられるようにする。あわせて「エントリ配列 → ソート → フィルタ → 可視エントリ」という正規導出パイプラインを `App.tsx` に確立する(以降の spec はすべてこのパイプラインの出力に対して動作する)。

## 2. Non-goals

- ソートの切り替え UI・per-tab ソート状態(spec 13。本 spec のヘッダ行は**静的表示のみ**)
- ディレクトリの合計サイズ計算(再帰走査が必要なため。サイズ列は「—」表示)
- 作成日時・パーミッション・所有者などの追加メタデータ
- サムネイル・プレビュー(プロジェクト方針として恒久的に対象外)
- symlink のリンク先パス表示・リンク切れ検出
- カラム幅のドラッグ変更・カラムの表示/非表示切り替え
- 日時フォーマットの設定(ロケール依存の固定フォーマットのみ。設定の永続化はプロジェクト方針として一切行わない)

## 3. Prerequisites

- 依存する spec: なし(現行実装のみが前提)
- 前提とする既存ファイル:
  - `src-tauri/src/commands.rs` — `Entry { name, path, is_dir }` と `read_directory`。`file_type()` は取得済みで、symlink 判定コードが既にある
  - `src/lib/ipc.ts` — TS 側 `Entry` ミラー(Rust と同時更新の規約)
  - `src/App.tsx` — file-pane ごとの `createMemo` で `filterEntries(tab().entries, tab().filterQuery)` を計算(ここがパイプラインの挿入点)
  - `src/components/FileList.tsx` / `FileItem.tsx` — 行描画。ファントム作成行が偽 `Entry` リテラルを作っている(フィールド追加で tsc がエラーにする)
  - `src/lib/icons.ts` — 拡張子 → アイコンのマッピング(変更不要だが `Entry` を受ける)

## 4. UI/UX behavior

- Given: 任意のディレクトリを表示 / Then: リスト上部にヘッダ行「Name / Size / Modified」が出る。ヘッダはスクロールコンテナの**外**(スクロールしても固定)
- 各行は 3 カラム: アイコン + 名前(+ symlink バッジ)/ サイズ / 更新日時。行高は 28px のまま
- サイズ: ファイルは `formatSize`(1000 進・小数 1 桁、例 `1.2 MB`)、ディレクトリと取得失敗は `—`
- 更新日時: `formatMtime`(`Intl.DateTimeFormat` によるロケール依存の `YYYY/MM/DD HH:mm` 相当)、取得失敗は `—`
- symlink: 名前の直後に muted な小さい link アイコン(`lucide-solid/icons/link-2`、size 12)+ `title="Symbolic link"`。カラムは増やさない
- 並び順は現行と同一(dirs-first → 名前昇順・大文字小文字非区別)。見た目の変化はカラム追加のみ
- ヘッダ行はクリックしても何も起きない(操作可能にするのは spec 13)

## 5. State & data model

`src/lib/ipc.ts` の `Entry` を Rust と同時に更新(wire は snake_case の規約どおり):

```ts
export interface Entry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number | null; // bytes; null for directories and metadata failures
  mtime: number | null; // unix epoch seconds; null on metadata failure
}
```

新規純モジュール(すべて colocated `*.test.ts` 付き):

```ts
// src/lib/formatSize.ts
// 1000-based, one decimal place (Finder-style): 0 → "0 B", 999 → "999 B",
// 1000 → "1.0 kB", 1234567 → "1.2 MB". null → "—".
export function formatSize(size: number | null): string;

// src/lib/formatMtime.ts
// Formats unix epoch seconds with Intl.DateTimeFormat (session locale,
// year/month/day + hour/minute, 24h fixed). null → "—".
export function formatMtime(mtime: number | null): string;

// src/lib/sortEntries.ts
export type SortKey = "name" | "size" | "mtime";
export type SortDir = "asc" | "desc";
// Pure. Always dirs-first regardless of key/dir. Within each group:
// - name: case-insensitive name compare (current Rust order)
// - size: dirs stay name-asc (their size is null); files by size
// - mtime: both groups by mtime
// null values sort last within their group for both directions.
// Ties fall back to case-insensitive name-asc (stable, deterministic).
export function sortEntries(
  entries: Entry[],
  key: SortKey,
  dir: SortDir,
): Entry[];
```

**正規導出パイプライン**(`App.tsx` の file-pane 内 `createMemo` を置き換え。以降の spec はこの出力=「可視エントリ」に対してのみ動作し、パイプラインを分岐させてはならない):

```ts
const entries = createMemo(() =>
  filterEntries(
    sortEntries(tab().entries, "name", "asc"), // spec 13 で per-tab 状態に差し替え
    tab().filterQuery,
  ),
);
```

## 6. Backend commands

`src-tauri/src/commands.rs` の `Entry` と `read_directory` を変更(新コマンドなし):

```rust
#[derive(Debug, serde::Serialize)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: Option<u64>,  // None for directories (and metadata failures)
    pub mtime: Option<i64>, // unix epoch seconds; None on metadata failure
}
```

`read_directory` の `filter_map` 内:

- `is_symlink` は取得済みの `de.file_type()` から(`ft.is_symlink()`。`Err` 時は `false`)
- `de.metadata()` を 1 回呼ぶ(symlink を辿らない lstat 相当)。**失敗してもエントリを落とさず** `size` / `mtime` を `None` にする(既存の寛容スタイルを維持)
- `size`: `is_dir` なら `None`、ファイルなら `Some(metadata.len())`。symlink がファイルを指す場合はリンク自体のメタデータで構わない(lstat のまま。意図的な判断)
- `mtime`: `metadata.modified()` → `UNIX_EPOCH` からの秒数(`i64`)。取得不能な FS では `None`
- `is_dir` の判定ロジック(symlink はターゲットで判定)と既存ソート(`sort_by_cached_key`)は**変更しない**。Rust 出力がソート済みであることに `tree.ts` が依存しているため

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src-tauri/src/commands.rs` | 変更 | `Entry` に 3 フィールド追加、`read_directory` で metadata 取得。既存テストの修正 + 新フィールドのテスト追加 |
| `src/lib/ipc.ts` | 変更 | `Entry` ミラー更新 |
| `src/lib/formatSize.ts` / `formatSize.test.ts` | 新規 | サイズ整形の純関数 + テスト |
| `src/lib/formatMtime.ts` / `formatMtime.test.ts` | 新規 | 日時整形の純関数 + テスト |
| `src/lib/sortEntries.ts` / `sortEntries.test.ts` | 新規 | ソート純関数 + テスト |
| `src/App.tsx` | 変更 | file-pane の `createMemo` に `sortEntries` を挿入(正規パイプライン確立) |
| `src/components/FileList.tsx` | 変更 | ヘッダ行(スクロールコンテナ外の div)追加。ファントム行の偽 `Entry` リテラルに新フィールド追加 |
| `src/components/FileItem.tsx` | 変更 | 行を 3 カラム grid 化。サイズ・日時セル、symlink バッジ追加 |
| `src/components/FileList.module.css` / `FileItem.module.css` | 変更 | ヘッダ行と行で共有する grid テンプレート(例 `1fr 6rem 10rem`)。28px 行高維持、色はトークンのみ |

注: `Entry` へのフィールド追加で tsc が他の参照箇所(あれば)をエラーにする。コンパイラの指摘に従って修正し、修正したファイルが上表にない場合は完了報告で明記すること。

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| `metadata()` が失敗するエントリ(権限なし等) | エントリは表示され、サイズ・日時が `—` |
| symlink がディレクトリを指す | 現行どおりフォルダとして表示・ナビゲート可能。symlink バッジ付き |
| symlink がファイルを指す | ファイルとして表示。サイズはリンク自体(lstat)の値で可 |
| サイズ 0 のファイル | `0 B` |
| 999 → 1000 バイト境界 | `999 B` → `1.0 kB`(1000 進) |
| mtime が epoch 以前(負値) | `formatMtime` はそのままフォーマット(クラッシュしない) |
| 長い名前とカラムの競合 | 名前セルは `text-overflow: ellipsis`。サイズ・日時カラムは固定幅で崩れない |
| ウィンドウが狭い | grid の `1fr` が名前カラムを縮める。横スクロールは発生させない |

## 9. Acceptance criteria

- [ ] リストに Name / Size / Modified のヘッダ行が出て、スクロールしても固定されている
- [ ] ファイル行にサイズ(Finder 風 1000 進表記)と更新日時が表示される
- [ ] ディレクトリ行のサイズは `—`
- [ ] symlink の行に link バッジが表示され、ダブルクリックで現行どおり開ける
- [ ] 並び順が本 spec 適用前と同一(dirs-first → 名前昇順)
- [ ] 行高が 28px のまま(リスト・ファントム行とも)
- [ ] `pnpm check` / `pnpm test` / `cargo fmt --check` / `cargo clippy` / `cargo test` がすべて通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

- `formatSize.test.ts`: `null` → `—` / `0` / `999` / `1000` 境界 / `1.2 MB` 級 / GB 級
- `formatMtime.test.ts`: `null` → `—` / 既知 epoch 値が年月日・時分を含む文字列になる(ロケール差を吸収するため厳密一致でなく部分一致で検証)
- `sortEntries.test.ts`: dirs-first 不変(全キー・全方向)/ name asc・desc / size で dirs は名前順のまま / mtime asc・desc / `null` サイズ・`null` mtime がグループ内で最後 / 同値タイは名前昇順 / 入力配列を破壊しない

### Rust

`commands.rs` の既存テストを新フィールドに追随させたうえで追加:

- `read_directory_reports_file_size_and_mtime`: 既知バイト数のファイルで `size == Some(n)`、`mtime.is_some()`
- `read_directory_directory_size_is_none`: ディレクトリの `size == None`、`mtime.is_some()`
- (Unix のみ `#[cfg(unix)]`)`read_directory_marks_symlinks`: `std::os::unix::fs::symlink` で作ったリンクの `is_symlink == true`、実体は `false`

### 手動検証手順

1. ホームディレクトリを表示 → ヘッダ行とサイズ・日時カラムが出る
2. ディレクトリ行のサイズが `—`、ファイル行に `1.2 MB` 形式のサイズが出る
3. `ln -s` で作った symlink にバッジが出る。ダブルクリックでフォルダ symlink に入れる
4. リストをスクロール → ヘッダが固定されている
5. ウィンドウを狭める → 名前が省略記号で縮み、横スクロールが出ない
6. 適用前後で並び順が変わっていないことを目視確認

## 11. Future work

- ソート切り替え(spec 13)
- ディレクトリの合計サイズ(再帰計算)
- symlink のリンク先パス表示(ツールチップ等)
- 相対日時表示(「3 日前」)や日時フォーマット切り替え
