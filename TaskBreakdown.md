# Phase 1 (MVP) タスクブレイクダウン

Phase 1 の完了条件は `ROADMAP.md` の「Phase 1 成功指標」を参照。

記法: `[ ]` 未着手 / `[~]` 進行中 / `[x]` 完了 / `[!]` ブロック中

## 1. プロジェクト初期化

- [x] 1.1 Astro プロジェクト生成（TypeScript strict）— 手動スキャフォールド、Astro 6.1.9
- [x] 1.2 Cloudflare Pages adapter 追加（`@astrojs/cloudflare` 13.2.1）
- [x] 1.3 依存ライブラリ追加（zod, vitest, @astrojs/react, react, react-dom）
- [x] 1.4 Tailwind CSS 導入（Tailwind 4 + `@tailwindcss/vite` + `prettier-plugin-tailwindcss`）
- [x] 1.5 ESLint（flat config）/ Prettier / tsconfig（astro strict 継承）設定
- [x] 1.6 `.gitignore`, `.editorconfig`, `.nvmrc` 確認（既存を流用）
- [ ] 1.7 git 初期化・初回コミット

**完了条件**: `pnpm build` が Cloudflare adapter で成功 ✅（2026-04-24 検証済み、prerendering `/index.html` 成功）

## 2. 型定義・サンプルデータ

- [ ] 2.1 `src/types/schema.ts` に zod スキーマ定義
  - `ModelSchema`, `PriceHistorySchema`, `EnergyRatesSchema`, `BrandSchema`
- [ ] 2.2 `src/types/index.ts` に型エクスポート
- [ ] 2.3 サンプル機種マスタ作成（ドラム式洗濯機 5 機種）
  - パナソニック NA-LX129DL / NA-LX127DL（前世代）
  - 日立 BD-SX120HL
  - 東芝 TW-127XP3L
  - シャープ ES-X11A
- [ ] 2.4 サンプル価格履歴作成（各機種 30 日分、手動）
- [ ] 2.5 `data/energy-rates.json` 作成
- [ ] 2.6 `data/brands.json` 作成
- [ ] 2.7 `scripts/validate-data.ts` でスキーマ検証 CLI
- [ ] 2.8 `pnpm validate` npm スクリプト追加

**完了条件**: `pnpm validate` が全 JSON に対して pass

## 3. 5軸ロジック実装

各軸は `docs/logic-specs.md` の仕様に従う。

- [ ] 3.1 `src/lib/constants.ts` — 閾値・パラメータ集約
- [ ] 3.2 `src/lib/models.ts` — 機種データ読み込み
- [ ] 3.3 `src/lib/prices.ts` — 価格時系列読み込み
- [ ] 3.4 `src/lib/similarity.ts` — 軸1: 同等代替候補抽出
- [ ] 3.5 `src/lib/roi.ts` — 軸2: ROI 計算
- [ ] 3.6 `src/lib/cycle.ts` — 軸3: モデルチェンジ周期予測
- [ ] 3.7 `src/lib/diff.ts` — 軸5: 世代差分抽出
- [ ] 3.8 `src/lib/matcher.ts` — 軸6: 条件マッチング
- [ ] 3.9 各 lib に対応する `*.test.ts` 追加（正常・境界・異常）
- [ ] 3.10 `pnpm test` でカバレッジ 80%+ 確認

**完了条件**: 全軸のユニットテストカバレッジ 80%+、全テストパス

## 4. 機種詳細ページ

- [ ] 4.1 ルーティング `src/pages/washers/[modelId].astro`
- [ ] 4.2 Astro コンポーネント実装
  - `src/components/BuyTimingSignal.astro`（軸3）
  - `src/components/AlternativeModels.astro`（軸1）
  - `src/components/GenerationDiff.astro`（軸5）
- [ ] 4.3 React Island 実装
  - `src/components/RoiCalculator.tsx`（軸2）
  - `src/components/ConditionMatcher.tsx`（軸6）
- [ ] 4.4 共通レイアウト `src/layouts/Base.astro`
- [ ] 4.5 スタイリング（Tailwind ユーティリティで実装、共通トークンは `tailwind.config.mjs`）
- [ ] 4.6 Lighthouse 計測（Performance 90+, A11y 95+）

**完了条件**: 5 機種すべての詳細ページが実データで正しく表示

## 5. デプロイ

- [ ] 5.1 Cloudflare Pages プロジェクト作成
- [ ] 5.2 GitHub 連携・自動デプロイ設定
- [ ] 5.3 プレビュー環境と本番環境の分離
- [ ] 5.4 本番 URL は `*.pages.dev` を使用（独自ドメインは Phase 2 以降で判断）
- [ ] 5.5 Lighthouse CI 組み込み（GitHub Actions）

**完了条件**: 本番 URL で全機種ページがアクセス可能、CI で Lighthouse 基準を満たす

## 依存関係

```
1 → 2 → 3 → 4 → 5
```

- 2 と 3 は一部並行可能（3.1, 3.2 は 2.1–2.2 後に着手可能）
- 4 は 3 完了後
- 5 は 4 完了後

## 未解決事項

- [x] CSS フレームワーク選定 → **Tailwind CSS**（2026-04-24 確定）
- [x] Cloudflare アカウント準備 → **完了**（`wrangler login` 成功、2026-04-24）
- [ ] ドメイン名の決定（Phase 2 以降で判断、MVP は `*.pages.dev` で運用）
- [ ] 楽天 / Yahoo! API の開発者登録（Phase 2 前までに）
- [ ] ロゴ・ブランドカラー決定（Tailwind テーマ拡張で定義）
