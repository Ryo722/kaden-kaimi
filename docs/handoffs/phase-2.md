# Phase 2 引き継ぎ（自動化 / Workers Cron + 外部 API 連携）

このドキュメントは新しい Claude Code セッションで Phase 2 を開始する際の完全な指示書。
Phase 1（タスク 1〜5）が完了した状態を前提とする。

---

## 新セッションで貼り付けるプロンプト

次のブロック全体を新セッションに貼り付ける。

```
Phase 2（Workers Cron + 楽天/Yahoo! API 連携 + データ拡充）に着手してください。

準備:
1. CLAUDE.md でプロジェクト固有ルールを確認
2. docs/handoffs/phase-2.md を熟読（前セッションからの全申し送り事項）
3. ROADMAP.md の Phase 2 スコープ、docs/architecture.md、docs/api-integration.md を前提とする
4. TaskBreakdown-phase2.md を新規作成（既存の TaskBreakdown.md は Phase 1 専用として残す）

進行スタイル:
- サブタスク（P2.1〜P2.5）ごとに停止し、完了条件を確認してから次へ進む
- 秘密情報（楽天/Yahoo! API キー、GitHub PAT）は `.dev.vars` / `wrangler secret` で管理、
  コミットには絶対に含めない
- 外部 API を叩くコードには必ずリトライとレート制限対応を入れる
- 破壊的 or 公開に影響する操作（Workers デプロイ、Cron 有効化、GitHub Contents API への書込）は
  必ず実行前にコマンドを提示し、ユーザーの承認を得てから進める
- 中〜大規模変更にあたるため、節目で codex exec による差分レビューを実施
  （Phase 1 で codex:rescue スキルが遅延するため `codex exec` を Bash から直叩きする）

よろしくお願いします。
```

---

## 作業ディレクトリ

```
/Users/ryohanazaki/claude-workspace/projects/kaden-kaimi
```

---

## Phase 1 の成果サマリ

### タスク 1〜5 完了状況

- ✅ タスク 1: Astro + Cloudflare adapter + Tailwind v4 + React 19 + zod 4 の初期化
- ✅ タスク 2: zod スキーマ定義、ドラム式洗濯機 5 機種 × 30 日のサンプルデータ
- ✅ タスク 3: 5軸ロジック実装（constants / models / prices / similarity / roi / cycle / diff / matcher）
- ✅ タスク 4: 機種詳細ページ（5軸ダッシュボード、Lighthouse P100/A100）
- ✅ タスク 5: Cloudflare Pages デプロイ + GitHub Actions CI + Lighthouse CI（閾値 P90/A95/BP90/SEO90）

### Phase 1 最終状態

- **本番**: <https://kaden-kaimi.pages.dev/>
- **リポジトリ**: <https://github.com/Ryo722/kaden-kaimi>（Public）
- **テスト**: 133 tests pass / カバレッジ 97%
- **CI**: verify 46s / Lighthouse 1m27s、両 workflow green
- **Node 固定**: `.nvmrc=22.12.0`、`engines.node>=22.12.0`
- **パッケージマネージャ**: pnpm 10.32.1

### 検証済みコマンド（全て pass）

```bash
pnpm test                 # 133 tests passed
pnpm typecheck            # 0 errors / 0 warnings / 0 hints
pnpm lint                 # 0 errors
pnpm validate             # 5 models OK
pnpm build                # 5 機種 + index = 6 HTML prerender
pnpm exec lhci autorun    # P100/A100/BP96/SEO100
```

### Phase 1 の技術判断で Phase 2 に効くもの

- `data/models/drum-washer/*.json` には `externalIds.rakutenItemCode` と `yahooItemCode` フィールドが既にあり、現状は全て `null`。Phase 2 で埋める
- `data/prices/drum-washer/*.json` は各機種 30 日分、`history[]` は日付昇順・重複禁止（zod `superRefine`）。Phase 2 は末尾に追記する形で拡張
- `scripts/validate-data.ts` でファイル名 ↔ id 整合、predecessor/successor 相互参照、価格履歴の整合性を検査済み。Workers の書き込みコードはこの制約を必ず守る
- `src/lib/prices.ts` の `getDisplayPrice` / `getInternalPrice` の責務分担は Phase 2 でも維持
  - 表示用: `min(rakutenMin, yahooMin)`
  - 内部計算用: `rakutenAvg`
  - 全フィールド null のときは null 返却 → UI 側で msrp 代替

