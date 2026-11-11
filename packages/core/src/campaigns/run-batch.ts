/**
 * What a playbook's run makes, apart from who it reaches: whether the step and what it was asked for go together, the
 * batch's name and what it is kept by, when it goes, the moment its words are written for, and its audience. Moved whole
 * from run-playbook.ts (decision 0118), which reads them; pure, with no port.
 */
import {
  isOccasionTrigger,
  localDate,
  planRun,
  slotShort,
  triggerOf,
  visitFactsFor,
  waitsForKept,
  type Audience,
  type PersonRowVM,
  type RunPlan,
  type RunReach,
  type SequenceMode,
} from "@chanlytics/contracts";
import type {
  FreedTimeRun,
  LateReminderRun,
  OccasionRun,
  PlaybookRow,
  RunBy,
  RunContext,
  RunOutcome,
  RunPlaybookCommand,
} from "./ports";

/** Why a run is off (core RunOutcome): what a step says instead of running. */
export type Skipped = Extract<RunOutcome, { outcome: "off" }>["skipped"];

/** A list as it was counted for a run, kept on it (decision 0009, "sends remember"). */
export type KeptList = { token: string; rule: unknown; counted_at: string };

/**
 * What a run was asked for beside its day: a freed time (0082), a late booking (0118), the person an occasion enrolled
 * (0119), or none of them. Each has a batch with no day of its own.
 */
interface AskedFor {
  freed: FreedTimeRun | null;
  late: LateReminderRun | null;
  occasion: OccasionRun | null;
}

/** What a command asks its run for, each named or null. */
export const askedOf = (cmd: RunPlaybookCommand): AskedFor => ({
  freed: cmd.freed ?? null,
  late: cmd.late ?? null,
  occasion: cmd.occasion ?? null,
});

/** A run as its batch reads it: the step, the day, the business's zone and moment, and what it was asked for. */
interface BatchRun extends AskedFor {
  p: PlaybookRow;
  runFor: string;
  ctx: Pick<RunContext, "tz" | "now">;
}

/**
 * Why a run and what it was asked for do not go together, or null. A freed time's step runs when an appointment frees a
 * time and only then, any other step never for one, and a freed time that has begun by the moment its batch would go is
 * a time nobody can have (0082). A step an occasion starts runs for the person its occasion enrolled and only then, any
 * other step never for one (0119). Only the appointment reminder reminds a late booking (0118). Said, and never
 * recorded, so a Run now on it learns why and the day stays open.
 */
export function batchRefusal(step: PlaybookRow, { freed, late, occasion }: AskedFor, goesAt: Date): Skipped | null {
  const freedStep = triggerOf(step.trigger)?.kind === "freed";
  if (freedStep !== (freed !== null)) return freedStep ? "no_freed_time" : "not_a_freed_time_step";
  if (freed && freed.start <= goesAt.getTime()) return "freed_time_passed";
  const occasionStep = isOccasionTrigger(step.trigger);
  if (occasionStep !== (occasion !== null)) return occasionStep ? "no_occasion" : "not_an_occasion_step";
  // A run about one visit, after the day's look: a late booking's reminder (0118), or a late Kept's thank-you (0123).
  return late && triggerOf(step.trigger)?.kind !== "visit" ? "not_a_reminder_step" : null;
}

/**
 * A batch's name and what it is kept by: a run's day, or for a freed time, which has no day of its own, the time it offers
 * and the appointment that freed it, the name saying the time by its date ("Fill a cancellation · Tue, Sep 8, 3:00 PM", 0082):
 * a name is kept, and a "tomorrow" in it would be wrong by morning. A late booking's reminder (0118) and an occasion's
 * step (0119) have no day either: the name says the visit, or for an occasion that names none the moment it was made.
 */
export function batchWhen(run: BatchRun) {
  const { p: step, freed, late, occasion, runFor, ctx } = run;
  if (late) return { name: `${step.name} · ${slotShort(late.startsAt, ctx.tz)}` };
  if (occasion) return { name: `${step.name} · ${slotShort(occasion.visit?.startsAt ?? ctx.now.getTime(), ctx.tz)}` };
  if (!freed) return { name: `${step.name} · ${runFor}`, run_for: runFor };
  return {
    name: `${step.name} · ${slotShort(freed.start, ctx.tz)}`,
    offered_start: new Date(freed.start).toISOString(),
    offered_end: new Date(freed.end).toISOString(),
    offered_from: freed.from,
  };
}

/**
 * The moment a waiting batch's wait ends, where it has one of its own for its notice to say: the time a freed time
 * offers (0082), or the start of the visit a two-hour reminder is about (0119). Null for every other batch, whose wait
 * ends with its day or its day's sending hours (contracts batchWaitWords).
 */
