import { z } from "zod";
import { mergePeople } from "@chanlytics/db";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { dbRefusal } from "@/server/with-route";

const Body = z.object({
  merge: z.uuid({ message: "Choose the record to merge into this one." }),
});

/**
 * POST /api/v1/contacts/:id/merge — { merge }
 *
 * Two records of one person become one (decision 0028): `:id` is the record the owner keeps, `merge` the other. The act
 * is the database's (`merge_people`, 00325): one transaction that moves the merged record's identities, thread, deals,
 * leads, notes, lists, receptionist mode and ledger to the kept one, applies the most careful of their two answers on
 * each consent question, marks the merged row and writes the decision. It cannot be undone, so it is the owner's, as
 * Delete is, and the page asks for the kept person's name typed before it calls here.
 *
 * The kept record is read under RLS first (contactScope): a record the caller cannot see is a 404, never a leak. The
 * door judges the other record itself and refuses in a sentence contracts holds (MERGE_REFUSALS): two different
 * numbers or addresses, a deleted or merged record, two open deals for one service. Each comes back as it was said.
 */
export const POST = write({
  scope: contactScope,
  role: "owner",
  rate: "erase",
  input: Body,
  handle: async ({ ctx, row: contact, input: body }) => {
    try {
      return await mergePeople(ctx.supabase, contact.id, body.merge);
    } catch (e) {
      throw dbRefusal(e as { code?: string | null; message: string });
    }
  },
});

export const dynamic = "force-dynamic";
