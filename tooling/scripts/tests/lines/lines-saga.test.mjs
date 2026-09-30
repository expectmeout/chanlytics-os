/**
 * Lines v1: a workspace's own number, provisioned by a saga of idempotent
 * steps over a provider interface. The saga runs here with the dry
 * provider and fakes for every other port: it must reach "answering", keep
 * every secret out of the row, fail at a step with the provider's words,
 * resume at that step without repeating a purchase, and do nothing on a
 * line that already answers. Twilio's requests are pinned to the documented
 * URLs and parameters without a network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runLineSaga,
  nextLineStep,
  retellImportBody,
  LINE_STEPS,
  dryProvider,
  twilioProvider,
  twilioUrls,
  TwilioError,
  chooseLineProvider,
  sipPassword,
  isValidSipPassword,
  trunkDomain,
  sipUsername,
  RETELL_ORIGINATION,
  LINE_COSTS,
} from "@chanlytics/channels";
import { EVENT_KINDS } from "@chanlytics/contracts";
import { readCode, readRaw } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { linePorts, releaseRoutingRows } from "../../../../apps/edge/lib/lines/lines.ts";
import { EVERY_EVENT, toldFor } from "../_live-feed.mjs";

const LINE_ID = "0f3c2a1e-1111-4222-8333-444455556666";
const freshLine = (over = {}) => ({
  id: LINE_ID,
  tenant_id: "t1",
  e164: "+13055550100",
  provider: "dry",
  area_code: 305,
  subaccount_sid: null,
  number_sid: null,
  trunk_sid: null,
  credential_list_sid: null,
  termination_uri: null,
  messaging_service_sid: null,
  retell_agent_id: null,
  voice_state: "none",
  step: null,
  last_error: null,
  state_since: "2026-09-07T00:00:00Z",
  facts: {},
  ...over,
});

/** A small deterministic random, so the password a test sees is the password every test sees. */
const seeded =
  (s = 42) =>
  () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

function fakes(over = {}) {
  const saves = [];
  let secrets = {};
  const imports = [];
  const channels = [];
  const smsChannels = [];
  const provider = dryProvider(7);
  const ports = {
    provider,
    master: { sid: "ACmaster", token: "master-token" },
    tenant: { id: "t1", name: "Harbor Moving Co." },
    now: () => "2026-09-07T12:00:00Z",
    random: seeded(),
    store: {
      save: async (p) => {
        saves.push(p);
      },
      getSecrets: async () => ({ ...secrets }),
      putSecrets: async (s) => {
        secrets = { ...secrets, ...s };
      },
    },
    agent: { ensure: async () => ({ agentId: "agent_x", llmId: "llm_x", pinned: true }) },
    retell: {
      importNumber: async (body) => {
        imports.push(body);
        return { ok: true, status: 201, body: { phone_number_type: "custom" } };
      },
    },
    channel: {
      ensure: async (o) => {
        channels.push(o);
        return { channelId: "ch1", created: true };
      },
    },
    smsChannel: {
      ensure: async (o) => {
        smsChannels.push(o);
        return { channelId: "chs1", created: true };
      },
    },
    inboundWebhookUrl: "https://chanlytics-messaging.vercel.app/api/retell-inbound?key=s",
    smsInboundUrl: "https://chanlytics-messaging.vercel.app/api/inbound-sms",
    nickname: "Harbor Moving Co. · Chanlytics",
    ...over,
  };
  return { ports, saves, imports, channels, smsChannels, secrets: () => secrets, provider };
}
const ops = (provider) => provider.calls.map((c) => c.op);

test("a fresh line runs every step in order and answers; secrets go to the vault, never onto the row", async () => {
  const f = fakes();
  const r = await runLineSaga(freshLine(), f.ports);
  assert.equal(r.ok, true, r.ok ? "" : `${r.step}: ${r.error}`);
  const l = r.line;
  assert.equal(l.voice_state, "answering");
  assert.equal(l.step, null);
  assert.equal(l.last_error, null);
  assert.match(l.subaccount_sid, /^AC/);
  assert.match(l.number_sid, /^PN/);
  assert.match(l.trunk_sid, /^TK/);
  assert.match(l.credential_list_sid, /^CL/);
  assert.equal(l.termination_uri, trunkDomain(LINE_ID));
  assert.equal(l.termination_uri, "chanlytics-0f3c2a1e1111.pstn.twilio.com");
  assert.equal(l.retell_agent_id, "agent_x");
  assert.deepEqual(
    {
      trunk_ready: l.facts.trunk_ready,
      imported: l.facts.retell_imported,
      type: l.facts.retell_number_type,
      channel: l.facts.channel_id,
      pinned: l.facts.agent_pinned,
      attached: l.facts.number_attached,
      cl: l.facts.credential_list_attached,
    },
    { trunk_ready: true, imported: true, type: "custom", channel: "ch1", pinned: true, attached: true, cl: true },
  );
  assert.match(String(l.facts.origination_sid), /^OU/);
  // `ownedNumber` BEFORE `buyNumber`, and that is the point of it: buying is the
  // only step that spends, and the only one whose effect the row could not vouch
  // for. The receipt is written after the provider answers, so a saga killed in that
  // window left a number bought and the row silent -- paid for monthly, skipped by
  // `release`, invisible to `number_drift()`, and unbuyable on a retry because the
  // account already held it. One lookup closes all four.
  assert.deepEqual(ops(f.provider), [
    "createSubaccount",
    "ownedNumber",
    "buyNumber",
    "createTrunk",
    "createCredentialList",
    "addCredential",
    "attachCredentialList",
    "addOrigination",
    "attachNumber",
    "createMessagingService",
    "addNumberToService",
  ]);
  // The subaccount, not the master, buys and trunks.
  assert.equal(f.provider.calls[0].args[0], "ACmaster");
  for (const c of f.provider.calls.slice(1))
    assert.equal(c.args[0], l.subaccount_sid, `${c.op} acts as the subaccount`);
  const origination = f.provider.calls.find((c) => c.op === "addOrigination");
  assert.equal(origination.args[2].sipUrl, RETELL_ORIGINATION, "calls go to Retell's SIP door");
  // Secrets.
  const s = f.secrets();
  assert.match(s.auth_token, /^tok/);
  assert.equal(s.sip_username, sipUsername(LINE_ID));
  assert.ok(isValidSipPassword(s.sip_password));
  const written = JSON.stringify(f.saves);
  assert.ok(!written.includes(s.sip_password) && !written.includes(s.auth_token), "no secret on the row");
  // Retell's import: the trunk, the credential, the agent pinned, the inbound webhook.
  assert.equal(f.imports.length, 1);
  assert.deepEqual(f.imports[0], {
    phone_number: "+13055550100",
    termination_uri: "chanlytics-0f3c2a1e1111.pstn.twilio.com",
    sip_trunk_auth_username: s.sip_username,
    sip_trunk_auth_password: s.sip_password,
    inbound_agents: [{ agent_id: "agent_x", agent_version: "latest_published", weight: 1 }],
    nickname: "Harbor Moving Co. · Chanlytics",
    inbound_webhook_url: "https://chanlytics-messaging.vercel.app/api/retell-inbound?key=s",
  });
  assert.deepEqual(f.channels, [{ agentId: "agent_x", e164: "+13055550100", lineId: LINE_ID }]);
  // The row said provisioning first and answering last.
  assert.deepEqual(f.saves[0], {
    voice_state: "provisioning",
    step: "subaccount",
    last_error: null,
    state_since: "2026-09-07T12:00:00Z",
  });
  assert.deepEqual(f.saves.at(-1), {
    voice_state: "answering",
    step: null,
    last_error: null,
    state_since: "2026-09-07T12:00:00Z",
  });
  assert.deepEqual([...LINE_STEPS], ["subaccount", "number", "trunk", "agent", "import", "messaging", "channel"]);
  assert.match(
    String(f.saves.find((s) => s.messaging_service_sid)?.messaging_service_sid),
    /^MG/,
    "the line texts through its own Messaging Service",
  );
  assert.deepEqual(
    f.smsChannels.map((c) => ({ e164: c.e164, lineId: c.lineId, hasService: /^MG/.test(c.serviceSid) })),
    [{ e164: "+13055550100", lineId: LINE_ID, hasService: true }],
  );
  assert.deepEqual(
    ops(f.provider).slice(-2),
    ["createMessagingService", "addNumberToService"],
    "texting is set up after the number answers calls, before the rows are written",
  );
});

