/**
 * A time asked for that ran out, whose job will not finish (decision 0061, as amended 22 Nov 2026; settle.ts): the
 * request is closed for a person to reply to, with nothing sent, so a request never waits on a run that will not come.
 */
import { REQUEST_LAPSE_WORDS, slotShort, type TenantId } from "@chanlytics/contracts";
import { closeLapsedRequest, findBookingRequest } from "@chanlytics/db/calendar";
import type { Db } from "./ledger";

/** True when this closed the request; false when it was answered, replaced or closed already. */
export async function closeForAPerson(db: Db, tenantId: TenantId, appointmentId: string): Promise<boolean> {
  const row = await findBookingRequest(db, tenantId, appointmentId);
  if (!row || row.source !== "receptionist" || row.status !== "proposed") return false;
  const replyWords = REQUEST_LAPSE_WORDS.reply(slotShort(Date.parse(row.startsAt), row.timezone), row.service);
  const done = await closeLapsedRequest(db, { tenantId, appointmentId, replyWords, told: null });
  return done.outcome === "reply" || done.outcome === "closed";
}
