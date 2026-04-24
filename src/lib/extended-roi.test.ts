import { describe, expect, it } from "vitest";

import type { EnergyRates } from "@/types";

import {
  calculateExtendedRoi,
  detergentSavingForSwitch,
  failureRiskCostForAge,
} from "./extended-roi";
import { makeModel } from "./testing";

const rates: EnergyRates = {
  updatedAt: "2026-04-01",
  electricityYenPerKwh: 31,
  waterYenPerL: 0.15,
  sewerageYenPerL: 0.15,
  note: "test",
};

describe("failureRiskCostForAge", () => {
  it("classifies 0-4 year tier", () => {
    expect(failureRiskCostForAge(0)).toBe(0.01 * 20000);
    expect(failureRiskCostForAge(4)).toBe(0.01 * 20000);
  });

  it("classifies 5-7 year tier at the boundary", () => {
    expect(failureRiskCostForAge(5)).toBe(0.04 * 30000);
    expect(failureRiskCostForAge(7)).toBe(0.04 * 30000);
  });

  it("classifies 8-10 year tier", () => {
    expect(failureRiskCostForAge(10)).toBe(0.1 * 40000);
  });

  it("classifies 11-13 year tier", () => {
    expect(failureRiskCostForAge(13)).toBe(0.18 * 50000);
  });

  it("uses the open-ended tier for 14+ years", () => {
    expect(failureRiskCostForAge(14)).toBe(0.28 * 60000);
    expect(failureRiskCostForAge(30)).toBe(0.28 * 60000);
  });

  it("clamps negative ages to 0", () => {
    expect(failureRiskCostForAge(-5)).toBe(0.01 * 20000);
  });
});

describe("detergentSavingForSwitch", () => {
  it("returns 0 when the current machine already has auto-detergent", () => {
    const next = makeModel({ specs: { features: ["heat-pump", "auto-detergent"] } });
    expect(detergentSavingForSwitch(next, true)).toBe(0);
  });

  it("returns 0 when the next model lacks auto-detergent", () => {
    const next = makeModel({ specs: { features: ["heat-pump"] } });
    expect(detergentSavingForSwitch(next, false)).toBe(0);
  });

  it("returns the configured saving when upgrading to auto-detergent", () => {
    const next = makeModel({ specs: { features: ["heat-pump", "auto-detergent"] } });
    expect(detergentSavingForSwitch(next, false)).toBe(3000);
  });
});

describe("calculateExtendedRoi", () => {
  it("returns null when the base ROI is null (no current input)", () => {
    const next = makeModel();
    const result = calculateExtendedRoi({
      base: {
        current: null,
        next,
        nextPriceYen: 300000,
        rates,
      },
      currentAgeYears: 10,
      currentHasAutoDetergent: false,
    });
    expect(result).toBeNull();
  });

  it("adds failure-risk and detergent savings to the base annual saving", () => {
    const next = makeModel({
      specs: { features: ["heat-pump", "auto-detergent"], annualKwh: 180, waterPerCycleL: 70 },
    });
    const result = calculateExtendedRoi({
      base: {
        current: { annualKwh: 250, waterPerCycleL: 95 },
        next,
        nextPriceYen: 300000,
        rates,
        weeklyUses: 7,
      },
      currentAgeYears: 10,
      currentHasAutoDetergent: false,
    });

    expect(result).not.toBeNull();
    expect(result!.failureRiskAnnualCost).toBe(0.1 * 40000);
    expect(result!.detergentAnnualSaving).toBe(3000);
    expect(result!.adjustedAnnualSaving).toBeCloseTo(
      result!.base.annualSaving + 4000 + 3000,
      6,
    );
    expect(result!.adjustedPaybackYears).toBeLessThan(
      result!.base.paybackYears,
    );
  });

  it("falls back to Infinity payback if the adjusted saving is non-positive", () => {
    const next = makeModel({
      specs: { annualKwh: 999, waterPerCycleL: 999 },
    });
    const result = calculateExtendedRoi({
      base: {
        current: { annualKwh: 100, waterPerCycleL: 50 },
        next,
        nextPriceYen: 300000,
        rates,
      },
      currentAgeYears: 0,
      currentHasAutoDetergent: true,
    });

    expect(result).not.toBeNull();
    expect(result!.adjustedAnnualSaving).toBeLessThanOrEqual(0);
    expect(result!.adjustedPaybackYears).toBe(Infinity);
    expect(result!.adjustedVerdict).toBe("no-benefit");
  });
});
