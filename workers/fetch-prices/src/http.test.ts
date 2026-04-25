import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithRetry, sleep, FetchError } from "./http";

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(50);
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(resolved).toBe(true);
    vi.useRealTimers();
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the response on first success (200)", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry("https://example.com");
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds on the second attempt", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry("https://example.com");
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 (server error) and succeeds on the second attempt", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry("https://example.com");
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns the final response when all 3 attempts fail with 429", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(new Response("rate limited", { status: 429 }));

    const promise = fetchWithRetry("https://example.com");
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 404", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    const promise = fetchWithRetry("https://example.com");
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws FetchError after 3 persistent network failures", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockRejectedValue(new TypeError("Network failure"));

    const promise = fetchWithRetry("https://example.com").catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(FetchError);
    expect((result as FetchError).attempt).toBe(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("uses attempt^2 * 1000ms backoff between retries (1s, 4s)", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(new Response("rate limited", { status: 429 }));

    const promise = fetchWithRetry("https://example.com");

    // 1st attempt fires synchronously (await yields after fetch is invoked)
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 1st failure → wait 1s before 2nd attempt
    await vi.advanceTimersByTimeAsync(999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // 2nd failure → wait 4s before 3rd attempt
    await vi.advanceTimersByTimeAsync(3999);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    await vi.runAllTimersAsync();
    await promise;
  });

  it("respects custom maxAttempts", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(new Response("rate limited", { status: 429 }));

    const promise = fetchWithRetry("https://example.com", { maxAttempts: 1 });
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.status).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("passes through fetch init options", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry("https://example.com", {
      init: { headers: { "X-Test": "1" } },
    });
    await vi.runAllTimersAsync();
    await promise;

    expect(mockFetch).toHaveBeenCalledWith("https://example.com", {
      headers: { "X-Test": "1" },
    });
  });
});
