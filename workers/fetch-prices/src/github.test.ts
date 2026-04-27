import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Buffer } from "node:buffer";
import {
  getFile,
  putFile,
  listDirectory,
  GITHUB_API_BASE,
  GitHubApiError,
} from "./github";

const ENV = {
  owner: "Ryo722",
  repo: "kaden-kaimi",
  branch: "main",
  token: "github_pat_test",
  userAgent: "test-ua/0.1",
  authorName: "kaden-kaimi-bot",
  authorEmail: "bot@kaden-kaimi.invalid",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getFile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("decodes base64 content and returns sha", async () => {
    const text = '{"hello":"こんにちは"}';
    const base64 = Buffer.from(text, "utf-8").toString("base64");
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        sha: "abc123",
        content: base64,
        encoding: "base64",
      }),
    );

    const promise = getFile({
      ...ENV,
      path: "data/prices/drum-washer/x.json",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ sha: "abc123", text });

    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe(
      `${GITHUB_API_BASE}/repos/Ryo722/kaden-kaimi/contents/data/prices/drum-washer/x.json?ref=main`,
    );
    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: "Bearer github_pat_test",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "test-ua/0.1",
    });
  });

  it("returns null for 404 (file does not exist)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("not found", { status: 404 }),
    );

    const promise = getFile({ ...ENV, path: "missing.json" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeNull();
  });

  it("throws GitHubApiError for 401", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ message: "Bad credentials" }, 401),
    );

    const promise = getFile({ ...ENV, path: "x.json" }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
    expect((result as GitHubApiError).status).toBe(401);
  });
});

describe("putFile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("encodes content to base64 and PUTs with sha", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ commit: { sha: "newcommit123" } }, 200),
    );

    const text = '{"foo":"バー"}';
    const promise = putFile({
      ...ENV,
      path: "data/prices/drum-washer/x.json",
      sha: "oldsha",
      text,
      message: "chore(prices): update x for 2026-04-25",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ commitSha: "newcommit123" });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sha).toBe("oldsha");
    expect(body.branch).toBe("main");
    expect(body.message).toBe("chore(prices): update x for 2026-04-25");
    expect(body.committer).toEqual({
      name: "kaden-kaimi-bot",
      email: "bot@kaden-kaimi.invalid",
    });
    expect(body.author).toEqual({
      name: "kaden-kaimi-bot",
      email: "bot@kaden-kaimi.invalid",
    });

    const decoded = Buffer.from(body.content as string, "base64").toString(
      "utf-8",
    );
    expect(decoded).toBe(text);
  });

  it("creates a file when sha is null (no PUT body sha)", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ commit: { sha: "creation" } }, 201),
    );

    const promise = putFile({
      ...ENV,
      path: "new.json",
      sha: null,
      text: "{}",
      message: "create",
    });
    await vi.runAllTimersAsync();
    await promise;

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sha).toBeUndefined();
  });

  it("throws GitHubApiError for 409 conflict", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ message: "conflict" }, 409),
    );

    const promise = putFile({
      ...ENV,
      path: "x.json",
      sha: "old",
      text: "{}",
      message: "x",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
    expect((result as GitHubApiError).status).toBe(409);
  });

  it("throws GitHubApiError for 422 validation", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({ message: "Invalid request" }, 422),
    );

    const promise = putFile({
      ...ENV,
      path: "x.json",
      sha: "old",
      text: "{}",
      message: "x",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
    expect((result as GitHubApiError).status).toBe(422);
  });

  it("retries on 503 and succeeds on second attempt", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ commit: { sha: "ok" } }, 200));

    const promise = putFile({
      ...ENV,
      path: "x.json",
      sha: "s",
      text: "{}",
      message: "x",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.commitSha).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("listDirectory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("parses array of file entries", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse([
        {
          name: "a.json",
          path: "data/models/drum-washer/a.json",
          sha: "sha-a",
          type: "file",
        },
        {
          name: "b.json",
          path: "data/models/drum-washer/b.json",
          sha: "sha-b",
          type: "file",
        },
        {
          name: ".keep",
          path: "data/models/drum-washer/.keep",
          sha: "sha-k",
          type: "file",
        },
      ]),
    );

    const promise = listDirectory({
      ...ENV,
      path: "data/models/drum-washer",
    });
    await vi.runAllTimersAsync();
    const entries = await promise;

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      name: "a.json",
      path: "data/models/drum-washer/a.json",
      sha: "sha-a",
      type: "file",
    });
  });

  it("throws GitHubApiError when path returns non-array (it is a file, not dir)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      jsonResponse({
        sha: "filesha",
        content: "x",
        encoding: "base64",
      }),
    );

    const promise = listDirectory({
      ...ENV,
      path: "README.md",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });

  it("throws GitHubApiError on 404", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    const promise = listDirectory({
      ...ENV,
      path: "missing/dir",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
    expect((result as GitHubApiError).status).toBe(404);
  });

  it("throws GitHubApiError on persistent network failure", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("dns down"));

    const promise = listDirectory({ ...ENV, path: "x" }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });

  it("throws GitHubApiError on non-JSON body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("<html>error</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const promise = listDirectory({ ...ENV, path: "x" }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });

  it("filters out entries with invalid type or missing fields", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse([
        {
          name: "valid.json",
          path: "data/x/valid.json",
          sha: "v",
          type: "file",
        },
        // Missing path
        { name: "missing-path.json", sha: "x", type: "file" },
        // Invalid type
        {
          name: "weird.json",
          path: "data/x/weird.json",
          sha: "w",
          type: "unknown-type",
        },
        // Not an object
        "raw-string",
      ]),
    );

    const promise = listDirectory({ ...ENV, path: "data/x" });
    await vi.runAllTimersAsync();
    const entries = await promise;

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("valid.json");
  });
});

describe("getFile — additional error paths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("throws GitHubApiError on persistent network failure", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(
      new TypeError("net unreachable"),
    );

    const promise = getFile({ ...ENV, path: "x.json" }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });

  it("throws GitHubApiError on non-JSON body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("not-json", { status: 200 }),
    );

    const promise = getFile({ ...ENV, path: "x.json" }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });

  it("throws GitHubApiError when content/sha fields are missing", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ unrelated: "value" }),
    );

    const promise = getFile({ ...ENV, path: "x.json" }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });
});

describe("putFile — additional error paths", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("throws GitHubApiError on persistent network failure", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError("offline"));

    const promise = putFile({
      ...ENV,
      path: "x.json",
      sha: "s",
      text: "{}",
      message: "x",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });

  it("throws GitHubApiError on non-JSON body", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("oops", { status: 200 }),
    );

    const promise = putFile({
      ...ENV,
      path: "x.json",
      sha: "s",
      text: "{}",
      message: "x",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });

  it("throws GitHubApiError when commit.sha missing", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse({ content: { name: "x" } }, 200),
    );

    const promise = putFile({
      ...ENV,
      path: "x.json",
      sha: "s",
      text: "{}",
      message: "x",
    }).catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBeInstanceOf(GitHubApiError);
  });
});
