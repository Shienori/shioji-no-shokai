# HANDOFF

更新日: 2026-11-01（JST、PR #40統合後）

## 現在の状態

- 更新前に確認したmain: `11414e0c96610ca8de6c50d50fc07a82340c00e1`（PR #40マージ）
- この更新はHANDOFF.mdのみ。ゲームコードは変更しない
- 現行バージョン記録: `v0.2.3`。今回バージョン更新なし、実画面の表示再確認は未記録
- PR #38: normal補充保証・難易度別余裕率をmainへ統合済み。マージコミット `4b4359d1b72703a994732ec9c8de138af99d348d`
- PR #40: 提示/受注IDの一意化・提示ID指定受注・テスト/CIをmainへ統合済み
- PR #39: main→fix/contract-id-integrityの取り込みPR。最新照会ではclosed・merged=true・merged_by=github-actions[bot]。PR APIのmerged_atは2026-11-01T10:40:39Z。マージせず手動クローズしたPRではない
- open PR: 0件（今回一覧照会時点）
- PR #38・#40を含む最新mainのproduction READYと統合後実画面動作は未確認。以前の確認済み状態と区別する
- 外部ソフトが必要なマップ関連は後回し

## 今回mainへ統合した変更

### 1. 受注後補充のnormal保証

対象: `shioji-no-shokai-mvp/src/state/gameStore.ts`

- 通常枠は固定チュートリアルを除く各港3件。normalは難易度タグであり、通常枠という意味とは区別する
- 受注した提示IDだけを取り除き、残存normal件数を数える
- 補充件数 = max(0, 3 - 残存件数)、必要normal件数 = max(0, 2 - 残存normal件数)
- 不足normalを候補がある限り優先し、残り枠は難易度を限定せず抽選
- 残存提示のID・期限・順序を維持。残存テンプレートと重複する新規提示は生成しない
- normal候補不足時は他難易度で補充。全候補不足時は重複を作らず3件未満を許容
- 旧セーブなどでnormal0件の2提示が残った場合、残存提示を消さずnormal1件の補充までとする。1回で最低2件へ強制修復しない
- 初期生成・定期更新・補充で選択処理を共通化
- 「各港3件中normal最低2件」と「生成全体で70%以上」は別条件。後者は今回保証していない

### 2. 難易度別の期限余裕率

対象: `src/domain/contractSchedule.ts`（以下src/testsはMVP配下）

- hard: 1.0以上1.5未満、normal: 1.5以上2.5未満、easy: 2.5以上3.0以下。タグ未設定はnormal
- 新規生成する提示に適用。タグと無関係な1〜3一様抽選は廃止
- 基準速力6ノット、バッファ1時間、ゲーム時間倍率による換算、期限の30分切り上げは維持
- 期限は生成時に固定し通常受注時にそのまま引き継ぐ。提示済み/受注済みの期限を遡及変更しない
- タグは生成時の区分であり時間経過で変更しない。船ごとのETA適性とは別
- 難易度の画面表示は未追加。契約詳細の「余裕あり/注意/ぎりぎり」は船のETA適性で、easy/normal/hard表示ではない
- 報酬、貨物単価、貨物数量、船の能力、固定チュートリアルの期限計算は変更しない

### 3. 提示ID・受注ID・テンプレートIDの分離

対象: `src/domain/contractIdentity.ts`（追加）、`contractSchedule.ts`、`contractAcceptance.ts`、`src/state/gameStore.ts`、`src/pages/MainPage.tsx`、`src/components/contract/ContractBoard.tsx`

- templateIdは雛形の識別、提示idは提示インスタンス、受注idは受注インスタンスを識別
- 提示/受注IDはcrypto.randomUUIDを優先し、代替生成と連番を備える。受注idにtemplate.idを直接使用しない
- 一覧の選択・React key・詳細・受注まで提示IDを引き継ぐ。港切替時に選択解除。消えた提示を同一テンプレートの別提示で代替しない
- 通常依頼は選択港に存在する提示IDとテンプレートIDが一致する場合だけ受注
- 期限切れ（現在時刻と同じ場合を含む）、非有限期限、不明な提示/テンプレートを拒否
- 受注済みまたは航海中の追加受注を拒否。所在港・停泊状態・容積/重量制限は維持
- 提示なしの期限新規計算は固定チュートリアルのみ。完了済み/旧履歴による再受注禁止は維持
- 船・航海・Voyage Memoへ受注IDを引き継ぐ
- 旧セーブ全般を保証する新しい移行処理は追加していない。旧IDを一律に振り直さない
- gameStore/ContractBoard等には既存IDブランチ由来の広い整形差分も含む。今後は機能修正と整形を分ける

