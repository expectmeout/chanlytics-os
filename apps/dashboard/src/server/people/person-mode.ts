/**
 * The receptionist's mode for ONE person (PUT /api/v1/contacts/:id/receptionist): "auto" answers them, "ask" holds
 * every reply for a human, "never" keeps the receptionist out of their thread entirely, "inherit" removes the person's
 * own row so the workspace policy applies again. Stored as a policies row scoped to the contact and read by the edge on
 * every inbound message, so it takes effect on the person's next text; on the ledger as what it is, silencing or
 * un-silencing the receptionist for one person. The route declares who may (owner-only: it changes what a real customer
 * experiences) and how often; the contact is its row (contactScope).
 */
import { z } from "zod";
import { setPersonReplyMode } from "@chanlytics/db";
import { recordDecision, type contactScope } from "@/server/verbs";
import type { RouteContext } from "@/server/with-route";

/** The person a contactScope route acts on, as the scope read them. */
type ContactRow = Awaited<ReturnType<typeof contactScope.load>>;

const MODES = ["auto", "ask", "never", "inherit"] as const;

type Mode = (typeof MODES)[number];

export const PersonModeChange = z.object({
  mode: z.enum(MODES, { message: "Mode must be one of: auto, ask, never, inherit." }),
});

export async function setPersonMode(ctx: RouteContext, contact: ContactRow, input: z.infer<typeof PersonModeChange>) {
  const id = contact.id;
  const m: Mode = input.mode;
  const was = await setPersonReplyMode(ctx.supabase, contact.tenant_id, id, m === "inherit" ? null : m);

  // On the ledger as what it is: silencing or un-silencing the receptionist
  // for one person, with the mode in the payload.
  const decisionId = await recordDecision(
    ctx,
    contact.tenant_id,
    "contact",
    id,
    m === "auto" || m === "inherit" ? "resume_agent" : "pause_agent",
    { receptionist_mode: m },
  );

  // The ledger row rides back so an undo can name it, and the mode the person had before this write (null: the
  // workspace's own), so an undo puts back what was there now and not what a card read when it was proposed.
  return { contact_id: id, mode: m === "inherit" ? null : m, decision_id: decisionId, was: { mode: was } };
}
