import "server-only";

/**
 * A lead's name or city put right by its owner (00631 lead_named; decision 0079's sprint, step 8: a wrong value is fixed
 * once). The rule is SQL's, on the member's own session: the lead says it from then on in every email, each email of
 * theirs still waiting with a line written from the old record is written again, and their preview's workspace takes
 * the name. This asks the door and says its refusals in contracts' words; what the door cannot reach, the preview's own
 * receptionist, is the previews' (server/previews/named.ts), and the route asks both.
 */
import { AppError, leadNamedRefusal } from "@chanlytics/contracts";
import { nameLead } from "@chanlytics/db/leads";
import { dbRefusal, type RouteContext } from "../shared/with-route";

type Ctx = Pick<RouteContext, "supabase">;

/** The owner's own name or city for a lead: the lead as it now says, or the door's refusal in contracts' words. */
export async function nameLeadFor(
  ctx: Ctx,
  leadId: string,
  input: { business_name?: string | undefined; city?: string | undefined },
) {
  const { data, error } = await nameLead(ctx.supabase, {
    leadId,
    businessName: input.business_name ?? null,
    city: input.city ?? null,
  });
  if (error) throw dbRefusal(error);
  if (!data.ok) {
    if (data.error === "gone") throw new AppError("not_found", leadNamedRefusal(data.error), 404);
    if (data.error === "bad_name" || data.error === "bad_city")
      throw new AppError("validation", leadNamedRefusal(data.error));
    throw new AppError("conflict", leadNamedRefusal(data.error), 409);
  }
  return {
    lead_id: leadId,
    business_name: data.business_name,
    city: data.city,
    again: data.again,
    version: data.version,
  };
}
