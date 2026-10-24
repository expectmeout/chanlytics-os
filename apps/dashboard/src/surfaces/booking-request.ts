/**
 * A booking the receptionist asked for, answered (decision 0061): Booked it or Can't, committed through its verb
 * (contracts PROPOSAL_SPECS booking_request), whichever page pressed it: Today's row, the Inbox's thread and the Calendar's
 * visit make the same call and say the same receipt. Booked it answers with the reply it drafts for the member to send;
 * the page carries it into the thread's box.
 */
import { commitVerb } from "@/legacy-bridge/verbs/commit";

/** What the door answered: the reply Booked it drafts (null for Can't) and the receipt, or its refusal in a sentence. */
type RequestAnswered = { ok: true; reply: string | null; receipt: string } | { ok: false; message: string };

export async function answerRequest(conversationId: string, booked: boolean, who: string): Promise<RequestAnswered> {
  const r = await commitVerb("booking_request", { conversation_id: conversationId, booked, who });
  if (!r.ok) return { ok: false, message: r.message };
  const reply: unknown = r.data && typeof r.data === "object" ? Reflect.get(r.data, "reply") : null;
  return { ok: true, reply: typeof reply === "string" ? reply : null, receipt: r.receipt };
}
