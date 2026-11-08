/**
 * A line's own row, as its setup, its texts, its resume and its release read and write it (decision 0111): saved, found
 * by its number or as the workspace's texting line, claimed for a resume only from the state it was read in, its facts
 * kept, failed, deleted, and the lines stuck in provisioning or held by ended plans. A statement on one workspace's line
 * names it (tenantDb); a sweep's page reads across workspaces on purpose (platformWide). Each answer is the database's as
 * it came.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../database.types";
import { platformWide, tenantDb } from "../../shared/tenant-db";

type Db = SupabaseClient<Database>;
type LineUpdate = Database["public"]["Tables"]["lines"]["Update"];
type LineKey = { id: string; tenant_id: string };

/** The columns a text's line is read with. */
const TEXTING_COLUMNS = "id, tenant_id, e164, provider, subaccount_sid, messaging_service_sid, sms_state, voice_state";

/** The line's row saved. */
export const saveLineRow = async (db: Db, line: LineKey, row: LineUpdate) =>
  tenantDb(db, line.tenant_id).from("lines").update(row).eq("id", line.id);

/** The live line a number is, whichever workspace's: a text arrives for a number before anyone knows whose it is. */
export const findLineByE164 = async (db: Db, e164: string) =>
  platformWide(db)
    .from("lines")
    .select(TEXTING_COLUMNS)
    .eq("e164", e164)
    .neq("voice_state", "failed")
    .limit(1)
    .maybeSingle();

