/**
 * Who is on a list by its rule (decision 0009): the facts a rule names and what they need, and the judge of one person
 * against one rule. Pure over a person's row (people.ts toPersonRowVM), with no schema: a rule is read (asListRule,
 * list-rules.ts) before it is judged here.
 */
import type { PersonRowVM } from "../person-row";
import { LIST_NEEDS, listFieldOf, type LIST_DAY_OPS, type ListNeed } from "./list-fields";
import type { ListFact, ListRule } from "./list-rules";

/** Every fact in a rule, the ones inside an "any" group too. */
function ruleFacts(rule: ListRule): ListFact[] {
  return rule.all.flatMap((c) => ("any" in c ? c.any : [c]));
}

/** What one fact needs: its field's needs, and a value's own (waiting on YOU, a consultation). */
function factNeeds(f: ListFact): ListNeed[] {
  const needs = new Set<ListNeed>(listFieldOf(f.field).needs);
  if (f.field === "standing" && f.value === "waiting_on_you") needs.add("viewer");
  if (f.field === "assigned" && f.value !== "nobody") needs.add("viewer");
  if (f.field === "deal_stage" && f.value === "consultation") {
    needs.add("calendar");
    needs.add("consult");
  }
  return LIST_NEEDS.filter((n) => needs.has(n));
}

/** What a rule needs, in LIST_NEEDS' order. A list it reads adds that list's needs (lists.ts listNeeds). */
export function ruleNeeds(rule: ListRule): ListNeed[] {
  const needs = new Set(ruleFacts(rule).flatMap(factNeeds));
  return LIST_NEEDS.filter((n) => needs.has(n));
}

/** The lists a rule reads, by token (in_list). */
export function ruleLists(rule: ListRule): string[] {
  return [...new Set(ruleFacts(rule).flatMap((f) => (f.field === "in_list" ? [f.list] : [])))];
}

type DayOp = (typeof LIST_DAY_OPS)[number];

/** A day fact over a count of the workspace's dates (null: no such moment). */
function dayHolds(days: number | null, op: DayOp, n: number | undefined): boolean {
  switch (op) {
    case "never":
      return days === null;
    case "ever":
      return days !== null;
    case "within":
      return days !== null && days <= (n ?? 0);
    case "more_than":
      return days !== null && days > (n ?? 0);
    case "this_week":
      return false;
  }
}

/** Whether a person is on a list another list's rule reads: the judge answers it before this runs (lists.ts). */
export type InList = (token: string, personId: string) => boolean;

const noLists: InList = () => false;

/** One fact over one person. A fact the row does not have (no visit, never heard from) holds only `never`. */
export function factHolds(f: ListFact, v: PersonRowVM, inList: InList = noLists): boolean {
  const is = "op" in f && f.op === "is";
  switch (f.field) {
    case "last_visit":
      return dayHolds(v.lastVisitDays, f.op, f.days);
    case "next_visit":
      return f.op === "this_week" ? v.nextVisitThisWeek : dayHolds(v.nextVisitDays, f.op, f.days);
    case "missed_visit":
      return dayHolds(v.missedVisitDays, f.op, f.days);
    case "last_heard":
      return dayHolds(v.heardDays, f.op, f.days);
    case "first_contact":
      // Within the last N days only on a real date: an import's floor says their first contact was earlier.
      return f.op === "within" && !v.firstContact.evidence ? false : dayHolds(v.firstDays, f.op, f.days);
    case "booked":
      return v.booked === f.yes;
    case "asked_not_booked":
      return v.askedNotBooked === f.yes;
    case "has_chat":
      return v.hasChat === f.yes;
    case "stopped":
      return v.stopped === f.yes;
    case "consultation":
      return v.consultationVisit === f.yes;
    case "step_due":
      return v.stepDue === f.yes;
    case "said_yes":
      return v.saidYes[f.to] === f.yes;
    case "can_receive":
      return v.canReceive[f.to] === f.yes;
    case "channel":
      return v.channels.includes(f.channel) === is;
    case "came_from":
      return (v.cameFrom?.key === f.from) === is;
    case "calls":
      return f.op === "at_least" ? v.calls >= f.n : v.calls <= f.n;
    case "conversations":
      return f.op === "at_least" ? v.threads >= f.n : v.threads <= f.n;
    case "standing":
      return (v.standing === f.value) === is;
    case "assigned":
      return (v.assigned === f.value) === is;
    case "deal_stage":
      // Any stage they stand at (0029): a client with a proposal out for another service is in both lists.
      return v.dealStages.includes(f.value) === is;
    case "in_list":
      return inList(f.list, v.id) === is;
  }
}

/** Whether a person is on a list by its rule: every condition holds, an "any" group when one of its facts does. */
export function listRuleMatches(rule: ListRule, v: PersonRowVM, inList: InList = noLists): boolean {
  return rule.all.every((c) => ("any" in c ? c.any.some((f) => factHolds(f, v, inList)) : factHolds(c, v, inList)));
}
