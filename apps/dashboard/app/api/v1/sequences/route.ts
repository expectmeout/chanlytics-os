import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { sequences } from "@/server/readers/sequences";
import { NEW_SEQUENCE_BODY } from "@/server/sequences/bodies";
import { makeSequenceNow } from "@/server/sequences/doors";

/**
 * GET /api/v1/sequences — everything the workspace sends on its own (decision 0060), newest first: each sequence's
 * name, how it starts, its state, its first step, its steps' count and channels, what needs you in it (batches waiting
 * for an OK, emails held, emails to send yourself, replies), its next and last batch and who is in it now, with the
 * workspace's clock. Any member.
 * POST /api/v1/sequences — { first, then, start }: a new customer's sequence made whole (S4, New, from Ask's draft): its
 *      first step a campaign's own body (as POST playbooks takes one, judged by the same check), up to three steps after
 *      it, each a wait, what must still hold and a message with its values; kept as a draft that sends nothing until it
 *      is started (`start` false), or started. Owner or operator; written in one transaction with its make_sequence
 *      decision (00442 sequence_create). Answers its id, how many steps and its state.
 *
 * The body is its reader's (readers/sequences.ts), which Ask reads too.
 */
// The report routes' bucket (rate-limit.ts `aggregate`): each row is counted in SQL.
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), sequences, undefined)).data,
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "playbook",
  input: NEW_SEQUENCE_BODY,
  handle: ({ ctx, member, input }) => makeSequenceNow(ctx, member.tenantId, input),
});
