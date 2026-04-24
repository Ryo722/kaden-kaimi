# コーディング規約

## TypeScript

- `strict: true` 必須（`tsconfig.json` で設定）
- `any` 禁止（やむを得ない場合は `unknown` + 型ガード）
- 型定義は `src/types/` に集約、各ファイルで import
- 関数の引数・戻り値は明示的に型注釈

## ファイル構成

- **1ファイル 200〜400 行目安、800 行上限**（超えたら分割）
- **関数 50 行以内**
- **ネスト 4 レベル以内**
- 1 ファイル = 1 責務、機能単位でディレクトリを切る

## 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| ファイル | kebab-case | `buy-timing-signal.astro` |
| React コンポーネント | PascalCase | `RoiCalculator.tsx` |
| 関数・変数 | camelCase | `calculatePayback` |
| 定数 | SCREAMING_SNAKE_CASE | `MAX_PAYBACK_YEARS` |
| 型・インターフェース | PascalCase | `type Model = ...` |
| zod スキーマ | PascalCase + Schema | `ModelSchema` |

## インポート順

```ts
// 1. 標準ライブラリ
import { readFileSync } from "node:fs";

// 2. 外部ライブラリ
import { z } from "zod";

// 3. 内部（絶対パス or エイリアス）
import { ModelSchema } from "@/types/schema";

// 4. 相対
import { calculateRoi } from "./roi";
```

## スタイリング（Tailwind CSS v4）

- スタイルは **Tailwind ユーティリティクラスを第一選択**。`<style>` ブロックは原則使わない
- クラスの順序は `prettier-plugin-tailwindcss` に一任（手動並べ替え禁止）
- 同じクラス列が 3 箇所以上現れたらコンポーネント化 or `@utility`（`src/styles/global.css`）で集約
- デザイントークン（色・スペーシング・フォント）は `src/styles/global.css` の `@theme` ブロックに集約。任意値 `[#abc]` は原則禁止
- ダークモード対応は `@variant dark (&:where(.dark, .dark *))` の予定（Phase 1 では切替 UI 非実装）

## エラーハンドリング

- ユーザー入力・外部 API は **zod でバリデーション**
- 例外はトップレベルで一括キャッチ、ユーザーには汎用メッセージ
- サーバー側では詳細コンテキストをログ
- **silently swallow 禁止**（catch で何もしないのは NG）

## コメント方針

- デフォルトで書かない（識別子名で伝える）
- 書くべき場面:
  - 非自明な制約（「この閾値は楽天 API のレート制限に基づく」等）
  - 特定バグの回避策
  - 不変条件の明示
- 「何を」ではなく「なぜ」を書く

## テスト

- **単体テストカバレッジ 80%+** を Phase 1 完了条件とする
- テストファイルは実装と同階層: `roi.ts` → `roi.test.ts`
- テストケース: 正常系・境界値・異常系の 3 点セット
- TDD: バグ修正は失敗テストを先に書く
- 探索的 UI プロトタイプは TDD 対象外（本実装時にテスト補充）

## Git

### ブランチ

- `main`: 常にデプロイ可能
- `feature/*`: 新機能
- `fix/*`: バグ修正
- `docs/*`: ドキュメントのみ

### コミットメッセージ（Conventional Commits）

```
feat: 軸1 同等代替機種ロジック追加
fix: ROI 計算で年間使用回数を週あたりに訂正
docs: logic-specs.md に軸3 の信頼度計算を追記
refactor: constants.ts を category 別に分離
test: similarity.ts のエッジケース追加
chore: vitest 設定を tsconfig と整合化
```

### PR

- 1 PR = 1 論理的変更
- CI（lint + test + validate-data）が通ることが必須
- 変更範囲を PR description に記載
- 自動で Cloudflare Pages プレビューが生成される前提

## 禁止事項

- **`git push` を Claude が実行**（ユーザー手動）
- 秘密情報（API キー等）のコミット
- `npm install` / `yarn add` の実行（**pnpm を使用**）
- `.env` ファイルの作成（`.dev.vars` を使う）
- スキーマ未定義の JSON をデータとして追加
- ハードコードされたマジックナンバー（`constants.ts` に置く）
- 価格.com などメーカー・ポータル系サイトのスクレイピング

## 推奨ツール

- **パッケージマネージャ**: pnpm
- **リンタ**: ESLint + `@typescript-eslint/recommended-strict`
- **フォーマッタ**: Prettier（pre-commit で自動実行）
- **テスト**: Vitest + @testing-library/react
- **型チェック**: `tsc --noEmit` を CI で実行
- **データ検証**: `scripts/validate-data.ts`（CI で実行）
