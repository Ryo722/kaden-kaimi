# 楽天 0 件問題の恒久対応 ハンドオフ

4/27 ドライラン（`docs/devlog/2026-04-27.md`）で「brand 名併記でも楽天 API は機種によって 0 件継続」が確定した。本ファイルは恒久対応の **着手判断基準** と **観測スクリプト設計案** を残し、優先度 3 で spec 化する際の前提資料とする。

- 起票日: 2026-04-27
- 起票者: 4/27 セッション
- 着手予定: 本番 cron 7 日観測完了後（早くて 2026-05-05 以降）
- spec 化先: `/spec-task` で `openspec/proposals/<YYYYMMDD>-rakuten-zerohit-permanent-fix/spec.md`

---

## 背景

`docs/devlog/2026-04-27.md#楽天-0-件問題の恒久対応次の判断` を参照。要旨:

- 楽天ウェブサービス API の `Ichiba/Item Search` は brand 名併記 keyword でも機種によって 0 件のままの場合がある（4/27 観測: panasonic-na-lx129dl で 0 件継続、Yahoo は ¥220k で実機ヒット）
- 現状 pipeline は `searchRakuten` が `null` を返した場合 Yahoo 単独で PriceRecord 成立する（フォールバック設計、`workers/fetch-prices/src/rakuten.ts` 冒頭 docstring に明記）
- 楽天 0 件は障害ではなく許容される定常状態だが、**価格データの片肺化**（楽天が安値のケースを取り逃す）リスクは残る

## 着手判断基準

7 日観測（`docs/deploy-checklist.md` の D）でヒット率データを集めてから候補を選ぶ。データなしで先行着手すると候補選択の根拠が弱い。

| 楽天ヒット率（15 機種中） | 採用候補 | 理由 |
|---|---|---|
| 12 機種以上で 0 件（極端に低い） | **候補 1**: `externalIds.rakutenItemCode` 手動投入 | 費用対効果が出る。手動運用 15 機種 ≒ 低 |
| 3〜11 機種で散発的に 0 件 | **候補 3**: 7 日連続 0 件検出スクリプト | 全機種手動投入は過剰、検出後にピンポイント対処 |
| 13 機種以上でヒット | **候補 2**: Yahoo 単独運用許容（現状追認） | 追加運用ゼロ、片肺リスクは許容範囲 |

境界は目安。実データで判断。

---

## 候補一覧（再掲）

### 候補 1: `externalIds.rakutenItemCode` の手動投入

- `data/models/drum-washer/*.json` の `externalIds.rakutenItemCode` を機種ごとに手動で埋める
- 楽天 API を keyword 検索から `itemCode` 直接ルックアップに切り替え
- メリット: 0 件問題が消える、検索ノイズも消える
- デメリット: 15 機種 × メンテ運用コスト。商品入れ替わりで itemCode が無効化するリスク（年 1〜2 回再投入が必要な可能性）
- 実装規模: 中（pipeline 分岐追加、`searchRakuten` の lookup モード追加、データスキーマ拡張、テスト追加）

### 候補 2: Yahoo 単独運用を許容（現状追認）

- 楽天 null は許容される定常状態と割り切り、Yahoo の hit を最低保証ラインとする
- メリット: 追加運用ゼロ、コード変更ゼロ
- デメリット: 価格データの片肺化（楽天が安値のケースを取り逃す）
- 実装規模: 0（現状の挙動）

### 候補 3: 7 日連続 0 件検出スクリプト（運用コスト最小化）

- Workers 構造化ログを後段で集計し、楽天 7 日連続 0 件の機種を抽出
- 抽出された機種のみ候補 1（手動 itemCode 投入）を適用
- メリット: 候補 1 の運用コストを「問題機種だけ」に絞れる
- デメリット: 集計基盤が必要（Workers ログのエクスポート手段を要決定）
- 実装規模: 小〜中（集計スクリプト + 候補 1 の段階適用）

---

## 観測スクリプト設計案（候補 3 前提）

候補 3 を採用する場合、または候補 1/2 でも観測指標として有用なため、ワンショット集計スクリプトの設計案を残す。spec 化後に実装。

