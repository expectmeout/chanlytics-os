# Calls right now — design

Tier 1's last item: the calls in progress, and the honest version of the mockup's Live monitor.
Checked against Retell's current documentation (webhook events, get-call, list-calls v3,
update-agent, update-live-call) and our own call pipeline on 2026-09-04.

## What the provider allows

- Webhook events: `call_started`, `call_ended`, `call_analyzed`, `transcript_updated`
  (every turn plus a final one), `transfer_*`. An agent sends only the events in its
  `webhook_events`; the default is started / ended / analyzed, so live transcript is opt-in.
- Events are sent in order but not blocking; a non-2xx is retried up to 3 times; the
  timeout is 10 s. Idempotency key is event + call_id. A retried `call_started` can land
  after `call_ended`.
- `call_status` ∈ registered | not_connected | ongoing | ended | error. `call_started` is not
  sent for a dial that never connected.
- `PATCH /v2/update-live-call/{id}` injects context mid-call (`additional_context`,
  `trigger_response`). There is no public API to listen in, take over, or hang up a hosted
  agent's call: those three mockup buttons stay demo-only.

## Pipeline defects fixed first (PR 1: call lifecycle)

1. **Status regression.** `ingest_call` wrote `status = excluded.status`; a late retry of
   `call_started` flipped an ended call back to live until the reconcile sweep. Now a call's
   status only moves forward (registered → ongoing → ended | error | not_connected); a stale
   event is a no-op and reports `skipped`. A skipped event never refreshes the heartbeat.
2. **Not-connected is not a call.** `not_connected` was folded into `ended`. It is now its own
   status; Today's metrics, Reports, and People exclude it from call counts, minutes, and
   first-contact evidence; the UI labels it "Never connected".
3. **Usage on transition.** `usage.voice_seconds` fired only when the FIRST ingest carried a
   duration, so a call that arrived as `call_started` never metered. It now fires when the
   duration first becomes known.
4. **The webhook stays inside Retell's 10 s.** The recording copy is bounded by a timeout;
   a copy that did not finish is retried by the reconcile sweep (bounded attempts, then
   `failed`), so "Recording still processing" cannot last forever.
5. **Live transcript is possible.** `transcript_updated` payloads carry
   `transcript_with_tool_calls`; the normalizer maps agent/user turns to the stored turn shape,
   so enabling the event on the agent is the only remaining step. The final transcript
   overwrites; a late partial one after the call ended is skipped by rule 1.
6. **Agent config is visible.** `/api/diag` reports each voice agent's `webhook_events`,
   storage setting and signed-URL opt-in, read from the edge where the key lives.
7. **Frozen "0:42".** The Conversations viewer showed a seeded duration on a real live call;
   the view model now carries `startedAtMs` and the viewer ticks from it.

## The page (PR 2: Calls right now)

Conversations → Live becomes real, reusing the mockup's list-and-panel frame (`.lm-*`).

- **Right now:** calls in progress under the heartbeat rule (ongoing, touched within 10 min),
  elapsed ticking from `started_at`, one interval only while at least one call is live.
- **Panel:** who, number, started at, elapsed; the transcript turns when the agent sends them,
  otherwise "Transcript arrives when the call ends." No Listen, Take over, or End call.
- **Ended in the last hour:** duration, mood and summary state ("summary on its way" until
  `call_analyzed`), the recording link once stored, "Missed · never connected" for
  `not_connected`.
- **Phantom guard:** live past 30 minutes or heartbeat older than 5 minutes reads "still marked
  live · checking with the phone provider".
- **Freshness:** the `calls` table joins the seam's shared realtime watch; a call starting or
  ending repaints Live, Conversations, Today, People, and Reports.
- **Empty state:** "No call in progress. The line is on — {number}." or "The line is off."
- Conversations' Live tab pulses from real data; the seeded ticker stays demo-only.

## Later, on request

- Whisper: `POST /api/v1/calls/:id/whisper` → edge → `update-live-call`, owner/operator,
  recorded on the ledger.
- Signed recording URLs + retention window on the agent; reconcile via one filtered
  `list-calls` query.
