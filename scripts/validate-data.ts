import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { z } from "zod";
import {
  BrandsSchema,
  EnergyRatesSchema,
  ModelSchema,
  PriceHistorySchema,
  type Model,
} from "../src/types/schema.ts";

const DATA_DIR = "data";

type Issue = { file: string; message: string };

const issues: Issue[] = [];

function reportZodError(file: string, error: z.ZodError): void {
  for (const e of error.issues) {
    const path = e.path.length > 0 ? ` at ${e.path.join(".")}` : "";
    issues.push({ file, message: `${e.message}${path}` });
  }
}

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function validateBrands(): void {
  const path = join(DATA_DIR, "brands.json");
  if (!existsSync(path)) {
    issues.push({ file: path, message: "file not found" });
    return;
  }
  const result = BrandsSchema.safeParse(readJson(path));
  if (!result.success) reportZodError(path, result.error);
}

function validateEnergyRates(): void {
  const path = join(DATA_DIR, "energy-rates.json");
  if (!existsSync(path)) {
    issues.push({ file: path, message: "file not found" });
    return;
  }
  const result = EnergyRatesSchema.safeParse(readJson(path));
  if (!result.success) reportZodError(path, result.error);
}

function listDataFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries: string[] = [];
  const subdirs = readdirSync(dir).filter((name) =>
    statSync(join(dir, name)).isDirectory(),
  );
  for (const sub of subdirs) {
    const files = readdirSync(join(dir, sub))
      .filter((f) => f.endsWith(".json"))
      .map((f) => join(dir, sub, f));
    entries.push(...files);
  }
  return entries;
}

function validateModels(): Map<string, Model> {
  const models = new Map<string, Model>();
  const files = listDataFiles(join(DATA_DIR, "models"));
  for (const file of files) {
    const result = ModelSchema.safeParse(readJson(file));
    if (!result.success) {
      reportZodError(file, result.error);
      continue;
    }
    const model = result.data;
    const expectedFile = `${model.id}.json`;
    if (basename(file) !== expectedFile) {
      issues.push({
        file,
        message: `filename must match id (expected ${expectedFile})`,
      });
    }
    const pathSegments = file.split("/");
    const categoryDir = pathSegments[pathSegments.length - 2];
    if (categoryDir !== model.category) {
      issues.push({
        file,
        message: `category "${model.category}" does not match directory "${categoryDir}"`,
      });
    }
    if (models.has(model.id)) {
      issues.push({ file, message: `duplicate model id: ${model.id}` });
    }
    models.set(model.id, model);
  }
  return models;
}

function validateCrossRefs(models: Map<string, Model>): void {
  for (const model of models.values()) {
    const idFile = `data/models/${model.category}/${model.id}.json`;
    if (model.predecessorId && !models.has(model.predecessorId)) {
      issues.push({
        file: idFile,
        message: `predecessorId not found: ${model.predecessorId}`,
      });
    }
    if (model.successorId && !models.has(model.successorId)) {
      issues.push({
        file: idFile,
        message: `successorId not found: ${model.successorId}`,
      });
    }
    if (model.successorId) {
      const successor = models.get(model.successorId);
      if (successor && successor.predecessorId !== model.id) {
        issues.push({
          file: idFile,
          message: `successor ${model.successorId} does not reference this model as predecessor`,
        });
      }
    }
  }
}

function validatePrices(models: Map<string, Model>): void {
  const files = listDataFiles(join(DATA_DIR, "prices"));
  const seenModelIds = new Set<string>();
  for (const file of files) {
    const result = PriceHistorySchema.safeParse(readJson(file));
    if (!result.success) {
      reportZodError(file, result.error);
      continue;
    }
    const hist = result.data;
    if (!models.has(hist.modelId)) {
      issues.push({ file, message: `modelId not found in models: ${hist.modelId}` });
    }
    if (basename(file) !== `${hist.modelId}.json`) {
      issues.push({
        file,
        message: `filename must match modelId (expected ${hist.modelId}.json)`,
      });
    }
    if (seenModelIds.has(hist.modelId)) {
      issues.push({ file, message: `duplicate price history for modelId: ${hist.modelId}` });
    }
    seenModelIds.add(hist.modelId);
  }
}

function main(): void {
  validateBrands();
  validateEnergyRates();
  const models = validateModels();
  validateCrossRefs(models);
  validatePrices(models);

  if (issues.length === 0) {
    const modelCount = models.size;
    console.log(`✓ all data valid (${modelCount} model${modelCount === 1 ? "" : "s"})`);
    process.exit(0);
  }

  console.error(`✗ ${issues.length} validation issue${issues.length === 1 ? "" : "s"}:`);
  for (const issue of issues) {
    console.error(`  ${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

main();
