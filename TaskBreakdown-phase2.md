# Phase 2 (自動化 / Workers Cron + API 連携 + データ拡充) タスクブレイクダウン

Phase 2 の完了条件は `ROADMAP.md` の Phase 2 成功指標および `docs/handoffs/phase-2.md` 「完了条件」を参照。

記法: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了 / `[!]` ブロック中

## P2.1 前提整備（人間作業含む）

- [x] P2.1.1 楽天ウェブサービス開発者登録 → `applicationId` 取得（2026-04-25 完了）
- [x] P2.1.2 Yahoo! デベロッパーネットワーク登録 → `clientId` 取得（2026-04-25 完了）
- [x] P2.1.3 GitHub Fine-grained PAT 発行（`contents: write` / 対象: `Ryo722/kaden-kaimi` のみ / 有効期限 90 日以内）（2026-04-25 完了）
- [x] P2.1.4 `.dev.vars`（リポジトリ直下、gitignore 済み）に 3 つの secret を配置（2026-04-25 完了、`.dev.vars.example` をテンプレートとしてコミット予定）
- [ ] P2.1.5 `wrangler secret put` で Cloudflare Workers に 3 つの secret を登録（**P2.2 後に実行**）
- [x] P2.1.6 既存 5 機種の `externalIds.rakutenItemCode` / `yahooItemCode` は **案 B 採用：null 継続、keyword 検索フォールバックで運用**（2026-04-25 確定。P2.5 ドライラン後に判明分を後追い記入）

**完了条件**: `.dev.vars` にローカル用 secret が揃い、externalIds の運用方針が決まっている → 達成（P2.1.5 は P2.2 後）。

## P2.2 Workers プロジェクトのスキャフォールド

- [x] P2.2.1 `pnpm-workspace.yaml` を作成し `workers/*` を含める（2026-04-25）
- [x] P2.2.2 `workers/fetch-prices/` 手動スキャフォールド（package.json / tsconfig.json / src/index.ts）
- [x] P2.2.3 `wrangler.toml` 整備
  - `name = "kaden-kaimi-fetch-prices"`、`main = "src/index.ts"`
  - `compatibility_date = "2026-04-25"`、`compatibility_flags = ["nodejs_compat"]`
  - `[triggers] crons = ["0 20 * * *"]`（JST 05:00 = UTC 20:00、日本は DST なし）
  - `[vars]` に公開設定（GITHUB_OWNER / REPO / BRANCH / GIT_AUTHOR_*）
  - `[observability] enabled = true`
- [x] P2.2.4 `workers/fetch-prices/package.json` 分離（zod / wrangler 4.84 / @cloudflare/workers-types / vitest / typescript）
- [x] P2.2.5 最小 `src/index.ts`（scheduled ハンドラ + secrets 検証ロジック、JSON 構造化ログ）
- [x] P2.2.6 `wrangler dev --test-scheduled` + `curl /__scheduled?cron=...` で動作確認 — HTTP 200、`scheduled.start` ログ、未配置時の `missing_secrets` 検知を確認（2026-04-25）
- [ ] P2.2.7 Workers 用テスト環境（`@cloudflare/vitest-pool-workers` 導入は P2.3 と一緒に実施）
- [x] P2.2.8 ルート `eslint.config.mjs` を Worker globals 対応・`**/dist/**` 除外に拡張、`globals` パッケージ追加
- [x] P2.2.9 ルート `tsconfig.json` の exclude に `workers` を追加（astro check と分離）
- [x] P2.2.10 Astro adapter が生成する `.wrangler/deploy/` との衝突回避用 `clean:astro-deploy` pre-script を導入

**完了条件**: `pnpm --filter kaden-kaimi-fetch-prices dev` でローカル起動でき、手動トリガで scheduled が走る → 達成。

**残作業（ユーザー操作）**: 既存ルート `.dev.vars` を `workers/fetch-prices/.dev.vars` に移動（→ P2.5 で本番動作前に完了させる）。

## P2.3 楽天 / Yahoo! API クライアント実装

