import type { EnergyRates, Model } from "@/types";

import {
  AXIS6_BUDGET_BASE_SCORE,
  AXIS6_BUDGET_BONUS_RATIO,
  AXIS6_BUDGET_BONUS_SCORE,
  AXIS6_BUDGET_MAX_SCORE,
  AXIS6_CAPACITY_MAX_SCORE,
  AXIS6_CAPACITY_TOLERANCE_KG,
  AXIS6_DIMENSIONS_MAX_SCORE,
  AXIS6_FEATURES_MAX_SCORE,
  AXIS6_HOUSEHOLD_KG_PER_PERSON,
  AXIS6_ROI_MAX_SCORE,
  AXIS6_ROI_VERDICT_SCORE,
  AXIS6_TOP_N,
} from "./constants";
import { calculateRoi } from "./roi";

export type MatchInput = {
  candidates: Model[];
  householdSize: number;
  maxWidthMm: number;
  maxHeightMm: number;
  maxDepthMm: number;
  weeklyUses: number;
  budgetYen: number;
  priorityFeatures: string[];
  currentPrices: Map<string, number>;
  currentModel: { annualKwh: number; waterPerCycleL: number } | null;
  rates: EnergyRates;
};

export type MatchBreakdown = {
  capacity: number;
  dimensions: number;
  budget: number;
  features: number;
  roi: number;
};

export type MatchResult = {
  model: Model;
  totalScore: number;
  breakdown: MatchBreakdown;
};

export function matchModels(input: MatchInput): MatchResult[] {
  const scored = input.candidates.map((model) => scoreCandidate(model, input));
  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.model.id.localeCompare(b.model.id);
  });
  return scored.slice(0, AXIS6_TOP_N);
}

function scoreCandidate(model: Model, input: MatchInput): MatchResult {
  const priceYen = input.currentPrices.get(model.id) ?? model.msrp;

  const breakdown: MatchBreakdown = {
    capacity: scoreCapacity(model, input.householdSize),
    dimensions: scoreDimensions(model, input),
    budget: scoreBudget(priceYen, input.budgetYen),
    features: scoreFeatures(model, input.priorityFeatures),
    roi: scoreRoi(model, priceYen, input),
  };

  const totalScore =
    breakdown.capacity +
    breakdown.dimensions +
    breakdown.budget +
    breakdown.features +
    breakdown.roi;

  return { model, totalScore, breakdown };
}

function scoreCapacity(model: Model, householdSize: number): number {
  const ideal = householdSize * AXIS6_HOUSEHOLD_KG_PER_PERSON;
  const diff = Math.abs(model.specs.washCapacityKg - ideal);
  const ratio = Math.max(0, 1 - diff / AXIS6_CAPACITY_TOLERANCE_KG);
  return AXIS6_CAPACITY_MAX_SCORE * ratio;
}

function scoreDimensions(model: Model, input: MatchInput): number {
  const fits =
    model.specs.widthMm <= input.maxWidthMm &&
    model.specs.heightMm <= input.maxHeightMm &&
    model.specs.depthMm <= input.maxDepthMm;
  return fits ? AXIS6_DIMENSIONS_MAX_SCORE : 0;
}

function scoreBudget(priceYen: number, budgetYen: number): number {
  if (priceYen > budgetYen) return 0;
  const base = AXIS6_BUDGET_BASE_SCORE;
  const bonus =
    priceYen <= budgetYen * AXIS6_BUDGET_BONUS_RATIO
      ? AXIS6_BUDGET_BONUS_SCORE
      : 0;
  return Math.min(AXIS6_BUDGET_MAX_SCORE, base + bonus);
}

function scoreFeatures(model: Model, priorityFeatures: string[]): number {
  if (priorityFeatures.length === 0) return AXIS6_FEATURES_MAX_SCORE;
  const set = new Set(model.specs.features);
  const matched = priorityFeatures.filter((f) => set.has(f)).length;
  return AXIS6_FEATURES_MAX_SCORE * (matched / priorityFeatures.length);
}

function scoreRoi(
  model: Model,
  priceYen: number,
  input: MatchInput,
): number {
  if (input.currentModel === null) return 0;
  const roi = calculateRoi({
    current: input.currentModel,
    next: model,
    nextPriceYen: priceYen,
    rates: input.rates,
    weeklyUses: input.weeklyUses,
  });
  if (roi === null) return 0;
  const score = AXIS6_ROI_VERDICT_SCORE[roi.verdict];
  return Math.min(AXIS6_ROI_MAX_SCORE, score);
}
