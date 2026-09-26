import "server-only";
import { z } from "zod";
import { contactName, isHeldDraft, replyWindow, violatesNoPrices } from "@chanlytics/contracts";
import { replyChannelOf } from "../../../verbs";
import { UUID, defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

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
  if (conv.contacts?.dnc) return refuse(`${who} opted out; nothing can be sent to them`);
  // The window the reply route will enforce, on the channel it will send on:
  // a texting thread has none, and this card used to call one closed.
  const win = replyWindow(await replyChannelOf(t.ctx, conv), conv.last_wa_inbound_at, t.now);
  const price = violatesNoPrices(text);
  t.read.thread.add(id);
  return propose({
    kind: "reply",
    needs: "operator",
    title: `Reply to ${who}`,
    summary: text,
    payload: { conversation_id: id, text, voice, who, window_open: win.open, price_warning: price },
    undo: "Sends 15 seconds after you approve; cancel within them",
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
  t.read.thread.add(m.conversation_id);
  return propose({
    kind: "steer",
    needs: "operator",
    title: "Rewrite the held reply",
    summary: instruction,
    payload: { message_id: id, conversation_id: m.conversation_id, instruction, current: (m.body ?? "").slice(0, 300) },
    undo: null,
  });
}

export const draft_reply = defineAct({
  name: "draft_reply",
  description:
    "Propose words for a customer on a WhatsApp thread, as a card the person approves before anything is sent. voice: 'you' for the person's own words, 'receptionist' for the receptionist's voice. Use the conversation id a read returned. Never quote or confirm a price.",
  input: z.object({
    conversation_id: z.string(),
    text: z.string(),
    voice: z.enum(["you", "receptionist"]),
  }),
  label: "Drafting a reply",
  build: draftReply,
});

export const propose_steer = defineAct({
  name: "propose_steer",
  description:
    "Propose rewriting a reply the receptionist is holding, with an instruction ('shorter', 'mention Saturday is full', 'in Spanish'). Use the held draft's message id from a read. The rewrite waits its turn like the first draft.",
  input: z.object({ message_id: z.string(), instruction: z.string() }),
  label: "Preparing a rewrite",
  build: proposeSteer,
});
