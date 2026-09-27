import "server-only";
import { z } from "zod";
import {
  ASK_CAPS,
  ESCALATION_REASON_LABELS,
  PERSON_CHANNEL_WORDS,
  clockStamp,
  messageText,
  noteRows,
  replyWhy,
  toInboxThreadVM,
  type PersonChannel,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { conversation } from "../../../readers/conversation";
import { escalations as escalationsReader } from "../../../readers/escalations";
import { inbox } from "../../../readers/inbox";
import { messageSearch } from "../../../readers/messages";
import { threadState } from "../../thread-state";
import { UUID, defineActions, noteRow, readAction, str, unlessNotFound, type ToolContext } from "../context";

/**
 * The open escalation the Inbox shows on each thread, as the page picks it
 * (legacy-bridge/surface-data.ts, inboxOverride): the open escalations come
 * newest first and the last one keyed for a thread wins, so a thread shows its
 * oldest. The inbox tool's two actions, list and thread, both pick with this.
 */
function inboxEscalations<E extends { conversation_id: string }>(open: E[]): Map<string, E> {
  return new Map(open.map((e) => [e.conversation_id, e]));
}

/**
 * Who wrote a message, as the inbox tool says it: the customer, the receptionist, or you (the team). One spelling for
 * the tool's two actions that answer messages, thread and search.
 */
const writerOf = (m: { direction: string; sender: string | null }): "customer" | "receptionist" | "you" =>
  m.direction === "inbound" ? "customer" : m.sender === "ai" ? "receptionist" : "you";

async function listThreads(t: ToolContext, input: { filter: string }): Promise<unknown> {
  const filter = str(input.filter) || "recent";
  // The Inbox as the page composes it (readers/inbox.ts): the newest hundred, and every escalated thread outside it.
  const { conversations, escalations } = (await load(t.rc, inbox, undefined)).data;
  const byConv = inboxEscalations(escalations);
  const vms = conversations.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, t.timezone, t.now));
  const matching = vms.filter((v) => {
    switch (filter) {
      case "needs_you":
        return v.needsYou;
      case "held":
        return !!v.veto || !!v.heldDraft;
      case "waiting":
        return v.takenOver;
      case "snoozed":
        return v.state === "snoozed";
      default:
        return true;
    }
  });
  // Recent alone is newest first, before the cap: the Inbox's rows put the escalated threads it fetched by id first,
  // however old, and twenty of them would have been the whole answer. lastAtMs is last_message_at, the column the
  // server orders the hundred by, so the hundred keep their order. Every other filter keeps the Inbox's order, the
  // fetched threads first, as the page lists them: the cap never drops a customer waiting outside the hundred.
  if (filter === "recent") matching.sort((a, b) => b.lastAtMs - a.lastAtMs);
  // Counted BEFORE the cap, like people.search's `matches` (read/people.ts).
  // Counted after, "total_matching" reported 20 for 25 held drafts.
  const picked = matching.slice(0, ASK_CAPS.threads);
  for (const v of picked) noteRow(t, "thread", v.conversationId, v.who, `inbox/th-${v.conversationId}`);
  return {
    filter,
    total_matching: matching.length,
    threads: picked.map((v) => ({
      conversation_id: v.conversationId,
      route: `inbox/th-${v.conversationId}`,
      who: v.who,
      state: threadState(v),
      held_draft: v.veto
        ? { message_id: v.veto.messageId, text: v.veto.draft.slice(0, 200), why: v.veto.why?.summary ?? null }
        : v.heldDraft
          ? { message_id: v.heldDraft.messageId, text: v.heldDraft.body.slice(0, 200) }
          : null,
      last_message: v.preview.slice(0, 160),
      recent: v.timeline
        .filter((x): x is Extract<typeof x, { type: "msg" }> => x.type === "msg")
        .slice(-3)
        .map((x) => ({
          from: x.from === "client" ? "customer" : x.byYou ? "you" : "receptionist",
          text: x.body.slice(0, 140),
        })),
      last_at: v.lastAtFull,
      waiting_min: v.waitingMin ?? null,
      window_open: v.windowOpen,
      // Which wire, from the one derivation (threadChannelOf/replyVia). This
      // said `tags`, which toInboxThreadVM sets to [] on every real thread --
      // a field that has never carried anything.
      channel: v.replyVia,
    })),
  };
}

