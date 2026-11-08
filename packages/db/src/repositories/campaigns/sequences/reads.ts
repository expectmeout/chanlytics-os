/** Sequences: reads. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONSENT_CHANNELS,
  EVIDENCE_DAYS,
  isLeadList,
  isSequenceMode,
  type SequenceEvidenceDto,
  type SequenceMode,
} from "@chanlytics/contracts";
import type {
  ReachOutFedBy,
  SchemaSet,
  SequenceOneOffDto,
  SequenceRowDto,
  SequenceStepDto,
  ContactId,
  TenantId,
} from "@chanlytics/contracts";
import type { Database } from "../../../types";
import { readAllRows } from "../../../shared/paged";
import { withReadyCounts } from "../sequence-waiting";

export type Db = SupabaseClient<Database>;

/** Someone a customer's step after the first is due to (00441 sequence_follow_ups_due). */
interface FollowUpDueRow {
  enrollment_id: string;
  contact_id: ContactId;
  /** When their step before it went. */
  sent_at: string | null;
}

/**
 * Who a customer's step after the first is due to on the business's day `runFor` (YYYY-MM-DD): in its sequence one step
 * before it, their wait over by that day, the longest waiting first.
 */
export async function followUpsDue(db: Db, stepId: string, runFor: string): Promise<FollowUpDueRow[]> {
  const { data, error } = await db.rpc("sequence_follow_ups_due", { p_step_id: stepId, p_run_for: runFor });
  if (error) throw new Error(`cannot read who the step is due to: ${error.message}`);
  return (data ?? []).flatMap((r) =>
    r.enrollment_id && r.contact_id
      ? [{ enrollment_id: r.enrollment_id, contact_id: r.contact_id, sent_at: r.sent_at ?? null }]
      : [],
  );
}

/**
 * People taken out of their sequence (00441 sequence_enrollments_leave): each still in it leaves with `why`, and a send
 * of theirs not yet gone is skipped with it. `by` names the member who did it. How many left.
 */
