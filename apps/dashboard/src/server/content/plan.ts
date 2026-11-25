/**
 * A week of posts, as a member acts on it (00706; the content loop PRD's 8.4, 10.2 and 21.2): "plan the week" asks for it
 * now, Approve the week approves every slot that is ready in one press, and a slot is left out, put back, moved or
 * approved by itself once mended. Each goes through its door on the member's own session, which asks the settings
 * permission itself. Before the week is approved, each slot is held to the checks a press is (posts/checks.ts's moment):
 * its time has not passed (no approval posts late, the owner's or AI's: contracts slotTimePassed), the reason it was made
 * for still stands; a slot one refuses is left out of the approval, said in words on its row, and asks by itself once
 * mended. What is approved is made after the press answers
 * (make-week.ts); a reel, once its video is made, goes up on its own Approve, as a video's bytes are approved once seen.
 */
import "server-only";
import { AppError, planWeekOf, type WeekPlanDto, type TenantId } from "@chanlytics/contracts";
import { judgeWeekApproval, type WeekApproval } from "@chanlytics/core";
import {
  approveWeek,
  askForPlan,
  findFile,
  findPiece,
  findPlanSlot,
  holdSlotsLeftOut,
  listClaims,
  markSlotMade,
  readContentWeek,
  setPlanSlot,
  stopWeek,
  type SlotChange,
} from "@chanlytics/db/files";
import { jsonCopyOf } from "@chanlytics/db/shared";
import { logAndGoOn } from "@chanlytics/log";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import type { RouteContext } from "@/server/shared/with-route";
import { postFileToInstagram } from "../posts/instagram";
import { getStoredConfig } from "../workspace/config-row";
import { makeWeekAfter, type MadeLater } from "./make-week";

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
  /** Stop it on a week no longer held (00714): approved meanwhile, or already waiting for the owner. */
  notHeld: "This week isn't set to go up by itself any more. Look again.",
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

/** What the business says of itself, as the week's approval asks it, on the member's session. */
const businessOn = (ctx: RouteContext, member: Member) => async () => {
  const [config, claims] = await Promise.all([
    getStoredConfig(ctx.supabase, member.tenantId),
    listClaims(ctx.supabase, member.tenantId),
  ]);
  return { config, claims };
};

/**
 * The slots the press left out because their reason no longer stands, held on their rows with why, so "it says why" is
 * true of each. Written as the service once the member's own press has been taken (a member's session writes no slot but
 * through its doors, and none of those holds a slot not yet approved); a slot whose time passed says so by itself.
 */
async function holdLeftOut(tenantId: TenantId, planId: string, slots: WeekApproval["holds"]): Promise<void> {
  // The press has been taken either way: a row that could not be held keeps its time, and is not the press's failure.
  if (slots.length > 0)
    await holdSlotsLeftOut(serviceDb(), tenantId, { planId, slots }).catch(
      logAndGoOn("holding the slots a week's approval left out", 0),
    );
}

/**
 * Approve the week (PRD 8.4, canvas call 10): every slot ready, as shown, under one approval of the plan. A slot whose
 * time has passed or whose reason no longer stands is left out of it and said, on the press's answer and on its row; a
 * blocked slot or one asking for footage stays as it is. `later` runs the making once the press has answered (the
 * framework's own, where none is handed; a test hands its own).
 */
export async function approveWeekFor(
  ctx: RouteContext,
  member: Member,
  input: { week_of: string; plan_id: string },
  later?: MadeLater,
): Promise<{ approved: number; left_out: { id: string; why: string }[] }> {
  const week = await readWeekOf(ctx, member.tenantId, input.week_of);
  if (!week.plan || week.plan.id !== input.plan_id) throw new AppError("not_found", PLAN_REFUSED.gone, 404);
  if (week.plan.status === "approved" || week.plan.status === "done")
    throw new AppError("conflict", PLAN_REFUSED.approved, 409);
  if (week.plan.status === "drafting") throw new AppError("conflict", PLAN_REFUSED.drafting, 409);
  // The rule a held week's job asks too (core weekApprovalOf): each ready slot held to the checks before it goes.
  const at = { zone: memberZoneOf(member), nowMs: Date.now() };
  const { going, leftOut, holds, snapshot } = await judgeWeekApproval(week.slots, at, businessOn(ctx, member));
  if (going.length === 0) {
    await holdLeftOut(member.tenantId, week.plan.id, holds);
    throw new AppError("validation", leftOut[0]?.why ?? PLAN_REFUSED.nothing);
  }
  const answer = await approveWeek(ctx.supabase, member.tenantId, {
    planId: week.plan.id,
    snapshot: jsonCopyOf(snapshot),
  });
  if (answer.fate === "changed") throw new AppError("conflict", PLAN_REFUSED.changed, 409);
  if (answer.fate === "gone") throw new AppError("not_found", PLAN_REFUSED.gone, 404);
  if (answer.fate !== "approved") throw new AppError("conflict", PLAN_REFUSED.approved, 409);
  await holdLeftOut(member.tenantId, week.plan.id, holds);
  makeWeekAfter(ctx, member, { tenantId: member.tenantId, weekOf: input.week_of }, later);
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

/**
 * Stop it (00714; the content loop PRD's 12.4): a week AI may approve, held to its time, let go by the member's own
 * press, so it waits for their Approve the week as a week that asks does.
 */
export async function stopWeekFor(
  ctx: RouteContext,
  member: Member,
  input: { plan_id: string },
): Promise<{ stopped: true }> {
  const fate = await stopWeek(ctx.supabase, member.tenantId, input.plan_id);
  if (fate === "gone") throw new AppError("not_found", PLAN_REFUSED.gone, 404);
  if (fate !== "stopped") throw new AppError("conflict", PLAN_REFUSED.notHeld, 409);
  return { stopped: true };
}
