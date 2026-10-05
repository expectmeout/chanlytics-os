/**
 * POST /api/admin/partner-invite — a workspace's owner asked a partner to join it (decision 0020): this tells the
 * partner, by email, which workspace and where to answer.
 *
 * The door is api/admin/partner-invite.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands this
 * the knock (`auth`) and what the body carried; everything after is here, in the order the door had it.
 *
 * The dashboard's team route calls it after partner_invite, from production only, and treats a failure as a shrug
 * the owner is told of: the invitation is on record, the partner's pane shows it, and it can be asked again. The
 * address is the partner's own account's, read here, never one the call carries, so this door writes to nobody but
 * the partner the workspace named. Every sentence is contracts' (partnerInviteEmail). Signed admin token only; the
 * address is never logged. The body, the workspace and the refusals around it are admin-door.ts's.
 */
import { json } from "../http.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";
import { errorMessage, workspaceOf } from "../admin-door.js";
import { platformFrom, post } from "../ops/notify.js";
import { logger } from "../log.js";
import { dashboardOrigin } from "../dashboard-origin.js";
import { getPartnerInviteMail } from "../packages/db.js";
import { partnerInviteEmail } from "../packages/contracts.js";

export async function sendPartnerInvite(auth: Admitted, body: Partial<{ tenant_id: string }>): Promise<Response> {
  const L = logger();
  const from = platformFrom();
  if (!from) return json(503, { ok: false, error: "no_sender" });
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const at = workspaceOf(ws.tenantId);
  if (!at.ok) return at.response;

  let invite;
  try {
    invite = await getPartnerInviteMail(at.db, at.tenantId);
  } catch (e) {
    return json(503, { ok: false, error: "read_failed", detail: errorMessage(e) });
  }
  // Answered, taken back, expired or never asked: there is nobody waiting to be told.
  if (!invite) return json(404, { ok: false, error: "no_open_invitation" });

  const message = partnerInviteEmail({
    workspace: invite.workspace,
    expiresAt: invite.expiresAt,
    signInUrl: `${dashboardOrigin()}/login?email=${encodeURIComponent(invite.email)}`,
  });
  const sent = await post(from, [invite.email], message.subject, message.body);
  L.info("partner_invite_sent", { tenant_id: at.tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, sent });
}
