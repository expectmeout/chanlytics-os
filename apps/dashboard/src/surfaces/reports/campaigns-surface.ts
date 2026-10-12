/**
 * The Campaigns override: what the messages the business sends on its own did over the days Reports shows, and what is stuck as it
 * stands now, read for the Campaigns lens (contracts `CampaignReportDto`, `GET reports/campaigns`: the sends' own report; the
 * ledger, `GET reports/campaigns/ledger`: the window beyond the sends' counts and what is stuck; and the reach-outs' report,
 * `GET reports/reach-outs`, its `report` half) and published as each route gave it. Part of the SurfaceData seam
 * (legacy-bridge/surface-data.ts); the lens reads what it publishes through `useFollower("reports_campaigns")`. The fold into its
 * view models is the page's (`toCampaignLensVM` and `toReachOutLensVM`, the page-only entry `@chanlytics/contracts/report-lens`), so
 * the fold never rides the route's chunk: this module imports the DTOs' types and nothing else of the lens. (Not Campaigns' own
 * numbers, `campaign_results`, which the Campaigns home reads over its own fixed 30 days: this is what the Reports lens of that
 * name draws.)
 *
 * It follows the period Reports shows, held by period as the headline is (period-surface.ts): a pick of one this tab has read paints
 * at once, and is read again behind it only if it has aged.
 *
 * Each of the three reads fails alone: one that could not be made is null in the value and logged by its own name, and the others
 * stand, so a lens whose ledger is down still draws the sends and the reach-outs, and the three down is three nulls the page says so
 * of, never a failed surface (the frame's report failing is the frame's, not this one's).
 *
 * It is read where it is drawn and nowhere else: `ROUTE_DRAWS["reports/campaigns"]` names it, so the boot's passes, a return to the
 * tab and Retry-all leave it alone on every other page, and the lens reads it as it comes on screen, once and again when it has
 * aged. The Overview draws it for one fact (which campaign drew the most replies, `ROUTE_DRAWS["reports"]`), so the Overview reads it
 * the same way, on arrival and when it has aged; but its live-feed rule is the Campaigns lens's alone (`onlyOnItsPage`, and Reports
 * owns what it draws: surface-registry.ts): a message, a conversation, an escalation, a run, a reach-out's reply or a channel's
 * change moves it while the lens is on screen, once for a burst of them (the wait is the longest the runner allows, three seconds
 * from the first change: LIVE_WAIT_MS), and once when it comes back; never for each burst of messages on the Overview, which keeps
 * the burst for the lens (keepForItsPage), so the lens reads once as it comes on screen instead of showing the numbers the Overview
 * read on arrival. It is the dearest read of the
 * lenses beside People's (the ledger is one pass over the window's runs and sends), so it waits out more than Reports' own 800 ms.
 * A delivery receipt is not heard: the sends' ticks are read as the lens opens, and a tick moves no figure it says by itself. A
 * write that makes it wrong from another page (a yes or a stop, a merge, a reply or a resolved escalation, a run made, approved or
 * skipped, a number connected or its standing, the workspace's zone) forgets it instead of reading it from there
 * (`forgetReportsCampaigns`, refresh-map.ts), and reads it again only where it is drawn: a teammate's reply, run or channel is heard
 * while the lens is open, so the map is for the writer's own tab, for the zone and for a yes or a stop, which the feed does not carry
 * to this lens (a person arriving is not a change to what it counts).
 */
import { read } from "@/legacy-bridge/api";
import type { RealtimeChange } from "@/legacy-bridge/surface-realtime";
import { keepForItsPage } from "@/legacy-bridge/surface-registry";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import {
  reportRangeKey,
  reportsRouteParts,
  type CampaignLedgerDto,
  type CampaignReportDto,
  type ReachOutReportDto,
} from "@chanlytics/contracts";
import { periodSurface } from "./period-surface";
import { rangeQuery, shownReportRange } from "./surface";

