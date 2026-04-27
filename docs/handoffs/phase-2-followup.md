# Phase 2 ハンドオフ（残作業＋次セッション準備）

2026-04-26 終了時点。`phase-2-dryrun` ブランチで進行中。

## 進捗マトリクス

| サブタスク | 状態 | 残作業所有者 |
|---|---|---|
| P2.1 前提整備 | ✅ 完了 | — |
| P2.2 Workers スキャフォールド | ✅ 完了 | — |
| P2.3 楽天/Yahoo クライアント | ✅ 完了 | — |
| P2.4 GitHub Contents API + パイプライン | ✅ 完了 | — |
| P2.5.D 価格下限フィルタ | ✅ 実装完了 / ⏳ 再ドライラン待ち | ユーザー |
| P2.5.E brand 名 keyword 強化 | ✅ 実装完了 / ⏳ 再ドライラン待ち | ユーザー |
| P2.5.B 本番デプロイ | ⬜ 未着手 | ユーザー |
| P2.5.C クリーンアップ | ⬜ 未着手 | ユーザー |
| P2.6 データカバレッジ拡大 | ✅ 15 機種完了（スペック精査は Phase 3） | — |
| P2.7 Lighthouse CI 2 段化 | ⬜ 未着手 | 次セッション |
| P2.8 完了処理 | ⬜ 未着手 | 次セッション |
| codex exec 差分レビュー | ⬜ 未着手 | 次セッション（推奨） |

---

## ロードマップ A: 再ドライラン（ユーザー作業）

### 目的
ケース E（brand 名併記 keyword）の動作を実 API で検証し、楽天が 1 件以上ヒットすることを確認する。

### 前提
- `phase-2-dryrun` ブランチが origin に push 済み（commit `81ac879`）
- `workers/fetch-prices/.dev.vars` に dryrun 上書き（`GITHUB_BRANCH=phase-2-dryrun`、`TARGET_MODEL_ID=panasonic-na-lx129dl`）が継続している
- 既に 2026-04-26 の record（yahoo ¥220k）が GitHub にあるため、**同日内の再ドライランは idempotency により skipped_duplicate になる**

### 実行手順

#### 選択肢 1（推奨）: 2026-04-27 JST 以降に実施
日付が変わるだけで自動的に新規レコード扱いになる。手順は最小:

```bash
# 1. ターミナル A で wrangler 起動
pnpm --filter kaden-kaimi-fetch-prices exec wrangler dev --test-scheduled --port 8787

# 2. ターミナル B で手動トリガ
curl -i "http://127.0.0.1:8787/__scheduled?cron=0+20+*+*+*"
```

#### 選択肢 2: すぐに検証したい場合
GitHub 上の 2026-04-26 行を巻き戻してから再ドライラン:

```bash
# 1. 最新の origin/phase-2-dryrun に追従
git pull --ff-only

# 2. 末尾の 2026-04-26 レコード（yahoo ¥220k）を JSON から削除
#    → 編集対象: data/prices/drum-washer/panasonic-na-lx129dl.json
#    → 末尾の "{ date: 2026-04-26, ... }" ブロックを除去（カンマも調整）

# 3. コミット & push
git add data/prices/drum-washer/panasonic-na-lx129dl.json
git commit -m "chore(prices): revert 2026-04-26 row for case E re-dryrun"
git push origin phase-2-dryrun

# 4. 上記の wrangler 起動 + curl を実行
```

### 期待結果

```json
// 良いパターン
{
  "event": "scheduled.category_summary",
  "date": "2026-04-26 or 2026-04-27",
  "totalModels": 1,
  "written": 1,
  "failed": 0
}
```

GitHub の `data/prices/drum-washer/panasonic-na-lx129dl.json` 末尾に追記されたレコード:
- ✅ `rakutenMin` が **数十万円台**の数値（null でなくなれば case E 成功）
- ✅ `yahooMin` も同様（前回 ¥220k より絞られた値か同等）
- ❌ もし `rakutenMin: null` のままなら → 楽天で品番ヒットなし、`externalIds.rakutenItemCode` の手動投入を Phase 3 で検討

### 失敗パターンと対処

| 症状 | 原因 | 対処 |
|---|---|---|
| HTTP 5xx | wrangler 内部エラー | `wrangler tail` でログ確認、`.dev.vars` の値を再点検 |
| `event: scheduled.error reason: missing_secrets` | `.dev.vars` 未読込 | wrangler の起動 cwd が `workers/fetch-prices` か確認 |
| `categoryError: github_api_error: status=401` | PAT 無効 | Fine-grained PAT を再発行（90 日期限） |
| `failed: 1` で reason に `model_schema_invalid` | model JSON のスキーマ違反 | エラー本文の path を見て該当機種を `pnpm validate` で確認 |
| `skipped_empty: 1`（両 source null） | API 0 件 or 全て下限未満 | 期待外。`externalIds` 投入を検討 |
| `skipped_duplicate: 1` | 同日に既にレコードあり | 想定通り（再実行時の冪等性） |

