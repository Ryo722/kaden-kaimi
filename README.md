# 家電買い時 (kaden-kaimi)

家電の購入タイミングを判断するダッシュボードサイト。

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

## セットアップ

初回セットアップ:

```bash
pnpm install
pnpm dev        # 開発サーバー起動
pnpm build      # Cloudflare Pages 向けビルド
pnpm typecheck  # Astro/TS 型チェック
pnpm test       # Vitest
```

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
│   └── devlog/         # 日次開発ログ
├── src/                # アプリコード（Phase 1 で生成）
├── data/               # JSON データ（Phase 1 で生成）
├── workers/            # Cloudflare Workers（Phase 2 で生成）
└── scripts/            # CLI ツール
```

## ドキュメント索引

- 設計: [architecture.md](./docs/architecture.md), [data-schema.md](./docs/data-schema.md), [logic-specs.md](./docs/logic-specs.md)
- 規約: [coding-conventions.md](./docs/coding-conventions.md)
- 運用: [api-integration.md](./docs/api-integration.md)

## 開発フロー

1. タスクは `TaskBreakdown.md` で管理
2. 変更は必ずテスト付きコミット
3. 日次進捗を `docs/devlog/YYYY-MM-DD.md` に記録

## ライセンス

未定（Phase 3 までに決定）。
