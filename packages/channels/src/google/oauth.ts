/**
 * Google OAuth for a web server, pinned to the documented shapes.
 *
 * The owner signs in to Google once; what comes back is a refresh token
 * that the edge keeps in Vault and trades for an hour's access token when
 * it needs one. `access_type=offline` and `prompt=consent` are what make
 * Google return the refresh token, and it does so on the first
 * authorization only — a reconnect goes through consent again on purpose.
 *
 * The state that rides the way out and back is the platform's own
 * (tokens/sign-in-state.ts), as every provider's sign-in uses it. Everything
 * here is pure, so the tests run it without a network.
 */
import { recordOrEmpty } from "@chanlytics/contracts";
import { unb64url } from "../shared/base64url";
import type { PlacesRequest } from "./places";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Business Profile, plus the email so the card can say whose account it is. */
export const PROFILE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"] as const;

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function authorizeUrl(
  cfg: Pick<OAuthClient, "clientId" | "redirectUri">,
  state: string,
  loginHint?: string | null,
): string {
  const query = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: PROFILE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    // The profile's token holds the profile's scope alone, whatever else this account gave the app (its mailbox, R18):
    // each connection is kept with only what it needs.
    include_granted_scopes: "false",
    state,
  });
  if (loginHint) query.set("login_hint", loginHint);
  return `${GOOGLE_AUTH_URL}?${query.toString()}`;
}

const form = (params: Record<string, string>): PlacesRequest["body"] => new URLSearchParams(params).toString();
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

export function tokenExchangeRequest(cfg: OAuthClient, code: string): PlacesRequest {
  return {
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: FORM,
    body: form({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  };
}

export function tokenRefreshRequest(
  cfg: Pick<OAuthClient, "clientId" | "clientSecret">,
  refreshToken: string,
): PlacesRequest {
  return {
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: FORM,
    body: form({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
  };
}

/** Either token may be revoked; revoking the refresh token ends the grant. */
export function revokeRequest(token: string): PlacesRequest {
  return { url: GOOGLE_REVOKE_URL, method: "POST", headers: FORM, body: form({ token }) };
}

export interface TokenGrant {
  access_token: string;
  /** Present on the first authorization (and whenever consent was forced). */
  refresh_token: string | null;
  expires_in: number;
  scope: string;
  id_token: string | null;
}

export function parseTokenResponse(json: unknown): TokenGrant {
  const value = json && typeof json === "object" ? recordOrEmpty(json) : {};
  const access = typeof value.access_token === "string" ? value.access_token : "";
  if (!access)
    throw new Error(
      typeof value.error === "string"
        ? `${value.error}${typeof value.error_description === "string" ? `: ${value.error_description}` : ""}`
        : "Google answered without a token",
    );
  return {
    access_token: access,
    refresh_token: typeof value.refresh_token === "string" && value.refresh_token ? value.refresh_token : null,
    expires_in: typeof value.expires_in === "number" ? value.expires_in : 3600,
    scope: typeof value.scope === "string" ? value.scope : "",
    id_token: typeof value.id_token === "string" ? value.id_token : null,
  };
}

/** The grant's scopes, one by one, so a missing one can be named. */
export function grantHasScope(grant: Pick<TokenGrant, "scope">, scope: string): boolean {
  return grant.scope.split(/\s+/).includes(scope);
}

/**
 * The id token's claims, read without verification: it arrived in the token
 * endpoint's own answer over TLS, so its issuer is not in question, and the
 * one claim read from it — the email — is shown on a card, never trusted for
 * access. A malformed token yields nothing.
 */
export function idTokenClaims(idToken: string | null | undefined): { email: string | null; sub: string | null } {
  try {
    const payload = (idToken ?? "").split(".")[1];
    if (payload === undefined) return { email: null, sub: null };
    const c = recordOrEmpty(JSON.parse(new TextDecoder().decode(unb64url(payload))));
    return { email: typeof c.email === "string" ? c.email : null, sub: typeof c.sub === "string" ? c.sub : null };
  } catch {
    return { email: null, sub: null };
  }
}