- [x] P2.3.1 `workers/fetch-prices/src/http.ts` — `fetchWithRetry`（指数バックオフ `attempt^2 * 1000ms` = 1s, 4s、最大 3 回）、`sleep`、`FetchError`、リトライ対象 `[429, 500, 502, 503, 504]` + ネットワーク例外
- [x] P2.3.2 `workers/fetch-prices/src/rakuten.ts` — 楽天 IchibaItem 商品検索 API（itemCode 優先、未指定なら keyword フォールバック、hits=5 / sort=+itemPrice、min/avg/available 集約、構造変化 fail-safe）
- [x] P2.3.3 `workers/fetch-prices/src/yahoo.ts` — Yahoo! ショッピング V3 API（appid 認証、results=5、in_stock=true 強制、yahooItemCode 優先 query、構造変化 fail-safe）
- [x] P2.3.4 共通の `PriceQuote` 型を `src/types.ts` に切り出し（min/avg/available/hitCount/topItemCode）
- [ ] P2.3.5 レート制限：機種間 1s sleep（**呼び出し側で制御** → P2.4 パイプラインで実装）
- [x] P2.3.6 構造変化に対する fail-safe（Items/hits 欠落、価格非数値、JSON パース失敗、3xx/4xx/5xx すべて null 返却）
- [x] P2.3.7 `vitest.config.ts`（v8 coverage、閾値 80%）
- [x] P2.3.8 単体テスト 34 ケース（http 10 / rakuten 12 / yahoo 12）

**完了条件**: Workers 側 `vitest` で楽天・Yahoo! クライアントのテストが全 pass → 達成。

**実測値**:
- 34 tests pass
- カバレッジ: stmts 92.03% / branches 88.23% / funcs 100% / lines 97.87%
- typecheck / lint: 0 errors

## P2.4 GitHub Contents API + 書込パイプライン

- [x] P2.4.1 `workers/fetch-prices/src/github.ts`
  - `getFile` → `{ sha, text } | null`（base64 → UTF-8、404 → null）
  - `putFile` → 422/409/401 を `GitHubApiError` 化、5xx/429 は fetchWithRetry が自動リトライ
  - `listDirectory` → `DirEntry[]`（カテゴリ配下のモデルファイル列挙）
  - `nodejs_compat` の `Buffer` で UTF-8 セーフ base64
- [x] P2.4.2 `workers/fetch-prices/src/pipeline.ts`
  1. `listDirectory(data/models/{category})` で機種を列挙
  2. 各機種 JSON を `getFile` → 軽量 `WorkerModelSchema` で validate
  3. 楽天 + Yahoo! API を `Promise.allSettled` で並列実行、片方失敗を許容
  4. `PriceRecord` を組み立て、`PriceRecordSchema` で validate（A 案セーフティ）
  5. 既存 `data/prices/{category}/{modelId}.json` を取得 → 同日付があれば skip（冪等性）
  6. 末尾追記 → `PriceHistorySchema` で全体 validate → `putFile` で PUT
  7. 機種間に 1 秒 sleep（楽天 1 req/s 制限）
  8. 結果サマリ（written / skippedDuplicate / skippedEmpty / failed / categoryError）
- [x] P2.4.3 `workers/fetch-prices/tsconfig.json` の include に `../../src/types/schema.ts` を追加して shared zod スキーマを再利用、`@types/node` 追加で `node:buffer` 解決
- [x] P2.4.4 単体テスト 22 ケース（pipeline 13 / github 16）+ 既存 34（http 10 / rakuten 12 / yahoo 12）= **67 ケース**
  - happy path / 冪等性 / 既存履歴追加 / 全 null skip / 片方 null 採用
  - listDirectory 失敗（categoryError） / model schema 不正 / put 失敗 / 既存 history 不正
  - TARGET_MODEL_ID フィルタ、機種間 sleep の呼び出し検証
- [x] P2.4.5 `index.ts` scheduled ハンドラに pipeline 結線、JSON 構造化ログ（category_summary / model_result / done / fatal）
- [x] P2.4.6 `jstDateString` で UTC → JST 日付変換（DST なし、+9h 固定）
- [x] P2.4.7 自動コミット先を **A 案（main 直 push）** に確定（2026-04-25）
  - セーフティネット: zod 二段検証（PriceRecord + PriceHistory）、追記のみ・上書き禁止、構造化ログ
  - `categoryError` で list 失敗を per-model failure と分離

