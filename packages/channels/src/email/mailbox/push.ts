/**
 * What a mailbox's provider pushes when it changed (decision 0056), read: Gmail's, through a Pub/Sub push subscription
 * whose requests carry a Google-signed OIDC token (RS256, checked against Google's published keys, for the audience the
 * subscription was made with); Graph's, a list of notifications each carrying the clientState the subscription was made
 * with, and the validation token Graph sends once to prove the address answers. Nothing here trusts a body before its
 * signature or its clientState is checked; what a push says is only "read this mailbox now": the sync reads the rest.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { HOUR_MS, listOrEmpty, recordOrEmpty, recordOrNull, valueAt } from "@chanlytics/contracts";
import { fetchFromProvider } from "../../shared/provider-fetch";
import { unb64url } from "../../google/oauth";

type Deps = Parameters<typeof fetchFromProvider>[3];

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
/** How long Google's keys are kept when its answer names no max-age. */
const KEYS_KEPT_MS = HOUR_MS;
/** Each try of a read of Google's keys. */
const CERTS_READ_MS = 5_000;
/** The clock's slack on a token's times. */
const SKEW_S = 300;

type Jwk = JsonWebKey & { kid: string };

/** A key as Google lists one: named, and of a kind; the rest is the platform's to refuse when the key is imported. */
const isJwk = (k: unknown): k is Jwk => typeof valueAt(k, "kid") === "string" && typeof valueAt(k, "kty") === "string";
let keys: { at: number; until: number; byKid: Map<string, Jwk> } | null = null;

const utf8 = new TextDecoder();
const enc = new TextEncoder();

async function googleKeys(now: number, deps?: Deps, fresh = false): Promise<Map<string, Jwk> | null> {
  if (!fresh && keys && keys.until > now) return keys.byKid;
  const fromProvider = await fetchFromProvider(
    "google",
    GOOGLE_CERTS,
    { timeoutMs: CERTS_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  const list = valueAt(fromProvider.json, "keys");
  if (fromProvider.outcome !== "ok" || !Array.isArray(list)) return keys?.byKid ?? null;
  const maxAge = Number(/max-age=(\d+)/.exec(fromProvider.headers?.get("cache-control") ?? "")?.[1]);
  const byKid = new Map(
    listOrEmpty(list)
      .filter(isJwk)
      .map((k) => [k.kid, k]),
  );
  keys = { at: now, until: now + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : KEYS_KEPT_MS), byKid };
  return byKid;
}

/** Why a push's token was refused, for the door's line; null when it stands. */
export type PushTokenRefusal =
  "no_token" | "malformed" | "unknown_key" | "bad_signature" | "wrong_audience" | "expired" | "wrong_issuer";

/**
 * A Pub/Sub push's bearer token, checked: signed by Google (RS256, a published key), issued by Google, for `audience`,
 * and live. Returns the token's email (the subscription's service account) when it stands.
 */
export async function verifyGooglePushToken(
  authorization: string | null,
  audience: string,
  params: { now?: number; deps?: Deps } = {},
): Promise<{ ok: true; email: string | null } | { ok: false; why: PushTokenRefusal }> {
  const now = params.now ?? Date.now();
  const jwt = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim();
  if (!jwt) return { ok: false, why: "no_token" };
  const parts = jwt.split(".");
  const [head, body, sig] = parts;
  if (parts.length !== 3 || !head || !body || !sig) return { ok: false, why: "malformed" };
  let header: { alg?: unknown; kid?: unknown };
  let claims: { iss?: unknown; aud?: unknown; exp?: unknown; iat?: unknown; email?: unknown; email_verified?: unknown };
  try {
    header = recordOrEmpty(JSON.parse(utf8.decode(unb64url(head))));
    claims = recordOrEmpty(JSON.parse(utf8.decode(unb64url(body))));
  } catch {
    return { ok: false, why: "malformed" };
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return { ok: false, why: "malformed" };
  let jwk = (await googleKeys(now, params.deps))?.get(header.kid);
  // A key Google rotated in since the keys were read: read them once more.
  if (!jwk) jwk = (await googleKeys(now, params.deps, true))?.get(header.kid);
  if (!jwk) return { ok: false, why: "unknown_key" };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
  const signed = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    new Uint8Array(unb64url(sig)),
    enc.encode(`${head}.${body}`),
  );
  if (!signed) return { ok: false, why: "bad_signature" };
  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss)) return { ok: false, why: "wrong_issuer" };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(audience)) return { ok: false, why: "wrong_audience" };
  const floored = Math.floor(now / 1000);
  if (typeof claims.exp !== "number" || claims.exp + SKEW_S < floored) return { ok: false, why: "expired" };
  if (typeof claims.iat === "number" && claims.iat - SKEW_S > floored) return { ok: false, why: "expired" };
  const email = typeof claims.email === "string" && claims.email_verified === true ? claims.email.toLowerCase() : null;
  return { ok: true, email };
}

/** A Gmail push's message: the mailbox that changed, and its history id then. Null for a body that is not one. */
export function gmailPushOf(body: unknown): { address: string; historyId: string | null } | null {
  const data = valueAt(body, "message", "data");
  if (typeof data !== "string" || !data) return null;
  try {
    const m = recordOrEmpty(JSON.parse(utf8.decode(unb64url(data))));
    if (typeof m.emailAddress !== "string" || !m.emailAddress.includes("@")) return null;
    const h = m.historyId;
    return {
      address: m.emailAddress.trim().toLowerCase(),
      historyId: typeof h === "string" || typeof h === "number" ? String(h) : null,
    };
  } catch {
    return null;
  }
}

/** Graph's notifications: each subscription that says it changed, with the clientState it carries. */
export function graphNotificationsOf(body: unknown): Array<{ subscriptionId: string; clientState: string | null }> {
  const value = recordOrNull(body)?.value;
  if (!Array.isArray(value)) return [];
  const out: Array<{ subscriptionId: string; clientState: string | null }> = [];
  for (const n of value.map(recordOrEmpty))
    if (typeof n.subscriptionId === "string" && n.subscriptionId)
      out.push({
        subscriptionId: n.subscriptionId,
        clientState: typeof n.clientState === "string" ? n.clientState : null,
      });
  return out;
}

/** A notification's clientState against the one the subscriptions were made with, in constant time (as hashes). */
export function clientStateMatches(first: string | null, second: string): boolean {
  if (first === null) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(first), digest(second));
}
