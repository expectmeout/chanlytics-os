/** Reach out: checks. */

import { maySpend, type BillingMode, type BillingStatus, type SpendKind } from "@chanlytics/contracts";
import { recordEvent } from "../../events/events";
import type { Db, ReachOutSendRow } from "./reach-out";

/**
 * A lead written to by a reach-out's email: still being written to (ready becomes nurture; a later stage is kept),
 * first contacted when its first email left, its last outcome "emailed", and its event. Written only as it was read
 * (its version), so a person working the lead at the same moment wins and the next email says so again.
 */
export async function recordLeadWritten(
  db: Db,
  params: { tenantId: string; leadId: string; at: string; sendId: string; retried?: boolean },
): Promise<boolean> {
  const { data: lead, error } = await db
    .from("leads")
    .select("stage, version, contacted_at, blanked_at, erased_at")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.leadId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the lead a send wrote to: ${error.message}`);
  // A lead blanked or erased since keeps nothing of what was written to it, as the owner's Sent writes it (00429).
  if (!lead || lead.blanked_at || lead.erased_at) return false;
  const { data: moved, error: e2 } = await db
    .from("leads")
    .update({
      stage: lead.stage === "ready" ? "nurture" : lead.stage,
      contacted_at: lead.contacted_at ?? params.at,
      last_outcome: "emailed",
      version: lead.version + 1,
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.leadId)
    .eq("version", lead.version)
    .select("id");
  if (e2) throw new Error(`cannot record the lead as written to: ${e2.message}`);
  // Worked by a person at the same moment: read again and write once more (it only merges), then say it was not.
  if ((moved ?? []).length === 0) return params.retried ? false : recordLeadWritten(db, { ...params, retried: true });
  const sentence = { by: "reach_out" as const, send_id: params.sendId };
  const { error: e3 } = await recordEvent(db, params.tenantId, "lead.emailed", "lead", params.leadId, sentence);
  if (e3) throw new Error(`cannot record the lead's email: ${e3}`);
  return true;
}

/**
 * What the check found, written only onto a send still planned, not yet checked, and at the words' version it was read
 * at (R3, R5): a check never undoes an owner's answer, and never stamps words that changed under it. Its lease ends.
 */
export async function recordCheck(
  db: Db,
  params: { tenantId: string; id: string; gen: number; patch: Partial<ReachOutSendRow> },
): Promise<boolean> {
  const { data, error } = await db
    .from("sequence_sends")
    .update({ ...params.patch, check_started_at: null })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("state", "planned")
    .is("checked_at", null)
    .eq("check_gen", params.gen)
    .select("id");
  if (error) throw new Error(`cannot record the send's check: ${error.message}`);
  return (data ?? []).length === 1;
}

/**
 * Whether a workspace may spend now (contracts maySpend, by the spend's kind: reach-out and a plan's own reads the
 * number's row, the finder its leads'): a paused workspace, or one with no billing row, may not. The one reading of it:
 * the step's run (run-context.ts), the check, the dashboard's chains, the finder's runner and the rehearsal's window ask
 * it. A read that fails throws: "we could not check" is not "yes".
 */
export async function mayWorkspaceSpend(db: Db, tenantId: string, kind: SpendKind = "number"): Promise<boolean> {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  if (tenant.data?.status === "paused" || !billing.data) return false;
  return maySpend(billing.data.mode, billing.data.status, kind);
}

/** The workspace's own words about what it does (business_records.about, 00152), for the writer. */
export async function findWorkspaceAbout(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from("business_records").select("about").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the business record: ${error.message}`);
  return data?.about?.trim() || null;
}
