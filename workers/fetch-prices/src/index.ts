/**
 * kaden-kaimi-fetch-prices
 *
 * Cloudflare Workers Cron（日次 JST 05:00）が楽天 / Yahoo! API から価格を取得し、
 * GitHub Contents API で `data/prices/**` に追記コミットする。
 *
 * P2.2: scheduled ハンドラの最小実装。実パイプラインは P2.3 / P2.4 で追加。
 */

export interface Env {
  // シークレット（.dev.vars / wrangler secret put）
  RAKUTEN_APP_ID: string;
  YAHOO_CLIENT_ID: string;
  GITHUB_TOKEN: string;

  // 公開設定（wrangler.toml [vars]）
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  GIT_AUTHOR_NAME: string;
  GIT_AUTHOR_EMAIL: string;
  USER_AGENT: string;

  // ドライラン用（任意）
  TARGET_MODEL_ID?: string;
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const startedAt = Date.now();
    const scheduledIso = new Date(controller.scheduledTime).toISOString();

    console.log(
      JSON.stringify({
        event: "scheduled.start",
        cron: controller.cron,
        scheduledTime: scheduledIso,
      }),
    );

    // P2.2 では env 検証のみ実施。パイプラインは P2.4 で結線。
    const missing = requireSecrets(env);
    if (missing.length > 0) {
      console.log(
        JSON.stringify({
          event: "scheduled.error",
          reason: "missing_secrets",
          missing,
        }),
      );
      return;
    }

    console.log(
      JSON.stringify({
        event: "scheduled.skip",
        reason: "pipeline_not_yet_implemented",
        target: env.TARGET_MODEL_ID ?? null,
        durationMs: Date.now() - startedAt,
      }),
    );
  },
};

function requireSecrets(env: Env): string[] {
  const required: Array<keyof Env> = [
    "RAKUTEN_APP_ID",
    "YAHOO_CLIENT_ID",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_BRANCH",
  ];
  return required.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.length === 0;
  });
}
