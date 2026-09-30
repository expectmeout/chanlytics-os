/**
 * POST /api/admin/handover-invite — a partner set a workspace up for a business (decision 0016), and its owner already
 * has an account, so the platform's own invitation (which only a new address gets) will not reach them: this writes
 * to them instead.
 *
 * The dashboard's partner routes call it after create_workspace_for_business or partner_handover_resend, from
 * production only, and treat a failure as a shrug the partner is told of: the handover is on record and can be sent
 * again. The address is the one the handover holds, read here, never one the call carries, so this door writes to
 * nobody but the person the workspace waits for. Every sentence is contracts' (handoverInviteEmail). Signed admin token
 * only; the address is never logged.
 */
import { json } from "../../lib/http.js";
import { readBody } from "../../lib/admin-door.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { platformFrom, post } from "../../lib/ops/notify.js";
import { logger, errField } from "../../lib/log.js";
import { dashboardOrigin } from "../../lib/dashboard-origin.js";
import { getHandoverInvite } from "../../lib/packages/db.js";
import { handoverInviteEmail } from "../../lib/packages/contracts.js";

const L = logger();

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/handover-invite");
  if (!auth.ok) return auth.response;
  const from = platformFrom();
  if (!from) return json(503, { ok: false, error: "no_sender" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  const body = await readBody<{ tenant_id?: string }>(request);
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = typeof ws.tenantId === "string" ? ws.tenantId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId))
    return json(400, { ok: false, error: "bad_tenant", detail: "tenant_id is required" });

  let invite;
  try {
    invite = await getHandoverInvite(db, tenantId);
  } catch (e) {
    return json(503, { ok: false, error: "read_failed", detail: errField(e) });
  }
  // Accepted, declined, expired or never handed over: there is nobody waiting to be told.
  if (!invite) return json(404, { ok: false, error: "no_open_handover" });

  const message = handoverInviteEmail({
    partnerCode: invite.partnerCode,
    workspace: invite.workspace,
    expiresAt: invite.expiresAt,
    signInUrl: `${dashboardOrigin()}/login?email=${encodeURIComponent(invite.email)}`,
  });
  const sent = await post(from, [invite.email], message.subject, message.body);
  L.info("handover_invite_sent", { tenant: tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, sent });
}
