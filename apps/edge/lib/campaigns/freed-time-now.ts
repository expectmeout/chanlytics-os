/**
 * POST /api/admin/calendar/freed-time -- an hour a cancellation freed, offered now because a member pressed Offer it on
 * Today's day (Today in three zones, 2 Nov 2026; decision 0082).
 *
 * The door is api/admin/calendar/freed-time.ts: it checks who may knock (authorizeAdmin) and reads the body, then hands
 * this the knock (`auth`) and what the body carried. Body { tenant_id, user_id, appointment_id }: the visit that was
 * cancelled; the span it freed is read from the visit, as the arrival reads it. The offer is the one the edge makes when
 * the cancellation arrives (freed-time-offer.ts offerFreedTime): the workspace's running step on `slot_opened`, once per
 * appointment, its batch waiting for the owner's OK where the sequence asks first. A second press, or the arrival's own
 * offer, is answered by the batch the first made.
 *
 * What came of it is a 200 ({ offered, people, waits }, or { offered: false, why } where the time cannot be offered now or
 * the run did nothing, with the run's reason in `detail`); a run that failed is a 500 with its reason in `detail`.
 */
import { json, refuse } from "../shared/http.js";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { pg } from "../shared/pg.js";
import { UUID, freedTimeOf, isTenantId } from "@chanlytics/contracts";
import { findFreedTimeFacts } from "@chanlytics/db/campaigns";
import { offerFreedTime } from "./freed-time-offer.js";

/**
 * The span offered is the one the cancellation's arrival would offer (core subscribers.ts freedTimeAsked, contracts
 * freedTimeOf): the longest open part of the visit's own time, as the receptionist would book it now, never a span the
 * page sends. The owner's press stands in for the service's word on the cancel.
 */
export async function offerFreedTimeNow(
  auth: Admitted,
  body: Partial<{
    tenant_id?: unknown;
    user_id?: unknown;
    appointment_id?: unknown;
  }>,
): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  const userId = personFor(auth, body.user_id) ?? "";
  const appointmentId = typeof body.appointment_id === "string" ? body.appointment_id : "";
  if (!isTenantId(tenantId) || !UUID.test(userId) || !UUID.test(appointmentId)) return refuse(400, "bad_request");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  try {
    const now = new Date();
    const facts = await findFreedTimeFacts(db, tenantId, appointmentId, now.getTime());
    if (!facts) return json(200, { ok: true, offered: false, why: "gone" });
    const verdict = freedTimeOf({ change: "cancelled", by: "service" }, facts.row, facts.calendar, now);
    if (!verdict.ok) return json(200, { ok: true, offered: false, why: verdict.why });
    const offer = await offerFreedTime(
      db,
      tenantId,
      { from: appointmentId, start: verdict.start, end: verdict.end },
      now,
    );
    return json(200, { ok: true, ...offer });
  } catch (e) {
    return refuse(500, "run_failed", e instanceof Error ? e.message : String(e));
  }
}
