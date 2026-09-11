/**
 * The public "say yes to offers" page: the ways a customer can say yes, the
 * wording the carriers ask for, and the wiring — public by one reviewed
 * prefix, read by slug with the service role, and writing nothing. A page
 * that collected a phone number would be inventing consent; this one shows
 * the ways the product already records it, each of which is the customer's
 * own message from their own phone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { consentPageVM, CONSENT_PHRASE, CONSENT_PHRASE_ES, CONVERSATION_PHRASE, OFFERS_OPT_IN_PHRASES, optInLink, SMS_CLAUSES, consentFormVM, optInConfirmation } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const salon = { businessName: "Melany's Beauty Salon", whatsappE164: "+19177724072", smsE164: null };

test("two asks, not one — which is what error 30913 required", () => {
  // THE DEFECT. One control, three purposes: "Text YES OFFERS ... Sending it is
  // your yes", and then "You get offers, news AND APPOINTMENT REMINDERS". The
  // carriers refused the campaign in as many words -- "marketing consent was
  // combined with other consents. Marketing consent must be collected
  // separately."
  const vm = consentPageVM(salon);
  assert.equal(vm.empty, false);
  assert.deepEqual(vm.asks.map((a) => a.purpose), ["conversational", "marketing"], "the one most people came for, first");

  const [visit, offers] = vm.asks;
  // Different words, so they are different answers.
  assert.notEqual(visit.ways[0].phrase, offers.ways[0].phrase);
  assert.equal(visit.ways[0].phrase, CONVERSATION_PHRASE, "the carriers' own standard opt-in word, already declared to them");
  assert.equal(offers.ways[0].phrase, CONSENT_PHRASE);
  assert.equal(CONSENT_PHRASE, OFFERS_OPT_IN_PHRASES.en, "one phrase, shared with the ingest that reads it");
  assert.equal(CONSENT_PHRASE_ES, OFFERS_OPT_IN_PHRASES.es);
  // A bare "yes" is never a marketing opt-in: it is how a person answers an
  // ordinary question.
  for (const a of vm.asks) for (const w of a.ways) assert.notEqual(w.phrase.toLowerCase(), "yes");

  // The promotional one is optional and says so, unprompted, in its own words.
  assert.equal(visit.optional, null);
  assert.match(offers.optional, /entirely optional/);
  assert.match(offers.optional, /saying no changes nothing/);

  // Neither ask's own words claim the other's territory. This is the exact
  // sentence that was refused.
  assert.ok(!/appointment reminder/i.test(offers.terms.join(" ")), "REGRESSION: offers claiming reminders is 30913");
  assert.ok(!/offer|promotion/i.test(visit.terms.join(" ")), "REGRESSION: the appointment ask claiming offers is the same fault mirrored");

  assert.equal(vm.qrLink, optInLink("+19177724072", CONSENT_PHRASE), "the QR at the desk is the offers one, and only that one");
});

test("each ask carries the disclosures the carriers require of it, separately", () => {
  // Not once at the foot of the page: beside the control, so somebody giving
  // ONE of the two has read what that one means. Twilio's own reference mockup
  // repeats the whole disclosure on each checkbox for this reason.
  for (const ask of consentPageVM(salon).asks) {
    const said = ask.terms.join(" ");
    assert.match(said, /Melany's Beauty Salon/, `${ask.purpose}: whose messages`);
    assert.match(said, /frequency varies|A few messages a month/i, `${ask.purpose}: how often`);
    assert.ok(said.includes("Message and data rates may apply"), `${ask.purpose}: verbatim, as the carriers require`);
    assert.ok(!/standard (message|rates)/i.test(said), `${ask.purpose}: "standard" implies premium-rate messaging and is refused`);
    assert.match(said, /Reply HELP/, `${ask.purpose}: help`);
    assert.match(said, /Reply STOP/, `${ask.purpose}: stop`);
  }
  // What is true of both is said once, at the foot.
  const terms = consentPageVM(salon).terms;
  assert.ok(terms.some((t) => t.includes("No mobile information is shared with third parties")), "the line every 10DLC and toll-free review looks for");
  assert.ok(terms.some((t) => t.includes("not a condition of any purchase")));
});

test("a texting line adds a second way to the appointment ask only: offers go by WhatsApp, never by text", () => {
  // The fourth refusal (30896, 11 Sep 2026): a reviewer opening this page found a
  // marketing keyword offered on the number registered for an informational
  // opt-in. The texting line's campaign carries replies and appointment
  // messages; offers have one way in, WhatsApp, and a workspace without
  // WhatsApp does not ask for them at all.
  const vm = consentPageVM({ ...salon, smsE164: "+13055550100" });
  const [visit, offers] = vm.asks;
  assert.deepEqual(visit.ways.map((w) => w.kind), ["whatsapp", "sms"]);
  const sms = visit.ways[1];
  assert.equal(sms.sentence, `Text ${visit.ways[0].phrase} to +1 (305) 555-0100. Sending it is your yes.`);
  assert.equal(sms.href, `sms:+13055550100?&body=${encodeURIComponent(visit.ways[0].phrase)}`);
  assert.equal(visit.ways[0].display, "+1 (917) 772-4072");
  assert.deepEqual(offers.ways.map((w) => w.kind), ["whatsapp"], "REGRESSION: YES OFFERS offered on the texting number is 30896");
  assert.match(offers.lead, /on WhatsApp/);
  const only = consentPageVM({ ...salon, whatsappE164: null, smsE164: "+13055550100" });
  assert.deepEqual(only.asks.map((a) => a.purpose), ["conversational"], "no WhatsApp: no offers ask");
  assert.deepEqual(only.asks[0].ways.map((w) => w.kind), ["sms"]);
  assert.match(only.lead, /^One thing you can say yes to/);
  assert.equal(only.qrLink, null, "nothing to encode without WhatsApp");
});

test("a workspace with no number says so rather than showing a button that does nothing", () => {
  const vm = consentPageVM({ businessName: "Harbor Moving Co.", whatsappE164: null, smsE164: null });
  assert.equal(vm.empty, true);
  assert.deepEqual(vm.asks, []);
  assert.equal(vm.qrLink, null);
  assert.equal(vm.lead, "Harbor Moving Co. is not set up to take sign-ups here yet.");
  assert.equal(consentPageVM({ ...salon, businessName: "  " }).title, "Text messages from This business");
});

test("the paper form asks the same two questions, each its own unticked box with its own signature", () => {
  // A yes to offers must be WRITTEN (00100), and a customer at the desk may not
  // want to text anything. Twilio names "a signed form section" as a control that
  // qualifies -- provided it is its own section. So this is the page's two asks on
  // paper, in the page's own words: a second copy of a disclosure would be one
  // that is edited and one that is not.
  const form = consentFormVM(salon);
  const page = consentPageVM(salon);
  assert.deepEqual(form.sections.map((s) => s.purpose), ["conversational", "marketing"]);
  for (const [i, s] of form.sections.entries()) {
    assert.equal(s.title, page.asks[i].title, `${s.purpose}: the page's words`);
    assert.equal(s.lead, page.asks[i].lead);
    assert.equal(s.optional, page.asks[i].optional);
    assert.deepEqual(s.terms, page.asks[i].terms, `${s.purpose}: the page's disclosures, not a copy of them`);
    assert.ok(s.box.includes("Melany's Beauty Salon"), `${s.purpose}: whose texts`);
    assert.ok(s.sign, `${s.purpose}: signed on its own`);
    // Printed, not filled in here: nothing on it is an input or arrives ticked.
    assert.ok(!("checked" in s) && !("value" in s), `${s.purpose}: a box that arrives ticked is not a yes`);
  }
  const [visit, offers] = form.sections;
  assert.match(visit.box, /appointments/);
  assert.doesNotMatch(visit.box, /offer/i, "REGRESSION: one box, two purposes, is 30913");
  assert.match(offers.box, /offers and news/);
  assert.match(offers.optional, /entirely optional/);
  assert.match(form.lead, /signing one does not sign you up for the other/);
  assert.deepEqual(form.terms, page.terms, "the foot is the page's foot");
  assert.match(form.office, /Sign-up form/, "and it tells the business how to record the sheet");
  // Paper needs no number: a business can take signed forms before its line is
  // approved for texting, while its page has nothing to offer yet.
  const bare = consentFormVM({ businessName: "Harbor Moving Co.", whatsappE164: null, smsE164: null });
  assert.equal(bare.sections.length, 1, "no WhatsApp: the appointment box alone, since offers go by WhatsApp");
  assert.match(bare.lead, /^One box\./);
  assert.match(offers.box, /on WhatsApp/, "the offers box says where offers go");
  assert.equal(consentFormVM({ businessName: "  " }).title, "Text messages from This business");
});

test("the wiring: public by one prefix, read by slug, writes nothing, and the owner is given the link", () => {
  const page = readCode("apps/dashboard/app/yes/[slug]/page.tsx");
  assert.ok(page.includes("const facts = await consentPageFor(slug);") && page.includes("if (!facts) notFound();"));
  assert.ok(!/<form|<input|useState|"POST"/.test(page), "no field, no write: a number typed into a box is not consent");
  assert.ok(page.includes('robots: { index: false, follow: false }'), "for the people given the link, not for a search result");
  const server = readCode("apps/dashboard/src/server/consent-page.ts");
  assert.ok(server.includes('import "server-only";') && server.includes("createServiceClient({"));
  assert.ok(server.includes('if (!tenant || tenant.status === "test") return null;'), "a fixture workspace has no page");
  assert.ok(server.includes('.select("id, name, status")') && server.includes('.select("kind, number_e164")'), "exactly the facts the page shows leave this boundary");
  assert.ok(!/insert|update|delete|upsert/i.test(server), "the public page's reader may not write");
  const bc = readCode("apps/dashboard/src/legacy/pages/broadcasts-real.jsx");
  assert.ok(bc.includes('data-testid="bc-optin-page"') && bc.includes("the wording the phone carriers ask for"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("const slug = workspaceOverride.current()?.slug ?? null;") && sd.includes("pageUrl: slug ? `${window.location.origin}/yes/${slug}` : null,"), "the address is built from the workspace being viewed");
  const css = readRaw("apps/dashboard/app/globals.css");
  assert.ok(css.includes(".yes-terms {") && css.includes(".yes-ask {"), "the page has its own styles, and the two asks are visibly separate blocks");
  assert.ok(css.includes(".yes a.yes-btn { color: #06231d;"), "REGRESSION: .yes a outranks .yes-btn and painted the button's label teal on teal");
});

test("the pages a carrier reviewer lands on say who the business is", () => {
  // A real rejection, on the first real campaign this product filed:
  //
  //   [30919] PRIVACY_POLICY_URL — "the campaign submission has been reviewed
  //           and rejected because the provided website does not contain
  //           sufficient business information"
  //
  // The privacy policy was thorough about the PRODUCT — what it holds, who
  // processes it, the STOP/HELP language, the mobile-information clause — and
  // never once said which company was behind it. A reviewer, a payment
  // processor and a customer all need the same four facts, and none of them
  // were there.
  const privacy = readRaw("apps/dashboard/app/privacy/page.tsx");
  for (const fact of ["RJ Capital LLC", "193 Jamaica Ave, Brooklyn, NY 11207", "hi@chanlytics.com", "+1 (917) 574-6416"]) {
    assert.ok(privacy.includes(fact), `the privacy policy names ${fact}`);
  }
  // The SMS clauses that were already right, kept from regressing out -- and now
  // rendered from ONE source, because every workspace's own page at /b/<slug>
  // publishes the same ones. Two copies of a compliance sentence is one copy
  // that will be edited and one that will not.
  assert.ok(privacy.includes("{SMS_CLAUSES.join(\" \")}"), "the policy renders the shared clauses");
  assert.ok(SMS_CLAUSES.some((c) => /Reply STOP to stop and HELP for help/.test(c)));
  assert.ok(SMS_CLAUSES.some((c) => /No mobile information will be shared with third parties/.test(c)));
  assert.ok(SMS_CLAUSES.some((c) => /Message and data rates may apply/.test(c)));
  assert.ok(!SMS_CLAUSES.some((c) => /standard rates/i.test(c)), "carriers refuse \"standard\" -- it implies premium-rate messaging");

  // The opt-in page is the URL on every registration, so a reviewer lands
  // there too and has to be able to tell who is sending.
  const yes = readRaw("apps/dashboard/app/yes/[slug]/page.tsx");
  assert.ok(yes.includes("RJ Capital LLC") && yes.includes("193 Jamaica Ave"), "the opt-in page names the operator");
  assert.ok(yes.includes("on behalf of {facts.businessName}"), "and still names the business the customer is agreeing to hear from");
});

test("the privacy and terms links beside the asks are the business's own, once it has said who it is", () => {
  // A reviewer wants both links beside the call to action (30549, 30550, 30564)
  // and wants them to be the business's -- opt-in evidence for a different
  // company is its own refusal (30927). Chanlytics' own pages only until the
  // business has a page of its own to link.
  assert.deepEqual(consentPageVM(salon).links, { privacy: "/privacy", terms: "/terms" }, "no slug: Chanlytics' pages");
  const own = consentPageVM({ ...salon, slug: "melanys", businessPage: true });
  assert.deepEqual(own.links, { privacy: "/b/melanys", terms: "/b/melanys/terms" });
  assert.deepEqual(consentPageVM({ ...salon, slug: "melanys", businessPage: false }).links, { privacy: "/privacy", terms: "/terms" }, "a business that has not said who it is has no page to link");
  assert.deepEqual(consentFormVM({ ...salon, slug: "melanys", businessPage: true }).links, own.links, "the paper form prints the same addresses");
});

test("the confirmation a yes receives names the program, the frequency, the rates, HELP and STOP -- and only its own question", () => {
  // Every recurring program owes it, however the yes was given. The campaign
  // files these words as its opt-in message and the receptionist sends them, so
  // one function holds them.
  const visit = optInConfirmation("Melany's Beauty Salon", "conversational");
  const offers = optInConfirmation("Melany's Beauty Salon", "marketing");
  for (const said of [visit, offers]) {
    assert.match(said, /^Melany's Beauty Salon: /, "whose program");
    assert.match(said, /Msg & data rates may apply/);
    assert.match(said, /Reply HELP for help, STOP to cancel/);
    assert.ok(said.length >= 20 && said.length <= 320, "Twilio's opt_in_message bounds");
  }
  assert.match(visit, /appointments/);
  assert.match(visit, /Msg frequency varies/);
  assert.doesNotMatch(visit, /offer|news/i, "REGRESSION: the appointment keyword confirming a promotional subscription is what the live campaign was refused for");
  assert.match(offers, /offers and news/);
  assert.match(offers, /A few messages a month/);
  assert.doesNotMatch(offers, /appointment/i);
  assert.ok(optInConfirmation("  ", "marketing").startsWith("This business: "));
});