export async function leaveSequence(
  db: Db,
  params: { tenantId: TenantId; enrollmentIds: readonly string[]; why: string; by?: string | null },
): Promise<number> {
  if (params.enrollmentIds.length === 0) return 0;
  const { data, error } = await db.rpc("sequence_enrollments_leave", {
    p_tenant_id: params.tenantId,
    p_ids: [...params.enrollmentIds],
    p_why: params.why,
    ...(params.by ? { p_by: params.by } : {}),
  });
  if (error) throw new Error(`cannot take them out of the sequence: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * Leads a later step passes over (00455 sequence_leads_leave): each one's place in the sequence that still stands ends
 * with its why, and a send of theirs not yet gone is skipped. Service role only. How many left.
 */
export async function leaveSequenceForLeads(
  db: Db,
  params: { tenantId: TenantId; sequenceId: string; leads: readonly { lead_id: string; why: string }[] },
): Promise<number> {
  if (params.leads.length === 0) return 0;
  const { data, error } = await db.rpc("sequence_leads_leave", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    p_leads: params.leads.map((l) => ({ lead_id: l.lead_id, why: l.why })),
  });
  if (error) throw new Error(`cannot pass over the step's leads: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * Who a customer's sequence has reached, by contact id: everyone it holds now, or sent anything to (an enrollment that is
 * in, or one with a send that went). A sequence on a list goes once to each person (the loop review's item 6), so its run
 * leaves them out. Every page read; a read that fails throws: unread is not nobody.
 */
export async function wasSequenceReached(db: Db, tenantId: TenantId, sequenceId: string): Promise<Set<string>> {
  const rows = await readAllRows("who the sequence reached", (from, to) =>
    db
      .from("sequence_enrollments")
      .select("contact_id")
      .eq("tenant_id", tenantId)
      .eq("sequence_id", sequenceId)
      .is("lead_id", null)
      .or("state.eq.in,sent_at.not.is.null")
      .order("id")
      .range(from, to),
  );
  return new Set(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : [])));
}

/**
 * The sequences one person is in now (decision 0060, S5: a person's page says them), soonest next first: each with its
 * name, the step they are at and when the next goes. Under the caller's row security.
 */
export async function listSequencesOfPerson(
  db: Db,
  tenantId: TenantId,
  contactId: ContactId,
): Promise<{ id: string; name: string; place: number; next_at: string | null }[]> {
  const { data, error } = await db
    .from("sequence_enrollments")
    .select("sequence_id, place, next_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contactId)
    .eq("state", "in")
    .order("next_at", { ascending: true, nullsFirst: false })
    .limit(20);
  if (error) throw new Error(`cannot read the sequences they are in: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const names = await db
    .from("sequences")
    .select("id, name")
    .in(
      "id",
      rows.map((r) => r.sequence_id),
    );
  if (names.error) throw new Error(`cannot read the sequences they are in: ${names.error.message}`);
  const nameOf = new Map((names.data ?? []).map((q) => [q.id, q.name]));
  return rows.flatMap((r) => {
    const name = nameOf.get(r.sequence_id);
    return name ? [{ id: r.sequence_id, name, place: r.place, next_at: r.next_at }] : [];
  });
}

/* ---------------------------------------------------------------------------------- the page's reads (00442) -- */

/**
 * A sequence by its id, or by the id of one of its parts, under the caller's row security: an old address names a
 * campaign's step (`campaigns/moment:<step>`, a reach-out's later email among them) or a run (`broadcasts/run:<batch>`),
 * and lands on the sequence it is part of. Null for an id that names none.
 */
export async function findSequenceRow(
  db: Db,
  id: string,
): Promise<{ id: string; tenant_id: TenantId; name: string; starts: string; state: string } | null> {
  const own = await sequenceById(db, id);
  if (own) return own;
  const [step, batch] = await Promise.all([
    db.from("sequence_steps").select("sequence_id").eq("id", id).maybeSingle(),
    db.from("sequence_batches").select("sequence_id").eq("id", id).maybeSingle(),
  ]);
  if (step.error) throw new Error(`cannot read the sequence's step: ${step.error.message}`);
  if (batch.error) throw new Error(`cannot read the sequence's batch: ${batch.error.message}`);
  const of = step.data?.sequence_id ?? batch.data?.sequence_id ?? null;
  return of ? sequenceById(db, of) : null;
}

async function sequenceById(db: Db, id: string) {
  const { data, error } = await db
    .from("sequences")
    .select("id, tenant_id, name, starts, state")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`cannot read the sequence: ${error.message}`);
  return data;
}

/** A reader's answer as its rows: the readers answer JSON in the shape contracts names (sequences/dto.ts); none else. */
function readerRowsOf<T>(data: unknown): T[] {
  return Array.isArray(data) ? data.filter((r): r is T => typeof r === "object" && r !== null) : [];
}

/**
 * How each named sequence's batches are decided (decision 0064, `sequences.mode`), by its id: what a step's run and the
 * pages that list steps read beside the step's own row. A sequence with no mode this build knows (a one-off has none)
 * asks, as contracts batchModeOf reads one. A read that fails throws.
 */
export async function getSequenceModes(
  db: Db,
  tenantId: TenantId,
  ids: readonly string[],
): Promise<Map<string, SequenceMode>> {
  const out = new Map<string, SequenceMode>();
  if (ids.length === 0) return out;
  const { data, error } = await db
    .from("sequences")
    .select("id, mode")
    .eq("tenant_id", tenantId)
    .in("id", [...new Set(ids)]);
  if (error) throw new Error(`cannot read the sequences' modes: ${error.message}`);
  for (const r of data ?? []) out.set(r.id, isSequenceMode(r.mode) ? r.mode : "ask");
  return out;
}

/**
 * What each of the workspace's sequences' batches did over the last `days` (00462 sequence_evidence, decision 0064 step
 * 5): went, after an OK, stopped, skipped unanswered. On the session's client (its row security decides). A read that
 * fails throws.
 */
export async function listSequenceEvidence(
  db: Db,
  tenantId: TenantId,
  days: number = EVIDENCE_DAYS,
): Promise<SequenceEvidenceDto[]> {
  const { data, error } = await db.rpc("sequence_evidence", { p_tenant_id: tenantId, p_days: days });
  if (error) throw new Error(`cannot read what the sequences' batches did: ${error.message}`);
  return (data ?? []).map((r) => ({
    sequence_id: r.sequence_id,
    policy_class: r.policy_class,
    went: r.went,
    approved: r.approved,
    stopped: r.stopped,
    skipped: r.skipped,
  }));
}

/** The workspace's sequences, newest first, or the one named (00442 sequence_overview). */
export async function listSequenceOverview(db: Db, tenantId: TenantId, sequenceId?: string): Promise<SequenceRowDto[]> {
  const { data, error } = await db.rpc("sequence_overview", {
    p_tenant_id: tenantId,
    ...(sequenceId ? { p_sequence_id: sequenceId } : {}),
  });
  if (error) throw new Error(`cannot read the sequences: ${error.message}`);
  return withReadyCounts(db, tenantId, readerRowsOf<SequenceRowDto>(data));
}

/** A sequence running now, as what Ask notices reads it (decision 0087). */
export interface SequenceGlance {
  id: string;
  name: string;
  state: string;
  mode: string | null;
  first: { id: string } | null;
}

/**
 * The sequences running now and each one's first step, under the caller's row security: all a fold over their batches needs,
 * without the counts, lists and searches sequence_overview joins for the Sequences list. A read that fails throws.
 */
export async function listSequencesAtAGlance(db: Db, tenantId: TenantId): Promise<SequenceGlance[]> {
  const [sequences, steps] = await Promise.all([
    db.from("sequences").select("id, name, state, mode").eq("tenant_id", tenantId).eq("state", "on"),
    db.from("sequence_steps").select("id, sequence_id, place").eq("tenant_id", tenantId).order("place"),
  ]);
  if (sequences.error) throw new Error(`cannot read the sequences: ${sequences.error.message}`);
  if (steps.error) throw new Error(`cannot read their steps: ${steps.error.message}`);
  const first = new Map<string, string>();
  for (const step of steps.data ?? []) if (!first.has(step.sequence_id)) first.set(step.sequence_id, step.id);
  return (sequences.data ?? []).map((s) => {
    const id = first.get(s.id);
    return { ...s, first: id ? { id } : null };
  });
}

/**
 * The sequence a part of it belongs to, by the part's id: a batch's (a run's address, broadcasts/run:<id>) or a step's.
 * An address that names a part opens its sequence, which then names its own. Null where no part of this workspace has
 * the id. Under the caller's row security, as the readers are.
 */
export async function findSequenceOfPart(db: Db, tenantId: TenantId, id: string): Promise<string | null> {
  const [batch, step] = await Promise.all([
    db.from("sequence_batches").select("sequence_id").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    db.from("sequence_steps").select("sequence_id").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
  ]);
  if (batch.error) throw new Error(`cannot read the batch's sequence: ${batch.error.message}`);
  if (step.error) throw new Error(`cannot read the step's sequence: ${step.error.message}`);
  const of = (r: unknown): string | null => {
    const v = r && typeof r === "object" ? (r as { sequence_id?: unknown }).sequence_id : null;
    return typeof v === "string" ? v : null;
  };
  return of(batch.data) ?? of(step.data);
}

/**
 * A sequence's first step's run facts: the business day it last ran (when its next run goes), the most one run sends, the
 * days before someone hears it again (a moment's gap), and the days between runs (the month's offer). Null where the step
 * is none of this workspace's. Under the caller's row security.
 */
async function firstStepFacts(
  db: Db,
  tenantId: TenantId,
  stepId: string,
): Promise<{ last_run_for: string | null; cap_per_run: number; gap_days: number; cadence_days: number } | null> {
  const { data, error } = await db
    .from("sequence_steps")
    .select("last_run_for, cap_per_run, gap_days, cadence_days")
    .eq("tenant_id", tenantId)
    .eq("id", stepId)
    .maybeSingle();
  if (error) throw new Error(`cannot read the first step's run: ${error.message}`);
  return data;
}

/**
 * Why a step's last recorded run did nothing, where it did nothing: the `skipped` its latest `playbook.run` event carries
 * (core runPlaybook's record: no calendar, its list gone, its message not approved, the class set to Never, its last day
 * passed). Null where that run sent, found nobody or none is recorded. Under the caller's row security.
 */
async function lastRunSkipped(db: Db, tenantId: TenantId, stepId: string): Promise<string | null> {
  const { data, error } = await db
    .from("events")
    .select("data")
    .eq("tenant_id", tenantId)
    .eq("subject_type", "playbook")
    .eq("subject_id", stepId)
    .eq("kind", "playbook.run")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cannot read the step's last run: ${error.message}`);
  const sentence = data?.data;
  return sentence && typeof sentence === "object" && !Array.isArray(sentence) && typeof sentence.skipped === "string"
    ? sentence.skipped
    : null;
}

/** The states of a lead's send that say its email was written: reach_out_remove's own, besides one skipped once drafted. */
const WRITTEN_SEND_STATES: SchemaSet<"sequence_sends.state">[] = ["claimed", "queued", "sent", "failed", "drafted"];

/**
 * What a sequence has done that its head's acts turn on (0072), under the caller's row security. `ran`: whether it ever
 * made a batch, the question its first step's going asks (sequence_steps_first_gone ends one that did and takes away one
 * that never did) and sequence_discard asks (taking anyone in needs a batch). `wrote`: whether an email of it to a lead
 * was ever written, the question reach_out_remove asks before it lets a sequence to leads go; never, of any other.
 * Held to the three on a replayed stack (sequences/sequence-doors.db.test.mjs).
 */
async function sequenceHistoryFacts(
  db: Db,
  tenantId: TenantId,
  sequenceId: string,
): Promise<{ ran: boolean; wrote: boolean }> {
  const leadSends = () =>
    db
      .from("sequence_sends")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("sequence_id", sequenceId)
      .not("lead_id", "is", null);
  const [batch, written, draftedThenSkipped] = await Promise.all([
    db.from("sequence_batches").select("id").eq("tenant_id", tenantId).eq("sequence_id", sequenceId).limit(1),
    leadSends().in("state", WRITTEN_SEND_STATES).limit(1),
    leadSends().eq("state", "skipped").not("drafted_at", "is", null).limit(1),
  ]);
  for (const r of [batch, written, draftedThenSkipped])
    if (r.error) throw new Error(`cannot read what the sequence has done: ${r.error.message}`);
  return {
    ran: (batch.data ?? []).length > 0,
    wrote: (written.data ?? []).length > 0 || (draftedThenSkipped.data ?? []).length > 0,
  };
}

/**
 * What GET sequences/:id says of a sequence beside its row and its steps, by its id (its first step's): its first step's
 * run facts (firstStepFacts), why its last run did nothing (lastRunSkipped), and what it has done (sequenceHistoryFacts,
 * 0072). Each is read on its own: one that fails is left out (undefined), and costs only the lines it feeds and the acts
 * that turn on it.
 */
export async function findSequenceRecordFacts(
  db: Db,
  tenantId: TenantId,
  sequenceId: string,
): Promise<{
  first: Awaited<ReturnType<typeof firstStepFacts>> | undefined;
  lastRunOff: string | null | undefined;
  history: { ran: boolean; wrote: boolean } | undefined;
}> {
  const [first, lastRunOff, history] = await Promise.all([
    firstStepFacts(db, tenantId, sequenceId).catch(() => undefined),
    lastRunSkipped(db, tenantId, sequenceId).catch(() => undefined),
    sequenceHistoryFacts(db, tenantId, sequenceId).catch(() => undefined),
  ]);
  return { first, lastRunOff, history };
}

/**
 * A one-off's one message as its batch sends it (the batch's id is the sequence's, 00440): the message by its name and
 * language, the values it is filled with, and the channels its sends go by, a customer's not skipped, in CONSENT_CHANNELS'
 * order (none until a send names one, never guessed): each channel asked whether one send goes by it, never every send
 * read. Null where the batch is none of this workspace's. Under the caller's row security.
 */
export async function findOneOffMessage(
  db: Db,
  tenantId: TenantId,
  batchId: string,
): Promise<SequenceOneOffDto | null> {
  const [batch, ...by] = await Promise.all([
    db
      .from("sequence_batches")
      .select("template_name, template_language, params")
      .eq("tenant_id", tenantId)
      .eq("id", batchId)
      .maybeSingle(),
    ...CONSENT_CHANNELS.map((channel) =>
      db
        .from("sequence_sends")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("batch_id", batchId)
        .is("lead_id", null)
        .eq("channel", channel)
        .neq("state", "skipped")
        .limit(1),
    ),
  ]);
  if (batch.error) throw new Error(`cannot read the one-off's message: ${batch.error.message}`);
  const failed = by.find((r) => r.error);
  if (failed?.error) throw new Error(`cannot read how the one-off goes: ${failed.error.message}`);
  if (!batch.data) return null;
  return {
    template_name: batch.data.template_name,
    template_language: batch.data.template_language,
    params: batch.data.params,
    channels: CONSENT_CHANNELS.filter((_, i) => (by[i]?.data ?? []).length > 0),
  };
}

/**
 * What a sequence to leads writes to, by its search (`lead_searches.via`, contracts isLeadList): a list its owner adds
 * leads to, or the search the finder keeps current, which a search no longer here is too. Under the caller's row security.
 */
export async function getLeadsFedBy(db: Db, tenantId: TenantId, searchId: string): Promise<ReachOutFedBy> {
  const { data, error } = await db
    .from("lead_searches")
    .select("via")
    .eq("tenant_id", tenantId)
    .eq("id", searchId)
    .maybeSingle();
  if (error) throw new Error(`cannot read what the sequence writes to: ${error.message}`);
  return isLeadList(data) ? "list" : "search";
}

/**
 * The steps running on any of these moments (`trigger`), by id, name and moment: who else sends at a visit's moment, so a
 * second reminder is refused where it would start (the routes) and reaches nobody a twin reached (the run's `twinsOf`).
 * Under the caller's client: the member's session on the page's routes, the service role in the sweep.
 */
export async function listRunningStepsOn(
  db: Db,
  tenantId: TenantId,
  triggers: readonly SchemaSet<"sequence_steps.trigger">[],
): Promise<{ id: string; name: string; trigger: string }[]> {
  if (triggers.length === 0) return [];
  const { data, error } = await db
    .from("sequence_steps")
    .select("id, name, trigger")
    .eq("tenant_id", tenantId)
    .eq("state", "running")
    .in("trigger", [...triggers]);
  if (error) throw new Error(`cannot read what runs at this moment: ${error.message}`);
  return data ?? [];
}

/**
 * Every sequence of the workspace by id and name: what Messages names as sending a message ("VIP color clients · step 2",
 * contracts templateUseWords) beside its steps' places. Under the caller's row security.
 */
export async function listSequenceNames(db: Db, tenantId: TenantId): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from("sequences").select("id, name").eq("tenant_id", tenantId);
  if (error) throw new Error(`cannot read the sequences' names: ${error.message}`);
  return data ?? [];
}

/** A sequence's steps in their places, with what each sent in the last 30 days (00442 sequence_steps_of). */
export async function listSequenceSteps(db: Db, tenantId: TenantId, sequenceId: string): Promise<SequenceStepDto[]> {
  const { data, error } = await db.rpc("sequence_steps_of", { p_tenant_id: tenantId, p_sequence_id: sequenceId });
  if (error) throw new Error(`cannot read the sequence's steps: ${error.message}`);
  return readerRowsOf<SequenceStepDto>(data);
}