---

## ロードマップ B: 本番デプロイ（ユーザー作業）

### 目的
Workers を Cloudflare 本番に投入し、cron を有効化して main ブランチに自動コミットさせる。

### 前提
- 再ドライラン（ロードマップ A）が成功し、まともな値が書き込まれている
- `phase-2-dryrun` ブランチは main にマージ予定（または rebase）

### 手順

#### B1. dryrun 上書きの解除
```bash
# .dev.vars を編集して以下の 2 行を削除（または # でコメントアウト）
#   GITHUB_BRANCH=phase-2-dryrun
#   TARGET_MODEL_ID=panasonic-na-lx129dl
$EDITOR workers/fetch-prices/.dev.vars

# 動作確認（cwd は workers/fetch-prices で wrangler dev を起動した場合、
# 起動時のログで loaded variables にこの 2 つが含まれていないことを目視）
```

#### B2. 本番 Workers に Secret 登録
```bash
cd workers/fetch-prices

# 楽天 applicationId
echo "<RAKUTEN_APP_ID の値>" | pnpm exec wrangler secret put RAKUTEN_APP_ID

# Yahoo! Client ID
echo "<YAHOO_CLIENT_ID の値>" | pnpm exec wrangler secret put YAHOO_CLIENT_ID

# GitHub Fine-grained PAT
echo "<GITHUB_TOKEN の値>" | pnpm exec wrangler secret put GITHUB_TOKEN

# 確認
pnpm exec wrangler secret list
# → RAKUTEN_APP_ID, YAHOO_CLIENT_ID, GITHUB_TOKEN の 3 つが表示されればOK
```

**注意**: secret 値はプロンプトに直接打つよりも `echo | wrangler secret put` のほうが履歴に残らずに済む。逆に echo 経由だと shell history に残るので、`HISTCONTROL=ignorespace` を有効にするか、入力後に `history -d <番号>` で削除推奨。

#### B3. wrangler.toml の本番モード確認

`workers/fetch-prices/wrangler.toml` の `[vars]` ブロックが本番値か確認:
```toml
[vars]
GITHUB_OWNER = "Ryo722"
GITHUB_REPO = "kaden-kaimi"
GITHUB_BRANCH = "main"        # ← phase-2-dryrun ではなく main
GIT_AUTHOR_NAME = "kaden-kaimi-bot"
GIT_AUTHOR_EMAIL = "bot@kaden-kaimi.invalid"
USER_AGENT = "kaden-kaimi-bot/0.1 (+https://kaden-kaimi.pages.dev)"

[triggers]
crons = ["0 20 * * *"]        # ← JST 05:00 = UTC 20:00
```

#### B4. デプロイ
```bash
cd workers/fetch-prices
pnpm run deploy
# → "Successfully deployed kaden-kaimi-fetch-prices" を確認
# → cron registered: 0 20 * * * のメッセージも確認
```

#### B5. 手動トリガで疎通確認
Cloudflare ダッシュボードまたは `wrangler tail` でログを見ながら:
```bash
# 別ターミナル
cd workers/fetch-prices
pnpm exec wrangler tail

# Cloudflare dashboard → Workers → kaden-kaimi-fetch-prices → Triggers → Cron Triggers → "Trigger" ボタン
# または:
pnpm exec wrangler triggers deploy   # cron だけ再登録
```

期待ログ:
```
{"event":"scheduled.start", ...}
{"event":"scheduled.category_summary", "written": 15, ...}
{"event":"scheduled.done", "totalWritten": 15, "totalFailed": 0, ...}
```

#### B6. main へのマージ
```bash
# phase-2-dryrun を main にマージする戦略は 2 通り:

# 戦略 1: PR 経由（推奨、レビュー履歴が残る）
gh pr create --base main --head phase-2-dryrun \
  --title "feat: phase 2 — workers cron + 15 models + filters" \
  --body "$(cat <<'EOF'
## Summary
- Workers fetch-prices: 楽天/Yahoo→GitHub Contents API パイプライン
- minPrice フィルタ + brand 名併記 keyword で keyword 検索精度向上
- 15 機種に拡大（追加 10 件はスペック値が推定、Phase 3 で精査）

## Test plan
- [x] pnpm test (217 passed) / lint / typecheck / validate
- [x] phase-2-dryrun での実 API ドライラン
- [ ] 本番デプロイ後、手動トリガで疎通確認
- [ ] cron 初日（JST 05:00）の自動実行ログ確認
EOF
)"

# 戦略 2: 直接 fast-forward
git checkout main
git merge --ff-only phase-2-dryrun
git push origin main
```

