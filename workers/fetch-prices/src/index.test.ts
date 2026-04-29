import { describe, expect, it } from "vitest";
import { requireSecrets, type Env } from "./index";

const FULL_ENV: Env = {
  RAKUTEN_APP_ID: "12345678-1234-1234-1234-1234567890ab",
  RAKUTEN_ACCESS_KEY: "pk_test",
  RAKUTEN_REFERER: "https://kaden-kaimi.pages.dev/",
  YAHOO_CLIENT_ID: "yh-cl",
  GITHUB_TOKEN: "gh-pat",
  GITHUB_OWNER: "Ryo722",
  GITHUB_REPO: "kaden-kaimi",
  GITHUB_BRANCH: "main",
  GIT_AUTHOR_NAME: "kaden-kaimi-bot",
  GIT_AUTHOR_EMAIL: "bot@kaden-kaimi.invalid",
  USER_AGENT: "kaden-kaimi-bot/0.1",
};

describe("requireSecrets", () => {
  it("returns empty when all required env values are present", () => {
    expect(requireSecrets(FULL_ENV)).toEqual([]);
  });

  it("flags missing RAKUTEN_APP_ID", () => {
    const env = { ...FULL_ENV, RAKUTEN_APP_ID: "" };
    expect(requireSecrets(env)).toContain("RAKUTEN_APP_ID");
  });

  it("flags missing RAKUTEN_ACCESS_KEY (2026 new API requirement)", () => {
    const env = { ...FULL_ENV, RAKUTEN_ACCESS_KEY: "" };
    expect(requireSecrets(env)).toContain("RAKUTEN_ACCESS_KEY");
  });

  it("flags missing RAKUTEN_REFERER (2026 new API requirement)", () => {
    const env = { ...FULL_ENV, RAKUTEN_REFERER: "" };
    expect(requireSecrets(env)).toContain("RAKUTEN_REFERER");
  });

  it("flags missing USER_AGENT (P2 codex review fix)", () => {
    const env = { ...FULL_ENV, USER_AGENT: "" };
    expect(requireSecrets(env)).toContain("USER_AGENT");
  });

  it("flags missing GIT_AUTHOR_NAME (P2 codex review fix)", () => {
    const env = { ...FULL_ENV, GIT_AUTHOR_NAME: "" };
    expect(requireSecrets(env)).toContain("GIT_AUTHOR_NAME");
  });

  it("flags missing GIT_AUTHOR_EMAIL (P2 codex review fix)", () => {
    const env = { ...FULL_ENV, GIT_AUTHOR_EMAIL: "" };
    expect(requireSecrets(env)).toContain("GIT_AUTHOR_EMAIL");
  });

  it("flags multiple missing keys", () => {
    const env = { ...FULL_ENV, USER_AGENT: "", GITHUB_TOKEN: "" };
    const missing = requireSecrets(env);
    expect(missing).toContain("USER_AGENT");
    expect(missing).toContain("GITHUB_TOKEN");
    expect(missing.length).toBe(2);
  });

  it("treats whitespace-only as present (length > 0) — separate concern", () => {
    // 現状仕様: typeof check + length > 0 のみ。
    // 空白文字は present と判定される。これを変更するなら別 PR で。
    const env = { ...FULL_ENV, USER_AGENT: " " };
    expect(requireSecrets(env)).not.toContain("USER_AGENT");
  });

  it("treats non-string types as missing (defensive)", () => {
    const env = { ...FULL_ENV, USER_AGENT: undefined as unknown as string };
    expect(requireSecrets(env)).toContain("USER_AGENT");
  });
});
