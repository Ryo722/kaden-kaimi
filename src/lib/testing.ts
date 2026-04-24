import type { Model, ModelSpecs, PriceHistory } from "@/types";
import { ModelSchema, PriceHistorySchema } from "@/types";

const BASE_SPECS: ModelSpecs = {
  washCapacityKg: 12,
  dryCapacityKg: 6,
  annualKwh: 200,
  waterPerCycleL: 80,
  widthMm: 600,
  heightMm: 1000,
  depthMm: 700,
  weightKg: 80,
  features: ["heat-pump", "auto-detergent"],
};

const BASE_MODEL = {
  id: "test-model",
  brand: "panasonic" as const,
  modelName: "Test Model",
  modelNumber: "TEST-000",
  category: "drum-washer" as const,
  generation: 2024,
  announcementDate: "2024-01-01",
  releaseDate: "2024-02-01",
  msrp: 300000,
  discontinued: false,
  predecessorId: null,
  successorId: null,
  specs: BASE_SPECS,
  externalIds: { rakutenItemCode: null, yahooItemCode: null },
  imageUrl: "/test.webp",
};

export type ModelOverrides = Omit<Partial<Model>, "specs"> & {
  specs?: Partial<ModelSpecs>;
};

export function makeModel(overrides: ModelOverrides = {}): Model {
  const { specs: specOverride, ...rest } = overrides;
  const specs = { ...BASE_SPECS, ...(specOverride ?? {}) };
  return ModelSchema.parse({ ...BASE_MODEL, ...rest, specs });
}

export type FlatPriceRecord = { date: string; price: number | null };

export function makePriceHistory(
  modelId: string,
  records: FlatPriceRecord[],
): PriceHistory {
  return PriceHistorySchema.parse({
    modelId,
    history: records.map((r) => ({
      date: r.date,
      rakutenMin: r.price,
      rakutenAvg: r.price,
      yahooMin: r.price,
      yahooAvg: r.price,
    })),
  });
}