---

## Phase 2 のスコープ

ROADMAP.md の Phase 2 セクションを具体化したもの。

### ゴール

1. **価格データの自動更新**: Workers Cron が日次で楽天/Yahoo! API から価格を取得し、GitHub Contents API で `data/prices/*.json` に追記
2. **データカバレッジ拡大**: ドラム式洗濯機を 5 機種 → 15 機種に拡張
3. **運用の安定化**: 日次ジョブが 30 日連続で失敗なし、価格履歴の欠損率 1% 未満
4. **Lighthouse CI の 2 段構え化**: Phase 1 の `staticDistDir` 計測に加え、本番 preview URL 計測を追加（codex Warning #3 対応）

### 非スコープ

- カテゴリ拡張（ドラム式以外）→ Phase 3
- 会員機能・ログイン → Phase 4
- Amazon PA-API → Phase 3+
- メーカー公式サイトのスクレイピング → 永久禁止

---

## サブタスク分解（推奨）

新セッションで `TaskBreakdown-phase2.md` を新規作成し、以下を骨子とする。

### P2.1: 前提整備（人間作業含む）

- [ ] 楽天ウェブサービス開発者登録 → `applicationId` 取得（ユーザー作業）
- [ ] Yahoo! デベロッパーネットワーク登録 → `clientId` 取得（ユーザー作業）
- [ ] GitHub Fine-grained PAT 発行（`contents: write` / 対象: `Ryo722/kaden-kaimi` のみ）（ユーザー作業）
- [ ] `.dev.vars`（ローカル、gitignore 済み）に 3 つの secret を配置
- [ ] `wrangler secret put` で Cloudflare に 3 つの secret を登録
- [ ] 既存 5 機種の `externalIds.rakutenItemCode` / `yahooItemCode` を手動で埋める
  - 楽天の商品コードは `店舗ID:商品ID` 形式、Yahoo! は `store_id_itemcode` 形式
  - 判明しない機種は null のままでよい（keyword 検索にフォールバック）

### P2.2: Workers プロジェクトのスキャフォールド

- [ ] `workers/fetch-prices/` ディレクトリ作成
- [ ] `wrangler init` で Workers プロジェクト初期化（TypeScript、`nodejs_compat` フラグ有効）
- [ ] `wrangler.toml`:
  - `name = "kaden-kaimi-fetch-prices"`
  - `main = "src/index.ts"`
  - `compatibility_date` を最新の安定日付に
  - `[triggers] crons = ["0 20 * * *"]`（JST 05:00 = UTC 20:00）
- [ ] `package.json` にワークスペース化か、あるいは Workers 専用 `package.json` を分離
  - 推奨: **pnpm workspace 化**。ルートの `pnpm-workspace.yaml` に `workers/*` を追加
  - 理由: 型共有（`src/types/schema.ts` の zod スキーマを Workers 側でも使う）
- [ ] 最小の `src/index.ts` を書いてローカルで `wrangler dev --test-scheduled` が動くことを確認

### P2.3: 楽天 / Yahoo! API クライアント実装

- [ ] `workers/fetch-prices/src/rakuten.ts` — 商品検索 API 呼び出し
  - 入力: `modelNumber` または `rakutenItemCode`
  - 出力: `{ min, avg, available } | null`
  - リトライ: 指数バックオフ 1s → 4s → 9s、最大 3 回
  - レート制限: 1 秒 1 リクエスト（呼び出し側で制御）
- [ ] `workers/fetch-prices/src/yahoo.ts` — 同等、Yahoo! ショッピング V3
  - `in_stock=true` で在庫フィルタ
