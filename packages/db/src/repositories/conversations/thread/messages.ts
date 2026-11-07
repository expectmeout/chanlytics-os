/** Thread: messages. */

import {
  fencedInline,
  promptSafeName,
  type LeadChannel,
  clockDate,
  DAY_MS,
  dealSentence,
  offersFacts,
  disclosureFacts,
} from "@chanlytics/contracts";
import { IDS_PER_READ } from "../../people/pages";
import { DELIVERED, effectiveAt, type Db, type LeadContext } from "./history";
import { type Json } from "../../../database.types";

const NOTES_BUDGET = 1200;

/**
 * The team's notes as the receptionist hears them (0007): newest first, each dated, as many as fit the budget -- the
 * newest always, however long. Where the notes could not be read, the field they moved from (00054), as it was said.
 */
export function notesForReceptionist(lead: LeadContext, now = new Date(), tz = "UTC"): string | null {
  if (Array.isArray(lead.noteList)) {
    const parts: string[] = [];
    let used = 0;
    for (const n of lead.noteList) {
      const body = n.body.replace(/\s+/g, " ").trim();
      if (!body) continue;
      const t = Date.parse(n.at);
      const part = Number.isFinite(t) ? `(${clockDate(t, tz, now.getTime())}) ${body}` : body;
      if (parts.length && used + part.length > NOTES_BUDGET) break;
      parts.push(part);
      used += part.length + 2;
    }
    return parts.length
      ? `Notes from the team about them, newest first (use as facts, never read aloud or quoted): ${parts.join("; ")}`
      : null;
  }
  const notes = (lead.notes ?? "").replace(/\s+/g, " ").trim();
  return notes ? `Notes from the owner about them (use as facts, never read aloud or quoted): ${notes}` : null;
}

export function describeLead(
  lead: LeadContext,
  now = new Date(),
  tz = "UTC",
  /** The channel of the conversation this is read in: the ask for the yes to offers is for WhatsApp alone. */
  channel?: LeadChannel,
): string {
  if (!lead.contactId) return "New contact — no prior history on record.";
  const bits: string[] = [];
  // A name may be one the person gave themselves (a WhatsApp profile name): capped, one line, and fenced as their words,
  // so it can say nothing to the model (contracts ai/fence.ts; the one injection policy).
  const name = promptSafeName(lead.name);
  const theirs = lead.standIn
    ? " That is the business they are at, not their own name: never call them by it, and ask who you are speaking with if it helps."
    : "";
  bits.push(name ? `Name on record: ${fencedInline("profile_name", name)}.${theirs}` : "No name on record.");
  // Whether an address is on file, so the receptionist asks for one only when there is none (booking rule ask_email);
  // a reader that never learned it (undefined) says nothing rather than a guess.
  if (lead.hasEmail === true) bits.push("Their email address is on file.");
  else if (lead.hasEmail === false) bits.push("No email address on file.");
  // What they answered about offers, whether they were asked for the yes, a text conversation said to be one, and one
  // already under way: the rules that ask for the yes once (contracts offers-ask.ts) and open by saying it is an
  // automated assistant (assistant-disclosure.ts) read these; a reader that never learned them says nothing.
  bits.push(
    ...offersFacts(lead, channel, now, tz),
    ...disclosureFacts({ returning: lead.returning, lastTurnAt: lead.lastSeenAt }, channel, now),
  );
  if (lead.returning) {
    const days = lead.lastSeenAt ? Math.floor((now.getTime() - new Date(lead.lastSeenAt).getTime()) / DAY_MS) : null;
    const when =
      days === null
        ? ""
        : days <= 0
          ? " Last in touch today."
          : days === 1
            ? " Last in touch yesterday."
            : ` Last in touch ${days} days ago.`;
    bits.push(`Returning contact.${when}`);
  } else {
    bits.push("First time reaching out.");
  }
  if (lead.optedOut) bits.push("They have asked not to receive messages.");
  // The team's own words about them: facts to use, never to recite.
  const notes = notesForReceptionist(lead, now, tz);
  if (notes) bits.push(notes);
  // Their deal (0004): one sentence per stage, never an amount. Where a proposal link is on file, the link's own rule
  // answers a price question, so the proposal's sentence points at it instead of promising a follow-up.
  const deal = dealSentence(lead.deal ?? null, now.getTime(), tz, { hasLink: !!(lead.proposalUrl ?? "").trim() });
  if (deal) bits.push(deal);
  // Each other open deal of theirs (0029), its own sentence: a client of one service with a proposal out for another
  // hears both.
  const others = lead.otherDeals ?? [];
  for (const d of others) {
    const sentence = dealSentence(d, now.getTime(), tz, { hasLink: !!(d.proposal_url ?? "").trim() });
    if (sentence) bits.push(sentence);
  }
  const links = proposalLinkWords(lead);
  if (links) bits.push(links);
  return bits.join(" ");
}

