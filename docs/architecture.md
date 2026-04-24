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
