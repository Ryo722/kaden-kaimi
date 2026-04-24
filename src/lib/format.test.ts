import { describe, expect, it } from "vitest";

import { formatIsoDate, formatPercent, formatYen } from "./format";

describe("formatYen", () => {
  it("formats integer yen with comma separators", () => {
    expect(formatYen(298000)).toBe("¥298,000");
  });

  it("rounds fractional values", () => {
    expect(formatYen(298000.6)).toBe("¥298,001");
  });

  it("returns the fallback for null", () => {
    expect(formatYen(null)).toBe("—");
  });

  it("returns the fallback for Infinity", () => {
    expect(formatYen(Infinity)).toBe("—");
  });

  it("respects a custom fallback", () => {
    expect(formatYen(null, "不明")).toBe("不明");
  });
});

describe("formatIsoDate", () => {
  it("formats a valid ISO date into Japanese", () => {
    expect(formatIsoDate("2024-09-20")).toBe("2024年9月20日");
  });

  it("returns the original string when the format is unexpected", () => {
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatPercent", () => {
  it("prefixes positive values with +", () => {
    expect(formatPercent(0.1234)).toBe("+12.3%");
  });

  it("keeps negative sign from the number", () => {
    expect(formatPercent(-0.05)).toBe("-5.0%");
  });

  it("respects the digits parameter", () => {
    expect(formatPercent(0.5, 0)).toBe("+50%");
  });
});