### 入力

Workers 構造化ログ（Cloudflare Workers Logpush または `wrangler tail` の出力を保存したもの）。`event: scheduled.model_result` イベントを対象。

```jsonc
// 構造化ログ例（既存）
{"event":"scheduled.model_result","modelId":"panasonic-na-lx129dl",
 "status":"written","reason":null,
 "rakutenItemCode":null,"yahooItemCode":"...",
 "rakutenFilteredOutByMinPrice":0,"yahooFilteredOutByMinPrice":0}
```

`rakutenItemCode === null` を「楽天 0 件」のシグナルとする（filter で 0 件になった場合は `rakutenFilteredOutByMinPrice > 0` で区別可能）。

### 出力

```jsonc
// 機種別ヒット率レポート
{
  "windowStart": "2026-04-28",
  "windowEnd": "2026-05-04",
  "windowDays": 7,
  "byModel": [
    {
      "modelId": "panasonic-na-lx129dl",
      "rakutenHits": 0,
      "rakutenZeroDays": 7,
      "yahooHits": 7,
      "consecutiveRakutenZero": 7,
      "candidate": "candidate-1"  // 7 日連続 0 件 → 手動投入対象
    },
    ...
  ],
  "summary": {
    "totalModels": 15,
    "rakutenZeroAllDays": 5,
    "rakutenHitAllDays": 8,
    "rakutenMixed": 2
  }
}
```

### 実装方針案

**ロケーション**: `scripts/analyze-rakuten-hit-rate.ts`（root の TypeScript script、`tsx` または `node --experimental-strip-types` で実行）

**入力ソースの選択肢**:

1. **Logpush 経由（推奨、運用コスト中）**: Cloudflare Workers Logpush → R2 / S3 に保存 → スクリプトで JSON line を読む
2. **手動エクスポート（運用コスト小、初回向け）**: `wrangler tail --format json > logs/cron-YYYYMMDD.jsonl` を運用ルーチン化、スクリプトで読む
3. **Cloudflare Analytics Engine（要 worker 改修）**: worker から AE にメトリクス書込、SQL で集計

初回は選択肢 2 で MVP、観測継続なら 1 への昇格を検討。

**処理フロー**:

1. ログファイル群を読み、`event: scheduled.model_result` のみフィルタ
2. `modelId` でグルーピング、日付（`scheduled.start` の `scheduledTime` から JST 日付に変換）で集計
3. 連続 0 件日数を計算（`rakutenItemCode === null` && `rakutenFilteredOutByMinPrice === 0` で「真の 0 件」、filter での 0 件は別カウント）
4. 7 日窓で `consecutiveRakutenZero >= 7` の機種を `candidate: "candidate-1"` でマーキング
5. JSON レポートを stdout、人間可読サマリを stderr に出力

**テスト**:

- ログサンプル fixture を `scripts/__fixtures__/rakuten-logs/` に置く
- 集計関数を pure function として切り出し、Vitest で単体テスト
- 7 日連続 0 件の境界値（6 日 / 7 日 / 8 日）をテスト

---

## spec 化時のチェックリスト

優先度 3 着手時に以下を spec に書き起こす:

- [ ] 採用候補（1 / 2 / 3 のいずれか、観測データの根拠付き）
- [ ] 候補 1 採用時: 対象機種リスト、`externalIds.rakutenItemCode` の取得手順、無効化検出フロー
- [ ] 候補 3 採用時: 観測スクリプトのファイルパス、入力ソース、テスト範囲
- [ ] データスキーマ変更があるか（`schema.ts` の `externalIds` 拡張など）
- [ ] 既存テストへの影響範囲
- [ ] ロールバック手順

---

## 参照

- `docs/devlog/2026-04-27.md` — 楽天 0 件問題の発生経緯と 4/27 ドライラン結果
- `workers/fetch-prices/src/rakuten.ts` — フォールバック挙動の docstring
- `docs/deploy-checklist.md` — 7 日観測（D-1〜D-3）への引き継ぎ元
