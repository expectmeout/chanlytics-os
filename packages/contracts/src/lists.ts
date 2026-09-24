/**
 * One idea of a list (decision 0009): a rule over facts. A built-in is a rule the product ships; a saved list is a rule
 * the owner writes, or the people the owner put on it. Every consumer holds a reference, `ListRef`, written as the
 * address writes it (`seg:<built-in id>`, `list:<saved list id>`), and asks this module who is on it.
 *
 * Who is on a list is `listMembers`: the people, or "unknown" with the reason it cannot be counted -- a calendar that
 * was not read, deals that are off here, no one looking for a list about "me", a rule this build cannot read, or a list
 * it reads that is gone. Can't tell is never drawn as nobody.
 */
import {
  asListRule,
  listRuleMatches,
  ruleLists,
  ruleNeeds,
  LIST_NEEDS,
  type ListNeed,
  type ListRule,
} from "./list-rules";
import { SELLS_BY_QUESTION, SELLS_BY_WORDS } from "./deals";
import type { PersonRowVM } from "./people";

/* ------------------------------------------------------------------ the reference */

export type ListRef = { kind: "builtin"; id: string } | { kind: "saved"; id: string };

const SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILTIN_ID = /^[a-z_]{1,40}$/;

/**
 * A list's token, as the address writes it after `clients/`: `seg:<built-in id>` or `list:<saved list id>`. `state:`
 * (People's old standing tabs) reads as `seg:`, since Needs you and Waiting on you are lists.
 */
export function listToken(ref: ListRef): string {
  return ref.kind === "builtin" ? `seg:${ref.id}` : `list:${ref.id}`;
}

/** A token back to its reference, or null for anything else. */
export function parseListToken(token: string | null | undefined): ListRef | null {
  if (typeof token !== "string") return null;
  const at = token.indexOf(":");
  const kind = token.slice(0, at);
  const id = token.slice(at + 1);
  if ((kind === "seg" || kind === "state") && BUILTIN_ID.test(id)) return { kind: "builtin", id };
  if (kind === "list" && SAVED_ID.test(id)) return { kind: "saved", id: id.toLowerCase() };
  return null;
}

/* ------------------------------------------------------------------ the built-ins */

export type PeopleListGroup = "attention" | "journey" | "reach";

/** The rail's three quiet labels: what needs a person, where each person is on the way to a booking, who can be reached. */
export const PEOPLE_LIST_GROUPS: readonly { id: PeopleListGroup; label: string }[] = [
  { id: "attention", label: "Attention" },
  { id: "journey", label: "Journey" },
  { id: "reach", label: "Reach" },
];

