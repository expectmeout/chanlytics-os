/**
 * POST /api/admin/playbooks-run — one playbook, run now, at a person's
 * request.
 *
 * Body { tenant_id, playbook_id, user_id }. The dashboard proved who is
 * asking; the run itself is lib/playbooks.ts, the same implementation the
 * hourly sweep uses. A person who asks has decided: the run sends now
 * unless the class is set to never, and the ledger names them. One run per
 * local day, so a playbook that already ran today says so.
 */
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { loadTenantRunContext, runPlaybook, type PlaybookRow } from "../../lib/playbooks.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const body = (await request.json().catch(() => null)) as { tenant_id?: unknown; playbook_id?: unknown; user_id?: unknown } | null;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : "";
  const playbookId = typeof body?.playbook_id === "string" ? body.playbook_id : "";
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  if (!UUID.test(tenantId) || !UUID.test(playbookId) || !UUID.test(userId)) return json(400, { ok: false, error: "bad_request" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_db" });

  const { data: p, error } = await db.from("playbooks").select("*").eq("id", playbookId).eq("tenant_id", tenantId).maybeSingle();
  if (error) return json(500, { ok: false, error: "read_failed", detail: error.message });
  if (!p) return json(404, { ok: false, error: "not_found" });

  const ctx = await loadTenantRunContext(db, tenantId, new Date());
  if ("error" in ctx) return json(500, { ok: false, error: "context_failed", detail: ctx.error });
  const r = await runPlaybook(ctx, p as PlaybookRow, { by: { kind: "user", userId } });
  if (r.outcome === "failed") return json(500, { ok: false, error: "run_failed", detail: r.error });
  console.log("playbook_run_now", JSON.stringify({ tenant_id: tenantId, playbook_id: playbookId, outcome: r.outcome }));
  return json(200, { ok: true, ...r });
}
