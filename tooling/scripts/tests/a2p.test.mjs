/**
 * Registering a workspace with the carriers: the requests pinned to
 * Twilio's documented shapes and to the policy ids read from Twilio's own
 * Policies endpoint, the saga's order and its idempotent resume — which
 * matters more here than anywhere else, because a repeated brand
 * registration is a second fee for the same business — and the wiring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  A2P_POLICIES,
  A2P_STEPS,
  EMPTY_A2P_STATE,
  LOW_VOLUME_USECASE,
  brandTypeFor,
  nextA2PStep,
  smsStateFor,
  registrationVerdict,
  runA2PSaga,
  isBrandNotReady,
  a2pProfileEndUserRequest,
  starterEndUserRequest,
  soleProprietorEndUserRequest,
  addressRequest,
  a2pProfileRequest,
  brandRequest,
  businessEndUserRequest,
  campaignRequest,
  customerProfileRequest,
  evaluateRequest,
  representativeEndUserRequest,
  submitProfileRequest,
  supportingDocumentRequest,
  encodeForm,
  keywordsFor,
  refusalWords,
} from "@chanlytics/channels";
import {
  BUSINESS_INDUSTRIES,
  DEFAULT_INDUSTRY,
  industryOf,
  COMPANY_TYPES,
  companyTypeOf,
  businessTypeOf,
  businessFieldsFor,
  businessRecordProblems,
  businessRecordLine,
  emptyBusinessRecord,
  EVENT_KINDS,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const RECORD = {
  legalName: "Harbor Moving LLC",
  tradeName: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  streetSecondary: null,
  city: "Brooklyn",
  region: "NY",
  postalCode: "11207",
  country: "US",
  websiteUrl: "https://app.chanlytics.com/yes/harbor-moving",
  industry: "PROFESSIONAL",
  contactFirstName: "Ruben",
  contactLastName: "Segura",
  contactEmail: "hi@chanlytics.com",
  contactPhone: "+16465550123",
  contactTitle: "Owner",
  contactJobPosition: "Director",
  businessType: "Limited Liability Corporation",
  companyType: "private",
};

test("the policy ids are the ones Twilio names, and a tax id decides the brand type", () => {
  assert.equal(A2P_POLICIES.secondaryCustomerProfile, "RNdfbf3fae0e1107f8aded0e7cead80bf5");
  assert.equal(A2P_POLICIES.a2pMessaging, "RNb0d4771c2c98518d916a3d4cd70a8f8b");
  assert.equal(A2P_POLICIES.soleProprietor, "RN670d5d2e282a6130ae063b234b6019c8");
  assert.equal(brandTypeFor(RECORD), "STANDARD");
  assert.equal(brandTypeFor({ ein: null }), "SOLE_PROPRIETOR");
  assert.equal(brandTypeFor({ ein: "   " }), "SOLE_PROPRIETOR", "blank is not a tax id");
});

test("every request is the documented URL and the documented fields", () => {
  const p = customerProfileRequest({
    friendlyName: "Harbor Moving",
    email: "hi@chanlytics.com",
    statusCallback: "https://edge/cb",
  });
  assert.equal(p.url, "https://trusthub.twilio.com/v1/CustomerProfiles");
  assert.deepEqual(p.form, {
    FriendlyName: "Harbor Moving",
    Email: "hi@chanlytics.com",
    PolicySid: A2P_POLICIES.secondaryCustomerProfile,
    StatusCallback: "https://edge/cb",
  });

  const b = businessEndUserRequest(RECORD);
  assert.equal(b.url, "https://trusthub.twilio.com/v1/EndUsers");
  assert.equal(b.form.Type, "customer_profile_business_information");
  const ba = JSON.parse(b.form.Attributes);
  assert.equal(ba.business_name, "Harbor Moving LLC");
  assert.equal(ba.business_registration_number, "12-3456789");
  assert.equal(ba.business_regions_of_operation, "USA_AND_CANADA");
  // The legal form is ASKED, never inferred: a corporation with a tax id was
  // being told to the carriers as a limited liability corporation.
  assert.equal(ba.business_type, "Limited Liability Corporation");
  assert.equal(
    JSON.parse(businessEndUserRequest({ ...RECORD, businessType: "Partnership" }).form.Attributes).business_type,
    "Partnership",
  );
  assert.equal(
    JSON.parse(businessEndUserRequest({ ...RECORD, businessType: "Sole Proprietorship" }).form.Attributes)
      .business_type,
    "Limited Liability Corporation",
    "a value Twilio does not accept becomes the default, never reaches them",
  );
  assert.equal(ba.business_registration_identifier, "EIN");
  assert.equal(ba.website_url, RECORD.websiteUrl, "the reviewer is sent to a page that exists");

  const r = representativeEndUserRequest(RECORD);
  assert.equal(r.form.Type, "authorized_representative_1");
  assert.equal(JSON.parse(r.form.Attributes).email, "hi@chanlytics.com");

  const a = addressRequest("ACmaster", RECORD);
  assert.equal(a.url, "https://api.twilio.com/2010-04-01/Accounts/ACmaster/Addresses.json");
  assert.equal(a.form.Region, "NY");
  assert.equal(a.form.StreetSecondary, undefined, "an absent second line is absent, not empty");

  const d = supportingDocumentRequest({ legalName: "Harbor Moving LLC", addressSid: "AD1" });
  assert.equal(d.form.Type, "customer_profile_address");
  assert.deepEqual(JSON.parse(d.form.Attributes), { address_sids: "AD1" });

  assert.deepEqual(evaluateRequest("BU1").form, { PolicySid: A2P_POLICIES.secondaryCustomerProfile });
  assert.deepEqual(submitProfileRequest("BU1"), {
    url: "https://trusthub.twilio.com/v1/CustomerProfiles/BU1",
    method: "POST",
    form: { Status: "pending-review" },
  });
  assert.equal(
    a2pProfileRequest({ friendlyName: "Harbor Moving", email: "hi@chanlytics.com" }).form.PolicySid,
    A2P_POLICIES.a2pMessaging,
  );

  const brand = brandRequest({
    customerProfileBundleSid: "BU1",
    a2pProfileBundleSid: "BU2",
    brandType: "STANDARD",
    mock: true,
    skipVetting: false,
  });
  assert.equal(brand.url, "https://messaging.twilio.com/v1/a2p/BrandRegistrations");
  assert.deepEqual(brand.form, {
    CustomerProfileBundleSid: "BU1",
    A2PProfileBundleSid: "BU2",
    BrandType: "STANDARD",
    Mock: "true",
  });
  assert.equal(
    brandRequest({
      customerProfileBundleSid: "BU1",
      a2pProfileBundleSid: "BU2",
      brandType: "SOLE_PROPRIETOR",
      mock: false,
      skipVetting: true,
    }).form.Mock,
    undefined,
    "a real filing never says Mock",
  );
});

test("the brand does not buy a vetting a low-volume campaign cannot use", () => {
  // The first real filing this product made cost $46.00 in two one-time events
  // -- $4 of brand registration and the rest an automatic secondary vetting
  // nobody asked for. What a vetting buys is a brand SCORE, and a score buys
  // T-Mobile throughput. That one came back 46, below the tier threshold, on a
  // LOW_VOLUME campaign that sends a handful of messages a day. It bought
  // nothing, and it would have done so for every customer, for ever.
  const skipped = brandRequest({
    customerProfileBundleSid: "BU1",
    a2pProfileBundleSid: "BU2",
    brandType: "STANDARD",
    mock: false,
    skipVetting: true,
  });
  assert.equal(skipped.form.SkipAutomaticSecVet, "true");
  const vetted = brandRequest({
    customerProfileBundleSid: "BU1",
    a2pProfileBundleSid: "BU2",
    brandType: "STANDARD",
    mock: false,
    skipVetting: false,
  });
  assert.equal(vetted.form.SkipAutomaticSecVet, undefined, "asking for it stays possible, and stays a decision");
  // Tied to the use case, in one place, where both are visible at once.
  const edge = readCode("apps/edge/lib/lines/a2p.ts");
  assert.ok(edge.includes("useCase: LOW_VOLUME_USECASE,") && edge.includes("skipVetting: true,"));
  assert.ok(
    readRaw("packages/channels/src/a2p.ts").includes("A brand can be vetted later"),
    "and says how to get it when a workspace needs it",
  );
});

test("the industry is Twilio's enum: an unknown value becomes the default rather than a refusal", () => {
  assert.ok(BUSINESS_INDUSTRIES.includes("PROFESSIONAL_SERVICES") && BUSINESS_INDUSTRIES.includes("HOSPITALITY"));
  assert.ok(
    !BUSINESS_INDUSTRIES.includes("PROFESSIONAL"),
    "REGRESSION: 'PROFESSIONAL' is refused at the evaluation, after every other step is already made",
  );
  assert.equal(industryOf("PROFESSIONAL"), "PROFESSIONAL_SERVICES");
  assert.equal(industryOf("hospitality"), "HOSPITALITY");
  assert.equal(industryOf(null), DEFAULT_INDUSTRY);
  assert.equal(
    JSON.parse(businessEndUserRequest({ ...RECORD, industry: "PROFESSIONAL" }).form.Attributes).business_industry,
    "PROFESSIONAL_SERVICES",
  );
});

test("what the owner last typed is what Twilio evaluates", async () => {
  const seen = [];
  const send = async (req) => {
    seen.push(req.url);
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    return { status: 201, body: { sid: "XX0001" } };
  };
  const state = {
    ...EMPTY_A2P_STATE,
    profileSid: "BU1",
    businessSid: "IT1",
    representativeSid: "IT2",
    addressSid: "AD1",
    documentSid: "RD1",
    primaryAssigned: true,
  };
  const r = await runA2PSaga(state, {
    send,
    accountSid: "ACmaster",
    primaryProfileSid: "BUprimary",
    email: "hi@chanlytics.com",
    workspace: { name: "Harbor Moving" },
    record: RECORD,
    campaign: {
      description: "d".repeat(45),
      messageFlow: "f".repeat(45),
      samples: ["one sample message here", "two sample message here"],
      optInMessage: "subscribed",
      optInKeywords: ["YES OFFERS"],
      privacyPolicyUrl: "https://p",
      termsUrl: "https://t",
    },
    messagingServiceSid: "MG1",
    useCase: LOW_VOLUME_USECASE,
    mock: true,
    save: async () => {},
  });
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  assert.ok(
    seen.includes("https://trusthub.twilio.com/v1/EndUsers/IT1") &&
      seen.includes("https://trusthub.twilio.com/v1/EndUsers/IT2"),
    "both end users are refreshed",
  );
  assert.ok(
    seen.indexOf("https://trusthub.twilio.com/v1/EndUsers/IT1") <
      seen.indexOf("https://trusthub.twilio.com/v1/CustomerProfiles/BU1/Evaluations"),
    "before the evaluation, which is the last moment it can matter",
  );
});

test("the campaign says what the carriers ask, with the samples and keywords as a list", () => {
  const c = campaignRequest({
    brandSid: "BN1",
    messagingServiceSid: "MG1",
    description: "d".repeat(45),
    messageFlow: "f".repeat(45),
    samples: ["one sample message here ok", "two sample message here ok"],
    optInMessage: "You are subscribed. Reply STOP.",
    optInKeywords: ["YES OFFERS", "START", "UNSTOP"],
    privacyPolicyUrl: "https://app.chanlytics.com/privacy",
    termsUrl: "https://app.chanlytics.com/terms",
    useCase: LOW_VOLUME_USECASE,
  });
  assert.equal(c.url, "https://messaging.twilio.com/v1/Services/MG1/Compliance/Usa2p");

  assert.equal(c.form.BrandRegistrationSid, "BN1");
  assert.equal(c.form.UsAppToPersonUsecase, "LOW_VOLUME");
  // Repeated keys, not indexed ones: Twilio answers an indexed list with
  // "Unable to process JSON" after the brand has already been registered.
  assert.deepEqual(c.form.MessageSamples, ["one sample message here ok", "two sample message here ok"]);
  // A keyword is one word: the carriers refuse a space, at the campaign,
  // after the brand is already registered.
  assert.deepEqual(c.form.OptInKeywords, ["START", "UNSTOP"]);
  const wire = encodeForm(c.form);
  assert.equal((wire.match(/MessageSamples=/g) ?? []).length, 2);
  assert.ok(wire.includes("OptInKeywords=START") && wire.includes("OptInKeywords=UNSTOP"));
  assert.ok(
    !wire.includes("YES+OFFERS"),
    "REGRESSION: a two-word keyword is refused with 'must contain either alphanumeric or accented characters'",
  );
  assert.deepEqual(keywordsFor(["YES OFFERS", "start", "SI OFERTAS", " STOP "]), ["start", "STOP"]);
  const none = campaignRequest({
    brandSid: "BN1",
    messagingServiceSid: "MG1",
    description: "d".repeat(45),
    messageFlow: "f".repeat(45),
    samples: ["one sample message here ok"],
    optInMessage: "subscribed here",
    optInKeywords: ["YES OFFERS"],
    privacyPolicyUrl: "https://p",
    termsUrl: "https://t",
    useCase: LOW_VOLUME_USECASE,
  });
  assert.equal(none.form.OptInKeywords, undefined);
  assert.equal(none.form.OptInMessage, undefined, "no keywords, no keyword message");
  assert.ok(!wire.includes("%5B0%5D"), "no indexed keys reach the wire");
  assert.equal(c.form.PrivacyPolicyUrl, "https://app.chanlytics.com/privacy");
  assert.equal(c.form.TermsAndConditionsUrl, "https://app.chanlytics.com/terms");
  assert.equal(c.form.SubscriberOptIn, "true");
});

/** A fake Twilio that answers every call, and counts them. */
function fakeTwilio(over = {}) {
  let n = 0;
  const calls = [];
  const send = async (req) => {
    calls.push(
      req.url
        .replace("https://trusthub.twilio.com/v1/", "")
        .replace("https://messaging.twilio.com/v1/", "")
        .replace(/https:\/\/api\.twilio\.com.*/, "Addresses"),
    );
    if (over[req.url]) return over[req.url](req);
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    const prefix = req.url.includes("CustomerProfiles")
      ? "BU"
      : req.url.includes("TrustProducts")
        ? "BU"
        : req.url.includes("EndUsers")
          ? "IT"
          : req.url.includes("SupportingDocuments")
            ? "RD"
            : req.url.includes("Addresses")
              ? "AD"
              : req.url.includes("BrandRegistrations")
                ? "BN"
                : req.url.includes("Usa2p")
                  ? "QE"
                  : "XX";
    return { status: 201, body: { sid: `${prefix}${(++n).toString().padStart(4, "0")}` } };
  };
  return { send, calls };
}

