import "server-only";
import { z } from "zod";
import {
  ASK_CAPS,
  ESCALATION_REASON_LABELS,
  clockStamp,
  messageText,
  replyWhy,
  toInboxThreadVM,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { conversation } from "../../../readers/conversation";
import { escalations as escalationsReader } from "../../../readers/escalations";
import { inbox } from "../../../readers/inbox";
import { threadState } from "../../thread-state";
import { UUID, defineActions, readAction, str, unlessNotFound, type ToolContext } from "../context";

/**
 * The open escalation the Inbox shows on each thread, as the page picks it
 * (legacy-bridge/surface-data.ts, inboxOverride): the open escalations come
 * newest first and the last one keyed for a thread wins, so a thread shows its
 * oldest. The inbox tool's two actions, list and thread, both pick with this.
 */
function inboxEscalations<E extends { conversation_id: string }>(open: E[]): Map<string, E> {
  return new Map(open.map((e) => [e.conversation_id, e]));
}

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
  for (const v of picked) t.read.thread.add(v.conversationId);
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
  t.read.thread.add(id);
  t.read.conversation.add(id);
  if (dto.contact.id) t.read.person.add(dto.contact.id);
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
        from: m.direction === "inbound" ? "customer" : m.sender === "ai" ? "receptionist" : "you",
        text: messageText(m).slice(0, 600),
        status: m.status ?? null,
        ...(why ? { why: why.summary } : {}),
      };
    }),
    shown: Math.min(dto.messages.length, cap),
    more_available: dto.messages.length >= cap && !more,
  };
}

/** The Inbox (D11): threads by state (list, once list_threads) and one whole conversation (thread, once get_thread). */
export const inboxTool = defineActions({
  name: "inbox",
  description: `The Inbox, on every wire (WhatsApp, text or email, whichever the customer last wrote on, named in channel). Action list takes filter and finds threads: needs_you (handed to a person), held (a draft waiting to send), waiting (taken over by a person), snoozed, or recent (all, newest first); each row has its state, its held draft when one waits, how long the customer has waited, whether the reply window is open, and its last three messages with who wrote them. Action thread takes conversation_id, the id a row here, the today tool or people returned, and an optional more, and reads one conversation: the person, its state, the open escalation, whether the reply window is open, the held draft with why it was held, and the messages with who wrote each and why the receptionist answered or held as it did. Call action list to find threads by their state, and for what the page on screen does not hold; call action thread when the whole conversation is needed, since a row carries only the last three messages and the page on screen may hold only the thread's row. list returns at most ${ASK_CAPS.threads} threads, with total_matching counted before the cap, so a count is the total and never the rows shown. thread returns the newest ${ASK_CAPS.messages} messages, or ${ASK_CAPS.messagesMore} with more true; a conversation the workspace does not hold is an error, said in words.`,
  actions: {
    list: readAction({
      input: z.object({ filter: z.enum(["needs_you", "held", "waiting", "snoozed", "recent"]) }),
      examples: [{ filter: "held" }],
      label: "Reading the Inbox",
      run: listThreads,
    }),
    thread: readAction({
      input: z.object({ conversation_id: z.string(), more: z.boolean().optional() }),
      examples: [{ conversation_id: "3b9d6f1e-7a2c-4d8e-9f01-2a3b4c5d6e7f" }],
      label: "Reading the conversation",
      run: getThread,
    }),
  },
});
