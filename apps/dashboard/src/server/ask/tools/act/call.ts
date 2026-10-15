import "server-only";
import { z } from "zod";
import { callerName } from "@chanlytics/contracts";
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

/** The call a card names: in progress, in this workspace, with who it is with as Live names them; or the refusal. */
async function liveCall(t: ToolContext, callId: string): Promise<{ id: string; who: string } | ProposalOutcome> {
  const id = str(callId, 40);
  if (!UUID.test(id)) return refuse("call_id must be an id a read returned");
  const { data: call, error } = await t.ctx.supabase
    .from("calls")
    .select("id, status, from_e164, from_raw, contacts (display_name, wa_profile_name)")
    .eq("id", id)
    .eq("tenant_id", t.tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!call) return refuse("no such call in this workspace");
  if (call.status !== "ongoing") return refuse("that call is not in progress; there is nobody on the line");
  // As Live names the call (callerName): the saved name, else the number as the phone showed it, never the raw digits.
  const who = callerName({ from_e164: call.from_e164, from_raw: call.from_raw, contact: call.contacts });
  noteRow(t, "call", id, who, `conversations/cv-${id}`);
  return { id, who };
}
const refused = (c: { id: string; who: string } | ProposalOutcome): c is ProposalOutcome => "result" in c;

async function proposeWhisper(t: ToolContext, input: { call_id: string; text: string }): Promise<ProposalOutcome> {
  const text = str(input.text, 500);
  if (!text) return refuse("text is required");
  const call = await liveCall(t, input.call_id);
  if (refused(call)) return call;
  return propose({
    kind: "whisper",
    title: `Whisper on the call with ${call.who}`,
    summary: text,
    payload: { call_id: call.id, text, who: call.who },
  });
}

async function proposeHandOver(t: ToolContext, input: { call_id: string }): Promise<ProposalOutcome> {
  const call = await liveCall(t, input.call_id);
  if (refused(call)) return call;
  return propose({
    kind: "call_hand_over",
    title: `Take the call with ${call.who}`,
    summary: "The receptionist tells them someone is picking up and transfers them; your phone rings.",
    payload: { call_id: call.id, who: call.who },
  });
}

const CALL_ID = z
  .string()
  .describe("A live call's id, from calls with action list and filter live, or the Live page's row.");

/**
 * A call in progress (D11, the operator, 15 Oct 2026): a whisper the phone receptionist works into its next answer
 * (whisper, once propose_whisper), or the call passed to the business's own line (hand_over, Live's own button). Ending a
 * call stays on Live (contracts ASK_GUIDE_PAGES).
 */
export const propose_call = defineActions({
  name: "propose_call",
  description:
    "Propose an act on a phone call in progress, as a card the person approves: a whisper to the phone receptionist, or the call handed to the business's own line.",
  tail: "A call that has ended is refused in words, since there is nobody on the line. Ending a call is the Live page's own button.",
  actions: {
    whisper: actAction({
      kind: "whisper",
      input: z.object({
        call_id: CALL_ID,
        text: z.string().describe("The sentence only the receptionist hears, such as: offer Saturday at 10."),
      }),
      examples: [{ call_id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e", text: "Offer Saturday at 10." }],
      label: "Preparing a whisper",
      words:
        "Action whisper takes call_id and text: a sentence only the phone receptionist hears, worked into its next answer to the caller. It shapes what the receptionist says next and never reaches the caller as written.",
      build: proposeWhisper,
    }),
    hand_over: actAction({
      kind: "call_hand_over",
      input: z.object({ call_id: CALL_ID }),
      examples: [{ call_id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e" }],
      label: "Preparing the hand-over",
      words:
        "Action hand_over takes call_id and passes the call to the business's own phone: the receptionist tells the caller someone is picking up and transfers them. Call it when they want to take the call themselves.",
      build: proposeHandOver,
    }),
  },
});
