import type { Category, Model, PriceHistory } from "@/types";

import { indexModelsById } from "./models";
import { loadPriceHistory } from "./prices";

export function resolveAncestors(target: Model, all: Model[]): Model[] {
  const byId = indexModelsById(all);
  const chain: Model[] = [];
  const seen = new Set<string>([target.id]);
  let current = target.predecessorId;
  while (current !== null) {
    if (seen.has(current)) break;
    const ancestor = byId.get(current);
    if (!ancestor) break;
    chain.push(ancestor);
    seen.add(current);
    current = ancestor.predecessorId;
  }
  return chain;
}

export function loadAncestorPriceHistories(
  category: Category,
  ancestors: Model[],
): PriceHistory[] {
  return ancestors
    .map((a) => loadPriceHistory(category, a.id))
    .filter((h): h is PriceHistory => h !== null);
}
