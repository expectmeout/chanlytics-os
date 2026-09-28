# A conversation, end to end

**What this is.** One customer conversation, followed from the moment it arrives to the moment it is accounted for, across all four channels the product answers on — a phone call through Retell, WhatsApp through Meta, a text through Twilio, an email through Resend. At every stage it says which channel uses the shared mechanism, which re-implements the same decision in its own words, and which does not do that stage at all.

It is a **conformance** map. `docs/system-prd.md` is the component catalogue — what each part is and where it lives — and `docs/system-map.md` scores the layers. Neither answers the question this one exists for: _when the same thing happens on two channels, does the same code decide it?_

Every claim names a file and a line. Where this document and the code disagree, the code is right and this is stale. It is written against `main` at `0e463030`; work in flight on other branches is out of scope and is not counted as either a strength or a hole.

**In one sentence:** every message a customer receives leaves through one shared door, and that door is the best thing in the repository; the way _in_ is four doors that agree on what matters and differ on the rest; and the differences that cost a customer something are listed in §6, ranked.

One qualification, because it changes what is worth centralising. `deliver()` is the **message-send** door, not the door for everything a customer experiences. The voice agent speaks live without passing through it, and reading open times aloud, transferring a call and ending one are customer-facing actions it never sees. Improving `deliver()` alone cannot make the voice experience obey the same rules — G4 below is exactly that gap, and it is why the unit worth sharing is an _action_, not a channel handler.

---

## 1. What a conversation is made of

A conversation is not one table. It is five, and knowing which one owns which fact explains most of what follows.

| Row             | Owns                                             | The rule that matters                                                                                        |
| --------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `contacts`      | the person: number, address, consent, erasure    | one per workspace per identity; `contacts_tenant_phone_uq` is **partial**, on `where phone_e164 is not null` |
| `conversations` | the thread: its state, who holds it, until when  | `unique (tenant_id, contact_id)` — **one thread per person per workspace, for ever, across every channel**   |
| `messages`      | what was said, both directions                   | `(tenant_id, external_id)` is the replay gate; `meta.processed_at` is the "we finished with this" stamp      |
| `escalations`   | the hold: a thread waiting for a person, and why | `escalations_one_open` — **one open row per thread**; a second reason overwrites the first                   |
| `jobs`          | the outbox: everything that happens later        | one insert, a lease, a heartbeat; a kind arrives with its handler, its caller and its CHECK together         |

Two ledgers sit beside them: `events` (what happened) and `decisions` (who decided it). A path that writes neither is invisible to Activity and to the owner's audit, and that absence is a finding below.

The model's memory used to be a sixth store — Vercel Blob threads, behind a flag. Both are gone: the store's code was deleted and `blob_thread_erase` with it (00151). **Postgres is the receptionist's only memory**, and `readLeadContext` (`packages/db/src/repositories/thread.ts`) is the one function both agents read it through — "the WhatsApp receptionist and the voice agent are meant to be the same receptionist."

---

## 2. The eleven stages

Every inbound conversation passes through the same eleven stages, whatever it arrives on. The names are this document's; the mechanisms are the repository's.

```mermaid
flowchart LR
  A["1 Arrive<br/>provider delivers"] --> B["2 Prove<br/>signature"]
  B --> C["3 Route<br/>whose workspace"]
  C --> D["4 Admit<br/>replay gate"]
  D --> E["5 Keep<br/>row on a thread"]
  E --> F["6 Judge<br/>may we speak"]
  F --> G["7 Answer<br/>the model's turn"]
  G --> H["8 Hold<br/>flag a person"]
  F --> I["9 Act<br/>calendar · link · transfer"]
  G --> J["10 Deliver<br/>the one door out"]
  I --> J
  J --> K["11 Account<br/>receipts · events · sweeps"]
  H --> K
```

Stages 1–5 are the _way in_, and each channel built its own. Stage 10 is the _way out_, and every channel shares it. Stages 6–9 are where the two meet, and where the divergences that cost something live.

---

## 3. The conformance matrix

`shared` — uses the common mechanism. `parallel` — does the stage, in its own code. `none` — does not do it.

