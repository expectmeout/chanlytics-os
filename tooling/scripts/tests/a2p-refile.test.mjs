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
import { unfileMockRegistration } from "../../../apps/edge/lib/a2p.ts";
import { MOCK_TEXTING_SENTENCE } from "@chanlytics/contracts";

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
  const r = await unfileMockRegistration(db, lines[0]);
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
  const r = await unfileMockRegistration(db, lines[0]);
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
  const r = await unfileMockRegistration(db, mockFiled());
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
  const r = await unfileMockRegistration(db, mockFiled({ messaging_service_sid: null, campaign_sid: null }));
  assert.equal(r.ok, true);
  assert.ok(!db.seen.some((q) => q.table !== "lines"), "only the line's own row is touched");
});

test("the route's three answers: a real filing is final, a rehearsal is replaceable, and a refile is never itself a rehearsal", () => {
  const route = readCode("apps/edge/api/admin/lines.ts");
  assert.ok(route.includes('if (!row.data.reg_mock) {'), "a real filing keeps its dead end");
  assert.ok(route.includes('error: "already_registered"'));
  assert.ok(route.includes('error: "mock_registration"'), "a rehearsal says what it is instead");
  assert.ok(route.includes("if (!refile) {"), "and asks to be told before replacing it");
  assert.ok(route.includes("const off = await unfileMockRegistration(db, row.data);"));
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
