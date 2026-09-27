import "server-only";
import { deployment } from "../deployment";
import { edgeConfigured, edgeHeaders, edgeUrl } from "../edge";

/** How long the edge is given to write to the partner before the owner is told it did not go. */
const PARTNER_MAIL_TIMEOUT_MS = 8000;

/**
 * An existing workspace asks a partner to join it (decision 0018): the half the database cannot do, which is telling
 * the partner. A partner always has an account, so the edge writes to it (partner-invite), by the address on that
 * account, never one the owner typed. Never throws: the invitation is on record, the partner's pane shows it, and a
 * send that failed can be asked again.
 */
export async function sendPartnerInvite(
  tenantId: string,
  ports: { fetch?: typeof fetch; live?: boolean } = {},
): Promise<boolean> {
  if (!(ports.live ?? deployment.providersLive) || !edgeConfigured()) return false;
  try {
    const r = await (ports.fetch ?? fetch)(`${edgeUrl()}/api/admin/partner-invite`, {
      method: "POST",
      headers: edgeHeaders("/api/admin/partner-invite", { workspace: tenantId }),
      body: JSON.stringify({ tenant_id: tenantId }),
      signal: AbortSignal.timeout(PARTNER_MAIL_TIMEOUT_MS),
    });
    if (!r.ok) console.error("partner_invite_failed", JSON.stringify({ tenant: tenantId, status: r.status }));
    return r.ok;
  } catch (e) {
    console.error(
      "partner_invite_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return false;
  }
}
