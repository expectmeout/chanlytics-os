/**
 * How a week's approval ends, and what each ending says (the Week review of 25 Nov 2026: C1, C2 and C6).
 *
 * One rule for a post whose time has passed, the same for the owner's press and for AI: an approval never puts it up
 * (slotTimePassed, asked by core weekApprovalOf and by the Week's row), so a week approved on Wednesday posts nothing of
 * Monday's. And every way AI's approval at a held week's time can end (the edge's content_week_go job), said once: one
 * line on the Week's head, Today's point and the bell, all from weekEndingSaid. The job says the ending it reached (the
 * bell); the Week and Today read the one that stands from the week itself (weekEndingOf), with no record kept of it.
 */
import { MIN_MS } from "../../shared/time";
import type { PlanSlotDto, WeekPlanDto } from "./week";
import { WEEK_WORDS as W } from "./words";

/** How long before its time a slot must still be for an approval to put it up: one nearer is left out, never posted late. */
export const WEEK_MADE_AHEAD_MS = 5 * MIN_MS;

/** Whether a slot's time has passed for an approval: gone by, or too near to be made and placed before it. */
export const slotTimePassed = (at: string, nowMs: number): boolean => Date.parse(at) - nowMs < WEEK_MADE_AHEAD_MS;

/**
 * How a week AI may approve ended, or stands:
 *   approved     AI approved it under the owner's setting: how many posts go up, how many reels are made for the owner's
 *                look, and how many were left out (each says why on its row).
 *   paused       not approved: AI is paused for the workspace (Stop everything).
 *   asks         not approved: the setting asks the owner again.
 *   nothing      not approved: no post was left that an approval could put up.
 *   stopped      the owner stopped it.
 *   changed      not approved: the week changed as it was being approved, each time it was tried.
 *   unapproved   it has no time to go up at, under a setting that lets AI approve: AI is not approving this one.
 */
export type WeekEnding =
  | { is: "approved"; going: number; reels: number; leftOut: number }
  | { is: "nothing"; leftOut: number }
  | { is: "paused" | "asks" | "stopped" | "changed" | "unapproved" };

/** What an ending says: the Week's head, Today's point (its name and the line under it), and the bell's one notice. */
interface WeekEndingSaid {
  head: string | null;
  today: { name: string; said: string } | null;
  bell: { subject: string; body: string } | null;
}

/** "3 go up, each at its time", "a reel is being made and waits for your approval", or both. */
function goingSaid(going: number, reels: number): string {
  const posts = going === 1 ? "1 goes up at its time" : `${going} go up, each at its time`;
  const beingMade =
    reels === 1
      ? "a reel is being made and waits for your approval"
      : `${reels} reels are being made and wait for your approval`;
  if (reels === 0) return posts;
  return going > 0 ? `${posts}, and ${beingMade}` : `${beingMade.charAt(0).toUpperCase()}${beingMade.slice(1)}`;
}

const ENDING = W.ending;

/** A week AI did not approve that waits on its owner: the one line, on the Week's head and under Today's point. */
const waitsOnOwner = (head: string, today: string, bell: WeekEndingSaid["bell"]): WeekEndingSaid => ({
  head: `${head} ${W.untilApproved}`,
  today: { name: ENDING.todayWaits, said: today },
  bell,
});

/**
 * What an ending says, on each of the three places it is said. `when` is the time the week was approved or was to go
 * ("Mon 8:02 AM", "8:00 AM"), in the business's zone; none where the ending is read from the week and not from a time.
 */
