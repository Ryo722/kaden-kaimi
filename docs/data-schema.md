# データスキーマ

全 JSON は `src/types/schema.ts` の zod スキーマで検証する。CI では `scripts/validate-data.ts` で全データを pass させる必要がある。

## Model（機種マスタ）

パス: `data/models/{category}/{modelId}.json`

```ts
const ModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  brand: z.enum(["panasonic", "hitachi", "toshiba", "sharp", "aqua"]),
  modelName: z.string(),
  modelNumber: z.string(),
  category: z.enum(["drum-washer"]), // MVP は 1 種のみ
  generation: z.number().int(),      // 世代番号（例: 2024, 2025）
  announcementDate: z.string().date(),
  releaseDate: z.string().date(),
  msrp: z.number().positive(),       // 希望小売価格（税込）
  discontinued: z.boolean(),
  predecessorId: z.string().nullable(),
  successorId: z.string().nullable(),
  specs: z.object({
    washCapacityKg: z.number().positive(),
    dryCapacityKg: z.number().nonnegative(),
    annualKwh: z.number().positive(),
    waterPerCycleL: z.number().positive(),
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    depthMm: z.number().positive(),
    weightKg: z.number().positive(),
    features: z.array(z.string()),
  }),
  externalIds: z.object({
    rakutenItemCode: z.string().nullable(),
    yahooItemCode: z.string().nullable(),
  }),
  imageUrl: z.string(),
});
```

### 例

```json
{
  "id": "panasonic-na-lx129dl",
  "brand": "panasonic",
  "modelName": "キューブル NA-LX129DL",
  "modelNumber": "NA-LX129DL",
  "category": "drum-washer",
  "generation": 2024,
  "announcementDate": "2024-07-15",
  "releaseDate": "2024-09-20",
  "msrp": 374000,
  "discontinued": false,
  "predecessorId": "panasonic-na-lx127dl",
  "successorId": null,
  "specs": {
    "washCapacityKg": 12,
    "dryCapacityKg": 6,
    "annualKwh": 185,
    "waterPerCycleL": 78,
    "widthMm": 604,
    "heightMm": 1021,
    "depthMm": 722,
    "weightKg": 81,
    "features": ["heat-pump", "auto-detergent", "smart-app", "panasonic:nanoe-x"]
  },
  "externalIds": {
    "rakutenItemCode": null,
    "yahooItemCode": null
  },
  "imageUrl": "/images/models/panasonic-na-lx129dl.webp"
}
```

### features タグ命名規約

- 小文字・ハイフン区切り
- 共通: `heat-pump`, `auto-detergent`, `smart-app`, `quiet-mode`
- メーカー固有: `panasonic:nanoe-x`, `hitachi:kaaze-shaking`（プレフィックス付与）

## PriceHistory（価格履歴）

パス: `data/prices/{category}/{modelId}.json`

```ts
const PriceRecordSchema = z.object({
  date: z.string().date(),
  rakutenMin: z.number().positive().nullable(),
  rakutenAvg: z.number().positive().nullable(),
  yahooMin: z.number().positive().nullable(),
  yahooAvg: z.number().positive().nullable(),
});

const PriceHistorySchema = z.object({
  modelId: z.string(),
  history: z.array(PriceRecordSchema),
});
```

### 例

```json
{
  "modelId": "panasonic-na-lx129dl",
  "history": [
    {
      "date": "2026-04-24",
      "rakutenMin": 298000,
      "rakutenAvg": 312500,
      "yahooMin": 301800,
      "yahooAvg": 318200
    }
  ]
}
```

### 追記規約

- `history` は **日付昇順**
- 同一日付の重複禁止（冪等性を保つため追記前にチェック）
- 欠損（API 取得失敗）は `null` を記録、レコード自体は必ず作成
- 保持期間: **無期限**（git 履歴で容量増を許容）

## EnergyRates（エネルギー単価）

パス: `data/energy-rates.json`

```ts
const EnergyRatesSchema = z.object({
  updatedAt: z.string().date(),
  electricityYenPerKwh: z.number().positive(),
  waterYenPerL: z.number().positive(),
  sewerageYenPerL: z.number().positive(),
  note: z.string(),
});
```

更新頻度: 年 1 回。料金改定時は `docs/devlog/` に根拠を記録。

## Brand（ブランド情報）

パス: `data/brands.json`

```ts
const BrandSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  country: z.string(),
  websiteUrl: z.string().url(),
});

const BrandsSchema = z.array(BrandSchema);
```

## バージョニング

スキーマ変更時:

1. `docs/devlog/YYYY-MM-DD.md` に変更内容と理由を記録
2. zod スキーマを更新
3. 既存 JSON にマイグレーションスクリプトを適用（`scripts/migrate-*.ts`）
4. CI 検証が通ることを確認
5. 同一 PR でコード・データ・ドキュメントを一括更新

破壊的変更は極力避け、オプショナルフィールド追加を優先。