const ports = (t, state = {}) => {
  const saved = [];
  return {
    ports: {
      send: t.send,
      accountSid: "ACmaster",
      primaryProfileSid: "BUprimary",
      email: "hi@chanlytics.com",
      workspace: { name: "Harbor Moving" },
      record: RECORD,
      campaign: {
        description: "d".repeat(45),
        messageFlow: "f".repeat(45),
        samples: ["one sample message here", "two sample message here"],
        optInMessage: "subscribed",
        optInKeywords: ["YES OFFERS"],
        privacyPolicyUrl: "https://p",
        termsUrl: "https://t",
      },
      messagingServiceSid: "MG1",
      useCase: LOW_VOLUME_USECASE,
      mock: true,
      save: async (p) => {
        saved.push(p);
        Object.assign(state, p);
      },
    },
    saved,
  };
};

test("the saga files in order, keeps every receipt, and a resumed run repeats nothing", async () => {
  const t = fakeTwilio();
  const state = { ...EMPTY_A2P_STATE };
  const { ports: p, saved } = ports(t, state);
  const r = await runA2PSaga(state, p);
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  assert.deepEqual(
    [...A2P_STEPS],
    [
      "profile",
      "business",
      "representative",
      "address",
      "document",
      "primary",
      "submit",
      "a2p_profile",
      "brand",
      "campaign",
    ],
  );
  assert.match(r.state.profileSid, /^BU/);
  assert.match(r.state.brandSid, /^BN/);
  assert.match(r.state.campaignSid, /^QE/);
  assert.equal(nextA2PStep(r.state), null);
  assert.ok(saved.length >= 10, "every step wrote its receipt before the next ran");
  // Nothing is filed twice.
  const before = t.calls.length;
  const again = await runA2PSaga(r.state, ports(t, {}).ports);
  assert.equal(again.ok, true);
  assert.equal(t.calls.length, before, "a finished registration makes no call at all");
});

