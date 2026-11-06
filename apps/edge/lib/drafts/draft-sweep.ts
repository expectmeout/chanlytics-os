/**
 * The drafts sweep (decision 0093): what a dropped event, a run that died or a change of the rules left behind. The route is
 * api/cron/drafts.ts, which pg_cron asks every five minutes while a hold is open (00538 trigger_drafts_sweep).
 *
 * The hold's own events ask for a draft within seconds, and this is what makes "a draft is there" true without them: a list
 * of the holds whose draft is owed another look (00538 reply_drafts_due), each asked the one question and scheduled by the
 * one claim, so a thread the event already reached takes nothing here, and a bump of the rules' edition redrafts every open
 * hold within a tick of it.
 */
import { MIN_MS, REPLY_DRAFT_RULES } from "@chanlytics/contracts";
import { replyDraftsDue } from "@chanlytics/db";
import { askReplyDraftOf } from "@chanlytics/jobs";
import { json } from "../shared/http.js";
import { errField } from "../shared/log.js";
import type { SweepTick } from "../ops/sweep-door.js";

/** How many threads one tick asks about: past them, the next tick's five minutes. */
const DRAFTS_A_TICK = 50;
/** How old a claim is before its run is taken to have died: past the job's tries and the ledger's lease. */
const CLAIM_DIES_AFTER_MS = 5 * MIN_MS;

export async function sweepDrafts({ db, L, started }: SweepTick): Promise<Response> {
  const due = await replyDraftsDue(db, REPLY_DRAFT_RULES, DRAFTS_A_TICK);
  const now = new Date(started);
  const staleBefore = new Date(started - CLAIM_DIES_AFTER_MS);
  const counts = { asked: 0, kept: 0, not_owed: 0, gone: 0, failed: 0 };
  for (const { tenantId, conversationId } of due) {
    try {
      const said = await askReplyDraftOf(db, tenantId, conversationId, { now, again: true, staleBefore });
      counts[said] += 1;
    } catch (e) {
      counts.failed += 1;
      L.error("drafts_sweep_ask_failed", { tenant_id: tenantId, conversation: conversationId, error: errField(e) });
    }
  }
  L.info("drafts_sweep", { due: due.length, ...counts, ms: Date.now() - started });
  return json(200, { ok: true, due: due.length, ...counts });
}
