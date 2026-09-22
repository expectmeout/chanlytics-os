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
import { readCode, readRaw } from "./_source.mjs";
import { fakeDb } from "./_fake-db.mjs";
import { linePorts, releaseRoutingRows } from "../../../apps/edge/lib/lines.ts";

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

test("wiring: the saga's ports, the receptionist shared with voice-provision, the migration, the manifest, the events", () => {
  // The edge endpoint itself -- the knock, every op, the spend rule, one line
  // per workspace, and that it schedules the saga rather than running it -- is
  // run in lines-door.test.mjs.
  // The saga and everything it has to tell people moved to lib/provision.ts, because
  // two things provision a line now: a person pressing a button, and the sweep that
  // resumes one the lambda killed. A sweep that assembled its own version of "and
  // then tell everybody" would be a second answer to what a customer is told about
  // their own phone number -- and the half it would most likely get wrong is the
  // failure half, which is the half that matters.
  const prov = readCode("apps/edge/lib/provision.ts");
  assert.ok(prov.includes("runLineSaga(line, linePorts(db, cfg, secrets, tenant, line, choice))"));
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
  const lib = readCode("apps/edge/lib/lines.ts");
  assert.ok(lib.includes("chooseLineProvider({ sid, token, dryRun: env.LINES_DRY_RUN, vercelEnv: env.VERCEL_ENV })"));
  assert.ok(
    lib.includes('db.rpc("get_line_credentials"') && lib.includes('db.rpc("put_line_credentials"'),
    "secrets through the vault doors",
  );
  assert.ok(lib.includes("ensure: () => ensureVoiceAgent(db, cfg, secrets, tenant)"));
  assert.ok(lib.includes('provider: "twilio-sip", line_id: lineId'), "the routing row names its line");
  const client = lib.slice(lib.indexOf("export function lineForClient"), lib.indexOf("export function linePorts"));
  assert.ok(!/_sid/.test(client), "no provider SID reaches the page");
  const agent = readCode("apps/edge/lib/voice-agent.ts");
  for (const pin of [
    "createRetellLlm(cfg, voiceLlmCreateBody(secrets))",
    "createAgent(cfg, voiceAgentCreateBody(",
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
  const adapter = readCode("packages/channels/src/voice-retell.ts");
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
  assert.ok(
    readCode("packages/db/src/realtime.ts").includes('{ table: "lines", event: "*" }'),
    "a callback repaints Setup",
  );
  const index = readCode("packages/channels/src/index.ts");
  for (const m of ["./lines", "./lines-twilio", "./lines-dry", "./lines-saga"])
    assert.ok(index.includes(`export * from "${m}";`), m);
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
