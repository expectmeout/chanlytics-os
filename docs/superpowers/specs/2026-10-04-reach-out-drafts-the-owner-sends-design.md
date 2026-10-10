# Reach out: the owner sends — design spec

**Status:** approved in conversation on 4 October 2026 (Ruben: "approved as you recommend"); written against commit
`be7b5d3e7` (main, 4 October 2026, after #1383), and every file, function and line below was read at it. Where this
note and the code disagree, the code wins. It amends `docs/superpowers/specs/2026-09-25-reach-out-design.md` §4.6
(the wire) and supersedes its decision 3 ("a second Resend account for cold mail").

**Program.** This is step 1 of four, each its own spec: (1) the owner sends each cold email from their own inbox, this
note; (2) a workspace connects its own Google Workspace or Microsoft 365 mailbox and the product sends and reads
through it; (3) `sending_domains` becomes the branded From of the hosted and offers lanes, on the platform's own Resend
account; (4) the cold-lane variables and code leave with step 3. Nothing here waits on 2, 3 or 4.

## 1. Goal

Reach out keeps everything it does — the chain, the check, the opening, the holds, the approval, the pace, the stops, the
reading of what comes back — and **Chanlytics never sends the cold email**. Each one is handed to the owner, written and
checked, with the doors that open it in their own mail client; the owner presses Send there and tells the product it
went. What the owner is told back lands on the lead through the same door the model's readings use.

Why. Resend's acceptable use policy prohibits "unsolicited messages of any kind, including cold outreach, purchased
lists, or scraped contact data", and shuts an account over 4% bounces or 0.08% complaints without warning
(https://resend.com/legal/acceptable-use, read 4 October 2026). The cold lane as built (§4.6 of the Reach out spec)
sends exactly that through a Resend account of ours, and a second account changes the use of nothing. The 25 September
decision was taken without reading the provider's rules; this note corrects it. The platform's own account stays for
what it is allowed: the receptionist's replies, reminders, and offers to people who said yes.

## 2. What the product does today

Read at `be7b5d3e7`; the map is `docs/superpowers/specs/2026-09-25-reach-out-design.md` §4 as built.

- **Nothing sends.** `coldLane()` (`apps/edge/lib/reach-out/sender.ts:114`) needs `RESEND_COLD_API_KEY`,
  `RESEND_COLD_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`, `RESEND_API_KEY` and `EMAIL_DOMAIN`, and gates **both** clocks:
  the send sweep claims nothing and the check sweep checks nothing (`api/cron/reach-out.ts`,
  `api/cron/reach-out-check.ts` answer 503 `cold_lane_unset`). Production has never held the cold key. The sheet refuses
  Start without a verified own domain (`sheet.tsx:155`, `pace.domains > 0`; the words
  `REACH_OUT_SHEET_WORDS.noDomain`), and Connections draws no domains block (`sending-domains-ops.ts:56`, 503
  `no_cold_key`). So Reach out is inert, and no customer has used it.
- **A send's life.** `reach_out_sends.state` is `planned | held | claimed | queued | sent | skipped | failed | handed`
  (00183, 00197, 00228), moved under `reach_out_sends_guard()`. The check (`check.ts`) stamps `checked_at` or holds;
  `reach_out_claim(p_domain_id, p_cap, p_at, p_limit)` claims checked, due sends **per verified domain** within
  `sending_domain_capacity`; `writeOne` (`sender.ts:296-433`) renders the email at claim time through `reachOutRequest`
  (`request.ts:110`), makes the lead's person (`reach_out_person`), writes a `queued` `messages` row with the frozen
  Resend request in `meta.email.request`, schedules `outbound_send` with `purpose: "outreach"`; `deliver()` routes it to
  the `own` lane (`wire-senders.ts:141`), `sendEmail` posts to Resend; the clock's `reconcile` reads `messages.status`
  back (`queued → sent`, and `leadWritten`: the lead to `nurture`, `contacted_at`, `last_outcome = 'emailed'`).
- **A nudge** answers the parent email: `parentEmailOf` needs the parent's RFC Message-ID, stamped by Resend's receipt;
  without one it waits and skips `parent_unstamped` after fourteen days (`sender.ts:324-329`).
- **The foot** is `emailFoot(business, address, {kind: "cold", why, unsubscribeUrl})`
  (`packages/contracts/src/templates/email-foot.ts:85`): why, "This is a marketing email.", who and where, "Not
  interested? Reply "no thanks" and I won't write again.", `Unsubscribe: <url>`. It refuses a blank part, and the
  URL is sealed under `UNSUBSCRIBE_SECRET`, which production does not hold.
- **A reply** comes back to `r+<mailbox token>@` the cold reply domain, the intake asks `reach_out_reply_of`, one
  `reply_read` job reads it (Haiku), `readingPlan` (`reach-out-replies.ts:522`) is the one table of effects and
  `reach_out_reply_apply(p_tenant_id, p_message_id, p_reading, p_plan, p_reread, p_days)` executes it in one
  transaction: the lead's waiting sends skipped, Talking through `lead_convert_by(.., 'reply', ..)`, `resume_at`, a no
  through `set_email_marketing(.., 'reply', ..)` and the never-again list, a dated step, `reach_out.replied`. The row is
  `reach_out_replies`, keyed by `message_id` (no foreign key to `messages`; `claim` is `person | automated |
  auto_reply`). The undo is `reach_out_reply_undo(p_message_id)`, seven days.
- **The owner already sends one email themself.** `POST /api/v1/leads/[id]/draft` (`lead-draft.ts:88`) answers
  `{to, subject, body, mailto}`; the peek offers *Open in mail app* and *Copy* (`peek/acts.tsx:70-142`), and either arms
  "Did you send it?" (`LEAD_SENT_QUESTION`), which writes contacted. The phone shell opens `mailto:` natively
  (`apps/mobile/src/shell/Surface.tsx:172-179`). A chain's last step may be a **hand step** (00228): the day's run writes
  one send per lead in state `handed` and a dated step on the person; it waits for no approval.
- **The "forward a copy of your address" setup** of the 17 September email plan was never built: `mailboxes` has no
  forwarding column, and the intake does not recognise an owner's hand-forward. A reply that lands in the owner's own
  inbox is invisible to the product.

## 3. Decisions

Taken in conversation on 4 October 2026, as recommended.

1. **Cold email never leaves through Resend, from any account.** The cold Resend account is never created;
   `RESEND_COLD_*` stay unset. (Supersedes the Reach out spec's decision 3.)
2. **The owner sends, from their own inbox**, each email handed to them written and checked, with Gmail, Outlook,
   their mail app and the clipboard as the doors. A workspace with no mailbox of its own has no cold email: owning a
   domain and a mailbox is the entry ticket to the channel, and the product says so rather than lending its own.
3. **Drafts replace the wire** (approach B): the Resend path leaves `writeOne` and the clocks now; `sending_domains`,
   the domains sweep, the Connections block, `emailWireFor`'s own routes and `deliver()`'s outreach refusals stay for
   step 3, and the four cold variables stay declared because the domains sweep and inbound routing read them (a
   correction to the approved design's §6, which said they go: they go in step 4).
4. **Every protection stays**: the check and its holds, Approve, the door's facts about the lead (asked when the draft
   is made and again when the owner says it went), the never-again list, the stops, the fourteen-day rule.
5. **The foot carries the way out in words.** "Not interested? Reply "no thanks"" is the opt-out; the Unsubscribe link
   appears only when `UNSUBSCRIBE_SECRET` is set. CAN-SPAM asks for a working opt-out and a postal address, both of which
   the foot keeps; it does not ask for a link.
6. **What they said back is the owner's to tell**, on the lead, and is a reading like the model's: the same
   `readingPlan`, the same door, the same undo. Step 2's mailbox reader replaces the owner's hand without changing the
   lead's story.
7. **The person is made when the owner says it went**, not when the draft is made: a lead whose draft was skipped was
   never written to.
8. **Thirty a day per chain** (`REACH_OUT_DRAFTS_PER_DAY`), the ramp's first step, handed at the chain's start time: the
   owner is the pace, and the product does not hand them more than a morning's work. The ramp (30 → 100 → 200) was a
   provider's reputation rule and is retired from Reach out; `domainDailyCap` stays in `sending-domains.ts` for step 3.
9. **A draft left fourteen days is skipped** (`kept_waiting`), as a hold is: a run finishes, and Today stops asking.

## 4. Design

### 4.1 The object: a send the owner delivers

`reach_out_sends` gains the state **`drafted`**: checked, rendered, handed to the owner, and open (the run stays
`sending` while any exists). New columns: `drafted_at timestamptz`, `draft jsonb` (`{to, subject, body, text}`: the
address, the subject, the words with their values and opening, and the whole email as it reads with its foot; an
object, under 8,000 characters of text), `told_at timestamptz` and `told_by uuid` (the member who said it went or did
not). `domain_id` is null on every send planned from here on.

Moves, under `reach_out_sends_guard()`:

| From → to | Who | Reason |
| --- | --- | --- |
| `planned` (checked) → `claimed` | `reach_out_draft_claim` | — |
| `claimed` → `drafted` | `writeOne`, the draft frozen | — |
| `claimed` → `planned` / `skipped` | `writeOne`, as today | recheck; `lead_gone`, `missing_value`, `step_removed`, `run_canceled`, `no_parent` |
| `drafted` → `sent` | `reach_out_send_told`, outcome `sent` | — |
| `drafted` → `skipped` | `reach_out_send_told`, outcome `not_sent`; the door's refusal at Sent; `reach_out_lead_stop`; `heldStale` after 14 days; `reach_out_save` dropping the step; `close` of a canceled run | `owner_skipped`; the refusal (`outreach_wrote_back`, …); `owner_stopped`; `kept_waiting`; `step_removed`; `run_canceled` |

`sent`, `skipped`, `failed` and `handed` stay final. `queued` and `failed` stay in the CHECK for the rows history
holds (none in production) and are written by nothing from here on. `finishableRuns` counts `drafted` as open;
`heldStale` reads `drafted_at` beside `held`'s clock.

**Words.** *Drafted for you* (a send), *Told* (what the owner said of it: it went, or it did not; and, of a reply, what
the business said). The glossary gains both rows.

### 4.2 The day's drafts

The send clock (`reach-out-sweep`, every minute) and the check clock (`reach-out-check-sweep`) run without a lane.
`coldLane()` and `Lane` go; `claimAndWrite` takes what it reads already (`db`, `now`, `started`, `log`, `tenantId`). The
check needs the model alone, as it did; the two cron doors answer 200 and no longer know a 503 `cold_lane_unset`, nor
the `lane_missing` field of their 200. `cold_lane_unset` leaves `EDGE_ERROR_CODES` (`shared/edge-errors.ts:36`; the two
sweeps were its only callers, and `error-codes.test.mjs` holds the set both ways); `no_cold_key` stays, the domains'.

**The claim**, `reach_out_draft_claim(p_root_id uuid, p_cap integer, p_since timestamptz, p_at timestamptz, p_limit
integer) returns setof reach_out_sends`, the shape of `reach_out_claim` without its domain: an advisory lock per chain
(`reach_out_draft_claim:<root>`); room = `p_cap` less the chain's sends drafted since `p_since` (the workspace's day
start, in its zone, as the planner computes it today); picks checked, due (`send_at <= p_at`) `planned` sends of a
running step and root in a run `scheduled` or `sending`, oldest `send_at` first, `for update skip locked`, and moves
them to `claimed`. The old `reach_out_claim` is dropped in the same migration; nothing calls it.

**The planner.** `runReachOut` (`packages/core/src/campaigns/run-reach-out.ts`) plans a day's share of
`REACH_OUT_DRAFTS_PER_DAY` with no domain and no gap: every send of the day due at the chain's start
(`send_at` = the run's day at the time the sheet chose), since the owner sends at their own pace. The outcome
`held: no_domain` goes; `no_room` stays (a spent month, `REACH_OUT_MONTH_EMAILS`). `gap_minutes` stays on the row and
the schema (a saved chain keeps it) and decides nothing.

**`writeOne`** after the claim (`sender.ts:296-433`), in order: the lead's slots, the workspace's facts, the step's words,
the recheck on changed words (as today); the parent for a nudge (§4.5); the words through contracts
(`reachOutDraftOf`, §4.3); the lead's address as `to` (`leads.email`, the finder's checked one, the same
`reach_out_person` takes; a lead with none, or whose `email_state` is `invalid`, skips `no_address`); the door's facts, `outreach_lead_facts(tenant, null,
to, lead)` read through `outreachRefusalOf` — a refusal skips with its reason; then one move, `claimed → drafted`, with
`draft` and `drafted_at`. No `messages` row, no job, no person yet. `HOLDS` loses `no_mailbox` (nothing needs a Reply-To
token); `no_business_address`, `no_template`, `no_subject`, `unknown_slot`, `words_unsendable`, `no_signed_by`,
`no_booking_link` stay, each replanned an hour on as today. `adopt`, `withdrawEmail`'s reach-out call, the `queued`
branches of `reconcile` and `unstick`, and `insertQueuedEmail`'s reach-out caller go with the wire.

### 4.3 The words of a draft

**The email**, pure, in contracts: `reachOutDraftOf(p: {words, slots, workspaceSlots, opening, parentSubject, business,
address}) → {ok: true, subject, body, text} | {ok: false, reason}` in `packages/contracts/src/reach-out/reach-out-draft-words.ts`
over `reachOutEmailOf` (the six slots, `reach-out-rules.ts:113`) and the cold foot. The subject of a nudge is `Re: <the
parent's subject>` (D19). The edge's `reachOutWords` (`request.ts:73`) is this function's caller; `reachOutRequest` and
its Resend headers are no longer called by Reach out and leave with the wire (`reach-out-request.test.mjs` goes with
them, its slot and foot cases moving to the new module's test).

**The foot.** `EmailFoot`'s cold kind takes `unsubscribeUrl: string | null`. With a URL the five lines read as today;
with null the fifth line is left out and `COLD_NO_THANKS` is the way out. `coldParts` requires why, who and where, and
the URL only when one is given. `emailFootHtml` is unchanged (a draft has no HTML twin: the owner's client writes it).
A draft's `text` is `body`, a blank line, the foot.

**The doors into a mail client**, pure, `packages/contracts/src/reach-out/reach-out-compose.ts`:
`composeLinksOf({to, subject, text}) → {mailto, gmail, outlook, bodyInLinks: boolean}`.

- `mailto:<to>?subject=&body=`, each part `encodeURIComponent`'d once, line breaks CRLF, as `leadMailto` builds it today
  (`lead-draft.ts:43`), which moves here and is imported back by the lead draft (one helper, not two).
- Gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=&su=&body=` (`su`, not `subject`; Gmail ignores `subject`).
- Outlook: `https://outlook.office.com/mail/deeplink/compose?to=&subject=&body=`.
- **One length rule for all three** (`COMPOSE_URL_MAX = 3800`): Gmail's compose URL is cut at about 4,096 characters
  of the whole URL after encoding (sources: https://til.simonwillison.net/google/gmail-compose-url,
  https://www.w3tutorials.net/blog/url-to-compose-a-message-in-gmail-with-full-gmail-interface-and-specified-to-bcc-subject-etc/;
  Outlook accepts longer, https://gist.github.com/miwebguy/2e805e343e0d434f06f2194b92b925d8). When the longest of the
  three would exceed it, all three carry `to` and `subject` only and `bodyInLinks` is false; the page then copies the
  body to the clipboard as the link opens and says "The words are copied — paste them in." A 1,200-character body
  with its opening and foot encodes to about 2,500–4,800 characters depending on punctuation, so the rule will fire on
  some emails and never truncate one. The compose module's test holds the three URLs and the rule at the boundary.

### 4.4 Sent, and not sent

**The route**, `POST /api/v1/reach-out-sends/[id]/told` `{outcome: "sent" | "not_sent"}`, declared with `route()` as
`reach-out-sends/[id]/decide/route.ts` is (an owner, an operator or a partner; its own rate bucket, `reach_out_told`,
declared where the decide's is, at the decide's ceiling). `apps/dashboard/src/server/campaigns/reach-outs.ts` gains `tellSend`.

**For `sent`**, the server first asks the door's facts of the lead — `outreach_lead_facts` read through
`outreachRefusalOf` with `to` the draft's address — and a refusal (wrote back, said no, unsubscribed, bounced, stopped,
closed) becomes `reach_out_send_told(.., 'not_sent', <refusal>)`, answered in `PURPOSE_REFUSALS`' words: the owner is
told why and the send is skipped. Otherwise one service-role door, **`reach_out_send_told(p_tenant_id uuid, p_send_id
uuid, p_user_id uuid, p_outcome text, p_reason text default null) returns jsonb`**, in one transaction:

1. The send, locked, must be `drafted`; another state answers `{told: false, state}` (409 in words: "Already sent" /
   "Already skipped").
2. `reach_out_person(tenant, lead)`: a refusal (`lead_gone`, `lead_closed`, `no_address`, `already_yours`) skips the send
   with that reason and answers it; otherwise the person and their conversation.
3. The email, as a `messages` row with the shape `writeOne` wrote (`sender.ts:366-396`): `id` =
   `sendMessageId(send, attempts)`, `channel email`, `direction outbound`, `sender human`, `type text`, `body` =
   `draft.body`, **`status sent`**, `meta.source = 'reach_out'`, `meta.email = {subject, to: [to], text: draft.text,
   told_by, told_at}` and, for a nudge, `parent_id`; `meta.reach_out = {send_id, lead_id, contact_id, playbook_id,
   root_id, broadcast_id, attempt}`. No `request`, no provider id, no `message_id`: this email has no receipt, and
   nothing reads one (`stampEmailSent` never sees it).
4. The send → `sent` with `message_id`, `contact_id`, `told_at`, `told_by`, and `sent_at = told_at`: the chain's
   report counts `written` by `sent_at` (`reach_out_chain_report`), and so does Reports.
5. The lead written: `stage` `ready → nurture`, `contacted_at = now()`, `last_outcome = 'emailed'` — `leadWritten`'s
   rule (`clock.ts`), which moves into the door; nothing else reaches `sent` now.
6. One event on the lead, **`reach_out.told`** (new; the closed set in `packages/contracts/src/shared/enums.ts` and
   `workspace/activity.ts` gains it), with `{outcome, send_id, lead_id, business}` — for `sent` and `not_sent` alike.
   The clock wrote no event of its own for a send that left; the door writes this one.

**For `not_sent`**: steps 1 and 4 with `skipped` and `reason = coalesce(p_reason, 'owner_skipped')`, `told_at`,
`told_by`. No person, no message.

The run: `runSending` when the first draft is made (so Broadcasts shows it live, as it does on the first queued
email); `finishableRuns` closes it when no send is `planned`, `held`, `claimed` or `drafted`.

### 4.5 A nudge after a drafted parent

`parentEmailOf` answers the parent's `messages` row, its subject and `rfcMessageId`. A parent whose `meta.email` carries
`told_by` was sent by the owner: it has no Message-ID and never will. The nudge takes `Re: <subject>`, no `In-Reply-To`
and no `References` (the owner's client threads by subject and participants, which Gmail does within the thread's
week; Outlook may show it apart — accepted), and `parent_unstamped` is never a drafted parent's fate: the wait at
`sender.ts:324-329` applies only to a parent that has a `request` and no stamp. A nudge's day counts `after_days` from
the parent send's `told_at` (the planner reads the send row's time, as it reads `sent_at` today).

### 4.6 What they said back, told by the owner

A reply lands in the owner's inbox and the product cannot see it (§2). The owner tells the lead's peek what the
business said, and the telling is a reading.

**The route**, `POST /api/v1/reach-outs/leads/[id]/told` `{intent: "interested" | "question" | "not_now" | "no" |
"wrong_person", day?: "YYYY-MM-DD", refer_to?: string}` (`away` and `other` are the model's words for mail it read;
a person tells what a person wrote). The lead must have a send in state `sent`; otherwise "Nothing has been sent to
them yet" (409).

**The row.** `reach_out_replies` with `claim = 'told'` (the CHECK gains it), `message_id` = a fresh uuid — the row's id;
no message bears it, and the column has no foreign key — `told_by` (new column) the member, `conversation_id` the
person's, `lead_id`, `lead_contact_id`, `contact_id` the person, `send_id` the latest sent send and `answered_message_id`
its email, `intent`, `named_day`, `refer_to`, `summary` null, `read_at = now()`.

**The plan.** `ReplyClaim` gains `"told"`; `readingPlan(reading, {claim: "told", ...})` is the person's plan with two
differences: `tell: false` (the owner told us) and `draft: null` (there are no words to answer; the receptionist drafts
nothing). `automaticPlan` never applies. So: *interested* and *question* stop the chain and convert the lead
(`lead_convert_by(.., 'told', ..)`: its `p_how` list gains `told`); *not now* stops, sets `resume_at` and the dated step;
*no* stops, `set_email_marketing(.., 'opted_out', 'told', ..)` (its source list gains `told`) and the never-again list
with the business's own domain, `suppressFrom` null; *wrong person* stops with the step naming who.

**The door.** `reach_out_reply_apply` gains `p_told jsonb default null` (`{send_id, by}`). Given it, `v_of` is built from
the send and its lead (`lead_id`, `lead_contact_id`, `conversation_id`, `send_id`, `answered_message_id`, `claim 'told'`,
`business`, `lead_email`, `answered_to`) instead of `reach_out_reply_of`, `p_reread` must be 0, and the row is written
with `told_by`. Steps 2–7 run unchanged: one effect executor. `reach_out_reply_undo(p_message_id)` undoes a told reading
as it undoes a read one, seven days, offered on the peek ("Read as no · undo" and, for the others, "Undo").

**Where it shows.** The lead's line reads the row as today (`Wrote back Thu · interested`, `Said no`, `Not now ·
until …`, `reachOutLineOf`); the peek's timeline says "You said they wrote back · interested"; the person's thread strip
(`replyStripOf`) shows the reading with no "Use the draft"; `GET /api/v1/reach-out-replies` lists it (`claim: told`);
the chain's report and Reports count it among wrote back and said no (they read `reach_out_replies`). The notice
(`tell`) is not sent, the bell is quiet, and the 200-a-day read budget is not spent.

### 4.7 What the UI shows

- **The sheet** (`surfaces/campaigns/reach-out/sheet*.tsx`). *From* says: "You send these from your own inbox. Each
  email is handed to you, written and checked, with the doors to send it; up to 30 a day." No domain is read and Start
  needs none: `sheetFacts.ready` drops `pace.domains > 0`, `roReads` drops the domains read, `domain_ids` is sent as
  `[]`, `REACH_OUT_SHEET_WORDS.noDomain` and the `no_domain` start words go. *Pace* shows one line — the day's share and
  when it starts — in place of the two tokens; `gap_minutes` is no longer offered, and the sheet sends the schema's
  default of 12, which decides nothing. *Before it goes* previews as today, the foot without a link.
- **The run on Broadcasts** (`approval.tsx`, mounted by `broadcasts/run.tsx`). Before Approve as today, the words saying
  "N for you to send today" (`approveWords` takes no host; `domains` leaves the words). After Approve the block gains
  **To send**: each drafted send — the business, its angle, the subject — with **Open in Gmail · Open in Outlook · Open
  in your mail app · Copy**, then **Sent · Skip**. Opening or copying arms the row as the lead draft arms "Did you send
  it?"; *Sent* and *Skip* call the told route; a refusal at Sent is said on the row and the row leaves the list. The
  list re-reads after each door, and every 15 seconds while anything is still being checked, as today. The DTO
  `ReachOutRunDto` gains `drafted: Array<{send_id, business_name, angle, to, subject, text, drafted_at}>`; `domains` is
  always `[]`.
- **Today.** `TodayFacts` gains `toSend: Array<{run_id, chain_name, count, oldest_drafted_at}> | null`, read by
  `apps/dashboard/src/server/readers/today.ts` (so Ask's Today says it too); the queue draws one row per run, kind
  `to_send` ("12 emails to send from your inbox", `chain_name` as the status, `waitedMs` from the oldest draft, *Open*
  to the run on Broadcasts), ordered among the rows by `waitedMs` as every row is: the longest-waiting draft first.
- **Leads.** `reach_out_search_lines` counts `drafted` and the strip says "N to send"; the stage line says "Drafted for
  you · waiting to be sent", then "Written Tue · nudge drafted"; the peek's timeline names a drafted send and offers
  *Send it* (to the run) beside *Stop writing to them*, and, once anything is sent, **They wrote back…** with the five
  intents (a date for not now, a name for wrong person) and the undo.
- **A person's page and Playbooks.** A sent draft reads as every reach-out email does (`reachOutPersonOf` labels by
  `message_id`, which the Sent door writes), "sent from your inbox" in place of the domain; the chain's row counts
  "N for you to send" beside "N handed to you".
- **The phone.** The shell opens `mailto:` in the mail app; the Gmail and Outlook links open in the browser
  (`onOpenWindow`), where the Gmail app takes its own link on Android; *Copy* writes the clipboard on the tap. The
  told doors are the peek's, which the phone draws as a sheet.

### 4.8 What Reach out stops reading, and what stays

**Goes now.** `coldLane()` and `Lane`; the 503s of the two cron doors; the Resend path in `writeOne` and its company
(`reachOutRequest`'s call, `insertQueuedEmail`'s reach-out call, `adopt`, `withdrawEmail` from the sender, `reconcile`'s
and `unstick`'s `queued` branches, `leadWritten` into the door); `reach_out_claim` (dropped) for `reach_out_draft_claim`;
`runReachOut`'s domain timetable and `no_domain`; the sheet's domain read and requirement; `HOLDS.no_mailbox`;
`parentEmailOf`'s stamp requirement for a drafted parent.

**Stays for step 3** (a correction to the approved design, which had them going now): `RESEND_COLD_API_KEY`,
`RESEND_COLD_WEBHOOK_SECRET`, `COLD_REPLY_DOMAIN`, `COLD_REPLY_DOMAIN_PREVIOUS` in `env.ts` and `.env.example` — the
domains sweep, `resend-event.ts` and `coldReplyDomains()` read them — each line in `.env.example` gaining "(sending
domains only: Reach out no longer reads it, 00302)"; `UNSUBSCRIBE_SECRET` (optional, the link when set);
`sending_domains`, `domains-sweep.ts`, `sending-domains-ops.ts` and the Connections block; `emailWireFor`'s `own`
routes and `ownRouteOf`; `deliver()`'s outreach refusals and `wire-senders.ts`' lane rule, now unreachable from Reach
out. knip may find exports nothing calls: banked with `check:dead-exports -- --update` and named in the pull request.

### 4.9 Failure handling

A Sent on a send another member already told is a 409 in words and the list re-reads. A Sent the person door refuses
("This business is already yours", "This lead has closed") skips the send with the refusal and says so. A draft left
fourteen days is skipped `kept_waiting`, and the run finishes. A paused chain keeps its drafts and the owner may still
send them (pausing stops new drafts; the owner is the sender); a removed chain skips them `run_canceled`. A told
reading on a lead that was never sent to is refused. A compose link that would exceed the length rule never
truncates: the body goes by the clipboard. Nothing falls back to another channel, address or sender.

## 5. What does not change

The check and its holds, Include, Rewrite, Skip and Not a fit; the approval sheet and the `outreach` autonomy class;
the door's facts and `outreachRefusalOf`; the never-again list and its predicates; the stops (`outreach_wrote_back`,
`outreach_stopped`, `outreach_lead_closed`, booked, a deal); the reader for a reply that does reach the hosted mailbox;
`readingPlan`'s effects for read replies; the hosted and campaigns lanes; `sending_domains` and its sweep; the finder;
the lead stages' words; the routes' names already declared.

## 6. Parts

One pull request, built in five phases on `reach-out/drafts-the-owner-sends`, proven on the live app in the e2e
workspace before anything is committed, and committed as one.

1. **The database** (`00302_a_reach_out_email_is_handed_to_its_owner.sql`, renumbered at commit if 00302 is taken):
   the `drafted` state and columns, the guard's moves, `reach_out_draft_claim`, `reach_out_send_told`,
   `reach_out_reply_apply(.., p_told)`, `reach_out_replies.claim` and `told_by`, `lead_convert_by`'s and
   `set_email_marketing`'s lists; `reach_out_claim` dropped; `reach_out_search_lines` and `reach_out_lead_timeline`
   saying `drafted`. Then `gen:db-types`, `gen:schema-sets`, `gen:schema-snapshot`, `gen:data-model`; the db
   repositories (`reach-out.ts`: `finishableRuns`, `heldStale`, the draft claim, `tellSend`; `outreach.ts`: a told
   reading).
2. **Contracts**: `reach-out-draft-words.ts`, `reach-out-compose.ts`, the cold foot's optional link, `ReplyClaim`
   `told` and `readingPlan`'s two differences, `ReachOutRunDto.drafted`, `TodayQueueRowVM` `to_send` and
   `TodayFacts.toSend`, `reachOutLineOf`'s drafted lines, the sheet's and the run's words, `REACH_OUT_DRAFTS_PER_DAY`,
   the event kind `reach_out.told` in `shared/enums.ts` and `workspace/activity.ts`, `cold_lane_unset` out of
   `shared/edge-errors.ts`, the glossary rows; the barrels; dist rebuilt.
3. **The edge**: the sweeps without a lane, `runReachOut`'s plan, `writeOne` to `drafted`, the parent rule, the dead
   branches removed, `LOG_EVENTS` (`reach_out_drafted`, `reach_out_told`), `vercel.json` unchanged.
4. **The dashboard**: the two told routes and `route-policy.json`, `reach-outs.ts` (`tellSend`, `tellReply`,
   `reachOutRunOf.drafted`), `readers/today.ts`, the approval block's *To send*, the Today row, the Leads strip, line and
   peek doors, the sheet's *From* and *Pace*, the lead draft importing the compose module; the typed client and
   `docs/api.md` regenerated.
5. **Tests and documents**: §7; `docs/runbook.md` "Turn on cold email" rewritten as "Reach out: the owner sends"
   (nothing to set); `docs/system-prd.md` and `docs/architecture.md`'s two lanes; `docs/glossary.md`; the Reach out
   spec's §4.6 pointed here; the as-built note at the foot of this file.

Deploy order: either. The migration lands first by hand (dry run, then `supabase db push`), as every reach-out
migration did; the edge and the dashboard then deploy in any order (an edge without the new door drafts nothing yet;
a dashboard without the new routes shows no *To send*).

## 7. Tests

Moving with the state: `reach-out-objects.db` (the guard's new moves), `reach-out-checked.db` (the claim takes only a
checked send: now `reach_out_draft_claim`), `reach-out-clock.db` (finish with drafts open, `kept_waiting` on a stale
draft), `reach-out-sender.db` (the writer drafts; no message, no job), `reach-out-run.db` (a day's share, no domain),
`core-run-reach-out` (no `no_domain`), `cron-reach-out-door` and `cron-reach-out-check-door` (no 503), `reach-out-words`
(the foot with and without a link), `reach-out-rules`, `reach-out-sheet/*` (Start without a domain; the run's words),
`reach-out-back/*` (lines and timeline say drafted), `reach-out-replies/*` (a told reading applies and undoes),
`email-wire-routes` (unchanged: the own route still binds to the key). Retired with the wire: `reach-out-request.test.mjs`
(its slot and foot cases move), `outreach-facts.db`'s request-building cases (the facts cases stay).

New: `reach-out-draft-words.test.mjs` (the six slots, the nudge's subject, the foot); `reach-out-compose.test.mjs`
(three URLs, encoding, the length rule at 3,799/3,800/3,801); `reach-out-told.db.test.mjs` (`reach_out_send_told`: sent
writes the message, the lead and the send in one transaction; not_sent; the person door's refusal; a second telling is
refused); `reach-out-told-reading.db.test.mjs` (`reach_out_reply_apply` with `p_told`: each intent's effects, the undo);
`reach-out-told-routes.test.mjs` (the two routes over the fake db, roles, the facts refusal at Sent);
`today-to-send.test.mjs` (the row and its order); the integration test (`reach-out.integration.db.test.mjs`) from the
save to two drafts, a Sent, a nudge drafted after it, and a told no. Ratchets: a new door in `route-policy.json`, the
log events in `LOG_EVENTS`, `source-scan-baseline` untouched, dead exports banked.

Proof on the live app before commit: a chain started from a search in the e2e workspace, the run approved, the *To
send* list drawn, *Open in Gmail* opening a compose with the words in it, *Copy* and the length rule on a long body,
*Sent* writing the message onto the person's page and the lead's line, Today's row, a told *said no* closing the lead
and listing the address, and its undo.

## 8. Risks

- **The owner's word is the record.** An email sent and never told stays `drafted` fourteen days and is then skipped;
  the Today row asks every day until then. A misclick on Sent is not undoable (the email went); a misclick on a told
  intent is, for seven days.
- **Compose links differ by client**: Gmail caps the URL; a signed-out Outlook rewrites spaces; a mail app may ignore
  CRLF. The length rule and the clipboard cover the first; the last two are the client's.
- **A nudge may not thread** in a client that threads by header alone; it still reads `Re: …`.
- **Replies stay unseen until step 2.** The stops that read inbound mail (`outreach_wrote_back`) fire only on what
  the hosted mailbox receives; the owner's telling is the stop for everything else.
- **Step 2's lead time**: Gmail's send and read scopes are restricted and need Google's app verification with a
  security assessment (weeks, and a cost); Microsoft's are lighter. Drafts are the product until then.
- **knip and the ratchets** may move on the deletions; every fall is banked, and a rise is argued.

## 9. Decisions for Ruben

All four were recommended in conversation and are taken here; say so if any should change.

1. Thirty drafts a day per chain, handed at the chain's start time (decision 8).
2. The person is made when the owner says the email went, not when the draft is made (decision 7).
3. A paused chain's drafts may still be sent; pausing stops new ones (§4.9).
4. A told reading never drafts an answer: the receptionist writes nothing it did not read (§4.6).
