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
          // 全ステータスで filtered ログを出すと冗長なので、status != written
          // または filteredOut が発生した場合のみ出力（W4 観測ログ）
          const hasFiltered =
            (r.rakuten?.filteredOutByMinPrice ?? 0) > 0 ||
            (r.yahoo?.filteredOutByMinPrice ?? 0) > 0;
          if (r.status !== "written" || hasFiltered) {
            console.log(
              JSON.stringify({
                event: "scheduled.model_result",
                modelId: r.modelId,
                status: r.status,
                reason: r.reason ?? null,
                rakutenItemCode: r.rakuten?.topItemCode ?? null,
                yahooItemCode: r.yahoo?.topItemCode ?? null,
                rakutenFilteredOutByMinPrice:
                  r.rakuten?.filteredOutByMinPrice ?? 0,
                yahooFilteredOutByMinPrice:
                  r.yahoo?.filteredOutByMinPrice ?? 0,
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

// pipeline / github writer / rakuten / yahoo が依存する全 env キー。
// secret の他、wrangler.toml の [vars] で配信される public 設定も含む。
// いずれかが未設定だと深い場所で 4xx/422 が出るため、Cron 起動直後に
// fail-fast する。
export function requireSecrets(env: Env): string[] {
  const required: Array<keyof Env> = [
    "RAKUTEN_APP_ID",
    "YAHOO_CLIENT_ID",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_BRANCH",
    "USER_AGENT",
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
  ];
  return required.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.length === 0;
  });
}