test("a refusal at the import leaves the step and the provider's words; a retry resumes there and buys nothing twice", async () => {
  let refuse = true;
  const f = fakes({
    retell: {
      importNumber: async (body) => {
        f.imports.push(body);
        return refuse
          ? { ok: false, status: 422, body: { message: "bad trunk" } }
          : { ok: true, status: 201, body: { phone_number_type: "custom" } };
      },
    },
  });
  const first = await runLineSaga(freshLine(), f.ports);
  assert.equal(first.ok, false);
  assert.equal(first.step, "import");
  assert.match(first.error, /422/);
  assert.match(first.error, /bad trunk/);
  assert.equal(first.line.voice_state, "failed");
  assert.equal(first.line.step, "import");
  assert.equal(first.line.last_error, first.error);
  assert.ok(first.line.number_sid && first.line.trunk_sid, "what was bought and built stays on the row");
  assert.equal(nextLineStep(first.line), "import");
  assert.equal(f.provider.calls.length, 9, "eight provider calls plus the look-before-buying");
  refuse = false;
  const again = await runLineSaga(first.line, f.ports);
  assert.equal(again.ok, true);
  assert.equal(again.line.voice_state, "answering");
  assert.equal(f.provider.calls.length, 11, "no provider call repeated; the two messaging calls follow the import");
  // And the number step is skipped whole on the resume: `nextLineStep` sees the SID
  // on the row, so neither the lookup nor the purchase runs a second time.
  assert.equal(
    f.provider.calls.filter((c) => c.op === "ownedNumber").length,
    1,
    "looked once, before the only purchase",
  );
  assert.equal(f.provider.calls.filter((c) => c.op === "buyNumber").length, 1, "and bought once");
  assert.equal(f.imports.length, 2);
  assert.deepEqual(f.imports[1], f.imports[0], "the same import, retried");
});

test("a provider failure inside the trunk step resumes at the sub-step that failed", async () => {
  const f = fakes();
  const real = f.provider.attachNumber;
  let boom = true;
  f.provider.attachNumber = async (...a) => {
    if (boom) {
      boom = false;
      throw new Error("Twilio 20404: trunk not ready");
    }
    return real(...a);
  };
  const first = await runLineSaga(freshLine(), f.ports);
  assert.equal(first.ok, false);
  assert.equal(first.step, "trunk");
  assert.match(first.error, /20404/);
  assert.match(String(first.line.facts.origination_sid), /^OU/, "what landed before the failure stays");
  assert.notEqual(first.line.facts.number_attached, true);
  const before = ops(f.provider);
  const again = await runLineSaga(first.line, f.ports);
  assert.equal(again.ok, true);
  const after = ops(f.provider).slice(before.length);
  assert.deepEqual(
    after,
    ["attachNumber", "createMessagingService", "addNumberToService"],
    "only the sub-step that failed runs again, then the steps that never ran",
  );
});

test("a line that answers is left alone; a line with no number cannot start; a lost token is a failure with a reason", async () => {
  const f = fakes();
  const done = await runLineSaga(
    freshLine({
      voice_state: "answering",
      subaccount_sid: "AC1",
      number_sid: "PN1",
      trunk_sid: "TK1",
      credential_list_sid: "CL1",
      termination_uri: "x.pstn.twilio.com",
      messaging_service_sid: "MG1",
      retell_agent_id: "agent_x",
      facts: {
        trunk_ready: true,
        retell_imported: true,
        number_in_service: true,
        channel_id: "ch1",
        sms_channel_id: "chs1",
      },
    }),
    f.ports,
  );
  assert.equal(done.ok, true);
  assert.equal(f.saves.length, 0);
  assert.equal(f.provider.calls.length, 0);
  const none = await runLineSaga(freshLine({ e164: null }), f.ports);
  assert.equal(none.ok, false);
  assert.equal(none.step, "number");
  assert.equal(none.error, "no number chosen");
  const lost = await runLineSaga(freshLine({ subaccount_sid: "AC1" }), fakes().ports);
  assert.equal(lost.ok, false);
  assert.equal(lost.step, "number");
  assert.match(lost.error, /token is missing/);
});

test("Twilio: every request goes where the docs say, with the documented parameters, as the right account", async () => {
  const calls = [];
  const answers = [];
  const http = async (acct, method, url, form) => {
    calls.push({ acct: acct.sid, method, url, form });
    return answers.shift() ?? { status: 201, body: { sid: "X" } };
  };
  const tw = twilioProvider(http);
  const master = { sid: "ACmaster", token: "t" };
  const sub = { sid: "ACsub", token: "s" };
  answers.push({ status: 201, body: { sid: "ACsub", auth_token: "s", status: "active" } });
  assert.deepEqual(await tw.createSubaccount(master, "Harbor Moving Co. · Chanlytics"), {
    sid: "ACsub",
    token: "s",
    status: "active",
  });
  answers.push({
    status: 200,
    body: {
      available_phone_numbers: [
        {
          phone_number: "+13055550100",
          friendly_name: "(305) 555-0100",
          locality: "Miami",
          region: "FL",
          capabilities: { voice: true, sms: true, mms: false },
        },
      ],
    },
  });
  const found = await tw.searchLocal(sub, { areaCode: 305, limit: 8 });
  assert.deepEqual(found, [
    {
      e164: "+13055550100",
      friendly: "(305) 555-0100",
      locality: "Miami",
      region: "FL",
      capabilities: { voice: true, sms: true, mms: false },
    },
  ]);
  answers.push({ status: 201, body: { sid: "PN1", phone_number: "+13055550100" } });
  assert.deepEqual(await tw.buyNumber(sub, "+13055550100", "Harbor"), { sid: "PN1", e164: "+13055550100" });
  answers.push({ status: 201, body: { sid: "TK1", domain_name: "chanlytics-abc.pstn.twilio.com" } });
  assert.deepEqual(
    await tw.createTrunk(sub, { friendlyName: "Harbor", domainName: "chanlytics-abc.pstn.twilio.com" }),
    { sid: "TK1", domainName: "chanlytics-abc.pstn.twilio.com" },
  );
  answers.push({ status: 201, body: { sid: "CL1" } });
  assert.deepEqual(await tw.createCredentialList(sub, "Harbor"), { sid: "CL1" });
  answers.push({ status: 201, body: { sid: "CR1" } });
  const fakePass = ["Abcdefghij", "12kl"].join(""); // a rule-shaped fake, not a secret; joined so a scanner does not read it as one
  assert.deepEqual(await tw.addCredential(sub, "CL1", "line-abc", fakePass), { sid: "CR1" });
  answers.push({ status: 201, body: { sid: "CL1" } });
  await tw.attachCredentialList(sub, "TK1", "CL1");
  answers.push({ status: 201, body: { sid: "OU1" } });
  assert.deepEqual(await tw.addOrigination(sub, "TK1", { sipUrl: RETELL_ORIGINATION, friendlyName: "Retell" }), {
    sid: "OU1",
  });
  answers.push({ status: 201, body: { sid: "PN1" } });
  await tw.attachNumber(sub, "TK1", "PN1");
  answers.push({ status: 204, body: null });
  await tw.releaseNumber(sub, "PN1");
  answers.push({ status: 204, body: null });
  await tw.deleteTrunk(sub, "TK1");

  assert.deepEqual(
    calls.map((c) => [c.acct, c.method, c.url]),
    [
      ["ACmaster", "POST", twilioUrls.subaccounts],
      [
        "ACsub",
        "GET",
        `${twilioUrls.availableLocal("ACsub")}?AreaCode=305&VoiceEnabled=true&SmsEnabled=true&PageSize=8`,
      ],
      ["ACsub", "POST", twilioUrls.incomingNumbers("ACsub")],
      ["ACsub", "POST", twilioUrls.trunks],
      ["ACsub", "POST", twilioUrls.credentialLists("ACsub")],
      ["ACsub", "POST", twilioUrls.credentials("ACsub", "CL1")],
      ["ACsub", "POST", twilioUrls.trunkCredentialLists("TK1")],
      ["ACsub", "POST", twilioUrls.trunkOriginationUrls("TK1")],
      ["ACsub", "POST", twilioUrls.trunkPhoneNumbers("TK1")],
      ["ACsub", "DELETE", twilioUrls.incomingNumber("ACsub", "PN1")],
      ["ACsub", "DELETE", twilioUrls.trunk("TK1")],
    ],
  );
  assert.deepEqual(calls[0].form, { FriendlyName: "Harbor Moving Co. · Chanlytics" });
  assert.deepEqual(calls[2].form, { PhoneNumber: "+13055550100", FriendlyName: "Harbor" });
  assert.deepEqual(calls[3].form, { FriendlyName: "Harbor", DomainName: "chanlytics-abc.pstn.twilio.com" });
  assert.deepEqual(calls[5].form, { Username: "line-abc", Password: fakePass });
  assert.deepEqual(calls[6].form, { CredentialListSid: "CL1" });
  assert.deepEqual(calls[7].form, {
    SipUrl: "sip:sip.retellai.com",
    FriendlyName: "Retell",
    Weight: "10",
    Priority: "10",
    Enabled: "true",
  });
  assert.deepEqual(calls[8].form, { PhoneNumberSid: "PN1" });
  assert.equal(twilioUrls.subaccounts, "https://api.twilio.com/2010-04-01/Accounts.json");
  assert.equal(twilioUrls.trunks, "https://trunking.twilio.com/v1/Trunks");
  assert.equal(
    twilioUrls.credentials("AC1", "CL1"),
    "https://api.twilio.com/2010-04-01/Accounts/AC1/SIP/CredentialLists/CL1/Credentials.json",
  );
});

