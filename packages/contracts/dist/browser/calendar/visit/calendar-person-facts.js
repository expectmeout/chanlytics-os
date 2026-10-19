import { visitsAt } from "../calendar-people.js";
import { personStateFor, PERSON_STATE_LABELS } from "../../people/person-state.js";
import { lastContactOf } from "../../people/person-row-facts.js";
import { dealOf } from "../../deals/deal-vm.js";
import { nextStepOf } from "../../notes/steps.js";
import { businessTrailOf } from "../../person-page/business-trail.js";
import { asNameSource } from "../../person-page/words.js";
import { agoWords } from "../../shared/time.js";
function dealColumnsOf(r) {
  if (!r.deal_stage) return null;
  return {
    deal_id: r.deal_id ?? null,
    deal_stage: r.deal_stage,
    deal_service: r.deal_service ?? null,
    deal_proposed_at: r.deal_proposed_at ?? null,
    deal_decided_at: r.deal_decided_at ?? null,
    deal_ended_at: r.deal_ended_at ?? null,
    deal_amount_cents: r.deal_amount_cents ?? null,
    deal_per: r.deal_per ?? null
  };
}
function stepColumnsOf(r) {
  if (!r.step_id || !r.step_body) return null;
  return {
    step_id: r.step_id,
    step_body: r.step_body,
    step_due_on: r.step_due_on ?? null,
    step_for_user_id: r.step_for_user_id ?? null,
    step_deal_id: r.step_deal_id ?? null,
    step_for_name: r.step_for_name ?? null,
    step_for_me: r.step_for_me ?? false
  };
}
export function calendarPersonFactsOf(r, tz, nowMs) {
  const last = lastContactOf(r, tz, nowMs);
  return {
    state: personStateFor(r, nowMs, tz, null),
    business: businessTrailOf({
      nameSource: asNameSource(r.name_source),
      worksAt: r.lead_id ? { name: r.lead_name ?? null, gone: !!r.lead_gone } : null
    }),
    deal: dealColumnsOf(r),
    step: stepColumnsOf(r),
    last: { at: last.at, by: last.by },
    phone: r.phone_e164 ?? null,
    email: r.email ?? null,
    next_visit_at: visitsAt(r.visits ?? null, nowMs)?.next?.start ?? null
  };
}
export function calendarPersonOf(f, tz, nowMs) {
  const at = f.last.at ? Date.parse(f.last.at) : Number.NaN;
  return {
    state: f.state,
    stateWord: PERSON_STATE_LABELS[f.state],
    business: f.business,
    deal: f.deal ? dealOf(f.deal, tz, nowMs) : null,
    step: f.step ? nextStepOf(f.step, tz, nowMs) : null,
    last: Number.isFinite(at) ? `${f.last.by} \xB7 ${agoWords(at, nowMs)}` : null,
    phone: f.phone,
    email: f.email,
    nextVisitMs: f.next_visit_at ? Date.parse(f.next_visit_at) : null
  };
}
