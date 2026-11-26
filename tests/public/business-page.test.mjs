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
  businessFieldsFor,
  businessPageVM,
  businessRecordProblems,
  smsConsentSentence,
  registrationPreflight,
  retentionWords,
  SMS_CLAUSES,
  textingTermsVM,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import {
  FILING,
  LINE,
  RECORD,
  VAULT,
  answer,
  form,
  knock,
  unfiled,
  use,
  wire,
  withEnv,
  world,
} from "../lines/door/_door.mjs";
import { campaignFactsFor } from "../../apps/edge/lib/lines/a2p-campaign-facts.ts";

const salon = {
  legalName: "Marisa Beauty Corp",
  about: "A beauty salon in Brooklyn: hair, colour, nails and brows for walk-in and booked clients, who pay per visit.",
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
  services: [
    { name: "Balayage", durationMin: 180, priceNote: "from $180" },
    { name: "Cut", durationMin: 45, priceNote: null },
  ],
  optInUrl: "/yes/marisas-beauty-salon",
  privacyUrl: "/b/marisas-beauty-salon",
  termsUrl: "/b/marisas-beauty-salon/terms",
};

test("the four facts a reviewer scans for, and the name customers know", () => {
  const vm = businessPageVM(salon);
  assert.equal(vm.empty, false);
  // The TRADING name is the title: it is what customers call them and what the
  // campaign's samples say. The legal entity is in the identity block, where a
  // reviewer looks for it.
  assert.equal(vm.title, "Marisa's Beauty Salon");
  const identity = Object.fromEntries(vm.identity.map((f) => [f.label, f.value]));
  assert.equal(identity["Legal name"], "Marisa Beauty Corp, trading as Marisa's Beauty Salon");
  assert.equal(identity["Address"], "1200 Maple Ave, Brooklyn, NY 11208, US");
  assert.equal(identity["Phone"], "+1 (305) 555-0123");
  assert.equal(identity["Email"], "hola@marisas.example");
  // A number and an address are things to act on, so they are links.
  assert.equal(vm.identity.find((f) => f.label === "Phone").href, "tel:+13055550123");

  // One name, said once, when the legal name IS the trading name.
  const one = businessPageVM({ ...salon, tradeName: null });
  assert.equal(one.title, "Marisa Beauty Corp");
  assert.equal(one.identity[0].value, "Marisa Beauty Corp", "no 'trading as' when there is nothing to distinguish");
});