test("Twilio: a refusal is an error with the status, the code and the message; a gone number is not a failure to release", async () => {
  const tw = twilioProvider(async () => ({
    status: 400,
    body: { code: 21422, message: "The number is not available" },
  }));
  await assert.rejects(
    () => tw.buyNumber({ sid: "AC", token: "t" }, "+13055550100", "x"),
    (e) =>
      e instanceof TwilioError &&
      e.status === 400 &&
      e.code === 21422 &&
      /not available/.test(e.message) &&
      /Twilio 21422/.test(e.message),
  );
  const gone = twilioProvider(async () => ({ status: 404, body: { code: 20404, message: "not found" } }));
  await gone.releaseNumber({ sid: "AC", token: "t" }, "PN1");
});

test("which provider: real credentials win; the dry provider only outside production; otherwise none", () => {
  assert.equal(chooseLineProvider({ sid: "AC", token: "t", vercelEnv: "production" }), "twilio");
  assert.equal(chooseLineProvider({ sid: "AC", token: "t", dryRun: "1", vercelEnv: "preview" }), "twilio");
  assert.equal(chooseLineProvider({ dryRun: "1", vercelEnv: "preview" }), "dry");
  assert.equal(chooseLineProvider({ dryRun: "1" }), "dry", "a laptop");
  assert.equal(chooseLineProvider({ dryRun: "1", vercelEnv: "production" }), null, "production never fakes a line");
  assert.equal(chooseLineProvider({ vercelEnv: "production" }), null);
  assert.equal(chooseLineProvider({ sid: "AC", vercelEnv: "production" }), null, "half a credential is none");
});

test("the SIP credential meets Twilio's rule; the trunk domain and username come from the line", () => {
  const p = sipPassword(seeded(1));
  assert.equal(p.length, 24);
  assert.ok(isValidSipPassword(p));
  assert.equal(sipPassword(seeded(1)), p, "deterministic under an injected random");
  for (const bad of ["short1A", "alllowercase12345", "NoDigitsHereAtAll", "UPPERCASE12345678"])
    assert.equal(isValidSipPassword(bad), false, bad);
  assert.equal(trunkDomain("0f3c2a1e-1111-4222-8333-444455556666"), "chanlytics-0f3c2a1e1111.pstn.twilio.com");
  assert.equal(sipUsername("0f3c2a1e-1111-4222-8333-444455556666"), "line-0f3c2a1e1111");
  assert.equal(LINE_COSTS.local_number_month_usd, 1.15);
  const body = retellImportBody({
    e164: "+1",
    terminationUri: "t",
    username: "u",
    password: "p",
    agentId: "a",
    pinned: false,
    nickname: "n",
    inboundWebhookUrl: "w",
  });
  assert.deepEqual(body.inbound_agents, [{ agent_id: "a", weight: 1 }], "unpublished: no pin");
});

/**
 * Math.random, made to throw for the length of `fn` -- awaited, so a saga's every step runs without it: a secret drawn
 * from it is a test failure, not a password.
 */
async function withoutMathRandom(fn) {
  const real = Math.random;
  Math.random = () => {
    throw new Error("Math.random is not a source of secrets");
  };
  try {
    return await fn();
  } finally {
    Math.random = real;
  }
}
/** Twilio's alphabet as the generator draws it: letters and digits, none that read as another (no l, o, I, O, 0, 1). */
const SIP_ALPHABET = /^[a-kmnp-zA-HJ-NP-Z2-9]{24}$/;

test("the SIP password is drawn from node:crypto, never Math.random: 24 characters of the unambiguous alphabet, Twilio's rule met, a fresh one each time; the seeded seam still pins one", async () => {
  const seen = new Set();
  await withoutMathRandom(() => {
    for (let i = 0; i < 50; i++) {
      const p = sipPassword();
      assert.match(p, SIP_ALPHABET, p);
      assert.ok(isValidSipPassword(p), p);
      seen.add(p);
    }
  });
  assert.equal(seen.size, 50, "no two alike");
  assert.equal(
    sipPassword(seeded(1)),
    sipPassword(seeded(1)),
    "an injected source is used instead, and pins the password",
  );
  assert.match(sipPassword(seeded(1)), SIP_ALPHABET);
});

test("the saga given no random source takes the secure default: the vault holds a Twilio-valid password while Math.random throws", async () => {
  // The edge wires no `random` (lib/lines/provision.ts builds the ports without one), so this is production's path.
  const f = fakes({ random: undefined });
  const r = await withoutMathRandom(() => runLineSaga(freshLine(), f.ports));
  assert.equal(r.ok, true, r.ok ? "" : `${r.step}: ${r.error}`);
  const s = f.secrets();
  assert.match(s.sip_password, SIP_ALPHABET, "the vault's password, from the default source");
  assert.ok(isValidSipPassword(s.sip_password));
  assert.equal(s.sip_username, sipUsername(LINE_ID));
});

