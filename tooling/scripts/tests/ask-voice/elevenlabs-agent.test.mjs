/**
 * The ElevenLabs agent as code (tooling/scripts/voice/elevenlabs-agent-config.mjs), held to the spec's §3.7 value by
 * value, and the script's dry run, which prints the body with the secret hidden and calls nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentConfig, shownConfig } from "../../voice/elevenlabs-agent-config.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = path.join(ROOT, "tooling/scripts/voice/elevenlabs-agent.mjs");
const URL = "https://app.example.com/api/ask/voice/llm";

test("agentConfig carries every value of spec §3.7: the custom LLM named as such with its header, the ceiling the vendor allows, the events, the turn, the voice, the privacy and the limits; and only the language and the first message may be overridden", () => {
  assert.deepEqual(agentConfig({ name: "chanlytics-ask", url: URL, secret: "s3cret", voiceId: "voice_1" }), {
    name: "chanlytics-ask",
    conversation_config: {
      agent: {
        first_message: "",
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
        max_duration_seconds: 1800,
        client_events: [
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
      },
      turn: {
        turn_eagerness: "normal",
        turn_timeout: 7,
        speculative_turn: false,
        turn_model: "turn_v3",
        soft_timeout_config: { timeout_seconds: -1 },
      },
      tts: {
        voice_id: "voice_1",
        model_id: "eleven_flash_v2",
        text_normalisation_type: "elevenlabs",
        expressive_mode: false,
        enable_phoneme_tags: false,
      },
      asr: { provider: "scribe_realtime" },
    },
    platform_settings: {
      auth: { enable_auth: true },
      overrides: {
        custom_llm_extra_body: true,
        conversation_config_override: { agent: { language: true, first_message: true } },
      },
      privacy: { record_voice: false, retention_days: 7, delete_audio: true },
      call_limits: { agent_concurrency_limit: 4, daily_limit: 200, bursting_enabled: false },
    },
  });
});

test("an English agent speaks Flash v2 (the vendor refuses v2.5 for English); any other language the multilingual v2.5; the webhook is a workspace object named by id, only when given; the text-only override is never allowed", () => {
  const es = agentConfig({
    name: "a",
    url: URL,
    secret: "s",
    voiceId: "v",
    language: "es",
    webhookId: "wh_1",
    concurrency: 6,
    daily: 500,
  });
  assert.equal(es.conversation_config.tts.model_id, "eleven_flash_v2_5");
  assert.equal(es.conversation_config.agent.language, "es");
  assert.deepEqual(es.platform_settings.workspace_overrides, {
    webhooks: { post_call_webhook_id: "wh_1", events: ["transcript"] },
  });
  assert.deepEqual(es.platform_settings.call_limits, {
    agent_concurrency_limit: 6,
    daily_limit: 500,
    bursting_enabled: false,
  });
  const en = agentConfig({ name: "a", url: URL, secret: "s", voiceId: "v" });
  assert.equal("workspace_overrides" in en.platform_settings, false, "no webhook until door D is registered");
  assert.equal(
    "conversation" in en.platform_settings.overrides.conversation_config_override,
    false,
    "the spike's text-only transport is not minted, so its override stays off",
  );
});

test("the body printed hides the secret; the dry run prints it and calls nothing (no --apply, no key spent)", () => {
  const body = agentConfig({ name: "a", url: URL, secret: "s3cret", voiceId: "v" });
  const shown = shownConfig(body);
  assert.equal(shown.conversation_config.agent.prompt.custom_llm.request_headers["x-chanlytics-agent"], "<secret>");
  assert.equal(
    body.conversation_config.agent.prompt.custom_llm.request_headers["x-chanlytics-agent"],
    "s3cret",
    "the body itself is untouched",
  );
  const out = execFileSync(process.execPath, [SCRIPT, "--name", "chanlytics-ask-test", "--url", URL], {
    encoding: "utf8",
    env: { ...process.env, ELEVENLABS_API_KEY: "key-for-this-test", ELEVENLABS_LLM_SECRET: "secret-for-this-test" },
  });
  assert.match(out, /^dry run; the body that --apply would send:/);
  assert.ok(out.includes('"x-chanlytics-agent": "<secret>"'), "the header's value is hidden");
  assert.ok(!out.includes("secret-for-this-test") && !out.includes("key-for-this-test"), "neither secret is printed");
  assert.ok(out.includes('"url": "https://app.example.com/api/ask/voice/llm"'));
});
