/**
 * The page we publish for a business that has none.
 *
 * THE GAP THIS CLOSES. Chanlytics' own campaign was refused four times, and two
 * of those were about pages rather than messages:
 *
 *   30919  PRIVACY_POLICY_URL — "the provided website does not contain
 *          sufficient business information"
 *   30907  the website URL did not match the brand and the campaign
 *
 * Answering them took a business-identification block on two pages, a workspace
 * rename, a slug change, and an SMS-terms section added to a marketing site in a
 * different repository. Every customer needs the equivalent, and most salons
 * have a Facebook page and a Booksy link — so asking them for it is not a
 * requirement, it is the reason they never text.
 *
 * These pin what the page has to carry for a reviewer to accept it, and the one
 * property that makes the whole idea work: it is on the SAME DOMAIN as the
 * opt-in page, which is what 30907 was actually complaining about.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  businessPageVM,
  smsConsentSentence,
  registrationPreflight,
  SMS_CLAUSES,
  textingTermsVM,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const salon = {
  legalName: "Melany Beauty Corp",
  tradeName: "Melany's Beauty Salon",
  street: "2581 Pitkin Ave",
  streetSecondary: null,
  city: "Brooklyn",
  region: "NY",
  postalCode: "11208",
  country: "US",
  contactEmail: "hola@melanys.example",
  publicPhoneE164: "+13083368109",
  websiteUrl: null,
  services: [
    { name: "Balayage", durationMin: 180, priceNote: "from $180" },
    { name: "Cut", durationMin: 45, priceNote: null },
  ],
  optInUrl: "/yes/melanys-beauty-salon",
  privacyUrl: "/b/melanys-beauty-salon",
  termsUrl: "/b/melanys-beauty-salon/terms",
};

test("the four facts a reviewer scans for, and the name customers know", () => {
  const vm = businessPageVM(salon);
  assert.equal(vm.empty, false);
  // The TRADING name is the title: it is what customers call them and what the
  // campaign's samples say. The legal entity is in the identity block, where a
  // reviewer looks for it.
  assert.equal(vm.title, "Melany's Beauty Salon");
  const identity = Object.fromEntries(vm.identity.map((f) => [f.label, f.value]));
  assert.equal(identity["Legal name"], "Melany Beauty Corp, trading as Melany's Beauty Salon");
  assert.equal(identity["Address"], "2581 Pitkin Ave, Brooklyn, NY 11208, US");
  assert.equal(identity["Phone"], "+1 (308) 336-8109");
  assert.equal(identity["Email"], "hola@melanys.example");
  // A number and an address are things to act on, so they are links.
  assert.equal(vm.identity.find((f) => f.label === "Phone").href, "tel:+13083368109");

  // One name, said once, when the legal name IS the trading name.
  const one = businessPageVM({ ...salon, tradeName: null });
  assert.equal(one.title, "Melany Beauty Corp");
  assert.equal(one.identity[0].value, "Melany Beauty Corp", "no 'trading as' when there is nothing to distinguish");
});

test("their own website is linked, not replaced", () => {
  // The floor, not the ceiling. A business with a real site keeps filing it, and
  // this page still exists beside it.
  const withSite = businessPageVM({ ...salon, websiteUrl: "https://melanys.example" });
  assert.equal(withSite.websiteUrl, "https://melanys.example");
  assert.ok(withSite.identity.some((f) => f.label === "Website" && f.href === "https://melanys.example"));
  assert.equal(businessPageVM(salon).websiteUrl, null);
  assert.ok(
    !businessPageVM(salon).identity.some((f) => f.label === "Website"),
    "no empty row for a site they do not have",
  );
});

test("the SMS clauses are the shared ones, word for word", () => {
  const vm = businessPageVM(salon);
  assert.equal(vm.smsClauses, SMS_CLAUSES, "the same array, not a copy that can drift");
  const said = vm.smsClauses.join(" ");
  assert.match(said, /Message and data rates may apply/);
  assert.match(said, /Message frequency varies/);
  assert.match(said, /Reply STOP to stop and HELP for help/);
  assert.match(said, /No mobile information will be shared with third parties or affiliates/);
  assert.ok(!/standard rate/i.test(said), 'carriers refuse "standard": it implies premium-rate messaging');

  // The lead names the business and states what the texting line carries: no
  // promotions, ever, since the fourth refusal (30896) -- offers go by WhatsApp.
  assert.equal(vm.smsLead, smsConsentSentence("Melany's Beauty Salon"));
  assert.match(vm.smsLead, /Melany's Beauty Salon/);
  assert.match(vm.smsLead, /No offers or promotions are sent by text/);
  assert.match(vm.smsLead, /go by WhatsApp/);
});

test("a record too thin to identify anybody publishes nothing", () => {
  // 30919 refused a page that explained a product thoroughly and never said who
  // was behind it. A page with no legal name or no address is that page, and
  // publishing one is worse than publishing none: a reviewer reads it as
  // evasive rather than incomplete.
  for (const missing of [{ legalName: "" }, { street: "" }, { city: "" }]) {
    assert.equal(businessPageVM({ ...salon, ...missing }).empty, true, JSON.stringify(missing));
  }
  assert.equal(businessPageVM(salon).empty, false);
  const page = readCode("apps/dashboard/app/b/[slug]/page.tsx");
  assert.ok(page.includes("if (vm.empty) notFound();"), "and the page refuses to render it");
});

test("what they do, from what they already told the receptionist", () => {
  const vm = businessPageVM(salon);
  assert.deepEqual(vm.services, [
    { name: "Balayage", detail: "180 min · from $180" },
    { name: "Cut", detail: "45 min" },
  ]);
  // A price the business could not state flatly is free text, and a service with
  // neither duration nor price is still a service.
  assert.deepEqual(businessPageVM({ ...salon, services: [{ name: "Consult" }] }).services, [
    { name: "Consult", detail: null },
  ]);
  assert.deepEqual(businessPageVM({ ...salon, services: [] }).services, []);
});

test("the page is on the same domain as the opt-in page, which is what 30907 wanted", () => {
  const server = readCode("apps/dashboard/src/server/business-page.ts");
  // Relative, so it is the same site by construction rather than by a constant
  // somebody has to keep correct.
  assert.match(server, /optInUrl: `\/yes\/\$\{clean\}`/);
  assert.ok(
    !/https?:\/\//.test(server.slice(server.indexOf("optInUrl"))),
    "no hardcoded origin to point at the wrong deployment",
  );

  // And the ABSOLUTE form the carriers are handed is built the same way the
  // opt-in URL is, from one origin, at the one moment a filing is composed.
  // The door's filing is run in lines-door.test.mjs, and the sweep that finishes
  // a filing in cron-doors-b.test.mjs: in both, the captured campaign names
  // `/b/<slug>` as the privacy policy and `/yes/<slug>` in the flow, both on
  // DASHBOARD_ORIGIN.
});

test("a business with no website of its own files the page we publish", () => {
  const a2p = readCode("apps/edge/lib/lines/a2p.ts");
  // The privacy policy the carriers are given identifies the BUSINESS. Ours
  // identifies Chanlytics, which is the wrong answer to 30919's question.
  assert.match(a2p, /const privacyPolicyUrl = o\.hostedUrl \|\| o\.privacyUrl;/);
  // And the website on the brand's own end user is substituted ONCE, before any
  // request is built -- the brand, the campaign and the profile must all name
  // the same URL.
  assert.match(
    a2p,
    /const record = base\.websiteUrl\?\.trim\(\) \? base : \{ \.\.\.base, websiteUrl: o\.hostedUrl \?\? base\.websiteUrl \}/,
  );
  assert.ok(
    a2p.indexOf("const record = base.websiteUrl") < a2p.indexOf("const ports: A2PPorts"),
    "before anything is composed from it",
  );

  // Which is only safe because the form no longer demands a URL it cannot get.
  const rec = readRaw("packages/contracts/src/business-record.ts");
  assert.match(rec, /\{ name: "website_url", required: false \}/);
  assert.ok(rec.includes("We publish `/b/<slug>`"), "and says why, where the next person will read it");
});

test("the wiring: public, indexed, reads by slug, writes nothing", () => {
  const page = readCode("apps/dashboard/app/b/[slug]/page.tsx");
  assert.ok(page.includes("const facts = await businessPageFor(slug);") && page.includes("if (!facts) notFound();"));
  assert.ok(!/<form|<input|useState|"POST"/.test(page), "nothing to fill in and nothing to write");
  // INDEXED, unlike the opt-in page: a business a reviewer cannot look up is
  // exactly what 30919 was complaining about.
  assert.ok(
    page.includes("return businessPageMetadata(await businessPageFor(slug));"),
    "indexed by contracts' rule, which public-page-titles.test.mjs runs",
  );
  assert.ok(
    readCode("apps/dashboard/app/yes/[slug]/page.tsx").includes(
      "return consentPageMetadata(await consentPageFor(slug));",
    ),
    "and the opt-in page still is not",
  );

  const server = readCode("apps/dashboard/src/server/business-page.ts");
  assert.ok(server.includes('import "server-only";') && server.includes("createServiceClient({"));
  assert.ok(
    server.includes('if (!tenant || tenant.status === "test") return null;'),
    "a fixture workspace has no page",
  );
  assert.ok(
    server.includes("if (!record.data) return null;"),
    "and neither does a business that has not said who it is",
  );
  assert.ok(!/insert|update|delete|upsert/i.test(server), "the public page's reader may not write");

  // The identity is `business_records` -- the same facts the carriers vetted on
  // the brand. Publishing anything else would mean a page that disagrees with
  // the filing it exists to support.
  assert.ok(server.includes('.from("business_records")'));
  assert.ok(
    server.includes("parseTenantConfig(cfg.data?.config ?? null)?.brain?.profile"),
    "and the services are what they told the receptionist",
  );
});

test("Chanlytics' own policy and a workspace's page cannot drift", () => {
  const privacy = readRaw("apps/dashboard/app/privacy/page.tsx");
  assert.ok(
    privacy.includes('import { retentionWords, SMS_CLAUSES } from "@chanlytics/contracts";'),
    "the clauses, and the retention it prints, from contracts",
  );
  assert.ok(
    /<p>\s*\{retentionWords\(\)\} An owner can download everything a workspace holds/.test(privacy),
    "the page prints the contract's paragraph, not its own numbers",
  );
  assert.ok(privacy.includes('{SMS_CLAUSES.join(" ")}'), "the policy renders them rather than repeating them");
  // The sentence that is NOT shared is the one that names who is sending: the
  // policy speaks about businesses in general, a workspace's page names one.
  assert.ok(privacy.includes("A business&rsquo;s customers receive texts only when"));
  assert.ok(
    !privacy.includes("No mobile information will be shared with third parties or affiliates for marketing"),
    "REGRESSION: a second copy of a compliance clause",
  );
});

/* -------------------------------------------------------------------------- *
 * The pre-flight.
 *
 * A carrier rejection arrives DAYS later and says one thing at a time. The first
 * real campaign this product filed came back FOUR times — four weeks — for
 * faults that were every one of them visible before anything was sent.
 * -------------------------------------------------------------------------- */

