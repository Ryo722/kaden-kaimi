import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BRAND_DISPLAY_NAMES, BRAND_HUE_DEGREES } from "./constants";
import { BrandsSchema } from "@/types";

// data/brands.json と src/lib/constants.ts の各 brand マップが
// ドリフトしないことを保証する invariant test（P2 codex review C2）。
//
// brands.json のみ更新された場合に静かに検索精度が劣化したり、
// 色味が古いままになったりするのを防ぐ。

const brandsJsonPath = fileURLToPath(
  new URL("../../data/brands.json", import.meta.url),
);
const brands = BrandsSchema.parse(
  JSON.parse(readFileSync(brandsJsonPath, "utf-8")),
);

describe("BRAND_DISPLAY_NAMES vs data/brands.json", () => {
  it("covers exactly the same brand id set", () => {
    const jsonIds = new Set(brands.map((b) => b.id));
    const constIds = new Set(Object.keys(BRAND_DISPLAY_NAMES));
    expect(constIds).toEqual(jsonIds);
  });

  it("displayName values match for every brand", () => {
    for (const b of brands) {
      expect(BRAND_DISPLAY_NAMES[b.id]).toBe(b.displayName);
    }
  });
});

describe("BRAND_HUE_DEGREES vs data/brands.json", () => {
  it("covers exactly the same brand id set", () => {
    const jsonIds = new Set(brands.map((b) => b.id));
    const constIds = new Set(Object.keys(BRAND_HUE_DEGREES));
    expect(constIds).toEqual(jsonIds);
  });
});
