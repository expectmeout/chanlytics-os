/**
 * The lines door: registering a line with the carriers, and the registration's status.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LOW_VOLUME_USECASE } from "@chanlytics/channels/lines";
import { whyCannotSpend } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import {
  A,
  B_LINE,
  FILING,
  LINE,
  LINES_INDEXES,
  setPg,
  NUMBER,
  REASON,
  RECORD,
  SUB_AUTH,
  TWILIO,
  VAULT,
  answer,
  billing,
  filed,
  form,
  knock,
  namesPage,
  path1,
  reads,
  rehearsal,
  rejected,
  unfiled,
  unreachable,
  use,
  wire,
  withEnv,
  world,
  writes,
} from "./_door.mjs";

/* --------------------------------- register ------------------------------- */

test("register: the gate asks what the filing will COST, off the row — a first filing, a rehearsal made real and a refused campaign replaced all spend, so a workspace that may not is refused before the record is read", async () => {
  const lapsed = billing("past_due");
  const net = unreachable("a refused filing must not reach the carriers");
  try {
    for (const [what, row, flags] of [
      ["a first filing", unfiled(), {}],
      ["a rehearsal made real", rehearsal(), { refile: true }],
      ["a refused campaign replaced", rejected(), { refile: true, replace: true }],
      [
        "a refused campaign replaced, whatever else the body says",
        rejected(),
        { refile: true, replace: true, mock: true },
      ],
    ]) {
      const tables = world({ billing_accounts: [lapsed], lines: [row], business_records: [RECORD] });
      const db = use(tables, VAULT);
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, ...flags }));
      assert.equal(status, 402, what);
      assert.deepEqual(
        body,
        { ok: false, error: "payment_required", detail: whyCannotSpend("stripe", "past_due"), status: "past_due" },
        what,
      );
      assert.equal(reads(db, "business_records").length, 0, `${what}: refused before the record is even read`);
      assert.equal(writes(db, "lines").length, 0, `${what}: the row is untouched`);
      assert.deepEqual(tables.lines[0], row);
    }
    // A free trial files, as a plan does (decision 0090: the trial covers everything): the spend gate lets it by, and
    // what answers is the filing's own next word, never a payment refusal.
    const trial = world({ billing_accounts: [billing("trialing")], lines: [unfiled()], business_records: [RECORD] });
    use(trial, VAULT);
    const [, trialBody] = await answer(await knock({ op: "register", line_id: LINE }));
    assert.notEqual(trialBody.error, "payment_required", "a trial is not refused for texting");
    const none = world({ billing_accounts: [], lines: [unfiled()], business_records: [RECORD] });
    use(none, VAULT);
    assert.deepEqual(await answer(await knock({ op: "register", line_id: LINE })), [
      402,
      { ok: false, error: "no_billing_record" },
    ]);
  } finally {
    net.restore();
  }
});

