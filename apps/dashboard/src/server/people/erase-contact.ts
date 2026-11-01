/**
 * Honour a deletion request: the whole of DELETE /api/v1/contacts/:id, behind the route that judges who may ask (the
 * owner, on the contact's own workspace, on a fresh session). The erasure itself, its order and its legs, is
 * packages/jobs's (erasure.ts, erasePerson; decision 0036): the run the erasure_finish job repeats for a person a
 * press left blocked, so a stopped erasure finishes without a second press. This is how the route hands it its
 * clients: the session's for the key reads, the Ask scrub, the policy delete and erase_contact (RLS the floor, the
 * owner judged here and again in the function), the service role's for the block, Storage and the scrubs granted to it
 * alone, and the member's own ledger row for a leg that runs late (the Storage sweep).
 */
import "server-only";
import { eraseOrRedrive } from "@chanlytics/jobs";
import { serviceDb } from "@/server/service-db";
import { type erasureScope, recordDecision } from "@/server/verbs";
import type { RouteContext } from "@/server/with-route";

/** The person an erasure acts on, as erasureScope read them: live, or already erased and re-driven. */
type ErasedContact = Awaited<ReturnType<typeof erasureScope.load>>;

export function eraseContact(ctx: RouteContext, contact: ErasedContact) {
  return eraseOrRedrive(
    {
      session: ctx.supabase,
      service: serviceDb(),
      record: (payload) => recordDecision(ctx, contact.tenant_id, "contact", contact.id, "erase", payload),
    },
    contact,
    { finishLater: true },
  );
}
