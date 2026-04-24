import { describe, expect, it } from "vitest";

import type { PriceRecord } from "@/types";

import {
  averageField,
  getLatestRecord,
  loadPriceHistory,
} from "./prices";

describe("loadPriceHistory", () => {
  it("loads 30-day history for a known model", () => {
    const history = loadPriceHistory("drum-washer", "panasonic-na-lx129dl");
    expect(history).not.toBeNull();
    expect(history?.history).toHaveLength(30);
  });

  it("returns null for an unknown model", () => {
    expect(loadPriceHistory("drum-washer", "unknown-model")).toBeNull();
  });
});

describe("getLatestRecord", () => {
  it("returns the last record (history is ascending by schema guarantee)", () => {
    const history = loadPriceHistory("drum-washer", "panasonic-na-lx129dl");
    const latest = getLatestRecord(history!.history);
    expect(latest?.date).toBe("2026-04-24");
  });

  it("returns null for empty history", () => {
    expect(getLatestRecord([])).toBeNull();
  });
});

describe("averageField", () => {
  const records: PriceRecord[] = [
    {
      date: "2026-04-01",
      rakutenMin: 100,
      rakutenAvg: 110,
      yahooMin: null,
      yahooAvg: null,
    },
    {
      date: "2026-04-02",
      rakutenMin: 200,
      rakutenAvg: 220,
      yahooMin: 210,
      yahooAvg: 230,
    },
    {
      date: "2026-04-03",
      rakutenMin: null,
      rakutenAvg: null,
      yahooMin: 300,
      yahooAvg: 320,
    },
  ];

  it("averages a field, ignoring nulls", () => {
    expect(averageField(records, "rakutenMin")).toBe(150);
    expect(averageField(records, "yahooMin")).toBe(255);
  });

  it("returns null when every value is null", () => {
    const allNull: PriceRecord[] = [
      {
        date: "2026-04-01",
        rakutenMin: null,
        rakutenAvg: null,
        yahooMin: null,
        yahooAvg: null,
      },
    ];
    expect(averageField(allNull, "rakutenMin")).toBeNull();
  });

  it("filters records by inclusive date range", () => {
    expect(
      averageField(records, "rakutenMin", {
        start: "2026-04-02",
        end: "2026-04-03",
      }),
    ).toBe(200);
  });

  it("returns null when the range contains no records", () => {
    expect(
      averageField(records, "rakutenMin", {
        start: "2026-05-01",
        end: "2026-05-31",
      }),
    ).toBeNull();
  });
});