| Stage             | WhatsApp                                               | SMS                                                                                   | Voice                                                                                                           | Email                                                                                        |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **1 Arrive**      | `api/whatsapp.ts:70`                                   | `api/inbound-sms.ts:40`                                                               | `api/retell-inbound.ts:36` + `api/retell-webhook.ts:134`                                                        | `api/resend-webhook.ts:36`                                                                   |
| **2 Prove**       | HMAC-SHA256 over raw body, `whatsapp.ts:79-85`         | HMAC-SHA1, key = **the line's own subaccount token** from the vault, `sms.ts:202-218` | call start: **shared secret in `?key=`**, `retell-inbound.ts:40`; events: HMAC, `retell-webhook.ts:152`         | Svix HMAC-SHA256 **with a ±300 s replay window**, `channels/src/email.ts:229-239`            |
| _judgement split_ | **none** — 170 lines of inline branching               | `lib/sms-ingress.ts:71`                                                               | `lib/call-start.ts:100`                                                                                         | `lib/email-ingress.ts:45`                                                                    |
| **3 Route**       | `phone_number_id` → `resolveChannelDetailed`           | `To` → `lineByNumber` → same resolver                                                 | `agent_id` → same resolver                                                                                      | recipient address → `mailboxFor`; **only addresses on our own mail domain**                  |
| **4 Admit**       | `ingest_inbound.is_new`                                | same                                                                                  | `ingest_call`, forward-only by status rank                                                                      | **three gates**: `jobs_email_ingest_uq`, then `is_new`, then `processed`                     |
| **5 Keep**        | `ingest_inbound`                                       | `ingest_inbound`, `channel:"sms"`                                                     | **parallel** — `ingest_call` re-implements identity; the call lands on the thread as one `call_summary` message | `ingest_inbound`, `channel:"email"`, wrapped by an identity pre-step and an address backfill |
| **6 Judge**       | 21 ordered gates in `lib/whatsapp/inbound.ts`          | the same 21, plus the carrier hold                                                    | `lib/outbound-gate.ts:77` — **a second policy engine**, its own five rules                                      | `messages/email-ingest.ts:90` — a verb over ten ports, eight named outcomes                  |
| **7 Answer**      | brain + `steps.ts` layer two + hold plan               | identical, plus the A2P footer                                                        | the Retell agent, live on the call                                                                              | **never** — by design, until the drafting slice                                              |
| **8 Hold**        | `upsertEscalation`                                     | same                                                                                  | same (`callback`, `policy_block`)                                                                               | same (`email_review`), and it **throws** if the flag fails so the job retries                |
| **9 Act**         | none — the model pastes the booking URL into its words | same                                                                                  | four tools: `check_availability`, `send_booking_link`, `transfer_to_staff`, `end_call`                          | none                                                                                         |
| **10 Deliver**    | `deliver()`                                            | `deliver()`                                                                           | `deliver()`, after the second gate                                                                              | `deliver()`, with the frozen request read at the wire                                        |
| **11 Account**    | receipts inline, 200 always                            | own signed door, **503** so Twilio redelivers                                         | cron sweeps re-ingest and re-fetch                                                                              | all seven receipt types, inline at the same door                                             |

Three things fall out of that table.

**The one door out is real.** `sendText`, `sendTemplate` and `sendEmail` are imported by exactly one file, `packages/core/src/deliver.ts:29`. Nothing in the dashboard calls `deliver` at all: it queues a row and a job and lets `outbound_send` reach the door, which is the only thing that makes the 15-second undo honest.

**The way in was built four times.** Three of the four now have the door/judgement split — a route that is only the wire, and a pure function that decides. WhatsApp, the oldest and busiest, is the one that never got it.

**Email is the best-designed channel, and it is now finished in code.** _(Corrected: this paragraph said its outbound half was "architecture with no caller". That stopped being true while this document sat still.)_ `buildEmailRequest` and `hostedIdentity` are called from `apps/dashboard/src/server/connections/email.ts:35`; receipts, suppression writes, the mailbox doors, the Setup row, the Connections card and the Inbox composer all landed. For a contact with an address and no number the whole chain has a caller — arrives, stored, flagged, shown, answered, sent, accounted for. What is left is not code: `EMAIL_DOMAIN` and `RESEND_WEBHOOK_SECRET` are unset in production, so none of it has ever run. What was missing was never the conversation: it was the channel's own health, which nothing asked after and nothing could have noticed (**G23**).

---

## 4. Ownership: who holds a thread, and what that holds back

Three columns on `conversations` carry ownership, and one function decides what each of them stops.

`takeOver` (`packages/core/src/conversations/take-over.ts:8`) pauses the receptionist, claims the thread, and **withdraws the drafts already written** — a held reply landing after a person arrives is exactly what the veto window exists to prevent. `handBack` (`hand-back.ts:7`) releases it and resolves the open escalation. Both compensate on failure: a claim that changed no row puts the pause back before throwing.

At the wire, `refusalFor` (`packages/core/src/deliver.ts:216`) decides which pause holds which kind of send. This matrix is the product's manners:

| Send kind                                  | Workspace paused (billing) | A person holds the thread          | A person spoke since it was written |
| ------------------------------------------ | -------------------------- | ---------------------------------- | ----------------------------------- |
| `reply` — a person's own words             | **goes**                   | **goes**                           | **goes**                            |
| `draft` — the receptionist's held reply    | held                       | held only if somebody _claimed_ it | **retired** (`superseded_by_human`) |
| `answer` — the receptionist answering now  | held                       | held                               | n/a                                 |
| `broadcast`                                | held                       | held                               | n/a                                 |
| `system` — opt-in confirmation, HELP, STOP | held                       | **goes**                           | n/a                                 |

