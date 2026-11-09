/**
 * Who Anthropic is told a model call is for (decision 0097; 00544 anthropic_profiles): the `uprof_` id of a signed-up person
 * or a workspace, and the enforcement Anthropic last said of it. The service role's alone; a table is typed here and nowhere
 * else. The edge's lib/anthropic-profiles decides, and Health and the billing read ask.
 *
 *   findAnthropicProfile        the row for a subject, what a model call asks. A read that fails throws.
 *   claimAnthropicProfile     the row made, once: what the create needs, to the one caller that made it, and null to any
 *                             other, or for a subject that is gone. Creating is not idempotent, so nothing creates without it.
 *   keepAnthropicProfileId    the id, once Anthropic has answered or the sweep has found it.
 *   dropAnthropicProfile      the row gone: a claim nothing came of, or a profile deleted at Anthropic.
 *   listAnthropicProfileRows      every row, for the sweep, with whether a workspace's last member has left it.
 *   listAnthropicProfilesWaiting  who has no row yet.
 *   setAnthropicEnforcement   what Anthropic now says of a profile.
 *   findWorkspaceModelStanding    what Anthropic has said of a workspace's profile: what its members are told.
 *   getHealthAnthropicProfiles   the counts and those Anthropic acted on, as Health reads them.
 *
 * Cross-workspace: a person's profile belongs to no workspace, and the sweep and Health read every workspace's by name.
 */
import { heldTenantId, DbFailure } from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anthropicActed,
  enforcementActionsOf,
  enforcementStatusOf,
  modelStandingOf,
  subjectIdOf,
  type AnthropicEnforcementStatus,
  type AnthropicProfileKind,
  type EnforcementAction,
  type HealthAnthropicProfilesDto,
  type ModelStanding,
  type ProfiledSubject,
} from "@chanlytics/contracts";
import type { Database } from "../../types";
import { readAllRows } from "../../shared/paged";
import type { TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import { readAnswer } from "../../shared/read-json";

type Db = SupabaseClient<Database>;

/** What a model call needs of a subject's row. */
export interface AnthropicProfileHeld {
  profile_id: string | null;
  enforcement_status: AnthropicEnforcementStatus;
}

/** Anthropic's word as the column holds it: the schema's closed set, and a value nobody wrote reads restricted. */
const statusOfRow = (raw: unknown): AnthropicEnforcementStatus => enforcementStatusOf(raw) ?? "restricted";

export async function findAnthropicProfile(db: Db, subject: ProfiledSubject): Promise<AnthropicProfileHeld | null> {
  const q = db.from("anthropic_profiles").select("profile_id, enforcement_status");
  const { data, error } = await (
    subject.kind === "person" ? q.eq("user_id", subject.userId) : q.eq("tenant_id", heldTenantId(subject.tenantId))
  ).maybeSingle();
  if (error) throw new DbFailure(error, "anthropic_profiles");
  return data ? { profile_id: data.profile_id, enforcement_status: statusOfRow(data.enforcement_status) } : null;
}

/** What a create needs of a claim. */
export interface AnthropicProfileClaim {
  id: string;
  referenceId: string;
  onboardedAt: string;
}

/** What anthropic_profile_claim answers: the row's three facts, or null for a subject gone. */
const ProfileClaim = z
  .object({ id: z.string(), reference_id: z.string(), onboarded_at: z.string() })
  .partial()
  .nullable();

export async function claimAnthropicProfile(db: Db, subject: ProfiledSubject): Promise<AnthropicProfileClaim | null> {
  const { data, error } = await db.rpc("anthropic_profile_claim", {
    p_kind: subject.kind,
    p_subject: subjectIdOf(subject),
  });
  if (error) throw new DbFailure(error, "anthropic_profile_claim");
  const c = readAnswer("anthropic_profile_claim", ProfileClaim, data);
  if (!c?.id || !c.reference_id || !c.onboarded_at) return null;
  return { id: c.id, referenceId: c.reference_id, onboardedAt: c.onboarded_at };
}

export async function keepAnthropicProfileId(db: Db, rowId: string, profileId: string): Promise<void> {
  const { error } = await db.from("anthropic_profiles").update({ profile_id: profileId }).eq("id", rowId);
  if (error) throw new DbFailure(error, "anthropic_profiles");
}

export async function dropAnthropicProfile(db: Db, rowId: string): Promise<void> {
  const { error } = await db.from("anthropic_profiles").delete().eq("id", rowId);
  if (error) throw new DbFailure(error, "anthropic_profiles");
}

/** A row as the sweep reads it. */
export interface AnthropicProfileRow {
  id: string;
  kind: AnthropicProfileKind;
  user_id: string | null;
  tenant_id: TenantId | null;
  reference_id: string;
  profile_id: string | null;
  claimed_at: string;
  enforcement_status: AnthropicEnforcementStatus;
  enforcement_actions: EnforcementAction[];
  enforcement_at: string | null;
  /** Whether what it stands for has gone: the person, the workspace, or the workspace's last member. */
  leaving: boolean;
}

const PROFILE_COLUMNS =
  "id, kind, user_id, tenant_id, reference_id, profile_id, claimed_at, enforcement_status, enforcement_actions, enforcement_at, tenants(left_empty_at)";

export async function listAnthropicProfileRows(db: Db): Promise<AnthropicProfileRow[]> {
  const rows = await readAllRows("anthropic_profiles", (from, to) =>
    db.from("anthropic_profiles").select(PROFILE_COLUMNS).order("id").range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    reference_id: row.reference_id,
    profile_id: row.profile_id,
    claimed_at: row.claimed_at,
    enforcement_status: statusOfRow(row.enforcement_status),
    enforcement_actions: enforcementActionsOf(row.enforcement_actions),
    enforcement_at: row.enforcement_at,
    leaving: (!row.user_id && !row.tenant_id) || !!row.tenants?.left_empty_at,
  }));
}

