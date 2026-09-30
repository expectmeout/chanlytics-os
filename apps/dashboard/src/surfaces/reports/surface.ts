/**
 * The Reports override: the range the page shows (kept in this browser) and the
 * report over it. Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the
 * page reads what it publishes through `useSurface("reports")`.
 */

import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
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
  toReachOutReportVM,
  type ReachOutReportVM,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEFAULT_REFRESH_TABLES } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";

// Today and Ask, which have not moved, still read this under its old name.
declareSurfaceValue("reports", "__REPORTS");

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
  /**
   * What the reach-outs wrote and what came back over the same period (Reach out Part 6, H3); null when that read failed,
   * absent where nothing reads it (the demo): the section then draws nothing of its own.
   */
  reachOuts?: ReachOutReportVM | null;
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
  setSurfaceValue("reports", have);
  window.dispatchEvent(new CustomEvent("surface:reports"));
  return true;
}

export const reportsOverride: SurfaceOverride = {
  key: "reports",
  value: "reports",
  events: ["surface:reports"],
  refreshOnMessageInserts: true,
  // A message moves the period's numbers: read again only while its page is on screen, and once when it comes back
  // (surface-registry.ts).
  refreshWhen: onlyOnItsPage("reports", DEFAULT_REFRESH_TABLES),
  debounceMs: 800,
  // A period's reads take their turn; a pick of another period is read at once (activateOverride).
  view: () => String(reportDays),
  apply: async () => {
    const days = reportDays;
    const [data, campaigns, reachOuts] = await Promise.all([
      read("GET reports", { query: { days: String(days) } }),
      // The offers' numbers are their own read. A failure there used to fail
      // the whole surface -- the page went blank, and its own "could not be
      // read" line could never render (the audit's D9). Null is its state.
      read("GET reports/campaigns", { query: { days: String(days) } }).catch((e: unknown) => e as Error),
      // The reach-outs' are too (Part 6): their section says it could not read them, and the rest stands.
      read("GET reports/reach-outs", { query: { days: String(days) } }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("reports_campaigns_fetch_failed", campaigns.message);
    if (reachOuts instanceof Error) console.error("reports_reach_outs_fetch_failed", reachOuts.message);
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
      reachOuts: reachOuts instanceof Error ? null : toReachOutReportVM(reachOuts.report),
      days,
      fetchedAt: Date.now(),
    };
    // Worth knowing is derived here, once, from the same two view models the page draws: never in the page.
    const whole: ReportsSurface = { ...surface, facts: reportFacts(surface.vm, surface.campaigns) };
    reportsHeld.hold(String(days), whole);
    setSurfaceValue("reports", whole);
  },
};
