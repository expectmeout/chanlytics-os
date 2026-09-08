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
  A2P_POLICIES, A2P_STEPS, EMPTY_A2P_STATE, LOW_VOLUME_USECASE, SOLE_PROPRIETOR_USECASE,
  brandTypeFor, nextA2PStep, smsStateFor, runA2PSaga, BUSINESS_INDUSTRIES, DEFAULT_INDUSTRY, industryOf,
  addressRequest, a2pProfileRequest, brandRequest, businessEndUserRequest, campaignRequest,
  customerProfileRequest, evaluateRequest, representativeEndUserRequest, submitProfileRequest, supportingDocumentRequest, encodeForm,
} from "@chanlytics/channels";
import { readCode, readRaw } from "./_source.mjs";

const RECORD = {
  legalName: "Harbor Moving LLC", tradeName: "Harbor Moving", ein: "12-3456789",
  street: "193 Jamaica Ave", streetSecondary: null, city: "Brooklyn", region: "NY", postalCode: "11207", country: "US",
  websiteUrl: "https://app.chanlytics.com/yes/harbor-moving", industry: "PROFESSIONAL",
  contactFirstName: "Ruben", contactLastName: "Segura", contactEmail: "hi@chanlytics.com",
  contactPhone: "+16465550123", contactTitle: "Owner", contactJobPosition: "Director",
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
  const p = customerProfileRequest({ friendlyName: "Harbor Moving", email: "hi@chanlytics.com", statusCallback: "https://edge/cb" });
  assert.equal(p.url, "https://trusthub.twilio.com/v1/CustomerProfiles");
  assert.deepEqual(p.form, { FriendlyName: "Harbor Moving", Email: "hi@chanlytics.com", PolicySid: A2P_POLICIES.secondaryCustomerProfile, StatusCallback: "https://edge/cb" });

  const b = businessEndUserRequest(RECORD);
  assert.equal(b.url, "https://trusthub.twilio.com/v1/EndUsers");
  assert.equal(b.form.Type, "customer_profile_business_information");
  const ba = JSON.parse(b.form.Attributes);
  assert.equal(ba.business_name, "Harbor Moving LLC");
  assert.equal(ba.business_registration_number, "12-3456789");
  assert.equal(ba.business_regions_of_operation, "USA_AND_CANADA");
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
  assert.deepEqual(submitProfileRequest("BU1"), { url: "https://trusthub.twilio.com/v1/CustomerProfiles/BU1", method: "POST", form: { Status: "pending-review" } });
  assert.equal(a2pProfileRequest({ friendlyName: "Harbor Moving", email: "hi@chanlytics.com" }).form.PolicySid, A2P_POLICIES.a2pMessaging);

  const brand = brandRequest({ customerProfileBundleSid: "BU1", a2pProfileBundleSid: "BU2", brandType: "STANDARD", mock: true });
  assert.equal(brand.url, "https://messaging.twilio.com/v1/a2p/BrandRegistrations");
  assert.deepEqual(brand.form, { CustomerProfileBundleSid: "BU1", A2PProfileBundleSid: "BU2", BrandType: "STANDARD", Mock: "true" });
  assert.equal(brandRequest({ customerProfileBundleSid: "BU1", a2pProfileBundleSid: "BU2", brandType: "SOLE_PROPRIETOR", mock: false }).form.Mock, undefined, "a real filing never says Mock");
});

test("the industry is Twilio's enum: an unknown value becomes the default rather than a refusal", () => {
  assert.ok(BUSINESS_INDUSTRIES.includes("PROFESSIONAL_SERVICES") && BUSINESS_INDUSTRIES.includes("HOSPITALITY"));
  assert.ok(!BUSINESS_INDUSTRIES.includes("PROFESSIONAL"), "REGRESSION: 'PROFESSIONAL' is refused at the evaluation, after every other step is already made");
  assert.equal(industryOf("PROFESSIONAL"), "PROFESSIONAL_SERVICES");
  assert.equal(industryOf("hospitality"), "HOSPITALITY");
  assert.equal(industryOf(null), DEFAULT_INDUSTRY);
  assert.equal(JSON.parse(businessEndUserRequest({ ...RECORD, industry: "PROFESSIONAL" }).form.Attributes).business_industry, "PROFESSIONAL_SERVICES");
});

