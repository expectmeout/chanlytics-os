/**
 * Honour a deletion request: the whole of DELETE /api/v1/contacts/:id, behind the route that judges who may ask (the
 * owner, on the contact's own workspace, on a fresh session). The erasure itself, its order and its legs, is
 * packages/jobs's (erasure.ts, erasePerson; decision 0036): the run the erasure_finish job repeats for a person a
 * press left blocked, so a stopped erasure finishes without a second press. This is how the route hands it its
 * clients: the session's for the key reads, the Ask scrub, the policy delete and erase_contact (RLS the floor, the
 * owner judged here and again in the function), the service role's for the block, Storage and the scrubs granted to it
 * alone, and the member's own ledger row for a leg that runs late (the Storage sweep). A press of many hands each of
 * its people to the ledger on the same clients (eraseContactByTheLedger): the block and the finish are the service
 * role's there as here, so the erasure takes that client in this one place.
 */
import "server-only";
import { eraseByTheLedger, eraseOrRedrive } from "@chanlytics/jobs";
import { callEdge, edgeAnswered } from "@/server/edge";
import { deployment } from "@/server/env";
import { serviceDb } from "@/server/service-db";
import { type erasureScope, recordDecision } from "@/server/verbs";
import type { RouteContext } from "@/server/with-route";

/** How long the provider's leg may take: a delete per call at the edge, each bounded at 8 s by the adapter. */
const ERASE_CALLS_TIMEOUT_MS = 55_000;

/** The person an erasure acts on, as erasureScope read them: live, or already erased and re-driven. */
type ErasedContact = Awaited<ReturnType<typeof erasureScope.load>>;

/** The clients an erasure runs on, as a route hands them over (the header). */
function erasureClients(ctx: RouteContext, contact: ErasedContact): Parameters<typeof eraseOrRedrive>[0] {
  return {
    session: ctx.supabase,
    service: serviceDb(),
    record: (payload) => recordDecision(ctx, contact.tenant_id, "contact", contact.id, "erase", payload),
    // The person's calls taken off the voice provider, by the edge that holds its key (decision 0092).
    providerCalls: async (callIds) => {
      if (!deployment.providersLive) return { asked: 0, deleted: 0, refused: callIds.length };
      const r = await callEdge(
        "/api/admin/voice/erase-calls",
        { tenant_id: contact.tenant_id, call_ids: callIds },
        { workspace: contact.tenant_id, user: ctx.userId, timeoutMs: ERASE_CALLS_TIMEOUT_MS },
      );
      if (!edgeAnswered(r)) return { asked: callIds.length, deleted: 0, refused: callIds.length };
      const b = (r.body ?? {}) as { asked?: number; deleted?: number; refused?: number };
      return { asked: b.asked ?? callIds.length, deleted: b.deleted ?? 0, refused: b.refused ?? 0 };
    },
  };
}

export function eraseContact(ctx: RouteContext, contact: ErasedContact) {
  // Its ledger row says who pressed by itself: erase_contact reads them off the session.
  return eraseOrRedrive(erasureClients(ctx, contact), contact, { finishLater: true, by: null });
}

/**
 * One of a press of many (people-many.ts eraseMany): out of reach now and the ledger's to erase, on the word of the
 * member who pressed, whom the finish's row cannot name for itself (jobs erasure.ts eraseByTheLedger).
 */
export function eraseContactByTheLedger(ctx: RouteContext, contact: ErasedContact) {
  return eraseByTheLedger(erasureClients(ctx, contact), contact, ctx.userId);
}
