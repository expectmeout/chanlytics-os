/**
 * What the three live-call doors (whisper, stop-call, hand-over) ask before they speak to the provider: whose call is
 * this.
 *
 * The doors act on the body's `call_id` through the provider's key, which answers for every workspace's calls, and the
 * tokens that opened them named no workspace (defect 25): a dashboard session that could reach one door could speak
 * into any call whose id it had. The dashboard now names the workspace and the person in the token (its route proved
 * the call is the member's under RLS), and the door proves it again with the service role, through the workspace's own
 * rows (packages/db tenantDb): a call of another workspace, or one the database does not know, is not found.
 *
 * A knock that names no workspace is refused before the call is looked up or the provider is asked (25 Oct 2026): a
 * token about none, a blank one or one that is not a workspace's id, and the platform's key on an edge without the
 * secret (a preview), which names none either. Each used to go on to the provider for any call id, unchecked, so a
 * leaked secret could end, whisper into or hand over any workspace's call. It is the credential's fault, answered as
 * line codes answer it (400 bad_tenant), never the read's. A dashboard that signs always names the call's workspace; a
 * rehearsal pair (EDGE_PROVIDERS=live) holding only DIAG_KEY is refused here and must hold EDGE_CALL_SECRET on both
 * projects. No script or operator's command knocks on these doors. A platform road, should one be wanted, is a token
 * that names its own scope, never no scope.
 */
import { refuse } from "../http.js";
import { pg } from "../pg.js";
import { logger } from "../log.js";
import { isWorkspaceCall } from "../packages/db.js";
import { UUID } from "../packages/contracts.js";
import { tokenWorkspace, type Admitted } from "../admin-auth.js";

/** Whether this door may act on this call for the token's workspace: an answer to return, or null to go on. */
export async function refusedCall(auth: Admitted, aud: string, callId: string): Promise<Response | null> {
  const workspace = tokenWorkspace(auth);
  if (!workspace || !UUID.test(workspace)) {
    logger().warn("live_call_unbound_refused", { door: aud, via: auth.via, call_id: callId });
    return refuse(
      400,
      "bad_tenant",
      "this door acts only for a workspace its credential names, and this one names none",
    );
  }
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const mine = await isWorkspaceCall(db, workspace, callId);
  if (mine === null) return refuse(503, "read_failed", "the call could not be read");
  if (!mine) return refuse(404, "not_found", "no such call in this workspace");
  return null;
}
