/**
 * Two records of one person become one (decision 0028): what the merge route does, as the signed-in owner.
 *
 * The act is the database's (`merge_people`, 00326; packages/db mergePeople): one transaction that moves the merged
 * record's identities, thread, deals, leads, notes, lists, receptionist mode and ledger to the kept one, applies the most
 * careful of their two answers on each consent question, marks the merged row and writes the decision. The door reads
 * the caller from the session, so the session client is what is handed in. A refusal the door raises (two different
 * numbers or addresses, a deleted or merged record, two open deals for one service, not an owner) is carried back in the
 * sentence it was said in, at the status its code says (dbRefusal).
 */
import { mergePeople } from "@chanlytics/db";
import { dbRefusal, type RouteContext } from "@/server/with-route";

export async function mergeRecords(ctx: RouteContext, keep: string, merge: string) {
  try {
    return await mergePeople(ctx.supabase, keep, merge);
  } catch (e) {
    throw dbRefusal(e as { code?: string | null; message: string });
  }
}
