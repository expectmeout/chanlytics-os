/**
 * Instagram's Graph wire for the Instagram API with Instagram Login (graph.instagram.com, pinned to v26.0): the way in
 * (the authorize URL, a code traded for a short token, the short token for a 60-day one, and its refresh), what the
 * account is (`/me`), its webhooks subscribed, a person's profile, and a DM sent.
 *
 * Every request is built by a pure function and read by a pure parser, so the tests run them without a network; the
 * calls leave through providerFetch ("instagram": its own breaker, since graph.instagram.com is not graph.facebook.com),
 * bounded and never thrown. A token travels where Meta's documentation puts it: in the form of the code exchange, in the
 * query of the token, profile and subscription calls, and in the Authorization header of a send. providerFetch never
 * logs an address, and nothing here does.
 *
 * A DM may hold 1000 bytes of text (UTF-8). A longer reply is sent as several DMs, cut at a paragraph, a sentence or a
 * word where one falls in the second half of the room, never inside a character (instagramDmChunks). Sent in order: a
 * part that fails after one that left is a reply the person has some of, said as such (outcome `unknown`, never sent
 * again blind).
 */
import { utf8Bytes } from "@chanlytics/contracts";
import { answerObject, providerFetch, type ProviderReply, type SendOutcome } from "../provider-fetch";
import type { SendResult } from "../whatsapp";

const INSTAGRAM_GRAPH = "https://graph.instagram.com/v26.0";
const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_TOKEN_BASE = "https://graph.instagram.com";
/** What the business is asked for: its account, and its DMs. Both need Meta's App Review for accounts we do not own. */
const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;
/** The longest text one DM may hold, in UTF-8 bytes. */
export const INSTAGRAM_DM_MAX_BYTES = 1000;
/** One DM's bound; a reply in several parts stops starting parts once INSTAGRAM_SEND_DEADLINE_MS is spent. */
const INSTAGRAM_SEND_TIMEOUT_MS = 10_000;
const INSTAGRAM_SEND_DEADLINE_MS = 25_000;
/** A person's profile is read inside the door's request, for their name: short, and never worth a retry. */
const INSTAGRAM_PROFILE_TIMEOUT_MS = 2_500;
/** The way in's calls (the code, the token, `/me`, the subscription), each read by a person waiting on a redirect. */
const INSTAGRAM_CONNECT_TIMEOUT_MS = 10_000;

/** One request, as the wire will make it. */
export interface InstagramRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}

/** The app as the way in knows it: its Instagram app id, its secret, and the address Meta sends the person back to. */
export interface InstagramApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** A business's account as a send needs it: its Instagram account id (`/me`'s user_id), and its token. */
export interface InstagramConfig {
  accountId: string;
  accessToken: string;
}

const FORM_ENCODED = { "Content-Type": "application/x-www-form-urlencoded" };
const query = (params: Record<string, string>): string => new URLSearchParams(params).toString();

/** Instagram's consent screen, for the business's professional account, with the signed state that brings it back. */
export function instagramAuthorizeUrl(app: Pick<InstagramApp, "clientId" | "redirectUri">, state: string): string {
  return `${INSTAGRAM_AUTHORIZE_URL}?${query({
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    response_type: "code",
    scope: INSTAGRAM_SCOPES.join(","),
    state,
  })}`;
}

/** The code as Meta hands it back: it may end in `#_`, which is not part of it. */
export const instagramCodeOf = (raw: string | null | undefined): string =>
  String(raw ?? "")
    .trim()
    .replace(/#_$/, "");

/** The code (valid for an hour, once) traded for a short-lived token. */
export function instagramCodeRequest(app: InstagramApp, code: string): InstagramRequest {
  return {
    url: INSTAGRAM_TOKEN_URL,
    method: "POST",
    headers: FORM_ENCODED,
    body: query({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: "authorization_code",
      redirect_uri: app.redirectUri,
      code: instagramCodeOf(code),
    }),
  };
}

/** A short-lived token traded for a long-lived one (60 days). */
export function instagramLongLivedRequest(clientSecret: string, shortToken: string): InstagramRequest {
  return {
    url: `${INSTAGRAM_TOKEN_BASE}/access_token?${query({ grant_type: "ig_exchange_token", client_secret: clientSecret, access_token: shortToken })}`,
    method: "GET",
  };
}

/** A long-lived token refreshed for another 60 days: at least a day old, and not yet expired. */
export function instagramRefreshRequest(token: string): InstagramRequest {
  return {
    url: `${INSTAGRAM_TOKEN_BASE}/refresh_access_token?${query({ grant_type: "ig_refresh_token", access_token: token })}`,
    method: "GET",
  };
}

/** The account the token speaks for: its Instagram account id (the webhooks' `entry.id`), its handle and its name. */
export function instagramMeRequest(token: string): InstagramRequest {
  return {
    url: `${INSTAGRAM_GRAPH}/me?${query({ fields: "user_id,username,name,account_type", access_token: token })}`,
    method: "GET",
  };
}

/** The account's DMs sent to this app's webhook. */
export function instagramSubscribeRequest(token: string, accountId: string): InstagramRequest {
  return {
    url: `${INSTAGRAM_GRAPH}/${encodeURIComponent(accountId)}/subscribed_apps?${query({ subscribed_fields: "messages", access_token: token })}`,
    method: "POST",
  };
}

/** A person who wrote to the account, as they call themselves there (only once they have written: their consent). */
function instagramProfileRequest(token: string, igsid: string): InstagramRequest {
  return {
    url: `${INSTAGRAM_GRAPH}/${encodeURIComponent(igsid)}?${query({ fields: "name,username", access_token: token })}`,
    method: "GET",
  };
}

/** One DM of text to a person, from the account. */
function instagramSendRequest(cfg: InstagramConfig, to: string, text: string): InstagramRequest {
  return {
    url: `${INSTAGRAM_GRAPH}/${encodeURIComponent(cfg.accountId)}/messages`,
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: to }, message: { text } }),
  };
}

