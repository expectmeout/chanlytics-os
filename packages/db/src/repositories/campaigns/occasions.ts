/**
 * The occasions a sequence owes a person its first step for (decision 0119, 00598), as the database holds them: a visit
 * in two hours, a visit marked missed, the booking link sent and nothing booked. Written and settled with the service role
 * by the edge (the subscriber that enrols, the job that runs what is due); read under a member's session by the pages
 * that say who is next. A read or a write that fails throws, so whatever asked tries again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DbFailure,
  isOccasionTrigger,
  isOneOf,
  recordKeyOf,
  type ContactId,
  type OccasionOutcome,
  type SchemaSet,
  type SequenceRowDto,
  type TenantId,
} from "@chanlytics/contracts";
import type { Database } from "../../types";

type Db = SupabaseClient<Database>;
type Trigger = SchemaSet<"sequence_steps.trigger">;
type StepRow = Database["public"]["Tables"]["sequence_steps"]["Row"];

/** What enrolling came to (sequence_occasion_enrol): a new row, one that stood, one too many at a time, or nobody. */
export type OccasionEnrolled = "enrolled" | "already" | "busy" | "gone";
const ENROLLED = ["enrolled", "already", "busy", "gone"] as const;

/** A sequence on one of an occasion's moments, as the enrolment reads it: its first step's moment and hour. */
export interface OccasionStep {
  sequenceId: string;
  trigger: Trigger;
  runHour: number;
  /** The sequence's name, its mode, and when its first step's words last had an OK: how its next batch goes (batchModeOf). */
  name: string;
  mode: string | null;
  wordsOkAt: string | null;
}

/**
 * The sequences that are on and whose first step runs on one of these moments: who an occasion enrols for. A sequence's
 * first step is the row that shares its id (00440).
 */
export async function listOccasionSteps(
  db: Db,
  tenantId: TenantId,
  triggers: readonly Trigger[],
): Promise<OccasionStep[]> {
  if (triggers.length === 0) return [];
  const steps = await db
    .from("sequence_steps")
    .select("id, sequence_id, trigger, run_hour, words_ok_at")
    .eq("tenant_id", tenantId)
    .eq("state", "running")
    .in("trigger", [...triggers]);
  if (steps.error) throw new DbFailure(steps.error, "occasions: the steps on these moments");
  const firsts = steps.data.filter((s) => s.id === s.sequence_id);
  if (firsts.length === 0) return [];
  const on = await db
    .from("sequences")
    .select("id, name, mode")
    .eq("tenant_id", tenantId)
    .eq("state", "on")
    .in(
      "id",
      firsts.map((s) => s.sequence_id),
    );
  if (on.error) throw new DbFailure(on.error, "occasions: which of their sequences are on");
  const running = new Map(on.data.map((q) => [q.id, q]));
  return firsts.flatMap((s) => {
    const sequence = running.get(s.sequence_id);
    if (!sequence) return [];
    return [
      {
        sequenceId: s.sequence_id,
        trigger: s.trigger,
        runHour: s.run_hour,
        name: sequence.name,
        mode: sequence.mode,
        wordsOkAt: s.words_ok_at,
      },
    ];
  });
}

/**
 * A person enrolled in a sequence for an occasion, due at its own time, once for good (sequence_occasion_enrol).
 * `replaces`: what a moved visit's older occasions start with, which leave. `single`: none while another of theirs
 * waits here or they are still in the sequence. `restDays`: none while another of theirs here began inside that many days.
 */
export async function enrolOccasion(
  db: Db,
  params: {
    tenantId: TenantId;
    sequenceId: string;
    contactId: ContactId;
    occasion: string;
    dueAt: Date;
    single: boolean;
    replaces?: string | null;
    restDays?: number;
  },
): Promise<OccasionEnrolled> {
  const { data, error } = await db.rpc("sequence_occasion_enrol", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    p_contact_id: params.contactId,
    p_occasion: params.occasion,
    p_due_at: params.dueAt.toISOString(),
    p_single: params.single,
    ...(params.replaces ? { p_replaces: params.replaces } : {}),
    ...(params.restDays ? { p_rest_days: params.restDays } : {}),
  });
  if (error) throw new DbFailure(error, "occasions: cannot enrol them");
  return isOneOf(ENROLLED, data) ? data : "gone";
}

/**
 * The workspace's waiting occasions whose key starts with `startsWith` leave with why: how many
 * (sequence_occasions_leave). `except`: the one occasion that stays, where all but one leave.
 */
export async function leaveOccasions(
  db: Db,
  params: { tenantId: TenantId; startsWith: string; why: string; except?: string },
): Promise<number> {
  const { data, error } = await db.rpc("sequence_occasions_leave", {
    p_tenant_id: params.tenantId,
    p_starts_with: params.startsWith,
    p_why: params.why,
    ...(params.except ? { p_except: params.except } : {}),
  });
  if (error) throw new DbFailure(error, "occasions: cannot take them out");
  return typeof data === "number" ? data : 0;
}

