# Ask, spoken: the Line as a voice conversation on ElevenLabs Agents, with Ask as its brain (3 Oct 2026)

**Status:** for Ruben's review. Nothing built, nothing committed. Written against the tree `localhost:3300` serves
(worktree `cm-kit-threads`, branch `kit/phone-threads` plus its uncommitted work). Every ElevenLabs claim is traced
in `docs/superpowers/specs/2026-10-02-ask-voice-primary-sources.md` (the sources note, 83 claims, each with its page
and the day it was read); "sources §N" below names its section. Where the sources could not settle a point it is
marked UNKNOWN here too and given to the spike (section 7), never assumed. The package facts (`@elevenlabs/client`
1.26.0, `@elevenlabs/types` 0.24.0) were read from the published types on 3 Oct.

## 0. In one paragraph

Ask gets ears, a mouth and a sense of timing from ElevenLabs Agents, and keeps its brain. An ElevenLabs agent takes
the microphone, turns speech into words, decides when the person has finished, lets them cut in, and speaks in one
voice on every device. Its "LLM" is a door on the dashboard that runs Ask's own turn as the signed-in member and
streams the answer's `say` back as the words to speak. Every voice turn is therefore an ordinary turn of an Ask
thread: the question is the transcript, the answer is stored with its `show`, its citations and its cards, and the
Line draws it as it draws a typed one. Nothing new decides anything: the registry by purpose, the readers, the
tools, the proposals, the memory, the usage ledger and the evals are Ask's, unchanged. The one new idea is a mode:
how you ask is how you are answered.

## 1. Where it starts

- **Ask's turn** is one function, `runAskTurn` (`apps/dashboard/src/server/ask/loop.ts:273`), driven by one route,
  `POST /api/v1/ask` (`apps/dashboard/app/api/v1/ask/route.ts`), which verifies the member's session, keeps the thread
  (`memory.ts threadForTurn`, `store.ts appendMessage`), reads the workspace's facts, runs the turn and streams JSON
  lines: `thread`, `trace`, `say` previews, `final`. The answer's format puts `say` first so it streams first
  (`packages/contracts/src/ask/answer-format.ts:26`); `say.headline` is at most 160 characters and `say.detail` 700
  (`ask-answer.ts:69-71`). Every read runs under RLS on the session client; the dashboard holds no model key: the edge
  spends it through the gateway (`server/ask/gateway.ts`, `apps/edge/api/admin/llm.ts`).
- **A bearer beside the cookie** (decision 0011): a `/api/v1` route accepts `Authorization: Bearer <access token>`,
  verifies it with `getClaims` and runs under RLS on a client built from it (`server/bearer.ts`,
  `lib/supabase/server.ts createBearerClient`). No client uses it since 27 Sep; the door stands.
- **Voice today** is the browser's: Web Speech recognition in the kit's hold-to-talk
  (`surfaces/kit/talk/use-hold-to-talk.ts`, Chrome, Edge and Safari only) and Web Speech synthesis for Read aloud
  (`legacy-bridge/ask/speech.ts`) and Today's Listen (`surfaces/today/pages/brief-pane.tsx`). No turn-taking, no
  interruption, a device-dependent voice, nothing on the phone app's WebView.
- **The three** already have the states a voice needs: `idle`, `listening`, `thinking`, `speaking`, a `hear(level)` for
  the person's voice, a `voice(level, live)` for their own, `pulse` for a read that landed
  (`legacy-bridge/mascot/character.ts:91-114`). `useArMood` in `legacy/pages/ask-real.jsx:157-167` says the mood
  from the Line's state.
- **The precedent** is the receptionist: a conversational agent on Retell whose facts come through signed function
  doors on the edge (`apps/edge/lib/voice/voice-door-auth.ts`), provisioned and converged from code
  (`packages/channels/src/voice/voice-provision.ts`, `apps/edge/api/admin/voice-converge.ts`) so the console cannot
  drift from the repo.
- **ElevenLabs Agents** (the product is now "ElevenAgents"; its pages live under `/docs/eleven-agents/`) provides the
  conversation stack: Scribe realtime ASR, a turn-taking model, interruption handling, TTS in eight models, WebRTC and
  WebSocket transports, plain JavaScript, React and React Native SDKs, and a custom LLM option: an OpenAI-compatible
  streaming chat-completions endpoint of our own, called with the conversation's messages and a per-conversation
  `elevenlabs_extra_body` that the browser sets at the start of a session (sources §1, §2, §4). Voice minutes are
  $0.08 a minute beyond the plan on every plan, the LLM billed separately (ours, through our key, as today); Starter
  carries 75 minutes and 6 concurrent conversations, Pro 1,238 and 20 (sources §9). A second first-party product,
  Speech Engine, does the same over one persistent WebSocket per conversation that ElevenLabs opens to our server;
  it needs an always-on socket host, which the dashboard's serverless functions are not, so it is the named V2
  option, not V1 (sources §11; section 8).

## 2. The rule: how you ask is how you are answered

1. **A spoken question gets a spoken answer.** Starting a voice conversation puts the thread in listening mode: the
   agent hears, Ask answers, the agent speaks `say`; `show` is drawn on the screen as it is drawn today.
2. **Listen and Read aloud enter the same mode.** Today's Listen opens the Line in listening mode and asks Ask's
   own "Brief me on today" (`ask-suggestions.ts:66`) as the first message of the conversation; the templated brief
   stays on the page as its own words. Read aloud on an answer speaks that answer as the conversation's first
   message and leaves the thread listening.
3. **Typing leaves it.** A typed question ends the voice conversation and goes through `POST /api/v1/ask` as today,
   answered in text. No toggle to find.