**完了条件**: ローカルドライラン（1 機種）で `data/prices/**` に新日付が追記され、同日再実行で no-op になる → ロジック上達成（実 API 経由の検証は P2.5）。

**実測値**:
- workers test: **67 passed**
- workers coverage: stmts 93.09% / branches 85.71% / funcs 93.54% / lines 95.2%
- 全テスト合計: **200 passed**（root 133 + workers 67）
- bundle 549.81 KiB / gzip 82.80 KiB（zod 含む、Workers Free 1 MB 制限の 8%）

## P2.5 ローカルドライラン + 本番有効化

### ステップ A: ドライラン用ブランチでのテスト（2026-04-25 完了）

- [x] P2.5.A1 `phase-2-dryrun` ブランチを作成し origin に push
- [x] P2.5.A2 `.dev.vars` に `GITHUB_BRANCH=phase-2-dryrun` と `TARGET_MODEL_ID=panasonic-na-lx129dl` を追記（ローカル限定上書き）
- [x] P2.5.A3 `wrangler dev --test-scheduled` + `curl /__scheduled` で実 API 経由ドライラン
  - 結果: `written: 1, failed: 0, durationMs: 2017`
  - GitHub commit `8205597` が `phase-2-dryrun` に作成（author: `kaden-kaimi-bot`）
- [x] P2.5.A4 GitHub 上のコミット差分を目視確認 — JSON 末尾に 7 行追加のみ、構造保持
- [x] P2.5.A5 同じコマンドを再実行して冪等性確認
  - 結果: `skipped_duplicate, reason: date_already_exists`、コミット重複なし

### ⚠️ ステップ A で発覚した残課題（次セッションの最優先事項）

書き込まれた価格レコード:
```json
{ "date": "2026-04-25", "rakutenMin": null, "rakutenAvg": null,
  "yahooMin": 1320, "yahooAvg": 3987 }
```
楽天は `keyword=NA-LX129DL` でヒット 0 件、Yahoo! は部品ショップ「andonya」の `y_n-gy1x10` が top hit となり、実機ではなく**部品・付属品の価格**が混入。

**原因**: P2.1.6 で「案 B（externalIds null 継続、keyword フォールバック）」を採用したため、品番文字列でしか絞れていない。

**対策（2026-04-26 実装完了）**:
- [x] P2.5.D1 価格下限フィルタを追加（カテゴリごとの `minPrice` を `src/lib/constants.ts` に `CATEGORY_PRICE_FLOOR` として定義、ドラム式は ¥50,000）
- [x] P2.5.D2 `workers/fetch-prices/src/rakuten.ts` / `yahoo.ts` の `Search Input` に `minPrice` を追加し、(a) URL クエリ（`minPrice` / `price_from`）と (b) 集約段でのクライアント側フィルタの二段で除外。`pipeline.ts` から `CATEGORY_PRICE_FLOOR[category]` を渡す
- [x] P2.5.D3 単体テスト 9 件追加（rakuten 4 / yahoo 4 / pipeline 1）— 「下限未満を除外」「全て下限未満なら null」「クエリ送出」「未指定時は省略」「pipeline から 50000 が両クライアントへ伝搬」
- [ ] P2.5.D4 再ドライラン（`phase-2-dryrun` ブランチを再利用）して、まともな価格になることを確認 — **ユーザー作業（手順は `docs/devlog/2026-04-26.md`）**

### ステップ B: 本番デプロイ（D 完了後に着手）

- [ ] P2.5.B1 `.dev.vars` から `GITHUB_BRANCH` / `TARGET_MODEL_ID` 上書きを削除
- [ ] P2.5.B2 `wrangler secret put` で本番 Workers に 3 つの secret 登録
- [ ] P2.5.B3 `wrangler deploy` で本番投入（cron は wrangler.toml で有効状態のままデプロイされる点に注意）
- [ ] P2.5.B4 本番 Worker に手動トリガで 1 回動作確認（Cloudflare ダッシュボードまたは `wrangler tail`）
- [ ] P2.5.B5 main ブランチに自動コミットが追加され、Cloudflare Pages が自動再ビルド、本番で最新価格が反映されることを確認
- [ ] P2.5.B6 cron 初回実行（JST 05:00）のログを翌朝確認

### ステップ C: クリーンアップ