test("wiring: the saga's ports, the receptionist shared with voice-provision, the migration, the manifest, the events", async () => {
  // The edge endpoint itself -- the knock, every op, the spend rule, one line
  // per workspace, and that it schedules the saga rather than running it -- is
  // run in lines-door.test.mjs.
  // The saga and everything it has to tell people moved to lib/provision.ts, because
  // two things provision a line now: a person pressing a button, and the sweep that
  // resumes one the lambda killed. A sweep that assembled its own version of "and
  // then tell everybody" would be a second answer to what a customer is told about
  // their own phone number -- and the half it would most likely get wrong is the
  // failure half, which is the half that matters.
  const prov = readCode("apps/edge/lib/lines/provision.ts");
  assert.ok(prov.includes("runLineSaga(line, { ...linePorts(db, cfg, secrets, tenant, line, choice), timeLeft })"));
  assert.ok(
    prov.includes('kind: "number",') && prov.includes("title: `Your phone line is ready: ${shown}`"),
    "the bell on success",
  );
  assert.ok(prov.includes("Your phone line hit a snag — a person at Chanlytics has it"), "the bell on failure");
  assert.ok(
    prov.includes("{ tenantId: null, notifications: null, isEnvDefault: true }"),
    "the platform hears a failure",
  );
  for (const k of ["line.answering", "line.failed", "line.released"]) assert.ok(EVENT_KINDS.includes(k), k);
  const lib = readCode("apps/edge/lib/lines/lines.ts");
  assert.ok(lib.includes("chooseLineProvider({ sid, token, dryRun: env.LINES_DRY_RUN, vercelEnv: env.VERCEL_ENV })"));
  assert.ok(
    lib.includes('db.rpc("get_line_credentials"') && lib.includes('db.rpc("put_line_credentials"'),
    "secrets through the vault doors",
  );
  assert.ok(lib.includes("ensure: () => ensureVoiceAgent(db, cfg, secrets, tenant)"));
  assert.ok(/provider: "twilio-sip",\s*line_id: lineId/.test(lib), "the routing row names its line");
  const client = lib.slice(lib.indexOf("export function lineForClient"), lib.indexOf("export function linePorts"));
  assert.ok(!/_sid/.test(client), "no provider SID reaches the page");
  const agent = readCode("apps/edge/lib/voice/voice-agent.ts");
  for (const pin of [
    "createRetellLlm(cfg, voiceLlmCreateBody(secrets, fnUrl))",
    "voiceAgentCreateBody({ llmId, llmVersion, agentName: o.agentName }, secrets, fnUrl)",
    'publishAgentVersion(cfg, agentId, agentVersion, "provisioned from the edge")',
    "await getAgentRaw(cfg, o.agentId)",
    "await getRetellLlm(cfg, llmId)",
  ])
    assert.ok(agent.includes(pin), pin);
  assert.ok(
    agent.indexOf('.eq("kind", "voice")') <
      agent.indexOf("createVoiceAgent(cfg, secrets, { agentName: `${tenant.name} front desk` })"),
    "ensure reads the active voice row before creating",
  );
  // voice-provision making the receptionist through the same lib is run in voice-doors.test.mjs.
  const adapter = readCode("packages/channels/src/voice/voice-retell.ts");
  assert.ok(adapter.includes('"/import-phone-number"'));
  const env = readRaw("apps/edge/.env.example");
  for (const k of ["TWILIO_ACCOUNT_SID=", "TWILIO_AUTH_TOKEN=", "LINES_DRY_RUN="]) assert.ok(env.includes(k), k);
  assert.ok(readRaw("apps/edge/vercel.json").includes('"api/admin/lines.ts"'));
  const mig = readRaw("supabase/migrations/00066_lines.sql");
  for (const pin of [
    "create table public.lines (",
    "check (voice_state in ('none', 'provisioning', 'answering', 'failed'))",
    "check (provider in ('twilio', 'dry'))",
    "create policy lines_member_select on public.lines",
    "alter publication supabase_realtime add table public.lines;",
    "create or replace function public.put_line_credentials(p_line_id uuid, p_secret jsonb)",
    "revoke execute on function public.put_line_credentials(uuid, jsonb) from public, anon, authenticated;",
    "revoke execute on function public.get_line_credentials(uuid) from public, anon, authenticated;",
  ])
    assert.ok(mig.includes(pin), pin);
  assert.deepEqual(toldFor("lines"), EVERY_EVENT, "a callback repaints Setup");
  // The package hands the edge every value the saga's four modules export: its barrel names each one.
  const channels = await import("@chanlytics/channels");
  for (const m of ["lines", "lines-twilio", "lines-dry", "lines-saga"]) {
    const mod = await import(new URL(`../../../../packages/channels/src/lines/${m}.ts`, import.meta.url).href);
    for (const name of Object.keys(mod)) assert.ok(name in channels, `${m}.ts: ${name}`);
  }
});

/**
 * A routing row is claimed only by the workspace that owns it.
 *
 * `tenant_channels` is unique on (kind, external_id) ACROSS workspaces, and a
 * phone number outlives its renter: a carrier hands a released number to
 * somebody else a few weeks later. The ensure matched on (kind, external_id)
 * alone, so the new workspace's saga found the PREVIOUS renter's row, wrote
 * that row's id onto its line, and called the line provisioned -- after which
 * every text to that number resolved to a business that no longer owned it.
 * Release made it reachable: it switched off the voice row and left the sms
 * row active.
 *
 * Run rather than read: the rule is about which row comes back from a
 * database holding two workspaces' rows, which a source scan cannot see.
 */
const portsOver = (db, tenantId = "t1") =>
  linePorts(
    db,
    { apiKey: "k" },
    { fnSecret: "s" },
    { id: tenantId, name: "Ada's" },
    freshLine({ tenant_id: tenantId }),
    { name: "dry", provider: dryProvider(1), master: { sid: "ACdryrun", token: "dry" } },
  );

test("a routing row another workspace is STILL USING is refused, never adopted", async () => {
  // A live claim on the key. Adopting it is what put a new workspace's texts
  // into the previous renter's Inbox.
  const tables = {
    tenant_channels: [
      {
        id: "ch-old",
        tenant_id: "t-old",
        kind: "sms",
        external_id: "+13055550100",
        number_e164: "+13055550100",
        status: "active",
        config: {},
      },
    ],
  };
  const ports = portsOver(fakeDb(tables), "t-new");
  await assert.rejects(
    () => ports.smsChannel.ensure({ e164: "+13055550100", lineId: LINE_ID, serviceSid: "MG1" }),
    /belongs to another workspace/,
    "the saga fails loudly and a person looks at it",
  );
  assert.equal(tables.tenant_channels.length, 1, "and nothing was written");
  assert.equal(tables.tenant_channels[0].tenant_id, "t-old", "the other workspace's row is untouched");
  assert.equal(tables.tenant_channels[0].status, "active");
});

test("a routing row another workspace RELEASED changes hands, or a recycled number is dead for ever", async () => {
  // Release disables rather than deletes, because calls keep their history,
  // and nothing anywhere deletes a tenant_channels row. So refusing every
  // stranger's row would leave a carrier-recycled number unprovisionable by
  // its new renter permanently -- the same number unreachable, arrived at
  // from the opposite side of the same rule.
  const tables = {
    tenant_channels: [
      {
        id: "ch-old",
        tenant_id: "t-old",
        kind: "sms",
        external_id: "+13055550100",
        number_e164: "+13055550100",
        status: "disabled",
        config: { line_id: "old-line" },
      },
    ],
  };
  const got = await portsOver(fakeDb(tables), "t-new").smsChannel.ensure({
    e164: "+13055550100",
    lineId: LINE_ID,
    serviceSid: "MG9",
  });
  assert.deepEqual(
    got,
    { channelId: "ch-old", created: false },
    "the row is taken, not duplicated: (kind, external_id) is unique across workspaces",
  );
  assert.equal(tables.tenant_channels.length, 1);
  assert.equal(
    tables.tenant_channels[0].tenant_id,
    "t-new",
    "and it now belongs to the workspace that holds the number",
  );
  assert.equal(tables.tenant_channels[0].status, "active");
  assert.equal(tables.tenant_channels[0].config.messaging_service_sid, "MG9", "pointed at the line that took it");
});

