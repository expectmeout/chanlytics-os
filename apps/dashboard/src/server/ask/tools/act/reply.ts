import "server-only";
import { z } from "zod";
import {
  AppError,
  addressOf,
  BOOKING_REQUEST_REFUSALS,
  BOOKING_REQUEST_WORDS,
  asTenantId,
  contactName,
  isHeldDraft,
  mayMessageFor,
  namesMoney,
  replyWindow,
  slotShort,
  violatesNoPrices,
  type ConsentChannel,
} from "@chanlytics/contracts";
import { mayBegin } from "@chanlytics/core";
import { openRequestOfThread } from "@chanlytics/db";
import { beginPorts } from "../../../new-conversation/ports";
import { replyChannelOf } from "../../../verbs";
import {
  UUID,
  actAction,
  defineActions,
  noteRow,
  propose,
  refuse,
  str,
  type ProposalOutcome,
  type ToolContext,
} from "../context";

/**
 * What a first message on this thread would be refused for, or null. A thread nothing has come to answers nobody, so
 * the reply route judges what is approved there as a start (core beginConversation): the draft asks that verb's own
 * question (mayBegin) over this runtime's ports, and nothing is written. WhatsApp's shut window is not said here: the
 * card marks it, as it does on any thread.
 */
async function startRefusal(
  t: ToolContext,
  ask: { personId: string; conversationId: string; wire: ConsentChannel; text: string },
): Promise<string | null> {
  try {
    await mayBegin(beginPorts(t.ctx), {
      tenantId: asTenantId(t.tenantId),
      personId: ask.personId,
      wire: ask.wire,
      body: { text: ask.text },
      conv: { id: ask.conversationId },
    });
    return null;
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    return e.code === "window_closed" ? null : e.message;
  }
}

/** A thread a card names, in this workspace, with who it is with as the Inbox names them; null where there is none. */
async function threadOnCard(t: ToolContext, id: string) {
  const { data: conv, error } = await t.ctx.supabase
    .from("conversations")
    .select(
      "id, tenant_id, contact_id, state, last_inbound_at, last_wa_inbound_at, contacts (id, display_name, wa_profile_name, phone_e164, email, consent, dnc)",
    )
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return null;
  const who = contactName({
    contact: {
      id: conv.contacts?.id ?? "",
      display_name: conv.contacts?.display_name ?? null,
      wa_profile_name: conv.contacts?.wa_profile_name ?? null,
      phone_e164: conv.contacts?.phone_e164 ?? null,
      email: conv.contacts?.email ?? null,
      consent: null,
      dnc: false,
    },
  } as Parameters<typeof contactName>[0]);
  return { conv, who };
}

async function draftReply(
  t: ToolContext,
  input: { conversation_id: string; text: string; voice: string },
): Promise<ProposalOutcome> {
  const id = str(input.conversation_id, 40);
  const text = str(input.text, 1000);
  const voice = input.voice === "receptionist" ? "receptionist" : "you";
  if (!UUID.test(id)) return refuse("conversation_id must be an id a read returned");
  if (!text) return refuse("text is required");
  const thread = await threadOnCard(t, id);
  if (!thread) return refuse("no such conversation in this workspace");
  const { conv, who } = thread;
  // The one consent rule (mayMessageFor): a person who texted STOP (consent opted_out) is refused as a do-not-contact is,
  // here at the draft, not at the commit (defect 32). A reply answers them, so it is conversational.
  // The channel it will go out on: where they last wrote (the reply route's own rule).
  const channel = await replyChannelOf(t.ctx, conv);
  const may = mayMessageFor(
    { consent: conv.contacts?.consent ?? null, dnc: conv.contacts?.dnc ?? null },
    "conversational",
    // A reply in the thread they wrote in: theirs (contracts MessageAbout).
    { channel, about: "theirs" },
  );
  if (!may.ok) return refuse(`${who} opted out; nothing can be sent to them`);
  // The window the reply route will enforce, on the channel it will send on:
  // a texting thread has none, and this card used to call one closed.
  const win = replyWindow(channel, conv.last_wa_inbound_at, t.now);
  // Nothing has come to this thread from their side (the reply route's own test), so what is approved is a first
  // message, and what that would be refused for is said here, at the draft, not at the commit (defect 32).
  if (!conv.last_inbound_at) {
    const held = await startRefusal(t, { personId: conv.contact_id, conversationId: id, wire: channel, text });
    if (held)
      return refuse(
        `${who} has not written on this thread, so this would be a first message to them, and it cannot go: ${held}`,
      );
  }
  // Layer two, said on the card: a price or money (a refund, a discount, a payment term) in a reply is the person's to
  // send knowingly, never the receptionist's to promise (the charter).
  const price = violatesNoPrices(text) || namesMoney(text);
  noteRow(t, "thread", id, who, addressOf({ kind: "conversation", id }));
  return propose({
    kind: "reply",
    title: `Reply to ${who}`,
    summary: text,
    payload: { conversation_id: id, text, voice, who, window_open: win.open, price_warning: price },
  });
}

