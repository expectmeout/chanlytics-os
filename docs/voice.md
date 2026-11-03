# The phone receptionist, as built

Written 3 November 2026 against `6c4da4d1d` and decision 0092. `docs/system-prd.md` S-06 is the sheet-by-sheet
reference; this page is the one place that says how the voice side fits together and what is deliberately left out.

## Two roads to a line, one agent

- **A Chanlytics line**: a Twilio number over SIP, bought and set up by the lines saga (S-07), which makes the agent
  through `apps/edge/lib/voice/voice-agent.ts`.
- **A number the voice provider holds**: `POST /api/admin/voice-provision` (`tooling/scripts/ops/voice/voice-provision.mjs`
  is its thin client), dry run by default.

Both make the same Retell LLM (the shell) and agent from `packages/channels/src/voice/voice-provision.ts`, and the
voice channel row (`tenant_channels`, kind voice, the agent's id) routes every delivery back to its workspace. One
provider account answers every workspace's line: its limit on calls at once is everybody's.

## The shell

`packages/channels/src/voice/voice-shell.ts` defines everything the agent is told that is not a fact: the prompt and its
placeholders (`{{business_facts}}`, `{{caller_context}}`, `{{greeting}}`, `{{handoff_number}}`), a spoken default for
each, four tools (`check_availability`, `send_booking_link`, `transfer_to_staff`, `end_call`), the webhook events, the
post-call analysis fields, the call's feel and the call's limits (`CALL_LIMITS`: twenty minutes a call, thirty seconds of
silence, a week at the provider). Every fact arrives per call from the same composition the WhatsApp receptionist reads.

**Drift** is any live agent off that shell: `/api/diag` shows it, the health sweep pages it once a day
(`apps/edge/lib/voice/watch/voice-watch.ts`), and the edge's converger fixes it (`POST /api/admin/voice-converge`, the
agent's settings and the LLM's shell, dry run by default, and with `pin_number` a number bound to latest_published;
`tooling/scripts/ops/voice/voice-converge.mjs` is its thin client, and the provider key never leaves the edge).

## What an owner changes, and what they cannot

Settings › Business › Phone: the greeting (decision 0051), the receptionist's name, its voice from a list we have
heard and its pace (sent with each call, the saved agent untouched), the line a transfer dials, and keeping their own
number by forwarding. A rehearsal (decision 0069) lets them hear it before a customer does.

Not theirs, on purpose: the model and its temperature, interruption and turn-taking, the webhook and its events, the
tools, and the prompt itself. A free-text prompt would let the guardrails go (the price rule, never confirming a booking
by itself, the AI disclosure), with no way to tell.

## The doors

| Door                                                | What knocks                                  | Its credential                                                      |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| `POST /api/retell-inbound`                          | Retell, as a call rings                      | Retell's signature, or `?key=` while `RETELL_DOORS_SIGNED` is unset |
| `POST /api/retell-webhook`                          | Retell: started, each turn, ended, analysed  | Retell's signature alone                                            |
| `POST /api/retell-fn`                               | The agent's booking-link tool                | Retell's signature, or `x-fn-secret` while the switch is unset      |
| `POST /api/retell-availability`                     | The agent's open-times tool                  | The same                                                            |
| `POST /api/cron/calls`                              | pg_cron, when the calls table owes something | The sweep key                                                       |
| `POST /api/admin/whisper`, `hand-over`, `stop-call` | The dashboard's Live controls                | A token for the door, the workspace and the member                  |
| `POST /api/admin/voice/erase-calls`                 | The dashboard's erasure                      | A token for the door, the workspace and the member                  |
| `POST /api/voice-canary`                            | The daily canary (GitHub)                    | `x-canary-key`                                                      |

Each knock let in on the inbound and tool doors is kept as a `webhook.auth` row naming its door; `/api/diag`
(`retellAuth.doors`) says each door's last seven days. **The switch** `RETELL_DOORS_SIGNED=1` closes the shared secret:
set it once all three doors show signed knocks. From then on nothing new is provisioned with the secret, and drift reads
a tool still carrying its header as the drift.

## A call, end to end

1. **It rings.** `planCallStart` composes the business's facts, the caller's memory from their one thread, the
   greeting and the transfer line, within 6.5 s of Retell's ten (the open times and the caller's visits are read at
   once). The call takes the caller's thread, so the text receptionist stays off it.
2. **During.** Each turn refreshes the row (Live repaints). A price said that the owner's rules forbid is escalated and,
   once a call (`guard_corrected_at`), corrected in the call. The tools read the calendar, and send the booking link,
   once a call to one person, through the same gate and send door as every message.
3. **It ends.** `ingest_call` keeps one row per call, forward only, metered once. The thread gets the call's line (a
   missed call's too). The owner is told once, in full: a mail that failed is owed and finished (`notice_told_at`).
   The audio is copied into the private bucket. A call owed a call back opens the thread's hold. A call that ended the
   platform's way pages the platform (contracts `callEndingOf`).
4. **Afterwards.** The calls sweep (every five minutes, only when owed) closes calls the webhook never ended, finishes
   recordings, analyses, thread lines and owed notices.

## What a call keeps, and for how long

- The row: who, when, how it ended, the analysis, the transcript, a fetch state for the audio. Of the provider's own
  payload only an allowlist (`scrub_call_raw`): never the briefing, the SIP headers or more copies of the transcript.
- The audio, in the private bucket, ninety days, then purged (the transcript and the summary stay).
- At the provider: a week (`CALL_LIMITS`), and an erased person's calls are asked to be deleted there as they are
  erased.

## Watching it

- **The canary** (`.github/workflows/voice-canary.yml`): a real call each day, judged on everything above.
- **The health sweep**: the provider's calls at once against its limit (pages at 80%), drift once a day.
- **The call's endings**: credit, payment, concurrency, our inbound webhook and every provider error page at once.
- `docs/runbook.md`, "When calls fail", says where each one is read and what to do.

## Not built, on purpose

- The receptionist never places a call (decision 0038 is proposed, not built).
- Listening in or speaking from a browser: the provider's API offers neither.
- A missed call is not texted back (declined 11 October 2026).
- Minutes are shown (Settings › Billing), not capped: a plan's allowance waits for decision 0037's pricing.
