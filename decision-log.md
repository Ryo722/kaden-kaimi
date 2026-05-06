---
project: kaden-kaimi
started: 2026-04-26
deprecation_when: "プロジェクトが archive 化、または ConPort/Linear 等に決定記録を移行した場合"
---

# Decision Log

重要な意思決定・トレードオフを 1 件 1 セクションで記録する。
日々の作業ログは `docs/devlog/` を使う（責務分離: decision-log = なぜ、devlog = なに/いつ）。

## 書き方の原則

- **新しい決定を上に追加**（逆時系列、最新が見つけやすい）
- 1 決定 = 1 セクション。後から訂正する場合は新セクションで「<旧決定の見直し>」と書く
- セクション末尾の **廃止条件** は、決定が陳腐化したら見直すトリガを明示する

## 決定エントリのテンプレ

```
## YYYY-MM-DD: <決定タイトル>

**判断**: <一行結論>
**根拠**: <なぜそうしたか>
**代替案**: <却下した選択肢と却下理由>
**影響範囲**: <どのファイル/領域/機能>
**廃止条件**: <この決定を見直すべきタイミング>
```

---

<!-- 以下に新しい決定を追加していく -->

## 2026-05-06: Takt CLI を `.takt/` で導入（onboarding phase 1）

**判断**: 公式 Takt CLI (`nrslib/takt`) を本 PJ で運用開始。`tasks.json` (state-first 実行台帳、spec-task / tasks-master 連携、schema 1.0) と `.takt/tasks.yaml` (Takt が消化する実行キュー) の役割を分離し、多段品質ゲートが必要なタスク向けの補完手段として導入する。

**根拠**: ワークスペース全体の Takt onboarding 第二弾（Phase 4）の対象として選定。第一弾 5 PJ（DuelMastersPlays / quest-log / portfolio / pokemon-champions / J-Quants）で workflow 駆動マルチエージェント・オーケストレーション の本番運用可能性を実機確認済（Phase 2 試運転 4 PJ で `--auto-pr --draft` での draft PR 自動生成を確認）。kaden-kaimi は `tasks.json` を独自スキーマで運用しており、Takt の workflow 駆動と相補的に組み合わせることで、`risk_tier: 中` 以上のタスクで planner → coder → 並列 review → 完了 の品質ゲート付き実行を可能にする。

**代替案**:
- Takt を導入せず `tasks.json` + 手動実行のみ継続 → 単発タスクは現状維持で十分だが、複数モジュール跨ぎや schema 変更等の中・大規模タスクで品質ゲートが弱い。複数 spec 同時進行時の orchestration が必要になる前に基盤を整える方が筋。不採用。
- Skill `/takt`（ピースエンジン）を併用 → ピースエンジンは branch を切らない単発検討用で、本 PJ の PR ベース運用と用途が違う。混乱を避けるため公式 Takt CLI のみ運用する。
- workflow キーを `.takt/config.yaml` に置く → Phase 2 試運転で「Configuration error: Unrecognized key」が判明済。`tasks.yaml` の各エントリで指定する仕様。

**影響範囲**:
- `.takt/config.yaml`（新規、`provider: claude-sdk` / `model: sonnet` / `language: ja` / `concurrency: 1` / `branch_name_strategy: ai`）
- `.takt/.gitignore`（新規、ワークスペース標準パターン）
- `.takt/tasks.yaml`（ローカル運用キュー、gitignore 済）
- `decision-log.md`（本エントリ）
- `CLAUDE.md`（Takt 統合運用節を Phase 4-C 試運転で追加予定、本 commit には含めない）

**廃止条件**: `tasks.json` 単体運用で品質ゲートが十分機能するようになり、Takt の workflow 駆動が冗長になった場合（半年運用して Takt 経由の merge が月 1 件未満なら見直し）。または Takt 公式が大きな後方互換性破壊を入れた場合。