test("register: the one free path — a campaign the carriers sent back, corrected in place — files without asking the spend rule: the SAME campaign is edited, as the subaccount, with the workspace's current name", async () => {
  // A workspace whose card lapsed mid-review must still be able to answer the
  // carriers: Twilio assesses the vetting fee once per campaign, at its first
  // decision, so editing that same resource costs nothing.
  const tables = world({ billing_accounts: [billing("past_due")], lines: [rejected()], business_records: [RECORD] });
  const db = use(tables, VAULT);
  const carrier = wire((req) => {
    if (req.method === "POST" && req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p/QE0001")
      return { status: 200, body: { sid: "QE0001", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual([body.ok, body.resubmitted, body.smsState], [true, true, "registering"]);
    assert.deepEqual(
      [body.line.sms_state, body.line.registered, body.line.last_error],
      ["registering", true, null],
      "what the page sees: back with the carriers, still registered",
    );
  } finally {
    carrier.restore();
  }
  assert.equal(reads(db, "billing_accounts").length, 0, "the spend rule was not consulted: this edit costs nothing");
  assert.equal(
    reads(db, "tenants").length,
    1,
    "the workspace's name comes from the read this request already made, not a second one",
  );
  assert.equal(carrier.seen.length, 1, "one request: the edit");
  const [req] = carrier.seen;
  assert.equal(req.method, "POST");
  assert.equal(
    req.url,
    "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p/QE0001",
    "the INSTANCE: the same campaign, edited, not a new one",
  );
  assert.equal(req.headers.Authorization, SUB_AUTH, "as the workspace's own subaccount");
  const f = form(req);
  assert.match(
    f.get("Description"),
    /^Messages are sent by Harbor Moving LLC, doing business as Harbor Moving, to its own customers and prospects who opted in\. A moving company in Brooklyn/,
    "the workspace's CURRENT name, doing business under the registered one -- the corrections are the point",
  );
  assert.ok(
    namesPage(f.get("MessageFlow"), "https://dash.test/yes/harbor-moving"),
    "the opt-in page, from this deployment's origin and the workspace's slug",
  );
  assert.equal(
    f.get("PrivacyPolicyUrl"),
    "https://dash.test/b/harbor-moving",
    "the page we publish for them, on the same domain as the opt-in page",
  );
  assert.equal(f.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  const samples = f.getAll("MessageSamples");
  assert.equal(samples.length, 5, "five, in the shape the carriers approved (5 Oct 2026)");
  assert.ok(
    samples.some((s) => s.includes("+1 (305) 555-0100")),
    "the workspace's own line in the sample that shows a number",
  );
  assert.ok(samples.every((s) => s.includes("Harbor Moving")));
  for (const never of ["OptInMessage", "OptInKeywords", "BrandRegistrationSid", "UsAppToPersonUsecase"])
    assert.equal(f.get(never), null, `${never}: not editable by anyone, so not sent`);
  const row = tables.lines[0];
  assert.deepEqual(
    [row.sms_state, row.reg_step, row.last_error, row.brand_sid, row.campaign_sid],
    ["registering", null, null, "BN0001", "QE0001"],
    "the row is with the carriers again, under the same receipts",
  );
  assert.notEqual(row.state_since, "2026-09-10T00:00:00Z", "the clock the page counts from restarts");
});

test("register: a filing that stands is final, refile or not; a rehearsal and a refusal each say what they are and what to send; no record means no filing and the row says so", async () => {
  const net = unreachable("nothing here reaches the carriers");
  try {
    let tables = world({ lines: [filed()], business_records: [RECORD] });
    use(tables, VAULT);
    for (const flags of [{}, { refile: true }, { refile: true, replace: true }]) {
      assert.deepEqual(
        await answer(await knock({ op: "register", line_id: LINE, ...flags })),
        [409, { ok: false, error: "already_registered", brand_sid: "BN0001", campaign_sid: "QE0001" }],
        JSON.stringify(flags),
      );
    }
    assert.deepEqual(
      tables.lines[0],
      filed(),
      "a real filing that stands is not touched: it cost money and the carriers vetted it",
    );

    tables = world({ lines: [rehearsal()], business_records: [RECORD] });
    use(tables, VAULT);
    const [s1, mock] = await answer(await knock({ op: "register", line_id: LINE }));
    assert.equal(s1, 409);
    assert.deepEqual([mock.error, mock.brand_sid, mock.campaign_sid], ["mock_registration", "BN0001", "QE0001"]);
    assert.match(mock.hint, /test registry, which routes nothing; send refile: true to file a real one/);

    tables = world({ lines: [rejected()], business_records: [RECORD] });
    use(tables, VAULT);
    const [s2, sent] = await answer(await knock({ op: "register", line_id: LINE }));
    assert.equal(s2, 409);
    assert.equal(sent.error, "campaign_rejected");
    assert.equal(sent.reason, REASON, "the carriers' own words");
    assert.match(sent.hint, /refile: true to resubmit it \(an edit, so no second vetting fee\)/);
    assert.match(
      sent.hint,
      /refile: true with replace: true to delete it and file a new one.*\(a second vetting fee\)/,
    );
    assert.deepEqual(
      [tables.lines[0].sms_state, tables.lines[0].last_error],
      ["rejected", REASON],
      "the verdict stays on the row",
    );

    tables = world({ lines: [unfiled()] });
    use(tables, VAULT);
    assert.deepEqual(await answer(await knock({ op: "register", line_id: LINE })), [
      409,
      { ok: false, error: "no_business_record", hint: "op 'record' first" },
    ]);
    assert.equal(tables.lines[0].sms_state, "needs_record", "and the row says what it is waiting on");
    assert.deepEqual(await answer(await knock({ op: "register", line_id: B_LINE })), [
      404,
      { ok: false, error: "not_found", detail: "no such line" },
    ]);
    assert.deepEqual(await answer(await knock({ op: "register" })), [
      400,
      { ok: false, error: "bad_request", detail: "line_id is required" },
    ]);
  } finally {
    net.restore();
  }
});

test("register: refile with replace deletes the refused campaign and the saga files ONE new one under the kept brand — a second vetting fee, so the spend rule is asked", async () => {
  const tables = world({ lines: [rejected()], business_records: [RECORD] });
  const db = use(tables, VAULT);
  const carrier = wire((req) => {
    if (req.method === "DELETE") return { status: 204 };
    if (req.method === "POST" && req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p")
      return { status: 201, body: { sid: "QE0002", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true, replace: true }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual([body.ok, body.mock, body.smsState], [true, false, "registering"]);
      assert.deepEqual(
        [body.state.brandSid, body.state.campaignSid, body.state.profileSid],
        ["BN0001", "QE0002", "BUcust"],
      );
      assert.deepEqual([body.line.sms_state, body.line.registered], ["registering", true]);
    });
  } finally {
    carrier.restore();
  }
  assert.deepEqual(
    carrier.seen.map((r) => [r.method, path1(r.url)]),
    [
      ["DELETE", "Services/MG0001/Compliance/Usa2p/QE0001"],
      ["POST", "Services/MG0001/Compliance/Usa2p"],
    ],
    "the refused campaign comes off, one new one goes on; the brand and both profiles are not redone",
  );
  assert.ok(carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH));
  const f = form(carrier.seen[1]);
  assert.equal(
    f.get("BrandRegistrationSid"),
    "BN0001",
    "under the brand that was approved on its own -- the expensive half, kept",
  );
  assert.equal(f.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  assert.match(f.get("OptInMessage"), /Harbor Moving/, "the field no edit can reach is what a replacement is for");
  assert.deepEqual(
    f.getAll("OptInKeywords"),
    ["START", "UNSTOP", "RESUME"],
    "the appointment keywords only: no marketing keyword on the texting number",
  );
  assert.equal(f.get("Mock"), null);
  const row = tables.lines[0];
  assert.deepEqual(
    [row.brand_sid, row.campaign_sid, row.sms_state, row.reg_mock, row.reg_step, row.last_error],
    ["BN0001", "QE0002", "registering", false, null, null],
  );
  assert.equal(
    reads(db, "billing_accounts").length,
    1,
    "a replacement spends, so the workspace was asked whether it may",
  );
});

test("register: a rehearsal made real — refile takes the mock campaign off, changes the messaging profile so the carriers accept a second brand, keeps the customer profile and its four receipts, and files a real brand", async () => {
  const tables = world({ lines: [rehearsal()], business_records: [RECORD] });
  use(tables, VAULT);
  let n = 0;
  const carrier = wire((req) => {
    if (req.method === "DELETE") return { status: 204 };
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    return { status: 201, body: { sid: `NEW${String(++n).padStart(4, "0")}` } };
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true, mock: true }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.equal(body.ok, true);
      assert.equal(body.mock, false, "a refile is never itself a rehearsal, whatever the body says");
      assert.deepEqual([body.line.reg_mock, body.line.sms_state, body.line.registered], [false, "registering", true]);
    });
  } finally {
    carrier.restore();
  }
  const calls = carrier.seen.map((r) => [r.method, path1(r.url)]);
  assert.deepEqual(
    calls[0],
    ["DELETE", "Services/MG0001/Compliance/Usa2p/QE0001"],
    "the mock campaign comes off first: a service holds one",
  );
  assert.deepEqual(
    calls.slice(1).map(([, u]) => u),
    [
      "TrustProducts",
      "EndUsers",
      "TrustProducts/NEW0001/EntityAssignments",
      "TrustProducts/NEW0001/EntityAssignments",
      "TrustProducts/NEW0001/Evaluations",
      "TrustProducts/NEW0001",
      "a2p/BrandRegistrations",
      "Services/MG0001/Compliance/Usa2p",
    ],
    "resumed at the messaging profile: a fresh bundle, the brand, the campaign -- no customer profile, business, representative, address or document redone",
  );
  const brand = form(carrier.seen.find((r) => r.url.endsWith("/BrandRegistrations")));
  assert.equal(brand.get("Mock"), null, "real");
  assert.equal(brand.get("CustomerProfileBundleSid"), "BUcust", "the kept customer profile");
  assert.equal(
    brand.get("A2PProfileBundleSid"),
    "NEW0001",
    "the fresh messaging profile: the pair changed, which is what lets a second brand be saved",
  );
  assert.equal(brand.get("SkipAutomaticSecVet"), "true", "no vetting a low-volume campaign cannot use");
  const attached = carrier.seen
    .filter((r) => r.url.endsWith("/TrustProducts/NEW0001/EntityAssignments"))
    .map((r) => form(r).get("ObjectSid"));
  assert.deepEqual(attached, ["NEW0002", "BUcust"], "the company-type end user and the SAME customer profile");
  const row = tables.lines[0];
  assert.deepEqual(
    [
      row.reg_mock,
      row.profile_sid,
      row.a2p_profile_sid,
      row.brand_sid,
      row.campaign_sid,
      row.sms_state,
      row.reg_step,
      row.last_error,
    ],
    [false, "BUcust", "NEW0001", "NEW0006", "NEW0007", "registering", null, null],
  );
  // And no name written over them: the real brand goes under the customer profile the rehearsal submitted, whose name
  // this filing did not send (the wiring's second audit, X4-3; a2p-register.ts sendsBrandName).
  // The real campaign keeps the name it states, the workspace's (X4-5): the rehearsal's came off with its campaign.
  assert.deepEqual(
    row.facts,
    { ...rehearsal().facts, a2p_campaign_name: "Harbor Moving" },
    "the four receipts that cost a person's time survive",
  );
});

test("register: a first real filing walks the whole registration as the workspace's subaccount from this deployment's pages, and the row ends with every receipt; mock files against the test registry and says so on the row", async () => {
  const tables = world({ lines: [unfiled()], business_records: [RECORD] });
  const db = use(tables, VAULT);
  let n = 0;
  const carrier = wire((req) => {
    if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
    return { status: 201, body: { sid: `XX${String(++n).padStart(4, "0")}` } };
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual([body.ok, body.mock, body.smsState], [true, false, "registering"]);
      assert.deepEqual(
        [body.line.registered, body.line.sms_state, body.line.reg_mock, body.line.reg_sole_prop],
        [true, "registering", false, false],
      );
    });
  } finally {
    carrier.restore();
  }
  assert.equal(reads(db, "billing_accounts").length, 1, "a first filing spends");
  assert.ok(
    carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH),
    "filed as the workspace's own subaccount, never the master",
  );
  const urls = carrier.seen.map((r) => path1(r.url));
  assert.equal(urls[0], "CustomerProfiles", "the customer profile first");
  assert.equal(urls.at(-1), "Services/MG0001/Compliance/Usa2p", "the campaign last");
  assert.ok(urls.indexOf("a2p/BrandRegistrations") > urls.indexOf("TrustProducts"), "the brand after both profiles");
  assert.ok(
    carrier.seen.some((r) => r.url.endsWith("/EntityAssignments") && form(r).get("ObjectSid") === "BUprimary"),
    "our approved primary profile is attached: the declaration that this business is ours",
  );
  const address = carrier.seen.find((r) => r.url.includes("/Addresses.json"));
  assert.ok(
    address.url.startsWith("https://api.twilio.com/2010-04-01/Accounts/ACsub0000000000000000000000000000/"),
    "the address under the subaccount too",
  );
  assert.equal(form(address).get("Region"), "NY");
  const business = carrier.seen.find(
    (r) => r.url.endsWith("/EndUsers") && form(r).get("Type") === "customer_profile_business_information",
  );
  assert.equal(
    JSON.parse(form(business).get("Attributes")).business_registration_number,
    "12-3456789",
    "the record on file, as the carriers ask it",
  );
  const brand = form(carrier.seen.find((r) => r.url.endsWith("/BrandRegistrations")));
  assert.deepEqual(
    [brand.get("Mock"), brand.get("BrandType"), brand.get("SkipAutomaticSecVet")],
    [null, "STANDARD", "true"],
    "real, a company, and no vetting a low-volume campaign cannot use",
  );
  const campaign = form(carrier.seen.at(-1));
  assert.ok(
    namesPage(campaign.get("MessageFlow"), "https://dash.test/yes/harbor-moving"),
    "the flow names this workspace's sign-up page and its paper form",
  );
  assert.equal(campaign.get("PrivacyPolicyUrl"), "https://dash.test/b/harbor-moving");
  assert.equal(campaign.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  assert.equal(campaign.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  const row = tables.lines[0];
  for (const k of ["profile_sid", "a2p_profile_sid", "brand_sid", "campaign_sid"]) assert.match(row[k], /^XX/, k);
  for (const k of ["a2p_business_sid", "a2p_representative_sid", "a2p_address_sid", "a2p_document_sid"])
    assert.match(row.facts[k], /^XX/, k);
  assert.deepEqual([row.facts.a2p_primary_assigned, row.facts.a2p_profile_submitted], [true, true]);
  assert.deepEqual(
    [row.sms_state, row.reg_step, row.last_error, row.reg_mock, row.reg_sole_prop],
    ["registering", null, null, false, false],
  );

  // A rehearsal, asked for by name: the brand says Mock, and so does the row.
  const dry = world({ lines: [unfiled()], business_records: [RECORD] });
  use(dry, VAULT);
  const rehearsed = wire((req) =>
    req.url.endsWith("/Evaluations")
      ? { status: 201, body: { status: "compliant" } }
      : { status: 201, body: { sid: `MK${String(++n).padStart(4, "0")}` } },
  );
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, mock: true }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual([body.mock, body.line.reg_mock], [true, true]);
    });
  } finally {
    rehearsed.restore();
  }
  assert.equal(form(rehearsed.seen.find((r) => r.url.endsWith("/BrandRegistrations"))).get("Mock"), "true");
  assert.equal(dry.lines[0].reg_mock, true);

  // Without the master credentials nothing can be filed, and the door says which credential.
  const nothing = world({ lines: [unfiled()], business_records: [RECORD] });
  use(nothing, VAULT);
  const [s, b] = await answer(await knock({ op: "register", line_id: LINE }));
  assert.deepEqual(
    [s, b.error, b.smsState],
    [502, "no_provider", "none"],
    "the dry provider can buy a fake number; it cannot register one",
  );
  await withEnv(TWILIO, async () => {
    const [s2, b2] = await answer(await knock({ op: "register", line_id: LINE }));
    assert.deepEqual([s2, b2.error], [502, "no_primary_profile"], "nothing is filed without our own approved profile");
  });
});

