/**
 * Microsoft 365 mail, through Graph and the mailbox's own delegated grant (decision 0056): who it is, an email sent
 * from it (a draft made from the MIME, so its Message-ID and conversation are known before it leaves, then sent), one
 * message read, what changed in the inbox since a delta link, and the subscription that tells the edge when something
 * did. Every call returns what it came to and never throws (provider-fetch.ts).
 */
import { DAY_MS } from "@chanlytics/contracts";
import { providerFetch, type ProviderReply, type SendOutcome } from "../provider-fetch";
import { FIND_SENT_SLACK_MS, MAILBOX_READ_MS, readVerdictOf, type FoundSent, type ReadVerdict } from "./mailbox-read";

export const GRAPH_API = "https://graph.microsoft.com/v1.0";
/** A send's bound, for each of its two calls. */
const GRAPH_SEND_MS = 15_000;
/** A subscription on messages lives at most 10,080 minutes; it is renewed a day before it lapses. */
const GRAPH_SUBSCRIPTION_MS = 6 * DAY_MS;

type Deps = Parameters<typeof providerFetch>[3];

/** The MIME's bytes as base64, as Graph takes a message: UTF-8, though the MIME writer keeps to ASCII. */
function base64Of(text: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin);
}

const auth = (token: string, type?: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  ...(type ? { "Content-Type": type } : {}),
});