#### B7. 翌朝（JST 05:00 過ぎ）にログ確認
- Cloudflare ダッシュボード → Workers → kaden-kaimi-fetch-prices → Logs（過去 24h）
- 期待: `scheduled.start` から `scheduled.done` までの一連が記録、`totalWritten` = 15、`totalFailed` = 0
- main に自動コミットが 15 機種分追加されている（`https://github.com/Ryo722/kaden-kaimi/commits/main`）

---

## ロードマップ C: クリーンアップ（B 完了後）

```bash
# 1. dryrun ブランチ削除
git checkout main
git branch -D phase-2-dryrun
git push origin --delete phase-2-dryrun

# 2. .dev.vars の現状を README に記録
#    （dryrun 上書きを使う場合は再度追加する手順を記載）
```

---

## ロードマップ D: P2.7 Lighthouse CI 2 段化（次セッション）

### 目的
PR 検証は static dist 計測（既存）、main push 時は Cloudflare preview URL 計測の 2 段構成にし、実環境性能の継続監視を実現。

### 設計

| トリガ | 計測対象 | 既存 / 新規 |
|---|---|---|
| `pull_request` | `staticDistDir: ./dist` | 既存 `.github/workflows/lighthouse.yml` を維持 |
| `push: main` | Cloudflare preview URL `https://{hash}.kaden-kaimi.pages.dev/` | 新規 workflow |
| `schedule: nightly` | 本番 `https://kaden-kaimi.pages.dev/` | 新規（cron 0 20 * * *） |

### 実装ステップ

1. **既存 workflow の trigger を `pull_request` のみに絞る**
   - `.github/workflows/lighthouse.yml` の `on:` から `push` を除去

2. **新規 workflow `.github/workflows/lighthouse-preview.yml` を作成**
   - trigger: `push: branches: [main]`
   - step:
     a. Cloudflare Pages デプロイ完了を待つ（`gh api repos/{owner}/{repo}/deployments` をポーリング、または fixed sleep 60s）
     b. デプロイ URL を取得（`gh api .../deployments/{id}/statuses`）
     c. `lhci collect --url=<preview_url>` を実行
     d. `lhci assert` でスレッショルド検証

3. **`lighthouserc.json` の調整**
   - 現状の `uses-http2` skip は static dist 計測の都合。preview URL 計測時は CF が HTTP/2/3 提供なので外す（preview 用設定を別ファイルで管理）
   - `numberOfRuns: 2 → 3` で flake 耐性向上

4. **nightly workflow（任意）**
   - 本番 URL を計測、結果が劣化していたら issue 自動作成（`actions/github-script`）

### 所要見積もり
- 1〜2 時間（CF deployment polling のロジックが鬼門）

### 関連リポジトリ・参考リソース
- `lhci-action` 公式 docs: <https://github.com/treosh/lighthouse-ci-action>
- Cloudflare Pages deployment API: <https://developers.cloudflare.com/api/operations/pages-deployment-get-deployment>
- 既存 `.github/workflows/lighthouse.yml` を必ず先に読む

### 完了条件
- main push の workflow が preview URL 計測でも閾値 pass
- Lighthouse スコア（Performance / Accessibility / Best Practices / SEO）が継続的に >= 90 を維持

---

## ロードマップ E: codex exec 差分レビュー（次セッション、推奨）

### 目的
Phase 2 の実装（Workers 一式 + 15 機種拡大）は中規模変更。グローバル CLAUDE.md の方針に従い、第三者視点での差分レビューを通す。

### 推奨タイミング
- 本番デプロイ（ロードマップ B）の**直前**: production 投入前に最終確認
- もしくは **PR 作成時**（B6 の戦略 1）: PR の diff を直接レビュー対象にできる

### 実行コマンド例

#### Option 1: ローカル差分のフルレビュー
```bash
# main からの差分を codex に渡す
git diff main...phase-2-dryrun | codex exec --review

# あるいは特定領域に絞る
git diff main...phase-2-dryrun -- workers/ | codex exec --review
git diff main...phase-2-dryrun -- src/lib/constants.ts | codex exec --review
```

#### Option 2: PR レビュー
```bash
# PR 作成後
gh pr view <PR番号> --json url -q .url | xargs codex exec --review-pr
```

#### Option 3: codex:codex-rescue subagent
```
/codex:codex-rescue
```
の後にプロンプトで「phase-2-dryrun ブランチの差分を main と比較してレビューして」と依頼。

### レビュー観点（プロンプトに含めるべき）
1. **Workers の Cron 実行安全性**
   - シークレット欠損時の挙動（fail-safe か stack trace 漏出か）
   - 並列実行（cron が連続発火）時の冪等性
   - GitHub Contents API の失敗時の Bot コミット汚染リスク
