import type { EnergyRates, Model } from "@/types";

import {
  AXIS2_DEFAULT_WEEKLY_USES,
  AXIS2_PAYBACK_DEPENDS_MAX_YEARS,
  AXIS2_PAYBACK_RECOMMEND_MAX_YEARS,
  AXIS2_PAYBACK_WAIT_MAX_YEARS,
  AXIS2_WEEKS_PER_YEAR,
} from "./constants";

export type RoiVerdict =
  | "recommend"
  | "depends-on-lifespan"
  | "wait-until-breakdown"
  | "no-benefit";

export type RoiInput = {
  current: { annualKwh: number; waterPerCycleL: number } | null;
  next: Model;
  nextPriceYen: number;
  rates: EnergyRates;
  weeklyUses?: number;
};

export type RoiResult = {
  annualSaving: number;
  paybackYears: number;
  verdict: RoiVerdict;
};

export function calculateRoi(input: RoiInput): RoiResult | null {
  const { current, next, nextPriceYen, rates } = input;
  if (current === null) return null;

  const weeklyUses = input.weeklyUses ?? AXIS2_DEFAULT_WEEKLY_USES;
  const cyclesPerYear = weeklyUses * AXIS2_WEEKS_PER_YEAR;
  const waterCostYenPerL = rates.waterYenPerL + rates.sewerageYenPerL;

  const electricityNow = current.annualKwh * rates.electricityYenPerKwh;
  const electricityNext = next.specs.annualKwh * rates.electricityYenPerKwh;
  const waterNow = current.waterPerCycleL * cyclesPerYear * waterCostYenPerL;
  const waterNext = next.specs.waterPerCycleL * cyclesPerYear * waterCostYenPerL;

  const annualSaving = electricityNow + waterNow - (electricityNext + waterNext);

  if (annualSaving <= 0) {
    return {
      annualSaving,
      paybackYears: Infinity,
      verdict: "no-benefit",
    };
  }

  const paybackYears = nextPriceYen / annualSaving;

  return {
    annualSaving,
    paybackYears,
    verdict: verdictFromPayback(paybackYears),
  };
}

function verdictFromPayback(years: number): RoiVerdict {
  if (years < AXIS2_PAYBACK_RECOMMEND_MAX_YEARS) return "recommend";
  if (years < AXIS2_PAYBACK_DEPENDS_MAX_YEARS) return "depends-on-lifespan";
  if (years < AXIS2_PAYBACK_WAIT_MAX_YEARS) return "wait-until-breakdown";
  return "no-benefit";
}
