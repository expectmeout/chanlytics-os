import "server-only";
import type { LeadsQuery } from "@chanlytics/contracts";
import { leadsPage } from "../lead-page";
import { stamp, type Reader } from "./index";

/**
 * GET leads, as the route answers it: a page of the Leads scope's rows as the database ordered them (leads_page), the
 * rail's list, the class, the sort and its direction all SQL under the caller's row security; the first page brings the
 * rail's counts and the month with it. The route's body, moved here, so Leads' page and Ask's context read one page the
 * same way. A lead is not a row a citation names until Phase 4, so it names none.
 */
export const leads: Reader<LeadsQuery, Awaited<ReturnType<typeof leadsPage>>> = {
  name: "leads",
  async read(rc, q) {
    return { data: await leadsPage(rc.ctx, rc.tenantId, q), rows: [], stamp: stamp() };
  },
};
