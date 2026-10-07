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
 * A key-authorised knock (a preview, which holds no secret) names no workspace and is let in as before; so is a token
 * from a dashboard deployed before this, while the EDGE_TOKEN_UNBOUND switch stands (admin-auth.ts tokenWorkspace).
 */
import { refuse } from "../http.js";
import { pg } from "../pg.js";
import { isWorkspaceCall } from "../packages/db.js";
import { tokenWorkspace, type Admitted } from "../admin-auth.js";

/** Whether this door may act on this call for the token's workspace: an answer to return, or null to go on. */
export async function refusedCall(auth: Admitted, aud: string, callId: string): Promise<Response | null> {
  const workspace = tokenWorkspace(auth, aud);
  if (!workspace) return null;
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const mine = await isWorkspaceCall(db, workspace, callId);
  if (mine === null) return refuse(503, "read_failed", "the call could not be read");
  if (!mine) return refuse(404, "not_found", "no such call in this workspace");
  return null;
}