/* -------------------------------------------------------------- answers */

const valueAt = (o: Record<string, unknown> | null, k: string): unknown => (o ? o[k] : undefined);
const asText = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Graph's own error, when it gave one: its code, subcode and words. */
export interface InstagramGraphError {
  code: number | null;
  subcode: number | null;
  message: string;
}

export function instagramErrorOf(json: unknown): InstagramGraphError | null {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const e = valueAt(o, "error");
  if (!e || typeof e !== "object") {
    // The token endpoints answer an error flat: { error_type, code, error_message }.
    const flat = asText(valueAt(o, "error_message"));
    return flat
      ? {
          code: typeof valueAt(o, "code") === "number" ? (valueAt(o, "code") as number) : null,
          subcode: null,
          message: flat,
        }
      : null;
  }
  const err = e as Record<string, unknown>;
  return {
    code: typeof err.code === "number" ? err.code : null,
    subcode: typeof err.error_subcode === "number" ? err.error_subcode : null,
    message: asText(err.message) || asText(err.error_user_msg) || "Instagram refused the request",
  };
}

/** What the code exchange gave: the short token, the account's app-scoped id, and what it was granted. */
export interface InstagramCodeGrant {
  accessToken: string;
  userId: string;
  permissions: string[];
}

/** The code exchange's answer (Meta documents it as `data[0]`, and has answered it flat); throws with Meta's words when none. */
export function parseInstagramCodeGrant(json: unknown): InstagramCodeGrant {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const data = valueAt(o, "data");
  const g = (Array.isArray(data) && data[0] && typeof data[0] === "object" ? data[0] : o) as Record<
    string,
    unknown
  > | null;
  const accessToken = asText(valueAt(g, "access_token"));
  if (!accessToken) throw new Error(instagramErrorOf(json)?.message ?? "Instagram answered without a token");
  const p = valueAt(g, "permissions");
  const permissions = (Array.isArray(p) ? p.map(asText) : asText(p).split(",")).map((s) => s.trim()).filter(Boolean);
  return { accessToken, userId: asText(valueAt(g, "user_id")), permissions };
}

/** A long-lived token's answer, from the exchange or a refresh; throws with Meta's words when none. */
export function parseInstagramToken(json: unknown): { accessToken: string; expiresInS: number } {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const accessToken = asText(valueAt(o, "access_token"));
  if (!accessToken) throw new Error(instagramErrorOf(json)?.message ?? "Instagram answered without a token");
  const s = valueAt(o, "expires_in");
  return { accessToken, expiresInS: typeof s === "number" && s > 0 ? s : 0 };
}

/** The account `/me` names: its Instagram account id is what its webhooks are addressed to. Throws when it names none. */
export function parseInstagramMe(json: unknown): { accountId: string; username: string | null; name: string | null } {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const accountId = asText(valueAt(o, "user_id"));
  if (!/^\d{5,32}$/.test(accountId))
    throw new Error(instagramErrorOf(json)?.message ?? "Instagram did not name the account");
  return { accountId, username: asText(valueAt(o, "username")) || null, name: asText(valueAt(o, "name")) || null };
}

/** What a person is called, from their profile: their name, else their handle, else nothing said. */
export function instagramNameOf(json: unknown): string | null {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  const name = asText(valueAt(o, "name")).trim();
  const handle = asText(valueAt(o, "username")).trim();
  return (name || (handle ? `@${handle}` : "")).slice(0, 80) || null;
}

