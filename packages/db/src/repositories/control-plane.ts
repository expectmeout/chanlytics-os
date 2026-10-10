/**
 * Control-plane repository (Session A): config, policies, team, and the setup acts a member makes from the dashboard:
 * making a workspace, keeping a number, a playbook's state and fields.
 * Same shape as ingest/calls/thread — thin, typed, no business rules here;
 * enforcement lives in RLS + the DB triggers + requireRole at the routes.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { receptionistOn, type BillingStatus } from "@chanlytics/contracts";
import type { Database, Json } from "../database.types";
import { isMissingDoor } from "./templates";

type Db = SupabaseClient<Database>;

export interface TenantConfigRow {
  tenant_id: string;
  config: unknown;
  version: number;
  updated_at: string;
  /** Who last wrote it; null for rows written before 00085 kept track, and for the platform's own writes. */
  updated_by?: string | null;
}

export async function getTenantConfig(db: Db, tenantId: string): Promise<TenantConfigRow | null> {
  const { data, error } = await db
    .from("tenant_config")
    .select("tenant_id, config, version, updated_at, updated_by")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`getTenantConfig: ${error.message}`);
  return data;
}

/**
 * The configuration row on a member's session. The calendar feed's address in it grants read access to the owner's
 * calendar, so from 00366 only the owner reads the table; every other member reads the row through tenant_config_read
 * (00365), which masks the address and says so (`feed_hidden`). The table is asked first, so the owner's read, and
 * every read on a database before 00366, is the one query it always was; the door is asked only where the table
 * answered nothing: no row, not a member, or a member who is not the owner. Null: no row, or not a member. A database
 * before 00365 has no door (PGRST202), and the table's answer stands. `feed_hidden`: the feed's address in the row is
 * masked.
 */
export async function getTenantConfigAsMember(
  db: Db,
  tenantId: string,
): Promise<(TenantConfigRow & { feed_hidden: boolean }) | null> {
  const row = await getTenantConfig(db, tenantId);
  if (row) return { ...row, feed_hidden: false };
  const { data, error } = await db.rpc("tenant_config_read", { p_tenant_id: tenantId }).maybeSingle();
  if (error && isMissingDoor(error)) return null;
  if (error) throw new Error(`getTenantConfigAsMember: ${error.message}`);
  return data;
}

export type PutTenantConfigResult =
  | { ok: true; row: TenantConfigRow }
  /** Someone else saved between the read and the write. A real conflict. */
  | { ok: false; reason: "stale" }
  /** There is no config row at all — this workspace was never provisioned.
   *  NOT a conflict, and telling the owner to "reload and reapply" sends them
   *  round a loop that cannot terminate. */
  | { ok: false; reason: "missing" };

/**
 * Optimistic-concurrency write: the caller sends back the version it read.
 *
 * Returns WHY it failed, because zero rows updated has two very different
 * causes and the route used to report both as "someone else saved settings
 * after you loaded them". For a tenant with no config row that sentence is
 * false in every particular — nobody saved anything, no colleague exists, and
 * reloading changes nothing.
 *
 * Zero rows has a third cause from 00366: an update reads the row it changes, and only the owner reads the table, so a
 * partner's update finds nothing. So zero rows asks tenant_config_write (00365), a session's versioned write under the
 * permission the table's update policy names, recorded as the caller's: it writes the row where it can, and says
 * stale or missing where it cannot. A database before 00365 has no door, and the row is looked for as it always was.
 */
