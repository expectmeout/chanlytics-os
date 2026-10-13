import { read, write, workspace } from "@/server/route";
import { erasureScope } from "@/server/verbs";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { person } from "@/server/readers/person";
import { eraseContact } from "@/server/people/erase-contact";

/**
 * DELETE /api/v1/contacts/:id — honour a deletion request.
 *
 * privacy.html promises this and nothing implemented it. Three stores hold
 * the customer: Postgres rows, the private `media` bucket, and the scheduled
 * jobs that would still speak to them.
 *
 * The contact is the row (erasureScope): found under RLS whether or not
 * they are already erased, so a contact the caller cannot see is a 404
 * rather than a leak, and the role (owner) is judged against the contact's
 * own workspace, never a default one.
 *
 * ORDER IS THE DESIGN. The keys are read first (reads only, retryable with
 * nothing to undo). Then the BLOCK (beginErasure, 00124): from that moment the
 * wire refuses the person and the passive doors will not bring them back,
 * whatever happens to the legs below. Then the copies keyed on the number
 * (Ask turns, finished jobs) are scrubbed while the number is still in hand,
 * fail-closed, because nothing after the tombstone can find them again.
 * Storage objects go next, before the rows that name their paths, and a
 * Storage failure STOPS there rather than running the irreversible delete;
 * the person is blocked meanwhile, not live. The rows go LAST, in one
 * transaction. A crash at any point leaves the request retryable.
 *
 * The handle is eraseContact in src/server/people/erase-contact.ts: the route is its declaration (who may, how often),
 * the verb is what it does.
 */
export const DELETE = write({
  scope: erasureScope,
  fresh: true,
  role: "owner",
  rate: "erase",
  handle: ({ ctx, row }) => eraseContact(ctx, row),
});

/**
 * GET /api/v1/contacts/:id — one person, in full.
 *
 * The same row the list shows (people_list narrowed to this contact) plus
 * everything the profile renders from: identities, conversations with their
 * messages, calls, escalations, and the operator decisions on those threads.
 * RLS floors every read; the workspace named on the request is the door.
 *
 * ONE ROUND. Every read is keyed on the person's id and the workspace, so all of them are asked for at once; only their
 * messages wait, for their conversations' ids, and their visits for the row that says who they are (the calendar's feed
 * itself is fetched beside everything else). It was four rounds in a row -- the row, then thirteen reads, then the
 * messages, then the calendar -- and measured on production (23 Sep 2026) one person with one message took 0.3-1.3 s
 * while the whole People list took 0.26-0.31 s. A person not in the workspace costs the same reads, each empty under
 * RLS, and answers 404 before anything read is put together.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const id = requireUuid(ctx.params.id, "contact");
    return (await load(readerContext(ctx, member), person, { id })).data;
  },
});
