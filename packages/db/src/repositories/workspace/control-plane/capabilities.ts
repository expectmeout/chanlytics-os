/** Control plane: capabilities. */

import type { PostgrestError } from "@supabase/supabase-js";
import { hasPublicPages, openToCustomersOf } from "@chanlytics/contracts";
import type { Database, Json } from "../../../database.types";
import { isMissingDoor } from "../../../shared/missing-door";
import type { Db } from "./config";

/**
 * The workspaces whose first run chose a number to buy (setup_choices.phone, 00513): what the lines sweep asks the
 * chosen line of, so a plan that started while no tab was open still gets its number (decision 0091). Every one, a
 * page at a time. A read that fails throws.
 */
export async function listWorkspacesWithANumberChosen(db: Db): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += TRIAL_PAGE) {
    const { data, error } = await db
      .from("setup_choices")
      .select("tenant_id")
      .in("phone->>way", ["new", "keep"])
      .order("tenant_id")
      .range(from, from + TRIAL_PAGE - 1);
    if (error) throw new Error(`cannot read the setup choices: ${error.message}`);
    out.push(...(data ?? []).map((r) => r.tenant_id));
    if ((data ?? []).length < TRIAL_PAGE) return out;
  }
}

/** capability_activate (00514), on the member's session: the row and its event in one write; `first` of any channel. */
export async function activateCapabilityFn(db: Db, tenantId: string, capability: string, note: string | null) {
  return db.rpc("capability_activate", {
    p_tenant_id: tenantId,
    p_capability: capability,
    ...(note ? { p_note: note } : {}),
  });
}

/** capability_deactivate (00514), on the member's session: {error: not_activated} when none stood. */
export async function deactivateCapabilityFn(db: Db, tenantId: string, capability: string) {
  return db.rpc("capability_deactivate", { p_tenant_id: tenantId, p_capability: capability });
}

export type SetupChoiceSetArgs = Database["public"]["Functions"]["setup_choice_set"]["Args"];

/** setup_choice_set (00513), on the member's session: the row as it now stands, or {error: stale}. */
export async function setSetupChoices(db: Db, args: SetupChoiceSetArgs) {
  return db.rpc("setup_choice_set", args);
}

/**
 * The workspaces on a free trial billed through Stripe, with a subscription to end early (decision 0090): what the
 * edge's trial check reads, every one of them, a page at a time. A read that fails throws.
 */
export async function listTrialingWorkspaceIds(db: Db): Promise<string[]> {
  const out: string[] = [];
  for (let from = 0; ; from += TRIAL_PAGE) {
    const { data, error } = await db
      .from("billing_accounts")
      .select("tenant_id")
      .eq("mode", "stripe")
      .eq("status", "trialing")
      .not("stripe_subscription_id", "is", null)
      .order("tenant_id")
      .range(from, from + TRIAL_PAGE - 1);
    if (error) throw new Error(`cannot read the trials: ${error.message}`);
    out.push(...(data ?? []).map((r) => r.tenant_id));
    if ((data ?? []).length < TRIAL_PAGE) return out;
  }
}

const TRIAL_PAGE = 500;

/** What a workspace has used of what a trial includes (00512's trial_use): its calls' seconds and its replies. */
export async function getTrialUse(db: Db, tenantId: string): Promise<{ callSeconds: number; replies: number }> {
  const { data, error } = await db.rpc("trial_use", { p_tenant_id: tenantId });
  if (error) throw new Error(`trial_use: ${error.message}`);
  const o = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);
  return { callSeconds: n(o.call_seconds), replies: n(o.replies) };
}

/**
 * The workspace's slug while it has public pages (contracts hasPublicPages: not a fixture, not ended), for a page that
 * links to its own (the business record's form, the wiring's second audit X4-4); null when it has none. A paused workspace
 * keeps its pages, so its billing is not read. A read that fails throws.
 */
export async function findWorkspacePublicSlug(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db
    .from("tenants")
    .select("slug, status, left_empty_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the workspace: ${error.message}`);
  if (!data) return null;
  const open = openToCustomersOf({ paused: data.status === "paused", ended: !!data.left_empty_at, billing: null });
  return hasPublicPages(data.status, open) ? data.slug : null;
}

/** The workspace's name and its address, for a message that names it and links to it; null when there is no such workspace. A read that fails throws. */
export async function findWorkspaceNamed(db: Db, tenantId: string): Promise<{ name: string; slug: string } | null> {
  const { data, error } = await db.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace: ${error.message}`);
  return data ? { name: data.name, slug: data.slug } : null;
}

/** The zone a workspace keeps its clock in (`tenants.timezone`); null when there is no such workspace. A read that fails throws. */
export async function findWorkspaceZone(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`cannot read the workspace's zone: ${error.message}`);
  return data?.timezone ?? null;
}

// ---- setup acts a member makes from the dashboard: the caller decides what a refusal means; what comes back is the
// database's own answer, the error untouched, since the words for what it raises are theirs.

/** What `create_workspace` takes: the name, the zone when asked for, and the partner's code when the person agreed to one. */
export type CreateWorkspaceArgs = Database["public"]["Functions"]["create_workspace"]["Args"];

/** How many workspaces this user belongs to, counted on the session client, which sees only its own rows. */
export async function getMembershipCount(db: Db, userId: string): Promise<number> {
  const { count, error } = await db
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`memberships_count: ${error.message}`);
  return count ?? 0;
}

