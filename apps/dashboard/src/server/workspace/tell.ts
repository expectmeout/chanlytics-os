import "server-only";
import { deployment } from "../deployment";
import { edgeConfigured, edgeHeaders, edgeUrl } from "../edge";

/** A note to the platform mailbox gives up after this; a failure is logged, not surfaced. */
const TELL_TIMEOUT_MS = 8000;

/**
 * Tell the platform mailbox that a workspace asked a person at Chanlytics
 * for something (a line, until lines provision themselves). The database
 * has already recorded the ask; this is the email Postgres cannot send.
 * Production only, never throws: a failure here is logged, not surfaced.
 */
export async function tellPlatformOfSetupRequest(tenantId: string, what: string, by: string | null): Promise<boolean> {
  if (!deployment.providersLive || !edgeConfigured()) return false;
  try {
    const r = await fetch(`${edgeUrl()}/api/admin/setup-request`, {
      method: "POST",
      headers: edgeHeaders("/api/admin/setup-request", { workspace: tenantId }),
      body: JSON.stringify({ tenant_id: tenantId, what, by }),
      signal: AbortSignal.timeout(TELL_TIMEOUT_MS),
    });
    if (!r.ok) console.error("setup_request_tell_failed", JSON.stringify({ tenant: tenantId, what, status: r.status }));
    return r.ok;
  } catch (e) {
    console.error(
      "setup_request_tell_failed",
      JSON.stringify({ tenant: tenantId, what, error: e instanceof Error ? e.message : String(e) }),
    );
    return false;
  }
}

/**
 * Email the owner that the receptionist is answering (the first run's "you're live" email, decision 4): the edge
 * composes and sends it to the workspace's alert addresses. Called once, on the first activation of calls. Production
 * only, never throws: the activation is already on record, and a failure here is logged, not surfaced.
 */
export async function tellOwnerLive(tenantId: string): Promise<boolean> {
  if (!deployment.providersLive || !edgeConfigured()) return false;
  try {
    const r = await fetch(`${edgeUrl()}/api/admin/you-are-live`, {
      method: "POST",
      headers: edgeHeaders("/api/admin/you-are-live", { workspace: tenantId }),
      body: JSON.stringify({ tenant_id: tenantId }),
      signal: AbortSignal.timeout(TELL_TIMEOUT_MS),
    });
    if (!r.ok) console.error("you_are_live_tell_failed", JSON.stringify({ tenant: tenantId, status: r.status }));
    return r.ok;
  } catch (e) {
    console.error(
      "you_are_live_tell_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return false;
  }
}
