/**
 * The lists the product ships (decision 0009), each a rule in the language an owner writes theirs in, with their groups
 * and words: what a page names a list by, and judges a person against (list-match.ts), with no schema behind it.
 */
import { DEAL_STAGE_WORDS } from "../../deals/deal-words";
import { STOP_WORDS } from "../../consent/consent";
import { HELD_WORDS, NEEDS_YOU_WORD } from "../../conversations/standing";
import type { PersonRowVM } from "../person-row";
import { listRuleMatches, ruleNeeds } from "./list-match";
import type { ListRule } from "./list-rules";

export type PeopleListGroup = "attention" | "journey" | "reach";

/** The rail's three quiet labels: what needs a person, where each person is on the way to a booking, who can be reached. */
export const PEOPLE_LIST_GROUPS: readonly { id: PeopleListGroup; label: string }[] = [
  { id: "attention", label: "Attention" },
  { id: "journey", label: "Journey" },
  { id: "reach", label: "Reach" },
];

/**
 * What the two kinds of list are called wherever lists are grouped by whose they are (decision 0009: a list is one thing, a
 * rule over facts): the ones the product ships, and the ones the workspace made. People's rail, the Campaigns audience
 * and the playbook picker head their two groups with these, and Today's row of pins -- which holds both -- is `pinned`,
 * never "Your lists". They were "Smart lists" and "Saved" on People, "People's lists" and "Your lists" on Campaigns, and
 * "Your lists" over both on Today. Leads' six views of a lead's stage are not lists (LEAD_WORDS.viewsHeading).
 */
export const LIST_GROUP_WORDS = { builtin: "Ready-made lists", own: "Your lists", pinned: "Pinned lists" } as const;

export interface BuiltinSpec {
  id: string;
  label: string;
  /** What the list holds, in one line: the rail's tip on hover or focus, and the words a picker says under its name. */
  tip: string;
  group: PeopleListGroup;
  rule: ListRule;
  /**
   * False for a list a person's page already says in its own words -- Right now says who needs you, the consent rows
   * say the two answers, the Deal section says the stage -- so their Lists section names only the lists it alone can.
   */
  onProfile?: false;
}

const r = (...all: ListRule["all"]): ListRule => ({ v: 2, all });

/**
 * The lists the product ships, each a rule in the language an owner writes theirs in (decision 0009). Their ids never
 * change: a sent broadcast's audience names them. The journey lists that read the calendar exist only when one is
 * read, the deal lists only where a deal was ever recorded: what each needs comes from its rule (listNeeds).
 */
