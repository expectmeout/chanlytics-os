/**
 * Gmail, through the mailbox's own grant (decision 0056): an email sent from it, the Message-ID and thread it went
 * under, what changed in it since a cursor, one message read, and the watch that tells the edge when something did.
 * Every call returns what it came to and never throws (provider-fetch.ts); a token is the caller's to hold.
 *
 *   gmailSend       users.messages.send, the raw MIME and the thread it belongs in. A send is never tried twice blind:
 *                   an unknown outcome is the caller's (deliver: outcome unknown, the clock reads it back).
 *   gmailThreadOf   the thread of an email by its Message-ID (q=rfc822msgid:), so a nudge goes in its parent's thread.
 *   gmailSentIds    a sent message's own Message-ID header, as Gmail kept it.
 *   gmailProfile    the address and the history cursor now; a mailbox with no Gmail answers 400 failedPrecondition.
 *   gmailHistory    what was added to the mailbox since a cursor: message ids and their threads, never their words.
 *   gmailMessage    one message in full, for a thread the product started.
 *   gmailReports    the delivery reports received since a time, by who wrote them (ids alone).
 *   gmailFindSent   whether an email whose send's outcome was unknown is in what the mailbox sent.
 *   gmailWatch      the mailbox's changes published to the Pub/Sub topic; it lapses after seven days unless renewed.
 *   gmailStop       the watch ended, when the mailbox is removed.
 */
import { DAY_MS } from "@chanlytics/contracts";
import { b64url } from "../google/google-oauth";
import { providerFetch, type ProviderReply, type SendOutcome } from "../provider-fetch";
import { FIND_SENT_LOOKS, FIND_SENT_SLACK_MS, MAILBOX_READ_MS, type FoundSent } from "./mailbox-read";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** A send's bound: Gmail answers a send in a second or two; a send past this is unknown, never repeated blind. */
const GMAIL_SEND_MS = 15_000;

type Deps = Parameters<typeof providerFetch>[3];

const auth = (token: string, json = false): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

/** Gmail's own word for why a call was refused, when it gave one (error.errors[0].reason, or error.status). */
function gmailReasonOf(r: Pick<ProviderReply, "json">): string | null {
  const e = (r.json as { error?: { status?: unknown; errors?: Array<{ reason?: unknown }> } } | null)?.error;
  const reason = e?.errors?.[0]?.reason;
  return typeof reason === "string" ? reason : typeof e?.status === "string" ? e.status : null;
}

/**
 * Whether a refusal is the mailbox's own day used up (Gmail's sending limits): the mailbox rests until the time Gmail
 * names, and its sends wait. Gmail says it as a 429 whose words end "(Mail sending)"; the same "User-rate limit
 * exceeded" without them is a pace of requests (the next tick sends), never a day.
 */
export function gmailDayUsed(r: Pick<ProviderReply, "status" | "json" | "text">): boolean {
  const reason = gmailReasonOf(r) ?? "";
  return reason === "dailyLimitExceeded" || /\(mail sending\)|daily user sending limit exceeded/i.test(gmailWordsOf(r));
}

/** When a mailbox whose day Gmail used up sends again: the "Retry after" time Gmail names, else a day on. */
export function gmailRestUntil(r: Pick<ProviderReply, "json" | "text">, nowMs: number): number {
  const at = Date.parse(/retry after (\d{4}-\d\d-\d\dT[\d:.]+Z)/i.exec(gmailWordsOf(r))?.[1] ?? "");
  // Gmail's sending day is a rolling one: with no time named, it turns over a day on.
  return Number.isFinite(at) && at > nowMs ? at : nowMs + DAY_MS;
}

