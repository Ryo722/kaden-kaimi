# 5軸ロジック仕様

実装は `src/lib/` 配下。**変更時は本ドキュメントを先に更新し、実装とテストを追従させる**。

## 軸1: 同等代替機種の自動提示

**目的**: ユーザーが見ている機種に対し、スペック同等で安い候補を提示する。

**入力**: 対象機種 `target: Model`、全機種配列 `all: Model[]`

**アルゴリズム**

1. 除外: `target` 自身、`discontinued` 機種（オプション）
2. 一次フィルタ: 以下すべてを満たす
   - `|specs.washCapacityKg - target.washCapacityKg| <= 1`
   - `specs.features` が `target` のコア機能をすべて含む
3. スコアリング: features 一致率 × 重み + 価格差正規化値
4. 上位 3 件を返す

**コア機能定義**（ユーザーの乗り換え許容度が低い必須機能）

- `heat-pump`（乾燥方式はヒーター型と区別）
- `dryCapacityKg > 3` （乾燥能力）

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

**判定基準**

| 回収年数 | 判定 |
|---|---|
| < 5 年 | 即買い替え推奨 |
| 5〜8 年 | 寿命次第 |
| 8〜12 年 | 故障まで待つ |
| > 12 年 | 買い替え経済的メリットなし |

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
  ancestors: Model[];                    // predecessorId を辿って取得
  ancestorPrices: PriceHistory[];        // 祖先機種の価格履歴
  now: Date;                             // テスト容易性のため引数化
};
```

**アルゴリズム**

1. 過去 3 世代の `announcementDate` 差分を取得（祖先機種数に応じ調整）
2. 中央値を「平均周期（日数）」とする
3. 対象機種の `announcementDate + 平均周期` を「次モデル発表予測日」に設定
4. 各祖先機種について「次モデル発表日の前 30 日間の平均価格」を「発表直前価格」とする
5. 各祖先機種の「発売直後 30 日の平均価格」を「ピーク価格」とする
6. `値下がり率 = 1 - 発表直前価格 / ピーク価格` の平均を算出
7. 対象機種の予測価格 = 現在価格 × (1 - 平均値下がり率)

**信頼度判定**

| 祖先機種数 | confidence |
|---|---|
| 0 | "none"（予測不能、UI で非表示） |
| 1 | "low" |
| 2 | "medium" |
| 3+ | "high" |

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

**入力**: `target: Model`, `predecessor: Model`（`predecessorId` で解決）

**抽出項目**

1. **features 差分**
   - 新規追加された feature
   - 削除された feature
2. **数値差分**（閾値超のみ報告）
   - `annualKwh` 差が 5% 以上
   - `waterPerCycleL` 差が 5% 以上
   - `washCapacityKg` 差が 0.5kg 以上
3. **価格差**
   - 対象機種の現在価格 vs 前世代の現在価格

**翻訳ルール**（`src/lib/constants.ts` で管理）

| feature 差分 | 翻訳文 |
|---|---|
| `+heat-pump` | 乾燥方式がヒートポンプに変更（電気代年間◯円削減） |
| `+auto-detergent` | 洗剤自動投入対応（計量の手間なし） |
| `+smart-app` | スマホ連携追加（月◯回未満の使用ならメリット小） |

数値差の翻訳は差分 × 使用頻度でコスト換算（例: 年間 kWh 差 × 電気代単価）。

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
  householdSize: number;        // 1〜6+
  maxWidthMm: number;
  maxHeightMm: number;
  maxDepthMm: number;
  weeklyUses: number;
  budgetYen: number;
  priorityFeatures: string[];   // ユーザー選択
};
```

**スコアリング**

各機種に対し以下を加点:

| 項目 | 最大点 | 計算 |
|---|---|---|
| 容量適合 | 30 | `householdSize * 1.5kg` に近いほど高得点（差分の絶対値に逆比例） |
| 寸法適合 | 20 | 3 寸法すべてが上限内で 20 点、1 寸法でも超過で 0 点 |
| 予算適合 | 20 | 現在価格が予算内で 15 点、予算の 60% 以下で +5 点ボーナス |
| 機能適合 | 20 | `priorityFeatures` 一致率 × 20 |
| ROI | 10 | 軸2 の verdict を点数化（recommend=10, depends=7, wait=3, no-benefit=0） |

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

トップ 3 を返す。

## 共通原則

- **ハードコード禁止**: 閾値・重み・翻訳テーブルは `src/lib/constants.ts` に集約
- **純粋関数**: 全ロジックは副作用なし、入力から出力が一意に決まる
- **決定性**: 現在時刻に依存する計算は引数で `now` を受け取る
- **テスト必須**: 各軸に正常系・境界値・異常系のテストを用意
- **型安全**: 入力・出力ともに zod でランタイム検証（ユニットテストで異常値を明示）
