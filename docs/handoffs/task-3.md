# タスク3 引き継ぎ（Phase 1 / 5軸ロジック実装）

このドキュメントは新しい Claude Code セッションでタスク 3 を開始する際の完全な指示書。
前セッション（2026-04-24）でタスク 1-2 を完了した状態を前提とする。

---

## 新セッションで貼り付けるプロンプト

次のブロック全体を新セッションに貼り付ける。

```
Phase 1 のタスク 3（5軸ロジック実装）を TDD で進めてください。

準備:
1. CLAUDE.md でプロジェクト固有ルールを確認
2. docs/handoffs/task-3.md を熟読（前セッションからの全申し送り事項）
3. TaskBreakdown.md § 3 と docs/logic-specs.md を仕様の真実として扱う

進行スタイル:
- 軸 1（similarity）と軸 2（roi）を実装した時点でいったん停止し、確認を求めてください
- 各サブタスクで Red → Green → Refactor を守る
- 大きな判断に迷ったら logic-specs.md を先に更新（文書優先）

よろしくお願いします。
```

---

## 作業ディレクトリ

```
/Users/ryohanazaki/claude-workspace/projects/kaden-kaimi
```

---

## 前セッションの成果（タスク 1-2）

### タスク 1: プロジェクト初期化（完了）
- Astro 6.1.9 / TypeScript 5.9.3 strict / Tailwind CSS v4（`@tailwindcss/vite`）
- `@astrojs/cloudflare` 13.2.1 / `@astrojs/react` 5.0.4 / React 19.2.5
- zod 4.3.6 / vitest 4.1.5 / eslint 10 flat config / prettier 3
- `@/*` エイリアス設定済み（`src/*`）
- `src/styles/global.css` に `@theme` ブロックでトークン管理

### タスク 2: 型定義・サンプルデータ（完了）
- `src/types/schema.ts` — Model / PriceHistory / EnergyRates / Brand
- `src/types/index.ts` — re-export
- `src/types/schema.test.ts` — 14 テスト
- `data/models/drum-washer/` 5 機種、`data/prices/drum-washer/` 各 30 日分
- `data/brands.json`, `data/energy-rates.json`
- `scripts/validate-data.ts`, `scripts/generate-sample-prices.ts`

### 検証済みコマンド（全て pass）
```bash
pnpm typecheck   # astro check → 0 errors
pnpm test        # vitest run → 14 passed
pnpm lint        # eslint → 0 issues
pnpm validate    # 5 models OK
pnpm build       # dist/ 生成、/index.html prerender
```

---

## タスク 3 の実施内容

TaskBreakdown.md § 3 を参照。サブタスクは 10 項目（3.1〜3.10）。

### 実装順と対応する仕様章

| # | ファイル | 仕様 | 備考 |
|---|---|---|---|
| 3.1 | `src/lib/constants.ts` | logic-specs.md 全体 | 閾値・重み・翻訳テーブル集約 |
| 3.2 | `src/lib/models.ts` | data-schema.md Model | 読込 + 索引 |
| 3.3 | `src/lib/prices.ts` | data-schema.md PriceHistory | 欠損（null）の扱い |
| 3.4 | `src/lib/similarity.ts` | logic-specs.md §軸1 | 上位 3 件返却 |
| 3.5 | `src/lib/roi.ts` | logic-specs.md §軸2 | 境界値（5/8/12年） |
| 3.6 | `src/lib/cycle.ts` | logic-specs.md §軸3 | `now` は引数 |
| 3.7 | `src/lib/diff.ts` | logic-specs.md §軸5 | 閾値超のみ報告 |
| 3.8 | `src/lib/matcher.ts` | logic-specs.md §軸6 | roi を呼出 |
| 3.9 | — | — | `pnpm test:coverage` で 80%+ |
| 3.10 | — | — | devlog 作成・TaskBreakdown 更新 |

### TDD の必須テストケース（logic-specs.md 準拠）

**軸1 similarity**:
- 同ブランド前世代が候補に含まれる
- 容量差 > 1kg は除外
- コア機能（heat-pump かつ dryCapacityKg > 3）欠落は除外
- `discontinued` 切替オプションの両方向