- [ ] P2.5.C1 `phase-2-dryrun` ブランチを GitHub と local から削除
- [ ] P2.5.C2 `.dev.vars` の現状（dryrun 上書きあり）を README または devlog に記録

**完了条件**: Cron が JST 05:00 に有効化され、初回自動実行が成功し、まともな価格が main に書き込まれる。

## P2.6 データカバレッジ拡大（5 → 15 機種、P2.2〜P2.5 と並行可能）

- [ ] P2.6.1 追加機種の選定（メーカー横断、実在確認）
  - 日立: BD-STX130KL、BD-NV120HL
  - 東芝: TW-127XH4L
  - シャープ: ES-V11A、ES-W113-SL
  - パナソニック: NA-VX800CL、NA-VG2800R
  - AQUA: AQW-DX12P-W、AQW-D10P
  - （上記は `docs/handoffs/phase-2.md` の例。実在を確認して採用）
- [ ] P2.6.2 各機種の `data/models/drum-washer/*.json` を作成
- [ ] P2.6.3 `predecessorId` / `successorId` の双方向整合を取る
- [ ] P2.6.4 `externalIds`（判明分のみ、不明は null）
- [ ] P2.6.5 初期価格履歴（手動シードまたは msrp ベース推定、Workers が翌日以降に埋める）
- [ ] P2.6.6 `pnpm validate` が 15 件全て pass
- [ ] P2.6.7 機種一覧ページ or ナビゲーションへの反映（Phase 3 で本格化するなら、トップページに列挙のみ）

**完了条件**: ドラム式洗濯機 15 機種以上で `pnpm validate` / `pnpm build` pass、本番で 15 機種ページが閲覧可能。

## P2.7 Lighthouse CI 2 段構え化

- [ ] P2.7.1 PR: 従来通り `staticDistDir` で再現性重視（既存 workflow 維持）
- [ ] P2.7.2 main push / nightly: Cloudflare プレビュー URL (`{hash}.kaden-kaimi.pages.dev`) を `--collect.url` で計測
  - deployment 完了 polling（`gh api /repos/.../deployments` + `statuses`）または固定 sleep
- [ ] P2.7.3 `uses-http2` skip を preview URL 側では外す再評価（CF は HTTP/2/3）
- [ ] P2.7.4 `numberOfRuns: 2 → 3`（flake 耐性）
- [ ] P2.7.5 Lighthouse GitHub App 導入検討（P2.8 で判断）

**完了条件**: main push の Lighthouse workflow が preview URL 計測でも閾値 pass。

## P2.8 完了処理

- [ ] P2.8.1 `docs/devlog/YYYY-MM-DD.md` に Phase 2 の判断・検証結果を記録
- [ ] P2.8.2 `ROADMAP.md` の Phase 2 チェック、成功指標の実測値（欠損率、連続成功日数）を追記
- [ ] P2.8.3 `TaskBreakdown-phase2.md` を全 `[x]`
- [ ] P2.8.4 `docs/handoffs/phase-3.md` を作成（カテゴリ拡張：エアコン、冷蔵庫）
- [ ] P2.8.5 codex exec による差分レビューを実施、指摘を反映

**完了条件**: Phase 3 に遷移できる状態（本番安定稼働 + 文書更新 + 引き継ぎ完成）。

## 依存関係

```
P2.1 ─┬─ P2.2 → P2.3 → P2.4 → P2.5
      └─ P2.6（並行可）
                            ↓
                         P2.7 → P2.8
```

- P2.1 の API キーと PAT が揃うまで P2.5 の実 API 叩きは不可
- P2.6 は P2.2〜P2.5 と独立して進められる
- P2.7 は P2.5 完了後（preview URL 計測のため deployment 完了が必要）
- P2.8 は Phase 2 の全工程の最後

## 未解決事項（Phase 2 内で決める）

- [ ] 独自ドメインの取得判断（機種数 15 → 30 のタイミング、SEO 観点）
- [ ] Workers Cron 通知先（Cloudflare Logpush / Email Routing / Discord webhook）
- [ ] 自動コミットのフロー: main 直 push か Bot PR か
- [ ] データ拡充の手動 vs 半自動（Phase 3 で Workers に発見ロジック）
- [ ] Lighthouse GitHub App 導入可否（`LHCI_GITHUB_APP_TOKEN`）
