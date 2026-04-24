import { describe, expect, it } from "vitest";

import type { EnergyRates } from "@/types";

import { matchModels } from "./matcher";
import { makeModel } from "./testing";

const RATES: EnergyRates = {
  updatedAt: "2026-04-01",
  electricityYenPerKwh: 31,
  waterYenPerL: 0.15,
  sewerageYenPerL: 0.15,
  note: "test",
};

const DEFAULT_INPUT = {
  householdSize: 4, // ideal 6kg wash
  maxWidthMm: 650,
  maxHeightMm: 1100,
  maxDepthMm: 750,
  weeklyUses: 7,
  budgetYen: 300000,
  priorityFeatures: ["heat-pump", "auto-detergent"],
  currentPrices: new Map<string, number>(),
  currentModel: null,
  rates: RATES,
};

describe("matchModels — breakdown: capacity", () => {
  it("gives full capacity score when wash capacity equals ideal", () => {
    const ideal = makeModel({
      id: "ideal",
      specs: {
        washCapacityKg: 6, // matches 4 × 1.5
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
      msrp: 250000,
    });
    const result = matchModels({ ...DEFAULT_INPUT, candidates: [ideal] });
    expect(result[0]!.breakdown.capacity).toBe(30);
  });

  it("decays linearly with absolute capacity diff", () => {
    const off = makeModel({
      id: "off",
      specs: {
        washCapacityKg: 7.5, // diff 1.5 from ideal 6 → 30 * (1 - 1.5/3) = 15
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
      msrp: 250000,
    });
    const result = matchModels({ ...DEFAULT_INPUT, candidates: [off] });
    expect(result[0]!.breakdown.capacity).toBeCloseTo(15, 5);
  });

  it("clamps capacity score to 0 when diff exceeds tolerance", () => {
    const tooBig = makeModel({
      id: "too-big",
      specs: {
        washCapacityKg: 12, // diff 6 from ideal 6 → 0
        dryCapacityKg: 6,
        features: ["heat-pump", "auto-detergent"],
      },
      msrp: 250000,
    });
    const result = matchModels({ ...DEFAULT_INPUT, candidates: [tooBig] });
    expect(result[0]!.breakdown.capacity).toBe(0);
  });
});

describe("matchModels — breakdown: dimensions", () => {
  it("gives 20 points when all dimensions fit", () => {
    const fits = makeModel({
      id: "fits",
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        widthMm: 600,
        heightMm: 1050,
        depthMm: 720,
        features: ["heat-pump", "auto-detergent"],
      },
      msrp: 250000,
    });
    const result = matchModels({ ...DEFAULT_INPUT, candidates: [fits] });
    expect(result[0]!.breakdown.dimensions).toBe(20);
  });

  it("gives 0 points when any single dimension exceeds the limit", () => {
    const tooTall = makeModel({
      id: "too-tall",
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        widthMm: 600,
        heightMm: 1200, // exceeds max 1100
        depthMm: 720,
        features: ["heat-pump", "auto-detergent"],
      },
      msrp: 250000,
    });
    const result = matchModels({ ...DEFAULT_INPUT, candidates: [tooTall] });
    expect(result[0]!.breakdown.dimensions).toBe(0);
  });
});

describe("matchModels — breakdown: budget", () => {
  it("gives 0 when current price exceeds budget", () => {
    const model = makeModel({
      id: "expensive",
      msrp: 350000,
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
    });
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [model],
      currentPrices: new Map([["expensive", 350000]]),
    });
    expect(result[0]!.breakdown.budget).toBe(0);
  });

  it("gives 15 when current price is within budget but above 60%", () => {
    const model = makeModel({
      id: "mid",
      msrp: 250000,
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
    });
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [model],
      currentPrices: new Map([["mid", 250000]]),
    });
    expect(result[0]!.breakdown.budget).toBe(15);
  });

  it("gives 20 when current price is at or below 60% of budget", () => {
    const model = makeModel({
      id: "cheap",
      msrp: 170000,
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
    });
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [model],
      currentPrices: new Map([["cheap", 170000]]),
    });
    expect(result[0]!.breakdown.budget).toBe(20);
  });

  it("falls back to msrp when currentPrices lacks the model id", () => {
    const model = makeModel({
      id: "no-price",
      msrp: 180000,
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
    });
    const result = matchModels({ ...DEFAULT_INPUT, candidates: [model] });
    expect(result[0]!.breakdown.budget).toBe(20);
  });
});

describe("matchModels — breakdown: features", () => {
  it("gives 20 points when priorityFeatures is empty", () => {
    const model = makeModel({
      id: "any",
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump"],
      },
      msrp: 250000,
    });
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [model],
      priorityFeatures: [],
    });
    expect(result[0]!.breakdown.features).toBe(20);
  });

  it("scales by match ratio", () => {
    const partial = makeModel({
      id: "partial",
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump"], // has 1 of 2 priorities
      },
      msrp: 250000,
    });
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [partial],
      priorityFeatures: ["heat-pump", "auto-detergent"],
    });
    expect(result[0]!.breakdown.features).toBe(10);
  });
});

describe("matchModels — breakdown: roi", () => {
  const goodRoiModel = makeModel({
    id: "good",
    specs: {
      washCapacityKg: 6,
      dryCapacityKg: 4,
      annualKwh: 100,
      waterPerCycleL: 50,
      features: ["heat-pump", "auto-detergent"],
    },
    msrp: 10000,
  });

  it("is 0 when currentModel is null (axis skipped)", () => {
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [goodRoiModel],
    });
    expect(result[0]!.breakdown.roi).toBe(0);
  });

  it("awards 10 when payback verdict is 'recommend'", () => {
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [goodRoiModel],
      currentModel: { annualKwh: 300, waterPerCycleL: 150 },
      currentPrices: new Map([["good", 10000]]),
    });
    expect(result[0]!.breakdown.roi).toBe(10);
  });
});

describe("matchModels — top N and tiebreak", () => {
  function dupModel(id: string) {
    return makeModel({
      id,
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
      msrp: 250000,
    });
  }

  it("limits output to top 3", () => {
    const candidates = ["a", "b", "c", "d", "e"].map(dupModel);
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates,
      priorityFeatures: [],
    });
    expect(result).toHaveLength(3);
  });

  it("is deterministic on ties (id ascending)", () => {
    const candidates = ["c", "a", "b"].map(dupModel);
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates,
      priorityFeatures: [],
    });
    expect(result.map((r) => r.model.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by totalScore descending", () => {
    const best = makeModel({
      id: "best",
      specs: {
        washCapacityKg: 6,
        dryCapacityKg: 4,
        features: ["heat-pump", "auto-detergent"],
      },
      msrp: 150000,
    });
    const worst = makeModel({
      id: "worst",
      specs: {
        washCapacityKg: 12, // capacity diff 6 → 0
        dryCapacityKg: 6,
        widthMm: 700, // dimensions overflow
        features: [],
      },
      msrp: 400000,
    });
    const result = matchModels({
      ...DEFAULT_INPUT,
      candidates: [worst, best],
    });
    expect(result[0]!.model.id).toBe("best");
    expect(result[0]!.totalScore).toBeGreaterThan(result[1]!.totalScore);
  });
});
