import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { leadPlace } from "@/server/readers/leads";
import { requireUuid } from "@/server/request-guards";

/**
 * GET /api/v1/leads/:id/place — where one lead stands in a sequence (00459 sequence_place): the sequence, its row as
 * that sequence's Leads tab files it, each send of its there, whether replies are read from a connected mailbox, and when
 * it joined. Null for a lead in no sequence. Any member; under the caller's row security. The body is its reader's
 * (readers/leads.ts leadPlace), which Ask reads too.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) =>
    (await load(readerContext(ctx, member), leadPlace, { id: requireUuid(ctx.params.id, "lead") })).data,
});
