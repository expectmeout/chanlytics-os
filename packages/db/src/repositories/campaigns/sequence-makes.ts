/**
 * How each sequence to leads was made (decision 0078, step 2): its make decision (`make_sequence`, which
 * sequence_create_leads writes in the make's own transaction, 00459), with who made it, when, and what Ask drafted for it
 * where the make named a draft (`as_drafted`). Read off the ledger under the caller's row security
 * (decisions_member_select), by the ledger's own index (decisions_tenant_subject).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { asDraftedFrom, type AsDrafted } from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;

export interface SequenceMake {
  sequence_id: string;
  made_by: string | null;
  made_at: string;
  as_drafted: AsDrafted | null;
}

/**
 * The newest make of each sequence to leads asked for: by id (`ids`), or the ones a member made (`by`) since a moment
 * (`since`), newest first, `limit` rows of the ledger at most. A make of a sequence to people is not one.
 */
export async function listSequenceMakes(
  db: Db,
  params: { tenantId: string; ids?: readonly string[]; by?: string; since?: string; limit: number },
): Promise<SequenceMake[]> {
  if (params.ids && params.ids.length === 0) return [];
  let query = db
    .from("decisions")
    .select("subject_id, actor_user_id, created_at, payload")
    .eq("tenant_id", params.tenantId)
    .eq("subject_type", "sequence")
    .eq("verb", "make_sequence");
  if (params.ids) query = query.in("subject_id", [...params.ids]);
  if (params.by) query = query.eq("actor_user_id", params.by);
  if (params.since) query = query.gte("created_at", params.since);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(params.limit);
  if (error) throw new Error(`decisions: ${error.message}`);
  const seen = new Set<string>();
  const out: SequenceMake[] = [];
  for (const row of data ?? []) {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
    if (payload.starts !== "leads" || seen.has(row.subject_id)) continue;
    seen.add(row.subject_id);
    out.push({
      sequence_id: row.subject_id,
      made_by: row.actor_user_id,
      made_at: row.created_at,
      as_drafted: asDraftedFrom(payload.as_drafted),
    });
  }
  return out;
}