/** An occasion whose time has come, with its sequence's first step as a run reads one (sequence_occasions_due). */
export interface DueOccasion {
  id: string;
  sequenceId: string;
  contactId: ContactId;
  occasion: string;
  dueAt: string;
  /** When it began: the moment its row was made, which is when the thing happened. */
  createdAt: string;
  /**
   * Its sequence's first step as its row reads, the sequence's mode riding on it (`mode`), as the due steps carry theirs
   * (jobs/sweeps.ts DueStep); null where the step is gone.
   */
  step: StepRow | null;
  /** Whether its step runs now: the sequence on, the step running, the workspace not paused. */
  runs: boolean;
}

/**
 * A workspace's occasions due at `now`, soonest first, at most `limit`: what its job settles, each run or left. One whose
 * step does not run now is answered too (`runs`), so no row waits on a sequence that is off.
 */
export async function listOccasionsDue(db: Db, tenantId: TenantId, now: Date, limit: number): Promise<DueOccasion[]> {
  const { data, error } = await db.rpc("sequence_occasions_due", {
    p_tenant_id: tenantId,
    p_at: now.toISOString(),
    p_limit: limit,
  });
  if (error) throw new DbFailure(error, "occasions: what is due");
  return data.map((r) => ({
    id: r.id,
    sequenceId: r.sequence_id,
    contactId: r.contact_id,
    occasion: r.occasion,
    dueAt: r.due_at,
    createdAt: r.created_at,
    // The row as to_jsonb wrote it: the table's own shape, every column a JSON value.
    step: r.step as StepRow | null,
    runs: r.runs,
  }));
}

/**
 * What became of an occasion, written once: its batch was made, or it left with why. Only while it still waits: true
 * when this call settled it (a row settled since it was read is left as it is).
 */
export async function settleOccasion(
  db: Db,
  params: { tenantId: TenantId; id: string; outcome: OccasionOutcome; now: Date },
): Promise<boolean> {
  const { outcome } = params;
  const { data, error } = await db
    .from("sequence_occasions")
    .update(
      outcome.state === "ran"
        ? { state: "ran", batch_id: outcome.batchId, settled_at: params.now.toISOString() }
        : { state: "left", why: outcome.why.slice(0, 60), settled_at: params.now.toISOString() },
    )
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("state", "waiting")
    .select("id");
  if (error) throw new DbFailure(error, "occasions: cannot say what became of it");
  return data.length > 0;
}

/**
 * An occasion's step put off until `until`, while it still waits: one a run could not make this minute. Its time
 * (`due_at`) stays where it was, so how late it is can still be told; only when it is next tried moves.
 */
export async function deferOccasion(db: Db, params: { tenantId: TenantId; id: string; until: Date }): Promise<void> {
  const { error } = await db
    .from("sequence_occasions")
    .update({ try_at: params.until.toISOString() })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id)
    .eq("state", "waiting");
  if (error) throw new DbFailure(error, "occasions: cannot put it off");
}

/** An appointment as the record holds it now, for the occasion that names it; null where the row is gone. */
export interface OccasionAppointment {
  id: string;
  contactId: ContactId | null;
  startsAt: string;
  status: SchemaSet<"appointments.status">;
  vanished: boolean;
  title: string | null;
  allDay: boolean;
  /**
   * What a send asks its row again by (contracts appointmentHolds): a calendar event's own key, which the feed is asked by
   * too, else the row's id behind the record's prefix (recordKeyOf).
   */
  key: string;
}

export async function findOccasionAppointment(
  db: Db,
  tenantId: TenantId,
  appointmentId: string,
): Promise<OccasionAppointment | null> {
  const { data, error } = await db
    .from("appointments")
    .select("id, contact_id, starts_at, status, vanished_at, title, service, all_day, source, external_id")
    .eq("tenant_id", tenantId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "occasions: the appointment");
  if (!data) return null;
  return {
    id: data.id,
    contactId: data.contact_id,
    startsAt: data.starts_at,
    status: data.status,
    vanished: data.vanished_at !== null,
    // What the visit is for, as its words say it: the service where the record names one, else the event's title.
    title: data.service ?? data.title,
    allDay: data.all_day,
    key: data.source === "calendar_feed" && data.external_id ? data.external_id : recordKeyOf(data.id),
  };
}

/**
 * Whether a person has booked: another visit of theirs that stands and has not begun (`ahead`), and an appointment made
 * since a moment that was not cancelled (`since`). What an occasion's step asks before it goes (contracts occasionGone).
 */
