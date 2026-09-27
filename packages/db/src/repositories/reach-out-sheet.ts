/**
 * The reach-out sheet's reads and writes (Reach out, Part 4 PRs 4–5): a workspace's chains as their rows, a chain's
 * root and a send by their ids, the emails' words, a run's sends, a step stamped for its day, the one reset of a
 * send's check (00211 reach_out_recheck) and the outreach mode. The one place these tables are typed for them. The
 * dashboard asks on the session client (RLS decides what a member reads); the edge on the service role. A read that
 * fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

/** A reach-out step as the sheet and its rows read it. */
export interface ReachOutStepRow {
  id: string;
  name: string;
  state: string;
  trigger: string;
  lead_search_id: string | null;
  after_playbook_id: string | null;
  after_days: number | null;
  gap_minutes: number | null;
  domain_ids: string[] | null;
  signed_by: string | null;
  include_unconfirmed: boolean | null;
  template_id: string | null;
  run_hour: number;
  last_run_for: string | null;
  created_at: string;
}

const STEP_COLUMNS =
  "id, name, state, trigger, lead_search_id, after_playbook_id, after_days, gap_minutes, domain_ids, signed_by, include_unconfirmed, template_id, run_hour, last_run_for, created_at";

/** Every reach-out step of a workspace, each chain's root among them (trigger lead_first). */
export async function reachOutStepsOf(db: Db, tenantId: string): Promise<ReachOutStepRow[]> {
  const { data, error } = await db
    .from("playbooks")
    .select(STEP_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("kind", "reach_out");
  if (error) throw new Error(`cannot read the reach-outs: ${error.message}`);
  return (data ?? []) as ReachOutStepRow[];
}

/** A chain's root (its first step) by its id; null when there is none, or it is a later step. */
export async function reachOutRootOf(
  db: Db,
  id: string,
): Promise<{
  id: string;
  tenant_id: string;
  name: string;
  state: string;
  trigger: string;
  lead_search_id: string | null;
} | null> {
  const { data, error } = await db
    .from("playbooks")
    .select("id, tenant_id, name, state, trigger, lead_search_id")
    .eq("id", id)
    .eq("kind", "reach_out")
    .eq("trigger", "lead_first")
    .maybeSingle();
  if (error) throw new Error(`cannot read the reach-out: ${error.message}`);
  return data;
}

/** One send of a run by its id: whose it is and where it stands; null when there is none. */
export async function reachOutSendRefOf(
  db: Db,
  id: string,
): Promise<{ id: string; tenant_id: string; broadcast_id: string; state: string; reason: string | null } | null> {
  const { data, error } = await db
    .from("reach_out_sends")
    .select("id, tenant_id, broadcast_id, state, reason")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the email: ${error.message}`);
  return data;
}

/** An email template's words from its row: HEADER is the subject, BODY the body (the body preview when it has none). */
export function emailWordsFrom(row: {
  components: unknown;
  body_preview: string | null;
}): { subject: string | null; body: string } | null {
  const part = (type: string): string | null => {
    for (const c of Array.isArray(row.components) ? row.components : [])
      if (c && typeof c === "object" && String((c as { type?: unknown }).type ?? "").toUpperCase() === type) {
        const t = (c as { text?: unknown }).text;
        return typeof t === "string" && t.trim() ? t : null;
      }
    return null;
  };
  const body = part("BODY") ?? (row.body_preview?.trim() || null);
  return body ? { subject: part("HEADER"), body } : null;
}

/** Many templates' words at once, by id: what a workspace's chains say. */
export async function emailWordsByTemplate(
  db: Db,
  tenantId: string,
  ids: string[],
): Promise<Map<string, { subject: string | null; body: string } | null>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from("templates")
    .select("id, components, body_preview")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) throw new Error(`cannot read the reach-outs' words: ${error.message}`);
  return new Map((data ?? []).map((t) => [t.id, emailWordsFrom(t)]));
}

/** The searches' names, by id. */
export async function searchNamesByIds(db: Db, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db.from("lead_searches").select("id, name").eq("tenant_id", tenantId).in("id", ids);
  if (error) throw new Error(`cannot read the searches: ${error.message}`);
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

/** The runs waiting for their owner's approval, as their audiences say them (a reach-out's names its root). */
export async function runsWaitingOf(db: Db, tenantId: string): Promise<{ id: string; audience: unknown }[]> {
  const { data, error } = await db
    .from("broadcasts")
    .select("id, audience")
    .eq("tenant_id", tenantId)
    .eq("state", "pending_approval");
  if (error) throw new Error(`cannot read the runs waiting: ${error.message}`);
  return data ?? [];
}

/** A run's sends, each with its lead's name, address and city (a run holds at most a step's cap, 200). */
export interface ReachOutRunSend {
  id: string;
  lead_id: string;
  state: string;
  reason: string | null;
  hold_detail: string | null;
  opening: string | null;
  angle: string | null;
  send_at: string | null;
  checked_at: string | null;
  created_at: string;
  domain_id: string | null;
  lead: { business_name: string | null; email: string | null; city: string | null } | null;
}

export async function reachOutRunSendsOf(db: Db, tenantId: string, runId: string): Promise<ReachOutRunSend[]> {
  const { data, error } = await db
    .from("reach_out_sends")
    .select(
      "id, lead_id, state, reason, hold_detail, opening, angle, send_at, checked_at, created_at, domain_id, lead:leads(business_name, email, city)",
    )
    .eq("tenant_id", tenantId)
    .eq("broadcast_id", runId);
  if (error) throw new Error(`cannot read the run's emails: ${error.message}`);
  return (data ?? []) as ReachOutRunSend[];
}

/** A step's day: tried now, and, when it ran, the day it ran for (the sweep and Start both stamp it). */
export async function stampReachOutStep(db: Db, id: string, p: { at: Date; runFor?: string }): Promise<void> {
  const { error } = await db
    .from("playbooks")
    .update({ last_run_at: p.at.toISOString(), ...(p.runFor ? { last_run_for: p.runFor } : {}) })
    .eq("id", id);
  if (error) throw new Error(`cannot stamp the step's day: ${error.message}`);
}

/**
 * Sends back to unchecked (R5), in one statement (00211 reach_out_recheck, the one reset): planned, not checked, at
 * their words' next version, so a check still under way for the old words writes nothing; what their owner included
 * them past stays (R7). Only from planned, held or claimed, and only from `fromState` when it is named: the sender
 * names "claimed", so a send another tick has claimed since is never reset. One past its fortnight is given up,
 * kept_waiting, instead (R10). How many went back.
 */
export async function recheckSends(
  db: Db,
  p: { tenantId: string; ids: string[]; fromState?: "planned" | "held" | "claimed" },
): Promise<number> {
  if (p.ids.length === 0) return 0;
  const { data, error } = await db.rpc("reach_out_recheck", {
    p_send_ids: p.ids,
    p_tenant_id: p.tenantId,
    ...(p.fromState ? { p_from_state: p.fromState } : {}),
  } as never);
  if (error) throw new Error(`cannot put the sends back to be checked: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

export type OutreachMode = "ask" | "veto" | "never";

/**
 * Settings › Autonomy's outreach row (00183), the one reading of it: a workspace's own row, its mode as said; none, or
 * a mode it does not know, reads as ask, so a missing row can only wait for its owner. The step's run and the
 * dashboard's chains both ask it. A read that fails throws.
 */
export async function outreachModeOf(db: Db, tenantId: string): Promise<OutreachMode> {
  const { data, error } = await db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "outreach")
    .is("subject_type", null)
    .maybeSingle();
  if (error) throw new Error(`cannot read the outreach mode: ${error.message}`);
  const said = data?.mode;
  return said === "veto" || said === "never" ? said : "ask";
}

/** A workspace's zone; null when it could not be read (the caller says which zone it falls back to). */
export async function tenantZoneOf(db: Db, tenantId: string): Promise<string | null> {
  const { data, error } = await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle();
  return error ? null : (data?.timezone ?? null);
}
