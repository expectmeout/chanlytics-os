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
  VOICE_SHELL_PROMPT,
  VOICE_SHELL_BEGIN,
  HANDOFF_VAR,
} from "@chanlytics/channels/voice";
import { EVENT_KINDS, RETELL_MODELS } from "@chanlytics/contracts";
import { importSrc, ROOT } from "../_source.mjs";

const S = { fnSecret: "sealed-secret" };
/** Where the voice tools post in these fixtures: the address an edge off production gives them (dashboard-origin.ts). */
const FN_URL = "https://chanlytics-messaging.vercel.app/api/retell-fn";
const tenant = { id: "f7b4aeea-6ea8-4ece-b8d9-3818272d0e86", name: "Northside Movers" };
const fresh = (request) => ({ tenant, channel: null, request });

test("the LLM body is the shell itself, so the converger plans nothing against it", () => {
  const body = voiceLlmCreateBody(S, FN_URL);
  assert.equal(body.general_prompt, VOICE_SHELL_PROMPT);
  assert.equal(body.begin_message, VOICE_SHELL_BEGIN);
  // The model under the provider's model_config: it retires `model` and `model_temperature` on 31 January 2027.
  assert.deepEqual(body.model_config, { type: "cascading", primary: { model: RETELL_MODELS.llm }, temperature: 0 });
  assert.deepEqual(body.model_config, VOICE_LLM_DEFAULTS.model_config);
  assert.ok(!("model" in body) && !("model_temperature" in body), "no retired name is sent");
  assert.equal(body.start_speaker, "agent");
  assert.deepEqual(planVoiceConvergence(body, desiredVoiceShell(FN_URL, { "x-fn-secret": S.fnSecret })).drift, []);
  assert.equal(voiceShellDrift(body, FN_URL).converged, true, "the diagnostic reads it as on the shell");
  const transfer = body.general_tools.find((t) => t.name === "transfer_to_staff");
  assert.equal(transfer.transfer_destination.number, HANDOFF_VAR, "the transfer dials the per-call variable");
  for (const name of ["send_booking_link", "check_availability"]) {
    const t = body.general_tools.find((x) => x.name === name);
    assert.deepEqual(t.headers, { "x-fn-secret": S.fnSecret }, `${name} carries the secret the edge checks`);
  }
  assert.ok(!JSON.stringify(body).includes('"required"'), "an empty required list is the provider's default");
});

test("the agent body carries the product's voice and every setting the pipeline needs; retention is the product's", () => {
  const body = voiceAgentCreateBody(
    { llmId: "llm_abc", llmVersion: 0, agentName: "Northside Movers front desk" },
    S,
    FN_URL,
  );
  assert.deepEqual(body.response_engine, { type: "retell-llm", llm_id: "llm_abc", version: 0 });
  assert.equal(body.voice_id, VOICE_AGENT_DEFAULTS.voice_id);
  assert.equal(body.language.length, 10, "multilingual, like the live line");
  assert.equal(
    body.webhook_url,
    "https://chanlytics-messaging.vercel.app/api/retell-webhook",
    "the call webhook carries no key: the signature is its credential",
  );
  assert.deepEqual(body.webhook_events, ["call_started", "call_ended", "call_analyzed", "transcript_updated"]);
  assert.equal(body.webhook_timeout_ms, 20000);
  assert.equal(body.opt_in_signed_url, true);
  assert.equal(body.data_storage_retention_days, 7, "a week at the provider (CALL_LIMITS, decision 0092)");
  assert.equal(body.end_call_after_silence_ms, 30000);
  assert.equal(body.max_call_duration_ms, 20 * 60_000, "twenty minutes a call");
  assert.deepEqual(
    body.post_call_analysis_data.map((f) => f.name),
    ["caller_wanted", "outcome", "follow_up", "caller_name", "caller_email", "topic", "language"],
  );
  assert.deepEqual(planAgentSettings(body).drift, [], "the agent converger plans nothing");
  assert.equal(agentSettingsDrift(body).converged, true);
  const noVersion = voiceAgentCreateBody({ llmId: "llm_abc", llmVersion: null, agentName: "x" }, S, FN_URL);
  assert.deepEqual(
    noVersion.response_engine,
    { type: "retell-llm", llm_id: "llm_abc" },
    "an unknown LLM version is left to the provider",
  );
});

test("the number is bound to the agent, pinned to latest_published, with the inbound webhook that fills the facts", () => {
  const buy = voiceNumberCreateBody(
    { areaCode: 305, agentId: "agent_1", pinned: true, nickname: "Northside Movers · Chanlytics" },
    S,
    FN_URL,
  );
  assert.equal(buy.area_code, 305);
  assert.equal(buy.country_code, "US");
  assert.equal(buy.number_provider, "twilio");
  assert.deepEqual(buy.inbound_agents, [{ agent_id: "agent_1", agent_version: "latest_published", weight: 1 }]);
  assert.equal(buy.inbound_webhook_url, `https://chanlytics-messaging.vercel.app/api/retell-inbound?key=${S.fnSecret}`);
  assert.ok(!("toll_free" in buy), "local by default");
  const bind = voiceNumberBindBody({ agentId: "agent_1", pinned: false, nickname: "n" }, S, FN_URL);
  assert.deepEqual(
    bind.inbound_agents,
    [{ agent_id: "agent_1", weight: 1 }],
    "unpublished: the number follows the latest version, and says so elsewhere",
  );
  assert.equal(bind.inbound_webhook_url, buy.inbound_webhook_url);
  assert.ok(!("area_code" in bind));
});