4. **While it speaks, the person can cut in.** The agent stops (interruptions are on when `interruption` is among
   the agent's client events, sources §5), hears the new words, and the next turn runs. The thread holds the whole
   answer; what was actually spoken is a note on the turn (section 3.5).
5. **Nothing acts by voice in V1.** A card the turn proposes is drawn in the Line as today and approved on screen.
   The voice says what it proposed in one sentence, never that it was done (`ASK_RULES`). A spoken "yes" as the
   approval is V2 (section 8).

## 3. The wiring, end to end

Five parts, in the order a conversation goes through them. Three are new doors; the other two are Ask's turn and the
Line, each with one small change.

```
browser (the Line)                                  dashboard                              edge                     ElevenLabs
───────────────────                                 ─────────                              ────                     ──────────
tap mic / Listen ──POST /api/v1/ask/voice (cookie)──▶ A. voice-session route
                                                      · verifies as every route
                                                      · keeps the thread
                                                      · writes ask_voice_sessions
                                                      · asks the edge ───────────────────▶ B. voice-session door
                                                                                            · mayUseModels gate
                                                                                            · ELEVENLABS key ─────▶ GET conversation/token → {token, conversation_id}
                                      ◀── { session, token, conversation_id, thread_id } ◀─────────────────────────◀
startSession({ conversationToken, customLlmExtraBody: { chanlytics_session }, userId, overrides }) ══ WebRTC ═══▶ agent: ASR, turn-taking, TTS
                                                                                                                      │ POST custom LLM (SSE), elevenlabs_extra_body
                                                      C. brain door /api/ask/voice/llm ◀─────────────────────────────┘
                                                      · agent secret + session id
                                                      · claims the turn on the session row (dedupe)
                                                      · bearer client as the member (RLS)
                                                      · runAskTurn(spoken) → store the turn
                                                      · streams say ─────────────────────────────────────────────▶ spoken
events: user_transcript, agent_response, chat parts, vad ◀═══════════════════════════════════════════════════════
the Line draws the question, the say, then reads the stored turn (show, citations, cards)
end / hang-up ──────────────────────────────────────────────────────────────────────────▶ D. post-call webhook (edge) → the session's end
```

### 3.1 A. The voice-session route (dashboard, cookie)

`POST /api/v1/ask/voice`, declared as every write is (`write({ scope: workspace, role: "viewer", rate: "voice" })`,
`server/route.ts`): same origin, the session verified with `getClaims`, the member and role read as `/api/v1/ask`
reads them. Body `{ thread_id?, scope?, surface?, context?, language? }` in the shapes the palette already sends.

What it does, in order:

1. **Keeps the thread.** The thread named, or a new one (`store.ts createThread`), so the first turn lands where every
   later one does. The page's context, when sent, is warmed exactly as `ask/warm` warms it (`buildContext`), so the
   first spoken question finds its page read.
2. **Carries the member to the brain door.** The brain door is called by ElevenLabs, not by the browser, so it has
   no cookie; it must still run as this member under RLS. The route takes the access token the request was just
   verified with (the one place in the codebase that reads `ctx.supabase.auth.getSession()` after `getClaims` has
   verified the same token, named in the route's header and pinned by a test), encrypts it with `ASK_VOICE_SECRET`
   (AES-256-GCM; the secret is required in production, `env.ts REQUIRED_IN_PRODUCTION`), and writes one row of
   `ask_voice_sessions` on the session client (own rows under RLS, migration 00287): the session's id as the sha256 of
   a 32-byte random value, `tenant_id`, `user_id`, `thread_id`, the encrypted token, `token_expires_at` (the JWT's
   `exp`, an hour at most), `surface`, `scope`, the page's context as sent, `language`, `created_at`, `ended_at` null,
   and two columns the brain door claims a turn with (`turn_key`, `turn_started_at`, section 3.3). The plain id goes
   to the browser once and never to the log.
3. **Asks the edge for the agent.** Through the signed edge token (`server/edge.ts edgeHeaders`), door B below, with
   the workspace and the person. The edge answers the agent's WebRTC conversation token and the conversation's id
   (sources §2); the route writes `conversation_id` on the row, since the post-call webhook names it. A refusal is
   answered as the gateway's refusals are answered today (`paused`, `no_key`, `unreachable`), in words the Line
   already knows (`loop.ts refusalText`).
4. **Answers** `{ session, token, conversation_id, thread_id, title }`. The token is good for ten minutes on the one
   page that says (sources §2), so the browser starts the conversation at once and asks again on a retry. It sends
   `session` to ElevenLabs as `customLlmExtraBody: { chanlytics_session }` (the SDK's session option,
   `@elevenlabs/client` `dist/utils/BaseConnection.d.ts:59`; on the wire `custom_llm_extra_body`, which the agent
   must allow with `platform_settings.overrides.custom_llm_extra_body: true`, sources §1, §2) and as `userId`, a
   label the vendor stores and never verifies; nothing else of ours goes in the initiation data.

**The page follows the person.** `POST /api/v1/ask/voice/page` (cookie, `{ session, context }`) replaces the row's
context when the page under the Line changes, and warms it; the next spoken turn reads that page. Nothing is sent
to the agent as a contextual update: how one would reach the door's `messages` is unstated (sources §3), and Ask
already holds the page.

A session is ended by the browser (`POST /api/v1/ask/voice/end`, the row's `ended_at`), by the post-call webhook
(door D), or by expiry: a row whose token has expired opens nothing. A new conversation on the same thread is a new
row. The `voice` rate bucket is new (`rate-limit.ts RATE`): 30 sessions an hour a person, named by what it does.

### 3.2 B. The voice-session door (edge, signed)

`POST /api/admin/voice/session`, an admin door like `llm`, `steer` and `whisper` (`adminDoor`, `authorizeAdmin`):
the dashboard's token names the workspace and the person. It holds the provider's keys, as the edge holds every
provider's: `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` (`apps/edge/lib/env.ts`, rows of the flag registry with
Ruben as owner, `contracts/ai/flags.ts`). It:

1. Asks `mayUseModelFor("ask", tenant)` first: a paused, ended or unbilled workspace spends nothing (402, as `llm`
   answers it).
2. Mints the WebRTC conversation token for the private agent, `GET /v1/convai/conversation/token?agent_id=…` with
   `xi-api-key`, which answers `{ token, conversation_id }` (sources §2), through a new port
   `packages/channels/src/voice/elevenlabs.ts` over `providerFetch`, with the outcome rules every port has (`ok`,
   `rejected`, `unreachable`); a 429 (`concurrent_limit_exceeded`, `rate_limit_exceeded`, `system_busy`, sources §9)
   is `unreachable`, and the dashboard's route says so. A signed URL (WebSocket) is the text-only transport and is not
   minted (sources §2, §7).
3. Writes nothing of its own: the row is the dashboard's; the minutes come back through door D.

### 3.3 C. The brain door (dashboard, called by ElevenLabs)

`POST /api/ask/voice/llm`: the custom LLM endpoint the agent is configured with. A raw route outside `withRoute`,
like `/api/version` (`apps/dashboard/app/api/version/route.ts`), served by a catch-all segment
(`app/api/ask/voice/llm/[[...rest]]/route.ts`) so it answers at the bare path and at `…/chat/completions` and
`…/v1/chat/completions` too, since no page says whether ElevenLabs appends a suffix to the configured URL (sources
§1); the first path seen is logged once. Its path is added to the proxy's `PUBLIC_PATHS` (`apps/dashboard/proxy.ts:36`)
so the gate lets a request with no cookie reach it. It is a fifth door in `docs/architecture.md`'s list: **provider
to dashboard**, and its credential is two things at once:

- **The agent's secret.** A static header the agent is configured to send with every custom LLM request
  (`custom_llm.request_headers`, `x-chanlytics-agent`, its value a workspace secret; sources §1), held on the
  dashboard as `ELEVENLABS_LLM_SECRET` (required in production) and compared in constant time. The door also reads
  `Authorization: Bearer` for the same value, because which header the agent's `api_key` field rides in is unstated;
  the spike reads off the first request which arrived and the other is dropped. Without it the door answers 401
  before reading a byte of the body.
- **The session's id.** `elevenlabs_extra_body.chanlytics_session`, from the browser's `customLlmExtraBody` (sources
  §1). The door reads the row on the service client (service-role territory, `server/service-db.ts`: a read that
  crosses from a provider, with the id as the only key), refuses a row that is ended or whose token has expired,
  decrypts the token, verifies it exactly as a bearer request is verified (`verifyBearer`: `getClaims` over the token,
  a client that reads no cookie) and resolves the member of the row's workspace with the same membership read
  `write()` makes for the workspace scope. `user_id` in the request is a label, never identity. Then
  `takeRate(userId, "ask")`: a voice turn is a turn.

**One turn, however many requests.** The spike measured the vendor's clock (the spike note, runs B1 to B9):
`cascade_timeout_seconds` is the longest gap it allows between two chunks with speakable text, 15 s at most (a
higher value is refused). A request that goes quiet for longer is aborted and sent again, three times in all, each
attempt's partial text stitched into one transcript, and after the third the socket closes with 1002
`custom_llm_error: LLM Cascade Error: TimeoutError` and the conversation is over. A chunk with no content, or a
space, does not restart the clock; the vendor's own buffer words, `"... "`, do, and in voice they are a pause. So
the door never lets 10 s pass without speakable text: the first trace leaves at once, every later trace as it
happens, and when nothing has gone out for 10 s the door sends `"... "` (the pulse), which the Line's chat drops.
ElevenLabs may still send several requests with the same context inside one turn (sources §1), and a retry carries
the earlier attempt's partial text as an `assistant` message, so the door claims the turn before running it: one
`UPDATE ask_voice_sessions SET turn_key = $key,
turn_started_at = now() WHERE id = $session AND (turn_key IS DISTINCT FROM $key OR turn_started_at < now() -
interval '45 seconds') RETURNING id` on the service client, where `$key` is the sha256 of the last user message's
text. The request that gets a row owns the turn and runs it. Any other request with the same key follows the thread
instead: it polls `ask_messages` for the assistant turn stored after the claim (every 300 ms, inside the turn's
budget), streams that turn's `say` when it lands, and until then sends the pulse. No stream is ever ended empty: an empty answer is a documented failure that triggers a retry, so a
refusal still speaks its words. `speculative_turn` stays false on the agent.

**The turn.** The request's `messages` are the agent's own history; the door takes **only the last user message**
(the transcript of what was just said) and ignores the rest: the thread is Ask's memory, replayed warm or cold by
`threadForTurn` as today, and the agent's copy of the conversation is never read back. It calls the shared turn
(section 3.4) with `spoken: true`, the row's thread, surface, scope, context and language, and streams:

| Turn event (`TurnEvent`) | What the door sends |
|---|---|
| `trace` (a read runs, with its label) | The label as a short spoken chunk, each time a read starts ("Reading today… ", "Checking the calendar… "), ending with an ellipsis and exactly one space as the custom LLM page's buffer-words technique has it (sources §1), so the first word lands within about a second even when a read runs, with words that are true. |
| quiet (10 s with nothing speakable sent) | `"... "`, the vendor's buffer words: a pause in voice, nothing in the chat; it keeps the vendor's 15 s clock from cutting the request (the spike note, runs B5 to B9). |
| `say` previews (every 50 ms, growing) | The new suffix of `headline`, then of `detail`, as `chat.completion.chunk` deltas; a preview taken back (empty) sends nothing. |
| `final` | Whatever suffix the final `say` holds that the previews did not; then a chunk with `finish_reason: "stop"` and `data: [DONE]`. The turn is stored first (the same `content` the route writes), so the Line's read of the thread finds it. |
| `error`, a gateway refusal | The refusal's words in the person's language (`refusalText`), spoken; the turn stored as the route stores a failed one. |

The response is `text/event-stream` in the chat-completions chunk shape the sources quote: `id`, `object:
"chat.completion.chunk"`, `created`, `model`, `choices[0].delta.content`, `index`, `finish_reason` (sources §1).
`maxDuration = 60` as `/api/v1/ask`. No system tool is configured on the agent (an API-created agent gets none,
sources §1), so `tools` never arrives and the door never returns a function call; a conversation ends by the
person's End, the turn timeout, or the agent's `max_duration_seconds`. Whether ElevenLabs aborts the in-flight
request when the person cuts in is UNKNOWN (sources §1, §5); the door runs the turn to its end anyway, inside
`ASK_TURN_BUDGET_MS`, and the claim above keeps a retry from running it twice: an answer is stored whole or not at
all.

### 3.4 The turn, shared and spoken

Two changes to Ask, both small.

**One turn, two doors.** The body of `POST /api/v1/ask` from "the thread, before anything else" to the stored
message (`route.ts:168-262`) moves to `server/ask/turn.ts` as `askTurn(ctx, member, ask, emit)`, and the route calls
it: the route keeps its JSON lines and its body parsing; the door calls the same function with the transcript. Proven
as a pure move: the route's tests pass byte-equal, and `turn.ts` is the one place a turn is kept, so the two doors
cannot drift (the one-derivation rule).

**A spoken register.** `TurnInput.spoken?: boolean` reaches `turnWords` (`prompt.ts:351`) as one more line of the
turn's words, after the page's breakpoint, so it costs no cache:

> They are listening, not reading. Open with a short clause and a comma, then what matters first in one breath, in
> say.headline; say.detail may run to three short sentences when they asked for a summary, a reason or detail, and
> is empty otherwise. Say a name as a name and a time or a count as the page shows it; never an id, a route, a
> symbol or a bracketed tag. Every figure and row goes in show, where the screen draws it.

The comma is not style: the agent starts speaking once it has enough words and a comma from the model (sources §5),
so a long unpunctuated opening delays the voice. Digits stay digits because the agent's text normaliser is set to
`elevenlabs` (section 3.7), which reads "12%" and "3:30" aloud and leaves the thread's text clean (sources §6). The
caps stand (160 and 700 characters: forty-five seconds at most). The language is the session's, chosen as section
3.5 says; the transcript's own guess (`detectLanguage`) stays as the fallback it is today. `AskTurnShape` gains
`spoken: true`, so the day's numbers can be read by mode (`tooling/scripts/ask-day.mjs`). The model is the
deployment's profile (Opus 5.5 by default, low effort); the gate re-runs with spoken cases (section 7).

### 3.5 The Line, listening

> **Amended 4 Oct 2026, after a day on production.** Of 23 conversations Ruben started that morning, every one minted
> and connected, and 19 ended inside nine seconds, by the browser (`Client disconnected: 1000`), before the brief had
> begun: Today's Listen opened a two-way conversation, typed "Brief me on today" at the model (two Opus rounds and about
> 61k cached tokens for words the page already drew, nine to ten seconds to the first word), and a second tap on a button
> that already read Stop hung up; an agent that could not start handed the words to the browser's own synthesis, which
> read them in a robotic voice and hid the failure; and the row's end said "stopped" for every cause alike. What changed:
>
> - **Two pipes, one voice.** Today's Listen and an answer's Read aloud are the **one-way speech**: the words on screen
>   (the brief's line; an answer's `say`, its headline then its detail, never the figures) go to `POST /api/v1/ask/speech`
>   (`text`, `purpose`), which asks the edge's door E, `POST /api/admin/voice/speech` (the signed admin token, the spend
>   check the mint makes, the key), for the vendor's text-to-speech stream (`/v1/text-to-speech/{voice}/stream`, Flash
>   v2.5, MP3, the vendor's normaliser on) and streams it back as the clip; the browser plays it from a Blob through one
>   `<audio>` the bridge owns (`legacy-bridge/ask/speech.ts`), never a pane's, so a pane drawn again finds it playing and
>   a pane gone leaves it to finish. No agent, no microphone, no session row, no thread; the first word in about a
>   second. The Ask line's mic alone opens a **conversation** (below), and the agent speaks its own first words.
> - **No fallback voice.** The browser's synthesis is gone. A clip that cannot be made says why beside the button, in
>   the server's words (a paused workspace, a vendor down), and nothing else speaks.
> - **The row says how it went** (00300): `end_reason` (contracts `VOICE_END_REASONS`: `button`, `typed`,
>   `superseded`, `navigated`, `vendor`, `start`), `connect_ms` and `first_audio_ms` as the browser measured them from
>   the tap, written on the end (POST ask/voice/end; a word outside the set, an older bundle's, ends the row all the
>   same and is kept on the log alone, so either app may deploy first; the migration goes before the dashboard, since
>   the end writes the columns). The vendor erases its record after the call (door D), so the row is the one record;
>   the voice doctor reads it (runbook).
> - **The agent speaks first.** `first_message` is "I'm listening.", protected from interruption; the browser overrides
>   nothing of the agent but the session it hands it (the language and the first message were overridable, and the live
>   agent allowed a text-only override the spec forbade). Patient turns; a silent call ends after twenty seconds,
>   before the agent would ask the brain again at twenty-five (the two were a tie, and which fires first the vendor does
>   not say; whether the end's clock counts the agent's own speaking is unstated too, so the dev agent's first mic run
>   measures it); background-voice detection, the listener's words ignored, the vendor's transcript readers off: §3.7 as
>   amended. The voice and its model are contracts' one pair, `ASK_VOICE_ID` ("Mark - Natural Conversations", Ruben's
>   pick) on `ASK_VOICE_MODEL` (Turbo v2: the vendor holds an English agent to Turbo v2 or Flash v2, and this voice is
>   high quality on Turbo), read by the agent's config and the speech door alike, so a brief and a spoken answer sound
>   the same.
> - **One voice at a time**, held where the two pipes are composed (`legacy-bridge/ask.ts`): a clip ends the
>   conversation it would talk over (an open microphone would hear the brief and the agent answer it), and a
>   conversation ends the clip.
> - **The mic says what it is doing:** Connecting (a tap cancels), then End; the Line's Read aloud says it is getting
>   the voice, then Stop. Typing ends the conversation as before, and now says so (`typed`).
> - **A question spoken is answered aloud** (Ruben, 4 Oct, the vision's (b)): a question the recogniser heard (the mic
>   held, a Space held, a phone's three held) marks its turn, and when that turn's answer lands the Line reads the
>   answer's words through the one-way speech by itself, as a press on Read aloud would; a typed question stays quiet,
>   and Read aloud is still there for it. Stop, typing and Clear end the clip as they end any.
> - **What the vendor keeps of the speech:** the words of each clip go into the vendor's text-to-speech history (every
>   answer carries a `history-item-id`; measured 4 Oct), under the account's retention; zero retention is an Enterprise
>   switch. A brief names customers. Deleting each history item after the clip is §8's follow-up, and until then this is
>   a fact for Ruben to know (§9).
>
> What follows is the design as first built, kept for the conversation pipe, which it still describes; where it says
> Today's Listen or Read aloud starts a conversation, or that the device's voice reads where the agent cannot, the
> amendment above is the truth.