export async function putTenantConfig(
  db: Db,
  tenantId: string,
  config: unknown,
  expectedVersion: number,
  /** Who wrote it. This config IS what customers hear, so the row records its author (00085). The door records the
   *  caller, who is this person on every session that writes it. */
  updatedBy?: string | null,
): Promise<PutTenantConfigResult> {
  const { data, error } = await db
    .from("tenant_config")
    .update({ config: config as Json, version: expectedVersion + 1, ...(updatedBy ? { updated_by: updatedBy } : {}) })
    .eq("tenant_id", tenantId)
    .eq("version", expectedVersion)
    .select("tenant_id, config, version, updated_at, updated_by")
    .maybeSingle();
  if (error) throw new Error(`putTenantConfig: ${error.message}`);
  if (data) return { ok: true, row: data };

  // Zero rows: the door writes what the table would not show this member, and tells an absent row from a losing race.
  const door = await db
    .rpc("tenant_config_write", { p_tenant_id: tenantId, p_config: config as Json, p_version: expectedVersion })
    .maybeSingle();
  if (!door.error) {
    const w = door.data;
    if (w?.outcome === "saved")
      return {
        ok: true,
        row: { tenant_id: tenantId, config, version: w.version, updated_at: w.updated_at, updated_by: w.updated_by },
      };
    if (w?.outcome === "stale" || w?.outcome === "missing") return { ok: false, reason: w.outcome };
    throw new Error("putTenantConfig: the door answered without an outcome");
  }
  if (!isMissingDoor(door.error)) throw new Error(`putTenantConfig: ${door.error.message}`);
  // Before 00365. Distinguish an absent row from a losing race — one query, only on the failure path.
  const existing = await getTenantConfig(db, tenantId);
  return { ok: false, reason: existing ? "stale" : "missing" };
}

export interface PolicyRecord {
  id: string;
  class: string;
  mode: string;
  subject_type: string | null;
  subject_id: string | null;
  limits: unknown;
  updated_at: string;
}

/** Workspace-level rows only (subject IS NULL) — guardrail rows arrive with
 *  the People slice and get their own accessor then. */
export async function listPolicies(db: Db, tenantId: string): Promise<PolicyRecord[]> {
  const { data, error } = await db
    .from("policies")
    .select("id, class, mode, subject_type, subject_id, limits, updated_at")
    .eq("tenant_id", tenantId)
    .is("subject_type", null)
    .order("class");
  if (error) throw new Error(`listPolicies: ${error.message}`);
  return data ?? [];
}

export async function setPolicyMode(
  db: Db,
  tenantId: string,
  policyClass: string,
  mode: string,
  /**
   * Merged into the existing limits, never replacing them.
   *
   * `limits` holds several unrelated settings for one class — a reply row
   * carries both max_replies_day and reply_delay_ms — so a PUT that sent the
   * whole object would silently drop whichever one the caller did not know
   * about. Callers set what they mean and leave the rest alone.
   */
  limits?: Record<string, unknown>,
): Promise<PolicyRecord | null> {
  let merged: Record<string, unknown> | undefined;
  if (limits && Object.keys(limits).length) {
    const { data: current } = await db
      .from("policies")
      .select("limits")
      .eq("tenant_id", tenantId)
      .eq("class", policyClass)
      .is("subject_type", null)
      .maybeSingle();
    merged = { ...((current?.limits as Record<string, unknown>) ?? {}), ...limits };
  }
  const { data, error } = await db
    .from("policies")
    .update(merged ? { mode, limits: merged as never } : { mode })
    .eq("tenant_id", tenantId)
    .eq("class", policyClass)
    .is("subject_type", null)
    .select("id, class, mode, subject_type, subject_id, limits, updated_at")
    .maybeSingle();
  // the money-lock trigger raises here — surface it as-is, the route maps it
  if (error) throw new Error(error.message);
  return data;
}

/* ------------------------- receptionist mode per person ------------------- */

/**
 * The receptionist mode set for ONE person, or null to follow the workspace.
 *
 * Read by the edge once per inbound message — a single lookup on the unique
 * key, never cached. The whole point of "Never" for a difficult customer is
 * that it applies to their NEXT message, not to one sixty seconds later.
 */
export async function personReplyMode(db: Db, tenantId: string, contactId: string): Promise<string | null> {
  const { data, error } = await db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", contactId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.mode ?? null;
}

/**
 * Set or clear one person's receptionist mode. `null` removes the row, so the
 * person follows the workspace policy again. Insert and delete are owner-only
 * under RLS (00029); a forbidden insert raises, and the route decides the
 * role before getting here. Answers the mode the person had before this write, null when they followed the workspace
 * policy: what an undo puts back (the row a delete took, or the row as it was read just before it was replaced).
 */
