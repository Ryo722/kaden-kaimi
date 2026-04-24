import { describe, expect, it } from "vitest";

import {
  findModelById,
  indexModelsById,
  loadAllModels,
  loadModel,
} from "./models";

describe("loadAllModels", () => {
  it("loads all 5 drum-washer sample models", () => {
    const models = loadAllModels("drum-washer");
    expect(models).toHaveLength(5);
  });

  it("returns models sorted by id for deterministic output", () => {
    const models = loadAllModels("drum-washer");
    const ids = models.map((m) => m.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("passes zod validation for every model", () => {
    const models = loadAllModels("drum-washer");
    for (const m of models) {
      expect(m.category).toBe("drum-washer");
      expect(m.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("loadModel", () => {
  it("loads a known model by id", () => {
    const model = loadModel("drum-washer", "panasonic-na-lx129dl");
    expect(model).not.toBeNull();
    expect(model?.brand).toBe("panasonic");
  });

  it("returns null for a missing model", () => {
    expect(loadModel("drum-washer", "non-existent-model")).toBeNull();
  });
});

describe("findModelById", () => {
  it("finds a model by id", () => {
    const models = loadAllModels("drum-washer");
    expect(findModelById(models, "panasonic-na-lx127dl")?.generation).toBe(
      2023,
    );
  });

  it("returns null if not found", () => {
    const models = loadAllModels("drum-washer");
    expect(findModelById(models, "missing")).toBeNull();
  });
});

describe("indexModelsById", () => {
  it("builds a Map keyed by id", () => {
    const models = loadAllModels("drum-washer");
    const index = indexModelsById(models);
    expect(index.size).toBe(5);
    expect(index.get("hitachi-bd-sx120hl")?.brand).toBe("hitachi");
  });
});
