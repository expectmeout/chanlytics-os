/**
 * The Reports override: what the page shows and the report over it. Part of the SurfaceData seam
 * (legacy-bridge/surface-data.ts); the page reads what it publishes through `useSurface("reports")`. The lens on screen
 * is the address's, not this surface's: every lens draws from this one read, so a move between lenses asks for nothing.
 *
 * What it shows is a range (contracts ReportRange): a period by name, kept in this browser, or the days a member picked,
 * which are the address's own and nothing else's (`reports/receptionist:2026-09-01~2026-09-20`, contracts lensRoute).
 * The days are read from the address each time they are asked for and never kept beside it, so there is no second copy
 * to disagree with it: a link opens on them, Back walks them, and an address that says none shows the period kept.
 */

import { ApiError } from "@/client/api";
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import {
  REPORT_PERIOD_DEFAULT,
  REPORT_PERIOD_STORAGE,
  isReportPeriod,
  reportFacts,
  reportRangeKey,
  reportsRouteParts,
  toBookingReportVM,
  toCampaignReportVM,
  toDealReportVM,
  toReachOutReportVM,
  toReportVM,
  type BookingReportVM,
  type CampaignReportVM,
  type DealReportVM,
  type ReachOutReportVM,
  type ReportDays,
  type ReportFactVM,
  type ReportPeriodId,
  type ReportRange,
  type ReportVM,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEFAULT_REFRESH_TABLES } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue } from "../surface-values";

/* ------------------------------- Reports --------------------------------- */

// The document's head reads the same name, so the reads it starts are for the period this page asks for (contracts).
const REPORT_PERIOD_KEY = REPORT_PERIOD_STORAGE;
let reportPeriod: ReportPeriodId = REPORT_PERIOD_DEFAULT;
try {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(REPORT_PERIOD_KEY);
    if (isReportPeriod(saved)) reportPeriod = saved;
  }
} catch {
  /* storage unavailable: the default period stands */
}

/** The period by name kept in this browser: what Reports opens on, and what Today's line reads whatever days Reports shows. */
export const shownReportPeriod = (): ReportPeriodId => reportPeriod;

/** The days a member picked, where the address on screen is Reports' and says them; null on any other address. */
const pickedDays = (): ReportDays | null =>
  typeof window === "undefined" ? null : (reportsRouteParts(routeOnScreen())?.days ?? null);

/** What Reports shows now, or is on its way to: the days the address says, else the period kept in this browser. */
export const shownReportRange = (): ReportRange => pickedDays() ?? reportPeriod;

/** Its one name (contracts reportRangeKey): what its reads are held by and queued under. */
export const shownReportKey = (): string => reportRangeKey(shownReportRange());

/** How a report's read names a range: the period, or the first and the last of the days picked. */
export const rangeQuery = (range: ReportRange): { period: ReportPeriodId } | { from: string; to: string } =>
  typeof range === "string" ? { period: range } : { from: range.from, to: range.to };

/** The one period every chart on Reports is scoped to, kept in this browser. */
export function keepReportPeriod(period: ReportPeriodId): void {
  if (!isReportPeriod(period)) return;
  reportPeriod = period;
  try {
    window.localStorage.setItem(REPORT_PERIOD_KEY, period);
  } catch {
    /* a preference, not a fact */
  }
}

export interface ReportsSurface {
  vm: ReportVM;
  /** What the broadcasts and playbooks sent over the same period; null when that read failed and the receptionist's own numbers still stand (D9). */
  campaigns: CampaignReportVM | null;
  /** Asked, then booked: the one conversion line, from the calendar. */
  booking: BookingReportVM;
  /** Deals: one cohort and the stock; present only where a deal was ever recorded (0004). */
  deals: DealReportVM;
  /**
   * What the reach-outs wrote and what came back over the same period (Reach out Part 6, H3); null when that read failed,
   * absent where nothing reads it (the demo): the section then draws nothing of its own.
   */
  reachOuts?: ReachOutReportVM | null;
  /** Worth knowing: at most three facts from these same numbers (contracts' reportFacts). */
  facts: ReportFactVM[];
  /** The range this is of: what the control says is chosen. */
  range: ReportRange;
  /** Its one name (contracts reportRangeKey): what the views are held by, and what Ask reads of days a member picked. */
  key: string;
  /** The period by name; null where this is of days a member picked. */
  period: ReportPeriodId | null;
  /** The days the range is (Month: the days since the 1st): what Ask reads of a period. */
  days: number;
  /**
   * The days that were asked for and the report refused, where this is the period read in their place: the page says
   * which days it could not read and moves the address off them (reports-page.tsx). Never held with a view.
   */
  refused?: ReportDays;
  fetchedAt: number;
}

