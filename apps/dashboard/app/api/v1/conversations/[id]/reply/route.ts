import { z } from "zod";
import { REPLY_MAX_ANY } from "@chanlytics/contracts";
import { replyToConversation } from "@chanlytics/core";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { replyPorts } from "@/server/core-ports";

/**
 * Validated at the door, not read hopefully.
 *
 * This route is the one that reaches a real person, and it took whatever the
 * body happened to contain. Two consequences it actually had: a reply over
 * 4,096 characters was stored twice, reported queued, and then failed
 * fifteen seconds later as an escalation plus an alert email, because that
 * is WhatsApp's limit and nothing checked it here; and `params` was accepted
 * from the client with no shape at all, so an operator session could put
 * arbitrary text into an approved template's variables — a foreign link in a
 * message the customer receives from the business.
 *
 * `.strict()` on the template so a stray field is a 400 here rather than
 * something silently ignored on the way to Meta. route() judges the body only
 * after the role, so a viewer learns nothing from the shape of a refusal.
 *
 * The length each wire takes is the verb's to enforce, because only it knows
 * which wire the reply goes out on (contracts REPLY_LIMITS, asked before
 * anything is queued); the bound here is the longest any of them takes.
 */
const ReplyBody = z
  .object({
    text: z.string().max(REPLY_MAX_ANY, "That reply is longer than any channel can carry.").optional(),
    // Email only: the address the operator agreed to, when it is not the one the person last wrote from (core reply.ts).
    email_to: z.string().max(320).optional(),
    template: z
      .object({
        name: z.string().min(1).max(512),
        language: z.string().min(2).max(15),
        // Kept only so an older client's request still parses; the server
        // resolves params from the control plane and ignores these.
        params: z.array(z.string().max(1024)).max(10).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * POST /api/v1/conversations/:id/reply — the conversation is the row
 * (conversationScope): visible under RLS first, then the role judged where
 * the thread lives. Role before rate, by construction: a viewer must not
 * learn a customer's consent state from the shape of the refusal, and this
 * is the route that actually reaches a person. The rule itself is core's
 * replyToConversation; this route is its adapter.
 */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "reply",
  input: ReplyBody,
  handle: ({ ctx, req, row: conv, input }) =>
    replyToConversation(replyPorts(ctx), { conv, userId: ctx.userId, body: input, idempotencyKey: req.headers.get("idempotency-key") }),
});
