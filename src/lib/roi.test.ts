import { describe, expect, it } from "vitest";

import type { EnergyRates } from "@/types";

import { calculateRoi } from "./roi";
import { makeModel } from "./testing";

const rates: EnergyRates = {
  updatedAt: "2026-04-01",
  electricityYenPerKwh: 31,
  waterYenPerL: 0.15,
  sewerageYenPerL: 0.15,
  note: "test",
};

describe("calculateRoi — happy path", () => {
  it("computes annualSaving from electricity + water differences", () => {
    const next = makeModel({ specs: { annualKwh: 100, waterPerCycleL: 80 } });
    const result = calculateRoi({
      current: { annualKwh: 200, waterPerCycleL: 80 },
      next,
      nextPriceYen: 10_000,
      rates,
    });
    expect(result).not.toBeNull();
    expect(result!.annualSaving).toBeCloseTo(3100, 5);
  });

  it("includes water savings (weeklyUses default 7 → 364 cycles/year)", () => {
    const next = makeModel({ specs: { annualKwh: 200, waterPerCycleL: 50 } });
    const result = calculateRoi({
      current: { annualKwh: 200, waterPerCycleL: 100 },
      next,
      nextPriceYen: 10_000,
      rates,
    });
    // 50L saved × 364 uses × 0.3 yen/L = 5460
    expect(result!.annualSaving).toBeCloseTo(5460, 5);
  });

  it("allows overriding weeklyUses", () => {
    const next = makeModel({ specs: { annualKwh: 200, waterPerCycleL: 50 } });
    const result = calculateRoi({
      current: { annualKwh: 200, waterPerCycleL: 100 },
      next,
      nextPriceYen: 10_000,
      rates,
      weeklyUses: 14,
    });
    // 50L × 728 uses × 0.3 = 10920
    expect(result!.annualSaving).toBeCloseTo(10920, 5);
  });
});

describe("calculateRoi — verdict boundaries", () => {
  function roiAtYears(years: number) {
    const next = makeModel({ specs: { annualKwh: 100, waterPerCycleL: 80 } });
    const current = { annualKwh: 200, waterPerCycleL: 80 };
    // annualSaving = 100 × 31 = 3100
    const nextPriceYen = 3100 * years;
    return calculateRoi({ current, next, nextPriceYen, rates });
  }

  it("verdict is recommend for payback < 5 years", () => {
    expect(roiAtYears(4.99)!.verdict).toBe("recommend");
  });

  it("verdict is depends-on-lifespan at exactly 5 years (inclusive lower bound)", () => {
    const r = roiAtYears(5.0)!;
    expect(r.paybackYears).toBeCloseTo(5.0, 5);
    expect(r.verdict).toBe("depends-on-lifespan");
  });

  it("verdict is wait-until-breakdown at exactly 8 years", () => {
    expect(roiAtYears(8.0)!.verdict).toBe("wait-until-breakdown");
  });

  it("verdict is no-benefit at exactly 12 years", () => {
    expect(roiAtYears(12.0)!.verdict).toBe("no-benefit");
  });

  it("verdict is depends-on-lifespan just under 8 years", () => {
    expect(roiAtYears(7.99)!.verdict).toBe("depends-on-lifespan");
  });

  it("verdict is wait-until-breakdown just under 12 years", () => {
    expect(roiAtYears(11.99)!.verdict).toBe("wait-until-breakdown");
  });
});

describe("calculateRoi — edge cases", () => {
  it("returns Infinity + no-benefit when annual saving is zero", () => {
    const next = makeModel({ specs: { annualKwh: 200, waterPerCycleL: 80 } });
    const result = calculateRoi({
      current: { annualKwh: 200, waterPerCycleL: 80 },
      next,
      nextPriceYen: 300_000,
      rates,
    });
    expect(result!.annualSaving).toBe(0);
    expect(result!.paybackYears).toBe(Infinity);
    expect(result!.verdict).toBe("no-benefit");
  });

  it("returns Infinity + no-benefit when annual saving is negative (new is less efficient)", () => {
    const next = makeModel({ specs: { annualKwh: 300, waterPerCycleL: 80 } });
    const result = calculateRoi({
      current: { annualKwh: 200, waterPerCycleL: 80 },
      next,
      nextPriceYen: 300_000,
      rates,
    });
    expect(result!.annualSaving).toBeLessThan(0);
    expect(result!.paybackYears).toBe(Infinity);
    expect(result!.verdict).toBe("no-benefit");
  });

  it("returns null when current is null (skip axis)", () => {
    const next = makeModel();
    const result = calculateRoi({
      current: null,
      next,
      nextPriceYen: 300_000,
      rates,
    });
    expect(result).toBeNull();
  });
});