2. **zod スキーマの境界**
   - 楽天/Yahoo API の構造変化に対する fail-safe（null 返却ロジック）
   - PriceHistory の追記順序の保証
3. **brand 表示名の同期管理**
   - `BRAND_DISPLAY_NAMES` と `data/brands.json` がドリフトした場合の検知
   - 追加機種時に brand を間違えた場合の schema reject 動作
4. **15 機種データの品質**
   - スペック値の推定根拠（具体的な実機ページ参照なし）
   - axis5/axis6 の出力が不自然になる組み合わせがないか
5. **テスト戦略**
   - 「日付ハードコード」が再発しないか（`.toBe("2026-XX-YY")` パターン）
   - `predecessorId` / `successorId` の双方向整合を testで保証していない

### 期待アウトプット
- Critical / Warning / Info 別に分類された指摘リスト
- Critical: 本番デプロイ前に必ず修正
- Warning: 次セッションで対応
- Info: Phase 3 で検討

### 所要見積もり
- 5〜10 分（codex 実行）+ 指摘対応 30〜60 分

---

## 全体スケジュール案

```
今日中 or 明日 (2026-04-27 JST)
  ├─ ユーザー: ロードマップ A 再ドライラン
  └─ 良好なら ↓

ロードマップ E codex レビュー（次セッション、私が支援）
  ├─ Critical 指摘あれば修正
  └─ ↓

ロードマップ B 本番デプロイ（ユーザー）
  ├─ B1〜B4 デプロイ
  ├─ B5 手動トリガ確認
  ├─ B6 PR & merge
  └─ B7 翌朝 cron ログ確認

ロードマップ C クリーンアップ（ユーザー）

ロードマップ D P2.7 Lighthouse 2 段化（次セッション、私）

P2.8 完了処理（私）
  ├─ devlog 集約
  ├─ ROADMAP.md 更新
  └─ phase-3 ハンドオフ作成
```

---

## ロードマップ F: Phase 3 引き継ぎ事項（codex review 由来）

codex 差分レビュー（2026-04-26）で `Info` 区分とされた項目。Phase 3（カテゴリ拡大・データ精査）で対応する。

### F1. axis5/axis6 出力の snapshot / property test
- 対象: `data/models/drum-washer/*.json` 全件 × axis5（世代差分翻訳）× axis6（条件マッチング）の出力
- 動機: P2.6 で追加した 10 機種は推定スペック値。axis ロジックが「5kg より小さい dryCapacity に対して `panasonic:nanoe-x` を提案する」のような不自然な組み合わせを出していないか機械的に検出したい
- 推奨アプローチ:
  - vitest snapshot test: 全機種 × 全 axis の出力を `__snapshots__/` に固定し、変更時に diff レビュー
  - もしくは property test: axis 出力の不変条件（例: `推奨 verdict なら ROI スコア > 0`）を検証
- 工数: 2〜3 時間（snapshot 整備 + 異常パターンの精査）

### F2. スペック値の実機ページ照合
- 対象: P2.6 で追加した 10 機種（`hitachi-bd-stx130kl` ほか）
- 動機: capacity / kWh / 寸法等が公知パターンからの推定値。Phase 3 でメーカー公式ページと照合
- 工数: 機種 1 件あたり 5〜10 分、計 1〜2 時間

### F3. CATEGORY_PRICE_FLOOR のカテゴリ別 / ブランド別 override
- 対象: `src/lib/constants.ts` の `CATEGORY_PRICE_FLOOR`
- 動機: ドラム式 ¥50,000 で運用しているが、エアコン・冷蔵庫など他カテゴリに拡張すると相場が異なる。AQUA 等の廉価ブランドではドラム式でも ¥50k は強すぎる可能性
- 推奨アプローチ: `CATEGORY_PRICE_FLOOR_OVERRIDES: Record<BrandId, Partial<Record<Category, number>>>` のような階層化
- 工数: 30〜60 分

---

## 連絡事項・引き継ぎメモ

- **Workers バンドルサイズ**: 550.83 KiB / gzip 83.07 KiB（Workers Free 1MB の 8%）。15 機種でもサイズ増加なし（データは GitHub Contents API 経由で動的取得のため）
- **API quota 消費**: ローカルでのテスト実行は API を叩かない。実 API は dryrun 1 回（楽天 1 / Yahoo 1）+ 本番 cron 1 回/日（楽天 15 / Yahoo 15 = 計 30 req/日）。楽天 1req/s 制限は機種間 1s sleep で吸収済み
- **画像ファイル**: `imageUrl` は path のみ記載、実ファイルは未配置（fallback 表示で動作）。Phase 3 で画像差し替え
- **ドメイン**: `*.pages.dev` 継続。独自ドメインは P2.8 または Phase 3 で判断
