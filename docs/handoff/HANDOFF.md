# 『潮路の商会』開発引き継ぎ

## 最終更新

- 日時: 2026-10-12 18:07
- ブランチ: `feature/fleet-position-hex-map`
- 最新Push済みコミット: `c89b089f324e4745f6667f7a6f5de155236de344`
- 状態: 契約板UI再設計が未Push

## 現在の状況

### Push済み

- 艦隊画面のモバイル幅と余白を固定
- 船位置をHEXマップ上に表示
- 航海中の船位置を段階的に更新
- BFS経路計算を `src/domain/routePath.ts` に共通化
- 未使用コードを削除
- 1秒ごとのゲームTickを `App.tsx` に追加

### 未Push

契約板UIをスマホ向け情報階層へ再設計する変更が未Pushです。

対象ファイル:

- `shioji-no-shokai-mvp/src/components/contract/ContractBoard.tsx`
- `shioji-no-shokai-mvp/src/components/contract/ContractCard.tsx`
- `shioji-no-shokai-mvp/src/styles/globals.css`

## 次にやること

1. 契約板UI再設計を `feature/fleet-position-hex-map` へPushする。
2. `list_commits` でPush後の最新コミットSHAを確認する。
3. Vercelの `list_deployments` で対象コミットのビルド状態とプレビューURLを確認する。
4. 成功したプレビューURLをユーザーへ提示する。
5. 作業完了後、この `docs/handoff/HANDOFF.md` を最新状態へ更新してPushする。

## 契約板UI再設計の内容

### コミットメッセージ

```text
契約板をスマホ向け情報階層に再設計

- 契約板ヘッダーに港名と件数を追加
- 契約カードを航路・運行条件・報酬の構成に整理
- 詳細導線とタップ領域を明確化
- 契約板専用のモバイルCSSを追加

Refs #5
Refs #6
```

### ContractBoard.tsx

- `section` に `contract-board` クラスを設定する。
- ヘッダーに「契約板」「セレネ港発の輸送依頼」「契約件数」を表示する。
- 契約カード一覧を `contract-list` で囲む。

### ContractCard.tsx

カードの表示順は以下にする。

1. 貨物名タイトル
2. 右側に「詳細 ›」
3. 出発港 → 到着港
4. 貨物と必要積載量の2列
5. 納期
6. 提示報酬と見込純利益の2列

計算式は維持する。

```ts
const netProfit = Math.floor(contract.offeredReward * 0.7);
const requiredLoadUnits = cargo.loadUnitsPerUnit * contract.quantity;
```

### globals.css

契約板専用クラスを追加する。

- `contract-board`
- `contract-board-header`
- `contract-count`
- `contract-list`
- `contract-card`
- `contract-card-heading`
- `contract-card-detail`
- `contract-card-route`
- `contract-route-arrow`
- `contract-facts`
- `contract-fact-label`
- `contract-fact-value`
- `contract-deadline`
- `contract-reward`
- `contract-reward-item`

カードは全幅・48px以上の高さ・14pxパディングを持ち、カード全体をタップ対象にする。

## 重要な実装メモ

- 船の現在地は `ship.currentHexId` に保存する。
- `sailing` に移ると、船は出発港の隣接海域HEXへ配置される。
- 航海中は経路の中間HEXを段階的に移動し、到着時に到着港HEXへ移動する。
- 現在位置はオレンジHEXと濃紺の `⛵船名` で表現する。
- 赤色マーカーは廃止済み。
- 航路は黄褐色の線のみで表示する。
- `getRouteHexIds(fromPortId, toPortId)` にBFS経路計算を集約済み。

## 関連Issue・PR

- Issue #5
- Issue #6

## 検証・プレビュー

- 最終確認済みプレビュー: `https://shioji-no-shokai-v01b-2z9kcmjrl-shienori.vercel.app`
- 対象コミット: `c89b089f324e4745f6667f7a6f5de155236de344`
- 契約板UIPush後は、新しいコミットに紐づくVercelプレビューURLを確認して提示する。

## 次スレッド用の冒頭指示

```text
まず GitHub の Shienori/shioji-no-shokai リポジトリから
docs/handoff/HANDOFF.md を取得して読み込んでください。

その内容に従い、未完了タスク・最新コミット・次の作業を確認してから、
作業を開始してください。

作業完了後は、docs/handoff/HANDOFF.md を最新状態に更新し、
GitHubへPushしてください。
```
