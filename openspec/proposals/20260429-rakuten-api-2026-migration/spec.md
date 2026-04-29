---
id: 20260429-rakuten-api-2026-migration
title: 楽天ウェブサービス API 2026 新仕様への移行（openapi.rakuten.co.jp / accessKey / Referer 必須）
status: proposed
created: 2026-04-29
risk: 大
deprecation_when: "新エンドポイントで 7 日連続全機種の rakuten 取得が成功し、旧エンドポイント廃止日 2026-05-13 を越えた時点で archived"
---

## なぜ（背景）

- 2026-02-10 楽天ウェブサービスから API 全面リプレース告知。旧 `app.rakuten.co.jp` は **2026-05-13 完全停止**
- 本プロジェクトの `workers/fetch-prices` は旧仕様のまま稼働。`.dev.vars` の `RAKUTEN_APP_ID` は新仕様 UUID 形式（Developer Dashboard 再登録済）だが、コードが旧 endpoint・旧認証のため全機種で 4xx → null 化
- 2026-04-26〜04-28 の本番ラン全機種で `rakutenMin: null`（実 API 呼び出しは 100% 失敗、Yahoo! 単独で `skipped_empty` 回避）
- ライブ検証結果:
  - 旧 endpoint: `400 specify valid applicationId`（旧 20 桁数字フォーマットに UUID を渡したため拒否）
  - 新 endpoint: `400 accessKey must be present as a query parameter or in the header`（applicationId は通過、accessKey 不足）
- 認証失敗が `if (!response.ok) return null` で握りつぶされており、2 ヶ月以上 silent。再発防止のため観測ログを併せて追加する

## delta（変更仕様）

<!-- MODIFIED -->
- `workers/fetch-prices/src/rakuten.ts`
  - `RAKUTEN_ENDPOINT` を `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401` に変更
  - URL パラメータに `accessKey`（必須）と `formatVersion=2` を追加
  - HTTP ヘッダに `Referer` と `Origin` を追加（無いと 403 `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`）
  - レスポンスパーサを新フォーマット（`items[]` 直下フラット、`items[].itemPrice` / `items[].availability` / `items[].itemCode`）に変更。旧 `Items[].Item.*` 二重ネストは廃止
  - `RakutenSearchInput` に `accessKey: string`（必須）と `referer: string`（必須）を追加
  - 4xx 受領時に `console.warn` で `{ status, errorCode, errorMessage, applicationIdPrefix }` を 1 行記録（値はマスク）。再発検知用の最低限の観測

- `workers/fetch-prices/src/pipeline.ts`
  - `PipelineEnv` に `RAKUTEN_ACCESS_KEY: string` と `RAKUTEN_REFERER: string` を追加
  - `searchRakuten` 呼び出し時に上記 2 つを渡すよう変更

- `workers/fetch-prices/src/index.ts`
  - `requireSecrets` の必須リストに `RAKUTEN_ACCESS_KEY` と `RAKUTEN_REFERER` を追加（fail-fast 維持）

- `workers/fetch-prices/wrangler.toml`
  - `[vars]` に `RAKUTEN_REFERER = "https://kaden-kaimi.pages.dev/"` を追加（公開可、シークレットではない）
  - `RAKUTEN_ACCESS_KEY` は wrangler secret で別途登録（リポジトリには載せない）

- `workers/fetch-prices/.dev.vars.example`
  - `RAKUTEN_APP_ID` のコメントを「20 桁の数字」→「UUID 形式（Developer Dashboard 再登録で発行）」に修正
  - `RAKUTEN_ACCESS_KEY` を新規追加（`pk_` で始まる文字列）
  - `RAKUTEN_REFERER` のコメント追記（dev.vars に置かなくても wrangler.toml で配布されるが、ローカルオーバーライドする場合用）

- `workers/fetch-prices/src/rakuten.test.ts`
  - フィクスチャを新仕様 `formatVersion=2` のフラット構造に書き直し
  - `accessKey` 必須・`Referer` 必須のリクエスト URL/ヘッダ検証を追加
  - 4xx 受領時のログ出力を verify するテストを追加

- `workers/fetch-prices/src/pipeline.test.ts`
  - mock の searchRakuten 呼び出し引数に `accessKey` / `referer` が含まれることを検証

- `docs/api-integration.md`
  - 「楽天ウェブサービス（商品検索 API）」節を新仕様で書き換え
  - 旧仕様は「2026-05-13 廃止」と note を残しつつ archive 区画へ

