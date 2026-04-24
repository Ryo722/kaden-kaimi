# タスク4 引き継ぎ（Phase 1 / 機種詳細ページ）

このドキュメントは新しい Claude Code セッションでタスク 4 を開始する際の完全な指示書。
前セッション（2026-04-24）でタスク 1-3 を完了した状態を前提とする。

---

## 新セッションで貼り付けるプロンプト

次のブロック全体を新セッションに貼り付ける。

```
Phase 1 のタスク 4（機種詳細ページ）を進めてください。

準備:
1. CLAUDE.md でプロジェクト固有ルールを確認
2. docs/handoffs/task-4.md を熟読（前セッションからの全申し送り事項）
3. TaskBreakdown.md § 4、docs/logic-specs.md、src/lib/ の既存 API を前提とする

進行スタイル:
- チェックポイント（CP1〜CP6）ごとに停止し、ブラウザ確認してから次へ進むこと
- サーバー計算（軸1/3/5）と React Island 計算（軸2/6）の分担を守る
- 実装前に判断が必要な項目（現在価格の採用ロジック、画像プレースホルダ、ブランドカラー）は
  先に logic-specs.md / coding-conventions.md に反映してから実装に入る
- 中〜大規模変更にあたるため、完了時点で codex exec による差分レビューを実施

よろしくお願いします。
```

---

## 作業ディレクトリ

```
/Users/ryohanazaki/claude-workspace/projects/kaden-kaimi
```

---

## 前セッションの成果（タスク 1-3）

### タスク 1: プロジェクト初期化（完了）
- Astro 6.1.9 / TypeScript 5.9.3 strict / Tailwind CSS v4（`@tailwindcss/vite`）
- `@astrojs/cloudflare` 13.2.1 / `@astrojs/react` 5.0.4 / React 19.2.5
- zod 4.3.6 / vitest 4.1.5 / eslint 10 flat config
- `@/*` エイリアス（`src/*`）、`src/styles/global.css` の `@theme` でトークン管理

### タスク 2: 型定義・サンプルデータ（完了）
- `src/types/schema.ts` — 全 zod スキーマ（`.strict()`）
- `data/models/drum-washer/*.json` — 5 機種、`data/prices/drum-washer/*.json` — 各 30 日
- `scripts/validate-data.ts` で CI 検証

### タスク 3: 5軸ロジック実装（完了・今回追加）
- `src/lib/` に 9 ファイル + 7 テスト
  - `constants.ts`: 全軸の閾値・重み・翻訳テーブル集約
  - `models.ts`: `loadAllModels` / `loadModel` / `findModelById` / `indexModelsById`
  - `prices.ts`: `loadPriceHistory` / `getLatestRecord` / `averageField`（null 除外）
  - `similarity.ts`: 軸1 `findAlternatives`
  - `roi.ts`: 軸2 `calculateRoi`
  - `cycle.ts`: 軸3 `predictCycle` + 日付ヘルパー（`addDaysIso` / `daysBetweenIso` / `median`）
  - `diff.ts`: 軸5 `computeGenerationDiff`
  - `matcher.ts`: 軸6 `matchModels`
  - `testing.ts`: `makeModel` / `makePriceHistory` 共通 fixture
- コミット: `f76f676` 〜 `bce8abd`（全 6 件）
- codex レビューで Critical 1 / Warning 3 を対応済み
- `docs/logic-specs.md` を実装と同期（軸1 スコア式、軸2 境界ルール、軸3 祖先0件規約、
  半整数中央値の丸め、軸5 閾値、軸6 容量適合式、責務分離方針）

### 検証済みコマンド（全て pass）
```bash
pnpm test          # 100 tests passed
pnpm typecheck     # 0 errors / 0 warnings / 0 hints
pnpm lint          # 0 issues
pnpm validate      # 5 models OK
pnpm build         # success（prerender /index.html）
pnpm test:coverage # stmts 97.27% / branches 89.65% / funcs 98.27% / lines 97.7%
```

git はローカル 6 コミット分未 push（リモート未設定、Phase 1 タスク 5 で初回 push 予定）。

---

## タスク 4 の実施内容

TaskBreakdown.md § 4 を参照。サブタスクは 4.1〜4.6 の 6 項目。

### 実装方針（推奨）

サーバー計算 vs クライアント計算の分担:

| 軸 | 計算タイミング | 理由 |
|---|---|---|
| 軸1 similarity | サーバー (Astro frontmatter) | ユーザー入力不要、prerender 可 |
| 軸3 cycle | サーバー | `now` はビルド時、prerender 可 |
| 軸5 diff | サーバー | 静的計算、prerender 可 |
| 軸2 roi | クライアント (React Island) | ユーザーが現機種スペック入力 |
| 軸6 matcher | クライアント (React Island) | ユーザーが条件入力 |

