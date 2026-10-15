/**
 * `registerLine`, step by step -- run, not read.
 *
 * The filing is a row of steps (apps/edge/lib/lines/a2p-register.ts): the platform's prerequisites, the pre-flight,
 * the subaccount, the ports the saga runs over, the row marked `registering`, the saga, and the row settled. These pin
 * what the order of those steps decides, over the real saga and a database in memory: which prerequisite is named
 * first, that the row says `registering` before the first request costs anything, that each receipt joins the ones
 * before it, and that a campaign held for the brand leaves a wait on the row rather than an error.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { registerLine } from "../../../../apps/edge/lib/lines/a2p-register.ts";

const TENANT = "11111111-1111-1111-1111-111111111111";
const LINE = "22222222-2222-2222-2222-222222222222";

/** A record complete for the standard registration and named as the workspace is: the pre-flight passes it. */
const RECORD = {
  legal_name: "Harbor Moving LLC",
  trade_name: "Harbor Moving",
  ein: "12-3456789",
  street: "193 Jamaica Ave",
  street_secondary: null,
  city: "Brooklyn",
  region: "NY",
  postal_code: "11207",
  country: "US",
  website_url: "https://harbormoving.example",
  industry: "PROFESSIONAL_SERVICES",
  about:
    "A moving company in Brooklyn: homes and small offices across New York, packing and storage. Customers book a free estimate and pay per move.",
  business_type: "Limited Liability Corporation",
  company_type: "private",
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+19175550123",
  contact_title: "Owner",
  contact_job_position: "Director",
};
const unfiled = (over = {}) => ({
  id: LINE,
  tenant_id: TENANT,
  e164: "+13055550142",
  subaccount_sid: "ACsub",
  messaging_service_sid: "MG0001",
  sms_state: "none",
  last_error: null,
  profile_sid: null,
  a2p_profile_sid: null,
  brand_sid: null,
  campaign_sid: null,
  reg_step: null,
  facts: { trunk_ready: true },
  updated_at: "2026-10-01T12:00:00.123456+00:00",
  ...over,
});
const FILING_ENV = {
  TWILIO_ACCOUNT_SID: "ACmaster",
  TWILIO_AUTH_TOKEN: "master-token",
  TWILIO_PRIMARY_PROFILE_SID: "BUprimary",
  LEAD_TO: "platform@chanlytics.example",
};

/**
 * Runs one filing, or `times` of them at once over the same row as each read it: `answer(req, n)` is Twilio; `seen` is
 * each request with the row as it stood when it was made.
 */
async function file({
  env = FILING_ENV,
  line = unfiled(),
  record = RECORD,
  answer = () => null,
  times = 1,
  config,
} = {}) {
  const saved = { ...process.env };
  for (const k of [...Object.keys(FILING_ENV), "LINES_DRY_RUN"]) delete process.env[k];
  Object.assign(process.env, env);
  const rows = [{ ...line, facts: structuredClone(line.facts) }];
  const credentials = [];
  const tables = { lines: rows, ...(config ? { tenant_config: [{ tenant_id: TENANT, config, version: 1 }] } : {}) };
  const db = fakeDb(tables, {}, { get_line_credentials: () => (credentials.push(1), { auth_token: "t" }) });
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization, row: structuredClone(rows[0]) });
    const a = answer(url, seen.length) ?? { status: 201, body: { sid: `SID${seen.length}`, status: "compliant" } };
    return new Response(JSON.stringify(a.body), { status: a.status });
  };
  try {
    const outs = await Promise.all(
      Array.from({ length: times }, () =>
        registerLine(db, {
          line,
          record,
          workspaceName: "Harbor Moving",
          optInUrl: "https://app.example.com/yes/harbor-moving",
          privacyUrl: "https://app.example.com/privacy",
          termsUrl: "https://app.example.com/terms",
          mock: false,
        }),
      ),
    );
    return { out: outs[0], outs, row: rows[0], seen, credentials };
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
}

test("the prerequisites are named in their order, and a refusal reads nothing", async () => {
  const { out, row, seen, credentials } = await file({
    env: { ...FILING_ENV, TWILIO_PRIMARY_PROFILE_SID: "", LEAD_TO: "" },
    line: unfiled({ messaging_service_sid: null }),
  });
  assert.equal(out.error, "no_primary_profile", "the primary profile is asked before the mailbox and the service");
  assert.equal(out.smsState, "none");
  assert.equal(row.sms_state, "none", "nothing written");
  assert.deepEqual([seen.length, credentials.length], [0, 0], "neither the vault nor the wire");
  const noMailbox = await file({
    env: { ...FILING_ENV, LEAD_TO: " , " },
    line: unfiled({ messaging_service_sid: null }),
  });
  assert.equal(noMailbox.out.error, "no_platform_mailbox", "then the mailbox, before the Messaging Service");
});

