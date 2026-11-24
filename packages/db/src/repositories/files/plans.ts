/**
 * A week of posts (00706; the content loop PRD's 5.3, 8.4 and 10.2): the owner's ask for a plan, the week approved in one
 * press and a slot set (each a door on the member's own session, which asks the settings permission itself); what the
 * plan job reads and writes under the service role; and the week as a page and AI read it.
 */
import {
  DbFailure,
  POST_HELD_WHYS,
  POST_KINDS,
  POST_PLACES,
  PLAN_STATUSES,
  SLOT_STATES,
  isOneOf,
  nonBlankOrNull,
  pieceIntentOf,
  recordOrEmpty,
  slotWordsOf,
  type WeekPlanDto,
  type FootageAsk,
  type PlanSlotDto,
  type ScorePart,
  type SlotHeldWhy,
  type SlotScore,
  type TenantId,
} from "@chanlytics/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../types";

type Db = SupabaseClient<Database>;
type PlanRow = Database["public"]["Tables"]["content_plans"]["Row"];
type SlotRow = Database["public"]["Tables"]["plan_slots"]["Row"];

const PLAN_COLUMNS =
  "id, tenant_id, week_of, status, fewer, ready_at, approved_at, approved_by, approval_id, asked_by, goes_at, stopped_at, stopped_by, edited";
const SLOT_COLUMNS =
  "id, creative, place, kind, at, state, title, reason, file_id, piece_id, post_id, intent, words, blocked_why, blocked_reason, ask, score, approval_id, prepared";

/** What the owner's ask came to: a week drafting, or the week is approved already and stays as it is. */
export interface PlanAsked {
  fate: "drafting" | "approved";
  planId: string | null;
}

/** "Plan the week" (content_plan_ask), as the member: the week drafting, with its job. */
export async function askForPlan(db: Db, tenantId: TenantId, weekOf: string): Promise<PlanAsked> {
  const { data, error } = await db.rpc("content_plan_ask", { p_tenant_id: tenantId, p_week_of: weekOf });
  if (error) throw new DbFailure(error, "content plan ask");
  const answer = recordOrEmpty(data);
  return {
    fate: answer.fate === "approved" ? "approved" : "drafting",
    planId: nonBlankOrNull(answer.plan_id),
  };
}

const footageAskOf = (value: unknown): FootageAsk | null => {
  const ask = recordOrEmpty(value);
  const toFilm = nonBlankOrNull(ask.what);
  return toFilm
    ? {
        what: toFilm,
        seconds: typeof ask.seconds === "number" ? ask.seconds : 10,
        opportunity_id: nonBlankOrNull(ask.opportunity_id),
      }
    : null;
};

/** A slot's score as the row keeps it, read back part by part; null where it keeps none it can read. */
const slotScoreOf = (value: unknown): SlotScore | null => {
  const score = recordOrEmpty(value);
  const kept = recordOrEmpty(score.parts);
  if (typeof score.total !== "number") return null;
  const partOf = (part: ScorePart): { value: number; why: string } => {
    const one = recordOrEmpty(kept[part]);
    return { value: typeof one.value === "number" ? one.value : 0, why: nonBlankOrNull(one.why) ?? "" };
  };
  return {
    total: score.total,
    parts: {
      relevance: partOf("relevance"),
      footage_fit: partOf("footage_fit"),
      eligibility: partOf("eligibility"),
      novelty: partOf("novelty"),
      audience_fit: partOf("audience_fit"),
      effort: partOf("effort"),
      expected_value: partOf("expected_value"),
      timeliness: partOf("timeliness"),
    },
  };
};

type SlotRead = Omit<SlotRow, "tenant_id" | "plan_id" | "created_at" | "updated_at">;
type PlanRead = Pick<
  PlanRow,
  "id" | "week_of" | "status" | "fewer" | "ready_at" | "approved_at" | "approved_by" | "goes_at"
