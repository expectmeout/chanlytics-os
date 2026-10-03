# 0026 · A provider calls the dashboard

**Status:** Decided, built in part, on 3 October 2026 by the Ask-spoken lane
(`docs/superpowers/specs/2026-10-03-ask-spoken-design.md`); Ruben's verification owed before anything is pushed (his
rule of 2 October). Written against `8f49c1269` (`ask-voice/1-ground`, 3 October 2026, the spike's answers recorded)
and verified against the code at it; where this note and the code disagree, the code wins. The fifth door of
`docs/architecture.md`.

## Context

- **Ask, spoken, runs on ElevenLabs Agents with Ask itself as the agent's model.** The vendor's agent does the
  listening, the turn-taking and the voice; for the words it calls a custom LLM endpoint in the OpenAI
  chat-completions shape, once per spoken turn, with the agent's whole history, and reads back an event stream
  (the sources note, §1; the spike note, run A). That endpoint must be ours, because Ask's reads, tools and thread are
  the dashboard's, under RLS, as the signed-in member.
- **Until now no provider called the dashboard.** The four doors (`architecture.md`) are provider to edge, browser to
  dashboard, dashboard to edge and database to edge. Every provider webhook lands on the edge, which holds the keys
  and the service role and never a member's session. Ask's turn, though, needs a member's session client: its readers
  are the pages' readers, and the number it says is the number the page shows because both read as that member.
- **The vendor carries no credential of ours and no cookie.** It sends a static header it is configured with
  (`custom_llm.request_headers`) and whatever the browser gave it at the start (`customLlmExtraBody`, on the wire
  `custom_llm_extra_body`, arriving as `elevenlabs_extra_body`; the spike note, questions 1 and 2). Neither names a
  member in a way the dashboard can trust on its own.
- **The vendor's clock and its retries are the vendor's** (the spike note, runs B3 to B9): a stream that goes 15 s
  without speakable text is cut and the turn asked again, three times, then the socket closes and the conversation
  is over; the ceiling cannot be raised; an empty chunk or a space does not restart the clock, the vendor's own
  buffer words `"... "` do. And the vendor may ask the same turn twice inside one turn (the sources, §1).

## Decision

1. **The brain door is a route on the dashboard outside `withRoute`**, `POST /api/ask/voice/llm` served at three
   exact paths (the vendor appends `/chat/completions`; `/v1/chat/completions` beside it), listed in the proxy's
   `PUBLIC_PATHS` by value and nowhere as a prefix. It proves the caller twice before it reads a byte of the body: the
   agent's static secret (`x-chanlytics-agent`, the dashboard's `ELEVENLABS_LLM_SECRET`, required in production,
   compared in constant time; 401 without it), then the session's id from the extra body, found as a row of
   `ask_voice_sessions` (403 without one). Neither alone opens it.
2. **The member rides in the row, sealed.** The voice route (`POST /api/v1/ask/voice`, a `write()` like any) writes
   the row as the member, under RLS, and puts in it the access token the request was just verified with, sealed with
   AES-256-GCM under `ASK_VOICE_SECRET`, a secret the database does not hold. That route is the one place in the
   codebase that reads `auth.getSession()` back after the wrapper's `getClaims` verified the same token, and
   `voice-routes.test.mjs` pins that it reads it once. The door opens the token and verifies it exactly as a bearer
   request is verified (`verifyBearer`, decision 0011), which gives it a session client that runs the turn under RLS
   as that member; the row's `user_id` must be the token's subject, and `user_id` in the vendor's request is a label,
   never read. The row's id is the sha256 of 256 random bits the browser carries, so the table alone opens nothing;
   the token lives its own hour (`token_expires_at`), the row is ended by the browser, by the post-call webhook or by
   expiry, and the sweep (00288, PR 4) deletes the rest.
