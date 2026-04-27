# 本番デプロイ checklist (P2.5.B)

`workers/fetch-prices` を Cloudflare Workers 本番環境にデプロイし、日次 cron で全 15 機種の実データ収集を開始するための手順書。

- 対象 worker: `kaden-kaimi-fetch-prices`
- cron: `0 20 * * *`（UTC 20:00 = JST 05:00、日本は DST なし）
- 想定所要時間: A〜B 計 30 分、C は翌朝 10 分、D は 7 日後

## 前提

- ブランチ: `phase-2-dryrun`（本 checklist 着手時は origin と同期済 / push 不要、本番 worker は wrangler.toml の `[vars].GITHUB_BRANCH = "main"` を参照する）
- secret 命名は **`RAKUTEN_APP_ID`**（誤って `RAKUTEN_APPLICATION_ID` で登録すると `missing_secrets` で即終了）
- `.dev.vars` の dryrun 上書きは本番デプロイに影響しない（`wrangler dev` 専用、`wrangler deploy` は `wrangler.toml` の `[vars]` と `wrangler secret` のみを使う）
- wrangler 起動時の Astro adapter 衝突は `package.json` の `predev` / `predeploy` で解消済み

---

## A. 事前確認（Claude 検証可）

| # | 項目 | コマンド | 期待値 |
|---|---|---|---|
| A-1 | `wrangler.toml` の本番設定 | `cat workers/fetch-prices/wrangler.toml` | `[vars].GITHUB_BRANCH = "main"` |
| A-2 | 機種マスタ 15 件 | `ls data/models/drum-washer/ \| wc -l` | `15` |
| A-3 | Workers テスト pass | `pnpm --filter kaden-kaimi-fetch-prices test` | 94 件 pass |
| A-4 | Workers typecheck | `pnpm --filter kaden-kaimi-fetch-prices typecheck` | 0 errors |
| A-5 | バンドル可能性 | `pnpm --filter kaden-kaimi-fetch-prices deploy:dry` | エラーなしで `dist/` 出力 |

A-1〜A-5 全て pass で B へ進む。1 つでも失敗したら原因を解消するまで進めない。

---

## B. デプロイ実行（ユーザー作業）

### B-1. アカウント確認（誤デプロイ防止）

```bash
pnpm --filter kaden-kaimi-fetch-prices exec wrangler whoami
```

期待: 想定の Cloudflare アカウントにログイン中。

### B-2. secret 登録状況の確認

```bash
pnpm --filter kaden-kaimi-fetch-prices exec wrangler secret list
```

期待: 以下 3 つが登録済み（**命名厳守**）。

- `RAKUTEN_APP_ID`
- `YAHOO_CLIENT_ID`
- `GITHUB_TOKEN`

### B-3. 不足 secret の投入（B-2 で欠落があれば）

```bash
pnpm --filter kaden-kaimi-fetch-prices secret:put:rakuten   # RAKUTEN_APP_ID
pnpm --filter kaden-kaimi-fetch-prices secret:put:yahoo     # YAHOO_CLIENT_ID
pnpm --filter kaden-kaimi-fetch-prices secret:put:github    # GITHUB_TOKEN
```

入力プロンプトでキー本体を貼り付け（履歴に残らない）。

### B-4. GitHub PAT の権限再確認

GitHub UI で以下を確認:

- 種別: Fine-grained personal access token
- 対象リポジトリ: `Ryo722/kaden-kaimi` のみ（all repositories は不可）
- 権限: `Contents: Read and write` のみ
- 期限: 設定済み（無期限は不可）

過剰権限のトークンが本番で使われると、漏洩時の被害範囲が広がるため必須チェック。

### B-5. デプロイ

```bash
pnpm --filter kaden-kaimi-fetch-prices deploy
```

期待: `Deployed kaden-kaimi-fetch-prices triggers ... cron 0 20 * * *` 表示。

### B-6. デプロイ後の確認

Cloudflare Dashboard で以下を確認:

- Workers & Pages → `kaden-kaimi-fetch-prices` が表示される
- Triggers タブで cron `0 20 * * *` が登録されている
- Settings → Variables で secret が 3 つ揃っている（値は隠蔽）

---

## C. 初回 cron 観測（ユーザー作業、翌朝 JST 05:30 以降）

### C-1. 構造化ログの確認

```bash
pnpm --filter kaden-kaimi-fetch-prices tail
```

または Cloudflare Dashboard の Logs タブ。`event: scheduled.start` から `event: scheduled.done` までを観察。

期待ログ:

```jsonc
{"event":"scheduled.start","cron":"0 20 * * *","scheduledTime":"2026-04-27T20:00:00.000Z"}
{"event":"scheduled.category_summary","date":"2026-04-28","category":"drum-washer",
 "categoryError":null,"totalModels":15,"written":15,"skippedDuplicate":0,
 "skippedEmpty":0,"failed":0,"durationMs":...}
{"event":"scheduled.done","totalCategories":1,"totalWritten":15,"totalFailed":0,"durationMs":...}
```

許容される差分:

- `written < 15` かつ `skippedEmpty > 0`: 楽天/Yahoo 両方 0 件で意図的にスキップ（4/27 観測の Yahoo フォールバックと同じ系列）
- `failed > 0`: API エラーまたは GitHub commit 失敗。**ロールバック判断対象**

### C-2. GitHub コミットの確認

```bash
git fetch origin main
git log origin/main --oneline -5 --author=kaden-kaimi-bot
```

期待: 直近 1 コミットが `kaden-kaimi-bot` 名義で、`data/prices/drum-washer/*.json` の 15 ファイルが更新されている（部分更新の可能性あり、C-1 の `written` 件数と一致するはず）。

### C-3. 価格 JSON の差分確認

```bash
git diff origin/main~1 origin/main -- data/prices/drum-washer/
```

期待: 各機種の `priceHistory` 末尾に `2026-04-28` の PriceRecord が追加されている。

### C-4. 異常時のロールバック手順

以下のいずれかが発生した場合は即座に worker を一時無効化:

- `failed > 0` が連続 2 日続く
- GitHub に意図しないファイルへのコミットが入る
- 楽天/Yahoo API のレート制限超過ログが出る

ロールバック:

1. Cloudflare Dashboard で worker の cron trigger を一時無効化（Triggers タブから）
2. 必要に応じ `git revert <bot-commit-sha>` で価格データを巻き戻し（`git push` はユーザー実行）
3. 原因調査後、修正版を再デプロイ

---

## D. 7 日連続観測（ユーザー作業 + 優先度 3 の前提）

### D-1. 観測内容

7 日間（4/28 〜 5/4）連続で C-1〜C-3 を確認、機種別の楽天/Yahoo ヒット率を記録する。

### D-2. 集計スクリプト実行

7 日後に集計スクリプトで「楽天 N 日連続 0 件機種」を抽出。設計案は `docs/handoffs/rakuten-zerohit-permanent-fix.md` 参照（**優先度 3 で spec 化後に実装**）。

### D-3. 楽天 0 件問題の恒久対応 spec 化

D-2 のヒット率データを根拠に候補 1〜3 のいずれかを採用判断し、`/spec-task` で別 spec を起票。

---

## 完了基準

- [ ] A-1〜A-5 全 pass
- [ ] B-1〜B-6 全 pass
- [ ] C-1〜C-3 で初回 cron が `failed: 0` で完了
- [ ] D-1 開始（7 日観測のスタート）

A〜C 完了で P2.5.B は close 扱い、D は別 spec へ引き継ぐ。
