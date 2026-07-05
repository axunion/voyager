# 01 — Open behavior(ダブルクリック / Enter で開く)

## 1. Goal

エントリを開く操作を「ダブルクリック」に統一し、シングルクリックは選択のみにする。選択中エントリを Enter キーで開けるようにする。

現状はシングルクリックでディレクトリが即ナビゲートされ、ファイルはコンテキストメニューの "Open" からしか開けない。一般的なデスクトップファイラーの操作モデル(シングル=選択、ダブル=開く)に揃える。

## 2. Non-goals

- 矢印キーによる選択移動(spec 03)
- Delete キーでのゴミ箱移動(spec 03)
- シングルクリックで開くモードの設定オプション
- カスタムのダブルクリック判定タイマー(ネイティブ `dblclick` イベントを使う)

## 3. Prerequisites

- 依存する spec: なし(00 の規約のみ)
- 前提とする既存ファイル:
  - `src/components/FileItem.tsx` — 行コンポーネント。現在 `handleClick` が `is_dir` で分岐し、dir なら `onOpen`、file なら `onSelect` を呼ぶ
  - `src/components/FileList.tsx` — dumb なリスト。props: `entries / selectedPath / onOpen / onSelect / onDropMove / onTrash`
  - `src/App.tsx` — `handleOpen(entry)`: dir → `explorer.navigateTo(entry.path)`、file → `openPath(entry.path)`(`@tauri-apps/plugin-opener`)。**この関数は変更不要**

## 4. UI/UX behavior

操作マトリクス(行 = エントリ種別):

| 操作 | ディレクトリ | ファイル |
| --- | --- | --- |
| シングルクリック | 選択のみ(現在は即ナビゲート → 変更) | 選択のみ(現状維持) |
| ダブルクリック | 開く(`navigateTo`) | 開く(`openPath`) |
| 右クリック | 選択 + コンテキストメニュー(現状維持) | 同左 |
| コンテキストメニュー "Open" | 開く(現状維持) | 同左 |
| Enter(リストにフォーカスがあり、選択中エントリがあるとき) | 開く | 開く |

- Given: 任意のエントリ / When: シングルクリック / Then: そのエントリが選択される(ハイライト)。ナビゲートも openPath も起きない
- Given: 任意のエントリ / When: ダブルクリック / Then: `onOpen(entry)` が呼ばれる。1 クリック目で選択が入るのは意図した挙動(`user-select: none` がグローバルに効いているためテキスト選択の副作用はない)
- Given: エントリ選択中、`FileList` コンテナにフォーカス / When: Enter / Then: 選択中エントリで `onOpen` が呼ばれる
- Given: 未選択状態 / When: Enter / Then: 何も起きない

## 5. State & data model

なし(ストア変更なし)。

## 6. Backend commands

なし。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/components/FileItem.tsx` | 変更 | `handleClick` の `is_dir` 分岐を削除し常に `props.onSelect(props.entry)`。`onDblClick={() => props.onOpen(props.entry)}` を追加 |
| `src/components/FileList.tsx` | 変更 | ルート div に `tabindex="0"` と `onKeyDown` を追加。Enter のとき `selectedPath` に一致する entry を探して `props.onOpen(entry)`。**props は変更しない**(必要な情報はすべて既存 props にある) |
| `src/components/FileList.module.css` | 変更 | フォーカス時の outline 調整が必要な場合のみ(`:focus-visible` で `--selected-bg` 系の控えめな表示。ハードコード色は禁止) |

`src/App.tsx` は変更なし。

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| ダブルクリックの 1 クリック目 | 選択が入る(仕様)。2 クリック目で open |
| Enter 押下時、`selectedPath` のエントリが一覧から消えている(外部で削除→リロード済み等) | 一致 entry が見つからないので何もしない |
| ファイルの open が失敗(`openPath` reject) | 既存どおり `App.tsx` の catch でエラーバナー表示 |
| `$HOME` 外のファイルを開く | `opener` capability が `$HOME/**` スコープのため失敗し、エラーバナーに表示される(既知の制限。capability は広げない) |
| ドラッグ操作とクリックの競合 | HTML5 DnD の `dragstart` が発火した場合 click は発火しない(ブラウザ標準挙動)。特別な対処不要 |

## 9. Acceptance criteria

- [ ] ディレクトリをシングルクリックしてもナビゲートされず、選択ハイライトだけが付く
- [ ] ディレクトリをダブルクリックするとそのディレクトリに移動する
- [ ] ファイルをダブルクリックすると OS の既定アプリで開く
- [ ] エントリを選択して Enter で開く(dir はナビゲート、file は既定アプリ)
- [ ] 未選択で Enter を押しても何も起きない
- [ ] コンテキストメニューの "Open" は従来どおり動く
- [ ] 既存のアプリ内 D&D(ファイル→フォルダ移動)が壊れていない

## 10. Test plan

### Vitest(純粋ロジックのみ)

なし(分岐削除とイベント追加のみで、抽出すべき純粋ロジックがない)。

### Rust

なし。

### 手動検証手順

1. `pnpm tauri dev` で起動
2. フォルダをシングルクリック → 選択のみ確認
3. 同フォルダをダブルクリック → 移動を確認
4. テキストファイルをダブルクリック → 既定アプリで開くことを確認
5. ファイルをクリック選択 → リスト内で Enter → 開くことを確認
6. 何も選択せず(空白クリック後)Enter → 無反応を確認
7. ファイルをフォルダへドラッグ&ドロップ → 移動が従来どおり動くことを確認

## 11. Future work

- シングルクリックで開くモードの設定
- ダブルクリック時に 1 クリック目の選択を抑止する(現状は無害なので対応しない)
