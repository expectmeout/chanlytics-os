import "server-only";
import {
  DAY_MS,
  PREVIEW_TRIED_DAYS,
  ROLE_PERMS,
  addressOf,
  leadsRoute,
  personName,
  type LeadEmailDto,
  type LeadEmailText,
  type LeadStepWordsDto,
  type LeadsQuery,
  type PersonAtLeadDto,
  type PreviewTriedDto,
  type SequencePlaceDto,
} from "@chanlytics/contracts";
import {
  listLeadEmails,
  findLeadSentEmail,
  listLeadWords,
  listPreviewsTriedSince,
  findSequencePlace,
} from "@chanlytics/db/campaigns";
import { listPeopleAtLead } from "@chanlytics/db/people";
import { getLeadOne, getLeadsPage } from "../leads/page-read";
import { readerStamp, type Reader } from "../shared/reader";

/**
 * GET leads, as the route answers it: a page of the Leads scope's rows as the database ordered them (leads_page), the
 * rail's list, the class, the sort and its direction all SQL under the caller's row security; the first page brings the
 * rail's counts and the month with it. The route's body, moved here, so Leads' page and Ask's context read one page the
 * same way. Each lead is a row a citation names, opened at its peek on the view it was read on. The month is read only
 * for a role that may find (ROLE_PERMS.find, as lead_month_used asks has_permission): an operator's or a viewer's page
 * is the rows without it, never a 500.
 */
export const leads: Reader<LeadsQuery, Awaited<ReturnType<typeof getLeadsPage>>> = {
  name: "leads",
  async read(rc, query) {
    const data = await getLeadsPage(rc.ctx, rc.tenantId, query, { month: ROLE_PERMS[rc.role]?.find === true });
    // Each row is cited open over the view it was read in, its chips with it (decision 0083, Phase B).
    const chips = {
      excluded_by: query.excluded_by,
      fit: query.fit,
      reach: query.reach,
      status_group: query.status_group,
    };
    const view = { searchId: query.search ?? null, list: query.list, cls: query.class ?? null, chips };
    return {
      data,
      rows: data.rows.map((r) => ({
        kind: "lead" as const,
        id: r.id,
        route: leadsRoute({ ...view, peek: r.id }),
        label: r.business_name,
      })),
      stamp: readerStamp(),
    };
  },
};

/**
 * GET leads/:id, as the route answers it: one lead as a row of the page (server/leads/page-read.ts getLeadOne), built by
 * the list's own builder, in the search the view is of when `search` names one, else its newest; a lead this workspace
 * does not hold is the route's 404. What the peek reads for a lead the pages it holds do not have, and what Ask reads
 * for one lead by its id. The lead is the row a citation names, opened at its peek on that search's view.
 */
export const lead: Reader<{ id: string; search?: string }, Awaited<ReturnType<typeof getLeadOne>>> = {
  name: "lead",
  async read(rc, { id, search }) {
    const data = await getLeadOne(rc.ctx, rc.tenantId, id, search);
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
      stamp: readerStamp(),
    };
  },
};

/**
 * GET lead-previews: the leads who tried their own receptionist in the last three days (decision 0079), newest first,
 * each with what came of it and the business's name: Today's rows, and what Ask reads of them. Each lead is a row a
 * citation names, opened at its peek.
 */
export const previewsTried: Reader<undefined, { previews: PreviewTriedDto[] }> = {
  name: "previews_tried",
  async read(rc) {
    const since = new Date(rc.now.getTime() - PREVIEW_TRIED_DAYS * DAY_MS).toISOString();
    const previews: PreviewTriedDto[] = await listPreviewsTriedSince(rc.ctx.supabase, rc.tenantId, since);
    return {
      data: { previews },
      rows: previews.map((p) => ({
        kind: "lead" as const,
        id: p.lead_id,
        route: addressOf({ kind: "lead", id: p.lead_id }),
        label: p.business ?? "A lead",
      })),
      stamp: readerStamp(),
    };
  },
};

/**
 * GET leads/:id/place: where one lead stands in a sequence (00459 sequence_place, the one reader): the sequence its place
 * stands in (else the last it was in), its row as that sequence's Leads tab files it, each send of its there, and how a
 * reply is learned of. Null for a lead in no sequence. What the lead sheet's Sequence section draws, and what Ask reads
 * of one lead's place, so both say what the record says. The sequence is the row a citation names.
 */
/** One lead's own emails (decision 0094), oldest first: the rows of its History no sequence wrote. */
export const leadEmails: Reader<{ id: string }, LeadEmailDto[]> = {
  name: "lead_emails",
  async read(rc, { id }) {
    return { data: await listLeadEmails(rc.ctx.supabase, rc.tenantId, id), rows: [], stamp: readerStamp() };
  },
};

/** One lead's own words at each step that has some (decision 0096): what the sheet's email says in place of the step's. */
export const leadWords: Reader<{ id: string }, LeadStepWordsDto[]> = {
  name: "lead_words",
  async read(rc, { id }) {
    return { data: await listLeadWords(rc.ctx.supabase, rc.tenantId, id), rows: [], stamp: readerStamp() };
  },
};

/** What one send of a lead's said as it went (decision 0096): what a step that went shows on the sheet. */
export const leadSent: Reader<{ id: string; send: string }, LeadEmailText | null> = {
  name: "lead_sent",
  async read(rc, { id, send }) {
    const data = await findLeadSentEmail(rc.ctx.supabase, { tenantId: rc.tenantId, leadId: id, sendId: send });
    return { data, rows: [], stamp: readerStamp() };
  },
};

export const leadPlace: Reader<{ id: string }, SequencePlaceDto | null> = {
  name: "lead_place",
  async read(rc, { id }) {
    const data = await findSequencePlace(rc.ctx.supabase, rc.tenantId, id);
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
      stamp: readerStamp(),
    };
  },
};

/**
 * The people who work at one lead (0052: contacts.lead_id, packages/db listPeopleAtLead), the most recently in touch first, as
 * a person's business sheet lists them: what Ask's leads.lead says beside the lead. Each is a row a citation names,
 * opened at their page.
 */
export const leadPeople: Reader<{ id: string }, PersonAtLeadDto[]> = {
  name: "lead_people",
  async read(rc, { id }) {
    const data = await listPeopleAtLead(rc.ctx.supabase, rc.tenantId, id);
    return {
      data,
      rows: data.map((p) => ({
        kind: "person" as const,
        id: p.id,
        route: addressOf({ kind: "person", id: p.id }),
        label: personName(p),
      })),
      stamp: readerStamp(),
    };
  },
};