**参照**: `~/claude-workspace/docs/takt-workflow.md` / `~/claude-workspace/docs/devlog/2026-05-06-takt-phase-3-results.md`

---

## 2026-04-29: 楽天ウェブサービス 2026 新仕様への一括移行（旧仕様併存はしない）

**判断**: spec `20260429-rakuten-api-2026-migration` に基づき、`workers/fetch-prices/src/rakuten.ts` を旧 `app.rakuten.co.jp/services/api/IchibaItem/Search/20170706` から新 `openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401` へ一括切替。`accessKey` と `Referer`/`Origin` ヘッダを必須化、レスポンスパーサを `formatVersion=2` 前提のフラット構造に書き換え。旧 endpoint へのフォールバックパスは持たない。

**根拠**: 2026-04-26 以降の本番ランで楽天が全機種 100% null になっていた症状を調査した結果、原因は楽天が 2026-02-10 に告知した API 全面リプレース（旧 2026-05-13 完全停止）にコードが追従していないことだった。`.dev.vars` の `RAKUTEN_APP_ID` は新仕様の UUID で既に有効値、ライブ検証では新 endpoint に対し `400 accessKey must be present` まで通過。残作業はコードと残り 1 つの secret（accessKey）の投入のみ。タイムリミットが 14 日と短く、二系統併存の運用負荷が一括切替のロールバックリスク（git revert で吸収可能）を上回るため、フォールバックを持たず直接切替を選択。同時に「2 ヶ月以上 silent に null が続いた」原因である `if (!response.ok) return null` の握りつぶしに対し、4xx 観測 `console.warn` を最小限追加（applicationId は先頭 4 文字までマスク）して再発防止。

**代替案**:
- 旧 endpoint をフォールバックとして残す二系統併存 → 旧は 14 日で完全停止し、二系統テスト・mock・branch 分岐の維持コストが見合わない。不採用。
- accessKey 投入のみで code は触らない（旧 endpoint で UUID を受け付ける裏ルート期待）→ 旧 endpoint は仕様上 UUID を弾くことをライブ検証済み。不採用。
- 4xx 観測ログを別 PR に分ける → silent failure が今回 2 ヶ月続いた直接の原因のため、移行 PR と同時投入が筋。不採用。
- Yahoo! 側も予防的に書き直す → Yahoo! v3 はリプレース告知なしで継続稼働中。スコープ拡大は不要。スキップ。

**影響範囲**:
- `workers/fetch-prices/src/rakuten.ts`（endpoint / 認証 / ヘッダ / parser / 4xx ログ全面更新）
- `workers/fetch-prices/src/pipeline.ts`（`PipelineEnv` に 2 キー追加、call site）
- `workers/fetch-prices/src/index.ts`（`requireSecrets` に 2 キー追加）
- `workers/fetch-prices/wrangler.toml`（`RAKUTEN_REFERER` を `[vars]` に追加）
- `workers/fetch-prices/.dev.vars.example`（applicationId コメント刷新、`RAKUTEN_ACCESS_KEY` 追加）
- `workers/fetch-prices/src/{rakuten,pipeline,index}.test.ts`（フィクスチャ・検証更新）
- `docs/api-integration.md`（楽天節を新仕様で書き換え、旧仕様は note）
- `docs/devlog/2026-04-29.md`（経緯と検証手順）
- `openspec/proposals/20260429-rakuten-api-2026-migration/spec.md`（本変更の spec）
- 過去の `data/prices/drum-washer/*.json` の 2026-04-26〜04-28 `rakutenMin: null` レコードはそのまま保持（履歴の事実として残す）

**廃止条件**: 新 endpoint で 7 日連続全機種の `rakutenMin` が安定取得され、かつ 2026-05-14 を越えた時点で spec を `archived` に。本決定エントリは恒久的に残す（API 移行という不可逆な転換点のため）。

---

## 2026-04-27: Phase 2 自動化を main にマージ完了 + 旧 Lighthouse spec を archived 化