test("a filing whose receptionist answers in another name than the campaign states is refused before anything is sent (X4-5)", async () => {
  const brain = (business_name) => ({
    brain: {
      business_name,
      booking_link: "https://book.example.com/harbor",
      system_prompt: "Answer as the front desk: brief, warm, and never a price over text.",
      fallbacks: { greeting: "g", error: "e", non_text: "n" },
      profile: {},
    },
  });
  const two = await file({ config: brain("Harbor Hauling") });
  assert.equal(two.out.ok, false);
  assert.ok(
    two.out.problems.some((p) => /Harbor Hauling/.test(p) && /Settings › Business/.test(p)),
    two.out.problems.join(" | "),
  );
  assert.equal(two.seen.length, 0, "nothing reached the carriers");
  // One name, as the campaign states it: filed.
  const one = await file({ config: brain("Harbor Moving") });
  assert.equal(one.out.ok, true, (one.out.problems ?? []).join(" | "));
});

test("the row says registering before the first request, and every receipt joins the ones before it", async () => {
  const { out, row, seen } = await file();
  assert.equal(out.ok, true);
  assert.equal(seen[0].row.sms_state, "registering", "marked before anything at the carrier costs a fee");
  assert.equal(seen[0].row.reg_sole_prop, false);
  assert.ok(
    seen.every((s) => s.auth === `Basic ${Buffer.from("ACsub:t").toString("base64")}`),
    "every request as the subaccount",
  );
  assert.deepEqual(
    row.facts,
    {
      trunk_ready: true,
      // The name the brand goes under, kept by the filing that made it (the wiring's second audit, X4-3).
      a2p_filed_name: "Harbor Moving LLC",
      // And the name the campaign states, the workspace's, which a START by text is confirmed in (X4-5).
      a2p_campaign_name: "Harbor Moving",
      a2p_business_sid: "SID2",
      a2p_representative_sid: "SID4",
      a2p_address_sid: "SID6",
      a2p_document_sid: "SID7",
      a2p_primary_assigned: true,
      a2p_profile_submitted: true,
    },
    "the row's own facts kept, and each receipt added to the last",
  );
  assert.deepEqual(
    [row.profile_sid, row.a2p_profile_sid, row.brand_sid, row.campaign_sid],
    ["SID1", "SID14", "SID20", "SID21"],
  );
  assert.deepEqual([row.sms_state, row.reg_step, row.last_error], ["registering", null, null]);
});

test("the name a brand is filed under is kept by the filing that makes it, and only that one: a sole proprietor goes under the trading name the carriers show, and a line whose brand exists keeps the name it was filed with (the wiring's second audit, X4-3)", async () => {
  const sole = await file({ record: { ...RECORD, ein: null, trade_name: "Harbor Movers" } });
  assert.equal(sole.out.ok, true);
  assert.equal(sole.row.facts.a2p_filed_name, "Harbor Movers", "the name the end user names the brand by");
  const plain = await file({ record: { ...RECORD, ein: null, trade_name: null } });
  assert.equal(plain.row.facts.a2p_filed_name, "Harbor Moving LLC", "no trading name: the one name given");

  // A line whose brand the carriers already hold (a campaign filed again, the held one the sweep files): the new record
  // is not what the brand was filed under, so the name stays.
  const kept = await file({
    line: unfiled({ brand_sid: "BNkept", facts: { trunk_ready: true, a2p_filed_name: "Old Harbor LLC" } }),
    record: { ...RECORD, legal_name: "New Harbor LLC" },
  });
  assert.equal(kept.row.facts.a2p_filed_name, "Old Harbor LLC");
});

test("the name a campaign is filed under is kept by the filing that makes it: a line whose campaign exists keeps the name it was filed with, whatever the workspace is called since (X4-5)", async () => {
  const made = await file();
  assert.equal(made.row.facts.a2p_campaign_name, "Harbor Moving", "the workspace's name, as the campaign states it");
  // A line the carriers hold a campaign for (a filing resumed past it): the confirmation they approved says the old name.
  const kept = await file({
    line: unfiled({ campaign_sid: "CMkept", facts: { trunk_ready: true, a2p_campaign_name: "Old Harbor" } }),
  });
  assert.equal(kept.row.facts.a2p_campaign_name, "Old Harbor");
});

