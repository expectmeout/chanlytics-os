/**
 * The one Meta client: what any connection made through Meta's own sign-in speaks, whichever product it is for
 * (Instagram today, an ad account next; decision 0049, step P0b). Facebook Login for Business's dialog, opened with one of
 * the app's saved configurations (`config_id`); the code it hands back traded, with the Meta app's id and secret, for a
 * Business Integration System User token, which belongs to the business's portfolio and does not expire unless the
 * configuration says so; what that token may do (`debug_token`, asked with the app's own token); and whose it is (`/me`
 * is the system user, and names the business).
 *
 * Every call with a business's token carries `appsecret_proof`, the HMAC-SHA256 of the token keyed by the app's secret,
 * so a token read out of a log or a dump is useless without the secret. One Graph version for every call
 * (graph.facebook.com, pinned to v27.0; decision 0117).
 *
 * Every request is built by a pure function and read by a pure parser, so the tests run them without a network. How a
 * call leaves is its product's: Instagram's go through callInstagram. Checked against Meta's Unified Login pages (get
 * started, authentication) on 9 November 2026.
 */
import { createHmac } from "node:crypto";
import { recordOrEmpty, valueAt } from "@chanlytics/contracts";

/** The Graph version every call through Meta speaks: the newest Meta's Unified Login pages use. */
const META_GRAPH_VERSION = "v27.0";
/** Facebook's Graph at that version: where every call with a business's token goes. */
export const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const META_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

/** One request, as the wire will make it. */
export interface MetaRequest {
  url: string;
  method: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

/** The Meta app as a sign-in knows it: its id and secret, the saved configuration's id, and the address it returns to. */
export interface MetaApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configId: string;
}

/** `appsecret_proof` for a token: hex HMAC-SHA256 of the token, keyed by the app's secret. */
export function metaAppSecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

/** A token's own query: the token and its proof, which every call with a business's token carries. */
export const metaProofQuery = (token: string, appSecret: string): Record<string, string> => ({
  access_token: token,
  appsecret_proof: metaAppSecretProof(token, appSecret),
});

const query = (params: Record<string, string>): string => new URLSearchParams(params).toString();

/** A Graph address: a path under META_GRAPH with its query. */
export const metaGraphUrl = (path: string, params: Record<string, string>): string =>
  `${META_GRAPH}/${path}?${query(params)}`;

/** Facebook Login for Business's dialog with the app's configuration, and the signed state that brings the owner back. */
export function metaDialogUrl(app: Pick<MetaApp, "clientId" | "configId" | "redirectUri">, state: string): string {
  return `${META_DIALOG}?${query({
    client_id: app.clientId,
    config_id: app.configId,
    redirect_uri: app.redirectUri,
    response_type: "code",
    state,
  })}`;
}

