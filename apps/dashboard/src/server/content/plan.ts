/**
 * A week of posts, as a member acts on it (00706; the content loop PRD's 8.4, 10.2 and 21.2): "plan the week" asks for it
 * now, Approve the week approves every slot that is ready in one press, and a slot is left out, put back, moved or
 * approved by itself once mended. Each goes through its door on the member's own session, which asks the settings
 * permission itself. Before the week is approved, each slot is held to the checks a press is (posts/checks.ts's moment):
 * the reason it was made for still stands, and nothing goes while AI is paused; a slot one refuses is left out of the
 * approval, said in words, and asks by itself once mended. What is approved is made after the press answers
 * (make-week.ts); a reel, once its video is made, goes up on its own Approve, as a video's bytes are approved once seen.
 */
import "server-only";
import {
  AppError,
  goodUntilOf,
  planWeekOf,
  type WeekPlanDto,
  type PlanSlotDto,
  type TenantId,
} from "@chanlytics/contracts";
import { evaluate, verdictWords } from "@chanlytics/core";
import {
  approveWeek,
  askForPlan,
  findFile,
  findPiece,
  findPlanSlot,
  markSlotMade,
  readContentWeek,
  setPlanSlot,
  type SlotChange,
} from "@chanlytics/db/files";
import { jsonCopyOf } from "@chanlytics/db/shared";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";
import { postFileToInstagram } from "../posts/instagram";
import { makeWeekAfter } from "./make-week";

/** The words a refused act says (the Week's own, through docs/words.md). */
const PLAN_REFUSED = {
  approved: "This week is approved already. Tell AI what to change.",
  drafting: "AI is still making this week. It's ready by Monday 8:00 AM.",
  nothing: "Nothing in this week is ready to approve.",
  changed: "This week changed since it was shown. Look again.",
  gone: "That week isn't there any more.",
  posted: "That one is up already: its post says where it stands.",
  past: "Pick a time that hasn't passed.",
  slotGone: "That post isn't in this week any more.",
  notMade: "Its video isn't made yet. It says so on its row once it is.",
} as const;

const memberZoneOf = (member: Member): string => member.facts?.timezone ?? "UTC";

/** "Plan the week": the week asked for now, drafting, with nothing made. Refused for a week already approved. */
export async function askPlanFor(ctx: RouteContext, member: Member, input: { week_of?: string | undefined }) {
  const weekOf = input.week_of ?? planWeekOf(memberZoneOf(member), Date.now());
  const begun = await askForPlan(ctx.supabase, member.tenantId, weekOf);
  if (begun.fate === "approved") throw new AppError("conflict", PLAN_REFUSED.approved, 409);
  return { drafting: true, plan_id: begun.planId, week_of: weekOf };
}

/** The week a plan is of, as its member reads it: its slots, in time order. */
async function readWeekOf(ctx: RouteContext, tenantId: TenantId, weekOf: string): Promise<WeekPlanDto> {
  return readContentWeek(ctx.supabase, tenantId, weekOf);
}

/** A slot's reason, asked before the week is approved (PRD 6.2, the owner approves): what refuses it, in words, or null. */
function slotRefusal(slot: PlanSlotDto, zone: string, nowMs: number): string | null {
  const verdict = evaluate({
    reason: {
      intent: slot.intent,
      goodUntil: goodUntilOf(slot.intent, zone),
      atMs: Date.parse(slot.at),
      nowMs,
      zone,
      says: [],
      services: [],
      facts: [],
      opportunities: null,
      moment: "before",
    },
  });
  return verdict.ok ? null : verdictWords(verdict);
}

/** What the press approves of each slot, as the door holds it: by id, where, as what, when, from which footage, and why. */
const SNAPSHOT_PARTS = ["id", "place", "kind", "at", "file_id", "title", "intent"] as const;

const snapshotOf = (slots: readonly PlanSlotDto[]) => ({
  slots: slots.map((slot) => Object.fromEntries(SNAPSHOT_PARTS.map((part) => [part, slot[part]]))),
});

/**
 * Approve the week (PRD 8.4, canvas call 10): every slot ready, as shown, under one approval of the plan. A slot whose
 * reason no longer stands is left out of it and said; a blocked slot or one asking for footage stays as it is.
 */
