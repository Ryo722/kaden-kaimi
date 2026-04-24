import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Category, PriceHistory, PriceRecord } from "@/types";
import { PriceHistorySchema } from "@/types";

const PRICES_ROOT = join(process.cwd(), "data", "prices");

export type PriceField = "rakutenMin" | "rakutenAvg" | "yahooMin" | "yahooAvg";

export type DateRange = { start: string; end: string };

export function loadPriceHistory(
  category: Category,
  modelId: string,
): PriceHistory | null {
  const path = join(PRICES_ROOT, category, `${modelId}.json`);
  try {
    const raw = readFileSync(path, "utf-8");
    return PriceHistorySchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function getLatestRecord(history: PriceRecord[]): PriceRecord | null {
  return history.length === 0 ? null : (history[history.length - 1] ?? null);
}

export function averageField(
  history: PriceRecord[],
  field: PriceField,
  range?: DateRange,
): number | null {
  const inRange = range
    ? history.filter((r) => r.date >= range.start && r.date <= range.end)
    : history;
  const values = inRange
    .map((r) => r[field])
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}
