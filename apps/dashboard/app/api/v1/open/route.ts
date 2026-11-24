import { z } from "zod";
import { PREFETCH_OPEN, REPORT_PERIOD_IDS } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { openPage } from "@/server/workspace/page-open";
import { openReadOf } from "./reads";

/**
 * GET /api/v1/open?route=today[&period=7d] — a page's first reads, answered as one streamed request (decision 0053
 * step 2; server/workspace/page-open.ts): who is looking, the page's own reads (contracts PREFETCH_READS) and what it
 * draws beside them (PREFETCH_BESIDE), one JSON line each as it settles. `thread` is the conversation an Inbox address
 * names, whose person is read with the page's own (contracts THREAD_PERSON_READ). The document's head asks for it in place of a
 * request per read and parks each answer for the page to take (contracts routePrefetchScript); a read it did not answer
 * is the page's to ask for itself.
 *
 * Each read is answered by its own route, past the session check this request made once: the routes are named by their
 * path in ./reads.ts, which GET open/rest answers from too, and route-prefetch.test.mjs holds every read GET open answers
 * to one of them. `period` is the one this device last picked for Reports, which the period line reads; one Reports does
 * not offer is the default's.
 */
const Query = z.object({
  route: z.enum(PREFETCH_OPEN),
  period: z.string().max(16).optional(),
  thread: z.uuid().optional(),
});

export const GET = read({
  scope: workspace,
  query: Query,
  // The answer streams: the Response is handed back at once, and each read writes its line as it settles.
  handle: ({ ctx, req, input }) => {
    const offered: readonly string[] = REPORT_PERIOD_IDS;
    const period = input.period && offered.includes(input.period) ? input.period : null;
    const thread = input.thread ?? null;
    return Promise.resolve(openPage(ctx, req, { page: input.route, period, thread }, openReadOf));
  },
});
