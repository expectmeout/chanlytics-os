import { z } from "zod";
import { PREFETCH_OPEN, REPORT_PERIOD_IDS } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { openPage, type OpenRead } from "@/server/workspace/page-open";
import { GET as workspaces } from "../workspaces/route";
import { GET as metrics } from "../metrics/route";
import { GET as conversations } from "../conversations/route";
import { GET as escalations } from "../escalations/route";
import { GET as calls } from "../calls/route";
import { GET as leadSearches } from "../lead-searches/route";
import { GET as leadPreviews } from "../lead-previews/route";
import { GET as setup } from "../setup/route";
import { GET as views } from "../views/route";
import { GET as calendar } from "../calendar/route";
import { GET as broadcasts } from "../broadcasts/route";
import { GET as contacts } from "../contacts/route";
import { GET as segments } from "../segments/route";
import { GET as channels } from "../channels/route";
import { GET as settings } from "../settings/route";
import { GET as headline } from "../reports/headline/route";
import { GET as playbooks } from "../playbooks/route";
import { GET as notifications } from "../notifications/route";
import { GET as google } from "../google/route";
import { GET as replies } from "../reach-out-replies/route";
import { GET as morning } from "../ask/morning/route";
import { GET as drafts } from "../conversations/drafts/route";
import { GET as team } from "../team/route";
import { GET as policies } from "../policies/route";
import { GET as templates } from "../templates/route";

/**
 * GET /api/v1/open?route=today[&period=7d] — a page's first reads, answered as one streamed request (decision 0053
 * step 2; server/workspace/page-open.ts): who is looking, the page's own reads (contracts PREFETCH_READS) and what it
 * draws beside them (PREFETCH_BESIDE), one JSON line each as it settles. `thread` is the conversation an Inbox address
 * names, whose person is read with the page's own (contracts THREAD_PERSON_READ). The document's head asks for it in place of a
 * request per read and parks each answer for the page to take (contracts routePrefetchScript); a read it did not answer
 * is the page's to ask for itself.
 *
 * Each read is answered by its own route, past the session check this request made once: the routes are named here by
 * their path, and route-prefetch.test.mjs holds every read GET open answers to one of them. `period` is the one this
 * device last picked for Reports, which the period line reads; one Reports does not offer is the default's.
 */
const READS: ReadonlyMap<string, OpenRead> = new Map<string, OpenRead>([
  ["workspaces", workspaces],
  ["metrics", metrics],
  ["conversations", conversations],
  ["escalations", escalations],
  ["calls", calls],
  ["lead-searches", leadSearches],
  ["lead-previews", leadPreviews],
  ["setup", setup],
  ["views", views],
  ["calendar", calendar],
  ["broadcasts", broadcasts],
  ["contacts", contacts],
  ["segments", segments],
  ["channels", channels],
  ["settings", settings],
  ["reports/headline", headline],
  ["playbooks", playbooks],
  ["notifications", notifications],
  ["google", google],
  ["reach-out-replies", replies],
  ["ask/morning", morning],
  ["conversations/drafts", drafts],
  ["team", team],
  ["policies", policies],
  ["templates", templates],
]);

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
    return Promise.resolve(
      openPage(ctx, req, { page: input.route, period, thread }, (key) => READS.get(key.replace(/\?.*$/, ""))),
    );
  },
});
