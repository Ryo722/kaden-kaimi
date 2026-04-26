import { describe, it, expect, vi } from "vitest";
import {
  runPipeline,
  jstDateString,
  type PipelineDeps,
  type PipelineEnv,
} from "./pipeline";
import type { PriceQuote } from "./types";
import type {
  DirEntry,
  FileSnapshot,
  PutFileResult,
  GetFileInput,
  PutFileInput,
} from "./github";
import type { RakutenSearchInput } from "./rakuten";
import type { YahooSearchInput } from "./yahoo";

const ENV: PipelineEnv = {
  RAKUTEN_APP_ID: "rk-app",
  YAHOO_CLIENT_ID: "yh-cl",
  GITHUB_TOKEN: "gh-pat",
  GITHUB_OWNER: "Ryo722",
  GITHUB_REPO: "kaden-kaimi",
  GITHUB_BRANCH: "main",
  GIT_AUTHOR_NAME: "kaden-kaimi-bot",
  GIT_AUTHOR_EMAIL: "bot@kaden-kaimi.invalid",
  USER_AGENT: "test/0.1",
};

// 2026-04-25T20:00:00Z = JST 2026-04-26 05:00:00
const NOW = new Date("2026-04-25T20:00:00Z");
const TODAY_JST = "2026-04-26";

const QUOTE_RAKUTEN: PriceQuote = {
  min: 280000,
  avg: 295000,
  available: true,
  hitCount: 5,
  topItemCode: "shop:item-1",
};
const QUOTE_YAHOO: PriceQuote = {
  min: 285000,
  avg: 300000,
  available: true,
  hitCount: 5,
  topItemCode: "store_item-1",
};

function makeModelJson(id: string, modelNumber: string): string {
  return JSON.stringify({
    id,
    brand: "panasonic",
    modelName: "Test " + id,
    modelNumber,
    category: "drum-washer",
    generation: 2024,
    announcementDate: "2024-07-15",
    releaseDate: "2024-09-20",
    msrp: 374000,
    discontinued: false,
    predecessorId: null,
    successorId: null,
    specs: {
      washCapacityKg: 12,
      dryCapacityKg: 6,
      annualKwh: 185,
      waterPerCycleL: 78,
      widthMm: 604,
      heightMm: 1021,
      depthMm: 722,
      weightKg: 81,
      features: ["heat-pump"],
    },
    externalIds: { rakutenItemCode: null, yahooItemCode: null },
    imageUrl: "/images/test.webp",
  });
}

function makeHistoryJson(
  modelId: string,
  history: Array<{
    date: string;
    rakutenMin: number | null;
    rakutenAvg: number | null;
    yahooMin: number | null;
    yahooAvg: number | null;
  }>,
): string {
  return JSON.stringify({ modelId, history });
}

interface MockSetup {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  rakuten: ReturnType<typeof vi.fn>;
  yahoo: ReturnType<typeof vi.fn>;
  sleep: ReturnType<typeof vi.fn>;
}

function setup(): MockSetup {
  return {
    list: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    rakuten: vi.fn(),
    yahoo: vi.fn(),
    sleep: vi.fn(async () => undefined),
  };
}

function deps(env: PipelineEnv, m: MockSetup): PipelineDeps {
  return {
    env,
    now: NOW,
    list: m.list as unknown as (i: GetFileInput) => Promise<DirEntry[]>,
    get: m.get as unknown as (i: GetFileInput) => Promise<FileSnapshot | null>,
    put: m.put as unknown as (i: PutFileInput) => Promise<PutFileResult>,
    rakuten: m.rakuten as unknown as (
      i: RakutenSearchInput,
    ) => Promise<PriceQuote | null>,
    yahoo: m.yahoo as unknown as (
      i: YahooSearchInput,
    ) => Promise<PriceQuote | null>,
    sleep: m.sleep as unknown as (ms: number) => Promise<void>,
  };
}

