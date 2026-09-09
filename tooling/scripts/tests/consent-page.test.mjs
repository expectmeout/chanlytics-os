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
import { consentPageVM, CONSENT_PHRASE, CONSENT_PHRASE_ES, CONVERSATION_PHRASE, OFFERS_OPT_IN_PHRASES, optInLink } from "@chanlytics/contracts";
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

test("a texting line adds a second way to each ask; both together keep their order", () => {
  const vm = consentPageVM({ ...salon, smsE164: "+13055550100" });
  for (const ask of vm.asks) {
    assert.deepEqual(ask.ways.map((w) => w.kind), ["whatsapp", "sms"], ask.purpose);
    const sms = ask.ways[1];
    assert.equal(sms.sentence, `Text ${ask.ways[0].phrase} to +1 (305) 555-0100. Sending it is your yes.`);
    assert.equal(sms.href, `sms:+13055550100?&body=${encodeURIComponent(ask.ways[0].phrase)}`);
    assert.equal(ask.ways[0].display, "+1 (917) 772-4072");
  }
  const only = consentPageVM({ ...salon, whatsappE164: null, smsE164: "+13055550100" });
  for (const ask of only.asks) assert.deepEqual(ask.ways.map((w) => w.kind), ["sms"]);
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
  // The SMS clauses that were already right, kept from regressing out.
  assert.ok(/Reply STOP to stop and HELP for help/.test(privacy));
  assert.ok(/No mobile information will be shared with third parties/.test(privacy));

  // The opt-in page is the URL on every registration, so a reviewer lands
  // there too and has to be able to tell who is sending.
  const yes = readRaw("apps/dashboard/app/yes/[slug]/page.tsx");
  assert.ok(yes.includes("RJ Capital LLC") && yes.includes("193 Jamaica Ave"), "the opt-in page names the operator");
  assert.ok(yes.includes("on behalf of {facts.businessName}"), "and still names the business the customer is agreeing to hear from");
});