async function getThread(t: ToolContext, input: { conversation_id: string; more?: boolean }): Promise<unknown> {
  const id = str(input.conversation_id);
  if (!UUID.test(id)) return { error: "conversation_id must be an id a tool returned" };
  const more = input.more === true;
  // The thread as its page reads it (readers/conversation.ts): the row under RLS and this workspace, then its hundred
  // newest messages with their wire and their attachment, so the window and the wire are the page's (ledger #5). The
  // open escalations beside it, as the Inbox reads them. Each once a turn; a thread not here is the reader's 404.
  const [r, open] = await Promise.all([
    unlessNotFound(load(t.rc, conversation, { id, before: null })),
    load(t.rc, escalationsReader, { state: "open" }),
  ]);
  if (!r) return { error: "no such conversation in this workspace" };
  const esc = inboxEscalations(open.data.escalations).get(id) ?? null;
  const cap = more ? ASK_CAPS.messagesMore : ASK_CAPS.messages;
  const dto = { ...r.data.conversation, messages: r.data.messages };
  // The page's own builder, over the page's own payload.
  const vm = toInboxThreadVM(dto, esc, t.timezone, t.now);
  // The thread and its person as the reader gave them, and the thread again where Conversations opens it.
  noteRows(t.read, r.rows);
  noteRow(t, "conversation", id, r.rows[0].label, `conversations/${id}`);
  return {
    conversation_id: id,
    route: `inbox/th-${id}`,
    contact_id: dto.contact.id || null,
    contact_route: dto.contact.id ? `clients/${dto.contact.id}` : null,
    // Named as the Inbox row names them, which is the reader's row: the route's payload carries no email, so its view
    // model would call a person reached only by email "Unknown" where the Inbox names them by their address. The
    // reader's first row is the thread.
    who: r.rows[0].label,
    channel: vm.replyVia,
    state: threadState(vm),
    escalation: esc
      ? { id: esc.id, reason: ESCALATION_REASON_LABELS[esc.reason] ?? esc.reason, details: esc.details }
      : null,
    window_open: vm.windowOpen,
    held_draft: vm.veto
      ? {
          message_id: vm.veto.messageId,
          text: vm.veto.draft,
          why: vm.veto.why
            ? { summary: vm.veto.why.summary, reason: vm.veto.why.reason, facts: vm.veto.why.facts }
            : null,
        }
      : null,
    messages: dto.messages.slice(-cap).map((m) => {
      const why = replyWhy(m.meta as Record<string, unknown> | null);
      return {
        // By the business's clock, as the pages say it: the time today, the date and the time before.
        at: clockStamp(Date.parse(m.created_at), t.timezone, t.now.getTime()),
        from: writerOf(m),
        text: messageText(m).slice(0, 600),
        status: m.status ?? null,
        ...(why ? { why: why.summary } : {}),
      };
    }),
    shown: Math.min(dto.messages.length, cap),
    more_available: dto.messages.length >= cap && !more,
  };
}

/** The most hits a search returns. */
const SEARCH_HITS = 20;

/** A message's wire in the pages' words (contracts PERSON_CHANNEL_WORDS: a call's note is Phone); none it does not name. */
const wireOf = (channel: string | null): string | null =>
  channel !== null && Object.hasOwn(PERSON_CHANNEL_WORDS, channel)
    ? PERSON_CHANNEL_WORDS[channel as PersonChannel]
    : null;

/**
 * Whether the words hold something to look for, as websearch_to_tsquery reads them (00219): in every group between
 * `or`s, a word or a "phrase" that is not left out (-word). Words that only leave things out, or hold no word at all,
 * find nothing whatever the workspace holds, so an empty answer to them never suggests another form of a word.
 */
function wordsToFind(words: string): boolean {
  const groups: boolean[][] = [[]];
  for (const m of words.matchAll(/(-?)"([^"]*)"?|(\S+)/g)) {
    if (m[3]?.toLowerCase() === "or") {
      groups.push([]);
      continue;
    }
    if (/[\p{L}\p{N}]/u.test(m[3] ?? m[2]))
      groups[groups.length - 1].push(m[3] !== undefined ? !m[3].startsWith("-") : m[1] !== "-");
  }
  const kept = groups.filter((g) => g.length > 0);
  return kept.length > 0 && kept.every((g) => g.some(Boolean));
}