`legacy-bridge/ask/voice.ts`, beside `speech.ts`, is the one module that knows ElevenLabs' client: the plain
`@elevenlabs/client` (React v1 would need a `ConversationProvider` around the Line, sources §4). It is loaded with
`import()` on the first tap, so the workspace route's budget (`tooling/scripts/checks/bundle-budget.mjs`) does not
carry the SDK and its LiveKit transport for a person who never speaks. It exposes to the Line, through `window.__ask`
as `speech` does:

- `startVoice({ threadId, scope, surface, context, language, first? })` → door A, then
  `Conversation.startSession({ conversationToken, connectionType: "webrtc", customLlmExtraBody: { chanlytics_session },
  userId: session, overrides: { agent: { language, firstMessage? } } })` (the option names are the package's,
  `BaseConnection.d.ts:39-73`). `language` is the Line's remembered language (`palette.rememberLanguage`), sent as
  the per-session `agent.language` override, which fixes the agent's ASR and TTS language for the conversation
  (sources §6). `first` is Read aloud's: the answer's `text` as `agent.firstMessage`, spoken on connect (sources §7;
  its length limit is UNKNOWN and the spike reads it; a text past the limit falls back to `speech.ts`).
- `stopVoice()` → `endSession()`, then door A's end.
- `canVoice()` → a microphone and a secure context are at hand; false where they are not, and the Line keeps today's
  hold-to-talk and Web Speech.
