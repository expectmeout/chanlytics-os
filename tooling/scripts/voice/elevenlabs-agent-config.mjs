/**
 * The ElevenLabs agent's body, as code (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.7 as amended 4 Oct
 * 2026): what elevenlabs-agent.mjs creates or converges, and what elevenlabs-agent.test.mjs holds to the spec, value by
 * value. No network here, so the test needs none.
 *
 * The brain wiring was right from the spike (the custom LLM named as such, its header, the 15 s cascade against the
 * door's 10 s buffer words, the platform's filler off); every conversation setting the first body left unsaid sat at
 * the vendor's default, and four of them fought a brain that takes six to nine seconds (measured on production, 4 Oct
 * 2026): a seven-second turn timeout had the agent ask the brain again in every silence (the door said "I'm here."
 * three times in twenty-one seconds to a person saying nothing), a normal eagerness split a paused question into two
 * Opus turns, room talk ran turns of its own, and nothing ever ended a forgotten call before its thirty minutes. So:
 *
 *   - the agent speaks first ("I'm listening."), protected from interruption, so the audio path proves itself before
 *     the person says a thing; the first message was empty and the browser overrode it for Read aloud, which is the
 *     one-way speech now and never a conversation;
 *   - `turn_eagerness: patient`: a pause is a pause. A silent call ends after twenty seconds
 *     (`silence_end_call_timeout` 20) BEFORE the agent would ask the brain again (`turn_timeout` 25), so the door's
 *     "I'm here." is never said to an empty room; the two were a tie at 20, and which fires first the vendor does
 *     not say. Whether the end's clock counts the agent's own speaking is unstated too: the dev agent's first mic run
 *     measures it (a `vendor` end with a short life while the agent was still talking is the sign to raise it).
 *     `max_duration_seconds_after_last_agent_message` 60 ends one nobody followed up (a field the live agent carries
 *     and the public schema does not name; the vendor refusing it is the signal to drop it); ten minutes in all;
 *   - `background_voice_detection` on, and the vendor's default ignore terms merged with the backchannel words a
 *     person says while listening, so an "okay" never cuts the answer;
 *   - the voice and its model are contracts' one pair (ASK_VOICE_ID, Ruben's pick "Mark - Natural Conversations";
 *     ASK_VOICE_MODEL, Turbo v2: an English agent must speak Flash v2 or Turbo v2, the vendor's 400, and this voice is
 *     high quality on Turbo), the same the one-way speech speaks, so a brief and a spoken answer sound alike;
 *   - no override but the extra body: the language and the first message are the agent's own now (a Spanish
 *     session waits on a language preset, spec §8);
 *   - the vendor's own readers of the transcript are off (topic discovery, sentiment, file input): door D erases the
 *     transcript because it names customers, and nothing of ours reads those analyses.
 *
 * Two agents, one body: production's (`chanlytics-ask`) and a laptop's (`chanlytics-ask-dev`, pointed at a tunnel),
 * each with its own header secret; a tunnel's `--set-url` refuses the production name (elevenlabs-agent.mjs).
 */
import { ASK_VOICE_ID, ASK_VOICE_MODEL } from "../../../packages/contracts/dist/index.js";

/** The one agent production's edge names; a tunnel may never be set on it. */
export const PRODUCTION_AGENT_NAME = "chanlytics-ask";
/** The laptop's agent, pointed at a tunnel: the same body, its own secret. */
export const DEV_AGENT_NAME = "chanlytics-ask-dev";

/** What the agent says on connect, before the person does: the audio path proving itself. */
export const AGENT_FIRST_MESSAGE = "I'm listening.";

/** Backchannel words a listener says that must never cut the answer; merged with the vendor's own defaults. */
export const INTERRUPTION_IGNORE_TERMS = [
  "okay",
  "ok",
  "yeah",
  "yes",
  "right",
  "mm-hmm",
  "uh-huh",
  "sí",
  "ajá",
  "vale",
];

