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
import { fakeDb } from "./_fake-db.mjs";
import { readCode, readRaw } from "./_source.mjs";
import { unfileMockRegistration, resubmitRejectedCampaign, replaceRejectedCampaign, filingProblems } from "../../../apps/edge/lib/a2p.ts";
import { MOCK_TEXTING_SENTENCE, emptyBusinessRecord } from "@chanlytics/contracts";

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
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave", city: "Brooklyn", region: "NY", postal_code: "11207", country: "US",
  contact_first_name: "Ada", contact_last_name: "Lovelace",
  contact_email: "ada@example.com", contact_phone: "+19175550123",
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
  const lines = [mockFiled()];
  const db = fakeDb({ lines });
  const r = await unfileMockRegistration(db, lines[0], READY);
  assert.equal(r.ok, true);
  assert.equal(lines[0].a2p_profile_sid, null, "cleared, so the saga resumes at a2p_profile with a fresh bundle");
  assert.ok(lines[0].profile_sid, "the customer profile is untouched -- it is the expensive half");
  const lib = readCode("apps/edge/lib/a2p.ts");
  assert.ok(lib.includes("a2p_profile_sid: null,"));
  assert.ok(readRaw("apps/edge/lib/a2p.ts").includes("Duplicate Brand can not be saved"), "and says why, where the next person will look");
  // The campaign delete is the INSTANCE url. The collection answers 405, which
  // the first version swallowed as best-effort -- so the mock campaign stayed
  // on the service and the refile was refused a step later, about the brand.
  const chan = readCode("packages/channels/src/a2p.ts");
  assert.ok(chan.includes("Compliance/Usa2p/${campaignSid}`, method: \"DELETE\""));
  assert.ok(lib.includes("if (!gone) return { ok: false, error:"), "a campaign that will not come off stops the refile");
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
  for (const keep of ["profile_sid", "a2p_business_sid", "a2p_representative_sid", "a2p_address_sid", "a2p_document_sid"]) {
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
  assert.ok(!db.seen.some((q) => q.table !== "lines"), "only the line's own row is touched");
});

test("the route's three answers: a real filing is final, a rehearsal is replaceable, and a refile is never itself a rehearsal", () => {
  const route = readCode("apps/edge/api/admin/lines.ts");
  // "Final" now means a filing that STANDS -- one the carriers accepted. A
  // rejected one is a correction request and has its own path; see the case
  // below.
  assert.ok(route.includes("if (!row.data.reg_mock && !rejected) {"), "a real filing that stands keeps its dead end");
  assert.ok(route.includes('error: "already_registered"'));
  assert.ok(route.includes('error: "mock_registration"'), "a rehearsal says what it is instead");
  assert.ok(route.includes("if (!refile) {"), "and asks to be told before replacing it");
  // Which check a rehearsal's removal is handed is the compiler's to hold now --
  // `check` is required -- and what it does with a failing one is run below.
  assert.ok(route.includes("row.data = off.row;"), "the saga runs against the cleared row, not the stale one");
  assert.ok(
    route.includes("const mock = !refile && body.mock === true;"),
    "there is no reason to replace one rehearsal with another, so a refile is always real",
  );

  // The owner's side: the register route may NOT refile. Making a filing real
  // charges the workspace, so it is an operator's call with the business record
  // in front of them, not a side effect of somebody pressing resubmit.
  const owner = readCode("apps/dashboard/app/api/v1/lines/register/route.ts");
  assert.ok(!/refile/.test(owner), "the owner-facing route never sends it");
  assert.ok(owner.includes('b.error === "mock_registration"'), "but it does say what the state is");
  assert.ok(owner.includes("MOCK_TEXTING_SENTENCE"), "in the same words the two pages use");
});

test("one sentence for a rehearsal, wherever an owner meets it", () => {
  // Three surfaces described this state before: Setup said "Texting is not
  // available yet", Integrations said it was days from switching itself on, and
  // the register route said "the carriers did not answer" — which was not even
  // about what had happened.
  assert.match(MOCK_TEXTING_SENTENCE, /test registry/);
  assert.match(MOCK_TEXTING_SENTENCE, /nothing is delivered/);
  assert.match(MOCK_TEXTING_SENTENCE, /a person at Chanlytics/);
  for (const f of ["packages/contracts/src/setup.ts", "apps/dashboard/app/api/v1/lines/register/route.ts"]) {
    assert.ok(readCode(f).includes("MOCK_TEXTING_SENTENCE"), `${f} says the shared sentence, not its own`);
  }
  // Integrations reaches it through the same function Setup's row uses, so the
  // two pages cannot describe one state two ways even by accident.
  const conn = readCode("packages/contracts/src/connections.ts");
  assert.ok(conn.includes("if (line?.reg_mock) {") && conn.includes("textingWords(line).sentence"));
  assert.ok(!/test registry/.test(conn), "and it holds no copy of the sentence");
});