/**
 * The owner's priced answer for this person is a link (00154), the deal's now (0008): the receptionist hands it over and
 * prices nothing itself, and no link is nothing said. With one deal open, its link answers a price question. With several
 * (0029), each link is named by its service and answers for that proposal alone: a client's engagement, and a proposal
 * out with no link, keep their own sentences (dealSentence), so a question about one never gets another's link.
 */
function proposalLinkWords(lead: LeadContext): string | null {
  const others = lead.otherDeals ?? [];
  const links = [
    { url: (lead.proposalUrl ?? "").trim(), service: lead.deal?.service ?? null },
    ...others
      .filter((d) => d.stage === "proposed")
      .map((d) => ({ url: (d.proposal_url ?? "").trim(), service: d.service })),
  ].filter((x) => x.url);
  const [first] = links;
  if (!first) return null;
  if (!others.length)
    return `The owner has a proposal ready for them at ${first.url}. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out — say it is being sent to them in writing.`;
  const rest =
    "and state none of its figures; a question about any other deal of theirs follows that deal's own sentence; on a call, never read an address out — say it is being sent to them in writing.";
  if (links.length === 1)
    return `The owner has a proposal${first.service ? ` for ${first.service}` : ""} ready for them at ${first.url}. If they ask about that proposal, its price or a quote for it, send that link ${rest}`;
  const named = links.map((x) => (x.service ? `${x.service} at ${x.url}` : x.url)).join("; ");
  return `The owner has proposals ready for them: ${named}. If they ask about one of these, its price or a quote for it, send the link for the one they mean (ask which, if it is not clear) ${rest}`;
}

/* -------------------------------------------------------------------------
 * The words a thread or a call said, found (00219).
 * ---------------------------------------------------------------------- */

/** A message that holds the words, or a call whose transcript does, as search_messages answers it. */
export interface MessageHit {
  /** A message (a call_summary among them), or a call found by its transcript. */
  kind: "message" | "call";
  /** The message's id, or the call's. */
  id: string;
  /** The thread it is on: a message always has one; a call may not. */
  conversationId: string | null;
  contactId: string | null;
  /** A message's channel; null for a call. */
  channel: string | null;
  direction: string;
  /** When it was sent, or when the call started (when it was recorded, where the call never said). */
  at: string;
  /** The words around the match, as written, with no markup. */
  snippet: string;
}

/** A hit's kind as the database spells it; anything else is a function this code was not written against. */
function hitKind(kind: string): MessageHit["kind"] {
  if (kind === "message" || kind === "call") return kind;
  throw new Error(`searchMessages: unknown kind ${kind}`);
}

/**
 * The workspace's messages and call transcripts that hold these words, newest first: none older than `since`, at most
 * `limit` (the database clamps it to 1–50). The words are websearch_to_tsquery's, so a quoted phrase, `or` and `-word`
 * mean what a search box means. Blank words, and words whose query could match a message holding none of them (only
 * exclusions, or an `or` with one: `valet or -parking`), answer nothing; so does a limit that is no number (NaN reaches
 * the database as null, and the function is strict). Under the caller's row security on a session client. A read that
 * fails THROWS, and so does a row of a kind this does not know: a search the database could not answer is never "nobody
 * said it", and a hit is never labelled what it is not.
 */
export async function searchMessages(
  db: Db,
  tenantId: string,
  words: string,
  since: Date,
  limit: number,
): Promise<MessageHit[]> {
  const { data, error } = await db.rpc("search_messages", {
    p_tenant: tenantId,
    p_words: words,
    p_since: since.toISOString(),
    p_limit: limit,
  });
  if (error) throw new Error(`searchMessages: ${error.message}`);
  // The generated row types every column as present; a call's channel, and a call's thread and person, may be null.
  return (data ?? []).map((r): MessageHit => ({
    kind: hitKind(r.kind),
    id: r.id,
    conversationId: r.conversation_id ?? null,
    contactId: r.contact_id ?? null,
    channel: r.channel ?? null,
    direction: r.direction,
    at: r.at,
    snippet: r.snippet ?? "",
  }));
}

/** What a message hit does not carry: who sent it, what became of it, and its kind. */
export interface MessageSender {
  id: string;
  /** customer, ai, human or system: who of the business wrote an outbound message, which its direction does not say. */
  sender: string;
  /** What became of it: a business message queued, canceled or failed never reached the customer. */
  status: string;
  /** text, template, media, call_summary (a call's note in its thread) or note. */
  type: string;
}

/**
 * What the provider (or the ledger) said about these FAILED messages: `messages.error`, by id, for the ones that say
 * something. newest_messages (00258), the Inbox's read of every thread's messages, answers twelve columns and error is
 * not one of them, so the reader asks for the few failed rows' errors here, in one read for a hundred ids or fewer
 * (IDS_PER_READ), under the caller's row security and the workspace's own filter. A read that fails THROWS.
 */
