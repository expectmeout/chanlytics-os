/**
 * A public page names its tab for what it shows: the business's page by the business, and Not found when it has
 * nothing to show.
 *
 * #523 gave an address that names nothing a branded page titled "Not found · Chanlytics". On a /yes/<slug> or
 * /b/<slug> link that no workspace answers to, the tab still ended on "Chanlytics OS": each page's own metadata named
 * nothing before the page called notFound(), and the app's title won (the wiring audit's N21, seen in #523's live
 * check). And a /b page whose record has no legal name or address showed Not found under the business's name, marked
 * indexable. The rule now lives beside each page's view model in contracts, and runs here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";

const { consentPageVM, consentFormVM, businessPageVM, textingTermsVM } = contracts;

/** consent-page.test.mjs's salon: a WhatsApp number and no texting line yet. */
const salonOptIn = { businessName: "Marisa's Beauty Salon", whatsappE164: "+13055550188", smsE164: null };
/** business-page.test.mjs's salon: the record the carriers vetted. */
const salonRecord = {
  legalName: "Marisa Beauty Corp",
  tradeName: "Marisa's Beauty Salon",
  street: "1200 Maple Ave",
  streetSecondary: null,
  city: "Brooklyn",
  region: "NY",
  postalCode: "11208",
  country: "US",
  contactEmail: "hola@marisas.example",
  publicPhoneE164: "+13055550123",
  websiteUrl: null,
  services: [{ name: "Balayage", durationMin: 180, priceNote: "from $180" }],
  optInUrl: "/yes/marisas-beauty-salon",
  privacyUrl: "/b/marisas-beauty-salon",
  termsUrl: "/b/marisas-beauty-salon/terms",
};
const UNINDEXED = { index: false, follow: false };
const NOT_FOUND = { title: "Not found · Chanlytics", robots: UNINDEXED };

test("REGRESSION (N21): a /yes link no workspace answers to names the tab Not found -- it said 'Chanlytics OS' over the not-found page", () => {
  assert.equal(
    typeof contracts.consentPageMetadata,
    "function",
    "REGRESSION: the opt-in page named its tab only when it found a workspace",
  );
  assert.deepEqual(contracts.consentPageMetadata(null), NOT_FOUND);
  assert.deepEqual(
    contracts.consentPageMetadata(salonOptIn),
    { title: consentPageVM(salonOptIn).title, robots: UNINDEXED },
    "a found page is named by its heading, and still not indexed",
  );
  const noWay = { ...salonOptIn, whatsappE164: null };
  assert.equal(consentPageVM(noWay).empty, true);
  assert.equal(
    contracts.consentPageMetadata(noWay).title,
    consentPageVM(noWay).title,
    "a page with no way to say yes still renders, so it keeps its name",
  );

  assert.equal(
    typeof contracts.consentFormMetadata,
    "function",
    "REGRESSION: the paper form named its tab only when it found a workspace",
  );
  assert.deepEqual(contracts.consentFormMetadata(null), NOT_FOUND);
  assert.deepEqual(contracts.consentFormMetadata(salonOptIn), {
    title: `Sign-up form: ${consentFormVM(salonOptIn).title}`,
    robots: UNINDEXED,
  });

  // The desk sign joined them: named for the sheet and the business on it, Not found where they are, never indexed.
  assert.deepEqual(contracts.deskSignMetadata(null), NOT_FOUND);
  assert.deepEqual(contracts.deskSignMetadata(salonOptIn), {
    title: "Desk sign: Marisa's Beauty Salon",
    robots: UNINDEXED,
  });
  assert.deepEqual(
    contracts.deskSignMetadata(noWay),
    { title: "Desk sign: Marisa's Beauty Salon", robots: UNINDEXED },
    "with nothing to print it still renders, saying so, so it keeps its name",
  );
});

test("REGRESSION (N21): a /b page that shows Not found says so in the tab and is not indexed -- an unknown slug said 'Chanlytics OS', and a record with no address was named for the business and indexable", () => {
  assert.equal(
    typeof contracts.businessPageMetadata,
    "function",
    "REGRESSION: the business page named its tab by the record's name, whatever the page showed",
  );
  assert.equal(
    typeof contracts.textingTermsMetadata,
    "function",
    "REGRESSION: the terms page named its tab by the record's name, whatever the page showed",
  );
  assert.deepEqual(
    contracts.businessPageMetadata(null),
    NOT_FOUND,
    "REGRESSION: an unknown slug left the app's own title",
  );
  assert.deepEqual(contracts.textingTermsMetadata(null), NOT_FOUND);
  for (const [what, record] of [
    ["no street", { ...salonRecord, street: " " }],
    ["no city", { ...salonRecord, city: "" }],
    ["no legal name", { ...salonRecord, legalName: "" }],
  ]) {
    assert.equal(businessPageVM(record).empty, true, `${what}: the page shows Not found`);
    assert.equal(textingTermsVM(record).empty, true, `${what}: and so do the terms`);
    assert.deepEqual(
      contracts.businessPageMetadata(record),
      NOT_FOUND,
      `REGRESSION: ${what}: Not found was named for the business, and indexable`,
    );
    assert.deepEqual(contracts.textingTermsMetadata(record), NOT_FOUND, `REGRESSION: the terms, ${what}`);
  }
  assert.deepEqual(
    contracts.businessPageMetadata(salonRecord),
    {
      title: "Marisa's Beauty Salon",
      description: "Marisa's Beauty Salon — who we are, what we do, and our text-message terms.",
      robots: { index: true, follow: true },
    },
    "a page with something to show is named for the business customers know, and findable",
  );
  assert.deepEqual(contracts.textingTermsMetadata(salonRecord), {
    title: "Text messaging terms: Marisa's Beauty Salon",
    description: "The terms of the text messages Marisa's Beauty Salon sends.",
    robots: { index: true, follow: true },
  });
  assert.equal(
    contracts.businessPageMetadata({ ...salonRecord, tradeName: null }).title,
    "Marisa Beauty Corp",
    "without a trading name, the legal one",
  );
});