test("a row claimed between the read and the take is lost honestly, not overwritten", async () => {
  // The take is pinned to the row as it was READ. A fake whose row moves
  // underneath it stands in for the two sagas that race for one recycled
  // number: the loser must fail, never overwrite the winner.
  const tables = {
    tenant_channels: [
      {
        id: "ch-old",
        tenant_id: "t-old",
        kind: "sms",
        external_id: "+13055550100",
        number_e164: "+13055550100",
        status: "disabled",
        config: {},
      },
    ],
  };
  const db = fakeDb(tables);
  const realFrom = db.from.bind(db);
  let raced = false;
  db.from = (table) => {
    const q = realFrom(table);
    if (table !== "tenant_channels" || raced) return q;
    const select = q.select.bind(q);
    q.select = (...a) => {
      const b = select(...a);
      const maybeSingle = b.maybeSingle.bind(b);
      // Somebody else takes it in the gap between the read and the take.
      b.maybeSingle = async () => {
        const r = await maybeSingle();
        raced = true;
        tables.tenant_channels[0] = { ...tables.tenant_channels[0], tenant_id: "t-other", status: "active" };
        return r;
      };
      return b;
    };
    return q;
  };
  await assert.rejects(
    () => portsOver(db, "t-new").smsChannel.ensure({ e164: "+13055550100", lineId: LINE_ID, serviceSid: "MG1" }),
    /claimed by another workspace/,
  );
  assert.equal(tables.tenant_channels[0].tenant_id, "t-other", "the winner keeps it");
});

test("this workspace's own row is kept, and one switched off by a release is switched back on", async () => {
  const tables = {
    tenant_channels: [
      {
        id: "ch-mine",
        tenant_id: "t1",
        kind: "sms",
        external_id: "+13055550100",
        number_e164: "+13055550100",
        status: "active",
        config: {},
      },
    ],
  };
  assert.deepEqual(
    await portsOver(fakeDb(tables)).smsChannel.ensure({ e164: "+13055550100", lineId: LINE_ID, serviceSid: "MG1" }),
    { channelId: "ch-mine", created: false },
    "a workspace that already texts on this number keeps its row",
  );

  // The same workspace releasing and re-buying its own number. Adopting the
  // disabled row as-is reported the line as answering while the webhook
  // refused to route it -- the same silence, reached from the other side.
  const off = {
    tenant_channels: [
      {
        id: "ch-off",
        tenant_id: "t1",
        kind: "sms",
        external_id: "+13055550100",
        number_e164: "+13055550100",
        status: "disabled",
        config: {},
      },
    ],
  };
  assert.deepEqual(
    await portsOver(fakeDb(off)).smsChannel.ensure({ e164: "+13055550100", lineId: LINE_ID, serviceSid: "MG2" }),
    { channelId: "ch-off", created: false },
  );
  assert.equal(
    off.tenant_channels[0].status,
    "active",
    "switched back on, or the number is unroutable while the line says it answers",
  );
  assert.equal(off.tenant_channels[0].config.messaging_service_sid, "MG2", "and pointed at the line that now holds it");
});

test("a number nobody holds is written for this workspace; the voice row follows the same rule", async () => {
  const tables = { tenant_channels: [] };
  const made = await portsOver(fakeDb(tables)).smsChannel.ensure({
    e164: "+13055550100",
    lineId: LINE_ID,
    serviceSid: "MG1",
  });
  assert.equal(made.created, true);
  assert.equal(tables.tenant_channels[0].tenant_id, "t1");
  assert.equal(tables.tenant_channels[0].status, "active");

  const theirs = {
    tenant_channels: [
      { id: "ag-old", tenant_id: "t-old", kind: "voice", external_id: "agent-1", status: "active", config: {} },
    ],
  };
  await assert.rejects(
    () =>
      portsOver(fakeDb(theirs), "t-new").channel.ensure({ agentId: "agent-1", e164: "+13055550100", lineId: LINE_ID }),
    /belongs to another workspace/,
  );
});

/* ---- what a released line switches off, and what it must not ---- */

const releasedLine = (facts) => ({ id: "line-a", facts });

test("a released line switches off both of its routing rows, so a recycled number carries no stale claim", async () => {
  const tables = {
    lines: [{ id: "line-a", tenant_id: "t1", facts: { channel_id: "ch-voice", sms_channel_id: "ch-sms" } }],
    tenant_channels: [
      { id: "ch-voice", tenant_id: "t1", kind: "voice", external_id: "agent-1", status: "active" },
      { id: "ch-sms", tenant_id: "t1", kind: "sms", external_id: "+13055550100", status: "active" },
    ],
  };
  const r = await releaseRoutingRows(
    fakeDb(tables),
    "t1",
    releasedLine({ channel_id: "ch-voice", sms_channel_id: "ch-sms" }),
  );
  assert.deepEqual(r, { ok: true, released: { channel_disabled: "ch-voice", sms_channel_disabled: "ch-sms" } });
  assert.deepEqual(
    tables.tenant_channels.map((c) => c.status),
    ["disabled", "disabled"],
    "switched off, never deleted: calls keep their history",
  );
});

test("a routing row ANOTHER line still points at is kept, or one release silences the workspace", async () => {
  // The voice row is keyed on the workspace's Retell agent, which every line
  // of the workspace shares. Switching it off for one line switches the
  // receptionist off for all of them -- and unrecoverably, since the others
  // already carry facts.channel_id and their saga skips channel.ensure.
  const tables = {
    lines: [
      {
        id: "line-a",
        tenant_id: "t1",
        e164: "+13055550100",
        facts: { channel_id: "ch-voice", sms_channel_id: "ch-sms-a" },
      },
      {
        id: "line-b",
        tenant_id: "t1",
        e164: "+13055550111",
        facts: { channel_id: "ch-voice", sms_channel_id: "ch-sms-b" },
      },
    ],
    tenant_channels: [
      {
        id: "ch-voice",
        tenant_id: "t1",
        kind: "voice",
        external_id: "agent-1",
        number_e164: "+13055550100",
        status: "active",
        config: { provider: "twilio-sip", line_id: "line-a" },
      },
      {
        id: "ch-sms-a",
        tenant_id: "t1",
        kind: "sms",
        external_id: "+13055550100",
        number_e164: "+13055550100",
        status: "active",
        config: {},
      },
    ],
  };
  const r = await releaseRoutingRows(
    fakeDb(tables),
    "t1",
    releasedLine({ channel_id: "ch-voice", sms_channel_id: "ch-sms-a" }),
  );
  assert.deepEqual(r, { ok: true, released: { channel_kept: "ch-voice", sms_channel_disabled: "ch-sms-a" } });
  const by = Object.fromEntries(tables.tenant_channels.map((c) => [c.id, c]));
  assert.equal(by["ch-voice"].status, "active", "the other line still answers on it");
  assert.equal(
    by["ch-sms-a"].status,
    "disabled",
    "but the number this line held is given up: it is keyed on the number, so it is this line's alone",
  );
  // A kept row must describe the line that HOLDS it. `number_e164` is what the
  // public page, Settings, the consent page and the receptionist's own facts
  // publish as the workspace's number, so a row keeping the RELEASED number on
  // it advertises a number that has gone back to the carrier.
  assert.equal(by["ch-voice"].number_e164, "+13055550111", "repointed at the line that kept it");
  assert.equal(by["ch-voice"].config.line_id, "line-b");
  assert.equal(by["ch-voice"].config.provider, "twilio-sip", "and the rest of its config is left alone");
});