- `pageMoved(context)` → door A's page route (section 3.1).
- The SDK's callbacks (`types.d.ts:97-174`), mapped onto what the Line already draws:

| Callback | The Line |
|---|---|
| `onMessage` with a `user_transcript` | The question as a user message, and `setLive({ q })`: the three think. The hold-to-talk's `onHeard` did this. |
| `onAgentChatResponsePart` (`start`, `delta`, `stop`) and `onMessage` with an `agent_response` | The say as `live.say` (what Read aloud reads today); the three speak. |
| `onVadScore` | `M.mood.hear(score)`: the three listen to the person. |
| `getOutputVolume()` on the character's tick while `mode` is `speaking` | `M.mood.voice(level, true)`: the three move to the voice (`character.ts voice`). |
| the part's `stop`, confirmed by `agent_response_complete` read through `onIncomingEvent` | `GET /api/v1/ask/threads/:id` once; the stored turn replaces the live one: show, citations, cards, as a typed turn lands (`arTurnLanded`). Which of the two marks the end of speech rather than of generation is UNKNOWN (sources §3) and the spike settles it. |
| `onInterruption` (keyed on the event, never its payload, which two pages give differently) | The live say is cut where it stopped; the stored turn stays whole; the three listen. |
| `onAgentResponseCorrection` | The words actually spoken, kept on the drawn turn as "stopped after …" (V2 draws it; V1 keeps it). |
| `onModeChange`, `onStatusChange` | `useArMood` gains the SDK's `mode` beside `speech.speakingId`. |
| `onError`, `onDisconnect`, a failed `startSession` | Back to the typed Line, in silence; the toast only where the person did something (`flash`, once); `ask_voice_refused` logged with the reason, whether it came at the mint or at the connection (sources §9 leave that unstated). As built (3 Oct): where the person asked for words read, Today's Listen and an answer's Read aloud, an agent that could not start hands the same words to the device's own voice instead, quietly; only a device with no voice of its own sees the refusal's words. |