>;

/** One slot as the page reads it; null for a row whose sets this build does not know. */
function slotDtoOf(row: SlotRead): PlanSlotDto | null {
  if (!isOneOf(POST_PLACES, row.place) || !isOneOf(POST_KINDS, row.kind) || !isOneOf(SLOT_STATES, row.state))
    return null;
  return {
    id: row.id,
    creative: row.creative,
    place: row.place,
    kind: row.kind,
    at: row.at,
    state: row.state,
    title: row.title,
    reason: row.reason,
    file_id: row.file_id,
    piece_id: row.piece_id,
    post_id: row.post_id,
    intent: row.intent ? pieceIntentOf(row.intent) : null,
    words: slotWordsOf(row.words),
    blocked_why: row.blocked_why === "unmade" || isOneOf(POST_HELD_WHYS, row.blocked_why) ? row.blocked_why : null,
    blocked_reason: row.blocked_reason,
    ask: footageAskOf(row.ask),
    score: slotScoreOf(row.score),
    prepared_file_id: nonBlankOrNull(recordOrEmpty(row.prepared).file_id),
  };
}

const planDtoOf = (row: PlanRead): WeekPlanDto["plan"] =>
  isOneOf(PLAN_STATUSES, row.status)
    ? {
        id: row.id,
        week_of: row.week_of,
        status: row.status,
        fewer: row.fewer,
        ready_at: row.ready_at,
        approved_at: row.approved_at,
        approved_by: row.approved_by,
        goes_at: row.status === "ready" ? row.goes_at : null,
      }
    : null;

