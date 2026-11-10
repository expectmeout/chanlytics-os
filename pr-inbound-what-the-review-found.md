The inbound review (WhatsApp, SMS and Instagram DMs, 3 Nov 2026), every lane: the defects it found, the job road for
every wire, one transaction for a message and its yeses, the order said once as data, the lost-text sweep and a daily
canary on the real wires. Each lane is its own commit; each new test fails on main's sources and passes here.

## What changes for a customer

- **Every WhatsApp message is answered by its job**, as a text and a DM already were (decision 0031): Meta is answered
  once the message is on record, and no model turn runs inside its request. Two messages from one person in one delivery
  get one reply, from the newest (the reply turn). A reply turn ends by its job's deadline, so a slow model ends in the
  holding words and a person, never in a function killed with the customer unanswered. "Typing…" shows while the reply
  is written (on Sends it).
- **A text that arrived while our door was down is no longer lost.** Twilio retries nothing; a sweep now reads each
  line's own record from Twilio every ten minutes and takes in every text the database never heard. One that waited out
  an outage is held for a person as late, never answered as if it had just arrived.
- **A customer who mentions a code of their own is answered on WhatsApp**; a long first text keeps its compliance
  footer; an Instagram DM sharing a post goes to a person (step 1).
- **A START's channel and a YES OFFERS are kept with the message**, in one transaction: never a message kept without
  the yes it carried.

For an owner:

- A hold's notice names the reason as the Inbox does and ends with the reason's own act (a call to return, a booking to
  confirm), for every gate.
- An address a customer gives is kept only where none is on file, under the row's lock (two messages can no longer both
  write one).
- A failed send says "not connected", never "HTTP 503"; holds name modes in the Autonomy pane's words; a delivery status
  the database could not write is asked for again (step 1).

For the platform:

- A daily canary (off until two settings are set) texts our own line and pages if the door did not keep it, nothing
  answered it, or the answer did not leave.
- `docs/inbound-gates.md`, the order every message is taken through, is written from the code; the PRD's and the flow
  doc's hand copies, which had drifted, link to it.

## What moved, by lane

**Step 1** (`360ce162f`): one one-time-code reader for every wire (contracts `oneTimeCodeOf`), `causeOf` for a failed
send's words (core `deliver/cause.ts`, below both the queued send and the receptionist), `share` handed over, the logger's `channel`, the replay gate before the memory, `modeSaid`, the footer's
room, `recordStatusByExternalId` answering and throwing, a change that throws costing only itself, the evals' weekly
clock.

**Lane 3, the job road** (`78dec46d9`, `5f64d0c1a`, `c53d478f6`, `7064bab7d`, `2c5dc23fe`, `176286fef`):

- `apps/edge/lib/inbound/` is the doors' one adapter: `arrival.ts` (`recordArrival`, `answerArrival`,
  `recordThenSchedule`, `spokeFirst`) and the shared `ports.ts`, `persist.ts`, `alerts.ts`; `lib/intake/answer-job.ts`
  sends an answer job to its wire's door by the wire its payload declares (`jobWireOf`; contracts' `inbound_answer`
  payload takes `wire`). WhatsApp's `intake/answer-later.ts` records and answers like the others;
  `WHATSAPP_ANSWERS_AS_JOBS` and the in-request road are deleted.
- Core: the job's deadline reaches the model (`TURN_BUDGET_MS`, `BrainCall.endsAtMs`); `showTyping`;
  `handToAPerson` (one hold, the owner told, the message stamped) for the seven plain hand-overs; `generateReply` takes
  one named `ReplyAsk`, declared once in core; the verb refuses a message with no database (`IngestFailed`), so its
  database, workspace and ingest row are never null and ~20 branches are gone.
- `META_APP_SECRET_PREVIOUS` for a secret's rotation, on both Meta doors.
- `00592`: `ingest_inbound` takes `p_opt_in_marketing` and writes a START's channel (`note_yes_on_channel`) and the
  offers yes (`set_marketing_consent`) in its own transaction; `AnswerNotKept`, `jobFollows`, `IngestFailed.kept`, the
  ledger read on every repeat delivery and the pre-00013/00110/00297 fallbacks go.
