# 家電買い時 (kaden-kaimi)

家電の購入タイミングを判断支援するサイト。価格推移・寿命・世代差・代替候補・利用条件を統合し、「今・この機種を買うべきか」を一枚のダッシュボードで判定する。

このファイルはプロジェクト固有のルールを定義する。グローバル設定（`~/.claude/CLAUDE.md`）と併せて読むこと。矛盾する場合は本ファイルが優先。

## プロダクト定義

- **差別化**: 価格比較の延長ではなく「買い替え意思決定 OS」。競合（STRACT「PLUG」）がカバーしない以下5軸を束ねる
  1. 同等代替機種の自動提示
  2. 買い替え ROI 判定
  3. モデルチェンジ周期予測
  4. 世代差分の意味翻訳（軸番号は設計書で「軸5」）
  5. ユーザー条件マッチング（軸6）
- **MVP カテゴリ**: ドラム式洗濯機のみ
- **非スコープ（MVP 時点）**: 会員機能、ユーザー投稿、複数カテゴリ、メーカー公式連携

## 技術スタック

- フレームワーク: **Astro** + TypeScript + Cloudflare Pages adapter
- 動的 UI: React Island（`client:load` を最小限）
- スタイリング: **Tailwind CSS v4**（`@tailwindcss/vite` 経由で統合、テーマは `src/styles/global.css` の `@theme` ブロック）
- データ永続化: **DB 不使用。git 管理の JSON ファイルのみ**
- 価格データ更新: **Cloudflare Workers Cron + GitHub Contents API**
- バリデーション: zod、テスト: Vitest
- CI/CD: GitHub Actions（バリデーション）、Cloudflare Pages（デプロイ）
- 独自ドメイン: **MVP 中は `*.pages.dev` を使用**。Phase 2 以降で取得判断

## ディレクトリ方針

- `src/` アプリコード
- `data/` 機種マスタ・価格履歴（JSON）
- `workers/` Cloudflare Workers プロジェクト
- `scripts/` CLI ツール（データ検証等）
- `docs/` 設計ドキュメント
- `docs/devlog/` 日次開発ログ

## 遵守ルール（プロジェクト固有）

### データスキーマ
- 全 JSON は `src/types/schema.ts` の zod スキーマで検証する
- スキーマ違反の JSON は CI で reject
- スキーマ変更は必ず migration ノートを `docs/devlog/` に残す

### 計算ロジック
- 5軸のロジックは `src/lib/` に分離し、単体テストを付ける
- 計算式の変更は `docs/logic-specs.md` を先に更新（実装より文書が先）
- ハードコード値禁止。閾値・重み・翻訳テーブルは `src/lib/constants.ts` に集約

### データソース
- 楽天 / Yahoo! / メーカー公式以外のデータソースは使用禁止（規約違反リスク）
- **価格.com のスクレイピングは禁止**
- 取得頻度は日次1回まで（レート制限遵守）

### 秘密情報
- API キーは `.env` に置かない。Cloudflare は `wrangler secret`、ローカルは `.dev.vars`（gitignore 済み）
- GitHub PAT は Fine-grained、`contents: write` 権限のみ、対象リポジトリ限定で発行
- 秘密情報がコミットに混入したら即ローテーション（グローバル CLAUDE.md のインシデント対応手順）

### コーディング規約
- 詳細: `docs/coding-conventions.md`
- TypeScript strict モード必須
- ファイル 200–400 行目安、800 行上限
- 関数 50 行以内
- 新規機能はテスト先行（TDD）。UI プロトタイプは例外

### Git & PR
- コミットメッセージ: Conventional Commits
- ブランチ運用: `main` からトピックブランチ、PR 経由でマージ
- `git push` は人間が実行（グローバル禁止事項）
- パッケージマネージャは **pnpm 固定**（`npm` / `yarn` 禁止）

## 参照ドキュメント

- `ROADMAP.md` — フェーズ計画と成功指標
- `TaskBreakdown.md` — Phase 1 (MVP) の詳細タスク
- `docs/architecture.md` — システム構成と技術選定理由
- `docs/data-schema.md` — JSON スキーマ定義
- `docs/logic-specs.md` — 5軸計算ロジック仕様
- `docs/coding-conventions.md` — コーディング規約
- `docs/api-integration.md` — 外部 API 連携仕様

## ワークフロー

1. タスク着手前に `TaskBreakdown.md` で対象タスクを確認
2. 実装前に関連設計書を必読（特に `logic-specs.md`、`data-schema.md`）
3. 変更ごとに単体テスト実行
4. Verify フェーズで完了条件チェック（グローバル CLAUDE.md 準拠）
5. 日次進捗を `docs/devlog/YYYY-MM-DD.md` に記録（PR 単位 or 30 分超作業時）