The subtlety worth keeping: a queued draft is deliberately **not** held by the thread's pause, because the receptionist's own escalation pauses the thread and queues its holding message in the same breath. For a draft the real question is "did a person speak since?", which `overtakenByHuman` (`deliver.ts:277`) answers by reading the thread — ignoring a broadcast's row, because a broadcast is a person's words but not a person speaking _on this thread_.

`SendKind` being a separate axis from `sender` is the reason all of this works: who wrote the words is a fact recorded on the row, and what policy the send goes under is a different question. Copy it anywhere a fifth channel is added.

**Three facts share two columns, and that is the root of G3 and G5 together.** _(Closed by 00130: live control is its own fact now — a holder, an expiry, and a claim taken behind a row lock. What follows is the reasoning it was built from.)_ `assignee_user_id` and `paused_until` are asked to carry _who is responsible for this customer_, _who is controlling the response right now_, and _may the machine act_. They are different facts with different lifetimes. Responsibility can outlive an interaction and should survive a handover; control of the current exchange must be claimed and released and must expire; permission for the machine to act is a policy answer, not something to infer from whether a row happens to name somebody. Collapsing them is why a departed teammate holds a thread for ever (G3) and why nothing can say "a call is in progress, do not start a second conversation" (G5) — there is no place to write it. Anything built on top of the present two columns is a patch; the durable fix is to separate the three and give the middle one an atomic claim with an expiry, because a read-then-decide loses the race it exists to settle.

**One hold per thread.** `upsertEscalation` (`packages/jobs/src/escalate.ts:14`) inserts or refreshes, and **the refresh overwrites the reason**. Nineteen reasons exist (`packages/contracts/src/enums.ts:269`) and they are the whole vocabulary for "a person is needed". Two of them — `deadman` and `manual` — have no emitter anywhere.

---

## 5. The three flows you asked about

### 5.1 A lead arrives and is answered

Four front doors, and a shorter shared road than it looks: **only WhatsApp and SMS run the receptionist**. `inbound-sms.ts:76` calls the same `handleInbound` the Meta webhook calls, having reshaped the text into a WhatsApp-shaped message whose `from` is bare digits — "so one person is one thread across both channels."

Voice never joins that road. A call is answered live by the Retell agent and _deposited_ on the thread afterwards as a single `call_summary` message keyed `call:<retell_call_id>`. Email steps off the road deliberately, before the receptionist's turn.

The 21 gates on the text road are asked in a fixed order — allowlist, dedupe, per-person mode, consent, carrier hold, message kind, staleness, opt-in confirmation, thread pause, daily cap, token budget, workspace paused, reply mode, then the model, then layer two. Opening hours are enforced where they decide a _time_: `freeWindows` builds every offered window out of that day's own intervals, so a closed day offers nothing. They are enforced nowhere else — nothing stops the receptionist answering at three in the morning, and nothing stops a transfer being offered to a line nobody is standing beside. Whether either is a defect is a product question asked per action, not a missing gate.

### 5.2 Handing a conversation to a person

Take over → claimed, drafts withdrawn, receptionist paused. Reply → a queued row, a 15-second cancel window (`SEND_GRACE_MS`) that **is** the undo, then `outbound_send`. Hand back → released, escalation resolved. Every step writes a `decisions` row; every step is re-read at the wire.

One piece of it is now vestigial. `mirrorBlobPause` (`apps/dashboard/src/server/service.ts:172`) makes an HTTP round trip from the dashboard to the edge on every take-over, hand-back and reply, to mirror the pause into the receptionist's old Blob memory. That memory is retired — `apps/edge/api/admin/pause.ts:25` answers "ok, nothing to do" — so the call, and the careful compensation ordering built around it, now guard nothing.

### 5.3 Texting while talking, and WhatsApp during a call

The voice agent holds exactly four tools (`packages/channels/src/voice-shell.ts:114`):

| Tool                 | What it does                                  | What it may not do                                                |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| `check_availability` | reads the open windows                        | **"Never confirm a slot yourself"** — it offers, it does not book |
| `send_booking_link`  | texts the caller the booking link on WhatsApp | one template, one link, to the number they are calling from       |
| `transfer_to_staff`  | warm transfer to the business's own line      | only the number the workspace configured, filled per call         |
| `end_call`           | ends it                                       | —                                                                 |