## テスト・CIの記録

### テストファイル

- `tests/contractIdentity.test.mjs`: 提示/受注ID一意性、航海参照、期限保持、JSON往復、連続生成
- `tests/contractAcceptanceStore.test.mjs`: 正確な提示選択、重複提示の区別、二重受注/不正提示/期限/船条件の拒否、チュートリアル、保存読込
- `tests/normalOfferReplenishment.test.mjs`: normal保証、残存提示維持、候補不足、初期生成、定期更新。受注呼出し2か所を提示IDへ変更
- `tests/contractDifficultySchedule.test.mjs`: 余裕率の範囲/境界値、未設定normal、期限計算/引継ぎ、報酬保持、チュートリアル
- 補充テストの「乱数0なら必ずhard」という候補順序依存の期待値は撤去し、normal2件残存時は補充後normal最低2件を検証

### 競合解消と検証結果の根拠

- 旧IDブランチの受注/補充/期限変更とmainのPR #38が同じ箇所で重なり競合した
- 準備コミット `e4817fdb6666392cf6adbf6d4cb94da8a5a611fb` で両仕様を保持。ファイル修正だけではマージ履歴は統合されないためActionsで実際にmainを取り込んだ
- 一度CI失敗あり。Actions内の検査文字列item.idを実装のoffer.idへ修正し、開始時ログ保存を追加
- 検証ワークフロー起動コミット: `75b2bde1d0749a6056bbf7a3d1b3de1eece1b979`
- Actions生成の取り込みコミット: `cde8cd1efb3ac33b8059cc4600cd1f1505955f13`、メッセージ `Merge main into contract ID branch and align replenishment assertions`
- この取り込みコミットが実ブランチに反映され、PR #40のcleanを確認してからmainへマージ
- ワークフローは4テストとnpm run buildの全成功時だけpushするため、条件付きpush完了を根拠に検証通過と判断した。ただし実行ジョブの最終結論・詳細ログ・個別成功件数は直接取得できていない
- 実行URL: https://github.com/Shienori/shioji-no-shokai/actions/runs/41298510349
- 最新HEADのPRチェック一覧にはVercel Preview Comments成功のみを確認。これ自体をテスト成功の根拠にはしない

### CI設定の制約

- `.github/workflows/contract-id-tests.yml`: fix/contract-id-integrityへのpush限定。ID・受注・補充テストとビルドを実行。難易度テストはこの継続ジョブには未追加
- `.github/workflows/reconcile-contract-main.yml`: 同ブランチで同workflowファイル変更時だけ起動。contents: writeを持つ今回用の取り込み処理
- 取り込み元main SHAは`4b4359d...`に固定。競合解消は事前確認した3ファイルだけを対象にし、想定外競合は停止。検証失敗時はpushしない。mainへはpushしない
- 両CIはmain/通常PR全般の継続テスト設定ではない。取り込み用CIを今後の汎用自動マージに流用しない。停止/削除や汎用CI整備は別途承認のうえ実施

## ユーザー動作確認の記録

- 2026-11-01、今回の修正前のVoyage Memo本番動作、契約生成/受注、新貨物の一連の動作の3項目すべてをユーザーが正常動作確認済みと報告
- Voyage Memoの一覧→詳細、再受注時の航海番号区別、精算後ETA差分/収支、再読込保持を含む確認対象として案内
- 新貨物は対象港の表示→受注→積込→航行→荷卸→精算→Voyage Memoを確認対象として案内
- normal補充保証の実装後にもユーザーから正常動作確認済みとの報告あり
- 後にユーザーから問題なしとの申告あり。ただしPR #40統合後の本番個別検証とは区別する
- アシスタントは実画面未検証。旧セーブ全般・重量/容積境界の網羅検証は未記録

## 既存機能・貨物記録（維持）