**The client's worklets (as built, 3 Oct).** In WebRTC mode the client still loads an AudioWorklet for its output
analysis, from a blob: URL and then a data: URL, which the dashboard's script-src refuses; the audio setup then fails
and the connection goes down a second after it is up (seen in Chrome). The two worklet sources are served from the
dashboard's own origin (`apps/dashboard/public/voice/`, written from the installed client by
`tooling/scripts/voice/vendor-worklets.mjs`, held equal by `voice-worklets.test.mjs`) and the voice module hands the
client their paths (`workletPaths`), so script-src stays as it is. Silence: after `turn_timeout` the vendor asks the
model with "..."; the door answers "I'm here." and runs no turn.

**Entering and leaving.** The mic's tap starts a voice conversation (a hold stays today's push-to-talk where the SDK
cannot run; as built, where Ask can talk a press waits the tap's beat, 300 ms, before it dictates, so a tap never
touches the recogniser and a finger still down when the beat ends is the hold); Today's Listen starts one and sends "Brief me on today" through `sendUserMessage` once connected, which
the events page says triggers the same response flow as spoken input (sources §7), so the brief is Ask's answer
spoken; Read aloud starts one with the answer as the first message. The agent's own `first_message` is empty, so it
waits (sources §7). Typing ends it. Esc ends it. Closing the Line ends it.

**What stays:** `AskActs`' Copy; the cards and their commit (`commit.ts`, through the verbs' routes with the cookie);
the thread list; the warm; `ask/openings`' quick answers (a quick question asked by voice still goes to Ask: the
quick path is the typed field's).

### 3.6 D. The post-call webhook (edge, provider door)

`POST /api/elevenlabs-webhook`, the first door of this kind for ElevenLabs beside the four provider doors
(`docs/architecture.md`). It takes `post_call_transcription`, verified by the `elevenlabs-signature` header with the
vendor SDK's `constructEvent` or the algorithm the spike proves (the pages do not spell it out, sources §8), answers
200 first and works after, and is idempotent on `data.conversation_id` plus `event_timestamp` (retries come up to
five times with the same payload). It matches the session by `data.conversation_id` alone (written at mint: the
token endpoint answers the conversation's id with the token, so every row has it; as built, the fallback by
`chanlytics_session` the draft named is not needed and is not read); it writes `ended_at` and
`duration_s` from `metadata.call_duration_secs`, logs `ask_voice_session_ended` with the minutes and the per-turn
`conversation_turn_metrics` (`convai_llm_service_ttfb`, `convai_llm_service_ttf_sentence`: the door's own first-byte
and first-sentence times, measured by the vendor for free), and then calls `DELETE /v1/convai/conversations/{id}`
through the port, so the vendor keeps the conversation no longer than it must (what the delete removes is unstated,
sources §8; retention is set regardless, section 3.7). The transcript is not stored again (the thread has it) and the
audio is never fetched.

### 3.7 The agent, as code

> **Amended 4 Oct 2026.** Two agents from one body, `tooling/scripts/voice/elevenlabs-agent-config.mjs`: production's
> `chanlytics-ask` (the id production's edge names) and a laptop's `chanlytics-ask-dev` pointed at a tunnel, each with
> its own header secret; `--set-url` refuses the production name. `--apply` sends the whole body, reads the agent back
> and exits 1 on any field that differs (`agentDrift`), so a vendor default can no longer survive an update; `--check`
> does the read-back alone. The body, against the first one: `first_message` "I'm listening." with
> `disable_first_message_interruptions`; `turn_eagerness: patient`, `turn_timeout` 20, `silence_end_call_timeout` 20,
> `max_duration_seconds` 600 and `max_duration_seconds_after_last_agent_message` 60 (a field the live agent carries and
> the public schema does not name; a refusal is the signal to drop it); `vad.background_voice_detection` on;
> `interruption_ignore_terms` (okay, yeah, sí, ajá and their kin) merged with the vendor's defaults; `tts.voice_id`
> contracts' `ASK_VOICE_ID` on `ASK_VOICE_MODEL` (`eleven_turbo_v2`); every `conversation_config_override` false (the
> language and the first message included) but `custom_llm_extra_body`; `file_input`, `topic_discovery` and
> `sentiment_analysis` off. `silence_end_call_timeout` 20 under `turn_timeout` 25, so the end comes before the re-engage
> (the first body tied them at 20). The drift check compares a list of plain values as a set, since the vendor returns
> the events and the merged ignore terms in its own order. The brain wiring, the client events, the privacy switches and
> the limits are as below.