test("a refusal stops at its step with Twilio's words, and the retry resumes there", async () => {
  let refuse = true;
  const t = fakeTwilio({
    "https://messaging.twilio.com/v1/a2p/BrandRegistrations": () =>
      refuse
        ? { status: 400, body: { code: 21649, message: "brand already registered" } }
        : { status: 201, body: { sid: "BN9999" } },
  });
  const state = { ...EMPTY_A2P_STATE };
  const { ports: p } = ports(t, state);
  const first = await runA2PSaga(state, p);
  assert.equal(first.ok, false);
  assert.equal(first.step, "brand");
  assert.match(first.error, /brand already registered/);
  assert.match(first.error, /21649/);
  assert.equal(first.state.campaignSid, null);
  assert.ok(first.state.a2pProfileSid, "what was built before the refusal stays");
  const beforeCalls = t.calls.length;
  refuse = false;
  const again = await runA2PSaga(first.state, ports(t, {}).ports);
  assert.equal(again.ok, true);
  assert.deepEqual(
    t.calls.slice(beforeCalls),
    ["a2p/BrandRegistrations", "Services/MG1/Compliance/Usa2p"],
    "only the step that failed, then the one after it",
  );
});

test("a profile Twilio calls incomplete is not submitted", async () => {
  const t = fakeTwilio({});
  const orig = t.send;
  const send = async (req) =>
    req.url.endsWith("/CustomerProfiles/BU0001/Evaluations")
      ? { status: 201, body: { status: "noncompliant", results: [{ friendly_name: "address", passed: false }] } }
      : orig(req);
  const state = { ...EMPTY_A2P_STATE };
  const r = await runA2PSaga(state, { ...ports({ send, calls: t.calls }, state).ports });
  assert.equal(r.ok, false);
  assert.equal(r.step, "submit");
  assert.match(r.error, /not complete yet/);
  assert.equal(r.state.profileSubmitted, false);
});