/** A week's plan and its slots, in time order; no plan where none was asked for that week. */
export async function readContentWeek(db: Db, tenantId: TenantId, weekOf: string): Promise<WeekPlanDto> {
  const { data: plan, error } = await db
    .from("content_plans")
    .select(PLAN_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("week_of", weekOf)
    .maybeSingle();
  if (error) throw new DbFailure(error, "content plan");
  if (!plan) return { plan: null, slots: [] };
  const { data: slots, error: slotsError } = await db
    .from("plan_slots")
    .select(SLOT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("plan_id", plan.id)
    .order("at", { ascending: true })
    // A plan holds at most forty slots (content_plan_write).
    .limit(40);
  if (slotsError) throw new DbFailure(slotsError, "plan slots");
  return {
    plan: planDtoOf(plan),
    slots: slots.flatMap((row) => {
      const dto = slotDtoOf(row);
      return dto ? [dto] : [];
    }),
  };
}

/** What approving the week came to. */
export interface WeekApproved {
  // A rung's approval may also find the week held to a later time, stopped, or under a rung that now asks (00714).
  fate: "approved" | "changed" | "gone" | "nothing" | "drafting" | "done" | "held" | "stopped" | "asks";
  approvalId: string | null;
  slots: number;
}

const WEEK_FATES = ["approved", "changed", "gone", "nothing", "drafting", "done", "held", "stopped", "asks"] as const;

/**
 * Approve the week (content_week_approve): as the member, the snapshot's slots under one approval of the plan; as the
 * service at a held week's time, the same under the rung the door reads again (00714).
 */
export async function approveWeek(
  db: Db,
  tenantId: TenantId,
  approval: { planId: string; snapshot: Json },
): Promise<WeekApproved> {
  const { data, error } = await db.rpc("content_week_approve", {
    p_tenant_id: tenantId,
    p_plan_id: approval.planId,
    p_snapshot: approval.snapshot,
  });
  if (error) throw new DbFailure(error, "content week approve");
  const answer = recordOrEmpty(data);
  return {
    // A second press on a week already approved finds it so.
    fate: isOneOf(WEEK_FATES, answer.fate) ? answer.fate : "gone",
    approvalId: nonBlankOrNull(answer.approval_id),
    slots: typeof answer.slots === "number" ? answer.slots : 0,
  };
}

/** One change to a slot, as plan_slot_set takes it. */
export type SlotChange =
  { to: "removed" } | { to: "proposed"; file_id?: string } | { to: "at"; at: string } | { to: "approved" };

/** What a slot's change came to. */
export interface SlotSet {
  fate: "done" | "gone" | "posted" | "past" | "other";
  approvalId: string | null;
}

/** A slot left out, put back, moved or approved by itself (plan_slot_set), as the member. */
export async function setPlanSlot(
  db: Db,
  tenantId: TenantId,
  slot: { id: string; change: SlotChange },
): Promise<SlotSet> {
  const { data, error } = await db.rpc("plan_slot_set", {
    p_tenant_id: tenantId,
    p_slot_id: slot.id,
    p_change: slot.change,
  });
  if (error) throw new DbFailure(error, "plan slot set");
  const answer = recordOrEmpty(data);
  const fate = answer.fate;
  return {
    fate: fate === "done" || fate === "gone" || fate === "posted" || fate === "past" ? fate : "other",
    approvalId: nonBlankOrNull(answer.approval_id),
  };
}

/** One slot as the member reads it, with the week its plan is of; null where it is not theirs to see, or gone. */
export async function findPlanSlot(
  db: Db,
  tenantId: TenantId,
  slotId: string,
): Promise<{ slot: PlanSlotDto; weekOf: string } | null> {
  const { data, error } = await db
    .from("plan_slots")
    .select(`${SLOT_COLUMNS}, plan_id`)
    .eq("tenant_id", tenantId)
    .eq("id", slotId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "plan slot");
  const slot = data ? slotDtoOf(data) : null;
  if (!data || !slot) return null;
  const { data: plan, error: planError } = await db
    .from("content_plans")
    .select("week_of")
    .eq("tenant_id", tenantId)
    .eq("id", data.plan_id)
    .maybeSingle();
  if (planError) throw new DbFailure(planError, "plan of a slot");
  return plan ? { slot, weekOf: plan.week_of } : null;
}

/** What an approved slot was made into: its post, its video begun, or why it could not be made, with its one fix. */
export type SlotMade = { post_id: string } | { piece_id: string } | { held: { why: SlotHeldWhy; reason: string } };

/**
 * What an approved slot was made into (plan_slot_made), as the member whose approval makes it. False where the slot was
 * not there to take it: gone, no longer approved, or made already.
 */
export async function markSlotMade(db: Db, tenantId: TenantId, slot: { id: string; made: SlotMade }): Promise<boolean> {
  const { data, error } = await db.rpc("plan_slot_made", {
    p_tenant_id: tenantId,
    p_slot_id: slot.id,
    p_made: slot.made,
  });
  if (error) throw new DbFailure(error, "plan slot made");
  return recordOrEmpty(data).fate === "made";
}

/** A plan as its job reads it, under the service role; null where there is none by that id. */
export async function findPlanForJob(
  db: Db,
  planId: string,
): Promise<Pick<
  PlanRow,
  | "id"
  | "tenant_id"
  | "week_of"
  | "status"
  | "asked_by"
  | "goes_at"
  | "stopped_at"
  | "approved_by"
  | "making_since"
  | "made_at"
> | null> {
  const { data, error } = await db
    .from("content_plans")
    .select("id, tenant_id, week_of, status, asked_by, goes_at, stopped_at, approved_by, making_since, made_at")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "content plan for its job");
  return data;
}

/** What the job's write came to: the plan ready with its slots, or a plan no longer drafting (or gone) left alone. */
export interface PlanWritten {
  fate: "ready" | "gone" | "other";
  slots: number;
}

/** The job's write (content_plan_write), under the service role: the slots drafted, why it is fewer, the plan ready. */
export async function writePlan(
  db: Db,
  tenantId: TenantId,
  plan: { id: string; slots: Json; fewer: string | null },
): Promise<PlanWritten> {
  const { data, error } = await db.rpc("content_plan_write", {
    p_tenant_id: tenantId,
    p_plan_id: plan.id,
    p_slots: plan.slots,
    // The generated argument is a string; the door reads an empty one as none.
    p_fewer: plan.fewer ?? "",
  });
  if (error) throw new DbFailure(error, "content plan write");
  const answer = recordOrEmpty(data);
  return {
    fate: answer.fate === "ready" ? "ready" : answer.fate === "gone" ? "gone" : "other",
    slots: typeof answer.slots === "number" ? answer.slots : 0,
  };
}

/** The weekly clock's one statement (content_plans_hand_out): next week's plan begun where it is due. How many. */
export async function handOutPlans(db: Db, spreadSeconds: number): Promise<number> {
  const { data, error } = await db.rpc("content_plans_hand_out", { p_spread_seconds: spreadSeconds });
  if (error) throw new DbFailure(error, "content plans hand out");
  return typeof data === "number" ? data : 0;
}

/** What holding a week came to (content_week_hold): held to its time under the rung, or let go and why. */
export type WeekHold = "held" | "let_go" | "asks" | "stopped" | "gone" | "other";

const HOLD_FATES = ["held", "let_go", "asks", "stopped", "gone"] as const;

/**
 * A ready week held to its time (content_week_hold, 00714), under the service role: its goes_at kept and its job
 * scheduled for then while the plan_approve rung holds or sends it; null lets it go. The door reads the rung itself.
 */
export async function holdWeek(
  db: Db,
  tenantId: TenantId,
  hold: { planId: string; goesAt: string | null },
): Promise<WeekHold> {
  const { data, error } = await db.rpc("content_week_hold", {
    p_tenant_id: tenantId,
    p_plan_id: hold.planId,
    // None lets it go.
    ...(hold.goesAt ? { p_goes_at: hold.goesAt } : {}),
  });
  if (error) throw new DbFailure(error, "content week hold");
  const fate = recordOrEmpty(data).fate;
  return isOneOf(HOLD_FATES, fate) ? fate : "other";
}

/** Stop it (content_week_stop, 00714), as the member: a held week let go, so it waits for their press. */
export async function stopWeek(
  db: Db,
  tenantId: TenantId,
  planId: string,
): Promise<"stopped" | "asks" | "gone" | "other"> {
  const { data, error } = await db.rpc("content_week_stop", { p_tenant_id: tenantId, p_plan_id: planId });
  if (error) throw new DbFailure(error, "content week stop");
  const fate = recordOrEmpty(data).fate;
  return fate === "stopped" || fate === "asks" || fate === "gone" ? fate : "other";
}

/** The workspace's rung for Approve the week (policies, class plan_approve): its mode, or null where none is read. */
export async function findWeekRung(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data, error } = await db
    .from("policies")
    .select("mode")
    .eq("tenant_id", tenantId)
    .eq("class", "plan_approve")
    .is("subject_type", null)
    .maybeSingle();
  if (error) throw new DbFailure(error, "the week's rung");
  return data?.mode ?? null;
}

