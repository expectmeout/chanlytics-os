import { z } from "zod";
import { setPersonReplyMode } from "@chanlytics/db";
import { write } from "@/server/route";
import { contactScope, recordDecision } from "@/server/verbs";

const MODES = ["auto", "ask", "never", "inherit"] as const;
type Mode = (typeof MODES)[number];

const Body = z.object({
  mode: z.enum(MODES, { message: "Mode must be one of: auto, ask, never, inherit." }),
});

/**
 * PUT /api/v1/contacts/:id/receptionist — { mode: auto | ask | never | inherit }
 *
 * The receptionist's mode for ONE person. "auto" answers them, "ask" holds
 * every reply for a human, "never" keeps the receptionist out of their thread
 * entirely; "inherit" removes the person's own row so the workspace policy
 * applies again. Stored as a policies row scoped to the contact — the seam
 * Session A reserved — and read by the edge on every inbound message, so it
 * takes effect on the person's next text.
 *
 * Owner-only: it changes what a real customer experiences. RLS is the floor
 * (00029 lets owners insert and delete person-scoped reply rows); the role
 * is the door, judged where the contact lives (contactScope).
 */
export const PUT = write({
  scope: contactScope,
  role: "owner",
  rate: "person_mode",
  input: Body,
  handle: async ({ ctx, row: contact, input }) => {
    const id = contact.id;
    const m: Mode = input.mode;
    await setPersonReplyMode(ctx.supabase, contact.tenant_id, id, m === "inherit" ? null : m);

    // On the ledger as what it is: silencing or un-silencing the receptionist
    // for one person, with the mode in the payload.
    await recordDecision(
      ctx,
      contact.tenant_id,
      "contact",
      id,
      m === "auto" || m === "inherit" ? "resume_agent" : "pause_agent",
      { receptionist_mode: m },
    );

    return { contact_id: id, mode: m === "inherit" ? null : m };
  },
});