async function searchSaid(t: ToolContext, input: { words: string; days?: number }): Promise<unknown> {
  if (!input.words.trim()) return { error: "words must say what to look for" };
  // The reader trims and cuts the words, bounds the window from the turn's clock and holds the cap (readers/messages.ts);
  // one hit more than is shown says exactly whether there are more.
  const { words, days, hits } = (
    await load(t.rc, messageSearch, { words: input.words, days: input.days ?? null, limit: SEARCH_HITS + 1 })
  ).data;
  const shown = hits.slice(0, SEARCH_HITS);
  // Each shown hit's row as the reader gave it: a message's thread, or the call. The one past the cap is not shown, so
  // it is no row an answer may cite.
  noteRows(
    t.read,
    shown.flatMap((h) => (h.ref ? [h.ref] : [])),
  );
  return {
    words,
    days,
    shown: shown.length,
    more_available: hits.length > SEARCH_HITS,
    hits: shown.map((h) => ({
      kind: h.kind,
      who: h.who,
      // By the business's clock, as inbox.thread says a message's time.
      at: clockStamp(Date.parse(h.at), t.timezone, t.now.getTime()),
      ...(h.kind === "message"
        ? {
            channel: wireOf(h.channel),
            // Who wrote it and what became of it, as inbox.thread says them; a call's note in its thread is recorded as
            // inbound whichever way the call went, so it is the call's note, never the customer's words.
            from:
              h.sent?.type === "call_summary"
                ? "call note"
                : writerOf({ direction: h.direction, sender: h.sent?.sender ?? null }),
            status: h.sent?.status ?? null,
            conversation_id: h.conversationId,
          }
        : { called_by: h.direction === "inbound" ? "customer" : "business", call_id: h.id }),
      snippet: h.snippet,
      route: h.ref?.route ?? null,
    })),
    ...(shown.length
      ? {}
      : {
          note: wordsToFind(words)
            ? `Nothing in the last ${days === 1 ? "day" : `${days} days`} holds these words. A word is found only as it was written: park does not find parking, so try the other form, or another word.`
            : "These words hold nothing to look for: words that only leave things out (-word), or no word at all, find nothing. Say a word to look for.",
        }),
  };
}

/**
 * The Inbox (D11): threads by state (list, once list_threads), one whole conversation (thread, once get_thread), and
 * what was said, found (search, the Phase 4 plan's D1: messages and call transcripts, readers/messages.ts).
 */
export const inboxTool = defineActions({
  name: "inbox",
  description:
    "The Inbox, on every wire (WhatsApp, text or email, whichever the customer last wrote on, named in channel).",
  tail: `Call action list to find threads by their state, and for what the page on screen does not hold; call action thread when the whole conversation is needed, since a row carries only the last three messages and the page on screen may hold only the thread's row. list returns at most ${ASK_CAPS.threads} threads, with total_matching counted before the cap, so a count is the total and never the rows shown. thread returns the newest ${ASK_CAPS.messages} messages, or ${ASK_CAPS.messagesMore} with more true; a conversation the workspace does not hold is an error, said in words.`,
  actions: {
    list: readAction({
      input: z.object({ filter: z.enum(["needs_you", "held", "waiting", "snoozed", "recent"]) }),
      examples: [{ filter: "held" }],
      label: "Reading the Inbox",
      words:
        "Action list takes filter and finds threads: needs_you (handed to a person), held (a draft waiting to send), waiting (taken over by a person), snoozed, or recent (all, newest first); each row has its state, its held draft when one waits, how long the customer has waited, whether the reply window is open, and its last three messages with who wrote them.",
      run: listThreads,
    }),
    thread: readAction({
      input: z.object({ conversation_id: z.string(), more: z.boolean().optional() }),
      examples: [{ conversation_id: "3b9d6f1e-7a2c-4d8e-9f01-2a3b4c5d6e7f" }],
      label: "Reading the conversation",
      words:
        "Action thread takes conversation_id, the id a row here, the today tool or people returned, and an optional more, and reads one conversation: the person, its state, the open escalation, whether the reply window is open, the held draft with why it was held, and the messages with who wrote each and why the receptionist answered or held as it did.",
      run: getThread,
    }),
    search: readAction({
      input: z.object({ words: z.string(), days: z.number().optional() }),
      examples: [{ words: "parking", days: 30 }],
      label: "Searching what was said",
      words: `Action search takes words, what to look for, and an optional days, and finds them in what was said: every message of the workspace (what customers wrote; what the receptionist or the team wrote to them, sent or not; and a call's note in its thread) and every call's transcript, newest first, none older than days back from now (30 unless asked, at most 90). Call it for a word, the name of a thing or a phrase, such as did anyone mention parking this month; call action list for threads by their state, and action thread for one whole conversation, which a message hit's conversation_id opens (calls with action get opens a call hit's call_id). words are looked for as they were written or said, in English or Spanish, never stemmed, so park does not find parking: when nothing is found, try the other form; "a phrase in quotes" finds the words together, -word leaves out what holds it, or finds either side, and words that only leave things out find nothing. It returns at most ${SEARCH_HITS} hits, with shown and more_available (whether there are more), each a message or a call with who it is with, when, the words around the match and the id that opens it; a message says its wire, who wrote it (customer, receptionist or you, as action thread says it, or call note for a call's note in its thread) and its status as action thread says it, and a message of the receptionist's or the team's whose status is queued (held, or not sent yet), canceled (before sending) or failed never reached the customer: say so, never that they were told it; a call says who placed it (called_by). A person's notes are not searched: people with action get reads them.`,
      run: searchSaid,
    }),
  },
});