export function weekEndingSaid(ending: WeekEnding, when: string): WeekEndingSaid {
  const at = when ? ` at ${when}` : "";
  switch (ending.is) {
    case "approved": {
      const left = ending.leftOut > 0 ? W.leftOut(ending.leftOut) : null;
      const set = `${goingSaid(ending.going, ending.reels)}, as you set it.`;
      return {
        head: `${W.approvedBy.ai(when)} ${left ?? W.eachGoes}`,
        today: { name: ENDING.todayApproved, said: left ?? W.eachGoes },
        bell: { subject: ENDING.todayApproved, body: left ? `${set} ${left}` : set },
      };
    }
    case "paused":
      // The Week's own head says AI is paused, with Resume: Today's point and the bell say what that meant for the week.
      return {
        head: null,
        today: { name: ENDING.todayWaits, said: ENDING.paused },
        bell: { subject: ENDING.notApproved, body: `AI is paused, so nothing went up${at}. ${ENDING.waitsThem}` },
      };
    case "asks":
      return {
        head: null,
        today: null,
        bell: {
          subject: ENDING.todayWaits,
          body: `You set AI to ask you first, so nothing went up${at}. ${ENDING.waitsThem}`,
        },
      };
    case "nothing":
      return {
        head: ENDING.noneReady,
        today: { name: ENDING.todayWaits, said: ENDING.noneReady },
        bell: { subject: ENDING.notApproved, body: `No post was ready to go up${at}. Each says why on the Week.` },
      };
    case "stopped":
      return { head: `${ENDING.youStopped} ${W.untilApproved}`, today: null, bell: null };
    case "changed":
      return waitsOnOwner(ENDING.aiDidnt, ENDING.aiDidntThem, {
        subject: ENDING.notApproved,
        body: `The week changed while AI was approving it${at}, so nothing went up. ${ENDING.look}`,
      });
    case "unapproved":
      return waitsOnOwner(ENDING.aiDidnt, ENDING.aiDidntThem, null);
  }
}

type SlotStands = Pick<PlanSlotDto, "state" | "blocked_why" | "at">;

/** A slot an approval left out of a week, which says why on its row: its time passed, or it is held with its reason. */
const slotLeftOutOf = (slot: SlotStands, nowMs: number): boolean =>
  slot.state === "proposed"
    ? slotTimePassed(slot.at, nowMs)
    : slot.state === "blocked" && slot.blocked_why !== "unmade";

/** Whether nobody's press approved an approved week: AI did, under the owner's setting (its approver is nobody). */
export const weekApprovedByAI = (plan: Pick<NonNullable<WeekPlanDto["plan"]>, "status" | "approved_by">): boolean =>
  plan.status === "approved" && plan.approved_by === null;

/** How many of a week's slots an approval left out: each says why on its row. */
export const weekLeftOut = (slots: readonly SlotStands[], nowMs: number): number =>
  slots.filter((slot) => slotLeftOutOf(slot, nowMs)).length;

/**
 * The ending that stands for a week now, read from the week itself: approved by AI, or ready with no time to go up at
 * and why (AI is paused, the owner stopped it, nothing could go, or AI is not approving it). Null for a week
 * that says nothing of the kind: one still held to its time, one that asks, one its owner approved, one still drafted.
 */
export function weekEndingOf(
  week: WeekPlanDto,
  at: { rung: string | null | undefined; paused: boolean; nowMs: number },
): WeekEnding | null {
  const plan = week.plan;
  if (!plan) return null;
  if (weekApprovedByAI(plan)) {
    const approved = week.slots.filter((s) => s.state === "approved" || s.state === "posted");
    const reels = new Set(approved.filter((s) => s.kind === "reel").map((s) => s.creative)).size;
    return {
      is: "approved",
      going: approved.filter((s) => s.kind !== "reel").length,
      reels,
      leftOut: weekLeftOut(week.slots, at.nowMs),
    };
  }
  if (plan.status !== "ready" || plan.goes_at) return null;
  if (plan.stopped_at) return { is: "stopped" };
  if (at.rung !== "veto" && at.rung !== "auto") return null;
  if (at.paused) return { is: "paused" };
  const going = week.slots.some((s) => s.state === "proposed" && !slotTimePassed(s.at, at.nowMs));
  return going ? { is: "unapproved" } : { is: "nothing", leftOut: weekLeftOut(week.slots, at.nowMs) };
}