export const BUILTIN_LISTS: readonly BuiltinSpec[] = [
  {
    id: "needs_you",
    label: NEEDS_YOU_WORD,
    tip: "An open escalation, or a thread waiting for a person",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "needs_you" }),
  },
  // Yours by the one standing rule (standing.ts): you took it over, or your reply paused the receptionist.
  {
    id: "waiting_on_you",
    label: HELD_WORDS.yours.pill,
    tip: "Threads you have: you took them over, or your reply paused the receptionist. A teammate's waits on them",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "waiting_on_you" }),
  },
  // Their next step's day has come (0007, amended): every workspace, deals or not. The page says the step itself.
  {
    id: "steps_due",
    label: "Steps due",
    tip: "Their next step's day has come, or gone by — a note with a day, for the team",
    group: "attention",
    onProfile: false,
    rule: r({ field: "step_due", op: "is", yes: true }),
  },
  // New by the date they first got in touch, whatever their standing: someone new who needs you is both.
  {
    id: "new_week",
    label: "New this week",
    tip: "First contact in the last 7 days, by evidence — imported history never counts",
    group: "journey",
    rule: r({ field: "first_contact", op: "within", days: 7 }),
  },
  // This week, Monday to Sunday, by the workspace's clock.
  {
    id: "booked_week",
    label: "Booked this week",
    tip: "Booked this week, Monday to Sunday",
    group: "journey",
    rule: r({ field: "next_visit", op: "this_week" }),
  },
  {
    id: "booked",
    label: "Booked",
    tip: "Something ahead on your calendar — the booking is the conversion",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: true }),
  },
  // Reports' rule (visit/booked-after-ask.ts visitAnswersAsk): asked in 30 days and nothing on the calendar answers it.
  {
    id: "asked_never_booked",
    label: "Asked, never booked",
    tip: "Wrote or called in the last 30 days, and nothing on your calendar since answers it — the people you can still win",
    group: "journey",
    rule: r({ field: "asked_not_booked", op: "is", yes: true }),
  },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  {
    id: "lapsed",
    label: "Lapsed",
    tip: "Forty-five days or more since they were last on the calendar, nothing ahead — the win-back list, from the calendar rather than silence",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: false }, { field: "last_visit", op: "more_than", days: 44 }),
  },
  // The journey past the booking (0004), as the Pipeline groups it (deals.ts dealStageOf).
  {
    id: "consultation_booked",
    label: "Consultations",
    tip: "A consultation coming up, or one this past week with no proposal since — the Pipeline's Consultations",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "consultation" }),
  },
  {
    id: "proposal_out",
    // A stage's list says its stage's word (S9-9); Clients names the people, not the stage.
    label: DEAL_STAGE_WORDS.proposed,
    tip: "A proposal went out and is waiting on their answer",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "proposed" }),
  },
  {
    id: "clients",
    label: "Clients",
    tip: "Said yes, or paid — the engagement is running",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "won" }),
  },
  {
    id: "deal_passed",
    label: DEAL_STAGE_WORDS.lost,
    tip: "They passed on a proposal",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "lost" }),
  },
  {
    id: "deal_ended",
    label: DEAL_STAGE_WORDS.ended,
    tip: "An engagement that ended — the win-back list for clients",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "ended" }),
  },
  // Heard from them, then nothing for thirty days: someone we never heard from is not quiet, and our own sends are
  // not their word.
  {
    id: "quiet",
    label: "Quiet 30+ days",
    tip: "They haven't written or called in 30 days — your own messages don't count, and someone never heard from isn't quiet",
    group: "reach",
    rule: r({ field: "last_heard", op: "more_than", days: 30 }),
  },
  {
    id: "phoned_only",
    label: "Phoned only",
    tip: "Only ever phoned — no WhatsApp thread",
    group: "reach",
    rule: r({ field: "has_chat", op: "is", yes: false }, { field: "calls", op: "at_least", n: 1 }),
  },
  // TWO LISTS, BECAUSE THERE ARE TWO ANSWERS. This one is the yes to hearing from the business, which says nothing
  // about offers; the next is the promotional audience, who a marketing broadcast may reach: the yes AND a number.
  {
    id: "opted_in",
    label: "Said yes to messages",
    tip: "Said yes to messages — replies, reminders and confirmations",
    group: "reach",
    onProfile: false,
    rule: r({ field: "said_yes", op: "is", to: "messages", yes: true }),
  },
  {
    id: "offers_ok",
    label: "Can receive offers",
    tip: "Said yes to OFFERS, separately, with a number to send to — the only people a promotional send may reach",
    group: "reach",
    onProfile: false,
    rule: r({ field: "can_receive", op: "is", to: "offers", yes: true }),
  },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  {
    id: "opted_out",
    label: STOP_WORDS.pill,
    tip: "Asked to stop; the receptionist stays silent, offers included",
    group: "reach",
    onProfile: false,
    rule: r({ field: "stopped", op: "is", yes: true }),
  },
];

/**
 * The built-ins in the shape the pages have always read: each with its gates and its test, now all from its rule. The
 * test judges a row as it was built (for its viewer, at its moment); what a list needs is for its reader to check
 * (listMembers does).
 */
export const PEOPLE_LISTS: readonly {
  id: string;
  label: string;
  tip: string;
  group: PeopleListGroup;
  rule: ListRule;
  needsCalendar?: boolean;
  needsConsultFirst?: boolean;
  needsDeals?: boolean;
  needsViewer?: boolean;
  onProfile?: false;
  test: (vm: PersonRowVM) => boolean;
}[] = BUILTIN_LISTS.map((l) => {
  const needs = ruleNeeds(l.rule);
  return {
    ...l,
    ...(needs.includes("calendar") ? { needsCalendar: true } : {}),
    ...(needs.includes("consult") ? { needsConsultFirst: true } : {}),
    ...(needs.includes("deals") ? { needsDeals: true } : {}),
    ...(needs.includes("viewer") ? { needsViewer: true } : {}),
    test: (vm: PersonRowVM) => listRuleMatches(l.rule, vm),
  };
});

/**
 * Whether a list's count on People's rail asks for the reader (drawn in amber): the people who need a person and nobody
 * has taken. Said here rather than read off a state's tone (the wiring's second audit, R11 S9-5): the rail took its
 * amber from the tone map, so "You have it" was amber there and blue everywhere else.
 */
export function listAsks(id: string): boolean {
  return id === "needs_you";
}
