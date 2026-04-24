import { describe, expect, it } from "vitest";

import { loadAllModels } from "./models";
import { findAlternatives } from "./similarity";
import { makeModel } from "./testing";

describe("findAlternatives (real sample data)", () => {
  const target = makeModel({
    id: "panasonic-na-lx129dl-probe",
    specs: {
      washCapacityKg: 12,
      dryCapacityKg: 6,
      features: [
        "heat-pump",
        "auto-detergent",
        "smart-app",
        "quiet-mode",
        "panasonic:nanoe-x",
      ],
    },
    msrp: 374000,
  });
  const all = loadAllModels("drum-washer");

  it("returns at most 3 alternatives", () => {
    const result = findAlternatives(target, all);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("excludes the target itself", () => {
    const concreteTarget = all.find((m) => m.id === "panasonic-na-lx129dl")!;
    const result = findAlternatives(concreteTarget, all);
    expect(result.find((a) => a.model.id === concreteTarget.id)).toBeUndefined();
  });

  it("includes same-brand predecessor as a candidate", () => {
    const panasonic2024 = all.find((m) => m.id === "panasonic-na-lx129dl")!;
    const result = findAlternatives(panasonic2024, all);
    expect(result.find((a) => a.model.id === "panasonic-na-lx127dl")).toBeDefined();
  });
});

describe("findAlternatives (fixture-based filters)", () => {
  const target = makeModel({
    id: "target",
    specs: {
      washCapacityKg: 12,
      dryCapacityKg: 6,
      features: ["heat-pump", "auto-detergent", "smart-app"],
    },
    msrp: 300000,
  });

  it("excludes candidates whose wash capacity differs by more than 1kg", () => {
    const small = makeModel({
      id: "too-small",
      specs: {
        washCapacityKg: 10,
        dryCapacityKg: 6,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const borderline = makeModel({
      id: "borderline",
      specs: {
        washCapacityKg: 11,
        dryCapacityKg: 6,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = findAlternatives(target, [target, small, borderline]);
    const ids = result.map((a) => a.model.id);
    expect(ids).toContain("borderline");
    expect(ids).not.toContain("too-small");
  });

  it("excludes candidates missing the heat-pump core feature", () => {
    const heaterType = makeModel({
      id: "heater-type",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        features: ["auto-detergent", "smart-app"],
      },
    });
    const result = findAlternatives(target, [target, heaterType]);
    expect(result.map((a) => a.model.id)).not.toContain("heater-type");
  });

  it("excludes candidates with dry capacity at or below 3kg", () => {
    const weakDryer = makeModel({
      id: "weak-dryer",
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 3,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = findAlternatives(target, [target, weakDryer]);
    expect(result.map((a) => a.model.id)).not.toContain("weak-dryer");
  });

  it("excludes discontinued models by default, includes them when opted in", () => {
    const oldStock = makeModel({
      id: "old-stock",
      discontinued: true,
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const without = findAlternatives(target, [target, oldStock]);
    expect(without.map((a) => a.model.id)).not.toContain("old-stock");

    const withFlag = findAlternatives(target, [target, oldStock], {
      includeDiscontinued: true,
    });
    expect(withFlag.map((a) => a.model.id)).toContain("old-stock");
  });

  it("sorts by score descending (higher feature match + cheaper wins)", () => {
    const cheaperFullMatch = makeModel({
      id: "cheaper-full-match",
      msrp: 260000,
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const pricierPartialMatch = makeModel({
      id: "pricier-partial-match",
      msrp: 320000,
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        features: ["heat-pump", "auto-detergent"],
      },
    });
    const result = findAlternatives(target, [
      target,
      pricierPartialMatch,
      cheaperFullMatch,
    ]);
    expect(result.map((a) => a.model.id)).toEqual([
      "cheaper-full-match",
      "pricier-partial-match",
    ]);
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it("outputs priceDiff as candidate.msrp - target.msrp", () => {
    const cheaper = makeModel({
      id: "cheaper",
      msrp: 270000,
      specs: {
        washCapacityKg: 12,
        dryCapacityKg: 6,
        features: ["heat-pump", "auto-detergent", "smart-app"],
      },
    });
    const result = findAlternatives(target, [target, cheaper]);
    expect(result[0]!.priceDiff).toBe(-30000);
  });

  it("breaks ties deterministically by id ascending", () => {
    const identicalSpecs = {
      washCapacityKg: 12,
      dryCapacityKg: 6,
      features: ["heat-pump", "auto-detergent", "smart-app"],
    };
    const cA = makeModel({ id: "cand-a", msrp: 300000, specs: identicalSpecs });
    const cB = makeModel({ id: "cand-b", msrp: 300000, specs: identicalSpecs });
    const cC = makeModel({ id: "cand-c", msrp: 300000, specs: identicalSpecs });
    const result = findAlternatives(target, [target, cC, cA, cB]);
    expect(result.map((a) => a.model.id)).toEqual([
      "cand-a",
      "cand-b",
      "cand-c",
    ]);
  });

  it("limits output to top 3", () => {
    const candidates = Array.from({ length: 5 }, (_, i) =>
      makeModel({
        id: `cand-${i}`,
        msrp: 300000 - i * 1000,
        specs: {
          washCapacityKg: 12,
          dryCapacityKg: 6,
          features: ["heat-pump", "auto-detergent", "smart-app"],
        },
      }),
    );
    const result = findAlternatives(target, [target, ...candidates]);
    expect(result).toHaveLength(3);
  });
});
