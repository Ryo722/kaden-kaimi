import type { Model } from "@/types";

import {
  AXIS1_CAPACITY_DELTA_MAX_KG,
  AXIS1_CORE_DRY_CAPACITY_MIN_KG,
  AXIS1_CORE_FEATURES,
  AXIS1_FEATURE_MATCH_WEIGHT,
  AXIS1_PRICE_DIFF_WEIGHT,
  AXIS1_TOP_N,
} from "./constants";

export type Alternative = {
  model: Model;
  score: number;
  priceDiff: number;
  featureMatchRatio: number;
  priceDiffNormalized: number;
};

export type FindAlternativesOptions = {
  includeDiscontinued?: boolean;
};

export function findAlternatives(
  target: Model,
  all: Model[],
  options: FindAlternativesOptions = {},
): Alternative[] {
  const { includeDiscontinued = false } = options;
  const targetFeatures = new Set(target.specs.features);

  const candidates = all.filter((m) => {
    if (m.id === target.id) return false;
    if (!includeDiscontinued && m.discontinued) return false;
    if (
      Math.abs(m.specs.washCapacityKg - target.specs.washCapacityKg) >
      AXIS1_CAPACITY_DELTA_MAX_KG
    ) {
      return false;
    }
    if (m.specs.dryCapacityKg <= AXIS1_CORE_DRY_CAPACITY_MIN_KG) return false;
    for (const core of AXIS1_CORE_FEATURES) {
      if (!m.specs.features.includes(core)) return false;
    }
    return true;
  });

  const scored = candidates.map((m) => scoreCandidate(target, m, targetFeatures));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.model.id.localeCompare(b.model.id);
  });

  return scored.slice(0, AXIS1_TOP_N);
}

function scoreCandidate(
  target: Model,
  candidate: Model,
  targetFeatures: Set<string>,
): Alternative {
  const matched = candidate.specs.features.filter((f) => targetFeatures.has(f));
  const featureMatchRatio =
    targetFeatures.size === 0 ? 0 : matched.length / targetFeatures.size;

  const priceDiff = candidate.msrp - target.msrp;
  const priceDiffNormalized =
    target.msrp === 0 ? 0 : Math.max(0, -priceDiff / target.msrp);

  const score =
    featureMatchRatio * AXIS1_FEATURE_MATCH_WEIGHT +
    priceDiffNormalized * AXIS1_PRICE_DIFF_WEIGHT;

  return {
    model: candidate,
    score,
    priceDiff,
    featureMatchRatio,
    priceDiffNormalized,
  };
}