test("the endpoints derive from the one base the shell pins; the key rides the query and is stripped for any reader", () => {
  const e = voiceEndpoints(FN_URL);
  assert.deepEqual(e, {
    fn: "https://chanlytics-messaging.vercel.app/api/retell-fn",
    availability: "https://chanlytics-messaging.vercel.app/api/retell-availability",
    webhook: "https://chanlytics-messaging.vercel.app/api/retell-webhook",
    inbound: "https://chanlytics-messaging.vercel.app/api/retell-inbound",
  });
  assert.equal(
    voiceEndpoints("https://preview.example/api/retell-fn").inbound,
    "https://preview.example/api/retell-inbound",
  );
  assert.equal(withKey("https://x/api/retell-webhook", "a b&c"), "https://x/api/retell-webhook?key=a%20b%26c");
  assert.equal(stripKey("https://x/api/retell-webhook?key=secret"), "https://x/api/retell-webhook");
  assert.equal(stripKey(null), null);
});

test("the plan for a fresh workspace: LLM, agent, publish, then the number, the row and the bell — in that order", () => {
  const buy = planVoiceProvision(fresh({ areaCode: 305 }));
  assert.equal(buy.ok, true);
  assert.equal(buy.nothing, false);
  assert.deepEqual(
    buy.steps.map((s) => `${s.id}:${s.action}`),
    ["llm:create", "agent:create", "publish:publish", "number:buy", "channel:insert", "notify:notify"],
  );
  assert.deepEqual(buy.names, { agent: "Northside Movers front desk", nickname: "Northside Movers · Chanlytics" });
  assert.match(buy.steps[3].detail, /area code 305/);
  const bind = planVoiceProvision(fresh({ number: "+13055550100" }));
  assert.deepEqual(
    bind.steps.map((s) => `${s.id}:${s.action}`),
    ["llm:create", "agent:create", "publish:publish", "number:bind", "channel:insert", "notify:notify"],
  );
  const none = planVoiceProvision(fresh({}));
  assert.deepEqual(
    none.steps.map((s) => `${s.id}:${s.action}`),
    ["llm:create", "agent:create", "publish:publish", "number:skip"],
    "no number: nothing is written — a row that exists is a line that works",
  );
  assert.match(none.steps[3].detail, /number .* or area_code/);
});

test("resume: an LLM or an agent from a failed run is read back and reused, never made twice", () => {
  const llm = planVoiceProvision(fresh({ llmId: "llm_abc123", areaCode: 305 }));
  assert.deepEqual(
    llm.steps.slice(0, 2).map((s) => `${s.id}:${s.action}`),
    ["llm:reuse", "agent:create"],
  );
  assert.match(llm.steps[0].detail, /read from the provider first/);
  const agent = planVoiceProvision(fresh({ agentId: "agent_abc123", number: "+13055550100" }));
  assert.deepEqual(
    agent.steps.map((s) => `${s.id}:${s.action}`),
    ["llm:skip", "agent:adopt", "publish:publish", "number:bind", "channel:insert", "notify:notify"],
  );
});

test("idempotent: a workspace with a voice row plans nothing, and says why", () => {
  const on = planVoiceProvision({
    tenant,
    channel: { id: "c1", status: "active", agentId: "agent_live", number: "+13055550123" },
    request: { areaCode: 305 },
  });
  assert.equal(on.nothing, true);
  assert.deepEqual(on.steps, []);
  assert.match(on.reason, /already answering on \+13055550123/);
  assert.match(on.reason, /voice-converge/);
  const off = planVoiceProvision({
    tenant,
    channel: { id: "c1", status: "disabled", agentId: "agent_live", number: null },
    request: {},
  });
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
  assert.deepEqual(planVoiceProvision(fresh({ areaCode: 305, number: "+13055550100" })).errors, [
    "give a number to bind or an area code to buy in, not both",
  ]);
  assert.deepEqual(planVoiceProvision(fresh({ llmId: "nope" })).errors, ["llm_id does not look like a Retell LLM id"]);
  assert.deepEqual(planVoiceProvision(fresh({ agentId: "nope" })).errors, [
    "agent_id does not look like a Retell agent id",
  ]);
});