- [ ] 共通ユーティリティ: `workers/fetch-prices/src/http.ts`（`fetchWithRetry`、`sleep`）
- [ ] 単体テスト: MSW またはシンプルな fetch モックで 2 クライアントを網羅
  - 200 正常応答、429 リトライ成功、3 回失敗 → null 返却、レスポンス構造変化の fail-safe

### P2.4: GitHub Contents API クライアント + 書込パイプライン

- [ ] `workers/fetch-prices/src/github.ts`
  - `getFile(path)` → `{ sha, content }`（base64 → JSON）
  - `putFile(path, sha, content, message)` → 200/422 のハンドリング
  - 冪等性: 書き込み前に `history[]` の末尾日付を見て、同日レコードがあればスキップ
- [ ] `workers/fetch-prices/src/pipeline.ts` — オーケストレーション
  1. `data/models/**` を GitHub から取得
  2. 各機種に対して楽天 + Yahoo! API を並列実行（`Promise.allSettled` で 1 機種失敗を他に波及させない）
  3. 取得結果を `PriceRecord` に整形（`src/types/schema.ts` の `PriceRecordSchema` で検証）
  4. `data/prices/{category}/{modelId}.json` を取得 → 追記 → PUT
  5. 全機種完了後、成否サマリをログに出力
- [ ] エラー通知: Phase 2 前半は `console.log` レベル、後半で Cloudflare Logpush または Email

### P2.5: ローカルドライラン + 本番有効化

- [ ] `wrangler dev --test-scheduled` + `curl localhost:8787/__scheduled?cron=...` でローカル実行
- [ ] 特定の 1 機種だけを処理対象にする `TARGET_MODEL_ID` 環境変数（ドライラン用）
- [ ] `wrangler deploy` で本番投入、**ただし cron を有効化する前に手動トリガで 1 回動作確認**
- [ ] GitHub に PR が立ち、Cloudflare Pages が自動再ビルド → デプロイ、本番で最新価格が反映されることを確認
- [ ] Cron を JST 05:00 に有効化、初日の実行ログを確認

### P2.6: データカバレッジ拡大（並行可能）

- [ ] ドラム式洗濯機を 5 機種 → 15 機種に拡張
  - 日立: BD-STX130KL、BD-NV120HL
  - 東芝: TW-127XP3L（既存）、TW-127XH4L
  - シャープ: ES-X11A（既存）、ES-V11A、ES-W113-SL
  - パナソニック: NA-LX129DL（既存）、NA-LX127DL（既存）、NA-VX800CL、NA-VG2800R
  - AQUA: AQW-DX12P-W、AQW-D10P
  - 注: 上記は例、実在確認のうえ `data/models/drum-washer/` に追加
- [ ] 各機種の `predecessorId` / `successorId` / `externalIds` を手動整備
- [ ] `pnpm validate` でスキーマ・参照整合性を全件 pass

### P2.7: Lighthouse CI 2 段構え化

- [ ] PR 時: 従来通り `staticDistDir` で再現性重視
- [ ] main push / nightly: Cloudflare プレビュー URL（`{hash}.kaden-kaimi.pages.dev`）を `--collect.url` で指定
  - デプロイ完了を待ってから実行するため、`cloudflare/pages-action` の deployment 完了 webhook または `sleep` + polling
- [ ] `uses-http2` skip の再評価（CF は HTTP/2/3 なので preview URL 側では外せる）
- [ ] Lighthouse の `numberOfRuns: 2` → `3` へ（flake 耐性）

### P2.8: 完了処理

- [ ] `docs/devlog/YYYY-MM-DD.md` に Phase 2 記録（各 P2.x の判断と検証結果）
- [ ] `ROADMAP.md` の Phase 2 チェック、成功指標の実測値記入
- [ ] `TaskBreakdown-phase2.md` を全 `[x]`
- [ ] 次フェーズ（Phase 3: カテゴリ拡張）の handoff `docs/handoffs/phase-3.md` 作成
- [ ] codex exec による差分レビューと反映

---

## 技術スタック上の要注意事項

### Workers の Node.js 互換性