test("a brand the carriers still hold is a WAIT, not a refusal, and the status check finishes it", async () => {
  assert.equal(
    isBrandNotReady(
      "registering the campaign: Can't create a Campaign until Brand is registered. Current status: IN_PROGRESS (Twilio 21717)",
    ),
    true,
  );
  assert.equal(
    isBrandNotReady("Brand BN1 is not shared with account AC2 (Twilio 21717)"),
    false,
    "not shared is a real mistake, not a wait",
  );
  assert.equal(isBrandNotReady("Opt In Keywords must contain either alphanumeric"), false);

  const send = async (req) => {
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    if (req.url.includes("Compliance/Usa2p"))
      return {
        status: 400,
        body: {
          code: 21717,
          message: "Can't create a Campaign until Brand is registered. Current status: IN_PROGRESS",
        },
      };
    return { status: 201, body: { sid: "XX1" } };
  };
  const r = await runA2PSaga(
    { ...EMPTY_A2P_STATE },
    {
      send,
      accountSid: "ACsub",
      primaryProfileSid: "BUprimary",
      email: "hi@chanlytics.com",
      workspace: { name: "Harbor Moving" },
      record: RECORD,
      campaign: {
        description: "d".repeat(45),
        messageFlow: "f".repeat(45),
        samples: ["one sample message here", "two sample message here"],
        optInMessage: "subscribed",
        optInKeywords: ["START"],
        privacyPolicyUrl: "https://p",
        termsUrl: "https://t",
      },
      messagingServiceSid: "MG1",
      useCase: LOW_VOLUME_USECASE,
      mock: true,
      save: async () => {},
    },
  );
  assert.equal(r.ok, false);
  assert.equal(r.step, "campaign");
  assert.equal(r.pending, true, "the row must say 'waiting on carriers', never 'something went wrong'");
  const edge = readCode("apps/edge/lib/lines/a2p.ts");
  assert.ok(
    edge.includes("const waiting = !result.ok && result.pending;") &&
      edge.includes('const smsState = result.ok || waiting ? "registering" : "failed";'),
  );
  assert.ok(edge.includes("last_error: result.ok || waiting ? null : result.error,"), "a wait carries no error");
  // And the next status check files the campaign, so the wait finishes by
  // itself: run in lines-door.test.mjs, where `registration-status` on an
  // approved brand with no campaign POSTs the one thing that was waiting.
});

