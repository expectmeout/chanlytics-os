/** Triggers: kinds. */

import type { SchemaSet } from "../../../shared/schema-sets";
import { MIN_MS } from "../../../shared/time";
import { waitEndsWords } from "../../../waits/rules";

/**
 * What starts a playbook. A list trigger sends to a list that keeps itself
 * current; the cadence trigger to everyone, on a rhythm; a visit trigger to
 * the people the calendar names for one day — the day before an appointment,
 * the day after a visit; a saved trigger to one of the workspace's own lists,
 * named on the playbook (list_id, 00155). The reminder runs under the Booking
 * row of the Autonomy pane: the setting that governs bookings governs their
 * reminders.
 */
export const PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  {
    id: "new_week",
    label: "Welcome",
    list: "new_week",
    cls: "campaign",
    kind: "list",
    hint: "First contact in the last 7 days",
  },
  {
    id: "phoned_only",
    label: "Save our number",
    list: "phoned_only",
    cls: "reengage",
    kind: "list",
    hint: "Only ever phoned, never texted",
  },
  {
    id: "everyone_monthly",
    label: "The month's offer",
    list: null,
    cls: "campaign",
    kind: "cadence",
    hint: "Everyone who said yes, on a cadence",
  },
  {
    id: "visit_tomorrow",
    label: "Appointment reminder",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day before an appointment on the calendar",
  },
  // Under the Booking row since 2 Oct 2026, as the reminder is: its message asks how the appointment went and offers
  // nothing, so it reaches a yes to texts. The labels here are the default word's (contracts appointmentWords, D42); a
  // page and a new campaign's name say the workspace's own (triggerWords), and a name already stored keeps its words
  // until its owner renames it (D43). The id never changes.
  {
    id: "visited",
    label: "After the appointment",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day after an appointment, when nothing is booked next",
  },
  // People's Lapsed list, by visits rather than silence (00155). Since 2 Oct 2026 it IS the win-back where a calendar is
  // connected, and the quiet one is the win-back where none is: one moment, read the one way the workspace can
  // (momentOffered), so both are called Win-back and their hints say which.
  {
    id: "lapsed",
    label: "Win-back",
    list: "lapsed",
    cls: "reengage",
    kind: "list",
    hint: "No appointment in 45 days, and nothing booked",
  },
  // Any list (decision 0009): one of People's (list_key, 00168) or one of the workspace's own (list_id, 00155), kept by
  // hand or by a rule; the card says which. The id stays: playbooks made before any list could be named keep running.
  {
    id: "saved_list",
    label: "On a list",
    list: null,
    cls: "campaign",
    kind: "saved",
    hint: "Everyone on a list: one of People's, or one you keep",
  },
  // A proposal out that has waited past the workspace's pace with nothing back (0006): one nudge per proposal, with
  // its link, under its own class, in every workspace. Conversational: it answers the person's own request.
  {
    id: "proposal_waiting",
    label: "Proposal follow-up",
    list: null,
    cls: "follow_up",
    kind: "deal",
    hint: "A proposal waiting with nothing back",
  },
  // A time a cancellation freed on the calendar (decision 0082): one batch per freed appointment, offered within the
  // hour to the people who asked and never booked. Under the follow-ups' row: it answers the person's own ask, so a text
  // may carry it and an email asks no yes (playbooks/purpose.ts). Run by the event that freed it, never by the hour.
  {
    id: "slot_opened",
    label: "Fill a cancellation",
    list: "asked_never_booked",
    cls: "follow_up",
    kind: "freed",
    hint: "A time a cancellation freed, offered to the people who asked and never booked",
  },
  // Reach out (Part 3): a chain's first email, over a lead search, and a step days after the one before it. Made by
  // the reach-out sheet (Part 4), never offered among the moments (triggerOffered).
  {
    id: "lead_first",
    label: "Businesses a search found",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "The first email to a lead",
  },
  {
    id: "after_step",
    label: "After the step before",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "A nudge, days after the step before",
  },
] as const;

export type PlaybookTrigger = (typeof PLAYBOOK_TRIGGERS)[number]["id"];

/**
 * The moments: every trigger but a reach-out's two. What the Playbooks page counts, what Ask may propose and what the
 * moments' composer offers read this, so a reach-out's steps never reach them (Reach out, Part 3).
 */
export const MOMENT_TRIGGERS = PLAYBOOK_TRIGGERS.filter(
  (t): t is Exclude<(typeof PLAYBOOK_TRIGGERS)[number], { kind: "reach_out" }> => t.kind !== "reach_out",
);

export type PlaybookTriggerKind = (typeof PLAYBOOK_TRIGGERS)[number]["kind"];

export type PlaybookPolicyClass = SchemaSet<"sequence_steps.policy_class">;

export const PLAYBOOK_STATES = ["running", "paused"] as const;

