---
id: 20260427-lighthouse-check-runs-polling
title: Lighthouse preview workflow を Check Runs API polling 方式へ切替
status: proposed
created: 2026-04-27
risk: 中
supersedes: 20260426-lighthouse-ci-two-tier
deprecation_when: "Cloudflare Pages がネイティブ Lighthouse 統合を提供 / GitHub App が Check Runs から Deployments API へ通知方式変更し SHA 一致の deployment 取得が安定運用に乗った時点で archived"
---

## なぜ（背景）

- 旧 spec `20260426-lighthouse-ci-two-tier` で `.github/workflows/lighthouse-preview.yml` を新設し、main push 後に Cloudflare Pages preview URL を計測する 2 段構成を実装した（PR #4 / PR #5）
- main マージ後の実機確認で判明: CF Pages の GitHub App `cloudflare-workers-and-pages` は **Check Runs API のみ**を使用し、Deployments API および Statuses API には書き込まない（GitHub App の実装仕様、CF dashboard 側で変更不可）
- そのため旧 spec の `gh api /repos/.../deployments` polling は構造的に常に空配列を返し、毎回 `https://kaden-kaimi.pages.dev` への fallback 経路で動作する
- 実害は限定的（pages.dev は常に main HEAD の最新ビルドにエイリアスされる）だが、SHA 一致の厳密保証ができず、`is_fallback=true` が常時立つ運用は健全でない
- 本 spec で polling 方式を Check Runs API に切替え、SHA 一致確認を厳密に行う

## delta（変更仕様）

<!-- ADDED -->
- なし（旧 spec で導入済みの workflow / config を活かす）

<!-- MODIFIED -->
- `.github/workflows/lighthouse-preview.yml` の `Wait for Cloudflare Pages deployment` ステップを Check Runs API polling に書き換える
  - step 名は `Wait for Cloudflare Pages build` にリネーム
  - polling 対象: `gh api repos/$REPO/commits/$SHA/check-runs --jq '.check_runs[] | select(.app.slug == "cloudflare-workers-and-pages" and .name == "Cloudflare Pages")'`
  - 状態判定:
    - `status` が `queued` / `in_progress` の間は polling 継続
    - `status: completed` かつ `conclusion: success` で抜ける
    - `status: completed` かつ `conclusion` が `failure` / `timed_out` / `cancelled` / `action_required` / `stale` / `neutral` / `skipped` のいずれかなら workflow を fail（`exit 1`）
    - `check_runs` 配列が完全に空の場合のみ既存仕様通り `is_fallback=true` で `https://kaden-kaimi.pages.dev` へフォールバック（極端なケース用セーフティネット）
  - 計測 URL は `https://kaden-kaimi.pages.dev` 固定（Check Runs の `details_url` は CF dashboard URL であり preview URL は含まれないため、CF Pages の標準動作で main HEAD 最新ビルドにエイリアスされる本番 URL を使う）
  - polling 間隔は既存維持: 30s × 10 回 + 60s sleep + 1 回再試行
- `.github/workflows/lighthouse-preview.yml` の `permissions` を `deployments: read` → `checks: read` に変更
- `docs/architecture.md` の「CI/CD 構成」節「preview URL の解決」記述を Check Runs API polling 方式に合わせて更新
- `README.md` の Lighthouse メモを必要に応じて補足（main HEAD と pages.dev エイリアスの関係を簡潔に）

<!-- REMOVED -->
- `.github/workflows/lighthouse-preview.yml` から Deployments API 関連の `gh api /repos/.../deployments` および `/statuses` 呼び出しを削除

## 制約・非スコープ

- `is_fallback` output と artifact `-fallback` サフィックスは現状維持（`check_runs` が空のときのセーフティネット用）。push trigger 時に fail 化する強化案は本 spec のスコープ外（次回改訂候補として devlog にメモ）
- 旧 spec ファイル `openspec/proposals/20260426-lighthouse-ci-two-tier/spec.md` は phase-2-dryrun ブランチにのみ存在し、本ブランチからは触れない。`status: archived` への更新は phase-2-dryrun が main にマージされた**後**、別 PR で実施する
- Cloudflare ダッシュボード側のネイティブ Lighthouse 機能の利用は本 spec の対象外
- Check Runs API のレートリミット (5000 req/h authenticated) は polling 頻度（30s × 最大 11 回 = 330s に 11 リクエスト）に対し十分余裕があるため考慮不要

## 受け入れ条件

- [ ] main マージ後、`Lighthouse on Cloudflare Pages preview URL` workflow が起動する
- [ ] CF ビルドが完了するまで polling が `in_progress` を待ち、`success` で抜ける
- [ ] job summary に `Fallback used: false` と表示される（check_runs が取得できた場合）
- [ ] CF ビルドが `failure` / `timed_out` / `cancelled` / `action_required` / `stale` / `neutral` / `skipped` のいずれかの場合、workflow が失敗する（緑にならない）
- [ ] `.lighthouserc.preview.json` の `uses-http2` audit が引き続き pass する
- [ ] `docs/architecture.md` の「CI/CD 構成」節が新方式の説明に更新されている
- [ ] `README.md` の Lighthouse 関連メモが新方式と矛盾しない

## 設計判断

- **計測 URL を pages.dev 固定にする理由**: Check Runs の `details_url` は CF dashboard の deployment detail 画面 URL であり、preview URL（`<deployment-uuid>.kaden-kaimi.pages.dev`）を含まない。CF Pages の標準仕様で `kaden-kaimi.pages.dev` は常に main 最新成功ビルドにエイリアスされるため、SHA 一致を Check Runs で保証した上で固定 URL を計測すれば実用上問題ない
- **`neutral` / `skipped` も fail 扱いにする理由**（codex 助言反映）: GitHub Actions の依存関係上は成功扱いだが、「main HEAD が Pages に反映済み」の証明にはならない。Lighthouse 計測の前提として「対象 SHA がデプロイされている」ことを保守的に確認したい
- **空配列 fallback を残す理由**: CF 側 GitHub App の障害や API 仕様変更で全 check_run が出ない極端なケースでも、main HEAD の品質劣化検知は継続したい。ただし常用される運用ではないため `is_fallback=true` フラグを強く可視化（artifact suffix + job summary）する
- **polling 間隔 30s を変えない理由**: CF Pages のビルド時間は通常 2-3 分。30s × 10 + 60s = 6 分でほぼ全ケースをカバー。レート制限的にも十分余裕

## 検証手順（マージ後）

1. main マージで自動的に `Lighthouse on Cloudflare Pages preview URL` workflow が起動することを確認
2. Actions UI で job summary を開き、`Fallback used: false` が表示されることを確認
3. workflow の `Wait for Cloudflare Pages build` ステップのログで polling 中に `status: in_progress` を経て `conclusion: success` で抜けたことを確認
4. Lighthouse の計測結果（artifact `lighthouse-preview-reports`）でしきい値 P90/A95/BP90/SEO90 を満たすことを確認