- `00593`: `note_person_email`, called by `noteEmailTheyGave` (`@chanlytics/db/people`, beside a person's address, decision 0111) in place of the read-then-write the persist adapter did; a message's media is main's `saveMessageMedia`.

**Lane 4, the order said once** (`5cd7dfe42`, `a681a8fd3`):

- `packages/core/src/inbound/order.ts` `INBOUND_GATES`; `tooling/scripts/gen/inbound-gates.mjs` writes
  `docs/inbound-gates.md` (`corepack pnpm gen:inbound-gates`, a `land` writer); `tests/inbound/the-gates-run-in-their-order.test.mjs`
  trips each gate alone and stacks every later gate's condition under each one (a swapped phase fails it).
- `apps/edge/lib/whatsapp/delivery-plan.ts` `planWhatsappChange`: the WhatsApp door asks a pure plan per change.
- `tests/whatsapp/inbound-executed.test.mjs` (1,727 lines) split by phase into `tests/inbound/phases/`.
- `tests/inbound/a-message-takes-the-whole-road-on-postgres.db.test.mjs`: one WhatsApp message through its door and its
  real job, and one text to a hold, over the replayed schema with only the wires and the model faked.
- Docs: the PRD's gate table and SMS paragraph, the flow doc's matrix (with Instagram) and §5.1, decision 0031's open
  question 2 answered and its day's entry, 0043 annotated, the runbook's "A message is answered after the
  acknowledgement" and "A customer says nobody answered".

**Lane 5, proof on the real wires** (`f5e20b110`, `5088d7b9a`):

- `00594` (`sms_sweep_texts`) + `apps/edge/lib/sms/texts-sweep.ts` + `POST /api/cron/texts`: the texts sweep (a reconcile
  clock). The door reads the knock's signed `DateSent` as the text's sent time. `docs/capacity.md` says it is TIGHT past
  about a hundred lines (one Twilio read a line in a forty-second tick, oldest first): the next clock to hand out a job a
  workspace (decision 0115).
- `00595` (`sms_sweep_text_canary`) + `apps/edge/lib/sms/canary.ts` + `POST /api/cron/text-canary`: the daily canary (a
  judge clock).

## To set or apply before merging

- **Apply 00592 and 00593 to production before the merge**, 00592 first (numbered above main's 00585 and every lane's claim to
  00591; main's ledger argues 00521-00524, 00534-00537, 00576-00579 and 00581-00584, this lane's earlier numbers, as left).
  00592 drops and recreates `ingest_inbound` with a fourteenth argument (default false), so the edge running now calls it
  unchanged and goes on writing both yeses itself, each once: the channel is held by then, so `note_yes_on_channel`
  writes nothing, and the function writes no offers yes for an edge that does not pass one. It goes first: the new edge
  passes the fourteenth and could keep no message without it. 00593 adds `note_person_email`, which the new edge calls
  and the old one does not. Both applied 10 Nov 2026, read back (one overload each, bodies' md5 the files', the service
  role alone).
- **Apply 00594 and 00595 once both hosts serve the merge**: they schedule the texts sweep and the daily canary, which
  knock `/api/cron/texts` and `/api/cron/text-canary`, doors only the new edge has.
- **After the deploy:** nothing to set for the job road (it is on for every workspace). The canary stays off until
  `CANARY_SMS_SERVICE` and `CANARY_SMS_TO` are set (runbook, "Turn on the daily text canary").
- **Owed, not in this change:** the env pair, the pilot allowlist and `isEnvDefault` go once `chanlytics-e2e` has Vault
  credentials (a production credential move); the evals' working key (#2063).

## Deploy order

00592 and 00593, then either app; 00594 and 00595 once the edge serves the merge.

Debt: `apps/edge/lib/inbound/persist.ts` is `lib/whatsapp/persist.ts` moved (C1): its `pgSink` is the same function under a new path, smaller than main's (168 lines and a cognitive 56, from 179 and 70). `causeOf` moved unchanged from `messages/send.ts` to `core/deliver/cause.ts` (its 42 is main's), so core's inbound reads it without running against messages. `apps/edge/lib/shared/log-events.ts` +10 lines, its closed set of names one a line (past 800 on main already): the texts sweep's three, the canary's six, a set-aside short code, WhatsApp's typing and allowlist skip in, the two yes writes the ingest now keeps itself out. Root names: core +3 (`INBOUND_GATES`, `InboundGate`, `ReplyAsk`; core has one entry), contracts +1 (`oneTimeCodeOf`, moved from channels so every wire reads one rule). `jobWireOf`, `recordArrival` and `setInboundPorts` are exported for their tests (the old-payload rule, the world's door half, the ports' seam). `no-unnecessary-condition` +40 in the inbound verb and its persist adapter (`model-turn.ts` 17, `context.ts` 7, `reply-gates.ts` +6, `persist.ts` 5, `ingest.ts` 2, `alerts.ts` and `unreadable.ts` 1 each): the guards for a runtime, a database and a workspace the lane made required in the verb's types; the suite hands the verb partial worlds (a runtime with no facts, a sink with no database) and source tests read the guards, so they stay until those worlds are typed. `whatsapp-door.test.mjs` +24 lines for the job road's cases (B1), already past its ceiling, its verb's cases split out by phase (D4). Measured against `cef214202` in place, as CI does (measures, lint, knip): nothing else rose.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