/** Graph's own word for why a call was refused (error.code), when it gave one. */
function graphReasonOf(r: Pick<ProviderReply, "json">): string | null {
  const code = (r.json as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === "string" ? code : null;
}

/** The mailbox's day used up: Exchange's sending limits answer a send so. */
export function graphDayUsed(r: Pick<ProviderReply, "status" | "json" | "text">): boolean {
  const code = graphReasonOf(r) ?? "";
  return (
    /ErrorExceededMessageLimit|ErrorQuotaExceeded|SendAsDenied.*limit/i.test(code) ||
    /exceeded.*(recipient|message).*limit|sending limit/i.test(r.text)
  );
}

/** Whether the grant is gone, or the mailbox cannot be reached by Graph: the owner connects it again. */
export function graphSignedOut(r: Pick<ProviderReply, "status" | "json">): boolean {
  const code = graphReasonOf(r) ?? "";
  return (
    r.status === 401 ||
    /InvalidAuthenticationToken|MailboxNotEnabledForRESTAPI|ErrorAccessDenied|ErrorSendAsDenied/i.test(code)
  );
}

/**
 * Graph's refusal of one message's read, judged (mailbox-read.ts readVerdictOf), with its code: Graph says a pace with
 * 429 and Retry-After, and a limit's code names it.
 */
export function graphReadVerdict(r: Pick<ProviderReply, "status" | "json" | "retryAfterMs">): ReadVerdict {
  return readVerdictOf(r, graphReasonOf(r), /throttl|limit|quota/i);
}

/** Who the grant is: the account's id, its address and its name; null when Graph could not say. */
export async function graphMe(
  token: string,
  deps?: Deps,
): Promise<{ id: string; address: string | null; name: string | null } | null> {
  const r = await providerFetch(
    "microsoft",
    `${GRAPH_API}/me?$select=id,mail,userPrincipalName,displayName`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  const j = r.json as { id?: unknown; mail?: unknown; userPrincipalName?: unknown; displayName?: unknown } | null;
  if (r.outcome !== "ok" || typeof j?.id !== "string") return null;
  const address =
    typeof j.mail === "string" && j.mail
      ? j.mail
      : typeof j.userPrincipalName === "string"
        ? j.userPrincipalName
        : null;
  return {
    id: j.id,
    address: address ? address.toLowerCase() : null,
    name: typeof j.displayName === "string" ? j.displayName : null,
  };
}

/** The account's inbox, read once at connect: an account with no Exchange mailbox answers it with a refusal. */
export async function graphInbox(token: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "microsoft",
    `${GRAPH_API}/me/mailFolders/inbox?$select=id`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
}

/**
 * Whether Graph said the account has no mailbox to send from: no Exchange Online mailbox or licence (404
 * MailboxNotEnabledForRESTAPI), one held on-premises, or a 403 that refuses the mailbox itself to a grant that holds
 * the mail scopes (a licence missing).
 */
export function graphNoMailbox(r: Pick<ProviderReply, "status" | "json">): boolean {
  const code = graphReasonOf(r) ?? "";
  return (
    (r.status === 404 && /MailboxNotEnabledForRESTAPI|MailboxNotSupportedForRESTAPI|ResourceNotFound/i.test(code)) ||
    (r.status === 403 && /ErrorAccessDenied/i.test(code))
  );
}

export interface GraphSent {
  ok: boolean;
  status: number;
  outcome: SendOutcome;
  /** Graph's id for the message, its Message-ID and its conversation: known from the draft, before it left. */
  id: string | null;
  messageId: string | null;
  threadId: string | null;
  error: string | null;
  reply: ProviderReply;
}

/**
 * The MIME as a draft (POST /me/messages, text/plain, base64), then the draft sent (POST .../send). A draft that could
 * not be made sent nothing; one made and refused is deleted, so the business's Drafts keep no half-sent email. Only the
 * second call may leave an email whose outcome is unknown.
 */
export async function graphSend(
  token: string,
  mime: string,
  p: { deadlineMs?: number } = {},
  deps?: Deps,
): Promise<GraphSent> {
  const bound = Math.min(GRAPH_SEND_MS, p.deadlineMs ?? GRAPH_SEND_MS);
  const draft = await providerFetch(
    "microsoft",
    `${GRAPH_API}/me/messages`,
    {
      method: "POST",
      headers: auth(token, "text/plain"),
      body: base64Of(mime),
      timeoutMs: bound,
      tries: 1,
      breaker: "count",
    },
    deps,
  );
  const d = draft.json as { id?: unknown; internetMessageId?: unknown; conversationId?: unknown } | null;
  if (draft.outcome !== "ok" || typeof d?.id !== "string")
    return {
      ok: false,
      status: draft.status,
      // A draft never left: whatever came of the call, nothing went to anyone.
      outcome: draft.outcome === "unknown" ? "retryable" : draft.outcome,
      id: null,
      messageId: null,
      threadId: null,
      error: graphReasonOf(draft) ?? draft.error ?? `status ${draft.status}`,
      reply: draft,
    };
  const sent = await providerFetch(
    "microsoft",
    `${GRAPH_API}/me/messages/${encodeURIComponent(d.id)}/send`,
    { method: "POST", headers: auth(token), timeoutMs: bound, tries: 1, breaker: "count" },
    deps,
  );
  // A send Graph refused left nothing but its draft, which would sit in the business's Drafts: it goes. One whose
  // outcome is unknown may have left, so its draft is the reconciliation's to judge (graphFindSent), never deleted here.
  if (sent.outcome !== "ok" && sent.outcome !== "unknown")
    await graphDeleteMessage(token, d.id, deps).catch(() => null);
  return {
    ok: sent.outcome === "ok",
    status: sent.status,
    outcome: sent.outcome,
    id: d.id,
    messageId: typeof d.internetMessageId === "string" ? d.internetMessageId : null,
    threadId: typeof d.conversationId === "string" ? d.conversationId : null,
    error: sent.outcome === "ok" ? null : (graphReasonOf(sent) ?? sent.error ?? `status ${sent.status}`),
    reply: sent,
  };
}

const MESSAGE_FIELDS =
  "id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,internetMessageHeaders,hasAttachments";

/** One message, its body as text, with its headers (mailbox-read.ts graphEmailOf reads it). */
export async function graphMessage(token: string, id: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "microsoft",
    `${GRAPH_API}/me/messages/${encodeURIComponent(id)}?$select=${MESSAGE_FIELDS}`,
    {
      headers: { ...auth(token), Prefer: 'outlook.body-content-type="text"' },
      timeoutMs: MAILBOX_READ_MS,
      idempotent: true,
      tries: 2,
    },
    deps,
  );
}

/** What a delta read said: the messages added to the inbox, with their conversations, and where to read from next. */
export type GraphDelta =
  | {
      ok: true;
      added: Array<{ id: string; threadId: string | null; from: string | null }>;
      nextLink: string | null;
      deltaLink: string | null;
    }
  | { ok: false; expired: boolean; reply: ProviderReply };

/**
 * The inbox's messages since a delta link; with none, those received since `sinceIso` (a delta started from now, so
 * the messages already there are never enumerated). A link Graph no longer keeps is `expired`.
 */
export async function graphDelta(
  token: string,
  link: string | null,
  deps?: Deps,
  sinceIso: string = new Date().toISOString(),
): Promise<GraphDelta> {
  const url =
    link ??
    `${GRAPH_API}/me/mailFolders/inbox/messages/delta?$select=id,conversationId,receivedDateTime,from&$filter=${encodeURIComponent(
      `receivedDateTime ge ${sinceIso}`,
    )}`;
  const r = await providerFetch(
    "microsoft",
    url,
    {
      headers: { ...auth(token), Prefer: "odata.maxpagesize=50" },
      timeoutMs: MAILBOX_READ_MS,
      idempotent: true,
      tries: 2,
    },
    deps,
  );
  if (r.outcome !== "ok")
    return { ok: false, expired: r.status === 410 || /SyncStateNotFound/i.test(r.text), reply: r };
  const j = r.json as {
    value?: Array<{
      id?: unknown;
      conversationId?: unknown;
      from?: { emailAddress?: { address?: unknown } };
      "@removed"?: unknown;
    }>;
    "@odata.nextLink"?: unknown;
    "@odata.deltaLink"?: unknown;
  } | null;
  return {
    ok: true,
    added: (j?.value ?? [])
      .filter((v) => typeof v.id === "string" && !v["@removed"])
      .map((v) => ({
        id: v.id as string,
        threadId: typeof v.conversationId === "string" ? v.conversationId : null,
        from: typeof v.from?.emailAddress?.address === "string" ? v.from.emailAddress.address.toLowerCase() : null,
      })),
    nextLink: typeof j?.["@odata.nextLink"] === "string" ? j["@odata.nextLink"] : null,
    deltaLink: typeof j?.["@odata.deltaLink"] === "string" ? j["@odata.deltaLink"] : null,
  };
}

/** A subscription to the inbox's new messages, told to `url` with `clientState`; its id and when it lapses. */
export async function graphSubscribe(
  token: string,
  url: string,
  clientState: string,
  nowMs: number,
  deps?: Deps,
): Promise<{ ok: true; id: string; expiresAt: number } | { ok: false; reply: ProviderReply }> {
  const r = await providerFetch(
    "microsoft",
    `${GRAPH_API}/subscriptions`,
    {
      method: "POST",
      headers: auth(token, "application/json"),
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: url,
        resource: "me/mailFolders('inbox')/messages",
        expirationDateTime: new Date(nowMs + GRAPH_SUBSCRIPTION_MS).toISOString(),
        clientState,
      }),
      timeoutMs: MAILBOX_READ_MS,
      tries: 1,
    },
    deps,
  );
  const j = r.json as { id?: unknown; expirationDateTime?: unknown } | null;
  const exp = typeof j?.expirationDateTime === "string" ? Date.parse(j.expirationDateTime) : NaN;
  if (r.outcome !== "ok" || typeof j?.id !== "string" || !Number.isFinite(exp)) return { ok: false, reply: r };
  return { ok: true, id: j.id, expiresAt: exp };
}

