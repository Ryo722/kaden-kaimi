/**
 * 楽天ウェブサービス（IchibaItem 商品検索 API）クライアント。
 *
 * 仕様: docs/api-integration.md「楽天ウェブサービス（商品検索 API）」
 *
 * 2026-02-10 楽天 API 全面リプレース対応版（spec: 20260429-rakuten-api-2026-migration）。
 * 旧 `app.rakuten.co.jp/services/api/IchibaItem/Search/20170706` は 2026-05-13 廃止。
 * 本クライアントは新 endpoint `openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401`
 * のみを叩き、旧仕様との互換は持たない。
 *
 * 認証:
 *   - applicationId（UUID 形式、新仕様アプリ登録で発行）
 *   - accessKey（`pk_` 始まり、新仕様で必須追加）
 *   - Referer / Origin ヘッダ（無いと 403 `REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`）
 *
 * 動作:
 *   - itemCode が指定された場合は直接ルックアップ
 *   - 未指定なら modelNumber を keyword 検索（brandDisplayName 指定時は "ブランド名 品番"）
 *   - hits=5 を上位価格昇順で取得し、min / avg / available を集約
 *   - formatVersion=2 を指定し、レスポンスは `items[]` 直下フラット構造
 *   - リトライ・バックオフは fetchWithRetry に委譲（429 / 5xx / network）
 *
 * フォールバック挙動（spec: 20260426-rakuten-zerohit-final-check 継承）:
 * 楽天 API は機種によって brand 名併記でも 0 件のままの場合がある。
 * その場合 `searchRakuten` は `null` を返し、pipeline 側で
 * `rakutenMin: null / rakutenAvg: null` のまま PriceRecord を成立させる
 * （Yahoo! 単独でも片肺で書き込み可能）。
 * 楽天 0 件は障害ではなく許容される定常状態として扱う。
 *
 * 観測:
 * 4xx 受領時は `console.warn` で {status, errorCode, errorMessage, applicationIdPrefix} を
 * 1 行記録する（applicationId は先頭 4 文字までマスク）。Cloudflare Logs で
 * 認証失敗を 1 機種でも検出できるようにし、過去のように 100% null が silent に
 * 続く事故を防ぐ。
 */

import { fetchWithRetry, FetchError } from "./http";
import type { PriceQuote } from "./types";

export const RAKUTEN_ENDPOINT =
  "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401";

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
  /** 新仕様で必須。Developer Dashboard で発行される `pk_` 始まりの文字列。 */
  accessKey: string;
  /**
   * 新仕様で必須。`Referer` および `Origin` ヘッダにセットする URL。
   * 値は登録 URL と一致しなくても通る（観測: 楽天公式ブログ 2026-02-10 案内）が、
   * 自プロジェクトのドメインを使う方が将来の rate limit 別枠化に備えやすい。
   */
  referer: string;
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
    accessKey: input.accessKey,
    format: "json",
    formatVersion: "2",
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
      init: {
        headers: {
          "User-Agent": input.userAgent,
          Referer: input.referer,
          Origin: input.referer,
        },
      },
    });
  } catch (err) {
    if (err instanceof FetchError) return null;
    throw err;
  }

  if (!response.ok) {
    await logRakuten4xx(response, input.applicationId);
    return null;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }

  return parseRakutenPayload(payload, input.minPrice ?? 0);
}

/**
 * 4xx 観測ログ。再発防止用の最小限の情報のみ残す。
 * applicationId は値そのものを残さず先頭 4 文字 + 後ろを `***` でマスクし、
 * Cloudflare Logs を覗かれても秘密は流出しないようにする。
 */
async function logRakuten4xx(
  response: Response,
  applicationId: string,
): Promise<void> {
  if (response.status < 400 || response.status >= 500) return;
  const masked =
    applicationId.length <= 4
      ? "***"
      : `${applicationId.slice(0, 4)}***`;
  let errorCode: number | string | null = null;
  let errorMessage: string | null = null;
  try {
    const body = (await response.clone().json()) as {
      errors?: { errorCode?: number | string; errorMessage?: string };
    };
    errorCode = body.errors?.errorCode ?? null;
    errorMessage = body.errors?.errorMessage ?? null;
  } catch {
    // body が JSON でない場合は status のみ記録
  }
  console.warn(
    JSON.stringify({
      event: "rakuten.api_4xx",
      status: response.status,
      errorCode,
      errorMessage,
      applicationIdPrefix: masked,
    }),
  );
}

function parseRakutenPayload(
  payload: unknown,
  minPrice: number,
): PriceQuote | null {
  if (typeof payload !== "object" || payload === null) return null;
  // 新仕様 (formatVersion=2): { Items: [{ itemPrice, itemCode, availability, ... }] }
  //   外側のキーは大文字 `Items`（公式ドキュメントの説明文では小文字 `items` と
  //   表記されているが、実レスポンスは大文字。2026-04-29 ライブ検証で確認）。
  //   内側は formatVersion=2 でフラット化され、`Item` ラッパーは存在しない。
  // 旧仕様 (Items[].Item.*) は内側ラッパーがあるため `obj.itemPrice` が undefined
  //   となり、自動的に弾かれる（防御的）。
  const items = (payload as { Items?: unknown }).Items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const prices: number[] = [];
  let available = false;
  let topItemCode: string | null = null;
  let filteredOutByMinPrice = 0;

  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const obj = raw as Record<string, unknown>;

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
