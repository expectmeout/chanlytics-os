/**
 * What a playbook's run makes, apart from who it reaches: whether the step and what it was asked for go together, the
 * batch's name and what it is kept by, when it goes, the moment its words are written for, and its audience. Moved whole
 * from run-playbook.ts (decision 0118), which reads them; pure, with no port.
 */
import {
  localDate,
  planRun,
  slotShort,
  triggerOf,
  type Audience,
  type RunPlan,
  type RunReach,
  type SequenceMode,
} from "@chanlytics/contracts";
import type { FreedTimeRun, LateReminderRun, PlaybookRow, RunBy, RunContext, RunOutcome } from "./ports";

/** Why a run is off (core RunOutcome): what a step says instead of running. */
export type Skipped = Extract<RunOutcome, { outcome: "off" }>["skipped"];

/** A list as it was counted for a run, kept on it (decision 0009, "sends remember"). */
export type KeptList = { token: string; rule: unknown; counted_at: string };

/** What a run was asked for beside its day: a freed time (0082), a late booking (0118), or neither. */
interface AskedFor {
  freed: FreedTimeRun | null;
  late: LateReminderRun | null;
}

/** A run as its batch reads it: the step, the day, the business's zone, and what it was asked for. */
interface BatchRun extends AskedFor {
  p: PlaybookRow;
  runFor: string;
  ctx: Pick<RunContext, "tz">;
}

/**
 * Why a run and what it was asked for do not go together, or null. A freed time's step runs when an appointment frees a
 * time and only then, any other step never for one, and a freed time that has begun by the moment its batch would go is
 * a time nobody can have (0082). Only the appointment reminder reminds a late booking (0118). Said, and never recorded,
 * so a Run now on it learns why and the day stays open.
 */
export function batchRefusal(step: PlaybookRow, { freed, late }: AskedFor, goesAt: Date): Skipped | null {
  const freedStep = triggerOf(step.trigger)?.kind === "freed";
  if (freedStep !== (freed !== null)) return freedStep ? "no_freed_time" : "not_a_freed_time_step";
  if (freed && freed.start <= goesAt.getTime()) return "freed_time_passed";
  return late && step.trigger !== "visit_tomorrow" ? "not_a_reminder_step" : null;
}

/**
 * A batch's name and what it is kept by: a run's day, or for a freed time, which has no day of its own, the time it offers
 * and the appointment that freed it, the name saying the time by its date ("Fill a cancellation · Tue, Sep 8, 3:00 PM", 0082):
 * a name is kept, and a "tomorrow" in it would be wrong by morning.
 */
export function batchWhen(run: BatchRun) {
  const { p: step, freed, late, runFor, ctx } = run;
  // A late booking's reminder has no day either (0118): the day's own batch holds that key, and its name says the visit.
  if (late) return { name: `${step.name} · ${slotShort(late.startsAt, ctx.tz)}` };
  if (!freed) return { name: `${step.name} · ${runFor}`, run_for: runFor };
  return {
    name: `${step.name} · ${slotShort(freed.start, ctx.tz)}`,
    offered_start: new Date(freed.start).toISOString(),
    offered_end: new Date(freed.end).toISOString(),
    offered_from: freed.from,
  };
}

/**
 * What the batch does (contracts planRun, decision 0064): a person who asks has decided, and it sends now; any other goes
 * by its mode. A late booking's reminder goes at its own time, never before it (0118).
 */
export function batchPlan(by: RunBy, mode: SequenceMode, now: Date, late: LateReminderRun | null): RunPlan {
  const plan: RunPlan = by.kind === "user" ? { kind: "send", state: "scheduled", at: now } : planRun(mode, now);
  return late && plan.kind === "send" && plan.at.getTime() < late.at ? { ...plan, at: new Date(late.at) } : plan;
}

/** What a late booking's reminder adds to its run's record (0118): the edge reads it, and never stamps the day for it. */
export const lateMark = (late: LateReminderRun | null): { late?: true } => (late ? { late: true } : {});

/**
 * The moment a run's words are written for: the moment it goes. A late booking's reminder that waits for its owner has
 * none yet, and keeps the moment it was to go (0118): made at eleven at night for the morning, "today at 2:00 PM" is the
 * morning's, and an approval is refused on any later day (contracts runApprovalRefusal).
 */
export const saidAtOf = (late: LateReminderRun | null, goesAt: Date): Date =>
  late && late.at > goesAt.getTime() ? new Date(late.at) : goesAt;

/**
 * The run's own audience: the playbook, its moment (which the month's allowance asks at the wire), who it named and left
 * out, the list as it was counted, and for a late booking's reminder the visit it is about and the day its words were
 * written for (0118, `saidAt`).
 */
export function batchAudience(
  run: BatchRun,
  reach: RunReach,
  kept: { list: KeptList | undefined; saidAt: Date },
): Audience {
  const { p: step, late, ctx } = run;
  const visit = late
    ? {
        appointment: late.appointment,
        start: new Date(late.startsAt).toISOString(),
        day: localDate(ctx.tz, kept.saidAt),
      }
    : null;
  return {
    kind: "playbook",
    id: step.id,
    label: step.name,
    trigger: step.trigger,
    reach,
    ...(kept.list ? { list: kept.list } : {}),
    ...(visit ? { late: visit } : {}),
  };
}
