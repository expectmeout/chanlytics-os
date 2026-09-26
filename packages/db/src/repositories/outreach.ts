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
  /**
   * The person wrote back, or phoned (00181): a message of their own on any channel, an email from any address that
   * answers or cites one sent to them, or a call they made. An out-of-office is not one.
   */
  wrote_back: boolean;
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
  // A database without 00181 answers without it. Read as "never wrote", a business that asked to be left alone would be
  // written to cold: not knowing is a failed read.
  if (typeof f.wrote_back !== "boolean")
    throw new Error("cannot read the outreach facts: the database did not say whether this person wrote back");
  return {
    lead_stage: typeof f.lead_stage === "string" ? f.lead_stage : null,
    suppressed: f.suppressed === true,
    wrote_back: f.wrote_back,
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
