# アーキテクチャ

## システム構成図

```
┌─────────────────────────────────────────────────────────┐
│                     ユーザーブラウザ                     │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Cloudflare Pages (Astro SSG)               │
│  ┌────────────────────┐  ┌──────────────────────────┐  │
│  │ 静的 HTML/CSS/JS   │  │ Pages Functions (Edge)   │  │
│  │ （ビルド時生成）   │  │ /api/prices/[modelId]    │  │
│  └────────────────────┘  └───────────┬──────────────┘  │
│                                       │                  │
│  data/*.json（git 経由でビルド時取込）│ オンデマンド    │
└───────────────────────────────────────┼─────────────────┘
                          ▲             │
                          │ rebuild     ▼
                          │       ┌──────────────────┐
                          │       │ 楽天/Yahoo! API  │
                          │       │ （最新価格）     │
                          │       └──────────────────┘
                          │
                   ┌──────┴───────────┐
                   │  GitHub (source) │
                   │  data/prices/*   │
                   └──────▲───────────┘
                          │ PUT /contents
                          │
               ┌──────────┴──────────────┐
               │ Cloudflare Workers Cron │
               │ 日次 JST 05:00          │
               │ ├─ 楽天 API 取得        │
               │ ├─ Yahoo! API 取得      │
               │ └─ GitHub Contents API  │
               └─────────────────────────┘
```

## データフロー

### 読み取り（ユーザー閲覧）

1. ユーザーが機種詳細ページをリクエスト
2. Cloudflare Pages が事前ビルド済み HTML を返却
3. 「最新価格」セクションのみ Edge Function 経由で 楽天 / Yahoo! API を呼ぶ
   - Cache API で 3 時間キャッシュ
4. 5軸の計算はすべてクライアント到達前（ビルド時 or Edge で実行）

### 書き込み（データ更新）

1. Workers Cron（日次）が起動
2. 対象機種の楽天・Yahoo! 最新価格を取得
3. GitHub Contents API で `data/prices/washers/{modelId}.json` に追記コミット
4. Cloudflare Pages がコミットを検知し再ビルド・デプロイ

## 技術選定理由

| 技術 | 採用理由 |
|---|---|
| Astro | 静的中心、React Island で動的部分のみ選択的導入。バンドルサイズ最小 |
| TypeScript | 全レイヤ型安全、機種スペックの誤データを型で弾く |
| Tailwind CSS | ユーティリティファーストで5軸ダッシュボードの非定型 UI を高速実装。Astro 公式 integration |
| Cloudflare Pages | 帯域無制限、CDN 最強、Workers/KV/R2 統合 |
| Workers Cron | Actions 不要で Cloudflare に一本化、将来 KV/R2 移行が容易 |
| git JSON | MVP 規模では十分、履歴・ロールバックが git でそのまま動く |
| zod | スキーマ + 型生成の二重管理を回避 |

## 非機能要件

| 項目 | 目標 |
|---|---|
| Performance (Lighthouse) | 90+ |
| Accessibility | 95+ |
| SEO | 95+ |
| 初回ロード | < 1.5s (fast 3G) |
| データ整合性 | 欠損率 < 1% |
| セキュリティ | 秘密情報コミット 0 件 |

## セキュリティ境界

- **ブラウザ**: 楽天 / Yahoo! API キーは渡さない。Edge Function で秘匿
- **Workers**: Wrangler Secrets で GitHub PAT と API キー管理
- **Pages**: 静的ファイルのみ、サーバー側状態なし
- **GitHub PAT**: Fine-grained、`contents: write` のみ、対象リポジトリ限定

## 将来の移行パス

| トリガ | 移行先 |
|---|---|
| 機種数 1 万超 | JSON → SQLite (LiteFS or Turso) |
| 会員機能導入 | Cloudflare D1 + Auth.js |
| 画像最適化が必要 | Cloudflare Images |
| 価格データ量増大 | R2 へオフロード |
| 書き込み頻度増 | Workers → Queues |

## エラー対応方針

- **ビルド失敗**: Cloudflare Pages の前回デプロイを維持（自動ロールバック）
- **Workers Cron 失敗**: 3 回リトライ、最終失敗は通知のみ（データ欠損を許容）
- **外部 API レート超過**: 指数バックオフ、1 日以内の再試行で自動復旧
- **GitHub API 障害**: 当日データは欠損扱い、翌日再投入を試みる

## CI/CD 構成

### Lighthouse CI（2 段構え）

性能計測は「再現性の高い静的計測」と「実 CDN 配信下での計測」を分離し、目的別に 2 つの workflow で運用する。

| 段 | workflow | トリガ | 計測対象 | 設定 |
|---|---|---|---|---|
| 1 段目 | `.github/workflows/lighthouse.yml` | `pull_request` のみ | `dist/client` を `staticDistDir` で計測 | `.lighthouserc.json` |
| 2 段目 | `.github/workflows/lighthouse-preview.yml` | `push` (main) / `schedule` (JST 04:00) / `workflow_dispatch` | Cloudflare Pages の Production URL を実 CDN 経由で計測 | `.lighthouserc.preview.json` |

**しきい値**は両段で共通（Performance ≥ 90 / Accessibility ≥ 95 / Best Practices ≥ 90 / SEO ≥ 90）。`numberOfRuns: 3` で median を採用し flake 耐性を確保する。

**役割の違い**:
- 1 段目: PR ごとに走り、ビルド成果物の劣化を即座に検出する。staticDistDir は HTTP/1.1 のため `uses-http2` audit を skip する。
- 2 段目: main ブランチのデプロイ後と nightly で走り、CF の HTTP/2/3 配信・CDN キャッシュを含めた実環境スコアを観測する。`uses-http2` は skip しない。

**preview URL の解決**は GitHub Deployments API を polling する設計（30s × 10 回 = 最大 5 分）。CF Pages 側で GitHub App の Deployments 通知が無効な場合、`https://kaden-kaimi.pages.dev` への fallback に落ちる（アーティファクト名に `-fallback` サフィックスが付き、job summary でも識別可能）。

**nightly の cron** は JST 04:00（UTC 19:00）に設定。Workers の価格更新 cron（JST 05:00）の前に走らせ、計測時点のデータが「前日 cron で更新されたもの」で安定するようにしている。

### バリデーション CI

`.github/workflows/ci.yml` で `pnpm validate` / `pnpm typecheck` / `pnpm test` を PR 時に走らせる。data/JSON のスキーマ違反は CI で reject される。
