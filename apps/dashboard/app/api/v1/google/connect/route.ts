import { read, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { authorizeUrl, newNonce, signState, STATE_TTL_MS } from "@chanlytics/channels";
import { googleReadiness, stateSecret } from "@/server/google";

/**
 * GET /api/v1/google/connect — the way to Google: a signed state naming the
 * workspace and the person, then Google's consent screen. Owners only. The
 * browser follows the redirect; the callback proves the state before
 * trusting anything that comes back with it.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  handle: async ({ ctx, member }) => {
    const ready = await googleReadiness();
    const secret = stateSecret();
    if (!ready.profile || !ready.oauth || !secret)
      throw new AppError("conflict", "Connecting a Business Profile is not available here yet.", 409);
    const state = await signState(secret, {
      t: member.tenantId,
      u: ctx.userId,
      n: newNonce(),
      exp: Date.now() + STATE_TTL_MS,
    });
    const url = authorizeUrl(
      { clientId: ready.oauth.client_id, redirectUri: ready.oauth.redirect_uri },
      state,
      ctx.email ?? null,
    );
    return new Response(null, { status: 302, headers: { location: url } });
  },
});