test("another WORKSPACE's line pointing at the same id does not keep the row", async () => {
  // The question is scoped to this workspace, or one tenant's stale facts
  // would pin another tenant's number for ever.
  const tables = {
    lines: [
      { id: "line-a", tenant_id: "t1", facts: { sms_channel_id: "ch-sms" } },
      { id: "line-z", tenant_id: "t2", facts: { sms_channel_id: "ch-sms" } },
    ],
    tenant_channels: [{ id: "ch-sms", tenant_id: "t1", kind: "sms", external_id: "+13055550100", status: "active" }],
  };
  const r = await releaseRoutingRows(fakeDb(tables), "t1", releasedLine({ sms_channel_id: "ch-sms" }));
  assert.deepEqual(r, { ok: true, released: { sms_channel_disabled: "ch-sms" } });
  assert.equal(tables.tenant_channels[0].status, "disabled");
});

test("a line the saga never got that far with has nothing to switch off", async () => {
  const tables = { lines: [], tenant_channels: [] };
  assert.deepEqual(await releaseRoutingRows(fakeDb(tables), "t1", releasedLine({})), { ok: true, released: {} });
});

test("a row that will not switch off stops the release rather than orphaning a live claim", async () => {
  const tables = {
    lines: [{ id: "line-a", tenant_id: "t1", facts: { sms_channel_id: "ch-sms" } }],
    tenant_channels: [{ id: "ch-sms", tenant_id: "t1", kind: "sms", external_id: "+13055550100", status: "active" }],
  };
  const r = await releaseRoutingRows(
    fakeDb(tables, { "tenant_channels.update": { message: "row is locked" } }),
    "t1",
    releasedLine({ sms_channel_id: "ch-sms" }),
  );
  assert.equal(r.ok, false);
  assert.match(r.error, /switching the routing row off: row is locked/);
  // The caller does not delete the line: a number given back at the provider
  // with a live routing row still claiming it is the state this must not reach.
  assert.equal(tables.tenant_channels[0].status, "active");
});

test("a release that fails halfway still reports what it already did", async () => {
  // The provider has already given the number back by this point and the voice
  // row is already off. A 503 naming only the provider leaves an operator
  // unaware that the workspace's routing is half dismantled while the line row
  // still reads `answering`.
  const tables = {
    lines: [
      {
        id: "line-a",
        tenant_id: "t1",
        e164: "+13055550100",
        facts: { channel_id: "ch-voice", sms_channel_id: "ch-sms" },
      },
    ],
    tenant_channels: [
      {
        id: "ch-voice",
        tenant_id: "t1",
        kind: "voice",
        external_id: "agent-1",
        number_e164: "+13055550100",
        status: "active",
        config: {},
      },
      {
        id: "ch-sms",
        tenant_id: "t1",
        kind: "sms",
        external_id: "+13055550100",
        number_e164: "+13055550100",
        status: "active",
        config: {},
      },
    ],
  };
  const db = fakeDb(tables);
  const realFrom = db.from.bind(db);
  let offs = 0;
  db.from = (table) => {
    const q = realFrom(table);
    if (table !== "tenant_channels") return q;
    const update = q.update.bind(q);
    q.update = (...a) =>
      ++offs === 2
        ? { eq: () => ({ eq: async () => ({ data: null, error: { message: "row is locked" } }) }) }
        : update(...a);
    return q;
  };
  const r = await releaseRoutingRows(db, "t1", releasedLine({ channel_id: "ch-voice", sms_channel_id: "ch-sms" }));
  assert.equal(r.ok, false);
  assert.match(r.error, /switching the routing row off: row is locked/);
  assert.deepEqual(r.released, { channel_disabled: "ch-voice" }, "the half that DID happen is still reported");
});

test("with three lines on one agent row, the line the number moves to is not whichever the planner returned first", async () => {
  // What gets picked becomes the number this workspace publishes on its
  // business page, its consent page and in the receptionist's own facts, so
  // an unordered limit(1) makes that a coin toss. The oldest, which is the
  // line ensureVoiceAgent, line_forwarding_set and businessPageFor all settle
  // on when a workspace has more than one.
  const lines = [
    {
      id: "line-c",
      tenant_id: "t1",
      e164: "+13055550133",
      created_at: "2026-03-01T00:00:00Z",
      facts: { channel_id: "ch-voice" },
    },
    {
      id: "line-b",
      tenant_id: "t1",
      e164: "+13055550111",
      created_at: "2026-01-01T00:00:00Z",
      facts: { channel_id: "ch-voice" },
    },
    {
      id: "line-a",
      tenant_id: "t1",
      e164: "+13055550100",
      created_at: "2026-02-01T00:00:00Z",
      facts: { channel_id: "ch-voice" },
    },
  ];
  const chan = () => [
    {
      id: "ch-voice",
      tenant_id: "t1",
      kind: "voice",
      external_id: "agent-1",
      number_e164: "+13055550100",
      status: "active",
      config: {},
    },
  ];
  for (const order of [lines, [...lines].reverse()]) {
    const tables = { lines: [...order], tenant_channels: chan() };
    await releaseRoutingRows(fakeDb(tables), "t1", releasedLine({ channel_id: "ch-voice" }));
    assert.equal(
      tables.tenant_channels[0].number_e164,
      "+13055550111",
      "the oldest, whatever order the rows came back in",
    );
    assert.equal(tables.tenant_channels[0].config.line_id, "line-b");
  }
});

test("a holder with no number of its own does not erase the number the row publishes", async () => {
  // `lines.e164` is nullable: a line killed before its purchase answered has
  // none. Writing that null would blank the number on the public page while
  // reporting the keep as a success.
  const tables = {
    lines: [
      {
        id: "line-a",
        tenant_id: "t1",
        e164: "+13055550100",
        created_at: "2026-01-01T00:00:00Z",
        facts: { channel_id: "ch-voice" },
      },
      {
        id: "line-b",
        tenant_id: "t1",
        e164: null,
        created_at: "2026-02-01T00:00:00Z",
        facts: { channel_id: "ch-voice" },
      },
    ],
    tenant_channels: [
      {
        id: "ch-voice",
        tenant_id: "t1",
        kind: "voice",
        external_id: "agent-1",
        number_e164: "+13055550100",
        status: "active",
        config: {},
      },
    ],
  };
  const r = await releaseRoutingRows(fakeDb(tables), "t1", releasedLine({ channel_id: "ch-voice" }));
  assert.deepEqual(r, { ok: true, released: { channel_kept: "ch-voice" } });
  assert.equal(tables.tenant_channels[0].number_e164, "+13055550100", "left alone rather than nulled");
  assert.equal(tables.tenant_channels[0].config.line_id, "line-b", "but the row still names a line that exists");
});

/* ---- (C1) a run bounded by its deadline, and a create whose receipt was lost ---- */

test("(C1) a run out of time stops between two provider calls, fails nothing, and the next run goes on from its step with nothing made twice", async () => {
  const f = fakes();
  const first = await runLineSaga(freshLine(), {
    ...f.ports,
    timeLeft: () => (f.provider.calls.length >= 4 ? 0 : 60_000),
  });
  assert.equal(first.ok, true);
  assert.equal(first.later, true);
  assert.equal(first.step, "trunk");
  assert.deepEqual(ops(f.provider), ["createSubaccount", "ownedNumber", "buyNumber", "createTrunk"]);
  assert.equal(first.line.voice_state, "provisioning", "still setting up, not failed");
  assert.equal(first.line.last_error, null);
  assert.ok(!f.saves.some((s) => s.voice_state === "failed"), "nothing on the row says it failed");
  assert.match(first.line.trunk_sid, /^TK/, "the call that was made kept its receipt");

  const again = await runLineSaga(first.line, f.ports);
  assert.equal(again.ok, true);
  assert.equal(again.later, undefined);
  assert.equal(again.line.voice_state, "answering");
  assert.deepEqual(
    ops(f.provider),
    [
      "createSubaccount",
      "ownedNumber",
      "buyNumber",
      "createTrunk",
      "createCredentialList",
      "addCredential",
      "attachCredentialList",
      "addOrigination",
      "attachNumber",
      "createMessagingService",
      "addNumberToService",
    ],
    "the two runs together made exactly what one fresh run makes",
  );
  // Out of time before the first call: no call at all, and still nothing failed.
  const g = fakes();
  const none = await runLineSaga(freshLine(), { ...g.ports, timeLeft: () => 0 });
  assert.deepEqual([none.ok, none.later, none.step, g.provider.calls.length], [true, true, "subaccount", 0]);
});