As the receptionist's Retell agent is provisioned and converged from code, the ElevenLabs agent is: one script,
`tooling/scripts/voice/elevenlabs-agent.mjs`, idempotent, dry-run by default, that creates or updates the one agent
and reads every field back, so the console is read and never written by hand. What it sets (the field names are the
create-agent reference's, sources §1, §2, §5, §6, §8, §9):

- `platform_settings.auth.enable_auth: true` and **no allowlist**: a conversation starts only with a token the edge
  minted, and the authentication page says not to combine the two (sources §2).
- `conversation_config.agent.prompt.custom_llm`: `url` (`https://<CANONICAL_HOST>/api/ask/voice/llm`), `api_type:
  chat_completions`, `request_headers: { x-chanlytics-agent: <secret> }`; `cascade_timeout_seconds: 15` (the ceiling
  the vendor allows; it is the longest gap between two speakable chunks, and the door's pulse keeps every gap under
  10 s, section 3.3). The agent's `temperature`, `max_tokens` and reasoning fields are irrelevant to the door and left at their
  defaults. `prompt.prompt` is one line: it is Ask's mouth; every word it says comes from the model it is wired to.
  `first_message` empty. `language: en`.
- No tools, no knowledge base, no MCP server, no workflow, no agent transfer (sources §12). `end_call` is not added.
- `platform_settings.overrides`: `custom_llm_extra_body: true`, `conversation_config_override.agent.language: true`,
  `conversation_config_override.agent.first_message: true`; every other override `false`, so a tampered browser can
  change neither the prompt nor the model nor the tools (sources §2).
- `conversation_config.conversation.client_events`, explicitly: `audio`, `interruption`, `user_transcript`,
  `agent_response`, `agent_response_correction`, `agent_chat_response_part`, `agent_response_complete`, `vad_score`,
  `ping`, `conversation_initiation_metadata` (no page states the default set, sources §3). **`audio` gates the agent's
  speech, over WebRTC too** (amended 4 Oct 2026): without it the agent sent its words as text and silence on the
  wire (inbound energy 1e-8, no `speaking`, measured on a bare page with the SDK's own stats), and seven production
  taps that day heard nothing; with it the same voice and model spoke in 1.6 s. The sources' "audio only where the
  transport is WebSocket" was wrong.
- `conversation_config.turn`: `turn_eagerness: normal`, `turn_timeout: 7`, `speculative_turn: false`, `turn_model:
  turn_v3`, `soft_timeout_config: { timeout_seconds: -1 }` (the platform's own filler is off, as built 3 Oct: the
  review found its words reaching the chat as the answer's headline, since the vendor streams the filler as a response
  part; instead the brain door speaks its own first words, "One moment… ", when nothing speakable has gone out
  ASK_VOICE_FIRST_WORDS_MS after the turn began, which the chat draws as a trace, as it draws a read's label).
  `conversation.max_duration_seconds: 1800` with a `max_conversation_duration_message`, since the default of 600
  ends a conversation without a word (sources §5).
- `conversation_config.tts`: `voice_id` (Ruben's pick, section 9), `model_id: eleven_flash_v2_5` (about 75 ms, 32
  languages, listed for agents; `eleven_v4_turbo` is the step up to 90+ languages, sources §6), `text_normalisation_type:
  elevenlabs`, `expressive_mode: false`, `enable_phoneme_tags: false`, no `supported_voices`.
- `conversation_config.asr`: `provider: scribe_realtime` (the default), `user_input_audio_format` as the SDK sends it;
  `keywords` are V2 (the workspace's services and names, up to 50, as a per-session override).
- `platform_settings.privacy`: `record_voice: false`, `retention_days: 7` (an explicit number: the pages disagree on
  the default, and 0 is undefined), `delete_audio: true`; `zero_retention_mode` if the account is eligible, which
  is UNKNOWN (sources §8).
- `platform_settings.call_limits`: `agent_concurrency_limit` at the plan's number, `daily_limit` explicit,
  `bursting_enabled: false` (burst doubles the rate and is on by default, sources §9); no queueing.
- `platform_settings.workspace_overrides.webhooks` (or the post-call webhook setting as the reference names it):
  door D's URL, `post_call_transcription` only, no audio webhook.
- No success evaluation and no data collection: both send the transcript to a second ElevenLabs-run model (sources
  §10).

Its id is `ELEVENLABS_AGENT_ID`. A laptop needs a public URL for the door, so the spike runs a second, throwaway
agent pointed at a tunnel; production has one.

## 4. Latency, measured and stated

| Step | Figure | Where |
|---|---|---|
| Ask's first words, Opus 5.5, low effort, with tools (23 Sep) | 2.2–2.3 s median | `ask-model.ts` header |
| ElevenLabs Flash v2.5 text-to-speech stream, first byte (2 Oct, from Ruben's machine) | 0.22 s | the analysis note |
| The vendor's stated parts: orchestration, Scribe v2 realtime, Flash v2.5, v4 Turbo | under 100 ms, about 150 ms, about 75 ms, about 100 ms | sources §5, §6 (the first from the vendor's blog; no page states a round trip) |

Expected first spoken word after the person stops: about **1 s when a read runs** (the trace is spoken while the
read runs), about **2.5–3 s** for a turn that answers in one round from the page's context, and the same when the
thread is warm (the chain's cache); the platform's filler covers the gap past three seconds. The vendor hides
nothing of Ask's own time; the levers are Ask's: the page warmed before the first question, low effort, `say` first
with an early comma, the trace spoken. In production the vendor measures the door for free: `convai_llm_service_ttfb`
and `convai_llm_service_ttf_sentence` per turn, logged by door D. The spike (section 7) measures all of it before
the design is held to it.

## 5. What a turn costs, and who pays

Free to the workspace, as Ruben decided: no metering, no ledger of minutes against a plan. The platform still
bounds it, as it bounds Ask's tokens:

- `rate: "ask"` on every voice turn and `rate: "voice"` on sessions (section 3.1), per person;
- `mayUseModelFor("ask")` before a token is minted;
- the agent's own `agent_concurrency_limit` and `daily_limit`, with burst off (section 3.7): a refusal, at the mint
  or at the connection, falls back to the typed Line in silence and logs `ask_voice_refused` with the reason, so the
  plan can be read off the log before anyone notices;
- the usage ledger keeps the model's dollars as today (`ai_usage`, purpose `ask`); the minutes are on the session
  rows for the platform's own eye (`ask_voice_sessions.duration_s`), never on a bill.

At $0.08 a minute (silence past ten seconds at five percent of it, sources §9) and a day of two minutes per
workspace, fifty workspaces are about $176 a month of voice; the LLM is the same Ask spend as typed turns. Whether a
custom LLM carries any ElevenLabs model fee is UNKNOWN; the spike reads `charging.llm_charge` and `cost_fiat` off its
first conversations. Starter's 75 minutes prove the design; Pro is the step before customers lean on it.

## 6. Security and privacy

1. **The member's token at rest.** A live access token in a table is a new kind of secret in the database. It is
   encrypted with a server secret the database does not hold, lives at most an hour (`token_expires_at`), opens
   nothing once the session ends (door D or the browser's end: the brain door refuses an ended row before it opens
   the cipher), and the row, cipher included, is swept the day after the token expires with the other sweeps
   (`reference_new_cron_sweep_checklist`; as built, the end marks the row and the sweep deletes it, so a cipher of
   an expired token can sit for a day, which opens nothing). A read of the table alone yields nothing usable; a read of the table and
   the dashboard's environment is the dashboard itself.
2. **Two credentials at the brain door.** The agent's static secret proves the caller is our agent; the session's id
   proves which member. Neither alone opens it. The id is 256 bits from `crypto.randomBytes`, stored hashed. It is a
   bearer capability for the life of the session, carried by the browser and by the vendor; it opens one door, for
   one member, until the row ends.
3. **What the vendor keeps.** The transcript of what the person said and the words Ask spoke back, which name
   customers, plus everything the browser sent at the start (the extra body's opaque id, `user_id`, the language) and
   the agent's prompt text, in its conversation record for the retention window and in the webhook (sources §2, §8).
   Nothing else of ours reaches it: the custom LLM request carries no customer data from us beyond the spoken answer,
   and no dynamic variable is sent. Audio is not recorded, retention is seven days, and door D deletes the
   conversation once its minutes are written. Zero-retention mode, which would keep even the transcript from being
   stored, has UNKNOWN eligibility (sources §8).
4. **No key in the browser.** The API key stays on the edge; the browser holds a conversation token good for ten
   minutes to start one conversation. The dashboard's CSP (`apps/dashboard/src/csp.ts:93`, `connect-src 'self'` plus
   Supabase) gains the agent's origins, named once there: `wss://api.elevenlabs.io` and the WebRTC signalling host
   for the default region, which no page gives and the spike reads off its network log (sources §2, §4).
5. **The thread is the record.** `ask_messages` under RLS, own rows, as today. The vendor's transcript is a copy we
   never read; the post-call webhook writes a duration and the turn metrics, nothing of what was said.
6. **The proxy's exemption** is one exact path, not a prefix, with the door's own two checks in front of it, and
   `tooling/scripts/tests/auth/auth-gate.test.mjs` names it as the one `/api/ask/…` path outside the wrapper and
   why.

## 7. Proof

- **The spike, first (two days, throwaway, not merged).** One throwaway agent pointed at a tunnel, a hand-rolled
  brain door that streams `say`, the SDK in the Line. It answers, in this order, the ten things the sources could
  not: (1) which header the agent's secret arrives in, and whether a path suffix is appended to the URL; (2) that
  `customLlmExtraBody` arrives as `elevenlabs_extra_body`; (3) seconds to the first spoken word with the trace, with
  the filler, and with neither; (4) what `cascade_timeout_seconds` measures, by watching for retries; (5) whether the
  in-flight request is aborted when the person cuts in, and that `interruption` fires; (6) which of the part's `stop`
  and `agent_response_complete` marks the end of speech; (7) the WebRTC signalling host, for the CSP; (8)
  `charging.llm_charge` on a custom LLM conversation; (9) the first-message length limit, for Read aloud; (10)
  whether WebRTC runs in iOS Safari. Its code is not kept; its numbers go in section 4 and its answers into sections
  3.3, 3.5 and 3.7.
- **Route tests.** The brain door over the fake database and a scripted turn (`setAskPorts`): the secret missing →
  401; the id unknown, ended or expired → 403; a good request → the chunk stream in order (trace, say suffixes,
  stop) and the turn stored as the route stores it; two requests with the same session and words → one turn run,
  the second stream fed from the thread; an empty `messages` → a spoken refusal, never an empty stream. The pure move
  of `askTurn` → the route's existing tests pass unchanged.
- **The agent's contract.** One test holds the exact request shape the sources quote (§1) against the door, so a
  change in the vendor's shape is found by a test, not a silent conversation. The vendor's own agent tests are for
  the shell alone (greeting, barge-in): they carry no session id and the door refuses them (sources §10).
- **Evals.** `tooling/scripts/eval-ask.mjs` gains spoken cases: the same questions with `spoken: true` through the
  door, judged for a `say` that reads aloud (an early comma, no ids, no routes, no tags), under the caps, with `show`
  still populated; the first chunk's time is the first-words number. The gate runs on both profiles (Opus 5.5,
  Sonnet 5), as every phase's gate does.
- **The three.** `useArMood`'s pure part gets a case per agent mode.

## 8. What waits (V2 and later)

1. **A spoken yes.** A short affirmative after a pending card commits it. The commit walks the card's spec in the
   browser through the verbs' routes (`commit.ts`); a voice turn can do the same, since every `/api/v1` route takes a
   bearer, once the door is proven. Not in V1: an act by voice needs its own test set.
2. **Speech Engine** if the measured first word is too slow or the duplicate requests prove costly: the vendor
   opens one WebSocket per conversation to our server, sends the full history on every turn, cancels the in-flight
   turn on an interruption, signs with a short-lived JWT, and costs the same $0.08 a minute (sources §11). It needs
   an always-on socket host beside the dashboard (a small service, not a Vercel function), which is the whole of why
   it is not V1. `api_type: websocket` on a custom LLM exists with no protocol page and is not built on.
3. **Language by ear.** The `language_detection` system tool, which switches the agent's ASR and TTS mid-conversation
   only when the door returns that function call (sources §6); V1 fixes the language per session. Since 4 Oct 2026 the
   agent is English alone (no override, no preset): a Spanish session is a `language_presets` entry on Flash v2.5 with
   a native voice from the library (Magnitudo, Aurelio, Ramiro, Natalia are in it), when Ruben asks for it.
4. **Hands-free on a phone.** After each answer the microphone reopens for a beat. The app's WebView route to WebRTC
   is UNKNOWN; the React Native SDK needs a development build with the LiveKit modules and the microphone permission
   strings (sources §4), so it is an app release. Mobile Safari is measured in the spike.
5. **What was spoken** drawn on the turn after an interruption (`agent_response_correction`).
6. **ASR keywords** per session from the workspace's services and names (up to 50), once a misheard service shows
   up in the transcripts.
7. **The door speaks only when it should** (4 Oct 2026): latest-wins on a request whose words extend the turn in
   flight (a paused question ran two Opus turns); `skip_turn` for silence and room talk and `end_call` on a goodbye,
   once a spike settles how the door streams a function call (the vendor documents no streamed encoding).
8. **The clip cached by its text**, so a brief replayed is instant and free; the speech bucket counting clips that
   played, not clips asked for; and each clip's `history-item-id` deleted at the vendor once it has played
   (`DELETE /v1/history/{id}`), as door D erases a conversation, since a brief names customers.

## 9. Decisions for Ruben

1. **The voice.** DECIDED 4 Oct 2026: "Mark - Natural Conversations" from the account's library (contracts
   `ASK_VOICE_ID`), for the agent and the one-way speech alike. (River, the spike's, was the premade default.)
2. **Stick for the thread until typing**, as section 2 proposes, or a tap per answer. DECIDED 4 Oct 2026: stick, and
   Today's Listen is not a conversation at all (§3.5 as amended).
3. **Retention at the vendor:** seven days with audio off and a delete after each conversation (proposed), or longer
   to listen back.
4. **The plan:** Starter for the spike and the proof, Pro before customers lean on it; burst off (proposed) or on.

## 10. Files

New: `apps/dashboard/app/api/v1/ask/voice/route.ts`, `…/voice/page/route.ts` and `…/voice/end/route.ts` (A);
`apps/dashboard/app/api/ask/voice/llm/[[...rest]]/route.ts` (C); `apps/dashboard/src/server/ask/turn.ts` (the shared
turn); `apps/dashboard/src/server/ask/voice-session.ts` (the row, the cipher, the claim);
`apps/edge/api/admin/voice/session.ts` over `apps/edge/lib/voice/ask-voice.ts` (B; the admin folder holds its
twenty, so the door lives under `admin/voice/` as the WhatsApp doors live under `admin/whatsapp/`);
`packages/db/src/ask-voice-session.ts` (the row, at the package's root: `repositories/` holds its twenty too);
`apps/edge/api/elevenlabs-webhook.ts` (D);
`packages/channels/src/voice/elevenlabs.ts` (the port: mint, delete, the webhook's verification);
`supabase/migrations/00287_a_voice_conversation_keeps_its_member.sql` (00285 and 00286 are the kit branch's);
`apps/dashboard/src/legacy-bridge/ask/voice.ts` with `voice-events.ts` (the pure reader of the agent's events);
`tooling/scripts/voice/elevenlabs-agent.mjs` with `elevenlabs-agent-config.mjs`; `tooling/scripts/eval-ask-spoken.mjs`;
`docs/decisions/0026-a-provider-calls-the-dashboard.md`.

Changed: `apps/dashboard/app/api/v1/ask/route.ts` (calls `askTurn`); `server/ask/loop.ts` and `prompt.ts` (the
spoken line, `AskTurnShape.spoken`); `legacy-bridge/ask.ts` (installs voice); `legacy/pages/ask-real.jsx`,
`ask-hooks.jsx`, `ask-turn.jsx` (the mode, the mood, the acts); `surfaces/today/pages/brief-pane.tsx` (Listen →
voice brief); `apps/dashboard/proxy.ts` (the one public path); `apps/dashboard/src/csp.ts` (the two origins);
`apps/dashboard/package.json` (`@elevenlabs/client`); `apps/dashboard/src/server/env.ts`, `apps/edge/lib/env.ts`,
`contracts/ai/flags.ts` (the variables); `server/rate-limit.ts` (the `voice` bucket); `server/log.ts` and the edge's
`LOG_EVENTS` (the events); `docs/architecture.md` (the fifth door); `tooling/scripts/eval-ask.mjs` (spoken cases);
`.env.example`.

Added 4 Oct 2026 (§3.5 and §3.7 as amended): `apps/dashboard/app/api/v1/ask/speech/route.ts` (the one-way speech);
`apps/edge/api/admin/voice/speech.ts` (door E) over `apps/edge/lib/voice/ask-voice.ts` (`speakAskVoice`);
`packages/channels/src/voice/elevenlabs.ts` (`speakText`); `supabase/migrations/00300_a_voice_session_says_how_it_went.sql`;
`legacy-bridge/ask/speech.ts` rewritten over the route (the browser's synthesis gone; the module holds the state and
tells its watchers); contracts `ask/ask.ts` (`ASK_VOICE_ID`, `ASK_VOICE_MODEL`, `ASK_SPEECH_MAX_CHARS`,
`VOICE_END_REASONS`, `ASK_VOICE_TIMING_MAX_MS`); `server/rate-limit.ts` (the `speech` bucket);
`tooling/scripts/voice/elevenlabs-agent*.mjs` (two agents, the drift check); `.gitattributes` (the vendored worklets as
bytes); tests `tooling/scripts/tests/ask-voice/speech-{route,door,port,module}.test.mjs`.

## 11. Delivery

All local, uncommitted, until Ruben says the whole thing is verified (his rule of 2 Oct); then one push per PR.

1. **PR 0, the spike** (throwaway; not merged): the ten answers of section 7 and the numbers of section 4.
2. **PR 1, the ground:** the pure move of `askTurn`; the spoken line and `AskTurnShape.spoken`; the migration; the
   variables and their registry rows; the `voice` bucket; the events. Byte-equal route output proven.
3. **PR 2, the doors:** A, B, C, the port, the agent script, the proxy path, the CSP origins; route tests and the
   contract test.
4. **PR 3, the Line:** `voice.ts`, the mode, the three to the voice, Today's Listen and Read aloud onto it; the bundle
   budget raised only if the check counts the on-demand chunk (it should not: the chunk is fetched on tap).
5. **PR 4, the proof:** door D, the eval cases, the privacy switches in the script, the runbook's lines ("Voice:
   mint, speak, end"), the decision note.
6. **PR 5, the two pipes (4 Oct 2026, after a day on production):** the one-way speech for Listen and Read aloud, the
   fallback voice removed, the row's end reason and timings (00300), the agent tuned to the brain and held by a drift
   check, the mic's Connecting state. Before it merges: the dev agent converged with `--apply`, a mic run through a
   tunnel (the silence timeouts measured there: a `vendor` end with a short life while the agent was still talking is
   the sign to raise the end), a Listen on an iPhone (the element is unlocked in the press, untested on a device), Ruben
   hearing Listen and the mic. Order at the push: 00300 pushed first (dry run first; the end route writes its columns),
   then the apps in either order, the production agent created, the edge's `ELEVENLABS_AGENT_ID` set with `--force
   --value`, both apps redeployed, one Listen tap and one mic tap read off the voice doctor, the spike agent deleted.

## 12. Risks

| Risk | What holds it |
|---|---|
| The first spoken word comes at 3 s and feels dead | The spike measures before anything is kept; the trace spoken; the filler at 3 s; the warm; Speech Engine in reserve (§8.2) |
| Several requests per turn, and retries | The claim on the session row; one turn stored; the follower fed from the thread; no stream ended empty |
| Grounding: Opus 5.5 cited an unread row on the Line's gate | Unchanged by voice; the thread shows the sources; the gate re-runs with spoken cases; Sonnet 5 stays a profile |
| An access token at rest | Encrypted, an hour, refused once ended, swept the day after expiry; two credentials at the door |
| The vendor keeps what the browser sends | Only an opaque id and a language go; audio off; seven days; a delete after each conversation |
| The vendor's contract moves | One contract test with the quoted shape; the port's outcome rules; `unreachable` falls back to the typed Line |
| A ten-minute token, a 600-second default | Minted at the tap and started at once; `max_duration_seconds` set with its message |
| Concurrency on the plan | Burst off, explicit limits; a refusal at mint or connect falls back in silence and is logged; Pro before customers |
| Vercel's 60 s | A turn is bounded at 45 s today (`ASK_TURN_BUDGET_MS`); the door's `maxDuration` is the route's |
| The SDK and LiveKit in the budget | Loaded on tap; the check counts only what the page draws |
| A public path on the dashboard | Exact path, two credentials, the gate test names it |
