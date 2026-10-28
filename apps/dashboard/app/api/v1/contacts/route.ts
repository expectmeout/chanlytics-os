import { z } from "zod";
import {
  AppError,
  PersonAddBody,
  normalizeEmail,
  normalizePhone,
  whyNotAPhone,
  whyNotAnEmail,
} from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { people } from "@/server/readers/people";
import { addPerson, peopleCursorParam } from "@/server/people/people";

const Query = z.object({
  q: z.string().max(80).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
  after: z.string().min(1).max(200).optional(),
  /** The one person this conversation is with, in place of a page: the Inbox's head, before People's book is in. */
  thread: z.uuid().optional(),
});

/**
 * GET /api/v1/contacts — everyone who has written to or phoned this workspace.
 *
 * One row per live person (never erased, never merged) with the facts the
 * People surface renders, computed in SQL by `people_list` under the caller's
 * own RLS. The state a person is in is NOT decided here: the view model
 * derives it from these facts, so the rule lives in one tested place.
 *
 * A page at a time: `?q=` matches a name, a WhatsApp name or three digits
 * of the number; `?offset=` reads the next thousand under the same order.
 * `page` says how many there are in all and whether more follow, so the
 * page can stop at nothing and keep its counts right (00112). Once the rows
 * carry their place in the order (00276), `page.next` is where the next
 * page starts: handed back as `?after=`, beside the offset that counts what
 * the page holds, it reads just past the last row, so nobody who writes in
 * between is read twice (0021). A cursor this route did not give is refused.
 * `?thread=` is the person a conversation is with, alone (none for a thread
 * this workspace does not hold): a thread's head draws them from it before
 * People's book is read (surfaces/people/want-person.ts, a thread's person).
 * The body is its reader's (readers/people.ts), which Ask's people.search
 * reads too.
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const q = input?.q?.trim() || null;
    const offset = input?.offset ?? 0;
    const after = input?.after ? peopleCursorParam(input.after) : null;
    if (input?.after && !after)
      throw new AppError("validation", "That page of People cannot be read. Open People again.");
    const thread = input?.thread ?? null;
    return (await load(readerContext(ctx, member), people, { q, offset, after, thread })).data;
  },
});

/**
 * POST /api/v1/contacts — add a person by their number, their address or both, before they ever write or call (Add
 * people, one person). Owner or operator, as create_person and add_person are: an existing number or address returns
 * that person, a name and an address fill only what is empty, and consent stays unknown, so nobody is messaged by
 * adding them. `{ phone?, email?, name?, source? }` in, one of the first two at least; `{ contact_id, existed }` out.
 *
 * The body is the route's own to read: normalizePhone and normalizeEmail decide what a number and an address are, as
 * the import door does, so a typed "646 555 0101" is read as the import reads it and a refusal says which is wrong in
 * the words the owner sees (whyNotAPhone, whyNotAnEmail). A number alone goes through create_person, as it always did,
 * so an older database answers it; an address goes through add_person (00393), which takes either. */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "person_create",
  input: PersonAddBody,
  handle: async ({ ctx, member, input: body }) => {
    const rawPhone = body.phone?.trim() ? body.phone : null;
    const rawEmail = body.email?.trim() ? body.email : null;
    const phone = normalizePhone(rawPhone);
    const email = normalizeEmail(rawEmail);
    if (rawPhone && !phone) throw new AppError("validation", whyNotAPhone(rawPhone) ?? "That is not a phone number.");
    if (rawEmail && !email)
      throw new AppError("validation", whyNotAnEmail(rawEmail) ?? "That is not an email address.");
    if (!phone && !email) throw new AppError("validation", "A mobile number or an email is needed to add a person.");
    const name = (body.name ?? "").trim().slice(0, 80);
    // Which door, for the record. Never "calendar" or "lead", the two doors people_list names (00138): those are the
    // sweep's and the converter's, written server-side, and a person added here by hand would say "A lead you found".
    const source =
      body.source && /^[a-z_]{1,24}$/.test(body.source) && body.source !== "calendar" && body.source !== "lead"
        ? body.source
        : "manual";
    return addPerson(ctx, member.tenantId, { phone, email, name, source });
  },
});