test("(C1) the receptionist's step, three Retell calls, starts only with room for all three; a carrier call needs only its own", async () => {
  const f = fakes();
  const agents = [];
  f.ports.agent = {
    ensure: async () => {
      agents.push("ensure");
      return { agentId: "agent_x", llmId: "llm_x", pinned: true };
    },
  };
  // Five seconds left: enough to start any carrier call, not the receptionist's three.
  const first = await runLineSaga(freshLine(), { ...f.ports, timeLeft: () => 5_000 });
  assert.deepEqual([first.ok, first.later, first.step], [true, true, "agent"]);
  assert.deepEqual(agents, [], "not started");
  assert.equal(nextLineStep(first.line), "agent", "every carrier step before it done");
  const again = await runLineSaga(first.line, { ...f.ports, timeLeft: () => 30_000 });
  assert.equal(again.line.voice_state, "answering");
  assert.deepEqual(agents, ["ensure"]);
});

/**
 * A store that keeps what was written, and loses the first write that carries `receipt` -- the run killed after the
 * provider answered and before the row heard. What the next run starts from is what was KEPT, not the saga's own copy.
 */
function losing(f, receipt) {
  let kept = freshLine();
  let lost = false;
  const carries = (p) => receipt(p) && !lost;
  f.ports.store.save = async (p) => {
    if (carries(p)) {
      lost = true;
      throw new Error("the run was cut off");
    }
    f.saves.push(p);
    kept = { ...kept, ...p, facts: p.facts ? { ...p.facts } : kept.facts };
  };
  return () => kept;
}

for (const [thing, key, receipt, made, looked] of [
  ["subaccount", "subaccount", (p) => !!p.subaccount_sid, "createSubaccount", "findSubaccount"],
  ["trunk", "trunk", (p) => !!p.trunk_sid, "createTrunk", "findTrunk"],
  ["credential list", "credential_list", (p) => !!p.credential_list_sid, "createCredentialList", "findCredentialList"],
  [
    "origination",
    "origination",
    (p) => typeof p.facts?.origination_sid === "string",
    "addOrigination",
    "findOrigination",
  ],
]) {
  test(`(C1) a ${thing} made by a run cut off before its receipt is found by the next run, never made twice`, async () => {
    const f = fakes();
    const kept = losing(f, receipt);
    const first = await runLineSaga(freshLine(), f.ports);
    assert.equal(first.ok, false);
    assert.equal(kept().facts[`asked_${key}`], true, "asked, on the row, before the provider was");
    const again = await runLineSaga(kept(), f.ports);
    assert.equal(again.ok, true, again.ok ? "" : again.error);
    assert.equal(again.line.voice_state, "answering");
    assert.equal(ops(f.provider).filter((o) => o === made).length, 1, `one ${thing}`);
    assert.equal(ops(f.provider).filter((o) => o === looked).length, 1, "looked for once, on the run after");
  });
}

test("(C1) a SIP credential whose password went with the run that made it is removed and made again -- the list holds its username once", async () => {
  const f = fakes();
  const realPut = f.ports.store.putSecrets;
  let cut = false;
  f.ports.store.putSecrets = async (s) => {
    if (s.sip_password && !cut) {
      cut = true;
      throw new Error("the run was cut off");
    }
    return realPut(s);
  };
  const first = await runLineSaga(freshLine(), f.ports);
  assert.equal(first.ok, false);
  assert.equal(f.secrets().sip_password, undefined, "the password is lost");
  const again = await runLineSaga(first.line, f.ports);
  assert.equal(again.ok, true, again.ok ? "" : again.error);
  const trunkOps = ops(f.provider).filter((o) => /Credential$|^findCredential$|deleteCredential/.test(o));
  assert.deepEqual(trunkOps, ["addCredential", "findCredential", "deleteCredential", "addCredential"]);
  assert.ok(isValidSipPassword(f.secrets().sip_password), "and the vault holds the password of the one that stands");
});

test("(C1) Twilio: each look is one read in the right account, matched on what the line owns; a closed subaccount is no find, and a read that fails throws", async () => {
  const calls = [];
  let answer = { status: 200, body: {} };
  const tw = twilioProvider(async (acct, method, url) => {
    calls.push([acct.sid, method, url]);
    return answer;
  });
  const master = { sid: "ACmaster", token: "t" };
  const sub = { sid: "ACsub", token: "s" };
  const name = "Harbor Moving Co. · Chanlytics · 0f3c2a1e1111";

  answer = {
    status: 200,
    body: {
      accounts: [
        { sid: "ACold", auth_token: "x", status: "closed" },
        { sid: "ACsub", auth_token: "s", status: "active" },
      ],
    },
  };
  assert.deepEqual(await tw.findSubaccount(master, name), { sid: "ACsub", token: "s" });
  assert.deepEqual(calls.at(-1), [
    "ACmaster",
    "GET",
    `${twilioUrls.subaccounts}?FriendlyName=${encodeURIComponent(name).replace(/%20/g, "+")}&PageSize=20`,
  ]);

  answer = {
    status: 200,
    body: {
      trunks: [
        { sid: "TKother", domain_name: "x.pstn.twilio.com" },
        { sid: "TK1", domain_name: trunkDomain(LINE_ID) },
      ],
    },
  };
  assert.deepEqual(await tw.findTrunk(sub, trunkDomain(LINE_ID)), { sid: "TK1", domainName: trunkDomain(LINE_ID) });
  assert.deepEqual(calls.at(-1), ["ACsub", "GET", `${twilioUrls.trunks}?PageSize=50`]);

  answer = {
    status: 200,
    body: { credential_lists: [{ sid: "CL1", friendly_name: "Harbor Moving Co. · Chanlytics" }] },
  };
  assert.deepEqual(await tw.findCredentialList(sub, "Harbor Moving Co. · Chanlytics"), { sid: "CL1" });
  assert.equal(await tw.findCredentialList(sub, "Another"), null);
  assert.deepEqual(calls.at(-1), ["ACsub", "GET", `${twilioUrls.credentialLists("ACsub")}?PageSize=50`]);

  answer = { status: 200, body: { credentials: [{ sid: "CR1", username: sipUsername(LINE_ID) }] } };
  assert.deepEqual(await tw.findCredential(sub, "CL1", sipUsername(LINE_ID)), { sid: "CR1" });
  assert.deepEqual(calls.at(-1), ["ACsub", "GET", `${twilioUrls.credentials("ACsub", "CL1")}?PageSize=50`]);
  answer = { status: 204, body: null };
  await tw.deleteCredential(sub, "CL1", "CR1");
  assert.deepEqual(calls.at(-1), ["ACsub", "DELETE", twilioUrls.credential("ACsub", "CL1", "CR1")]);

  answer = { status: 200, body: { origination_urls: [{ sid: "OU1", sip_url: RETELL_ORIGINATION }] } };
  assert.deepEqual(await tw.findOrigination(sub, "TK1", RETELL_ORIGINATION), { sid: "OU1" });
  assert.deepEqual(calls.at(-1), ["ACsub", "GET", `${twilioUrls.trunkOriginationUrls("TK1")}?PageSize=50`]);

  answer = { status: 500, body: { code: 20500, message: "internal error" } };
  await assert.rejects(tw.findTrunk(sub, trunkDomain(LINE_ID)), /list trunks: internal error \(Twilio 20500\)/);
  await assert.rejects(tw.findSubaccount(master, name), TwilioError);
});

