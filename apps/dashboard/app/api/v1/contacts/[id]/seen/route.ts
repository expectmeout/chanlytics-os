import { z } from "zod";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { markPersonSeen } from "@/server/people/person-seen";

const Body = z
  .object({
    seen: z.boolean({ message: "Say whether you have seen them: { seen: true } or { seen: false }." }),
    // How far they have seen: when the customer had last written or called, as the row they opened said it.
    heard_at: z.iso.datetime({ offset: true, message: "heard_at is a moment, in ISO 8601." }).optional(),
  })
  .strict();

/**
 * PUT /api/v1/contacts/:id/seen — { seen, heard_at? }
 *
 * The signed-in member's own mark on a person (00349): true as they open the person (their thread or their page), so
 * the row stops reading as new to them; false to put it back as unread. `heard_at` says how far they have seen, the
 * customer's last moment on the row they opened, so the mark and what it is judged against are one clock. Any
 * member's, a viewer's too, as a bell's mark is: it changes nothing but their own reading. The person is read under
 * RLS first (contactScope), so one not theirs is a 404. The handle is markPersonSeen in
 * src/server/people/person-seen.ts.
 */
export const PUT = write({
  scope: contactScope,
  role: "viewer",
  rate: "seen_mark",
  input: Body,
  handle: ({ ctx, row: contact, input }) =>
    markPersonSeen(ctx, contact.id, { seen: input.seen, heardAt: input.heard_at ?? null }),
});
