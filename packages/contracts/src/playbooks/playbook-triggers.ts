/**
 * What starts a playbook, and the playbook's standing limits: the triggers, the states, the defaults and the hours a
 * run may send in. Moved whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { DAY_MS } from "./playbook-time";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import type { SchemaSet } from "../shared/schema-sets";
import { MIN_MS } from "../shared/time";
import { plural } from "../shared/words";

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
  // its link, under its own class, where deals are on. Conversational: it answers the person's own request.
  {
    id: "proposal_waiting",
    label: "Proposal follow-up",
    list: null,
    cls: "follow_up",
    kind: "deal",
    hint: "A proposal waiting with nothing back",
  },
  // Reach out (Part 3): a chain's first email, over a lead search, and a step days after the one before it. Made by
  // the reach-out sheet (Part 4), never offered among the moments (triggerOffered).
  {
    id: "lead_first",
    label: "Businesses a search found",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "The first email of a reach-out",
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

export type PlaybookPolicyClass = SchemaSet<"playbooks.policy_class">;

export const PLAYBOOK_STATES = ["running", "paused"] as const;

export type PlaybookState = (typeof PLAYBOOK_STATES)[number];

export const PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 } as const;

export const PLAYBOOK_HOURS = { min: 9, max: 20 } as const;

/** The hours a send may go out in, as the pages say them: "9:00–20:59", "between 9:00 and 20:59", and the hour a moved send waits for. */
export const SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00–${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`,
} as const;

/** One playbook message per person per week, across playbooks. */
export const PLAYBOOK_BREATH_MS = 7 * DAY_MS;

/** Under veto, a run is scheduled this far ahead with a Stop. */
export const PLAYBOOK_VETO_DELAY_MS = 30 * MIN_MS;

/** A wait a page promises, in whole minutes or hours as a sentence says it: "30 minutes", "an hour", "2 hours". */
export function delayWords(ms: number): string {
  const minutes = Math.round(ms / MIN_MS);
  if (minutes < 60 || minutes % 60) return plural(minutes, "minute");
  return minutes === 60 ? "an hour" : plural(minutes / 60, "hour");
}

/**
 * The veto window in those words. Every sentence that promises it (the Autonomy rows, the reach-out sheet, Ask's
 * definitions and cards) says this, so a change to the wait changes what each one says.
 */
export const PLAYBOOK_VETO_DELAY_WORDS = delayWords(PLAYBOOK_VETO_DELAY_MS);

/**
 * What the owner is told when the sweep makes a run under veto: it goes by itself `when` (the business's clock, with
 * its day: "today 10:30 AM", "tomorrow 9:00 AM") unless a person stops it, and the promise "unless you stop it" is only kept for someone who is told. A run a person
 * asked for is not told: they decided it. Said on the bell and by mail (core run-playbook.ts).
 */
export function vetoRunNotice(name: string, people: number, when: string): { subject: string; body: string } {
  const who = `${people} ${people === 1 ? "person" : "people"}`;
  return {
    subject: `Campaign “${name}” sends ${when}: ${who}`,
    body: `${who} will be sent “${name}” ${when}. Stop the run on Today or in Campaigns before then if it should not go.`,
  };
}

export const PLAYBOOK_NAME_MAX = 80;

/** What a moment's doors say when handed a reach-out's step: the one refusal, in one place. */
export const REACH_OUT_IS_NOT_A_MOMENT =
  "A reach-out is made on its own sheet, from a search's leads, not among the moments.";

export function triggerOf(id: string): (typeof PLAYBOOK_TRIGGERS)[number] | null {
  return PLAYBOOK_TRIGGERS.find((t) => t.id === id) ?? null;
}

/**
 * Whether a moment is offered in a workspace (0006): every one, and a proposal's only where deals are on
 * (dealsAreOn, 0008). The Playbooks page, its counts, Ask and the check that makes a playbook all read it. A
 * reach-out's steps are never moments: the reach-out sheet makes them (Reach out, Part 4).
 */
export function triggerOffered(t: { kind: string }, dealsOn: boolean): boolean {
  if (t.kind === "reach_out") return false;
  return t.kind !== "deal" || dealsOn;
}

/**
 * The moments no longer offered for a new playbook (2 Oct 2026), each with why. A playbook already made on one keeps
 * running: the run asks triggerOffered, which they still pass.
 */
export const MOMENTS_RETIRED: Partial<Record<PlaybookTrigger, string>> = {
  new_week:
    "Your receptionist answers a first contact itself, and asks there for the yes to offers that a welcome would need.",
  phoned_only:
    "The call's text does this during the call: the booking link and your WhatsApp, sent when a caller asks for them.",
};

/**
 * The two win-backs, which are one moment read the one way a workspace can: by silence (quiet_30) where no calendar is
 * connected, by visits (lapsed) where one is. momentOffered offers the one; the Playbooks page counts a playbook on
 * either as the win-back made.
 */
const WIN_BACKS: readonly string[] = ["quiet_30", "lapsed"];

export function isWinBack(id: string): boolean {
  return WIN_BACKS.includes(id);
}

/**
 * A trigger's label and hint in the workspace's word (J1): an appointment moment's say it ("Session reminder", "After
 * the session", "No session in 45 days…"); every other trigger's are its own. What the composer, the drawer, Ask's card
 * and a new campaign's name read, so a page says one word.
 */
export function triggerWords(
  t: { id: string; label: string; hint: string },
  word: AppointmentWord,
): { label: string; hint: string } {
  const W = appointmentWords(word);
  if (t.id === "visit_tomorrow") return { label: W.before.name, hint: W.before.hint };
  if (t.id === "visited") return { label: W.after.caps, hint: W.after.hint };
  if (t.id === "lapsed") return { label: t.label, hint: W.lapsedHint };
  return { label: t.label, hint: t.hint };
}

/** What the check says of the win-back this workspace cannot read, when a new campaign asks for it, in its word. */
export function winBackWords(word: AppointmentWord): { quiet_30: string; lapsed: string } {
  const W = appointmentWords(word);
  const silence = (triggerOf("quiet_30")?.hint ?? "").toLowerCase();
  return {
    quiet_30: `A calendar is connected here, so the win-back goes ${W.byMany}: ${W.lapsedHint.toLowerCase()}. Start that one.`,
    lapsed: `The win-back ${W.byMany} needs your calendar, and none is connected. Start the one that goes by silence: ${silence}.`,
  };
}

/**
 * Whether a new campaign on a moment is offered by whether a calendar is connected here: the two win-backs (by visits
 * only with one, by silence only without) and the appointment moments (only with one). The calendar set, declared once:
 * momentOffered reads it, and so does the check that makes a campaign, which asks for the calendar only here and says
 * why a moment of it is refused.
 */
export function momentReadsCalendar(t: { id: string; kind: string }): boolean {
  return isWinBack(t.id) || t.kind === "visit";
}

/**
 * Whether a moment is offered for a NEW campaign (2 Oct 2026, the lifecycle set): offered here at all
 * (triggerOffered), not retired (MOMENTS_RETIRED), of the two win-backs the one this workspace can read (by visits where
 * a calendar is connected, by silence where none is), and an appointment moment only where a calendar is connected
 * (decision 44 of 9 Oct 2026): without one its run reads nothing and skips every day. Campaigns' moments, its composer,
 * Ask's proposals and the check that makes a campaign ask this; the run never does, so one made before keeps running.
 * `calendarOn` is a calendar connected here, whether or not its feed can be read just now: the page's calendar state is
 * not "none".
 */
export function momentOffered(t: { id: string; kind: string }, o: { dealsOn: boolean; calendarOn: boolean }): boolean {
  if (!triggerOffered(t, o.dealsOn)) return false;
  if (t.id in MOMENTS_RETIRED) return false;
  if (!momentReadsCalendar(t)) return true;
  return t.id === "quiet_30" ? !o.calendarOn : o.calendarOn;
}

/**
 * Whether an Autonomy class is offered in a workspace: a class no moment runs under, or one a moment offered here
 * runs under, or the reach-outs', which the reach-out sheet makes. So the follow-ups' row is only where deals are on
 * (0006), and every other row is everywhere.
 */
export function policyClassOffered(cls: string, dealsOn: boolean): boolean {
  // The reach-outs' row: no moment runs under it, but its own sheet makes chains that do (Reach out, Part 4 PR 6).
  if (cls === "outreach") return true;
  const runs = PLAYBOOK_TRIGGERS.filter((t) => t.cls === cls);
  return runs.length === 0 || runs.some((t) => triggerOffered(t, dealsOn));
}