/* ---------------------------------------------------------------- calls */

/** What a call to Instagram's Graph came to: providerFetch's answer, and its JSON as an object. */
export interface InstagramAnswer {
  outcome: SendOutcome;
  status: number;
  json: Record<string, unknown> | null;
  error: string | null;
}

/** The test's network, or the real one. */
export interface InstagramDeps {
  fetch?: typeof fetch;
  now?: () => number;
}

/** One request to Instagram, bounded and never thrown. A read may be asked twice; a write once. */
export async function instagramCall(
  req: InstagramRequest,
  opts: { timeoutMs?: number; send?: boolean } = {},
  deps: InstagramDeps = {},
): Promise<InstagramAnswer> {
  const a: ProviderReply = await providerFetch(
    "instagram",
    req.url,
    {
      method: req.method,
      ...(req.headers ? { headers: req.headers } : {}),
      ...(req.body !== undefined ? { body: req.body } : {}),
      timeoutMs: opts.timeoutMs ?? INSTAGRAM_CONNECT_TIMEOUT_MS,
      ...(req.method === "GET" ? { idempotent: true, tries: 2 } : {}),
      // A DM is always put on the wire: another call's timeouts never fail it (provider-fetch's breaker).
      ...(opts.send ? { breaker: "count" as const } : {}),
    },
    deps.fetch ? { fetch: deps.fetch } : {},
  );
  return { outcome: a.outcome, status: a.status, json: answerObject(a), error: a.error };
}

/** A person's name as their profile has it, or null when it could not be read (never a reason to hold a message). */
export async function readInstagramName(
  token: string,
  igsid: string,
  deps: InstagramDeps = {},
): Promise<string | null> {
  const a = await instagramCall(
    instagramProfileRequest(token, igsid),
    { timeoutMs: INSTAGRAM_PROFILE_TIMEOUT_MS },
    deps,
  );
  return a.outcome === "ok" ? instagramNameOf(a.json) : null;
}

/**
 * Graph's "not now" on Instagram: HTTP 429, or the codes it answers when the app, the user or the account has called
 * faster than it may (4, 17, 32, 613; 80002 the Instagram account's own limit). Nothing was taken: it may be tried again.
 */
const INSTAGRAM_THROTTLE_CODES: readonly number[] = [4, 17, 32, 613, 80002];

/** Whether Instagram refused a send as too many, too fast. */
export function instagramThrottled(r: { ok: boolean; status: number; code?: number | null }): boolean {
  if (r.ok) return false;
  return r.status === 429 || (typeof r.code === "number" && INSTAGRAM_THROTTLE_CODES.includes(r.code));
}

/**
 * What Instagram's refusal of a send was, named at the wire so a caller says it in words:
 *  - window_closed: the person last wrote more than 24 hours ago (code 10, subcode 2018278).
 *  - not_reachable: the person cannot be written to now: blocked us, left, or is not found (551; 100 with 2018001).
 *  - token: the business's token is no longer good (190): reconnect.
 * Null for any other failure, and for a send that went.
 */