test("a question we could not ask is never reported as an answer", () => {
  // The live case, found the hard way: the subaccount's auth token was rotated
  // in the provider's console, our Vault copy died, and every read in
  // syncRegistration answered 401. The status was discarded, so 401 and "the
  // carriers are still thinking" both became null -- and null means "no answer
  // yet". The line would have sat in `registering` for ever with nothing wrong
  // on any page and a cheerful 200 from the sweep every hour.
  const lib = readCode("apps/edge/lib/a2p.ts");
  assert.ok(lib.includes("return { status: r.status, body:"), "the read carries the status");
  assert.ok(lib.includes("x.status === 401 || x.status === 403"), "and a refusal is recognised as one");
  assert.ok(lib.includes('error: "provider_unauthorized"'), "and reported as a refusal, not as a state");
  assert.ok(!/const brandStatus = typeof brand\?\.status === "string" \? brand\.status : null;[\s\S]{0,40}const campaignStatus[\s\S]{0,80}campaign\?\.campaign_status/.test(lib), "REGRESSION: statuses read straight off a possibly-refused body");

  // The platform heals itself rather than waiting for somebody to paste a
  // secret: the parent account can read its own subaccounts' tokens, which is
  // how the saga got this one in the first place.
  const sms = readCode("apps/edge/lib/sms.ts");
  assert.ok(sms.includes("export async function refreshLineToken("));
  assert.ok(sms.includes("Accounts/${line.subaccount_sid}.json"), "read as the parent");
  assert.ok(sms.includes('db.rpc("put_line_credentials"'), "and written back through the one write path");
  assert.ok(lib.includes("const fresh = await refreshLineToken(db, line);"));
  assert.ok(readRaw("apps/edge/lib/sms.ts").includes("the platform's own Twilio credentials were refused"),
    "a master-credential fault is named as itself, so nobody is sent looking at the subaccount");

  // And the sweep says so out loud. Every line unreadable is OUR fault, not a
  // quiet week, so it fails the request and sweep_health turns it red.
  const sweep = readCode("apps/edge/api/cron/registrations.ts");
  assert.ok(sweep.includes("let unreadable = 0;") && sweep.includes('error: "no_registration_readable"'));
  assert.ok(sweep.includes("if (unreadable > 0 && unreadable === lines.length)"), "some readable is still a 200 -- those rows carry their own reason");
  assert.ok(readRaw("supabase/migrations/00086_watch_every_sweep.sql").includes("('registration',  'registration-sweep'"),
    "and something is watching this sweep to receive that 503");
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
  const chan = readCode("packages/channels/src/a2p.ts");
  assert.ok(chan.includes("export function updateCampaignRequest("));
  assert.ok(chan.includes("Compliance/Usa2p/${campaignSid}`, method: \"POST\""), "the INSTANCE url with POST is the edit");
  // All seven are required on every update, and the four booleans may not
  // change on a campaign TCR has approved, so they go back as they were sent.
  for (const f of ["Description:", "MessageFlow:", "MessageSamples", "HasEmbeddedLinks:", "HasEmbeddedPhone:", "AgeGated:", "DirectLending:"]) {
    assert.ok(chan.slice(chan.indexOf("export function updateCampaignRequest(")).includes(f), `the update sends ${f}`);
  }
  const lib = readCode("apps/edge/lib/a2p.ts");
  assert.ok(lib.includes("export async function resubmitRejectedCampaign("));
  assert.ok(!lib.includes("unfileRejectedCampaign"), "REGRESSION: the delete-and-pay-again path is gone");
  assert.ok(lib.includes('sms_state: "registering",'), "and the row says it is back with the carriers");

  const route = readCode("apps/edge/api/admin/lines.ts");
  assert.ok(route.includes("const again = await resubmitRejectedCampaign(db, row.data, facts, filingCheck);"),
    "and it is handed what the pre-flight needs, not just what to send");
  assert.ok(route.includes("businessName: tenant.name,"),
    "the workspace's CURRENT name reaches the campaign -- the corrections are the point");
  assert.ok(!route.includes("const t = await db.from(\"tenants\").select(\"name, slug\")"),
    "and it comes from the read this request already made, not a second one");
  assert.ok(route.includes('const rejected = row.data.sms_state === "rejected";'));
  assert.ok(route.includes("if (!row.data.reg_mock && !rejected) {"), "a filing that stands is still final");
  assert.ok(readRaw("apps/edge/lib/a2p.ts").includes("vetting fee is assessed only once per Campaign"),
    "and the reason is quoted where the next person will change it back");
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
  // This was a source scan comparing where `filingProblems(` sat against
  // `lineAccount(` and `fetch(` in each function's text. It is run now: the vault
  // read and the network are stubbed to record being reached, and the row is read
  // back afterwards. (`registerLine`, the first door, is run the same way in
  // registration-path.test.mjs, "an incomplete sole-proprietor record spends
  // nothing".)
  const reached = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { reached.push(`wire: ${url}`); throw new Error("a refused filing must not reach the provider"); };
  const vault = { get_line_credentials: () => { reached.push("vault"); return { auth_token: "t" }; } };
  try {
    // The refile door, on a campaign the carriers sent back.
    const reason = "30913: the message flow does not say how a customer agrees to offers";
    const sentBack = mockFiled({ reg_mock: false, sms_state: "rejected", subaccount_sid: "ACsub", messaging_service_sid: "MG1", last_error: reason });
    const rows = [{ ...sentBack }];
    const db = fakeDb({ lines: rows }, {}, vault);
    const facts = { description: "d", messageFlow: "f", samples: ["a", "b"], privacyPolicyUrl: "https://x/privacy", termsUrl: "https://x/terms" };
    const again = await resubmitRejectedCampaign(db, sentBack, facts, MISNAMED);
    assert.equal(again.ok, false);
    assert.equal(again.error, "record_incomplete");
    assert.ok(again.problems.some((p) => /Billing probe/.test(p)), "with the owner's sentence about what is wrong");
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
  const problems = await filingProblems(db, rows[0], MISNAMED);
  assert.ok(problems.some((p) => /Billing probe/.test(p)));
  assert.deepEqual(db.seen.map((q) => `${q.table}.${q.op}`), ["lines.select"], "one read, of the numbers that are ours");
  assert.equal(rows[0].sms_state, "rejected");
  assert.equal(rows[0].last_error, "their words");
  assert.deepEqual(await filingProblems(fakeDb({ lines: [mockFiled()] }), mockFiled(), READY), [],
    "and a filing that would pass has nothing to say");
});

test("a rejection reaches every person who can act on it, in words about what happened", () => {
  // THE DEAD END. The two route families disagreed about `rejected`. The platform
  // family handled it; the owner family did not -- the edge answers a rejected
  // campaign with a 409, the owner route mapped three errors by name and fell
  // through to `if (a.status !== 200 && a.status !== 502) ... "The carriers did not
  // answer"`. A 409 is neither, so an owner was told the carriers had not answered
  // about a message the carriers had explicitly sent. And the Connections row
  // offered them "Fix and resubmit", pointing at the only button guaranteed to
  // produce it.
  const owner = readCode("apps/dashboard/app/api/v1/lines/register/route.ts");
  assert.match(owner, /b\.error === "campaign_rejected"/, "the owner route knows this answer exists");
  assert.match(owner, /The carriers sent this registration back\./);
  assert.match(owner, /Chanlytics resubmits it/, "and says who sends it again, because it is not them");
  assert.match(owner, /b\.reason/, "carrying what the carriers actually said");

  // The row no longer promises the action gate 6 took away from owners.
  const conn = readCode("packages/contracts/src/connections.ts");
  const rejected = conn.slice(conn.indexOf('case "rejected":'), conn.indexOf('case "failed":'));
  assert.ok(!/Fix and resubmit/.test(rejected), "REGRESSION: a button an owner may not press");
  assert.match(rejected, /Chanlytics sends it again/);
  assert.match(rejected, /Open the record/, "correcting the record IS theirs, and it is what unblocks the resubmit");

  // And SUPPORT, pressing the button, reads the reason rather than a token. The
  // ops surface would otherwise have repeated the exact defect this fixed for
  // owners: `record_incomplete` where two sentences belong.
  const bridge = readCode("apps/dashboard/src/legacy-bridge/platform.ts");
  assert.match(bridge, /Array\.isArray\(res\?\.problems\)/);
  assert.match(bridge, /if \(problems\.length\) return \{ ok: false, message: problems\.join\(" "\) \};/);
  const act = readCode("packages/contracts/src/platform.ts");
  assert.match(act, /It refuses, with the reason, if the record or the workspace's name still would not pass review\./,
    "the button says it refuses rather than that it sends whatever is there");
});

test("a refile refused by the pre-flight is a 409 about this workspace, not a 502 about the carriers", () => {
  // "Try again in a moment" is the one thing that cannot help a name mismatch, and
  // it is what a 502 tells every layer above to say.
  const door = readCode("apps/edge/api/admin/lines.ts");
  assert.match(door, /if \(again\.problems\?\.length\) \{\n\s+return json\(409, \{ ok: false, error: again\.error \?\? "record_incomplete", problems: again\.problems \}\);/);
  assert.match(door, /const status = result\.ok \? 200 : result\.problems\?\.length \? 409 : 502;/,
    "and the first-filing path draws the same line");
  // One read of "can anybody say yes", above the branch, because BOTH ways out of
  // this handler state it to the carriers. It used to sit on the first-filing path
  // only, which is a fair summary of the whole defect.
  const hoisted = door.indexOf("const filingCheck = {");
  const branch = door.indexOf("if (row.data.brand_sid && row.data.campaign_sid) {");
  assert.ok(hoisted !== -1 && branch !== -1 && hoisted < branch, "the check's facts are gathered before the branch that chooses a door");
});


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
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), method: init?.method }); return new Response(null, { status: 204 }); };
  const vault = { get_line_credentials: () => ({ auth_token: "t" }) };
  try {
    const refused = mockFiled({ reg_mock: false, sms_state: "rejected", subaccount_sid: "ACsub", messaging_service_sid: "MG1", last_error: "their words", reg_step: null });
    const rows = [{ ...refused }];
    const db = fakeDb({ lines: rows }, {}, vault);
    const r = await replaceRejectedCampaign(db, refused, READY);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(calls.map((c) => c.method), ["DELETE"], "one call: the campaign comes off");
    assert.ok(calls[0].url.endsWith(`/Services/MG1/Compliance/Usa2p/${refused.campaign_sid}`), "the INSTANCE url, which answers 204");
    const row = rows[0];
    assert.equal(row.campaign_sid, null, "the campaign's receipt is gone, so the saga files a new one");
    assert.equal(row.brand_sid, refused.brand_sid, "the brand stays: approved on its own, and it cannot be deleted anyway");
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
  globalThis.fetch = async (url) => { reached.push(`wire: ${url}`); throw new Error("a refused replacement must not reach the provider"); };
  const vault = { get_line_credentials: () => { reached.push("vault"); return { auth_token: "t" }; } };
  try {
    // A campaign that STANDS was paid for and vetted; the route refuses before
    // here, and so does this, in case a caller does not.
    const standing = mockFiled({ reg_mock: false, sms_state: "active", subaccount_sid: "ACsub", messaging_service_sid: "MG1" });
    const rows = [{ ...standing }];
    const r = await replaceRejectedCampaign(fakeDb({ lines: rows }, {}, vault), standing, READY);
    assert.equal(r.ok, false);
    assert.equal(r.error, "not_rejected");
    assert.equal(rows[0].campaign_sid, standing.campaign_sid, "untouched");

    // The same check every door makes, before anything at the carrier is touched.
    const refused = mockFiled({ reg_mock: false, sms_state: "rejected", subaccount_sid: "ACsub", messaging_service_sid: "MG1", last_error: "their words" });
    const kept = [{ ...refused }];
    const db = fakeDb({ lines: kept }, {}, vault);
    const no = await replaceRejectedCampaign(db, refused, MISNAMED);
    assert.equal(no.ok, false);
    assert.equal(no.error, "record_incomplete");
    assert.ok(no.problems.some((p) => /Billing probe/.test(p)), "with the owner's sentence about what is wrong");
    assert.equal(kept[0].campaign_sid, refused.campaign_sid, "the refused campaign is still filed: a line keeps what it has until the replacement would pass");
    assert.equal(kept[0].last_error, "their words", "and the carriers' words survive");
    assert.ok(!db.seen.some((q) => q.op === "update"));
    assert.deepEqual(reached, [], "neither refusal reached for a credential or the network");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the route offers the replacement only by name, and only where a resubmit is offered", () => {
  const route = readCode("apps/edge/api/admin/lines.ts");
  assert.ok(route.includes("const replace = body.replace === true;"), "asked for by a flag of its own -- it costs");
  assert.ok(route.includes("if (rejected && !replace) {"), "a refile without it is the free edit, as before");
  assert.ok(route.includes("? await replaceRejectedCampaign(db, row.data, filingCheck)"), "with it, the refused campaign comes off for the saga to file a new one");
  assert.ok(route.includes("if (!row.data.reg_mock && !rejected) {"), "and a filing that stands is still final, flag or no flag");
});
