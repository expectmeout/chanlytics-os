/**
 * The headline override: Today's period line and Worth a look read the period as one small count (contracts
 * `ReportHeadlineVM`, `GET reports/headline`), never the whole report. Part of the SurfaceData seam
 * (legacy-bridge/surface-data.ts); Today reads what it publishes through `useSurface("reports_headline")`.
 *
 * It follows the period Reports shows, as the one `reports` surface did when Today read it, so the line and the leaks say the same
 * last N days Reports prints (period-surface.ts holds it by period, paints a held one at once on a pick, and reads again behind it
 * only if it has aged).
 *
 * It was "never read by the live feed", on a cost argument that stands: it counts a period of days and reaches for the people pool
 * and the calendar for its booking line, so it is the heaviest read there is, and a message moves the period line by one in a
 * hundred. The argument was wrong for Worth a look, which is built from the same counts: the unanswered count falls by one for every
 * reply, and "2 of the 9 people got onto the calendar" moves by a whole unit when a visit is booked, so Today kept saying "No reply:
 * 3" under names that had shrunk to none (the audit's F2a). So it hears the feed, at the price the argument sets:
 *  - only while Today is on screen (`onlyOnItsPage`; Today owns this read: surface-registry.ts), and kept for Today otherwise, so
 *    it is read once as Today comes back and never for a page that does not draw it;
 *  - only the changes it counts: a message arriving or sent, a call starting or ending (not a transcript turn of one in progress),
 *    and a visit (its booking line reads the appointments record);
 *  - a long wait: fifteen seconds after the last change, and never later than thirty after the first (SurfaceOverride.maxWaitMs,
 *    which the runner honours), so a busy hour costs two reads a minute and not one for each burst of messages.
 * A write made in this tab that moves what it counts (a reply, a hold decided, a visit marked) reads it at once where Today is on
 * screen, and forgets it elsewhere (refresh-map.ts), and the business's midnight reads it with Today (`readAtMidnight`), so "Last 7
 * days" and "Today so far" are of the new day. It is also read at boot, when the tab returns, by Retry, after the workspace's zone
 * is saved, when the period is picked (period.ts) and, being on-demand, when Today comes on screen after it has aged.
 */
import { read } from "@/legacy-bridge/api";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { toHeadlineVM } from "@chanlytics/contracts";
import { periodSurface } from "./period-surface";
import { shownReportPeriod } from "./surface";

/** How long after the last change the headline is read again, and the longest after the first: the read is dear. */
const QUIET_MS = 15_000;
const LONGEST_WAIT_MS = 30_000;

export const headline = periodSurface({
  key: "reports_headline",
  // Today's line follows the period by name kept in this browser, never days a member picked on Reports: those are
  // one look at one page, and a line that still said them the next morning would be a stale one.
  shown: shownReportPeriod,
  of: (value) => value.period,
  read: async (period) => toHeadlineVM((await read("GET reports/headline", { query: { period } })).headline),
  // What the headline counts: messages, calls and visits, and the people its booking line is "of the N people" (someone added,
  // merged or erased, 0047), and the calendar's settings its booking line reads (readers/report.ts bookingOf): a calendar linked on
  // Settings is Worth a look's at once (the wiring's second audit, S3-4). Heard where Today is on screen, the rest held for it
  // (surface-registry.ts onlyOnItsPage). A transcript turn of a call in progress changes nothing it counts (surface-realtime.ts
  // isLiveCallTurn, as Today's own rule leaves it out): asked first, so a turn heard on another page is not kept for Today either.
  live: {
    reads: ["conversation", "call", "visit", "person", "facts"],
    fresh: "its-page",
    omit: [
      { tables: ["conversations"], why: "it counts the messages, not the threads they are in" },
      {
        tables: ["appointment_notices"],
        why: "its booking line reads the appointments; a held booking email is not one",
      },
    ],
    when: (change) => !isLiveCallTurn(change),
    debounceMs: QUIET_MS,
    maxWaitMs: LONGEST_WAIT_MS,
  },
  readAtMidnight: true,
});

export const reportsHeadlineOverride = headline.override;