/** A subscription kept for another six days; `gone` when Graph no longer has it, and a new one is made. */
export async function graphRenew(
  token: string,
  id: string,
  nowMs: number,
  deps?: Deps,
): Promise<{ ok: true; expiresAt: number } | { ok: false; gone: boolean; reply: ProviderReply }> {
  const r = await providerFetch(
    "microsoft",
    `${GRAPH_API}/subscriptions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: auth(token, "application/json"),
      body: JSON.stringify({ expirationDateTime: new Date(nowMs + GRAPH_SUBSCRIPTION_MS).toISOString() }),
      timeoutMs: MAILBOX_READ_MS,
      idempotent: true,
      tries: 2,
    },
    deps,
  );
  const exp = Date.parse((r.json as { expirationDateTime?: string } | null)?.expirationDateTime ?? "");
  if (r.outcome !== "ok" || !Number.isFinite(exp)) return { ok: false, gone: r.status === 404, reply: r };
  return { ok: true, expiresAt: exp };
}

/** A message deleted: a refused send's draft, or one the reconciliation found never left. */
export async function graphDeleteMessage(token: string, id: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "microsoft",
    `${GRAPH_API}/me/messages/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 1 },
    deps,
  );
}

type Listed = {
  id?: unknown;
  conversationId?: unknown;
  internetMessageId?: unknown;
  isDraft?: unknown;
  subject?: unknown;
  toRecipients?: Array<{ emailAddress?: { address?: unknown } }>;
};

