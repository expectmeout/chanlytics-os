import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { askFollowUps } from "@/server/readers/notifications";

/**
 * GET /api/v1/ask/follow-ups — the caller's own follow-ups that Ask kept, those due now (search finished, replies in, the
 * day come) with what Ask will ask itself, and how many still wait. Ask's home draws a due one first after Right now,
 * and Ask's door lights while one is due; the same rule tells Ask (its `signals` read). The body is its reader's
 * (readers/notifications.ts askFollowUps).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const { due, waiting } = (await load(readerContext(ctx, member), askFollowUps, undefined)).data;
    return { due: due.map(({ id, said, prompt }) => ({ id, said, prompt })), waiting: waiting.length };
  },
});
