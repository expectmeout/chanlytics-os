/**
 * A person enrolled for an occasion (decision 0119): the door the subscriber `occasion_enrol` asks through (core
 * subscribers.ts), injected into the job context by the tick (ops/jobs-tick.ts) as a late booking's reminder is.
 *
 * Something happened to one person, and the sequences that start on it owe them their first step at a time of their own:
 *
 *   an appointment changed   Read as its row stands now, whatever the event said (a delivery may run late or twice).
 *                            Booked: each sequence on `visit_soon` takes its person in for this start, two hours before
 *                            it or where the one rule says (contracts visitSoonAt); a start it had before leaves. Marked
 *                            missed: each sequence on `visit_missed` takes them in, a few minutes on, so the word can be
 *                            taken back (missedFollowUpAt). Cancelled, gone from the calendar or kept: what waited for it
 *                            leaves, and so does a missed visit's message once the word is taken back.
 *   the booking link sent    Each sequence on `asked_no_booking` takes the person in for the next day (askFollowUpAt),
 *                            unless they already hold a visit ahead, or the message was a campaign's own: a follow-up
 *                            that carries the link is not someone asking.
 *
 * Nothing is sent here. A row is kept once per sequence, person and occasion, for good (sequence_occasion_enrol), so a
 * second delivery of the event enrols nobody twice; the sequences' clock finds each row at its time and the job runs or
 * leaves it then (occasions/due.ts), reading the record again. A workspace with no sequence on these moments answers
 * after one read. A read or a write that fails throws, so the delivery tries again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ASK_REST_DAYS,
  DEFAULT_TIMEZONE,
  DbFailure,
  askFollowUpAt,
  askOccasion,
  isOccasionTrigger,
  missedFollowUpAt,
  missedOccasion,
  occasionIsSingle,
  visitOccasion,
  visitOccasionsOf,
  visitSoonAt,
  type ContactId,
  type OccasionEnrolment,
  type OccasionEvent,
  type TenantId,
} from "@chanlytics/contracts";
import {
  enrolOccasion,
  findBookedSince,
  findMessageSentTo,
  findOccasionAppointment,
  leaveOccasions,
  listOccasionSteps,
  type OccasionAppointment,
  type OccasionStep,
} from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { findWorkspaceZoneStatus } from "@chanlytics/db/workspace";

type Db = SupabaseClient<Database>;

/** One enrolment's database, workspace and moment. */
interface Asked {
  db: Db;
  tenantId: TenantId;
  now: Date;
}

/** The business's zone, DEFAULT_TIMEZONE where it keeps none. A read that fails throws: a time is never guessed. */
async function zoneOf({ db, tenantId }: Asked): Promise<string> {
  const { data, error } = await findWorkspaceZoneStatus(db, tenantId);
  if (error) throw new DbFailure(error, "occasions: the workspace's zone");
  return data?.timezone || DEFAULT_TIMEZONE;
}

/** Each of these sequences takes the person in for the occasion: how many did. */
async function enrolIn(
  { db, tenantId }: Asked,
  steps: readonly OccasionStep[],
  entry: { contactId: ContactId; occasion: string; dueAt: (step: OccasionStep) => number; replaces?: string },
  restDays = 0,
): Promise<number> {
  let enrolled = 0;
  for (const step of steps) {
    const came = await enrolOccasion(db, {
      tenantId,
      sequenceId: step.sequenceId,
      contactId: entry.contactId,
      occasion: entry.occasion,
      dueAt: new Date(entry.dueAt(step)),
      single: isOccasionTrigger(step.trigger) && occasionIsSingle(step.trigger),
      ...(entry.replaces ? { replaces: entry.replaces } : {}),
      ...(restDays ? { restDays } : {}),
    });
    if (came === "enrolled") enrolled += 1;
  }
  return enrolled;
}

/** A visit that stands: its two-hour reminder for the start it has now, and nothing for any start it had before. */
async function enrolBooked(
  asked: Asked,
  visit: OccasionAppointment & { contactId: ContactId },
  steps: readonly OccasionStep[],
): Promise<OccasionEnrolment> {
  const { db, tenantId, now } = asked;
  const startsAt = Date.parse(visit.startsAt);
  const occasion = visitOccasion(visit.id, startsAt);
  const every = visitOccasionsOf(visit.id);
  // A Missed taken back: the message it started is no longer owed.
  let left = await leaveOccasions(db, { tenantId, startsWith: missedOccasion(visit.id), why: "not_missed" });
  const soon = steps.filter((s) => s.trigger === "visit_soon");
  const due = visitSoonAt({
    startsAt,
    tz: await zoneOf(asked),
    nowMs: now.getTime(),
    // Where a day-before reminder runs, a visit outside the two-hour reminder's hours is already reminded (0118).
    dayBeforeRuns: steps.some((s) => s.trigger === "visit_tomorrow"),
  });
  if (due === null || soon.length === 0) {
    // No reminder is owed for this start: the ones made for its other starts leave; one made for this start, due about
    // now, is the job's to run.
    left += await leaveOccasions(db, { tenantId, startsWith: every, why: "moved", except: occasion });
    return { enrolled: 0, left, why: soon.length === 0 ? "no_step" : "not_owed" };
  }
  const enrolled = await enrolIn(asked, soon, {
    contactId: visit.contactId,
    occasion,
    dueAt: () => due,
    replaces: every,
  });
  return enrolled > 0 ? { enrolled, left } : { enrolled, left, why: "already" };
}

