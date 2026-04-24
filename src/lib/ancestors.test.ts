import { describe, expect, it } from "vitest";

import { resolveAncestors } from "./ancestors";
import { makeModel } from "./testing";

describe("resolveAncestors", () => {
  it("returns an empty array when there is no predecessor", () => {
    const solo = makeModel({ id: "solo", predecessorId: null });
    expect(resolveAncestors(solo, [solo])).toEqual([]);
  });

  it("follows predecessorId chain in newest-first order", () => {
    const gen1 = makeModel({ id: "gen1", predecessorId: null });
    const gen2 = makeModel({ id: "gen2", predecessorId: "gen1" });
    const gen3 = makeModel({ id: "gen3", predecessorId: "gen2" });

    expect(resolveAncestors(gen3, [gen1, gen2, gen3])).toEqual([gen2, gen1]);
  });

  it("stops when the chain encounters a missing id", () => {
    const orphan = makeModel({ id: "orphan", predecessorId: "ghost" });
    expect(resolveAncestors(orphan, [orphan])).toEqual([]);
  });

  it("breaks on self-referential cycles without looping forever", () => {
    const loopA = makeModel({ id: "loop-a", predecessorId: "loop-b" });
    const loopB = makeModel({ id: "loop-b", predecessorId: "loop-a" });
    const result = resolveAncestors(loopA, [loopA, loopB]);
    expect(result).toEqual([loopB]);
  });
});
