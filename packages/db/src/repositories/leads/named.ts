/**
 * A lead's name and city put right by its owner (00631 lead_named): the door, read through its shape. Apart from the
 * leads repository, which is at its length.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAnswer } from "../../shared/read-json";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

/** What lead_named (00631) answers: the lead as it now says, and how many of its waiting emails are written again. */
type LeadNamedAnswer =
  | { ok: true; business_name: string; city: string | null; again: number; version: number }
  | { ok?: undefined; error: string };
const LeadNamedAnswerShape: z.ZodType<LeadNamedAnswer> = z.union([
  z.object({
    ok: z.literal(true),
    business_name: z.string(),
    city: z.string().nullable(),
    again: z.number(),
    version: z.number(),
  }),
  z.object({ ok: z.undefined().optional(), error: z.string() }),
]);

/**
 * A lead's name, its city, or both, put right by its owner (00631 lead_named), on the member's own session: the door
 * holds the permission and the rules, and answers the lead as it now says or why not. A value not given is left as it is.
 */
export async function nameLead(
  db: Db,
  params: { leadId: string; businessName: string | null; city: string | null },
): Promise<{ data: LeadNamedAnswer; error: null } | { data: null; error: { code?: string; message: string } }> {
  const { data, error } = await db.rpc("lead_named", {
    p_lead_id: params.leadId,
    ...(params.businessName === null ? {} : { p_business_name: params.businessName }),
    ...(params.city === null ? {} : { p_city: params.city }),
  });
  if (error) return { data: null, error };
  return { data: readAnswer("lead_named", LeadNamedAnswerShape, data ?? { error: "no_answer" }), error: null };
}
