/**
 * The Meta link's wire: an Instagram professional account connected through Meta, with the setup Meta calls the Instagram
 * API with Unified Login (graph.facebook.com, pinned to v27.0; decision 0117). The owner signs in with Instagram or
 * Facebook in Facebook Login for Business's dialog, opened with the app's saved configuration (`config_id`); the code it
 * hands back is traded, with the Meta app's id and secret, for a Business Integration System User token: it belongs to the
 * business's portfolio, needs no Facebook Page, and does not expire unless the configuration says so.
 *
 * With that token `/me` is the system user, never the Instagram account: the account is read from
 * `/me/assigned_instagram_accounts` (needs instagram_basic), and what the token may do from `debug_token` (the app's own
 * token asks). Every call with the business's token carries `appsecret_proof`, the HMAC-SHA256 of the token keyed by the
 * app's secret, so a token read out of a log or a dump is useless without the secret.
 *
 * Every request is built by a pure function and read by a pure parser, so the tests run them without a network; the calls
 * leave through callInstagram (providerFetch "instagram": Instagram's API, whichever host it answers on). Checked against
 * Meta's Unified Login pages (get started, authentication, webhooks setup) on 9 November 2026.
 */
import { createHmac } from "node:crypto";
import { recordOrEmpty, valueAt } from "@chanlytics/contracts";
import type { InstagramApp, InstagramRequest } from "./graph";
import { instagramErrorOf } from "./graph";

/** The Graph version the Meta link speaks: the newest Meta's Unified Login pages use. */
export const META_GRAPH_VERSION = "v27.0";
const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const META_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;

/**
 * The webhook fields an account connected through Meta is subscribed to, by the permission each needs (Meta's fields
 * matrix): DMs with messages, comments and mentions with comments, a story's numbers with insights. A field whose
 * permission the token lacks is never asked for, since Meta refuses the whole subscription.
 */
const FIELDS_BY_PERMISSION: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "instagram_manage_messages",
    ["messages", "message_reactions", "messaging_postbacks", "messaging_referral", "messaging_seen"],
  ],
  ["instagram_manage_comments", ["comments", "live_comments", "mentions"]],
  ["instagram_manage_insights", ["story_insights"]],
];

/** The Meta app as the way in knows it: the app's id and secret, the configuration's id, and the address it returns to. */
export interface MetaApp extends InstagramApp {
  configId: string;
}

/** `appsecret_proof` for a token: hex HMAC-SHA256 of the token, keyed by the app's secret. */
export function metaAppSecretProof(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

const query = (params: Record<string, string>): string => new URLSearchParams(params).toString();

/** A token's own query: the token and its proof, which every call with the business's token carries. */
const withProof = (token: string, appSecret: string): Record<string, string> => ({
  access_token: token,
  appsecret_proof: metaAppSecretProof(token, appSecret),
});

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

/** The code traded for the business's token, with the Meta app's id and secret (never the Instagram app's). */
export function metaCodeRequest(app: InstagramApp, code: string): InstagramRequest {
  return {
    url: `${META_GRAPH}/oauth/access_token?${query({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: app.redirectUri,
      code: code.trim().replace(/#_$/, ""),
    })}`,
    method: "GET",
  };
}

/** What a token may do and how long it lives, asked with the app's own token (`<app id>|<app secret>`). */
export function metaDebugTokenRequest(
  app: Pick<InstagramApp, "clientId" | "clientSecret">,
  token: string,
): InstagramRequest {
  return {
    url: `${META_GRAPH}/debug_token?${query({ input_token: token, access_token: `${app.clientId}|${app.clientSecret}` })}`,
    method: "GET",
  };
}

/** The business the token belongs to: `/me` is its system user, and names the client's business portfolio. */
export function metaBusinessRequest(token: string, appSecret: string): InstagramRequest {
  return {
    url: `${META_GRAPH}/me?${query({ fields: "client_business_id", ...withProof(token, appSecret) })}`,
    method: "GET",
  };
}

/** The Instagram professional accounts the business shared with the app in the dialog. */
export function metaAssignedAccountsRequest(token: string, appSecret: string): InstagramRequest {
  return {
    url: `${META_GRAPH}/me/assigned_instagram_accounts?${query({ fields: "id,username", ...withProof(token, appSecret) })}`,
    method: "GET",
  };
}

/** The account itself: its handle and name, for the row. */
export function metaAccountRequest(token: string, appSecret: string, accountId: string): InstagramRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(accountId)}?${query({ fields: "id,username,name", ...withProof(token, appSecret) })}`,
    method: "GET",
  };
}

/** The webhook fields this token's permissions allow, in Meta's order. */
export function metaWebhookFieldsOf(scopes: readonly string[]): string[] {
  const held = new Set(scopes);
  return FIELDS_BY_PERMISSION.flatMap(([permission, fields]) => (held.has(permission) ? fields : []));
}

/** The account's events sent to this app's webhook, on Facebook's host with the business's token. */
export function metaSubscribeRequest(
  token: string,
  appSecret: string,
  accountId: string,
  fields: readonly string[],
): InstagramRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(accountId)}/subscribed_apps?${query({
      subscribed_fields: fields.join(","),
      ...withProof(token, appSecret),
    })}`,
    method: "POST",
  };
}

