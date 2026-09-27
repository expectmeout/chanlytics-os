import "server-only";
import { ROLE_PERMS, leadsRoute, type LeadsQuery } from "@chanlytics/contracts";
import { leadOne, leadsPage } from "../leads/lead-page";
import { stamp, type Reader } from "./index";

/**
 * GET leads, as the route answers it: a page of the Leads scope's rows as the database ordered them (leads_page), the
 * rail's list, the class, the sort and its direction all SQL under the caller's row security; the first page brings the
 * rail's counts and the month with it. The route's body, moved here, so Leads' page and Ask's context read one page the
 * same way. Each lead is a row a citation names, opened at its peek on the view it was read on. The month is read only
 * for a role that may find (ROLE_PERMS.find, as lead_month_used asks has_permission): an operator's or a viewer's page
 * is the rows without it, never a 500.
 */
export const leads: Reader<LeadsQuery, Awaited<ReturnType<typeof leadsPage>>> = {
  name: "leads",
  async read(rc, q) {
    const data = await leadsPage(rc.ctx, rc.tenantId, q, { month: ROLE_PERMS[rc.role]?.find === true });
    const view = { searchId: q.search ?? null, list: q.list, cls: q.class ?? null };
    return {
      data,
      rows: data.rows.map((r) => ({
        kind: "lead" as const,
        id: r.id,
        route: leadsRoute({ ...view, peek: r.id }),
        label: r.business_name,
      })),
      stamp: stamp(),
    };
  },
};

/**
 * GET leads/:id, as the route answers it: one lead as a row of the page (server/leads/lead-page.ts leadOne), built by
 * the list's own builder, in the search the view is of when `search` names one, else its newest; a lead this workspace
 * does not hold is the route's 404. What the peek reads for a lead the pages it holds do not have, and what Ask reads
 * for one lead by its id. The lead is the row a citation names, opened at its peek on that search's view.
 */
export const lead: Reader<{ id: string; search?: string }, Awaited<ReturnType<typeof leadOne>>> = {
  name: "lead",
  async read(rc, { id, search }) {
    const data = await leadOne(rc.ctx, rc.tenantId, id, search);
    return {
      data,
      rows: [
        {
          kind: "lead",
          id: data.row.id,
          route: leadsRoute({ searchId: search ?? null, peek: data.row.id }),
          label: data.row.business_name,
        },
      ],
      stamp: stamp(),
    };
  },
};
