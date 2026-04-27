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

## 2026-04-26: workspace harness Phase 5 テンプレ拡張適用

**判断**: 本プロジェクトを Phase 4 テンプレの「拡張」パターンで適用し、`decision-log.md` のみ新規追加した（`tasks.json` / `openspec/proposals/` は Phase 3 で導入済み）。

**根拠**: kaden-kaimi は Phase 3 試験で既に spec-task / tasks-master の運用に乗っており、必要な要素は decision-log.md のみだった。CLAUDE.md は破壊的書換えではなく、ワークフローの参照先を `TaskBreakdown.md` から `tasks.json` に切り替える最小差分のみ適用。

**代替案**: フル適用（テンプレ全コピー）→ 既存 tasks.json と衝突するため不採用。

**影響範囲**: `decision-log.md`（新規）、`CLAUDE.md`（参照ドキュメント節 / ワークフロー節）。

**廃止条件**: workspace harness Phase 5 が中止になった場合、本エントリと decision-log.md は削除候補。
