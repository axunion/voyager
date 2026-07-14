# 19 — Rubber-band select(範囲ドラッグ選択)

## 1. Goal

ファイルリストの空白部でマウスをドラッグし、矩形と交差した行を選択済みにする(一般的なファイルマネージャーのマウス範囲選択)。選択は常に**置換**とし、既存の単一/複数選択モデル(spec 15)にそのまま合流させる。

## 2. Non-goals

- ドラッグ中の自動スクロール(可視範囲外は対象にならない)
- Shift/Cmd 押下によるラバーバンドの**加算**選択(常に置換。将来 Future work)
- グリッド/アイコン表示や横方向のヒットテスト(この行ベースの一覧のみが対象。行は幅いっぱいなので Y 方向のみで判定する)
- タッチ操作でのラバーバンド(マウスのみ)
- ドラッグ中の Escape 等キーボード操作の割り込み処理(mouseup まで無視してよい)

## 3. Prerequisites

- 依存する spec: 15(完了済みであること — `selectedPaths` / `selectionAnchor` / `selectionCursor` と `onSelectionChange(sel)` の配線、`src/lib/selection.ts` の純関数群)
- 前提とする既存ファイル:
  - `src/components/FileList.tsx` — 空白部クリックで選択解除する `handleContainerClick`(`e.target === e.currentTarget` ガード)、`menuOpen` によるキー操作抑制パターン、`backgroundDropTarget` と同種の「背景のみ」ガード
  - `src/lib/selection.ts` — `Selection { paths, anchor, cursor }`、`selectAll` の「先頭を anchor、末尾を cursor にする」パターン
  - `src/lib/listNav.ts` の `rowId(path)` — 行の DOM id(`role="option"` 要素)

## 4. UI/UX behavior

- Given: リスト空白部(行・ヘッダ・作成中のファントム行以外)でマウス左ボタンを押し下げた状態 / When: そのままドラッグする / Then: 開始点から現在点までの矩形をオーバーレイ表示し、Y 方向で矩形と交差する行を選択に置き換える(ドラッグ中はリアルタイムに更新)
- Given: 上記ドラッグ中 / When: マウスボタンを離す / Then: その時点の選択を確定し、オーバーレイを消す。直後に発火するネイティブ click イベントはこの選択を上書きしない(移動量が閾値(4px)未満だった場合のみ、既存の「空白クリックで選択解除」がそのまま働く)
- Given: 行の上でマウスを押し下げた場合 / When: ドラッグする / Then: ラバーバンドは開始されない(既存の行クリック/選択ドラッグ挙動が優先される。`e.target === e.currentTarget` で判定)
- Given: 矩形が 1 行も含まない位置で確定した場合 / When: mouseup / Then: 選択は空になる
- Given: 下から上、右から左などどの方向にドラッグしても / When: 確定 / Then: 開始点・終了点の大小に関わらず正しく矩形交差判定する
- 確定後の `anchor` は交差した行のうち可視順で最初の行、`cursor` は最後の行(`selectAll` と同じ約束)。これにより直後の Shift+クリック/Shift+矢印がその端点から自然に続けられる

## 5. State & data model

新規純関数 `src/lib/selection.ts`(+ colocated テスト追記):

```ts
// Replaces the selection with `paths` (any order/duplicates), re-derived
// into visible-list order. anchor = first in that order, cursor = last.
// Returns emptySelection when paths doesn't match any visible entry.
export function bandSelect(entries: Entry[], paths: string[]): Selection;
```

`src/components/FileList.tsx` のコンポーネントローカル状態(ストアには追加しない。`menuOpen` と同じ扱い):

```ts
interface RubberBandRect {
  startY: number; // container-relative, scrollTop 込み
  currentY: number;
}
const [rubberBand, setRubberBand] = createSignal<RubberBandRect | null>(null);
```

`onSelectionChange` は spec 15 で既に存在するため、確定した `Selection` はそのまま同じ prop で親へ渡す。`explorer.ts` の変更は不要。

## 6. Backend commands

なし。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/lib/selection.ts` / `selection.test.ts` | 変更 | `bandSelect` 追加 + テスト |
| `src/components/FileList.tsx` | 変更 | 背景 mousedown/mousemove(document 購読)/mouseup によるラバーバンド計算とオーバーレイ描画、確定直後の click 抑制フラグ |
| `src/components/FileList.module.css` | 変更 | `.rubberBand` オーバーレイスタイル(既存トークンのみ) |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| 移動量が閾値(4px)未満で mouseup | ラバーバンド不成立。既存の `handleContainerClick` による選択解除がそのまま働く |
| ドラッグ中にマウスがリスト外に出る | `document` に mousemove/mouseup を購読しているため継続して追跡する(コンテナ内 mousemove だけに頼らない) |
| ドラッグ中に手動ホイールスクロール | 自動スクロールはしないが、スクロール後も mousemove のたびに現在の行位置で再判定するため自然に追随する |
| 矩形が行の一部とだけ重なる(端が半分だけ被る) | Y 方向で少しでも重なれば選択対象に含む |
| 作成中のファントム入力行の上でドラッグ開始 | ファントム行もコンテナの子要素で `e.target !== e.currentTarget` となるため、ラバーバンドは開始されない |
| ドラッグ確定直後に選択 0 件 | 空文字列的に `paths: []` の Selection(anchor/cursor も null) |
| 右クリック(コンテキストメニュー用ボタン)でのドラッグ | 対象外(左ボタンのみ。`e.button !== 0` は無視) |

## 9. Acceptance criteria

- [ ] 空白部でのマウスドラッグにより、矩形と交差した行が選択に置き換わる
- [ ] ドラッグの方向(上下左右)によらず正しく交差判定する
- [ ] ドラッグ確定直後のネイティブ click で選択が意図せずクリアされない
- [ ] 移動量が閾値未満の単純クリックは、従来どおり選択解除として動作する
- [ ] 行の上でのマウスダウンではラバーバンドが開始されず、既存の行クリック/ドラッグ選択が優先される
- [ ] 確定後の anchor/cursor が交差行の可視順の先頭/末尾になり、直後の Shift+クリック/Shift+矢印が自然に続く
- [ ] `pnpm check` / `pnpm test` が通る

## 10. Test plan

### Vitest(純粋ロジックのみ)

- `selection.test.ts`: `bandSelect` — 可視順への並べ替え、anchor=先頭/cursor=末尾、空配列 → `emptySelection`、可視エントリに存在しないパスの除外、入力を破壊しないこと

### Rust

なし。

### 手動検証手順

1. 空白部から下方向にドラッグ → 交差した行が選択される。オーバーレイが表示され、mouseup で消える
2. 上方向・右から左などドラッグ方向を変えても同様に選択される
3. 何もない場所を矩形が通らない位置で mouseup → 選択が空になる
4. 4px 未満の小さな動き(実質クリック)→ 従来どおり選択解除として動く
5. 行の上からドラッグを開始 → ラバーバンドは発生せず、既存の行ドラッグ(移動)が動く
6. ラバーバンドで 3 行選択後、Shift+クリックで別行を選択 → バンドの端点から範囲が張られる
7. ラバーバンド中にリストの外までマウスを動かしてから mouseup → 選択が確定する

## 11. Future work

- ドラッグ中の自動スクロール(可視範囲外への追従)
- Shift/Cmd 押下によるラバーバンドの加算選択
- タッチジェスチャーでの範囲選択