/** The workspaces this user belongs to, by id, read on the session client, which sees only its own rows. */
export async function listWorkspaceIds(db: Db, userId: string): Promise<string[]> {
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
export async function writeLineForwarding(db: Db, args: LineForwardingArgs) {
  return db.rpc("line_forwarding_set", args);
}

/**
 * The workspace's logo address set through its one door (set_workspace_logo, 00407), on the member's session: the
 * caller's settings permission, the workspace's own folder, the change's event in the same transaction. An empty path
 * clears it. The address it held before, or the database's refusal.
 */
export async function setWorkspaceLogo(db: Db, tenantId: string, path: string) {
  return db.rpc("set_workspace_logo", { p_tenant_id: tenantId, p_logo_path: path });
}

/** The columns an edit may write, as the table types them. */
export type PlaybookPatch = Database["public"]["Tables"]["sequence_steps"]["Update"];

/** Write the edited fields of a playbook. */
export async function updatePlaybook(
  db: Db,
  id: string,
  patch: PlaybookPatch,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await db.from("sequence_steps").update(patch).eq("id", id);
  return { error };
}

/** Remove a playbook; `count` is how many rows went (none: the row is not there, or the caller may not see it). */
export async function removePlaybook(
  db: Db,
  id: string,
): Promise<{ error: PostgrestError | null; count: number | null }> {
  const { error, count } = await db.from("sequence_steps").delete({ count: "exact" }).eq("id", id);
  return { error, count };
}

/** What a new playbook names: the columns the door writes from, as the table types them. */
export type PlaybookToStart = Required<
  Pick<
    Database["public"]["Tables"]["sequence_steps"]["Insert"],
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
    | "until"
  >
>;

/**
 * Start a playbook with its line in the ledger (00357 start_playbook), on the member's own session: the row, running
 * and theirs, then the start_playbook decision, in one transaction. The door runs on the caller's rights, so the
 * table's policy, checks and unique indexes judge the row. Since 00416 it writes the last day the playbook names
 * (`until`); its sequence takes its class's mode as the first step makes it (00462, decision 0064). The
 * new row's id with its decision's, or the database's refusal, which the caller words; an answer with neither id is a
 * door that is not this one, and throws.
 */
export async function startPlaybook(
  db: Db,
  params: { tenantId: string; playbook: PlaybookToStart; decision: Json; via: string | null; undoOf: string | null },
): Promise<{ data: { id: string; decisionId: string } | null; error: PostgrestError | null }> {
  const { data, error } = await db.rpc("start_playbook", {
    p_tenant_id: params.tenantId,
    p_playbook: params.playbook,
    p_decision: params.decision,
    ...(params.via ? { p_via: params.via } : {}),
    ...(params.undoOf ? { p_undo_of: params.undoOf } : {}),
  });
  if (error) return { data: null, error };
  const created = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (typeof created.id !== "string" || typeof created.decision_id !== "string")
    throw new Error("start_playbook: the door answered without its row and its decision");
  return { data: { id: created.id, decisionId: created.decision_id }, error: null };
}

/**
 * Change a playbook in place with its line in the ledger (the change_playbook door), on the member's own session:
 * the row locked, only the columns `set` names written, then the decision (start_playbook, pause_playbook or
 * change_playbook) as theirs, in one transaction. What each written column held comes back as `was`; where nothing
 * named differs from the row, nothing is written and `was` is empty with no decision (two presses of Pause at once). A
 * playbook the caller cannot see or change is the database's P0002, which the caller words; an answer without its row,
 * or with a change and no decision, is a door that is not this one, and throws. `"missing"` on a database before the
 * door's migration
 * (isMissingDoor), where the dashboard writes the change the way it did before, for one release, so either deploy order
 * works (the counts doors' rule, reports/series.ts answerOrMissing).
 */
export async function writePlaybookChange(
  db: Db,
  params: {
    tenantId: string;
    playbookId: string;
    set: Json;
    decision: Json;
    via: string | null;
    undoOf: string | null;
  },
): Promise<
  | {
      data: { id: string; was: Record<string, unknown>; decisionId: string | null } | null;
      error: PostgrestError | null;
    }
  | "missing"
> {
  const { data, error } = await db.rpc("change_playbook", {
    p_tenant_id: params.tenantId,
    p_playbook_id: params.playbookId,
    p_set: params.set,
    p_decision: params.decision,
    ...(params.via ? { p_via: params.via } : {}),
    ...(params.undoOf ? { p_undo_of: params.undoOf } : {}),
  });
  if (error) return isMissingDoor(error) ? "missing" : { data: null, error };
  const created = data !== null && typeof data === "object" && !Array.isArray(data) ? data : {};
  const was = created.was !== null && typeof created.was === "object" && !Array.isArray(created.was) ? created.was : {};
  const decisionId = typeof created.decision_id === "string" ? created.decision_id : null;
  if (typeof created.id !== "string" || (decisionId === null && Object.keys(was).length > 0))
    throw new Error("change_playbook: the door answered without its row, or a change without its decision");
  return { data: { id: created.id, was, decisionId }, error: null };
}
