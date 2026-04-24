import type { Model, PriceHistory } from "@/types";

import {
  AXIS3_CONFIDENCE_BY_ANCESTOR_COUNT,
  AXIS3_PRICE_FIELD,
  AXIS3_WINDOW_DAYS,
} from "./constants";
import { averageField } from "./prices";

export type CycleConfidence = "none" | "low" | "medium" | "high";

export type CycleInput = {
  target: Model;
  ancestors: Model[];
  ancestorPrices: PriceHistory[];
  targetCurrentPrice: number | null;
  now: Date;
};

export type CycleResult = {
  expectedNextAnnouncementDate: string;
  daysUntilExpected: number;
  expectedDropRate: number;
  expectedPriceBeforeRelease: number | null;
  confidence: CycleConfidence;
};

const MS_PER_DAY = 86_400_000;

export function predictCycle(input: CycleInput): CycleResult {
  const { target, ancestors, ancestorPrices, targetCurrentPrice, now } = input;

  if (ancestors.length === 0) {
    return {
      expectedNextAnnouncementDate: target.announcementDate,
      daysUntilExpected: 0,
      expectedDropRate: 0,
      expectedPriceBeforeRelease: null,
      confidence: "none",
    };
  }

  const confidence = inferConfidence(ancestors.length);
  const periodDays = computePeriodDays(target, ancestors);
  const expectedNextAnnouncementDate = addDaysIso(
    target.announcementDate,
    Math.round(periodDays),
  );
  const nowIso = toIsoDate(now);
  const daysUntilExpected = daysBetweenIso(nowIso, expectedNextAnnouncementDate);

  const expectedDropRate = computeDropRate(target, ancestors, ancestorPrices);
  const expectedPriceBeforeRelease =
    targetCurrentPrice === null
      ? null
      : targetCurrentPrice * (1 - expectedDropRate);

  return {
    expectedNextAnnouncementDate,
    daysUntilExpected,
    expectedDropRate,
    expectedPriceBeforeRelease,
    confidence,
  };
}

function inferConfidence(count: number): CycleConfidence {
  if (count >= AXIS3_CONFIDENCE_BY_ANCESTOR_COUNT.high) return "high";
  if (count >= AXIS3_CONFIDENCE_BY_ANCESTOR_COUNT.medium) return "medium";
  if (count >= AXIS3_CONFIDENCE_BY_ANCESTOR_COUNT.low) return "low";
  return "none";
}

function computePeriodDays(target: Model, ancestors: Model[]): number {
  const chain = [target, ...ancestors];
  const diffs: number[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    const newer = chain[i]!.announcementDate;
    const older = chain[i + 1]!.announcementDate;
    diffs.push(daysBetweenIso(older, newer));
  }
  return median(diffs);
}

function computeDropRate(
  target: Model,
  ancestors: Model[],
  prices: PriceHistory[],
): number {
  const priceMap = new Map(prices.map((p) => [p.modelId, p]));
  const rates: number[] = [];

  for (let i = 0; i < ancestors.length; i++) {
    const ancestor = ancestors[i]!;
    const successorAnnounce =
      i === 0 ? target.announcementDate : ancestors[i - 1]!.announcementDate;
    const history = priceMap.get(ancestor.id)?.history ?? [];

    const peakPrice = averageField(history, AXIS3_PRICE_FIELD, {
      start: ancestor.releaseDate,
      end: addDaysIso(ancestor.releaseDate, AXIS3_WINDOW_DAYS),
    });
    const preReleasePrice = averageField(history, AXIS3_PRICE_FIELD, {
      start: addDaysIso(successorAnnounce, -AXIS3_WINDOW_DAYS),
      end: successorAnnounce,
    });

    if (peakPrice !== null && preReleasePrice !== null && peakPrice > 0) {
      rates.push(1 - preReleasePrice / peakPrice);
    }
  }

  if (rates.length === 0) return 0;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = toUtcDate(fromIso).getTime();
  const b = toUtcDate(toIso).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}