3. **One turn, however many requests.** The door claims the turn before running it (`turn_key` on the row, the words
   and their place in the conversation; a key older than the turn's budget may be taken again): the request that
   owns the key runs the turn, any other with the same key follows the thread and speaks the stored answer. A turn
   is stored once.
4. **Never 10 s without speakable text, never an empty stream.** The door streams each read's label as it starts,
   the Say as it is written, and the vendor's buffer words whenever `ASK_VOICE_PULSE_MS` (10 s) pass with nothing
   speakable; a refusal once the row is known is a short line in the person's language, never a status, because the
   vendor retries a failed stream and ends the conversation after three.
5. **The edge keeps the provider's key**, as it keeps every provider's: `POST /api/admin/voice/session` (a signed
   admin door) asks whether the workspace may spend and mints the agent's conversation token through the ElevenLabs
   port (`packages/channels/src/voice/elevenlabs.ts`); the dashboard never holds `ELEVENLABS_API_KEY`. The agent
   itself is provisioned from code (`tooling/scripts/voice/elevenlabs-agent.mjs`) with authentication on and no
   allowlist, so a conversation starts only with a token the edge minted.

Considered and not taken: (a) a door on the edge that runs Ask on the service role, scoped by hand to the row's
tenant: a second implementation of every reader's scoping, and the number Ask says would no longer be the number the
page shows; (b) a signed JWT of our own carried in the extra body instead of the row: the vendor stores the
initiation data in its conversation record and its webhook, so a credential that opens a member's session would sit
in a third party's logs; (c) the vendor's Speech Engine (a persistent WebSocket, the sources §11): a long-lived
public socket server the dashboard's serverless host does not provide, named as the V2 option if first-word latency
or duplicate requests hurt.

## Shape

- `apps/dashboard/app/api/ask/voice/llm/[[...rest]]/route.ts` → `apps/dashboard/src/server/ask/voice-door.ts`
  (the door); `apps/dashboard/src/server/ask/voice-session.ts` (the cipher, the id, the claim's key) over
  `packages/db/src/ask-voice-session.ts` (the row); `apps/dashboard/app/api/v1/ask/voice/route.ts`,
  `…/voice/page/route.ts`, `…/voice/end/route.ts` (the member's side); `apps/edge/api/admin/voice/session.ts` over
  `apps/edge/lib/voice/ask-voice.ts` (the mint); `packages/channels/src/voice/elevenlabs.ts` (the port: mint, erase,
  the webhook's signature);
  `supabase/migrations/00287_a_voice_conversation_keeps_its_member.sql` (the table, RLS own rows, a column grant
  that keeps the claim and the duration to the service role).
- The CSP names the agent's origins once (`apps/dashboard/src/csp.ts`, `VOICE_AGENT`); the API key never reaches
  the browser, which holds a conversation token good for minutes.
- Either deploy order works: the dashboard's route refuses in words until the edge's door exists (`no_provider_key`
  is "Voice is not set up yet."), and the edge's door is unreachable to anyone but a dashboard that signs for it.

## Steps

1. PR 1 (`ask-voice/1-ground`): the shared turn, the spoken register, the table, the variables. Built.
2. PR 2 (this note): the port, the mint door, the row's cipher and claim, the three member routes, the brain door,
   the agent as code, the CSP. Built; proven by the tests below; not yet pushed.
3. PR 3: the Line listens (`legacy-bridge/ask/voice.ts` over `@elevenlabs/client`, Today's Listen as the spoken
   brief). To build.
4. PR 4: the post-call webhook on the edge (door D, the minutes and the erase), the sweep (00288), the spoken evals.
   To build.

## Tests

`tooling/scripts/tests/voice/voice-door.test.mjs` (the two credentials, the spoken refusals, one turn as the member
in the vendor's shape, the buffer words, one turn however many requests), `tooling/scripts/tests/voice/voice-routes.test.mjs`
(the row written as the member with the token sealed and read once; the edge asked with a signed token; the
refusals in the gateway's words), `tooling/scripts/tests/voice/voice-session-door.test.mjs` (the mint on the edge),
`tooling/scripts/tests/voice/elevenlabs-port.test.mjs` (the port and the webhook's signature),
`tooling/scripts/tests/voice/elevenlabs-agent.test.mjs` (the agent as code), `tooling/scripts/tests/auth/auth-gate.test.mjs`
(the three exact public paths and no other under `/api/ask`), `tooling/scripts/tests/routes/csp.test.mjs` (the
origins).

## Risks

- **A live access token at rest** in a table, for an hour at most, sealed under a secret only the dashboard holds. A
  read of the table alone yields nothing; a read of the table and the dashboard's environment is the dashboard
  itself.
- **The vendor's transcript** holds what the person said and what Ask said back, which name customers, for the
  retention window (seven days, audio off); door D erases the conversation once its minutes are written.
- **The WebRTC origins in the CSP** are the vendor client's documented hosts, not yet read off a microphone run (the
  spike's question 7); a wrong host shows as a blocked connection in the console, never as a leak.

## Open questions

- Whether the vendor's zero-retention mode is available to this account (the sources, §8).
- The empty voice thread a conversation that never asked anything leaves behind (titled by its first question only
  once one is asked): the sweep's, or left as it is.
