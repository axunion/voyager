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

| # | spec | 規模 | ステータス | 備考 |
| --- | --- | --- | --- | --- |
| 01 | [Open behavior](01-open-behavior.md) — ダブルクリック / Enter で開く | 小 | 完了 | |
| 02 | [Tabs](02-tabs.md) — マルチタブ化 | 大 | 完了 | マイルストーン A/B とも本セッションで実装 |
| 03 | [Keyboard navigation](03-keyboard-navigation.md) — 矢印・Enter・Delete | 小 | 完了 | |
| 04 | [Tree view](04-tree-view.md) — サイドバーのフォルダツリー | 中 | 完了 | |
| 05 | [File operations](05-file-operations.md) — Rename / New Folder / New File | 中大 | 未着手 | |
| 06 | [Path bar](06-path-bar.md) — パンくず + パス入力 | 小 | 未着手 | 02 以降なら入替自由 |
| 07 | [Filter](07-filter.md) — 名前フィルタ | 小 | 未着手 | 02 以降なら入替自由 |
| 08 | [In-app DnD 拡張](08-dnd-in-app.md) — ツリー・タブへのドロップ | 中 | 未着手 | |
| 09 | [OS drop-in](09-dnd-os-drop.md) — OS からのドロップ受け入れ | 中 | 未着手 | ⚠️ 要プラットフォーム検証 |
| 10 | [Drag-out](10-dnd-drag-out.md) — OS へのドラッグアウト | — | **保留** | ロードマップ外(調査記録) |

ステータス値: `未着手` / `実装中` / `完了` / `保留`

## 依存グラフと実装順

```
01 open-behavior(独立)
02 tabs(A: ストアリファクタ → B: TabBar)
 ├─→ 03 keyboard-nav      (01 の Enter、02 のタブ別選択に依存)
 ├─→ 04 tree-view         (アクティブタブをナビゲートするため)
 ├─→ 05 file-operations   (編集状態をストアに載せるため)
 ├─→ 06 path-bar          (入替自由)
 └─→ 07 filter            (TabState にフィールド追加のため)
02 + 04 ─→ 08 dnd-in-app  (タブ・ツリーがドロップ先)
08 ─→ 09 dnd-os-drop      (dragDropEnabled 反転の検証を全 D&D 面が揃った後に 1 回で行う)
09 ─→ 10 dnd-drag-out     (保留)
```

順序の意図:

- **02 を早期に行う**: 03 / 05 / 07 は `TabState` や facade に書き込む。先にタブ化しておけば後からの移植作業が発生しない
- **09 は 08 の後**: `tauri.conf.json` の `dragDropEnabled: true` 反転はロードマップ中最大のリスク(アプリ内 HTML5 DnD を壊す可能性)。全ドロップターゲットが出揃った後に 1 回のリグレッション検証で済ませる
- 06 / 07 は他とほぼ独立しており、02 完了後ならいつ実装してもよい

## 対象コードベースの要点(2026-07 時点)

- Tauri v2 デスクトップアプリ。フロント: SolidJS + TypeScript + Vite、バックエンド: Rust(コマンドは `src-tauri/src/commands.rs` に集約)
- 状態管理: シングルトン facade ストア(`src/store/explorer.ts`)+ 純粋ロジック分離(`src/store/history.ts`)
- コンポーネントは dumb(props のみ)、配線は `src/App.tsx` に集約
- 詳細な規約は [`00-conventions.md`](00-conventions.md) を参照
