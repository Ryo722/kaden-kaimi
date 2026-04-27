# 家電買い時 (kaden-kaimi)

家電の購入タイミングを判断するダッシュボードサイト。

本番: <https://kaden-kaimi.pages.dev/>

## プロダクトの要点

「今・この機種を買うべきか」を以下5軸で一枚に可視化する:

1. **同等代替機種の自動提示** — スペック同等で安い候補を提示
2. **買い替え ROI 判定** — 電気・水道代削減で投資回収できるか
3. **モデルチェンジ周期予測** — 次モデル発表時期と旧型値下がり予測
4. **世代差分の意味翻訳** — スペック差を購入判断に直結する言葉に変換
5. **ユーザー条件マッチング** — 家族構成・寸法・使用頻度から推奨

直接競合: STRACT「PLUG」。本サービスは価格追跡ではなく **買い替え意思決定** に軸足を置く。

## 技術スタック

| レイヤ | 採用 |
|---|---|
| フレームワーク | Astro + TypeScript |
| スタイリング | Tailwind CSS |
| デプロイ | Cloudflare Pages（MVP は `*.pages.dev`） |
| データ更新 | Cloudflare Workers Cron → GitHub Contents API |
| データ保管 | git 管理 JSON（DB なし） |
| 外部 API | 楽天ウェブサービス、Yahoo! ショッピング |
| 検証 | zod, Vitest |

## アーキテクチャ概要

```
[Workers Cron] --daily--> [楽天/Yahoo! API]
      |                          |
      v                          v
   価格データ取得 -> [GitHub Contents API] -> data/prices/*.json
                                                    |
                                                    v
                                      [Cloudflare Pages ビルド]
                                                    |
                                                    v
                                         [ユーザーアクセス]
```

詳細: [docs/architecture.md](./docs/architecture.md)

## 現在のステータス（2026-04-24）

**Phase 1 (MVP) 進行中** — 4/5 タスク完了、タスク 5 着手中

- ✅ タスク 1: プロジェクト初期化（Astro + Tailwind + Cloudflare adapter）
- ✅ タスク 2: 型定義（zod）・サンプルデータ（5 機種 × 30 日）
- ✅ タスク 3: 5 軸ロジック実装（全軸 TDD、133 tests、カバレッジ 97%）
- ✅ タスク 4: 機種詳細ページ（5 軸ダッシュボード、Lighthouse P100/A100）
- ⏳ **タスク 5: Cloudflare Pages デプロイ + Lighthouse CI**

次セッションの引き継ぎ: [`docs/handoffs/task-5.md`](./docs/handoffs/task-5.md)

## セットアップ

**必要環境**
- Node.js 22.12.0（`.nvmrc` 準拠、Astro 6 の下限）
- pnpm 10.32.1（`packageManager` で固定）

```bash
pnpm install
pnpm dev              # 開発サーバー起動
pnpm build            # Cloudflare Pages 向けビルド
pnpm typecheck        # Astro/TS 型チェック
pnpm test             # Vitest
pnpm test:coverage    # カバレッジ測定（src/lib は 80% 閾値）
pnpm lint             # ESLint（flat config）
pnpm validate         # data/ JSON スキーマ検証
pnpm exec lhci autorun  # Lighthouse CI（要: pnpm build 済み）
```

> **Lighthouse CI（2 段構え）**:
> - PR では `.github/workflows/lighthouse.yml` が `dist/client` を `staticDistDir` で計測（HTTP/1.1 のため `uses-http2` audit は skip）
> - main push / nightly（JST 04:00）/ 手動実行では `.github/workflows/lighthouse-preview.yml` が `https://kaden-kaimi.pages.dev`（main 最新成功ビルドのエイリアス）を実 CDN 経由で計測（HTTP/2/3 配信のため `uses-http2` は skip しない）
> - 2 段目は GitHub Check Runs API で CF Pages のビルド完了（`conclusion: success`）を待ってから計測する。CF ビルド失敗時は workflow も fail
> - しきい値は両段共通（P90 / A95 / BP90 / SEO90）、`numberOfRuns: 3` で median 採用
> - 詳細: [docs/architecture.md#cicd-構成](./docs/architecture.md#cicd-構成)

## ディレクトリ構成

```
kaden-kaimi/
├── CLAUDE.md           # プロジェクト固有ルール
├── README.md           # 本ファイル
├── ROADMAP.md          # フェーズ計画
├── TaskBreakdown.md    # Phase 1 タスク詳細
├── docs/               # 設計ドキュメント
│   ├── architecture.md
│   ├── data-schema.md
│   ├── logic-specs.md
│   ├── coding-conventions.md
│   ├── api-integration.md
│   ├── handoffs/       # セッション引き継ぎ
│   └── devlog/         # 日次開発ログ
├── src/                # アプリコード（types/, pages/, layouts/, styles/, lib/ 予定）
├── data/               # JSON データ（models/, prices/, brands, energy-rates）
├── workers/            # Cloudflare Workers（Phase 2 で生成）
└── scripts/            # CLI ツール（validate-data, generate-sample-prices）
```

## ドキュメント索引

- 設計: [architecture.md](./docs/architecture.md), [data-schema.md](./docs/data-schema.md), [logic-specs.md](./docs/logic-specs.md)
- 規約: [coding-conventions.md](./docs/coding-conventions.md)
- 運用: [api-integration.md](./docs/api-integration.md)
- 引き継ぎ: [handoffs/](./docs/handoffs/)
- 開発ログ: [devlog/](./docs/devlog/)

## 開発フロー

1. タスクは `TaskBreakdown.md` で管理
2. 変更は必ずテスト付きコミット
3. 日次進捗を `docs/devlog/YYYY-MM-DD.md` に記録

## ライセンス

未定（Phase 3 までに決定）。
