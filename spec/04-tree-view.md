# 04 — Tree view(サイドバーのフォルダツリー)

## 1. Goal

左サイドバーにホームディレクトリをルートとするフォルダツリーを追加する。ノードは遅延展開(展開時に子を取得)。ノードのラベルクリックでアクティブタブがそのフォルダへナビゲートする。

## 2. Non-goals

- ツリー内でのファイル表示(フォルダのみ)
- リサイズ可能なスプリッタ(幅は固定 200px)
- 複数ルート / ボリューム一覧(ルートは `homeDir()` のみ)
- ファイル操作(移動・削除・作成)に追従したツリーの自動更新 — 展開し直しで手動リフレッシュ(既知の制限)
- ツリーのキーボード操作
- ツリーノードへのドロップ(spec 08)
- 新しい Rust コマンド(`read_directory` を再利用する。`dirs_only` パラメータは Future work)

## 3. Prerequisites

- 依存する spec: 02(`explorer.activeTab()` と facade が存在。ツリーは「アクティブタブをナビゲートする」ため)
- 前提とする既存ファイル:
  - `src/lib/ipc.ts` — `readDirectory(path)`。dotfile はバックエンドでスキップ済み、dirs-first ソート済み
  - `src/store/explorer.ts` — `navigateTo(path)`(アクティブタブに作用)、`setError(message)`
  - `src/App.tsx` — 配線ポイント。現在 `.app`(縦 flex)> Toolbar / error-banner / `.content`
  - `src/App.css` — `--border-color` / `--hover-bg` / `--selected-bg` 等のトークン

## 4. UI/UX behavior

レイアウト: `App.tsx` を 2 カラム化する。Toolbar(および TabBar)とエラーバナーは全幅のまま、その下を「Sidebar(200px 固定、独立スクロール、`border-right: 1px solid var(--border-color)`)+ 既存 content(flex: 1)」の横 flex にする。

ツリーの挙動:

- Given: 起動直後 / Then: ルートノード(ホームディレクトリ、ラベルは basename)が 1 つ表示され、**展開済み**(第 1 階層のフォルダが見えている)
- 各ノード = シェブロン(展開トグル)+ フォルダアイコン + 名前。行高 28px、階層ごとに一定のインデント
- When: シェブロンをクリック / Then: 展開状態をトグル。**展開するたびに `readDirectory` で子を再取得**(キャッシュ済みでも取り直す = これが唯一のリフレッシュ手段)。ナビゲートはしない
- When: ラベル(アイコン・名前)をクリック / Then: `explorer.navigateTo(path)`(アクティブタブが移動)。展開状態は変えない
- 子のロード中はそのノードにローディング表示(シェブロンをスピナー化する等、控えめに)
- 子が 0 件(サブフォルダなし)のノード: 展開してもよいが子行は出ない。シェブロンは常に表示する(事前に子の有無は分からないため)
- アクティブタブの `currentPath` と一致するノードは `--selected-bg` でハイライト
- 子の取得失敗(権限等): `explorer.setError` でグローバルバナーに表示し、ノードは未展開に戻す

## 5. State & data model

新規ストア `src/store/tree.ts`(2 つ目のグローバルシングルトン。**ツリーはタブ間で共有**する設計):

```ts
interface TreeState {
  rootPath: string; // homeDir(), set once by init()
  expanded: Record<string, boolean>; // node path → expanded?
  children: Record<string, Entry[]>; // parent path → child DIRS only
  loading: Record<string, boolean>; // node path → fetching children?
}

export const tree = {
  state, // readonly access
  async init(): Promise<void>, // set rootPath = homeDir(), expand root
  async toggle(path: string): Promise<void>, // collapse: just flip; expand: fetch then flip
};
```

設計判断(実装時に変更しない):

- **ネストしたノードツリーではなく、パスをキーにしたフラットな Map 3 つ**で持つ。SolidJS ストアの更新粒度と相性がよく、任意ノードの無効化が `setState("children", path, ...)` で済む。再帰構造はコンポーネント側(`TreeNode` が `children[path]` を再帰レンダリング)にだけ現れる
- `children` に入れるのは `readDirectory` の結果を `is_dir` でフィルタしたもの。ファイル分のオーバーフェッチは許容する(シンプルさ優先)
- 展開時は毎回フェッチ(stale キャッシュ管理をしない)。フェッチ完了前に再クリックされた場合の多重フェッチは `loading[path]` ガードで抑止する
- ファイルリスト側(`explorer`)とはデータを共有しない。それぞれ独立にフェッチ・保持する

