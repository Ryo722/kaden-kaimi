/**
 * GitHub Contents API クライアント。
 *
 * 仕様: docs/api-integration.md「GitHub Contents API」
 *
 * - getFile: GET /repos/{owner}/{repo}/contents/{path}?ref={branch}
 *   404 → null（ファイル未存在）／200 → { sha, text }
 * - putFile: PUT /repos/{owner}/{repo}/contents/{path}
 *   sha が null の場合は新規作成、文字列のときは更新
 * - 401/403/409/422 は GitHubApiError として throw（パイプライン側で扱う）
 * - 5xx・429 は fetchWithRetry が自動リトライ
 *
 * Workers ランタイムでの UTF-8 セーフ base64 変換は nodejs_compat の
 * Buffer を使用（wrangler.toml の compatibility_flags で有効化済み）。
 */

import { Buffer } from "node:buffer";
import { fetchWithRetry, FetchError } from "./http";

export const GITHUB_API_BASE = "https://api.github.com";

export class GitHubApiError extends Error {
  public readonly status: number;
  public readonly path: string;
  public readonly responseBody: string;

  constructor(status: number, path: string, message: string, body: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.path = path;
    this.responseBody = body;
  }
}

type CommonHeaders = Record<string, string>;

function buildHeaders(token: string, userAgent: string): CommonHeaders {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": userAgent,
  };
}

export interface GetFileInput {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
  userAgent: string;
}

export interface FileSnapshot {
  sha: string;
  text: string;
}

export interface DirEntry {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir" | "submodule" | "symlink";
}

export async function listDirectory(
  input: GetFileInput,
): Promise<DirEntry[]> {
  const url = `${GITHUB_API_BASE}/repos/${input.owner}/${input.repo}/contents/${input.path}?ref=${input.branch}`;

  let response: Response;
  try {
    response = await fetchWithRetry(url, {
      init: {
        method: "GET",
        headers: buildHeaders(input.token, input.userAgent),
      },
    });
  } catch (err) {
    if (err instanceof FetchError) {
      throw new GitHubApiError(
        err.status ?? 0,
        input.path,
        `network failure: ${err.message}`,
        "",
      );
    }
    throw err;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw new GitHubApiError(
      response.status,
      input.path,
      `LIST contents failed (${response.status})`,
      bodyText,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new GitHubApiError(
      response.status,
      input.path,
      "LIST contents returned non-JSON body",
      bodyText,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new GitHubApiError(
      response.status,
      input.path,
      "LIST contents expected array",
      bodyText,
    );
  }

  const entries: DirEntry[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) continue;
    const obj = raw as Record<string, unknown>;
    if (
      typeof obj.name !== "string" ||
      typeof obj.path !== "string" ||
      typeof obj.sha !== "string" ||
      typeof obj.type !== "string"
    ) {
      continue;
    }
    if (
      obj.type !== "file" &&
      obj.type !== "dir" &&
      obj.type !== "submodule" &&
      obj.type !== "symlink"
    ) {
      continue;
    }
    entries.push({
      name: obj.name,
      path: obj.path,
      sha: obj.sha,
      type: obj.type,
    });
  }
  return entries;
}

export async function getFile(
  input: GetFileInput,
): Promise<FileSnapshot | null> {
  const url = `${GITHUB_API_BASE}/repos/${input.owner}/${input.repo}/contents/${input.path}?ref=${input.branch}`;

  let response: Response;
  try {
    response = await fetchWithRetry(url, {
      init: {
        method: "GET",
        headers: buildHeaders(input.token, input.userAgent),
      },
    });
  } catch (err) {
    if (err instanceof FetchError) {
      throw new GitHubApiError(
        err.status ?? 0,
        input.path,
        `network failure: ${err.message}`,
        "",
      );
    }
    throw err;
  }

  if (response.status === 404) return null;

  const bodyText = await response.text();
  if (!response.ok) {
    throw new GitHubApiError(
      response.status,
      input.path,
      `GET contents failed (${response.status})`,
      bodyText,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new GitHubApiError(
      response.status,
      input.path,
      "GET contents returned non-JSON body",
      bodyText,
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("sha" in parsed) ||
    !("content" in parsed) ||
    typeof (parsed as { sha: unknown }).sha !== "string" ||
    typeof (parsed as { content: unknown }).content !== "string"
  ) {
    throw new GitHubApiError(
      response.status,
      input.path,
      "GET contents missing sha or content",
      bodyText,
    );
  }

  const obj = parsed as { sha: string; content: string };
  const text = Buffer.from(obj.content, "base64").toString("utf-8");
  return { sha: obj.sha, text };
}

export interface PutFileInput {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  sha: string | null;
  text: string;
  message: string;
  token: string;
  userAgent: string;
  authorName: string;
  authorEmail: string;
}

export interface PutFileResult {
  commitSha: string;
}

export async function putFile(input: PutFileInput): Promise<PutFileResult> {
  const url = `${GITHUB_API_BASE}/repos/${input.owner}/${input.repo}/contents/${input.path}`;
  const content = Buffer.from(input.text, "utf-8").toString("base64");

  const body: Record<string, unknown> = {
    message: input.message,
    content,
    branch: input.branch,
    committer: { name: input.authorName, email: input.authorEmail },
    author: { name: input.authorName, email: input.authorEmail },
  };
  if (input.sha !== null) body.sha = input.sha;

  let response: Response;
  try {
    response = await fetchWithRetry(url, {
      init: {
        method: "PUT",
        headers: {
          ...buildHeaders(input.token, input.userAgent),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    });
  } catch (err) {
    if (err instanceof FetchError) {
      throw new GitHubApiError(
        err.status ?? 0,
        input.path,
        `network failure: ${err.message}`,
        "",
      );
    }
    throw err;
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw new GitHubApiError(
      response.status,
      input.path,
      `PUT contents failed (${response.status})`,
      bodyText,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new GitHubApiError(
      response.status,
      input.path,
      "PUT contents returned non-JSON body",
      bodyText,
    );
  }

  const commitSha = (
    parsed as { commit?: { sha?: unknown } } | null
  )?.commit?.sha;
  if (typeof commitSha !== "string") {
    throw new GitHubApiError(
      response.status,
      input.path,
      "PUT contents response missing commit.sha",
      bodyText,
    );
  }
  return { commitSha };
}