export type PlaybookState = (typeof PLAYBOOK_STATES)[number];

/** Whether a value is one of a playbook's states: a row's, read as the database types it, or a change's, as asked. */
export function isPlaybookState(value: unknown): value is PlaybookState {
  return PLAYBOOK_STATES.some((s) => s === value);
}

export const PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 } as const;

/**
 * A freed time's own (decision 0082): one time is taken by one person, so four are written to, and nobody hears of
 * another freed time within a week (the limits' floor). What a new step on `slot_opened` starts with where none is asked.
 */
export const FREED_TIME_DEFAULTS = { capPerRun: 4, gapDays: 7 } as const;

export const PLAYBOOK_HOURS = { min: 9, max: 20 } as const;

/** The hour the day's sending hours end at (21): nextOpenMoment moves to the next day from it (sendingEndsAt). */
export const SENDING_HOURS_END = PLAYBOOK_HOURS.max + 1;

/**
 * The whole numbers a playbook keeps, each with its range and the words a refusal names it by: what a new playbook's
 * check (core checkPlaybook), a change's (core checkPlaybookPatch) and Ask's starter card read, so a bound is written once.
 */
export const PLAYBOOK_LIMITS = {
  run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
  cap_per_run: { min: 1, max: 500, what: "The cap" },
  gap_days: { min: 7, max: 365, what: "The gap" },
  cadence_days: { min: 1, max: 90, what: "The cadence" },
} as const;

/**
 * The caps the composer offers, a few sensible ones chosen in place (a campaign made before them keeps its own among
 * them): what GET playbooks counts one run's split at (playbooks/run-split.ts), beside each campaign's own cap.
 */
export const PLAYBOOK_CAP_CHOICES: readonly number[] = [5, 10, 25, 50, 100, 250, 500];

/**
 * The hours a send may go out in, as the pages say them: "9:00–20:59", "between 9:00 and 20:59", the hour a moved send
 * waits for, and the hour they end at ("21:00"), when a visit's batch made for today can no longer go today
 * (sendingEndsAt).
 */
export const SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00–${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`,
  end: `${SENDING_HOURS_END}:00`,
} as const;

/**
 * Why a send moved past the night, in the clause every place that says the moment it moved to says beside it: the send
 * screen's notes (surfaces/campaigns/broadcasts/when.tsx) and Ask's broadcast card. Read from the hours it is handed (the
 * page's clock hands these), when it is said.
 */
export const sendsWaitWords = (hours: Pick<typeof SENDING_HOURS_WORDS, "range"> = SENDING_HOURS_WORDS): string =>
  `sends wait for ${hours.range}`;

/** A send that goes now, as every receipt says it: what whenItGoes answers when there is no later moment to name. */
export const SENDING_NOW_WORDS = "sending now";

/** What a send's or an approve's answer says of its time: when it goes, and where the server moved it, from when. */
export interface WhenItGoesReceipt {
  scheduled_for?: string | null;
  moved_from?: string | null;
  /** A message sent once, pressed for now: it goes SEND_ONCE_STOP_MS on, unless it is stopped (decision 0064, step 3). */
  pressed_now?: boolean | null;
}

/**
 * When a send or an approved run goes, from the server's answer, in the one sentence every receipt says it: Sent's toast,
 * Today's, a campaign's drawer and Ask's card (the wiring's second audit, S9-9 and S9-10: the page's bcWhenWords and Ask's
 * runGoes were two implementations). The server moves a send asked for outside the sending hours to the next open one
 * (`moved_from` set), and the receipt says so rather than "sending now" over a run that waits until morning. `when` words an
 * instant by the business's clock (the page's own, or the zone Ask's card carries); a moment within a minute is now.
 */
export function whenItGoes(
  receipt: WhenItGoesReceipt | null | undefined,
  when: (atMs: number) => string,
  nowMs: number,
): string {
  const at = receipt?.scheduled_for ? Date.parse(receipt.scheduled_for) : NaN;
  if (Number.isNaN(at)) return SENDING_NOW_WORDS;
  if (receipt?.moved_from)
    return `scheduled for ${when(at)} — messages go out ${SENDING_HOURS_WORDS.between} by your clock`;
  // Pressed for now, it goes in ten minutes unless stopped (decision 0064, step 3), as the wait rule says it.
  if (receipt?.pressed_now && at > nowMs) {
    const goes = waitEndsWords("one_off", when(at));
    return `${goes.charAt(0).toLowerCase()}${goes.slice(1)}`;
  }
  return at - nowMs > MIN_MS ? `scheduled for ${when(at)}` : SENDING_NOW_WORDS;
}

/** Under veto, a run is scheduled this far ahead with a Stop. */
export const PLAYBOOK_VETO_DELAY_MS = 30 * MIN_MS;
