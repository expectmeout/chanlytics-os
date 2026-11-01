/**
 * Sequences (decision 0060): what the loop reads of someone in a sequence, the door that takes them out, and what the
 * Sequences page and Ask read and press (00442). The loop's two are the service role's (the hourly sweep's run of a
 * customer's step after the first); the readers run on the member's own session, where row security decides, and the
 * doors on it too, each writing its decision in its own transaction. A read that fails throws; a door answers its
 * refusal with its SQLSTATE and its own words (DoorResult).
 */
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
  SequencePlaceDto,
  SequencePlaceOfDto,
  SequenceHistoryDto,
  SequenceOneOffDto,
  SequencePeopleDto,
  SequenceRowDto,
  SequenceStepDto,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";
import { readAllRows } from "../../paged";
import { answer, type DoorResult } from "./reach-out-leads";
import { putBackOf, withOpenings, withReadyCounts } from "./sequence-waiting";

type Db = SupabaseClient<Database>;

/** Someone a customer's step after the first is due to (00441 sequence_follow_ups_due). */
interface FollowUpDueRow {
  enrollment_id: string;
  contact_id: string;
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
  p: { tenantId: string; enrollmentIds: readonly string[]; why: string; by?: string | null },
): Promise<number> {
  if (p.enrollmentIds.length === 0) return 0;
  const { data, error } = await db.rpc("sequence_enrollments_leave", {
    p_tenant_id: p.tenantId,
    p_ids: [...p.enrollmentIds],
    p_why: p.why,
    ...(p.by ? { p_by: p.by } : {}),
  });
  if (error) throw new Error(`cannot take them out of the sequence: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * Leads a later step passes over (00455 sequence_leads_leave): each one's place in the sequence that still stands ends
 * with its why, and a send of theirs not yet gone is skipped. Service role only. How many left.
 */
export async function leadsLeaveSequence(
  db: Db,
  p: { tenantId: string; sequenceId: string; leads: readonly { lead_id: string; why: string }[] },
): Promise<number> {
  if (p.leads.length === 0) return 0;
  const { data, error } = await db.rpc("sequence_leads_leave", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    p_leads: p.leads.map((l) => ({ lead_id: l.lead_id, why: l.why })),
  });
  if (error) throw new Error(`cannot pass over the step's leads: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * Who a customer's sequence has reached, by contact id: everyone it holds now, or sent anything to (an enrollment that is
 * in, or one with a send that went). A sequence on a list goes once to each person (the loop review's item 6), so its run
 * leaves them out. Every page read; a read that fails throws: unread is not nobody.
 */
export async function sequenceReached(db: Db, tenantId: string, sequenceId: string): Promise<Set<string>> {
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
export async function sequencesOfPerson(
  db: Db,
  tenantId: string,
  contactId: string,
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
export async function sequenceRow(
  db: Db,
  id: string,
): Promise<{ id: string; tenant_id: string; name: string; starts: string; state: string } | null> {
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

/** A reader's answer as its rows: the readers answer JSON in the shape contracts names (sequence-dto.ts); none else. */
function readerRowsOf<T>(data: unknown): T[] {
  return Array.isArray(data) ? data.filter((r): r is T => typeof r === "object" && r !== null) : [];
}

/**
 * How each named sequence's batches are decided (decision 0064, `sequences.mode`), by its id: what a step's run and the
 * pages that list steps read beside the step's own row. A sequence with no mode this build knows (a one-off has none)
 * asks, as contracts batchModeOf reads one. A read that fails throws.
 */
export async function sequenceModesOf(
  db: Db,
  tenantId: string,
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
export async function sequenceEvidence(
  db: Db,
  tenantId: string,
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
export async function sequenceOverview(db: Db, tenantId: string, sequenceId?: string): Promise<SequenceRowDto[]> {
  const { data, error } = await db.rpc("sequence_overview", {
    p_tenant_id: tenantId,
    ...(sequenceId ? { p_sequence_id: sequenceId } : {}),
  });
  if (error) throw new Error(`cannot read the sequences: ${error.message}`);
  return withReadyCounts(db, tenantId, readerRowsOf<SequenceRowDto>(data));
}

/**
 * The sequence a part of it belongs to, by the part's id: a batch's (a run's address, broadcasts/run:<id>) or a step's.
 * An address that names a part opens its sequence, which then names its own. Null where no part of this workspace has
 * the id. Under the caller's row security, as the readers are.
 */
export async function sequenceOfPart(db: Db, tenantId: string, id: string): Promise<string | null> {
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
  tenantId: string,
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
async function lastRunSkipped(db: Db, tenantId: string, stepId: string): Promise<string | null> {
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
  const said = data?.data;
  return said && typeof said === "object" && !Array.isArray(said) && typeof said.skipped === "string"
    ? said.skipped
    : null;
}

/** The states of a lead's send that say its email was written: reach_out_remove's own, besides one skipped once drafted. */
const WRITTEN_SEND_STATES = ["claimed", "queued", "sent", "failed", "drafted"];

/**
 * What a sequence has done that its head's acts turn on (0072), under the caller's row security. `ran`: whether it ever
 * made a batch, the question its first step's going asks (sequence_steps_first_gone ends one that did and takes away one
 * that never did) and sequence_discard asks (taking anyone in needs a batch). `wrote`: whether an email of it to a lead
 * was ever written, the question reach_out_remove asks before it lets a sequence to leads go; never, of any other.
 * Held to the three on a replayed stack (sequences/sequence-doors.db.test.mjs).
 */
async function sequenceHistoryFacts(
  db: Db,
  tenantId: string,
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
export async function sequenceRecordFacts(
  db: Db,
  tenantId: string,
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
export async function oneOffMessageOf(db: Db, tenantId: string, batchId: string): Promise<SequenceOneOffDto | null> {
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
export async function leadsFedBy(db: Db, tenantId: string, searchId: string): Promise<ReachOutFedBy> {
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
export async function runningStepsOn(
  db: Db,
  tenantId: string,
  triggers: readonly string[],
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
export async function sequenceNamesOf(db: Db, tenantId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from("sequences").select("id, name").eq("tenant_id", tenantId);
  if (error) throw new Error(`cannot read the sequences' names: ${error.message}`);
  return data ?? [];
}

/** A sequence's steps in their places, with what each sent in the last 30 days (00442 sequence_steps_of). */
export async function sequenceStepsOf(db: Db, tenantId: string, sequenceId: string): Promise<SequenceStepDto[]> {
  const { data, error } = await db.rpc("sequence_steps_of", { p_tenant_id: tenantId, p_sequence_id: sequenceId });
  if (error) throw new Error(`cannot read the sequence's steps: ${error.message}`);
  return readerRowsOf<SequenceStepDto>(data);
}

/** How many ids one `in` list carries: two hundred keeps the URL short (the run reader's own chunk). */
const REPLIES_IN_CHUNK = 200;

/**
 * The conversations in which a lead answered an email of these batches, as a sequence's History counts a lead's reply
 * (00442 sequence_batch_counts, leads_replied): a reading of a reply to the send, a person's or what its owner said, not
 * undone. Under the caller's row security; a failed read throws.
 */
export async function leadRepliesOfBatches(db: Db, tenantId: string, batchIds: readonly string[]): Promise<string[]> {
  const out = new Set<string>();
  for (let i = 0; i < batchIds.length; i += REPLIES_IN_CHUNK) {
    const chunk = batchIds.slice(i, i + REPLIES_IN_CHUNK);
    const sends = await db
      .from("sequence_sends")
      .select("id")
      .eq("tenant_id", tenantId)
      .not("lead_id", "is", null)
      .in("batch_id", [...chunk]);
    if (sends.error) throw new Error(`cannot read the batches' emails: ${sends.error.message}`);
    const ids = (sends.data ?? []).map((s) => s.id);
    for (let j = 0; j < ids.length; j += REPLIES_IN_CHUNK) {
      const replies = await db
        .from("sequence_replies")
        .select("conversation_id")
        .eq("tenant_id", tenantId)
        .in("send_id", ids.slice(j, j + REPLIES_IN_CHUNK))
        .in("claim", ["person", "owner"])
        .is("undone_at", null);
      if (replies.error) throw new Error(`cannot read the replies: ${replies.error.message}`);
      for (const r of replies.data ?? []) out.add(r.conversation_id);
    }
  }
  return [...out];
}

/** Who is in a sequence, by where they stand (00442 sequence_people). */
export async function sequencePeopleOf(
  db: Db,
  p: { tenantId: string; sequenceId: string; limit?: number },
): Promise<SequencePeopleDto> {
  const { data, error } = await db.rpc("sequence_people", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...(p.limit ? { p_limit: p.limit } : {}),
  });
  if (error) throw new Error(`cannot read who is in the sequence: ${error.message}`);
  const got = (data ?? {}) as Partial<SequencePeopleDto>;
  const rows = Array.isArray(got.rows) ? got.rows : [];
  return { counts: got.counts ?? {}, rows: await withOpenings(db, p.tenantId, rows) };
}

/** One lead's place in the sequence it stands in or last was in (00459), its opening and Put back; null in none. */
export async function sequencePlaceOf(db: Db, tenantId: string, leadId: string): Promise<SequencePlaceDto | null> {
  const { data, error } = await db.rpc("sequence_place", { p_tenant_id: tenantId, p_lead_id: leadId });
  if (error) throw new Error(`cannot read where the lead stands: ${error.message}`);
  const got = data as SequencePlaceDto | null;
  if (!got || !got.sequence || !got.place) return null;
  const place = { ...got, sends: Array.isArray(got.sends) ? got.sends : [] };
  const [row] = await withOpenings(db, tenantId, [place.place]);
  return { ...place, place: row ?? place.place, put_back: await putBackOf(db, tenantId, place) };
}

/** Many leads' places, one row a lead in a sequence (00459 sequence_places_of): Leads' cell and the person page. */
export async function sequencePlacesOf(
  db: Db,
  tenantId: string,
  leadIds: readonly string[],
): Promise<SequencePlaceOfDto[]> {
  if (leadIds.length === 0) return [];
  const { data, error } = await db.rpc("sequence_places_of", { p_tenant_id: tenantId, p_lead_ids: [...leadIds] });
  if (error) throw new Error(`cannot read where the leads stand: ${error.message}`);
  const rows: unknown = data;
  return Array.isArray(rows) ? (rows as SequencePlaceOfDto[]) : [];
}

/** What a sequence sent, a batch a row, newest first (00442 sequence_history). */
export async function sequenceHistoryOf(
  db: Db,
  p: { tenantId: string; sequenceId: string; before?: string | null; limit?: number },
): Promise<SequenceHistoryDto> {
  const { data, error } = await db.rpc("sequence_history", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...(p.before ? { p_before: p.before } : {}),
    ...(p.limit ? { p_limit: p.limit } : {}),
  });
  if (error) throw new Error(`cannot read what the sequence sent: ${error.message}`);
  const got = (data ?? {}) as Partial<SequenceHistoryDto>;
  return { batches: Array.isArray(got.batches) ? got.batches : [], more: got.more === true };
}

/* ------------------------------------------------------------------------------------ the doors (00442) -- */

/** What a member's door on a sequence answers: the row it wrote, and its decision's id. */
export interface SequenceDoorAnswer {
  id?: string;
  place?: number;
  was?: Json;
  waits?: boolean;
  left?: number;
  /** A leave undone (00450 sequence_return): how many came back, and how many sends the leave skipped stay out. */
  back?: number;
  sends_out?: number;
  removed?: number;
  /** A new sequence's state (sequence_create): 'draft' or 'on'; and how many steps it was made with, or went with. */
  state?: string;
  steps?: number;
  decision_id?: string;
  undo_dropped?: boolean;
}

/** The decision a door writes beside its change: what the route names, how it came, and the line it undoes. */
interface DoorDecision {
  decision?: Json;
  via?: string | null;
  undoOf?: string | null;
}

const decided = (d: DoorDecision) => ({
  ...(d.decision !== undefined ? { p_decision: d.decision } : {}),
  ...(d.via ? { p_via: d.via } : {}),
  ...(d.undoOf ? { p_undo_of: d.undoOf } : {}),
});

/** A customer's step after the first added at the end of its sequence, or changed (00442 sequence_step_save). */
export async function saveSequenceStep(
  db: Db,
  p: { tenantId: string; sequenceId: string; step: Json } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_step_save", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    p_step: p.step,
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/**
 * A message sent once, kept as a draft (00465 sequence_once_keep, decision 0065): a sequence that starts on a date, held
 * as a draft with New's {who, at, channels, step}; `id` keeps one already kept. It sends nothing.
 */
export async function keepOnceDraft(
  db: Db,
  p: { tenantId: string; id: string | null; name: string; once: Json } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_once_keep", {
    p_tenant_id: p.tenantId,
    p_name: p.name,
    p_once: p.once,
    ...(p.id ? { p_id: p.id } : {}),
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** One person a customer's call or note step hands over, as the door takes it (00465 sequence_hand_run). */
export type PeopleHandItem = {
  send_id: string;
  contact_id: string;
  words: string;
  source_id: string;
};

/**
 * A customer's call or note step's run for its day, written whole (00465 sequence_hand_run): the run, a handed send for
 * each person, each person's dated step for the team, and their place moved past the step. How many were made, and how
 * many the run had already.
 */
export async function peopleHandRun(
  db: Db,
  p: { tenantId: string; stepId: string; runId: string; day: string; items: PeopleHandItem[] },
): Promise<{ made: number; already: number }> {
  const { data, error } = await db.rpc("sequence_hand_run", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_run_id: p.runId,
    p_day: p.day,
    p_items: p.items,
  });
  if (error) throw new Error(`cannot write the call or note step's run: ${error.message}`);
  const r = (data ?? {}) as { made?: number; already?: number };
  return { made: r.made ?? 0, already: r.already ?? 0 };
}

/** A customer's step after the first taken away, with the steps after it (00442 sequence_step_remove). */
export async function removeSequenceStep(
  db: Db,
  p: { tenantId: string; stepId: string } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_step_remove", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** A step given another message and the values it takes: at once, or waiting for WhatsApp (00442 sequence_step_words). */
export async function setSequenceStepWords(
  db: Db,
  p: { tenantId: string; stepId: string; templateId: string; params?: Json } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_step_words", {
    p_tenant_id: p.tenantId,
    p_step_id: p.stepId,
    p_template_id: p.templateId,
    ...(p.params !== undefined ? { p_params: p.params } : {}),
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** People taken out of a sequence by a member (00442 sequence_leave): only theirs in that sequence. */
export async function takeOutOfSequence(
  db: Db,
  p: {
    tenantId: string;
    sequenceId: string;
    enrollmentIds: readonly string[];
    /** Leads on its list that nothing has been planned for yet: they come off the list (00455). */
    leadIds?: readonly string[];
    why?: string;
  } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_leave", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    p_enrollment_ids: [...p.enrollmentIds],
    ...(p.leadIds && p.leadIds.length > 0 ? { p_lead_ids: [...p.leadIds] } : {}),
    ...(p.why ? { p_why: p.why } : {}),
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/**
 * A leave undone (00450 sequence_return): the places the leave named by `undoOf` ended, put back with their next step where
 * still out for its reason; the sends it skipped stay skipped.
 */
export async function putBackInSequence(
  db: Db,
  p: { tenantId: string; sequenceId: string } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_return", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/**
 * A new customer's sequence made whole (00442 sequence_create, S4): its first step as start_playbook takes one, and the
 * steps after it, kept as a draft or started; the make_sequence decision rides in the write.
 */
export async function makeSequence(
  db: Db,
  p: { tenantId: string; first: Json; then: Json; start: boolean } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_create", {
    p_tenant_id: p.tenantId,
    p_first: p.first,
    p_then: p.then,
    p_start: p.start,
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** What a move answers (00459 sequence_move): the sequence they left and the one they joined, with the leave's decision. */
export interface SequenceMoveAnswer {
  from: string;
  to: string;
  decision_id: string | null;
  op_id: string | null;
}

/**
 * A lead nothing was sent to, out of the sequence it stands in and into another (00459 sequence_move): its place there
 * leaves as moved, its first send skipped so, and the add door takes it here. One written to is refused (23505).
 */
export async function moveToSequence(
  db: Db,
  p: { tenantId: string; leadId: string; toRoot: string } & Omit<DoorDecision, "undoOf">,
): Promise<DoorResult<SequenceMoveAnswer>> {
  const { data, error } = await db.rpc("sequence_move", {
    p_tenant_id: p.tenantId,
    p_lead_id: p.leadId,
    p_to_root: p.toRoot,
    ...(p.decision !== undefined ? { p_decision: p.decision } : {}),
    ...(p.via ? { p_via: p.via } : {}),
  });
  return answer<SequenceMoveAnswer>(data, error);
}

/** The search a sequence to leads draws its new ready leads from, or none (00459 reach_out_source_set: auto-add). */
export async function setChainSource(
  db: Db,
  p: { tenantId: string; rootId: string; searchId: string | null },
): Promise<DoorResult<{ root_id: string; source_search_id: string | null }>> {
  const { data, error } = await db.rpc("reach_out_source_set", {
    p_tenant_id: p.tenantId,
    p_root_id: p.rootId,
    ...(p.searchId ? { p_search_id: p.searchId } : {}),
  });
  return answer<{ root_id: string; source_search_id: string | null }>(data, error);
}

/** The sequence a search's Add goes to, or none (00459 lead_search_aim): kept on the search, a member's. */
export async function aimSearchAt(
  db: Db,
  p: { tenantId: string; searchId: string; sequenceId: string | null },
): Promise<DoorResult<{ search_id: string; adds_to: string | null }>> {
  const { data, error } = await db.rpc("lead_search_aim", {
    p_tenant_id: p.tenantId,
    p_search_id: p.searchId,
    ...(p.sequenceId ? { p_sequence_id: p.sequenceId } : {}),
  });
  return answer<{ search_id: string; adds_to: string | null }>(data, error);
}

/** A sequence that never sent taken away whole (00442 sequence_discard): a draft let go, or a new one undone. */
export async function discardSequence(
  db: Db,
  p: { tenantId: string; sequenceId: string } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_discard", {
    p_tenant_id: p.tenantId,
    p_sequence_id: p.sequenceId,
    ...decided(p),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** A batch canceled by a member, only from the state it was read in (00442 sequence_batch_cancel). True when it moved. */
export async function cancelSequenceBatch(
  db: Db,
  p: { tenantId: string; batchId: string; from: string },
): Promise<boolean> {
  const { data, error } = await db.rpc("sequence_batch_cancel", {
    p_tenant_id: p.tenantId,
    p_batch_id: p.batchId,
    p_from: p.from,
  });
  if (error) throw new Error(`cannot cancel the batch: ${error.message}`);
  return data === true;
}
