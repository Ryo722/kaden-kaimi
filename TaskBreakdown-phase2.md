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

- [ ] P2.3.1 `workers/fetch-prices/src/http.ts` — `fetchWithRetry`（指数バックオフ 1s→4s→9s、最大 3 回）、`sleep`
- [ ] P2.3.2 `workers/fetch-prices/src/rakuten.ts` — 楽天商品検索 API
  - 入力: `{ modelNumber, rakutenItemCode? }`
  - 出力: `{ min, avg, available } | null`
  - `itemCode` 優先、無ければ `keyword`
  - 単体テスト 4 ケース
- [ ] P2.3.3 `workers/fetch-prices/src/yahoo.ts` — Yahoo! ショッピング V3 API
  - `in_stock=true` 指定
  - 単体テスト 4 ケース
- [ ] P2.3.4 レート制限: 機種間 1s sleep を呼び出し側で制御
- [ ] P2.3.5 構造変化に対する fail-safe（期待するフィールドが欠落した場合は null 返却）

**完了条件**: Workers 側 `vitest` で楽天・Yahoo! クライアントのテストが全 pass。

## P2.4 GitHub Contents API + 書込パイプライン

- [ ] P2.4.1 `workers/fetch-prices/src/github.ts`
  - `getFile(owner, repo, path, ref?)` → `{ sha, content }`（base64 → JSON）
  - `putFile(owner, repo, path, sha, contentJson, message, author)` → 422/409 ハンドリング
  - 大文字 `GITHUB_TOKEN` ではなく、秘密情報は env 経由で取得
- [ ] P2.4.2 `workers/fetch-prices/src/pipeline.ts`
  1. `data/models/**` を GitHub から取得（Workers ランタイムのため fs 不可）
  2. 各機種に対して楽天 + Yahoo! API を並列実行（`Promise.allSettled`）
  3. 取得結果を `PriceRecord` に整形（zod `PriceRecordSchema` で検証）
  4. `data/prices/{category}/{modelId}.json` を GET → 末尾日付と比較し冪等化 → PUT
  5. 全機種完了後、成否サマリをログ出力
- [ ] P2.4.3 `src/types/schema.ts` を Workers からも import できるよう tsconfig / workspace を調整
- [ ] P2.4.4 単体テスト: パイプラインを fetch モックで動かし、冪等性・部分失敗・並列処理を確認

**完了条件**: ローカルドライラン（1 機種）で `data/prices/**` に新日付が追記され、同日再実行で no-op になる。

## P2.5 ローカルドライラン + 本番有効化

- [ ] P2.5.1 `TARGET_MODEL_ID` 環境変数でドライラン対象を絞る
- [ ] P2.5.2 `wrangler dev --test-scheduled` で実 API を叩き、GitHub に test branch で書込（可能なら）
- [ ] P2.5.3 `wrangler deploy` で本番投入（Cron 無効化状態）
- [ ] P2.5.4 手動トリガ（`wrangler triggers deploy` / fetch エンドポイント）で 1 回動作確認
- [ ] P2.5.5 GitHub に PR が立ち、Cloudflare Pages が自動再ビルド、本番で最新価格が反映されることを確認
- [ ] P2.5.6 `wrangler.toml` の `[triggers] crons` を有効化し再デプロイ
- [ ] P2.5.7 初日の Cron 実行ログを確認

**完了条件**: Cron が JST 05:00 に有効化され、初回自動実行が成功。

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