**判断**: PR #11 (`feat(phase-2): workers cron 自動化 + 15 機種拡充 + harness Phase 5 移行`、merge commit `657daca`) を main にマージし、Phase 2 自動化作業（Workers Cron + 楽天/Yahoo!/GitHub Contents API + 機種マスタ 5→15 + minPrice/brand 名併記/filteredOutByMinPrice 観測）を本流に投入した。同時に旧 spec `20260426-lighthouse-ci-two-tier` を `status: archived` にし、後継 spec `20260427-lighthouse-check-runs-polling` への参照を `superseded_by` で明示した。役割を終えた `docs/handoffs/pr-phase-2-to-main.md` も削除。

**根拠**: phase-2-dryrun ブランチ上で 22 commits / 53 files の作業（codex review 反映済、ローカル全 324 件テスト pass、Workers bundle 551.68 KiB / 5.4%）が完了し、main 側 PR #4〜#10 で並行進行した Lighthouse CI 2 段構え化との conflict も `tasks.json` = main 側採用 / `docs/devlog/2026-04-27.md` = 両側結合で解消した。本番 Worker は wrangler.toml で `GITHUB_BRANCH = "main"` を参照するため、機種マスタ 15 件と minPrice 等の最新実装を main に取り込まないと P2.5.B 本番デプロイの完了条件「全 15 機種で初回 cron 書き込み成功」を満たせない。旧 spec の archived 化は後継 spec の `supersedes` 記述（main 側 spec で「phase-2-dryrun が main にマージされた後に別 PR で実施」と明記）に従ったフォローアップ。

**代替案**:
- phase-2-dryrun を運用ブランチとして使い続け、`GITHUB_BRANCH = "phase-2-dryrun"` に変更 → CLAUDE.md で確定済の「自動コミットは A 案（main 直 push）」と矛盾するため不採用。
- 旧 spec を物理削除 → 実装内容（`.lighthouse-preview.yml` 新設、lhci 2 段構成）の出典が失われるため不採用。`status: archived` で残置。
- archived 化を本マージ PR に含める → spec の状態遷移は別 PR が望ましい（main 側 spec での明記、レビュー粒度を分けやすい）ため別 PR に分離。

**影響範囲**:
- 本番 Worker は merge 後の main を参照、次の cron 実行（JST 05:00）から 15 機種対象に拡張される（実デプロイは P2.5.B 別作業）。
- `openspec/proposals/20260426-lighthouse-ci-two-tier/spec.md`（status / archived_at / archived_reason / superseded_by 追加）。
- `decision-log.md`（本エントリ）。
- `docs/handoffs/pr-phase-2-to-main.md`（削除）。

**廃止条件**: 本エントリは Phase 2 完了の決定記録として恒久的に残す。Phase 3（カテゴリ拡張）以降に Phase 2 の方針が変わる場合は、新セクションで「<2026-04-27 決定の見直し>」と明記して追記する（テンプレ準拠）。

---

## 2026-04-26: workspace harness Phase 5 テンプレ拡張適用

**判断**: 本プロジェクトを Phase 4 テンプレの「拡張」パターンで適用し、`decision-log.md` のみ新規追加した（`tasks.json` / `openspec/proposals/` は Phase 3 で導入済み）。

**根拠**: kaden-kaimi は Phase 3 試験で既に spec-task / tasks-master の運用に乗っており、必要な要素は decision-log.md のみだった。CLAUDE.md は破壊的書換えではなく、ワークフローの参照先を `TaskBreakdown.md` から `tasks.json` に切り替える最小差分のみ適用。

**代替案**: フル適用（テンプレ全コピー）→ 既存 tasks.json と衝突するため不採用。

**影響範囲**: `decision-log.md`（新規）、`CLAUDE.md`（参照ドキュメント節 / ワークフロー節）。

**廃止条件**: workspace harness Phase 5 が中止になった場合、本エントリと decision-log.md は削除候補。
