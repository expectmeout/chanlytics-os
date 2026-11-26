/**
 * Replacing a rehearsal filing with a real one — run, not read.
 *
 * A brand filed with `Mock: true` goes to Twilio's free test registry. It is
 * the right way to walk this path before a customer pays, and it is
 * indistinguishable from the real thing at every place a person looks: the
 * console shows the brand Approved, our own row says `sms_state: approved`, and
 * not one message is ever delivered. It expires in thirty days.
 *
 * On the live salon that state had been sitting there for days. `register`
 * answered `already_registered` and stopped, so there was no way to say "that
 * was a rehearsal, file it properly" — and the two things that must NOT be
 * thrown away in the process are the expensive ones: the TrustHub profile and
 * its four receipts (business, representative, address, document), which were
 * never mock and which the saga skips whenever it still holds them.
 *
 * That is what these cases pin: what comes off, what stays on, and that a
 * refile is never itself another rehearsal.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import * as refile from "../../apps/edge/lib/lines/a2p-refile.ts";
import { listFilingProblems } from "../../apps/edge/lib/lines/a2p-register.ts";
import { syncRegistration } from "../../apps/edge/lib/lines/a2p-sync.ts";
import { smsStateRow } from "../../apps/dashboard/src/surfaces/settings/connections/model/setup.ts";
import { MOCK_TEXTING_SENTENCE, emptyBusinessRecord, platformLineActions, textingWords } from "@chanlytics/contracts";

const { unfileMockRegistration, resubmitRejectedCampaign, replaceRejectedCampaign } = refile;

// The platform's own account, which reads a subaccount's token back when the line's copy dies (the sync's heal).
for (const k of ["VERCEL_ENV", "LINES_DRY_RUN"]) delete process.env[k];
const MASTER = { sid: "ACmaster0000000000000000000000000", token: "master-token-for-this-file" };
process.env.TWILIO_ACCOUNT_SID = MASTER.sid;
process.env.TWILIO_AUTH_TOKEN = MASTER.token;

const TENANT = "11111111-1111-1111-1111-111111111111";
const LINE = "22222222-2222-2222-2222-222222222222";

/** A line whose texting was filed against the test registry, as the salon's was. */
const mockFiled = (over = {}) => ({
  id: LINE,
  tenant_id: TENANT,
  e164: "+19296566623",
  sms_state: "approved",
  reg_mock: true,
  reg_step: "campaign",
  brand_sid: "BN0bef4600000000000000000000000000",
  campaign_sid: "CXQCI7W00000000000000000000000000",
  // Never mock, and never cheap: the profile and its four receipts.
  profile_sid: "BU13e6ff00000000000000000000000000",
  a2p_business_sid: "BUbiz",
  a2p_representative_sid: "BUrep",
  a2p_address_sid: "ADdr",
  a2p_document_sid: "RDdoc",
  a2p_primary_assigned: true,
  a2p_profile_submitted: true,
  messaging_service_sid: null,
  last_error: "something old",
  state_since: "2026-09-01T00:00:00Z",
  ...over,
});

/**
 * The business on record, complete for the standard registration and named as the
 * workspace is: a filing the pre-flight passes. Every replacement below is handed
 * one, because taking a rehearsal off is now conditional on the real filing that
 * replaces it being one the carriers would accept.
 */
const RECORD = {
  ...emptyBusinessRecord({ websiteUrl: "https://harbormoving.example", email: "ada@example.com" }),
  legal_name: "Harbor Moving LLC",
  about:
    "A moving company in Brooklyn: homes and small offices across New York, packing and storage. Customers book a free estimate and pay per move.",
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  city: "Brooklyn",
  region: "NY",
  postal_code: "11207",
  country: "US",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+19175550123",
};
const READY = { record: RECORD, workspaceName: "Harbor Moving" };
/** The live campaign's own fault: the workspace and the record name two different businesses. */
const MISNAMED = { record: RECORD, workspaceName: "Billing probe" };

