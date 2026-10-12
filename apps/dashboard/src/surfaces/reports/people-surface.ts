/**
 * The People override: who reached the business over the days Reports shows, and the book as it stands now, read for the People
 * lens alone (contracts `PeopleDto`, `GET reports/people`: the window from the database's `people_series` and the book counted over
 * the people pool) and published as the route gave it. Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the lens reads
 * what it publishes through `useFollower("reports_people")`. The fold into its view model is the page's (`toPeopleReportVM`, the
 * page-only entry `@chanlytics/contracts/report-lens`), so the fold never rides the route's chunk: this module imports the DTO's
 * type and nothing else of the lens. (Not People's own surface, `surfaces/people/surface.ts`: that is the page of people, and this
 * is what the Reports lens of that name draws.)
 *
 * It follows the period Reports shows, held by period as the headline is (period-surface.ts): a pick of one this tab has read
 * paints at once, and is read again behind it only if it has aged.
 *
 * It is read where the lens is drawn and nowhere else: `ROUTE_DRAWS["reports/people"]` names it, so the boot's passes, a return to
 * the tab and Retry-all leave it alone on every other page, and the lens reads it as it comes on screen, once and again when it has
 * aged. Its live-feed rule is the lens's own (`onlyOnItsPage`, and Reports owns what it draws: surface-registry.ts): a message, a
 * call (not a transcript turn of one in progress) or a note moves it while the lens is on screen, once for a burst of them (the
 * wait is the longest the runner allows, three seconds from the first change: LIVE_WAIT_MS), and once when it comes back. It is
 * dearer to read than any other lens (the pool of everyone is read page by page and counted again: about 3.9 s for 20,000 people
 * on the measured throwaway stack, 10 Oct 2026), so it waits out more than Reports' own 800 ms. The feed carries no row (00265: a
 * table, an event and a call's status), so an outbound message cannot be told from an inbound one here, and each is heard.
 * A write that makes it wrong from another page (who is in the book, a yes or a
 * stop, an address, a step, a channel opened or closed, the workspace's zone) forgets it instead of reading it from there
 * (`forgetReportsPeople`, refresh-map.ts), and reads it again only where the lens is on screen: the feed tells the lens of a
 * teammate's yes, address, step or channel while it is open (and of none of the zone's), so the writer's own tab is what the map
 * is for. A conversation write, a reply or a hold moves nothing it counts, and does not name it.
 */
import { read } from "@/legacy-bridge/api";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { reportRangeKey, type PeopleDto } from "@chanlytics/contracts";
import { periodSurface } from "./period-surface";
import { rangeQuery, shownReportRange } from "./surface";

/** What the lens draws from: the answer as the route gave it (the page folds it) and the range it is of. */
export interface PeopleSurface {
  /** The route's answer, unfolded. */
  dto: PeopleDto;
  /** The range it is of, by its one name (contracts reportRangeKey): a period's id, or the days a member picked. */
  key: string;
}

/**
 * How long a burst of changes is waited out before the lens is read again. Asked for as five seconds; the runner never waits
 * more than three after the first change (surface-runner.ts REFRESH_MAX_WAIT_MS, so a steady stream is still read), and the
 * three are what is waited: one read for a burst, not one for each pause longer than 800 ms (people-surface.test.mjs runs it).
 */
const LIVE_WAIT_MS = 5_000;

export const reportsPeople = periodSurface({
  key: "reports_people",
  // The lens is drawn on the page the days are picked on: it follows whatever Reports shows, days a member picked too.
  shown: shownReportRange,
  of: (value) => value.key,
  read: async (range): Promise<PeopleSurface> => ({
    dto: await read("GET reports/people", { query: rangeQuery(range) }),
    key: reportRangeKey(range),
  }),
  // Read again only while the lens is on screen, and once when it comes back (surface-registry.ts), a burst of messages later. A
  // transcript turn of a call in progress changes nothing it counts (surface-realtime.ts isLiveCallTurn, as Today's rule leaves it
  // out): asked first, so a turn heard on another page is not kept for the lens either. What the read draws from: who wrote or
  // phoned, and the steps; and the book itself, counted by what each person said and whether they can be reached (a yes, a stop, an
  // address, a merge, people imported; the postal address an offer by email names), and by the channels they are reached on: the
  // number, the text line and the mailbox (who can receive an offer, channels-ready.ts) (0047).
  live: {
    reads: ["conversation", "call", "step", "person", "facts", "channel", "lead", "reach_out"],
    fresh: "its-page",
    omit: [
      { tables: ["conversations"], why: "it counts the messages, not the threads they are in" },
      {
        tables: ["leads", "lead_searches", "lead_rounds", "lead_search_members", "reach_out_replies"],
        why: "People's read carries each person's business and offered signer (0052), and the lens counts neither",
      },
      {
        tables: ["sending_domains", "capability_activations", "business_records"],
        why: "who can receive an offer is told by the number, the text line and the mailbox; a sending domain, a capability or the business record changes none of them",
      },
    ],
    when: (change) => !isLiveCallTurn(change),
    debounceMs: LIVE_WAIT_MS,
  },
});

export const reportsPeopleOverride = reportsPeople.override;