export async function listAnthropicProfilesWaiting(db: Db, limit: number): Promise<ProfiledSubject[]> {
  const { data, error } = await db.rpc("anthropic_profiles_waiting", { p_limit: limit });
  if (error) throw new DbFailure(error, "anthropic_profiles_waiting");
  return (data ?? []).map((w) =>
    w.kind === "person" ? { kind: "person", userId: w.subject } : { kind: "workspace", tenantId: w.subject },
  );
}

export async function setAnthropicEnforcement(
  db: Db,
  rowId: string,
  status: AnthropicEnforcementStatus,
  actions: EnforcementAction[],
  at: string,
): Promise<void> {
  const { error } = await db
    .from("anthropic_profiles")
    .update({
      enforcement_status: status,
      enforcement_actions: actions,
      enforcement_at: at,
    })
    .eq("id", rowId);
  if (error) throw new DbFailure(error, "anthropic_profiles");
}

export async function findWorkspaceModelStanding(db: Db, tenantId: TenantId): Promise<ModelStanding | null> {
  const row = await findAnthropicProfile(db, { kind: "workspace", tenantId });
  return row ? modelStandingOf(row.enforcement_status) : null;
}

/** How many a waiting count reads at most: Health's number, which says so past it. */
const WAITING_READ = 1000;

export async function getHealthAnthropicProfiles(db: Db): Promise<HealthAnthropicProfilesDto> {
  const [rows, waiting] = await Promise.all([
    listAnthropicProfileRows(db),
    listAnthropicProfilesWaiting(db, WAITING_READ),
  ]);
  return {
    kept: rows.filter((r) => r.profile_id && !r.leaving).length,
    waiting: waiting.length,
    leaving: rows.filter((r) => r.leaving).length,
    acted_on: rows
      .filter((r) => anthropicActed(r.enforcement_status) && !r.leaving)
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        tenant_id: r.tenant_id,
        user_id: r.user_id,
        status: r.enforcement_status,
        actions: r.enforcement_actions,
        at: r.enforcement_at,
      })),
  };
}