`send_booking_link` reaches `apps/edge/api/retell-fn.ts`, and that file is the model for how a second sender should be built: it routes by `agent_id`, normalizes the number the caller _said_ (ten digits) against the number we _store_ (fifteen), refuses a number that is not the caller's unless that person is already a contact, and then asks two gates in order — `outboundGate`, whose answer becomes **a sentence the agent speaks** and which never names our internal state to a caller, and then `deliver()`, which re-reads everything at the wire and adds what the gate cannot see: erasure, and a human who spoke since.

Two gates is not an accident: one exists to produce words for a caller who is waiting, the other exists to be right. Where the door refuses for a reason the gate has no script for, `retell-fn.ts:255` maps it onto one that does.

**What nothing does:** no inbound text path reads the `calls` table. A customer on the phone who also sends a WhatsApp message is answered by the text receptionist independently, with no knowledge that a call is in progress — two agents, one person, the same minute. The memory is unified _after_ the fact and not during: the voice agent is handed twelve turns of recent history at call start, and the finished call becomes a message the text side can read, but neither knows what the other is doing right now.

---

## 6. The gap ledger

Ranked by what it costs a real customer conversation. Each names the evidence, what someone actually experiences, and the shape of the fix. **✅ marks one that has since been closed.**

### Severity 1 — a customer is failed today

**G1. ✅ The voice booking link works on one workspace.** `booking_link_v1` is inserted by `supabase/migrations/00004_inbox.sql:63` for the pilot's slug and nowhere else. It is not in the starter library (`packages/contracts/src/template-library.ts` ships seven templates; this is not one) and `00017_provision_tenant.sql` does not create it. `retell-fn.ts` sends that template name regardless, and `deliver()` on this path never checks `templates.meta_status`.
_What happens:_ on every workspace but the salon's, a caller asks for the booking link, Meta rejects an unregistered template, and the agent says **"that number may not have WhatsApp"** — naming the wrong cause to a customer who is on the phone. The core promise of the phone receptionist does not work for a new customer.
_Fix:_ add it to the starter library and seed it in `provision_tenant`, or make `send_booking_link` refuse with an honest sentence when the template is not approved for this workspace.

**G2. ✅ Email arrives, the owner is told to reply from the Inbox, and the Inbox cannot.** _Closed by the reply slice: `replyToConversation` now carries `channel: "whatsapp" | "sms" | "email"` and takes its recipient from the contact's stored address._ `email-ingest.ts:86` says "read it and reply from here"; `apps/edge/lib/email/email.ts:59` says "Reply from the Inbox." `packages/core/src/conversations/reply.ts:82` refuses any contact with no phone number, and `QueuedReply.channel` is typed `"whatsapp" | "sms"` (`reply.ts:38`, `:50`; `verbs.ts:171`).
_What happens:_ an `email_review` hold on an email-only person is unanswerable from the product. Its only exits are Resolve or Archive, both of which record a decision claiming the thread was handled.
_Fix:_ this is the reply slice, in flight now. Until it lands the notification copy is ahead of the code — the honest interim wording is "read it and reply from your own mail."

**G3. ✅ A thread taken over and never handed back is stuck for ever.** `takeOver` deliberately leaves the escalation open (`take-over.ts:7`). `expire_stale_pauses()` (`00006_expire_stale_pauses.sql:17-22`) refuses any row that still has one. So the pause time passes, `answer` and `broadcast` resume, and every `draft` is refused for ever on a stale `assignee_user_id` (`deliver.ts:255`) — the workspace's veto window silently stops working on that thread, with no event and no expiry.
_And it is reachable by an HR event:_ nothing anywhere clears `assignee_user_id` when a membership is deleted (`service.ts:555`), so the thread reads as "theirs" to every remaining member, for ever.
_Fix:_ clear the assignee when a membership is removed; give the sweeper a second limb for a pause long past its time whose escalation is older than some ceiling; or stop treating a stale assignee as a live claim at the wire.

**G4. ✅ The Booking autonomy dial is not honoured on the phone.** On text it is enforced twice — in the prompt, and in `layerTwo` (`packages/core/src/inbound/steps.ts:100-112`), which _strips the booking link out of the reply_ and escalates. On voice, `retell-fn.ts:173` reads `rt.policy?.reply?.mode` — the **reply** class, not `booking` — and `retell-availability.ts` reads no policy at all.
_What happens:_ a workspace that set "Ask me first" on bookings still has its phone agent reading open times aloud and texting the booking link, while its WhatsApp receptionist is being muzzled for the same request.
_Fix:_ read `policy.booking` in both voice endpoints, the way `policyAskClass` does on text.

### Severity 2 — correctness holes that will bite

**G5. ✅ Two AI agents can talk to one person at once.** No inbound text path reads `calls`. _The fix was not the read this entry proposed — a read-then-decide loses the race. A call takes an atomic hold on the caller's thread at the inbound door, and the wire refuses the receptionist's answer while it is live._

