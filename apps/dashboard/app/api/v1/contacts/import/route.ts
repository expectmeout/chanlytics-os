import { workspace, write } from "@/server/route";
import { ImportBody, importPeopleRows } from "@/server/people/import-people";

/**
 * POST /api/v1/contacts/import -- { import_id, rows[≤50], part?, via? }: a part of a business's own client list.
 *
 * Owner only, in its own bucket. Each row is normalised on the one phone rule and the one email rule, then goes through
 * `import_person`: found by number then address, fills only what is empty, never a yes. What a client file says of the
 * person beyond that (the last visit, visits, birthday and notes, decision 0073, R22) is kept where nothing is. With
 * `part`, the record of what was brought in is written too (R23). server/people/import-people.ts is everything after.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "person_import",
  input: ImportBody,
  handle: ({ ctx, member, input }) => importPeopleRows(ctx, member.tenantId, input),
});