describe("jstDateString", () => {
  it("converts UTC 20:00 to JST date (next day)", () => {
    expect(jstDateString(new Date("2026-04-25T20:00:00Z"))).toBe("2026-04-26");
  });

  it("converts UTC 14:59 to JST same day", () => {
    expect(jstDateString(new Date("2026-04-25T14:59:00Z"))).toBe("2026-04-25");
  });

  it("converts UTC 15:00 to JST next day (00:00 boundary)", () => {
    expect(jstDateString(new Date("2026-04-25T15:00:00Z"))).toBe("2026-04-26");
  });
});

describe("runPipeline — happy path", () => {
  it("writes a new record for each model when none exist for today", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
      {
        name: "model-b.json",
        path: "data/models/drum-washer/model-b.json",
        sha: "mb",
        type: "file",
      },
    ] satisfies DirEntry[]);

    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path === "data/models/drum-washer/model-a.json") {
          return {
            sha: "ma",
            text: makeModelJson("model-a", "MODEL-A"),
          };
        }
        if (path === "data/models/drum-washer/model-b.json") {
          return {
            sha: "mb",
            text: makeModelJson("model-b", "MODEL-B"),
          };
        }
        if (path.startsWith("data/prices/")) {
          return null; // no existing history file
        }
        throw new Error("unexpected path " + path);
      },
    );

    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);
    m.put.mockResolvedValue({ commitSha: "cmt" } as PutFileResult);

    const summaries = await runPipeline(deps(ENV, m));

    expect(summaries).toHaveLength(1);
    const sum = summaries[0]!;
    expect(sum.category).toBe("drum-washer");
    expect(sum.date).toBe(TODAY_JST);
    expect(sum.totalModels).toBe(2);
    expect(sum.written).toBe(2);
    expect(sum.failed).toBe(0);
    expect(sum.skippedDuplicate).toBe(0);
    expect(sum.skippedEmpty).toBe(0);

    // 2 PUTs
    expect(m.put).toHaveBeenCalledTimes(2);
    const firstPut = m.put.mock.calls[0]?.[0] as PutFileInput;
    expect(firstPut.path).toBe("data/prices/drum-washer/model-a.json");
    expect(firstPut.sha).toBeNull(); // creating new file
    expect(firstPut.message).toBe(
      `chore(prices): update drum-washer/model-a for ${TODAY_JST}`,
    );
    expect(firstPut.authorName).toBe("kaden-kaimi-bot");

    // Verify content includes today's record
    const parsed = JSON.parse(firstPut.text) as {
      modelId: string;
      history: Array<{
        date: string;
        rakutenMin: number;
        yahooMin: number;
      }>;
    };
    expect(parsed.modelId).toBe("model-a");
    expect(parsed.history[0]?.date).toBe(TODAY_JST);
    expect(parsed.history[0]?.rakutenMin).toBe(280000);
    expect(parsed.history[0]?.yahooMin).toBe(285000);

    // 1 sleep between 2 models (no sleep before first or after last)
    expect(m.sleep).toHaveBeenCalledTimes(1);
    expect(m.sleep).toHaveBeenCalledWith(1000);
  });
});

