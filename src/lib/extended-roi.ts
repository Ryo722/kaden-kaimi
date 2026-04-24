import type { Model } from "@/types";

import {
  AXIS2_DETERGENT_ANNUAL_SAVING_YEN,
  AXIS2_DETERGENT_FEATURE,
  AXIS2_FAILURE_RISK_TABLE,
} from "./constants";
import {
  calculateRoi,
  type RoiInput,
  type RoiResult,
  type RoiVerdict,
  verdictFromPayback,
} from "./roi";

export type ExtendedRoiInput = {
  base: RoiInput;
  currentAgeYears: number;
  currentHasAutoDetergent: boolean;
};

export type ExtendedRoiResult = {
  base: RoiResult;
  failureRiskAnnualCost: number;
  detergentAnnualSaving: number;
  adjustedAnnualSaving: number;
  adjustedPaybackYears: number;
  adjustedVerdict: RoiVerdict;
};

export function calculateExtendedRoi(
  input: ExtendedRoiInput,
): ExtendedRoiResult | null {
  const base = calculateRoi(input.base);
  if (base === null) return null;

  const failureRiskAnnualCost = failureRiskCostForAge(input.currentAgeYears);
  const detergentAnnualSaving = detergentSavingForSwitch(
    input.base.next,
    input.currentHasAutoDetergent,
  );

  const adjustedAnnualSaving =
    base.annualSaving + failureRiskAnnualCost + detergentAnnualSaving;
  const adjustedPaybackYears =
    adjustedAnnualSaving <= 0
      ? Infinity
      : input.base.nextPriceYen / adjustedAnnualSaving;
  const adjustedVerdict = verdictFromPayback(adjustedPaybackYears);

  return {
    base,
    failureRiskAnnualCost,
    detergentAnnualSaving,
    adjustedAnnualSaving,
    adjustedPaybackYears,
    adjustedVerdict,
  };
}

export function failureRiskCostForAge(ageYears: number): number {
  const safeAge = Math.max(0, ageYears);
  const tier =
    AXIS2_FAILURE_RISK_TABLE.find((t) => safeAge <= t.maxAgeYears) ??
    AXIS2_FAILURE_RISK_TABLE[AXIS2_FAILURE_RISK_TABLE.length - 1]!;
  return tier.annualProbability * tier.avgRepairCostYen;
}

export function detergentSavingForSwitch(
  next: Model,
  currentHasAutoDetergent: boolean,
): number {
  if (currentHasAutoDetergent) return 0;
  if (!next.specs.features.includes(AXIS2_DETERGENT_FEATURE)) return 0;
  return AXIS2_DETERGENT_ANNUAL_SAVING_YEN;
}