test("register: a campaign held until the brand is through is a wait — the row says registering and carries no error — while a campaign refused is a stop with the carrier's words", async () => {
  // Everything asked for was accepted; the carriers only finish with the brand first. The row says "waiting on
  // carriers", never "something went wrong", and the next status check files the campaign (the registration-status
  // case below). (A source scan of a2p-register.ts until 26 Nov 2026.)
  const fileWith = async (campaignAnswer) => {
    const tables = world({ lines: [unfiled()], business_records: [RECORD] });
    use(tables, VAULT);
    let n = 0;
    const carrier = wire((req) => {
      if (req.url.endsWith("/Evaluations")) return { status: 201, body: { status: "compliant" } };
      if (req.url.endsWith("/Services/MG0001/Compliance/Usa2p")) return campaignAnswer;
      return { status: 201, body: { sid: `XX${String(++n).padStart(4, "0")}` } };
    });
    try {
      const [, body] = await withEnv(FILING, async () => answer(await knock({ op: "register", line_id: LINE })));
      return { body, row: tables.lines[0] };
    } finally {
      carrier.restore();
    }
  };
  const held = await fileWith({
    status: 400,
    body: { code: 21717, message: "Campaign can not be created until Brand is registered. Current status: PENDING" },
  });
  assert.deepEqual(
    [held.row.sms_state, held.row.last_error, held.row.reg_step],
    ["registering", null, "campaign"],
    "a wait: registering, no error, the campaign the step it waits at",
  );
  assert.match(held.row.brand_sid, /^XX/, "the brand it waits on is kept");
  assert.equal(held.row.campaign_sid, null);

  const refused = await fileWith({ status: 400, body: { code: 21700, message: "The description is too short" } });
  assert.equal(refused.row.sms_state, "failed", "a refusal is not a wait");
  assert.match(refused.row.last_error, /The description is too short/, "and the row keeps the carrier's words");
});

