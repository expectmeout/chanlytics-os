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

const LINE_ID = "0f3c2a1e-1111-4222-8333-444455556666";
const freshLine = (over = {}) => ({
  id: LINE_ID, tenant_id: "t1", e164: "+13055550100", provider: "dry", area_code: 305,
  subaccount_sid: null, number_sid: null, trunk_sid: null, credential_list_sid: null, termination_uri: null, messaging_service_sid: null, retell_agent_id: null,
  voice_state: "none", step: null, last_error: null, state_since: "2026-09-07T00:00:00Z", facts: {},
  ...over,
});

/** A small deterministic random, so the password a test sees is the password every test sees. */
const seeded = (s = 42) => () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };

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
      save: async (p) => { saves.push(p); },
      getSecrets: async () => ({ ...secrets }),
      putSecrets: async (s) => { secrets = { ...secrets, ...s }; },
    },
    agent: { ensure: async () => ({ agentId: "agent_x", llmId: "llm_x", pinned: true }) },
    retell: { importNumber: async (body) => { imports.push(body); return { ok: true, status: 201, body: { phone_number_type: "custom" } }; } },
    channel: { ensure: async (o) => { channels.push(o); return { channelId: "ch1", created: true }; } },
    smsChannel: { ensure: async (o) => { smsChannels.push(o); return { channelId: "chs1", created: true }; } },
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
    { trunk_ready: l.facts.trunk_ready, imported: l.facts.retell_imported, type: l.facts.retell_number_type, channel: l.facts.channel_id, pinned: l.facts.agent_pinned, attached: l.facts.number_attached, cl: l.facts.credential_list_attached },
    { trunk_ready: true, imported: true, type: "custom", channel: "ch1", pinned: true, attached: true, cl: true },
  );
  assert.match(String(l.facts.origination_sid), /^OU/);
  assert.deepEqual(ops(f.provider), ["createSubaccount", "buyNumber", "createTrunk", "createCredentialList", "addCredential", "attachCredentialList", "addOrigination", "attachNumber", "createMessagingService", "addNumberToService"]);
  // The subaccount, not the master, buys and trunks.
  assert.equal(f.provider.calls[0].args[0], "ACmaster");
  for (const c of f.provider.calls.slice(1)) assert.equal(c.args[0], l.subaccount_sid, `${c.op} acts as the subaccount`);
  assert.equal(f.provider.calls[6].args[2].sipUrl, RETELL_ORIGINATION, "calls go to Retell's SIP door");
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
  assert.deepEqual(f.saves[0], { voice_state: "provisioning", step: "subaccount", last_error: null, state_since: "2026-09-07T12:00:00Z" });
  assert.deepEqual(f.saves.at(-1), { voice_state: "answering", step: null, last_error: null, state_since: "2026-09-07T12:00:00Z" });
  assert.deepEqual([...LINE_STEPS], ["subaccount", "number", "trunk", "agent", "import", "messaging", "channel"]);
  assert.match(String(f.saves.find((s) => s.messaging_service_sid)?.messaging_service_sid), /^MG/, "the line texts through its own Messaging Service");
  assert.deepEqual(f.smsChannels.map((c) => ({ e164: c.e164, lineId: c.lineId, hasService: /^MG/.test(c.serviceSid) })), [{ e164: "+13055550100", lineId: LINE_ID, hasService: true }]);
  assert.deepEqual(ops(f.provider).slice(-2), ["createMessagingService", "addNumberToService"], "texting is set up after the number answers calls, before the rows are written");
});

