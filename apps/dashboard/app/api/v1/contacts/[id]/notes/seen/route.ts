import { z } from "zod";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { seeNote } from "@/server/people/person-notes";

const Body = z.object({ note_id: z.uuid({ message: "Name the note you read." }) }).strict();

/**
 * POST /api/v1/contacts/:id/notes/seen — { note_id }
 *
 * Got it (canvas A, Up next): the member a note is for says they read it, and it leaves their Up next on every tab and
 * device. Their own mark, a viewer's too, as a bell's is: it changes nothing but their own reading. The note is read on
 * this person under RLS first (noteOn), and the door (person_note_seen, 00412) refuses a note that is for someone else.
 * The handle is seeNote in src/server/people/person-notes.ts.
 */
export const POST = write({
  scope: contactScope,
  role: "viewer",
  rate: "seen_mark",
  input: Body,
  handle: ({ ctx, row: contact, input }) => seeNote(ctx, contact.id, input.note_id),
});

export const dynamic = "force-dynamic";