/* ---- the order of the saga's calls: every port call, every save, every clock check, and where each failure lands ---- */

/**
 * The ports of `f`, each call written to one trace, in order: a save as what it writes (a fact save as the facts it
 * adds), every other port by its name. `fail` makes the call of that number throw; `kept` is what the store kept.
 */
function traced(f, { fail = 0, timeLeft } = {}) {
  const trace = [];
  let kept = freshLine();
  const say = (name, fn) =>
    function (...a) {
      trace.push(name(...a));
      if (trace.length === fail) throw new Error(`down at call ${fail}`);
      return fn.apply(this, a);
    };
  const saved = (p) => {
    const cols = Object.keys(p)
      .filter((k) => k !== "facts")
      .map((k) => (k === "step" || k === "voice_state" ? `${k}=${p[k]}` : k));
    const facts = p.facts ? [`facts+${Object.keys(p.facts).filter((k) => !(k in kept.facts))}`] : [];
    return `save ${[...cols, ...facts].join(" ")}`;
  };
  const provider = { ...f.provider };
  for (const [m, fn] of Object.entries(f.provider))
    if (typeof fn === "function") provider[m] = say(() => m, fn.bind(f.provider));
  const ports = {
    ...f.ports,
    provider,
    now: say(() => "now", f.ports.now),
    store: {
      save: say(saved, async (p) => {
        await f.ports.store.save(p);
        kept = { ...kept, ...p, facts: p.facts ? { ...p.facts } : kept.facts };
      }),
      getSecrets: say(() => "getSecrets", f.ports.store.getSecrets),
      putSecrets: say((s) => `putSecrets ${Object.keys(s)}`, f.ports.store.putSecrets),
    },
    agent: { ensure: say(() => "agent.ensure", f.ports.agent.ensure) },
    retell: { importNumber: say(() => "retell.importNumber", f.ports.retell.importNumber) },
    channel: { ensure: say(() => "channel.ensure", f.ports.channel.ensure) },
    smsChannel: { ensure: say(() => "smsChannel.ensure", f.ports.smsChannel.ensure) },
    ...(timeLeft ? { timeLeft: say(() => "timeLeft", timeLeft) } : {}),
  };
  return { ports, trace, kept: () => kept };
}

/** Consecutive equal outcomes as one entry: `["trunk x7", ...]`. */
const runsOf = (xs) =>
  xs
    .reduce((out, x) => {
      if (out.at(-1)?.x === x) out.at(-1).n += 1;
      else out.push({ x, n: 1 });
      return out;
    }, [])
    .map(({ x, n }) => `${x} x${n}`);

/** A fresh line's run: 65 port calls, 17 of them the clock. */
const FRESH_RUN = [
  "getSecrets",
  "now",
  "save voice_state=provisioning step=subaccount last_error state_since",
  "timeLeft",
  "save step=subaccount",
  "timeLeft",
  "save facts+asked_subaccount",
  "createSubaccount",
  "putSecrets auth_token",
  "save subaccount_sid",
  "timeLeft",
  "save step=number",
  "ownedNumber",
  "timeLeft",
  "buyNumber",
  "save number_sid e164",
  "timeLeft",
  "save step=trunk",
  "timeLeft",
  "save facts+asked_trunk",
  "createTrunk",
  "save trunk_sid termination_uri",
  "timeLeft",
  "save facts+asked_credential_list",
  "createCredentialList",
  "save credential_list_sid",
  "timeLeft",
  "save facts+asked_credential",
  "addCredential",
  "putSecrets sip_username,sip_password",
  "timeLeft",
  "attachCredentialList",
  "save facts+credential_list_attached",
  "timeLeft",
  "save facts+asked_origination",
  "addOrigination",
  "save facts+origination_sid",
  "timeLeft",
  "attachNumber",
  "save facts+number_attached",
  "save facts+trunk_ready",
  "timeLeft",
  "save step=agent",
  "timeLeft",
  "agent.ensure",
  "save retell_agent_id facts+llm_id,agent_pinned",
  "timeLeft",
  "save step=import",
  "retell.importNumber",
  "save facts+retell_imported,retell_number_type",
  "timeLeft",
  "save step=messaging",
  "createMessagingService",
  "save messaging_service_sid",
  "timeLeft",
  "addNumberToService",
  "save facts+number_in_service",
  "timeLeft",
  "save step=channel",
  "channel.ensure",
  "save facts+channel_id",
  "smsChannel.ensure",
  "save facts+sms_channel_id",
  "now",
  "save voice_state=answering step=null last_error state_since",
];

test("the saga's calls, in order: a fresh line's every port call and every save, the clock asked before each carrier call", async () => {
  const t = traced(fakes(), { timeLeft: () => 60_000 });
  const r = await runLineSaga(freshLine(), t.ports);
  assert.equal(r.line.voice_state, "answering");
  assert.deepEqual(t.trace, FRESH_RUN);
});

test("a failure at each of those calls lands at the step it was made in, with the port's words; the run after answers, and nothing is bought or made twice", async () => {
  const outcomes = [];
  for (let k = 1; k <= FRESH_RUN.length; k++) {
    const f = fakes();
    const t = traced(f, { fail: k, timeLeft: () => 60_000 });
    const r = await runLineSaga(freshLine(), t.ports).catch((e) => ({ threw: e.message }));
    outcomes.push(r.threw ? "threw" : r.ok ? "answering" : `failed at ${r.step}`);
    assert.equal(r.threw ?? r.error, `down at call ${k}`, `call ${k} (${FRESH_RUN[k - 1]}): the port's own words`);
    const again = await runLineSaga(t.kept(), f.ports);
    assert.equal(again.line.voice_state, "answering", `call ${k}: the run after, from what was kept, answers`);
    for (const once of ["createSubaccount", "buyNumber", "createTrunk", "createCredentialList", "addOrigination"])
      assert.equal(ops(f.provider).filter((o) => o === once).length, 1, `call ${k}: one ${once}`);
  }
  assert.deepEqual(runsOf(outcomes), [
    // The vault's read, the clock and the first save come before the saga starts: its caller hears them.
    "threw x3",
    "failed at subaccount x8",
    "failed at number x6",
    "failed at trunk x25",
    "failed at agent x5",
    "failed at import x4",
    "failed at messaging x7",
    "failed at channel x6",
    // The last save, `answering`: the row's step is already null when it fails, so the failure is filed at the first.
    "failed at subaccount x1",
  ]);
});

test("out of time at each clock check, the run stops `later` at its step, and the run after makes what one fresh run makes", async () => {
  const fresh = fakes();
  await runLineSaga(freshLine(), fresh.ports);
  // A look is a read, asked again by the run after when the clock stopped between it and what it guards.
  const made = (f) => ops(f.provider).filter((o) => !/^find|^ownedNumber$/.test(o));
  const laters = [];
  for (let k = 1; k <= FRESH_RUN.filter((c) => c === "timeLeft").length; k++) {
    const f = fakes();
    let n = 0;
    const first = await runLineSaga(freshLine(), { ...f.ports, timeLeft: () => (++n >= k ? 0 : 60_000) });
    assert.equal(first.later, true, `check ${k}: later`);
    laters.push(first.step);
    assert.ok(!f.saves.some((s) => s.voice_state === "failed"), `check ${k}: nothing failed`);
    const again = await runLineSaga(first.line, f.ports);
    assert.equal(again.line.voice_state, "answering", `check ${k}: the run after answers`);
    assert.deepEqual(made(f), made(fresh), `check ${k}: nothing made twice`);
  }
  assert.deepEqual(runsOf(laters), ["subaccount x3", "number x2", "trunk x7", "agent x2", "import x1", "messaging x2"]);
});
