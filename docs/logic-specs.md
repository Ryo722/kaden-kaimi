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

### 軸2 拡張: 非光熱費要因の補正（暫定モデル）

実装: `src/lib/extended-roi.ts`。`calculateRoi` を変更せずラップし、光熱費のみの基本計算に以下の年間換算コストを加算する。Phase 2 で実データ（メーカー公称の故障率・洗剤消費量）に差し替える想定。

**(A) 故障リスクコスト**（現機種の年齢から期待修理費を算出）

`AXIS2_FAILURE_RISK_TABLE` に年齢帯別の `{annualProbability, avgRepairCost}` を定義し、`failureRiskAnnualCost = annualProbability × avgRepairCost` を年間削減額に加算する。買い替えにより回避できる「平均的な年間修理費」を近似する。初期値（Phase 1 暫定）:

| 現機種年齢 | 年間故障確率 | 平均修理費 | 年間期待コスト |
|---|---|---|---|
| 0〜4 年 | 1% | ¥20,000 | ¥200 |
| 5〜7 年 | 4% | ¥30,000 | ¥1,200 |
| 8〜10 年 | 10% | ¥40,000 | ¥4,000 |
| 11〜13 年 | 18% | ¥50,000 | ¥9,000 |
| 14 年〜 | 28% | ¥60,000 | ¥16,800 |

**(B) 洗剤自動投入による節約**

新機種が `auto-detergent` を備え、かつユーザーが「現機種は対応していない」と宣言した場合のみ、`AXIS2_DETERGENT_ANNUAL_SAVING_YEN = 3000` を年間削減額に加算する（標準洗剤 40ml/回 × 週 7 回 × 52 週 × 単価 ¥800/L の約 25% 節約を想定）。

**合算ロジック**

```
adjustedAnnualSaving = base.annualSaving + failureRiskAnnualCost + detergentAnnualSaving
adjustedPaybackYears = adjustedAnnualSaving <= 0 ? Infinity : nextPriceYen / adjustedAnnualSaving
adjustedVerdict      = 軸2 と同じ閾値（5 / 8 / 12）で判定
```

`base` が `null`（`current` 未入力）なら拡張も `null` を返す。

### 軸2 補助: 非金銭メリットの翻訳

`AXIS2_FEATURE_VALUE_PROPS` に機能キーごとの「新機種にあることで得られる非金銭的価値」を日本語文で定義（例: `heat-pump` → 「衣類ダメージと電気代を両立で削減」）。UI は `nextModel.specs.features` を走査して登録済みキーのみリスト表示する。未登録キーは表示しない。

この翻訳は UI 専用で、軸2 のスコア計算には影響させない。

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

## 現在価格の採用ロジック

`PriceHistory` の最新レコードから「現在価格」を取り出す際、用途により異なるフィールドを採用する。混在を避けるため、`src/lib/prices.ts` に専用ヘルパーを用意する。

| 用途 | 関数 | 採用値 | 意図 |
|---|---|---|---|
| 表示用（ヘッダー、価格差、予算適合 UI） | `getDisplayPrice(record)` | `min(rakutenMin, yahooMin)`（非 null のみ対象） | ユーザーが実際に買える最安値を示す |
| 内部計算用（軸3 値下がり予測、軸5 `priceDeltaYen` の整合、軸6 内部比較） | `getInternalPrice(record)` | `rakutenAvg` | 平均トレンドを優先、軸3 の集計（`AXIS3_PRICE_FIELD = "rakutenAvg"`) と一貫 |

共通規約:

- 入力 `record` が `null`（価格履歴 0 件）または全フィールドが `null` のとき、戻り値は `null`
- 呼び出し側は `null` のとき `model.msrp` を代替値として使うか、「データ取得中」と UI 表示する
- 軸6 `matchModels` の `currentPrices` には `getDisplayPrice` を採用する（ユーザー視点の予算判定）

## 共通原則

- **ハードコード禁止**: 閾値・重み・翻訳テーブルは `src/lib/constants.ts` に集約
- **純粋関数**: 全ロジックは副作用なし、入力から出力が一意に決まる
- **決定性**: 現在時刻に依存する計算は引数で `now` を受け取る
- **テスト必須**: 各軸に正常系・境界値・異常系のテストを用意
- **型安全**: 入力・出力ともに zod でランタイム検証（ユニットテストで異常値を明示）
