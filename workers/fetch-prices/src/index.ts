/**
 * kaden-kaimi-fetch-prices
 *
 * Cloudflare Workers Cron（日次 JST 05:00）が楽天 / Yahoo! API から価格を取得し、
 * GitHub Contents API で `data/prices/**` に追記コミットする。
 */

import { runPipeline, type PipelineEnv } from "./pipeline";

export type Env = PipelineEnv;

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

    try {
      const summaries = await runPipeline({ env, now: new Date() });

      for (const sum of summaries) {
        console.log(
          JSON.stringify({
            event: "scheduled.category_summary",
            date: sum.date,
            category: sum.category,
            categoryError: sum.categoryError,
            totalModels: sum.totalModels,
            written: sum.written,
            skippedDuplicate: sum.skippedDuplicate,
            skippedEmpty: sum.skippedEmpty,
            failed: sum.failed,
            durationMs: sum.durationMs,
          }),
        );
        for (const r of sum.results) {
          if (r.status !== "written") {
            console.log(
              JSON.stringify({
                event: "scheduled.model_result",
                modelId: r.modelId,
                status: r.status,
                reason: r.reason ?? null,
                rakutenItemCode: r.rakuten?.topItemCode ?? null,
                yahooItemCode: r.yahoo?.topItemCode ?? null,
              }),
            );
          }
        }
      }

      const totalWritten = summaries.reduce((sum, s) => sum + s.written, 0);
      const totalFailed = summaries.reduce((sum, s) => sum + s.failed, 0);
      console.log(
        JSON.stringify({
          event: "scheduled.done",
          totalCategories: summaries.length,
          totalWritten,
          totalFailed,
          durationMs: Date.now() - startedAt,
        }),
      );
    } catch (err) {
      console.log(
        JSON.stringify({
          event: "scheduled.fatal",
          message: err instanceof Error ? err.message : "unknown",
          durationMs: Date.now() - startedAt,
        }),
      );
    }
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
