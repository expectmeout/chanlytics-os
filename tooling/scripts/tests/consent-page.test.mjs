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
import { consentPageVM, CONSENT_PHRASE, CONSENT_PHRASE_ES, OFFERS_OPT_IN_PHRASES, optInLink } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const salon = { businessName: "Melany's Beauty Salon", whatsappE164: "+19177724072", smsE164: null };

test("the ways to say yes are the ways the product already records one", () => {
  const vm = consentPageVM(salon);
  assert.equal(vm.title, "Offers and news from Melany's Beauty Salon");
  assert.equal(vm.empty, false);
  assert.deepEqual(vm.ways.map((w) => w.kind), ["whatsapp"]);
  const wa = vm.ways[0];
  assert.equal(wa.href, optInLink("+19177724072"), "the same link the QR on Broadcasts encodes");
  assert.ok(wa.href.startsWith("https://wa.me/19177724072?text="));
  assert.ok(wa.sentence.includes(CONSENT_PHRASE) && wa.sentence.endsWith("Sending it is your yes."));
  assert.equal(wa.display, "+1 (917) 772-4072");
  assert.equal(vm.qrLink, wa.href);
  assert.equal(CONSENT_PHRASE, OFFERS_OPT_IN_PHRASES.en, "one phrase, shared with the ingest that reads it");
  assert.equal(CONSENT_PHRASE_ES, OFFERS_OPT_IN_PHRASES.es);
});

test("a texting line adds a second way; both together keep their order", () => {
  const vm = consentPageVM({ ...salon, smsE164: "+13055550100" });
  assert.deepEqual(vm.ways.map((w) => w.kind), ["whatsapp", "sms"]);
  const sms = vm.ways[1];
  assert.equal(sms.sentence, `Text ${CONSENT_PHRASE} to +1 (305) 555-0100. Sending it is your yes.`);
  assert.equal(sms.href, `sms:+13055550100?&body=${encodeURIComponent(CONSENT_PHRASE)}`);
  const only = consentPageVM({ ...salon, whatsappE164: null, smsE164: "+13055550100" });
  assert.deepEqual(only.ways.map((w) => w.kind), ["sms"]);
  assert.equal(only.qrLink, null, "nothing to encode without WhatsApp");
});

test("a workspace with no number says so rather than showing a button that does nothing", () => {
  const vm = consentPageVM({ businessName: "Harbor Moving Co.", whatsappE164: null, smsE164: null });
  assert.equal(vm.empty, true);
  assert.deepEqual(vm.ways, []);
  assert.equal(vm.qrLink, null);
  assert.equal(vm.lead, "Harbor Moving Co. is not set up to take sign-ups here yet.");
  assert.equal(consentPageVM({ ...salon, businessName: "  " }).title, "Offers and news from This business");
});

test("the wording the carriers ask for is on the page, in their order", () => {
  const terms = consentPageVM(salon).terms;
  assert.equal(terms.length, 5);
  assert.ok(terms[0].includes("Melany's Beauty Salon") && terms[0].includes("A few messages a month"), "what they get, how often");
  assert.ok(terms[1].includes("Message and data rates may apply") && terms[1].includes("Message frequency varies"));
  assert.ok(terms[2].includes("Reply STOP") && terms[2].includes("Reply HELP"));
  assert.ok(terms[3].includes("No mobile information is shared with third parties"), "the line every 10DLC and toll-free review looks for");
  assert.ok(terms[4].includes("not a condition of any purchase"));
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
  assert.ok(css.includes(".yes-terms {"), "the page has its own styles, not the auth card's");
  assert.ok(css.includes(".yes a.yes-btn { color: #06231d;"), "REGRESSION: .yes a outranks .yes-btn and painted the button's label teal on teal");
});