/** A page of messages, as Graph lists them; throws when Graph could not be asked. */
async function graphList(token: string, path: string, deps?: Deps): Promise<Listed[]> {
  const r = await providerFetch(
    "microsoft",
    `${GRAPH_API}${path}`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") throw new Error(`graph list: ${graphReasonOf(r) ?? r.error ?? r.status}`);
  const value = (r.json as { value?: unknown } | null)?.value;
  return Array.isArray(value) ? (value as Listed[]) : [];
}

const odataString = (s: string): string => `'${s.replace(/'/g, "''")}'`;
const bareId = (id: unknown): string => (typeof id === "string" ? id.trim().replace(/^<|>$/g, "").toLowerCase() : "");

/**
 * Whether the mailbox sent an email whose send's outcome was unknown (graphSend's second call timed out): by the
 * Message-ID it was made under, anywhere in the mailbox; then among what Sent Items holds since, by its subject and its
 * recipient. Our draft of it still a draft proves it never left (its id comes back to be deleted). Throws when Graph
 * could not be asked, and the caller looks again later.
 */
export async function graphFindSent(
  token: string,
  want: { messageId: string; to: string; subject: string | null; sinceMs: number },
  deps?: Deps,
): Promise<FoundSent> {
  const minted = bareId(want.messageId);
  const select = "$select=id,conversationId,internetMessageId,isDraft,subject,toRecipients";
  const sent = (m: Listed): FoundSent => ({
    found: true,
    id: String(m.id),
    threadId: typeof m.conversationId === "string" ? m.conversationId : null,
    messageId: typeof m.internetMessageId === "string" ? m.internetMessageId : null,
  });
  const byId = await graphList(
    token,
    `/me/messages?$filter=${encodeURIComponent(`internetMessageId eq ${odataString(`<${minted}>`)}`)}&${select}`,
    deps,
  );
  const left = byId.find((m) => typeof m.id === "string" && m.isDraft !== true);
  if (left) return sent(left);
  const draft = byId.find((m) => typeof m.id === "string" && m.isDraft === true);
  if (draft) return { found: false, draftId: String(draft.id) };
  // Exchange may have written its own Message-ID: what was sent to the address since, by its subject.
  const since = new Date(want.sinceMs - FIND_SENT_SLACK_MS).toISOString();
  const to = want.to.toLowerCase();
  const subject = (want.subject ?? "").trim().toLowerCase();
  const same = (m: Listed) =>
    typeof m.id === "string" &&
    !!subject &&
    typeof m.subject === "string" &&
    m.subject.trim().toLowerCase() === subject &&
    (m.toRecipients ?? []).some((r) => {
      const address = r.emailAddress?.address;
      return typeof address === "string" && address.toLowerCase() === to;
    });
  const recent = (field: string) => `$filter=${encodeURIComponent(`${field} ge ${since}`)}&$top=25&${select}`;
  const fromSent = (await graphList(token, `/me/mailFolders/sentitems/messages?${recent("sentDateTime")}`, deps)).find(
    same,
  );
  // Not in Sent Items: it never left. A draft of the same subject to the same address may be the owner's own, so only
  // the one found by our Message-ID above is ever handed back to be deleted.
  return fromSent ? sent(fromSent) : { found: false };
}

/**
 * What arrived in Junk Email since `sinceIso`, as ids, conversations and senders alone: a reply Exchange took for junk
 * is a reply all the same (the caller reads only threads a reach-out started). Graph keeps no delta of it here, so the
 * sync asks from its last read. Throws when Graph could not be asked.
 */
export async function graphJunkSince(
  token: string,
  sinceIso: string,
  deps?: Deps,
): Promise<Array<{ id: string; threadId: string | null; from: string | null }>> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const r = await providerFetch(
    "microsoft",
    `${GRAPH_API}/me/mailFolders/junkemail/messages?$filter=${filter}&$select=id,conversationId,from&$top=50`,
    { headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") throw new Error(`graph junk: ${graphReasonOf(r) ?? r.error ?? r.status}`);
  const value = (r.json as { value?: unknown } | null)?.value;
  return (Array.isArray(value) ? (value as Array<Listed & { from?: { emailAddress?: { address?: unknown } } }>) : [])
    .filter((v) => typeof v.id === "string")
    .map((v) => ({
      id: v.id as string,
      threadId: typeof v.conversationId === "string" ? v.conversationId : null,
      from: typeof v.from?.emailAddress?.address === "string" ? v.from.emailAddress.address.toLowerCase() : null,
    }));
}

export async function graphUnsubscribe(token: string, id: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "microsoft",
    `${GRAPH_API}/subscriptions/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 1 },
    deps,
  );
}
