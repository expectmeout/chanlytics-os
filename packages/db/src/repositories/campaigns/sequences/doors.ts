/** Sequences: doors. */

import type {
  SequencePlaceDto,
  SequencePlaceOfDto,
  SequenceHistoryDto,
  SequencePeopleDto,
} from "@chanlytics/contracts";
import type { Json } from "../../../database.types";
import { answer, type DoorResult } from "../reach-out/leads";
import { putBackOf, withListedWhyNot, withOneLeadsOpening, withOpenings, withPlaceWhyNot } from "../sequence-waiting";
import { type Db } from "./reads";

/** How many ids one `in` list carries: two hundred keeps the URL short (the run reader's own chunk). */
const REPLIES_IN_CHUNK = 200;

/**
 * The conversations in which a lead answered an email of these batches, as a sequence's History counts a lead's reply
 * (00442 sequence_batch_counts, leads_replied): a reading of a reply to the send, a person's or what its owner said, not
 * undone. Under the caller's row security; a failed read throws.
 */
export async function listLeadRepliesOfBatches(
  db: Db,
  tenantId: string,
  batchIds: readonly string[],
): Promise<string[]> {
  const out = new Set<string>();
  for (let index = 0; index < batchIds.length; index += REPLIES_IN_CHUNK) {
    const chunk = batchIds.slice(index, index + REPLIES_IN_CHUNK);
    const sends = await db
      .from("sequence_sends")
      .select("id")
      .eq("tenant_id", tenantId)
      .not("lead_id", "is", null)
      .in("batch_id", [...chunk]);
    if (sends.error) throw new Error(`cannot read the batches' emails: ${sends.error.message}`);
    const ids = (sends.data ?? []).map((s) => s.id);
    for (let count = 0; count < ids.length; count += REPLIES_IN_CHUNK) {
      const replies = await db
        .from("sequence_replies")
        .select("conversation_id")
        .eq("tenant_id", tenantId)
        .in("send_id", ids.slice(count, count + REPLIES_IN_CHUNK))
        .in("claim", ["person", "owner"])
        .is("undone_at", null);
      if (replies.error) throw new Error(`cannot read the replies: ${replies.error.message}`);
      for (const r of replies.data ?? []) out.add(r.conversation_id);
    }
  }
  return [...out];
}

/** Who is in a sequence, by where they stand (00442 sequence_people). */
export async function getSequencePeople(
  db: Db,
  params: { tenantId: string; sequenceId: string; limit?: number },
): Promise<SequencePeopleDto> {
  const { data, error } = await db.rpc("sequence_people", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    ...(params.limit ? { p_limit: params.limit } : {}),
  });
  if (error) throw new Error(`cannot read who is in the sequence: ${error.message}`);
  const result = (data ?? {}) as Partial<SequencePeopleDto>;
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return { counts: result.counts ?? {}, rows: await withOpenings(db, params.tenantId, rows) };
}

/** One lead's place in the sequence it stands in or last was in (00459), its opening and Put back; null in none. */
export async function findSequencePlace(db: Db, tenantId: string, leadId: string): Promise<SequencePlaceDto | null> {
  const { data, error } = await db.rpc("sequence_place", { p_tenant_id: tenantId, p_lead_id: leadId });
  if (error) throw new Error(`cannot read where the lead stands: ${error.message}`);
  const result = data as SequencePlaceDto | null;
  if (!result || !result.sequence || !result.place) return null;
  const place = { ...result, sends: Array.isArray(result.sends) ? result.sends : [] };
  const [row] = await withOneLeadsOpening(db, tenantId, await withPlaceWhyNot(db, tenantId, leadId, place));
  return { ...place, place: row ?? place.place, put_back: await putBackOf(db, tenantId, place) };
}

/** Many leads' places, one row a lead in a sequence (00459 sequence_places_of): Leads' cell and the person page. */
export async function listSequencePlaces(
  db: Db,
  tenantId: string,
  leadIds: readonly string[],
): Promise<SequencePlaceOfDto[]> {
  if (leadIds.length === 0) return [];
  const { data, error } = await db.rpc("sequence_places_of", { p_tenant_id: tenantId, p_lead_ids: [...leadIds] });
  if (error) throw new Error(`cannot read where the leads stand: ${error.message}`);
  const rows: unknown = data;
  return Array.isArray(rows) ? withListedWhyNot(db, tenantId, rows as SequencePlaceOfDto[]) : [];
}

/** What a sequence sent, a batch a row, newest first (00442 sequence_history). */
export async function getSequenceHistory(
  db: Db,
  params: { tenantId: string; sequenceId: string; before?: string | null; limit?: number },
): Promise<SequenceHistoryDto> {
  const { data, error } = await db.rpc("sequence_history", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    ...(params.before ? { p_before: params.before } : {}),
    ...(params.limit ? { p_limit: params.limit } : {}),
  });
  if (error) throw new Error(`cannot read what the sequence sent: ${error.message}`);
  const result = (data ?? {}) as Partial<SequenceHistoryDto>;
  return { batches: Array.isArray(result.batches) ? result.batches : [], more: result.more === true };
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
export interface DoorDecision {
  decision?: Json;
  via?: string | null;
  undoOf?: string | null;
}