test("register: a line with no credentials on file files nothing, and asks nothing of the carriers", async () => {
  // Everything is filed as the workspace's own subaccount; with no token for it there is no account to file as, and
  // the master's would be refused at the campaign after the brand was paid for (21717, wire.ts).
  const tables = world({ lines: [unfiled()], business_records: [RECORD] });
  use(tables, { get_line_credentials: () => null });
  const carrier = unreachable("a line with no credentials must not reach the carriers");
  try {
    const [status, body] = await withEnv(FILING, async () => answer(await knock({ op: "register", line_id: LINE })));
    assert.equal(body.error, "no_line_credentials", JSON.stringify(body));
    assert.notEqual(status, 200);
    assert.deepEqual(carrier.seen, [], "not one request");
  } finally {
    carrier.restore();
  }
  assert.deepEqual([tables.lines[0].sms_state, tables.lines[0].brand_sid], ["none", null], "the row as it was");
});

test("register: a filing the pre-flight refuses is a 409 about this workspace with the owner's sentences — on every door to the carriers, before the vault or the wire", async () => {
  // The campaign states the WORKSPACE'S name and the brand registers the
  // RECORD'S. A live campaign went to the carriers describing a business called
  // "Billing probe"; the refile door then sent the same mismatch out again.
  const renamed = () => [{ id: A, name: "Billing probe", slug: "harbor-moving", status: "active" }];
  const net = unreachable("a refused filing must not reach the carriers");
  const vault = [];
  const rpcs = {
    get_line_credentials: () => {
      vault.push("read");
      return { auth_token: "sub-token" };
    },
  };
  try {
    for (const [what, row, flags] of [
      ["resubmit", rejected(), { refile: true }],
      ["replace", rejected(), { refile: true, replace: true }],
      ["rehearsal made real", rehearsal(), { refile: true }],
    ]) {
      const tables = world({ tenants: renamed(), lines: [row], business_records: [RECORD] });
      use(tables, rpcs);
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, ...flags }));
      assert.equal(status, 409, what);
      assert.equal(body.error, "record_incomplete", what);
      assert.ok(
        body.problems.some((p) => /Billing probe/.test(p) && /Harbor Moving/.test(p)),
        `${what}: what is wrong, in sentences`,
      );
      assert.deepEqual(
        tables.lines[0],
        row,
        `${what}: the row keeps the carriers' verdict -- our pre-check must not overwrite the only record of what they said`,
      );
    }
    // The first filing draws the same line, and this row HAS no verdict yet, so it says what it is waiting on.
    const first = world({ tenants: renamed(), lines: [unfiled()], business_records: [RECORD] });
    use(first, rpcs);
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 409);
      assert.equal(body.error, "record_incomplete");
      assert.ok(body.problems.some((p) => /Billing probe/.test(p)));
      assert.equal(body.smsState, "needs_record");
    });
    assert.equal(first.lines[0].sms_state, "needs_record", "the owner's to fix");
    assert.match(first.lines[0].last_error, /Billing probe/, "on the row the page reads");
    // And the door tells the pre-flight whether anybody can say yes. The flow
    // filed with the carriers says customers opt in by texting this business,
    // which has to be true of a workspace before it is said about one: a line
    // with no number and no active texting row cannot be filed.
    const nowhere = world({ lines: [unfiled({ e164: null })], business_records: [RECORD] });
    use(nowhere, rpcs);
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 409);
      assert.ok(
        body.problems.some((p) => /has to be true/.test(p)),
        "somewhere for a customer to say yes",
      );
    });
    // And every refile door is handed the SAME answer -- gathered above the
    // branch, off the same read -- so a line the carriers sent back is refused
    // the same way whichever way it is being sent again: corrected in place,
    // replaced, or a rehearsal taken off for a real one. It used to be looked up
    // on the first-filing path only, and a resubmit went out saying customers
    // opt in by texting a number the workspace did not have.
    for (const [what, row, flags] of [
      ["resubmit", rejected({ e164: null }), { refile: true }],
      ["replace", rejected({ e164: null }), { refile: true, replace: true }],
      ["rehearsal made real", rehearsal({ e164: null }), { refile: true }],
    ]) {
      const tables = world({ lines: [row], business_records: [RECORD], tenant_channels: [] });
      const db = use(tables, rpcs);
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE, ...flags }));
      assert.equal(status, 409, `${what}: ${JSON.stringify(body)}`);
      assert.equal(body.error, "record_incomplete", what);
      assert.ok(
        body.problems.some((p) => /has to be true/.test(p)),
        `${what}: nobody can say yes, and this door said so too`,
      );
      assert.ok(
        !body.problems.some((p) => /Billing probe/.test(p)),
        `${what}: the name is right -- this refusal is about the number alone`,
      );
      assert.deepEqual(tables.lines[0], row, `${what}: the row keeps the carriers' verdict`);
      assert.equal(
        reads(db, "tenant_channels").length,
        1,
        `${what}: the door looked for a texting row before answering`,
      );
    }
  } finally {
    net.restore();
  }
  assert.deepEqual(vault, [], "no refusal reached for a credential");
  assert.equal(net.seen.length, 0);

  // An active texting row of this workspace beside that same line is enough, and the filing goes.
  const says = world({
    lines: [unfiled({ e164: null })],
    business_records: [RECORD],
    tenant_channels: [
      {
        id: "ch-wa",
        tenant_id: A,
        kind: "whatsapp",
        status: "active",
        external_id: "wa-1",
        number_e164: "+13055550199",
      },
      { id: "ch-old", tenant_id: A, kind: "sms", status: "disabled", external_id: "+13055550188" },
    ],
  });
  const db = use(says, VAULT);
  let n = 0;
  const carrier = wire((req) =>
    req.url.endsWith("/Evaluations")
      ? { status: 201, body: { status: "compliant" } }
      : { status: 201, body: { sid: `YES${String(++n).padStart(4, "0")}` } },
  );
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "register", line_id: LINE }));
      assert.equal(status, 200, JSON.stringify(body));
    });
  } finally {
    carrier.restore();
  }
  const asked = reads(db, "tenant_channels")[0];
  assert.ok(
    asked.filters.some(([op, col, val]) => op === "eq" && col === "tenant_id" && val === A),
    "this workspace's rows",
  );
  assert.ok(
    asked.filters.some(([op, col, val]) => op === "eq" && col === "status" && val === "active"),
    "active ones",
  );
  assert.ok(
    asked.filters.some(([op, col, val]) => op === "in" && col === "kind" && [...val].sort().join() === "sms,whatsapp"),
    "of either texting kind",
  );
  assert.match(
    form(carrier.seen.at(-1)).getAll("MessageSamples").at(-1),
    /Reply here and we will pick it up/,
    "and the sample that would show the line's number does not invent one",
  );

  // The mirror on the free door: the same active texting row beside a refused
  // campaign with no number of its own is enough, and the correction goes out
  // -- one edit of the instance, under a lapsed card, with the sample that
  // would show a number not inventing one. This is the read above the branch
  // reaching the refile path; `!!row.data.e164` on its own would have refused it.
  const corrected = world({
    billing_accounts: [billing("past_due")],
    lines: [rejected({ e164: null })],
    business_records: [RECORD],
    tenant_channels: [
      {
        id: "ch-wa",
        tenant_id: A,
        kind: "whatsapp",
        status: "active",
        external_id: "wa-1",
        number_e164: "+13055550199",
      },
    ],
  });
  const free = use(corrected, VAULT);
  const edit = wire((req) => {
    if (req.method === "POST" && req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p/QE0001")
      return { status: 200, body: { sid: "QE0001", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    const [status, body] = await answer(await knock({ op: "register", line_id: LINE, refile: true }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual([body.resubmitted, body.smsState], [true, "registering"]);
  } finally {
    edit.restore();
  }
  assert.deepEqual(
    edit.seen.map((r) => [r.method, path1(r.url)]),
    [["POST", "Services/MG0001/Compliance/Usa2p/QE0001"]],
    "the same campaign, edited",
  );
  assert.match(form(edit.seen[0]).getAll("MessageSamples").at(-1), /Reply here and we will pick it up/);
  assert.equal(reads(free, "tenant_channels").length, 1, "the texting row is what let it through");
  assert.equal(reads(free, "billing_accounts").length, 0, "and it is still the free door");
  assert.equal(corrected.lines[0].sms_state, "registering");
});

/* ---------------------------- registration-status ------------------------- */

test("registration-status reads where the carriers stand without asking the spend rule, writes the verdict to the row, and rings the bell once on the change", async () => {
  const tables = world({ billing_accounts: [billing("past_due")], lines: [filed({ sms_state: "registering" })] });
  const db = use(tables, VAULT);
  const reply = (req) => {
    if (req.url === "https://messaging.twilio.com/v1/a2p/BrandRegistrations/BN0001")
      return { status: 200, body: { status: "APPROVED", failure_reason: null } };
    if (req.url === "https://messaging.twilio.com/v1/Services/MG0001/Compliance/Usa2p")
      return {
        status: 200,
        body: { compliance: [{ campaign_status: "VERIFIED", mock: false, errors: [] }], meta: {} },
      };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  };
  const carrier = wire(reply);
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(await answer(await knock({ op: "registration-status", line_id: LINE })), [
        200,
        { ok: true, smsState: "active", brand: "APPROVED", campaign: "VERIFIED", told: true },
      ]);
    });
  } finally {
    carrier.restore();
  }
  assert.equal(reads(db, "billing_accounts").length, 0, "a read costs nothing, so a lapsed card does not stop it");
  assert.deepEqual(
    carrier.seen.map((r) => [r.method, path1(r.url)]),
    [
      ["GET", "a2p/BrandRegistrations/BN0001"],
      ["GET", "Services/MG0001/Compliance/Usa2p"],
    ],
    "two reads, nothing filed",
  );
  assert.ok(carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH));
  const row = tables.lines[0];
  assert.deepEqual(
    [row.sms_state, row.last_error, row.reg_mock],
    ["active", null, false],
    "a verified campaign IS the permission: the inbound path stops holding texts",
  );
  assert.notEqual(row.state_since, "2026-09-10T00:00:00Z", "the clock restarts because the state moved");
  assert.equal(tables.notifications.length, 1);
  const bell = tables.notifications[0];
  assert.deepEqual(
    [bell.tenant_id, bell.kind, bell.title, bell.route, bell.subject_type, bell.subject_id],
    [A, "number", "Texting is on: +1 (305) 555-0100", "admin/integrations", "line", LINE],
  );
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.subject_id, e.data]),
    [["line.texting_on", LINE, { e164: NUMBER, from: "registering", to: "active", mock: false }]],
  );

  // Asked again with nothing changed: the row is confirmed, nobody is told twice.
  const again = wire(reply);
  try {
    await withEnv(TWILIO, async () => {
      assert.deepEqual(await answer(await knock({ op: "registration-status", line_id: LINE })), [
        200,
        { ok: true, smsState: "active", brand: "APPROVED", campaign: "VERIFIED", told: false },
      ]);
    });
  } finally {
    again.restore();
  }
  assert.equal(tables.notifications.length, 1);
  assert.equal(tables.events.length, 1);

  // Refused: the carriers' reasons, from the side that refused, in their words.
  const sent = world({ lines: [filed({ sms_state: "registering" })] });
  use(sent, VAULT);
  const refused = wire((req) =>
    req.url.includes("/BrandRegistrations/")
      ? { status: 200, body: { status: "APPROVED" } }
      : {
          status: 200,
          body: {
            compliance: [
              {
                campaign_status: "FAILED",
                mock: false,
                errors: [
                  {
                    description:
                      "The campaign submission has been reviewed and it was rejected because of invalid campaign description.",
                    error_code: 30886,
                    fields: ["USE_CASE_DESCRIPTION"],
                  },
                ],
              },
            ],
          },
        },
  );
  try {
    await withEnv(TWILIO, async () => {
      const [status, body] = await answer(await knock({ op: "registration-status", line_id: LINE }));
      assert.deepEqual([status, body.smsState, body.told], [200, "rejected", true]);
    });
  } finally {
    refused.restore();
  }
  assert.equal(sent.lines[0].sms_state, "rejected");
  assert.equal(
    sent.lines[0].last_error,
    "invalid campaign description (30886 · USE_CASE_DESCRIPTION)",
    "the cause, without the preamble, on the row the back office reads",
  );
  assert.equal(sent.events[0].kind, "line.texting_rejected");

  // A question we could not ask is reported as such, never as an answer.
  const unasked = world({ lines: [filed({ sms_state: "registering" })] });
  use(unasked, VAULT);
  const [s, b] = await answer(await knock({ op: "registration-status", line_id: LINE }));
  assert.deepEqual(
    [s, b],
    [502, { ok: false, smsState: "registering", error: "no_provider" }],
    "the dry provider cannot ask the carriers",
  );
  assert.equal(unasked.lines[0].sms_state, "registering", "and the row is not moved by a question that was not asked");
});

