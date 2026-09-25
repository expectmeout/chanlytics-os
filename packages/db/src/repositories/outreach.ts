/**
 * What the send door asks of a cold email (00177 outreach_facts): one question, one answer. The one place the door's
 * outreach facts are typed. The service role asks it (the send path runs on the edge); a read that fails throws,
 * because "we could not check" is not "yes".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export interface OutreachFactsRow {
  /** The lead's stage, the one still being written to first; null when the finder never found this person. */
  lead_stage: string | null;
  /** The address is on the workspace's never-again list (lead_suppressions, email). */
  suppressed: boolean;
  /** The From host's row as Connections set it up; null when the workspace owns no such domain. */
  domain: { state: string; from_local: string; clean_since: string | null } | null;
  /** What left from that domain since `since`. */
  sent_since: number;
}

export async function outreachFactsOf(
  db: Db,
  p: { tenantId: string; contactId: string; to: string; host: string; since: string },
): Promise<OutreachFactsRow> {
  const { data, error } = await db.rpc("outreach_facts", {
    p_tenant_id: p.tenantId,
    p_contact_id: p.contactId,
    p_to: p.to,
    p_host: p.host,
    p_since: p.since,
  } as never);
  if (error) throw new Error(`cannot read the outreach facts: ${error.message}`);
  const f = (data ?? {}) as Partial<OutreachFactsRow>;
  return {
    lead_stage: typeof f.lead_stage === "string" ? f.lead_stage : null,
    suppressed: f.suppressed === true,
    domain:
      f.domain && typeof f.domain === "object" && typeof f.domain.state === "string"
        ? {
            state: f.domain.state,
            from_local: String(f.domain.from_local ?? ""),
            clean_since: typeof f.domain.clean_since === "string" ? f.domain.clean_since : null,
          }
        : null,
    sent_since: Number(f.sent_since ?? 0) || 0,
  };
}
