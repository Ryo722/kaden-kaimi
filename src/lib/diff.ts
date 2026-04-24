import type { Model } from "@/types";

import {
  AXIS5_ANNUAL_KWH_DELTA_THRESHOLD,
  AXIS5_DEFAULT_TRANSLATION,
  AXIS5_FEATURE_TRANSLATIONS,
  AXIS5_NUMERIC_TRANSLATIONS,
  AXIS5_WASH_CAPACITY_DELTA_THRESHOLD_KG,
  AXIS5_WATER_DELTA_THRESHOLD,
} from "./constants";

export type DiffInput = {
  target: Model;
  predecessor: Model | null;
  targetCurrentPrice?: number | null;
  predecessorCurrentPrice?: number | null;
};

export type FeatureDiffEntry = {
  key: string;
  translation: string;
};

export type NumericChange = {
  field: "annualKwh" | "waterPerCycleL" | "washCapacityKg";
  deltaPercent: number;
  translation: string;
};

export type GenerationDiff = {
  addedFeatures: FeatureDiffEntry[];
  removedFeatures: FeatureDiffEntry[];
  numericChanges: NumericChange[];
  priceDeltaYen: number | null;
};

export function computeGenerationDiff(input: DiffInput): GenerationDiff {
  const { target, predecessor } = input;
  if (predecessor === null) {
    return {
      addedFeatures: [],
      removedFeatures: [],
      numericChanges: [],
      priceDeltaYen: null,
    };
  }

  const addedFeatures = diffFeatures(
    target.specs.features,
    predecessor.specs.features,
    "added",
  );
  const removedFeatures = diffFeatures(
    predecessor.specs.features,
    target.specs.features,
    "removed",
  );

  const numericChanges: NumericChange[] = [];

  const kwhDelta = relativeDelta(
    target.specs.annualKwh,
    predecessor.specs.annualKwh,
  );
  if (Math.abs(kwhDelta) >= AXIS5_ANNUAL_KWH_DELTA_THRESHOLD) {
    numericChanges.push({
      field: "annualKwh",
      deltaPercent: kwhDelta,
      translation: AXIS5_NUMERIC_TRANSLATIONS.annualKwh(kwhDelta),
    });
  }

  const waterDelta = relativeDelta(
    target.specs.waterPerCycleL,
    predecessor.specs.waterPerCycleL,
  );
  if (Math.abs(waterDelta) >= AXIS5_WATER_DELTA_THRESHOLD) {
    numericChanges.push({
      field: "waterPerCycleL",
      deltaPercent: waterDelta,
      translation: AXIS5_NUMERIC_TRANSLATIONS.waterPerCycleL(waterDelta),
    });
  }

  const capacityDeltaKg =
    target.specs.washCapacityKg - predecessor.specs.washCapacityKg;
  if (Math.abs(capacityDeltaKg) >= AXIS5_WASH_CAPACITY_DELTA_THRESHOLD_KG) {
    const capacityDeltaPercent = relativeDelta(
      target.specs.washCapacityKg,
      predecessor.specs.washCapacityKg,
    );
    numericChanges.push({
      field: "washCapacityKg",
      deltaPercent: capacityDeltaPercent,
      translation: AXIS5_NUMERIC_TRANSLATIONS.washCapacityKg(capacityDeltaKg),
    });
  }

  const priceDeltaYen = computePriceDelta(
    input.targetCurrentPrice,
    input.predecessorCurrentPrice,
  );

  return {
    addedFeatures,
    removedFeatures,
    numericChanges,
    priceDeltaYen,
  };
}

function diffFeatures(
  left: string[],
  right: string[],
  direction: "added" | "removed",
): FeatureDiffEntry[] {
  const rightSet = new Set(right);
  return left
    .filter((f) => !rightSet.has(f))
    .map((key) => ({ key, translation: translateFeature(key, direction) }));
}

function translateFeature(
  key: string,
  direction: "added" | "removed",
): string {
  const entry = AXIS5_FEATURE_TRANSLATIONS[key];
  if (entry) return entry[direction];
  return AXIS5_DEFAULT_TRANSLATION[direction](key);
}

function relativeDelta(current: number, base: number): number {
  // ModelSpecs schema guarantees positive() for annualKwh / waterPerCycleL / washCapacityKg,
  // so base === 0 is unreachable in validated data. This guard avoids division-by-zero
  // if the schema ever relaxes to allow zero.
  if (base === 0) return 0;
  return (current - base) / base;
}

function computePriceDelta(
  target: number | null | undefined,
  predecessor: number | null | undefined,
): number | null {
  if (
    target === null ||
    target === undefined ||
    predecessor === null ||
    predecessor === undefined
  ) {
    return null;
  }
  return target - predecessor;
}
