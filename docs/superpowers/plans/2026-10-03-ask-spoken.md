# Ask, spoken: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask becomes a voice conversation on an ElevenLabs agent whose LLM is Ask's own turn, with every voice turn landing in the Ask thread, Today's Listen and Read aloud riding on it, and the typed Line untouched.

**Architecture:** Three new doors (a cookie route that starts a voice session and carries the member's access token, encrypted, to a row; an edge door that mints the agent's WebRTC token with the provider key; a vendor-called brain door that verifies the agent's secret plus the session id, claims the turn, runs `runAskTurn` as the member under RLS and streams `say` as OpenAI chat-completion chunks) and one vendor webhook on the edge. The turn itself moves out of the route into one shared function; the only change to Ask's prompt is one per-turn line. The Line gains a lazily loaded module over `@elevenlabs/client`.

**Tech Stack:** Next.js 16 route handlers (Node runtime, SSE), Supabase (RLS, one migration, service client for the vendor-called read), the edge's admin doors and provider doors, `packages/channels` `providerFetch` ports, `@elevenlabs/client` ^1.26.0 (WebRTC via LiveKit), Node's test runner over `_fake-db.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-03-ask-spoken-design.md` (sections cited as "spec §N"); sources in `docs/superpowers/specs/2026-10-02-ask-voice-primary-sources.md` ("sources §N").

## Global Constraints

- The lane lives in its own worktree `cm-ask-voice` from `origin/main`; commits are local on its branch and **never pushed, no PR opened, until Ruben says the whole thing is verified** (his rule of 2 Oct). The `:3300` tree (`cm-kit-threads`) is not touched by this lane except to move the two docs out of it (Task 0.1).
- Every `Agent` dispatch runs on Sonnet (`model: "sonnet"`).
- `corepack pnpm` only; Node 22+. Run a touched test file alone: `node tooling/scripts/checks/test.mjs <file>`; the suite is CI's (20 min locally). Any `.ts`-importing script: `node --conditions=react-server --import tsx --test`.
- A route under `app/api/v1` goes through `write()`/`read()` (`server/route.ts`) and `auth-gate.test.mjs` holds it there; the one exception this plan adds (the brain door) lives under `app/api/ask/` and is named in that test.
- Wire fields are snake_case (decision 0022); TypeScript names camelCase.
- Every new environment switch is a row of `packages/contracts/src/ai/flags.ts` (`flag-registry.test.mjs` goes red otherwise) with `owner: "Ruben"` and `sunset: null`.
- A new migration is numbered above the ledger's head (00285 → `00286_…`) and recorded with `node tooling/scripts/checks/migration-ledger.mjs --record`; after it, with the local stack up: `corepack pnpm gen:db-types`, `gen:schema-snapshot`, `gen:schema-sets`.
- No customer name, number or link in code or fixtures (`no-customer-in-the-code.test.mjs`); fixtures use 555-01xx numbers and example.com.
- Anything that draws or restyles in `apps/dashboard` follows the `chanlytics-interface` skill (the kit, `kit.css`, `classes.json`, the gallery entry).
- The spoken register line, the agent configuration values and the chunk shape are the spec's exact values (spec §3.4, §3.7, §3.3); copy them, never paraphrase.
- Log event names are closed sets: `DASHBOARD_LOG_EVENTS` (`apps/dashboard/src/server/log.ts:25`) and the edge's `LOG_EVENTS` (`apps/edge/lib/log-events.ts:19`).
- The ElevenLabs API key is already in this session's chat log: Ruben rotates it before it is put in any environment; the plan never prints it.

## Review Focus

1. A transcript that is empty or longer than `ASK_MAX_CHARS`: the brain door must still stream spoken words (a refusal), never a 400 or an empty stream, because an empty answer is retried by the vendor (Task 2.5, `door speaks a refusal for an empty transcript`).
2. The access token expires mid-conversation: the door answers one spoken line ("Let me reconnect.") and marks the row ended; the client restarts the session on the next tap (Task 2.5 `expired token speaks and ends`; Task 3.1 `a reconnect restarts`).
3. The same request twice, on two instances: exactly one turn stored, the second stream fed from the thread (Task 2.3 `claimTurn is first-wins`, Task 2.5 `duplicate request follows the thread`).
4. A refusal at the mint versus at the connection: both fall back to the typed Line with one log line and no toast unless the person tapped (Task 2.4 `mint refused answers the gateway's words`, Task 3.1 `start failure returns to typed`).
5. A session row that belongs to another workspace or person: the door refuses with 403 and logs nothing of the member (Task 2.5 `a foreign session id is 403`).

---

## PR 0 · The spike (throwaway, branch `spike/ask-voice`)

Nothing from PR 0 is kept. Its output is `docs/superpowers/specs/2026-10-03-ask-spoken-spike.md` (the ten answers, spec §7) and corrections to the spec. No tests; the code is deleted when the branch is.

### Task 0.1: The lane's worktree, the docs moved, the servers

**Files:**
- Create: worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-ask-voice` on branch `spike/ask-voice` from `origin/main`
- Move: `cm-kit-threads/docs/superpowers/specs/2026-10-03-ask-spoken-design.md`, `…/2026-10-02-ask-voice-primary-sources.md`, `cm-kit-threads/docs/superpowers/plans/2026-10-03-ask-spoken.md` → the same paths in `cm-ask-voice`
- Modify: `C:\Users\Ruben\Documents\Claude Projects\Claude Video\.claude\launch.json` (two entries)

- [ ] **Step 1: Create the worktree** (from the main checkout `cm-live` or any sibling): `git fetch origin && git worktree add -b spike/ask-voice "../cm-ask-voice" origin/main`, then `corepack pnpm install` and `corepack pnpm --filter "./packages/*" build` inside it.
- [ ] **Step 2: Move the three docs** with `git mv`-less moves (they are untracked in `cm-kit-threads`): move the files, then `git add docs/superpowers` in `cm-ask-voice` and commit `docs: the spoken Ask spec, its sources and its plan`.
- [ ] **Step 3: Add two launch entries** to `.claude/launch.json`: `voice-app` = `cd cm-ask-voice/apps/dashboard && node ../../node_modules/next/dist/bin/next dev --port 3305` on port 3305; `voice-signin` = `node dev-tools/live-signin.mjs 3305 #/today` on port 3398.
- [ ] **Step 4: Verify** `preview_start voice-app`, then `voice-signin`, then `http://localhost:3398/` signs the pane in to `/w/chanlytics-e2e/#/today` on :3305. If the dev server answers 500 on every route, delete `cm-ask-voice/apps/dashboard/.next` and start again (the Turbopack font fault).

### Task 0.2: A spike brain door and a spike session route

**Files:**
- Create: `apps/dashboard/app/api/ask/voice/llm/[[...rest]]/route.ts`, `apps/dashboard/app/api/v1/ask/voice/route.ts`, `apps/dashboard/src/server/ask/voice-spike.ts`
- Modify: `apps/dashboard/proxy.ts:36` (add `/api/ask/voice/llm`, `/api/ask/voice/llm/chat/completions`, `/api/ask/voice/llm/v1/chat/completions` to `PUBLIC_PATHS`), `apps/dashboard/src/server/env.ts` (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_LLM_SECRET` as `optionalText`, spike only), `apps/dashboard/.env.local`

**Interfaces:**
- Produces (spike only, in-memory): `voiceSpike.sessions: Map<string, { accessToken: string; tenantId: string; threadId: string; surface: string | null }>`.

- [ ] **Step 1: The session route** `POST /api/v1/ask/voice` (`write({ scope: workspace, role: "viewer", rate: "aggregate" })`): reads `(await ctx.supabase.auth.getSession()).data.session.access_token`, creates a thread (`createThread(ctx, tenantId, "Voice", null)`), stores `{ accessToken, tenantId, threadId }` under a random id in the map, mints the token with `GET https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=…` (header `xi-api-key`) and answers `{ session, token, conversation_id, thread_id }`.
- [ ] **Step 2: The brain door**, `export const POST = async (req: Request) => Response` with `export const maxDuration = 60`: log `voice_spike_request` with `{ path, headerNames: [...req.headers.keys()], bodyKeys: Object.keys(body), extra: Object.keys(body.elevenlabs_extra_body ?? {}) }` (names only, never values); check `ELEVENLABS_LLM_SECRET` against `x-chanlytics-agent` and `Authorization`; take `body.elevenlabs_extra_body.chanlytics_session` → the map; build the member context with `verifyBearer(accessToken)` and `memberContext(ctx, tenantId)`; take the last `user` message; run the same sequence `POST /api/v1/ask` runs (copy its body for the spike: `threadForTurn`, `appendMessage(user)`, facts, `runAskTurn` with `emit`, `appendMessage(assistant)`); stream `trace` labels as `<label>… ` chunks and `say` suffixes as chunks `{ id: "chatcmpl-ask", object: "chat.completion.chunk", created, model: "ask", choices: [{ index: 0, delta: { content }, finish_reason: null }] }`, then `finish_reason: "stop"`, then `data: [DONE]`; log `voice_spike_turn` with `{ firstTraceMs, firstSayMs, finalMs, aborted: req.signal.aborted }`.
- [ ] **Step 3: Verify by hand** with curl against :3305 (a fake request in the sources §1 shape, with the secret) that the stream arrives in order and `[DONE]` closes it.

### Task 0.3: The spike agent, from code

**Files:**
- Create: `tooling/scripts/voice/elevenlabs-agent.mjs`

**Interfaces:**
- Produces: `agentConfig({ name, url, secretHeaderValue, voiceId, webhookUrl, language }) → object` (the create-agent body, spec §3.7 verbatim) and a CLI: `node tooling/scripts/voice/elevenlabs-agent.mjs --name chanlytics-ask-spike --url https://<tunnel>/api/ask/voice/llm [--apply]` (dry-run prints the body; `--apply` creates or updates by name and prints the `agent_id`; `--read <id>` prints what the vendor holds).

- [ ] **Step 1: Write `agentConfig`** with every value of spec §3.7: `platform_settings.auth.enable_auth: true`, no allowlist; `conversation_config.agent.prompt.custom_llm = { url, api_type: "chat_completions", request_headers: { "x-chanlytics-agent": secretHeaderValue } }`, `cascade_timeout_seconds: 15`, `first_message: ""`, `language`; `platform_settings.overrides = { custom_llm_extra_body: true, conversation_config_override: { agent: { language: true, first_message: true } } }`; `conversation_config.conversation.client_events = ["interruption","user_transcript","agent_response","agent_response_correction","agent_chat_response_part","agent_response_complete","vad_score","ping","conversation_initiation_metadata"]`; `turn = { turn_eagerness: "normal", turn_timeout: 7, speculative_turn: false, turn_model: "turn_v3", soft_timeout_config: { timeout_seconds: 3.0, message: "One moment." } }`; `conversation.max_duration_seconds: 1800`; `tts = { voice_id, model_id: "eleven_flash_v2_5", text_normalisation_type: "elevenlabs", expressive_mode: false, enable_phoneme_tags: false }`; `asr.provider: "scribe_realtime"`; `platform_settings.privacy = { record_voice: false, retention_days: 7, delete_audio: true }`; `platform_settings.call_limits = { agent_concurrency_limit: 4, daily_limit: 200, bursting_enabled: false }`; the post-call webhook when `webhookUrl` is given. A field the vendor rejects on `--apply` is logged with the vendor's message and removed from the body until the sources name its home.
- [ ] **Step 2: Expose the door** with a quick tunnel (`cloudflared tunnel --url http://localhost:3305`; ask Ruben before the port is exposed) and run `--apply` with the tunnel's URL and `voiceId` River (`SAz9YHcvj6GT2YYXdXww`). Put the printed `agent_id` in `.env.local` as `ELEVENLABS_AGENT_ID`.
- [ ] **Step 3: Verify** `--read <id>` prints the fields back as set; note every field the vendor renamed or refused in the spike note.

### Task 0.4: The spike client

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/ask/voice.ts`
- Modify: `apps/dashboard/src/legacy-bridge/ask.ts` (install), `apps/dashboard/src/legacy/pages/ask-real.jsx` (a spike button beside the mic), `apps/dashboard/package.json` (`@elevenlabs/client` ^1.26.0), `apps/dashboard/src/csp.ts:93` (add `wss://api.elevenlabs.io` and whatever host the network log shows)

- [ ] **Step 1: `voice.ts`** exports `installVoice(win): { startVoice(input): Promise<void>; stopVoice(): Promise<void> }`: `startVoice` POSTs `/api/v1/ask/voice`, then `const { Conversation } = await import("@elevenlabs/client")` and `Conversation.startSession({ conversationToken, connectionType: "webrtc", customLlmExtraBody: { chanlytics_session: session }, userId: session, overrides: { agent: { language } }, onMessage, onAgentChatResponsePart, onAgentResponseCorrection, onInterruption, onVadScore, onModeChange, onStatusChange, onIncomingEvent, onError, onDisconnect })`; every callback logs its name and payload keys to the console with a timestamp; `onIncomingEvent` logs `type` only.
- [ ] **Step 2: The button**: a temporary `Voice` button in `arField` that calls `A.startVoice({ language: lang })` and, while a session runs, `A.stopVoice()`; the three get `M.mood.voice(conv.getOutputVolume(), true)` on an interval while `mode === "speaking"` and `M.mood.hear(score)` from `onVadScore`.
- [ ] **Step 3: Verify** a conversation runs end to end on :3305 through the tunnel: speak, hear Ask, see the question and the live say in the Line.

### Task 0.5: The ten measurements, and the spec corrected

**Files:**
- Create: `docs/superpowers/specs/2026-10-03-ask-spoken-spike.md`
- Modify: `docs/superpowers/specs/2026-10-03-ask-spoken-design.md` (§3.3, §3.5, §3.7, §4, §6.4)

- [ ] **Step 1: Answer, in order, spec §7's ten questions** from the door's log lines, the browser console and the pane's network log: (1) the header the secret arrived in and the path; (2) `elevenlabs_extra_body.chanlytics_session` present; (3) seconds from the end of speech to the first spoken word, five turns each with the trace, with the filler (a turn that reads nothing, slowed with a `setTimeout` of 2.5 s in the door), and with neither; (4) retries seen while the door waits 6 s, 12 s, 16 s (`cascade_timeout_seconds` meaning); (5) `req.signal.aborted` after a barge-in, and whether `onInterruption` fired; (6) the order of the part's `stop`, `agent_response_complete` and the audio's end; (7) the signalling host (CSP); (8) `charging.llm_charge` and `cost_fiat` from `GET /v1/convai/conversations/{id}`; (9) the first-message limit: `overrides.agent.firstMessage` with 200, 500 and 860 characters; (10) a session from iOS Safari.
- [ ] **Step 2: Write the spike note** with the ten answers and the raw numbers; correct the spec's sentences that each answer touches; commit `docs: the spoken Ask spike's answers` on the spike branch, then cherry-pick that commit onto the lane's real branch in PR 1 (the code stays on the spike branch).

---

## PR 1 · The ground (branch `ask-voice/1-ground`, worktree `cm-ask-voice`)

### Task 1.1: One turn, two doors (a pure move)

**Files:**
- Create: `apps/dashboard/src/server/ask/turn.ts`
- Modify: `apps/dashboard/app/api/v1/ask/route.ts:168-262`
- Test: `tooling/scripts/tests/ask/ask-routes.test.mjs`, `tooling/scripts/tests/ask/ask-turn.test.mjs` (unchanged, must pass)

**Interfaces:**
- Produces, in two halves because the route refuses a thread it cannot keep BEFORE its stream opens (an `AppError` there is a JSON refusal) and only then streams: `prepareAskTurn(ctx: RouteContext, member: Member, ask: AskTurnAsk): Promise<PreparedTurn>` (the thread kept, the question saved, the facts read) and `finishAskTurn(p: PreparedTurn, emit: (ev: AskTurnLine) => void): Promise<AskTurnDone>` (the `thread` line, `runAskTurn`, the stored answer, the `message`, the `ask_turn` log, the `final` line); `askTurn(ctx, member, ask, emit)` runs both for the voice door. `AskTurnAsk = { text: string; threadId: string | null; scope: AskScope | null | undefined; surface: string | null; context: PageContext | null; openedMs: number | null; answering: SearchAnswering | null; spoken?: boolean }`, `AskTurnLine = TurnEvent | { t: "thread"; id: string; title: string }`, `AskTurnDone = { thread: { id: string; title: string }; result: TurnResult; message: AskMessageVM }`. Nothing of the body parsing moves. (Done 3 Oct in `cm-ask-voice-1`: 22 + 109 tests unchanged, typecheck clean.)

- [ ] **Step 1: Record the route's output before the move**: run `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-routes.test.mjs` and `… ask-turn.test.mjs`; both PASS (the baseline).
- [ ] **Step 2: Create `turn.ts`** by moving the lines verbatim; the route's handler becomes: parse the body as before, then `return new Response(stream)` whose `start` calls `askTurn(ctx, member, ask, (ev) => send(line(ev)))` and sends the final line from `done.message`.
- [ ] **Step 3: Run both tests**: PASS, unchanged. `git diff --stat` shows `route.ts` shorter by the moved lines and `turn.ts` their length.
- [ ] **Step 4: Commit** `refactor(ask): the turn in one function, the route and the voice door share it`.

### Task 1.2: The spoken register

**Files:**
- Modify: `apps/dashboard/src/server/ask/prompt.ts:311-401` (`TurnFacts.spoken?: boolean`, one line in `turnWords`), `apps/dashboard/src/server/ask/loop.ts:93-131` (`TurnInput.spoken?: boolean` into `wordsBlock`), `apps/dashboard/src/server/ask/turn-end.ts` (shape), `packages/contracts/src/ask/ask-shape.ts:13` (`spoken: boolean`)
- Test: `tooling/scripts/tests/ask/ask-turn.test.mjs`, `tooling/scripts/tests/ask/ask-shape.test.mjs`

- [ ] **Step 1: Write the failing tests**: in `ask-turn.test.mjs`, `turnWords says the listening line only when spoken`: `assert.ok(turnWords({ ...facts, spoken: true }).includes("They are listening, not reading."))` and `assert.ok(!turnWords(facts).includes("listening, not reading"))`; the line is the spec §3.4 paragraph verbatim as one string constant `SPOKEN_LINE` exported from `prompt.ts`. In `ask-shape.test.mjs`, `a stored shape says spoken`: the shape of a turn run with `spoken: true` has `spoken: true`, and one without has `false`.
- [ ] **Step 2: Run** both files: FAIL (`SPOKEN_LINE` undefined; `spoken` undefined).
- [ ] **Step 3: Implement**: `export const SPOKEN_LINE = "They are listening, not reading. Open with a short clause and a comma, then what matters first in one breath, in say.headline; say.detail may run to three short sentences when they asked for a summary, a reason or detail, and is empty otherwise. Say a name as a name and a time or a count as the page shows it; never an id, a route, a symbol or a bracketed tag. Every figure and row goes in show, where the screen draws it."`; `turnWords` pushes it after the language line when `t.spoken`; `wordsBlock` passes `spoken: input.spoken ?? false`; `AskTurnShape.spoken` set by `finishTurn` from the input; `packages/contracts` rebuilt (`corepack pnpm --filter "./packages/*" build`).
- [ ] **Step 4: Run** both files: PASS. Run `ask-routes.test.mjs`: PASS (a typed turn's shape says `spoken: false`).
- [ ] **Step 5: Commit** `feat(ask): a turn knows it is spoken`.

### Task 1.3: The voice session's row

**Files:**
- Create: `supabase/migrations/00286_a_voice_conversation_keeps_its_member.sql`
- Modify: `supabase/migrations-ledger.json` (via `--record`), `packages/db/src/database.types.ts`, `supabase/schema.sql` (generated)
- Test: `tooling/scripts/tests/database/migrations.test.mjs` (the ledger)

- [ ] **Step 1: Write the migration** (header comment in the house style, re-runnable, `set local lock_timeout = '3s'`): table `public.ask_voice_sessions` (`id text primary key` = the sha256 hex of the random id, `tenant_id uuid not null references tenants(id) on delete cascade`, `user_id uuid not null`, `thread_id uuid not null references ask_threads(id) on delete cascade`, `conversation_id text`, `token_cipher text not null`, `token_expires_at timestamptz not null`, `surface text`, `scope jsonb`, `context jsonb`, `language text not null default 'en'`, `turn_key text`, `turn_started_at timestamptz`, `duration_s integer`, `created_at timestamptz not null default now()`, `ended_at timestamptz`); RLS on; policies `ask_voice_sessions_own_insert` and `_own_select` and `_own_update` for `authenticated` with `user_id = (select auth.uid())` and the membership check the `ask_messages` policies make (`schema.sql:23256`); `grant select, insert, update on public.ask_voice_sessions to authenticated, service_role`; a comment on the table saying what it is and that the cipher's key is the dashboard's.
- [ ] **Step 2: Record and generate**: `node tooling/scripts/checks/migration-ledger.mjs --record`; with the stack up (`corepack pnpm supabase start` per the runbook), `corepack pnpm gen:db-types && corepack pnpm gen:schema-snapshot && corepack pnpm gen:schema-sets`.
- [ ] **Step 3: Run** `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs`: PASS.
- [ ] **Step 4: Commit** `feat(db): a voice conversation keeps its member (00286)`.

### Task 1.4: The variables and their registry rows

**Files:**
- Modify: `apps/dashboard/src/server/env.ts` (SCHEMA + READ: `ASK_VOICE_SECRET`, `ELEVENLABS_LLM_SECRET`; both in `REQUIRED_IN_PRODUCTION`), `apps/edge/lib/env.ts` (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_WEBHOOK_SECRET`), `packages/contracts/src/ai/flags.ts` (five rows, mechanism `dashboard_env` / `edge_env`), `.env.example`, `apps/dashboard/src/server/rate-limit.ts:44` (`voice: { limit: 30, windowMs: HOUR_MS, noun: "voice conversations" }`), `apps/dashboard/src/server/log.ts:25` (`ask_voice_session`, `ask_voice_refused`, `ask_voice_turn`, `ask_voice_door_refused`), `apps/edge/lib/log-events.ts:19` (`voice_session_minted`, `voice_session_refused`, `elevenlabs_webhook`, `ask_voice_session_ended`)
- Test: `tooling/scripts/tests/ai/flag-registry.test.mjs` (or wherever `flag-registry.test.mjs` lives: `find tooling -name flag-registry.test.mjs`), the env test for `REQUIRED_IN_PRODUCTION` (`find tooling -name "env*.test.mjs"`), `route-policy.test` for the new bucket name

- [ ] **Step 1: Run the registry test** after adding the env reads and before the rows: FAIL naming each unlisted switch.
- [ ] **Step 2: Add the rows** (`does:` one sentence each; `kept:` why it stays), the bucket, the events.
- [ ] **Step 3: Run** the registry test, the env test, the route-policy test: PASS.
- [ ] **Step 4: Commit** `feat(voice): the switches, the bucket and the events for spoken Ask`.

---

## PR 2 · The doors (branch `ask-voice/2-doors`, stacked on PR 1)

### Task 2.1: The ElevenLabs port

**Files:**
- Create: `packages/channels/src/voice/elevenlabs.ts`
- Modify: `packages/channels/src/index.ts` (export), `packages/channels/src/provider-fetch.ts` (the `Provider` union gains `"elevenlabs"` if it is a closed set)
- Test: `tooling/scripts/tests/channels/elevenlabs-port.test.mjs`

**Interfaces:**
- Produces: `mintConversationToken(cfg: { apiKey: string; agentId: string }, deps?: ProviderDeps): Promise<{ outcome: "ok"; token: string; conversationId: string } | { outcome: "rejected" | "unreachable"; status: number; error: string }>` (GET `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=`, header `xi-api-key`); `deleteConversation(cfg, conversationId, deps?)` (DELETE `/v1/convai/conversations/{id}`); `verifyElevenLabsWebhook(rawBody: string, signatureHeader: string | null, secret: string, nowS?: number): boolean` (the algorithm the spike proved, or the vendor SDK's `constructEvent` wrapped; the test pins whichever).

- [ ] **Step 1: Write the failing tests** with a fake `fetch`: `mint answers token and conversation_id`, `mint maps 429 to unreachable`, `mint maps 401 to rejected`, `delete is a DELETE with the key`, `webhook signature verifies and refuses a tampered body`.
- [ ] **Step 2: Run**: FAIL (module not found).
- [ ] **Step 3: Implement** over `providerFetch("elevenlabs", url, { method, headers, timeoutMs: 10_000 }, deps)` with the port's outcome rules.
- [ ] **Step 4: Run**: PASS. Rebuild packages.
- [ ] **Step 5: Commit** `feat(channels): the ElevenLabs port (mint, delete, verify)`.

### Task 2.2: B, the edge's voice-session door

**Files:**
- Create: `apps/edge/api/admin/voice-session.ts`
- Test: `tooling/scripts/tests/ask/voice-session-door.test.mjs` (modelled on `llm-door.test.mjs`)

**Interfaces:**
- Consumes: `authorizeAdmin(request, "/api/admin/voice-session")`, `mayUseModelFor("ask", tenantId)`, `mintConversationToken`.
- Produces: `POST { tenant_id, user_id }` → 200 `{ token, conversation_id }`; 402 `payment_required` when the workspace may not; 503 `no_provider_key` without `ELEVENLABS_API_KEY`/`ELEVENLABS_AGENT_ID`; 503 `provider_unreachable` on `unreachable`; 502 `provider_refused` on `rejected`.

- [ ] **Step 1: Write the failing tests** with a signed edge token and a captured wire: the five answers above, and `the key never leaves the edge` (the wire saw `xi-api-key`, the answer body does not).
- [ ] **Step 2: Run**: FAIL.
- [ ] **Step 3: Implement** as `whisper.ts` is written (`adminDoor`, `readBody`, `refuse`, `json`), logging `voice_session_minted` / `voice_session_refused` with the tenant and the status, never the token.
- [ ] **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `feat(edge): the voice-session door mints the agent's token`.

### Task 2.3: The session row, the cipher and the claim

**Files:**
- Create: `apps/dashboard/src/server/ask/voice-session.ts`
- Test: `tooling/scripts/tests/ask/voice-session.test.mjs`

**Interfaces:**
- Produces: `sealToken(token: string, secret: string): string` and `openToken(cipher: string, secret: string): string | null` (AES-256-GCM, key = sha256(secret), iv 12 bytes random, `base64url(iv‖tag‖ciphertext)`); `newSessionId(): { plain: string; hash: string }` (32 random bytes, hex; hash = sha256 hex); `createVoiceSession(ctx: RouteContext, member: Member, input: { threadId: string; conversationId: string | null; accessToken: string; tokenExpiresAt: string; surface: string | null; scope: AskScope | null; context: PageContext | null; language: AskLanguage }): Promise<{ plain: string }>` (insert on `ctx.supabase`); `readVoiceSession(service: SupabaseClient, hash: string): Promise<VoiceSessionRow | null>`; `claimTurn(service, hash: string, turnKey: string, now: Date): Promise<boolean>` (one `update … eq("id", hash) … or("turn_key.neq.…, turn_started_at.lt.…")` returning a row = true; the 45 s window is `ASK_TURN_BUDGET_MS`); `endVoiceSession(service, hash, fields: { endedAt: string; durationS?: number })`; `turnKeyOf(text: string): string` (sha256 hex of the trimmed text).

- [ ] **Step 1: Write the failing tests**: `sealToken round-trips and a wrong secret opens nothing`, `newSessionId hashes to 64 hex`, `createVoiceSession writes the row as the member` (the fake db's `seen` shows the insert on `ask_voice_sessions` with `user_id`), `claimTurn is first-wins and reopens after the budget` (two claims with one key: true then false; a claim with `now` 46 s later: true), `endVoiceSession writes ended_at`.
- [ ] **Step 2: Run**: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `feat(ask): a voice session's row, its cipher and its claim`.

### Task 2.4: A, the voice-session route, the page and the end

**Files:**
- Create: `apps/dashboard/app/api/v1/ask/voice/route.ts`, `apps/dashboard/app/api/v1/ask/voice/page/route.ts`, `apps/dashboard/app/api/v1/ask/voice/end/route.ts`
- Modify: `apps/dashboard/src/server/edge.ts` (no change if `edgeHeaders` suffices), `tooling/scripts/checks/route-policy.json` (generated by the policy test)
- Test: `tooling/scripts/tests/ask/ask-routes.test.mjs` (new cases)

**Interfaces:**
- Produces: `POST /api/v1/ask/voice` (`write({ scope: workspace, role: "viewer", rate: "voice" })`, body `{ thread_id?, scope?, surface?, context?, language? }`) → `{ session, token, conversation_id, thread_id, title }`; `POST /api/v1/ask/voice/page` (`rate: "aggregate"`, body `{ session, context }`) → `{ stamp }`; `POST /api/v1/ask/voice/end` (`rate: null`, body `{ session }`) → `{ ok: true }`.

- [ ] **Step 1: Write the failing tests** in `ask-routes.test.mjs`: `voice starts a session: a thread, a row, the edge asked, the token answered` (the edge fetch captured; the row's `token_cipher` is not the token; the answer has no cipher); `voice reads the access token after the claims` (the fake session client's `auth.getSession` is called once); `mint refused answers the gateway's words` (edge 402 → the route's refusal body `paused`); `voice page replaces the row's context and warms`; `voice end writes ended_at`; `voice is viewer, rate voice` (the policy).
- [ ] **Step 2: Run**: FAIL.
- [ ] **Step 3: Implement**: the route reads `ctx.supabase.auth.getSession()` (the one named place; the header comment says why it is safe after `getClaims`), `token_expires_at` from the JWT's `exp`, creates or keeps the thread (`createThread` / `readThread`), warms the context (`buildContext`), calls door B through `fetch(edgeUrl() + "/api/admin/voice-session", { headers: edgeHeaders("/api/admin/voice-session", { workspace, user, body }) })`, writes the row (`createVoiceSession`), logs `ask_voice_session`.
- [ ] **Step 4: Run** `ask-routes.test.mjs`, `auth-gate.test.mjs`, the route-policy test: PASS.
- [ ] **Step 5: Commit** `feat(ask): a voice session starts, follows the page and ends`.

### Task 2.5: C, the brain door

**Files:**
- Create: `apps/dashboard/app/api/ask/voice/llm/[[...rest]]/route.ts`, `apps/dashboard/src/server/ask/voice-door.ts`
- Modify: `apps/dashboard/proxy.ts:36` (three exact paths), `tooling/scripts/tests/auth/auth-gate.test.mjs` (names the exception and why)
- Test: `tooling/scripts/tests/ask/voice-door.test.mjs`, `tooling/scripts/tests/ask/voice-door-contract.test.mjs`

**Interfaces:**
- Consumes: `askTurn` (Task 1.1), `readVoiceSession`, `claimTurn`, `openToken`, `endVoiceSession` (Task 2.3), `verifyBearer` (`server/bearer.ts`), `memberContext(ctx, tenantId)` (`with-route.ts:260`), `takeRate(userId, "ask")`, `readThread` (for the follower).
- Produces: `voiceDoor(req: Request, deps?: VoiceDoorDeps): Promise<Response>` (the handler, injectable for tests: `{ service, now, verify }`); `chunk(content: string, done?: boolean): string` (one SSE frame in the spec §3.3 shape); `lastUserText(messages: unknown): string | null`; `secretOf(req): string | null` (`x-chanlytics-agent` or `Authorization: Bearer`, constant-time compare with `ELEVENLABS_LLM_SECRET`).

- [ ] **Step 1: Write the failing tests** (`voice-door.test.mjs`, the fake db seeded with a session row whose cipher seals a token the injected `verify` accepts, `setAskPorts` scripting one round that says "Ana needs you, since noon."): `no secret is 401 before the body is read`; `a foreign session id is 403`; `expired token speaks and ends` (the stream holds "Let me reconnect." and `[DONE]`; the row's `ended_at` set); `a good request streams trace, say and stop in order` (frames: `Reading today… ` first, then say suffixes concatenating to the headline and detail, then `finish_reason: "stop"`, then `data: [DONE]`; the thread holds one user and one assistant message); `door speaks a refusal for an empty transcript` (no user message → a spoken refusal, never 400, nothing stored); `duplicate request follows the thread` (two requests with the same words: one turn stored; the second's stream equals the first's say); `only the last user message is read` (earlier messages in the body change nothing the turn was asked); `the spoken flag reaches the turn` (the stored shape says `spoken: true`).
- [ ] **Step 2: Write the contract test** (`voice-door-contract.test.mjs`): the request body from sources §1 verbatim (`messages`, `model`, `temperature`, `max_tokens`, `stream: true`, `user_id`, `elevenlabs_extra_body`) is accepted; the response's `content-type` is `text/event-stream`; each frame parses as `data: {json}\n\n` with `object: "chat.completion.chunk"` and `choices[0].delta.content`; the last data frame is `[DONE]`.
- [ ] **Step 3: Run** both: FAIL.
- [ ] **Step 4: Implement** `voice-door.ts` and the route (`export const POST = (req) => voiceDoor(req)`, `maxDuration = 60`, `dynamic = "force-dynamic"`): the order of checks is the spec §3.3's; the follower polls `ask_messages` for an assistant row with `created_at > claim` every 300 ms up to `ASK_TURN_BUDGET_MS`; a trace emits `${label}… ` once; say suffixes are computed against what was already sent; the refusal and reconnect lines come from `refusalText` and a new `RECONNECT_LINE` (en/es).
- [ ] **Step 5: Run** both tests and `auth-gate.test.mjs`: PASS.
- [ ] **Step 6: Commit** `feat(ask): the brain door, ElevenLabs' custom LLM, runs Ask as the member`.

### Task 2.6: The agent, as code (kept)

**Files:**
- Modify: `tooling/scripts/voice/elevenlabs-agent.mjs` (from the spike, with the vendor's corrections), `apps/edge/lib/env.ts` (the script reads the key from the edge's `.env.local` only), `docs/runbook.md` ("Voice: the agent, the mint, the webhook")
- Test: `tooling/scripts/tests/voice/elevenlabs-agent.test.mjs`

- [ ] **Step 1: Write the failing test**: `agentConfig carries every value of spec §3.7` (deep-equal against a literal copied from the spec, with `url`, `voice_id` and the secret reference as parameters); `dry-run prints and never calls` (a fake fetch sees nothing).
- [ ] **Step 2: Run**: FAIL. **Step 3: Implement** (the script imports `agentConfig` from a sibling `.mjs` so the test needs no network). **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `feat(voice): the ElevenLabs agent is provisioned from code`.

### Task 2.7: The fifth door, written down

**Files:**
- Create: `docs/decisions/0026-a-provider-calls-the-dashboard.md`
- Modify: `docs/architecture.md:99-108` (the fifth door), `apps/dashboard/src/csp.ts:93` (the two origins from the spike note)
- Test: `tooling/scripts/tests/security/csp.test.mjs` (if one holds the directive list; `find tooling -name "csp*.test.mjs"`)

- [ ] **Step 1: Write the decision note** in the house shape (Status, Context, Decision, Shape, Tests): why a provider calls the dashboard, the two credentials, the token at rest, the exemption.
- [ ] **Step 2: Add the door** to `architecture.md` and the origins to `csp.ts`; run the CSP test: PASS.
- [ ] **Step 3: Commit** `docs: a provider calls the dashboard (0026); the CSP knows the agent`.

---

## PR 3 · The Line (branch `ask-voice/3-line`, stacked on PR 2)

### Task 3.1: `voice.ts`, the Line's one module over the SDK

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/ask/voice.ts`, `apps/dashboard/src/legacy-bridge/ask/voice-events.ts` (pure)
- Modify: `apps/dashboard/src/legacy-bridge/ask.ts` (installs it on `window.__ask`), `apps/dashboard/package.json`
- Test: `tooling/scripts/tests/ask/ask-voice-events.test.mjs`

**Interfaces:**
- Produces (pure, `voice-events.ts`): `type VoiceAction = { t: "question"; text: string } | { t: "say"; headline: string; detail: string } | { t: "cut" } | { t: "spoken"; text: string } | { t: "landed" } | { t: "mode"; mode: "speaking" | "listening" } | { t: "gone"; reason: string }`; `reduceVoiceEvent(ev: { kind: string; payload: unknown }): VoiceAction | null` mapping `user_transcript`, `agent_chat_response_part` (start/delta/stop accumulating into one say: headline = the first sentence, detail = the rest), `agent_response`, `agent_response_correction`, `interruption`, `agent_response_complete`, `mode`, `disconnect`.
- Produces (`voice.ts`): `installVoice(win, deps: { api: typeof askApi; load: () => Promise<typeof import("@elevenlabs/client")> }): { canVoice(): boolean; startVoice(input: { threadId: string | null; scope: AskScope | null; surface: string | null; context: PageContext | null; language: AskLanguage; first?: string }, on: (a: VoiceAction) => void): Promise<{ threadId: string }>; stopVoice(): Promise<void>; pageMoved(context: PageContext): void; level(): number }`.

- [ ] **Step 1: Write the failing tests** for the reducer: one case per event kind, including `parts accumulate into one say and stop lands`, `a correction is spoken text`, `an interruption cuts`.
- [ ] **Step 2: Run**: FAIL. **Step 3: Implement** the reducer; then `voice.ts` with the lazy `import()`, `startSession({ conversationToken, connectionType: "webrtc", customLlmExtraBody: { chanlytics_session }, userId, overrides: { agent: { language, firstMessage: first } } , onMessage, onAgentChatResponsePart, onAgentResponseCorrection, onInterruption, onVadScore, onModeChange, onStatusChange, onIncomingEvent, onError, onDisconnect })`, `a reconnect restarts` (a `gone` with reason `reconnect` → one more `startVoice` by the Line), `start failure returns to typed` (a rejected `startSession` resolves `stopVoice` and emits `gone`).
- [ ] **Step 4: Run**: PASS. **Step 5: Commit** `feat(ask): the Line's voice module over the agent's client`.

### Task 3.2: The Line listens

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx` (`useArVoice`: the mic's tap starts voice where `A.canVoice()`, a hold stays push-to-talk; `submit` by typing calls `A.stopVoice()` first; Esc and close stop it; `arTurnHeard` gains the voice actions: `question` → the user message and `setLive`, `say` → `live.say`, `landed` → `GET threads/:id` then `arTurnLanded`), `ask-hooks.jsx` (`useAskVoice`), `ask-turn.jsx` (`AskActs` Read aloud → `A.startVoice({ first: words })` where `canVoice`, else `speech.toggle` as today), `apps/dashboard/src/legacy/styles/ask.css` (the mic's `on` state while a session runs: the kit's existing `.ask-line-btn.on`, no new class)
- Test: `tooling/scripts/tests/ask/ask.test.mjs` (`useArMood` pure part: `mode speaking says speaking`, `mode listening says listening`), the legacy page harness render (`docs/runbook.md`, "See a real page": the Line mounts with `__ask.canVoice` true and false)

- [ ] **Step 1: Write the failing mood tests.** **Step 2: Run**: FAIL. **Step 3: Implement.** **Step 4: Run** the tests and render the page in the harness: PASS, the Line draws with and without voice.
- [ ] **Step 5: Commit** `feat(ask): the Line listens: speak and it speaks, type and it writes`.

### Task 3.3: Today's Listen is the brief, spoken

**Files:**
- Modify: `apps/dashboard/src/surfaces/today/pages/brief-pane.tsx:43-91` (`useSpeech` → `useVoiceBrief`: where `window.__ask?.canVoice()` the tap calls `startVoice({ language, first: undefined })` then, on `connected`, the module's `sendUserMessage("Brief me on today")` — exposed as `startVoice`'s `ask?: string` option; else today's Web Speech), `apps/dashboard/src/legacy-bridge/ask/voice.ts` (`ask?: string` sent after connect)
- Test: `tooling/scripts/tests/today/today-brief.test.mjs` (or the pane's existing test: `find tooling -name "*brief*.test.mjs"`): `Listen asks Ask when voice is at hand`, `Listen reads aloud when it is not`

- [ ] **Step 1–4:** test, fail, implement, pass. **Step 5: Commit** `feat(today): Listen is the brief, spoken by Ask`.

### Task 3.4: The three move to the voice

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx` (`useArMood`: `mode` from voice beside `speech.speakingId`; an interval of 50 ms while speaking sets `M.mood.voice(A.level(), true)`; `onVadScore` → `M.mood.hear`), `apps/dashboard/src/legacy-bridge/mascot/character.ts` (no change expected: `voice(level, live)` exists)
- Test: `tooling/scripts/tests/ask/ask.test.mjs` (`the voice level reaches the character while speaking`)

- [ ] **Step 1–4:** test, fail, implement, pass. **Step 5: Commit** `feat(ask): the three speak with the voice`.
- [ ] **Step 6: The budget**: `corepack pnpm --filter @chanlytics/dashboard build && corepack pnpm check:bundle`: PASS without a raise (the SDK is in an on-demand chunk); if it counts, raise by the measured growth with the reason.

---

## PR 4 · The proof (branch `ask-voice/4-proof`, stacked on PR 3)

### Task 4.1: D, the post-call webhook

**Files:**
- Create: `apps/edge/api/elevenlabs-webhook.ts`
- Modify: `apps/edge/lib/env.ts` (`ELEVENLABS_WEBHOOK_SECRET` read), the agent script (the webhook URL and secret)
- Test: `tooling/scripts/tests/ask/elevenlabs-webhook.test.mjs`

- [ ] **Step 1: Write the failing tests**: `a bad signature is 401`, `a post_call_transcription ends the session by conversation_id and writes duration_s`, `the same delivery twice writes once`, `the conversation is deleted after the duration is written` (the wire saw the DELETE), `an unknown conversation is 200 and logged` (never a retry storm).
- [ ] **Step 2: Run**: FAIL. **Step 3: Implement** with `door()`, `verifyElevenLabsWebhook`, the service `pg()`, `ask_voice_session_ended` with `{ tenant_id, duration_s, ttfb_ms: [...], ttf_sentence_ms: [...] }` from `conversation_turn_metrics`. **Step 4: Run**: PASS.
- [ ] **Step 5: Commit** `feat(edge): the ElevenLabs post-call webhook ends a voice session`.

### Task 4.2: The sweep, the evals and the runbook

**Files:**
- Create: `supabase/migrations/00287_expired_voice_sessions_are_swept.sql` (a function `sweep_voice_sessions()` deleting rows with `token_expires_at < now() - interval '1 day'`), `apps/edge/api/cron/voice.ts`
- Modify: `apps/edge/vercel.json` (the cron line), `tooling/scripts/eval-ask.mjs` (`--spoken`: the cases run through the brain door with a session minted as the eval member; the judge adds "reads aloud": no digits-only ids, no routes, an early comma), `docs/runbook.md`
- Test: `tooling/scripts/tests/database/migrations.test.mjs`, `tooling/scripts/tests/ask/eval-ask-context.test.mjs` (the judge's new rule, pure)

- [ ] **Step 1–4:** the migration recorded and generated; the cron door tested as the other sweeps are (`find tooling -name "*cron*.test.mjs"`); the judge's rule tested; `corepack pnpm gen:api-reference` if a route's input changed.
- [ ] **Step 5: Commit** `feat(voice): expired sessions are swept; the spoken evals; the runbook`.
- [ ] **Step 6: The gate**, run by Ruben as every phase's gate is: `E2E_BASE_URL=http://localhost:3305 REPS=3 node tooling/scripts/eval-ask.mjs --spoken` on both profiles (`ASK_MODEL=claude-sonnet-5` and unset), the numbers into the spec §4.

---

## Self-review

- **Spec coverage:** §2 (the rule) → 3.2, 3.3; §3.1 → 2.4; §3.2 → 2.2; §3.3 → 2.5 (+2.3 the claim); §3.4 → 1.1, 1.2; §3.5 → 3.1, 3.2, 3.4; §3.6 → 4.1; §3.7 → 0.3, 2.6; §4 → 0.5, 4.2; §5 → 1.4 (the bucket), 2.2 (the gate), 2.6 (the limits); §6 → 2.3 (the cipher), 2.5 (two credentials), 2.7 (CSP, the decision), 4.2 (the sweep); §7 → 0.5 and every task's tests; §10 and §11 → the PR list.
- **Open to the spike:** Task 2.5's secret header and path, Task 2.1's webhook algorithm, Task 2.7's origins, Task 3.1's end-of-speech event and Task 3.2's Read aloud limit are written from spec §7's answers; the spike note is read before PR 2 starts.
- **Names used across tasks:** `askTurn` (1.1 → 2.5), `SPOKEN_LINE` (1.2), `sealToken`/`openToken`/`claimTurn`/`readVoiceSession`/`endVoiceSession`/`turnKeyOf` (2.3 → 2.4, 2.5, 4.1), `mintConversationToken`/`deleteConversation`/`verifyElevenLabsWebhook` (2.1 → 2.2, 4.1), `voiceDoor`/`chunk`/`lastUserText`/`secretOf` (2.5), `reduceVoiceEvent`/`installVoice`/`startVoice`/`stopVoice`/`pageMoved`/`level` (3.1 → 3.2, 3.3, 3.4), `agentConfig` (0.3 → 2.6).
