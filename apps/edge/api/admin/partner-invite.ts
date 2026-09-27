/**
 * POST /api/admin/partner-invite — a workspace's owner asked a partner to join it (decision 0018): this tells the
 * partner, by email, which workspace and where to answer.
 *
 * The dashboard's team route calls it after partner_invite, from production only, and treats a failure as a shrug
 * the owner is told of: the invitation is on record, the partner's pane shows it, and it can be asked again. The
 * address is the partner's own account's, read here, never one the call carries, so this door writes to nobody but
 * the partner the workspace named. Every sentence is contracts' (partnerInviteEmail). Diagnostic-key only; the
 * address is never logged.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { platformFrom, post } from "../../lib/ops/notify.js";
import { logger, errField } from "../../lib/log.js";
import { dashboardOrigin } from "../../lib/dashboard-origin.js";
import { getPartnerInviteMail } from "../../lib/packages/db.js";
import { partnerInviteEmail } from "../../lib/packages/contracts.js";

const L = logger();

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/partner-invite");
  if (!auth.ok) return auth.response;
  const from = platformFrom();
  if (!from) return json(503, { ok: false, error: "no_sender" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });

  let body: { tenant_id?: string } = {};
  try {
    body = JSON.parse(await request.text());
  } catch {
    /* validated below */
  }
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = typeof ws.tenantId === "string" ? ws.tenantId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return json(400, { ok: false, error: "tenant_id is required" });

  let invite;
  try {
    invite = await getPartnerInviteMail(db, tenantId);
  } catch (e) {
    return json(503, { ok: false, error: errField(e) });
  }
  // Answered, taken back, expired or never asked: there is nobody waiting to be told.
  if (!invite) return json(404, { ok: false, error: "no_open_invitation" });

  const message = partnerInviteEmail({
    workspace: invite.workspace,
    expiresAt: invite.expiresAt,
    signInUrl: `${dashboardOrigin()}/login?email=${encodeURIComponent(invite.email)}`,
  });
  const sent = await post(from, [invite.email], message.subject, message.body);
  L.info("partner_invite_sent", { tenant: tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, sent });
}
