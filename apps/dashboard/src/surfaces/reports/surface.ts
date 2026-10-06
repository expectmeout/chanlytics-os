/**
 * The Reports override: the period the page shows (kept in this browser) and the report over it. Part of the SurfaceData
 * seam (legacy-bridge/surface-data.ts); the page reads what it publishes through `useSurface("reports")`. The lens on screen
 * is the address's, not this surface's: every lens draws from this one read, so a move between lenses asks for nothing.
 */

import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import {
  REPORT_PERIOD_DEFAULT,
  isReportPeriod,
  reportFacts,
  toBookingReportVM,
  toCampaignReportVM,
  toDealReportVM,
  toReachOutReportVM,
  toReportVM,
  type BookingReportVM,
  type CampaignReportVM,
  type DealReportVM,
  type ReachOutReportVM,
  type ReportFactVM,
  type ReportPeriodId,
  type ReportVM,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEFAULT_REFRESH_TABLES } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue } from "../surface-values";

/* ------------------------------- Reports --------------------------------- */

const REPORT_PERIOD_KEY = "chanlytics.report.period";
let reportPeriod: ReportPeriodId = REPORT_PERIOD_DEFAULT;
try {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(REPORT_PERIOD_KEY);
    if (isReportPeriod(saved)) reportPeriod = saved;
  }
} catch {
  /* storage unavailable: the default period stands */
}

/** The period the page is on now, or on its way to: the one kept in this browser. */
export const shownReportPeriod = (): ReportPeriodId => reportPeriod;

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
  /** The period this is of: what the control says is chosen, and what the views are held by. */
  period: ReportPeriodId;
  /** The days the period is (Month: the days since the 1st): what Ask reads. */
  days: number;
  fetchedAt: number;
}

/** The periods this tab has read (held views): going back to one paints at once, and the read behind it keeps it current. */
const reportsHeld = heldViews<ReportsSurface>(4);
/** Paint a period this tab holds for the period now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldReports(): boolean {
  const have = reportsHeld.get(reportPeriod);
  if (!have) return false;
  setSurfaceValue("reports", have);
  window.dispatchEvent(new CustomEvent("surface:reports"));
  return true;
}

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
  // A period's reads take their turn; a pick of another period is read at once (activateOverride).
  view: () => reportPeriod,
  apply: async () => {
    const period = reportPeriod;
    const [data, campaigns, reachOuts] = await Promise.all([
      read("GET reports", { query: { period } }),
      // The offers' numbers are their own read. A failure there used to fail
      // the whole surface -- the page went blank, and its own "could not be
      // read" line could never render (the audit's D9). Null is its state.
      read("GET reports/campaigns", { query: { period } }).catch((e: unknown) => e as Error),
      // The reach-outs' are too (Part 6): their section says it could not read them, and the rest stands.
      read("GET reports/reach-outs", { query: { period } }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("reports_campaigns_fetch_failed", campaigns.message);
    if (reachOuts instanceof Error) console.error("reports_reach_outs_fetch_failed", reachOuts.message);
    // A pick of another period while this read was out: its answer is for a period left, and never lands on the new
    // one. A held period answers a pick at once and is read again behind it, so two reads can be out together.
    if (period !== reportPeriod) return;
    const vm = toReportVM(data.report, { profile: data.profile });
    const surface: Omit<ReportsSurface, "facts"> = {
      vm,
      campaigns: campaigns instanceof Error ? null : toCampaignReportVM(campaigns.report),
      booking: toBookingReportVM(data.booking),
      // The period's name is the report's, so the two sentences never disagree about the range.
      deals: toDealReportVM(data.deals, vm.rangeLabel),
      reachOuts: reachOuts instanceof Error ? null : toReachOutReportVM(reachOuts.report),
      period,
      days: vm.days,
      fetchedAt: Date.now(),
    };
    // Worth knowing is derived here, once, from the same two view models the page draws: never in the page.
    const whole: ReportsSurface = { ...surface, facts: reportFacts(surface.vm, surface.campaigns) };
    reportsHeld.hold(period, whole);
    setSurfaceValue("reports", whole);
  },
};