test("what the owner last typed is what Twilio evaluates", async () => {
  const seen = [];
  const send = async (req) => {
    seen.push(req.url);
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    return { status: 201, body: { sid: "XX0001" } };
  };
  const state = { ...EMPTY_A2P_STATE, profileSid: "BU1", businessSid: "IT1", representativeSid: "IT2", addressSid: "AD1", documentSid: "RD1", primaryAssigned: true };
  const r = await runA2PSaga(state, {
    send, accountSid: "ACmaster", primaryProfileSid: "BUprimary", email: "hi@chanlytics.com",
    workspace: { name: "Harbor Moving" }, record: RECORD,
    campaign: { description: "d".repeat(45), messageFlow: "f".repeat(45), samples: ["one sample message here", "two sample message here"], optInMessage: "subscribed", optInKeywords: ["YES OFFERS"], privacyPolicyUrl: "https://p", termsUrl: "https://t" },
    messagingServiceSid: "MG1", useCase: LOW_VOLUME_USECASE, mock: true, save: async () => {},
  });
  assert.equal(r.ok, true, r.ok ? "" : r.error);
  assert.ok(seen.includes("https://trusthub.twilio.com/v1/EndUsers/IT1") && seen.includes("https://trusthub.twilio.com/v1/EndUsers/IT2"), "both end users are refreshed");
  assert.ok(seen.indexOf("https://trusthub.twilio.com/v1/EndUsers/IT1") < seen.indexOf("https://trusthub.twilio.com/v1/CustomerProfiles/BU1/Evaluations"), "before the evaluation, which is the last moment it can matter");
});

test("the campaign says what the carriers ask, with the samples and keywords as a list", () => {
  const c = campaignRequest({
    brandSid: "BN1", messagingServiceSid: "MG1", description: "d".repeat(45), messageFlow: "f".repeat(45),
    samples: ["one sample message here ok", "two sample message here ok"],
    optInMessage: "You are subscribed. Reply STOP.", optInKeywords: ["YES OFFERS", "START"],
    privacyPolicyUrl: "https://app.chanlytics.com/privacy", termsUrl: "https://app.chanlytics.com/terms",
    useCase: LOW_VOLUME_USECASE,
  });
  assert.equal(c.url, "https://messaging.twilio.com/v1/Services/MG1/Compliance/Usa2p");
  // The Messaging Service lives in the workspace's subaccount; asked as the
  // master, Twilio answers "not found" after the brand is already paid for.
  assert.equal(c.as, "line");
  assert.equal(brandRequest({ customerProfileBundleSid: "BU1", a2pProfileBundleSid: "BU2", brandType: "STANDARD", mock: true }).as, undefined, "everything else is ours, as the master");
  assert.equal(c.form.BrandRegistrationSid, "BN1");
  assert.equal(c.form.UsAppToPersonUsecase, "LOW_VOLUME");
  // Repeated keys, not indexed ones: Twilio answers an indexed list with
  // "Unable to process JSON" after the brand has already been registered.
  assert.deepEqual(c.form.MessageSamples, ["one sample message here ok", "two sample message here ok"]);
  assert.deepEqual(c.form.OptInKeywords, ["YES OFFERS", "START"]);
  const wire = encodeForm(c.form);
  assert.equal((wire.match(/MessageSamples=/g) ?? []).length, 2);
  assert.ok(wire.includes("OptInKeywords=YES+OFFERS") && wire.includes("OptInKeywords=START"));
  assert.ok(!wire.includes("%5B0%5D"), "no indexed keys reach the wire");
  assert.equal(c.form.PrivacyPolicyUrl, "https://app.chanlytics.com/privacy");
  assert.equal(c.form.TermsAndConditionsUrl, "https://app.chanlytics.com/terms");
  assert.equal(c.form.SubscriberOptIn, "true");
  assert.equal(SOLE_PROPRIETOR_USECASE, "SOLE_PROPRIETOR");
});

/** A fake Twilio that answers every call, and counts them. */
function fakeTwilio(over = {}) {
  let n = 0;
  const calls = [];
  const send = async (req) => {
    calls.push(req.url.replace("https://trusthub.twilio.com/v1/", "").replace("https://messaging.twilio.com/v1/", "").replace(/https:\/\/api\.twilio\.com.*/, "Addresses"));
    if (over[req.url]) return over[req.url](req);
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    const prefix = req.url.includes("CustomerProfiles") ? "BU" : req.url.includes("TrustProducts") ? "BU" : req.url.includes("EndUsers") ? "IT"
      : req.url.includes("SupportingDocuments") ? "RD" : req.url.includes("Addresses") ? "AD" : req.url.includes("BrandRegistrations") ? "BN"
        : req.url.includes("Usa2p") ? "QE" : "XX";
    return { status: 201, body: { sid: `${prefix}${(++n).toString().padStart(4, "0")}` } };
  };
  return { send, calls };
}