const ready = (over = {}) => ({
  workspaceName: "Melany's Beauty Salon",
  legalName: "Melany Beauty Corp",
  tradeName: "Melany's Beauty Salon",
  street: "2581 Pitkin Ave",
  city: "Brooklyn",
  websiteUrl: null,
  hasOptInNumber: true,
  ...over,
});

test("a workspace that is ready has nothing to fix", () => {
  assert.deepEqual(registrationPreflight(ready()), []);
  // Their own site is fine, and so is no site at all.
  assert.deepEqual(registrationPreflight(ready({ websiteUrl: "https://melanys.example" })), []);
});

test("the name the carriers are told, against the name the brand registers", () => {
  // THE ONE THAT BIT US. The campaign states `tenants.name`; the brand registers
  // `business_records.legal_name`. A live campaign went to the carriers
  // describing a business called "Billing probe" — a workspace name from a
  // Stripe test — while the brand said RJ Capital LLC. The opt-in message that
  // carried it can NEVER be edited afterwards; correcting it needs a new
  // campaign and a second vetting fee.
  const [p] = registrationPreflight(ready({ workspaceName: "Billing probe" }));
  assert.equal(p.id, "name_mismatch");
  assert.match(p.what, /Billing probe/);
  assert.match(p.what, /Melany's Beauty Salon/);
  assert.match(p.fix, /cannot be changed after a filing/, "because that is the part that costs money to get wrong");

  // Either name matching is enough: a business is known by its trading name and
  // registered under its legal one.
  assert.deepEqual(registrationPreflight(ready({ workspaceName: "Melany Beauty Corp" })), []);
  assert.deepEqual(registrationPreflight(ready({ workspaceName: "Melany's Beauty Salon" })), []);
  // And the comparison is loose enough not to nag about punctuation or a suffix.
  for (const near of [
    "Melanys Beauty Salon",
    "MELANY'S BEAUTY SALON",
    "Melany Beauty Corp LLC",
    "The Melany Beauty Corp",
  ]) {
    assert.deepEqual(registrationPreflight(ready({ workspaceName: near })), [], near);
  }
});

test("the page the carriers will open has to exist", () => {
  // We file `/b/<slug>` as the website and the privacy policy. It renders from
  // the legal name and the address; without them it answers 404, so the filing
  // would name a URL that does not exist — which is 30919, a week later.
  for (const missing of [{ legalName: "" }, { street: "" }, { city: "" }]) {
    const ids = registrationPreflight(ready(missing)).map((p) => p.id);
    assert.ok(ids.includes("no_identity"), JSON.stringify(missing));
  }
  const [p] = registrationPreflight(ready({ street: "" })).filter((x) => x.id === "no_identity");
  assert.match(p.what, /cannot be published/);
  assert.match(p.fix, /legal name and the street address/);
});

test("the message flow must be true: somewhere for a customer to say yes", () => {
  // The flow tells the carriers customers opt in by texting this business.
  // Without a number the opt-in page says the business is not set up to take
  // sign-ups — so the flow would describe something that does not happen, which
  // is a statement to a regulator that is not true.
  const [p] = registrationPreflight(ready({ hasOptInNumber: false }));
  assert.equal(p.id, "no_opt_in_number");
  assert.match(p.fix, /has to be true/);
});

test("a website that is not a website is worse than none", () => {
  // With none we publish a page for them. With a broken one we file it.
  for (const bad of ["melanys", "www melanys com", "http://", "ftp://melanys.example"]) {
    const ids = registrationPreflight(ready({ websiteUrl: bad })).map((x) => x.id);
    assert.ok(ids.includes("website_unusable"), bad);
  }
  const [p] = registrationPreflight(ready({ websiteUrl: "melanys" }));
  assert.match(p.fix, /or clear it, and we will publish a page for you/);
  for (const good of ["https://melanys.example", "http://melanys.example/salon", "https://www.melanys.example"]) {
    assert.deepEqual(registrationPreflight(ready({ websiteUrl: good })), [], good);
  }
});

test("nothing is filed until they are answered, and the words reach the row", () => {
  const edge = readCode("apps/edge/lib/lines/a2p.ts");
  // Same moment as the record check, and before anything is created: on a real
  // filing each of these is a week of waiting and a fee already spent.
  assert.match(edge, /for \(const p of registrationPreflight\(\{/);
  // WHICH function checks, not merely whether the file mentions it anywhere. This
  // used to compare whole-FILE indices -- `registrationPreflight({` before
  // `const send = async` -- which is trivially true of a file where one sender
  // checks and another does not, and that is exactly what the file was: the refile
  // path reached the carriers through `resubmitRejectedCampaign`, which asked
  // nothing. a2p-refile.test.mjs now slices each sender and asks of each.
  assert.match(
    edge,
    /export async function filingProblems\(/,
    "one decider, so both senders can ask the same question",
  );
  const inRegister = edge.slice(edge.indexOf("export async function registerLine("));
  assert.ok(
    inRegister.indexOf("filingProblems(") < inRegister.indexOf("const send = async"),
    "before a single call is made",
  );
  assert.match(
    edge,
    /problems\.push\(`\$\{p\.what\} \$\{p\.fix\}`\)/,
    "what is wrong AND what to do, on the row the page reads",
  );
  // And they REACH the owner. The sentences used to be stored and then dropped:
  // the edge returned a token, the dashboard passed the token through, and the
  // bridge printed `record_incomplete` at the person who pressed the button.
  assert.ok(
    inRegister.slice(0, inRegister.indexOf("const send = async")).includes("problems,"),
    "returned as well as stored",
  );
  const owner = readCode("apps/dashboard/app/api/v1/lines/register/route.ts");
  assert.match(owner, /b\.error === "record_incomplete" \|\| b\.error === "sole_proprietor_incomplete"/);
  assert.match(owner, /problems\.length\s*\?\s*problems\.join\(" "\)/, "and become the refusal the owner reads");
  assert.ok(
    !owner.includes("sole_proprietor_unsupported"),
    "REGRESSION: a refusal for an error nothing can return since gate 7",
  );
  // The workspace's name is what the campaign will say, so it is what gets
  // checked -- not the record's, which is what the brand says.
  assert.match(edge, /workspaceName: o\.workspaceName,/);
  // And the door tells it whether anybody can say yes -- run in
  // lines-door.test.mjs: a line with no number and no active texting row is
  // refused with the sentence, and an active row beside it is enough.
});

test("what the program keeps and what for, on the page filed as the privacy policy", () => {
  // 30908's remedy asks a privacy policy to "document what customer data you
  // collect and how it's used"; the clause says what is NOT done, this says
  // what is.
  const vm = businessPageVM(salon);
  assert.equal(vm.yourData.length, 2);
  assert.match(
    vm.yourData[0],
    /Melany's Beauty Salon keeps your mobile number, the messages you and it exchange, and your yes to messages/,
  );
  assert.match(vm.yourData[1], /not shared with third parties or affiliates for marketing or promotional purposes/);
  assert.equal(vm.termsUrl, "/b/melanys-beauty-salon/terms", "and the program's own terms are beside it");
});

test("the program's terms carry the eight things a reviewer looks for, in the business's name", () => {
  // The reviewers' guide lists them; since 15 September 2026 each missing one is
  // its own error code (30557 to 30563). Chanlytics' /terms carried none.
  const vm = textingTermsVM(salon);
  assert.equal(vm.empty, false);
  assert.equal(vm.title, "Text messaging terms: Melany's Beauty Salon");
  assert.match(
    vm.lead,
    /Melany Beauty Corp, trading as Melany's Beauty Salon, 2581 Pitkin Ave, Brooklyn, NY 11208, US/,
    "who is bound: the registered name and address",
  );
  const by = Object.fromEntries(vm.items.map((i) => [i.label, i.text]));
  assert.match(by["The program"], /^Melany's Beauty Salon texts customers who asked for it/, "the program, named");
  assert.match(by["The program"], /No offers or promotions are sent by text/);
  assert.match(by["How you join"], /START/);
  assert.doesNotMatch(
    by["How you join"],
    /YES OFFERS/,
    "REGRESSION: a marketing keyword on the texting number is 30896",
  );
  assert.match(by["How you join"], /not a condition of any purchase/);
  assert.match(by["Message frequency"], /Message frequency varies/);
  assert.equal(by["Cost"], "Message and data rates may apply.", "verbatim");
  assert.equal(
    by["Help"],
    "Reply HELP for help, or call +1 (308) 336-8109 or email hola@melanys.example.",
    "a way to reach a person",
  );
  assert.match(by["Stop"], /Reply STOP at any time to stop/);
  assert.match(by["Carriers"], /carriers are not liable for delayed or undelivered messages/i);
  assert.equal(by["Your information"], SMS_CLAUSES[3], "the non-sharing clause, the shared copy");
  assert.equal(vm.privacyUrl, "/b/melanys-beauty-salon", "linked to the privacy page");
  assert.ok(!/standard rate/i.test(vm.items.map((i) => i.text).join(" ")), 'carriers refuse "standard"');
  // No number and no email: help is still HELP.
  assert.equal(
    textingTermsVM({ ...salon, publicPhoneE164: null, contactEmail: "" }).items.find((i) => i.label === "Help").text,
    "Reply HELP for help.",
  );
  // The same floor as the page beside it: nobody identified, nothing published.
  assert.equal(textingTermsVM({ ...salon, legalName: "" }).empty, true);
});