- `@astrojs/cloudflare` の `prerenderEnvironment: "node"` はビルド時専用、Workers ランタイムとは無関係
- Workers 側で `node:fs` などは使えない。必要な場面では KV / R2 / fetch を使う
- zod スキーマ（`src/types/schema.ts`）は Workers で動く（zod 4 は Workers 対応）
- `wrangler.toml` に `compatibility_flags = ["nodejs_compat"]` を入れると `node:crypto` などが使える（必要になった時のみ）

### pnpm workspace 化の影響

- ルート `package.json` に `"workspaces"` は書かず `pnpm-workspace.yaml` に書く（pnpm 方式）
- CI `actions/setup-node` の `cache-dependency-path: pnpm-lock.yaml` は workspace 全体 lock で共通のまま OK
- 既存 `.github/workflows/ci.yml` は `pnpm install --frozen-lockfile` が workspace でも動く
- Workers 単体テスト用の `vitest` は Workers 固有 `@cloudflare/vitest-pool-workers` を検討

### GitHub Contents API の注意

- 大きなファイルは非対応（1MB 超は Git Data API）。価格履歴 1 機種 30 日で数 KB なので当面問題なし
- 連続書込で 409 conflict が出る可能性。機種単位で逐次処理（並列化しない）
- コミット author は `workers-bot <bot@kaden-kaimi.example.com>` 等の固定文字列（人間との識別）

### レート制限

- 楽天: 1 秒 1 リクエスト。15 機種 × 2 API = 30 req。機種間に 1s の sleep を入れても 30 秒で完走
- Yahoo!: 1 日 50,000 リクエストまでで実質制限なし
- GitHub API: 認証済みで 5,000 req/hour。15 機種 × (GET + PUT) = 30 req/日で余裕

### 秘密情報の三重管理

| 情報 | ローカル | Workers | GitHub Actions |
|---|---|---|---|
| `RAKUTEN_APP_ID` | `.dev.vars` | `wrangler secret` | 使わない |
| `YAHOO_CLIENT_ID` | `.dev.vars` | `wrangler secret` | 使わない |
| `GITHUB_TOKEN`（PAT） | `.dev.vars` | `wrangler secret` | 使わない（Workers 専用） |
| `CLOUDFLARE_API_TOKEN` | 不要 | 不要 | 必要になれば Secret 追加 |

- `.dev.vars` は `.gitignore` 済み、絶対にコミットしない
- PAT は Fine-grained、`contents: write`、対象 repo を `Ryo722/kaden-kaimi` のみに限定
- インシデント時の対応は CLAUDE.md のセキュリティポリシー参照

### Git / PR 運用

- Conventional Commits（Phase 1 で確立済み）
- Workers のデプロイコミットが自動で入らないよう、Workers は `workers/` ディレクトリ配下で完結させる
- Cron の手動トリガで価格が取得できたら、その日の PR に `chore(prices): daily update YYYY-MM-DD` として自動コミット
- 自動コミットを PR レビューでブロックしないよう、main 直 push を許可する運用にするか、`skip-review` ブランチ戦略を検討（Phase 2 前半で決める）

---

## 前提整備（Phase 2 着手前のユーザー作業）

セッション開始前に以下を済ませておくと最速。

1. **楽天ウェブサービス**（<https://webservice.rakuten.co.jp/>）
   - 開発者登録 → アプリ登録 → `applicationId` 取得
2. **Yahoo! デベロッパーネットワーク**（<https://developer.yahoo.co.jp/>）
   - アプリケーション登録 → `clientId` 取得
3. **GitHub Fine-grained PAT**
   - Settings → Developer settings → Personal access tokens → Fine-grained tokens
   - Repository access: `Ryo722/kaden-kaimi` のみ
   - Repository permissions: `Contents: Read and write`
   - 有効期限: 90 日以内
4. **Cloudflare ワークスペース**
   - `wrangler login` は Phase 1 で完了済み
   - 必要なら `wrangler whoami` で確認

---

## 完了条件

Phase 2 完了判定（すべて満たすまで継続）:

