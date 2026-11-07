/**
 * Who is on a list by its rule (decision 0009): the facts a rule names and what they need, and the judge of one person
 * against one rule. Pure over a person's row (people.ts toPersonRowVM), with no schema: a rule is read (asListRule,
 * lists/rules.ts) before it is judged here.
 */
import type { PersonRowVM } from "../person-row/row-facts";
import { LIST_NEEDS, listFieldOf, type LIST_DAY_OPS, type ListNeed } from "./fields";
import type { ListFact, ListRule } from "./rules";

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
function dayHolds(days: number | null, op: DayOp, count: number | undefined): boolean {
  switch (op) {
    case "never":
      return days === null;
    case "ever":
      return days !== null;
    case "within":
      return days !== null && days <= (count ?? 0);
    case "more_than":
      return days !== null && days > (count ?? 0);
    case "this_week":
      return false;
  }
}

/** Whether a person is on a list another list's rule reads: the judge answers it before this runs (lists.ts). */
export type InList = (token: string, personId: string) => boolean;

const noLists: InList = () => false;

/** One fact over one person. A fact the row does not have (no visit, never heard from) holds only `never`. */
export function factHolds(listFact: ListFact, person: PersonRowVM, inList: InList = noLists): boolean {
  const is = "op" in listFact && listFact.op === "is";
  switch (listFact.field) {
    case "last_visit":
      return dayHolds(person.lastVisitDays, listFact.op, listFact.days);
    case "next_visit":
      return listFact.op === "this_week"
        ? person.nextVisitThisWeek
        : dayHolds(person.nextVisitDays, listFact.op, listFact.days);
    case "missed_visit":
      return dayHolds(person.missedVisitDays, listFact.op, listFact.days);
    case "last_heard":
      return dayHolds(person.heardDays, listFact.op, listFact.days);
    case "first_contact":
      // Within the last N days only on a real date: an import's floor says their first contact was earlier.
      return listFact.op === "within" && !person.firstContact.evidence
        ? false
        : dayHolds(person.firstDays, listFact.op, listFact.days);
    case "booked":
      return person.booked === listFact.yes;
    case "asked_not_booked":
      return person.askedNotBooked === listFact.yes;
    case "has_chat":
      return person.hasChat === listFact.yes;
    case "stopped":
      return person.stopped === listFact.yes;
    case "consultation":
      return person.consultationVisit === listFact.yes;
    case "step_due":
      return person.stepDue === listFact.yes;
    case "said_yes":
      return person.saidYes[listFact.to] === listFact.yes;
    case "can_receive":
      return person.canReceive[listFact.to] === listFact.yes;
    case "channel":
      return person.channels.includes(listFact.channel) === is;
    case "came_from":
      return (person.cameFrom?.key === listFact.from) === is;
    case "calls":
      return listFact.op === "at_least" ? person.calls >= listFact.n : person.calls <= listFact.n;
    case "conversations":
      return listFact.op === "at_least" ? person.threads >= listFact.n : person.threads <= listFact.n;
    case "standing":
      return (person.standing === listFact.value) === is;
    case "assigned":
      return (person.assigned === listFact.value) === is;
    case "deal_stage":
      // Any stage they stand at (0029): a client with a proposal out for another service is in both lists.
      return person.dealStages.includes(listFact.value) === is;
    case "in_list":
      return inList(listFact.list, person.id) === is;
  }
}

/** Whether a person is on a list by its rule: every condition holds, an "any" group when one of its facts does. */
export function listRuleMatches(rule: ListRule, person: PersonRowVM, inList: InList = noLists): boolean {
  return rule.all.every((c) =>
    "any" in c ? c.any.some((f) => factHolds(f, person, inList)) : factHolds(c, person, inList),
  );
}
