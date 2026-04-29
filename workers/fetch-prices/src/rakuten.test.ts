import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchRakuten, RAKUTEN_ENDPOINT } from "./rakuten";

const BASE_INPUT = {
  modelNumber: "NA-LX129DL",
  rakutenItemCode: null,
  applicationId: "12345678-1234-1234-1234-1234567890ab",
  accessKey: "pk_test_access_key",
  referer: "https://kaden-kaimi.pages.dev/",
  userAgent: "test-ua/0.1",
};

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * 新仕様 (formatVersion=2) の `Items[]` を作るヘルパー。
 * 外側キーは大文字 `Items`（実 API レスポンスで確認、2026-04-29 ライブ検証）、
 * 内側は formatVersion=2 のためフラット（`Item` ラッパーなし）。
 */
function newItems(
  items: Array<{ itemCode: string; itemPrice: number | string; availability: number }>,
): { Items: typeof items } {
  return { Items: items };
}

describe("searchRakuten (2026 new API: openapi.rakuten.co.jp)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("targets the new openapi.rakuten.co.jp endpoint", () => {
    expect(RAKUTEN_ENDPOINT).toBe(
      "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401",
    );
  });

  it("returns aggregated price quote on success (flat items[])", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson(
        newItems([
          { itemCode: "shop1:item-1", itemPrice: 280000, availability: 1 },
          { itemCode: "shop2:item-2", itemPrice: 295000, availability: 1 },
          { itemCode: "shop3:item-3", itemPrice: 310000, availability: 0 },
        ]),
      ),
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
      filteredOutByMinPrice: 0,
    });
  });

  it("includes accessKey and formatVersion=2 in URL", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([{ itemCode: "x:y", itemPrice: 280000, availability: 1 }]),
      ),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("applicationId=12345678-1234-1234-1234-1234567890ab");
    expect(calledUrl).toContain("accessKey=pk_test_access_key");
    expect(calledUrl).toContain("formatVersion=2");
  });

  it("sends User-Agent + Referer + Origin headers", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([{ itemCode: "x:y", itemPrice: 280000, availability: 1 }]),
      ),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toEqual({
      "User-Agent": "test-ua/0.1",
      Referer: "https://kaden-kaimi.pages.dev/",
      Origin: "https://kaden-kaimi.pages.dev/",
    });
  });

  it("uses itemCode lookup when rakutenItemCode is supplied", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([
          { itemCode: "myshop:my-item", itemPrice: 199800, availability: 1 },
        ]),
      ),
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

  it("composes 'brandName modelNumber' keyword when brandDisplayName is supplied", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([{ itemCode: "shop:p", itemPrice: 250000, availability: 1 }]),
      ),
    );

    const promise = searchRakuten({
      ...BASE_INPUT,
      brandDisplayName: "パナソニック",
    });
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    // URL encoded: パナソニック → %E3%83%91%E3%83%8A%E3%82%BD%E3%83%8B%E3%83%83%E3%82%AF, space → +
    expect(calledUrl).toContain(
      "keyword=%E3%83%91%E3%83%8A%E3%82%BD%E3%83%8B%E3%83%83%E3%82%AF+NA-LX129DL",
    );
    expect(calledUrl).not.toContain("itemCode=");
  });

  it("uses bare modelNumber as keyword when brandDisplayName is omitted", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([{ itemCode: "shop:p", itemPrice: 250000, availability: 1 }]),
      ),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("keyword=NA-LX129DL");
    expect(calledUrl).not.toContain("%E3%83%91"); // no brand name encoded
  });

  it("ignores brandDisplayName when rakutenItemCode is supplied", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([{ itemCode: "shop:p", itemPrice: 250000, availability: 1 }]),
      ),
    );

    const promise = searchRakuten({
      ...BASE_INPUT,
      brandDisplayName: "パナソニック",
      rakutenItemCode: "myshop:my-item",
    });
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("itemCode=myshop%3Amy-item");
    expect(calledUrl).not.toContain("keyword=");
  });

  it("falls back to keyword search when rakutenItemCode is null", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([
          { itemCode: "shop:fallback", itemPrice: 250000, availability: 1 },
        ]),
      ),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("keyword=NA-LX129DL");
    expect(calledUrl).not.toContain("itemCode=");
  });

  it("returns null when Items is empty", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson(newItems([])),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("returns null when response is non-OK and logs a 4xx warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          errors: { errorCode: 403, errorMessage: "REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING" },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    const logged = warn.mock.calls[0]?.[0] as string;
    expect(logged).toContain('"event":"rakuten.api_4xx"');
    expect(logged).toContain('"status":403');
    expect(logged).toContain('"errorCode":403');
    expect(logged).toContain("REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING");
    // applicationId は先頭 4 文字までしか出さない
    expect(logged).toContain('"applicationIdPrefix":"1234***"');
    expect(logged).not.toContain(BASE_INPUT.applicationId);
    warn.mockRestore();
  });

  it("does not log 4xx for retryable 5xx (handled in retry layer)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 503 → retry layer で 3 回失敗 → fetchWithRetry が 503 をそのまま返す
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("{}", { status: 503 }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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

  it("rejects legacy Items[].Item nested format (formatVersion=1 payload)", async () => {
    // 万一サーバが formatVersion を無視して旧 v1 構造で返してきた場合、
    // 各要素は { Item: {...} } で itemPrice は obj 直下にないため、
    // 新パーサの `typeof obj.itemPrice === "number"` 判定で全件弾かれて null。
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson({
        Items: [
          { Item: { itemCode: "x:y", itemPrice: 280000, availability: 1 } },
        ],
      }),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("ignores items with non-numeric or zero prices", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson(
        newItems([
          { itemCode: "shop:bad-1", itemPrice: "invalid", availability: 1 },
          { itemCode: "shop:bad-2", itemPrice: 0, availability: 1 },
          { itemCode: "shop:good", itemPrice: 250000, availability: 1 },
        ]),
      ),
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
      filteredOutByMinPrice: 0,
    });
  });

  it("flags available=false when no item has availability >= 1", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson(
        newItems([
          { itemCode: "shop:s1", itemPrice: 200000, availability: 0 },
          { itemCode: "shop:s2", itemPrice: 220000, availability: 0 },
        ]),
      ),
    );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.available).toBe(false);
    expect(result?.min).toBe(200000);
  });

  it("excludes hits below minPrice and aggregates only the rest", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson(
        newItems([
          { itemCode: "parts:1320", itemPrice: 1320, availability: 1 },
          { itemCode: "manual:4980", itemPrice: 4980, availability: 1 },
          { itemCode: "real:280000", itemPrice: 280000, availability: 1 },
          { itemCode: "real:295000", itemPrice: 295000, availability: 1 },
        ]),
      ),
    );

    const promise = searchRakuten({ ...BASE_INPUT, minPrice: 50000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      min: 280000,
      avg: Math.round((280000 + 295000) / 2),
      available: true,
      hitCount: 2,
      topItemCode: "real:280000",
      filteredOutByMinPrice: 2,
    });
  });

  it("returns null when every hit is below minPrice", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockJson(
        newItems([
          { itemCode: "parts:1", itemPrice: 1320, availability: 1 },
          { itemCode: "parts:2", itemPrice: 4980, availability: 1 },
        ]),
      ),
    );

    const promise = searchRakuten({ ...BASE_INPUT, minPrice: 50000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("propagates minPrice as an API query parameter", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      mockJson(
        newItems([{ itemCode: "x:y", itemPrice: 280000, availability: 1 }]),
      ),
    );

    const promise = searchRakuten({ ...BASE_INPUT, minPrice: 50000 });
    await vi.runAllTimersAsync();
    await promise;

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("minPrice=50000");
  });

  it("does not append minPrice param when omitted or zero", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      mockJson(
        newItems([{ itemCode: "x:y", itemPrice: 1000, availability: 1 }]),
      ),
    );

    let promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    await promise;
    expect(mockFetch.mock.calls[0]?.[0] as string).not.toContain("minPrice=");

    promise = searchRakuten({ ...BASE_INPUT, minPrice: 0 });
    await vi.runAllTimersAsync();
    await promise;
    expect(mockFetch.mock.calls[1]?.[0] as string).not.toContain("minPrice=");
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        mockJson(
          newItems([
            { itemCode: "shop:retry", itemPrice: 270000, availability: 1 },
          ]),
        ),
      );

    const promise = searchRakuten(BASE_INPUT);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.min).toBe(270000);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