**G6. ✅ The runaway guard opens exactly when it is needed.** `retell-fn.ts:210-214` — `countSentToday(...).catch(() => 0)`. A failed count reads as "nothing sent today", so the three-per-day cap that exists because "a voice agent that called its own tool in a loop sent thirty billable templates to one person" stops binding during the database trouble most likely to cause the loop. The same file's door, `deliver.ts:199`, throws on an unreadable read on principle.

**G7. ✅ "We could not check" is read as "nobody" on the voice erasure gate.** `retell-webhook.ts:243` — `erasedBeforeCall(...).catch(() => false)`, against `apps/edge/lib/erased.ts:18`, which states the opposite rule in its own header.

**G8. ✅ Zero rows updated is read as success in the call path.** `linkCallMessage` and `setCallRecording` (`packages/db/src/repositories/calls.ts:97-124`) update without `.select()`. The second matters: the audio is already in the bucket, the row still says `pending`, so the cron re-downloads and re-uploads it three times and then marks it failed — leaving an orphan object that the purge (which selects `fetch_state = 'stored'`) will never remove. This is the trap the repo names by name elsewhere and avoids everywhere else.

**G9. A replayed `call_analyzed` extends the customer's pause by another full window.** `retell-webhook.ts:322` re-evaluates `Date.now() + pause_hours` outside the notification claim taken at `:365`. Retell retries three times.

**G10. ✅ A refused booking link leaves no trace.** `retell-fn.ts:220` logs to stdout. Every other refusal in the system lands somewhere durable — `message.send_blocked`, a recipient's reason, a `send_failed` escalation. "She said she never got the link" has no answer.

**G11. ✅ The deadman sweep can steal an email in flight.** `sweepUnfinished` (`apps/edge/lib/receptionist/unfinished.ts:90-140`) claims any inbound customer message with no `processed_at` after three minutes, raises `brain_error` — _"The receptionist never answered this"_ — and stamps the row processed. An `email_ingest` job still retrying then finds `processed` true and returns `already_handled` (`email-ingest.ts:121`), so `email_review` is never raised, the owner's email is the wrong one, and `mailboxes.last_received_at` is never stamped. _Fix:_ exclude `channel = 'email'` from the sweep, or give it the email words.

