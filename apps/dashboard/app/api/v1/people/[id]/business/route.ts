import { PersonWorksAtSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { linkPersonToLead, unlinkPersonFromLead } from "@/server/people/person-works-at";

/**
 * PUT /api/v1/people/:id/business — { lead_id }: "Link a business…" (decision 0052). The person works at this lead of
 * the workspace, by a member's hand, settled: no later lead or reply moves them by itself. The door (person_join_lead,
 * 00413) refuses a lead of another workspace, erased or blanked.
 *
 * DELETE /api/v1/people/:id/business: "Not at this business". The person is unlinked from the lead they work at, settled;
 * the lead keeps its history, and the lock on the yes that came with it is lifted.
 *
 * Owner or operator, judged where the person lives (contactScope); the doors judge it again from the session.
 */
export const PUT = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: PersonWorksAtSchema,
  handle: ({ ctx, row: person, input }) => linkPersonToLead(ctx, person.id, input.lead_id),
});

export const DELETE = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  handle: ({ ctx, row: person }) => unlinkPersonFromLead(ctx, person.id),
});

export const dynamic = "force-dynamic";