async function proposeSteer(
  t: ToolContext,
  input: { message_id: string; instruction: string },
): Promise<ProposalOutcome> {
  const id = str(input.message_id, 40);
  const instruction = str(input.instruction, 500);
  if (!UUID.test(id)) return refuse("message_id must be a held draft's id from a read");
  if (!instruction) return refuse("instruction is required");
  const { data: m, error } = await t.ctx.supabase
    .from("messages")
    .select("id, conversation_id, sender, status, body, type, direction, created_at")
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!m) return refuse("no such message in this workspace");
  if (
    !isHeldDraft({
      id: m.id,
      sender: m.sender as "ai",
      status: m.status ?? undefined,
      direction: m.direction as "outbound",
      type: m.type,
      body: m.body,
      created_at: m.created_at,
    } as Parameters<typeof isHeldDraft>[0])
  ) {
    return refuse("that reply is not waiting any more; there is nothing to rewrite");
  }
  noteRow(t, "thread", m.conversation_id, "The held reply", addressOf({ kind: "conversation", id: m.conversation_id }));
  return propose({
    kind: "steer",
    title: "Rewrite the held reply",
    summary: instruction,
    payload: { message_id: id, conversation_id: m.conversation_id, instruction, current: (m.body ?? "").slice(0, 300) },
  });
}

/**
 * The booking the receptionist asked for in a thread, answered (decision 0061; the operator, 15 Oct 2026): Booked it
 * books the time and drafts the reply the member sends, Can't lets it go and leaves the thread waiting on their reply,
 * as Today's row, the Inbox's thread and the Calendar's visit answer it. Nothing goes to the customer by the answer.
 */
async function proposeBooking(
  t: ToolContext,
  input: { conversation_id: string; booked: boolean },
): Promise<ProposalOutcome> {
  const id = str(input.conversation_id, 40);
  if (!UUID.test(id)) return refuse("conversation_id must be an id a read returned");
  const thread = await threadOnCard(t, id);
  if (!thread) return refuse("no such conversation in this workspace");
  const row = await openRequestOfThread(t.ctx.supabase, id);
  if (!row) return refuse(BOOKING_REQUEST_REFUSALS.none);
  const { who } = thread;
  const booked = input.booked === true;
  const asked = BOOKING_REQUEST_WORDS.hold(slotShort(Date.parse(row.starts_at), row.timezone), row.service);
  noteRow(t, "thread", id, who, addressOf({ kind: "conversation", id }));
  return propose({
    kind: "booking_request",
    title: `${booked ? BOOKING_REQUEST_WORDS.booked_it : BOOKING_REQUEST_WORDS.cant_it}: ${who}`,
    summary: booked
      ? `${asked}. Books it and drafts the reply for you to send; nothing goes to them by itself.`
      : `${asked}. Lets the time go; the thread waits on your reply.`,
    payload: { conversation_id: id, booked, who },
  });
}

/**
 * A reply (D11): a new one (draft, once draft_reply), a rewrite of one held (steer, once propose_steer), and the answer
 * to a booking the receptionist asked for in a thread (booking, decision 0061).
 */
export const propose_reply = defineActions({
  name: "propose_reply",
  description: "Propose a reply to a customer, as a card the person approves before anything is sent.",
  tail: "Call action draft when they ask to reply, answer or write to someone, and action steer when they want a held draft changed. draft refuses a person who opted out and marks a closed reply window on the card; never quote or confirm a price in the text. steer refuses in words a reply that is no longer waiting, so read the thread first when in doubt.",
  actions: {
    draft: actAction({
      kind: "reply",
      input: z.object({
        conversation_id: z.string(),
        text: z.string(),
        voice: z.enum(["you", "receptionist"]),
      }),
      examples: [
        { conversation_id: "3b9d6f1e-7a2c-4d8e-9f01-2a3b4c5d6e7f", text: "Yes, Saturday at ten works.", voice: "you" },
      ],
      label: "Drafting a reply",
      words:
        "Action draft takes conversation_id, the id a read returned, text, the reply itself, and voice, you for the person's own words or receptionist for the receptionist's voice, and proposes a new reply on a thread, on the wire the thread runs on.",
      build: draftReply,
    }),
    steer: actAction({
      kind: "steer",
      input: z.object({ message_id: z.string(), instruction: z.string() }),
      examples: [{ message_id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b", instruction: "shorter, and in Spanish" }],
      label: "Preparing a rewrite",
      words:
        "Action steer takes message_id, the held draft's id from inbox (with action list or thread), never a conversation id, and instruction, a rewrite in words ('shorter', 'mention Saturday is full', 'in Spanish') of a reply the receptionist is holding; the rewrite waits its turn like the first draft.",
      build: proposeSteer,
    }),
    booking: actAction({
      kind: "booking_request",
      input: z.object({
        conversation_id: z.string(),
        booked: z.boolean().describe("true to book it (Booked it), false to let the time go (Can't)."),
      }),
      examples: [{ conversation_id: "3b9d6f1e-7a2c-4d8e-9f01-2a3b4c5d6e7f", booked: true }],
      label: "Preparing the booking's answer",
      words:
        "Action booking answers a booking the receptionist asked for in a thread (a hold that says Asked for a time): booked true books it and drafts the reply they send, booked false lets the time go and leaves the thread waiting on their reply. It takes the thread's conversation_id; one with no request waiting is refused in words.",
      build: proposeBooking,
    }),
  },
});