- Voyage Memo: V.01形式で受注時作成、精算時ETA差分/収支を記録。航海番号で再受注を区別。PR #34で一覧/詳細を統合
- 鋼材7G、絹布5G、小麦3G、鉄鉱石4G。既存契約報酬は単価/距離加算に合わせ調整済み
- 鉄鉱石（箱）: 単価4G、容積1、重量3、荷役30秒/30秒
- 陶器（箱）: 単価7G、容積2、重量1、荷役35秒/35秒
- 木材（丸太）: 単価2G、容積2、重量2、荷役25秒/25秒
- ワイン（樽）: 単価10G、容積1、重量2、荷役50秒/50秒
- 陶器/木材/ワインのテンプレート追加済み。鮮魚は追加していない
- 追加貨物の出発港: 陶器/ワインはアルデラ、木材/鉄鉱石はリゲル
- 初期船は容積10・重量20。木材6個は容積12、8個は容積16で初期船に積載不可。将来船向けとして残すか数量調整するかは未決定。勝手に変更しない

## PR整理

- #13: 対応・移植・マージせずクローズ済み。機能実装完了とは扱わない
- #25: マージせずクローズ済み。船団/船詳細/デバッグの機能完了を意味しない
- #34: Voyage Memo一覧/詳細、マージ済み
- #38: normal補充保証・難易度別余裕率、マージ済み
- #39: main→IDブランチ。Actions取り込みに伴いGitHub上merged=true・closed。以前の会話の「まだopen/クローズ未実施」は最新照会結果で訂正
- #40: ID分離・正確な受注・テスト/CI、mainへマージ済み
- 統合済みブランチの削除は未実施。不要ブランチ整理は別途承認が必要

## デプロイ記録

- Vercel: `shienori/shioji-no-shokai-v.01b`
- projectId: `prj_jydUXpuDI3Hn7vmINnrrNz8FKmck`、accountId: `team_3rqP6Te8VZsFD5fIfycFAy6W`
- 本番URL: https://shioji-no-shokai-v01b.vercel.app/
- 今回引き継ぎ開始時のmain `a1e85f543d56d8fd6fb91d80e65be97ade58acd6` はGitメタデータを照合してproduction READYと本番エイリアス割当を確認済み
- そのdeploymentId: `dpl_AnzG9Si2ue7kVfcW2giXYZ61ghqQ`、固有URL: https://shioji-no-shokai-v01b-a2fhaa9ik-shienori.vercel.app/
- PR #34マージ `c045695fff734005ba1653cf90a416980081c9b3` のproduction READYも履歴確認済み
- 過去のPR #37マージ `08fff8e3ded82f000724acc92517997ccd79b93c` もproduction READYの記録あり。URL: https://shioji-no-shokai-v01b-2fxq5tivj-shienori.vercel.app/ （過去デプロイ）
- IDブランチのpreview成功と最新mainのproduction反映は別。PR #40マージ `11414e0...` およびこの文書更新後のSHAのproduction READYは未照会
- 以前の誤ったprojectIdによる照会0件をデプロイ不存在の根拠にしない

## 次の作業

1. 必要時、最新mainのproductionを正しいprojectId・Git SHAで照合し、READYと統合後の実画面確認を分ける。以前の確認済み項目を未実施と誤記しない
2. ユーザーは次の機能追加を希望。内容は未指定のため、対象機能を決めてから最新main起点で着手する
3. 残仕様: 同一テンプレートの同時提示重複・航海中の再提示の扱い。IDで区別できることと生成を許す仕様は別
4. 残仕様: 木材契約の数量方針。難易度表示UIも未追加だが、追加指示は未確定
5. 必要に応じ旧セーブ互換性、容積/重量境界、再受注→精算→メモを追加検証
6. main/PR向けの継続CI、今回用CIの整理、統合済みブランチ整理を検討。勝手に削除しない

## 今後の開発運用

- 同じ処理の変更は原則1本ずつ実装→検証→main統合まで完了させる。未統合の依存変更があれば統合順序を先に決める
- 最新ファイルを取得し必要箇所だけ修正。機能変更と広い整形/リファクタリングを分ける
- コミット済み・自動検証済み・main統合済み・production READY・実画面確認済みを区別する
- 次回再開時も最新main・PR・Vercelを再照合。外部書き込み/マージ/削除は対象と内容を提示し承認後に実施
