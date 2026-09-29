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
  ...over,
});
const FILING_ENV = {
  TWILIO_ACCOUNT_SID: "ACmaster",
  TWILIO_AUTH_TOKEN: "master-token",
  TWILIO_PRIMARY_PROFILE_SID: "BUprimary",
  LEAD_TO: "platform@chanlytics.example",
};

/** Runs one filing: `answer(req, n)` is Twilio; `seen` is each request with the row as it stood when it was made. */
async function file({ env = FILING_ENV, line = unfiled(), answer = () => null } = {}) {
  const saved = { ...process.env };
  for (const k of [...Object.keys(FILING_ENV), "LINES_DRY_RUN"]) delete process.env[k];
  Object.assign(process.env, env);
  const rows = [{ ...line, facts: structuredClone(line.facts) }];
  const credentials = [];
  const db = fakeDb({ lines: rows }, {}, { get_line_credentials: () => (credentials.push(1), { auth_token: "t" }) });
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization, row: structuredClone(rows[0]) });
    const a = answer(url, seen.length) ?? { status: 201, body: { sid: `SID${seen.length}`, status: "compliant" } };
    return { status: a.status, text: async () => JSON.stringify(a.body) };
  };
  try {
    const out = await registerLine(db, {
      line,
      record: RECORD,
      workspaceName: "Harbor Moving",
      optInUrl: "https://app.example.com/yes/harbor-moving",
      privacyUrl: "https://app.example.com/privacy",
      termsUrl: "https://app.example.com/terms",
      mock: false,
    });
    return { out, row: rows[0], seen, credentials };
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
