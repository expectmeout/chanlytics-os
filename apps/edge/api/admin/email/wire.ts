/**
 * POST /api/admin/email/wire -- what this deployment's email wire can do. Signed admin token only; the dashboard asks it
 * before it offers email on a campaign (apps/dashboard/src/server/connections/email-readiness.ts).
 *
 *   { op: "status" }   -> { ok: true, ready, offers }
 *                          ready   whether a campaign's email can be sent from here at all: the deployment has a mail
 *                                  domain AND the provider's key (lib/email/email.ts emailCanSend)
 *                          offers  whether an OFFER by email can: the campaigns domain is named, and the provider says it is
 *                                  verified for sending (lib/email/campaigns-domain.ts, kept five minutes); false while it is
 *                                  not, null when the provider could not be asked, which is not an answer
 *
 * The key lives here and nowhere else, so the dashboard cannot know whether it is set: it asks, and this is the one
 * answer. A run on the edge reads the same functions (lib/playbooks.ts), so a page never offers email, or an offer by
 * email, that the run would then hold every person for. The answer is about the deployment, not a workspace: no workspace
 * is named. The business's address and the workspace's pause are the workspace's, read by whoever asks.
 */
import { json, refuse } from "../../../lib/http.js";
import { authorizeAdmin } from "../../../lib/admin-auth.js";
import { readBody } from "../../../lib/admin-door.js";
import { campaignsDomainVerified } from "../../../lib/email/campaigns-domain.js";
import { emailCanSend } from "../../../lib/email/email.js";
import { adminDoor } from "../../../lib/log.js";

interface EmailBody {
  op?: unknown;
}

export const POST = adminDoor(async function POST(request: Request): Promise<Response> {
  const auth = await authorizeAdmin(request, "/api/admin/email/wire");
  if (!auth.ok) return auth.response;
  const body = await readBody<EmailBody>(request);
  if (body.op === "status")
    return json(200, { ok: true, ready: emailCanSend(), offers: await campaignsDomainVerified() });
  return refuse(400, "unknown_op");
});