test("registration-status: the bell is kept before the state moves, Twilio says whether the filing is a rehearsal, and a refusal with no reason still says it was sent back", async () => {
  // (Source scans of a2p-sync.ts until 26 Nov 2026.)
  const carriers = (campaign) =>
    wire((req) =>
      req.url.includes("/BrandRegistrations/")
        ? { status: 200, body: { status: "APPROVED", failure_reason: null } }
        : { status: 200, body: { compliance: [campaign], meta: {} } },
    );
  const check = async (tables, campaign, faults = {}) => {
    const db = fakeDb(tables, faults, VAULT, { uniqueIndexes: LINES_INDEXES });
    setPg(db);
    const carrier = carriers(campaign);
    try {
      return await withEnv(TWILIO, async () => answer(await knock({ op: "registration-status", line_id: LINE })));
    } finally {
      carrier.restore();
    }
  };
  const verified = { campaign_status: "VERIFIED", mock: false, errors: [] };

  // A bell that could not be kept leaves the change to be judged again (R11 S6-12): the state is the one thing the next
  // check judges the change by, so it does not move until the notice is kept.
  const lost = world({ lines: [filed({ sms_state: "registering" })] });
  const [, refused] = await check(lost, verified, { "notifications.insert": { message: "the bell is down" } });
  assert.equal(refused.ok, false);
  assert.equal(refused.error, "write_failed");
  assert.deepEqual(
    [lost.lines[0].sms_state, lost.lines[0].state_since, lost.notifications.length, lost.events.length],
    ["registering", "2026-09-10T00:00:00Z", 0, 0],
    "nothing moved, so the next check tells it",
  );
  const [, told] = await check(lost, verified);
  assert.deepEqual([told.smsState, told.told], ["active", true]);
  assert.equal(lost.lines[0].sms_state, "active");
  assert.equal(lost.notifications.length, 1, "told once, by the check that could keep it");

  // Twilio, not our column, is the authority on whether the filing it holds is a rehearsal: a refile made real is
  // recorded without anyone remembering to, and a rehearsal never reaches active.
  const madeReal = world({ lines: [filed({ sms_state: "approved", reg_mock: true })] });
  await check(madeReal, verified);
  assert.deepEqual([madeReal.lines[0].reg_mock, madeReal.lines[0].sms_state], [false, "active"]);
  const stillMock = world({ lines: [filed({ sms_state: "registering", reg_mock: false })] });
  await check(stillMock, { ...verified, mock: true });
  assert.deepEqual([stillMock.lines[0].reg_mock, stillMock.lines[0].sms_state], [true, "approved"]);

  // state_since is when this state began: an answer with no news leaves it alone.
  const standing = world({ lines: [filed({ sms_state: "active" })] });
  const [, quiet] = await check(standing, verified);
  assert.deepEqual([quiet.ok, quiet.told], [true, false]);
  assert.equal(standing.lines[0].state_since, "2026-09-10T00:00:00Z", "an hourly sweep does not restart the clock");

  // A refusal the carriers gave no words for is still said as one.
  const bare = world({ lines: [filed({ sms_state: "registering" })] });
  await check(bare, { campaign_status: "FAILED", mock: false, errors: [] });
  assert.deepEqual(
    [bare.lines[0].sms_state, bare.lines[0].last_error],
    ["rejected", "the carriers sent the registration back"],
  );
});

