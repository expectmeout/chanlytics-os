import "server-only";
import {
  HAND_BACK_REASONS,
  OPEN_HOLDS_READ_MAX,
  type EscalationDto,
  type EscalationState,
} from "@chanlytics/contracts";
import { openRequestsOfThreads } from "@chanlytics/db/calendar";
import { readerStamp, type Reader } from "../shared/reader";
import { isGoing } from "../people/going";
import { listHoldsHandedBack, listHoldsWaiting } from "@chanlytics/db/conversations";

/**
 * The booking each open booking_request hold asks to confirm (decision 0061), laid on its hold: the request card's day,
 * hours and service (the thread canvas, 1 Nov 2026). A thread's newest open request is its own; a hold whose request was
 * answered elsewhere since keeps none, and says its line alone.
 */
async function withRequests(
  rc: Parameters<(typeof escalations)["read"]>[0],
  rows: Array<EscalationDto & { conversation_id: string }>,
): Promise<Array<EscalationDto & { conversation_id: string }>> {
  const asking = rows.filter((e) => e.reason === "booking_request" && e.state === "open").map((e) => e.conversation_id);
  if (!asking.length) return rows;
  const requests = await openRequestsOfThreads(rc.ctx.supabase, rc.tenantId, asking);
  const byThread = new Map<string, (typeof requests)[number]>();
  for (const r of requests)
    if (r.conversation_id && !byThread.has(r.conversation_id)) byThread.set(r.conversation_id, r);
  return rows.map((row) => {
    const item = row.reason === "booking_request" ? byThread.get(row.conversation_id) : undefined;
    return item
      ? {
          ...row,
          request: {
            id: item.id,
            starts_at: item.starts_at,
            ends_at: item.ends_at,
            service: item.service ?? null,
            expires_at: item.expires_at ?? null,
          },
        }
      : row;
  });
}

/**
 * GET escalations, as the route answers it: the workspace's escalations in one state (the route's default is open),
 * newest first. Read in two halves under one table name, a hundred each: the holds that wait on a person (every reason
 * but a hand-back's), then those that wait on nobody (a customer's STOP, contracts HAND_BACK_REASONS). A workspace with
 * many legacy STOP holds left open (00409) had them crowd the oldest waiting customers out of a hundred read together,
 * and every count read from this dropped them (the wiring's second audit, S7-7). The complement is the waiting half, so a
 * reason added later is read as waiting, as contracts holdActOf counts it. None is a row of its own: an escalation is
 * cited by its thread.
 */
export const escalations: Reader<
  { state: EscalationState },
  { escalations: Array<EscalationDto & { conversation_id: string }> }
> = {
  name: "escalations",
  async read(rc, { state }) {
    const { supabase } = rc.ctx;
    const tenantId = rc.tenantId;
    const [waiting, handBack] = await Promise.all([
      listHoldsWaiting(supabase, tenantId, state, HAND_BACK_REASONS, OPEN_HOLDS_READ_MAX),
      listHoldsHandedBack(supabase, tenantId, state, HAND_BACK_REASONS, OPEN_HOLDS_READ_MAX),
    ]);
    if (waiting.error) throw new Error(waiting.error.message);
    if (handBack.error) throw new Error(handBack.error.message);
    // The column is text under a CHECK; the contract names the two states, so the client reads the enum, not a string.
    const now = rc.now.getTime();
    const escalations: Array<EscalationDto & { conversation_id: string }> = [
      ...(waiting.data ?? []),
      ...(handBack.data ?? []),
    ]
      // Nobody waits on someone being erased, and a hold of theirs would read their thread back into the Inbox by its id.
      .filter((e) => !isGoing(e.conversations?.contacts?.erasing_since, now))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(({ id, reason, details, state: held, created_at, conversation_id }) => ({
        id,
        reason,
        details,
        state: held as EscalationDto["state"],
        created_at,
        conversation_id,
      }));
    return { data: { escalations: await withRequests(rc, escalations) }, rows: [], stamp: readerStamp() };
  },
};
