/**
 * POST /api/admin/playbooks-run — one playbook, run now, at a person's
 * request.
 *
 * Body { tenant_id, playbook_id, user_id }. The dashboard proved who is
 * asking; the run itself is lib/playbooks.ts, the same implementation the
 * hourly sweep uses. A person who asks has decided: the run sends now
 * unless the class is set to never -- at nine, if now is outside the hours a
 * send may go out in -- and the ledger names them. One run per local day, so
 * a playbook that already ran today says so.
 *
 * A reach-out's root (Part 4, R13) runs its first step now through the playbooks sweep's own step runner: the sheet's
 * Start. It answers the outcome with its reason (billing, never, no_domain, no_room, nobody, waiting_for_you, …), and
 * the run it planned. A later step of a chain runs on its day only (409).
 */
import { json, refuse } from "../../lib/http.js";
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { loadTenantRunContext, runPlaybook, type PlaybookRow } from "../../lib/playbooks.js";
import { logger } from "../../lib/log.js";
import { runReachOutStep } from "../../lib/reach-out/run-step.js";
import { tenantZoneOf } from "../../lib/packages/db.js";
import type { ReachOutRow } from "../../lib/reach-out/run-context.js";

const L = logger();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/playbooks-run");
  if (!auth.ok) return auth.response;
  const body = await readBody<{
    tenant_id?: unknown;
    playbook_id?: unknown;
    user_id?: unknown;
  }>(request);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
  const playbookId = typeof body.playbook_id === "string" ? body.playbook_id : "";
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!UUID.test(tenantId) || !UUID.test(playbookId) || !UUID.test(userId)) return refuse(400, "bad_request");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  const { data: p, error } = await db
    .from("playbooks")
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
    const tz = (await tenantZoneOf(db, tenantId)) || "America/New_York";
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

  const ctx = await loadTenantRunContext(db, tenantId, new Date());
  if ("error" in ctx) return refuse(500, "context_failed", ctx.error);
  const r = await runPlaybook(ctx, p as PlaybookRow, { by: { kind: "user", userId } });
  if (r.outcome === "failed") return refuse(500, "run_failed", r.error);
  L.info("playbook_run_now", { tenant_id: tenantId, playbook_id: playbookId, outcome: r.outcome });
  return json(200, { ok: true, ...r });
}
