import { write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { LEAD_CHAIN_BODY } from "@/server/sequences/bodies";
import { saveLeadChainNow } from "@/server/sequences/lead-chain";

/**
 * PUT /api/v1/sequences/:id/chain — a sequence to leads written on its own record (00459, the draft's record): its steps'
 * words, waits and hand, its mailboxes, pace, signature and unconfirmed addresses, saved whole as the chain's own save
 * keeps one (every word checked, new words sending what waits back to the check), and `source_search_id`, the search it
 * adds new ready leads from (auto-add), or none. A draft may keep an email still to write; Start asks for it. Owner or
 * operator.
 */
export const PUT = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  input: LEAD_CHAIN_BODY,
  handle: ({ ctx, member, row, input }) => saveLeadChainNow(ctx, member, row, input),
});
