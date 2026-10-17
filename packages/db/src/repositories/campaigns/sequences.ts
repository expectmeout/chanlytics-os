/**
 * Sequences (decision 0060): what the loop reads of someone in a sequence, the door that takes them out, and what the
 * Sequences page and Ask read and press (00442). The loop's two are the service role's (the hourly sweep's run of a
 * customer's step after the first); the readers run on the member's own session, where row security decides, and the
 * doors on it too, each writing its decision in its own transaction. A read that fails throws; a door answers its
 * refusal with its SQLSTATE and its own words (DoorResult).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_CHANNELS, isLeadList } from "@chanlytics/contracts";
import type {
  ReachOutFedBy,
  SequenceHistoryDto,
  SequenceOneOffDto,
  SequencePeopleDto,
  SequenceRowDto,
  SequenceStepDto,
} from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";
import { answer, type DoorResult } from "./reach-out-leads";

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

/** The workspace's sequences, newest first, or the one named (00442 sequence_overview). */
export async function sequenceOverview(db: Db, tenantId: string, sequenceId?: string): Promise<SequenceRowDto[]> {
  const { data, error } = await db.rpc("sequence_overview", {
    p_tenant_id: tenantId,
    ...(sequenceId ? { p_sequence_id: sequenceId } : {}),
  });
  if (error) throw new Error(`cannot read the sequences: ${error.message}`);
  return readerRowsOf<SequenceRowDto>(data);
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
 * The business day a step last ran (`sequence_steps.last_run_for`, written by the run's record): when its next run goes
 * (contracts sequenceNextOf). Null where it never ran, or names no step of this workspace. Under the caller's row security.
 */
export async function stepLastRunFor(db: Db, tenantId: string, stepId: string): Promise<string | null> {
  const { data, error } = await db
    .from("sequence_steps")
    .select("last_run_for")
    .eq("tenant_id", tenantId)
    .eq("id", stepId)
    .maybeSingle();
  if (error) throw new Error(`cannot read when the step last ran: ${error.message}`);
  return data?.last_run_for ?? null;
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
  return { counts: got.counts ?? {}, rows: Array.isArray(got.rows) ? got.rows : [] };
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