/** Gmail's words for a refusal: its error's message, else the body as it came. */
function gmailWordsOf(r: Pick<ProviderReply, "json" | "text">): string {
  const message = (r.json as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" ? `${message} ${r.text ?? ""}` : (r.text ?? "");
}

/** Whether the grant is gone (revoked, expired for good, the account suspended): the owner connects it again. */
export function gmailSignedOut(r: Pick<ProviderReply, "status" | "json">): boolean {
  return r.status === 401 || (r.status === 403 && /insufficientPermissions|forbidden/i.test(gmailReasonOf(r) ?? ""));
}

export interface GmailSent {
  ok: boolean;
  status: number;
  outcome: SendOutcome;
  /** Gmail's id for the sent message, and its thread. */
  id: string | null;
  threadId: string | null;
  error: string | null;
  reply: ProviderReply;
}

export async function gmailSend(
  token: string,
  mime: string,
  threadId: string | null,
  p: { deadlineMs?: number } = {},
  deps?: Deps,
): Promise<GmailSent> {
  const reply = await providerFetch(
    "google",
    `${GMAIL_API}/messages/send`,
    {
      method: "POST",
      headers: auth(token, true),
      body: JSON.stringify({ raw: b64url(mime), ...(threadId ? { threadId } : {}) }),
      timeoutMs: Math.min(GMAIL_SEND_MS, p.deadlineMs ?? GMAIL_SEND_MS),
      tries: 1,
      breaker: "count",
    },
    deps,
  );
  const j = reply.json as { id?: unknown; threadId?: unknown } | null;
  return {
    ok: reply.outcome === "ok" && typeof j?.id === "string",
    status: reply.status,
    outcome: reply.outcome,
    id: typeof j?.id === "string" ? j.id : null,
    threadId: typeof j?.threadId === "string" ? j.threadId : null,
    error: reply.outcome === "ok" ? null : (gmailReasonOf(reply) ?? reply.error ?? `status ${reply.status}`),
    reply,
  };
}

/** The message (and its thread) Gmail holds under this Message-ID, or null; throws when Gmail could not be asked. */
export async function gmailThreadOf(
  token: string,
  rfcMessageId: string,
  deps?: Deps,
): Promise<{ id: string; threadId: string } | null> {
  const q = new URLSearchParams({ q: `rfc822msgid:${rfcMessageId.replace(/^<|>$/g, "")}`, maxResults: "1" });
  const r = await providerFetch(
    "google",
    `${GMAIL_API}/messages?${q.toString()}`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") throw new Error(`gmail list: ${gmailReasonOf(r) ?? r.error ?? r.status}`);
  const first = (r.json as { messages?: Array<{ id?: unknown; threadId?: unknown }> } | null)?.messages?.[0];
  return typeof first?.id === "string" && typeof first.threadId === "string"
    ? { id: first.id, threadId: first.threadId }
    : null;
}

/** A sent message's Message-ID header as Gmail kept it, or null; throws when Gmail could not be asked. */
export async function gmailSentIds(token: string, id: string, deps?: Deps): Promise<{ messageId: string | null }> {
  const q = new URLSearchParams({ format: "metadata", metadataHeaders: "Message-ID" });
  const r = await providerFetch(
    "google",
    `${GMAIL_API}/messages/${encodeURIComponent(id)}?${q.toString()}`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") throw new Error(`gmail get: ${gmailReasonOf(r) ?? r.error ?? r.status}`);
  const headers = (r.json as { payload?: { headers?: Array<{ name?: unknown; value?: unknown }> } } | null)?.payload
    ?.headers;
  const h = (headers ?? []).find((x) => typeof x.name === "string" && x.name.toLowerCase() === "message-id");
  return { messageId: typeof h?.value === "string" ? h.value : null };
}

export async function gmailProfile(token: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "google",
    `${GMAIL_API}/profile`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
}

/**
 * Whether Gmail said the account has no mailbox: a Google account that is not a Gmail one (or one whose Gmail is
 * switched off) answers 400 failedPrecondition ("Mail service not enabled"). Gmail says the same now and then of a
 * mailbox that has one, so a caller asks twice before it believes it.
 */
export function gmailNoMailbox(r: Pick<ProviderReply, "status" | "json">): boolean {
  return r.status === 400 && /failedPrecondition|FAILED_PRECONDITION/.test(gmailReasonOf(r) ?? "");
}

/** What history said: the messages added since the cursor, with their threads, and the cursor to read from next. */
export type GmailHistory =
  | {
      ok: true;
      /** Each message added, with the labels it arrived under (SPAM, SENT, DRAFT…): what it is, before it is read. */
      added: Array<{ id: string; threadId: string; labels: string[] }>;
      next: string | null;
      nextPage: string | null;
    }
  | { ok: false; expired: boolean; reply: ProviderReply };

/**
 * The messages added to the mailbox since `startHistoryId`, a page at a time, under any label: a reply a filter filed
 * away, or one Gmail took for spam, is a reply all the same (the caller reads only threads a reach-out started). A
 * cursor Gmail no longer keeps (404) is `expired`: the caller starts again from the profile's cursor, after reading the
 * threads it knows directly.
 */
export async function gmailHistory(
  token: string,
  startHistoryId: string,
  pageToken: string | null,
  deps?: Deps,
): Promise<GmailHistory> {
  const q = new URLSearchParams({
    startHistoryId,
    historyTypes: "messageAdded",
    maxResults: "100",
  });
  if (pageToken) q.set("pageToken", pageToken);
  const r = await providerFetch(
    "google",
    `${GMAIL_API}/history?${q.toString()}`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") return { ok: false, expired: r.status === 404, reply: r };
  const j = r.json as {
    history?: Array<{ messagesAdded?: Array<{ message?: { id?: unknown; threadId?: unknown; labelIds?: unknown } }> }>;
    historyId?: unknown;
    nextPageToken?: unknown;
  } | null;
  const added: Array<{ id: string; threadId: string; labels: string[] }> = [];
  for (const h of j?.history ?? [])
    for (const a of h.messagesAdded ?? []) {
      const m = a.message;
      const labels = Array.isArray(m?.labelIds) ? m.labelIds.filter((l): l is string => typeof l === "string") : [];
      if (typeof m?.id === "string" && typeof m.threadId === "string")
        added.push({ id: m.id, threadId: m.threadId, labels });
    }
  return {
    ok: true,
    added,
    next: typeof j?.historyId === "string" ? j.historyId : null,
    nextPage: typeof j?.nextPageToken === "string" ? j.nextPageToken : null,
  };
}

/** One message, in full: its headers and its parts (mailbox-read.ts gmailEmailOf reads it). */
export async function gmailMessage(token: string, id: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "google",
    `${GMAIL_API}/messages/${encodeURIComponent(id)}?format=full`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
}

/**
 * The mailbox's changes, published to the topic, under every label (as the history read is): the history cursor it
 * starts from, and when it lapses (epoch ms).
 */
export async function gmailWatch(
  token: string,
  topic: string,
  deps?: Deps,
): Promise<{ ok: true; historyId: string; expiresAt: number } | { ok: false; reply: ProviderReply }> {
  const r = await providerFetch(
    "google",
    `${GMAIL_API}/watch`,
    {
      method: "POST",
      headers: auth(token, true),
      body: JSON.stringify({ topicName: topic }),
      timeoutMs: MAILBOX_READ_MS,
      idempotent: true,
      tries: 2,
    },
    deps,
  );
  const j = r.json as { historyId?: unknown; expiration?: unknown } | null;
  const exp = Number(j?.expiration);
  if (r.outcome !== "ok" || typeof j?.historyId !== "string" || !Number.isFinite(exp)) return { ok: false, reply: r };
  return { ok: true, historyId: j.historyId, expiresAt: exp };
}

/**
 * The delivery reports the mailbox received since `afterSec` (epoch seconds), spam included (Google files some there),
 * as ids alone: a report that sits outside the thread of the email it is about is found by who wrote it, never by
 * its thread. Throws when Gmail could not be asked.
 */
export async function gmailReports(token: string, afterSec: number, deps?: Deps): Promise<Array<{ id: string }>> {
  const q = new URLSearchParams({
    q: `from:(mailer-daemon OR postmaster) after:${Math.max(0, Math.floor(afterSec))}`,
    includeSpamTrash: "true",
    maxResults: "100",
  });
  const r = await providerFetch(
    "google",
    `${GMAIL_API}/messages?${q.toString()}`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") throw new Error(`gmail reports: ${gmailReasonOf(r) ?? r.error ?? r.status}`);
  const list = (r.json as { messages?: Array<{ id?: unknown }> } | null)?.messages ?? [];
  return list.flatMap((m) => (typeof m.id === "string" ? [{ id: m.id }] : []));
}

/** A message's headers by lower-case name, as Gmail's metadata read gives them. */
async function gmailHeadersOf(
  token: string,
  id: string,
  names: readonly string[],
  deps?: Deps,
): Promise<{ threadId: string | null; headers: Record<string, string> }> {
  const q = new URLSearchParams({ format: "metadata" });
  for (const n of names) q.append("metadataHeaders", n);
  const r = await providerFetch(
    "google",
    `${GMAIL_API}/messages/${encodeURIComponent(id)}?${q.toString()}`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") throw new Error(`gmail get: ${gmailReasonOf(r) ?? r.error ?? r.status}`);
  const j = r.json as {
    threadId?: unknown;
    payload?: { headers?: Array<{ name?: unknown; value?: unknown }> };
  } | null;
  const headers: Record<string, string> = {};
  for (const h of j?.payload?.headers ?? [])
    if (typeof h.name === "string" && typeof h.value === "string") headers[h.name.toLowerCase()] = h.value;
  return { threadId: typeof j?.threadId === "string" ? j.threadId : null, headers };
}

const bare = (id: string | null | undefined): string => (id ?? "").trim().replace(/^<|>$/g, "").toLowerCase();

/**
 * Whether the mailbox sent an email whose send's outcome was unknown (a timeout after Gmail may have taken it): by the
 * Message-ID it was sent under, then among what it sent to that address since, by that Message-ID kept as Gmail's
 * "original" (Gmail may put its own in its place) or by its subject. Found or not; throws when Gmail could not be
 * asked, and the caller looks again later.
 */
export async function gmailFindSent(
  token: string,
  want: { messageId: string; to: string; subject: string | null; sinceMs: number },
  deps?: Deps,
): Promise<FoundSent> {
  const minted = bare(want.messageId);
  const list = async (q: string) => {
    const p = new URLSearchParams({ q, maxResults: String(FIND_SENT_LOOKS) });
    const r = await providerFetch(
      "google",
      `${GMAIL_API}/messages?${p.toString()}`,
      { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
      deps,
    );
    if (r.outcome !== "ok") throw new Error(`gmail list: ${gmailReasonOf(r) ?? r.error ?? r.status}`);
    const found = (r.json as { messages?: Array<{ id?: unknown }> } | null)?.messages ?? [];
    return found.flatMap((m) => (typeof m.id === "string" ? [m.id] : []));
  };
  const names = ["Message-ID", "X-Google-Original-Message-ID", "Subject"] as const;
  const sent = (id: string, m: { threadId: string | null; headers: Record<string, string> }): FoundSent => ({
    found: true,
    id,
    threadId: m.threadId,
    messageId: m.headers["message-id"] ?? null,
  });
  for (const id of await list(`rfc822msgid:<${minted}>`)) return sent(id, await gmailHeadersOf(token, id, names, deps));
  const after = Math.floor((want.sinceMs - FIND_SENT_SLACK_MS) / 1000);
  const subject = (want.subject ?? "").trim().toLowerCase();
  for (const id of await list(`in:sent to:${want.to} after:${Math.max(0, after)}`)) {
    const m = await gmailHeadersOf(token, id, names, deps);
    const ids = [m.headers["message-id"], m.headers["x-google-original-message-id"]].map(bare);
    if (ids.includes(minted) || (subject && (m.headers.subject ?? "").trim().toLowerCase() === subject))
      return sent(id, m);
  }
  return { found: false };
}

export async function gmailStop(token: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "google",
    `${GMAIL_API}/stop`,
    { method: "POST", headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 1 },
    deps,
  );
}