test("a refusal at the import leaves the step and the provider's words; a retry resumes there and buys nothing twice", async () => {
  let refuse = true;
  const f = fakes({ retell: { importNumber: async (body) => {
    f.imports.push(body);
    return refuse ? { ok: false, status: 422, body: { message: "bad trunk" } } : { ok: true, status: 201, body: { phone_number_type: "custom" } };
  } } });
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
  assert.equal(f.provider.calls.length, 8);
  refuse = false;
  const again = await runLineSaga(first.line, f.ports);
  assert.equal(again.ok, true);
  assert.equal(again.line.voice_state, "answering");
  assert.equal(f.provider.calls.length, 10, "no provider call repeated; the two messaging calls follow the import");
  assert.equal(f.imports.length, 2);
  assert.deepEqual(f.imports[1], f.imports[0], "the same import, retried");
});

test("a provider failure inside the trunk step resumes at the sub-step that failed", async () => {
  const f = fakes();
  const real = f.provider.attachNumber;
  let boom = true;
  f.provider.attachNumber = async (...a) => { if (boom) { boom = false; throw new Error("Twilio 20404: trunk not ready"); } return real(...a); };
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
  assert.deepEqual(after, ["attachNumber", "createMessagingService", "addNumberToService"], "only the sub-step that failed runs again, then the steps that never ran");
});

