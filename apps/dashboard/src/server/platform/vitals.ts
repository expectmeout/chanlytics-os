import "server-only";

import { PAGE_VITALS_READ, type PageVitalsInputDto, type PageVitalsRowDto } from "@chanlytics/contracts";
import { serviceDb } from "../service-db";
import type { BackOffice } from "./platform";

/**
 * Field data's two doors (00255): the route keeps what a page load reported, and the back office reads the 75th
 * percentile of it.
 *
 * Both run on the service role, the only role granted page_vitals and its two functions. A row names a page, a
 * metric and a number, and no person or workspace, so it is not tenant data for RLS to decide over, and no session
 * has a reason to read or write the table itself: the route counts and checks each report before it gets here.
 *
 * NEITHER FAILS LOUDLY. A report that could not be kept is a number lost, not an error for a page that is closing;
 * a read that fails leaves the back office's other cards standing, and says it could not be read.
 */

/** Keeps one page load's reports; answers how many rows took them, 0 when the table could not. */
export async function keepPageVitals(input: PageVitalsInputDto): Promise<number> {
  const { data, error } = await serviceDb().rpc("note_page_vitals", { p_page: input.page, p_vitals: input.vitals });
  if (error) {
    console.warn(
      "page_vitals_not_kept",
      JSON.stringify({ code: error.code ?? null, message: String(error.message).slice(0, 200) }),
    );
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/**
 * The 75th percentile of each metric, over every page (page null) and over each page, from the latest reports of the
 * last days (PAGE_VITALS_READ). Null when it could not be read; none when the database has no page_vitals_p75 yet,
 * which is a database 00255 has not reached, with no timings to show.
 */
export async function platformVitals(office: BackOffice): Promise<PageVitalsRowDto[] | null> {
  const r = await office.db
    .rpc("page_vitals_p75", { p_days: PAGE_VITALS_READ.days, p_most: PAGE_VITALS_READ.most })
    .then(
      (x) => x,
      () => ({ data: null, error: { code: "unreachable", message: "unreadable" } }),
    );
  if (r.error) return r.error.code === "PGRST202" ? [] : null;
  // The generator types every column of a returned table as present; the row over every page has no page.
  return (r.data ?? []).map((row) => ({
    metric: row.metric,
    page: row.page as string | null,
    samples: row.samples,
    p75: row.p75,
  }));
}
