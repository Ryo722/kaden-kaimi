# タスク5 引き継ぎ（Phase 1 / デプロイ）

このドキュメントは新しい Claude Code セッションでタスク 5 を開始する際の完全な指示書。
前セッション（2026-04-24）でタスク 1〜4 を完了した状態を前提とする。

---

## 新セッションで貼り付けるプロンプト

次のブロック全体を新セッションに貼り付ける。

```
Phase 1 のタスク 5（Cloudflare Pages デプロイ + Lighthouse CI）を進めてください。

準備:
1. CLAUDE.md でプロジェクト固有ルールを確認
2. docs/handoffs/task-5.md を熟読（前セッションからの全申し送り事項）
3. TaskBreakdown.md § 5、docs/architecture.md、docs/devlog/2026-04-24.md を前提とする

進行スタイル:
- 以下の順に進め、各ステップで人間の確認を挟む
  CP1: GitHub リポジトリ作成 + 初回 push
  CP2: Cloudflare Pages プロジェクト作成 + GitHub 連携
  CP3: 本番デプロイ成功確認
  CP4: プレビュー環境（PR 単位）動作確認
  CP5: GitHub Actions ワークフロー（lint / typecheck / test / validate / build / Lighthouse CI）
  CP6: Lighthouse CI の予算と閾値設定（Performance 90+ / Accessibility 95+）
- 破壊的 or 公開に影響する操作（GitHub への push、Cloudflare プロジェクト作成、本番切替）は
  必ず実行前にコマンドを提示し、ユーザーの承認を得てから進めること
- 秘密情報（Cloudflare API トークン、GitHub PAT）はコミットに含めない
- 中〜大規模変更にあたるため、完了時点で codex exec による差分レビューを実施

よろしくお願いします。
```

---

## 作業ディレクトリ

```
/Users/ryohanazaki/claude-workspace/projects/kaden-kaimi
```

---

## 前セッション（2026-04-24）の成果サマリ

### タスク 1〜3（既出）
詳細は `docs/devlog/2026-04-24.md`。

- Astro 6.1.9 / TypeScript strict / Tailwind v4 / React 19 / zod 4
- 5 軸ロジック実装済み（constants / models / prices / similarity / roi / cycle / diff / matcher）
- サンプルデータ: ドラム式洗濯機 5 機種 + 各 30 日の価格履歴

### タスク 4（機種詳細ページ）— 直前セッションで完了

- `src/pages/washers/[modelId].astro` で 5 機種を prerender
- サーバー計算: 軸1（代替候補）/ 軸3（買い時シグナル）/ 軸5（世代差分）
- React Island（`client:visible`）: 軸2 ROI 計算機 + 拡張要因（故障リスク + 洗剤節約 + 非金銭メリット翻訳）、軸6 条件マッチング
- `src/lib/page-data.ts` で全データを 1 回読み込み props 配布
- Lighthouse: **Performance 100 / Accessibility 100**（NA-LX129DL で計測）
- codex exec による差分レビュー実施、Warning 3 / Info 4 を全件反映

### 検証済みコマンド（全て pass）

```bash
pnpm test          # 133 tests passed
pnpm typecheck     # 0 errors / 0 warnings / 0 hints
pnpm lint          # 0 errors
pnpm validate      # 5 models OK
pnpm build         # 5 機種 + index の計 6 HTML を prerender
```

git は本セッション内で 3 コミット追加（詳細は `git log --oneline`）。
**リモートは未設定**。タスク 5 で初回 push する前提。

---

## タスク 5 の実施内容

TaskBreakdown.md § 5 参照。サブタスクは 5.1〜5.5。

### CP1: GitHub リポジトリ作成 + 初回 push

- リポジトリ名候補: `kaden-kaimi`（プロジェクト名そのまま）
- Visibility: `public` / `private` をユーザーに確認
- GitHub CLI または Web UI で作成
- 初回 push（`main` ブランチ）

**注意**
- グローバル CLAUDE.md の「Claude は `git push` を実行しない」ルール遵守。コマンドをユーザーへ提示して手動実行してもらう
- 秘密情報・`.env` が含まれていないか `git log --stat` で確認

### CP2: Cloudflare Pages プロジェクト作成 + GitHub 連携

- `wrangler login` は前セッションで完了済み
- Cloudflare Pages の GitHub 連携で自動デプロイを設定
- ビルドコマンド: `pnpm build`
- 出力ディレクトリ: `dist/client`（`@astrojs/cloudflare` アダプタ経由のため）
  - **注意**: アダプタは `dist/server`（関数用）と `dist/client`（静的ファイル）を出力する。
    静的プロジェクトとして運用するなら `dist/client` を出力先に指定するか、ラッパー用 Worker を登録
- Node.js バージョン: 20+（`.nvmrc` に `20` 等を記載推奨）
- 環境変数: Phase 1 時点では不要（楽天/Yahoo! API キーは Phase 2）

### CP3: 本番デプロイ成功確認

- `*.pages.dev` の URL（ドメイン未取得）で全 5 機種 + index が開く
- トップから各機種への遷移が動作
- React Island（ROI / 条件マッチング）が hydrate される
- 初回 SSR 時に `node:fs` が動くことを確認（`prerenderEnvironment: "node"` のため、
  Pages 側は静的ファイルのみ配信されれば OK）

