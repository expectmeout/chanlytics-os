/**
 * Two questions, two answers — the fix for carrier error 30913.
 *
 * THE DEFECT, with a receipt. The carriers refused the live Chanlytics campaign:
 *
 *   30913 · MESSAGE_FLOW — "The campaign submission has been reviewed and
 *   rejected because marketing consent was combined with other consents.
 *   Marketing consent must be collected separately."
 *
 * They were right, and the live page proved it in one sentence: one control
 * ("Text YES OFFERS ... Sending it is your yes") granting three purposes ("You
 * get offers, news AND APPOINTMENT REMINDERS"). Underneath, `contacts.consent`
 * was a single tri-state that the receptionist's replies, appointment reminders
 * and promotional broadcasts all spent.
 *
 * The cost of that was not only regulatory. It over-blocked in one direction and
 * under-blocked in the other, and both are pinned below: a customer with an
 * appointment tomorrow was not reminded of it unless they had asked for offers,
 * while the voice path sent a template to somebody whose consent was `unknown`.
 *
 * These are the properties that have to hold for the new message flow filed with
 * the carriers to be TRUE — which matters more than usual, because that filing
 * is a statement to a regulator about how this product behaves.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mayMessageFor, purposeOfTemplate, purposeOfPlaybook, isOptedOutContact,
  optInPurposeOf, MARKETING_OPT_IN_PATTERN, CONVERSATION_OPT_IN_PATTERN, OPT_IN_PATTERN,
  PURPOSE_REFUSALS, consentPageVM, CONSENT_PHRASE, CONVERSATION_PHRASE,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

test("which question a customer's message answers", () => {
  // The split. One pattern used to match both, so one message gave one yes.
  assert.equal(optInPurposeOf("YES OFFERS"), "marketing");
  assert.equal(optInPurposeOf("si ofertas"), "marketing");
  assert.equal(optInPurposeOf("SÍ OFERTAS"), "marketing");
  assert.equal(optInPurposeOf("START"), "conversational");
  assert.equal(optInPurposeOf("alta"), "conversational");
  assert.equal(optInPurposeOf("unstop"), "conversational");

  // A bare "yes" is how a person answers an ordinary question. Reading it as
  // express written consent to be marketed to is the exact mistake this undoes.
  for (const said of ["yes", "sí", "si", "yes please", "ok", "sure", "yes offers please"]) {
    assert.equal(optInPurposeOf(said), null, said);
    assert.equal(MARKETING_OPT_IN_PATTERN.test(said), false, said);
  }

  // The two patterns are disjoint: no message can answer both questions at once.
  for (const said of ["YES OFFERS", "START", "alta", "si ofertas"]) {
    assert.notEqual(MARKETING_OPT_IN_PATTERN.test(said), CONVERSATION_OPT_IN_PATTERN.test(said), said);
  }
  // The old pattern still matches both, deliberately: texting OFFERS is also a
  // way back in from a STOP, and taking that away would strand somebody.
  assert.ok(OPT_IN_PATTERN.test("YES OFFERS") && OPT_IN_PATTERN.test("START"));
});

const person = (over = {}) => ({ consent: "opted_in", dnc: false, marketing_consent: "opted_in", ...over });

test("a yes about appointments is not a yes about offers", () => {
  const both = person();
  assert.deepEqual(mayMessageFor(both, "marketing"), { ok: true, reason: null });
  assert.deepEqual(mayMessageFor(both, "conversational", { proactive: true }), { ok: true, reason: null });

  // The over-blocking this repairs: an appointment reminder to somebody who
  // never asked for offers.
  const appointmentsOnly = person({ marketing_consent: "unknown" });
  assert.deepEqual(mayMessageFor(appointmentsOnly, "conversational", { proactive: true }), { ok: true, reason: null });
  assert.deepEqual(mayMessageFor(appointmentsOnly, "marketing"), { ok: false, reason: "no_marketing_consent" });

  // Declining offers is not a request to stop hearing about your own visit.
  const noOffers = person({ marketing_consent: "opted_out" });
  assert.equal(mayMessageFor(noOffers, "conversational", { proactive: true }).ok, true);
  assert.equal(mayMessageFor(noOffers, "marketing").ok, false);

  // STOP is not symmetric with that. It stops everything, on both axes, and so
  // does an operator's do-not-call.
  for (const stopped of [person({ consent: "opted_out" }), person({ dnc: true })]) {
    assert.deepEqual(mayMessageFor(stopped, "marketing"), { ok: false, reason: "opted_out" });
    assert.deepEqual(mayMessageFor(stopped, "conversational"), { ok: false, reason: "opted_out" });
    assert.equal(isOptedOutContact(stopped), true, "and the old predicate still agrees");
  }

  // Answering somebody who wrote to you needs only that they have not stopped.
  assert.equal(mayMessageFor(person({ consent: "unknown", marketing_consent: "unknown" }), "conversational").ok, true);
  assert.equal(mayMessageFor(person({ consent: "unknown" }), "conversational", { proactive: true }).ok, false);

  // Every refusal has words a person can act on.
  for (const r of ["opted_out", "not_opted_in", "no_marketing_consent"]) assert.ok(PURPOSE_REFUSALS[r]);
});

test("a missing column withholds an offer rather than sending one", () => {
  // The two predicates fail in OPPOSITE directions on purpose, and each
  // direction is the safe one for what it guards. isOptedOutContact fails open
  // so a forgotten SELECT never silences a reply; this fails closed so a
  // forgotten SELECT never authorises a promotion.
  const rowFromAnOlderSelect = { consent: "opted_in", dnc: false };
  assert.equal(mayMessageFor(rowFromAnOlderSelect, "conversational", { proactive: true }).ok, true);
  assert.equal(mayMessageFor(rowFromAnOlderSelect, "marketing").ok, false, "no column, no promotion");
});

test("what a message IS comes from what was already recorded, and NULL means marketing", () => {
  // `templates.category` has existed since 00045 and nothing has ever branched
  // on it. The trap is that it is NULL for exactly the rows most likely to
  // matter: booking_link_v1 was seeded by hand before the column existed, a
  // workspace that never ran a template sync has NULL throughout, and the mapper
  // returns null for any category Meta names that we do not recognise.
  //
  // Written the obvious way -- category === "marketing" -- the gate would let
  // every one of those through as transactional. So only the two categories
  // POSITIVELY not marketing count.
  assert.equal(purposeOfTemplate("utility"), "conversational");
  assert.equal(purposeOfTemplate("authentication"), "conversational");
  assert.equal(purposeOfTemplate("marketing"), "marketing");
  for (const unknown of [null, undefined, "", "MARKETING", "promotional", "something_new_from_meta"]) {
    assert.equal(purposeOfTemplate(unknown), "marketing", JSON.stringify(unknown));
  }

  // Playbooks already declare a class, and it already says which is which.
  assert.equal(purposeOfPlaybook("booking"), "conversational");
  assert.equal(purposeOfPlaybook("reengage"), "marketing");
  assert.equal(purposeOfPlaybook("campaign"), "marketing");
  assert.equal(purposeOfPlaybook(null), "marketing");
});

test("the page asks twice, and neither ask claims the other's messages", () => {
  const vm = consentPageVM({ businessName: "Melany's Beauty Salon", whatsappE164: "+19177724072", smsE164: "+13055550100" });
  assert.deepEqual(vm.asks.map((a) => a.purpose), ["conversational", "marketing"]);
  const [visit, offers] = vm.asks;
  assert.equal(visit.ways[0].phrase, CONVERSATION_PHRASE);
  assert.equal(offers.ways[0].phrase, CONSENT_PHRASE);
  // The refused sentence, gone: one yes must not cover reminders AND offers.
  assert.ok(!/appointment/i.test(offers.terms.join(" ") + offers.lead));
  assert.match(offers.optional, /optional/);
});

test("the database records the two answers apart, and neither writer reaches across", () => {
  const m = readRaw("supabase/migrations/00095_marketing_consent_is_its_own_answer.sql");
  assert.match(m, /add column if not exists marketing_consent text not null default 'unknown'/);
  assert.match(m, /check \(marketing_consent in \('unknown', 'opted_in', 'opted_out'\)\)/);
  // `dnc` is the all-traffic stop and this door must never set it: saying no to
  // offers is not a request to stop hearing about your own appointment.
  const fn = m.slice(m.indexOf("create or replace function public.set_marketing_consent"));
  assert.ok(!/set\s+dnc|dnc\s*=/.test(fn.slice(0, fn.indexOf("$$;"))), "REGRESSION: the offers door touching the all-traffic stop");
  assert.match(fn, /'purpose', 'marketing'/, "the ledger says which question was answered");
  assert.match(m, /revoke execute on function public\.set_marketing_consent\(uuid, uuid, text, text, text\) from public, anon;/);

  // The hot path is NOT recreated to add a column. ingest_inbound handles every
  // inbound message in the product; the marketing answer is a second call.
  assert.ok(!/create or replace function public\.ingest_inbound/.test(m), "REGRESSION: surgery on the hot path");
  const repo = readCode("packages/db/src/repositories/ingest.ts");
  assert.match(repo, /rpc\("set_marketing_consent"/);
  assert.ok(repo.indexOf('rpc("ingest_inbound"') < repo.indexOf('rpc("set_marketing_consent"'), "after the ingest, using the contact it returned");
  assert.match(repo, /marketing_consent_write_failed/, "and a failure is loud rather than fatal: the customer has already been answered");

  // people_list carries both, or no page can compute an audience.
  const pl = readRaw("supabase/migrations/00096_people_carry_both_answers.sql");
  assert.match(pl, /marketing_consent {12}text,/, "declared in the returns table, aligned with its neighbours");
  assert.match(pl, /c\.marketing_consent, c\.marketing_consent_source, c\.marketing_consent_updated_at,/);
});

test("the message flow filed with the carriers describes both opt-ins, separately", () => {
  const src = readRaw("apps/edge/lib/a2p.ts");
  const flow = src.slice(src.indexOf("messageFlow: ["), src.indexOf("].join(\" \")"));
  // Error 30917 spells out what a passing answer contains, for EACH method:
  // where it happens, what disclosure is shown there, and what action confirms.
  assert.match(flow, /TWO SEPARATE opt-ins/);
  assert.match(flow, /TRANSACTIONAL/);
  assert.match(flow, /PROMOTIONAL/);
  assert.match(flow, /neither of which grants the other/);
  assert.match(flow, /is not a condition of any purchase/);
  assert.match(flow, /recorded against that customer separately/);
  // Both keywords are named, and they are the ones the product actually honours.
  assert.ok(flow.includes("START") && flow.includes("YES OFFERS"));
  // The disclosures the carriers require, verbatim on both. "standard rates" is
  // refused by carriers because it implies premium-rate messaging.
  assert.equal((flow.match(/message and data rates may apply/gi) ?? []).length, 2);
  assert.ok(!/standard rates/i.test(flow));
  assert.equal((flow.match(/reply HELP for help and STOP to stop/gi) ?? []).length, 2);

  // The description says the separation too, because 30886 refused the old one.
  const desc = src.slice(src.indexOf("description: `"), src.indexOf("messageFlow: ["));
  assert.match(desc, /separate, explicit yes to offers/);
  assert.match(desc, /no customer is enrolled in both by a single action/);
});

test("the samples match what the filing declares about them", () => {
  // HasEmbeddedLinks and HasEmbeddedPhone have always been sent as "true" while
  // neither generated sample contained a link or a number -- the exact
  // declaration/sample mismatch reviewers reject, and a plausible half of 30886.
  const src = readRaw("apps/edge/lib/a2p.ts");
  const samples = src.slice(src.indexOf("samples: ["), src.indexOf("optInMessage:"));
  assert.ok(samples.includes("${o.optInUrl}"), "a link, because the filing declares links");
  assert.match(samples, /\+1 917 574 6416/, "a phone number, because the filing declares one");
  assert.ok((samples.match(/`/g) ?? []).length >= 10, "at least five samples: Twilio takes two to five and more is better reviewed");
  // The promotional sample is labelled as one, so a reviewer can see the
  // separation in the samples too.
  assert.match(samples, /for customers who asked for offers/);
});

test("the resubmit sends everything Twilio will accept, and says what it will not", () => {
  // Twilio's update takes description, message flow, samples, four booleans and
  // the two policy URLs. "Any parameters included in the original Campaign
  // CREATE call, but not specifically mentioned in the update table, cannot be
  // edited under any circumstances" -- opt-in, opt-out and help information, and
  // the use case. Those need a delete and a recreate, which is a new fee.
  const ch = readCode("packages/channels/src/a2p.ts");
  const upd = ch.slice(ch.indexOf("export function updateCampaignRequest"));
  const body = upd.slice(0, upd.indexOf("return {"));
  for (const field of ["Description", "MessageFlow", "MessageSamples", "PrivacyPolicyUrl", "TermsAndConditionsUrl"]) {
    assert.ok(upd.includes(field), field);
  }
  assert.ok(!/OptInMessage|OptInKeywords|UsAppToPersonUsecase|BrandRegistrationSid/.test(body), "sending a field Twilio refuses is a failed resubmit");
  // And the caller no longer computes four fields for them to be dropped
  // silently by a narrower parameter type.
  const edge = readCode("apps/edge/lib/a2p.ts");
  assert.match(edge, /privacyPolicyUrl: string; termsUrl: string \}/);
  assert.match(edge, /privacyPolicyUrl: facts\.privacyPolicyUrl,/);
  // The one that cannot be corrected says so where somebody would look for it.
  assert.match(readRaw("apps/edge/lib/a2p.ts"), /NOT correctable after the first filing/);
});
