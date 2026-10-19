/**
 * One idea of a list (decision 0009): a rule over facts. A built-in is a rule the product ships; a saved list is a rule
 * the owner writes, or the people the owner put on it. Every consumer holds a reference, `ListRef`, written as the
 * address writes it (`seg:<built-in id>`, `list:<saved list id>`), and asks this module who is on it.
 *
 * Who is on a list is `listMembers`: the people, or "unknown" with the reason it cannot be counted -- a calendar that
 * was not read, deals that are off here, no one looking for a list about "me", a rule this build cannot read, or a list
 * it reads that is gone. Can't tell is never drawn as nobody.
 */
import { asListRule, type ListRule } from "./list-rules";
import { LIST_NEEDS, type ListNeed } from "./list-fields";
import { listRuleMatches, ruleLists, ruleNeeds } from "./list-match";
import { BUILTIN_LISTS, PEOPLE_LISTS, type BuiltinSpec, type PeopleListGroup } from "./builtin-lists";
import type { PersonRowVM } from "../person-row";
import { listToken, parseListToken, type ListRef } from "./list-token";

/* ------------------------------------------------------------------ what a list needs, and who is on it */

/** What a workspace and a reader can give a list: the rows' calendar, a deal on file, a consult-first service, and a viewer. */
export interface ListContext {
  calendar: "ok" | "unavailable" | "none";
  /** A deal was ever recorded here (the server's hasDeals): the deal lists are counted only then. */
  hasDeals: boolean;
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
    deals: ctx.hasDeals,
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

/**
 * How a rule names a list it reads, as People's rail does: a People list by its label, one of the workspace's own by its
 * name (archived or not), and null for a token that names neither. The rail and Ask's lists both say a rule this way.
 */
export function listNamer(saved: readonly { id: string; name: string }[]): (token: string) => string | null {
  return (token) => {
    const ref = parseListToken(token);
    if (!ref) return null;
    return ref.kind === "builtin"
      ? (PEOPLE_LISTS.find((l) => l.id === ref.id)?.label ?? null)
      : (saved.find((l) => l.id === ref.id)?.name ?? null);
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
        ? "This list reads a calendar link. Add one under Settings › Hours & booking to count it."
        : "This list reads your calendar, which can't be read right now.";
    case "consult":
      return "This list exists only where the profile lists a consult-first service under Settings › Hours & booking.";
    case "deals":
      return "This list fills once a deal is recorded here: start a proposal from anyone's page in People.";
    case "viewer":
      return "This list is about whoever is looking, so only a person can count it.";
    case "rule":
      return "This list's rule was written by a newer version of Chanlytics and can't be read here.";
    case "list":
      return "A list this one reads is gone, or can't be counted itself.";
  }
}

/**
 * A saved list's line, where a built-in has its tip: why it can't be counted here, when it can't; what a list kept by
 * hand is for; or the rule a smart list keeps itself current by, in the chips its page shows (listRuleParts).
 */
export function savedListTip(list: {
  byHand: boolean;
  rule: readonly string[] | null;
  unknown: string | null;
}): string {
  if (list.unknown) return list.unknown;
  if (list.byHand) return "A list kept by hand — add people from their profile";
  return `Keeps itself current: ${(list.rule ?? []).join(" · ")}`;
}

/**
 * Whether a saved list's rule is about whoever is looking (standing waiting on you, assigned to me or a teammate): a
 * playbook's run has no one looking, so such a list is never one it runs on (decision 0009). A list kept by hand, or a
 * rule this build can't read, is not.
 */
export function ruleNeedsViewer(rule: unknown): boolean {
  if (rule == null) return false;
  const r = asListRule(rule);
  return !!r && ruleNeeds(r).includes("viewer");
}

/** What a playbook is told of a saved list whose rule is about whoever is looking: a campaign to its reader (decision 19). */
export const viewerListWords = (name: string) =>
  `${name} is about whoever is looking ("me"), and a campaign's run has no one looking. Pick a list that says who by what they did.`;