test("a mock brand cannot be deleted, so the messaging profile is what changes", async () => {
  // The two things running it taught us, and neither was guessable from the
  // docs alone:
  //
  //   DELETE /v1/a2p/BrandRegistrations/{sid}  -> 405, error 20004. Brands are
  //     permanent, mock or not.
  //   POST a second brand for the same pair    -> 20409 "Duplicate Brand can
  //     not be saved".
  //
  // So a refile must change the (customer profile, messaging profile) pair, and
  // the cheap half to change is the messaging profile: the customer profile
  // carries the business, the representative, the address and the document, all
  // of which are real and none of which needs redoing.
  const lines = [mockFiled({ a2p_profile_sid: "BUmsgprofile" })];
  const db = fakeDb({ lines });
  const r = await unfileMockRegistration(db, lines[0], READY);
  assert.equal(r.ok, true);
  assert.equal(lines[0].a2p_profile_sid, null, "cleared, so the saga resumes at a2p_profile with a fresh bundle");
  assert.ok(lines[0].profile_sid, "the customer profile is untouched -- it is the expensive half");
});

test("the mock campaign comes off by its INSTANCE url, and one that will not come off stops the refile", async () => {
  // The collection answers 405, which the first version swallowed as best-effort -- so the mock campaign stayed on
  // the service and the refile was refused a step later, about the brand. Run against each answer Twilio gives.
  const vault = { get_line_credentials: () => ({ auth_token: "t" }) };
  const rehearsal = mockFiled({ subaccount_sid: "ACsub", messaging_service_sid: "MG1" });
  const realFetch = globalThis.fetch;
  try {
    for (const [status, ok] of [
      [204, true],
      [404, true],
      [405, false],
    ]) {
      resetBreakers();
      const calls = [];
      globalThis.fetch = async (url, init) => {
        calls.push(`${init?.method} ${url}`);
        return new Response(status === 204 ? null : JSON.stringify({ code: 20004 }), { status });
      };
      const lines = [{ ...rehearsal }];
      const r = await unfileMockRegistration(fakeDb({ lines }, {}, vault), rehearsal, READY);
      assert.deepEqual(
        calls,
        [`DELETE https://messaging.twilio.com/v1/Services/MG1/Compliance/Usa2p/${rehearsal.campaign_sid}`],
        `${status}: one call, the instance`,
      );
      assert.equal(r.ok, ok, `${status}: ${ok ? "gone, or already gone" : "still there"}`);
      if (ok) {
        assert.equal(lines[0].campaign_sid, null);
        continue;
      }
      assert.equal(r.error, "provider_refused");
      assert.match(r.detail, /would not come off \(HTTP 405\)/);
      assert.equal(lines[0].campaign_sid, rehearsal.campaign_sid, "the row is untouched");
      assert.equal(lines[0].reg_mock, true);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the rehearsal comes off the row and the expensive receipts stay on it", async () => {
  const lines = [mockFiled()];
  const db = fakeDb({ lines });
  const r = await unfileMockRegistration(db, lines[0], READY);
  assert.equal(r.ok, true);

  const row = lines[0];
  assert.equal(row.brand_sid, null, "the mock brand is gone");
  assert.equal(row.campaign_sid, null, "so is the campaign it hung under");
  assert.equal(row.reg_mock, false, "and the row no longer claims to be a rehearsal");
  assert.equal(row.sms_state, "registering", "which is what it now is");
  assert.equal(row.last_error, null, "the last run's words are not this run's");
  assert.notEqual(row.state_since, "2026-09-01T00:00:00Z", "the clock the page counts from restarts");

  // The whole reason this is a targeted clear rather than a reset: every one of
  // these was filed for real, costs a person's time to redo, and the saga skips
  // its step while the receipt is there.
  for (const keep of [
    "profile_sid",
    "a2p_business_sid",
    "a2p_representative_sid",
    "a2p_address_sid",
    "a2p_document_sid",
  ]) {
    assert.ok(row[keep], `${keep} survives a refile`);
  }
  assert.equal(row.a2p_primary_assigned, true);
  assert.equal(row.a2p_profile_submitted, true);

  // The returned row is the one just written, so the caller files against the
  // cleared state rather than the copy it was holding.
  assert.equal(r.row.brand_sid, null);
  assert.equal(r.row.sms_state, "registering");
});

test("a write that changed nothing is an error, not a success to file on top of", async () => {
  // The trap this product has been bitten by: a forbidden or missed UPDATE comes
  // back 200 with zero rows. Filing on top of that would leave the row saying
  // one thing and the carriers holding another.
  const db = fakeDb({ lines: [mockFiled({ id: "someone-else" })] });
  const r = await unfileMockRegistration(db, mockFiled(), READY);
  assert.equal(r.ok, false);
  assert.ok(r.error, "and it says why");
  assert.equal(r.row, undefined);
});

test("no provider call is made for a line with nothing to take off, and none is needed", async () => {
  // The DELETE exists because a Messaging Service holds exactly ONE campaign,
  // so the mock has to come off before the real POST is accepted. A line with
  // no service -- or no campaign on it -- has nothing to take off, and reaching
  // for credentials it may not have would fail the refile for no reason.
  const db = fakeDb({ lines: [mockFiled()] });
  const r = await unfileMockRegistration(db, mockFiled({ messaging_service_sid: null, campaign_sid: null }), READY);
  assert.equal(r.ok, true);
  // Beside the line, only a read of the settings: the name the receptionist answers in, which the preflight holds against
  // the campaign's (X4-5).
  assert.ok(
    !db.seen.some((q) => q.table !== "lines" && !(q.table === "tenant_config" && q.op === "select")),
    "only the line's own row is touched",
  );
});

// The owner's side of a rehearsal: the register route may NOT refile. Making a filing real charges the workspace, so it
// is an operator's call with the business record in front of them, not a side effect of somebody pressing resubmit. The
// route is run in the-owner-and-support-read-a-filing-s-state.test.mjs: what it asks the edge carries no `refile`, and a
// rehearsal comes back as MOCK_TEXTING_SENTENCE. The route's three answers on the edge's side -- a real filing that
// stands is final, a rehearsal says what it is and asks for `refile`, a refile is never itself a rehearsal and runs the
// saga against the cleared row -- are run in lines/door/.

test("one sentence for a rehearsal, wherever an owner meets it", () => {
  // Three surfaces described this state before: Setup said "Texting is not
  // available yet", Integrations said it was days from switching itself on, and
  // the register route said "the carriers did not answer" — which was not even
  // about what had happened.
  assert.match(MOCK_TEXTING_SENTENCE, /test registry/);
  assert.match(MOCK_TEXTING_SENTENCE, /nothing is delivered/);
  assert.match(MOCK_TEXTING_SENTENCE, /a person at Chanlytics/);
  // Setup's row and Integrations' row say it from one function, whatever state the rehearsal reports underneath, so
  // the two pages cannot describe one state two ways even by accident. The route says it too (run beside the route).
  for (const sms_state of ["approved", "registering", "active"]) {
    const line = {
      e164: "+19296566623",
      voice_state: "answering",
      sms_state,
      reg_mock: true,
      reg_sole_prop: false,
      state_since: "2026-09-01T00:00:00Z",
      last_error: null,
    };
    assert.equal(textingWords(line).sentence, MOCK_TEXTING_SENTENCE, `Setup, under ${sms_state}`);
    const row = smsStateRow(line, Date.parse("2026-09-03T00:00:00Z"));
    assert.equal(row.sentence, MOCK_TEXTING_SENTENCE, `Integrations, under ${sms_state}`);
    assert.equal(row.state, "attention", "joined, not working");
  }
});

test("a question we could not ask is never reported as an answer, and the platform heals the token once", async () => {
  // The live case, found the hard way: the subaccount's auth token was rotated
  // in the provider's console, our Vault copy died, and every read in
  // syncRegistration answered 401. The status was discarded, so 401 and "the
  // carriers are still thinking" both became null -- and null means "no answer
  // yet". The line would have sat in `registering` for ever with nothing wrong
  // on any page and a cheerful 200 from the sweep every hour.
  //
  // The platform heals itself rather than waiting for somebody to paste a secret: the parent account can read its own
  // subaccounts' tokens, which is how the saga got this one in the first place. Each of refreshLineToken's answers (a
  // refused master key named as itself, a blip said as a blip) is run in line-token-refresh.test.mjs; here, the sync
  // around it.
  const realFetch = globalThis.fetch;
  const basic = (sid, token) => `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
  const registering = () =>
    mockFiled({
      reg_mock: false,
      // Standing, so the answer moves nothing and tells nobody: what is proved is that it was READ, with the healed token.
      sms_state: "active",
      subaccount_sid: "ACsub",
      messaging_service_sid: "MG1",
      last_error: null,
    });
  /** Twilio as the sync meets it: the subaccount's reads answer only to `live`, the parent's read hands `rotated` out. */
  const twilio = ({ live, rotated }) => {
    const asked = [];
    globalThis.fetch = async (url, init) => {
      const auth = init.headers.Authorization;
      asked.push({ url: String(url), auth });
      if (String(url).endsWith("/Accounts/ACsub.json"))
        return new Response(JSON.stringify({ auth_token: rotated }), { status: 200 });
      if (auth !== basic("ACsub", live)) return new Response(JSON.stringify({ code: 20003 }), { status: 401 });
      if (String(url).includes("/BrandRegistrations/"))
        return new Response(JSON.stringify({ status: "APPROVED" }), { status: 200 });
      return new Response(JSON.stringify({ compliance: [{ campaign_status: "VERIFIED", mock: false }] }), {
        status: 200,
      });
    };
    return asked;
  };
  try {
    // The token was rotated: the first reads are refused, the parent reads the new one, the sync asks again with it.
    resetBreakers();
    const stored = [];
    const vault = {
      get_line_credentials: () => ({ auth_token: "the-dead-token" }),
      put_line_credentials: (a) => void stored.push(a.p_secret),
    };
    const asked = twilio({ live: "the-new-token", rotated: "the-new-token" });
    const rows = [registering()];
    const healed = await syncRegistration(fakeDb({ lines: rows }, {}, vault), rows[0]);
    assert.equal(healed.ok, true, healed.error);
    assert.deepEqual(
      [healed.brand, healed.campaign, healed.smsState],
      ["APPROVED", "VERIFIED", "active"],
      "the carriers' answer, read with the healed token",
    );
    const parent = asked.find((a) => a.url.endsWith("/Accounts/ACsub.json"));
    assert.equal(parent.auth, basic(MASTER.sid, MASTER.token), "read as the parent");
    assert.deepEqual(stored, [{ auth_token: "the-new-token" }], "and written back through the one write path");

    // Still refused after the refresh: reported as a refusal, never as a state read off a refused body.
    resetBreakers();
    twilio({ live: "a-token-nobody-has", rotated: "the-new-token" });
    const stuck = [registering()];
    const refused = await syncRegistration(fakeDb({ lines: stuck }, {}, vault), stuck[0]);
    assert.equal(refused.ok, false);
    assert.equal(refused.error, "provider_unauthorized");
    assert.equal(stuck[0].sms_state, "active", "REGRESSION: no state from a body the provider refused");
    assert.match(stuck[0].last_error, /refused the line's credentials even after a refresh/);
  } finally {
    globalThis.fetch = realFetch;
  }

  // And the sweep says so out loud. Every line unreadable is OUR fault, not a
  // quiet week, so it fails the request (503 no_registration_readable) and
  // sweep_health turns it red; some readable is still a 200, those rows carrying
  // their own reason. Run in cron/doors-b/, heal included.
  // And something is watching this sweep to receive that 503: the registration sweep is in the register of clocks and
  // scheduled (ops/sweep-registry.db.test.mjs), pinned as 00086's text until 25 Nov 2026.
});

test("a rejection is answered by CORRECTING the campaign, not paying for a new one", async () => {
  // Ruben asked "why do we have to spend another $15?" and the answer was that
  // we do not. Twilio:
  //
  //   "A vetting fee is assessed only once per Campaign. So if a Campaign is
  //    rejected its important to resubmit it rather than deleting and
  //    recreating a new campaign."
  //
  // The first version of this path deleted the campaign and filed a new one,
  // which answers a rejection by buying a second vetting -- $15, every time,
  // for every workspace, on corrections that are usually one line of copy.
  assert.ok(!("unfileRejectedCampaign" in refile), "REGRESSION: the delete-and-pay-again path is gone");
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, form: new URLSearchParams(init?.body ?? "") });
    return new Response(JSON.stringify({ campaign_status: "IN_PROGRESS" }), { status: 200 });
  };
  try {
    resetBreakers();
    const sentBack = mockFiled({
      reg_mock: false,
      sms_state: "rejected",
      subaccount_sid: "ACsub",
      messaging_service_sid: "MG1",
      last_error: "30913: the message flow does not say how a customer agrees",
    });
    const rows = [{ ...sentBack }];
    const facts = {
      description: "Harbor Moving texts its customers about their estimates and moves.",
      messageFlow: "A customer gives their number on the estimate form and ticks the box.",
      samples: ["Your estimate is ready.", "Your movers arrive at 9.", "Reply STOP to stop."],
      privacyPolicyUrl: "https://harbormoving.example/privacy",
      termsUrl: "https://harbormoving.example/terms",
    };
    const db = fakeDb({ lines: rows }, {}, { get_line_credentials: () => ({ auth_token: "t" }) });
    const r = await resubmitRejectedCampaign(db, sentBack, facts, READY);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.url}`),
      [`POST https://messaging.twilio.com/v1/Services/MG1/Compliance/Usa2p/${sentBack.campaign_sid}`],
      "one call, nothing deleted: the INSTANCE url with POST is the edit",
    );
    // All seven are required on every update, and the four booleans may not
    // change on a campaign TCR has approved, so they go back as they were sent.
    const form = calls[0].form;
    assert.equal(form.get("Description"), facts.description);
    assert.equal(form.get("MessageFlow"), facts.messageFlow);
    assert.deepEqual(form.getAll("MessageSamples"), facts.samples, "each sample, a key of its own");
    assert.deepEqual(
      ["HasEmbeddedLinks", "HasEmbeddedPhone", "AgeGated", "DirectLending"].map((k) => form.get(k)),
      ["true", "true", "false", "false"],
    );
    assert.equal(form.get("PrivacyPolicyUrl"), facts.privacyPolicyUrl, "the two URLs an update may correct travel");
    assert.equal(form.get("TermsAndConditionsUrl"), facts.termsUrl);
    assert.equal(form.get("OptInMessage"), null, "and nothing the update cannot edit is sent");
    assert.equal(rows[0].sms_state, "registering", "and the row says it is back with the carriers");
    assert.equal(rows[0].campaign_sid, sentBack.campaign_sid, "the same campaign, so the same vetting fee");
    assert.equal(rows[0].last_error, null);
  } finally {
    globalThis.fetch = realFetch;
  }
  // The door's side is run in lines/door/: `refile` on a rejected line
  // POSTs the INSTANCE url once, as the subaccount, with the workspace's
  // CURRENT name in the description, and asks the spend rule of nobody.
});

