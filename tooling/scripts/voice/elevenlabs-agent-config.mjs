/**
 * The ElevenLabs agent's body, as code (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.7): what
 * elevenlabs-agent.mjs creates or converges, and what elevenlabs-agent.test.mjs holds to the spec, value by value. No
 * network here, so the test needs none.
 *
 * Two of the vendor's refusals shaped it (the spike note, 3 Oct 2026): `custom_llm` is refused unless `llm` names it
 * (422 "custom_llm can only be set if llm is set to CUSTOM_LLM"), and an English agent must speak Flash v2 or Turbo v2
 * (400 "English Agents must use turbo or flash v2"), so `en` takes Flash v2 and any other language the multilingual
 * Flash v2.5. `cascade_timeout_seconds` is 15 because the vendor allows no more, and the brain door keeps every gap
 * between speakable chunks under ten seconds (contracts ASK_VOICE_PULSE_MS). The text-only transport's override
 * (`conversation.text_only`) is not allowed: the dashboard mints no signed URL, and a browser may change nothing of
 * the agent but its language and its first message.
 */

/**
 * @param {object} o
 * @param {string} o.name the agent's name, by which the script finds it again
 * @param {string} o.url the brain door's public address (`https://<host>/api/ask/voice/llm`); the vendor appends /chat/completions
 * @param {string} o.secret the value of the x-chanlytics-agent header (the dashboard's ELEVENLABS_LLM_SECRET)
 * @param {string} o.voiceId the voice (Ruben's pick, spec §9)
 * @param {string} [o.language] the agent's default language (`en`); a session overrides it
 * @param {string | null} [o.webhookId] the post-call webhook, a workspace object the vendor names by id, once door D is registered
 * @param {number} [o.concurrency] conversations at once (the plan's number)
 * @param {number} [o.daily] conversations a day
 */
export function agentConfig({
  name,
  url,
  secret,
  voiceId,
  language = "en",
  webhookId = null,
  concurrency = 4,
  daily = 200,
}) {
  return {
    name,
    conversation_config: {
      agent: {
        first_message: "",
        language,
        prompt: {
          prompt:
            "You are the mouth of Chanlytics' workspace assistant. Every word you say comes from the model you are wired to; say nothing of your own.",
          llm: "custom-llm",
          custom_llm: {
            url,
            api_type: "chat_completions",
            request_headers: { "x-chanlytics-agent": secret },
          },
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
        // The platform's own filler is off: the brain door speaks its first words itself when the model is slow
        // (ASK_VOICE_FIRST_WORDS_MS, a trace the chat draws as one), so no filler lands in the chat as the answer's head.
        soft_timeout_config: { timeout_seconds: -1 },
      },
      tts: {
        voice_id: voiceId,
        model_id: language === "en" ? "eleven_flash_v2" : "eleven_flash_v2_5",
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
      call_limits: { agent_concurrency_limit: concurrency, daily_limit: daily, bursting_enabled: false },
      ...(webhookId
        ? { workspace_overrides: { webhooks: { post_call_webhook_id: webhookId, events: ["transcript"] } } }
        : {}),
    },
  };
}

/** The body as it may be printed: the secret's value hidden. */
export function shownConfig(body) {
  const shown = JSON.parse(JSON.stringify(body));
  shown.conversation_config.agent.prompt.custom_llm.request_headers["x-chanlytics-agent"] = "<secret>";
  return shown;
}
