/**
 * The Reports override: the range the page shows (kept in this browser) and the
 * report over it. Part of the SurfaceData seam (../surface-data.ts).
 */

import { read } from "../api";
import { heldViews } from "../held-views";
import {
  toReportVM,
  reportFacts,
  type ReportFactVM,
  REPORT_RANGES,
  type ReportVM,
  toCampaignReportVM,
  type CampaignReportVM,
  toBookingReportVM,
  type BookingReportVM,
  toDealReportVM,
  type DealReportVM,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";

/* ------------------------------- Reports --------------------------------- */

const REPORT_DAYS_KEY = "chanlytics.report.days";
let reportDays = 30;
try {
  if (typeof window !== "undefined") {
    const saved = Number(window.localStorage.getItem(REPORT_DAYS_KEY));
    if (REPORT_RANGES.some((r) => r.days === saved)) reportDays = saved;
  }
} catch {
  /* storage unavailable: the default range stands */
}

export function getReportDays(): number {
  return reportDays;
}

/** The one period every chart on Reports is scoped to. Only the presets. */
export function setReportDays(days: number): void {
  if (!REPORT_RANGES.some((r) => r.days === days)) return;
  reportDays = days;
  try {
    window.localStorage.setItem(REPORT_DAYS_KEY, String(days));
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
  /** Worth knowing: at most three facts from these same numbers (contracts' reportFacts). */
  facts: ReportFactVM[];
  days: number;
  fetchedAt: number;
}

/**
 * Reports — the receptionist's own numbers over a period.
 *
 * The mockup drew revenue, bookings and eight agents. This publishes the
 * report view model built from one SQL function that already applies the
 * Today metrics' rules (tenant time zone, no undated imports, answered-by =
 * first reply). Realtime message inserts re-apply so today's column moves.
 */
/** The periods this tab has read (held views): going back to one paints at once, and the read behind it keeps it current. */
const reportsHeld = heldViews<ReportsSurface>(4);
/** Paint a period this tab holds for the period now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldReports(): boolean {
  const have = reportsHeld.get(String(reportDays));
  if (!have) return false;
  (window as unknown as { __REPORTS?: ReportsSurface }).__REPORTS = have;
  window.dispatchEvent(new CustomEvent("surface:reports"));
  return true;
}

export const reportsOverride: SurfaceOverride = {
  key: "reports",
  globals: ["__REPORTS"],
  events: ["surface:reports"],
  refreshOnMessageInserts: true,
  debounceMs: 800,
  apply: async () => {
    const days = reportDays;
    const [data, campaigns] = await Promise.all([
      read("GET reports", { query: { days: String(days) } }),
      // The offers' numbers are their own read. A failure there used to fail
      // the whole surface -- the page went blank, and its own "could not be
      // read" line could never render (the audit's D9). Null is its state.
      read("GET reports/campaigns", { query: { days: String(days) } }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("reports_campaigns_fetch_failed", campaigns.message);
    // A pick of another period while this read was out: its answer is for a period left, and never lands on the new
    // one. A held period answers a pick at once and is read again behind it, so two reads can be out together.
    if (days !== reportDays) return;
    const vm = toReportVM(data.report);
    const surface: Omit<ReportsSurface, "facts"> = {
      vm,
      campaigns: campaigns instanceof Error ? null : toCampaignReportVM(campaigns.report),
      booking: toBookingReportVM(data.booking),
      // The period's name is the report's, so the two sentences never disagree about the range.
      deals: toDealReportVM(data.deals, vm.rangeLabel),
      days,
      fetchedAt: Date.now(),
    };
    // Worth knowing is derived here, once, from the same two view models the page draws: never in the page.
    const whole: ReportsSurface = { ...surface, facts: reportFacts(surface.vm, surface.campaigns) };
    reportsHeld.hold(String(days), whole);
    (window as unknown as { __REPORTS?: ReportsSurface }).__REPORTS = whole;
  },
};
