/**
 * Provisioning a workspace's phone receptionist is the first converge: the
 * bodies the edge sends ARE the shell and the agent settings the convergers
 * keep, so a freshly provisioned line plans nothing on either. The plan is
 * pure — a dry run prints exactly what an apply does — and the row that
 * routes calls is written last, once a number answers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  planVoiceProvision,
  voiceLlmCreateBody,
  voiceAgentCreateBody,
  voiceNumberCreateBody,
  voiceNumberBindBody,
  voiceEndpoints,
  withKey,
  stripKey,
  VOICE_AGENT_DEFAULTS,
  VOICE_LLM_DEFAULTS,
  desiredVoiceShell,
  planVoiceConvergence,
  planAgentSettings,
  voiceShellDrift,
  agentSettingsDrift,
  DEFAULT_FN_URL,
  VOICE_SHELL_PROMPT,
  VOICE_SHELL_BEGIN,
  HANDOFF_VAR,
} from "@chanlytics/channels";
import { EVENT_KINDS } from "@chanlytics/contracts";
import { readCode, readRaw, ROOT } from "./_source.mjs";

const S = { fnSecret: "sealed-secret" };
const tenant = { id: "f7b4aeea-6ea8-4ece-b8d9-3818272d0e86", name: "Northside Movers" };
const fresh = (request) => ({ tenant, channel: null, request });

test("the LLM body is the shell itself, so the converger plans nothing against it", () => {
  const body = voiceLlmCreateBody(S);
  assert.equal(body.general_prompt, VOICE_SHELL_PROMPT);
  assert.equal(body.begin_message, VOICE_SHELL_BEGIN);
  assert.equal(body.model, VOICE_LLM_DEFAULTS.model);
  assert.equal(body.model_temperature, 0);
  assert.equal(body.start_speaker, "agent");
  assert.deepEqual(planVoiceConvergence(body, desiredVoiceShell(DEFAULT_FN_URL, { "x-fn-secret": S.fnSecret })).drift, []);
  assert.equal(voiceShellDrift(body).converged, true, "the diagnostic reads it as on the shell");
  const transfer = body.general_tools.find((t) => t.name === "transfer_to_staff");
  assert.equal(transfer.transfer_destination.number, HANDOFF_VAR, "the transfer dials the per-call variable");
  for (const name of ["send_booking_link", "check_availability"]) {
    const t = body.general_tools.find((x) => x.name === name);
    assert.deepEqual(t.headers, { "x-fn-secret": S.fnSecret }, `${name} carries the secret the edge checks`);
  }
  assert.ok(!JSON.stringify(body).includes('"required"'), "an empty required list is the provider's default");
});

test("the agent body carries the product's voice and every setting the pipeline needs; retention is the product's", () => {
  const body = voiceAgentCreateBody({ llmId: "llm_abc", llmVersion: 0, agentName: "Northside Movers front desk" }, S);
  assert.deepEqual(body.response_engine, { type: "retell-llm", llm_id: "llm_abc", version: 0 });
  assert.equal(body.voice_id, VOICE_AGENT_DEFAULTS.voice_id);
  assert.equal(body.language.length, 10, "multilingual, like the live line");
  assert.equal(body.webhook_url, `https://chanlytics-messaging.vercel.app/api/retell-webhook?key=${S.fnSecret}`);
  assert.deepEqual(body.webhook_events, ["call_started", "call_ended", "call_analyzed", "transcript_updated"]);
  assert.equal(body.webhook_timeout_ms, 20000);
  assert.equal(body.opt_in_signed_url, true);
  assert.equal(body.data_storage_retention_days, 90);
  assert.equal(body.end_call_after_silence_ms, 30000);
  assert.deepEqual(body.post_call_analysis_data.map((f) => f.name), ["caller_wanted", "outcome", "follow_up", "caller_name"]);
  assert.deepEqual(planAgentSettings(body, { retentionDays: 90 }).drift, [], "the agent converger plans nothing");
  assert.equal(agentSettingsDrift(body).converged, true);
  const noVersion = voiceAgentCreateBody({ llmId: "llm_abc", llmVersion: null, agentName: "x" }, S);
  assert.deepEqual(noVersion.response_engine, { type: "retell-llm", llm_id: "llm_abc" }, "an unknown LLM version is left to the provider");
});

test("the number is bound to the agent, pinned to latest_published, with the inbound webhook that fills the facts", () => {
  const buy = voiceNumberCreateBody({ areaCode: 305, agentId: "agent_1", pinned: true, nickname: "Northside Movers · Chanlytics" }, S);
  assert.equal(buy.area_code, 305);
  assert.equal(buy.country_code, "US");
  assert.equal(buy.number_provider, "twilio");
  assert.deepEqual(buy.inbound_agents, [{ agent_id: "agent_1", agent_version: "latest_published", weight: 1 }]);
  assert.equal(buy.inbound_webhook_url, `https://chanlytics-messaging.vercel.app/api/retell-inbound?key=${S.fnSecret}`);
  assert.ok(!("toll_free" in buy), "local by default");
  const bind = voiceNumberBindBody({ agentId: "agent_1", pinned: false, nickname: "n" }, S);
  assert.deepEqual(bind.inbound_agents, [{ agent_id: "agent_1", weight: 1 }], "unpublished: the number follows the latest version, and says so elsewhere");
  assert.equal(bind.inbound_webhook_url, buy.inbound_webhook_url);
  assert.ok(!("area_code" in bind));
});

test("the endpoints derive from the one base the shell pins; the key rides the query and is stripped for any reader", () => {
  const e = voiceEndpoints();
  assert.deepEqual(e, {
    fn: "https://chanlytics-messaging.vercel.app/api/retell-fn",
    availability: "https://chanlytics-messaging.vercel.app/api/retell-availability",
    webhook: "https://chanlytics-messaging.vercel.app/api/retell-webhook",
    inbound: "https://chanlytics-messaging.vercel.app/api/retell-inbound",
  });
  assert.equal(voiceEndpoints("https://preview.example/api/retell-fn").inbound, "https://preview.example/api/retell-inbound");
  assert.equal(withKey("https://x/api/retell-webhook", "a b&c"), "https://x/api/retell-webhook?key=a%20b%26c");
  assert.equal(stripKey("https://x/api/retell-webhook?key=secret"), "https://x/api/retell-webhook");
  assert.equal(stripKey(null), null);
});

test("the plan for a fresh workspace: LLM, agent, publish, then the number, the row and the bell — in that order", () => {
  const buy = planVoiceProvision(fresh({ areaCode: 305 }));
  assert.equal(buy.ok, true);
  assert.equal(buy.nothing, false);
  assert.deepEqual(buy.steps.map((s) => `${s.id}:${s.action}`), ["llm:create", "agent:create", "publish:publish", "number:buy", "channel:insert", "notify:notify"]);
  assert.deepEqual(buy.names, { agent: "Northside Movers front desk", nickname: "Northside Movers · Chanlytics" });
  assert.match(buy.steps[3].detail, /area code 305/);
  const bind = planVoiceProvision(fresh({ number: "+13055550100" }));
  assert.deepEqual(bind.steps.map((s) => `${s.id}:${s.action}`), ["llm:create", "agent:create", "publish:publish", "number:bind", "channel:insert", "notify:notify"]);
  const none = planVoiceProvision(fresh({}));
  assert.deepEqual(none.steps.map((s) => `${s.id}:${s.action}`), ["llm:create", "agent:create", "publish:publish", "number:skip"], "no number: nothing is written — a row that exists is a line that works");
  assert.match(none.steps[3].detail, /number .* or area_code/);
});

test("resume: an LLM or an agent from a failed run is read back and reused, never made twice", () => {
  const llm = planVoiceProvision(fresh({ llmId: "llm_abc123", areaCode: 305 }));
  assert.deepEqual(llm.steps.slice(0, 2).map((s) => `${s.id}:${s.action}`), ["llm:reuse", "agent:create"]);
  assert.match(llm.steps[0].detail, /read from the provider first/);
  const agent = planVoiceProvision(fresh({ agentId: "agent_abc123", number: "+13055550100" }));
  assert.deepEqual(agent.steps.map((s) => `${s.id}:${s.action}`), ["llm:skip", "agent:adopt", "publish:publish", "number:bind", "channel:insert", "notify:notify"]);
});

test("idempotent: a workspace with a voice row plans nothing, and says why", () => {
  const on = planVoiceProvision({ tenant, channel: { id: "c1", status: "active", agentId: "agent_live", number: "+13083368109" }, request: { areaCode: 305 } });
  assert.equal(on.nothing, true);
  assert.deepEqual(on.steps, []);
  assert.match(on.reason, /already answering on \+13083368109/);
  assert.match(on.reason, /voice-converge/);
  const off = planVoiceProvision({ tenant, channel: { id: "c1", status: "disabled", agentId: "agent_live", number: null }, request: {} });
  assert.equal(off.nothing, true);
  assert.match(off.reason, /disabled/);
  assert.match(off.reason, /Connections/, "the pane an owner is sent to, by the name the tab now has");
});

test("the request is checked before anything is planned", () => {
  const bad = planVoiceProvision(fresh({ number: "3055550100" }));
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.errors, ["number must be E.164, like +13055550100"]);
  assert.deepEqual(bad.steps, []);
  assert.deepEqual(planVoiceProvision(fresh({ areaCode: 12 })).errors, ["area_code must be three digits, like 305"]);
  assert.deepEqual(planVoiceProvision(fresh({ areaCode: 305, number: "+13055550100" })).errors, ["give a number to bind or an area code to buy in, not both"]);
  assert.deepEqual(planVoiceProvision(fresh({ llmId: "nope" })).errors, ["llm_id does not look like a Retell LLM id"]);
  assert.deepEqual(planVoiceProvision(fresh({ agentId: "nope" })).errors, ["agent_id does not look like a Retell agent id"]);
});

test("the edge endpoint: key-gated, dry run by default, secrets never echoed, budgeted, row last, then the bell and the event", () => {
  const src = readCode("apps/edge/api/admin/voice-provision.ts");
  const agent = readCode("apps/edge/lib/voice-agent.ts");
  assert.ok(src.includes('request.headers.get("x-diag-key") !== process.env.DIAG_KEY'));
  assert.ok(src.includes("const apply = body.apply === true;"));
  assert.ok(src.indexOf("if (!apply || plan.nothing) return json(200, out);") < src.indexOf("createVoiceAgent(cfg,"), "the dry run answers before any provider write");
  // The receptionist is made once, in the lib both line paths share.
  assert.ok(src.includes("createVoiceAgent(cfg, secrets, { agentName: plan.names.agent, llmId: req.llmId, agentId: req.agentId })"));
  for (const pin of ["createRetellLlm(cfg, voiceLlmCreateBody(secrets))", "createAgent(cfg, voiceAgentCreateBody(", 'publishAgentVersion(cfg, agentId, agentVersion, "provisioned from the edge")']) {
    assert.ok(agent.includes(pin), pin);
  }
  for (const pin of ["updatePhoneNumber(cfg, number, voiceNumberBindBody(", "createPhoneNumber(cfg, voiceNumberCreateBody("]) assert.ok(src.includes(pin), pin);
  // Resume reads the provider before trusting an id.
  assert.ok(agent.includes("await getAgentRaw(cfg, o.agentId)") && agent.includes("await getRetellLlm(cfg, llmId)"));
  // The row is written after the number, active, with the agent as the routing key.
  const row = src.indexOf('.insert({\n      tenant_id: tenantId,\n      kind: "voice",\n      external_id: agentId,');
  assert.ok(row > src.indexOf("createPhoneNumber(cfg,"), "the row comes after the number");
  assert.ok(src.includes('status: "active",'));
  // Then the workspace's bell and the platform's event.
  assert.ok(src.includes('kind: "number",') && src.includes('route: "admin/setup",'));
  assert.ok(src.includes('emitEvent(db, tenantId, "voice.provisioned", "setup", "tenant_channel", ins.data.id, {'));
  assert.ok(EVENT_KINDS.includes("voice.provisioned"));
  // What comes back never carries a key: URLs from voiceEndpoints (no query), never a provider success body.
  assert.ok(src.includes("webhook_url: ends.webhook,") && src.includes("inbound_webhook_url: ends.inbound,"));
  assert.ok(!src.includes("result.agent = { ...w.body") && !agent.includes("...w.body"), "a success body echoes the webhook URL with its key");
  assert.ok(readRaw("apps/edge/vercel.json").includes('"api/admin/voice-provision.ts"'), "several provider calls need more than the default budget");
  // Read back: a freshly provisioned line plans nothing on either converger.
  assert.ok(src.includes("planAgentSettings(after as unknown as LiveAgentSettings, { retentionDays: VOICE_AGENT_DEFAULTS.data_storage_retention_days }).drift"));
  assert.ok(src.includes("voiceShellDrift(llmAfter).drift"));
  assert.ok(!/key_[0-9a-f]{16}/.test(src) && !/key_[0-9a-f]{16}/.test(agent), "no literal provider key");
});

test("the laptop script is retired: the key lives on the edge and nowhere else", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "tooling/scripts/setup_voice.py")), "the Python provisioning script is gone");
  const adapter = readCode("packages/channels/src/voice-retell.ts");
  for (const fn of ["createRetellLlm", "createAgent", "createPhoneNumber", "updatePhoneNumber", "getPhoneNumber"]) {
    assert.ok(adapter.includes(`export function ${fn}(`) || adapter.includes(`export async function ${fn}(`), `${fn} is the adapter's`);
  }
  assert.ok(adapter.includes('"/create-phone-number"') && adapter.includes("/update-phone-number/${encodeURIComponent(number)}"));
  assert.ok(readCode("packages/channels/src/index.ts").includes('export * from "./voice-provision";'));
  // The diagnostic says which model each line runs, so provisioning parity is readable.
  assert.ok(readCode("apps/edge/api/diag.ts").includes("model: llm?.model ?? null,"));
});