/** What the lens draws from: each read as its route gave it (null where that read failed; the reach-outs absent in the demo) and the range it is of. */
export interface CampaignsSurface {
  /** The sends' own report (campaign_series), unfolded; null where its read failed. */
  campaigns: CampaignReportDto | null;
  /** The window beyond the sends' counts and what is stuck now; null where its read failed. */
  ledger: CampaignLedgerDto | null;
  /** The reach-outs' report, the route's `report` (its totals by chain are the Campaigns home's); null where its read failed, absent where nothing reads it (the demo). */
  reachOuts?: ReachOutReportDto | null;
  /** The range they are of, by its one name (contracts reportRangeKey): a period's id, or the days a member picked. */
  key: string;
}

/**
 * Where the feed is heard: on the Campaigns lens alone. The Overview draws the surface for one fact and is read as it comes on screen
 * and when it has aged, so it does not read for a burst; but the change is kept for the pages that draw it, as every other page keeps
 * it (`here`, the standard page rule over Reports' two pages, is asked first, and keeps it wherever the surface is not drawn): the
 * lens, or the Overview again, reads once as it comes on screen, so the lens never shows the numbers the Overview read on arrival,
 * minutes old.
 */
const heardOnTheLens =
  (here: (change: RealtimeChange) => boolean) =>
  (change: RealtimeChange): boolean => {
    if (!here(change)) return false;
    if (reportsRouteParts(routeOnScreen())?.lens === "campaigns") return true;
    keepForItsPage("reports_campaigns");
    return false;
  };

/**
 * How long a burst of changes is waited out before the lens is read again. Asked for as five seconds; the runner never waits
 * more than three after the first change (surface-runner.ts REFRESH_MAX_WAIT_MS, so a steady stream is still read), and the
 * three are what is waited: one read for a burst, not one for each pause longer than 800 ms (campaigns-surface.test.mjs runs it).
 */
const LIVE_WAIT_MS = 5_000;

export const reportsCampaigns = periodSurface({
  key: "reports_campaigns",
  // The lens is drawn on the page the days are picked on: it follows whatever Reports shows, days a member picked too.
  shown: shownReportRange,
  of: (value) => value.key,
  read: async (range): Promise<CampaignsSurface> => {
    const query = rangeQuery(range);
    // Each read is its own: a failure in one is that one's null, never the surface's (the audit's D9, as the frame's offers read was).
    const [campaigns, ledger, reachOuts] = await Promise.all([
      read("GET reports/campaigns", { query }).catch((e: unknown) => e as Error),
      read("GET reports/campaigns/ledger", { query }).catch((e: unknown) => e as Error),
      read("GET reports/reach-outs", { query }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("reports_campaigns_fetch_failed", campaigns.message);
    if (ledger instanceof Error) console.error("reports_campaigns_ledger_fetch_failed", ledger.message);
    if (reachOuts instanceof Error) console.error("reports_campaigns_reach_outs_fetch_failed", reachOuts.message);
    return {
      campaigns: campaigns instanceof Error ? null : campaigns.report,
      ledger: ledger instanceof Error ? null : ledger,
      reachOuts: reachOuts instanceof Error ? null : reachOuts.report,
      key: reportRangeKey(range),
    };
  },
  // Read again only while the Campaigns lens is on screen, and once when it comes back (surface-registry.ts), a burst of messages
  // later. No call is among its tables, so no transcript turn of one in progress can be heard.
  // What the Campaigns reads draw from: the messages, conversations and escalations a reply is made of, the runs a send is, a
  // reach-out's replies read or undone, and the number it says the health of and the domains its reach-outs send from (0047). Not the
  // book: the yeses and stops it counts are columns of the people, and a person arriving would read the dearest of the lenses (the
  // baseline says so, reads-not-heard.json); a yes or a stop recorded in the writer's tab forgets it (refresh-map.ts consentWrite).
  live: {
    reads: ["conversation", "hold", "send", "reach_out", "channel"],
    fresh: "its-page",
    omit: [
      {
        tables: ["lines", "mailboxes", "capability_activations", "business_records"],
        why: "it says the health of the connected number and a row for each sending domain; the text line, the mailbox, a capability or the business record are none of its figures",
      },
    ],
    page: heardOnTheLens,
    debounceMs: LIVE_WAIT_MS,
  },
});

export const reportsCampaignsOverride = reportsCampaigns.override;