test("registration-status: once the carriers approve the brand, the campaign they were holding is filed by the next check — the wait finishes by itself, and the owner hears the brand is through", async () => {
  const tables = world({
    billing_accounts: [billing("past_due")],
    lines: [filed({ sms_state: "registering", campaign_sid: null })],
    business_records: [RECORD],
  });
  const db = use(tables, VAULT);
  const carrier = wire((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
    if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    if (req.method === "POST" && req.url.endsWith("/Compliance/Usa2p"))
      return { status: 201, body: { sid: "QE0009", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "registration-status", line_id: LINE }));
      assert.equal(status, 200, JSON.stringify(body));
      assert.deepEqual(
        [body.ok, body.smsState, body.brand, body.campaign, body.told, body.campaign_filed, body.campaign_sid],
        [true, "approved", "APPROVED", undefined, true, true, "QE0009"],
      );
    });
  } finally {
    carrier.restore();
  }
  assert.deepEqual(
    carrier.seen.map((r) => [r.method, path1(r.url)]),
    [
      ["GET", "a2p/BrandRegistrations/BN0001"],
      ["GET", "Services/MG0001/Compliance/Usa2p"],
      ["POST", "Services/MG0001/Compliance/Usa2p"],
    ],
    "read both, then file the one thing that was waiting",
  );
  const auto = form(carrier.seen[2]);
  assert.equal(auto.get("BrandRegistrationSid"), "BN0001");
  // The same pages as a filing made at `register`: this is the one filing that
  // finishes with nobody watching, and 30907 asks that the privacy policy be on
  // the opt-in page's domain -- the hosted page for this workspace, not ours.
  assert.equal(auto.get("PrivacyPolicyUrl"), "https://dash.test/b/harbor-moving");
  assert.equal(auto.get("TermsAndConditionsUrl"), "https://dash.test/b/harbor-moving/terms");
  assert.ok(
    namesPage(auto.get("MessageFlow"), "https://dash.test/yes/harbor-moving"),
    "the flow names this workspace's sign-up page and its paper form",
  );
  assert.equal(auto.get("UsAppToPersonUsecase"), LOW_VOLUME_USECASE);
  assert.ok(
    carrier.seen.every((r) => r.headers.Authorization === SUB_AUTH),
    "read and filed as the workspace's subaccount",
  );
  const row = tables.lines[0];
  assert.equal(row.campaign_sid, "QE0009");
  assert.equal(row.reg_mock, false, "the campaign filed for an approved real brand is real: the row keeps saying so");
  assert.equal(row.sms_state, "registering", "with the carriers again, for the campaign this time");
  assert.equal(tables.notifications.length, 1);
  assert.equal(tables.notifications[0].title, "Your business is approved by the carriers");
  assert.deepEqual(
    tables.events.map((e) => [e.kind, e.data.from, e.data.to, e.data.mock]),
    [["line.texting_approved", "registering", "approved", false]],
  );
  // Documented, not endorsed: the campaign filed from HERE is the paid half of a
  // filing already gated at `register`, so this op asks the spend rule of nobody.
  assert.equal(reads(db, "billing_accounts").length, 0);

  // A rehearsal's brand approved: the campaign held for it is filed as a
  // rehearsal too -- the row's word, not a constant, decides which registry.
  const staged = world({
    lines: [rehearsal({ sms_state: "registering", campaign_sid: null })],
    business_records: [RECORD],
  });
  use(staged, VAULT);
  const mockWire = wire((req) => {
    if (req.url.endsWith("/BrandRegistrations/BN0001")) return { status: 200, body: { status: "APPROVED" } };
    if (req.method === "GET" && req.url.endsWith("/Compliance/Usa2p"))
      return { status: 200, body: { compliance: [], meta: {} } };
    if (req.method === "POST" && req.url.endsWith("/Compliance/Usa2p"))
      return { status: 201, body: { sid: "QE0010", campaign_status: "PENDING" } };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  });
  try {
    await withEnv(FILING, async () => {
      const [status, body] = await answer(await knock({ op: "registration-status", line_id: LINE }));
      assert.deepEqual([status, body.campaign_filed, body.campaign_sid], [200, true, "QE0010"], JSON.stringify(body));
    });
  } finally {
    mockWire.restore();
  }
  assert.equal(mockWire.seen.filter((r) => r.method === "POST").length, 1, "one campaign filed");
  assert.deepEqual(
    [staged.lines[0].campaign_sid, staged.lines[0].reg_mock, staged.lines[0].sms_state],
    ["QE0010", true, "registering"],
    "still a rehearsal, on the row the next sync reads",
  );
  assert.deepEqual(
    staged.events.map((e) => [e.kind, e.data.mock]),
    [["line.texting_approved", true]],
  );
});
