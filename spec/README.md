# Voyager 機能拡張 spec

初期開発が完了した Voyager(Tauri v2 + SolidJS のファイルエクスプローラー)に対する、今後の機能追加の設計書群。各 spec は **AI コーディングエージェントが 1 セッションで実装を完結できる**粒度・精度で書かれている。

## 使い方(実装セッションの手順)

1. 下のステータス表で次に実装する spec を決める(番号順が基本。「入替自由」の注記があるものは順序を変えてよい)
2. **必ず [`00-conventions.md`](00-conventions.md) を読む**(全 spec 共通の規約・完了条件)
3. 対象 spec を読み、Prerequisites の依存 spec が「完了」になっていることを確認する
4. spec の File changes / Acceptance criteria / Test plan に従って実装・検証する
5. 完了したらこの表のステータスを更新する

spec を新規追加する場合は [`_template.md`](_template.md) をコピーし、全セクションを埋めてこの README に登録する。

## ステータス

spec 01–08, 11(開く挙動 / タブ / キーボードナビ / ツリー / ファイル操作 / パスバー / フィルタ / アプリ内 DnD / タブホバー切替)は**完了済みのため spec ファイルを削除した**(内容は git 履歴を参照)。番号は欠番として扱い、再利用しない。

| # | spec | 規模 | ステータス | 備考 |
| --- | --- | --- | --- | --- |
| 09 | [OS drop-in](09-dnd-os-drop.md) — OS からのドロップ受け入れ | 中 | 保留 | macOS で `dragDropEnabled: true` によりアプリ内 D&D が機能しなくなる回帰を確認、フォールバック(a)を選択し取り下げ |
| 10 | [Drag-out](10-dnd-drag-out.md) — OS へのドラッグアウト | — | **保留** | ロードマップ外(調査記録) |
| 12 | [Entry metadata](12-entry-metadata.md) — サイズ・更新日時カラム + symlink 表示 | 中 | 完了 | 正規導出パイプライン(sort → filter)を確立 |
| 13 | [Sort columns](13-sort-columns.md) — カラムヘッダでソート切替 | 小 | 完了 | |
| 14 | [Hidden files](14-hidden-files.md) — 隠しファイル表示トグル | 小 | 完了 | |
| 15 | [Multi-select](15-multi-select.md) — 複数選択 | 大 | 完了 | 12–14 と入替自由(独立トラック) |
| 16 | [Clipboard](16-clipboard.md) — アプリ内コピー / カット / ペースト | 中 | 完了 | OS クリップボード非依存 |
| 17 | [Shortcuts & refresh](17-shortcuts-refresh.md) — ショートカット拡充 + 手動リフレッシュ | 中 | 完了 | |
| 18 | [Virtualized list](18-virtualized-list.md) — ファイルリストの仮想化 | 中 | 完了 | 必ず最後 |
| 19 | [Rubber-band select](19-rubber-band-select.md) — マウス範囲ドラッグ選択 | 小 | 完了 | 15 の追加 spec。FileList の行描画に触るため 18 より前に完了させる |

ステータス値: `未着手` / `実装中` / `完了` / `保留`

## 依存グラフと実装順

推奨直列順: 12 → 13 → 14 → 15 → 16 → 17 → 19 → 18。

```
12 entry-metadata ─→ 13 sort-columns      (12 のヘッダ行・sortEntries.ts を対話化)
       └──────────→ 14 hidden-toggle      (12 と同じ read_directory を編集するため 12 の後に固定)
15 multi-select ──→ 16 clipboard          (複数 paths の copy/cut/paste は選択モデル前提)
15 multi-select ──→ 19 rubber-band-select (選択モデル前提。18 より前に完了させる)
13 + 15 ─────────→ 17 shortcuts-refresh   (refresh が sort/filter/選択を保持するため 13/15 の後)
13,15,16,17,19 ──→ 18 virtualization      (必ず最後。14 は FileList に触れないため依存外)
```

順序の意図:

- **12 と 14 の順序は固定**: 両者は同じ Rust 関数 `read_directory` を編集するため、ベースラインの食い違いを避けて 12 を先にする
- **12→13→14 トラックと 15→16 トラックは入替自由**: 相互に独立している
- **17 は「貼るだけ」に保つ**: 新規挙動は refresh のみで、他のバインドの実体は先行 spec で完成済み。全バインドが既存アクションに対応してから一括で貼る
- **18 は必ず最後**: 12/13/15/16/19 がすべて FileList の行描画に触るため、仮想化による描画の書き換えを行マークアップ確定後の 1 回で済ませる(旧ロードマップで 02 tabs を先頭に置いた判断と対の理由)
- **19 は 15 完了後・18 より前**: ラバーバンド確定処理は現状の全行 DOM 描画を前提にヒットテストするため、仮想化(18)の前に確定させる

## 対象コードベースの要点(2026-07 時点)

- Tauri v2 デスクトップアプリ。フロント: SolidJS + TypeScript + Vite、バックエンド: Rust(コマンドは `src-tauri/src/commands.rs` に集約)
- 状態管理: シングルトン facade ストア(`src/store/explorer.ts`)+ 純粋ロジック分離(`src/store/history.ts`)
- コンポーネントは dumb(props のみ)、配線は `src/App.tsx` に集約
- 詳細な規約は [`00-conventions.md`](00-conventions.md) を参照
