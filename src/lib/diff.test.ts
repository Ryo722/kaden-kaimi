import { describe, expect, it } from "vitest";

import { computeGenerationDiff } from "./diff";
import { makeModel } from "./testing";

const TARGET = makeModel({
  id: "target",
  specs: {
    washCapacityKg: 12,
    dryCapacityKg: 6,
    annualKwh: 200,
    waterPerCycleL: 80,
    features: ["heat-pump", "auto-detergent", "smart-app"],
  },
});

describe("computeGenerationDiff — null predecessor", () => {
  it("returns empty result when predecessor is null", () => {
    const result = computeGenerationDiff({
      target: TARGET,
      predecessor: null,
      targetCurrentPrice: 300000,
      predecessorCurrentPrice: 280000,
    });
    expect(result.addedFeatures).toEqual([]);
    expect(result.removedFeatures).toEqual([]);
    expect(result.numericChanges).toEqual([]);
    expect(result.priceDeltaYen).toBeNull();
  });

  it("returns independent arrays across calls (no shared references)", () => {
    const first = computeGenerationDiff({ target: TARGET, predecessor: null });
    first.addedFeatures.push({ key: "mutation-test", translation: "poison" });
    first.numericChanges.push({
      field: "annualKwh",
      deltaPercent: 0.5,
      translation: "poison",
    });
    const second = computeGenerationDiff({ target: TARGET, predecessor: null });
    expect(second.addedFeatures).toEqual([]);
    expect(second.numericChanges).toEqual([]);
  });
});

describe("computeGenerationDiff — feature changes", () => {
  it("captures added features", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent"],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    expect(result.addedFeatures.map((f) => f.key)).toEqual(["smart-app"]);
    expect(result.addedFeatures[0]!.translation).toContain("スマホ連携");
    expect(result.removedFeatures).toEqual([]);
  });

  it("captures removed features", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 80,
        features: [
          "heat-pump",
          "auto-detergent",
          "smart-app",
          "quiet-mode",
        ],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    expect(result.removedFeatures.map((f) => f.key)).toEqual(["quiet-mode"]);
    expect(result.addedFeatures).toEqual([]);
  });

  it("returns empty feature arrays when feature sets match", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    expect(result.addedFeatures).toEqual([]);
    expect(result.removedFeatures).toEqual([]);
  });

  it("falls back to a generic translation for unknown feature keys", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent"],
      },
    });
    const target = makeModel({
      id: "target-unusual",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent", "brand:x-super-wash"],
      },
    });
    const result = computeGenerationDiff({ target, predecessor });
    expect(result.addedFeatures[0]!.key).toBe("brand:x-super-wash");
    expect(result.addedFeatures[0]!.translation).toContain("brand:x-super-wash");
  });
});

describe("computeGenerationDiff — numeric thresholds", () => {
  it("reports annualKwh change when delta is >= 5%", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 220, // delta = (200-220)/220 ≈ -9.09%
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    const change = result.numericChanges.find((c) => c.field === "annualKwh");
    expect(change).toBeDefined();
    expect(change!.deltaPercent).toBeCloseTo(-0.0909, 3);
    expect(change!.translation).toContain("削減");
  });

  it("skips annualKwh change when delta is below 5%", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 206, // delta ≈ -2.9%
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    expect(result.numericChanges.find((c) => c.field === "annualKwh")).toBeUndefined();
  });

  it("reports waterPerCycleL change when delta is >= 5%", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 90, // delta ≈ -11.1%
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    const change = result.numericChanges.find(
      (c) => c.field === "waterPerCycleL",
    );
    expect(change).toBeDefined();
    expect(change!.translation).toContain("削減");
  });

  it("reports washCapacityKg change when absolute diff is >= 0.5kg", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 11, // delta = +1kg
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    const change = result.numericChanges.find(
      (c) => c.field === "washCapacityKg",
    );
    expect(change).toBeDefined();
    expect(change!.translation).toContain("増加");
  });

  it("skips washCapacityKg change when absolute diff is below 0.5kg", () => {
    const predecessor = makeModel({
      id: "pred",
      specs: {
        washCapacityKg: 11.7, // delta = 0.3kg
        dryCapacityKg: 6,
        annualKwh: 200,
        waterPerCycleL: 80,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = computeGenerationDiff({ target: TARGET, predecessor });
    expect(
      result.numericChanges.find((c) => c.field === "washCapacityKg"),
    ).toBeUndefined();
  });
});

describe("computeGenerationDiff — priceDeltaYen", () => {
  const predecessor = makeModel({
    id: "pred",
    specs: {
      washCapacityKg: 12,
      dryCapacityKg: 6,
      annualKwh: 200,
      waterPerCycleL: 80,
      features: ["heat-pump", "auto-detergent", "smart-app"],
    },
  });

  it("returns the yen difference when both prices are provided", () => {
    const result = computeGenerationDiff({
      target: TARGET,
      predecessor,
      targetCurrentPrice: 320000,
      predecessorCurrentPrice: 290000,
    });
    expect(result.priceDeltaYen).toBe(30000);
  });

  it("returns null when targetCurrentPrice is missing", () => {
    const result = computeGenerationDiff({
      target: TARGET,
      predecessor,
      predecessorCurrentPrice: 290000,
    });
    expect(result.priceDeltaYen).toBeNull();
  });

  it("returns null when predecessorCurrentPrice is missing", () => {
    const result = computeGenerationDiff({
      target: TARGET,
      predecessor,
      targetCurrentPrice: 320000,
    });
    expect(result.priceDeltaYen).toBeNull();
  });
});