**軸2 roi**:
- 年間差額 <= 0 → `paybackYears = Infinity`, `verdict = "no-benefit"`
- 境界値 5.0 / 8.0 / 12.0 年で判定が正しい側に倒れる
- `current` 未入力のスキップ挙動

**軸3 cycle**:
- 祖先 0 → `confidence: "none"`（UI 非表示）
- 祖先 1 → `"low"`、祖先 2 → `"medium"`、祖先 3+ → `"high"`
- 偶数個の中央値計算の挙動

**軸5 diff**:
- predecessor が null の場合
- 数値差分が閾値（5%, 5%, 0.5kg）未満は報告しない
- features の追加・削除・変更なし、3 パターン

**軸6 matcher**:
- 寸法 1 つでも超過 → `dimensions: 0`
- 予算超過 → `budget: 0`
- トップ 3 のみ返却、同点時の決定性

---

## 技術スタック上の要注意事項

### zod 4 固有 API
- 日付: `z.iso.date()`（**NOT** `z.string().date()`）
- URL: `z.url()`（**NOT** `z.string().url()`）
- 未知キー拒否: `.strict()`
- 複雑な検証: `.refine()` / `.superRefine((val, ctx) => ctx.addIssue({ code: "custom", ... }))`

### 既存の正規表現（`src/types/schema.ts`）
- 機種 ID: `/^[a-z0-9-]+$/`
- features タグ: `/^(?:[a-z]+:)?[a-z][a-z0-9-]*$/`

### データローダの注意点
- `PriceRecord` の各価格フィールドは `number | null`（欠損許容）
- 平均計算時は `null` を除外すること（含めると `NaN`）
- `history` は日付昇順・重複なしが保証されている（スキーマで強制済み）

### インポート規約
- Node 組み込み: `node:fs`, `node:path`, `node:url`（@types/node インストール済み）
- プロジェクト内: `@/*` エイリアス可、または相対

### コーディング規約の徹底
- ファイル 200-400 行目安、800 行上限
- 関数 50 行以内、ネスト 4 レベル以内
- ハードコード禁止（`constants.ts` に集約）
- 純粋関数・決定性（現在時刻は引数で受ける）
- コメントは WHY のみ

---

## 完了条件

以下をすべて満たすまでタスク 3 は未完了:

- [ ] TaskBreakdown.md § 3 すべて `[x]`
- [ ] `pnpm test` 全 pass
- [ ] `pnpm test:coverage` で `src/lib/**` のカバレッジ 80%+（lines/functions/branches/statements）
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint` 0 errors
- [ ] `pnpm validate` 引き続き 5 models OK（データ改変なし）
- [ ] `pnpm build` 成功
- [ ] `docs/devlog/YYYY-MM-DD.md` 作成（実装判断と検証結果を記録）

---

## コミット戦略

大規模変更（複数ファイル + 公開挙動変更）に該当するため、グローバル CLAUDE.md の
「中規模変更では実装前の計画レビューと実装後の差分レビューを提案」を適用する。

推奨コミット単位:
1. `feat: axis1 similarity logic` — 軸1 + constants 部分
2. `feat: axis2 roi logic` — 軸2
3. `feat: axis3 cycle prediction` — 軸3
4. `feat: axis5 generation diff` — 軸5
5. `feat: axis6 condition matcher` — 軸6
6. `chore: bump coverage, complete Phase 1 task 3` — 最終調整

または全軸まとめて 1 コミットでも可（ユーザーに相談）。

---

## 参照ドキュメント（読む順）

1. `CLAUDE.md` — ルール（自動ロード）
2. `docs/logic-specs.md` — 5 軸の仕様
3. `docs/coding-conventions.md` — 規約
4. `docs/data-schema.md` — データ構造
5. `src/types/schema.ts` — 既存型
6. `docs/devlog/2026-04-24.md` — 前セッションの判断記録
7. `TaskBreakdown.md` § 3 — タスク一覧