/** How many approved weeks AI's suggested rung reads, newest first. */
const RECORD_WEEKS = 8;

/** The weeks approved, newest first, as AI's suggested rung reads them: by whose press, and whether edited (00714). */
export async function listWeeksApproved(
  db: Db,
  tenantId: TenantId,
): Promise<{ by_owner: boolean; edited: boolean | null }[]> {
  const { data, error } = await db
    .from("content_plans")
    .select("approved_by, edited")
    .eq("tenant_id", tenantId)
    .in("status", ["approved", "done"])
    .not("approved_at", "is", null)
    .order("week_of", { ascending: false })
    .limit(RECORD_WEEKS);
  if (error) throw new DbFailure(error, "weeks approved");
  return data.map((row) => ({ by_owner: row.approved_by !== null, edited: row.edited }));
}

/** What AI does with a week the dashboard's door is asked for (00714): prepare it while it is held, make what is left once approved. */
export type WeekPass = "prepare" | "make";

/**
 * A week AI is to work on, as the dashboard's door reads it under the service role (00714): held under a rung that still
 * holds or sends it and not stopped (prepare its pictures ahead), or approved by nobody's press under the rung (make what
 * is left). Null for any other week: one the owner approved, one that asks, one not this workspace's.
 */
export async function findWeekForAI(
  db: Db,
  tenantId: TenantId,
  planId: string,
): Promise<{ weekOf: string; pass: WeekPass } | null> {
  const { data: plan, error } = await db
    .from("content_plans")
    .select("week_of, status, approved_by, approval_id, goes_at, stopped_at")
    .eq("tenant_id", tenantId)
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new DbFailure(error, "a week for AI");
  if (!plan) return null;
  if (plan.status === "ready") {
    const rung = await findWeekRung(db, tenantId);
    return plan.goes_at && !plan.stopped_at && (rung === "veto" || rung === "auto")
      ? { weekOf: plan.week_of, pass: "prepare" }
      : null;
  }
  if (plan.status !== "approved" || plan.approved_by !== null || !plan.approval_id) return null;
  const { data: approval, error: approvalError } = await db
    .from("approvals")
    .select("approved_by, snapshot")
    .eq("tenant_id", tenantId)
    .eq("id", plan.approval_id)
    .maybeSingle();
  if (approvalError) throw new DbFailure(approvalError, "the week's approval");
  const rung = recordOrEmpty(recordOrEmpty(approval?.snapshot).rung);
  return approval && approval.approved_by === null && rung.class === "plan_approve"
    ? { weekOf: plan.week_of, pass: "make" }
    : null;
}