### CP4: プレビュー環境の動作確認

- Pull Request を作ると自動でプレビュー環境が生成される
- テスト PR として `docs/*` の軽微な変更で確認
- プレビュー URL と本番 URL が別管理であることを確認

### CP5: GitHub Actions ワークフロー

`.github/workflows/` に CI を追加:

- `ci.yml`（push / PR）: `pnpm install` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm validate` → `pnpm build`
- Node 20 / pnpm 10 のセットアップ（`actions/setup-node` + `pnpm/action-setup`）
- テストは並列実行せず逐次で十分（133 件で数秒）
- Astro のキャッシュ（`~/.astro`, `node_modules/.astro`）を Actions キャッシュに載せるかは任意

### CP6: Lighthouse CI 組み込み

`@lhci/cli` を使う構成:

- `.lighthouserc.cjs`（または `.lighthouserc.json`）に閾値を設定
  - Performance: 90
  - Accessibility: 95
  - Best Practices: 90（目安）
  - SEO: 90（目安）
- GitHub Actions ワークフロー `lighthouse.yml` を追加
- Pages のデプロイ後に Lighthouse CI を叩くか、`lhci autorun` でビルドして計測
- 失敗時は PR をブロックするか warning 留めにするかユーザーに確認

---

## 技術スタック上の要注意事項

### `@astrojs/cloudflare` + static output
- `astro.config.mjs` は `output: "static"` + `adapter: cloudflare({ prerenderEnvironment: "node" })`
- `prerenderEnvironment: "node"` は **ビルド時の prerender 実行環境** のみに影響（Cloudflare ランタイムではなく Node で動く）
- 本番はフル静的 HTML を配信するため Cloudflare Workers の Node 互換フラグは不要
- Phase 2 で SSR を入れる場合は `nodejs_compat` + `compatibility_date` を wrangler 経由で設定

### Cloudflare Pages のビルド設定
- Framework preset: `Astro`
- Build command: `pnpm build`
- Build output directory: `dist/client`
- Root directory: `/`
- Node version: 環境変数 `NODE_VERSION=20` または `.node-version` ファイル

### Git / PR 運用
- Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:` / `test:` 等）
- `main` 直接 push ではなくトピックブランチ + PR を推奨（CI が本格稼働してから）
- CI / Cloudflare プレビューが通ることを merge 条件に

### 秘密情報
- GitHub PAT: Fine-grained、`contents: write` 権限のみ、対象リポジトリ限定
- Cloudflare API トークン: Pages:Edit 権限のみ
- どちらも `wrangler secret` / GitHub Secrets に格納、コミット・ログ・PR 本文に含めない
- インシデント発生時はグローバル CLAUDE.md のローテーション手順

---

## 完了条件

以下をすべて満たすまでタスク 5 は未完了:

- [ ] TaskBreakdown.md § 5 すべて `[x]`
- [ ] 本番 `*.pages.dev` URL で 5 機種 + index がアクセス可能
- [ ] PR でプレビュー URL が自動生成される
- [ ] GitHub Actions で `lint` / `typecheck` / `test` / `validate` / `build` がグリーン
- [ ] Lighthouse CI で Performance 90+ / Accessibility 95+ が本番 URL に対して pass
- [ ] `docs/devlog/YYYY-MM-DD.md` 作成（デプロイ URL、ワークフロー設定、発生した問題と解決を記録）
- [ ] `ROADMAP.md` の Phase 1 完了マークを検討

---

## コミット戦略

タスク 5 は段階的に進めるためコミットも分ける:

1. `chore: add .github/workflows/ci.yml` (CP5 の CI 最初のバージョン)
2. `chore: add lighthouse CI workflow and config` (CP6)
3. `docs: task 5 deployment notes` (devlog 追記)

Cloudflare Pages プロジェクトの作成そのものはコードに残らない（Cloudflare 側の設定）ため、
Cloudflare ダッシュボードのスクリーンショットやコマンド履歴を devlog に残す。

---

## 参照ドキュメント（読む順）

1. `CLAUDE.md` — プロジェクト固有ルール（自動ロード）
2. `docs/devlog/2026-04-24.md` — タスク 1〜4 の判断記録と検証結果
3. `TaskBreakdown.md` § 5 — タスク一覧
4. `docs/architecture.md` — インフラ構成（Cloudflare Pages / Workers Cron）
5. `astro.config.mjs` — prerenderEnvironment 設定
6. `package.json` — scripts（dev / build / test / validate 等）

### 参考リンク

- Astro + Cloudflare Pages: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
- Cloudflare Pages ビルド設定: https://developers.cloudflare.com/pages/configuration/build-configuration/
- Lighthouse CI: https://github.com/GoogleChrome/lighthouse-ci
- pnpm で GitHub Actions: https://pnpm.io/continuous-integration#github-actions

---

## 既知の未解決事項

- 独自ドメイン取得判断: Phase 2 以降（MVP は `*.pages.dev` で運用）
- 楽天 / Yahoo! API の開発者登録: Phase 2 前までに（タスク 5 のスコープ外）
- ROI 評価モデルの精緻化: Phase 2 以降で実データ反映（故障率、時短価値、残存価値、補助金）
- 画像プレースホルダ → 実画像差し替え: Phase 2
