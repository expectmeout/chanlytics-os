/**
 * What the Calendar says of the person a visit is for, beyond who they are (the Calendar's lane D, 13 Oct 2026): their
 * standing, the business they work at, their deal, their next step and when they were last in touch. The server works the
 * facts out of the People row the board's own read already holds (server/calendar/calendar-week.ts reads everyone once, to
 * match the feed), and carries them on the visit (CalendarItemDto.person.facts), so the page never reads People's book of
 * its own: it read it twice for one pill, the server's read and a second whole read in the browser (ROUTE_DRAWS
 * calendar:["people"]), and held the board's deal and business behind window globals.
 *
 * The facts are the row's own columns where a sentence depends on the clock (the deal's, the step's), so the page says
 * them with People's own rules at the minute it draws (deal-vm.ts dealOf, notes/steps.ts nextStepOf): the same words
 * People's row and the person's page say, never a second spelling.
 */
import type { PersonRowDto } from "../../people/person-dto";
import { visitsAt } from "../calendar-people";
import { personStateFor, PERSON_STATE_LABELS, type PersonState } from "../../people/person-state";
import { lastContactOf } from "../../people/person-row-facts";
import { dealOf, type DealColumns, type DealVM } from "../../deals/deal-vm";
import { nextStepOf, type PersonNextStepVM, type StepColumns } from "../../notes/steps";
import { businessTrailOf } from "../../person-page/business";
import { asNameSource } from "../../person-page/words";
import { agoWords } from "../../shared/time";

/** The facts of one person a visit names, on the wire (CalendarItemDto.person.facts). Absent on an older read. */
export interface CalendarPersonFactsDto {
  /** Their standing, as People's list says it (person-state.ts personStateFor), at the read's clock. */
  state: PersonState;
  /** The business they work at, as it trails their name (person-page/business.ts businessTrailOf); null for none. */
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
   * booked after it waits on nobody (deal-consultations.ts consultationHeld). Absent from a read before it.
   */
  next_visit_at?: string | null;
}

/** The deal's columns of a row, and nothing else: what dealOf reads. */
function dealColumnsOf(r: PersonRowDto): Partial<DealColumns> | null {
  if (!r.deal_stage) return null;
  return {
    deal_id: r.deal_id ?? null,
    deal_stage: r.deal_stage,
    deal_service: r.deal_service ?? null,
    deal_proposed_at: r.deal_proposed_at ?? null,
    deal_decided_at: r.deal_decided_at ?? null,
    deal_ended_at: r.deal_ended_at ?? null,
    deal_amount_cents: r.deal_amount_cents ?? null,
    deal_per: r.deal_per ?? null,
  };
}

/** The step's columns of a row, and nothing else: what nextStepOf reads. */
function stepColumnsOf(r: PersonRowDto): StepColumns | null {
  if (!r.step_id || !r.step_body) return null;
  return {
    step_id: r.step_id,
    step_body: r.step_body,
    step_due_on: r.step_due_on ?? null,
    step_for_user_id: r.step_for_user_id ?? null,
    step_deal_id: r.step_deal_id ?? null,
    step_for_name: r.step_for_name ?? null,
    step_for_me: r.step_for_me ?? false,
  };
}

/** A person's facts from their People row, at the read's clock in the business's zone: the server's half. */
export function calendarPersonFactsOf(r: PersonRowDto, tz: string, nowMs: number): CalendarPersonFactsDto {
  const last = lastContactOf(r, tz, nowMs);
  return {
    state: personStateFor(r, nowMs, tz, null),
    business: businessTrailOf({
      nameSource: asNameSource(r.name_source),
      worksAt: r.lead_id ? { name: r.lead_name ?? null, gone: !!r.lead_gone } : null,
    }),
    deal: dealColumnsOf(r),
    step: stepColumnsOf(r),
    last: { at: last.at, by: last.by },
    phone: r.phone_e164 ?? null,
    email: r.email ?? null,
    next_visit_at: visitsAt(r.visits ?? null, nowMs)?.next?.start ?? null,
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
export function calendarPersonOf(f: CalendarPersonFactsDto, tz: string, nowMs: number): CalendarPersonVM {
  const at = f.last.at ? Date.parse(f.last.at) : Number.NaN;
  return {
    state: f.state,
    stateWord: PERSON_STATE_LABELS[f.state],
    business: f.business,
    deal: f.deal ? dealOf(f.deal, tz, nowMs) : null,
    step: f.step ? nextStepOf(f.step, tz, nowMs) : null,
    last: Number.isFinite(at) ? `${f.last.by} · ${agoWords(at, nowMs)}` : null,
    phone: f.phone,
    email: f.email,
    nextVisitMs: f.next_visit_at ? Date.parse(f.next_visit_at) : null,
  };
}