/**
 * @param {object} o
 * @param {string} o.name the agent's name, by which the script finds it again (PRODUCTION_AGENT_NAME or DEV_AGENT_NAME)
 * @param {string} o.url the brain door's public address (`https://<host>/api/ask/voice/llm`); the vendor appends /chat/completions
 * @param {string} o.secret the value of the x-chanlytics-agent header (the dashboard's ELEVENLABS_LLM_SECRET)
 * @param {string} [o.voiceId] the voice; contracts' ASK_VOICE_ID unless a test hands one in
 * @param {string | null} [o.webhookId] the post-call webhook, a workspace object the vendor names by id, once door D is registered
 * @param {number} [o.concurrency] conversations at once (the plan's number)
 * @param {number} [o.daily] conversations a day
 */
export function agentConfig({
  name,
  url,
  secret,
  voiceId = ASK_VOICE_ID,
  webhookId = null,
  concurrency = 4,
  daily = 200,
}) {
  return {
    name,
    conversation_config: {
      agent: {
        first_message: AGENT_FIRST_MESSAGE,
        disable_first_message_interruptions: true,
        language: "en",
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
        max_duration_seconds: 600,
        max_duration_seconds_after_last_agent_message: 60,
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
        // Nothing of ours reads a file, and door D erases the transcript: the vendor's readers of it are off.
        file_input: { enabled: false },
      },
      turn: {
        turn_eagerness: "patient",
        turn_timeout: 25,
        silence_end_call_timeout: 20,
        speculative_turn: false,
        turn_model: "turn_v3",
        interruption_ignore_terms: INTERRUPTION_IGNORE_TERMS,
        merge_with_default_ignore_terms: true,
        // The platform's own filler is off: the brain door speaks its first words itself when the model is slow
        // (ASK_VOICE_FIRST_WORDS_MS, a trace the chat draws as one), so no filler lands in the chat as the answer's head.
        soft_timeout_config: { timeout_seconds: -1 },
      },
      tts: {
        voice_id: voiceId,
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
        // Every override off: the browser may change nothing of the agent but the session it hands it. The live
        // agent of 4 Oct allowed a text-only override the spec forbade: an additive update had never said no.
        conversation_config_override: {
          agent: { language: false, first_message: false, prompt: { prompt: false, llm: false } },
          conversation: { text_only: false },
          tts: { voice_id: false, model_id: false },
        },
      },
      privacy: { record_voice: false, retention_days: 7, delete_audio: true },
      call_limits: { agent_concurrency_limit: concurrency, daily_limit: daily, bursting_enabled: false },
      // The vendor's second readers of the transcript, off: door D erases it because it names customers.
      topic_discovery: { enabled: false },
      sentiment_analysis: { enabled: false },
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

/** A list of plain values read in one order, so the vendor's reordering (events, the merged ignore terms) is no drift. */
const sorted = (xs) => [...xs].map((x) => JSON.stringify(x)).sort();

/**
 * What the agent as read back must equal, field by field, for the body sent: every value the body names, read at the
 * same path (the vendor adds fields of its own, which are not compared; a field the body names and the vendor dropped
 * or changed is a difference; a list of plain values is compared as a set). Answers the paths that differ, with both
 * values; empty when the agent is the body.
 */
export function agentDrift(sent, read) {
  const out = [];
  const walk = (want, got, at) => {
    if (want !== null && typeof want === "object" && !Array.isArray(want)) {
      if (got === null || typeof got !== "object" || Array.isArray(got)) {
        out.push({ path: at, want, got });
        return;
      }
      for (const [k, v] of Object.entries(want)) walk(v, got[k], at ? `${at}.${k}` : k);
      return;
    }
    if (Array.isArray(want) && Array.isArray(got) && want.every((x) => x === null || typeof x !== "object")) {
      if (JSON.stringify(sorted(want)) !== JSON.stringify(sorted(got))) out.push({ path: at, want, got });
      return;
    }
    if (JSON.stringify(want) !== JSON.stringify(got)) out.push({ path: at, want, got });
  };
  // The header's value is never read back as sent (the vendor hides it); its presence is.
  const want = JSON.parse(JSON.stringify(sent));
  delete want.conversation_config.agent.prompt.custom_llm.request_headers;
  walk(want, read, "");
  const header = read?.conversation_config?.agent?.prompt?.custom_llm?.request_headers ?? {};
  if (!("x-chanlytics-agent" in header))
    out.push({ path: "…custom_llm.request_headers.x-chanlytics-agent", want: "<set>", got: "<missing>" });
  return out;
}
