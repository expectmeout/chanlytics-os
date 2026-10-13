/**
 * Gmail, through the mailbox's own grant (decision 0056): an email sent from it, the Message-ID and thread it went
 * under, what changed in it since a cursor, one message read, and the watch that tells the edge when something did.
 * Every call returns what it came to and never throws (provider-fetch.ts); a token is the caller's to hold.
 *
 *   gmailSend       users.messages.send, the raw MIME and the thread it belongs in. A send is never tried twice blind:
 *                   an unknown outcome is the caller's (deliver: outcome unknown, the clock reads it back).
 *   gmailThreadOf   the thread of an email by its Message-ID (q=rfc822msgid:), so a nudge goes in its parent's thread.
 *   gmailSentIds    a sent message's own Message-ID header, as Gmail kept it.
 *   gmailProfile    the address and the history cursor now.
 *   gmailHistory    what was added to the inbox since a cursor: message ids and their threads, never their words.
 *   gmailMessage    one message in full, for a thread the product started.
 *   gmailWatch      the inbox's changes published to the Pub/Sub topic; it lapses after seven days unless renewed.
 *   gmailStop       the watch ended, when the mailbox is removed.
 */
import { b64url } from "../google/google-oauth";
import { providerFetch, type ProviderReply, type SendOutcome } from "../provider-fetch";
import { MAILBOX_READ_MS } from "./mailbox-read";

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
 * Whether a refusal is the mailbox's own day used up (Gmail's sending limits): the mailbox rests until tomorrow, and
 * its sends wait. `rateLimitExceeded` alone is a pace (the next tick sends), never a day.
 */
export function gmailDayUsed(r: Pick<ProviderReply, "status" | "json" | "text">): boolean {
  const reason = gmailReasonOf(r) ?? "";
  return (
    reason === "dailyLimitExceeded" ||
    reason === "userRateLimitExceeded" ||
    /daily user sending limit exceeded|user-rate limit exceeded/i.test(r.text)
  );
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

/** What history said: the messages added since the cursor, with their threads, and the cursor to read from next. */
export type GmailHistory =
  | { ok: true; added: Array<{ id: string; threadId: string }>; next: string | null; nextPage: string | null }
  | { ok: false; expired: boolean; reply: ProviderReply };

/**
 * The messages added to the inbox since `startHistoryId`, a page at a time. A cursor Gmail no longer keeps (404) is
 * `expired`: the caller starts again from the profile's cursor, after reading the threads it knows directly.
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
    labelId: "INBOX",
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
    history?: Array<{ messagesAdded?: Array<{ message?: { id?: unknown; threadId?: unknown } }> }>;
    historyId?: unknown;
    nextPageToken?: unknown;
  } | null;
  const added: Array<{ id: string; threadId: string }> = [];
  for (const h of j?.history ?? [])
    for (const a of h.messagesAdded ?? []) {
      const m = a.message;
      if (typeof m?.id === "string" && typeof m.threadId === "string") added.push({ id: m.id, threadId: m.threadId });
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

/** The inbox's changes, published to the topic: the history cursor it starts from, and when it lapses (epoch ms). */
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
      body: JSON.stringify({ topicName: topic, labelIds: ["INBOX"], labelFilterBehavior: "include" }),
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

export async function gmailStop(token: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "google",
    `${GMAIL_API}/stop`,
    { method: "POST", headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 1 },
    deps,
  );
}
