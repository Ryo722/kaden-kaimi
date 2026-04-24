# 5軸ロジック仕様

実装は `src/lib/` 配下。**変更時は本ドキュメントを先に更新し、実装とテストを追従させる**。

## 軸1: 同等代替機種の自動提示

**目的**: ユーザーが見ている機種に対し、スペック同等で安い候補を提示する。

**入力**: 対象機種 `target: Model`、全機種配列 `all: Model[]`

**アルゴリズム**

1. 除外: `target` 自身、`discontinued` 機種（`includeDiscontinued` オプションで切替、既定 false）
2. 一次フィルタ: 以下すべてを満たす
   - `|specs.washCapacityKg - target.washCapacityKg| <= 1`
   - `specs.features` が `target` のコア機能をすべて含む
   - `specs.dryCapacityKg > 3`（コア乾燥能力）
3. スコアリング（下記「スコアリング詳細」）
4. 上位 3 件を返す（スコア降順、同点時は id 昇順で決定的）

**コア機能定義**（ユーザーの乗り換え許容度が低い必須機能）

- `heat-pump`（乾燥方式はヒーター型と区別）
- `dryCapacityKg > 3`（乾燥能力、specs レベルで検査）

**スコアリング詳細**

```
featureMatchRatio   = |target.features ∩ candidate.features| / |target.features|
                      (target 基準の非対称; コア機能以外も一致率に含める)
priceDiffNormalized = max(0, (target.msrp - candidate.msrp) / target.msrp)
                      (安いほど高得点、同額・高額は 0)
score               = featureMatchRatio × FEATURE_MATCH_WEIGHT
                    + priceDiffNormalized × PRICE_DIFF_WEIGHT
```

重みは `src/lib/constants.ts` に集約: `FEATURE_MATCH_WEIGHT = 0.7`, `PRICE_DIFF_WEIGHT = 0.3`。

`priceDiff` 出力は `candidate.msrp - target.msrp`（マイナスなら安い）。現在価格（`PriceHistory`）との統合は Phase 2 で UI 側に移譲する。

**出力**

```ts
type Alternative = {
  model: Model;
  score: number;
  priceDiff: number | null;
  reason: string; // 「容量±0.5kg、同コア機能、12%安い」等
};
```

**テストケース必須**

- 同ブランド前世代が候補に含まれる
- 容量差が 1kg 超の機種は除外
- コア機能欠落機種は除外
- `discontinued: true` の扱い切替

## 軸2: 買い替え ROI 判定

**目的**: 現機種から新機種への買い替えで、電気・水道代の削減額で投資回収可能かを判定。

**入力**

```ts
type RoiInput = {
  current: { annualKwh: number; waterPerCycleL: number };
  next: Model;
  nextPriceYen: number; // 購入想定価格
  rates: EnergyRates;
  weeklyUses: number;   // 既定 7
};
```

**計算式**

```
年間使用回数 = weeklyUses × 52
年間電気代現 = current.annualKwh × rates.electricityYenPerKwh
年間電気代新 = next.specs.annualKwh × rates.electricityYenPerKwh
水道単価     = rates.waterYenPerL + rates.sewerageYenPerL
年間水道代現 = current.waterPerCycleL × 年間使用回数 × 水道単価
年間水道代新 = next.specs.waterPerCycleL × 年間使用回数 × 水道単価

年間差額 = (年間電気代現 + 年間水道代現) - (年間電気代新 + 年間水道代新)
回収年数 = nextPriceYen / 年間差額
```

**判定基準**（境界値は下側カテゴリに倒す）

| 回収年数 `x` | 判定 |
|---|---|
| `x < 5` | `recommend`（即買い替え推奨） |
| `5 <= x < 8` | `depends-on-lifespan`（寿命次第） |
| `8 <= x < 12` | `wait-until-breakdown`（故障まで待つ） |
| `12 <= x` | `no-benefit`（経済的メリットなし） |

