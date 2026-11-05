/**
 * What a tab could not hear or read in its life, said with its page speed as it is put away (the page-open PRD of 3 Nov
 * 2026, L7). A read that failed, or a feed that dropped, was said on the tab's own status line and in its console, and
 * nowhere else: a customer's feed could be down for a day and nothing the platform reads would know. Now each tab counts
 * them and reports them beside its page speed (POST vitals, page_vitals): how long its feed was down (FEED_DOWN, ms), how
 * many times it came back (FEED_BACK), and each surface's reads that failed (READ_FAILED, the surface its part). Counts and
 * durations only, never a value; a tab that heard and read everything says nothing.
 */
import { MIN_MS, type PageVitalReportDto } from "@chanlytics/contracts";
import { speedHost } from "@/client/page-speed";
import { getConnection, onSurfaceStatusChange } from "../surface-status";

let downSince: number | null = null;
let downMs = 0;
let back = 0;
const failed = new Map<string, number>();
let said = 0;
/** The longest a report says (page_vitals.value): a feed down longer is said as ten minutes, on each put-away. */
const LONGEST_MS = 10 * MIN_MS;

/** The feed said down, or up again: what FEED_DOWN and FEED_BACK count. */
export function noteFeed(down: boolean, now: number = Date.now()): void {
  if (down && downSince === null) downSince = now;
  if (!down && downSince !== null) {
    downMs += now - downSince;
    downSince = null;
    back += 1;
  }
}

/** A surface's read failed: what READ_FAILED counts, under the surface. */
export function noteReadFailed(key: string): void {
  failed.set(key, (failed.get(key) ?? 0) + 1);
}

/** A surface's key as a part of a page's report (PAGE_NAME: a word in lower case, hyphens for its underscores). */
const partOf = (key: string): string =>
  key
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, 32);

/** The reports what was counted makes, and forgets it: a feed still down is counted to `now` and goes on counting. */
export function freshnessReports(now: number = Date.now()): Array<Pick<PageVitalReportDto, "name" | "value" | "part">> {
  const down = downMs + (downSince === null ? 0 : now - downSince);
  if (downSince !== null) downSince = now;
  const out: Array<Pick<PageVitalReportDto, "name" | "value" | "part">> = [];
  if (down > 0) out.push({ name: "FEED_DOWN", value: Math.min(down, LONGEST_MS) });
  if (back > 0) out.push({ name: "FEED_BACK", value: back });
  for (const [key, n] of failed) {
    const part = partOf(key);
    if (part) out.push({ name: "READ_FAILED", value: n, part });
  }
  downMs = 0;
  back = 0;
  failed.clear();
  return out;
}

/**
 * Each time the page is put away, what was counted goes with its page speed (installPageSpeed's beacon). The feed's state is
 * heard where the runner says it (surface-status.ts setConnection), so nothing else has to remember to count it.
 */
export function installFreshnessReports(win: Window = window): void {
  onSurfaceStatusChange(() => noteFeed(getConnection().realtimeDown));
  const flush = () => {
    const host = speedHost();
    if (!host) return;
    const reports = freshnessReports();
    if (!reports.length) return;
    const page = host.pageAt(performance.now()).page;
    const load = Math.round(performance.timeOrigin);
    for (const r of reports) host.fieldData.note({ id: `f${load}-${(said += 1)}`, page, ...r });
  };
  win.addEventListener("pagehide", flush);
  win.document?.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "hidden") flush();
  });
}