/** The account's events no longer sent to this app (a disconnect). */
export function metaUnsubscribeRequest(token: string, appSecret: string, accountId: string): InstagramRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(accountId)}/subscribed_apps?${query(withProof(token, appSecret))}`,
    method: "DELETE",
  };
}

/* -------------------------------------------------------------- answers */

const metaText = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const objectOf = (json: unknown): Record<string, unknown> | null =>
  json && typeof json === "object" ? recordOrEmpty(json) : null;

/** The code exchange's answer: the business's token, and when it lapses (null when Meta says it does not). */
export function parseMetaToken(json: unknown): { accessToken: string; expiresInS: number | null } {
  const o = objectOf(json);
  const accessToken = metaText(valueAt(o, "access_token"));
  if (!accessToken) throw new Error(instagramErrorOf(json)?.message ?? "Meta answered without a token");
  const s = valueAt(o, "expires_in");
  return { accessToken, expiresInS: typeof s === "number" && s > 0 ? s : null };
}

/** What `debug_token` says of a token: whether it is good, what it was granted, and when it lapses (null for never). */
export interface MetaTokenFacts {
  valid: boolean;
  scopes: string[];
  /** The Instagram accounts each permission reaches, where Meta names them (granular_scopes' target_ids). */
  accountsByScope: Record<string, string[]>;
  expiresAt: string | null;
}

export function parseMetaDebugToken(json: unknown): MetaTokenFacts {
  const data = objectOf(valueAt(objectOf(json), "data"));
  if (!data) throw new Error(instagramErrorOf(json)?.message ?? "Meta did not describe the token");
  const scopesRaw = valueAt(data, "scopes");
  const scopes = Array.isArray(scopesRaw) ? scopesRaw.map(metaText).filter(Boolean) : [];
  const accountsByScope: Record<string, string[]> = {};
  const granular = valueAt(data, "granular_scopes");
  if (Array.isArray(granular))
    for (const g of granular) {
      const scope = metaText(valueAt(objectOf(g), "scope"));
      const ids = valueAt(objectOf(g), "target_ids");
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
  return metaText(valueAt(objectOf(json), "client_business_id")) || null;
}

/** An Instagram account as Meta lists it: its id (the webhooks' `entry.id`) and its handle. */
export interface MetaAccount {
  id: string;
  username: string | null;
}

/** The accounts the business shared, each with an id that reads as one. Throws when Meta listed nothing it could read. */
export function parseMetaAssignedAccounts(json: unknown): MetaAccount[] {
  const data = valueAt(objectOf(json), "data");
  if (!Array.isArray(data)) throw new Error(instagramErrorOf(json)?.message ?? "Meta did not list the accounts");
  return data.flatMap((a) => {
    const o = objectOf(a);
    const id = metaText(valueAt(o, "id"));
    return /^\d{5,32}$/.test(id) ? [{ id, username: metaText(valueAt(o, "username")) || null }] : [];
  });
}

/** The account as the row keeps it. Throws when it names no account. */
export function parseMetaAccount(json: unknown): { id: string; username: string | null; name: string | null } {
  const o = objectOf(json);
  const id = metaText(valueAt(o, "id"));
  if (!/^\d{5,32}$/.test(id)) throw new Error(instagramErrorOf(json)?.message ?? "Meta did not name the account");
  return { id, username: metaText(valueAt(o, "username")) || null, name: metaText(valueAt(o, "name")) || null };
}
