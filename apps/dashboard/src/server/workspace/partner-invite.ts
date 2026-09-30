import "server-only";
import { deployment } from "../deployment";
import { callEdge, edgeAnswered, edgeConfigured } from "../edge";
import { log } from "@/server/log";

/** How long the edge is given to write to the partner before the owner is told it did not go. */
const PARTNER_MAIL_TIMEOUT_MS = 8000;

/**
 * An existing workspace asks a partner to join it (decision 0020): the half the database cannot do, which is telling
 * the partner. A partner always has an account, so the edge writes to it (partner-invite), by the address on that
 * account, never one the owner typed. Never throws: the invitation is on record, the partner's pane shows it, and a
 * send that failed can be asked again.
 */
export async function sendPartnerInvite(
  tenantId: string,
  ports: { fetch?: typeof fetch; live?: boolean } = {},
): Promise<boolean> {
  if (!(ports.live ?? deployment.providersLive) || !edgeConfigured()) return false;
  const r = await callEdge(
    "/api/admin/partner-invite",
    { tenant_id: tenantId },
    { workspace: tenantId, timeoutMs: PARTNER_MAIL_TIMEOUT_MS, fetch: ports.fetch },
  );
  if (!edgeAnswered(r))
    log.error("partner_invite_failed", { tenant_id: tenantId, status: r.status, error: r.body?.error });
  return edgeAnswered(r);
}