/** The code traded for the business's token, with the Meta app's id and secret. */
export function metaCodeRequest(
  app: Pick<MetaApp, "clientId" | "clientSecret" | "redirectUri">,
  code: string,
): MetaRequest {
  return {
    url: metaGraphUrl("oauth/access_token", {
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: app.redirectUri,
      code: code.trim().replace(/#_$/, ""),
    }),
    method: "GET",
  };
}

/** What a token may do and how long it lives, asked with the app's own token (`<app id>|<app secret>`). */
export function metaDebugTokenRequest(app: Pick<MetaApp, "clientId" | "clientSecret">, token: string): MetaRequest {
  return {
    url: metaGraphUrl("debug_token", { input_token: token, access_token: `${app.clientId}|${app.clientSecret}` }),
    method: "GET",
  };
}

/** The business the token belongs to: `/me` is its system user, and names the client's business portfolio. */
export function metaBusinessRequest(token: string, appSecret: string): MetaRequest {
  return {
    url: metaGraphUrl("me", { fields: "client_business_id", ...metaProofQuery(token, appSecret) }),
    method: "GET",
  };
}

/* -------------------------------------------------------------- answers */

/** A value of an answer as text: a string as it is, a number written out, anything else nothing. */
export const metaText = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
/** An answer, or a part of one, as an object to read by key; null for anything that is not one. */
export const metaObject = (json: unknown): Record<string, unknown> | null =>
  json && typeof json === "object" ? recordOrEmpty(json) : null;

/** Graph's own error, when it gave one: its code, subcode and words. */
export interface MetaGraphError {
  code: number | null;
  subcode: number | null;
  message: string;
}

/**
 * The error an answer carries, or null where it carries none. `refused` is what is said of an error that came with no
 * words of its own, in the name of the product that asked.
 */
export function metaErrorOf(json: unknown, refused = "Meta refused the request"): MetaGraphError | null {
  const value = metaObject(json);
  const result = valueAt(value, "error");
  if (!result || typeof result !== "object") {
    // The token endpoints answer an error flat: { error_type, code, error_message }.
    const flat = metaText(valueAt(value, "error_message"));
    const code = valueAt(value, "code");
    return flat ? { code: typeof code === "number" ? code : null, subcode: null, message: flat } : null;
  }
  const err = recordOrEmpty(result);
  return {
    code: typeof err.code === "number" ? err.code : null,
    subcode: typeof err.error_subcode === "number" ? err.error_subcode : null,
    message: metaText(err.message) || metaText(err.error_user_msg) || refused,
  };
}

/** Where a list's next page begins, as Graph names it: a cursor to go on after, or a time to end at. */
export interface MetaNextPage {
  after?: string;
  until?: string;
}

/**
 * The next page of a list Graph answered, or null where it named none. Read from Graph's own `paging.next` address,
 * which is never followed as it is: it carries the token, so only its cursor and its time are taken and the request is
 * built again by whoever asks. A next page that names neither comes back empty: the list did not end, and nothing here
 * can go on with it.
 */
export function metaNextPageOf(json: unknown): MetaNextPage | null {
  const next = metaText(valueAt(metaObject(valueAt(metaObject(json), "paging")), "next"));
  if (!next) return null;
  let asked: URLSearchParams;
  try {
    asked = new URL(next).searchParams;
  } catch {
    // Not an address: the list did not end, and it cannot be gone on with.
    return {};
  }
  const after = asked.get("after");
  const until = asked.get("until");
  return { ...(after ? { after } : {}), ...(until ? { until } : {}) };
}

/** The code exchange's answer: the business's token, and when it lapses (null when Meta says it does not). */
export function parseMetaToken(json: unknown): { accessToken: string; expiresInS: number | null } {
  const o = metaObject(json);
  const accessToken = metaText(valueAt(o, "access_token"));
  if (!accessToken) throw new Error(metaErrorOf(json)?.message ?? "Meta answered without a token");
  const s = valueAt(o, "expires_in");
  return { accessToken, expiresInS: typeof s === "number" && s > 0 ? s : null };
}

/** What `debug_token` says of a token: whether it is good, what it was granted, and when it lapses (null for never). */
export interface MetaTokenFacts {
  valid: boolean;
  scopes: string[];
  /** The accounts each permission reaches, where Meta names them (granular_scopes' target_ids). */
  accountsByScope: Record<string, string[]>;
  expiresAt: string | null;
}

export function parseMetaDebugToken(json: unknown): MetaTokenFacts {
  const data = metaObject(valueAt(metaObject(json), "data"));
  if (!data) throw new Error(metaErrorOf(json)?.message ?? "Meta did not describe the token");
  const scopesRaw = valueAt(data, "scopes");
  const scopes = Array.isArray(scopesRaw) ? scopesRaw.map(metaText).filter(Boolean) : [];
  const accountsByScope: Record<string, string[]> = {};
  const granular = valueAt(data, "granular_scopes");
  if (Array.isArray(granular))
    for (const g of granular) {
      const scope = metaText(valueAt(metaObject(g), "scope"));
      const ids = valueAt(metaObject(g), "target_ids");
      if (scope && Array.isArray(ids)) accountsByScope[scope] = ids.map(metaText).filter(Boolean);
    }
  const exp = valueAt(data, "expires_at");
  return {
    valid: valueAt(data, "is_valid") === true,
    scopes,
    accountsByScope,
    expiresAt: typeof exp === "number" && exp > 0 ? new Date(exp * 1000).toISOString() : null,
  };
}

/** The business portfolio `/me` names; null when it names none (an older token, or a person's token by mistake). */
export function parseMetaBusiness(json: unknown): string | null {
  return metaText(valueAt(metaObject(json), "client_business_id")) || null;
}