<!-- ADDED -->
- `docs/devlog/2026-04-29.md` を新規作成し、移行経緯と検証手順を記録
- `decision-log.md` に「rakuten-api-2026-migration」エントリを追加（背景・代替案否決理由・廃止条件）

<!-- REMOVED -->
- 旧エンドポイント定数の参照は完全削除（暫定併存はしない）。理由: 旧 API は 2026-05-13 で完全停止のため二系統維持の運用コストが見合わない

## 制約・非スコープ

- Yahoo! ショッピング API（v3）は本 spec の対象外（移行不要、稼働継続を確認済み）
- 価格.com 等の追加データソースはスコープ外（規約違反リスク、永久除外）
- `affiliateId` 連携はスコープ外（本プロジェクトはアフィリ報酬を扱わない）
- 既存の `data/prices/drum-washer/*.json` のうち 2026-04-26〜04-28 の `rakutenMin: null` レコードは保持（履歴として残す）。soft delete も置換も行わない
- 観測ログは `console.warn` 最小限のみ。Cloudflare Logs 上の alert ルール化は別 spec

## 受け入れ条件

- [ ] 新 endpoint `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401` で `applicationId` + `accessKey` + Referer/Origin ヘッダを伴うリクエストが 200 を返し、`items[]` から price を抽出できること（ローカル live test で確認）
- [ ] 既存テスト全件 pass。`rakuten.test.ts` の新フィクスチャ・新検証を含む
- [ ] `requireSecrets` で `RAKUTEN_ACCESS_KEY` 未設定時にスケジューラが fail-fast で abort すること
- [ ] 4xx 受領時に Workers ログに 1 行残り、applicationId 値そのものが漏れないこと（先頭4文字までのマスクのみ）
- [ ] ドライラン（`TARGET_MODEL_ID=panasonic-na-lx129dl`）で `rakutenMin` / `rakutenAvg` に数値が入った PriceRecord が書き込まれること
- [ ] 全機種ドライランで楽天ヒット 0 件機種を集計し、Yahoo! 単独成立件数（=`skipped_empty` ではなく `written` だが `rakutenMin: null` のもの）と区別できること
- [ ] `docs/api-integration.md` と `docs/devlog/2026-04-29.md` が新仕様準拠に更新されていること

## 設計判断

- **二系統併存しない**: 旧 API は 14 日後に停止。二経路維持はメンテ負荷とテスト負債が大きい。一括切替後にロールバックが必要なら git revert で十分
- **Referer / Origin 両方付ける**: 公式仕様書には必須記載なしだが、Qiita / Zenn / Hatena 等複数の独立した実装報告で「無いと 403」が確認されている。値は `https://www.rakuten.co.jp/` でも通るが、自プロジェクトのドメインを使うほうが将来の rate limit 別枠化に備えられる
- **formatVersion=2 採用**: `items[].item.*` の二重ネストよりフラット構造のほうがパーサが単純。旧 `Items[].Item.*` のキャメルケース差分（capital → lowercase）と相まって、フラットにしたほうが移行ミスが減る
- **wrangler.toml の vars に Referer**: 公開しても害がないため secret にしない。secret 化すると wrangler secret 経由の管理対象が増えてオペレーション負荷が増える
- **観測ログを silent fix にしない**: 今回の症状が 2 ヶ月以上気付かれなかった主因は `!response.ok → return null` の握りつぶし。同等の事故を二度起こさないため、本 PR で必ず最小ログを足す。値マスクで秘密漏洩リスクは抑制
- **applicationId のローテーション不要**: 新仕様 UUID は流出しても accessKey と Referer の組み合わせが要るため、単独では悪用不能。旧 ID（20 桁数字）はもう存在しないので失効作業も不要

## 検証順序（リリース手順）

1. 本 spec を `proposed` で commit
2. コード変更 + テスト更新の PR を作成（main 直 push しない）
3. ローカル: `.dev.vars` に `RAKUTEN_ACCESS_KEY` を追記し、curl で新 endpoint 200 確認
4. PR マージ後、本番に `pnpm --filter kaden-kaimi-fetch-prices exec wrangler secret put RAKUTEN_ACCESS_KEY`
5. 1 機種ドライラン（`TARGET_MODEL_ID=panasonic-na-lx129dl`）→ `rakutenMin` 数値確認
6. 全機種手動 invoke → `skipped_empty` 件数 0、`rakutenMin` 充足確認
7. 翌日以降 cron で 7 日連続観測 → spec を `implemented`
8. 2026-05-13 を越え、旧 endpoint への参照が完全に消えていることを確認 → `archived`
