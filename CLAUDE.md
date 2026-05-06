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
- `tasks.json` — 実行台帳（spec-task / tasks-master 連携、Phase 3 から）
- `decision-log.md` — 重要決定の記録（Phase 5 で導入）
- `openspec/proposals/` — 変更仕様（spec-task）
- `TaskBreakdown.md` / `TaskBreakdown-phase2.md` — **凍結中**（参照のみ、新規追記禁止）
- `docs/architecture.md` — システム構成と技術選定理由
- `docs/data-schema.md` — JSON スキーマ定義
- `docs/logic-specs.md` — 5軸計算ロジック仕様
- `docs/coding-conventions.md` — コーディング規約
- `docs/api-integration.md` — 外部 API 連携仕様
- `.takt/config.yaml` — Takt CLI プロジェクト設定（provider / model / language / concurrency / branch_name_strategy）

## ワークフロー

1. タスク着手前に `tasks.json` の state-first ダッシュボードで現状確認（`TaskBreakdown.md` は凍結中・参照のみ）
2. 実装前に関連設計書を必読（特に `logic-specs.md`、`data-schema.md`）
3. 変更ごとに単体テスト実行
4. Verify フェーズで完了条件チェック（グローバル CLAUDE.md 準拠）
5. 日次進捗を `docs/devlog/YYYY-MM-DD.md` に記録（PR 単位 or 30 分超作業時）
6. 仕様変更が必要なら `/spec-task` で `openspec/proposals/<YYYYMMDD-id>/spec.md` を起こし、`tasks.json` に反映
7. 単発修正は `/tasks-master` で task 追加（spec 不要・30 分未満）

### tasks.json 退避ルール
- `active_specs` が **3 件以上**、または spec が `implemented/archived` 化したら、対応 task を `tasks.archived.json` へ移動
- 退避時は `docs/devlog/<date>.md` に 1 行記録（spec id と task 数）

## Takt 統合運用

2026-05-06 より公式 Takt CLI (`nrslib/takt`) を `.takt/` 配下で運用開始（decision-log 2026-05-06 参照）。

### 役割分離

| ファイル | 役割 | 単一ソース性 |
|---|---|---|
| `tasks.json` | **state-first 実行台帳**。pending / in_progress / blocked / review / done の全タスクを俯瞰。next_action / stop_reason / acceptance_ref を持つ | 「現在状態と次アクション」 |
| `.takt/tasks.yaml` | **Takt が消化する実行キュー**。`takt run` で順次走る待機タスクのみ | 「いま走らせる対象」 |

**避けること**: `.takt/tasks.yaml` だけに書いて `tasks.json` を更新し忘れると「現在何が止まっているか」が1ファイルで把握できなくなる。

### 自律進行と人間承認の境界

kaden-kaimi の `risk_tier`（小 / 中 / 大）と Takt ワークフロー段階を対応させる:

| risk_tier | Takt ワークフロー | 人間承認タイミング |
|---|---|---|
| 小（タイプミス・コメント・ドキュメント） | `default`（plan → write_tests → implement → ai_review → ai_fix → reviewers → fix） | PR レビューのみ |
| 中（新機能・バグ修正・リファクタ） | `default` | PR レビュー + テスト確認 |
| 大（DBスキーマ・auth・データ操作） | `default` + 手動 security-review ステップ追加 | 実装前仕様確認 + PR レビュー |

### Skill `/takt` の非使用方針

kaden-kaimi では Skill `/takt`（ピースエンジン、`~/.claude/skills/takt/SKILL.md`）は**使わない**。公式 Takt CLI のみで運用する（decision-log 2026-05-06 に明記済）。

- **公式 Takt CLI**: branch / worktree / PR を伴う本番運用。`takt run` でワークフロー駆動マルチエージェントを起動
- **Skill `/takt` ピースエンジン**: branch を切らない単発の検討用。kaden-kaimi では使用しない

### 推奨実行フラグ

```sh
takt run --auto-pr --draft
```

- `--auto-pr`: ワークフロー完了後に GitHub PR を自動作成
- `--draft`: draft PR として作成し、人間が内容確認後に「ready for review」へ昇格させる
- kaden-kaimi は実験的運用段階のため、直接 merge を防ぐ意図で `--draft` を常時推奨

### 参照

- ワークスペース共通の Takt 運用: `~/claude-workspace/docs/takt-workflow.md`（§2 使い分け / §3 役割分離 / §6 承認境界）