test("EVERY door that talks to the carriers asks first, and a refusal reaches neither the vault nor the wire", async () => {
  // THE DEFECT, twice. Gate 8's pre-flight lived inside `registerLine`; the refile
  // door reached the carriers through `resubmitRejectedCampaign`, which ran no
  // check -- so a campaign rejected over a name mismatch went out again with the
  // same mismatch (#314). Then the review of #314 found a third door: replacing a
  // rehearsal took the mock campaign OFF at the carrier and only afterwards asked
  // whether the real filing would pass, so a refused refile left the line with
  // neither.
  //
  // This was a source scan comparing where `listFilingProblems(` sat against
  // `findLineAccount(` and `fetch(` in each function's text. It is run now: the vault
  // read and the network are stubbed to record being reached, and the row is read
  // back afterwards. (`registerLine`, the first door, is run the same way in
  // registration-path.test.mjs, "an incomplete sole-proprietor record spends
  // nothing".)
  const reached = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    reached.push(`wire: ${url}`);
    throw new Error("a refused filing must not reach the provider");
  };
  const vault = {
    get_line_credentials: () => {
      reached.push("vault");
      return { auth_token: "t" };
    },
  };
  try {
    // The refile door, on a campaign the carriers sent back.
    const reason = "30913: the message flow does not say how a customer agrees to offers";
    const sentBack = mockFiled({
      reg_mock: false,
      sms_state: "rejected",
      subaccount_sid: "ACsub",
      messaging_service_sid: "MG1",
      last_error: reason,
    });
    const rows = [{ ...sentBack }];
    const db = fakeDb({ lines: rows }, {}, vault);
    const facts = {
      description: "d",
      messageFlow: "f",
      samples: ["a", "b"],
      privacyPolicyUrl: "https://x/privacy",
      termsUrl: "https://x/terms",
    };
    const again = await resubmitRejectedCampaign(db, sentBack, facts, MISNAMED);
    assert.equal(again.ok, false);
    assert.equal(again.error, "record_incomplete");
    assert.ok(
      again.problems.some((p) => /Billing probe/.test(p)),
      "with the owner's sentence about what is wrong",
    );
    // That row carries the CARRIERS' verdict and their words, and our own pre-check
    // must not overwrite the only record of what they said.
    assert.equal(rows[0].sms_state, "rejected");
    assert.equal(rows[0].last_error, reason);
    assert.ok(!db.seen.some((q) => q.op === "update"), "nothing written on the way to the refusal");

    // The replace-the-rehearsal door, with a mock campaign still on the service.
    const rehearsal = mockFiled({ subaccount_sid: "ACsub", messaging_service_sid: "MG1" });
    const lines = [{ ...rehearsal }];
    const db2 = fakeDb({ lines }, {}, vault);
    const off = await unfileMockRegistration(db2, rehearsal, MISNAMED);
    assert.equal(off.ok, false);
    assert.equal(off.error, "record_incomplete");
    assert.ok(off.problems.some((p) => /Billing probe/.test(p)));
    // A line keeps the filing it has until the one replacing it would pass.
    assert.equal(lines[0].brand_sid, rehearsal.brand_sid, "the rehearsal is still filed");
    assert.equal(lines[0].campaign_sid, rehearsal.campaign_sid);
    assert.equal(lines[0].reg_mock, true);
    assert.ok(!db2.seen.some((q) => q.op === "update"));

    assert.deepEqual(reached, [], "neither refusal reached for a credential or the network");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the decider only reads: what a refusal means for the row is each door's to say", async () => {
  // A first filing has sent nothing, so `needs_record` is the truth about that row;
  // a refile's row carries the carriers' verdict. So the one function every door
  // asks writes nothing -- run here, where this used to read its source for the
  // absence of `.update(`.
  const rows = [mockFiled({ sms_state: "rejected", last_error: "their words" })];
  const db = fakeDb({ lines: rows });
  const problems = await listFilingProblems(db, rows[0], MISNAMED);
  assert.ok(problems.some((p) => /Billing probe/.test(p)));
  assert.deepEqual(
    db.seen.map((q) => `${q.table}.${q.op}`).sort(),
    ["lines.select", "tenant_config.select"],
    "two reads: the numbers that are ours, and the name the receptionist answers in (X4-5)",
  );
  assert.equal(rows[0].sms_state, "rejected");
  assert.equal(rows[0].last_error, "their words");
  assert.deepEqual(
    await listFilingProblems(fakeDb({ lines: [mockFiled()] }), mockFiled(), READY),
    [],
    "and a filing that would pass has nothing to say",
  );
});

