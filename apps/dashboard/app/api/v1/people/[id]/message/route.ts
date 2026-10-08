import { asTenantId, PersonMessageBodySchema } from "@chanlytics/contracts";
import { beginConversation } from "@chanlytics/core";
import { log } from "@/server/log";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { beginPorts } from "@/server/new-conversation/ports";

/**
 * The platform's ceiling on one send, in seconds: the reply route's own (core reply.ts says why a reply's is pinned).
 */
export const maxDuration = 60;

/**
 * POST /api/v1/people/:id/message — a member begins a conversation with one person.
 *
 * The person is the row (contactScope): visible under RLS first, an erased one gone, and the role judged in the
 * person's own workspace. The body names the wire the member chose, the words or the approved message, a subject for
 * an email, who answers what comes back, and the plan as the note the receptionist reads; nothing here guesses either
 * of the two that are required. The rule is core's beginConversation: it asks whether a message can go that way, and
 * whether the reply verb would take it, before a thread is opened or a row written (contracts writeWaysOf, then the
 * verb's own refusals), opens their one thread through its door (00351), queues the message as the reply verb queues
 * one, with its fifteen seconds to take it back, keeps the note, and hands the thread to the receptionist when asked.
 *
 * A write with an Idempotency-Key is answered once (decision 0035): route() keeps the key a day, so a retry after a
 * timeout returns the first answer whole, thread, note and hand-back included, and queues nothing twice. The key is
 * the client's own for each send (api.ts `once`), never made from the words: the same words sent again on purpose,
 * later, are a new intent and go. The verb is handed the key too: route() lets a key go when its request fails, and a
 * request can fail after the message is queued (the ledger's row, a request that died), so the reply verb keeps its own
 * receipt under it before the job exists, and a retry of that request queues nothing twice either.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "reply",
  input: PersonMessageBodySchema,
  handle: async ({ ctx, req, row: person, input }) => {
    const { wire, then, note, ...body } = input;
    const receipt = await beginConversation(beginPorts(ctx), {
      tenantId: asTenantId(person.tenant_id),
      personId: person.id,
      userId: ctx.userId,
      wire,
      body,
      then,
      ...(note ? { note } : {}),
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    // The message is on its way either way, and the sheet says which of these did not follow it. Said here too: a
    // note the receptionist never got, or a thread it was never handed, is what someone reading the logs would ask.
    const said = { tenant_id: person.tenant_id, conversation_id: receipt.conversation_id };
    if (receipt.note_kept === false) log.warn("new_conversation_note_unkept", said);
    if (then === "receptionist" && !receipt.handed_back) log.warn("new_conversation_not_handed_back", said);
    return { ...receipt, thread: `th-${receipt.conversation_id}` };
  },
});