describe("runPipeline — idempotency", () => {
  it("skips write when today's date already exists in history", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
    ] satisfies DirEntry[]);

    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path === "data/models/drum-washer/model-a.json") {
          return { sha: "ma", text: makeModelJson("model-a", "MODEL-A") };
        }
        return {
          sha: "psha",
          text: makeHistoryJson("model-a", [
            {
              date: TODAY_JST,
              rakutenMin: 200000,
              rakutenAvg: 210000,
              yahooMin: 205000,
              yahooAvg: 215000,
            },
          ]),
        };
      },
    );
    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);

    const summaries = await runPipeline(deps(ENV, m));
    const sum = summaries[0]!;

    expect(sum.skippedDuplicate).toBe(1);
    expect(sum.written).toBe(0);
    expect(m.put).not.toHaveBeenCalled();
    expect(sum.results[0]?.reason).toBe("date_already_exists");
  });

  it("appends new record when history exists but lacks today's date", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
    ] satisfies DirEntry[]);

    const yesterday = "2026-04-25";
    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path === "data/models/drum-washer/model-a.json") {
          return { sha: "ma", text: makeModelJson("model-a", "MODEL-A") };
        }
        return {
          sha: "psha",
          text: makeHistoryJson("model-a", [
            {
              date: yesterday,
              rakutenMin: 200000,
              rakutenAvg: 210000,
              yahooMin: 205000,
              yahooAvg: 215000,
            },
          ]),
        };
      },
    );
    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);
    m.put.mockResolvedValue({ commitSha: "cmt" } as PutFileResult);

    const summaries = await runPipeline(deps(ENV, m));
    expect(summaries[0]?.written).toBe(1);

    const putArg = m.put.mock.calls[0]?.[0] as PutFileInput;
    expect(putArg.sha).toBe("psha"); // updating existing file
    const parsed = JSON.parse(putArg.text) as {
      history: Array<{ date: string }>;
    };
    expect(parsed.history.map((h) => h.date)).toEqual([yesterday, TODAY_JST]);
  });
});

describe("runPipeline — empty results", () => {
  it("skips write when both rakuten and yahoo return null", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
    ] satisfies DirEntry[]);
    m.get.mockResolvedValue({
      sha: "ma",
      text: makeModelJson("model-a", "MODEL-A"),
    });
    m.rakuten.mockResolvedValue(null);
    m.yahoo.mockResolvedValue(null);

    const summaries = await runPipeline(deps(ENV, m));
    const sum = summaries[0]!;

    expect(sum.skippedEmpty).toBe(1);
    expect(sum.written).toBe(0);
    expect(m.put).not.toHaveBeenCalled();
    expect(sum.results[0]?.reason).toBe("all_sources_returned_null");
  });

  it("writes when only yahoo succeeds (rakuten null)", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
    ] satisfies DirEntry[]);
    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path.startsWith("data/models/")) {
          return { sha: "ma", text: makeModelJson("model-a", "MODEL-A") };
        }
        return null;
      },
    );
    m.rakuten.mockResolvedValue(null);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);
    m.put.mockResolvedValue({ commitSha: "cmt" } as PutFileResult);

    const summaries = await runPipeline(deps(ENV, m));
    expect(summaries[0]?.written).toBe(1);

    const putArg = m.put.mock.calls[0]?.[0] as PutFileInput;
    const parsed = JSON.parse(putArg.text) as {
      history: Array<{
        rakutenMin: number | null;
        yahooMin: number | null;
      }>;
    };
    expect(parsed.history[0]?.rakutenMin).toBeNull();
    expect(parsed.history[0]?.yahooMin).toBe(285000);
  });
});

