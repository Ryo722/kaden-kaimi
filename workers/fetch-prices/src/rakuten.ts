/**
 * 楽天ウェブサービス（IchibaItem 商品検索 API）クライアント。
 *
 * 仕様: docs/api-integration.md「楽天ウェブサービス（商品検索 API）」
 *
 * - itemCode が指定された場合は直接ルックアップ
 * - 未指定なら modelNumber を keyword 検索
 * - hits=5 を上位価格昇順で取得し、min / avg / available を集約
 * - リトライ・バックオフは fetchWithRetry に委譲（429 / 5xx / network）
 */

import { fetchWithRetry, FetchError } from "./http";
import type { PriceQuote } from "./types";

export const RAKUTEN_ENDPOINT =
  "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706";

const HITS_PER_REQUEST = 5;

export interface RakutenSearchInput {
  modelNumber: string;
  /**
   * ブランド表示名（例: "パナソニック"）。指定時は keyword を
   * "ブランド名 品番" に組み立て、品番単独検索より精度を上げる。
   * itemCode 検索時は無視される。
   */
  brandDisplayName?: string;
  rakutenItemCode: string | null;
  applicationId: string;
  userAgent: string;
  /**
   * 集約から除外する下限価格（円・含む = この値未満を捨てる）。
   * keyword フォールバック時に部品・取説など低価格商品が混入するのを防ぐ。
   * 0 / 未指定なら無効。
   */
  minPrice?: number;
}

export async function searchRakuten(
  input: RakutenSearchInput,
): Promise<PriceQuote | null> {
  const params = new URLSearchParams({
    applicationId: input.applicationId,
    format: "json",
    hits: String(HITS_PER_REQUEST),
    sort: "+itemPrice",
  });
  if (input.rakutenItemCode) {
    params.set("itemCode", input.rakutenItemCode);
  } else {
    const keyword = input.brandDisplayName
      ? `${input.brandDisplayName} ${input.modelNumber}`
      : input.modelNumber;
    params.set("keyword", keyword);
  }
  if (input.minPrice && input.minPrice > 0) {
    params.set("minPrice", String(input.minPrice));
  }
  const url = `${RAKUTEN_ENDPOINT}?${params.toString()}`;

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

  return parseRakutenPayload(payload, input.minPrice ?? 0);
}

function parseRakutenPayload(
  payload: unknown,
  minPrice: number,
): PriceQuote | null {
  if (typeof payload !== "object" || payload === null) return null;
  const items = (payload as { Items?: unknown }).Items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const prices: number[] = [];
  let available = false;
  let topItemCode: string | null = null;
  let filteredOutByMinPrice = 0;

  for (const wrapper of items) {
    if (typeof wrapper !== "object" || wrapper === null) continue;
    const item = (wrapper as { Item?: unknown }).Item;
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;

    const price = typeof obj.itemPrice === "number" ? obj.itemPrice : null;
    if (price === null || price <= 0) continue;
    if (price < minPrice) {
      filteredOutByMinPrice++;
      continue;
    }
    prices.push(price);

    if (typeof obj.availability === "number" && obj.availability >= 1) {
      available = true;
    }
    if (topItemCode === null && typeof obj.itemCode === "string") {
      topItemCode = obj.itemCode;
    }
  }

  if (prices.length === 0) return null;

  const sum = prices.reduce((acc, n) => acc + n, 0);
  return {
    min: Math.min(...prices),
    avg: Math.round(sum / prices.length),
    available,
    hitCount: prices.length,
    topItemCode,
    filteredOutByMinPrice,
  };
}
