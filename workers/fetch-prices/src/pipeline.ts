/**
 * 日次価格取得パイプライン。
 *
 * 流れ:
 *   1. category ごとに data/models/{category}/ を GitHub Contents API で list
 *   2. 各機種 JSON を fetch → 軽量 zod スキーマで validate
 *   3. 楽天 + Yahoo! API を並列実行（Promise.allSettled で 1 機種失敗を波及させない）
 *   4. PriceRecord を組み立て、`PriceRecordSchema` で validate
 *   5. data/prices/{category}/{modelId}.json を fetch、同日レコードあれば skip（冪等性）
 *   6. 末尾に追記 → `PriceHistorySchema` で全体 validate → GitHub Contents API で PUT
 *   7. 機種間に 1 秒スリープ（楽天 1 req/s 制限）
 *
 * 失敗時の方針:
 *   - 1 機種の例外は他機種に波及させない
 *   - 全データソース null（rakutenMin=yahooMin=null）の機種は書き込みスキップ
 *   - 構造的にスキーマ違反のものは絶対に書き込まない（A 案 main 直 push のセーフティ）
 */

import { z } from "zod";
import {
  BrandIdSchema,
  PriceRecordSchema,
  PriceHistorySchema,
  type PriceRecord,
  type PriceHistory,
} from "../../../src/types/schema";
import {
  BRAND_DISPLAY_NAMES,
  CATEGORY_PRICE_FLOOR,
} from "../../../src/lib/constants";
import { searchRakuten } from "./rakuten";
import { searchYahoo } from "./yahoo";
import {
  listDirectory,
  getFile,
  putFile,
  GitHubApiError,
} from "./github";
import { sleep as defaultSleep } from "./http";
import type { PriceQuote } from "./types";

export const CATEGORIES = ["drum-washer"] as const;
export type Category = (typeof CATEGORIES)[number];

const RATE_LIMIT_SLEEP_MS = 1000;

const WorkerModelSchema = z
  .object({
    id: z.string(),
    brand: BrandIdSchema,
    modelNumber: z.string(),
    externalIds: z.object({
      rakutenItemCode: z.string().nullable(),
      yahooItemCode: z.string().nullable(),
    }),
  })
  .passthrough();

export type WorkerModel = z.infer<typeof WorkerModelSchema>;

export interface PipelineEnv {
  RAKUTEN_APP_ID: string;
  YAHOO_CLIENT_ID: string;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GIT_AUTHOR_NAME: string;
  GIT_AUTHOR_EMAIL: string;
  USER_AGENT: string;
  TARGET_MODEL_ID?: string;
}

export type ModelStatus =
  | "written"
  | "skipped_duplicate"
  | "skipped_empty"
  | "failed";

export interface ModelResult {
  modelId: string;
  status: ModelStatus;
  reason?: string;
  rakuten: PriceQuote | null;
  yahoo: PriceQuote | null;
}

export interface CategorySummary {
  date: string;
  category: Category;
  /** カテゴリレベルの失敗（listDirectory が落ちた等）。成功時は null。 */
  categoryError: string | null;
  totalModels: number;
  written: number;
  skippedDuplicate: number;
  skippedEmpty: number;
  failed: number;
  results: ModelResult[];
  durationMs: number;
}

export interface PipelineDeps {
  env: PipelineEnv;
  now: Date;
  rakuten?: typeof searchRakuten;
  yahoo?: typeof searchYahoo;
  list?: typeof listDirectory;
  get?: typeof getFile;
  put?: typeof putFile;
  sleep?: typeof defaultSleep;
}

export async function runPipeline(
  deps: PipelineDeps,
): Promise<CategorySummary[]> {
  const summaries: CategorySummary[] = [];
  for (const cat of CATEGORIES) {
    summaries.push(await runForCategory(cat, deps));
  }
  return summaries;
}

