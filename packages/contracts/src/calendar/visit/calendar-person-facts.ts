/**
 * What the Calendar says of the person a visit is for, beyond who they are (the Calendar's lane D, 13 Oct 2026): their
 * standing, the business they work at, their deal, their next step and when they were last in touch. The server works the
 * facts out of the People row the board's own read already holds (server/calendar/week/week.ts reads everyone once, to
 * match the feed), and carries them on the visit (CalendarItemDto.person.facts), so the page never reads People's book of
 * its own: it read it twice for one pill, the server's read and a second whole read in the browser (ROUTE_DRAWS
 * calendar:["people"]), and held the board's deal and business behind window globals.
 *
 * The facts are the row's own columns where a sentence depends on the clock (the deal's, the step's), so the page says
 * them with People's own rules at the minute it draws (deals/vm.ts dealOf, notes/steps.ts nextStepOf): the same words
 * People's row and the person's page say, never a second spelling.
 */
import type { PersonRowDto } from "../../people/person-dto";
import { visitsAt } from "../people/visits";
import { personStateFor, PERSON_STATE_LABELS, type PersonState } from "../../people/person-state";
import { lastContactOf } from "../../people/person-row-facts";
import { dealOf, type DealColumns, type DealVM } from "../../deals/vm";
import { nextStepOf, type PersonNextStepVM, type StepColumns } from "../../notes/steps";
import { businessTrailOf } from "../../people/person-page/business-trail";
import { asNameSource } from "../../people/person-page/words";
import { agoWords } from "../../shared/time";

/** The facts of one person a visit names, on the wire (CalendarItemDto.person.facts). Absent on an older read. */
export interface CalendarPersonFactsDto {
  /** Their standing, as People's list says it (person-state.ts personStateFor), at the read's clock. */
  state: PersonState;
  /** The business they work at, as it trails their name (people/person-page/business-trail.ts); null for none. */
  business: string | null;
  /** Their deal's columns as people_list carries them (the newest open or current deal), or null without one. */
  deal: Partial<DealColumns> | null;
  /** Their next step's columns as people_list carries them, or null without one. */
  step: StepColumns | null;
  /** When they were last in touch, and how: their message or call, or ours. Null `at` for none recorded. */
  last: { at: string | null; by: string };
  /** Their number (E.164) and address, for Call and the copy in the sheet's More; null for none. */
  phone: string | null;
  email: string | null;
  /**
   * When their next visit begins, at the read's clock (visitsAt), or null with none ahead: a consultation with a visit
   * booked after it waits on nobody (deals/consultations.ts consultationHeld). Absent from a read before it.
   */
  next_visit_at?: string | null;
  /**
   * When their last visit that is over began (visitsAt's `last`): what Today's day says under who is coming ("Last here
   * Aug 12"). Null where the record holds none before the one they come for, in the season or before it (the server's
   * getBoardVisits): "First visit". Absent where neither is known (their visits were not read, or none was over in the season
   * and the record was not asked of before it), and from a read before it: then nothing is said.
   */
  last_visit_at?: string | null;
}

/** The deal's columns of a row, and nothing else: what dealOf reads. */
function dealColumnsOf(person: PersonRowDto): Partial<DealColumns> | null {
  if (!person.deal_stage) return null;
  return {
    deal_id: person.deal_id ?? null,
    deal_stage: person.deal_stage,
    deal_service: person.deal_service ?? null,
    deal_proposed_at: person.deal_proposed_at ?? null,
    deal_decided_at: person.deal_decided_at ?? null,
    deal_ended_at: person.deal_ended_at ?? null,
    deal_amount_cents: person.deal_amount_cents ?? null,
    deal_per: person.deal_per ?? null,
  };
}

/** The step's columns of a row, and nothing else: what nextStepOf reads. */
function stepColumnsOf(person: PersonRowDto): StepColumns | null {
  if (!person.step_id || !person.step_body) return null;
  return {
    step_id: person.step_id,
    step_body: person.step_body,
    step_due_on: person.step_due_on ?? null,
    step_for_user_id: person.step_for_user_id ?? null,
    step_deal_id: person.step_deal_id ?? null,
    step_for_name: person.step_for_name ?? null,
    step_for_me: person.step_for_me ?? false,
  };
}

/**
 * A person's facts from their People row, at the read's clock in the business's zone: the server's half. `first`: the
 * record holds no visit of theirs before the one they come for, in the season or before it (the server's getBoardVisits).
 */
export function calendarPersonFactsOf(
  person: PersonRowDto,
  tz: string,
  nowMs: number,
  first: boolean,
): CalendarPersonFactsDto {
  const last = lastContactOf(person, tz, nowMs);
  const visits = visitsAt(person.visits ?? null, nowMs);
  const lastVisit = visits?.state === "ok" ? (visits.last?.start ?? (first ? null : undefined)) : undefined;
  return {
    ...(lastVisit !== undefined ? { last_visit_at: lastVisit } : {}),
    state: personStateFor(person, nowMs, tz, null),
    business: businessTrailOf({
      nameSource: asNameSource(person.name_source),
      worksAt: person.lead_id ? { name: person.lead_name ?? null, gone: !!person.lead_gone } : null,
    }),
    deal: dealColumnsOf(person),
    step: stepColumnsOf(person),
    last: { at: last.at, by: last.by },
    phone: person.phone_e164 ?? null,
    email: person.email ?? null,
    next_visit_at: visits?.next?.start ?? null,
  };
}

/** The facts as the sheet draws them, said at the page's own minute: the page's half. */
export interface CalendarPersonVM {
  state: PersonState;
  /** "Needs you", "Active", "New", "Quiet": People's word for the standing. */
  stateWord: string;
  business: string | null;
  deal: DealVM | null;
  step: PersonNextStepVM | null;
  /** "They wrote · 3d ago"; null with no contact recorded. */
  last: string | null;
  phone: string | null;
  email: string | null;
  /** When their next visit begins, or null with none ahead (the read's next_visit_at). */
  nextVisitMs: number | null;
}

/** The facts a visit carries, as words at `nowMs` in the business's zone: People's own rules for each. */
export function calendarPersonOf(personFacts: CalendarPersonFactsDto, tz: string, nowMs: number): CalendarPersonVM {
  const at = personFacts.last.at ? Date.parse(personFacts.last.at) : Number.NaN;
  return {
    state: personFacts.state,
    stateWord: PERSON_STATE_LABELS[personFacts.state],
    business: personFacts.business,
    deal: personFacts.deal ? dealOf(personFacts.deal, tz, nowMs) : null,
    step: personFacts.step ? nextStepOf(personFacts.step, tz, nowMs) : null,
    last: Number.isFinite(at) ? `${personFacts.last.by} · ${agoWords(at, nowMs)}` : null,
    phone: personFacts.phone,
    email: personFacts.email,
    nextVisitMs: personFacts.next_visit_at ? Date.parse(personFacts.next_visit_at) : null,
  };
}
