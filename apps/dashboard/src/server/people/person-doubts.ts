/**
 * Not the same (decision 0034, step 4): what the dismiss route does, as the signed-in member.
 *
 * The doubt is read under RLS first, on this person (either side of the pair), so one that is not theirs is a 404 and
 * never a leak; the door (person_doubt_dismiss, 00343; packages/db dismissPersonDoubt) then settles the pair as the
 * caller, and the next arrival never raises it again. A refusal it raises (a pair the merge joined already) is carried
 * back in its own sentence at the status its code says (dbRefusal). Merge is 0028's door (merge-people.ts), not this.
 */
import { AppError, DOUBT_WORDS } from "@chanlytics/contracts";
import { dismissPersonDoubt, doubtOn } from "@chanlytics/db";
import { dbRefusal, type RouteContext } from "@/server/with-route";

export async function settleDoubtApart(ctx: RouteContext, tenantId: string, contactId: string, doubtId: string) {
  const doubt = await doubtOn(ctx.supabase, tenantId, contactId, doubtId);
  if (!doubt) throw new AppError("not_found", DOUBT_WORDS.notFound, 404);
  try {
    return await dismissPersonDoubt(ctx.supabase, doubtId);
  } catch (e) {
    throw dbRefusal(e as { code?: string | null; message: string });
  }
}
