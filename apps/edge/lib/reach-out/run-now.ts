/**
 * POST /api/admin/playbooks-run -- one playbook, run now, because a person pressed Run (or Start, on a reach-out).
 *
 * The door is api/admin/playbooks-run.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this
 * the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * Body { tenant_id, playbook_id, user_id }, read through admin-door.ts: a body that is not a JSON object is an empty
 * one, and the 400 below answers it. The dashboard proved who is asking; this door reads the workspace's own playbook
 * by id (another workspace's is a 404) and takes one of two paths, by its kind.
 *
 *   A reach-out's root (kind reach_out, trigger lead_first) runs its first step through the playbooks sweep's own step
 *   runner, lib/reach-out/run-step.ts, and answers the outcome with its reason (billing, never, no_mailbox, no_room,
 *   nobody, waiting_for_you, ...), the run it planned and the day it is for. A later step of a chain runs on its day
 *   only, so a step that is not a root is a 409 (reach_out_step).
 *
 *   Any other playbook runs through lib/playbooks.ts, the implementation the hourly sweep uses, as a person's decision:
 *   it sends now, at nine if now is outside the hours a send may go out in, the ledger names them, and the step's words
 *   are theirs from then on (decision 0064). One run per local day, so a playbook that already ran today answers that
 *   in its outcome.
 *
 * A run that failed is a 500 with its reason in `detail`; one that was decided (sent, held, empty or off) is a 200. A
 * paused workspace is a 402 `payment_required` with the words for it: nothing is sent from one, so nothing is run in it.
 */
import { json, refuse } from "../http.js";
import { personFor, workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { CONTEXT_PAUSED, loadTenantRunContext, runPlaybook, type PlaybookRow } from "../playbooks.js";
import { logger } from "../log.js";
import { runReachOutStep } from "./run-step.js";
import { sequenceModesOf, workspaceZoneOf } from "../packages/db.js";
import type { ReachOutRow } from "./run-context.js";
import { UUID, CAMPAIGNS_PAUSED_WORDS, DEFAULT_TIMEZONE } from "../packages/contracts.js";

export async function runPlaybookNow(
  auth: Admitted,
  body: Partial<{
    tenant_id?: unknown;
    playbook_id?: unknown;
    user_id?: unknown;
  }>,
): Promise<Response> {
  const L = logger();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  body.user_id = personFor(auth, body.user_id) ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  const playbookId = typeof body.playbook_id === "string" ? body.playbook_id : "";
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!UUID.test(tenantId) || !UUID.test(playbookId) || !UUID.test(userId)) return refuse(400, "bad_request");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  const { data: p, error } = await db
    .from("sequence_steps")
    .select("*")
    .eq("id", playbookId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return refuse(500, "read_failed", error.message);
  if (!p) return refuse(404, "not_found");
  // A reach-out's root runs its first step now through the sweep's own step runner (Part 4, R13): the sheet's Start.
  // Its answer says what happened, with its reason (R14); a later step runs on its day only.
  if ((p as { kind?: string }).kind === "reach_out") {
    const row = p as ReachOutRow;
    if (row.trigger !== "lead_first") return refuse(409, "reach_out_step");
    const tz = (await workspaceZoneOf(db, tenantId).catch(() => null)) || DEFAULT_TIMEZONE;
    const r = await runReachOutStep(db, row, new Date(), tz, L);
    L.info("reach_out_run_now", {
      tenant_id: tenantId,
      playbook_id: playbookId,
      user_id: userId,
      outcome: r.outcome,
      reason: r.reason,
      planned: r.planned,
      run_id: r.runId,
    });
    if (r.outcome === "failed") return refuse(500, "run_failed", r.reason);
    return json(200, {
      ok: true,
      outcome: r.outcome,
      reason: r.reason ?? null,
      planned: r.planned,
      run_id: r.runId,
      run_for: r.runFor,
    });
  }

  // Its sequence's mode, as the sweep's due steps carry it (decision 0064): what the run's line in the ledger records.
  // Unreadable is this run's failure, never a guess on the record.
  const step = p as PlaybookRow & { sequence_id: string };
  let mode: string | undefined;
  try {
    mode = (await sequenceModesOf(db, tenantId, [step.sequence_id])).get(step.sequence_id);
  } catch (e) {
    return refuse(500, "read_failed", e instanceof Error ? e.message : String(e));
  }
  const ctx = await loadTenantRunContext(db, tenantId, new Date());
  // A paused workspace is a refusal a person can act on (Billing), not a failure to read the workspace: 402, as Ask and
  // the voice doors answer a paused one.
  if ("error" in ctx && ctx.error === CONTEXT_PAUSED) return refuse(402, "payment_required", CAMPAIGNS_PAUSED_WORDS);
  if ("error" in ctx) return refuse(500, "context_failed", ctx.error);
  const r = await runPlaybook(ctx, { ...step, mode }, { by: { kind: "user", userId } });
  if (r.outcome === "failed") return refuse(500, "run_failed", r.error);
  L.info("playbook_run_now", { tenant_id: tenantId, playbook_id: playbookId, outcome: r.outcome });
  return json(200, { ok: true, ...r });
}