test("the receptionist is made once, in the lib both line paths share: the shell, the agent over it, the first version published, a resumed id read from the provider first; the endpoint has more than the default budget", async () => {
  // The endpoint itself -- the knock, the dry run before any provider write,
  // the bodies on the wire, the row after the number, the bell and the event,
  // secrets never echoed, the read-back planning nothing -- is run in
  // voice-doors.test.mjs.
  // Run with the provider at the network (pinned as voice-agent.ts's text until 26 Nov 2026).
  const { createVoiceAgent } = await importSrc("apps/edge/lib/lines/voice-agent.ts");
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    calls.push(`${init?.method ?? "GET"} ${u.pathname}`);
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.pathname === "/create-retell-llm") return reply({ llm_id: "llm_new", version: 0 }, 201);
    if (u.pathname === "/create-agent")
      return reply(
        {
          agent_id: "agent_new",
          version: 0,
          is_published: false,
          webhook_url: "https://edge/api/retell-webhook?key=SECRET",
        },
        201,
      );
    if (u.pathname.startsWith("/publish-agent-version/")) return reply({});
    if (u.pathname === "/get-agent/agent_left")
      return reply({
        agent_id: "agent_left",
        version: 4,
        is_published: true,
        response_engine: { type: "retell-llm", llm_id: "llm_left", version: 2 },
      });
    if (u.pathname === "/get-retell-llm/llm_left") return reply({ llm_id: "llm_left", version: 2 });
    return reply({ error: "not found" }, 404);
  };
  try {
    const made = await createVoiceAgent({ apiKey: "k" }, { fnSecret: "s" }, { agentName: "Harbor Moving front desk" });
    assert.equal(made.ok, true);
    assert.deepEqual(
      calls,
      ["POST /create-retell-llm", "POST /create-agent", "POST /publish-agent-version/agent_new"],
      "the shell, the agent over it, its first version published",
    );
    assert.deepEqual([made.agent.agentId, made.agent.llmId, made.agent.published], ["agent_new", "llm_new", true]);
    assert.ok(!JSON.stringify(made).includes("key=SECRET"), "a success never echoes the webhook URL with its key");

    calls.length = 0;
    const adopted = await createVoiceAgent(
      { apiKey: "k" },
      { fnSecret: "s" },
      { agentName: "x", agentId: "agent_left" },
    );
    assert.deepEqual(
      calls,
      ["GET /get-agent/agent_left"],
      "a resumed id is read from the provider first, and nothing is made",
    );
    assert.deepEqual(
      [adopted.agent.agentId, adopted.agent.llmId, adopted.agent.llmVersion],
      ["agent_left", "llm_left", 2],
    );

    calls.length = 0;
    const reused = await createVoiceAgent({ apiKey: "k" }, { fnSecret: "s" }, { agentName: "x", llmId: "llm_left" });
    assert.deepEqual(
      calls.slice(0, 2),
      ["GET /get-retell-llm/llm_left", "POST /create-agent"],
      "a kept shell read, then the agent over it",
    );
    assert.equal(reused.agent?.llmId, "llm_left", "and the agent is made over that shell, not a new one");

    calls.length = 0;
    const gone = await createVoiceAgent({ apiKey: "k" }, { fnSecret: "s" }, { agentName: "x", agentId: "agent_gone" });
    assert.deepEqual(
      [gone.ok, gone.step, gone.status],
      [false, "agent", 404],
      "an id the key cannot read is not trusted",
    );
  } finally {
    globalThis.fetch = real;
  }
  assert.ok(EVENT_KINDS.includes("voice.provisioned"));
  // Several provider calls need more than the default budget: every door's limit is in apps/edge/vercel.json, sized to
  // its slowest path (repo/ops-hygiene.test.mjs).
});

test("the laptop script is retired: the key lives on the edge and nowhere else", async () => {
  assert.ok(
    !fs.existsSync(path.join(ROOT, "tooling/scripts/setup_voice.py")),
    "the Python provisioning script is gone",
  );
  // The provider's calls are the adapter's, each on its own path (pinned as calls.ts's and agents.ts's text until 26 Nov
  // 2026): run here with the provider at the network.
  const voice = await import("@chanlytics/channels/voice");
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const cfg = { apiKey: "k" };
    await voice.createRetellLlm(cfg, {});
    await voice.createAgent(cfg, {});
    await voice.createPhoneNumber(cfg, { area_code: 305 });
    await voice.updatePhoneNumber(cfg, "+13055550100", { nickname: "x" });
    await voice.getPhoneNumber(cfg, "+13055550100");
  } finally {
    globalThis.fetch = real;
  }
  assert.deepEqual(asked, [
    "POST /create-retell-llm",
    "POST /create-agent",
    "POST /create-phone-number",
    "PATCH /update-phone-number/%2B13055550100",
    "GET /get-phone-number/%2B13055550100",
  ]);
  // The package hands the edge every value the provisioning module exports: its barrel names each one.

  const channels = await import("@chanlytics/channels/voice");
  const provision = await import(new URL("../../packages/channels/src/voice/provision.ts", import.meta.url).href);
  for (const name of Object.keys(provision)) assert.ok(name in channels, `voice-provision.ts: ${name}`);
  // The diagnostic saying which model each line runs is run in diag-door.test.mjs.
});
