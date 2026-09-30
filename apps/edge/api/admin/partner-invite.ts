/**
 * POST /api/admin/partner-invite — a workspace's owner asked a partner to join it (decision 0020): this tells the
 * partner, by email, which workspace and where to answer.
 *
 * The dashboard's team route calls it after partner_invite, from production only, and treats a failure as a shrug
 * the owner is told of: the invitation is on record, the partner's pane shows it, and it can be asked again. The
 * address is the partner's own account's, read here, never one the call carries, so this door writes to nobody but
 * the partner the workspace named. Every sentence is contracts' (partnerInviteEmail). Signed admin token only; the
 * address is never logged. The body, the workspace and the refusals around it are admin-door.ts's.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { errorMessage, readBody, workspaceOf } from "../../lib/admin-door.js";
import { platformFrom, post } from "../../lib/ops/notify.js";
import { logger } from "../../lib/log.js";
import { dashboardOrigin } from "../../lib/dashboard-origin.js";
import { getPartnerInviteMail } from "../../lib/packages/db.js";
import { partnerInviteEmail } from "../../lib/packages/contracts.js";

const L = logger();

export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/partner-invite");
  if (!auth.ok) return auth.response;
  const from = platformFrom();
  if (!from) return json(503, { ok: false, error: "no_sender" });
  const body = await readBody<{ tenant_id: string }>(request);
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
  L.info("partner_invite_sent", { tenant: at.tenantId, sent });
  return json(sent ? 200 : 502, { ok: sent, sent });
}