/** A visit marked missed: its reminders leave, and each sequence on the missed visit takes its person in. */
async function enrolMissed(
  asked: Asked,
  visit: OccasionAppointment & { contactId: ContactId },
  steps: readonly OccasionStep[],
): Promise<OccasionEnrolment> {
  const { db, tenantId, now } = asked;
  const left = await leaveOccasions(db, { tenantId, startsWith: visitOccasionsOf(visit.id), why: "visit_begun" });
  const missed = steps.filter((s) => s.trigger === "visit_missed");
  if (missed.length === 0) return { enrolled: 0, left, why: "no_step" };
  const due = missedFollowUpAt({ markedAt: now.getTime(), startsAt: Date.parse(visit.startsAt) });
  if (due === null) return { enrolled: 0, left, why: "not_owed" };
  const enrolled = await enrolIn(asked, missed, {
    contactId: visit.contactId,
    occasion: missedOccasion(visit.id),
    dueAt: () => due,
  });
  return enrolled > 0 ? { enrolled, left } : { enrolled, left, why: "already" };
}

/** Everything that waits for an appointment leaves: it was cancelled, is gone from the calendar, or was kept. */
async function leaveVisit({ db, tenantId }: Asked, appointmentId: string, why: string): Promise<number> {
  const reminders = await leaveOccasions(db, { tenantId, startsWith: visitOccasionsOf(appointmentId), why });
  const missed = await leaveOccasions(db, { tenantId, startsWith: missedOccasion(appointmentId), why: "not_missed" });
  return reminders + missed;
}

/** An appointment's change, read as its row stands now. */
async function enrolFromAppointment(asked: Asked, appointmentId: string): Promise<OccasionEnrolment> {
  const { db, tenantId } = asked;
  // The day-before reminder is read beside the two an occasion starts: it decides whether an early visit gets the other.
  const steps = await listOccasionSteps(db, tenantId, ["visit_soon", "visit_missed", "visit_tomorrow"]);
  if (!steps.some((s) => s.trigger !== "visit_tomorrow")) return { enrolled: 0, left: 0, why: "no_step" };
  const visit = await findOccasionAppointment(db, tenantId, appointmentId);
  if (!visit || visit.vanished || visit.status === "cancelled")
    return { enrolled: 0, left: await leaveVisit(asked, appointmentId, "visit_gone"), why: "gone" };
  if (visit.status === "kept")
    return { enrolled: 0, left: await leaveVisit(asked, appointmentId, "visit_begun"), why: "not_owed" };
  const { contactId } = visit;
  if (!contactId) return { enrolled: 0, left: 0, why: "nobody" };
  if (visit.status === "missed") return enrolMissed(asked, { ...visit, contactId }, steps);
  // One still proposed is nobody's visit yet: its confirmation is the event that enrols.
  if (visit.status !== "booked") return { enrolled: 0, left: 0, why: "not_owed" };
  return enrolBooked(asked, { ...visit, contactId }, steps);
}

/** The booking link sent to someone: tomorrow's follow-up, where they hold no visit and it was not a campaign's message. */
async function enrolFromAsk(asked: Asked, messageId: string): Promise<OccasionEnrolment> {
  const { db, tenantId, now } = asked;
  const steps = await listOccasionSteps(db, tenantId, ["asked_no_booking"]);
  if (steps.length === 0) return { enrolled: 0, left: 0, why: "no_step" };
  const sent = await findMessageSentTo(db, tenantId, messageId);
  if (!sent) return { enrolled: 0, left: 0, why: "nobody" };
  if (sent.campaign) return { enrolled: 0, left: 0, why: "not_owed" };
  const askedAt = Date.parse(sent.at);
  const booked = await findBookedSince(db, tenantId, {
    contactId: sent.contactId,
    since: new Date(askedAt),
    now,
    apartFrom: null,
  });
  // The link went to someone who already holds a visit (to move it, or for a friend): nobody to follow up with.
  if (booked.ahead || booked.since) return { enrolled: 0, left: 0, why: "not_owed" };
  const tz = await zoneOf(asked);
  const enrolled = await enrolIn(
    asked,
    steps,
    {
      contactId: sent.contactId,
      occasion: askOccasion(messageId),
      dueAt: (step) => askFollowUpAt({ askedAt, tz, runHour: step.runHour }),
    },
    ASK_REST_DAYS,
  );
  return enrolled > 0 ? { enrolled, left: 0 } : { enrolled, left: 0, why: "already" };
}

/** Enrol whoever an event's occasion is owed to, in each sequence that starts on it: what came of it. */
export async function enrolOccasions(
  db: Db,
  tenantId: TenantId,
  event: OccasionEvent,
  now: Date = new Date(),
): Promise<OccasionEnrolment> {
  const asked: Asked = { db, tenantId, now };
  return event.about === "appointment"
    ? enrolFromAppointment(asked, event.appointmentId)
    : enrolFromAsk(asked, event.messageId);
}
