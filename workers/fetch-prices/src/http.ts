/**
 * 共通 HTTP ユーティリティ。
 *
 * `fetchWithRetry` は楽天 / Yahoo! / GitHub の各 API クライアントから利用される。
 * 仕様は `docs/api-integration.md` の「レート制限対応パターン」に従う：
 *   - 最大 3 回試行（1 回 + リトライ 2 回）
 *   - リトライ前のバックオフ: attempt^2 * baseDelayMs（既定 1000ms → 1s, 4s）
 *   - リトライ対象ステータス: 429 / 500 / 502 / 503 / 504 + ネットワークエラー
 *   - 4xx（429 を除く）は即時返却（リトライしない）
 */

const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504] as const;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

export interface FetchWithRetryOptions {
  maxAttempts?: number;
  retryStatuses?: readonly number[];
  baseDelayMs?: number;
  init?: RequestInit;
}

export class FetchError extends Error {
  public readonly status: number | null;
  public readonly url: string;
  public readonly attempt: number;
  public readonly cause: unknown;

  constructor(
    status: number | null,
    url: string,
    attempt: number,
    message: string,
    cause: unknown,
  ) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.url = url;
    this.attempt = attempt;
    this.cause = cause;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const max = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      const init = options.init;
      const res = init ? await fetch(url, init) : await fetch(url);

      if (retryStatuses.includes(res.status) && attempt < max) {
        await sleep(attempt * attempt * baseDelay);
        continue;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (attempt < max) {
        await sleep(attempt * attempt * baseDelay);
        continue;
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "fetch failed";
  throw new FetchError(null, url, max, message, lastError);
}