test("a rejection reaches every person who can act on it, in words about what happened", () => {
  // THE DEAD END. The two route families disagreed about `rejected`. The platform
  // family handled it; the owner family did not -- the edge answers a rejected
  // campaign with a 409, the owner route mapped three errors by name and fell
  // through to `if (a.status !== 200 && a.status !== 502) ... "The carriers did not
  // answer"`. A 409 is neither, so an owner was told the carriers had not answered
  // about a message the carriers had explicitly sent. And the Connections row
  // offered them "Fix and resubmit", pointing at the only button guaranteed to
  // produce it. The owner route's answer, carrying what the carriers said, and Support's button, reading the
  // pre-flight's sentences rather than a token, are run in the-owner-and-support-read-a-filing-s-state.test.mjs.

  // The row no longer promises the action gate 6 took away from owners.
  const row = smsStateRow(
    {
      e164: "+13055550100",
      voice_state: "answering",
      sms_state: "rejected",
      reg_mock: false,
      reg_sole_prop: false,
      state_since: "2026-09-01T00:00:00Z",
      last_error: "the opt-in does not say what a customer agrees to",
    },
    Date.parse("2026-09-03T00:00:00Z"),
  );
  assert.equal(row.state, "attention");
  assert.doesNotMatch(JSON.stringify(row), /resubmit/i, "REGRESSION: a button an owner may not press");
  assert.match(row.sentence, /: the opt-in does not say what a customer agrees to\./, "the carriers' words");
  assert.match(row.sentence, /Chanlytics sends it again/, "and who sends it again, because it is not them");
  assert.deepEqual(
    row.verb,
    { label: "Open the record", to: "verb:business-record", who: "owner" },
    "correcting the record IS theirs, and it is what unblocks the resubmit",
  );
  // The button says it refuses rather than that it sends whatever is there: the act Support is offered on a rejected
  // line, as contracts words it.
  const refile = platformLineActions({
    e164: "+13055550100",
    voice_state: "active",
    sms_state: "rejected",
    reg_mock: false,
    state_since: "2026-09-01T00:00:00Z",
  }).find((a) => a.action === "refile");
  assert.match(
    refile.sentence,
    /It refuses, with the reason, if the record or the workspace's name still would not pass review./,
  );
});

