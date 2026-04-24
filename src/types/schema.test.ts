import { describe, expect, it } from "vitest";
import {
  ModelSchema,
  PriceHistorySchema,
  EnergyRatesSchema,
  BrandSchema,
} from "./schema";

const validModel = {
  id: "panasonic-na-lx129dl",
  brand: "panasonic" as const,
  modelName: "キューブル NA-LX129DL",
  modelNumber: "NA-LX129DL",
  category: "drum-washer" as const,
  generation: 2024,
  announcementDate: "2024-07-15",
  releaseDate: "2024-09-20",
  msrp: 374000,
  discontinued: false,
  predecessorId: null,
  successorId: null,
  specs: {
    washCapacityKg: 12,
    dryCapacityKg: 6,
    annualKwh: 185,
    waterPerCycleL: 78,
    widthMm: 604,
    heightMm: 1021,
    depthMm: 722,
    weightKg: 81,
    features: ["heat-pump", "panasonic:nanoe-x"],
  },
  externalIds: { rakutenItemCode: null, yahooItemCode: null },
  imageUrl: "/images/models/panasonic-na-lx129dl.webp",
};

describe("ModelSchema", () => {
  it("accepts a valid model", () => {
    expect(() => ModelSchema.parse(validModel)).not.toThrow();
  });

  it("rejects an unknown brand", () => {
    const invalid = { ...validModel, brand: "unknown-brand" };
    expect(() => ModelSchema.parse(invalid)).toThrow();
  });

  it("rejects non-ISO date", () => {
    const invalid = { ...validModel, releaseDate: "2024/09/20" };
    expect(() => ModelSchema.parse(invalid)).toThrow();
  });

  it("rejects extra fields (strict)", () => {
    const invalid = { ...validModel, extraField: "x" };
    expect(() => ModelSchema.parse(invalid)).toThrow();
  });

  it("rejects releaseDate before announcementDate", () => {
    const invalid = { ...validModel, announcementDate: "2024-10-01", releaseDate: "2024-09-20" };
    expect(() => ModelSchema.parse(invalid)).toThrow();
  });

  it("rejects invalid feature tag (uppercase)", () => {
    const invalid = {
      ...validModel,
      specs: { ...validModel.specs, features: ["Heat-Pump"] },
    };
    expect(() => ModelSchema.parse(invalid)).toThrow();
  });

  it("accepts vendor-prefixed feature tag", () => {
    const valid = {
      ...validModel,
      specs: { ...validModel.specs, features: ["sharp:plasmacluster"] },
    };
    expect(() => ModelSchema.parse(valid)).not.toThrow();
  });
});

describe("PriceHistorySchema", () => {
  it("accepts ascending history", () => {
    const valid = {
      modelId: "panasonic-na-lx129dl",
      history: [
        { date: "2026-04-01", rakutenMin: 310000, rakutenAvg: 320000, yahooMin: 315000, yahooAvg: 325000 },
        { date: "2026-04-02", rakutenMin: 309000, rakutenAvg: 319000, yahooMin: 314000, yahooAvg: 324000 },
      ],
    };
    expect(() => PriceHistorySchema.parse(valid)).not.toThrow();
  });

  it("rejects descending dates", () => {
    const invalid = {
      modelId: "panasonic-na-lx129dl",
      history: [
        { date: "2026-04-02", rakutenMin: 1, rakutenAvg: 1, yahooMin: 1, yahooAvg: 1 },
        { date: "2026-04-01", rakutenMin: 1, rakutenAvg: 1, yahooMin: 1, yahooAvg: 1 },
      ],
    };
    expect(() => PriceHistorySchema.parse(invalid)).toThrow();
  });

  it("rejects duplicate dates", () => {
    const invalid = {
      modelId: "panasonic-na-lx129dl",
      history: [
        { date: "2026-04-01", rakutenMin: 1, rakutenAvg: 1, yahooMin: 1, yahooAvg: 1 },
        { date: "2026-04-01", rakutenMin: 1, rakutenAvg: 1, yahooMin: 1, yahooAvg: 1 },
      ],
    };
    expect(() => PriceHistorySchema.parse(invalid)).toThrow();
  });

  it("accepts null prices (missing data)", () => {
    const valid = {
      modelId: "panasonic-na-lx129dl",
      history: [{ date: "2026-04-01", rakutenMin: null, rakutenAvg: null, yahooMin: null, yahooAvg: null }],
    };
    expect(() => PriceHistorySchema.parse(valid)).not.toThrow();
  });
});

describe("EnergyRatesSchema", () => {
  it("accepts valid rates", () => {
    const valid = {
      updatedAt: "2026-04-01",
      electricityYenPerKwh: 31,
      waterYenPerL: 0.15,
      sewerageYenPerL: 0.15,
      note: "test",
    };
    expect(() => EnergyRatesSchema.parse(valid)).not.toThrow();
  });

  it("rejects non-positive electricity rate", () => {
    const invalid = {
      updatedAt: "2026-04-01",
      electricityYenPerKwh: 0,
      waterYenPerL: 0.15,
      sewerageYenPerL: 0.15,
      note: "",
    };
    expect(() => EnergyRatesSchema.parse(invalid)).toThrow();
  });
});

describe("BrandSchema", () => {
  it("rejects invalid URL", () => {
    const invalid = {
      id: "panasonic",
      displayName: "パナソニック",
      country: "Japan",
      websiteUrl: "not-a-url",
    };
    expect(() => BrandSchema.parse(invalid)).toThrow();
  });
});