describe("runPipeline — failures", () => {
  it("isolates one model failure from another", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "good.json",
        path: "data/models/drum-washer/good.json",
        sha: "g",
        type: "file",
      },
      {
        name: "bad.json",
        path: "data/models/drum-washer/bad.json",
        sha: "b",
        type: "file",
      },
    ] satisfies DirEntry[]);

    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path === "data/models/drum-washer/good.json") {
          return { sha: "g", text: makeModelJson("good", "GOOD-1") };
        }
        if (path === "data/models/drum-washer/bad.json") {
          return { sha: "b", text: '{"id":"bad"}' }; // missing required fields
        }
        return null;
      },
    );
    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);
    m.put.mockResolvedValue({ commitSha: "cmt" } as PutFileResult);

    const summaries = await runPipeline(deps(ENV, m));
    const sum = summaries[0]!;

    expect(sum.totalModels).toBe(2);
    expect(sum.written).toBe(1);
    expect(sum.failed).toBe(1);
    expect(sum.results.find((r) => r.modelId === "bad")?.status).toBe(
      "failed",
    );
  });

  it("records list-level failure in categoryError, with empty results", async () => {
    const m = setup();
    m.list.mockRejectedValue(new Error("network fail"));

    const summaries = await runPipeline(deps(ENV, m));
    const sum = summaries[0]!;

    expect(sum.totalModels).toBe(0);
    expect(sum.failed).toBe(1);
    expect(sum.categoryError).toBe("network fail");
    expect(sum.results).toEqual([]);
  });

  it("records put failure as model-level failure", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
    ] satisfies DirEntry[]);
    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path.startsWith("data/models/")) {
          return { sha: "ma", text: makeModelJson("model-a", "MODEL-A") };
        }
        return null;
      },
    );
    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);
    m.put.mockRejectedValue(new Error("put failed"));

    const summaries = await runPipeline(deps(ENV, m));
    expect(summaries[0]?.failed).toBe(1);
    expect(summaries[0]?.results[0]?.reason).toBe("put failed");
  });

  it("rejects existing history with corrupt schema (no overwrite)", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
    ] satisfies DirEntry[]);
    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path.startsWith("data/models/")) {
          return { sha: "ma", text: makeModelJson("model-a", "MODEL-A") };
        }
        return { sha: "psha", text: '{"modelId":"x","history":"oops"}' };
      },
    );
    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);

    const summaries = await runPipeline(deps(ENV, m));
    expect(summaries[0]?.failed).toBe(1);
    expect(m.put).not.toHaveBeenCalled();
  });
});

describe("runPipeline — CATEGORY_PRICE_FLOOR propagation", () => {
  it("passes the drum-washer floor (50000) as minPrice to both clients", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
    ] satisfies DirEntry[]);
    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path.startsWith("data/models/")) {
          return { sha: "ma", text: makeModelJson("model-a", "MODEL-A") };
        }
        return null;
      },
    );
    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);
    m.put.mockResolvedValue({ commitSha: "cmt" } as PutFileResult);

    await runPipeline(deps(ENV, m));

    const rakutenArg = m.rakuten.mock.calls[0]?.[0] as RakutenSearchInput;
    const yahooArg = m.yahoo.mock.calls[0]?.[0] as YahooSearchInput;
    expect(rakutenArg.minPrice).toBe(50000);
    expect(yahooArg.minPrice).toBe(50000);
  });
});

describe("runPipeline — TARGET_MODEL_ID", () => {
  it("filters to only the targeted model", async () => {
    const m = setup();
    m.list.mockResolvedValue([
      {
        name: "model-a.json",
        path: "data/models/drum-washer/model-a.json",
        sha: "ma",
        type: "file",
      },
      {
        name: "model-b.json",
        path: "data/models/drum-washer/model-b.json",
        sha: "mb",
        type: "file",
      },
    ] satisfies DirEntry[]);
    m.get.mockImplementation(
      async ({ path }: GetFileInput): Promise<FileSnapshot | null> => {
        if (path.startsWith("data/models/")) {
          const id = path.replace(/^data\/models\/drum-washer\//, "").replace(
            /\.json$/,
            "",
          );
          return { sha: id, text: makeModelJson(id, id.toUpperCase()) };
        }
        return null;
      },
    );
    m.rakuten.mockResolvedValue(QUOTE_RAKUTEN);
    m.yahoo.mockResolvedValue(QUOTE_YAHOO);
    m.put.mockResolvedValue({ commitSha: "cmt" } as PutFileResult);

    const summaries = await runPipeline(
      deps({ ...ENV, TARGET_MODEL_ID: "model-b" }, m),
    );
    const sum = summaries[0]!;

    expect(sum.totalModels).toBe(1);
    expect(sum.results[0]?.modelId).toBe("model-b");
    expect(m.put).toHaveBeenCalledTimes(1);
  });
});