境界値テスト: 5.0 → `depends-on-lifespan`、8.0 → `wait-until-breakdown`、12.0 → `no-benefit`。

**出力**

```ts
type RoiResult = {
  annualSaving: number;
  paybackYears: number;
  verdict: "recommend" | "depends-on-lifespan" | "wait-until-breakdown" | "no-benefit";
};
```

**エッジケース**

- `年間差額 <= 0` → `paybackYears = Infinity`、`verdict: "no-benefit"`
- `current` が未入力 → この軸をスキップ（UI で入力促す）

## 軸3: モデルチェンジ周期予測

**目的**: 次モデル発表までの残期間と、旧モデル値下がり幅を予測。

**入力**

```ts
type CycleInput = {
  target: Model;
  ancestors: Model[];                    // predecessorId を辿って取得、新しい順
  ancestorPrices: PriceHistory[];        // 祖先機種の価格履歴
  targetCurrentPrice: number | null;     // null なら expectedPriceBeforeRelease も null
  now: Date;                             // テスト容易性のため引数化
};
```

**アルゴリズム**

1. `[target, ...ancestors]` を新しい順に並べ、連続ペアの `announcementDate` 差分（日数）を取る
2. 差分の中央値を「平均周期（日数）」とする。差分が偶数個なら真ん中2つの平均（結果は小数になり得る）
3. `expectedNextAnnouncementDate = target.announcementDate + Math.round(平均周期)`
   - 半整数（例: 365.5）は JS `Math.round` 挙動で切り上げ（365.5 → 366）
4. 各祖先 `A[i]` について:
   - 「次モデル発表日」= `i == 0 ? target.announcementDate : ancestors[i-1].announcementDate`
   - ピーク価格: 祖先の `releaseDate` から `AXIS3_WINDOW_DAYS` 日後までの `rakutenAvg` 平均
   - 発表直前価格: 次モデル発表日の `AXIS3_WINDOW_DAYS` 日前から発表日までの `rakutenAvg` 平均
   - 片方でも null ならこの祖先は集計から除外
5. `値下がり率 = 1 - 発表直前価格 / ピーク価格` を集計対象祖先で平均。対象 0 件なら 0
6. `expectedPriceBeforeRelease = targetCurrentPrice × (1 - expectedDropRate)` （`targetCurrentPrice === null` なら null）

**信頼度判定**

| 祖先機種数 | confidence |
|---|---|
| 0 | "none"（予測不能、UI で非表示） |
| 1 | "low" |
| 2 | "medium" |
| 3+ | "high" |

**祖先 0 件の出力規約**

- `expectedNextAnnouncementDate` = `target.announcementDate`（既知情報のみ、UI では非表示）
- `daysUntilExpected` = 0
- `expectedDropRate` = 0
- `expectedPriceBeforeRelease` = null
- `confidence` = "none"

**出力**

```ts
type CycleResult = {
  expectedNextAnnouncementDate: string;
  daysUntilExpected: number;
  expectedDropRate: number;
  expectedPriceBeforeRelease: number | null;
  confidence: "none" | "low" | "medium" | "high";
};
```

## 軸5: 世代差分の意味翻訳

**目的**: 前世代機種とのスペック差を、購入判断に直結する言葉に翻訳する。

**入力**

```ts
type DiffInput = {
  target: Model;
  predecessor: Model | null;          // null なら全出力を空にする
  targetCurrentPrice?: number | null;
  predecessorCurrentPrice?: number | null;
};
```

`predecessor === null` のとき、戻り値は空配列 + `priceDeltaYen = null`。

**抽出項目**

1. **features 差分**
   - 新規追加: `target.features - predecessor.features`
   - 削除: `predecessor.features - target.features`
