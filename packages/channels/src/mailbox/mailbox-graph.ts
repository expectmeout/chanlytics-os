/**
 * Microsoft 365 mail, through Graph and the mailbox's own delegated grant (decision 0056): who it is, an email sent
 * from it (a draft made from the MIME, so its Message-ID and conversation are known before it leaves, then sent), one
 * message read, what changed in the inbox since a delta link, and the subscription that tells the edge when something
 * did. Every call returns what it came to and never throws (provider-fetch.ts).
 */
import { DAY_MS } from "@chanlytics/contracts";
import { providerFetch, type ProviderReply, type SendOutcome } from "../provider-fetch";
import { MAILBOX_READ_MS } from "./mailbox-read";

const GRAPH_API = "https://graph.microsoft.com/v1.0";
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
 * not be made sent nothing; one made and not sent is gone at the next try's draft, unsent. Only the second call may
 * leave an email whose outcome is unknown.
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

export async function graphUnsubscribe(token: string, id: string, deps?: Deps): Promise<ProviderReply> {
  return providerFetch(
    "microsoft",
    `${GRAPH_API}/subscriptions/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: auth(token), timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 1 },
    deps,
  );
}