export async function listFailedMessageErrors(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<Array<{ id: string; error: Record<string, unknown> }>> {
  const out: Array<{ id: string; error: Record<string, unknown> }> = [];
  for (let index = 0; index < ids.length; index += IDS_PER_READ) {
    const { data, error } = await db
      .from("messages")
      .select("id, error")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .in("id", ids.slice(index, index + IDS_PER_READ));
    if (error) throw new Error(`listFailedMessageErrors: ${error.message}`);
    for (const r of data ?? [])
      if (r.error !== null && typeof r.error === "object" && !Array.isArray(r.error))
        out.push({ id: r.id, error: r.error });
  }
  return out;
}

/**
 * Who sent these messages and what became of them, by id, in one read for a hundred ids or fewer (IDS_PER_READ), under
 * the caller's row security and the workspace's own filter: a message the caller cannot read is not answered. A read
 * that fails THROWS.
 */
export async function listMessageSenders(db: Db, tenantId: string, ids: readonly string[]): Promise<MessageSender[]> {
  const out: MessageSender[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("messages")
      .select("id, sender, status, type")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`listMessageSenders: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * Whether a reply names a message (`meta.reply_to`, written by the edge's sink and draft writer), in the message's own
 * thread, whatever became of it: one that left, a draft waiting or withdrawn (the owner's veto, a newer message's turn),
 * or one the wire refused. Any of them means the turn that answered the message reached its answer. Throws when it
 * cannot be read: a reply that could not be looked for is not one that is known to be missing.
 */
export async function wasRepliedTo(
  db: Db,
  tenantId: string,
  conversationId: string,
  messageId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("meta->>reply_to", messageId)
    .limit(1);
  if (error) throw new Error(`wasRepliedTo: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * When the customer sent the message a reply answers (its `meta.reply_to`, in the reply's own thread), as the provider
 * stamped it or else as it came in (effectiveAt); for a reply that names none, or one no longer there, when the reply
 * itself was written; null for no reply to measure. What the send door measures a held draft's lateness from (core
 * deliver.ts). Throws when it cannot be read: a reply whose age could not be read is not one known to be on time.
 */
export async function replyAnswersAt(
  db: Db,
  params: { tenantId: string; conversationId: string; messageId?: string | null },
): Promise<number | null> {
  if (!params.messageId) return null;
  const { data: reply, error } = await db
    .from("messages")
    .select("created_at, meta")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.messageId)
    .maybeSingle();
  if (error) throw new Error(`replyAnswersAt: ${error.message}`);
  if (!reply) return null;
  const answers = (reply.meta as { reply_to?: unknown } | null)?.reply_to;
  if (typeof answers !== "string" || !answers) return Date.parse(reply.created_at);
  const { data: asked, error: askedError } = await db
    .from("messages")
    .select("channel_ts, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("conversation_id", params.conversationId)
    .eq("id", answers)
    .maybeSingle();
  if (askedError) throw new Error(`replyAnswersAt: ${askedError.message}`);
  return effectiveAt(asked ?? { channel_ts: null, created_at: reply.created_at });
}

/**
 * Whether a text of ours has ever reached the person on this thread: what decides the line the first text to a number
 * carries (the rates, STOP and HELP the campaign's filing promises). readThreadState answers it for the receptionist;
 * this asks the same of the same rows for a conversation a member begins (core conversations/begin.ts).
 */
export async function wasTextReached(db: Db, tenantId: string, conversationId: string): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("channel", "sms")
    .in("status", DELIVERED)
    .limit(1);
  if (error) throw new Error(`wasTextReached: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * A member opens a person's one thread (conversation_open, 00351), as themselves: the thread's id, made when they had
 * none. The door's refusals are thrown as they came (a person who is not this workspace's, or gone).
 */
export async function openConversation(db: Db, tenantId: string, contactId: string): Promise<string> {
  const { data, error } = await db.rpc("conversation_open", { p_tenant_id: tenantId, p_contact_id: contactId });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("conversation_open: the door answered no thread");
  return data;
}

/**
 * The wire the business's own written words last went by on one thread, or null when it has written none: what a
 * thread nothing has come to is answered on (contracts answerWireOf says the same of the messages a page holds).
 */
export async function findOurLastWire(db: Db, tenantId: string, conversationId: string): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .select("channel")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .in("type", ["text", "template", "media"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reading the last outbound: ${error.message}`);
  return data?.channel ?? null;
}

/** What a message carries (its media, with where it is stored or why it is not) written on the workspace's row. */
export const saveMessageMedia = async (db: Db, tenantId: string, messageId: string, media: Json) =>
  db.from("messages").update({ media }).eq("id", messageId).eq("tenant_id", tenantId);
