import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { setPersonMode, PersonModeChange } from "@/server/people/person-mode";

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
 *
 * The handle is setPersonMode in src/server/people/person-mode.ts: the route is its declaration (who may, how often),
 * the verb is what it does.
 */
export const PUT = write({
  scope: contactScope,
  role: "owner",
  rate: "person_mode",
  input: PersonModeChange,
  handle: ({ ctx, row, input }) => setPersonMode(ctx, row, input),
});
