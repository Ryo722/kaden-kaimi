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
