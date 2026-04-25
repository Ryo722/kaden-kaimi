import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchRakuten, RAKUTEN_ENDPOINT } from "./rakuten";

const BASE_INPUT = {
  modelNumber: "NA-LX129DL",
  rakutenItemCode: null,
  applicationId: "test-app-id",
  userAgent: "test-ua/0.1",
};

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchRakuten", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns aggregated price quote on success", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        Items: [
          {
            Item: {
              itemCode: "shop1:item-1",
              itemPrice: 280000,
              availability: 1,
            },
          },
          {
            Item: {
              itemCode: "shop2:item-2",
              itemPrice: 295000,
              availability: 1,
            },
          },
          {
            Item: {
              itemCode: "shop3:item-3",
              itemPrice: 310000,
              availability: 0,
            },
          },
        ],
      }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      min: 280000,
      avg: Math.round((280000 + 295000 + 310000) / 3),
      available: true,
      hitCount: 3,
      topItemCode: "shop1:item-1",
    });
  });

  it("uses itemCode lookup when rakutenItemCode is supplied", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson({
        Items: [
          {
            Item: {
              itemCode: "myshop:my-item",
              itemPrice: 199800,
              availability: 1,
            },
          },
        ],
      }),
    );

    const promise = searchRakuten({
      ...BASE_INPUT,
      rakutenItemCode: "myshop:my-item",
    });
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl.startsWith(RAKUTEN_ENDPOINT)).toBe(true);
    expect(calledUrl).toContain("itemCode=myshop%3Amy-item");
    expect(calledUrl).not.toContain("keyword=");
  });

  it("falls back to keyword search when rakutenItemCode is null", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson({
        Items: [
          {
            Item: {
              itemCode: "shop:fallback",
              itemPrice: 250000,
              availability: 1,
            },
          },
        ],
      }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("keyword=NA-LX129DL");
    expect(calledUrl).not.toContain("itemCode=");
  });

  it("returns null when Items is empty", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(mockJson({ Items: [] }));

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null when response is non-OK", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("forbidden", { status: 403 }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null on persistent network error after retries", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("network down"));

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("<html>oops</html>", { status: 200 }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null on missing Items field (structure change)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({ totalResults: 0 }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("ignores items with non-numeric or zero prices", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        Items: [
          {
            Item: {
              itemCode: "shop:bad-1",
              itemPrice: "invalid",
              availability: 1,
            },
          },
          {
            Item: { itemCode: "shop:bad-2", itemPrice: 0, availability: 1 },
          },
          {
            Item: {
              itemCode: "shop:good",
              itemPrice: 250000,
              availability: 1,
            },
          },
        ],
      }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      min: 250000,
      avg: 250000,
      available: true,
      hitCount: 1,
      topItemCode: "shop:good",
    });
  });

  it("flags available=false when no item has availability >= 1", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        Items: [
          {
            Item: {
              itemCode: "shop:s1",
              itemPrice: 200000,
              availability: 0,
            },
          },
          {
            Item: {
              itemCode: "shop:s2",
              itemPrice: 220000,
              availability: 0,
            },
          },
        ],
      }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.available).toBe(false);
    expect(result?.min).toBe(200000);
  });

  it("sends User-Agent header", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson({
        Items: [
          { Item: { itemCode: "x:y", itemPrice: 1000, availability: 1 } },
        ],
      }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toEqual({ "User-Agent": "test-ua/0.1" });
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        mockJson({
          Items: [
            {
              Item: {
                itemCode: "shop:retry",
                itemPrice: 270000,
                availability: 1,
              },
            },
          ],
        }),
      );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.min).toBe(270000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
