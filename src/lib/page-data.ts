import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  Brand,
  Category,
  EnergyRates,
  Model,
  PriceHistory,
  PriceRecord,
} from "@/types";
import { BrandsSchema, EnergyRatesSchema } from "@/types";

import {
  loadAncestorPriceHistories,
  resolveAncestors,
} from "./ancestors";
import { predictCycle, type CycleResult } from "./cycle";
import { computeGenerationDiff, type GenerationDiff } from "./diff";
import { findModelById, loadAllModels } from "./models";
import {
  getDisplayPrice,
  getInternalPrice,
  getLatestRecord,
  loadPriceHistory,
} from "./prices";
import { findAlternatives, type Alternative } from "./similarity";

export type AlternativeWithContext = Alternative & {
  brandLabel: string;
  currentPrice: number | null;
};

export type WasherPageData = {
  model: Model;
  allModels: Model[];
  brandLabel: string;
  latestRecord: PriceRecord | null;
  displayPrice: number | null;
  internalPrice: number | null;
  cycleResult: CycleResult;
  alternatives: AlternativeWithContext[];
  predecessor: Model | null;
  predecessorInternalPrice: number | null;
  generationDiff: GenerationDiff;
  currentPricesById: Record<string, number>;
  energyRates: EnergyRates;
};

const DATA_ROOT = join(process.cwd(), "data");

export function loadWasherPagesData(
  category: Category,
  now: Date = new Date(),
): WasherPageData[] {
  const models = loadAllModels(category);
  const priceHistories = indexPriceHistories(category, models);
  const brandLabelById = loadBrandLabels();
  const energyRates = loadEnergyRates();

  const displayPriceById = buildDisplayPriceMap(models, priceHistories);

  return models.map((model) =>
    buildPageData({
      model,
      models,
      priceHistories,
      brandLabelById,
      energyRates,
      displayPriceById,
      now,
    }),
  );
}

type BuildInput = {
  model: Model;
  models: Model[];
  priceHistories: Map<string, PriceHistory>;
  brandLabelById: Map<string, string>;
  energyRates: EnergyRates;
  displayPriceById: Record<string, number>;
  now: Date;
};

function buildPageData(input: BuildInput): WasherPageData {
  const { model, models, priceHistories, brandLabelById, energyRates, now } =
    input;

  const history = priceHistories.get(model.id)?.history ?? [];
  const latestRecord = getLatestRecord(history);
  const displayPrice = getDisplayPrice(latestRecord);
  const internalPrice = getInternalPrice(latestRecord);

  const ancestors = resolveAncestors(model, models);
  const ancestorPrices = loadAncestorPriceHistories("drum-washer", ancestors);
  const cycleResult = predictCycle({
    target: model,
    ancestors,
    ancestorPrices,
    targetCurrentPrice: internalPrice,
    now,
  });

  const alternatives = findAlternatives(model, models).map((alt) => {
    const altHistory = priceHistories.get(alt.model.id)?.history ?? [];
    const altLatest = getLatestRecord(altHistory);
    return {
      ...alt,
      brandLabel: brandLabelById.get(alt.model.brand) ?? alt.model.brand,
      currentPrice: getDisplayPrice(altLatest),
    };
  });

  const predecessor =
    model.predecessorId === null
      ? null
      : findModelById(models, model.predecessorId);
  const predecessorHistory = predecessor
    ? (priceHistories.get(predecessor.id)?.history ?? [])
    : [];
  const predecessorLatest = getLatestRecord(predecessorHistory);
  const predecessorInternalPrice = getInternalPrice(predecessorLatest);

  const generationDiff = computeGenerationDiff({
    target: model,
    predecessor,
    targetCurrentPrice: internalPrice,
    predecessorCurrentPrice: predecessorInternalPrice,
  });

  return {
    model,
    allModels: models,
    brandLabel: brandLabelById.get(model.brand) ?? model.brand,
    latestRecord,
    displayPrice,
    internalPrice,
    cycleResult,
    alternatives,
    predecessor,
    predecessorInternalPrice,
    generationDiff,
    currentPricesById: input.displayPriceById,
    energyRates,
  };
}

function indexPriceHistories(
  category: Category,
  models: Model[],
): Map<string, PriceHistory> {
  const map = new Map<string, PriceHistory>();
  for (const model of models) {
    const history = loadPriceHistory(category, model.id);
    if (history !== null) map.set(model.id, history);
  }
  return map;
}

function buildDisplayPriceMap(
  models: Model[],
  priceHistories: Map<string, PriceHistory>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const model of models) {
    const history = priceHistories.get(model.id)?.history ?? [];
    const latest = getLatestRecord(history);
    result[model.id] = getDisplayPrice(latest) ?? model.msrp;
  }
  return result;
}

function loadBrandLabels(): Map<string, string> {
  const brandsPath = join(DATA_ROOT, "brands.json");
  const brands: Brand[] = BrandsSchema.parse(
    JSON.parse(readFileSync(brandsPath, "utf-8")),
  );
  return new Map(brands.map((b) => [b.id, b.displayName]));
}

function loadEnergyRates(): EnergyRates {
  const ratesPath = join(DATA_ROOT, "energy-rates.json");
  return EnergyRatesSchema.parse(
    JSON.parse(readFileSync(ratesPath, "utf-8")),
  );
}