async function runForCategory(
  category: Category,
  deps: PipelineDeps,
): Promise<CategorySummary> {
  const startedAt = Date.now();
  const dateIso = jstDateString(deps.now);
  const env = deps.env;
  const list = deps.list ?? listDirectory;
  const sleep = deps.sleep ?? defaultSleep;

  let entries;
  try {
    entries = await list({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path: `data/models/${category}`,
      token: env.GITHUB_TOKEN,
      userAgent: env.USER_AGENT,
    });
  } catch (err) {
    return {
      date: dateIso,
      category,
      categoryError:
        err instanceof Error ? err.message : "list_directory_unknown_error",
      totalModels: 0,
      written: 0,
      skippedDuplicate: 0,
      skippedEmpty: 0,
      failed: 1,
      results: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const targetFiles = entries
    .filter((e) => e.type === "file" && e.name.endsWith(".json"))
    .filter((e) =>
      env.TARGET_MODEL_ID
        ? e.name === `${env.TARGET_MODEL_ID}.json`
        : true,
    );

  const results: ModelResult[] = [];
  for (let i = 0; i < targetFiles.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_SLEEP_MS);
    const entry = targetFiles[i]!;
    results.push(await processModel(category, entry.path, entry.name, dateIso, deps));
  }

  return {
    date: dateIso,
    category,
    categoryError: null,
    totalModels: results.length,
    written: results.filter((r) => r.status === "written").length,
    skippedDuplicate: results.filter((r) => r.status === "skipped_duplicate")
      .length,
    skippedEmpty: results.filter((r) => r.status === "skipped_empty").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
    durationMs: Date.now() - startedAt,
  };
}

async function processModel(
  category: Category,
  modelPath: string,
  fileName: string,
  dateIso: string,
  deps: PipelineDeps,
): Promise<ModelResult> {
  const env = deps.env;
  const get = deps.get ?? getFile;
  const put = deps.put ?? putFile;
  const rakuten = deps.rakuten ?? searchRakuten;
  const yahoo = deps.yahoo ?? searchYahoo;

  let modelId = fileName.replace(/\.json$/, "");
  let rakutenQ: PriceQuote | null = null;
  let yahooQ: PriceQuote | null = null;

  try {
    const modelSnap = await get({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path: modelPath,
      token: env.GITHUB_TOKEN,
      userAgent: env.USER_AGENT,
    });
    if (!modelSnap) {
      return failed(modelId, "model_file_not_found", null, null);
    }

    let modelJson: unknown;
    try {
      modelJson = JSON.parse(modelSnap.text);
    } catch {
      return failed(modelId, "model_json_parse_failed", null, null);
    }
    const modelParsed = WorkerModelSchema.safeParse(modelJson);
    if (!modelParsed.success) {
      return failed(
        modelId,
        `model_schema_invalid: ${modelParsed.error.issues
          .map((i) => i.path.join(".") + ":" + i.message)
          .join("|")}`,
        null,
        null,
      );
    }
    const model = modelParsed.data;
    modelId = model.id;

    const minPrice = CATEGORY_PRICE_FLOOR[category];
    const brandDisplayName = BRAND_DISPLAY_NAMES[model.brand];
    const [rSettled, ySettled] = await Promise.allSettled([
      rakuten({
        modelNumber: model.modelNumber,
        brandDisplayName,
        rakutenItemCode: model.externalIds.rakutenItemCode,
        applicationId: env.RAKUTEN_APP_ID,
        userAgent: env.USER_AGENT,
        minPrice,
      }),
      yahoo({
        modelNumber: model.modelNumber,
        brandDisplayName,
        yahooItemCode: model.externalIds.yahooItemCode,
        clientId: env.YAHOO_CLIENT_ID,
        userAgent: env.USER_AGENT,
        minPrice,
      }),
    ]);
    rakutenQ = rSettled.status === "fulfilled" ? rSettled.value : null;
    yahooQ = ySettled.status === "fulfilled" ? ySettled.value : null;

    const newRecord: PriceRecord = {
      date: dateIso,
      rakutenMin: rakutenQ?.min ?? null,
      rakutenAvg: rakutenQ?.avg ?? null,
      yahooMin: yahooQ?.min ?? null,
      yahooAvg: yahooQ?.avg ?? null,
    };

    if (
      newRecord.rakutenMin === null &&
      newRecord.yahooMin === null
    ) {
      return {
        modelId,
        status: "skipped_empty",
        reason: "all_sources_returned_null",
        rakuten: rakutenQ,
        yahoo: yahooQ,
      };
    }

    const recordParsed = PriceRecordSchema.safeParse(newRecord);
    if (!recordParsed.success) {
      return failed(
        modelId,
        `record_schema_invalid: ${recordParsed.error.issues
          .map((i) => i.path.join(".") + ":" + i.message)
          .join("|")}`,
        rakutenQ,
        yahooQ,
      );
    }

    const pricesPath = `data/prices/${category}/${modelId}.json`;
    const existingSnap = await get({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path: pricesPath,
      token: env.GITHUB_TOKEN,
      userAgent: env.USER_AGENT,
    });

    let history: PriceRecord[] = [];
    let sha: string | null = null;
    if (existingSnap) {
      sha = existingSnap.sha;
      let existingJson: unknown;
      try {
        existingJson = JSON.parse(existingSnap.text);
      } catch {
        return failed(
          modelId,
          "existing_history_json_parse_failed",
          rakutenQ,
          yahooQ,
        );
      }
      const parsed = PriceHistorySchema.safeParse(existingJson);
      if (!parsed.success) {
        return failed(
          modelId,
          `existing_history_invalid: ${parsed.error.issues
            .map((i) => i.path.join(".") + ":" + i.message)
            .join("|")}`,
          rakutenQ,
          yahooQ,
        );
      }
      history = parsed.data.history;

      if (history.some((h) => h.date === dateIso)) {
        return {
          modelId,
          status: "skipped_duplicate",
          reason: "date_already_exists",
          rakuten: rakutenQ,
          yahoo: yahooQ,
        };
      }
    }

    const newHistory: PriceHistory = {
      modelId,
      history: [...history, recordParsed.data],
    };
    const fullParsed = PriceHistorySchema.safeParse(newHistory);
    if (!fullParsed.success) {
      return failed(
        modelId,
        `appended_history_invalid: ${fullParsed.error.issues
          .map((i) => i.path.join(".") + ":" + i.message)
          .join("|")}`,
        rakutenQ,
        yahooQ,
      );
    }

    const newText = JSON.stringify(fullParsed.data, null, 2) + "\n";
    await put({
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      branch: env.GITHUB_BRANCH,
      path: pricesPath,
      sha,
      text: newText,
      message: `chore(prices): update ${category}/${modelId} for ${dateIso}`,
      token: env.GITHUB_TOKEN,
      userAgent: env.USER_AGENT,
      authorName: env.GIT_AUTHOR_NAME,
      authorEmail: env.GIT_AUTHOR_EMAIL,
    });

    return {
      modelId,
      status: "written",
      rakuten: rakutenQ,
      yahoo: yahooQ,
    };
  } catch (err) {
    const reason =
      err instanceof GitHubApiError
        ? `github_api_error: status=${err.status} ${err.message}`
        : err instanceof Error
          ? err.message
          : "unknown_error";
    return failed(modelId, reason, rakutenQ, yahooQ);
  }
}

function failed(
  modelId: string,
  reason: string,
  rakutenQ: PriceQuote | null,
  yahooQ: PriceQuote | null,
): ModelResult {
  return {
    modelId,
    status: "failed",
    reason,
    rakuten: rakutenQ,
    yahoo: yahooQ,
  };
}

/** UTC 時刻から JST 日付（YYYY-MM-DD）を返す。 */
export function jstDateString(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
