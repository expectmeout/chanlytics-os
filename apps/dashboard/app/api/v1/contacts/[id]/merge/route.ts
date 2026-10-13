import { z } from "zod";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { mergeRecords } from "@/server/people/merge-people";

const Body = z.object({
  merge: z.uuid({ message: "Choose the record to merge into this one." }),
});

/**
 * POST /api/v1/contacts/:id/merge — { merge }
 *
 * Two records of one person become one (decision 0028): `:id` is the record the owner keeps, `merge` the other. It
 * cannot be undone, so it is the owner's and asks Auth whether the session is still live (`fresh`), as Delete does, and
 * the page asks for the kept person's name typed before it calls here. The kept record is read under RLS first (contactScope): a record the caller cannot see is a 404, never a
 * leak. The door judges the other record itself and refuses in a sentence contracts holds (MERGE_REFUSALS). The handle
 * is mergeRecords in src/server/people/merge-people.ts: the route is its declaration (who may, how often), the verb is
 * what it does.
 */
export const POST = write({
  scope: contactScope,
  fresh: true,
  role: "owner",
  rate: "merge",
  input: Body,
  handle: ({ ctx, row: contact, input: body }) => mergeRecords(ctx, contact.id, body.merge),
});
