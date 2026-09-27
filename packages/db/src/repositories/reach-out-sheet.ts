/**
 * The reach-out sheet's reads and writes (Reach out, Part 4 PRs 4–5): a workspace's chains as their rows, a chain's
 * root and a send by their ids, the emails' words, a run's sends, a step stamped for its day, the one reset of a
 * send's check (00211 reach_out_recheck) and the outreach mode. The one place these tables are typed for them. The
 * dashboard asks on the session client (RLS decides what a member reads); the edge on the service role. A read that
 * fails throws: "we could not read" is never "none".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../database.types";

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

/** A run's held-notice mark, kept in its audience (Reach out, Part 4 PR 7, R20): claimed by a tick, then sent. */
export interface HeldNoticeMark {
  claimed_at: string;
  sent_at?: string;
}

type JsonObject = { [key: string]: Json | undefined };

/** A mark as the audience holds it; anything else is no mark. */
const markOf = (v: Json | undefined): HeldNoticeMark | null =>
  v && typeof v === "object" && !Array.isArray(v) && typeof v.claimed_at === "string"
    ? { claimed_at: v.claimed_at, ...(typeof v.sent_at === "string" ? { sent_at: v.sent_at } : {}) }
    : null;

/** A live reach-out run with holds whose owner has not been told of them yet, as the check's notice reads it. */
export interface HeldNoticeRun {
  id: string;
  tenant_id: string;
  name: string;
  audience: JsonObject;
  updated_at: string;
  held: number;
  reasons: string[];
}

/**
 * The live reach-out runs (scheduled or sending) holding sends held since `since` whose owner was not told yet: no
 * mark, or a claim older than `staleBefore` that never went (a tick that stopped, or a notice that failed). A read,
 * not a tick's memory, so a notice that failed is asked again. A read that fails throws.
 */
export async function heldNoticeDue(
  db: Db,
  p: { since: string; staleBefore: string; tenantId?: string; limit: number },
): Promise<HeldNoticeRun[]> {
  let sends = db
    .from("reach_out_sends")
    .select("tenant_id, broadcast_id, reason")
    .eq("state", "held")
    .gte("updated_at", p.since)
    .limit(p.limit);
  if (p.tenantId) sends = sends.eq("tenant_id", p.tenantId);
  const held = await sends;
  if (held.error) throw new Error(`cannot read the held: ${held.error.message}`);
  const byRun = new Map<string, { held: number; reasons: Set<string> }>();
  for (const s of held.data ?? []) {
    if (!s.broadcast_id) continue;
    const r = byRun.get(s.broadcast_id) ?? { held: 0, reasons: new Set<string>() };
    r.held += 1;
    if (s.reason) r.reasons.add(s.reason);
    byRun.set(s.broadcast_id, r);
  }
  if (byRun.size === 0) return [];
  const runs = await db
    .from("broadcasts")
    .select("id, tenant_id, name, state, audience, updated_at")
    .in("id", [...byRun.keys()])
    .in("state", ["scheduled", "sending"]);
  if (runs.error) throw new Error(`cannot read the held's runs: ${runs.error.message}`);
  return (runs.data ?? []).flatMap((b) => {
    const audience: JsonObject =
      b.audience && typeof b.audience === "object" && !Array.isArray(b.audience) ? b.audience : {};
    if (audience.kind !== "reach_out") return [];
    const mark = markOf(audience.held_notice);
    if (mark && (mark.sent_at || mark.claimed_at >= p.staleBefore)) return [];
    const r = byRun.get(b.id)!;
    return [
      {
        id: b.id,
        tenant_id: b.tenant_id,
        name: b.name,
        audience,
        updated_at: b.updated_at,
        held: r.held,
        reasons: [...r.reasons],
      },
    ];
  });
}

/**
 * A run's held-notice mark written into its audience. With `ifUpdatedAt`, only onto the row as it was read (its
 * updated_at, which moddatetime moves on every write): of two ticks that read one run, one claims it and the other finds
 * it moved. Nothing else writes a run's audience after it is planned, so the mark after a claim is written plainly.
 * True when the row took it.
 */
export async function markHeldNotice(
  db: Db,
  p: { tenantId: string; id: string; audience: JsonObject; mark: HeldNoticeMark; ifUpdatedAt?: string },
): Promise<boolean> {
  let q = db
    .from("broadcasts")
    .update({ audience: { ...p.audience, held_notice: { ...p.mark } } })
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id);
  if (p.ifUpdatedAt) q = q.eq("updated_at", p.ifUpdatedAt);
  const { data, error } = await q.select("id");
  if (error) throw new Error(`cannot mark the run: ${error.message}`);
  return (data ?? []).length === 1;
}
