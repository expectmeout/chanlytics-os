/**
 * A connected mailbox's past, listed through its own grant (decision 0073, R19): the messages newer than a moment, a page
 * at a time, under every folder but spam and the bin, as ids with their threads (and, from Graph, who wrote each before it
 * is read). The edge reads each one (gmailMessage, graphMessage), sorts it as the intake sorts any email (intake.ts
 * classifyReceived) and keeps mail from people and booking notices as before Chanlytics. Every call returns what it came
 * to and never throws (provider-fetch.ts); a token is the caller's to hold.
 */
import { providerFetch, type ProviderReply } from "../provider-fetch";
import { MAILBOX_READ_MS } from "./mailbox-read";
import { GRAPH_API } from "./mailbox-graph";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
/** A page of the past: Gmail lists up to five hundred ids a page, Graph fifty messages; a part reads a few pages. */
const GMAIL_PAGE = "200";
const MAIL_PAGE = 50;

type Deps = Parameters<typeof providerFetch>[3];

/** One message of the past, as the list names it: its id and thread, and (Graph's) its sender and when it came. */
export interface ListedMail {
  id: string;
  threadId: string | null;
  /** The sender's address, lower-cased, where the list says it (Graph); null where it does not (Gmail's list is ids). */
  from: string | null;
}

/** A page of the past: the messages on it, and where the next page starts (null at the last). */
export type MailPage = { ok: true; listed: ListedMail[]; next: string | null } | { ok: false; reply: ProviderReply };

/** The span a history read covers: from its first moment, up to (not including) the moment the mailbox connected. */
export interface MailWindow {
  from: string;
  to: string;
  /** Only mail from this address: a sender the owner brought in (00483). A lower-cased address, never a query. */
  sender?: string;
}

const seconds = (iso: string): number => Math.max(0, Math.floor(Date.parse(iso) / 1000));

/**
 * Gmail's messages received inside the window, newest first, every label but spam and the bin (the list's default),
 * mail sent from the mailbox among them: the owner's replies are half of a thread with a person.
 */
export async function gmailListSince(
  token: string,
  window: MailWindow,
  pageToken: string | null,
  deps?: Deps,
): Promise<MailPage> {
  const q = new URLSearchParams({
    q: `after:${seconds(window.from)} before:${seconds(window.to)}${window.sender ? ` from:${window.sender}` : ""}`,
    maxResults: GMAIL_PAGE,
  });
  if (pageToken) q.set("pageToken", pageToken);
  const r = await providerFetch(
    "google",
    `${GMAIL_API}/messages?${q.toString()}`,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") return { ok: false, reply: r };
  const j = r.json as { messages?: Array<{ id?: unknown; threadId?: unknown }>; nextPageToken?: unknown } | null;
  return {
    ok: true,
    listed: (j?.messages ?? []).flatMap((m) =>
      typeof m.id === "string"
        ? [{ id: m.id, threadId: typeof m.threadId === "string" ? m.threadId : null, from: null }]
        : [],
    ),
    next: typeof j?.nextPageToken === "string" ? j.nextPageToken : null,
  };
}

/**
 * Graph's messages received inside the window, newest first, in every folder (the inbox, its rules' folders and Sent
 * Items alike), drafts left out; `link` is the page Graph named next. Junk and Deleted Items are listed too, and the
 * sorting keeps what a person wrote.
 */
export async function graphListSince(
  token: string,
  window: MailWindow,
  link: string | null,
  deps?: Deps,
): Promise<MailPage> {
  const from = window.sender ? ` and from/emailAddress/address eq '${window.sender.replace(/'/g, "''")}'` : "";
  const filter = encodeURIComponent(
    `receivedDateTime ge ${window.from} and receivedDateTime lt ${window.to} and isDraft eq false${from}`,
  );
  const url =
    link ??
    `${GRAPH_API}/me/messages?$filter=${filter}&$select=id,conversationId,from,receivedDateTime&$orderby=receivedDateTime desc&$top=${MAIL_PAGE}`;
  const r = await providerFetch(
    "microsoft",
    url,
    { headers: { Authorization: `Bearer ${token}` }, timeoutMs: MAILBOX_READ_MS, idempotent: true, tries: 2 },
    deps,
  );
  if (r.outcome !== "ok") return { ok: false, reply: r };
  const j = r.json as {
    value?: Array<{ id?: unknown; conversationId?: unknown; from?: { emailAddress?: { address?: unknown } } }>;
    "@odata.nextLink"?: unknown;
  } | null;
  return {
    ok: true,
    listed: (j?.value ?? []).flatMap((v) =>
      typeof v.id === "string"
        ? [
            {
              id: v.id,
              threadId: typeof v.conversationId === "string" ? v.conversationId : null,
              from:
                typeof v.from?.emailAddress?.address === "string" ? v.from.emailAddress.address.toLowerCase() : null,
            },
          ]
        : [],
    ),
    next: typeof j?.["@odata.nextLink"] === "string" ? j["@odata.nextLink"] : null,
  };
}