// A refile refused by the pre-flight is a 409 about this workspace, not a 502
// about the carriers -- "try again in a moment" is the one thing that cannot
// help a name mismatch -- and "can anybody say yes" is read once, above the
// branch, for both ways out. Run in lines/door/ on every door to the
// carriers: resubmit, replace, rehearsal made real, and the first filing.

/* -------------------------------------------------------------------------- *
 * The replacement: a new campaign for a refusal an edit cannot reach.
 * -------------------------------------------------------------------------- */

test("a refused campaign is replaced by name: deleted at the carrier, its receipt cleared, the brand kept", async () => {
  // The live Chanlytics campaign was refused a THIRD time on the rewritten text,
  // while its opt-in confirmation still read "You're subscribed to offers and news
  // from Billing probe" -- the one field Twilio's update never touches. The only
  // remedy is a new campaign, which is a new vetting fee, so it is asked for by
  // name and run here.
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    return new Response(null, { status: 204 });
  };
  const vault = { get_line_credentials: () => ({ auth_token: "t" }) };
  try {
    const refused = mockFiled({
      reg_mock: false,
      sms_state: "rejected",
      subaccount_sid: "ACsub",
      messaging_service_sid: "MG1",
      last_error: "their words",
      reg_step: null,
    });
    const rows = [{ ...refused }];
    const db = fakeDb({ lines: rows }, {}, vault);
    const r = await replaceRejectedCampaign(db, refused, READY);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(
      calls.map((c) => c.method),
      ["DELETE"],
      "one call: the campaign comes off",
    );
    assert.ok(
      calls[0].url.endsWith(`/Services/MG1/Compliance/Usa2p/${refused.campaign_sid}`),
      "the INSTANCE url, which answers 204",
    );
    const row = rows[0];
    assert.equal(row.campaign_sid, null, "the campaign's receipt is gone, so the saga files a new one");
    assert.equal(
      row.brand_sid,
      refused.brand_sid,
      "the brand stays: approved on its own, and it cannot be deleted anyway",
    );
    assert.equal(row.profile_sid, refused.profile_sid, "and so does the expensive half");
    assert.equal(row.sms_state, "registering");
    assert.equal(row.last_error, null, "the refusal answered is not the next filing's");
    assert.equal(row.reg_mock, false);
    assert.equal(r.row.campaign_sid, null, "the caller files against the cleared row");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("only a REFUSED campaign is replaceable, only after the pre-flight, and a refusal reaches neither the vault nor the wire", async () => {
  const reached = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    reached.push(`wire: ${url}`);
    throw new Error("a refused replacement must not reach the provider");
  };
  const vault = {
    get_line_credentials: () => {
      reached.push("vault");
      return { auth_token: "t" };
    },
  };
  try {
    // A campaign that STANDS was paid for and vetted; the route refuses before
    // here, and so does this, in case a caller does not.
    const standing = mockFiled({
      reg_mock: false,
      sms_state: "active",
      subaccount_sid: "ACsub",
      messaging_service_sid: "MG1",
    });
    const rows = [{ ...standing }];
    const r = await replaceRejectedCampaign(fakeDb({ lines: rows }, {}, vault), standing, READY);
    assert.equal(r.ok, false);
    assert.equal(r.error, "not_rejected");
    assert.equal(rows[0].campaign_sid, standing.campaign_sid, "untouched");

    // The same check every door makes, before anything at the carrier is touched.
    const refused = mockFiled({
      reg_mock: false,
      sms_state: "rejected",
      subaccount_sid: "ACsub",
      messaging_service_sid: "MG1",
      last_error: "their words",
    });
    const kept = [{ ...refused }];
    const db = fakeDb({ lines: kept }, {}, vault);
    const no = await replaceRejectedCampaign(db, refused, MISNAMED);
    assert.equal(no.ok, false);
    assert.equal(no.error, "record_incomplete");
    assert.ok(
      no.problems.some((p) => /Billing probe/.test(p)),
      "with the owner's sentence about what is wrong",
    );
    assert.equal(
      kept[0].campaign_sid,
      refused.campaign_sid,
      "the refused campaign is still filed: a line keeps what it has until the replacement would pass",
    );
    assert.equal(kept[0].last_error, "their words", "and the carriers' words survive");
    assert.ok(!db.seen.some((q) => q.op === "update"));
    assert.deepEqual(reached, [], "neither refusal reached for a credential or the network");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// The route offers the replacement only by name (`replace`, because it costs),
// only where a resubmit is offered, and a filing that stands is final flag or
// no flag: run in lines/door/, where the same rejected row answers a
// bare refile with one edit and a refile-with-replace with a DELETE and a POST.