export async function setPersonReplyMode(
  db: Db,
  tenantId: string,
  contactId: string,
  mode: string | null,
): Promise<string | null> {
  if (mode === null) {
    const { data, error } = await db
      .from("policies")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("class", "reply")
      .eq("subject_type", "contact")
      .eq("subject_id", contactId)
      .select("mode");
    if (error) throw new Error(error.message);
    return data?.[0]?.mode ?? null;
  }
  const { data: was, error: readError } = await db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "reply")
    .eq("subject_type", "contact")
    .eq("subject_id", contactId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const { error } = await db
    .from("policies")
    .upsert(
      { tenant_id: tenantId, class: "reply", mode, subject_type: "contact", subject_id: contactId },
      { onConflict: "tenant_id,class,subject_type,subject_id" },
    );
  if (error) throw new Error(error.message);
  return was?.mode ?? null;
}

/**
 * Whether the receptionist may speak under the business's name on its own right now, with nobody reading it first (a
 * public reply): not while the workspace is paused (tenants.status: billing stopped it, or a person did), not once its
 * last member has left (ended, 00262: left_empty_at), and not while a plan billed through Stripe is in a state that
 * stops the receptionist (contracts receptionistOn). A read that fails throws: "we could not check" is not "yes".
 */
export async function workspaceAnswersOnItsOwn(db: Db, tenantId: string): Promise<boolean> {
  const [tenant, billing] = await Promise.all([
    db.from("tenants").select("status, left_empty_at").eq("id", tenantId).maybeSingle(),
    db.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (tenant.error) throw new Error(`cannot read the workspace: ${tenant.error.message}`);
  if (billing.error) throw new Error(`cannot read the workspace's billing: ${billing.error.message}`);
  if (tenant.data?.status === "paused" || tenant.data?.left_empty_at) return false;
  return !(billing.data?.mode === "stripe" && !receptionistOn(billing.data.status as BillingStatus));
}

// ---- setup acts a member makes from the dashboard: the caller decides what a refusal means; what comes back is the
// database's own answer, the error untouched, since the words for what it raises are theirs.

/** What `create_workspace` takes: the name, the zone when asked for, and the partner's code when the person agreed to one. */
export type CreateWorkspaceArgs = Database["public"]["Functions"]["create_workspace"]["Args"];

/** How many workspaces this user belongs to, counted on the session client, which sees only its own rows. */
export async function membershipCountOf(db: Db, userId: string): Promise<number> {
  const { count, error } = await db
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`memberships_count: ${error.message}`);
  return count ?? 0;
}

/** The workspaces this user belongs to, by id, read on the session client, which sees only its own rows. */
export async function workspaceIdsOf(db: Db, userId: string): Promise<string[]> {
  const { data, error } = await db.from("memberships").select("tenant_id").eq("user_id", userId);
  if (error) throw new Error(`memberships_of: ${error.message}`);
  return (data ?? []).map((m) => m.tenant_id);
}

/** Call `create_workspace` once: its one row, or its error as the database raised it. */
export async function createWorkspaceFn(db: Db, args: CreateWorkspaceArgs) {
  return db.rpc("create_workspace", args).single();
}

/**
 * What `line_forwarding_set` takes: the workspace, the number kept, its carrier and which calls to forward. Its fifth, a
 * phone to test from, is asked nowhere any more (8 Oct 2026): the door passes null until a migration drops the argument.
 */
export type LineForwardingArgs = Database["public"]["Functions"]["line_forwarding_set"]["Args"];

/** Keep the number: the forwarded line's id, or the database's refusal. */
export async function lineForwardingSet(db: Db, args: LineForwardingArgs) {
  return db.rpc("line_forwarding_set", args);
}

/** The columns an edit may write, as the table types them. */
export type PlaybookPatch = Database["public"]["Tables"]["playbooks"]["Update"];

/** Set a playbook's state (running or paused). */
export async function setPlaybookState(db: Db, id: string, state: string): Promise<{ error: PostgrestError | null }> {
  const { error } = await db.from("playbooks").update({ state }).eq("id", id);
  return { error };
}

/** Write the edited fields of a playbook. */
export async function updatePlaybook(
  db: Db,
  id: string,
  patch: PlaybookPatch,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await db.from("playbooks").update(patch).eq("id", id);
  return { error };
}

/** Remove a playbook; `count` is how many rows went (none: the row is not there, or the caller may not see it). */
export async function removePlaybook(
  db: Db,
  id: string,
): Promise<{ error: PostgrestError | null; count: number | null }> {
  const { error, count } = await db.from("playbooks").delete({ count: "exact" }).eq("id", id);
  return { error, count };
}

/** What a new playbook names: the columns the door writes from, as the table types them. */
export type PlaybookToStart = Required<
  Pick<
    Database["public"]["Tables"]["playbooks"]["Insert"],
    | "name"
    | "trigger"
    | "list_id"
    | "list_key"
    | "template_id"
    | "template_name"
    | "template_language"
    | "params"
    | "policy_class"
    | "run_hour"
    | "cap_per_run"
    | "gap_days"
    | "cadence_days"
    | "channels"
  >
>;

/**
 * Start a playbook with its line in the ledger (00357 start_playbook), on the member's own session: the row, running
 * and theirs, then the start_playbook decision, in one transaction. The door runs on the caller's rights, so the
 * table's policy, checks and unique indexes judge the row. The new row's id with its decision's, or the database's
 * refusal, which the caller words; an answer with neither id is a door that is not this one, and throws.
 */
export async function startPlaybook(
  db: Db,
  p: { tenantId: string; playbook: PlaybookToStart; decision: Json; via: string | null; undoOf: string | null },
): Promise<{ data: { id: string; decisionId: string } | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("start_playbook", {
    p_tenant_id: p.tenantId,
    p_playbook: p.playbook,
    p_decision: p.decision,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  if (error) return { data: null, error };
  const made = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (typeof made.id !== "string" || typeof made.decision_id !== "string")
    throw new Error("start_playbook: the door answered without its row and its decision");
  return { data: { id: made.id, decisionId: made.decision_id }, error: null };
}

/**
 * Change a playbook in place with its line in the ledger (the change_playbook door, 00376), on the member's own session:
 * the row locked, only the columns `set` names written, then the decision (start_playbook, pause_playbook or
 * change_playbook) as theirs, in one transaction. What each written column held comes back as `was`. A playbook the
 * caller cannot see or change is the database's P0002, which the caller words; an answer without its row and its
 * decision is a door that is not this one, and throws. `"missing"` on a database before the door's migration
 * (isMissingDoor), where the dashboard writes the change the way it did before, for one release, so either deploy order
 * works (the counts doors' rule, reports/report-series.ts answerOrMissing).
 */
export async function writePlaybookChange(
  db: Db,
  p: { tenantId: string; playbookId: string; set: Json; decision: Json; via: string | null; undoOf: string | null },
): Promise<
  | { data: { id: string; was: Record<string, unknown>; decisionId: string } | null; error: PostgrestError | null }
  | "missing"
> {
  const { data, error } = await db.rpc("change_playbook", {
    p_tenant_id: p.tenantId,
    p_playbook_id: p.playbookId,
    p_set: p.set,
    p_decision: p.decision,
    ...(p.via ? { p_via: p.via } : {}),
    ...(p.undoOf ? { p_undo_of: p.undoOf } : {}),
  });
  if (error) return isMissingDoor(error) ? "missing" : { data: null, error };
  const made = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (typeof made.id !== "string" || typeof made.decision_id !== "string")
    throw new Error("change_playbook: the door answered without its row and its decision");
  const was = made.was !== null && typeof made.was === "object" && !Array.isArray(made.was) ? made.was : {};
  return { data: { id: made.id, was, decisionId: made.decision_id }, error: null };
}
