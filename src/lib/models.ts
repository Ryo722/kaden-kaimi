import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Category, Model } from "@/types";
import { ModelSchema } from "@/types";

const MODELS_ROOT = join(process.cwd(), "data", "models");

export function loadAllModels(category: Category): Model[] {
  const dir = join(MODELS_ROOT, category);
  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  const models = files.map((file) => {
    const raw = readFileSync(join(dir, file), "utf-8");
    return ModelSchema.parse(JSON.parse(raw));
  });
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadModel(category: Category, id: string): Model | null {
  const path = join(MODELS_ROOT, category, `${id}.json`);
  try {
    const raw = readFileSync(path, "utf-8");
    return ModelSchema.parse(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function findModelById(models: Model[], id: string): Model | null {
  return models.find((m) => m.id === id) ?? null;
}

export function indexModelsById(models: Model[]): Map<string, Model> {
  return new Map(models.map((m) => [m.id, m]));
}
