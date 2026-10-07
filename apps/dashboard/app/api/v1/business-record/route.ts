import { read, write, workspace } from "@/server/route";
import { readBusinessRecord, saveBusinessRecord } from "@/server/connections/business-record";

/**
 * The business on record: what the carriers ask before they let a number
 * text, kept once per workspace.
 *
 * GET — members read it, because the Texting row shows where it stands.
 * PUT — owners only: it is a statement about the business's legal identity,
 * made to the carriers in its name, and it decides whether a registration
 * can be filed at all. The edge owns the write, as it owns every other
 * write that leaves for a provider. The body is the route's own to read:
 * what is missing is said in the owner's words, per registration.
 *
 * The handles are readBusinessRecord and saveBusinessRecord in src/server/connections/business-record.ts: the route
 * is their declaration (who may, how often), the verbs are what they do.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => readBusinessRecord(ctx, member),
});

export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "business_record",
  handle: ({ ctx, req, member }) => saveBusinessRecord(ctx, req, member),
});