2. **数値差分**（閾値超のみ報告、`deltaPercent = (target - predecessor) / predecessor`）
   - `annualKwh`: `|deltaPercent| >= 0.05` で報告（負ほど省エネ）
   - `waterPerCycleL`: `|deltaPercent| >= 0.05`（負ほど節水）
   - `washCapacityKg`: 絶対 kg 差分が `>= 0.5kg` で報告（正ほど大容量化）
3. **価格差**: `priceDeltaYen = targetCurrentPrice - predecessorCurrentPrice`
   - どちらかが null なら `priceDeltaYen = null`

**翻訳ルール**（`src/lib/constants.ts` の `AXIS5_FEATURE_TRANSLATIONS` / `AXIS5_NUMERIC_TRANSLATIONS` に集約）

- feature 差分は key ごとに `added` / `removed` の日本語文を引く。未登録 key は generic フォールバック（例: 「新機能『X』追加」）
- 数値差分の翻訳は「変化方向と大きさ」を日本語化する。コスト換算（年間 kWh × 電気単価 等）は UI 側が軸2 ROI と組み合わせて行う（責務分離）

**出力**

```ts
type GenerationDiff = {
  addedFeatures: Array<{ key: string; translation: string }>;
  removedFeatures: Array<{ key: string; translation: string }>;
  numericChanges: Array<{ field: string; deltaPercent: number; translation: string }>;
  priceDeltaYen: number | null;
};
```

## 軸6: ユーザー条件マッチング

**目的**: 家族構成・設置寸法・使用頻度から最適機種を推奨。

**入力**

```ts
type MatchInput = {
  candidates: Model[];                                   // 評価対象の機種
  householdSize: number;                                 // 1〜6+
  maxWidthMm: number;
  maxHeightMm: number;
  maxDepthMm: number;
  weeklyUses: number;
  budgetYen: number;
  priorityFeatures: string[];                            // ユーザー選択
  currentPrices: Map<string, number>;                    // id → 現在価格、欠損は msrp で代替
  currentModel: {                                        // ROI 計算用、null なら roi = 0
    annualKwh: number;
    waterPerCycleL: number;
  } | null;
  rates: EnergyRates;
};
```

**スコアリング**

各機種に対し以下を加点。各項目は独立で、max を超えることはない:

| 項目 | 最大点 | 計算 |
|---|---|---|
| 容量適合 | 30 | `ideal = householdSize × 1.5kg`。`diff = |model.washCapacityKg - ideal|`。`score = 30 × max(0, 1 − diff / AXIS6_CAPACITY_TOLERANCE_KG)` |
| 寸法適合 | 20 | 3 寸法すべてが上限内で 20 点、1 寸法でも超過で 0 点 |
| 予算適合 | 20 | 現在価格が予算超過で 0 点、予算内で 15 点、予算の 60% 以下で +5 点ボーナス（合計 20 点） |
| 機能適合 | 20 | `priorityFeatures` の一致率 × 20（ユーザーが 0 件指定なら満点 20） |
| ROI | 10 | 軸2 `calculateRoi` を呼び verdict を点数化（recommend=10, depends=7, wait=3, no-benefit=0）。currentModel が null の場合は 0 |

`currentPrices` に機種 ID が無い場合は `candidate.msrp` を ROI・予算判定の代替値として使う。

**出力**

```ts
type MatchResult = Array<{
  model: Model;
  totalScore: number;
  breakdown: {
    capacity: number;
    dimensions: number;
    budget: number;
    features: number;
    roi: number;
  };
}>;
```

トップ 3 を返す。`totalScore` 降順、同点時は `model.id` 昇順で決定的。

## 共通原則

- **ハードコード禁止**: 閾値・重み・翻訳テーブルは `src/lib/constants.ts` に集約
- **純粋関数**: 全ロジックは副作用なし、入力から出力が一意に決まる
- **決定性**: 現在時刻に依存する計算は引数で `now` を受け取る
- **テスト必須**: 各軸に正常系・境界値・異常系のテストを用意
- **型安全**: 入力・出力ともに zod でランタイム検証（ユニットテストで異常値を明示）