/** The workspace's newest live line that texts. */
export const findTextingLineOf = async (db: Db, tenantId: string) =>
  db
    .from("lines")
    .select(TEXTING_COLUMNS)
    .eq("tenant_id", tenantId)
    .not("messaging_service_sid", "is", null)
    .neq("voice_state", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

/** A failed line claimed for a resume: none back means another resume took it. */
export const claimFailedLine = async (db: Db, line: LineKey, values: LineUpdate) =>
  tenantDb(db, line.tenant_id)
    .from("lines")
    .update(values)
    .eq("id", line.id)
    .eq("voice_state", "failed")
    .select("*")
    .maybeSingle();

/** A line stuck in provisioning since before `cutoff`, claimed for a resume: none back means it moved since. */
export const claimStuckLine = async (db: Db, line: LineKey, values: LineUpdate, cutoff: string) =>
  tenantDb(db, line.tenant_id)
    .from("lines")
    .update(values)
    .eq("id", line.id)
    .eq("voice_state", "provisioning")
    .lt("state_since", cutoff)
    .select("*")
    .maybeSingle();

/** The line's facts kept, its id back. */
export const saveLineFacts = async (db: Db, line: LineKey, facts: LineUpdate["facts"]) =>
  tenantDb(db, line.tenant_id).from("lines").update({ facts }).eq("id", line.id).select("id");

/** Lines stuck in provisioning since before `cutoff`, the longest stuck first: the resume sweep's page. */
export const listStuckLines = async (db: Db, cutoff: string, limit: number) =>
  platformWide(db)
    .from("lines")
    .select("*")
    .eq("voice_state", "provisioning")
    .lt("state_since", cutoff)
    .order("state_since", { ascending: true })
    .limit(limit);

/** The line's row deleted. */
export const deleteLineRow = async (db: Db, tenantId: string, lineId: string) =>
  tenantDb(db, tenantId).from("lines").delete().eq("id", lineId);

/** The numbers we gave these workspaces (ours or forwarded), oldest first: the release sweep's page. */
export const listLinesOfWorkspaces = async (db: Db, tenantIds: string[]) =>
  platformWide(db)
    .from("lines")
    .select("*")
    .in("tenant_id", tenantIds)
    .in("kind", ["chanlytics", "forwarded"])
    .order("created_at");

/** The line's row saved and read back whole: `single()` is the row count, so a write that changed nothing errors. */
export const saveLineRowBack = async (db: Db, line: LineKey, row: LineUpdate) =>
  tenantDb(db, line.tenant_id).from("lines").update(row).eq("id", line.id).select("*").single();

/**
 * A line taken for a filing, written only if the row is still as it was read (`updated_at`) and no other filing's lease
 * (the `lease.fact` in its facts) is still running at `lease.now`: none back means another filing holds it.
 */
export const claimLineForFiling = async (
  db: Db,
  line: LineKey & { updated_at: string },
  values: LineUpdate,
  lease: { fact: string; now: string },
) =>
  tenantDb(db, line.tenant_id)
    .from("lines")
    .update(values)
    .eq("id", line.id)
    .eq("updated_at", line.updated_at)
    .or(`facts->>${lease.fact}.is.null,facts->>${lease.fact}.lt.${lease.now}`)
    .select("*");

/** One line of the workspace's, whole, or none. */
export const findLineRow = async (db: Db, tenantId: string, lineId: string) =>
  tenantDb(db, tenantId).from("lines").select("*").eq("id", lineId).maybeSingle();

/** Every line of the workspace's, whole, oldest first. */
export const listLinesOf = async (db: Db, tenantId: string) =>
  db.from("lines").select("*").eq("tenant_id", tenantId).order("created_at");

/** The workspace's numbers. */
export const listLineNumbersOf = async (db: Db, tenantId: string) =>
  db.from("lines").select("e164").eq("tenant_id", tenantId);

/** The workspace's numbers with where each one's carrier filing stands. */
export const listLineFilingsOf = async (db: Db, tenantId: string) =>
  db.from("lines").select("e164, sms_state, reg_mock, brand_sid, facts").eq("tenant_id", tenantId);

/** A new line for the workspace, back whole: the database keeps one live line a workspace (00195), and refuses a second. */
export const insertLineRow = async (db: Db, tenantId: string, row: Database["public"]["Tables"]["lines"]["Insert"]) =>
  tenantDb(db, tenantId).from("lines").insert(row).select("*").single();

/**
 * Lines whose filing the carriers are still deciding (`states`), a refused one only with its campaign on file, whichever
 * workspace's, the longest unasked first: the registration sweep's page.
 */
export const listLinesAwaitingCarriers = async (db: Db, states: readonly string[], limit: number) =>
  platformWide(db)
    .from("lines")
    .select("*")
    .in("sms_state", [...states])
    .or("sms_state.neq.rejected,campaign_sid.not.is.null")
    .not("brand_sid", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

/** The workspace's oldest forwarded number that forwards: its number, how it forwards, and its facts. */
export const findForwardedLine = async (db: Db, tenantId: string) =>
  db
    .from("lines")
    .select("e164, forwarding_state, facts")
    .eq("tenant_id", tenantId)
    .eq("kind", "forwarded")
    .neq("forwarding_state", "none")
    .order("created_at")
    .limit(1)
    .maybeSingle();

/** The workspace's forwarded numbers told how to forward and not yet heard from. */
export const listLinesAwaitingForwarding = async (db: Db, tenantId: string) =>
  db
    .from("lines")
    .select("id, e164, facts")
    .eq("tenant_id", tenantId)
    .eq("kind", "forwarded")
    .eq("forwarding_state", "instructed");

/** A forwarded number written as heard from, only while it still awaits it: its id back, none when it moved. */
export const saveForwardingVerified = async (db: Db, tenantId: string, lineId: string, values: LineUpdate) =>
  db
    .from("lines")
    .update(values)
    .eq("id", lineId)
    .eq("tenant_id", tenantId)
    .eq("forwarding_state", "instructed")
    .select("id");

/** The workspace's lines as the Connections page shows them, oldest first: never a provider's id. */
export const listLinesForPage = async (db: Db, tenantId: string) =>
  db
    .from("lines")
    .select(
      "id, e164, kind, provider, area_code, voice_state, sms_state, reg_step, reg_mock, reg_sole_prop, whatsapp_state, port_state, forwarding_state, step, last_error, state_since, created_at, facts",
    )
    .eq("tenant_id", tenantId)
    .order("created_at");
