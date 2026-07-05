# 10 — Drag-out(アプリから OS へのドラッグ)⚠️ 保留 / stretch

> **ステータス: 保留。** この spec はロードマップに含まれない。08 と 09 が macOS / Linux 両方でクリーンに動作した後、かつ下記プラグインの動作検証が両プラットフォームで取れた場合にのみ着手する。調査結果の散逸を防ぐため spec として残している。**着手前に必ず §4 の再検証を行うこと。**

## 1. Goal

アプリのファイル行を Finder / Nautilus / 他アプリへドラッグして、実ファイルとして渡せるようにする(例: デスクトップへドラッグ → コピー、メールアプリへドラッグ → 添付)。

## 2. Non-goals

- ドラッグアウトでの move(OS 側の解釈に委ねるが、アプリ側からは copy 相当の提供のみ)
- 複数選択のドラッグアウト(複数選択自体が未実装)
- ツリーノードのドラッグアウト(ファイル行のみ)

## 3. Prerequisites

- 依存する spec: 08(アプリ内 D&D の完成形)、09(`dragDropEnabled: true` 環境での挙動確認済み)
- 前提とする既存ファイル: `src/lib/dnd.ts`(08 で抽出済みのヘルパー)、`src/components/FileItem.tsx`(ドラッグ元)

## 4. 技術調査(2026-07 時点。着手時に要再検証)

- **Tauri v2 コアにはドラッグアウト機能がない。** webview の HTML5 `dragstart` で `DownloadURL` 等を使う手法はデスクトップの実ファイル D&D としては機能しない
- 現実解は CrabNebula の **`tauri-plugin-drag`**:
  - Rust crate `tauri-plugin-drag` + npm `@crabnebula/tauri-plugin-drag`
  - `lib.rs` でのプラグイン登録、`Cargo.toml` / `package.json` への依存追加が必要
  - `src-tauri/capabilities/default.json` に `drag:default` permission が必要(**このロードマップで capability に触る唯一の spec**)
  - フロント API: `startDrag({ item: [absolutePaths], icon })` — mousedown/dragstart 起点で呼ぶとネイティブの OS ドラッグセッションが始まる
  - **最大の懸念は Linux/GTK での安定性**。着手時に最新の README / issue を確認し、両プラットフォームで PoC を先に行うこと

## 5. 核心的な設計問題(正直な記述)

`dragstart`(または mousedown)の時点では、ユーザーがアプリ内移動をしたいのか OS へのドラッグアウトをしたいのか**判別できない**。そして HTML5 DnD とネイティブ `startDrag` は同一ジェスチャを取り合う — ネイティブドラッグを開始すると HTML5 のドラッグイベントは流れず、アプリ内ドロップターゲット(行/ツリー/タブ)が機能しなくなる。

### 案 A(採用推奨): 修飾キーによる opt-in

- 通常のドラッグ = 従来どおり HTML5 DnD(アプリ内移動)
- **Alt(Option)を押しながらドラッグ開始** = `startDrag` によるネイティブドラッグアウト
- `dragstart` ハンドラで `e.altKey` を見て分岐: alt なら `e.preventDefault()` して `startDrag` を呼ぶ
- 利点: 既存のアプリ内 D&D を一切壊さない。実装が局所的(`FileItem.tsx` の dragstart のみ)
- 欠点: 発見可能性が低い(修飾キーを知らないと使えない)。ツールチップ等での案内を検討

### 案 B(代替案・非推奨): 全ドラッグのネイティブ化

- すべてのドラッグを `startDrag` にし、アプリ内ドロップは 09 の `onDragDropEvent`(自ウィンドウへのドロップも paths 付きで届く)+ 座標→要素解決で受ける
- 利点: 修飾キー不要、OS と統一された 1 つのドラッグモデル
- 欠点: 08 で作った HTML5 ドロップターゲットを全て座標ベースに作り直す大改修。ハイライト表現も自前になる。**シンプルさ第一の方針に反するため採用しない**(状況が変わった場合の参考として記載)

## 6. Backend commands

なし(プラグインが担う)。ただし `lib.rs` へのプラグイン登録と capability 追加がある:

```json
// src-tauri/capabilities/default.json の permissions に追加
"drag:default"
```

## 7. File changes(案 A 前提の見込み)

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src-tauri/Cargo.toml` | 変更 | `tauri-plugin-drag` 追加 |
| `src-tauri/src/lib.rs` | 変更 | `.plugin(tauri_plugin_drag::init())` |
| `src-tauri/capabilities/default.json` | 変更 | `drag:default` |
| `package.json` | 変更 | `@crabnebula/tauri-plugin-drag` |
| `src/components/FileItem.tsx` | 変更 | `dragstart` で `altKey` 分岐 → `startDrag` |

## 8. Edge cases(着手時に精査)

| 状況 | 期待動作 |
| --- | --- |
| Alt ドラッグを自アプリ内にドロップ | 09 の `onDragDropEvent` 経由で copy として着地する(挙動確認要) |
| ネイティブドラッグ中のハイライト | アプリ内ターゲットはハイライトしない(HTML5 イベントが来ないため)— 仕様として許容 |
| Linux でプラグインが不安定 | PoC 段階で判断し、Linux では機能を無効化する選択肢も検討 |

## 9. Acceptance criteria(ドラフト)

- [ ] Alt+ドラッグでファイルを Finder / デスクトップへドラッグするとコピーされる
- [ ] 通常ドラッグのアプリ内 D&D(08 の全パターン)が一切壊れていない
- [ ] macOS / Linux 両方で動作、または Linux 無効化の判断が明示されている

## 10. Test plan

着手時に作成。最低限: 両 OS での手動 PoC → 案 A 実装 → 08/09 の全手動検証手順の再実施。

## 11. Future work

- 複数ファイルのドラッグアウト
- ドラッグアイコンのカスタマイズ(枚数バッジ等)
