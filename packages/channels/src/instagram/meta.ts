/**
 * The Meta link's wire, Instagram's part: an Instagram professional account connected through Meta, with the setup Meta
 * calls the Instagram API with Unified Login (decision 0117). The sign-in itself, the token and what it may do are the one
 * Meta client's (../meta/client.ts), which an ad account's connection reads too.
 *
 * With a business's token `/me` is the system user, never the Instagram account: the account is read from
 * `/me/assigned_instagram_accounts` (needs instagram_basic). Every call with the business's token carries
 * `appsecret_proof`.
 *
 * Every request is built by a pure function and read by a pure parser, so the tests run them without a network; the calls
 * leave through callInstagram (providerFetch "instagram": Instagram's API, whichever host it answers on). Checked against
 * Meta's Unified Login pages (get started, authentication, webhooks setup) on 9 November 2026.
 */
import { valueAt } from "@chanlytics/contracts";
import { META_GRAPH, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { instagramErrorOf } from "./graph";

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

const query = (params: Record<string, string>): string => new URLSearchParams(params).toString();

/** The Instagram professional accounts the business shared with the app in the dialog. */
export function metaAssignedAccountsRequest(token: string, appSecret: string): MetaRequest {
  return {
    url: `${META_GRAPH}/me/assigned_instagram_accounts?${query({ fields: "id,username", ...metaProofQuery(token, appSecret) })}`,
    method: "GET",
  };
}

/** The account itself: its handle and name, for the row. */
export function metaAccountRequest(token: string, appSecret: string, accountId: string): MetaRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(accountId)}?${query({ fields: "id,username,name", ...metaProofQuery(token, appSecret) })}`,
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
): MetaRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(accountId)}/subscribed_apps?${query({
      subscribed_fields: fields.join(","),
      ...metaProofQuery(token, appSecret),
    })}`,
    method: "POST",
  };
}

/** The account's events no longer sent to this app (a disconnect). */
export function metaUnsubscribeRequest(token: string, appSecret: string, accountId: string): MetaRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(accountId)}/subscribed_apps?${query(metaProofQuery(token, appSecret))}`,
    method: "DELETE",
  };
}

/* -------------------------------------------------------------- answers */

/** An Instagram account as Meta lists it: its id (the webhooks' `entry.id`) and its handle. */
export interface MetaAccount {
  id: string;
  username: string | null;
}

/** The accounts the business shared, each with an id that reads as one. Throws when Meta listed nothing it could read. */
export function parseMetaAssignedAccounts(json: unknown): MetaAccount[] {
  const data = valueAt(metaObject(json), "data");
  if (!Array.isArray(data)) throw new Error(instagramErrorOf(json)?.message ?? "Meta did not list the accounts");
  return data.flatMap((a) => {
    const o = metaObject(a);
    const id = metaText(valueAt(o, "id"));
    return /^\d{5,32}$/.test(id) ? [{ id, username: metaText(valueAt(o, "username")) || null }] : [];
  });
}

/** The account as the row keeps it. Throws when it names no account. */
export function parseMetaAccount(json: unknown): { id: string; username: string | null; name: string | null } {
  const o = metaObject(json);
  const id = metaText(valueAt(o, "id"));
  if (!/^\d{5,32}$/.test(id)) throw new Error(instagramErrorOf(json)?.message ?? "Meta did not name the account");
  return { id, username: metaText(valueAt(o, "username")) || null, name: metaText(valueAt(o, "name")) || null };
}