`client:load` は **RoiCalculator** と **ConditionMatcher** のみに限定する（CLAUDE.md の
「React Island は client:load を最小限」規約）。それ以外の軸は Astro 静的レンダ。

### ページ設計

`src/pages/washers/[modelId].astro`
- `export const prerender = true;`
- `getStaticPaths()` で 5 機種すべてを事前生成
- frontmatter で `loadModel` / `loadAllModels` / `loadPriceHistory` を呼ぶ
- 軸1 / 3 / 5 は frontmatter で計算、結果を Astro コンポーネントに props で渡す
- 軸2 / 6 は React Island に初期 props（EnergyRates、候補配列、現在価格など）を渡す

セクション構成:
1. ヘッダー（機種名、画像、msrp、現在価格、発表/発売日）
2. 買い時シグナル（軸3）: `BuyTimingSignal.astro`
3. ROI 計算機（軸2、client:load）: `RoiCalculator.tsx`
4. 代替候補（軸1）: `AlternativeModels.astro`
5. 世代差分（軸5）: `GenerationDiff.astro`
6. 条件マッチング（軸6、client:load）: `ConditionMatcher.tsx`

### 実装前に確定すべき判断事項

TaskBreakdown 着手前に `docs/logic-specs.md` または `docs/coding-conventions.md` に
先行反映してから実装に入る（文書優先ルール）。

**1. 現在価格の採用ロジック**（`src/lib/prices.ts` に関数を追加）
- PriceHistory の最新レコードから何を「現在価格」として採用するか。
- 選択肢:
  - (a) `rakutenAvg` のみ — 軸3 内部計算と一貫
  - (b) `min(rakutenMin, yahooMin)` — ユーザーが実際に買える最安値
  - (c) 4 フィールドの平均
- 推奨: **表示用（ヘッダー・priceDelta）は (b)、軸3/5/6 の内部計算用は (a)** と分離。
  `prices.ts` に `getDisplayPrice(record) → number | null` と
  `getInternalPrice(record) → number | null` を追加。null は全フィールド欠損時。

**2. 画像プレースホルダ**
- サンプルデータの `imageUrl` は `/images/models/*.webp` だが実体ファイルなし。
- Phase 1 は SVG プレースホルダで代替（ブランド頭文字のタイポ入り）。
- `public/images/models/` にダミー配置 or Astro コンポーネントで inline SVG 生成。

**3. ブランドカラーと `@theme` 設計**
- `src/styles/global.css` の `@theme` に primary / surface / muted / danger の
  CSS 変数を追加。Phase 1 は中立配色（slate + emerald など）で妥協 OK。
- `tailwind.config.mjs` は **作らない**（Tailwind v4 規約）。

### 段階的チェックポイント（推奨進行）

各 CP でブラウザ確認 → ユーザー承認してから次へ。

| CP | 完了条件 |
|---|---|
| CP1 | `Base.astro` レイアウト + `/washers/[modelId]` 雛形で 5 機種のヘッダー（機種名 + msrp + 現在価格）が表示される |
| CP2 | 軸3 `BuyTimingSignal.astro` セクション完成（次モデル発表予測、値下がり予測、confidence）|
| CP3 | 軸1 `AlternativeModels.astro` + 軸5 `GenerationDiff.astro` 完成 |
| CP4 | 軸2 `RoiCalculator.tsx` (React Island) 完成、ユーザー入力で verdict が更新される |
| CP5 | 軸6 `ConditionMatcher.tsx` (React Island) 完成、Top 3 表示 |
| CP6 | スタイリング仕上げ、Lighthouse Performance 90+ / A11y 95+ を 1 機種で達成 |

---

## 技術スタック上の要注意事項

### Astro 6 / Cloudflare Pages
- 各ページで `export const prerender = true;` を明示
- `@astrojs/cloudflare` で SSR も可能だが、Phase 1 は静的のみで十分
- `pnpm dev` で開発サーバー、ブラウザで http://localhost:4321 確認
- `getStaticPaths` は async/await 可（`loadAllModels` は同期だが将来の差し替え余地）

### Tailwind CSS v4
- デザイントークンは `src/styles/global.css` の `@theme` ブロック
- `tailwind.config.mjs` は作らない（前セッションで `@tailwindcss/vite` 経由統合済み）
- `prettier-plugin-tailwindcss` がクラス順を自動並べ替え（手動並べ替え禁止）
- 任意値 `[#abc]` / `[10px]` は原則禁止、トークン追加で対応
- ダークモード切替 UI は Phase 1 非対応（`@variant dark` の準備は可）

