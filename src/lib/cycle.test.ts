import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  daysBetweenIso,
  median,
  predictCycle,
} from "./cycle";
import { makeModel, makePriceHistory } from "./testing";

describe("median", () => {
  it("returns the single value for a 1-element array", () => {
    expect(median([365])).toBe(365);
  });

  it("averages the middle pair for even length", () => {
    expect(median([300, 400])).toBe(350);
    expect(median([100, 200, 300, 400])).toBe(250);
  });

  it("returns the middle value for odd length", () => {
    expect(median([100, 200, 300])).toBe(200);
    expect(median([100, 200, 300, 400, 500])).toBe(300);
  });

  it("returns 0 for empty input", () => {
    expect(median([])).toBe(0);
  });

  it("is order-independent", () => {
    expect(median([300, 100, 200])).toBe(200);
  });
});

describe("addDaysIso / daysBetweenIso", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysIso("2023-01-31", 1)).toBe("2023-02-01");
    expect(addDaysIso("2023-02-28", 1)).toBe("2023-03-01");
  });

  it("respects leap year Feb 29 in 2024", () => {
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysIso("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("handles negative offsets", () => {
    expect(addDaysIso("2023-02-01", -1)).toBe("2023-01-31");
  });

  it("computes signed day difference (to - from)", () => {
    expect(daysBetweenIso("2023-01-01", "2023-01-11")).toBe(10);
    expect(daysBetweenIso("2023-01-31", "2023-01-01")).toBe(-30);
  });
});

describe("predictCycle — 0 ancestors", () => {
  it("returns 'none' confidence with skip values", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2024-07-15",
      releaseDate: "2024-09-01",
    });
    const result = predictCycle({
      target,
      ancestors: [],
      ancestorPrices: [],
      targetCurrentPrice: 300000,
      now: new Date("2024-10-01T00:00:00Z"),
    });
    expect(result.confidence).toBe("none");
    expect(result.expectedNextAnnouncementDate).toBe("2024-07-15");
    expect(result.daysUntilExpected).toBe(0);
    expect(result.expectedDropRate).toBe(0);
    expect(result.expectedPriceBeforeRelease).toBeNull();
  });
});

describe("predictCycle — 1 ancestor", () => {
  it("returns 'low' confidence and uses the single diff as period", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2023-01-31",
      releaseDate: "2023-03-01",
    });
    const a0 = makeModel({
      id: "a0",
      announcementDate: "2022-01-31",
      releaseDate: "2022-03-01",
    });
    const result = predictCycle({
      target,
      ancestors: [a0],
      ancestorPrices: [makePriceHistory("a0", [])],
      targetCurrentPrice: 300000,
      now: new Date("2023-07-15T00:00:00Z"),
    });
    expect(result.confidence).toBe("low");
    // diff = 365 days (non-leap 2022) → expected = 2023-01-31 + 365 = 2024-01-31
    expect(result.expectedNextAnnouncementDate).toBe("2024-01-31");
    expect(result.daysUntilExpected).toBe(
      daysBetweenIso("2023-07-15", "2024-01-31"),
    );
  });
});

describe("predictCycle — 2 ancestors (even diffs)", () => {
  it("returns 'medium' confidence and averages the middle pair", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2024-01-31",
      releaseDate: "2024-03-01",
    });
    const a0 = makeModel({
      id: "a0",
      announcementDate: "2023-01-31",
      releaseDate: "2023-03-01",
    });
    const a1 = makeModel({
      id: "a1",
      announcementDate: "2022-01-31",
      releaseDate: "2022-03-01",
    });
    const result = predictCycle({
      target,
      ancestors: [a0, a1],
      ancestorPrices: [
        makePriceHistory("a0", []),
        makePriceHistory("a1", []),
      ],
      targetCurrentPrice: 300000,
      now: new Date("2024-06-01T00:00:00Z"),
    });
    expect(result.confidence).toBe("medium");
    // diffs = [365, 365] (both non-leap). median = 365.
    // 2024-01-31 + 365 = 2025-01-30 (2024 is leap)
    expect(result.expectedNextAnnouncementDate).toBe("2025-01-30");
  });
});

