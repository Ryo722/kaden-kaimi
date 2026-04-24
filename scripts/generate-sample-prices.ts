import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ModelSchema, PriceHistorySchema } from "../src/types/schema.ts";
import type { Model, PriceRecord } from "../src/types/schema.ts";

const END_DATE = "2026-04-24";
const DAYS = 30;
const DATA_DIR = "data";
const OUT_DIR = join(DATA_DIR, "prices", "drum-washer");

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function generateHistory(model: Model, endDate: string, days: number): PriceRecord[] {
  const records: PriceRecord[] = [];
  const base = Math.round(model.msrp * 0.85);
  for (let i = 0; i < days; i++) {
    const date = addDays(endDate, -(days - 1 - i));
    const dayOffset = i;
    const trend = 1 - 0.003 * dayOffset;
    const wave = 0.01 * Math.sin(dayOffset * 0.7);
    const rakutenMin = Math.round(base * (trend + wave));
    const rakutenAvg = Math.round(rakutenMin * 1.04);
    const yahooMin = Math.round(rakutenMin * 1.02);
    const yahooAvg = Math.round(yahooMin * 1.05);
    records.push({ date, rakutenMin, rakutenAvg, yahooMin, yahooAvg });
  }
  return records;
}

function main(): void {
  const modelsDir = join(DATA_DIR, "models", "drum-washer");
  const files = readdirSync(modelsDir).filter((f) => f.endsWith(".json"));

  mkdirSync(OUT_DIR, { recursive: true });

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(modelsDir, file), "utf-8"));
    const model = ModelSchema.parse(raw);
    const history = generateHistory(model, END_DATE, DAYS);
    const out = PriceHistorySchema.parse({ modelId: model.id, history });
    const outPath = join(OUT_DIR, `${model.id}.json`);
    writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`wrote ${outPath} (${history.length} records)`);
  }
}

main();