export async function findBookedSince(
  db: Db,
  tenantId: TenantId,
  who: { contactId: ContactId; since: Date; now: Date; apartFrom: string | null },
): Promise<{ ahead: boolean; since: boolean }> {
  const ahead = db
    .from("appointments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("contact_id", who.contactId)
    .eq("status", "booked")
    .is("vanished_at", null)
    .gt("starts_at", who.now.toISOString())
    .limit(2);
  const since = db
    .from("appointments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("contact_id", who.contactId)
    .neq("status", "cancelled")
    .is("vanished_at", null)
    .gt("created_at", who.since.toISOString())
    .limit(2);
  const [a, s] = await Promise.all([ahead, since]);
  if (a.error) throw new DbFailure(a.error, "occasions: whether they are booked ahead");
  if (s.error) throw new DbFailure(s.error, "occasions: whether they booked since");
  const other = (rows: readonly { id: string }[]) => rows.some((r) => r.id !== who.apartFrom);
  return { ahead: other(a.data), since: other(s.data) };
}

/**
 * Who a message went to and when it left: the person a booking link's event is about. Null for one no person holds.
 * `campaign`: the message is a campaign's own (a template sent, the system's words, or a send of a sequence's batch
 * names it), not the receptionist or a member answering someone on their thread.
 */
export async function findMessageSentTo(
  db: Db,
  tenantId: TenantId,
  messageId: string,
): Promise<{ contactId: ContactId; at: string; campaign: boolean } | null> {
  const [message, send] = await Promise.all([
    db
      .from("messages")
      .select("contact_id, created_at, channel_ts, type, sender")
      .eq("tenant_id", tenantId)
      .eq("id", messageId)
      .maybeSingle(),
    db.from("sequence_sends").select("id").eq("tenant_id", tenantId).eq("message_id", messageId).limit(1),
  ]);
  if (message.error) throw new DbFailure(message.error, "occasions: the message that carried the link");
  if (send.error) throw new DbFailure(send.error, "occasions: whether a sequence sent the message");
  const data = message.data;
  if (!data?.contact_id) return null;
  return {
    contactId: data.contact_id,
    at: data.channel_ts ?? data.created_at,
    campaign: send.data.length > 0 || data.type === "template" || data.sender === "system",
  };
}

/** The batch of this step that still waits for its owner, or null: while its words are new, the next person waits behind it. */
export async function findWaitingBatchOf(db: Db, tenantId: TenantId, stepId: string): Promise<string | null> {
  const { data, error } = await db
    .from("sequence_batches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("step_id", stepId)
    .eq("state", "pending_approval")
    .limit(1);
  if (error) throw new DbFailure(error, "occasions: whether a batch of the step waits");
  return data[0]?.id ?? null;
}

/**
 * Each sequence an occasion starts, with who it reaches next (`coming`, decision 0119): when the first person waiting is
 * due their step, and how many wait. One read a sequence, of the few a workspace has on these moments; every other row is
 * answered as it came. Under the caller's row security.
 */
export async function withComing(db: Db, tenantId: TenantId, rows: SequenceRowDto[]): Promise<SequenceRowDto[]> {
  const ids = rows.filter((row) => isOccasionTrigger(row.first?.trigger)).map((row) => row.id);
  if (ids.length === 0) return rows;
  const coming = new Map<string, { at: string; people: number } | null>();
  await Promise.all(
    ids.map(async (id) => {
      const { data, count, error } = await db
        .from("sequence_occasions")
        .select("due_at", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("sequence_id", id)
        .eq("state", "waiting")
        .order("due_at", { ascending: true })
        .limit(1);
      if (error) throw new DbFailure(error, "occasions: who a sequence reaches next");
      const first = data[0];
      coming.set(id, first ? { at: first.due_at, people: count ?? data.length } : null);
    }),
  );
  return rows.map((row) => (coming.has(row.id) ? { ...row, coming: coming.get(row.id) ?? null } : row));
}

/** An occasion still to come, as a page says it: whose, in which sequence, and when its step goes. */
export interface WaitingOccasion {
  sequenceId: string;
  contactId: ContactId;
  occasion: string;
  dueAt: string;
}

/**
 * The occasions that wait, soonest first: one person's (their page says what is next for them), or every one of the
 * workspace's up to `limit` (Sequences says who is next in each). Under the caller's row security.
 */
export async function listWaitingOccasions(
  db: Db,
  tenantId: TenantId,
  of: { contactId?: ContactId; limit: number },
): Promise<WaitingOccasion[]> {
  let read = db
    .from("sequence_occasions")
    .select("sequence_id, contact_id, occasion, due_at")
    .eq("tenant_id", tenantId)
    .eq("state", "waiting");
  if (of.contactId) read = read.eq("contact_id", of.contactId);
  const { data, error } = await read.order("due_at", { ascending: true }).limit(of.limit);
  // A database 00598 has not reached yet holds no occasion: nothing waits, and a person's page still reads (either
  // order with the build).
  if (error && (error.code === "PGRST205" || error.code === "42P01")) return [];
  if (error) throw new DbFailure(error, "occasions: what waits");
  return data.map((r) => ({
    sequenceId: r.sequence_id,
    contactId: r.contact_id,
    occasion: r.occasion,
    dueAt: r.due_at,
  }));
}