describe("predictCycle — half-integer median rounding", () => {
  it("rounds 0.5 upward per JS Math.round (365.5 → 366)", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2024-07-15",
      releaseDate: "2024-09-01",
    });
    const a0 = makeModel({
      id: "a0",
      announcementDate: "2023-07-15", // 2023-07-15 → 2024-07-15 = 366 (2024 leap)
      releaseDate: "2023-09-01",
    });
    const a1 = makeModel({
      id: "a1",
      announcementDate: "2022-07-15", // 2022-07-15 → 2023-07-15 = 365
      releaseDate: "2022-09-01",
    });
    const result = predictCycle({
      target,
      ancestors: [a0, a1],
      ancestorPrices: [],
      targetCurrentPrice: null,
      now: new Date("2024-08-01T00:00:00Z"),
    });
    // diffs = [366, 365] → median 365.5 → round → 366
    // 2024-07-15 + 366 = 2025-07-16
    expect(result.expectedNextAnnouncementDate).toBe("2025-07-16");
  });
});

describe("predictCycle — 3 ancestors (odd diffs)", () => {
  it("returns 'high' confidence", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2024-01-31",
      releaseDate: "2024-03-01",
    });
    const a0 = makeModel({ id: "a0", announcementDate: "2023-01-31" });
    const a1 = makeModel({ id: "a1", announcementDate: "2022-01-31" });
    const a2 = makeModel({ id: "a2", announcementDate: "2021-01-31" });
    const result = predictCycle({
      target,
      ancestors: [a0, a1, a2],
      ancestorPrices: [],
      targetCurrentPrice: 300000,
      now: new Date("2024-01-01T00:00:00Z"),
    });
    expect(result.confidence).toBe("high");
    // diffs = [365, 365, 365] → median 365 → 2024-01-31 + 365 = 2025-01-30
    expect(result.expectedNextAnnouncementDate).toBe("2025-01-30");
  });
});

describe("predictCycle — drop rate", () => {
  function buildPeakAndPreReleaseHistory() {
    const records: Array<{ date: string; price: number }> = [];
    // Peak window: a0.releaseDate .. +30 days @ 300000
    for (let i = 0; i <= 30; i++) {
      records.push({ date: addDaysIso("2023-03-01", i), price: 300000 });
    }
    // Pre-release window: 30 days before target.announcementDate .. target.announcementDate @ 270000
    for (let i = 0; i <= 30; i++) {
      records.push({ date: addDaysIso("2024-01-31", i), price: 270000 });
    }
    records.sort((a, b) => a.date.localeCompare(b.date));
    return records;
  }

  it("computes drop rate from ancestor price history and projects price", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2024-03-01",
      releaseDate: "2024-04-01",
    });
    const a0 = makeModel({
      id: "a0",
      announcementDate: "2023-03-01",
      releaseDate: "2023-03-01",
    });
    const result = predictCycle({
      target,
      ancestors: [a0],
      ancestorPrices: [
        makePriceHistory("a0", buildPeakAndPreReleaseHistory()),
      ],
      targetCurrentPrice: 400000,
      now: new Date("2024-06-01T00:00:00Z"),
    });
    // dropRate = 1 - 270000/300000 = 0.1
    expect(result.expectedDropRate).toBeCloseTo(0.1, 5);
    expect(result.expectedPriceBeforeRelease).toBeCloseTo(360000, 5);
  });

  it("returns 0 drop rate and keeps full targetCurrentPrice when history is empty", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2024-03-01",
      releaseDate: "2024-04-01",
    });
    const a0 = makeModel({
      id: "a0",
      announcementDate: "2023-03-01",
      releaseDate: "2023-03-01",
    });
    const result = predictCycle({
      target,
      ancestors: [a0],
      ancestorPrices: [makePriceHistory("a0", [])],
      targetCurrentPrice: 400000,
      now: new Date("2024-06-01T00:00:00Z"),
    });
    expect(result.expectedDropRate).toBe(0);
    expect(result.expectedPriceBeforeRelease).toBe(400000);
  });

  it("returns null expectedPriceBeforeRelease when targetCurrentPrice is null", () => {
    const target = makeModel({
      id: "t",
      announcementDate: "2024-03-01",
      releaseDate: "2024-04-01",
    });
    const a0 = makeModel({
      id: "a0",
      announcementDate: "2023-03-01",
      releaseDate: "2023-03-01",
    });
    const result = predictCycle({
      target,
      ancestors: [a0],
      ancestorPrices: [makePriceHistory("a0", [])],
      targetCurrentPrice: null,
      now: new Date("2024-06-01T00:00:00Z"),
    });
    expect(result.expectedPriceBeforeRelease).toBeNull();
  });
});