test("their own website is linked, not replaced", () => {
  // The floor, not the ceiling. A business with a real site keeps filing it, and
  // this page still exists beside it.
  const withSite = businessPageVM({ ...salon, websiteUrl: "https://marisas.example" });
  assert.equal(withSite.websiteUrl, "https://marisas.example");
  assert.ok(withSite.identity.some((f) => f.label === "Website" && f.href === "https://marisas.example"));
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
  assert.equal(vm.smsLead, smsConsentSentence("Marisa's Beauty Salon"));
  assert.match(vm.smsLead, /Marisa's Beauty Salon/);
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
  // And the page refuses to render it: run by its slug in public/the-pages-answer-for-their-slug.test.mjs (no legal name,
  // no street, no city: Not found, and the tab says so).
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
  // Relative, so it is the same site by construction rather than by a constant somebody has to keep correct: the reader's
  // links are run in a-paused-workspace-asks-nobody-for-a-yes.test.mjs (/yes/<slug>, /b/<slug>, /b/<slug>/terms).
  // And the ABSOLUTE form the phone networks are handed is built the same way the
  // opt-in URL is, from one origin, at the one moment a filing is composed.
  // The door's filing is run in lines/door/, and the sweep that finishes
  // a filing in cron/doors-b/: in both, the captured campaign names
  // `/b/<slug>` as the privacy policy and `/yes/<slug>` in the flow, both on
  // DASHBOARD_ORIGIN.
});

test("a business with no website of its own files the page we publish", async () => {
  // The privacy policy the phone networks are given identifies the BUSINESS. Ours
  // identifies Chanlytics, which is the wrong answer to 30919's question.
  const privacyFiled = (hostedUrl) =>
    campaignFactsFor({
      businessName: "Marisa's Beauty Salon",
      optInUrl: "https://app.example.com/yes/marisas",
      privacyUrl: "https://app.example.com/privacy",
      termsUrl: "https://app.example.com/terms",
      hostedUrl,
    }).privacyPolicyUrl;
  assert.equal(privacyFiled("https://app.example.com/b/marisas"), "https://app.example.com/b/marisas");
  assert.equal(privacyFiled(null), "https://app.example.com/privacy", "ours only when no page is hosted for them");
  // And the website on the brand's own end user is substituted ONCE, before any request is built -- the brand, the
  // campaign and the profile must all name the same URL. The edge's register door, run over the carriers' wire
  // (lines/door/_door.mjs): a business with no website files its page here, and one with a site of its own keeps it.
  const filedWebsite = async (website_url) => {
    const tables = world({ lines: [unfiled()], business_records: [{ ...RECORD, website_url }] });
    use(tables, VAULT);
    let n = 0;
    const carrier = wire((req) => {
      if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
      return { status: 201, body: { sid: `XX${String(++n).padStart(4, "0")}` } };
    });
    try {
      await withEnv(FILING, async () => {
        const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
        assert.equal(status, 200, JSON.stringify(body));
      });
    } finally {
      carrier.restore();
    }
    const business = carrier.seen.find(
      (r) => r.url.endsWith("/EndUsers") && form(r).get("Type") === "customer_profile_business_information",
    );
    const campaign = form(carrier.seen.at(-1));
    return {
      website: JSON.parse(form(business).get("Attributes")).website_url,
      policy: campaign.get("PrivacyPolicyUrl"),
    };
  };
  assert.deepEqual(
    await filedWebsite(""),
    { website: "https://dash.test/b/harbor-moving", policy: "https://dash.test/b/harbor-moving" },
    "no website: the page we publish is the business's website and its policy, one URL",
  );
  assert.equal((await filedWebsite("https://harbormoving.example")).website, "https://harbormoving.example");

  // Which is only safe because the form no longer demands a URL it cannot get: for a company and for a person trading
  // under a name alike, a record with no website lacks nothing.
  for (const path of ["standard", "sole_proprietor"]) {
    assert.equal(
      businessFieldsFor(path).find((f) => f.name === "website_url").required,
      false,
      `${path}: the website is asked, never required`,
    );
    assert.equal(
      businessRecordProblems({ website_url: "" }, path).website_url,
      undefined,
      `${path}: a record with no website lacks nothing for it`,
    );
  }
});

// The wiring, public, indexed, reads by slug and writes nothing: the page asks its reader for the slug and is Not found
// for a workspace that has no page; INDEXED, unlike the opt-in page, since a business a reviewer cannot look up is exactly
// what 30919 was complaining about. Both pages are run by their slug in public/the-pages-answer-for-their-slug.test.mjs,
// their tabs held to contracts' rule; the reader (fixtures and ended workspaces have no page, nor a business that has not
// said who it is; only selects; the identity from business_records' public columns and the services from the
// receptionist's profile) is run in a-paused-workspace-asks-nobody-for-a-yes.test.mjs.

test("Chanlytics' own policy and a workspace's page cannot drift", async () => {
  // The policy as it is served (app/privacy/page.tsx), drawn on a server's React: the words it says.
  globalThis.React ??= (await import("react")).default;
  const { default: PrivacyPage } = await import("../../apps/dashboard/app/privacy/page.tsx");
  const words = (n) =>
    n == null || typeof n === "boolean"
      ? ""
      : typeof n !== "object"
        ? String(n)
        : Array.isArray(n)
          ? n.map(words).join("")
          : typeof n.type === "function"
            ? words(n.type(n.props))
            : words(n.props?.children);
  const privacy = words(PrivacyPage());
  assert.ok(
    privacy.includes(
      `${retentionWords()} An owner can download a copy of a workspace’s records from Settings › Billing:`,
    ),
    "the page prints the contract's retention paragraph, not its own numbers",
  );
  assert.ok(privacy.includes(SMS_CLAUSES.join(" ")), "the policy renders the clauses rather than repeating them");
  // The sentence that is NOT shared is the one that names who is sending: the
  // policy speaks about businesses in general, a workspace's page names one.
  assert.ok(privacy.includes("A business’s customers receive texts only when"));
  for (const clause of SMS_CLAUSES)
    assert.equal(privacy.split(clause).length - 1, 1, `REGRESSION: a second copy of a compliance clause: ${clause}`);
});

/* -------------------------------------------------------------------------- *
 * The pre-flight.
 *
 * A carrier rejection arrives DAYS later and says one thing at a time. The first
 * real campaign this product filed came back FOUR times — four weeks — for
 * faults that were every one of them visible before anything was sent.
 * -------------------------------------------------------------------------- */

const ready = (over = {}) => ({
  workspaceName: "Marisa's Beauty Salon",
  legalName: "Marisa Beauty Corp",
  about: "A beauty salon in Brooklyn: hair, colour, nails and brows for walk-in and booked clients, who pay per visit.",
  tradeName: "Marisa's Beauty Salon",
  street: "1200 Maple Ave",
  city: "Brooklyn",
  websiteUrl: null,
  hasOptInNumber: true,
  ...over,
});

test("a workspace that is ready has nothing to fix", () => {
  assert.deepEqual(registrationPreflight(ready()), []);
  // Their own site is fine, and so is no site at all.
  assert.deepEqual(registrationPreflight(ready({ websiteUrl: "https://marisas.example" })), []);
});

test("the name the phone networks are told, against the name the brand registers", () => {
  // THE ONE THAT BIT US. The campaign states `tenants.name`; the brand registers
  // `business_records.legal_name`. A live campaign went to the carriers
  // describing a business called "Billing probe" — a workspace name from a
  // Stripe test — while the brand said RJ Capital LLC. The opt-in message that
  // carried it can NEVER be edited afterwards; correcting it needs a new
  // campaign and a second vetting fee.
  const [p] = registrationPreflight(ready({ workspaceName: "Billing probe" }));
  assert.equal(p.id, "name_mismatch");
  assert.match(p.what, /Billing probe/);
  assert.match(p.what, /Marisa's Beauty Salon/);
  assert.match(p.fix, /Once filed, it can't change/, "because that is the part that costs money to get wrong");

  // Either name matching is enough: a business is known by its trading name and
  // registered under its legal one.
  assert.deepEqual(registrationPreflight(ready({ workspaceName: "Marisa Beauty Corp" })), []);
  assert.deepEqual(registrationPreflight(ready({ workspaceName: "Marisa's Beauty Salon" })), []);
  // And the comparison is loose enough not to nag about punctuation or a suffix.
  for (const near of [
    "Marisas Beauty Salon",
    "MARISA'S BEAUTY SALON",
    "Marisa Beauty Corp LLC",
    "The Marisa Beauty Corp",
  ]) {
    assert.deepEqual(registrationPreflight(ready({ workspaceName: near })), [], near);
  }
});

test("the name the receptionist answers in, against the name the filing states (X4-5)", () => {
  // A customer who signs up under the page's name and is answered under another reads two businesses, and the name the
  // campaign files is in the confirmation for good. An owner's save of the name renames both, so the fix is one save.
  const [p] = registrationPreflight(ready({ receptionistName: "Harbor Hair Studio" }));
  assert.equal(p.id, "names_differ");
  assert.match(p.what, /Harbor Hair Studio/);
  assert.match(p.what, /Marisa's Beauty Salon/);
  assert.match(p.fix, /Settings › Details/);
  // One name, said loosely, is one name; and a name never read refuses nothing.
  for (const same of [
    "Marisa's Beauty Salon",
    "Marisa’s Beauty Salon",
    "MARISAS BEAUTY SALON",
    null,
    undefined,
    "",
    "  ",
  ])
    assert.deepEqual(registrationPreflight(ready({ receptionistName: same })), [], String(same));
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
  assert.match(p.what, /can't be published/);
  assert.match(p.fix, /legal name and the street address/);
});

test("the message flow must be true: somewhere for a customer to say yes", () => {
  // The flow tells the carriers customers opt in by texting this business.
  // Without a number the opt-in page says the business is not set up to take
  // sign-ups — so the flow would describe something that does not happen, which
  // is a statement to a regulator that is not true.
  const [p] = registrationPreflight(ready({ hasOptInNumber: false }));
  assert.equal(p.id, "no_opt_in_number");
  assert.match(p.fix, /told customers opt in by texting you/);
});

test("a website that is not a website is worse than none", () => {
  // With none we publish a page for them. With a broken one we file it.
  for (const bad of ["marisas", "www marisas com", "http://", "ftp://marisas.example"]) {
    const ids = registrationPreflight(ready({ websiteUrl: bad })).map((x) => x.id);
    assert.ok(ids.includes("website_unusable"), bad);
  }
  const [p] = registrationPreflight(ready({ websiteUrl: "marisas" }));
  assert.match(p.fix, /or clear it and Chanlytics publishes a page for you/);
  for (const good of ["https://marisas.example", "http://marisas.example/salon", "https://www.marisas.example"]) {
    assert.deepEqual(registrationPreflight(ready({ websiteUrl: good })), [], good);
  }
});

test("nothing is filed until they are answered, and the words reach the row", async () => {
  // The edge: the pre-flight is asked at the same moment as the record check, before anything is created, by every door
  // that talks to the carriers, and what is wrong AND what to do lands on the row the page reads and in the answer. Run
  // over the carriers' wire in lines/door/register-and-its-status.test.mjs (a name the campaign would say that the record
  // does not, and a line nobody can say yes on: 409 with the sentences, nothing sent, the row needs the record) and
  // lines/filing/a2p-refile.test.mjs ("EVERY door that talks to the carriers asks first"). The workspace's name is what
  // the campaign will say, so it is what is checked there.
  //
  // And they REACH the owner. The sentences used to be stored and then dropped: the edge returned a token, the dashboard
  // passed the token through, and the bridge printed `record_incomplete` at the person who pressed the button. The
  // owner's route (lines/register), run over an edge that refuses so.
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaab01";
  const OWNER = "u-owner";
  const env = { EDGE_CALL_SECRET: "edge-secret-for-this-file", EDGE_PROVIDERS: "live" };
  const kept = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
  const register = await importSrc("apps/dashboard/app/api/v1/lines/register/route.ts");
  const owner = {
    supabase: fakeDb({
      memberships: [
        {
          user_id: OWNER,
          tenant_id: T,
          role: "owner",
          tenants: { slug: "harbor" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      tenants: [{ id: T, slug: "harbor", name: "Harbor Moving", status: "active", timezone: "America/New_York" }],
      billing_accounts: [{ tenant_id: T, mode: "stripe", status: "trialing" }],
    }),
    userId: OWNER,
    email: "ada@example.com",
    aal: "aal2",
    params: {},
  };
  const wasFetch = globalThis.fetch;
  /** The owner's press, over an edge whose register answers 409 with `refusal`: what the owner is told. */
  const told = async (refusal) => {
    setRateStore(memoryStore());
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: false, ...refusal }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    const press = new Request(`http://localhost/api/v1/lines/register?workspace=${T}`, {
      method: "POST",
      body: JSON.stringify({ line_id: "22222222-2222-4222-8222-222222222222" }),
    });
    try {
      await register.POST.run(press, owner);
    } catch (e) {
      return { code: e.code, message: e.message };
    }
    assert.fail("the route answered where it should have refused");
  };
  try {
    const problems = [
      'The texts will say "Harbor Moving" but the business on record is "Billing probe". Use one name in both.',
      "Nowhere for a customer to say yes yet. Connect a number they can text first.",
    ];
    for (const error of ["record_incomplete", "sole_proprietor_incomplete"])
      assert.deepEqual(
        await told({ error, problems }),
        { code: "conflict", message: problems.join(" ") },
        `${error}: the pre-flight's sentences become the refusal the owner reads`,
      );
    assert.match(
      (await told({ error: "record_incomplete", problems: [" ", 7] })).message,
      /^Something on your business record is not ready/,
      "and with none it can read, a sentence that says where to look, never the token",
    );
  } finally {
    globalThis.fetch = wasFetch;
    setRateStore(null);
    for (const [k, v] of Object.entries(kept))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  }
});

test("what the program keeps and what for, on the page filed as the privacy policy", () => {
  // 30908's remedy asks a privacy policy to "document what customer data you
  // collect and how it's used"; the clause says what is NOT done, this says
  // what is.
  const vm = businessPageVM(salon);
  assert.equal(vm.yourData.length, 2);
  assert.match(
    vm.yourData[0],
    /Marisa's Beauty Salon keeps your mobile number, the messages you and it exchange, and your consent to messages/,
  );
  assert.match(vm.yourData[1], /not shared with third parties or affiliates for marketing or promotional purposes/);
  assert.equal(vm.termsUrl, "/b/marisas-beauty-salon/terms", "and the program's own terms are beside it");
});

test("the program's terms carry the eight things a reviewer looks for, in the business's name", () => {
  // The reviewers' guide lists them; since 15 September 2026 each missing one is
  // its own error code (30557 to 30563). Chanlytics' /terms carried none.
  const vm = textingTermsVM(salon);
  assert.equal(vm.empty, false);
  assert.equal(vm.title, "Text messaging terms: Marisa's Beauty Salon");
  assert.match(
    vm.lead,
    /Marisa Beauty Corp, trading as Marisa's Beauty Salon, 1200 Maple Ave, Brooklyn, NY 11208, US/,
    "who is bound: the registered name and address",
  );
  const by = Object.fromEntries(vm.items.map((i) => [i.label, i.text]));
  assert.match(by["The program"], /^Marisa's Beauty Salon texts customers who asked for it/, "the program, named");
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
    "Reply HELP for help, or call +1 (305) 555-0123 or email hola@marisas.example.",
    "a way to reach a person",
  );
  assert.match(by["Stop"], /Reply STOP at any time to stop/);
  assert.match(by["Carriers"], /carriers are not liable for delayed or undelivered messages/i);
  assert.equal(by.Privacy, SMS_CLAUSES[3], "the non-sharing clause, the shared copy");
  assert.equal(vm.privacyUrl, "/b/marisas-beauty-salon", "linked to the privacy page");
  assert.ok(!/standard rate/i.test(vm.items.map((i) => i.text).join(" ")), 'carriers refuse "standard"');
  // No number and no email: help is still HELP.
  assert.equal(
    textingTermsVM({ ...salon, publicPhoneE164: null, contactEmail: "" }).items.find((i) => i.label === "Help").text,
    "Reply HELP for help.",
  );
  // The same floor as the page beside it: nobody identified, nothing published.
  assert.equal(textingTermsVM({ ...salon, legalName: "" }).empty, true);
});

test("what the business does, and its industry, before what can be booked", () => {
  // The ninth refusal of the live campaign (30919, 22 Sep 2026): the reviewers could not "verify the
  // operational business model" and asked for "the products, services, and industry". A services list
  // names what can be booked without saying what kind of business books it.
  const vm = businessPageVM({ ...salon, industry: "PROFESSIONAL_SERVICES" });
  assert.equal(vm.about, salon.about);
  const identity = Object.fromEntries(vm.identity.map((f) => [f.label, f.value]));
  assert.equal(identity["Industry"], "Professional services", "the vertical the brand was registered under, in words");
  assert.deepEqual(
    vm.identity.map((f) => f.label),
    ["Legal name", "Industry", "Address", "Phone", "Email"],
  );

  // Nothing said is nothing shown: no empty paragraph, no industry row.
  const bare = businessPageVM({ ...salon, about: "  ", industry: "" });
  assert.equal(bare.about, null);
  assert.ok(!bare.identity.some((f) => f.label === "Industry"));
});

test("a filing waits until the business has said what it does", () => {
  const [p, ...rest] = registrationPreflight(ready({ about: "" }));
  assert.equal(rest.length, 0);
  assert.equal(p.id, "no_about");
  assert.match(p.fix, /What the business does/, "the fix names the box that answers it");
  assert.equal(registrationPreflight(ready({ about: "Hair." }))[0].id, "no_about", "a word is not a business model");
  // An older caller that never passed it is asked too: a filing without it is the one that was refused.
  const { about: _gone, ...older } = ready();
  assert.equal(registrationPreflight(older)[0].id, "no_about");
});
