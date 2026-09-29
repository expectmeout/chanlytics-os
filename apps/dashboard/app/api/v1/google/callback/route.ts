import { read, account } from "@/server/route";
import { memberContext } from "@/server/with-route";
import { ROLE_PERMS } from "@chanlytics/contracts";
import { verifyState } from "@chanlytics/channels";
import { afterGoogle, edgeGoogle, stateSecret } from "@/server/connections/google";
import { log } from "@/server/log";

/**
 * GET /api/v1/google/callback — back from Google with a code and the state.
 *
 * Nothing here is trusted until the state proves itself: signed with the
 * dashboard's key, unexpired, and naming the person who is signed in right
 * now. Then the code goes to the edge, which holds the client secret and
 * does the exchange. Every outcome is a redirect to Integrations with one
 * word the card reads once — the browser is a person's browser, not a
 * client that reads JSON.
 *
 * Declared as a read of the account: no workspace is resolved at the door,
 * because the signed state IS the credential here. It names the workspace
 * chosen at connect time, and this person's standing in it is judged below,
 * after the state has proved itself — its own door, in the order the proof
 * demands.
 */
export const GET = read({
  scope: account,
  handle: async ({ ctx, req }) => {
    const url = new URL(req.url);
    const origin = url.origin;
    const back = (outcome: string, why?: string) =>
      new Response(null, { status: 302, headers: { location: afterGoogle(origin, outcome, why) } });

    const refused = url.searchParams.get("error");
    if (refused) return back("error", refused === "access_denied" ? "declined" : refused.slice(0, 60));
    const secret = stateSecret();
    if (!secret) return back("error", "not_available");
    const proof = await verifyState(secret, url.searchParams.get("state"), Date.now());
    if (!proof.ok) return back("error", `state_${proof.reason}`);
    if (proof.state.u !== ctx.userId) return back("error", "someone_else");
    const code = url.searchParams.get("code") ?? "";
    if (!code) return back("error", "no_code");

    // The workspace named at connect time, and this person's standing in it now.
    let tenantId: string;
    try {
      const member = await memberContext(ctx, proof.state.t);
      // Whoever GET google/connect admitted (its policy: the partner rung and up), by the one table.
      if (!ROLE_PERMS[member.role]?.settings) return back("error", "not_owner");
      tenantId = member.tenantId;
    } catch {
      return back("error", "no_workspace");
    }

    const a = await edgeGoogle({ op: "connect", tenant_id: tenantId, user_id: ctx.userId, code }, 55_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true) {
      const reason = typeof b.error === "string" ? b.error : `edge_${a.status}`;
      log.error("google_connect_failed", {
        tenant: tenantId,
        reason,
        detail: typeof b.detail === "string" ? b.detail.slice(0, 200) : null,
      });
      return back("error", reason);
    }
    return back(b.pending === true ? "choose" : "connected");
  },
});
