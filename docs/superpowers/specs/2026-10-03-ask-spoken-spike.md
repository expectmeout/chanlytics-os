# Ask, spoken: the spike's answers (3 Oct 2026, in progress)

PR 0 of `docs/superpowers/plans/2026-10-03-ask-spoken.md`: a throwaway brain door, session route, agent and client on
branch `spike/ask-voice` (worktree `cm-ask-voice`, dev server :3305). This note keeps what the vendor's API and the
pane answered, question by question (the spec, §7), and what the design changes because of it. Nothing of the spike's
code is kept.

## What the vendor's API answered on its own (3 Oct, before any conversation)

- **A custom LLM needs `llm: "custom-llm"`.** The create refused `custom_llm` without it: 422 "custom_llm can only be
  set if llm is set to CUSTOM_LLM". The agent script sets both (spec §3.7 gains the line).
- **An English agent must use Flash v2 or Turbo v2.** The create refused `eleven_flash_v2_5` with `language: en`:
  400 "English Agents must use turbo or flash v2". So `en` → `eleven_flash_v2`, any other language → `eleven_flash_v2_5`;
  a per-session Spanish override may need the model switched with it (open: the vendor may switch it alone).
- **The field names the probe read back** match the sources note: `tts.text_normalisation_type` (British spelling),
  `turn.soft_timeout_config`, `conversation.client_events`, `conversation.max_duration_seconds`,
  `platform_settings.auth.enable_auth`, `platform_settings.overrides.custom_llm_extra_body`,
  `platform_settings.privacy.{record_voice, retention_days, delete_audio, zero_retention_mode, user_memory}`,
  `platform_settings.call_limits.{agent_concurrency_limit, daily_limit, bursting_enabled}`.
- **Defaults the vendor applies to an API-created agent** (the probe): `speculative_turn: true` (the sources said
  false: set it explicitly), `client_events` = `audio, interruption, agent_response, user_transcript,
  agent_response_correction, agent_tool_response`, `tts.model_id: eleven_v4_turbo` with `expressive_mode: true`,
  `cascade_timeout_seconds: 4`, `llm: qwen35-397b-a17b`, `max_duration_seconds: 600`, `auth.enable_auth: false`,
  `retention_days: -1`, `record_voice: true`, `bursting_enabled: true`, every override off but `conversation.text_only`.
- **A post-call webhook is a workspace object named by id** (`workspace_overrides.webhooks.post_call_webhook_id`),
  not a URL on the agent (spec §3.6, §3.7: door D is registered once as a workspace webhook, then named).
- **`platform_settings.auth` also has `require_origin_header` and `shareable_token`.** Off; not needed.
- **The spike agent** `chanlytics-ask-spike` (River, Flash v2, the spec's §3.7 values) read back exactly as set.

## What the pane answered (3 Oct, before a tunnel exists)

- The session route minted in 0.5–0.7 s from the tap (the thread created; the WebRTC token comes with a
  `conversation_id`, the signed URL does not).
- `@elevenlabs/client` and `livekit-client` loaded as two on-demand chunks after the tap (the workspace route's budget
  carries neither).
- **The Browser pane has no audio input device** (`enumerateDevices` → 0): a WebRTC session throws
  `NotFoundError: Requested device not found` at once. Every microphone question (3, 5, 6, 7, 10) runs in Ruben's own
  Chrome at `http://localhost:3305` after `http://localhost:3398/` signs it in.
- **A text-only session is a WebSocket on a signed URL**, never on a conversation token (the SDK then connects by an
  undefined agent id and gets 404): the session route mints `get-signed-url` when asked for text. The agent must allow
  the `conversation.text_only` override, or the socket closes with 1008 "Override for field 'text_only' is not allowed
  by config."; and setting `platform_settings.overrides.conversation_config_override` replaces the vendor's whole
  default (which had `text_only: true` on), so the script names it.
- **The handshake and the question, measured** (`conv_2901m4079grffx38xdy99f59p3m9`, text-only, the custom LLM URL a
  placeholder): `connected` at 0.60 s from the tap; `sendUserMessage` accepted at once; `ping` every ~1.7 s; the
  soft-timeout filler "One moment." arrived as an `agent_response` 4.3 s after the question (`turn.soft_timeout_config`
  at 3.0 s plus the vendor's own time; the record says `convai_ttf_response_since_user_message: 4.15 s`); then, at
  5.2 s after the question, the socket closed with 1002 `custom_llm_error: Failed to generate response from custom LLM`
  and the record says `status: failed`, `termination_reason: custom_llm generation failed`. **A door that fails ends
  the conversation**; the design's "never an empty stream, always spoken words" is the whole defence.
- **A custom LLM carries no vendor model fee** (question 8, on a failed turn): `charging.llm_charge: 0`,
  `llm_price: 0.0`, `platform_charge: 18` credits = `cost_fiat: 0.003` for the one text message; a successful voice
  turn confirms it.
- The vendor's record carries the initiation data as sent: `agent.language: en`, `conversation.text_only: true`, and
  the extra body (section below).

## The ten questions (spec §7)

| # | Question | Answer | Where it changes the design |
|---|---|---|---|
| 1 | Which header the secret arrives in; whether a path suffix is appended | pending the tunnel (the door answers at all three paths and reads both headers) | §3.3 |
| 2 | `customLlmExtraBody` arrives as `elevenlabs_extra_body` | Half: the SDK sends it and the vendor's conversation record holds `custom_llm_extra_body: {chanlytics_session}` beside `user_id`; its arrival at the door waits on the tunnel | §3.1, §3.3 |
| 3 | Seconds to the first spoken word (trace / filler / neither) | pending a microphone (Ruben's Chrome) | §4 |
| 4 | What `cascade_timeout_seconds` measures | Partly: with the door unreachable the vendor gave up 5.2 s after the question and closed the socket (1002 `custom_llm_error`), with `cascade_timeout_seconds: 15` set; so the timer is not a plain first-byte wait, and a refused connection is retried quickly then fatal. What it does to a slow-but-open door waits on the tunnel | §3.3, §3.7 |
| 5 | The in-flight request on a barge-in; `interruption` fires | pending a microphone | §3.3 |
| 6 | End of speech: the part's `stop` or `agent_response_complete` | pending a microphone | §3.5 |
| 7 | The WebRTC signalling host, for the CSP | pending a microphone (the pane cannot open a WebRTC session) | §6.4 |
| 8 | `charging.llm_charge` on a custom LLM conversation | `llm_charge: 0`, `llm_price: 0.0`; the platform charged 18 credits ($0.003) for the text message. No vendor model fee on a custom LLM | §5 |
| 9 | The first-message limit (Read aloud) | pending the tunnel | §3.5 |
| 10 | WebRTC in iOS Safari | pending a phone | §8.4 |

Also read off the record: `deletion_settings.deletion_time_unix_secs` is seven days ahead with `delete_audio: true`
(the privacy fields took), `dynamic_variables` carries only the vendor's own `system__*` values (we send none), and
`metadata.error` names the close code and reason (`error_type: llm_error`).
