import { read } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { load, readerContext } from "@/server/readers";
import { sequencePeople } from "@/server/readers/sequences";

/**
 * GET /api/v1/sequences/:id/people — who is in a sequence (decision 0060), by where they stand: waiting for your OK,
 * held by the check, for you to send, next, in it, done and left, each group's count whole and its first rows. Any
 * member; the sequence is the row (sequenceScope).
 */
export const GET = read({
  scope: sequenceScope,
  rate: "aggregate",
  handle: async ({ ctx, member, row }) => (await load(readerContext(ctx, member), sequencePeople, { id: row.id })).data,
});