test("the two registrations are two policies, verified against Twilio's own definitions", () => {
  // Filing against the wrong policy produces a registration refused AFTER it
  // is paid for. These four SIDs were read back from the live Policies API on
  // 2026-09-09 rather than copied from a blog post:
  //
  //   RNdfbf3f...  Secondary Customer Profile of type Business
  //   RNb0d477...  A2P Messaging: Local - Business
  //   RN806dd6...  Starter Customer Profile of type Business
  //   RN670d5d...  Sole Proprietor TrustProduct
  assert.equal(A2P_POLICIES.starterCustomerProfile, "RN806dd6cd175f314e1f96a9727ee271f4");
  assert.equal(A2P_POLICIES.soleProprietor, "RN670d5d2e282a6130ae063b234b6019c8");

  // The starter profile asks for a PERSON; the secondary asks for a company.
  const starter = starterEndUserRequest({
    contactFirstName: "Ada",
    contactLastName: "Lovelace",
    contactEmail: "ada@example.com",
    contactPhone: "+19175550123",
  });
  assert.equal(starter.form.Type, "starter_customer_profile_information");
  assert.deepEqual(
    Object.keys(JSON.parse(starter.form.Attributes)).sort(),
    ["email", "first_name", "last_name", "phone_number"],
    "the four fields the policy names",
  );

  // The sole-proprietor trust product asks for the MOBILE, which is the field
  // the whole path turns on: it is where the carriers text the code.
  const sp = soleProprietorEndUserRequest(
    { tradeName: "Ada's Salon", legalName: "Ada Lovelace", contactPhone: "+19175550123" },
    "PROFESSIONAL_SERVICES",
  );
  assert.equal(sp.form.Type, "sole_proprietor_information");
  assert.deepEqual(Object.keys(JSON.parse(sp.form.Attributes)).sort(), [
    "brand_name",
    "mobile_phone_number",
    "vertical",
  ]);
  assert.equal(JSON.parse(sp.form.Attributes).mobile_phone_number, "+19175550123");
});

test("the step list forks: a company files a company, a person files a person", () => {
  const done = {
    profileSid: "BU1",
    businessSid: "IT1",
    representativeSid: null,
    addressSid: "AD1",
    documentSid: "RD1",
    primaryAssigned: true,
    profileSubmitted: true,
    a2pProfileSid: "BU2",
    brandSid: null,
    campaignSid: null,
  };
  // A sole proprietor has no representative and must not be asked for one --
  // that step would block the path for ever on a receipt that cannot exist.
  assert.equal(nextA2PStep(done, "SOLE_PROPRIETOR"), "brand");
  assert.equal(nextA2PStep(done, "STANDARD"), "representative", "a company still needs the person who signs");
  // The default is the standard path, so nothing that omits the argument changes.
  assert.equal(nextA2PStep(done), "representative");
  assert.equal(nextA2PStep({ ...done, brandSid: "BN1", campaignSid: "QE1" }, "SOLE_PROPRIETOR"), null);
});

test("ownership is asked too, and a value Twilio rejects never reaches it", () => {
  assert.deepEqual([...COMPANY_TYPES], ["government", "non-profit", "private", "public"]);
  assert.equal(companyTypeOf("Private"), "private");
  assert.equal(companyTypeOf("llc"), "private", "an unknown value becomes the default rather than a refusal");
  assert.equal(
    JSON.parse(a2pProfileEndUserRequest({ friendlyName: "x", companyType: "non-profit" }).form.Attributes).company_type,
    "non-profit",
  );
  assert.ok(
    !readCode("packages/channels/src/a2p-saga.ts").includes('p.record.ein ? "private" : "private"'),
    "REGRESSION: ownership was hard-coded behind a ternary that could not vary",
  );
  assert.equal(businessTypeOf("Corporation"), "Corporation");
});