export function instagramRefusalOf(
  r: Pick<SendResult, "ok" | "code" | "subcode">,
): "window_closed" | "not_reachable" | "token" | null {
  if (r.ok) return null;
  if (r.code === 10 && r.subcode === 2018278) return "window_closed";
  if (r.code === 551 || (r.code === 100 && r.subcode === 2018001)) return "not_reachable";
  if (r.code === 190) return "token";
  return null;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const bytesOf = (s: string): number => utf8Bytes(s).length;

/** Where a part should end: after a paragraph, then a sentence, then a word, as late as one falls. -1 for none. */
function breakIn(part: string): number {
  const paragraph = part.lastIndexOf("\n\n");
  if (paragraph > 0) return paragraph + 2;
  let sentence = -1;
  for (const m of part.matchAll(/[.!?…](?=\s)/g)) sentence = (m.index ?? -1) + 1;
  if (sentence > 0) return sentence;
  const space = part.search(/\s\S*$/);
  return space > 0 ? space + 1 : -1;
}

/**
 * A reply as the DMs that carry it: one when it fits, else parts of at most `maxBytes` UTF-8 bytes, each ended at the
 * latest paragraph, sentence or word in its second half (else at the room's end), and never inside a character as a
 * person sees one (a grapheme: an accented letter, a flag, a family emoji). Blank parts are not sent.
 */
export function instagramDmChunks(words: string, maxBytes = INSTAGRAM_DM_MAX_BYTES): string[] {
  const parts: string[] = [];
  let rest = words.trim();
  while (rest) {
    if (bytesOf(rest) <= maxBytes) {
      parts.push(rest);
      break;
    }
    let used = 0;
    let room = "";
    for (const { segment } of segmenter.segment(rest)) {
      const b = bytesOf(segment);
      if (used + b > maxBytes && room) break;
      used += b;
      room += segment;
    }
    const at = breakIn(room);
    const part = at > room.length / 2 ? room.slice(0, at) : room;
    if (part.trim()) parts.push(part.trim());
    rest = rest.slice(part.length).trim();
  }
  return parts;
}

/** One DM's answer as a send's result. */
function sentOf(a: InstagramAnswer): SendResult {
  if (a.status === 0)
    return { ok: false, wamid: null, status: 0, errorBody: a.error ?? "no answer", outcome: a.outcome };
  const ok = a.outcome === "ok";
  const err = ok ? null : instagramErrorOf(a.json);
  const sent: SendResult = {
    ok,
    wamid: ok ? asText(valueAt(a.json, "message_id")) || null : null,
    status: a.status,
    errorBody: ok ? undefined : JSON.stringify(a.json ?? {}).slice(0, 200),
    code: err?.code ?? null,
    subcode: err?.subcode ?? null,
  };
  return { ...sent, outcome: instagramThrottled(sent) ? "retryable" : a.outcome };
}

/**
 * A reply sent as one DM or several, in order (instagramDmChunks), from the business's account to the person's IGSID.
 * Its id is the first DM's. A first part that fails is the send's failure as Instagram said it; a later one is a reply
 * the person has the start of: failed, outcome `unknown`, its words saying how many parts left. No part starts once
 * INSTAGRAM_SEND_DEADLINE_MS is spent.
 */
export async function sendInstagramText(
  cfg: InstagramConfig,
  to: string,
  words: string,
  deps: InstagramDeps = {},
): Promise<SendResult> {
  const parts = instagramDmChunks(words);
  if (parts.length === 0) return { ok: false, wamid: null, status: 0, errorBody: "empty_message" };
  const now = deps.now ?? Date.now;
  const started = now();
  let first: string | null = null;
  for (const [i, part] of parts.entries()) {
    if (i > 0 && now() - started > INSTAGRAM_SEND_DEADLINE_MS)
      return {
        ok: false,
        wamid: first,
        status: 0,
        errorBody: `partial: ${i} of ${parts.length} parts sent; out of time`,
        outcome: "unknown",
      };
    const sent = sentOf(
      await instagramCall(
        instagramSendRequest(cfg, to, part),
        { timeoutMs: INSTAGRAM_SEND_TIMEOUT_MS, send: true },
        deps,
      ),
    );
    if (!sent.ok)
      return i === 0
        ? sent
        : {
            ...sent,
            wamid: first,
            errorBody: `partial: ${i} of ${parts.length} parts sent; ${sent.errorBody ?? ""}`,
            outcome: "unknown",
          };
    first ??= sent.wamid;
  }
  return { ok: true, wamid: first, status: 200, outcome: "ok" };
}

/* ---------------------------------------------------------------- media */

/** A DM's attachment is Meta's: served from its CDN, and fetched from nowhere else, whatever a payload's link says. */
const META_CDN = /(^|\.)(fbsbx\.com|fbcdn\.net|cdninstagram\.com)$/i;
/** As WhatsApp's: a link's bytes are fetched at ingest, bounded, and never more than Meta's own document ceiling. */
const LINKED_MEDIA_TIMEOUT_MS = 15_000;
const LINKED_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

/** Whether a link is one of Meta's CDN's, over https. */
function isMetaCdnLink(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && META_CDN.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * An attachment's bytes by its link (a DM's photo or voice note: LinkedMediaRef), or null: a link that is not Meta's CDN's,
 * an answer that is not a 2xx, a body past LINKED_MEDIA_MAX_BYTES (refused from its length up front, or cut off), or any
 * fault. `fetchImpl` is the guarded public fetch (public-fetch.ts), so a link that resolves inside our network is never
 * read. Never throws: the caller stores a 'failed' fetch_state, and the thread still reaches a person.
 */
export async function fetchLinkedMedia(
  url: string,
  fetchImpl: typeof fetch,
): Promise<{ bytes: ArrayBuffer; mime: string | null } | null> {
  if (!isMetaCdnLink(url)) return null;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(LINKED_MEDIA_TIMEOUT_MS), redirect: "follow" });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") ?? 0) > LINKED_MEDIA_MAX_BYTES) {
      await res.body.cancel().catch(() => undefined);
      return null;
    }
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LINKED_MEDIA_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.byteLength;
    }
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || null;
    return { bytes: out.buffer, mime };
  } catch {
    return null;
  }
}
