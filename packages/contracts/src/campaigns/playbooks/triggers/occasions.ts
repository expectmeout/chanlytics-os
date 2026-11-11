/**
 * Which moments an occasion starts (decision 0119), and how each is worded. Apart from the rules of an occasion
 * (playbooks/occasions.ts: what names one, when its step is due, whether it is still owed), so the modules that word a
 * moment read these without the clock.
 */
import { appointmentWords, type AppointmentWord } from "../../../journey/appointment-word";
import type { PlaybookTrigger } from "./kinds";
import { triggerOf } from "./notices";

/** The moments an occasion starts: their people are enrolled by what happened to them, never read by the hour. */
export type OccasionTrigger = Extract<PlaybookTrigger, "visit_soon" | "visit_missed" | "asked_no_booking">;

export function isOccasionTrigger(trigger: string | null | undefined): trigger is OccasionTrigger {
  return triggerOf(trigger ?? "")?.kind === "occasion";
}

/**
 * Whether a person holds one occasion of a moment at a time. A missed visit and an ask each start a conversation that
 * may run to later steps, so a second one while the first stands adds nothing; a visit's reminder is owed to every
 * visit, and someone with two booked gets two.
 */
export function occasionIsSingle(trigger: OccasionTrigger): boolean {
  return trigger !== "visit_soon";
}

/**
 * How a moment's message speaks of a visit, where it is about one: ahead, with its time ("today at 2:00 PM"), or behind,
 * by its day ("yesterday"). The day-before reminder and the thank-you are a visit's own moments (kind `visit`); the
 * two-hour reminder and the missed visit are an occasion's. Null for a moment that names no visit.
 */
export function visitSideOf(trigger: string | null | undefined): "ahead" | "behind" | null {
  if (trigger === "visit_tomorrow" || trigger === "visit_soon") return "ahead";
  return trigger === "visited" || trigger === "visit_missed" ? "behind" : null;
}

/**
 * Whether a moment's message waits for a member's word that the person came (decision 0122): the thank-you the day
 * after a visit. It thanks them for coming, and may ask for a review, so it goes only for a visit the record says was
 * kept. One nobody has marked is named and left out, counted (playbookRunReach's `unmarked`); the send asks the row once
 * more (appointmentHolds); and a visit marked kept after the day's look is thanked on its own (keptThanksAt).
 */
export function waitsForKept(trigger: string | null | undefined): boolean {
  return trigger === "visited";
}

/**
 * A visit's time as an example of a moment's message says it, the way its run would (playbooks visitWords): with its
 * time where the visit is ahead (tomorrow's the day before, today's two hours before), by its day alone where it is
 * behind (yesterday's the day after; today's for one marked missed, which is written to minutes later). Null for a
 * moment that names no visit, where an example keeps its own.
 */
export function visitWhenExample(trigger: string | null | undefined): string | null {
  const side = visitSideOf(trigger);
  if (side === "ahead") return trigger === "visit_soon" ? "today at 2:00 PM" : "tomorrow at 2:00 PM";
  if (side === "behind") return trigger === "visit_missed" ? "today" : "yesterday";
  return null;
}

/** Whether a moment's message may say a visit's time or day: the slots a visit fills (templates `visit_when`, `visit_service`). */
export function momentNamesVisit(trigger: string | null | undefined): boolean {
  return visitSideOf(trigger) !== null;
}

/**
 * What each occasion's moment is called wherever a moment is worded, in the workspace's word for an appointment: what
 * starts its sequence (short, and as a sentence: `at` is the sequence's hour where the moment keeps one), the line New
 * drafts from, who it goes to, what "of N" counts, the rule its approval sheet lists, and its schedule. One home, so
 * a page, a sheet and Ask say one thing.
 */
export function occasionWords(
  trigger: OccasionTrigger,
  word: AppointmentWord,
): {
  starts: string;
  sentence: (at: string) => string;
  line: string;
  who: string;
  pool: string;
  each: string;
  schedule: (at: string) => string;
} {
  const words = appointmentWords(word);
  if (trigger === "visit_soon")
    return {
      starts: `2 hours before ${words.a}`,
      sentence: () => `Two hours before each ${words.one}`,
      line: `Remind each customer two hours before their ${words.one}`,
      who: `everyone with ${words.a} in two hours`,
      pool: `with ${words.a} in two hours`,
      each: `each has ${words.a} in about two hours`,
      schedule: () => `Two hours before each ${words.one} · once per ${words.one}`,
    };
  if (trigger === "visit_missed")
    return {
      starts: `Missed ${words.one}`,
      sentence: () => `When you mark ${words.a} missed`,
      line: `Offer another time to anyone who misses their ${words.one}`,
      who: `everyone whose ${words.one} you mark missed`,
      pool: `whose ${words.one} was marked missed`,
      each: `each missed ${words.a} and has nothing booked next`,
      schedule: () => `When you mark ${words.a} missed · once per ${words.one}`,
    };
  return {
    starts: "Asked, not booked",
    sentence: (at) => `The day after someone is sent your booking link and does not book${at}`,
    line: "Follow up with anyone who asked to book and hasn’t",
    who: "everyone sent your booking link who has not booked",
    pool: "sent your booking link, and not booked",
    each: "each was sent your booking link and has not booked",
    schedule: (at) => `The next day${at} · once per ask`,
  };
}