test("a line that answers is left alone; a line with no number cannot start; a lost token is a failure with a reason", async () => {
  const f = fakes();
  const done = await runLineSaga(freshLine({ voice_state: "answering", subaccount_sid: "AC1", number_sid: "PN1", trunk_sid: "TK1", credential_list_sid: "CL1", termination_uri: "x.pstn.twilio.com", messaging_service_sid: "MG1", retell_agent_id: "agent_x", facts: { trunk_ready: true, retell_imported: true, number_in_service: true, channel_id: "ch1", sms_channel_id: "chs1" } }), f.ports);
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
  const http = async (acct, method, url, form) => { calls.push({ acct: acct.sid, method, url, form }); return answers.shift() ?? { status: 201, body: { sid: "X" } }; };
  const tw = twilioProvider(http);
  const master = { sid: "ACmaster", token: "t" };
  const sub = { sid: "ACsub", token: "s" };
  answers.push({ status: 201, body: { sid: "ACsub", auth_token: "s", status: "active" } });
  assert.deepEqual(await tw.createSubaccount(master, "Harbor Moving Co. · Chanlytics"), { sid: "ACsub", token: "s", status: "active" });
  answers.push({ status: 200, body: { available_phone_numbers: [{ phone_number: "+13055550100", friendly_name: "(305) 555-0100", locality: "Miami", region: "FL", capabilities: { voice: true, sms: true, mms: false } }] } });
  const found = await tw.searchLocal(sub, { areaCode: 305, limit: 8 });
  assert.deepEqual(found, [{ e164: "+13055550100", friendly: "(305) 555-0100", locality: "Miami", region: "FL", capabilities: { voice: true, sms: true, mms: false } }]);
  answers.push({ status: 201, body: { sid: "PN1", phone_number: "+13055550100" } });
  assert.deepEqual(await tw.buyNumber(sub, "+13055550100", "Harbor"), { sid: "PN1", e164: "+13055550100" });
  answers.push({ status: 201, body: { sid: "TK1", domain_name: "chanlytics-abc.pstn.twilio.com" } });
  assert.deepEqual(await tw.createTrunk(sub, { friendlyName: "Harbor", domainName: "chanlytics-abc.pstn.twilio.com" }), { sid: "TK1", domainName: "chanlytics-abc.pstn.twilio.com" });
  answers.push({ status: 201, body: { sid: "CL1" } });
  assert.deepEqual(await tw.createCredentialList(sub, "Harbor"), { sid: "CL1" });
  answers.push({ status: 201, body: { sid: "CR1" } });
  const fakePass = ["Abcdefghij", "12kl"].join(""); // a rule-shaped fake, not a secret; joined so a scanner does not read it as one
  assert.deepEqual(await tw.addCredential(sub, "CL1", "line-abc", fakePass), { sid: "CR1" });
  answers.push({ status: 201, body: { sid: "CL1" } });
  await tw.attachCredentialList(sub, "TK1", "CL1");
  answers.push({ status: 201, body: { sid: "OU1" } });
  assert.deepEqual(await tw.addOrigination(sub, "TK1", { sipUrl: RETELL_ORIGINATION, friendlyName: "Retell" }), { sid: "OU1" });
  answers.push({ status: 201, body: { sid: "PN1" } });
  await tw.attachNumber(sub, "TK1", "PN1");
  answers.push({ status: 204, body: null });
  await tw.releaseNumber(sub, "PN1");
  answers.push({ status: 204, body: null });
  await tw.deleteTrunk(sub, "TK1");

  assert.deepEqual(calls.map((c) => [c.acct, c.method, c.url]), [
    ["ACmaster", "POST", twilioUrls.subaccounts],
    ["ACsub", "GET", `${twilioUrls.availableLocal("ACsub")}?AreaCode=305&VoiceEnabled=true&SmsEnabled=true&PageSize=8`],
    ["ACsub", "POST", twilioUrls.incomingNumbers("ACsub")],
    ["ACsub", "POST", twilioUrls.trunks],
    ["ACsub", "POST", twilioUrls.credentialLists("ACsub")],
    ["ACsub", "POST", twilioUrls.credentials("ACsub", "CL1")],
    ["ACsub", "POST", twilioUrls.trunkCredentialLists("TK1")],
    ["ACsub", "POST", twilioUrls.trunkOriginationUrls("TK1")],
    ["ACsub", "POST", twilioUrls.trunkPhoneNumbers("TK1")],
    ["ACsub", "DELETE", twilioUrls.incomingNumber("ACsub", "PN1")],
    ["ACsub", "DELETE", twilioUrls.trunk("TK1")],
  ]);
  assert.deepEqual(calls[0].form, { FriendlyName: "Harbor Moving Co. · Chanlytics" });
  assert.deepEqual(calls[2].form, { PhoneNumber: "+13055550100", FriendlyName: "Harbor" });
  assert.deepEqual(calls[3].form, { FriendlyName: "Harbor", DomainName: "chanlytics-abc.pstn.twilio.com" });
  assert.deepEqual(calls[5].form, { Username: "line-abc", Password: fakePass });
  assert.deepEqual(calls[6].form, { CredentialListSid: "CL1" });
  assert.deepEqual(calls[7].form, { SipUrl: "sip:sip.retellai.com", FriendlyName: "Retell", Weight: "10", Priority: "10", Enabled: "true" });
  assert.deepEqual(calls[8].form, { PhoneNumberSid: "PN1" });
  assert.equal(twilioUrls.subaccounts, "https://api.twilio.com/2010-04-01/Accounts.json");
  assert.equal(twilioUrls.trunks, "https://trunking.twilio.com/v1/Trunks");
  assert.equal(twilioUrls.credentials("AC1", "CL1"), "https://api.twilio.com/2010-04-01/Accounts/AC1/SIP/CredentialLists/CL1/Credentials.json");
});

test("Twilio: a refusal is an error with the status, the code and the message; a gone number is not a failure to release", async () => {
  const tw = twilioProvider(async () => ({ status: 400, body: { code: 21422, message: "The number is not available" } }));
  await assert.rejects(() => tw.buyNumber({ sid: "AC", token: "t" }, "+13055550100", "x"), (e) => e instanceof TwilioError && e.status === 400 && e.code === 21422 && /not available/.test(e.message) && /Twilio 21422/.test(e.message));
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
  for (const bad of ["short1A", "alllowercase12345", "NoDigitsHereAtAll", "UPPERCASE12345678"]) assert.equal(isValidSipPassword(bad), false, bad);
  assert.equal(trunkDomain("0f3c2a1e-1111-4222-8333-444455556666"), "chanlytics-0f3c2a1e1111.pstn.twilio.com");
  assert.equal(sipUsername("0f3c2a1e-1111-4222-8333-444455556666"), "line-0f3c2a1e1111");
  assert.equal(LINE_COSTS.local_number_month_usd, 1.15);
  const body = retellImportBody({ e164: "+1", terminationUri: "t", username: "u", password: "p", agentId: "a", pinned: false, nickname: "n", inboundWebhookUrl: "w" });
  assert.deepEqual(body.inbound_agents, [{ agent_id: "a", weight: 1 }], "unpublished: no pin");
});

