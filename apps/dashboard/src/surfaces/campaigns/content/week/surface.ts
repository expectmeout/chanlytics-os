/**
 * The Week, for Campaigns › Content's first tab and Settings › Content (00706; the content loop PRD's 21.1, 21.2): `GET
 * content/plan`, read only where one of them is drawn, again when what it holds has aged, and after a press that changes
 * it (bridge/refresh-map.ts). What the plan job drafts and what the approval makes are told to no page: while the week is
 * drafted or made, the Week asks again (week.tsx).
 *
 * The value is the seam's (`useSurface("content_week")`): undefined until read, null when the read failed.
 */
import type { WeekPageDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { readAged, type SurfaceOverride } from "@/bridge/surface-data";
import { declareReads } from "@/bridge/surface-registry";
import { setSurfaceValue, surfaceValue } from "../../../surface-values";

export interface WeekSurface {
  dto: WeekPageDto;
  fetchedAt: number;
}

export const weekOverride: SurfaceOverride = {
  key: "content_week",
  value: "content_week",
  onDemand: true,
  isStale: () => readAged(surfaceValue("content_week")?.fetchedAt),
  // Heard where the Week or Settings › Content is drawn: its footage's files; whether Google and Instagram take a post;
  // the config its lines say and its switch; whether AI is paused. The week's own rows are told to no page
  // (tests/baselines/reads-not-heard.json says why).
  ...declareReads("content_week", {
    // A review and a campaign since pass 6: its proposal to ask for reviews reads the newest review, the review link and
    // whether an ask runs, and goes once a new review comes or the ask starts.
    reads: ["file", "review", "campaign", "facts", "channel", "workspace", "brought"],
    fresh: "its-page",
    omit: [
      {
        tables: ["imports"],
        why: "the week reads the look the website read proposed (the brand kit), never the ledger of what was brought in",
      },
      {
        tables: ["lines", "mailboxes", "mailbox_connections", "capability_activations", "business_records"],
        why: "the week reads the Instagram link alone, never a line or a mailbox",
      },
    ],
  }),
  apply: async () => {
    try {
      const dto = await read("GET content/plan");
      setSurfaceValue("content_week", { dto, fetchedAt: Date.now() });
    } catch (e) {
      // A read again that failed leaves what is on screen.
      if (!surfaceValue("content_week")) setSurfaceValue("content_week", null);
      throw e;
    }
  },
};
