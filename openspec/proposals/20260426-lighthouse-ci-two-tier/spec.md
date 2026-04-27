---
id: 20260426-lighthouse-ci-two-tier
title: Lighthouse CI を 2 段構え化（PR=staticDistDir / main+nightly=preview URL）
status: proposed
created: 2026-04-26
risk: 中
deprecation_when: "Cloudflare Pages のネイティブ Lighthouse 統合が安定運用に乗り、自前 GitHub Actions が不要になった時点で archived"
---

## なぜ（背景）

- 現状: PR の Lighthouse CI は `staticDistDir` で `dist/client` を直接計測している（再現性は高いが、実 CDN 配信下での挙動は計測できていない）
- main push / nightly では実 Cloudflare Pages preview URL を計測する経路がなく、HTTP/2/3 や CDN キャッシュの効きが本番に近い形で確認できていない
- `numberOfRuns: 2` は flake が稀に起きており、しきい値ギリギリのスコアで赤になる
- TaskBreakdown-phase2.md P2.7.1〜P2.7.5（全 5 タスク未着手）

## delta（変更仕様）

<!-- ADDED -->
- `.github/workflows/lighthouse-preview.yml` を新規作成。main push および nightly schedule で起動し、Cloudflare Pages preview URL を `--collect.url` で計測する
- preview URL の deployment 完了 polling ロジックを追加（`gh api /repos/.../deployments` と `statuses` を使用）。固定 sleep フォールバックも持つ
- `.lighthouserc.preview.json` を新規作成。preview URL 用の lighthouse 設定（`uses-http2` skip を外す、しきい値は PR 側と同一）

<!-- MODIFIED -->
- 既存の `.github/workflows/lighthouse.yml` は staticDistDir 計測のまま据え置き、ただし発火条件を PR のみに明示する
- `.lighthouserc.json` の `numberOfRuns` を 2 → 3 に増やす（flake 耐性向上、PR/preview 共通）
- README または docs に「PR=静的配信、main+nightly=preview URL」の 2 段構成を明記

<!-- REMOVED -->
- なし

## 制約・非スコープ

- Lighthouse GitHub App 導入は P2.8 で別途判断（本 spec では取り扱わない）
- preview URL の deployment が極端に遅い（5 分超）場合のリトライ戦略は MVP では fixed-sleep フォールバックのみ
- Cloudflare ダッシュボード側の Lighthouse 機能は本 spec の対象外

## 受け入れ条件

- [ ] PR で従来通り staticDistDir 計測が走り、しきい値 P90/A95/BP90/SEO90 を満たす
- [ ] main push 後、preview URL に対して新 workflow が走り、しきい値を満たす
- [ ] nightly schedule で同 workflow が走る
- [ ] `numberOfRuns: 3` で過去 1 週間の flake 率が下がる（観察期間付き）
- [ ] preview URL 計測時に `uses-http2` audit が skip されていない（CF は HTTP/2/3 配信のため）

## 設計判断

- preview URL polling は `gh api` を使い、最大 5 分待機。それでも `state: success` にならない場合は固定 sleep 60s でフォールバック
- nightly schedule は JST 04:00（UTC 19:00）に設定し、Workers cron（JST 05:00）の前に走らせる
- `numberOfRuns: 3` の median を採用（GitHub Actions の所要時間は約 +30s だが許容）