const ports = (t, state = {}) => {
  const saved = [];
  return {
    ports: {
      send: t.send, accountSid: "ACmaster", primaryProfileSid: "BUprimary", email: "hi@chanlytics.com",
      workspace: { name: "Harbor Moving" }, record: RECORD,
      campaign: { description: "d".repeat(45), messageFlow: "f".repeat(45), samples: ["one sample message here", "two sample message here"], optInMessage: "subscribed", optInKeywords: ["YES OFFERS"], privacyPolicyUrl: "https://p", termsUrl: "https://t" },
      messagingServiceSid: "MG1", useCase: LOW_VOLUME_USECASE, mock: true,
      save: async (p) => { saved.push(p); Object.assign(state, p); },
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
  assert.deepEqual([...A2P_STEPS], ["profile", "business", "representative", "address", "document", "primary", "submit", "a2p_profile", "brand", "campaign"]);
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
      refuse ? { status: 400, body: { code: 21649, message: "brand already registered" } } : { status: 201, body: { sid: "BN9999" } },
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
  assert.deepEqual(t.calls.slice(beforeCalls), ["a2p/BrandRegistrations", "Services/MG1/Compliance/Usa2p"], "only the step that failed, then the one after it");
});

test("a profile Twilio calls incomplete is not submitted", async () => {
  const t = fakeTwilio({});
  const orig = t.send;
  const send = async (req) => (req.url.endsWith("/CustomerProfiles/BU0001/Evaluations") ? { status: 201, body: { status: "noncompliant", results: [{ friendly_name: "address", passed: false }] } } : orig(req));
  const state = { ...EMPTY_A2P_STATE };
  const r = await runA2PSaga(state, { ...ports({ send, calls: t.calls }, state).ports });
  assert.equal(r.ok, false);
  assert.equal(r.step, "submit");
  assert.match(r.error, /not complete yet/);
  assert.equal(r.state.profileSubmitted, false);
});

test("the carriers' verdicts become the words the row uses", () => {
  assert.equal(smsStateFor({ brandStatus: "PENDING", campaignStatus: null }), "registering");
  assert.equal(smsStateFor({ brandStatus: "APPROVED", campaignStatus: "PENDING" }), "registering");
  assert.equal(smsStateFor({ brandStatus: "APPROVED", campaignStatus: "VERIFIED" }), "approved");
  assert.equal(smsStateFor({ brandStatus: "FAILED", campaignStatus: null }), "rejected");
  assert.equal(smsStateFor({ brandStatus: "APPROVED", campaignStatus: "FAILED" }), "rejected");
  assert.equal(smsStateFor({ brandStatus: "SUSPENDED" }), "failed");
});

test("the wiring: filed as us, never twice, never real by default, and the record is asked for first", () => {
  const edge = readCode("apps/edge/api/admin/lines.ts");
  assert.ok(edge.includes('if (op === "record") {') && edge.includes('if (op === "register" || op === "registration-status") {'));
  assert.ok(edge.includes('const mock = body.mock === true;'), "a real filing costs money, so it is never the default");
  assert.ok(edge.includes('if (!rec.data) {') && edge.includes('error: "no_business_record"'), "no record, no registration");
  assert.ok(edge.includes('error: "already_registered"'), "a second filing is refused rather than paid for");
  assert.ok(edge.includes("optInUrl: `${origin}/yes/${tenant.slug}`") && edge.includes("privacyUrl: `${origin}/privacy`"), "the reviewer is sent to pages that exist");
  const lib = readCode("apps/edge/lib/a2p.ts");
  assert.ok(lib.includes("export function primaryProfileSid()") && lib.includes('error: "no_primary_profile"'), "nothing is filed without our own approved profile");
  assert.ok(lib.includes("const master = choice.master;"), "the bundles hang under the master account, not a subaccount");
  assert.ok(!/subaccount/i.test(lib.split("registerLine")[1] ?? ""), "and never under the workspace's own");
  const sql = readRaw("supabase/migrations/00075_registration.sql");
  assert.ok(sql.includes("create table public.business_records") && sql.includes("business_records_member_select"));
  assert.ok(sql.includes("reg_mock") && sql.includes("brand_sid"), "the row says which registration it is and what it made");
  assert.ok(readRaw("apps/edge/.env.example").includes("TWILIO_PRIMARY_PROFILE_SID="));
});
