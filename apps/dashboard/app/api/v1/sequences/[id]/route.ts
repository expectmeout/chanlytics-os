import { read, write } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { load, readerContext } from "@/server/readers";
import { sequence } from "@/server/readers/sequences";
import { discardSequenceNow } from "@/server/sequences/doors";

/**
 * GET /api/v1/sequences/:id — one sequence (decision 0060): its row as the list reads it, its steps in their places
 * with what each sent in the last 30 days, the mode its batches are approved under, and the workspace's clock. The
 * sequence is the row (sequenceScope), found under RLS, so one the caller cannot see is 404. Any member.
 * DELETE /api/v1/sequences/:id — a sequence that never made a batch nor took anyone in, taken away whole (S4): a draft
 *      let go, or a new one undone. One that has sent is refused (409): it is paused, its history kept. Owner or
 *      operator; the discard_sequence decision is written in the same transaction (00442 sequence_discard).
 */
export const GET = read({
  scope: sequenceScope,
  rate: "aggregate",
  handle: async ({ ctx, member, row }) => (await load(readerContext(ctx, member), sequence, { id: row.id })).data,
});

export const DELETE = write({
  scope: sequenceScope,
  role: "operator",
  rate: "playbook",
  handle: ({ ctx, row }) => discardSequenceNow(ctx, row),
});