/**
 * A slot of a held week readied ahead (plan_slot_prepared, 00714), under the service role: the made file its picture was
 * drawn into, the time it was readied for, and the approval the door takes at 8:00. Whether it was kept.
 */
export async function markSlotPrepared(
  db: Db,
  tenantId: TenantId,
  slot: { id: string; prepared: Json },
): Promise<boolean> {
  const { data, error } = await db.rpc("plan_slot_prepared", {
    p_tenant_id: tenantId,
    p_slot_id: slot.id,
    p_prepared: slot.prepared,
  });
  if (error) throw new DbFailure(error, "a slot prepared");
  return data === true;
}

/** The making queue's cap and lease, as its doors take them (contracts WEEKS_MAKING_AT_ONCE, WEEK_MAKING_LEASE_S). */
export interface MakingQueue {
  cap: number;
  leaseSeconds: number;
}

/**
 * The making queue started (content_weeks_start, 00714), under the service role: the weeks AI approved begun in turn,
 * never more at once than the cap, the earliest first post first, each with its content_week_make job. How many began.
 */
export async function startWeeksMaking(db: Db, queue: MakingQueue): Promise<number> {
  const { data, error } = await db.rpc("content_weeks_start", {
    p_cap: queue.cap,
    p_lease_seconds: queue.leaseSeconds,
  });
  if (error) throw new DbFailure(error, "the making queue's start");
  return typeof data === "number" ? data : 0;
}

/** A week's pass done (content_week_made, 00714): its place in the queue is free, and the next in turn begins. */
export async function markWeekMade(
  db: Db,
  tenantId: TenantId,
  week: { planId: string; pass: WeekPass },
  queue: MakingQueue,
): Promise<number> {
  const { data, error } = await db.rpc("content_week_made", {
    p_tenant_id: tenantId,
    p_plan_id: week.planId,
    p_pass: week.pass,
    p_cap: queue.cap,
    p_lease_seconds: queue.leaseSeconds,
  });
  if (error) throw new DbFailure(error, "a week made");
  const started = recordOrEmpty(data).started;
  return typeof started === "number" ? started : 0;
}
