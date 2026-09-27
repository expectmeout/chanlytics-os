/**
 * What starts a playbook, and the playbook's standing limits: the triggers, the states, the defaults and the hours a
 * run may send in. Moved whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { DAY_MS } from "./playbook-time";
import type { SchemaSet } from "../shared/schema-sets";
import { MIN_MS } from "../shared/time";

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
    label: "Visit reminder",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day before an appointment on the calendar",
  },
  {
    id: "visited",
    label: "After the visit",
    list: null,
    cls: "reengage",
    kind: "visit",
    hint: "The day after a visit, when nothing is booked next",
  },
  // People's Lapsed list, by visits rather than silence: the win-back a salon means, which had no playbook of its own
  // (00155). Named for its list, so it is never a second "Win-back" beside the one for the quiet.
  {
    id: "lapsed",
    label: "Lapsed",
    list: "lapsed",
    cls: "reengage",
    kind: "list",
    hint: "No visit in 45 days, and nothing booked",
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