### React Island
- `client:load` はユーザーインタラクションが必要なコンポーネントのみ
- 初期 props は JSON serializable に限る（`EnergyRates`、`Model[]`、`number` は OK）
- `Map<string, number>` は JSON 経由でシリアライズできないので、
  `Array<[string, number]>` や `Record<string, number>` に変換して渡す
- 軸6 `matchModels` の入力 `currentPrices: Map<string, number>` は island 側で再構築

### 既存 lib API（タスク 3 成果物）

```ts
findAlternatives(target, all, { includeDiscontinued? }) → Alternative[]
calculateRoi({ current, next, nextPriceYen, rates, weeklyUses? }) → RoiResult | null
predictCycle({ target, ancestors, ancestorPrices, targetCurrentPrice, now }) → CycleResult
computeGenerationDiff({ target, predecessor, targetCurrentPrice?, predecessorCurrentPrice? }) → GenerationDiff
matchModels({ candidates, householdSize, maxWidthMm, maxHeightMm, maxDepthMm,
              weeklyUses, budgetYen, priorityFeatures, currentPrices, currentModel, rates }) → MatchResult[]
```

すべて純粋関数・決定的・同点は id 昇順。既存テスト 100 件を壊さずに UI を追加する。

### データ読込上の注意

- `loadAllModels("drum-washer")` は `process.cwd()/data/models/drum-washer/*.json` を同期読込
- Cloudflare Pages ビルド時は `process.cwd()` がリポジトリルートになる前提
- ビルド失敗時は `pnpm build` のログで読込パスを確認

### 祖先の解決

軸3 `predictCycle` の `ancestors: Model[]` は「target.predecessorId を辿ったチェーン、
新しい順」。サンプルデータでは Panasonic 系のみ 2 世代（NA-LX129DL → NA-LX127DL）。
他 3 機種（Hitachi / Toshiba / Sharp）は `predecessorId: null` → 祖先 0 件
→ `confidence: "none"` → UI 側で「データ不足のため予測非表示」セクション状態を出す。

---

## 完了条件

以下をすべて満たすまでタスク 4 は未完了:

- [ ] TaskBreakdown.md § 4 すべて `[x]`
- [ ] `pnpm build` で 5 機種 + トップページの prerender 成功
  （`dist/washers/<modelId>/index.html` が 5 件生成される）
- [ ] `pnpm typecheck` 0 errors
- [ ] `pnpm lint` 0 errors
- [ ] `pnpm test` 引き続き 100 件 pass（lib テスト維持、UI テスト追加は任意）
- [ ] `pnpm validate` 引き続き 5 models OK
- [ ] `pnpm dev` で 5 機種すべての詳細ページをブラウザで確認（スクリーンショット or 目視）
- [ ] Lighthouse: Performance 90+ / Accessibility 95+（1 機種で計測）
- [ ] `docs/devlog/YYYY-MM-DD.md` 作成（実装判断と検証結果を記録）

---

## コミット戦略

タスク 3 と同じ Conventional Commits 形式、Co-Authored-By 付与。
CP ごと or セクションごとに分割を推奨（タスク 3 と同じ 6 コミット前後）。

推奨単位:
1. `feat: base layout + model detail route scaffold`（CP1 + 現在価格ヘルパー）
2. `feat: buy-timing signal section (axis 3)`（CP2）
3. `feat: alternative models + generation diff sections (axis 1, 5)`（CP3）
4. `feat: roi calculator react island (axis 2)`（CP4）
5. `feat: condition matcher react island (axis 6)`（CP5）
6. `chore: styling polish + lighthouse pass`（CP6 + 最終調整）

中〜大規模変更にあたるため、完了時点で `codex exec` 差分レビューを推奨（タスク 3 と同様）。

`git push` はリモート未設定のためまだ実施しない（タスク 5 で Cloudflare Pages 連携時に
初回 push）。

---

## 参照ドキュメント（読む順）

1. `CLAUDE.md` — ルール（自動ロード）
2. `docs/logic-specs.md` — 5 軸の仕様（実装と同期済み）
3. `docs/coding-conventions.md` — 規約（Tailwind v4、命名、テスト）
4. `docs/data-schema.md` — データ構造
5. `src/lib/*` — 既存 lib API（全軸実装済み）
6. `src/types/schema.ts` — 型・zod スキーマ
7. `docs/devlog/2026-04-24.md` — 前セッションの判断記録（タスク 1〜3）
8. `TaskBreakdown.md` § 4 — タスク一覧

### 参考リンク（ビルド中の API 確認用）

- Astro 6: https://docs.astro.build
- Astro Islands: https://docs.astro.build/en/concepts/islands/
- Tailwind v4: https://tailwindcss.com/docs
- Cloudflare Pages adapter: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
