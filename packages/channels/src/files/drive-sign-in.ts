/**
 * The sign-in a business connects its Google Drive with (the footage sources plan, D17): the way to Google's consent
 * screen and the code's exchange. Pure, so the tests run it without a network; the edge makes each request.
 *
 * It asks for Drive, read only, and who the account is, and nothing else. No scope an earlier consent gave another
 * sign-in is folded in (`include_granted_scopes=false`), so this key opens Drive alone, as the mailbox's key opens the
 * mailbox alone and the Business Profile's the profile: each Google key opens one door. `drive.readonly` is a
 * restricted scope: Google's review and its security assessment cover it, with Gmail's.
 */
import { GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, type OAuthClient } from "../google/oauth";
import type { PlacesRequest } from "../google/places";

/** Drive, read only: every file the account can open, and nothing written. */
export const DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** What the sign-in asks for: who the account is (its id and its email), and Drive, read only. */
export const DRIVE_SCOPES = ["openid", "email", DRIVE_READ_SCOPE] as const;

/**
 * Google's consent screen, asked for this connection's grant: offline access and consent every time (Google hands a
 * refresh token on a first consent only, and a reconnect is a first consent on purpose), nothing granted before folded
 * in, and PKCE's challenge where one is given.
 */
export function driveAuthorizeUrl(
  cfg: Pick<OAuthClient, "clientId" | "redirectUri">,
  state: string,
  opts: { loginHint: string | null; challenge: string | null },
): string {
  const query = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  if (opts.challenge) {
    query.set("code_challenge", opts.challenge);
    query.set("code_challenge_method", "S256");
  }
  if (opts.loginHint) query.set("login_hint", opts.loginHint);
  return `${GOOGLE_AUTH_URL}?${query.toString()}`;
}

/** The code's exchange, with PKCE's verifier where the consent was asked with its challenge. */
export function driveTokenRequest(cfg: OAuthClient, code: string, verifier: string | null): PlacesRequest {
  return {
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      ...(verifier ? { code_verifier: verifier } : {}),
    }).toString(),
  };
}
