/**
 * What a person is called and where they work (decision 0052), as the signed-in member: "Use this name" on a reply's
 * signer, its Undo, the notice's ×, "Link a business…" and "Not at this business". Each is a door of 00413 that reads
 * the caller from the session (auth.uid()) and refuses anyone who may not act in the person's workspace, so the session
 * client is what is handed in. A refusal the door raises is carried back in its own sentence, at the status its code
 * says (dbRefusal); an answer that did nothing says why in the page's words (PERSON_NAME_WORDS.refused).
 */
import { AppError, PERSON_NAME_WORDS, type PersonNameAct } from "@chanlytics/contracts";
import {
  adoptPersonName,
  declinePersonName,
  joinPersonToLead,
  leavePersonLead,
  undoPersonName,
  type PersonNameAnswer,
} from "@chanlytics/db";
import { dbRefusal, type RouteContext } from "@/server/with-route";

/** A door's own refusal, carried back; an answer that did nothing, said in the page's words as a conflict. */
async function asDoor<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw dbRefusal(e as { code?: string | null; message: string });
  }
}

function done(a: PersonNameAnswer): { name: string | null } {
  if (!a.done) {
    const why = (a.why ?? "settled") as keyof typeof PERSON_NAME_WORDS.refused;
    throw new AppError("conflict", PERSON_NAME_WORDS.refused[why] ?? PERSON_NAME_WORDS.refused.settled, 409);
  }
  return { name: a.name };
}

/** POST people/:id/name: use, undo or decline a reply's signer's name. */
export async function actOnPersonName(ctx: RouteContext, personId: string, act: PersonNameAct) {
  const db = ctx.supabase;
  if (act.act === "adopt") return done(await asDoor(() => adoptPersonName(db, personId, act.message_id)));
  if (act.act === "undo") return done(await asDoor(() => undoPersonName(db, personId)));
  return { declined: (await asDoor(() => declinePersonName(db, personId, act.message_id))).done };
}

/** PUT people/:id/business: the person works at this lead (the wire is snake_case). */
export async function linkPersonToLead(ctx: RouteContext, personId: string, leadId: string) {
  const joined = await asDoor(() => joinPersonToLead(ctx.supabase, personId, leadId));
  return { lead_id: joined.leadId };
}

/** DELETE people/:id/business: not at this business. */
export function unlinkPersonFromLead(ctx: RouteContext, personId: string) {
  return asDoor(() => leavePersonLead(ctx.supabase, personId));
}