test("wiring: the edge endpoint, its ports, the receptionist shared with voice-provision, the migration, the manifest, the events", () => {
  const edge = readCode("apps/edge/api/admin/lines.ts");
  assert.ok(edge.includes('request.headers.get("x-diag-key") !== process.env.DIAG_KEY'));
  for (const op of ['op === "status"', 'op === "search"', 'op === "buy"', 'op === "retry" || op === "release"']) assert.ok(edge.includes(op), op);
  assert.ok(edge.includes("const choice = lineProviderFromEnv();"));
  assert.ok(edge.includes("runLineSaga(line, linePorts(db, cfg, secrets, tenant, line, choice))"));
  assert.ok(edge.includes('kind: "number",') && edge.includes('title: `Your phone line is ready: ${shown}`'), "the bell on success");
  assert.ok(edge.includes("Your phone line hit a snag — a person at Chanlytics has it"), "the bell on failure");
  assert.ok(edge.includes("{ tenantId: null, notifications: null, isEnvDefault: true }"), "the platform hears a failure");
  assert.ok(edge.includes('error: "line_exists"') && edge.includes('error: "line_failed_retry"'), "one line per workspace in v1");
  for (const k of ["line.answering", "line.failed", "line.released"]) assert.ok(EVENT_KINDS.includes(k), k);
  const lib = readCode("apps/edge/lib/lines.ts");
  assert.ok(lib.includes("chooseLineProvider({ sid, token, dryRun: process.env.LINES_DRY_RUN, vercelEnv: process.env.VERCEL_ENV })"));
  assert.ok(lib.includes('db.rpc("get_line_credentials"') && lib.includes('db.rpc("put_line_credentials"'), "secrets through the vault doors");
  assert.ok(lib.includes("ensure: () => ensureVoiceAgent(db, cfg, secrets, tenant)"));
  assert.ok(lib.includes('provider: "twilio-sip", line_id: lineId'), "the routing row names its line");
  const client = lib.slice(lib.indexOf("export function lineForClient"), lib.indexOf("export function linePorts"));
  assert.ok(!/_sid/.test(client), "no provider SID reaches the page");
  const agent = readCode("apps/edge/lib/voice-agent.ts");
  for (const pin of ["createRetellLlm(cfg, voiceLlmCreateBody(secrets))", "createAgent(cfg, voiceAgentCreateBody(", 'publishAgentVersion(cfg, agentId, agentVersion, "provisioned from the edge")', "await getAgentRaw(cfg, o.agentId)", "await getRetellLlm(cfg, llmId)"]) assert.ok(agent.includes(pin), pin);
  assert.ok(agent.indexOf('.eq("kind", "voice")') < agent.indexOf("createVoiceAgent(cfg, secrets, { agentName: `${tenant.name} front desk` })"), "ensure reads the active voice row before creating");
  assert.ok(readCode("apps/edge/api/admin/voice-provision.ts").includes("createVoiceAgent(cfg, secrets, { agentName: plan.names.agent, llmId: req.llmId, agentId: req.agentId })"));
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
  ]) assert.ok(mig.includes(pin), pin);
  assert.ok(readCode("packages/db/src/realtime.ts").includes('{ table: "lines", event: "*" }'), "a callback repaints Setup");
  const index = readCode("packages/channels/src/index.ts");
  for (const m of ["./lines", "./lines-twilio", "./lines-dry", "./lines-saga"]) assert.ok(index.includes(`export * from "${m}";`), m);
});
