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
import type { Database } from "@chanlytics/db/types";
import { appLink, leadQuestionMail, leadQuestionRoute } from "@chanlytics/contracts";
import { dashboardOrigin } from "../shared/dashboard-origin.js";
import { sendOpsMail, reachesTenant, type NotifyPorts } from "../shared/alerts/notify.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";
import { logger, errField } from "../shared/log.js";
import { findLeadSearchName, findRoundToTell } from "@chanlytics/db/leads";
import { findWorkspaceSlug } from "@chanlytics/db/workspace";

type Db = SupabaseClient<Database>;

export async function tellLeadQuestion(
  db: Db,
  roundId: string,
  ports: Pick<NotifyPorts, "send"> = {},
): Promise<boolean> {
  try {
    const { data: r, error: rErr } = await findRoundToTell(db, roundId);
    if (rErr) throw new Error(`cannot read the round: ${rErr.message}`);
    const query = r?.question as { sentence?: unknown } | null | undefined;
    // Answered, stopped or ended since: there is nothing left to ask.
    if (!r || r.state !== "waiting_on_owner" || typeof query?.sentence !== "string") return false;
    const target = { tenantId: r.tenant_id, ...(await loadTenantNotifications(db, r.tenant_id)) };
    if (!reachesTenant(target)) return false;
    const [searchRead, tenantRead] = await Promise.all([
      findLeadSearchName(db, r.tenant_id, r.search_id),
      findWorkspaceSlug(db, r.tenant_id),
    ]);
    // A mail with a link to no workspace is no question asked: the round waits, and its next tell tries again.
    if (searchRead.error) throw new Error(`cannot read the search: ${searchRead.error.message}`);
    if (tenantRead.error) throw new Error(`cannot read the workspace: ${tenantRead.error.message}`);
    const search = searchRead.data;
    const workspace = tenantRead.data;
    const words = leadQuestionMail({
      name: search?.name ?? "leads",
      sentence: query.sentence,
      // The one writer of a link to a page of the workspace (contracts appLink), as every other mail's.
      link: `${dashboardOrigin()}${appLink(workspace?.slug, leadQuestionRoute(r.search_id))}`,
    });
    // Its kind, so the business's choice holds (decision 0040): a question it turned off by email is on the bell alone.
    return await sendOpsMail(target, { ...words, kind: "leads_question" }, ports);
  } catch (e) {
    logger().error("lead_tell_failed", { round: roundId, error: errField(e) });
    return false;
  }
}
