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
 * THE SECOND HALF ARRIVED LATE, and this comment claimed it was here before it
 * was. The split landed in the database, in `people_list`, in the view model and
 * in two send gates, and then stopped — so every read of "said yes to offers" was
 * still pointed at the old column, the fact had no write path outside the edge's
 * ingest, and the voice path kept its own lower bar. On the live workspace that
 * turned seven recorded yeses into an audience of nought. The tests below now read
 * the paths this header describes rather than describing them.
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
  PURPOSE_REFUSALS, HELD_REASONS, consentPageVM, CONSENT_PHRASE, CONVERSATION_PHRASE,
  PEOPLE_LISTS, peopleListAction,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";
import { campaignFactsFor } from "../../../apps/edge/lib/a2p.ts";

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

/** What a workspace files, run rather than sliced out of the source. */
const FILED = {
  businessName: "Melany's Beauty Salon",
  legalName: "Melany Beauty LLC",
  optInUrl: "https://app.chanlytics.com/yes/melanys",
  privacyUrl: "https://app.chanlytics.com/privacy",
  termsUrl: "https://app.chanlytics.com/terms",
  hostedUrl: "https://app.chanlytics.com/b/melanys",
  lineNumber: "+1 (929) 656-6623",
};

test("the message flow filed with the carriers describes every way in, separately, and fits", () => {
  // These used to slice `messageFlow: [` out of a2p.ts and match the TEMPLATE's
  // text -- which passed over a sentence the carriers were refusing, because a
  // template is not what is filed. Now the composer is called and its output read.
  const { messageFlow: flow, description: desc } = campaignFactsFor(FILED);

  // Error 30917 wants, for EACH method: where it happens, what is disclosed there,
  // and what action confirms it. There are two places now, the page and the paper.
  assert.match(flow, /SEPARATE/);
  assert.ok(flow.includes(`WEB PAGE (${FILED.optInUrl})`), "the page, at the URL a reviewer opens");
  assert.ok(flow.includes(`PAPER FORM (${FILED.optInUrl}/form)`), "and the paper form, at one too: a reviewer can only accept a form they can see");
  assert.ok(flow.includes("START") && flow.includes("YES OFFERS"), "both keywords, the ones the product honours");
  assert.match(flow, /NEVER enrols anyone in promotional messaging/, "the direction 30913 is about, stated absolutely");
  assert.doesNotMatch(flow, /neither of which grants the other/, "REGRESSION: a claim to a regulator that OPT_IN_PATTERN contradicts");
  assert.match(flow, /the only answer that implies another/, "and the asymmetry named rather than hidden");
  assert.match(flow, /not a condition of any purchase/);
  // A spoken yes is never a yes to offers: 30913 lists "relies on verbal consent
  // instead of written consent" among its causes, and the database refuses one.
  assert.match(flow, /never from a spoken answer/);
  assert.match(flow, /spoken yes for appointment messages only/);
  // The disclosures the carriers require, verbatim, on both asks.
  assert.equal((flow.match(/message and data rates may apply/gi) ?? []).length, 2);
  assert.ok(!/standard rates/i.test(flow), "\"standard\" implies premium-rate messaging and is refused");
  assert.equal((flow.match(/reply HELP for help and STOP to stop/gi) ?? []).length, 2);
  // Twilio takes 40 to 2048 characters, and a long name on the longest slug a
  // workspace can mint has to fit, or the filing is refused before anyone reads it.
  const long = campaignFactsFor({
    ...FILED,
    businessName: "Northside Family Dental & Orthodontics of Brooklyn Heights",
    optInUrl: `https://app.chanlytics.com/yes/${"a".repeat(63)}`,
  });
  assert.ok(long.messageFlow.length <= 2048, `${long.messageFlow.length} characters`);
  assert.ok(flow.length >= 40);

  // The description: who sends, to whom and why -- what 30886 says was unclear.
  assert.match(desc, /^Melany's Beauty Salon \(Melany Beauty LLC\) uses this number/, "the registered name beside the trade name, as the brand was vetted");
  assert.match(desc, /on its own behalf/, "the business, not the software it sends with");
  assert.match(desc, /contacted Melany's Beauty Salon themselves or gave their consent on its sign-up page or its signed sign-up form/, "who the recipients are, and how they came");
  assert.match(desc, /separate, written yes to offers/);
  assert.match(desc, /Agreeing to hear about appointments never enrols anyone in promotional messaging/);
  assert.doesNotMatch(desc, /no customer is enrolled in both by a single action/,
    "REGRESSION: a claim to a regulator that this product's own keyword table contradicts");
  // One business said twice is not two names.
  assert.doesNotMatch(campaignFactsFor({ ...FILED, legalName: "melany's beauty salon" }).description, /\(/);
  assert.match(campaignFactsFor({ ...FILED, legalName: null }).description, /^Melany's Beauty Salon uses this number/);
  // The contradiction, pinned where it lives, so the sentence and the code cannot
  // drift apart again in either direction.
  assert.equal(OPT_IN_PATTERN.test("YES OFFERS"), true, "the offers keyword also opens conversation");
  assert.equal(MARKETING_OPT_IN_PATTERN.test("START"), false, "but conversation never opens offers -- which is the direction 30913 is about");
});

test("the confirmation filed for START confirms appointment texts, and only those", () => {
  // THE FIELD NOBODY CAN EDIT. The live Chanlytics campaign's reads "You're
  // subscribed to offers and news from Billing probe" -- sent for START, the
  // APPOINTMENT keyword, under a name the workspace dropped. It ties the
  // transactional opt-in to offers, which is 30913 in one line, and no resubmit can
  // reach it: Twilio's update takes nine fields and this is not one of them. So it
  // has to be right on the first filing, for every workspace.
  const { optInMessage, optInKeywords } = campaignFactsFor(FILED);
  assert.deepEqual(optInKeywords, ["START", "UNSTOP", "RESUME"], "the keywords it confirms");
  assert.match(optInMessage, /^Melany's Beauty Salon: /, "whose texts, by the name the customer knows");
  assert.match(optInMessage, /appointments/);
  assert.doesNotMatch(optInMessage, /offer|news|promot/i, "REGRESSION: the appointment keyword confirming a promotional subscription");
  assert.match(optInMessage, /Msg & data rates may apply/);
  assert.match(optInMessage, /Reply HELP for help, STOP to cancel/);
});

test("the samples match what the filing declares about them", () => {
  // HasEmbeddedLinks and HasEmbeddedPhone are declared true, so the samples have
  // to contain a link and a number -- the declaration/sample mismatch is one
  // reviewers reject.
  const { samples } = campaignFactsFor(FILED);
  const all = samples.join("\n");
  assert.ok(samples.length >= 5, "Twilio takes two to five, and more is better reviewed");
  assert.ok(all.includes(FILED.optInUrl), "a link, because the filing declares links");
  assert.ok(all.includes(FILED.lineNumber), "a phone number, because the filing declares one -- and the WORKSPACE'S own");
  // The promotional sample is labelled as one, so a reviewer sees the separation
  // in the samples too.
  assert.match(all, /for customers who asked for offers/);
  // And it invents nothing: not a discount, not the platform's own number.
  assert.ok(!/\d+% off/.test(all), "REGRESSION: a made-up discount in a sample sent to a regulator");
  assert.ok(!/917\D{0,3}574\D?6416/.test(all), "REGRESSION: the platform's number presented as the business's");
  // Without a line of its own, no number is invented for one.
  const noLine = campaignFactsFor({ ...FILED, lineNumber: null }).samples.join("\n");
  assert.ok(!/\(\d{3}\) \d{3}-\d{4}/.test(noLine), "no line, no number");
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

/* ========================================================================== *
 * The half that arrived late: every place that SPENDS the fact, and the one
 * place that WRITES it.
 * ========================================================================== */

test("UNDER-BLOCKING, pinned: the voice path asks the one predicate, with the message's purpose", () => {
  // 00095's own header names this path: "The voice agent's booking-link text is
  // gated on opted_out alone, so 'consent = unknown' sails through. Two proactive
  // sends, two different bars, decided per call site rather than by anything about
  // the message." The broadcast wire was moved to `mayMessageFor`; this was not, so
  // for a while the product had two bars again. Nothing in this file read it.
  const gate = readCode("apps/edge/lib/outbound-gate.ts");
  assert.match(gate, /import \{ mayMessageFor/, "the gate asks the one predicate rather than holding a copy");
  assert.match(gate, /const may = mayMessageFor\(f\.contact, f\.purpose, \{ proactive: f\.proactive \}\);/);
  assert.ok(!/optedOut: boolean/.test(gate), "REGRESSION: a pre-decided boolean cannot answer a per-purpose question");

  const fn = readCode("apps/edge/api/retell-fn.ts");
  // The purpose is STATED as a fact about the message, not read from a column that
  // is NULL for this very row -- `purposeOfTemplate(null)` is "marketing", which
  // would refuse a booking link to every caller who has not asked for offers.
  assert.match(fn, /purpose: "conversational" as const/);
  assert.match(fn, /purpose: BOOKING_TEMPLATE\.purpose,/);
  // And WHOSE number decides whether it is proactive: answering the caller on the
  // line is not a proactive send; texting a number they merely spoke aloud is.
  assert.match(fn, /proactive: !isCaller,/);
  // The row is handed over WHOLE now: `OutboundTarget extends PurposeBearing`, so the
  // compiler, not a pattern here, holds its consent fields to the names the gate reads.
  assert.ok(!/optedOut: isOptedOutContact\(contact\)/.test(fn), "REGRESSION: half the consent question");

  // The resolver has to project the column, or the gate above reads undefined and
  // fails closed on every promotional send it is ever asked about.
  const repo = readCode("packages/db/src/repositories/ingest.ts");
  assert.match(repo, /\.select\("id, consent, dnc, marketing_consent"\)/);
});

test("the fact has a WRITE path: two callers, which is what 00095 designed for", () => {
  // "ONE function, two callers ... a text from the customer and a person at the
  // desk recording a form the customer signed." Only the first existed, so a salon
  // holding thirty signed consent slips had no way to record any of them -- and
  // both controls that looked like they did wrote the conversational column.
  const ingest = readCode("packages/db/src/repositories/ingest.ts");
  assert.match(ingest, /rpc\("set_marketing_consent"/, "the customer's own message");
  const door = readCode("apps/dashboard/app/api/v1/contacts/[id]/marketing-consent/route.ts");
  assert.match(door, /rpc\("set_marketing_consent"/, "and a person at the desk");
  assert.match(door, /requireRole\(member, "operator"\);/);
  // The tenant is the one the contact was READ from under RLS, never from the body:
  // this RPC takes it as a parameter because the edge calls it with no session.
  assert.match(door, /p_tenant_id: contact\.tenant_id,/);

  // The bulk sibling, because a signed-form yes usually arrives for a class at once.
  const bridge = readCode("apps/dashboard/src/legacy-bridge/people-detail.ts");
  assert.match(bridge, /export async function setPersonMarketingConsentMany/);
  assert.match(bridge, /const take = \[\.\.\.new Set\(ids\)\]\.slice\(0, 50\);/, "fifty at most, one refresh at the end");
});

test("every read of \"said yes to offers\" points at the offers column", () => {
  // Six of these were still on the old column after the split, and each one lied
  // in the same direction: it counted people who had said yes to SOMETHING and
  // called them a promotional audience.
  // Run, not read. Both lists answer with the broadcast's OWN rule, `mayReceive`:
  // the yes to offers AND a number. They spelled it by hand without the number, so
  // a list could promise people the route then left out.
  const reachable = { id: "a", phone: "+13055550100", consent: { state: "opted_in", dnc: false, marketing: "opted_in" } };
  const noNumber = { id: "b", phone: null, consent: { state: "opted_in", dnc: false, marketing: "opted_in" } };
  const talkOnly = { id: "c", phone: "+13055550101", consent: { state: "opted_in", dnc: false, marketing: "unknown" } };
  const offersList = PEOPLE_LISTS.find((l) => l.id === "offers_ok");
  assert.deepEqual([reachable, noNumber, talkOnly].filter(offersList.test).map((p) => p.id), ["a"]);
  assert.match(peopleListAction("lapsed", [reachable, noNumber, talkOnly]).text, /^1 of 3 on this list said yes to offers/,
    "the count under a list is the audience the route will enrol");
  assert.equal(peopleListAction("lapsed", [noNumber, talkOnly]).enabled, false, "and nobody reachable means no button");

  const setup = readCode("packages/contracts/src/setup.ts");
  assert.match(setup, /const offers = i\.consent\.offers;/, "the Setup row reads the offers count");
  const server = readCode("apps/dashboard/src/server/setup.ts");
  assert.match(server, /\.eq\("marketing_consent", "opted_in"\)\.eq\("dnc", false\)/, "and it is counted the way the reachable view counts it");

  const clients = readCode("apps/dashboard/src/legacy/pages/clients-a.jsx");
  assert.match(clients, /PL_OFFERS\[p\.consent\.marketing\]/, "the column titled Offers");
  assert.match(clients, /rank\[a\.consent\.marketing\]/, "and sorting by it sorts by it");

  const exp = readCode("apps/dashboard/src/server/export.ts");
  assert.match(exp, /\["offers_consent", \(r\) => r\.marketing_consent \?\? "unknown"\]/);
});

test("every reason the wire can write has words the owner can read", () => {
  // `no_marketing_consent` was added to the wire and not to these words, so a
  // broadcast's detail pane showed the raw enum -- and the distinction it draws is
  // the entire point of the split, making it the last one to leave untranslated.
  // Written as a property over the predicate rather than a list, so the next reason
  // added to `mayMessageFor` fails here instead of reaching a person.
  const reasons = new Set();
  for (const consent of ["unknown", "opted_in", "opted_out"]) {
    for (const marketing_consent of ["unknown", "opted_in", "opted_out"]) {
      for (const dnc of [true, false]) {
        for (const purpose of ["conversational", "marketing"]) {
          for (const proactive of [true, false]) {
            const r = mayMessageFor({ consent, dnc, marketing_consent }, purpose, { proactive }).reason;
            if (r) reasons.add(r);
          }
        }
      }
    }
  }
  assert.ok(reasons.size >= 3, "the predicate refuses for at least three distinct reasons");
  for (const r of reasons) {
    assert.ok(HELD_REASONS[r], `HELD_REASONS is missing "${r}" — the owner would read the enum`);
    assert.ok(PURPOSE_REFUSALS[r], `PURPOSE_REFUSALS is missing "${r}"`);
    assert.ok(!/_/.test(HELD_REASONS[r]), `"${r}" reads like an enum, not like words`);
  }
});
