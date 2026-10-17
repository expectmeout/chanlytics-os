import { read } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { load, readerContext } from "@/server/readers";
import { sequenceReach } from "@/server/readers/sequences";

/**
 * GET /api/v1/sequences/:id/reach — what a paused sequence's Turn on asks with beside its record (decision 0060; the
 * Sequences phone review's Reads on landing): who its next run reaches, the most one run sends, and whether the workspace
 * is paused. Read as the question opens. Any member; the sequence is the row (sequenceScope).
 */
export const GET = read({
  scope: sequenceScope,
  rate: "aggregate",
  handle: async ({ ctx, member, row }) => (await load(readerContext(ctx, member), sequenceReach, { id: row.id })).data,
});