export async function approveWeekFor(
  ctx: RouteContext,
  member: Member,
  input: { week_of: string; plan_id: string },
): Promise<{ approved: number; left_out: { id: string; why: string }[] }> {
  const week = await readWeekOf(ctx, member.tenantId, input.week_of);
  if (!week.plan || week.plan.id !== input.plan_id) throw new AppError("not_found", PLAN_REFUSED.gone, 404);
  if (week.plan.status === "approved" || week.plan.status === "done")
    throw new AppError("conflict", PLAN_REFUSED.approved, 409);
  if (week.plan.status === "drafting") throw new AppError("conflict", PLAN_REFUSED.drafting, 409);
  const nowMs = Date.now();
  const ready = week.slots.filter((slot) => slot.state === "proposed");
  const leftOut = ready.flatMap((slot) => {
    const refusal = slotRefusal(slot, memberZoneOf(member), nowMs);
    return refusal ? [{ id: slot.id, why: refusal }] : [];
  });
  const going = ready.filter((slot) => !leftOut.some((left) => left.id === slot.id));
  if (going.length === 0) throw new AppError("validation", leftOut[0]?.why ?? PLAN_REFUSED.nothing);
  const answer = await approveWeek(ctx.supabase, member.tenantId, {
    planId: week.plan.id,
    snapshot: jsonCopyOf(snapshotOf(going)),
  });
  if (answer.fate === "changed") throw new AppError("conflict", PLAN_REFUSED.changed, 409);
  if (answer.fate === "gone") throw new AppError("not_found", PLAN_REFUSED.gone, 404);
  if (answer.fate !== "approved") throw new AppError("conflict", PLAN_REFUSED.approved, 409);
  makeWeekAfter(ctx, member, { tenantId: member.tenantId, weekOf: input.week_of });
  return { approved: answer.slots, left_out: leftOut };
}

/**
 * A made reel up at its time, on the owner's Approve (00681: a video's bytes are approved once they can be watched):
 * through the press a member's own Post makes, with the words the Week showed, then marked on its slot.
 */
async function postMadeReel(
  ctx: RouteContext,
  member: Member,
  slotId: string,
): Promise<{ done: true; approval_id: null }> {
  const found = await findPlanSlot(ctx.supabase, member.tenantId, slotId);
  if (!found) throw new AppError("not_found", PLAN_REFUSED.slotGone, 404);
  const { slot } = found;
  if (slot.post_id) throw new AppError("conflict", PLAN_REFUSED.posted, 409);
  const piece = slot.piece_id ? await findPiece(ctx.supabase, slot.piece_id) : null;
  const row = piece?.status === "made" && piece.file_id ? await findFile(ctx.supabase, piece.file_id) : null;
  if (!row) throw new AppError("validation", PLAN_REFUSED.notMade);
  const later = Date.parse(slot.at) > Date.now();
  const placed = await postFileToInstagram(ctx, member, row, {
    as: "reel",
    caption: slot.words?.caption,
    when: later ? slot.at : undefined,
    about: slot.intent ? { day: slot.intent.day, offer: slot.intent.offer, service: slot.intent.service } : undefined,
  });
  await markSlotMade(ctx.supabase, member.tenantId, { id: slot.id, made: { post_id: placed.post_id } });
  return { done: true, approval_id: null };
}

/**
 * A slot left out, put back, moved or approved by itself, in the owner's words where the door refuses it; one approved
 * by itself is made after the press answers, and a made reel goes up on its own Approve (`post`).
 */
export async function setSlotFor(
  ctx: RouteContext,
  member: Member,
  input: { slot_id: string; change: SlotChange | { to: "post" } },
): Promise<{ done: true; approval_id: string | null }> {
  const { change } = input;
  if (change.to === "post") return postMadeReel(ctx, member, input.slot_id);
  const answer = await setPlanSlot(ctx.supabase, member.tenantId, { id: input.slot_id, change });
  if (answer.fate === "gone") throw new AppError("not_found", PLAN_REFUSED.slotGone, 404);
  if (answer.fate === "posted") throw new AppError("conflict", PLAN_REFUSED.posted, 409);
  if (answer.fate === "past") throw new AppError("validation", PLAN_REFUSED.past);
  if (answer.fate !== "done") throw new AppError("conflict", PLAN_REFUSED.changed, 409);
  if (change.to === "approved") {
    const found = await findPlanSlot(ctx.supabase, member.tenantId, input.slot_id);
    if (found) makeWeekAfter(ctx, member, { tenantId: member.tenantId, weekOf: found.weekOf });
  }
  return { done: true, approval_id: answer.approvalId };
}
