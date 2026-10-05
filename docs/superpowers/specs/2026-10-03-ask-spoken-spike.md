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
- **`cascade_timeout_seconds` tops out at 15.** A PATCH with 16, 30 or 60 is refused: 400 `invalid_parameters`,
  "Input should be less than or equal to 15", `param: agent.prompt.cascade_timeout_seconds` (the sources note's
  "2 to 15" holds). The budget cannot be bought; the door has to fit it (runs B3 to B6).
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
| 1 | Which header the secret arrives in; whether a path suffix is appended | **Answered (run A, through a Cloudflare quick tunnel):** the vendor appends `/chat/completions` to the configured URL (it called `/api/ask/voice/llm/chat/completions`), sends `request_headers` as given (`x-chanlytics-agent` arrived) **and** an `authorization` header besides, and calls through the OpenAI client library (`x-stainless-*` headers, with its read timeout and retry count on the wire). The body carries `messages` (system, user), `model: "custom-llm"`, `max_tokens`, `stream: true`, `stream_options`, `temperature`, `elevenlabs_extra_body`; no `user_id` and no `tools`. One request for the turn. | §3.3: the door serves the base path plus `/chat/completions`; the secret is the custom header |
| 2 | `customLlmExtraBody` arrives as `elevenlabs_extra_body` | **Answered:** `elevenlabs_extra_body.chanlytics_session` arrived at the door exactly as the SDK sent it; the vendor's record holds it too | §3.1, §3.3 |
| 3 | Seconds to the first spoken word (trace / filler / neither) | pending a microphone (Ruben's Chrome) | §4 |
| 4 | What `cascade_timeout_seconds` measures | **Mostly answered (runs B1, B2):** a refused connection is fatal in 5.2 s (1002, the conversation ends). An open door that sends its first byte at 0.3 s and the answer 9 s later is waited for: no retry (`x-stainless-retry-count: 0`), no filler (bytes were flowing), the answer delivered 10.4 s after the question. An open door that sends nothing for 9 s is waited for too: the platform's soft timeout spoke "One moment." (it led the response as its first part) and the answer followed at 10.1 s. The vendor's HTTP client read timeout is 600 s (`x-stainless-read-timeout`). **A door silent for 15 s is cut and called again (run B3):** the vendor aborted the request at 14.6 s, opened a second at once, cut it at 14.9 s, opened a third, cut it at 14.9 s, and then had nothing to say but its own filler; the record's agent turn reads "One moment. ..." with `ttf_response_since_user_message: 33.9 s`. Three requests for one question, each `x-stainless-retry-count: 0` (the orchestrator's cascade, not the HTTP client's retry); the third was cut 10 s after the client had hung up, so a disconnect does not cancel the door's request. **An early first byte does not reset the clock (run B4):** the trace at 0.3 s, the answer at 20 s, cut at 15.4 s all the same, three attempts, then the socket closed 1002 `custom_llm_error: LLM Cascade Error: TimeoutError` and the conversation was over. **The vendor refuses a value above 15** (400 "Input should be less than or equal to 15" for 16, 30 and 60). **Settled by runs B5 to B9: the 15 s are the longest gap between two chunks with speakable text.** A finished sentence does not end the budget (B5, cut 15 s after the last preview); a chunk with no content (B6) or a space (B7) does not restart it; the vendor's buffer words `"... "` do (B8, held; B9, a 40 s turn with the pulse every 10 s, held) | §3.3: the door's first chunk leaves within a second (the first trace); while the model is quiet the door sends `"... "` every 10 s, which in voice is a pause and in the chat is nothing; one turn per request key, a retried request re-attaches to the running turn (`ask_voice_sessions.turn_key`); §3.7: `cascade_timeout_seconds: 15`, the ceiling |
| 5 | The in-flight request on a barge-in; `interruption` fires | pending a microphone | §3.3 |
| 6 | End of speech: the part's `stop` or `agent_response_complete` | pending a microphone | §3.5 |
| 7 | The WebRTC signalling host, for the CSP | pending a microphone (the pane cannot open a WebRTC session) | §6.4 |
| 8 | `charging.llm_charge` on a custom LLM conversation | **Answered, on a successful turn too (run A):** `llm_charge: 0`, `llm_price: 0.0`, `platform_charge: 18` credits = `cost_fiat: 0.003` for the one text message; `producing_llm: custom-llm`. No vendor model fee on a custom LLM | §5 |
| 9 | The first-message limit (Read aloud) | **Answered (text-only, `conv_3901m40tt82efvd8prmhjrsncxcg`):** a first message of 860 characters (the say's whole budget, 160 + 700) arrived whole as the agent's first `agent_response` 0.8 s after the tap, so the 200 and 500 runs were not needed; a limit, if there is one, lies above 860 | §3.5 |
| 10 | WebRTC in iOS Safari | pending a phone | §8.4 |

**Runs B1 and B2, the slow door (text-only, 3 Oct 11:57 and 12:04 UTC).** B1 (`conv_6001m40t11e4fm795fhn8yw8btg3`):
the door's trace at 0.31 s, the say at 9.3 s, the stream closed at 9.8 s; the vendor made one request, no retry, no
filler, and delivered the whole answer 10.4 s after the question. B2 (`conv_1701m40t3d72fpnssvqq5e1zhsbv`): nothing
from the door for 9 s; the vendor's soft timeout fired (its "One moment." is the first part of the response, before
the door's own "Reading today… "), still one request, the answer at 10.1 s. In both the text-only session delivered
the parts in one burst at the end, so the early first byte buys nothing in text mode; in voice the TTS starts at
the first comma, which only a microphone run shows. The vendor's `authorization` header carries a 12-character
bearer that is not ours (no `api_key` is set); the custom header is the credential.

**Run B3, the silent door (text-only, 3 Oct 12:02 UTC, `conv_2201m40t9syqfmsvrc81baxjz22d`; the door's first byte at
20 s).** The question at 12:02:27. The door's log: `voice_spike_aborted` 14.6 s into the first request, a second
request the same instant, aborted 14.9 s in, a third, aborted 14.9 s in at 12:03:11, ten seconds after the pane had
ended the session (+35.9 s from the tap); each request ran the fake turn to its end into a closed reader (so a real
door would have run Ask three times and stored three answers). The pane saw only `ping` events for 34 s: the filler
had been spoken at ~4 s and nothing followed. The vendor's record: `status: done`, `termination_reason: Client
disconnected: 1000`, `metadata.error: null`, the agent turn "One moment. ..." with no `convai_llm_service_ttfb` and
`ttf_response_since_user_message: 33.9 s`. So `cascade_timeout_seconds` is a per-attempt budget on the custom LLM's
silence, three attempts, and a slow turn costs three turns and a conversation stuck on the filler for 45 s. The design
takes two things from it: the door writes its first bytes within a second of the request (the first trace, or a
heartbeat before the model has said anything), and a request is keyed to its turn so the retry re-attaches to the
turn already running instead of running it again.

**Run B4, the early byte and the late answer (text-only, 3 Oct 12:08 UTC, `conv_0001m40tn2tfexy994jemcsf80qf`; the
door's trace at 0.3 s, the say at 20.3 s).** The vendor cut the request at 15.4 s all the same
(`voice_spike_aborted afterMs 15365`), opened a second whose history now carried an `assistant` message (the partial
response, "Reading today… One moment. "), cut it at 15.4 s, opened a third, and after its cut closed the socket with
1002 `custom_llm_error: LLM Cascade Error: TimeoutError`, 49 s after the tap, the conversation over. The pane had
received at 17.5 s the parts "Reading today… ", "Reading today… ", "One moment. ", "Reading today… " (the first
attempt's bytes and the filler, in the order the vendor stitched them) and at 48 s the `agent_response`
"Reading today… One moment. ". So the first byte does not reset the clock: the 15 s run from the request to the end
of the first sentence at least, or to the end of the response. A PATCH of `cascade_timeout_seconds` to 16, 30 or 60
is refused (400, "Input should be less than or equal to 15"), so 15 is the ceiling.

**Run B5, a whole sentence early, the rest late (text-only, 3 Oct 12:13 UTC, `conv_4801m40ty3sbe7rs4bx7sd470hnm`;
the trace at 0.3 s, the headline, a full sentence, in four previews from 1.86 to 2.2 s, the detail at 22.3 s).** Cut
at 17.3 s (`abortedAtMs 17291`), then at 17.2 s on the second and the third attempt; the socket closed 1002 at 53.6 s
with the same cascade error. The pane received the second attempt's previews live at 20.6 to 20.9 s and the third's at
38.0 to 38.3 s (text mode does stream deltas as they come; run A's "burst" was a short answer arriving whole), and the
closing `agent_response` is the three attempts' text stitched end to end ("Reading today… Two people need you, Ana
since noon…is since two.Reading today… Two people need you, …"), which is what a member would hear. **The cut comes
15 s after the last chunk, not 15 s after the request:** B3 (no bytes) at 14.6 to 14.9 s from the request, B4 (one
chunk at 0.3 s) at 15.4 s, B5 (the last preview at 2.2 s) at 17.2 to 17.3 s. So `cascade_timeout_seconds` is the
longest gap the vendor allows between two chunks of the custom LLM's stream; a finished sentence does not end the
budget and bytes keep it alive. Run B6 asks whether a chunk with no words every 3 s holds it.

**Run B6, a chunk with no content every 3 s (text-only, 3 Oct 12:16 UTC, `conv_0901m40v2frefqfrc7qrmedmsx1q`; the
trace at 0.3 s, then `delta: {content: ""}` every 3 s, the say at 20.4 s).** Cut at 15.36 s with six pulses sent, on
all three attempts, then the 1002 cascade error at 48.5 s. A chunk with no content does not restart the clock: the
vendor counts what it can speak, not what it receives. Run B7 sends a single space, run B8 the vendor's own buffer
words, "... ".

**Run B7, a single space every 3 s (text-only, 3 Oct 12:17 UTC, `conv_5501m40v5fv6errb7abrjpd850av`).** Cut at
15.36 s with six pulses sent, three attempts, the 1002 error at 48.4 s: a space is not content either.

**Run B8, the vendor's buffer words every 3 s (text-only, 3 Oct 12:19 UTC, `conv_4501m40v7dmaebfbt2646vdk2gt3`; the
trace at 0.3 s, `"... "` every 3 s, the say at 20.4 s).** **Held.** One attempt, no abort; the vendor delivered the
whole response at 21.7 s in text mode: the trace, six parts of `...` (the trailing space trimmed), the headline's
four previews, the detail, `stop`, then `agent_response` and `agent_response_complete` at 21.9 s. The clock restarts
on a chunk with speakable text, and the vendor's own buffer words are speakable text: in voice they are the pause the
custom-LLM page describes. Run B9 holds a turn for 40 s with the pulse every 10 s. The vendor's record of B8:
`convai_llm_service_ttfb 0.60 s`, `ttf_sentence 20.77 s` (the dots are not a sentence to it: the first sentence was
the headline), `tt_last_sentence 21.15 s`; `llm_charge 0`, 18 credits for the text message, `llm_usage` counts the
custom LLM's 551 input and 60 output tokens at price 0.

**Run B9, a 40-second turn (text-only, 3 Oct 12:21 UTC, `conv_7601m40v9t51ekwvnxrjn9xxevve`; the trace at 0.3 s,
`"... "` at 10.3, 20.3 and 30.3 s, the say at 40.4 s).** **Held.** One attempt, no abort, the whole response at
41.7 s, `agent_response_complete` at 41.9 s. A turn may run as long as the door's own limit (60 s on the dashboard)
provided the gaps between speakable chunks stay under 15 s.

**Run A, the first turn through the vendor (text-only, the door in scripted mode, 3 Oct 11:54 UTC,
`conv_6801m40stq6re8s93e1de7b080fy`).** The pane: `connected` 0.94 s after the tap, the question sent at once, the
first chat part 2.7 s after the question, the whole answer as deltas, then `agent_response` (the full text) and
`agent_response_complete` 0.26 s later; `ping` every 1.7 s. The door: the request arrived, its trace chunk left at
0.33 s, the first say at 1.85 s, the stream closed at 2.37 s. The vendor's own metrics on the turn:
`convai_llm_service_ttfb 0.80 s` (so about 0.5 s of orchestration and tunnel sit between the door's first byte and
the vendor's clock), `ttf_sentence 2.47 s`, `tt_last_sentence 2.84 s`, `ttf_response_since_user_message 2.84 s`. In
text mode the vendor delivered the whole answer in one burst; in voice the first comma starts the speech.

Also read off the record: `deletion_settings.deletion_time_unix_secs` is seven days ahead with `delete_audio: true`
(the privacy fields took), `dynamic_variables` carries only the vendor's own `system__*` values (we send none), and
`metadata.error` names the close code and reason (`error_type: llm_error`).