interface BuiltinSpec {
  id: string;
  label: string;
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
 * read, the deal lists only where deals are on: what each needs comes from its rule (listNeeds).
 */
export const BUILTIN_LISTS: readonly BuiltinSpec[] = [
  {
    id: "needs_you",
    label: "Needs you",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "needs_you" }),
  },
  // Yours, or nobody's: a teammate's thread waits on them (standing.ts).
  {
    id: "waiting_on_you",
    label: "Waiting on you",
    group: "attention",
    onProfile: false,
    rule: r({ field: "standing", op: "is", value: "waiting_on_you" }),
  },
  // Their next step's day has come (0007, amended): every workspace, deals or not. The page says the step itself.
  {
    id: "steps_due",
    label: "Steps due",
    group: "attention",
    onProfile: false,
    rule: r({ field: "step_due", op: "is", yes: true }),
  },
  // New by the date they first got in touch, whatever their standing: someone new who needs you is both.
  {
    id: "new_week",
    label: "New this week",
    group: "journey",
    rule: r({ field: "first_contact", op: "within", days: 7 }),
  },
  // This week, Monday to Sunday, by the workspace's clock.
  {
    id: "booked_week",
    label: "Booked this week",
    group: "journey",
    rule: r({ field: "next_visit", op: "this_week" }),
  },
  { id: "booked", label: "Booked", group: "journey", rule: r({ field: "booked", op: "is", yes: true }) },
  // Reports' rule (calendar-people.ts visitAnswersAsk): asked in 30 days and nothing on the calendar answers it.
  {
    id: "asked_never_booked",
    label: "Asked, never booked",
    group: "journey",
    rule: r({ field: "asked_not_booked", op: "is", yes: true }),
  },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  {
    id: "lapsed",
    label: "Lapsed",
    group: "journey",
    rule: r({ field: "booked", op: "is", yes: false }, { field: "last_visit", op: "more_than", days: 44 }),
  },
  // The journey past the booking (0004), as the Pipeline groups it (deals.ts dealStageOf).
  {
    id: "consultation_booked",
    label: "Consultations",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "consultation" }),
  },
  {
    id: "proposal_out",
    label: "Proposal out",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "proposed" }),
  },
  {
    id: "clients",
    label: "Clients",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "won" }),
  },
  {
    id: "deal_passed",
    label: "Passed",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "lost" }),
  },
  {
    id: "deal_ended",
    label: "Ended",
    group: "journey",
    onProfile: false,
    rule: r({ field: "deal_stage", op: "is", value: "ended" }),
  },
  // Heard from them, then nothing for thirty days: someone we never heard from is not quiet, and our own sends are
  // not their word.
  {
    id: "quiet",
    label: "Quiet 30+ days",
    group: "reach",
    rule: r({ field: "last_heard", op: "more_than", days: 30 }),
  },
  {
    id: "phoned_only",
    label: "Phoned only",
    group: "reach",
    rule: r({ field: "has_chat", op: "is", yes: false }, { field: "calls", op: "at_least", n: 1 }),
  },
  // TWO LISTS, BECAUSE THERE ARE TWO ANSWERS. This one is the yes to hearing from the business, which says nothing
  // about offers; the next is the promotional audience, who a marketing broadcast may reach: the yes AND a number.
  {
    id: "opted_in",
    label: "Said yes to messages",
    group: "reach",
    onProfile: false,
    rule: r({ field: "said_yes", op: "is", to: "messages", yes: true }),
  },
  {
    id: "offers_ok",
    label: "Can receive offers",
    group: "reach",
    onProfile: false,
    rule: r({ field: "can_receive", op: "is", to: "offers", yes: true }),
  },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  {
    id: "opted_out",
    label: "Opted out",
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

/* ------------------------------------------------------------------ what a list needs, and who is on it */

/** What a workspace and a reader can give a list: the rows' calendar, deals, a consult-first service, and a viewer. */
export interface ListContext {
  calendar: "ok" | "unavailable" | "none";
  dealsOn: boolean;
  consultFirst: boolean;
  /** The rows were built for someone looking (toPersonRowVM's viewer): "me" means them. A playbook has no one. */
  viewer: boolean;
}

/** Why a list cannot be counted: an unmet need, a rule this build cannot read, or a list it reads that is gone. */
export type ListUnknownReason = ListNeed | "rule" | "list";

export type Membership = { state: "ok"; ids: Set<string> } | { state: "unknown"; reason: ListUnknownReason };

/** The first need a context cannot meet, in LIST_NEEDS' order; null when it meets them all. */
export function unmetNeed(needs: readonly ListNeed[], ctx: ListContext): ListNeed | null {
  const met: Record<ListNeed, boolean> = {
    calendar: ctx.calendar === "ok",
    consult: ctx.consultFirst,
    deals: ctx.dealsOn,
    viewer: ctx.viewer,
  };
  return LIST_NEEDS.find((n) => needs.includes(n) && !met[n]) ?? null;
}

/** A saved list as packages/db reads it: its people by hand, or its rule (stored JSON, read by asListRule). */
export interface SavedListLike {
  id: string;
  ids: readonly string[];
  rule?: unknown;
}

/**
 * The lists a rule may read, resolved by token: a built-in, a saved list, or null when it is gone. `readable` is false
 * for a saved list whose rule this build cannot read: it is not a list kept by hand, and a list that reads it cannot be
 * counted either.
 */
export type ListLookup = (token: string) => { rule: ListRule | null; ids: readonly string[]; readable: boolean } | null;

const builtinByToken = (token: string) => {
  const ref = parseListToken(token);
  return ref && ref.kind === "builtin" ? (BUILTIN_LISTS.find((l) => l.id === ref.id) ?? null) : null;
};

/**
 * Who is on a list: a rule over the rows, or the people put on it by hand crossed with the rows (an erased person
 * never counts). Unknown, with the reason, when the rule cannot be read, when the context cannot meet what it needs,
 * or when a list it reads is gone or cannot be counted itself. A list reads another only one level deep: a list that
 * reads a list that reads a list is unknown, never a guess.
 */
export function listMembers(
  list: { ids: readonly string[]; rule?: unknown },
  rows: readonly PersonRowVM[],
  ctx: ListContext,
  lookup: ListLookup = () => null,
): Membership {
  if (list.rule == null) {
    const on = new Set(list.ids);
    return { state: "ok", ids: new Set(rows.filter((v) => on.has(v.id)).map((v) => v.id)) };
  }
  const rule = asListRule(list.rule);
  if (!rule) return { state: "unknown", reason: "rule" };
  const need = unmetNeed(ruleNeeds(rule), ctx);
  if (need) return { state: "unknown", reason: need };
  // The lists it reads, each counted here, one level deep.
  const read = new Map<string, Set<string>>();
  for (const token of ruleLists(rule)) {
    const b = builtinByToken(token);
    const other = b ? { rule: b.rule, ids: [], readable: true } : lookup(token);
    if (!other || !other.readable) return { state: "unknown", reason: "list" };
    if (other.rule && ruleLists(other.rule).length) return { state: "unknown", reason: "list" };
    const m = listMembers(other, rows, ctx);
    if (m.state === "unknown") return m;
    read.set(token, m.ids);
  }
  const inList = (token: string, id: string) => read.get(token)?.has(id) ?? false;
  return { state: "ok", ids: new Set(rows.filter((v) => listRuleMatches(rule, v, inList)).map((v) => v.id)) };
}

/**
 * Who is on a saved list, as a set: the people, or nobody when it cannot be counted. For a reader that only enrols (a
 * send, a playbook's pool) and says its own refusal when nobody is there; the pages read `listMembers` and say why.
 */
export function savedListIds(
  list: SavedListLike,
  rows: readonly PersonRowVM[],
  ctx: ListContext,
  lookup: ListLookup = () => null,
): Set<string> {
  const m = listMembers(list, rows, ctx, lookup);
  return m.state === "ok" ? m.ids : new Set();
}

/** A lookup over the saved lists a reader holds, for the lists a rule reads. */
export function savedListLookup(saved: readonly SavedListLike[]): ListLookup {
  return (token) => {
    const ref = parseListToken(token);
    if (!ref || ref.kind !== "saved") return null;
    const l = saved.find((s) => s.id.toLowerCase() === ref.id);
    if (!l) return null;
    const rule = l.rule == null ? null : asListRule(l.rule);
    return { rule, ids: l.ids, readable: l.rule == null || rule !== null };
  };
}

/** What a list needs, the lists it reads included: a list about a calendar list needs the calendar too. */
export function listNeeds(rule: ListRule | null, lookup: ListLookup = () => null): ListNeed[] {
  if (!rule) return [];
  const needs = new Set(ruleNeeds(rule));
  for (const token of ruleLists(rule)) {
    const b = builtinByToken(token);
    const other = b ? b.rule : lookup(token)?.rule;
    if (other) for (const n of ruleNeeds(other)) needs.add(n);
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}

/* ------------------------------------------------------------------ the registry */

/**
 * A list, resolved: what every consumer reads, whichever kind it is. A saved list's rule is null when it is kept by
 * hand (`byHand`) or when this build cannot read it (`readable` false: it cannot be counted, and is never drawn as a
 * list kept by hand).
 */
export interface ListDef {
  ref: ListRef;
  token: string;
  label: string;
  group: PeopleListGroup | "saved";
  rule: ListRule | null;
  byHand: boolean;
  readable: boolean;
  /** A hand list's people, as stored; empty for a rule. */
  ids: readonly string[];
  needs: ListNeed[];
  onProfile: boolean;
  archived: boolean;
}

/** A saved list as a reader holds it (packages/db SavedListRow): a name, its people or its rule, whether archived. */
export interface SavedListRowLike extends SavedListLike {
  name: string;
  archived_at?: string | null;
}

function builtinDef(l: BuiltinSpec): ListDef {
  const ref: ListRef = { kind: "builtin", id: l.id };
  return {
    ref,
    token: listToken(ref),
    label: l.label,
    group: l.group,
    rule: l.rule,
    byHand: false,
    readable: true,
    ids: [],
    needs: ruleNeeds(l.rule),
    onProfile: l.onProfile !== false,
    archived: false,
  };
}

function savedDef(l: SavedListRowLike, lookup: ListLookup): ListDef {
  const ref: ListRef = { kind: "saved", id: l.id };
  const rule = l.rule == null ? null : asListRule(l.rule);
  return {
    ref,
    token: listToken(ref),
    label: l.name,
    group: "saved",
    rule,
    byHand: l.rule == null,
    readable: l.rule == null || rule !== null,
    ids: l.rule == null ? l.ids : [],
    needs: listNeeds(rule, lookup),
    onProfile: true,
    archived: !!l.archived_at,
  };
}

/**
 * Every list a reader may offer: the built-ins whose needs this context meets (a calendar list without a calendar is
 * not offered, as before), then the workspace's own lists that are not archived, whatever they need -- one it cannot
 * count is still the owner's, and says why.
 */
export function listsFor(ctx: ListContext, saved: readonly SavedListRowLike[]): ListDef[] {
  const lookup = savedListLookup(saved);
  return [
    ...BUILTIN_LISTS.map(builtinDef).filter((d) => !unmetNeed(d.needs, ctx)),
    ...saved.filter((l) => !l.archived_at).map((l) => savedDef(l, lookup)),
  ];
}

/** One list by its reference: a built-in whatever it needs, a saved list archived or not; null when there is none. */
export function resolveList(ref: ListRef | null, saved: readonly SavedListRowLike[]): ListDef | null {
  if (!ref) return null;
  if (ref.kind === "builtin") {
    const b = BUILTIN_LISTS.find((l) => l.id === ref.id);
    return b ? builtinDef(b) : null;
  }
  const l = saved.find((x) => x.id.toLowerCase() === ref.id.toLowerCase());
  return l ? savedDef(l, savedListLookup(saved)) : null;
}

/** Who is on a resolved list (listMembers), with the saved lists its rule may read. */
export function membersOf(
  def: ListDef,
  rows: readonly PersonRowVM[],
  ctx: ListContext,
  saved: readonly SavedListRowLike[] = [],
): Membership {
  if (!def.readable) return { state: "unknown", reason: "rule" };
  return listMembers(def.byHand ? { ids: def.ids } : { ids: [], rule: def.rule }, rows, ctx, savedListLookup(saved));
}

/**
 * Why a list cannot be counted, in the page's words: what it needs and does not have, and what to do about it where
 * there is something to do.
 */
export function listUnknownWords(reason: ListUnknownReason, calendar: ListContext["calendar"]): string {
  switch (reason) {
    case "calendar":
      return calendar === "none"
        ? "This list reads your calendar. Connect it under Settings › Business to count it."
        : "This list reads your calendar, which can't be read right now.";
    case "consult":
      return "This list exists only where the profile lists a consult-first service under Settings › Business.";
    case "deals":
      return `This list exists only where deals are on: the workspace answers “${SELLS_BY_QUESTION}” with “${SELLS_BY_WORDS.proposal.label}”.`;
    case "viewer":
      return "This list is about whoever is looking, so only a person can count it.";
    case "rule":
      return "This list's rule can't be read by this version. Reload the page.";
    case "list":
      return "A list this one reads is gone, or can't be counted itself.";
  }
}