test("the two waits are told apart, and the carriers answering rings once", () => {
  // The business being approved is the slow half and the half that can be
  // refused; the campaign after it is days. One word for both made a
  // three-week silence look like a stuck registration.
  assert.equal(smsStateFor({ brandStatus: "APPROVED", campaignStatus: "PENDING" }), "approved");
  assert.equal(smsStateFor({ brandStatus: "PENDING", campaignStatus: null }), "registering");

  const num = "+1 (929) 656-6623";
  assert.equal(
    registrationVerdict("approved", "approved", { number: num }),
    null,
    "the sweep runs hourly; the same answer is not news",
  );
  assert.equal(registrationVerdict("registering", "registering", { number: num }), null);

  const on = registrationVerdict("approved", "active", { number: num });
  assert.equal(on.kind, "number");
  assert.ok(on.title.includes("Texting is on") && on.title.includes(num));
  assert.ok(on.body.includes("inside your hours") && on.body.includes("said yes"));
  assert.equal(on.route, "admin/integrations");
  assert.equal(on.event, "line.texting_on");
  assert.ok(!on.body.includes("test filing"));
  assert.ok(
    registrationVerdict("approved", "active", { number: num, mock: true }).body.includes(
      "test filing, so nothing routes",
    ),
    "a rehearsal says so rather than promising texting",
  );

  for (const v of [
    on,
    registrationVerdict("registering", "approved", { number: num }),
    registrationVerdict("registering", "rejected", { number: num, reason: "x" }),
  ]) {
    assert.ok(
      !/10DLC|A2P|campaign|brand|TCR|Twilio/i.test(`${v.title} ${v.body}`),
      `the registry's words stay out of the bell too: ${v.title}`,
    );
  }
  const half = registrationVerdict("registering", "approved", { number: num });
  assert.ok(half.title.includes("approved by the carriers") && half.body.includes("nothing is needed from you"));
  assert.equal(half.event, "line.texting_approved");

  const back = registrationVerdict("registering", "rejected", {
    number: num,
    reason: "the website could not be reached",
  });
  assert.equal(back.kind, "alert", "a refusal needs a person, so it is not filed under good news");
  assert.ok(back.body.startsWith("They said: the website could not be reached."));
  assert.ok(back.body.includes("Calls and WhatsApp are unaffected"), "and it says what is NOT broken");
  assert.equal(back.event, "line.texting_rejected");
  assert.equal(registrationVerdict("registering", "failed", { number: num }).event, "line.texting_rejected");

  for (const e of ["line.texting_on", "line.texting_approved", "line.texting_rejected"])
    assert.ok(EVENT_KINDS.includes(e), e);

  const edge = readCode("apps/edge/lib/lines/a2p.ts");
  assert.ok(
    edge.includes("const verdict = registrationVerdict(line.sms_state, smsState, {"),
    "the state BEFORE the write is what decides whether this is news",
  );
  assert.match(
    edge,
    /recordNotification\(line\.tenant_id,\s*\{\s*kind:\s*verdict\.kind/,
    "the bell is the workspace's own row, addressed or not",
  );
});

test("the carriers' verdicts become the words the row uses", () => {
  assert.equal(smsStateFor({ brandStatus: "PENDING", campaignStatus: null }), "registering");
  assert.equal(
    smsStateFor({ brandStatus: "APPROVED", campaignStatus: "PENDING" }),
    "approved",
    "the business is through; the campaign is the shorter wait after it",
  );
  // ACTIVE, not "approved": the inbound path only answers on active, and
  // nothing moved a line from one to the other, so every text stayed held.
  assert.equal(smsStateFor({ brandStatus: "APPROVED", campaignStatus: "VERIFIED" }), "active");
  assert.ok(
    readCode("apps/edge/lib/sms/sms-ingress.ts").includes('held: line.sms_state !== "active"'),
    "which is the state the inbound path reads",
  );
  assert.equal(smsStateFor({ brandStatus: "FAILED", campaignStatus: null }), "rejected");
  assert.equal(smsStateFor({ brandStatus: "APPROVED", campaignStatus: "FAILED" }), "rejected");
  assert.equal(smsStateFor({ brandStatus: "SUSPENDED" }), "failed");
  // A REHEARSAL never reaches active, whatever the test registry says about
  // it. `active` is an instruction, not a badge: the line above is the inbound
  // path reading it to decide whether to stop holding texts for a person, and a
  // mock campaign can carry nothing -- so the receptionist would answer, the
  // carriers would reject every reply, and the customer would get silence.
  assert.equal(smsStateFor({ brandStatus: "APPROVED", campaignStatus: "VERIFIED", mock: true }), "approved");
  assert.equal(
    smsStateFor({ brandStatus: "FAILED", campaignStatus: "VERIFIED", mock: true }),
    "rejected",
    "a refusal is still a refusal",
  );
});

test("the campaign's status is read from the list Twilio answers with, and a wait's clock starts when the wait does", () => {
  const edge = readCode("apps/edge/lib/lines/a2p.ts");
  // Verified against the live API on 2026-09-09: the Usa2p endpoint answers
  // {compliance: [{campaign_status, mock, ...}], meta} and has NO top-level
  // campaign_status. Reading one gave null on every tick, so smsStateFor never
  // saw VERIFIED, so no line could ever reach active, so every inbound text was
  // held for a person for ever -- on a code path whose own comment says it
  // exists to end exactly that.
  assert.ok(!/campaign\?\.campaign_status/.test(edge), "REGRESSION: the top-level read is always null");
  assert.ok(edge.includes("Array.isArray(campaign?.compliance)") && edge.includes("usa2p?.campaign_status"));
  // Twilio, not our column, is the authority on whether the filing it holds is
  // a rehearsal -- so a refile that made it real is recorded without anyone
  // remembering to.
  assert.ok(edge.includes('typeof usa2p?.mock === "boolean" ? usa2p.mock : line.reg_mock'));
  assert.ok(edge.includes("smsStateFor({ brandStatus, campaignStatus, mock })"));
  // state_since means "when this state began". Written unconditionally by an
  // hourly sweep it meant "within the last hour", for ever -- and the Setup row
  // reads it to tell the owner how long the carriers have had their filing.
  assert.ok(edge.includes("const moved = smsState !== line.sms_state;"));
  assert.ok(edge.includes("...(moved ? { state_since: new Date().toISOString() } : {}),"));
});

test("everything is filed as the workspace's own subaccount, with our primary profile referenced by sid", () => {
  const lib = readCode("apps/edge/lib/lines/a2p.ts");
  assert.ok(
    lib.includes("const sub = await lineAccount(db, o.line)") &&
      lib.includes('if (!sub) return { ok: false, error: "no_line_credentials"'),
    "no subaccount, no filing",
  );
  assert.ok(
    lib.includes("accountSid: sub.sid,") && !lib.includes("accountSid: master.sid,"),
    "the address belongs to the same account as the profile",
  );
  assert.ok(lib.includes("const acct = sub;"), "one account for every call");
  const raw = readRaw("packages/channels/src/a2p.ts");
  assert.ok(
    raw.includes("WHOSE ACCOUNT.") && raw.includes("refused with 21717"),
    "REGRESSION: a brand on the parent is refused at the campaign, after it is registered and paid for",
  );
});

test("the owner's form: every field the carriers ask, checked in the owner's words before anything leaves", () => {
  const fields = businessFieldsFor("standard").map((f) => f.name);
  for (const need of [
    "legal_name",
    "ein",
    "business_type",
    "company_type",
    "industry",
    "about",
    "website_url",
    "street",
    "city",
    "region",
    "postal_code",
    "contact_first_name",
    "contact_email",
    "contact_phone",
  ]) {
    assert.ok(fields.includes(need), `the form asks for ${need}`);
  }
  for (const path of ["standard", "sole_proprietor"]) {
    for (const f of businessFieldsFor(path)) {
      assert.ok(f.label && f.group, `${path}/${f.name}`);
      assert.ok(
        !/brand|campaign|10DLC|A2P|TCR/i.test(`${f.label} ${f.hint ?? ""}`),
        `${path}/${f.name}: the registry's words stay out of the form`,
      );
    }
  }
  const empty = emptyBusinessRecord({ websiteUrl: "https://app.chanlytics.com/yes/x", email: "you@business.com" });
  const problems = businessRecordProblems(empty, "standard");
  assert.ok(problems.legal_name && problems.ein && problems.street, "an empty form says what is missing");
  // What the business does: the ninth refusal of the live campaign (30919) was for a filing that never said it.
  assert.equal(problems.about, "What the business does is needed.");
  assert.equal(businessRecordProblems(empty, "sole_proprietor").about, "What the business does is needed.");
  assert.equal(problems.industry, undefined, "the closed lists start on a value Twilio accepts");
  assert.equal(problems.business_type, undefined);
  assert.equal(problems.company_type, undefined);
  const filled = {
    ...empty,
    legal_name: "Harbor Moving LLC",
    ein: "12-3456789",
    street: "193 Jamaica Ave",
    city: "Brooklyn",
    region: "NY",
    postal_code: "11207",
    contact_first_name: "Ruben",
    contact_last_name: "Segura",
    contact_email: "hi@chanlytics.com",
    contact_phone: "+16465550123",
    about:
      "A moving company in Brooklyn: homes and small offices across New York, packing and storage. Customers book a free estimate and pay per move.",
  };
  assert.deepEqual(businessRecordProblems(filled, "standard"), {}, "a filled one can be filed");
  assert.equal(
    businessRecordProblems({ ...filled, about: "Moving." }, "standard").about,
    "Say a little more: what you sell, and who buys it.",
    "a word is not a business model",
  );
  assert.equal(
    businessRecordProblems({ ...filled, about: "x".repeat(501) }, "standard").about,
    "Keep it under 500 characters.",
    "no more than the database keeps (00152)",
  );
  assert.equal(
    businessRecordProblems({ ...filled, ein: "123" }, "standard").ein,
    "A tax ID is nine digits, like 12-3456789.",
  );
  assert.equal(businessRecordProblems({ ...filled, region: "New York" }, "standard").region, "Two letters, like NY.");
  assert.equal(
    businessRecordProblems({ ...filled, contact_phone: "646 555 0123" }, "standard").contact_phone,
    "Write it with the country code, like +1 646 555 0123.",
  );
  assert.deepEqual(
    businessRecordProblems({ ...filled, contact_phone: "+1 (646) 555-0123" }, "standard"),
    {},
    "and it is forgiving about how a number is written",
  );
  assert.ok(businessRecordLine(null).includes("two minutes"));
  assert.ok(businessRecordLine(filled).startsWith("Harbor Moving LLC"));

  const route = readCode("apps/dashboard/app/api/v1/business-record/route.ts");
  assert.ok(
    route.includes('role: "owner",') && route.includes("businessRecordProblems(record, path, { ourNumbers:"),
    "checked here, in the owner's words, before anything leaves for a provider",
  );
  assert.ok(!route.includes("service"), "it goes through the edge like every other provider write");
  const reg = readCode("apps/dashboard/app/api/v1/lines/register/route.ts");
  assert.ok(
    reg.includes('role: "owner",') && reg.includes('rate: "lines_register",') && reg.includes("spend: true,"),
    "filing costs money, so it is an owner's, it is rate-limited, and it declares the spend",
  );
  assert.ok(
    !/mock:\s*(true|body)/.test(reg),
    "the free test registry is never reachable from the dashboard: an owner's filing is always the real one",
  );
  const page = readCode("apps/dashboard/src/legacy/pages/business-record.jsx");
  assert.ok(
    page.includes('data-testid="business-record"') && page.includes('testid="biz-file"'),
    "and filing asks once, plainly, with the price in the question",
  );
  assert.ok(
    page.includes("window.BusinessRecordForm = BusinessRecordForm;"),
    "the form is its own file, opened by the row that needs it",
  );
  assert.ok(
    page.includes("{API.costWords[path]}"),
    "the price is the contract's, per registration -- the two do not cost the same",
  );
});

test("the wiring: filed under our own profile, the table and the row, and the sweep that ends the wait", () => {
  // The door's half -- never twice (`already_registered`), never real by
  // default (`mock` only when asked, and never on a refile), the record asked
  // for first (`no_business_record`), and the reviewer sent to this
  // deployment's own pages -- is run in lines-door.test.mjs.
  const lib = readCode("apps/edge/lib/lines/a2p.ts");
  assert.ok(
    lib.includes("export function primaryProfileSid()") && lib.includes('error: "no_primary_profile"'),
    "nothing is filed without our own approved profile",
  );
  assert.ok(
    lib.includes("primaryProfileSid: primary,"),
    "our own profile is referenced by sid, which is the whole declaration that this business is ours",
  );
  const sql = readRaw("supabase/migrations/00075_registration.sql");
  assert.ok(sql.includes("create table public.business_records") && sql.includes("business_records_member_select"));
  assert.ok(
    sql.includes("reg_mock") && sql.includes("brand_sid"),
    "the row says which registration it is and what it made",
  );
  assert.ok(readRaw("apps/edge/.env.example").includes("TWILIO_PRIMARY_PROFILE_SID="));
  // The wait must end without anyone pressing anything. The sweep's half --
  // both waiting states asked about (filtering on 'registering' alone once
  // stopped sweeping a line the moment it was approved, so it could never
  // become active), and the campaign the carriers were holding filed once the
  // brand is through -- runs in cron-doors-b.test.mjs.
  assert.ok(
    readRaw("supabase/migrations/00077_registration_truth.sql").includes("cron.schedule('registration-sweep'"),
    "REGRESSION: nothing called the status check, so 'waiting on carriers' was a state nothing ever left",
  );
});

test("a refusal keeps the carriers' own reasons, from the side that was actually refused", () => {
  // THE DEFECT. The sweep read brand.failure_reason and nothing else, so every
  // CAMPAIGN rejection -- the kind that can be fixed and resent -- stored the
  // generic "the carriers sent the registration back" and the causes were
  // dropped. Twilio had them the whole time in compliance[0].errors[], one level
  // below where anyone looked: the same mistake, in the same object, that once
  // left every text held for weeks.
  //
  // These two are the real ones the live Chanlytics campaign came back with.
  const said = refusalWords({
    campaignErrors: [
      {
        description:
          "The campaign submission has been reviewed and it was rejected because of invalid campaign description.",
        error_code: 30886,
        fields: ["USE_CASE_DESCRIPTION"],
      },
      {
        description:
          "The campaign submission has been reviewed and rejected because marketing consent was combined with other consents. Marketing consent must be collected separately.",
        error_code: 30913,
        fields: ["MESSAGE_FLOW"],
      },
    ],
  });
  assert.match(said, /invalid campaign description \(30886 · USE_CASE_DESCRIPTION\)/);
  assert.match(said, /marketing consent was combined with other consents/);
  assert.match(said, /\(30913 · MESSAGE_FLOW\)/);
  // The preamble repeats on every error and pushes the substance past where
  // anybody reads, so it goes -- and nothing else does.
  assert.ok(!/campaign submission has been reviewed/i.test(said));
  assert.equal(said.split("; ").length, 2, "both causes, not the first");

  // A brand refusal still reads, and both together read together.
  assert.equal(
    refusalWords({ brandFailureReason: "the tax id did not match the legal name" }),
    "the tax id did not match the legal name",
  );
  assert.match(
    refusalWords({
      brandFailureReason: "brand refused",
      campaignErrors: [{ description: "and the campaign too", error_code: 30999 }],
    }),
    /^brand refused; and the campaign too \(30999\)/,
  );

  // Nothing refused says nothing: a caller must be able to tell "no reason"
  // from "empty reason" and fall back to its own words.
  assert.equal(refusalWords({}), null);
  assert.equal(refusalWords({ brandFailureReason: "   ", campaignErrors: [] }), null);
  assert.equal(
    refusalWords({ campaignErrors: [{ error_code: 30886 }] }),
    null,
    "a code with no description is not a sentence",
  );
  // An unfamiliar message is passed through rather than mangled.
  assert.equal(refusalWords({ campaignErrors: [{ description: "Something new from TCR" }] }), "Something new from TCR");

  // And the sweep reads the campaign side, not just the brand.
  const lib = readCode("apps/edge/lib/lines/a2p.ts");
  assert.ok(
    lib.includes("campaignErrors: Array.isArray(usa2p?.errors)"),
    "REGRESSION: the campaign's own reasons were dropped",
  );
  assert.ok(
    lib.includes('?? "the carriers sent the registration back"'),
    "and the generic line survives as the fallback it always should have been",
  );
});