- [ ] `workers/fetch-prices/` が本番にデプロイされ、日次 Cron が有効化されている
- [ ] 本番で 7 日連続で Cron が成功（欠損率 < 1%）
- [ ] データカバレッジ: ドラム式洗濯機 15 機種以上、すべて `pnpm validate` pass
- [ ] `externalIds` が埋まった機種で実価格が `data/prices/**` に反映されている
- [ ] Lighthouse CI が 2 段構え化され、preview URL 計測でも閾値 pass
- [ ] 秘密情報のコミット 0 件、gitleaks 全 pass
- [ ] `docs/devlog/` に Phase 2 の記録（各判断、問題と解決、最終検証）
- [ ] `ROADMAP.md` の Phase 2 チェック、Phase 3 handoff 作成

---

## コミット戦略

Phase 2 は段階的に進めるため、以下の粒度でコミットを分けるのを推奨:

1. `chore: scaffold workers/fetch-prices project` (P2.2)
2. `feat: rakuten api client with retry` (P2.3 前半)
3. `feat: yahoo api client` (P2.3 後半)
4. `feat: github contents api writer with idempotency` (P2.4 前半)
5. `feat: price fetch pipeline` (P2.4 後半)
6. `feat: expand drum-washer dataset to 15 models` (P2.6)
7. `ci: add preview url lighthouse measurement` (P2.7)
8. `docs: phase 2 completion record` (P2.8)

Workers デプロイそのものはコードに残らないため、Wrangler のデプロイ ID / 実行ログを devlog に添付する。

---

## 参照ドキュメント（読む順）

1. `CLAUDE.md` — プロジェクト固有ルール（自動ロード）
2. `docs/devlog/2026-04-24.md` — Phase 1 全体の判断記録と検証結果（タスク 5 まで）
3. `ROADMAP.md` — Phase 2 スコープと成功指標
4. `docs/architecture.md` — システム構成図、データフロー、セキュリティ境界
5. `docs/api-integration.md` — 楽天 / Yahoo! / GitHub API 仕様、レート制限、リトライ
6. `docs/data-schema.md` — zod スキーマの意味（価格履歴の整合性制約）
7. `src/types/schema.ts` — Workers 側でも再利用する zod スキーマ
8. `src/lib/prices.ts` — 表示用 vs 内部計算用の価格選択ロジック
9. `.lighthouserc.json` — Phase 2 で 2 段構え化する設定

### 参考リンク

- Cloudflare Workers Cron Triggers: <https://developers.cloudflare.com/workers/configuration/cron-triggers/>
- Workers + TypeScript: <https://developers.cloudflare.com/workers/languages/typescript/>
- Wrangler secret: <https://developers.cloudflare.com/workers/configuration/secrets/>
- GitHub Contents API: <https://docs.github.com/en/rest/repos/contents>
- 楽天ウェブサービス: <https://webservice.rakuten.co.jp/>
- Yahoo! ショッピング API: <https://developer.yahoo.co.jp/webapi/shopping/>
- pnpm workspace: <https://pnpm.io/workspaces>
- @cloudflare/vitest-pool-workers: <https://developers.cloudflare.com/workers/testing/vitest-integration/>

---

## 既知の未解決事項（Phase 2 内で決める）

- **独自ドメインの取得判断**: 機種カバレッジが 15 → 30 規模になるタイミングで SEO 観点から検討
- **Workers Cron の通知先**: Cloudflare Logpush / Email Routing / Discord webhook のいずれか
- **main 直 push vs Bot PR**: 自動コミットのフローを PR ベースにするか直接 push にするか。PR ベースだと Cloudflare Pages プレビューが毎日立ち、ビルドコストが増える
- **データ拡充の手動 vs 半自動**: 15 機種の初期投入は手動、その後の新機種追加は Workers に発見ロジックを載せるか（Phase 3 で判断）
- **Lighthouse GitHub App 導入**: `LHCI_GITHUB_APP_TOKEN` を発行して PR に詳細スコアをコメント表示するか
- **codex exec の呼び出し方**: Phase 1 終盤で `codex:rescue` スキルが遅延する挙動を確認済み。Phase 2 では最初から `codex exec` を Bash から直叩きする
