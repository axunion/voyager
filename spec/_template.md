# NN — 機能名

<!--
spec 追加時はこのファイルをコピーし、全セクションを埋める。
- セクションの削除・順序変更は不可。該当なしのセクションは「なし」と書く(空欄にしない)。
- 型・シグネチャは verbatim(コピペで使える形)で書く。「〜のような」で濁さない。
- 実装者は AI エージェント。曖昧さは実装のブレに直結するため、判断を委ねる箇所は
  意図的に委ねる旨を明記する。
-->

## 1. Goal

この spec が達成すること。1〜2 文。

## 2. Non-goals

この spec で**意図的にやらないこと**の箇条書き。過剰実装防止のための最重要セクション。関連 spec に切り出されているものは番号を添える。

## 3. Prerequisites

- 依存する spec: NN, NN(完了済みであること)
- 前提とする既存ファイルと、その現在の責務(例: `src/store/explorer.ts` — active tab に対する facade。`navigateTo(path)` / `select(path)` を公開)

## 4. UI/UX behavior

Given/When/Then の箇条書き。マウス・キーボード操作が絡む場合は操作マトリクス表を使う。

- Given: 〜の状態で / When: 〜したとき / Then: 〜になる

## 5. State & data model

追加・変更する TypeScript interface を verbatim で。置き場所(ファイルパス)を明記。変更なしなら「なし」。

## 6. Backend commands

追加・変更する Rust コマンドのシグネチャとガード条件を verbatim で。フロントのみの spec は「なし」。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/...` | 新規 / 変更 | 何をするか 1 行 |

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |

## 9. Acceptance criteria

それぞれ独立に検証可能なチェックボックス。

- [ ] ...

## 10. Test plan

### Vitest(純粋ロジックのみ)

対象モジュールとテスト観点。なければ「なし」。

### Rust

追加するテストケースの列挙。なければ「なし」。

### 手動検証手順

番号付き手順。Acceptance criteria をすべてカバーすること。

## 11. Future work

検討したが今回は作らないもの。実装者はここにあるものを**作ってはならない**(アイデアの駐車場)。
