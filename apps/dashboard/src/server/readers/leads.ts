import "server-only";
import {
  ROLE_PERMS,
  addressOf,
  leadsRoute,
  personName,
  type LeadsQuery,
  type PersonAtLeadDto,
  type SequencePlaceDto,
} from "@chanlytics/contracts";
import { peopleAtLead, sequencePlaceOf } from "@chanlytics/db";
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

/**
 * GET leads/:id/place: where one lead stands in a sequence (00459 sequence_place, the one reader): the sequence its place
 * stands in (else the last it was in), its row as that sequence's Leads tab files it, each send of its there, and how a
 * reply is learned of. Null for a lead in no sequence. What the lead sheet's Sequence section draws, and what Ask reads
 * of one lead's place, so both say what the record says. The sequence is the row a citation names.
 */
export const leadPlace: Reader<{ id: string }, SequencePlaceDto | null> = {
  name: "lead_place",
  async read(rc, { id }) {
    const data = await sequencePlaceOf(rc.ctx.supabase, rc.tenantId, id);
    return {
      data,
      rows: data
        ? [
            {
              kind: "playbook" as const,
              id: data.sequence.id,
              route: addressOf({ kind: "campaign", id: data.sequence.id }),
              label: data.sequence.name,
            },
          ]
        : [],
      stamp: stamp(),
    };
  },
};

/**
 * The people who work at one lead (0052: contacts.lead_id, packages/db peopleAtLead), the most recently in touch first, as
 * a person's business sheet lists them: what Ask's leads.lead says beside the lead. Each is a row a citation names,
 * opened at their page.
 */
export const leadPeople: Reader<{ id: string }, PersonAtLeadDto[]> = {
  name: "lead_people",
  async read(rc, { id }) {
    const data = await peopleAtLead(rc.ctx.supabase, rc.tenantId, id);
    return {
      data,
      rows: data.map((p) => ({
        kind: "person" as const,
        id: p.id,
        route: addressOf({ kind: "person", id: p.id }),
        label: personName(p),
      })),
      stamp: stamp(),
    };
  },
};
