/**
 * The drafts Ask kept for the rows of Need you (decision 0071, E2), read with Today's own first reads (contracts
 * PREFETCH_READS) and waited for by its first draw (ROUTE_WAITS), so each row draws with its words. They were read only
 * once the rows had drawn, by their threads, and on every load, since the tab held them in memory alone: the rows drew
 * empty, then Ask's "writing", then the words, 181 and 397 px each on a desk (the Today load review, 27 Oct 2026). Read
 * before the rows are known, so the read names no thread: the workspace's newest, and whether they are all it keeps. A row
 * whose draft is not among them is read by its thread as before (drafts.ts wantDrafts). Kept by the surface cache, so a
 * reload draws the words it drew.
 */
import type { ReplyDraftDto } from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import { read } from "@/legacy-bridge/api";
import { ON_DEMAND_STALE_MIN, readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue, surfaceValue } from "../../surface-values";

/** The workspace's newest kept drafts, whether they are all it keeps, and when they were read. */
export interface ReplyDraftsSurface {
  drafts: ReplyDraftDto[];
  complete: Output<"GET conversations/drafts">["complete"];
  fetchedAt: number;
}

export const replyDraftsOverride: SurfaceOverride = {
  key: "reply_drafts",
  value: "reply_drafts",
  onDemand: true,
  isStale: () => readAged(surfaceValue("reply_drafts")?.fetchedAt),
  events: ["surface:reply_drafts"],
  // Drafts are written by the rows that want them (drafts.ts) and read back by them: no record the feed tells of. Read where
  // Today is drawn, again behind a draft written (refresh-map.ts), and again when what it holds has aged; why it hears none of
  // the tables its read touches is said in tooling/scripts/tests/baselines/reads-not-heard.json.
  ...declareReads("reply_drafts", { reads: [], fresh: { aged: ON_DEMAND_STALE_MIN } }),
  apply: async () => {
    const got = await read("GET conversations/drafts");
    setSurfaceValue("reply_drafts", { drafts: got.drafts, complete: got.complete, fetchedAt: Date.now() });
  },
};