test("REGRESSION (review of X4-3): a filing that resumes past the step that sends the name keeps the name sent then, and one that resumes before it keeps the name it sends now", async () => {
  // The brand request names no business: the standard path's name rides on the business end user, refreshed from the
  // record until the profile is submitted. A run that stopped after the submit and is filed again under a renamed
  // record makes the brand under the old name.
  const made = {
    profile_sid: "BUcust",
    facts: {
      trunk_ready: true,
      a2p_filed_name: "Harbor Moving",
      a2p_business_sid: "ITbiz",
      a2p_representative_sid: "ITrep",
      a2p_address_sid: "ADaddr",
      a2p_document_sid: "RDdoc",
      a2p_primary_assigned: true,
    },
  };
  const renamed = { ...RECORD, legal_name: "Harbor Moving Group LLC" };
  const past = await file({
    line: unfiled({ ...made, facts: { ...made.facts, a2p_profile_submitted: true } }),
    record: renamed,
  });
  assert.equal(past.out.ok, true);
  assert.equal(past.row.facts.a2p_filed_name, "Harbor Moving", "the name the submitted profile carries");

  const before = await file({ line: unfiled(made), record: renamed });
  assert.equal(before.out.ok, true);
  assert.equal(before.row.facts.a2p_filed_name, "Harbor Moving Group LLC", "the submit sends the record as it is now");

  // The narrow path's name rides on the sole proprietor's end user, made with the messaging profile.
  const sole = { ...RECORD, ein: null, trade_name: "Harbor Movers" };
  const soleFacts = { ...made.facts, a2p_profile_submitted: true, a2p_filed_name: "Harbor Moves" };
  const narrowPast = await file({
    line: unfiled({ ...made, a2p_profile_sid: "BUa2p", facts: soleFacts }),
    record: sole,
  });
  assert.equal(narrowPast.row.facts.a2p_filed_name, "Harbor Moves", "its end user was made before");
  const narrowBefore = await file({ line: unfiled({ ...made, facts: soleFacts }), record: sole });
  assert.equal(narrowBefore.row.facts.a2p_filed_name, "Harbor Movers", "made now, under the trading name");
});

test("a campaign held for the brand leaves a wait on the row, not the carrier's words", async () => {
  const held = "Can't create a Campaign until Brand is registered. Current status: IN_PROGRESS";
  const { out, row } = await file({
    answer: (url) => (url.includes("Compliance/Usa2p") ? { status: 400, body: { code: 21717, message: held } } : null),
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "registration_pending");
  assert.equal(out.pending, true);
  assert.equal(out.step, "campaign");
  assert.match(out.detail, /until Brand is registered/, "the answer keeps what the carrier said");
  assert.deepEqual([row.sms_state, row.reg_step, row.last_error], ["registering", "campaign", null], "the row waits");

  const refused = await file({
    answer: (url) =>
      url.includes("Compliance/Usa2p") ? { status: 400, body: { code: 21601, message: "Invalid parameter" } } : null,
  });
  assert.equal(refused.out.error, "register_failed");
  assert.deepEqual(
    [refused.row.sms_state, refused.row.reg_step, refused.row.last_error],
    ["failed", "campaign", "registering the campaign: Invalid parameter (Twilio 21601)"],
    "a refusal is written as one",
  );
});

const IN_PROGRESS = {
  ok: false,
  pending: true,
  error: "registration_pending",
  detail: "This line's registration is being filed right now. It shows here as soon as the carriers have it.",
  smsState: "registering",
};

test("two filings of one line at once (a double press, or a press beside the sweep) file once; the other says it is under way", async () => {
  const once = await file();
  const twice = await file({ times: 2 });
  const [filed, other] = twice.outs[0].ok ? twice.outs : [...twice.outs].reverse();
  assert.equal(filed.ok, true, "one filing ran");
  assert.deepEqual({ ...other, state: undefined }, { ...IN_PROGRESS, state: undefined }, "the other wrote nothing");
  assert.equal(twice.seen.length, once.seen.length, "one profile and one brand: the fees are paid once");
  assert.deepEqual(
    [twice.row.sms_state, twice.row.campaign_sid, twice.row.last_error],
    ["registering", "SID21", null],
    "and nothing was written over the filing that ran",
  );
  assert.equal("a2p_filing_until" in twice.row.facts, false, "its hold on the line is given back as it settles");
  assert.deepEqual(twice.row.facts, once.row.facts, "with every receipt kept");
});

test("a line another filing holds is answered as under way, and one whose hold lapsed is filed", async () => {
  const until = (ms) => new Date(Date.now() + ms).toISOString();
  const held = unfiled({ sms_state: "registering", facts: { trunk_ready: true, a2p_filing_until: until(60_000) } });
  const waiting = await file({ line: held });
  assert.deepEqual({ ...waiting.out, state: undefined }, { ...IN_PROGRESS, state: undefined });
  assert.deepEqual([waiting.seen.length, waiting.credentials.length], [0, 0], "neither the vault nor the wire");
  assert.deepEqual(waiting.row, { ...held, facts: held.facts }, "and the row as it was");

  const lapsed = unfiled({ facts: { trunk_ready: true, a2p_filing_until: until(-60_000) } });
  const filed = await file({ line: lapsed });
  assert.equal(filed.out.ok, true, "a filing that died holding the line frees it when its hold runs out");
  assert.equal("a2p_filing_until" in filed.row.facts, false);
});
