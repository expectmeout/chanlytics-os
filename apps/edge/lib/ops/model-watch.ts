/**
 * The model layer's alarm and its keeping, run by the health sweep (apps/edge/api/cron/health.ts) twice an hour
 * (scorecard move 10; category 37, "no failure-rate alarm").
 *
 * A storm of failed receptionist turns used to escalate threads one by one, and nobody on the platform heard of it: the
 * pager rang only when the key was missing. Now a workspace whose model calls got no answer, a rejected request or an
 * unusable one, or whose turns ended in brain_error, MODEL_FAILURES_PAGE_AT times or more in the last hour (the larger
 * of the two counts: a failed turn is in both), pages the platform once per window per workspace (pageOperator),
 * naming the workspace and the counts, never a customer. A workspace whose page cannot be sent is logged and the next
 * is still paged.
 *
 * The usage ledger keeps its rows RETENTION_DAYS.ai_usage days: the older ones go on the same tick.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listAiFailuresHour, purgeAiUsage, type AiFailures } from "@chanlytics/db/ai";
import { isWorkspaceOurs } from "@chanlytics/db/console";
import { type Database } from "@chanlytics/db/types";
import { pageOperator, type PagePorts } from "../shared/alerts/page-operator.js";
import { logger, errField } from "../shared/log.js";

/** Failures in an hour, in one workspace, that page the platform: a handful is a blip, this many is a storm. */
const MODEL_FAILURES_PAGE_AT = 5;

/** The page's words: the workspace and the counts, never a customer. */
function describeModelFailures(aiFailures: AiFailures): { key: string; subject: string; body: string } {
  // A failed turn is both a call with no answer and a holding reply: the larger count is the fewest failures it was.
  const failures = Math.max(aiFailures.failed_calls, aiFailures.brain_errors);
  return {
    key: `model_failures:${aiFailures.tenant_id}`,
    subject: `The receptionist's model failed ${failures} times in an hour in one workspace`,
    body:
      `Workspace ${aiFailures.tenant_id}: ${aiFailures.failed_calls} model calls got no answer or no usable one, and ` +
      `${aiFailures.brain_errors} receptionist turns ended in a holding reply (brain_error), in the last hour (a failed turn is in both). ` +
      "Each thread went to a person. Read ai_usage and the brain_failed and brain_parse_failed lines for the workspace.",
  };
}

/** One tick: the workspaces over the line paged, the ledger's old rows removed. Never throws; counts the pages sent and the rows removed. */
export async function watchModels(
  db: SupabaseClient<Database>,
  pager: Omit<PagePorts, "db"> = {},
): Promise<{ paged: number; purged: number }> {
  const log = logger({ sweep: "health" });
  let paged = 0;
  let purged = 0;
  try {
    for (const row of await listAiFailuresHour(db, MODEL_FAILURES_PAGE_AT)) {
      // Our own workspaces page nobody (decision 0068): the nightly suite's failures show on Health, under Ours.
      if (await isWorkspaceOurs(db, row.tenant_id)) continue;
      const page = describeModelFailures(row);
      try {
        // Only a page that went out is counted: one held back in its window, unaddressed or failed is not.
        if ((await pageOperator({ db, ...pager }, page.key, page.subject, page.body)) === "sent") paged += 1;
      } catch (e) {
        log.error("model_failures_unpageable", { tenant_id: row.tenant_id, error: errField(e) });
      }
    }
  } catch (e) {
    log.error("model_failures_unreadable", { error: errField(e) });
  }
  try {
    purged = await purgeAiUsage(db);
  } catch (e) {
    log.error("ai_usage_purge_failed", { error: errField(e) });
  }
  return { paged, purged };
}