**G12. ✅ An email can arrive and nobody is told.** _(It was never an email bug: every caller of `upsertEscalation` went silent when a thread's reason changed. The outcome says `changed` now.)_ `email-ingest.ts:129` tells the workspace only when the escalation came back `"opened"`. Because there is one open escalation per thread _regardless of reason_, a thread already holding `carriers` or `opt_out` gets its reason rewritten to `email_review`, returns `"refreshed"`, and the bell stays silent.

**G13. ~~WhatsApp is the one door with no judgement split.~~** _(Rewritten on checking; the premise was wrong when this was written.)_ The claim was that the 503-vs-200 decision at `whatsapp.ts` “is held by nothing but reading 170 lines”. It is not. `tooling/scripts/tests/whatsapp/whatsapp-door.test.mjs` — committed three days **before** this document — calls the handler's own POST with a delivery signed the way Meta signs it, over a database in memory, and runs eleven cases: the two 401s, the handshake, a routed number, a number the database answers is not ours, a number it could not answer for (**503 with the count**, the platform told, and the redelivery landing once the read works), the environment's own number riding the blip out, WABA news, receipts, two echo cases, and the ack rule itself. Measured: **96% of lines and 84% of branches** of that file. What is genuinely missing is the SHAPE — a `planWhatsappChange` the three later doors each have — and its value is in the next change to that file, not this one. Worth doing when something else is being done there; not worth doing to a covered door on its own.

**G14. ✅ Repeated deliveries have effects that are not idempotent.** _(Rewritten: the first version of this finding asked for a fix that would have lost customer messages.)_ Neither older provider gives us a freshness check to make — Twilio signs the URL and its parameters, Meta signs the raw body, and **neither carries a timestamp**, so email's five-minute window has nothing to copy across. And Meta redelivers a failed webhook for up to seven days, so an age check on the event would discard precisely the retries the 503 contract exists to earn.

The real finding is narrower and fixable. `ingest_inbound` already makes a replayed _message_ harmless; nothing else on those doors is idempotent. The owner-echo branch slides `paused_until` forward by a fresh pause window on every redelivery, `sms-status.ts` re-applies a status, and `ingest.unroutable` is emitted once per change with no throttle where the email door holds it to one a minute. Make those three harmless on the provider's own event identity; do not add a clock the provider never sent.

**G15. ~~`lineByNumber` is not tenant-scoped.~~** _(Withdrawn on checking.)_ A lookup that takes a number and no tenant reads like an isolation hole — but `lines_e164_live_idx` (`00066_lines.sql:39`) is a unique index on `(e164) where e164 is not null and voice_state <> 'failed'`, and the lookup filters on exactly that predicate. One live line per number is enforced by the database, so the row cannot be ambiguous and there is nothing for an `order by` to stabilise. Discovering the tenant from the destination number is also what the door must do _before_ it can choose the credentials that verify the signature. Kept here rather than deleted, because the lesson is worth the line: looking something up without a tenant is safe exactly when a constraint says it is, and a real hole when none does.

**G16. ✅ A day can be skipped or doubled around a daylight-saving change.** `freeWindows` stepped its horizon by adding 86 400 000 ms and then asking which local day that landed on — and so did three more readers: "tomorrow" in a question (`ask-fast-paths.ts`), the _Tomorrow_ label on a visit (`calendar-people.ts`), and the Calendar's own offer horizon (`calendar.ts`), which is computed apart from `freeWindows` and has to agree with it. **Measured with the repo's own engine, not argued:** asked at 23:30 on 7 March 2026, New York was offered 9–13 March and **8 March was never offered at all**; asked at 00:30 on 1 November it emitted 1 November twice and lost 6 November off the far end. Nothing errors — the receptionist just says the wrong days out loud, twice a year. _Fixed:_ one `dayPlusInZone` that reads the date in the business's zone and steps it over UTC midnights, which is how the RRULE expander beside it has always worked (and why a weekly appointment stays at 2 PM across a change while the offered days did not).

**G17. ~~Every workspace's clock is New York until somebody changes it.~~** _(Withdrawn on checking; already built.)_ `tenants.timezone` did default to `America/New_York` since `00001`, and that part is history. But the entry's live claim — that there is no way to change it afterwards — is false: `PATCH /api/v1/workspaces` takes a timezone, owner-only (`apps/dashboard/app/api/v1/workspaces/route.ts:123`), and Settings draws a full row for it (`settings.jsx:536`) — the current zone in words, a picker of the known zones, and a _Use this device's (City)_ shortcut, with the confirmation _“Your day is measured in <city> now.”_ Nothing here is open. Counted alongside G13, G19 and half of G21: the parts of this ledger written from a scan rather than from the code have not held up, and the reader should check before working from them.

**G23. ✅ A mailbox has no health, and the one failure it cannot survive is the one nothing would notice.** Four facts on `mailboxes` were written by nobody or read by nobody. `last_error` had a **clearer and no writer** — `stampMailboxReceived` has always set it back to null on a successful intake — so a dead `email_ingest` job left the channel looking perfectly well. `last_received_at` is displayed and read for nothing. And above both of them sits the one every workspace shares: **the mail domain**. A verified domain stops being verified without anybody doing anything (a record edited for another reason, a zone restored from an older copy), the provider then accepts mail and drops it with no bounce to the sender, and a mailbox that receives nothing looks exactly like one nobody happened to write to. _Fixed:_ the health tick now ASKS the provider each time — only `verified` is healthy, a status this code has never heard of alarms rather than buying silence, and it pages the platform once per window like the other two conditions no sweep row can show. A dead intake marks the mailbox in the owner's words, and Connections reads it. **Staleness is deliberately NOT a signal:** a salon that got no email for four days is a salon, not an outage, and an alarm that cries wolf is how the next real one is missed. _(Still open, and named rather than half-built: `reply_token_prev` can be read but nothing rotates a token; `reply_mode` has no reader in TypeScript at all — the receptionist does not answer email, so there is nothing yet for it to tighten.)_

**G24. ✅ Nobody ever joined the waiting list, and nobody could have looked.** `public.waitlist` (00088) had a writer and **no reader anywhere in the product** — which is how it went unnoticed that the writer did not work either. `joinWaitlist` was one `upsert` with `onConflict: "email"`; the table's only unique index is on `lower(email)`, an EXPRESSION, which PostgREST cannot name in an ON CONFLICT clause. Every call came back **42P10**, _"there is no unique or exclusion constraint matching the ON CONFLICT specification"_ — a sentence containing the word "unique", which the error test `/duplicate|unique/i` swallowed as a duplicate. The route logged `waitlist_join`, the page said "you are on the list", and the list stayed empty. _(Measured against the real table, not read: the insert fails and the row count is zero.)_ **CORRECTED, and the correction matters.** I wrote that production ran the _invite_ posture, so nobody real had been lost. That was wrong, and I did not check it before writing it: `GET https://app.chanlytics.com/api/v1/signup` answers `{"posture":"waitlist"}`. The door has been standing in the queue posture with a writer that never wrote. Every person who typed their address before this fix shipped was told _“you are on the list”_ and was not on it, and there is **no way to recover them**: the route logs `waitlist_join` with no address, and the rate limiter stores a hash. Counting those log lines in Vercel is the only measure of how many. From the fix onward they land, and the back office shows them. _Fixed:_ insert, and match the **code** `23505`, not the words; a repeat updates what they told us and never their `created_at`, and an already-invited row is left alone. The back office grew the reader — who is waiting, how long, where from — on the same door and the same round trip as the workspace list, with the one honest action: **nothing is sent**, because there is one shared sign-up code, so an invitation is a mail a person writes and the stamp records that they wrote it. _(The unit test that used to guard this asserted the two broken lines by name. It is gone; `waitlist.db.test.mjs` proves the behaviour against Postgres and fails against the previous build.)_

**G25. ✅ An email whose intake threw once was lost for good, and nothing could bring it back.** `ingestEmail` is written to be run again: the message is recorded under the provider's id and marked handled last, so _"the next try finishes it"_, and `fetchReceivedEmail` throws precisely so that "we could not ask" is never read as "it is gone". There was no next try. The tick failed every job that **threw** on the spot, `failed` is final (`jobs_guard`), and 00127's one-intake-per-email index counts failed rows, so a webhook replay answers 23505, _"already taken in"_. Found live on email's first day (18 Sep 2026): an email arrived while the deployment's key could send but not read (401 `restricted_api_key`), its job was failed, and the key was replaced sixteen minutes later. _Fixed:_ a kind listed in `RETRY_WAITS_MS` (only `email_ingest`) is **kept** when it throws. The row stays `fired` with its lease put off five minutes, then thirty, and is claimed again as a lease that ran out. `MAX_ATTEMPTS` bounds the tries, and the third failure still fails the row, marks the mailbox and tells the owner. No migration: `jobs_guard` already lets a fired row stay fired. **And what outlasts the tries can be brought back (00135):** the index no longer counts a failed row, so replaying the email's webhook from Resend once the cause is fixed schedules a fresh intake. A live or finished one still holds the email, and a second take cannot store it twice, because the message row is keyed on the provider's id. The one email lost this way was the owner's own test, "test2".

### Severity 3 — drift and dead weight

- **G18. ✅** `mirrorBlobPause` was a network round trip from the dashboard to the edge, made before every take-over, hand-back, snooze, archive and operator reply. What it mirrored into was the retired Blob thread store: with `BLOB_SHADOW=off` the endpoint answered `{ok, store:"off"}` having done nothing, and in any other configuration it wrote a copy nothing reads. It was **not** merely dead weight — it was declared to fail loud, and its callers treated a mirror failure as a failed verb, so an owner pressing _Take over_ could be refused because a call that could not matter did not come back. Removed, with the `/api/admin/pause` endpoint it was the only caller of, and with the compensation five verbs carried for it (release the mirror, then put it back when the row turned out not to have changed). The property that compensation was reaching for now holds by construction: **a verb that changed no row did nothing at all.** What clears the pause is the same UPDATE that moves the state, and that is now read in a test rather than assumed.
- **G19. ~~Six independently written channel unions.~~** _(Re-framed on checking.)_ `ingest.ts` includes `email` now, and the three that do not — `whatsapp/persist.ts`, `whatsapp/inbound.ts`, `draft-queue.ts` — are the edge's WhatsApp-and-SMS receptionist path. The causation in the original entry is backwards: the type is narrow because the CAPABILITY is narrow. The receptionist does not draft email at all, so widening the union would admit email to a path with no wire, no template rules and no consent model for it — the type is the thing currently preventing a half-built road. It becomes real work on the day the receptionist drafts email, and belongs to that slice rather than to a tidy-up.
- **G20. ◐** `README.md` and `docs/system-map.md` said the product "books and reschedules"; they now say it reads the calendar, offers the open times and sends the link. The 10DLC filing still claims confirmations and is left alone on purpose — it is a statement to a carrier about what we send, so correcting it is a decision about the product rather than a wording fix. The original claim was: It does neither: there is no appointments table, no booking tool, no reschedule path, and the voice tool description says "Never confirm a slot yourself." The 10DLC filing (`apps/edge/lib/lines/a2p.ts:167`) tells the carriers we send appointment confirmations; we do not send any. `docs/system-prd.md:43` is the one that is accurate.
- **G21. ◐ Dead declarations — two of the four were already false.** Checked one by one rather than re-scanned: `REASON_SHORT` carries **all nineteen** reasons the CHECK permits, `budget` and `paused` included, so People renders no raw token; and `p_public_log_url` is inserted into `public_log_url`, not as `null` (`00007_calls.sql`). `field === "history"` does log and discard, which is the decision — we do not import the Business app's history — and the log says so. What is left is true and deliberately left alone: the escalation reasons `deadman` and `manual` have no emitter (every `"deadman"` in the source is a NOTIFICATION kind and every `"manual"` is a contact source). Their labels stay, because rows written before the deadman sweep moved to `brain_error` may still carry the value, and a label for a value the database still permits is a reader, not dead weight.
- **G22.** The legacy mockup surfaces still shipping (`apps/dashboard/src/legacy/**`) depict an agent that auto-reschedules and sends fifteen-minute pre-call reminders. Any surface not yet flipped to real data is making a promise the backend cannot keep.

---

## 7. What is genuinely right, and should be copied

1. **The door re-reads the facts at the wire, in one query, and throws when it cannot.** "The moment before the send is the one place a stale answer cannot be taken back" is the best sentence in the codebase, and the fail-closed discipline built around it is rigorous.
2. **`SendKind` apart from `sender`.** Who wrote the words and what policy the send goes under are different questions, asked separately.
3. **The three-valued `Wire`.** `undefined` = no such channel here; `null` = no credentials for this workspace; a function = send. It is the clean fix for one business's message leaving on another's line.
4. **`SPEAKS_TO_A_PERSON` plus claim-one-job-at-a-time.** Naming the class of work whose retry is unrecoverable, then restructuring the loop so "claimed" reliably means "started", is real distributed-systems honesty. Sends are at-most-once on purpose.
5. **Claim the recipient before the wire.** A broadcast writes `failed / OUTCOME_UNKNOWN` first and overwrites it with the truth a moment later: it risks one person not being sent to, in order to close a gap the width of a call to Meta. "Never twice wins."
6. **Guards in the database.** `messages_guard` (content immutable, status monotone, sent never becomes canceled) and `jobs_guard` (the state machine itself) live where every writer passes.
7. **Fail-open and fail-closed as a stated asymmetry.** A missing consent column must never silence a reply, and must never authorise a promotion. Two opposite defaults, each argued in place.
8. **Judgement separated from transport, five times over** — `judgeHealth`, `callbackPlan`, `replyPosture`, `planSmsIngress`, `planResendEvent`. Each returns a verdict the route executes, so the decision can be proved against a database in memory.
9. **The tenancy floor is proved, not asserted.** The suite enumerates tenant tables from PostgREST's own schema, so a new table with no proof fails by name, and it distinguishes "empty list" from "privilege refused".
10. **Email's intake is the state of the art here**: a pure judgement with no module state, pointer-then-job so the work happens under a lease, resume-not-skip, a claim that decides how _little_ is done, and a verb over named ports with named outcomes. And it is careful to say which of those lessons must **not** travel back to WhatsApp: there, a missed auto-reply beats a double text.

---

## 8. Convergence, in the order worth doing it

Ordered by what each batch stops costing somebody, not by how much code it tidies. The two that ship today ship today; nothing here holds a small fix hostage to a large one.

**Batch 1 — stop the unsafe failure modes, and stop saying untrue things.** G6 (a failed count reads as zero), G7 (a failed erasure read reads as nobody), G8 (zero rows read as success), G10 (a refusal that is only a log line), G14 (make the three repeated effects idempotent). Alongside them, the copy fixes from G20 and G2 — an interface that claims a capability the journey cannot deliver is a defect that costs nothing to correct. The test for this batch: uncertainty never authorises an action, and an unknown outcome is visible to somebody.

**Batch 2 — repair the voice and human-control journeys.** G1 and G4 first, because a paying workspace's phone receptionist under-delivers silently today and both are small. Then G3 and G5 together, as one change rather than two patches, along the seam named in §4: separate responsibility, live control and automation permission, and give control an atomic claim with an expiry. G9 rides with it. G16 and G17 belong here too, because a wrong day and a wrong clock are wrong in the one number a customer is told out loud.

**Batch 3 — finish email end to end.** G2, G11 and G12, plus as much of G19 as the reply path actually needs. The acceptance test is an **email-only** contact: received, shown, composed, queued with its undo, sent from the right identity, outcome recorded, thread continued. A contact who also has a phone number does not prove it.

**Batch 4 — consolidate, and remove what is superseded.** G13 (lift `whatsapp.ts`'s judgement into `planWhatsappDelivery`, the fourth of its kind — no behaviour change, and the 503 decision becomes testable), G18 (retire the Blob mirror and the compensations built around it), the rest of G19, G21, G22. This batch is last on purpose: it is the one whose value is entirely in the next change, not this one.

**One thing to extend rather than invent.** `capabilityStatus` (`packages/contracts/src/capabilities.ts`, table `capability_activations`, 00108) already answers "is this workspace actually ready for this channel" for `voice`, `whatsapp` and `sms`, off real prerequisites. G1 and G2 are both the same shape of bug — a capability that exists in types, seeds and interface copy but not in the journey — so they belong in that model as two more kinds, `booking_link` and `email_reply`, with `ready` meaning the whole path was checked and not merely that a row exists.
