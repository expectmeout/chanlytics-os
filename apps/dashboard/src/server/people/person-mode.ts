/**
 * The receptionist's mode for ONE person (PUT /api/v1/contacts/:id/receptionist): "auto" answers them, "ask" holds
 * every reply for a human, "never" keeps the receptionist out of their thread entirely, "inherit" removes the person's
 * own row so the workspace policy applies again. Stored as a policies row scoped to the contact and read by the edge on
 * every inbound message, so it takes effect on the person's next text; on the ledger as what it is, silencing or
 * un-silencing the receptionist for one person. The route declares who may (owner-only: it changes what a real customer
 * experiences) and how often; the contact is its row (contactScope).
 */
import type { z } from "zod";
import type { PersonReceptionistMode, ReceptionistModeBody } from "@chanlytics/contracts";
import { setPersonReplyMode } from "@chanlytics/db/workspace";
import { recordDecision, type contactScope } from "@/server/shared/verbs";
import type { RouteContext } from "@/server/shared/with-route";

/** The person a contactScope route acts on, as the scope read them. */
type ContactRow = Awaited<ReturnType<typeof contactScope.load>>;

export async function setPersonMode(
  ctx: RouteContext,
  contact: ContactRow,
  input: z.infer<typeof ReceptionistModeBody>,
) {
  const id = contact.id;
  const receptionistMode: PersonReceptionistMode = input.mode;
  const was = await setPersonReplyMode(
    ctx.supabase,
    contact.tenant_id,
    id,
    receptionistMode === "inherit" ? null : receptionistMode,
  );

  // On the ledger as what it is: silencing or un-silencing the receptionist
  // for one person, with the mode in the payload.
  const decisionId = await recordDecision(
    ctx,
    contact.tenant_id,
    "contact",
    id,
    receptionistMode === "auto" || receptionistMode === "inherit" ? "resume_agent" : "pause_agent",
    { receptionist_mode: receptionistMode },
  );

  // The ledger row rides back so an undo can name it, and the mode the person had before this write (null: the
  // workspace's own), so an undo puts back what was there now and not what a card read when it was proposed.
  return {
    contact_id: id,
    mode: receptionistMode === "inherit" ? null : receptionistMode,
    decision_id: decisionId,
    was: { mode: was },
  };
}
