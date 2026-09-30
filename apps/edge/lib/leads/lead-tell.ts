/**
 * A search that stops to ask tells the workspace by email.
 *
 * The round waits a day on its question and then ends by itself (the sweep's QUESTION_WAIT_MS), and until now only
 * the bell said so -- a row lead_rounds_notify writes in the same transaction as the question. An owner who was not
 * looking at the page never heard of it. The runner calls this once the question is committed (core ports.ts
 * `tell`); the row stays the trigger's, so this only mails, through notify's addressing: a workspace's own
 * addresses, or nothing. A question is nothing the platform acts on, so an unaddressable workspace is not reported.
 *
 * Best effort: it never throws, and answers whether a mail went.
 *
 * Cross-workspace: a job worker; the round's own row names its workspace, and only that workspace is mailed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { leadQuestionMail, leadQuestionRoute } from "../packages/contracts.js";
import { dashboardOrigin } from "../dashboard-origin.js";
import { mail, reachesTenant, type NotifyPorts } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { logger, errField } from "../log.js";

type Db = SupabaseClient<Database>;

export async function tellLeadQuestion(
  db: Db,
  roundId: string,
  ports: Pick<NotifyPorts, "send"> = {},
): Promise<boolean> {
  try {
    const { data: r } = await db
      .from("lead_rounds")
      .select("tenant_id, search_id, state, question")
      .eq("id", roundId)
      .maybeSingle();
    const q = r?.question as { sentence?: unknown } | null | undefined;
    // Answered, stopped or ended since: there is nothing left to ask.
    if (!r || r.state !== "waiting_on_owner" || typeof q?.sentence !== "string") return false;
    const target = { tenantId: r.tenant_id, ...(await loadTenantNotifications(db, r.tenant_id)) };
    if (!reachesTenant(target)) return false;
    const [{ data: s }, { data: t }] = await Promise.all([
      db.from("lead_searches").select("name").eq("id", r.search_id).eq("tenant_id", r.tenant_id).maybeSingle(),
      db.from("tenants").select("slug").eq("id", r.tenant_id).maybeSingle(),
    ]);
    const page = t?.slug ? `/w/${encodeURIComponent(t.slug)}` : "/";
    const words = leadQuestionMail({
      name: s?.name ?? "leads",
      sentence: q.sentence,
      link: `${dashboardOrigin()}${page}#/${leadQuestionRoute(r.search_id)}`,
    });
    return await mail(target, words, ports);
  } catch (e) {
    logger().error("lead_tell_failed", { round: roundId, error: errField(e) });
    return false;
  }
}
