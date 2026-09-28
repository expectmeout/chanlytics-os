/**
 * Google OAuth for a web server, pinned to the documented shapes.
 *
 * The owner signs in to Google once; what comes back is a refresh token
 * that the edge keeps in Vault and trades for an hour's access token when
 * it needs one. `access_type=offline` and `prompt=consent` are what make
 * Google return the refresh token, and it does so on the first
 * authorization only — a reconnect goes through consent again on purpose.
 *
 * The state is the CSRF proof: the workspace, the person and a nonce,
 * signed with a secret the dashboard holds, checked on the way back before
 * the code is trusted. Everything here is pure or Web Crypto, so the tests
 * run it without a network.
 */
import type { PlacesRequest } from "./google-places";
import { MIN_MS, utf8Encoder } from "@chanlytics/contracts";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Business Profile, plus the email so the card can say whose account it is. */
export const PROFILE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/business.manage"] as const;
/** How long the way to Google and back may take. */
export const STATE_TTL_MS = 10 * MIN_MS;

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
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: PROFILE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  if (loginHint) q.set("login_hint", loginHint);
  return `${GOOGLE_AUTH_URL}?${q.toString()}`;
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
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const access = typeof o.access_token === "string" ? o.access_token : "";
  if (!access)
    throw new Error(
      typeof o.error === "string"
        ? `${o.error}${typeof o.error_description === "string" ? `: ${o.error_description}` : ""}`
        : "Google answered without a token",
    );
  return {
    access_token: access,
    refresh_token: typeof o.refresh_token === "string" && o.refresh_token ? o.refresh_token : null,
    expires_in: typeof o.expires_in === "number" ? o.expires_in : 3600,
    scope: typeof o.scope === "string" ? o.scope : "",
    id_token: typeof o.id_token === "string" ? o.id_token : null,
  };
}

/** The grant's scopes, one by one, so a missing one can be named. */
export function grantHasScope(grant: Pick<TokenGrant, "scope">, scope: string): boolean {
  return grant.scope.split(/\s+/).includes(scope);
}

/* ------------------------------------------------------------ base64url */

const dec = new TextDecoder();

export function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? utf8Encoder.encode(bytes) : bytes;
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The id token's claims, read without verification: it arrived in the token
 * endpoint's own answer over TLS, so its issuer is not in question, and the
 * one claim read from it — the email — is shown on a card, never trusted for
 * access. A malformed token yields nothing.
 */
export function idTokenClaims(idToken: string | null | undefined): { email: string | null; sub: string | null } {
  try {
    const parts = (idToken ?? "").split(".");
    if (parts.length < 2) return { email: null, sub: null };
    const c = JSON.parse(dec.decode(unb64url(parts[1]))) as Record<string, unknown>;
    return { email: typeof c.email === "string" ? c.email : null, sub: typeof c.sub === "string" ? c.sub : null };
  } catch {
    return { email: null, sub: null };
  }
}

/* --------------------------------------------------------------- state */

export interface OAuthState {
  /** The workspace. */
  t: string;
  /** The person. */
  u: string;
  /** A nonce. */
  n: string;
  /** Expiry, epoch ms. */
  exp: number;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    utf8Encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, utf8Encoder.encode(data));
  return b64url(new Uint8Array(sig));
}

export async function signState(secret: string, s: OAuthState): Promise<string> {
  const payload = b64url(JSON.stringify(s));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** The state back from Google: its signature, its expiry, then its claims — or the reason it is refused. */
export async function verifyState(
  secret: string,
  state: string | null | undefined,
  nowMs: number,
): Promise<{ ok: true; state: OAuthState } | { ok: false; reason: "missing" | "malformed" | "signature" | "expired" }> {
  if (!state) return { ok: false, reason: "missing" };
  const [payload, sig, ...rest] = state.split(".");
  if (!payload || !sig || rest.length) return { ok: false, reason: "malformed" };
  const expected = await hmac(secret, payload);
  if (expected.length !== sig.length || !timingSafeEqualStr(expected, sig)) return { ok: false, reason: "signature" };
  let s: OAuthState;
  try {
    s = JSON.parse(dec.decode(unb64url(payload))) as OAuthState;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof s.t !== "string" || typeof s.u !== "string" || typeof s.n !== "string" || typeof s.exp !== "number")
    return { ok: false, reason: "malformed" };
  if (s.exp < nowMs) return { ok: false, reason: "expired" };
  return { ok: true, state: s };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b64url(b);
}