export function waitEndOf({ p: step, freed, occasion }: Pick<BatchRun, "p" | "freed" | "occasion">): number | null {
  if (freed) return freed.start;
  return step.trigger === "visit_soon" ? (occasion?.visit?.startsAt ?? null) : null;
}

/**
 * What the batch does (contracts planRun, decision 0064): a person who asks has decided, and it sends now; any other goes
 * by its mode. A late booking's reminder goes at its own time, never before it (0118).
 */
export function batchPlan(by: RunBy, mode: SequenceMode, now: Date, late: LateReminderRun | null): RunPlan {
  const plan: RunPlan = by.kind === "user" ? { kind: "send", state: "scheduled", at: now } : planRun(mode, now);
  return late && plan.kind === "send" && plan.at.getTime() < late.at ? { ...plan, at: new Date(late.at) } : plan;
}

/**
 * What a run with a time of its own adds to its record (0118, 0119): the edge reads it, and never stamps the day for
 * it, since the day's own run stands beside it.
 */
export const ownTimeMark = ({ late, occasion }: AskedFor): { late?: true; occasion?: true } => {
  if (late) return { late: true };
  return occasion ? { occasion: true } : {};
};

/**
 * The moment a run's words are written for: the moment it goes. A late booking's reminder that waits for its owner has
 * none yet, and keeps the moment it was to go (0118): made at eleven at night for the morning, "today at 2:00 PM" is the
 * morning's, and an approval is refused on any later day (contracts runApprovalRefusal).
 */
export const saidAtOf = (late: LateReminderRun | null, goesAt: Date): Date =>
  late && late.at > goesAt.getTime() ? new Date(late.at) : goesAt;

/**
 * The words an occasion's message keeps for its one person (0119): which occasion it answers, and for one about a visit
 * the visit's time or day as it reads at the moment the words are read, with what the send asks the record again by
 * (contracts appointmentHolds: the visit's key, its start, and when the run read it).
 */
export function occasionFactsFor(
  run: Pick<BatchRun, "p"> & { ctx: Pick<RunContext, "tz" | "now"> },
  occasion: OccasionRun,
  saidAt: Date,
): (person: PersonRowVM) => Record<string, string> {
  const { p: step, ctx } = run;
  const visit = occasion.visit;
  return (person) => {
    const base = { occasion: occasion.occasion };
    if (!visit) return base;
    const start = new Date(visit.startsAt).toISOString();
    const words = visitFactsFor(
      step.trigger,
      { start, title: visit.title ?? "", all_day: visit.allDay },
      ctx.tz,
      [person.givenName, person.waName],
      saidAt,
    );
    return {
      ...base,
      ...words,
      appointment: visit.key,
      visit_start: start,
      appointment_read_at: ctx.now.toISOString(),
      // A visit marked missed is owed its message only while its row still says so (contracts appointmentHolds).
      ...(step.trigger === "visit_missed" ? { visit_was: "missed" } : {}),
    };
  };
}

/**
 * The run's own audience: the playbook, its moment (which the month's allowance asks at the wire), who it named and left
 * out, the list as it was counted, and for a message about one visit, a late booking's reminder (0118) or an occasion's
 * (0119), that visit and the day its words were written for (`saidAt`): what a batch with no day is too late by. A visit
 * that has begun by then is behind its message (one marked missed), and only the day counts.
 */
export function batchAudience(
  run: BatchRun,
  reach: RunReach,
  kept: { list: KeptList | undefined; saidAt: Date },
): Audience {
  const { p: step, late, occasion, ctx } = run;
  const about = late ?? occasion?.visit ?? null;
  const visit = about
    ? {
        appointment: about.appointment,
        start: new Date(about.startsAt).toISOString(),
        day: localDate(ctx.tz, kept.saidAt),
        ...(about.startsAt <= kept.saidAt.getTime() ? { behind: true as const } : {}),
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

/**
 * A visit's words with what the send asks its row again by (decision 0002, contracts appointmentHolds): which appointment
 * they are about, when it starts, and when the run read it from the calendar, so a message never goes for one that moved
 * or was cancelled since, and the record's older word never holds one the run saw newer. A thank-you keeps that it is
 * owed only while the row still says kept (decision 0123, contracts waitsForKept).
 */
export function withVisitKey(
  trigger: string,
  words: Record<string, string>,
  visit: { key: string; start: string },
  readAt: Date,
): Record<string, string> {
  return {
    ...words,
    appointment: visit.key,
    visit_start: visit.start,
    appointment_read_at: readAt.toISOString(),
    ...(waitsForKept(trigger) ? { visit_was: "kept" } : {}),
  };
}