## 6. Backend commands

なし(`read_directory` を再利用)。

## 7. File changes

| ファイル | 種別 | 変更内容 |
| --- | --- | --- |
| `src/store/tree.ts` | 新規 | 上記 `TreeState` + facade(`init` / `toggle`) |
| `src/components/Sidebar.tsx` | 新規 | サイドバー枠 + ルート `TreeNode`。props: `rootPath`, `expanded`, `children`, `loading`, `currentPath`, `onToggle(path)`, `onNavigate(path)`(dumb に保つ。`tree` / `explorer` への参照は持たない) |
| `src/components/TreeNode.tsx` | 新規 | 1 ノード + 子の再帰レンダリング。Sidebar と同じ props を depth 付きで受ける(1 ファイルに収まるなら Sidebar 内のローカルコンポーネントでも可 — 300 行規約内なら実装者判断) |
| `src/components/Sidebar.module.css` | 新規 | 幅 200px 固定、`overflow-y: auto`、行高 28px、インデント、ハイライト(トークンのみ使用) |
| `src/App.tsx` | 変更 | 2 カラムレイアウト化。`tree.init()` を `onMount` に追加。Sidebar への配線 |
| `src/App.css` | 変更 | 2 カラム用のレイアウトクラス追加(必要最小限) |

アイコン: シェブロンは `lucide-solid/icons/chevron-right`(展開時 90° 回転)、フォルダは既存 `iconFor` を使わず `lucide-solid/icons/folder` 直 import で可(ツリーは常にフォルダのため)。

## 8. Edge cases

| 状況 | 期待動作 |
| --- | --- |
| サブフォルダが 1 つもないノードを展開 | 子行なしで展開状態になる(見た目は変化なしでよい) |
| 子取得が失敗(権限なし等) | エラーバナー表示、`expanded[path]` は false のまま |
| 展開中(loading)に再度シェブロンをクリック | 無視(多重フェッチしない) |
| ツリー外(ファイルリスト側)でフォルダを削除・移動した後 | ツリーは古いまま。該当ノードの親を閉じて開き直すと反映される(既知の制限) |
| 削除済みフォルダのラベルをクリック | `navigateTo` が失敗しエラーバナー表示、タブは現在地に留まる(`load()` の既存挙動) |
| 深い階層の長い名前 | 行内で ellipsis。横スクロールはさせない |
| アクティブタブのパスがツリー未展開の深い場所 | ハイライトは「表示されているノードのうち一致するもの」のみ。自動展開はしない(Non-goal) |

## 9. Acceptance criteria

- [ ] 起動時、左に 200px のサイドバーが表示され、ホーム直下のフォルダ一覧が見えている
- [ ] シェブロンクリックで展開/折りたたみができ、展開のたびに最新の子が取得される(ツリー外で作ったフォルダが、閉じて開き直すと現れる)
- [ ] ラベルクリックでアクティブタブがそのフォルダへ移動する(展開状態は不変)
- [ ] アクティブタブの現在地ノードがハイライトされる(タブ切り替えにも追従)
- [ ] 権限のないフォルダの展開でエラーバナーが出て、アプリは操作可能なまま
- [ ] サイドバーとファイルリストのスクロールが独立している
- [ ] ダークモードで配色が破綻しない

## 10. Test plan

### Vitest(純粋ロジックのみ)

なし(状態遷移は SolidJS ストア操作そのもので、抽出に値する純粋ロジックがない。`is_dir` フィルタは 1 行なのでテスト対象にしない)。

### Rust

なし。

### 手動検証手順

1. 起動 → サイドバーにホーム直下のフォルダが見える
2. ノードを展開 → 孫フォルダが見える。折りたたみ → 消える
3. ターミナルで `mkdir ~/Desktop/tree-test` → サイドバーの Desktop を閉じて開き直す → `tree-test` が現れる
4. ラベルクリック → 右側のファイルリストがそのフォルダに移動、ノードがハイライト
5. タブを 2 つ用意し別々のフォルダへ → タブ切り替えでハイライトが追従
6. `chmod 000` したフォルダを展開 → エラーバナー、ノードは閉じたまま(検証後 `chmod 755` で戻す)
7. OS をダークモードにして配色確認

## 11. Future work

- `read_directory` への `dirs_only` パラメータ追加(オーバーフェッチ解消)
- ファイル操作へのツリー自動追従(または手動リフレッシュボタン)
- アクティブパスへの自動展開・スクロール
- リサイズ可能なスプリッタ、サイドバーの表示/非表示トグル
- ツリーのキーボード操作