/** The ranges this tab has read (held views): going back to one paints at once, and the read behind it keeps it current. */
const reportsHeld = heldViews<ReportsSurface>(4);
/** Paint a range this tab holds for the range now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldReports(): boolean {
  const have = reportsHeld.get(shownReportKey());
  if (!have) return false;
  setSurfaceValue("reports", have);
  window.dispatchEvent(new CustomEvent("surface:reports"));
  return true;
}

/** The report, the offers' and the reach-outs' over one range: the three reads the page opens on (contracts PREFETCH_READS). */
function readRange(range: ReportRange) {
  const query = rangeQuery(range);
  return Promise.all([
    read("GET reports", { query }),
    // The offers' numbers are their own read. A failure there used to fail
    // the whole surface -- the page went blank, and its own "could not be
    // read" line could never render (the audit's D9). Null is its state.
    read("GET reports/campaigns", { query }).catch((e: unknown) => e as Error),
    // The reach-outs' are too (Part 6): their section says it could not read them, and the rest stands.
    read("GET reports/reach-outs", { query }).catch((e: unknown) => e as Error),
  ]);
}

/**
 * Whether a read failed because the report refuses these days (days to come, more than a report reads, a database that
 * cannot read picked days yet): the route's own verdict, never a guess made here. A period by name is never refused.
 */
const refusesDays = (range: ReportRange, e: unknown): range is ReportDays =>
  typeof range !== "string" && e instanceof ApiError && e.code === "validation";

/**
 * Reports: the receptionist's own numbers over the period the page shows, built from one SQL function that already applies the
 * Today metrics' rules (the tenant's time zone, no undated imports, answered-by = first reply), with the campaigns' and the
 * reach-outs' reads beside it. Realtime message inserts re-apply it while its page is on screen, so today's column moves.
 */
export const reportsOverride: SurfaceOverride = {
  key: "reports",
  value: "reports",
  // Read where Reports is drawn and nowhere else: every other page's boot leaves the whole report, the campaigns' and the reach-outs'
  // reads alone (Today reads the headline, headline.ts). It is read as its page comes on screen.
  onDemand: true,
  events: ["surface:reports"],
  refreshOnMessageInserts: true,
  // A message moves the period's numbers: read again only while its page is on screen, and once when it comes back
  // (surface-registry.ts).
  refreshWhen: onlyOnItsPage("reports", DEFAULT_REFRESH_TABLES),
  debounceMs: 800,
  // A range's reads take their turn; a pick of another range is read at once (activateOverride).
  view: shownReportKey,
  apply: async () => {
    const asked = shownReportRange();
    // What is published is of the range that was read: the one asked for, or, where the report refuses the days asked
    // for, the period kept in this browser, read in their place and published with the days it stands in for. The page
    // always has real numbers that way, says which days it could not read, and moves the address off them
    // (reports-page.tsx, period.ts). A link to such days used to open on "Can't reach your workspace", which was not
    // true: the workspace answered.
    let range = asked;
    let refused: ReportDays | null = null;
    const [data, campaigns, reachOuts] = await readRange(asked).catch((e: unknown) => {
      if (!refusesDays(asked, e)) throw e;
      refused = asked;
      range = reportPeriod;
      return readRange(range);
    });
    const key = reportRangeKey(range);
    if (campaigns instanceof Error) console.error("reports_campaigns_fetch_failed", campaigns.message);
    if (reachOuts instanceof Error) console.error("reports_reach_outs_fetch_failed", reachOuts.message);
    // A pick of another range while this read was out: its answer is for a range left, and never lands on the new
    // one. A held range answers a pick at once and is read again behind it, so two reads can be out together.
    if (reportRangeKey(asked) !== shownReportKey()) return;
    const vm = toReportVM(data.report, { profile: data.profile });
    const surface: Omit<ReportsSurface, "facts"> = {
      vm,
      campaigns: campaigns instanceof Error ? null : toCampaignReportVM(campaigns.report),
      booking: toBookingReportVM(data.booking),
      // The period's name is the report's, so the two sentences never disagree about the range.
      deals: toDealReportVM(data.deals, vm.period.within),
      reachOuts: reachOuts instanceof Error ? null : toReachOutReportVM(reachOuts.report),
      range,
      key,
      period: typeof range === "string" ? range : null,
      days: vm.days,
      fetchedAt: Date.now(),
    };
    // Worth knowing is derived here, once, from the same two view models the page draws: never in the page.
    const whole: ReportsSurface = { ...surface, facts: reportFacts(surface.vm, surface.campaigns) };
    reportsHeld.hold(key, whole);
    setSurfaceValue("reports", refused ? { ...whole, refused } : whole);
  },
};
