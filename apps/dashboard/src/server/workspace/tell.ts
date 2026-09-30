import "server-only";
import { deployment } from "../deployment";
import { callEdge, edgeAnswered, edgeConfigured } from "../edge";
import { log } from "@/server/log";

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
  const r = await callEdge(
    "/api/admin/setup-request",
    { tenant_id: tenantId, what, by },
    { workspace: tenantId, timeoutMs: TELL_TIMEOUT_MS },
  );
  if (!edgeAnswered(r))
    log.error("setup_request_tell_failed", { tenant_id: tenantId, what, status: r.status, error: r.body?.error });
  return edgeAnswered(r);
}

/**
 * Email the owner that the receptionist is answering (the first run's "you're live" email, decision 4): the edge
 * composes and sends it to the workspace's alert addresses. Called once, on the first activation of calls. Production
 * only, never throws: the activation is already on record, and a failure here is logged, not surfaced.
 */
export async function tellOwnerLive(tenantId: string): Promise<boolean> {
  if (!deployment.providersLive || !edgeConfigured()) return false;
  const r = await callEdge(
    "/api/admin/you-are-live",
    { tenant_id: tenantId },
    { workspace: tenantId, timeoutMs: TELL_TIMEOUT_MS },
  );
  if (!edgeAnswered(r))
    log.error("you_are_live_tell_failed", { tenant_id: tenantId, status: r.status, error: r.body?.error });
  return edgeAnswered(r);
}
