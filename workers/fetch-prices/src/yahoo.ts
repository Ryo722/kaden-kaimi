/**
 * Yahoo! ショッピング 商品検索 API V3 クライアント。
 *
 * 仕様: docs/api-integration.md「Yahoo! ショッピング（商品検索 API V3）」
 *
 * - in_stock=true で在庫あり商品のみ取得（available は常に true）
 * - yahooItemCode 指定時はそれを query として優先（V3 に target_id 相当はないため）
 * - results=5 の hits[] を集約
 * - リトライ・バックオフは fetchWithRetry 委譲
 */

import { fetchWithRetry, FetchError } from "./http";
import type { PriceQuote } from "./types";

export const YAHOO_ENDPOINT =
  "https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch";

const RESULTS_PER_REQUEST = 5;

export interface YahooSearchInput {
  modelNumber: string;
  /**
   * ブランド表示名（例: "パナソニック"）。指定時は query を
   * "ブランド名 品番" に組み立て、品番単独検索より精度を上げる。
   * yahooItemCode が指定されている場合は無視される（itemCode を query に使う）。
   */
  brandDisplayName?: string;
  yahooItemCode: string | null;
  clientId: string;
  userAgent: string;
  /**
   * 集約から除外する下限価格（円・含む = この値未満を捨てる）。
   * keyword フォールバック時に部品・取説など低価格商品が混入するのを防ぐ。
   * 0 / 未指定なら無効。
   */
  minPrice?: number;
}

export async function searchYahoo(
  input: YahooSearchInput,
): Promise<PriceQuote | null> {
  const query = input.yahooItemCode
    ?? (input.brandDisplayName
      ? `${input.brandDisplayName} ${input.modelNumber}`
      : input.modelNumber);
  const params = new URLSearchParams({
    appid: input.clientId,
    results: String(RESULTS_PER_REQUEST),
    in_stock: "true",
    query,
  });
  if (input.minPrice && input.minPrice > 0) {
    params.set("price_from", String(input.minPrice));
  }
  const url = `${YAHOO_ENDPOINT}?${params.toString()}`;

  let response: Response;
  try {
    response = await fetchWithRetry(url, {
      init: { headers: { "User-Agent": input.userAgent } },
    });
  } catch (err) {
    if (err instanceof FetchError) return null;
    throw err;
  }

  if (!response.ok) return null;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  return parseYahooPayload(payload, input.minPrice ?? 0);
}

function parseYahooPayload(
  payload: unknown,
  minPrice: number,
): PriceQuote | null {
  if (typeof payload !== "object" || payload === null) return null;
  const hits = (payload as { hits?: unknown }).hits;
  if (!Array.isArray(hits) || hits.length === 0) return null;

  const prices: number[] = [];
  let topItemCode: string | null = null;
  let filteredOutByMinPrice = 0;

  for (const hit of hits) {
    if (typeof hit !== "object" || hit === null) continue;
    const obj = hit as Record<string, unknown>;

    const price = typeof obj.price === "number" ? obj.price : null;
    if (price === null || price <= 0) continue;
    if (price < minPrice) {
      filteredOutByMinPrice++;
      continue;
    }
    prices.push(price);

    if (topItemCode === null && typeof obj.code === "string") {
      topItemCode = obj.code;
    }
  }

  if (prices.length === 0) return null;

  const sum = prices.reduce((acc, n) => acc + n, 0);
  return {
    min: Math.min(...prices),
    avg: Math.round(sum / prices.length),
    available: true,
    hitCount: prices.length,
    topItemCode,
    filteredOutByMinPrice,
  };
}
