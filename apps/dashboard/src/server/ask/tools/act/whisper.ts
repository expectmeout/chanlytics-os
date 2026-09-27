import "server-only";
import { z } from "zod";
import { UUID, defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

async function proposeWhisper(t: ToolContext, input: { call_id: string; text: string }): Promise<ProposalOutcome> {
  const id = str(input.call_id, 40);
  const text = str(input.text, 500);
  if (!UUID.test(id)) return refuse("call_id must be an id a read returned");
  if (!text) return refuse("text is required");
  const { data: call, error } = await t.ctx.supabase
    .from("calls")
    .select("id, status, contacts (display_name, wa_profile_name, phone_e164)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!call) return refuse("no such call in this workspace");
  if (call.status !== "ongoing") return refuse("that call is not in progress; there is nobody on the line");
  const who =
    call.contacts?.display_name || call.contacts?.wa_profile_name || call.contacts?.phone_e164 || "the caller";
  t.read.call.add(id);
  return propose({
    kind: "whisper",
    title: `Whisper on the call with ${who}`,
    summary: text,
    payload: { call_id: id, text, who },
  });
}

export const propose_whisper = defineAct({
  name: "propose_whisper",
  description:
    "Propose a whisper: a sentence only the phone receptionist hears on a live call, worked into its next answer to the caller. call_id is a live call's id, from calls with action list and filter live, or from the Live page's row. Call it when they want to tell the receptionist something while the call is on; a call that has ended is refused in words, since there is nobody on the line. It shapes what the receptionist says next and never reaches the caller as written.",
  kind: "whisper",
  input: z.object({ call_id: z.string(), text: z.string() }),
  label: "Preparing a whisper",
  build: proposeWhisper,
});
