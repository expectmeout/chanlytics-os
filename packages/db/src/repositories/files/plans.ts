/**
 * A week of posts (00702; the content loop PRD's 5.3, 8.4 and 10.2): the owner's ask for a plan, the week approved in one
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

const PLAN_COLUMNS = "id, tenant_id, week_of, status, fewer, ready_at, approved_at, approved_by, approval_id, asked_by";
const SLOT_COLUMNS =
  "id, creative, place, kind, at, state, title, reason, file_id, piece_id, post_id, intent, words, blocked_why, blocked_reason, ask, score, approval_id";

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
type PlanRead = Omit<PlanRow, "asked_at" | "done_at">;

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
  fate: "approved" | "changed" | "gone" | "nothing" | "drafting" | "done";
  approvalId: string | null;
  slots: number;
}

const WEEK_FATES = ["approved", "changed", "gone", "nothing", "drafting", "done"] as const;

/** Approve the week (content_week_approve), as the member: the snapshot's slots under one approval of the plan. */
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
): Promise<Pick<PlanRow, "id" | "tenant_id" | "week_of" | "status" | "asked_by"> | null> {
  const { data, error } = await db
    .from("content_plans")
    .select("id, tenant_id, week_of, status, asked_by")
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
