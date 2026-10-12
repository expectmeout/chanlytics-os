import "server-only";

import {
  PAGE_SPEED_READ,
  PAGE_VITALS_READ,
  type PageSpeedRowDto,
  type PageSpotRowDto,
  type PageVitalsInputDto,
  type PageVitalsRowDto,
} from "@chanlytics/contracts";
import { notePageVitals, pageSpeed, pageSpots, pageVitalsP75 } from "@chanlytics/db";
import { serviceDb } from "../service-db";
import type { BackOffice } from "./platform";
import { log } from "@/server/log";

/**
 * Field data's doors (00255, 00408): the route keeps what a page load reported, and the back office reads the 75th
 * percentile of it: the first card's over page loads, and where the pages' time goes (decision 0053).
 *
 * All run on the service role, the only role granted page_vitals and its functions. A row names a page, a part of it,
 * a metric, a number and what the time went on, and no person or workspace, so it is not tenant data for RLS to decide
 * over, and no session has a reason to read or write the table itself: the route counts and checks each report before
 * it gets here.
 *
 * NONE FAILS LOUDLY. A report that could not be kept is a number lost, not an error for a page that is closing; a read
 * that fails leaves the back office's other cards standing, and says it could not be read.
 *
 * Cross-workspace: page timings name a page and a metric, no workspace; the reads are the back office's.
 */

/** Keeps one page load's reports, with its device and build; answers how many rows took them, 0 when the table could not. */
export async function keepPageVitals(input: PageVitalsInputDto): Promise<number> {
  const { data, error } = await notePageVitals(serviceDb(), input);
  if (error) {
    log.warn("page_vitals_not_kept", { code: error.code ?? null, message: String(error.message).slice(0, 200) });
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/** A back-office read that answers, or the refusal it would have been: a call that throws, at once or later, reads as one the database could not take. */
const readOrRefusal = <T>(call: () => PromiseLike<T>) =>
  Promise.resolve()
    .then(call)
    .then(
      (x) => x,
      () => ({ data: null, error: { code: "unreachable", message: "unreadable" } }),
    );

/**
 * The 75th percentile of each metric, over every page (page null) and over each page, from the latest page loads of the
 * last days (PAGE_VITALS_READ). Null when it could not be read; none when the database has no page_vitals_p75 yet,
 * which is a database 00255 has not reached, with no timings to show.
 */
export async function platformVitals(office: BackOffice): Promise<PageVitalsRowDto[] | null> {
  const r = await readOrRefusal(() => pageVitalsP75(office.db, PAGE_VITALS_READ));
  if (r.error) return r.error.code === "PGRST202" ? [] : null;
  // The generator types every column of a returned table as present; the row over every page has no page.
  return (r.data ?? []).map((row) => ({
    metric: row.metric,
    page: row.page,
    samples: row.samples,
    p75: row.p75,
  }));
}

const HOWS = new Set(["load", "move", "within", "all"]);
const DEVICES = new Set(["all", "desk", "phone", "unknown"]);
const WARMS = new Set(["all", "held", "read", "unknown"]);
const knownOr = <T extends string>(set: ReadonlySet<string>, v: unknown, fallback: T): T =>
  typeof v === "string" && set.has(v) ? (v as T) : fallback;

/**
 * Where the pages' time goes (00408, decision 0053): page_speed's rows and page_spots', read together. Null when either
 * could not be read; none of either when the database has not reached 00408, which has nothing to show yet.
 */
export async function platformSpeed(
  office: BackOffice,
): Promise<{ rows: PageSpeedRowDto[]; spots: PageSpotRowDto[] } | null> {
  const [speed, spots] = await Promise.all([
    readOrRefusal(() => pageSpeed(office.db, PAGE_SPEED_READ)),
    readOrRefusal(() => pageSpots(office.db, PAGE_SPEED_READ)),
  ]);
  if (speed.error || spots.error) {
    const missing = speed.error?.code === "PGRST202" || spots.error?.code === "PGRST202";
    return missing ? { rows: [], spots: [] } : null;
  }
  return {
    rows: (speed.data ?? []).map((r) => ({
      metric: r.metric,
      page: r.page,
      part: r.part ?? "",
      how: knownOr(HOWS, r.how, "all"),
      device: knownOr(DEVICES, r.device, "unknown"),
      warm: knownOr(WARMS, r.warm, "unknown"),
      samples: r.samples,
      p75: r.p75,
      waits_on: r.waits_on,
    })),
    spots: (spots.data ?? []).map((s) => ({
      metric: s.metric,
      page: s.page,
      el: s.el,
      samples: s.samples,
      p75: s.p75,
      phase: s.phase,
    })),
  };
}