export const decided = (d: DoorDecision) => ({
  ...(d.decision !== undefined ? { p_decision: d.decision } : {}),
  ...(d.via ? { p_via: d.via } : {}),
  ...(d.undoOf ? { p_undo_of: d.undoOf } : {}),
});

/** A customer's step after the first added at the end of its sequence, or changed (00442 sequence_step_save). */
export async function saveSequenceStep(
  db: Db,
  params: { tenantId: string; sequenceId: string; step: Json } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_step_save", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    p_step: params.step,
    ...decided(params),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/**
 * A message sent once, kept as a draft (00465 sequence_once_keep, decision 0065): a sequence that starts on a date, held
 * as a draft with New's {who, at, channels, step}; `id` keeps one already kept. It sends nothing.
 */
export async function keepOnceDraft(
  db: Db,
  params: { tenantId: string; id: string | null; name: string; once: Json } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_once_keep", {
    p_tenant_id: params.tenantId,
    p_name: params.name,
    p_once: params.once,
    ...(params.id ? { p_id: params.id } : {}),
    ...decided(params),
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
export async function getPeopleHandRun(
  db: Db,
  params: { tenantId: string; stepId: string; runId: string; day: string; items: PeopleHandItem[] },
): Promise<{ made: number; already: number }> {
  const { data, error } = await db.rpc("sequence_hand_run", {
    p_tenant_id: params.tenantId,
    p_step_id: params.stepId,
    p_run_id: params.runId,
    p_day: params.day,
    p_items: params.items,
  });
  if (error) throw new Error(`cannot write the call or note step's run: ${error.message}`);
  const item = (data ?? {}) as { made?: number; already?: number };
  return { made: item.made ?? 0, already: item.already ?? 0 };
}

/** A customer's step after the first taken away, with the steps after it (00442 sequence_step_remove). */
export async function removeSequenceStep(
  db: Db,
  params: { tenantId: string; stepId: string } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_step_remove", {
    p_tenant_id: params.tenantId,
    p_step_id: params.stepId,
    ...decided(params),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** A step given another message and the values it takes: at once, or waiting for WhatsApp (00442 sequence_step_words). */
export async function setSequenceStepWords(
  db: Db,
  params: { tenantId: string; stepId: string; templateId: string; params?: Json } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_step_words", {
    p_tenant_id: params.tenantId,
    p_step_id: params.stepId,
    p_template_id: params.templateId,
    ...(params.params !== undefined ? { p_params: params.params } : {}),
    ...decided(params),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** People taken out of a sequence by a member (00442 sequence_leave): only theirs in that sequence. */
export async function takeOutOfSequence(
  db: Db,
  params: {
    tenantId: string;
    sequenceId: string;
    enrollmentIds: readonly string[];
    /** Leads on its list that nothing has been planned for yet: they come off the list (00455). */
    leadIds?: readonly string[];
    why?: string;
  } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_leave", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    p_enrollment_ids: [...params.enrollmentIds],
    ...(params.leadIds && params.leadIds.length > 0 ? { p_lead_ids: [...params.leadIds] } : {}),
    ...(params.why ? { p_why: params.why } : {}),
    ...decided(params),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/**
 * A leave undone (00450 sequence_return): the places the leave named by `undoOf` ended, put back with their next step where
 * still out for its reason; the sends it skipped stay skipped.
 */
export async function putBackInSequence(
  db: Db,
  params: { tenantId: string; sequenceId: string } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_return", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    ...decided(params),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/**
 * A new customer's sequence made whole (00442 sequence_create, S4): its first step as start_playbook takes one, and the
 * steps after it, kept as a draft or started; the make_sequence decision rides in the write.
 */
export async function makeSequence(
  db: Db,
  params: { tenantId: string; first: Json; then: Json; start: boolean } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_create", {
    p_tenant_id: params.tenantId,
    p_first: params.first,
    p_then: params.then,
    p_start: params.start,
    ...decided(params),
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
  params: { tenantId: string; leadId: string; toRoot: string } & Omit<DoorDecision, "undoOf">,
): Promise<DoorResult<SequenceMoveAnswer>> {
  const { data, error } = await db.rpc("sequence_move", {
    p_tenant_id: params.tenantId,
    p_lead_id: params.leadId,
    p_to_root: params.toRoot,
    ...(params.decision !== undefined ? { p_decision: params.decision } : {}),
    ...(params.via ? { p_via: params.via } : {}),
  });
  return answer<SequenceMoveAnswer>(data, error);
}
