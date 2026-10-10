/**
 * The Receptionist override: what the receptionist did over the days Reports shows, read for the Receptionist lens alone
 * (contracts `ReceptionistDto`, `GET reports/receptionist`: the day by day series and the profile of the period) and
 * published as the route gave it. Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the lens reads what it
 * publishes through `useFollower("reports_receptionist")`. The fold into its view model is the page's (`toReceptionistReportVM`,
 * the page-only entry `@chanlytics/contracts/report-lens`), so the fold never rides the route's chunk: this module imports
 * the DTO's type and nothing else of the lens, and `readAt` is what the fold counts "now" from.
 *
 * It follows the period Reports shows, held by period as the headline is (period-surface.ts): a pick of one this tab has read
 * paints at once, and is read again behind it only if it has aged.
 *
 * It is read where the lens is drawn and nowhere else: `ROUTE_DRAWS["reports/receptionist"]` names it, so the boot's passes, a
 * return to the tab and Retry-all leave it alone on every other page, and the lens reads it as it comes on screen, once and again
 * when it has aged. Its live-feed rule is the lens's own (`onlyOnItsPage`, and Reports owns what it draws: surface-registry.ts): a
 * message, an escalation or a call (not a transcript turn of one in progress) moves it while the lens is on screen, 800 ms after the
 * last change as Reports' own read does, and once when it comes back. A write that makes it wrong from another page (a reply or a
 * resolved escalation moves "waiting on you", the workspace's zone moves the days, its hours and closures move "while you were
 * closed") forgets it instead of reading it from there (`forgetReceptionist`, refresh-map.ts), and reads it again only where the
 * lens is on screen, since the feed tells it of none of those writes.
 */
import { read } from "@/legacy-bridge/api";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { reportRangeKey, type ReceptionistDto } from "@chanlytics/contracts";
import { periodSurface } from "./period-surface";
import { rangeQuery, shownReportRange } from "./surface";

/** What the lens draws from: the answer as the route gave it (the page folds it), the range it is of, and when it was read. */
export interface ReceptionistSurface {
  /** The route's answer, unfolded. */
  dto: ReceptionistDto;
  /** The range it is of, by its one name (contracts reportRangeKey): a period's id, or the days a member picked. */
  key: string;
  /** When it was read: the fold's "now". */
  readAt: number;
}

/** The tables whose changes the live feed tells a workspace of and that the Receptionist read draws from. */
const RECEPTIONIST_TABLES: string[] = ["messages", "escalations", "calls"];

/** Where the lens is on screen: the rest are held for it (surface-registry.ts onlyOnItsPage). */
const onItsPage = onlyOnItsPage("reports_receptionist", RECEPTIONIST_TABLES);

export const receptionist = periodSurface({
  key: "reports_receptionist",
  // The lens is drawn on the page the days are picked on: it follows whatever Reports shows, days a member picked too.
  shown: shownReportRange,
  of: (value) => value.key,
  read: async (range): Promise<ReceptionistSurface> => ({
    dto: await read("GET reports/receptionist", { query: rangeQuery(range) }),
    key: reportRangeKey(range),
    readAt: Date.now(),
  }),
  // Read again only while the lens is on screen, and once when it comes back (surface-registry.ts), a burst of messages later. A
  // transcript turn of a call in progress changes nothing it counts (surface-realtime.ts isLiveCallTurn, as Today's rule leaves it
  // out): asked first, so a turn heard on another page is not kept for the lens either.
  live: {
    refreshOnTables: RECEPTIONIST_TABLES,
    refreshWhen: (change) => !isLiveCallTurn(change) && onItsPage(change),
    debounceMs: 800,
  },
});

export const receptionistOverride = receptionist.override;

/** A write from another page changed what the lens counts or says: nothing is held of it, and it is read as the lens comes on screen. */
export const forgetReceptionist = receptionist.forget;
