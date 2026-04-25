import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchYahoo, YAHOO_ENDPOINT } from "./yahoo";

const BASE_INPUT = {
  modelNumber: "NA-LX129DL",
  yahooItemCode: null,
  clientId: "test-client-id",
  userAgent: "test-ua/0.1",
};

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchYahoo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns aggregated price quote from V3 hits[]", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        totalResultsAvailable: 50,
        totalResultsReturned: 3,
        firstResultsPosition: 1,
        hits: [
          { code: "store1_itm-1", name: "panel", price: 285000, inStock: true },
          { code: "store2_itm-2", name: "panel", price: 298000, inStock: true },
          { code: "store3_itm-3", name: "panel", price: 305000, inStock: true },
        ],
      }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      min: 285000,
      avg: Math.round((285000 + 298000 + 305000) / 3),
      available: true,
      hitCount: 3,
      topItemCode: "store1_itm-1",
    });
  });

  it("requests with appid, in_stock=true and results=5", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson({
        hits: [
          { code: "s_i", name: "x", price: 100000, inStock: true },
        ],
      }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl.startsWith(YAHOO_ENDPOINT)).toBe(true);
    expect(calledUrl).toContain("appid=test-client-id");
    expect(calledUrl).toContain("in_stock=true");
    expect(calledUrl).toContain("results=5");
    expect(calledUrl).toContain("query=NA-LX129DL");
  });

  it("uses yahooItemCode as query when supplied", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson({
        hits: [
          {
            code: "store_panasonic-na-lx",
            name: "x",
            price: 200000,
            inStock: true,
          },
        ],
      }),
    );

    const promise = searchYahoo({
      ...BASE_INPUT,
      yahooItemCode: "store_panasonic-na-lx",
    });
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("query=store_panasonic-na-lx");
    expect(calledUrl).not.toContain("query=NA-LX129DL");
  });

  it("returns null when hits[] is empty", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({ hits: [], totalResultsAvailable: 0 }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null when response is non-OK", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("forbidden", { status: 403 }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null on persistent network error", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("dns fail"));

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("<html>", { status: 200 }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null when hits is missing (structure change)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({ totalResultsAvailable: 5 }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("ignores hits with non-numeric or non-positive prices", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        hits: [
          { code: "x_a", price: "??", inStock: true },
          { code: "x_b", price: 0, inStock: true },
          { code: "x_c", price: 199800, inStock: true },
        ],
      }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      min: 199800,
      avg: 199800,
      available: true,
      hitCount: 1,
      topItemCode: "x_c",
    });
  });

  it("retains in_stock filter semantics: available=true when hits exist (V3 already filtered)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        hits: [{ code: "x_y", price: 250000, inStock: true }],
      }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.available).toBe(true);
  });

  it("sends User-Agent header", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson({
        hits: [{ code: "a_b", price: 100000, inStock: true }],
      }),
    );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toEqual({ "User-Agent": "test-ua/0.1" });
  });

  it("retries on 503 and succeeds on second attempt", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        mockJson({
          hits: [{ code: "retry_x", price: 260000, inStock: true }],
        }),
      );

    const promise = searchYahoo(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.min).toBe(260000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
