import "server-only";
import { z } from "zod";
import {
  contactName,
  isHeldDraft,
  mayMessageFor,
  namesMoney,
  replyWindow,
  violatesNoPrices,
} from "@chanlytics/contracts";
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

async function draftReply(
  t: ToolContext,
  input: { conversation_id: string; text: string; voice: string },
): Promise<ProposalOutcome> {
  const id = str(input.conversation_id, 40);
  const text = str(input.text, 1000);
  const voice = input.voice === "receptionist" ? "receptionist" : "you";
  if (!UUID.test(id)) return refuse("conversation_id must be an id a read returned");
  if (!text) return refuse("text is required");
  const { data: conv, error } = await t.ctx.supabase
    .from("conversations")
    .select(
      "id, tenant_id, state, last_wa_inbound_at, contacts (id, display_name, wa_profile_name, phone_e164, email, consent, dnc)",
    )
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) return refuse("no such conversation in this workspace");
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
  // The one consent rule (mayMessageFor): a person who texted STOP (consent opted_out) is refused as a do-not-contact is,
  // here at the draft, not at the commit (defect 32). A reply answers them, so it is conversational.
  const may = mayMessageFor(
    { consent: conv.contacts?.consent ?? null, dnc: conv.contacts?.dnc ?? null },
    "conversational",
  );
  if (!may.ok) return refuse(`${who} opted out; nothing can be sent to them`);
  // The window the reply route will enforce, on the channel it will send on:
  // a texting thread has none, and this card used to call one closed.
  const win = replyWindow(await replyChannelOf(t.ctx, conv), conv.last_wa_inbound_at, t.now);
  // Layer two, said on the card: a price or money (a refund, a discount, a payment term) in a reply is the person's to
  // send knowingly, never the receptionist's to promise (the charter).
  const price = violatesNoPrices(text) || namesMoney(text);
  noteRow(t, "thread", id, who, `inbox/th-${id}`);
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
  noteRow(t, "thread", m.conversation_id, "The held reply", `inbox/th-${m.conversation_id}`);
  return propose({
    kind: "steer",
    title: "Rewrite the held reply",
    summary: instruction,
    payload: { message_id: id, conversation_id: m.conversation_id, instruction, current: (m.body ?? "").slice(0, 300) },
  });
}

/** A reply (D11): a new one (draft, once draft_reply) and a rewrite of one held (steer, once propose_steer). */
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
  },
});
