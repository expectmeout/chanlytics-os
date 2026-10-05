/**
 * The ElevenLabs agent as code (tooling/scripts/voice/elevenlabs-agent-config.mjs), held to the spec's §3.7 as amended
 * 4 Oct 2026 value by value; the drift check that proves a converge; and the script's dry run, which prints the body
 * with the secret hidden and calls nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ASK_VOICE_ID, ASK_VOICE_MODEL } from "@chanlytics/contracts";
import {
  agentConfig,
  agentDrift,
  shownConfig,
  AGENT_FIRST_MESSAGE,
  DEV_AGENT_NAME,
  INTERRUPTION_IGNORE_TERMS,
  PRODUCTION_AGENT_NAME,
} from "../../voice/elevenlabs-agent-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = path.join(ROOT, "tooling/scripts/voice/elevenlabs-agent.mjs");
const URL = "https://app.example.com/api/ask/voice/llm";

test("agentConfig carries every value of spec §3.7 as amended: the custom LLM named as such with its header and the vendor's ceiling; the agent speaking first, unbroken; patient turns that end a silent call before the agent asks again; room voices detected and the listener's words ignored; Ask's one voice on its one model; no override but the extra body; the vendor's transcript readers off; the privacy and the limits", () => {
  const body = agentConfig({ name: PRODUCTION_AGENT_NAME, url: URL, secret: "s3cret" });
  assert.deepEqual(body, {
    name: "chanlytics-ask",
    conversation_config: {
      agent: {
        first_message: AGENT_FIRST_MESSAGE,
        disable_first_message_interruptions: false,
        language: "en",
        prompt: {
          prompt:
            "You are the mouth of Chanlytics' workspace assistant. Every word you say comes from the model you are wired to; say nothing of your own.",
          llm: "custom-llm",
          custom_llm: { url: URL, api_type: "chat_completions", request_headers: { "x-chanlytics-agent": "s3cret" } },
          cascade_timeout_seconds: 15,
          tools: [],
          knowledge_base: [],
        },
      },
      conversation: {
        max_duration_seconds: 600,
        max_duration_seconds_after_last_agent_message: 60,
        client_events: [
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
          "agent_chat_response_part",
          "agent_response_complete",
          "vad_score",
          "ping",
          "conversation_initiation_metadata",
        ],
        file_input: { enabled: false },
      },
      turn: {
        turn_eagerness: "patient",
        turn_timeout: 30,
        silence_end_call_timeout: -1,
        speculative_turn: false,
        turn_model: "turn_v3",
        interruption_ignore_terms: INTERRUPTION_IGNORE_TERMS,
        merge_with_default_ignore_terms: true,
        soft_timeout_config: { timeout_seconds: -1 },
      },
      tts: {
        voice_id: ASK_VOICE_ID,
        model_id: ASK_VOICE_MODEL,
        text_normalisation_type: "elevenlabs",
        expressive_mode: false,
        enable_phoneme_tags: false,
      },
      asr: { provider: "scribe_realtime" },
      vad: { background_voice_detection: true },
    },
    platform_settings: {
      auth: { enable_auth: true },
      overrides: {
        custom_llm_extra_body: true,
        conversation_config_override: {
          agent: { language: false, first_message: false, prompt: { prompt: false, llm: false } },
          conversation: { text_only: false },
          tts: { voice_id: false, model_id: false },
        },
      },
      privacy: { record_voice: false, retention_days: 7, delete_audio: true },
      call_limits: { agent_concurrency_limit: 4, daily_limit: 200, bursting_enabled: false },
      topic_discovery: { enabled: false },
      sentiment_analysis: { enabled: false },
    },
  });
  assert.equal(AGENT_FIRST_MESSAGE, "", "the session comes up during the hold: the first words are the person's");
  assert.equal(
    body.conversation_config.turn.silence_end_call_timeout,
    -1,
    "the muted session is silent by design: the vendor's silence end would cut it before a follow-up",
  );
  assert.ok(body.conversation_config.conversation.client_events.includes("audio"), "the agent's speech is gated on it");
  assert.equal(
    ASK_VOICE_MODEL,
    "eleven_turbo_v2",
    "an English agent speaks Turbo v2, which this voice is high quality on",
  );
  assert.equal(
    ASK_VOICE_ID,
    "UgBBYS2sOqTuMpoF3BR0",
    "Mark - Natural Conversations, Ruben's pick, contracts' one constant",
  );
  assert.ok(INTERRUPTION_IGNORE_TERMS.includes("okay") && INTERRUPTION_IGNORE_TERMS.includes("sí"));
});

test("the webhook is a workspace object named by id, only when given; the limits are the plan's; a voice handed in stands in for contracts'; the two agents' names", () => {
  const withHook = agentConfig({
    name: DEV_AGENT_NAME,
    url: URL,
    secret: "s",
    webhookId: "wh_1",
    concurrency: 6,
    daily: 500,
    voiceId: "v_test",
  });
  assert.equal(withHook.name, "chanlytics-ask-dev");
  assert.deepEqual(withHook.platform_settings.workspace_overrides, {
    webhooks: { post_call_webhook_id: "wh_1", events: ["transcript"] },
  });
  assert.deepEqual(withHook.platform_settings.call_limits, {
    agent_concurrency_limit: 6,
    daily_limit: 500,
    bursting_enabled: false,
  });
  assert.equal(withHook.conversation_config.tts.voice_id, "v_test");
  const plain = agentConfig({ name: PRODUCTION_AGENT_NAME, url: URL, secret: "s" });
  assert.equal("workspace_overrides" in plain.platform_settings, false, "no webhook until door D is registered");
  assert.equal(PRODUCTION_AGENT_NAME, "chanlytics-ask");
});

test("agentDrift: an agent read back that is the body answers no difference; the vendor's extra fields and a reordered list are not differences; a field changed, dropped or a header gone is", () => {
  const body = agentConfig({ name: PRODUCTION_AGENT_NAME, url: URL, secret: "s3cret" });
  // The vendor returns the body plus its own fields, never the header's value, and its lists in its own order.
  const read = JSON.parse(JSON.stringify(body));
  read.agent_id = "agent_1";
  read.conversation_config.agent.prompt.custom_llm.request_headers = { "x-chanlytics-agent": "<hidden>" };
  read.conversation_config.asr.quality = "high";
  read.conversation_config.conversation.client_events = [
    ...body.conversation_config.conversation.client_events,
  ].reverse();
  read.conversation_config.turn.interruption_ignore_terms = [...INTERRUPTION_IGNORE_TERMS].reverse();
  read.platform_settings.evaluation = { criteria: [] };
  assert.deepEqual(agentDrift(body, read), [], "the body, with the vendor's extras and its own order");
  // Drift: a default the vendor put back, a field it dropped, a term it lost, the header gone.
  const drifted = JSON.parse(JSON.stringify(read));
  drifted.conversation_config.turn.turn_timeout = 7;
  drifted.conversation_config.turn.interruption_ignore_terms = ["okay"];
  delete drifted.platform_settings.topic_discovery;
  drifted.conversation_config.agent.prompt.custom_llm.request_headers = {};
  const drift = agentDrift(body, drifted);
  assert.deepEqual(
    drift.map((d) => d.path).sort(),
    [
      "conversation_config.turn.interruption_ignore_terms",
      "conversation_config.turn.turn_timeout",
      "platform_settings.topic_discovery",
      "…custom_llm.request_headers.x-chanlytics-agent",
    ].sort(),
  );
  assert.deepEqual(
    drift.find((d) => d.path.endsWith("turn_timeout")),
    {
      path: "conversation_config.turn.turn_timeout",
      want: 30,
      got: 7,
    },
  );
  assert.ok(!JSON.stringify(drift).includes("s3cret"), "the secret is never among the differences");
});

test("the body printed hides the secret; the dry run prints it and calls nothing (no --apply, no key spent); production's name is the default", () => {
  const body = agentConfig({ name: "a", url: URL, secret: "s3cret" });
  const shown = shownConfig(body);
  assert.equal(shown.conversation_config.agent.prompt.custom_llm.request_headers["x-chanlytics-agent"], "<secret>");
  assert.equal(
    body.conversation_config.agent.prompt.custom_llm.request_headers["x-chanlytics-agent"],
    "s3cret",
    "the body itself is untouched",
  );
  const out = execFileSync(process.execPath, [SCRIPT, "--url", URL], {
    encoding: "utf8",
    env: { ...process.env, ELEVENLABS_API_KEY: "key-for-this-test", ELEVENLABS_LLM_SECRET: "secret-for-this-test" },
  });
  assert.match(out, /^dry run; the body that --apply would send:/);
  assert.ok(out.includes('"name": "chanlytics-ask"'), "production's agent unless --name says");
  assert.ok(out.includes('"x-chanlytics-agent": "<secret>"'), "the header's value is hidden");
  assert.ok(!out.includes("secret-for-this-test") && !out.includes("key-for-this-test"), "neither secret is printed");
  assert.ok(out.includes('"url": "https://app.example.com/api/ask/voice/llm"'));
  assert.ok(out.includes('"first_message": ""'), "the agent says nothing on connect");
});

test("a write to one agent by id (--delete, --set-url) is a dry run until --apply, never touches production's agent, and does nothing to an agent it could not read", async () => {
  const { agentWritePlan } = await import("../../voice/elevenlabs-agent-config.mjs");
  const spike = { id: "agent_spike", agentName: "chanlytics-ask-spike" };
  assert.deepEqual(agentWritePlan({ verb: "delete", ...spike, apply: false }), {
    dryRun: "dry run; --apply would delete agent_spike (chanlytics-ask-spike)",
  });
  assert.deepEqual(agentWritePlan({ verb: "delete", ...spike, apply: true }), { go: true });
  assert.deepEqual(agentWritePlan({ verb: "set-url", ...spike, apply: false }), {
    dryRun: "dry run; --apply would set the brain door's URL on agent_spike (chanlytics-ask-spike)",
  });
  assert.deepEqual(agentWritePlan({ verb: "set-url", ...spike, apply: true }), { go: true });
  // Production's agent: refused whatever the flags, so a mistyped id can never take production's voice away.
  for (const verb of ["delete", "set-url"]) {
    for (const apply of [false, true]) {
      const plan = agentWritePlan({ verb, id: "agent_prod", agentName: PRODUCTION_AGENT_NAME, apply });
      assert.match(plan.refused, /agent_prod is chanlytics-ask/, `${verb} apply=${apply}`);
      assert.equal("go" in plan, false);
    }
  }
  // An id that reads as nothing (a typo, an agent already gone): nothing is sent.
  assert.match(agentWritePlan({ verb: "delete", id: "agent_typo", agentName: null, apply: true }).refused, /no agent/);
});
