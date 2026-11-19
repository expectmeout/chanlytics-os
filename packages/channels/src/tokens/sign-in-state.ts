/**
 * The state a sign-in at a provider leaves with and comes back with: the CSRF proof. The workspace, the person and a
 * nonce, signed with a secret the dashboard holds and good for ten minutes, checked on the way back before the code is
 * trusted. One helper for every provider a person signs in at (Google, a mailbox's, Instagram, Meta): each names itself in
 * the state, and each callback refuses another's.
 *
 * Pure or Web Crypto, so the tests run it without a network. It was Google's module's (google/oauth.ts) until an ad
 * account's sign-in became the fifth to use it (decision 0049, step P0b); what it signs and reads is unchanged, so a state
 * signed before a deploy proves itself after it.
 */
import { MIN_MS, utf8Bytes } from "@chanlytics/contracts";
import { b64url, unb64url } from "../shared/base64url";

/** How long the way to a provider and back may take. */
export const STATE_TTL_MS = 10 * MIN_MS;

const dec = new TextDecoder();

export interface OAuthState {
  /** The workspace. */
  t: string;
  /** The person. */
  u: string;
  /** A nonce. */
  n: string;
  /** Expiry, epoch ms. */
  exp: number;
  /** Which provider the sign-in is at: a mailbox's (decision 0056), Instagram, Meta; absent for Google Business Profile's. */
  p?: string;
  /** The mailbox being connected again, when it is a Reconnect: the account that comes back must be that one. */
  m?: string;
  /** 1 when the way out is a Microsoft admin's consent for their organisation, not a member's sign-in. */
  a?: number;
  /**
   * Where the owner comes back to, when it is not the connection's own Settings page: `start`, the first run that asked
   * (decision 0073: Where it answers' tiles, Your business's Connect Google).
   */
  b?: string;
  /** 1 when the consent was asked with PKCE's challenge: the way back sends its verifier (an edge that passes it on). */
  k?: number;
  /** What the owner chose of a new mailbox's history (decision 0086): `from_now`, its six months not brought in. */
  h?: string;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8Bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, utf8Bytes(data));
  return b64url(new Uint8Array(sig));
}

export async function signState(secret: string, oAuthState: OAuthState): Promise<string> {
  const payload = b64url(JSON.stringify(oAuthState));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** The state back from a provider: its signature, its expiry, then its claims — or the reason it is refused. */
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
  let oAuthState: OAuthState;
  try {
    oAuthState = JSON.parse(dec.decode(unb64url(payload))) as OAuthState;
  } catch {
    // Not JSON: nothing to read.
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof oAuthState.t !== "string" ||
    typeof oAuthState.u !== "string" ||
    typeof oAuthState.n !== "string" ||
    typeof oAuthState.exp !== "number"
  )
    return { ok: false, reason: "malformed" };
  if (oAuthState.exp < nowMs) return { ok: false, reason: "expired" };
  return { ok: true, state: oAuthState };
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

/**
 * A state for one provider's sign-in: the workspace, the person signed in, a nonce and ten minutes, naming the provider
 * so no other provider's callback takes it.
 */
export function signInStateFor(
  secret: string,
  signIn: { tenantId: string; userId: string; provider: string },
  nowMs: number,
): Promise<string> {
  return signState(secret, {
    t: signIn.tenantId,
    u: signIn.userId,
    n: newNonce(),
    exp: nowMs + STATE_TTL_MS,
    p: signIn.provider,
  });
}

/**
 * A state that came back to one provider's callback, proved: signed with this secret, unexpired, naming that provider,
 * and naming the person signed in now. What it gives is the workspace it was made for; nothing of a sign-in is trusted
 * before this. A state made for another provider is `malformed`, as one that is no state at all.
 */
export async function provenSignInState(
  secret: string,
  state: string | null | undefined,
  expected: { provider: string; userId: string },
  nowMs: number,
): Promise<
  | { ok: true; tenantId: string }
  | { ok: false; reason: "missing" | "malformed" | "signature" | "expired" | "someone_else" }
> {
  const proof = await verifyState(secret, state, nowMs);
  if (!proof.ok) return proof;
  if (proof.state.p !== expected.provider) return { ok: false, reason: "malformed" };
  if (proof.state.u !== expected.userId) return { ok: false, reason: "someone_else" };
  return { ok: true, tenantId: proof.state.t };
}
