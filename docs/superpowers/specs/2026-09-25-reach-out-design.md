# Reach out: design spec

**Date:** 25 Sep 2026 · **Owner:** Ruben · **Status:** Parts 1–2 shipped; 2.5 (the hardening) and 2.6 (the review before Part 3)
shipped; Part 3 (the engine) shipped 26 Sep (D15–D19); Part 4 (the words and the pages) shipped 26–27 Sep (§6, ten PRs); Part 5 (replies) shipped 27–28 Sep (§6, twelve PRs; N1–N6);
Part 6 (what comes back) shipped 28–29 Sep (§6, one PR; H1–H12); Part 7 (bring your own list) next. The eight decisions
in §9 were approved 25 Sep ·
**Canvas:** https://claude.ai/artifact/AdMCtQTkWUoDhXz8SewiZg (23 boards; the builder is `Claude Video/reach-out-design/canvas`) ·
**Supersedes:** §4.7 "Leads" of `2026-09-24-campaigns-on-every-channel-design.md` · **Re-sequences:** steps 2–11 of
`docs/plans/2026-09-24-every-business-every-channel.md` §4 · **Follows:** Part 0 of the campaigns spec (#999, #1005,
00170 + 00171 on production).

**Analysis:** every fact in §2 was read on `origin/main` at `90c3b755` by three code maps on 24 Sep 2026 (file and line
beside it). Where this spec and the code disagree, the code wins and the spec is corrected.

## 1. Goal

A business writes once to the leads its finder found, from a domain it owns, and the product does the rest: opens each
email for the business it goes to, checks every email before it leaves, paces the sends into each business's own hours,
follows up when nothing comes back, stops the moment anything does, reads what came back, drafts the answer, and shows
what worked. Instantly and Apollo sell this as a sending tool built around mailboxes. Chanlytics builds it around the
person and their one conversation, on the engine it already has: a reach-out is a playbook with steps, replies land in the
Inbox, the lead becomes a person and a deal.

Ruben, 24 Sep: "leads found by finder should be able to get cold emailed that is the whole point of marketing … similar to
instantly that allows things like setting up sequences to send cold emails at scale … must feel native to chanlytics and
seamless … from protection side of things to modern features … paced accordingly so that it is not bulk sending."

## 2. What the product does today

**Chanlytics sends nothing to a lead.** `POST leads/[id]/draft` returns a `mailto:` and the words for the clipboard
(`legacy-bridge/leads.ts:493-502`; `server/leads.ts:1148-1150`). "Contacted" is written only when the owner answers
"Did you send it?" (`leads-peek.jsx:643-652`). The drafter (Sonnet 5, low effort; `server/leads.ts:1116-1257`) gets
seven facts — name, category, city, state, website host, rating, review count — and not the judge's reason, the search's
ask, the listing's about text or hours, or the business's own "what we do" and tone. The footer is added by code
(`leadDraftFooter`, `contracts/src/leads.ts:1009-1011`).

**A lead's reply never finds the lead.** `contacts_link_lead` fires on INSERT and matches `NEW.email` (00140:831-868);
the email intake inserts the contact with no address (00110:144-150) and sets it afterwards (`db/src/repositories/email.ts:92-98`).
"No thanks" is never read; `email_opt_out` is declared and never written (00140:340-350). Only a call saved as
Interested makes a person (00142:148, 186-226).

**The wire is reply-only.** Every email needs a parent and its subject is always `Re: …` (`channels/src/email.ts:52,
102-107, 175-198`); no `List-Unsubscribe`; no throttle and no 429 handling (`email-resend.ts:57`); one mailbox per
workspace, enforced four ways (00126:48-49; 00129:61-62; `db email.ts:130-134`; `channels email.ts:621-627`); one shared
domain (`EMAIL_DOMAIN`); suppression on `contacts` only (00126:72-86), never on a lead; an auto-reply is stored as an
inbound message and would count as "wrote back" (`email-ingest.ts:145-155`; 00064:57-61); no email metering; the health
tick watches only the deployment's domain (`cron/health.ts:123-130`); own domains are the email plan's E4, designed and
not built. Leads carry `lat`, `lng`, `hours` and no zone (00140:204-209; 00144:22).

**The engine has no steps.** A playbook is one template on one trigger; `gap_days` repeats the same message
(00048:12-32; `contracts/src/playbooks.ts:35-109`). Runs are `broadcasts` rows; ask/veto/auto approval exists
(`run-playbook.ts:198-203`; `approve.ts:21-73`); the batch sender continues itself (`broadcast.ts:290-299`); recipients
are contacts with a phone (`messages/ports.ts:59-65`; `people.ts:1181`); lists are contacts only (00044:27); only
WhatsApp template rows can be created, edited or sent (`templates-create.ts:100-118`; `handlers.ts:281`;
`deliver.ts:534`); no service-role door makes a dated step (00166:86-88). Purpose is derived twice and never reconciled
(`playbooks.ts:387` vs `broadcast.ts:102`).

**What already fits.** The judge's reason, the four checks and the checked address per lead (`lead_search_members`,
00140:262-292; bounceverify, `cards.ts:209-231`); the 72-hour reply rule; the ask/veto/auto approval sheet
(`broadcasts.jsx:98-195`); Today's queue and Steps due; one thread per person; the email intake's classification of
reports and auto-replies (`channels email.ts:443-481`); `lead_suppressions`; the Business record's address; Resend's
idempotency key (`email-resend.ts:9-13`); the `templates.channel` column.

## 3. Decisions

Recommended, numbered; Ruben confirms in §9.

1. **A reach-out is a chain of playbooks, not a sequence engine.** Each step is a `playbooks` row; steps after the first
   carry `after_playbook_id` and `after_days` (the PRD's decision 12, pulled forward). Runs, approval, held-back reasons
   and reports come per step from what exists.
2. **The owner's email is the anchor; the receptionist writes only the opening.** Slots the product already fills
   (`business`, `city`, `your name`, `booking link`) plus one new slot, `opening`, written per lead from the finder's
   record and tagged with a three-word *angle*. No A/B variants: every email is its own, and the report shows reply rate
   by angle.
3. **Every email is checked before it leaves.** Slots filled or the email held; every fact in the opening present in
   the lead's record; the language theirs; under 120 words; the footer on; the address checked; not a customer's
   domain; not a chain. A failing opening is rewritten from what the record does hold, or held with a reason the owner
   can act on.
4. **A run is a timetable, not a loop.** At assembly each recipient gets a `send_at` in the lead's own business hours,
   spaced by a gap, under each domain's daily cap; the rest roll to the next open day. Defaults: 30 a day per domain,
   one every 12 minutes; 100 a day after 14 clean days; 200 after 30.
5. **Cold email leaves only from domains the business owns, several per workspace, rotated.** Each with its own
   identity, cap, ramp and health. Replies come back to the mailbox. Cold sends go through a second Resend key so one
   tenant's cold mail cannot touch anyone's visit reminders.
6. **A reply is read for what it means before it is answered.** Interested, a question, not now, no, wrong person,
   away. The classifier only stops and labels; the receptionist drafts; the owner sends.
7. **Any human message on any channel, a booking, an unsubscribe, a bounce, "no thanks", Not a fit or a deal stops the
   chain for that lead.** An out-of-office pauses it.
8. **No opens, no clicks, no tracking domain.** Apple's mail privacy makes opens fiction and tracking links hurt
   delivery; the truth is who wrote back, who was interested, who booked.
9. **Protection is rules, not settings.** Verified addresses only by default; catch-all addresses held until included;
   a customer's number or domain never written cold; one-click unsubscribe on every email; a never-again list per
   workspace; bounces past 2% or any complaint hold the domain; lost verification or DMARC holds it; the month's
   allowance holds the run; the first run waits on the owner, later runs give thirty minutes.
10. **Out.** A warmup network (Instantly's is a bot network trading mail), a mailbox farm, opens and clicks, A/B
    variants, cold text (the A2P filing forbids it), cold WhatsApp (Meta forbids it), AI outbound calls (TCPA), a
    preferred-channel setting.

## 4. Design

### 4.1 The object

`playbooks` gains `kind text not null default 'moment' check (kind in ('moment','reach_out'))`, `after_playbook_id uuid
references playbooks`, `after_days int`, `audience jsonb` (`{kind:'leads', search_id}`), `pace jsonb`
(`{per_day, gap_min}`), `domain_ids uuid[]` (empty = every verified domain), `hand jsonb` for a hand-to-you step
(`{kind:'call'|'note', words}`), and `channels text[] default '{whatsapp}'` (a reach-out's is `{email}`). The trigger
CHECK gains `lead_first` and `after_step`; `policy_class` gains `outreach`, whose purpose at the door is `outreach`.
One reach-out = the root row (`lead_first`) plus its steps in order of `after_playbook_id`; the sheet edits the chain as
one thing; the Playbooks table shows one row per chain with the steps in the open row.

`after_step`'s reach is the generalisation of the follow-up's once-per rule: people (here, leads' contacts) sent the
parent step at least `after_days` ago, with no human inbound since on any channel, not already on this step, and not
stopped (§4.7). `touchesSince` already holds what is needed (`db/src/repositories/touches.ts:75-145`).

**As built (Part 3; 00183, 00185).**
- **The chain.** `playbooks` gained `kind` (`moment | reach_out`), `lead_search_id`, `after_playbook_id`, `after_days`,
  `gap_minutes` and `domain_ids`. `audience`, `pace`, `hand` and `channels` were not needed: the search names the
  audience, the gap and the ramp are the pace, and a reach-out is email only. `hand` (a hand-to-you step, §9
  decision 7) is deferred to Part 5's dated step, not dropped.
- **The sends.** Each lead in a step's run is a row of its own, **`reach_out_sends`**, with its lead, person, domain,
  `send_at`, `state` (`planned → claimed → queued → sent`, or `skipped` / `failed` with a reason), `attempts` (the emails
  written for it) and `message_id`, guarded move by move.
- **The run.** A step's run is a `broadcasts` row with `audience.kind = 'reach_out'` and an id derived from the step
  and its day. It is written whole with its sends, or not at all (`reach_out_plan_run`).
- **`after_step`'s reach** is 00184's `reach_out_followers`: sent the step before at least `after_days` ago, the door's
  own facts about the lead, filtered before its limit (00185), and any bounce in the chain stops it.

### 4.2 The audience, and the person made at first send

The reference gains a third kind, `{kind:'leads', search_id}` (the campaigns spec §4.7), resolved by the leads engine:
leads in the search with `stage in ('ready')`, `email_state = 'ok'` (catch-all and unknown only when the reach-out
includes them), not `closed_reason`, not in `lead_suppressions`, whose number and domain match no person in People. A
search keeps itself current: leads the finder adds later join the next run. A selection on Leads gets the same door in
the bulk bar (add to a reach-out · a new one · once, no follow-ups).

**Sending creates the person.** At the first send the recipient's contact is made from the lead (`create_person` by email
with `came_from = 'lead'`, the shape lead conversion already inserts, 00142:212-223), `leads.contact_id` is set,
`stage = 'nurture'`, `contacted_at` and `last_outcome = 'emailed'` are written, and the recipient row points at both. Every
later email, reply and receipt threads on that person; the lead link is made at send, so the insert-only trigger no
longer matters.

**As built (Part 3; 00184).**
- **The audience** is `reach_out_audience`: the search's counted, qualified members that are `ready`, with `email_state =
  'ok'`. Never:
  - an address, identity or number a person in People holds;
  - one on the never-again list (the address, the place or the number);
  - a lead the chain has written to before.

  Catch-all and unknown addresses are not offered yet.
- **The person** is made at the send's write, not its enrolment, by `reach_out_person` rather than `create_person`. It
  refuses `already_yours` when a person holds the address, and `lead_closed` when the lead moved on since it was planned.
  Making the person does not convert the lead.
- **The lead** becomes `nurture` / `contacted_at` / `last_outcome = 'emailed'` only once its email has left, when the
  clock reads it sent (`leadWritten`).

### 4.3 The words

The step's words are `templates` rows on the email channel (`channel = 'email'`, `source = 'chanlytics'`, `category =
'marketing'`, `meta_status = 'approved'`, `components` HEADER = subject, BODY = body), validated by an email validator of
their own (subject ≤ 80, body ≤ 1,200 characters, slots from the set below). They appear in Campaigns › Templates with
`What sends it` and the WhatsApp | Email | Text switch the campaigns spec draws; a reach-out sends the email version only.

Slots: `{{business}}` (the lead's name on Google), `{{city}}`, `{{your name}}`, `{{your business}}`, `{{booking link}}`
(the workspace's), and `{{opening}}`. A slot with no value holds the email (`missing_value`, the reason that exists),
except `{{opening}}`, which is always written. The footer is never stored; the sender adds it: why they are hearing from
you ("I found your business on Google Maps"), the Business record's name and address, "Not interested? Reply no thanks",
and Unsubscribe.

**The opening.** A model call per lead per step (`purpose: reach_out_opening`, Haiku-class, under a cent), given: the
judge's reason and checks, category, city, rating and review count, the website host, the listing's about text and hours,
what the owner asked the finder for, the business's own "what we do" and tone (`business_records.about`, the profile's
`tone`), and the owner's email. It returns `{opening ≤ 40 words, angle ≤ 3 words, facts_used[]}`. Cached on the recipient
row; regenerated when the owner edits the email.

**As built (Part 4; 00197, 00211).**
- **The six slots.** `{{business}}` and `{{city}}` are the lead's; `{{your business}}` is the workspace's name;
  `{{your name}}` is the chain's `signed_by`, which the sheet fills with the member's first name and the owner can
  change; `{{booking link}}` is the workspace's `brain.booking_link`, and the sheet refuses Start while the words name it
  and the workspace has none; `{{opening}}` is the send's own. One slot rule (contracts `slotsNamed`, `reachOutSlots`)
  serves the save, the check, the preview and the sender. A lone brace is refused at the save (`stray_brace`).
- **The validator** is contracts `validateReachOutWords` and `validateReachOutChain`: the subject and body bounds above,
  at most 120 words, one link, no line in capitals, known slots only. The route runs it; the database keeps only its
  CHECKs. A chain is saved whole by `reach_out_save` (00211), the service role's door, which writes its email templates
  and its playbook rows in one transaction.
- **A fault that is the workspace's holds the send,** never skips the lead: no name to sign with (`no_signed_by`) or no
  booking link (`no_booking_link`). A lead with no value for its own slot is still skipped (`missing_value`).
- **The writer and the reader** are two calls to Haiku 4.5, only for a step whose words name `{{opening}}`: words
  without one cost no call. The writer answers `{opening, angle, facts_used}` from the business's record, fenced so an
  about text cannot forge a line of the prompt; what the owner asked the finder for is told to it outside the record.
  The reader answers whether the opening claims anything the record does not hold, whether it reads as a pitch, and
  the business's language, judged from its about text.
- **What is kept on the send:** the opening, its angle and the facts it used, the words it was checked against
  (`checked_words`, a hash) and their version (`check_gen`). New words, a new name to sign with, or a booking link
  gained or lost send it back to be checked (`reach_out_recheck`); a send its owner included past a hold keeps that.
- **Its cost is bounded where it is spent:** the check is its own clock (`reach-out-check-sweep`, every minute), and a
  workspace that may not spend, has no room in its month, or has spent its model attempts for the UTC day
  (contracts `REACH_OUT_CHECKS_PER_DAY`, `reach_out_check_spend`) is asked again an hour on. Tokens are logged per tick
  (`reach_out_checked`), not metered. The sheet's preview counts in Ask's daily budget (`reach_out_preview`).

### 4.4 The check before each send

A second pass per email, deterministic where it can be and a model where it must:

| Rule | How | On failure |
| --- | --- | --- |
| every slot filled | code | held: `missing_value` |
| every fact in the opening is in the record | the opening's `facts_used` each map to a record field; a model verifies the sentence claims nothing else | rewritten once from the record; then held: `unbacked_fact` |
| the language is theirs | the site's language (the finder reads it) vs the email's | held: `language` |
| under 120 words, one link, no ALL-CAPS line, no price or promise not in the business facts | code + model | held: `reads_like_spam` |
| the footer present, the unsubscribe headers set | code | never sends without them |
| the address checked, not suppressed, not bounced | code | skipped: `no_address` / `suppressed` |
| not a customer's number or domain | code, People | skipped: `already_yours` |
| not a chain (`locs ≥ 3` on Maps) | code | held: `chain` |

The sheet shows the tally (checked · ready · held) and each held email with its reason and its doors (Include · Fix ·
Skip · Not a fit). The approval sheet repeats the count. A held email never sends until the owner acts.

**As built (Part 3): the code rules, at the write.** Part 3's slots are `{{business}}`, `{{city}}` and
`{{your business}}`; the rest, the opening and the model's rules are Part 4's.
- A lead with no value for a slot is skipped (`missing_value`).
- A step whose words cannot be sent holds every send of it, and each lead keeps its place: a slot no lead could fill
  (`unknown_slot`), a first email with no subject, a subject that poses as a reply, or no template at all. The send is
  planned again an hour on, in its lead's hours.
- A workspace with no business address for the foot, or no mailbox for the replies, claims nothing at all.
- The footer and the unsubscribe headers are frozen into every request.
- Everything the door checks (§4.8) is asked again when the email leaves.

**As built (Part 4; 00197, 00211): the holds, and who answers them.**
- **`held` is a state of a send,** with its reason and a detail: planned → held by the check; held → planned by the
  owner's Include or a Rewrite; held → skipped by Skip, Not a fit, or fourteen days unanswered (`kept_waiting`). The
  claim takes only a checked send (`checked_at`), never a held one, and a held send keeps its run open.
- **The reasons:** `customer_domain`, `chain`, `language`, `unbacked_fact`, `reads_like_spam` and `check_unavailable`.
  `missing_value` stays a skip: a lead with no city is not the owner's to fix.
- **The opening's rules.** Code reads its length, links, braces, capitals, a price, and that every number and every
  named fact is one the record holds (contracts `checkOpening`); the reader's answer is read with it
  (`openingVerdict`). A broken rule asks one rewrite, told why, then holds. A language that is not the step's holds at
  once, with no rewrite: the owner's words are in one language, and another language's version is Templates' later.
- **Not a chain (F4).** A business reads like a chain when three or more of the workspace's leads share its own website,
  or its name. A page on a platform (a social profile, a booking site) is nobody's own site, so it counts nothing. The
  words say what was measured: "reads like a chain: 3 listings share their website". The spec's "`locs ≥ 3` on Maps"
  has no field the finder holds.
- **Not a customer's domain (F6).** When a person in People, other than the lead's own, writes from the lead's email
  domain, and that domain is not free mail, the send is held `customer_domain`. An exact address or number a person
  holds stays Part 3's skip (`already_yours`).
- **When the model fails,** each try counts and backs off (1, 2, 4, 8, then 15 minutes). After an hour of tries the send
  is held `check_unavailable` with no detail, and the check's clock puts it back to be checked an hour on. A hold for a
  rule an opening broke waits for its owner.
- **The doors.** Include, Rewrite, Skip and Not a fit are one door, `reach_out_send_decide`; Not a fit archives the lead
  in the same transaction. Include is refused past the fortnight. An Include is kept on the send (`included_for`), so
  neither it nor a later step's send to the same lead is held for that reason again. "Check the held again" puts a
  run's unanswered `check_unavailable` holds back in one call (`reach_out_run_recheck`).
- **The tally is the approval sheet's** (F12): checked, ready and held for the whole run is read there a minute after
  Start, with each held email's doors. The sheet's "Before it goes" previews one business at a time.

### 4.5 The timetable

`timetable(recipients, {zone, hours} per lead, pace, domains, now)` is a pure function in contracts: it assigns each
recipient a domain (round-robin over the verified, unheld ones) and a `send_at`: the next open moment in the lead's own
hours (the listing's `hours`, else 9:00–17:00), on an open day, at least `gap_min` after the previous send on that
domain (±25% jitter so no two runs look alike), under the domain's cap for that day; what does not fit today takes
tomorrow's first slots. A lead's zone comes from its state (a 50-state map in contracts; the finder is US-only). The run's
"sends 9:40" is its first slot. The ticker (`broadcast_send`, every minute) claims recipients with `send_at ≤ now`, at most
five a second across the platform (Resend allows ten a second per team by default), re-checks the stops (§4.7) and the domain's state, and sends. Pausing a reach-out clears
the future `send_at`s; resuming rebuilds them.

**As built (Part 3; 00184, 00186, 00187).**
- **The timetable.**
  - Each lead's zone comes from its state.
  - A send goes in its lead's own hours, inside 8 AM–8 PM where the lead is. An unread or night-only week takes the
    default week.
  - Sends on a domain are spaced by the step's `gap_minutes`, and a domain takes no more than its day allows: the ramp
    by the days it has actually sent (D15, `domainDailyCap(sent_days)`).
- **The ticker is the reach-out clock**, not `broadcast_send`: `/api/cron/reach-out`, every minute, called only when
  there is work. Each tick, first:
  - it reads what became of each email it wrote;
  - it frees a claim a writer left mid-way;
  - it withdraws a closed run's queued emails, and skips its sends;
  - it finishes a run with nothing left open;
  - it plans again a send left stale.

  Then it claims what is due, a domain at a time (`reach_out_due_domains`), under the domain's lock (`reach_out_claim`),
  five a domain a tick. It stays within the day the door will pass and the workspace's month (2,000,
  `reach_out_month_sent`).
- **Each claim is written rows first:** the email row under an id derived from the send and its `attempts`, its
  `outbound_send` job, then the send queued. It leaves through the jobs tick and the one door.
- **A pause doesn't clear anything.** A paused chain's sends keep their times, and the clock plans them again when it
  goes ahead.

### 4.6 The wire

**As built (Parts 2 and 2.5; 00175, 00176, 00178, 00179).** `sending_domains`: `tenant_id`, `host` (lower-case, unique
across the platform), `from_local`, `from_name`, `provider_domain_id`, `records jsonb` (as Resend returns them),
`state` (`records | verifying | verified | held`), `provider_status` (the provider's own word, judged in contracts
`judgeDomain`), `dmarc` (`found | missing`, at the host or a parent), `held_why` (`verification | dmarc | bounces |
complaint | provider`), `held_at`, `verified_at`, `clean_since` (the ramp's clock: 30 → 100 → 200 a day, contracts
`domainDailyCap`), `counted_since` (the reputation window's own clock, moved only by verification and Resume, never by a
DNS release), `sent_recent`, `bounced_recent`, `complaints` (what the sweep last counted), `checked_at`; five per
workspace. The edge writes it, through `lib/email/sending-domains.ts` alone: the admin door (`/api/admin/sending-domains`,
ops `status | add | check | remove | resume`, which the dashboard's `/api/v1/sending-domains` routes call), the
`domains` sweep and a complaint's receipt; the dashboard never does; Connections › Email shows the records with
*Check* and *Resume*. The `domains` clock (every ten minutes, 00175's `trigger_domains_sweep`, only when a domain is
due) reads each domain at the cold account and in DNS: a failed verification holds it at once (the provider's
`temporary_failure` only on a second read), a DMARC record missing on two reads in a row holds it, and the hold lifts
itself when both read good; a provider that no longer knows the domain holds it on a second read as `provider`,
which lifts itself too, emails no owner and pages the platform; permanent bounces over 2% of the last 500 sends since
`counted_since` (over 3 while fewer than 150 have gone: `bounced × 50 > max(sent, 150)`), or any complaint, holds it until its owner resumes it, and a complaint does so at its receipt, not at the next tick. The same
sweep pages the platform (`email_cold_receipts_missing`) when a verified domain's three or more emails sent 26 to 2
hours ago have heard nothing back: a cold webhook secret set wrong. DNS blocklists are not read: Spamhaus refuses cloud
resolvers (Part 2's "not in this part").

Every cold email is a queued row written before the send, built by `buildEmailRequest` given `parent: null` and its
own subject (W0), `From` the domain's identity, `Reply-To` the mailbox's token address so the reply lands in the Inbox,
`List-Unsubscribe` (https) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, `Auto-Submitted: auto-generated`,
plain text with a minimal HTML twin whose footer carries the link, and no images; tags `cl_message`, `cl_tenant`; the
second Resend account's key (`RESEND_COLD_API_KEY`). Cold routes bind only when that key and its webhook's secret
(`RESEND_COLD_WEBHOOK_SECRET`) are both set, so no cold email leaves while its receipts would be refused;
`/api/resend-webhook` verifies either account's signature. Receipts land on that row: delivered moves it; a permanent
bounce counts toward its domain; a complaint on any email is the person's no (`set_email_marketing`, source
`complaint`) and holds the domain; a send that timed out stays `failed` with outcome `unknown` until a receipt settles
it. The door's `outreach` purpose and its checks are §4.8's. Part 3 writes the rows (C8: the recipient-derived id as the
idempotency key), mints the unsubscribe token (C9) and freezes the footer and the identity into the request (C10).

### 4.7 Stops, pauses, and what a reply means

Right before each send, and at each step's reach, a lead is skipped when: any human inbound from the person since
enrolment on any channel (`replied`); a booking from the link or a visit on the calendar (`booked`); `email_marketing =
opted_out` or a `lead_suppressions` row (`unsubscribed`, `said_no`); a bounce (`bounced`); Not a fit or a deal opened by
hand (`closed`, `deal`); `resume_at` in the future (`not_now`); an away note whose return date has not passed (`away`).

An inbound email on a thread whose person came from a lead with a reach-out in the last 30 days is classified after the
intake's own report/auto-reply pass: `{intent: interested | question | not_now {when} | no | wrong_person | away {until}
| other, summary ≤ 12 words}` (Haiku-class, cached on the message). The classifier never sends. Interested and question:
the chain stops, the lead moves to `converted` (Talking), the receptionist drafts the answer from the business facts
(draft mode, the PRD's W3a), Today and the bell say "wrote back". Not now: the chain stops, `leads.resume_at` is set, a
dated step lands on Today the week it comes, the receptionist drafts a one-line thanks. No: `closed_reason = 'said_no'`,
a suppression row for the address and the domain, nothing more, ever, from any search. Wrong person: the chain stops and
the note names who they said to write to. Away: the chain pauses until the date named, or seven days. A misread is
undoable for seven days on the lead ("read as no · undo").

**As built (Part 3).**
- **The stops that shipped, all keyed by the send's own lead:**
  - *wrote back*: a message of their own on any channel, an email answering one sent to them from any address, or a
    call they made; an out-of-office is not one (00181, the door and the followers);
  - *unsubscribed* and *said no* (the door);
  - *bounced*: any bounce stops the chain, and a permanent one marks the lead's address invalid (PR 7's receipt,
    `leadAddressBounced`);
  - *closed*: a lead no longer `ready` or `nurture`.
- **Owed by Part 5:** *booked*, *not now* and *away* need the reply's intent read, and the classifier is Part 5's. Until
  then any reply stops the chain (C16).

**As built (Part 5; 00220, 00222, 00226, 00227).**
- **Which replies are read.** The email intake asks `reach_out_reply_of` of every email it keeps. A reply is a
  reach-out's when it answers or cites an email a reach-out sent in the last 30 days (`REACH_OUT_REPLY_DAYS`), or when
  its thread's person is a lead's a reach-out wrote to in those days. Such a reply is handed to one job, `reply_read`,
  once per message (`jobs_reply_read_once`), whatever its claim; the intake does not tell anyone itself.
- **The reading.** Haiku 4.5 (`REACH_OUT_MODEL`) is given the reply's own words, fenced as data, with quoted history
  and signature cut, and answers `{intent, summary, day, refer_to}`. The intents are `interested`, `question`,
  `not_now`, `no`, `wrong_person`, `away` and `other`. Only the intent decides whether there is a reading; a summary is
  cut to 12 words, and an address or a number is taken out of it, since a phone's lock screen shows it. The reader is
  told that a request to stop, to be removed or to be unsubscribed is always `no`. One reading per message is kept in
  `reach_out_replies` (00222), and a workspace reads at most 200 replies a UTC day (`REACH_OUT_READS_PER_DAY`), only
  while it may spend.
- **A reply that could not be read** (no key, a workspace that may not spend, the day's reads spent, the model failed)
  is `other`, with why (`unread`); a person's stops the chain as any reply does, and an automatic one's changes nothing
  until it is read. It is read again, at most three times within seven days of the reply (`REPLY_REREADS`,
  `REPLY_REREAD_DAYS`), so a missed no still becomes an opt-out.
- **What each intent does** is contracts' `readingPlan`, and one service-role door, `reach_out_reply_apply`, executes
  it in one transaction; the door never decides an effect itself. Every step and consent move lands on the lead's
  person.
  - *interested* and *question*: the chain stops, the lead is Talking (`lead_convert_by`, `how: 'reply'`), and the
    receptionist drafts an answer (§4.9).
  - *not now*: the chain stops, `leads.resume_at` is the day they named, a dated step ("Write to {business} again: they
    said not now") is due that day (a weekend's on the Monday after), and a line of thanks is drafted.
  - *no*: Said no, through the one consent door (`set_email_marketing`, source `reply`), and the never-again list (N6,
    below).
  - *wrong person*: the chain stops, and a step due today names who they said to write to.
  - *away, in their own words*: the chain stops, with a step for the day they are back (N1).
  - *away, an automatic reply*: the chain pauses (below).
  - anything else from an automatic reply is recorded and does nothing; *other* from a person stops the chain.
- **The stop is still `outreach_wrote_back`, never narrowed (N1).** No human reply lets a chain go on, not "not now"
  and not "I'm away", so C16's rule stands as 00181 wrote it. 00222 widened it once, in the same place: an automatic
  reply read as `no` or `wrong_person`, and not undone, counts as writing back (B1). An email claimed `automated`
  rather than `auto_reply` is read as a person's.
- **An automatic out-of-office pauses** (00226). The door's facts gain `away`: an automatic reply read as away whose
  day has not passed, by the lead's person or about the send's own lead. The refusal is `outreach_away`, a skip and not
  a wait; a step's followers leave the lead out while it holds, and take it back after. The day is the end of the one
  they named in the business's zone; with no day, or one already past, seven days on; never more than 30.
- **A no's reach (N6, 00220).** The exact addresses always: the person's, the address the email went to, the lead's
  and the reply's From, as `said_no`. The whole domain only when it is the lead's own website's host
  (`ownedDomainOf`), so one person's no never closes a shared ISP's or a free-mail domain. The door, the audience and
  the finder ask one predicate, `lead_addresses_suppressed`. D18 counts a reply's no beside the unsubscribes
  (`sending_domain_counts`), unless it was undone.
- **Booked and a deal** (00227). The calendar sweep hands `reach_out_booked` the addresses and numbers of its
  appointments; a lead a reach-out wrote to whose address or number, or its person's, is on one that starts after the
  lead's first email is converted (`how: 'booking'`). A deal opened for a person converts that person's `ready` and
  `nurture` leads (`deals_convert_leads`, `how: 'deal'`). The door's lead stage then stops them
  (`outreach_lead_closed`), the stop that already was.
- **Read as no · undo** (`reach_out_reply_undo`, `reach_out_reply_undoable`, N4): a no only, for seven days from the
  reading, by an owner, an operator or a partner, and refused once the person has unsubscribed or complained since. It
  puts back exactly what the no wrote: the answer to marketing email (source `reply_undone`), each row on the list that
  nothing else now holds, and each lead to its stage before, at the version the no left it. A person's reply keeps the
  chain stopped; an automatic reply's no, undone, lets it go on. It is offered on the thread's strip (§4.11); on the
  lead it waits for Part 6.
- **Owed.** Microsoft 365's out-of-office is claimed `automated`, not `auto_reply` (its documented headers; no live
  capture yet), so it stops the chain with a step for the day they are back rather than pausing it: the safe direction.
- **A page under a host is not the host (00237).** A lead keeps only its website's host, so the finder also records
  whether the listing's website was that host's root (`leads.website_root`), and `reach_out_reply_of` answers it. A no
  from a business whose website is a page under someone else's host (an ISP's `/~dana/`) closes its addresses and not
  the host's domain. A lead found before 00237 reads by its host alone until the finder meets it again.

### 4.8 Protection

- **Addresses:** `email_state = 'ok'` only, by default; catch-all and unknown held until included; a customer's number or
  domain never written cold; the never-again list (`lead_suppressions`) checked at reach and at send.
- **The law:** the Business record's address on every email (a workspace without one cannot start a reach-out, and the
  sheet says why); "why you are hearing from us"; one-click unsubscribe honoured within seconds; a reply meaning no
  honoured the same way; US leads only while the finder is.
- **The domain:** own domains only; verification, SPF, DKIM and DMARC read every ten minutes; permanent bounces over 2%
  of the last 500 (over 3 while fewer than 150 have gone) or any complaint hold the domain and its runs; a held domain sends nothing until it reads good again
  (a DNS or provider hold) or its owner resumes it (bounces, a complaint). DNS blocklists are not read (§4.6).
- **The door, as built (Part 2.5, core `deliver.ts` over 00177's `outreach_facts`, one call).** A cold email (the
  `outreach` purpose) is always a broadcast, whoever the row says wrote it: the workspace's pause, the thread's pause
  and a live hold stop it. It never moves its thread, and a failure is recorded on its row, never flagged per email.
  It is refused, each in words (contracts `PURPOSE_REFUSALS`), when the person said no (`unsubscribed`), when it is not
  email (`outreach_is_email_only`), not to a business a search found (`outreach_not_a_lead`), to a lead no longer
  `ready` or `nurture` (`outreach_lead_closed`), to an address on the never-again list (`outreach_suppressed`), to a
  person who has ever written back or phoned (`outreach_wrote_back`, 00181: a message of their own on any channel, an
  email from any address that answers or cites one sent to them, or a call they made; an out-of-office is not one), built
  without its unsubscribe link (`outreach_without_unsubscribe`), not from the workspace's own domain by its whole From
  (`outreach_needs_own_domain`), from one not verified (`sending_domain_not_ready`), or past the domain's day: its
  rolling 24 hours against the ramp (`sending_domain_at_cap`). The day's count is the backstop; the reach-out clock
  claims within it, under the domain's lock (`reach_out_claim`, C7).
- **Volume:** the ramp per domain; the gap; the lead's hours; the month's allowance per workspace (cold sends counted
  from `messages` where `meta.source = 'reach_out'`, beside `maySpend`); the Campaigns head says "1,940 of 2,000 emails
  this month" once half is used.
- **The owner:** the first run waits for approval; later runs give thirty minutes; every held email waits for a decision;
  nothing is rerouted to another channel or domain on a failure.
- **As built (Part 3, 00188), the holds Part 3 added:**
  - **Unsubscribes (D18)** hold a domain past 2% of what it sent (more than 3 while fewer than 150 have gone:
    `unsubscribed × 50 > max(sent, 150)`), after a complaint and bounces.
  - **A second reputation hold (D16)** within 30 days is the platform's to lift: the platform is paged and the owner's
    Resume is refused. Removing the domain and adding it again inside the 30 days is refused too.
  - **A cold-only link and reply domain (D17)**, before scale: `UNSUBSCRIBE_ORIGIN` and `COLD_REPLY_DOMAIN`, with the
    reply domain before it kept routing while it winds down (docs/runbook.md, "Before scale").

### 4.9 Notifications and Today

`reach_out.replied {intent}` → the bell, a push and an email, right away by default (Settings › Notifications gains the
Reach-outs group: wrote back · a run waits · a domain held or a run stopped · the day's numbers at 6 PM). Today's queue
shows the run going out (with Stop in the veto window), each reply with its intent and the drafted answer's door, and the
hand-to-you calls under Steps due. A new definer door, `person_step_from_playbook(contact, due_on, words, for_user)`,
makes the dated step the hand-to-you and "write again in January" need (today only a signed-in member can, 00166:86-88).

**As built (Part 5; 00220, 00222, 00228).**
- **The notice.** A reading that tells is one notification of kind `reach_out_replied`: the bell's row, a push and an
  email, through `notifyOnce`, so it is sent once or not at all. Its words are contracts' `replyNoticeWords`: who wrote
  back and what it was read as, the summary, their words quoted, what was done, and the draft's first line when there
  is one. A phone shows the summary, never their words. It is told in two phases: a claim
  (`reach_out_reply_tell_claim`), then the mark (`reach_out_reply_told`) only once the owner was told. A mail that fails
  is tried again after two minutes and then ten, and after the third try the job fails and the workspace hears "A
  reply to your reach-out could not be read or told". Every reading of a person's reply tells; an automatic reply tells
  only for a no or a wrong person; a re-read tells a no, an automatic reply's wrong person, or a notice still owed. The
  reading's door writes the event `reach_out.replied` `{intent}` for every reading it applies, told or not.
- **The intake does not tell twice.** For a reach-out's reply it sends no notice of its own. A person's reply still
  flags the thread for a person (`email_review`), in words of its own: "They wrote back to your reach-out. Nothing is
  sent without you".
- **The draft** (decision 0017). For interested and a question the receptionist drafts the answer, and for not now a
  line of thanks, with its brain over the workspace's own prompt and a note that says what the reach-out said. The draft
  is text on the reading (`reach_out_replies.draft`), never a message row, so nothing sends it: the owner's Send is a
  person's own reply, through the one door. It asks the receptionist's gates again (a receptionist that can speak, a
  reply mode that is not never, the day's token budget, a workspace that may spend), and when one says no, the reading
  says why (`draft_why`). A job short of time drafts in a stage of its own (`draft`) and the notice goes without it.
- **Today.** A thread's handoff row, when its newest reading is a person's, not a no and not undone, becomes a reply
  row: "Wrote back · interested", their summary, and "Read the draft" or "Open and reply" (contracts `withReplies`). A
  reach-out's run waiting for its owner or in its veto window reads as a reach-out, in businesses. What happened while
  away counts the notices as replies to a reach-out, and the bell's action on one is "Read the draft" when there is one.
- **Settings › Notifications** has the Reach-outs group (N2): "They wrote back", "A reach-out waits for you", "A
  reach-out holds an email for you" and "A sending domain is held, and when it sends again", each a row that says when
  it is sent, with no switch. The day's numbers at 6 PM moved to Part 6.
- **The dated-step door** is `person_step_from_playbook(tenant, contact, due_on, words, for_user, source_id)` (00220,
  the service role's): a `person_notes` step from `reach_out`, once per source (`person_notes_reach_out_once`). Steps
  due on Today and People's next step show it with no change of their own. A not-now, a wrong person and an away in
  their own words each make one, keyed by the reply.
- **The hand step: a call or a note for you** (00228). A chain's last step may be `playbooks.hand`, `{kind: call |
  note, words}` of at most 280 characters, with no template. Its run (`reach_out_hand_run`) reaches the followers an
  email step would, less any lead the door would refuse, and writes the day's run, one send per lead in state `handed`,
  and one dated step per lead, due that day: "Call {business}: {words}" or "{business}: {words}". It sends nothing, so
  it waits for no approval. The chain's report counts `handed` apart from `written`, so a hand step is never where a
  lead's answer is counted.

**As built (Part 6; 00241).** **The day's numbers at 6 PM** (H12) are a line in the bell, a notification of kind
`reach_out_day` with no push and no email: "Today's reach-outs", then what was written, who wrote back and how many
were interested, the noes, the bounces and what waits for a say, with its door to Playbooks. The hourly playbooks sweep
writes it at 18:00 in each workspace's zone, on a day a reach-out wrote, heard back or holds an email for its owner,
through one service-role read, `reach_out_day_due`, which leaves out a workspace already told that day, so it goes
once. Settings › Notifications' Reach-outs group has the row, "The day's numbers", and the card no longer says every
alert is an email.

### 4.10 Reports

Campaigns › Reports gains, per reach-out and per step: written, delivered, wrote back, interested, booked, said no,
bounced; replies by angle; sends by domain with delivered, bounced and complaint rates and the domain's state; written by
day. The sources table shows each step on its own line. No opens or clicks anywhere.

**As built (Part 6; 00241).**
- **What each number counts** (H1). Written is an email that left; delivered, of them, delivered or read; wrote back is
  the send door's own reading (`outreach_wrote_back`); interested is a reading of the lead's reply, not undone, of intent
  interested or a question; booked is `leads.booked_at`; said no is the lead's `closed_reason`; bounced is the provider's
  bounce. Each lead is counted once, at the last email that wrote to it, as the chain's report always counted wrote back.
- **Booked is stamped on the lead, whatever its stage** (H2). `reach_out_booked` (00227's, re-created) stamps
  `leads.booked_at` once, the start of the first appointment seen after an email of the reach-out left, for a lead Talking
  already as for one still being written to, and converts only a ready or nurture lead, as before: a business that wrote
  back and then booked is the usual path, and a second conversion never happens.
- **Reports has a section of its own, Reach-outs, after Campaigns** (H3), since Campaigns' numbers are the broadcasts'
  recipients, which a reach-out never writes: from written to booked; replies by angle (the eight most written, the rest
  as one, and how many had no opening); by domain (sent, landed, permanent bounces and complaints as rates, the domain's
  state now, a removed domain's mail on one line); written day by day; and each reach-out with each step on its own line.
  One member read, `reach_out_report(workspace, days)`, over Reports' own period (7, 30 or 90 days in the workspace's
  zone), `GET /api/v1/reports/reach-outs`, drawn by `pages/reach-out/reach-out-report.jsx`. A workspace with no
  reach-out draws nothing of it; a read that failed says so, and the rest of the page stands.
- **Playbooks' open row** counts interested and booked per step (`reach_out_chain_report`, 00228's, re-created); a report
  read before 00241 says neither, as unknown, never as a zero.

### 4.11 What the UI shows

On the surfaces as they stand; the canvas draws each.

- **Leads, a search's Ready leads:** one door, *Write to the N ready*, counting checked addresses; the standing line
  says the unconfirmed and the phone-only. The bulk bar's *Write to them* offers a reach-out, a new one, or once.
- **The sheet** (the playbook composer's shape): *Who gets it* (the search, the reach bar, the held reasons); *What
  you'd say* (the email with slot chips and the opening token, the slots row, the from/foot/replies lines); *Then* (the
  chain with the nudge's words inline; another step: an email, a call for you, a note for you); *Pace* (the two tokens,
  Recommended, when it starts); *From* (the domain's identity and health); *Before it goes* (checked · ready · held with
  doors; the preview as the first lead reads it, with its angle, Rewrite the opening, Skip this one). The foot says what
  goes when, and that the first run waits.
- **The approval sheet** (Broadcasts): will get it today of N; the reasons (tomorrow's, held by the check); the rules
  (checked addresses, none a customer, none heard from before, the domain and its clean days); the words as the first
  person reads them; Approve — N from 9:40 · Skip this run · See the N.
- **Leads while it writes:** the strip (n of cap today · next at · from); Columns puts the Stage beside the name with a
  detail line (Written Tue · nudged Sat / Wrote back Thu · interested / Said no / Bounced / Booked / away until); the peek's
  timeline with *Read what went out* and *Stop writing to them*.
- **Playbooks:** one row per chain; the open row draws the chain, the step table, the pace sentence, the run history
  and the actions.
- **Today, Inbox, a person's page, Connections, Notifications, Reports, Templates:** as §4.7–4.10 and the canvas.
- **The phone:** the door where the thumb is; the sheet as the page; the queue first; a reply with one button.

**As built (Part 4).**
- **Leads:** a search with ready businesses shows *Write to the N ready* (or *Write to the N unconfirmed* when only
  those are left), and *Open its reach-out* once the search has one. On a desk it stands before Find leads; on a phone
  it is the full-width button at the top of the rows. A role that may not approve sees it gated, told why.
- **The sheet** (`pages/reach-out/reach-out-sheet.jsx`) is opened by the Leads door, by Edit on the chain's Playbooks
  row, and by "Edit in its reach-out" on each of its email rows in Templates. Every sentence is contracts'
  (`reach-out-draft.ts`). Start's outcome is said in the sheet, with the door to the run that waits.
- **The approval block** (`pages/reach-out/reach-out-approval.jsx`) is drawn for any live reach-out run on Broadcasts:
  today's share and the rest, who is still being checked (read again every 15 seconds while any are), the held with
  their reasons and doors, the skipped by reason, and the first ready email as it reads. Approve names only checked
  sends. The first hold in a run not waiting for its owner tells them once.
- **Playbooks:** a chain is one row above the moments; its open row reads the chain's report (written, delivered,
  wrote back, said no, bounced, per step), links "N wait for your say" to the run that holds them, and offers Pause,
  Resume, Edit, and Remove only until the first email leaves.
- **Templates:** a chain's steps are email rows, with "What sends it" and "a reach-out sends email only". There is no
  version switch, and their words are edited in the chain's sheet.
- **Autonomy:** the `outreach` class is offered (veto, ask or never).
- **What moved (F12, F16).** The tally, and "Skip this one", moved from the sheet to the approval sheet. The bulk bar's
  *Write to them* moved to Part 7 (a chain's audience is a search, and chosen leads are Part 7's own list). *Leads while
  it writes* (the strip, the Stage detail line, the peek's timeline) moved to Part 6, with what comes back. The sheet's
  *another step* offers another email only; a call or a note for the owner is Part 5's dated step.

**As built (Part 5).**
- **The Inbox.** A thread with a reading draws one strip above the composer (contracts `replyStripOf`): what the reply
  was read as, their summary, what was done ("Talking now", "A step is on Today for Jan 4.", "Nothing more will be
  written to …"), and its doors, "Use the draft" and "Read as no · undo" while the undo may run. It hides once a
  person's reply on the thread is newer than the reading. The composer is seeded with the draft. A line under the strip
  names the address the answer goes from: the one the reach-out wrote from, or the mailbox, with why, when that domain
  is held or removed (N5). A sent reply that left from the mailbox says so on its bubble ("Went from …: … could not
  send it"). The list's row carries the reading as a chip ("Interested", "Said no", …). The pages read it all through
  one surface, `__REPLIES`, over `GET /api/v1/reach-out-replies`, and the undo is
  `POST /api/v1/reach-out-replies/:id/undo`.
- **Today, the bell and Settings** draw what §4.9's Part 5 note says.
- **The sheet's *another step*** now offers an email, "A call for you" or "A note for you", the last two only as the
  last step, with their words held to 280 characters; Playbooks' open row names such a step "N handed to you". Part 4's
  line above, that *another step* offers another email only, held until this part and is superseded.
- ***Leads while it writes*** (the Stage detail line that reads `resume_at`, the undo on the lead) is still Part 6's.

**As built (Part 6; 00241).**
- **Leads while it writes** (H8). An open search whose reach-out writes draws a strip under the finder's own, the finder's
  strip itself: how many it has written to, today's count of the day's share (the chain row's `chainPaceOf`), the next
  email and who it goes to, the domain, how many wait for a say, and How it's going, a run that waits, and Pause or
  Resume. The Stage column now sits beside the name (still off by default, chosen in Columns), and it and a phone's card
  say where each business stands: written and nudged, wrote back and what it meant, not now until a day
  (`leads.resume_at`), said no, bounced, booked, away until, stopped, planned for, held for your say (contracts
  `reachOutLineOf`). One member read, `reach_out_search_lines(workspace, search)`, at most 2,000 lines, read when the
  search opens, again at most every thirty seconds as the leads are read again, and after a door moves something.
- **The peek's block** (H9): the lead's emails, each from its domain with its angle and what became of it, its replies
  as read, what is planned next, and three doors: Read what went out (the person's thread), Stop writing to them, and
  Read as no · undo while the reading may be undone (Part 5's door and route). One member read,
  `reach_out_lead_timeline(workspace, lead)`, `GET /api/v1/reach-outs/leads?lead=`.
- **Stop writing to them** (H10) is an acting member's door, `reach_out_lead_stop`, `POST
  /api/v1/reach-outs/leads/:id/stop`: it stamps `leads.reach_out_stopped_at`, skips the lead's planned and held emails in
  live runs (`owner_stopped`), and the stop is then one fact the send door reads (`outreach_lead_facts.stopped`, the
  refusal `outreach_stopped`, a skip and never a wait) and the next step's followers leave out. The lead is not closed:
  stopping is not a no. No event is written; the stop is on the lead and each skipped send.
- **A person's page** (H11) reads the same story through the lead it came from (`leadOfPerson` carries it as
  `PersonLeadDto.reach_out`): each reach-out email is named for its chain and step, with its angle, its domain and what
  became of it; their reply says how it was read; a Found row says where the business was found, with Open the lead; and
  the About rail says the reach-out and where they stand in it. The hero's line stays the thread's flag.


### 4.12 Failure handling

A domain that stops verifying holds its runs and says "Your domain stopped verifying" on the row, the run and Today. A
bounce after the send drops the address and never retries. A model call that fails leaves the recipient `held:
check_unavailable` and the run says how many; nothing sends unchecked. A reply the classifier cannot read is `other`:
the chain stops, the receptionist drafts nothing, the thread says "they wrote back". A lost job run resumes from the
timetable; a recipient claimed and not sent is `outcome_unknown`, as today. Nothing falls back to another channel, domain
or address.

## 5. What does not change

The one send door; the consent predicate; WhatsApp's template model and sync; the 7-day and gap rules for people;
ask/veto/auto; one conversation per person; the compact pages' shape; the routes' names; the finder's cards and the
source-rights record; the lead stages' words.

## 6. Parts and PRs

Each to 100% before the next, and each shippable in either deploy order unless said.

1. **Shipped 25 Sep 2026 in #1018 (the wire) and #1020 (the door).** **W0 — the send path** (the PRD's four hazards): every email a pre-written queued row; purpose and `proactive` in the
   payload; the recipient id as the idempotency key; `buildEmailRequest` with `parent: null`, a subject, and the
   unsubscribe headers as arguments; 429 read and waited out. 2 PRs.
2. **Shipped 25 Sep 2026 in #1024, #1028, #1032, #1036 and #1040 (five PRs, not three; 00174–00176 on production).**
   **The wire:** `sending_domains`, the `domains` clock and sweep, Connections › Email's domains block, the second Resend
   key in `env.ts`; the unsubscribe door (`GET/POST /u/<token>`) and the footer; `set_email_marketing` with the
   `unsubscribe` source; `lead_suppressions` written; the `outreach` purpose at the door; the gates.

   **2.5, shipped 25 Sep 2026 (#1046, #1051, #1056, #1062, #1064, #1066, #1067, #1069, #1073, #1076, #1080 and the
   docs; 00177–00179 on production).** The hardening an end-to-end audit (6.5/10) asked for before Part 3: the door
   holds a cold email to every rule (§4.8), the domains engine answers for what it knows (§4.6), Connections, the
   unsubscribe page and the footer speak plainly (the footer says "This is a marketing email.", Ruben's call), the
   switches and the watch on them, the big files split by pure moves, the runtime and the toolchain aligned.
   `docs/superpowers/plans/2026-09-25-reach-out-part-2-5-hardening.md` has the decisions (D1–D14) and what was built.

   **2.6, shipped 25 Sep 2026 (#1086, #1092 and the guards; 00180 and 00181 on production).** A second review before
   Part 3 (four reviewers; Ruben: "go with your recommendations"). A domain another workspace reserved is never taken
   while its DKIM key is published, and a lost create adopts only the provider domain that press made. A campaign's
   failure flags no thread (one predicate, contracts `isCampaignEmail`). A domain's day counts an email by when it left.
   A held domain still answers for its reputation. The door refuses a cold email to anyone who wrote back or called
   (`outreach_wrote_back`, 00181, C1's door half). The edge seals and opens an unsubscribe link every domains sweep
   (C9's probe). And two guards: a contracts import-cycle test, and a time limit written for every sweep.
3. **Shipped 26 Sep 2026 in #1102, #1111, #1112, #1114, #1116, #1117, #1119, #1120 and the proof and docs (nine PRs,
   not three; 00183–00188 on production).** **The engine:** the chain's objects (00183), the pure clock of a lead (zones,
   hours, the timetable), the doors (00184), a step's run planned whole (00185), the reach-out clock (00186), the
   sender (00187), the holds (00188), a cold-only domain's switches, and an end-to-end test on a stack
   (`reach-out.integration.db.test.mjs`). `docs/superpowers/plans/2026-09-25-reach-out-part-3-the-engine.md` has the
   decisions (E1–E12, D15–D19) and what each PR built. What Part 2.5 carried here, and where each landed:
   - **C1** the footer's "Reply 'no thanks'" kept. The door refuses anyone who wrote back (00181), and a step's
     followers leave them out before their limit (00184–00185).
   - **C2** the stop keyed by lead. The followers, and the door by the send's own lead: `Delivery.leadId` into
     `outreach_facts(p_lead_id)`, PR 6. In-Reply-To and References are matched (00181).
   - **C3** auto-replies excluded from "wrote back" (00181).
   - **C4** any bounce stops the chain (the followers' `bounced`, 00184).
   - **C5** a held or removed domain defers a send, never cancels it. The clock plans every door wait again (a full day,
     a domain not ready or removed, a paused workspace), and the sender re-plans a claim whose domain went away.
   - **C6** `maySpend` asked when a run is planned; the month's allowance counted at the claim (00187). Billing per cold
     send is the pricing decision's (0011).
   - **C7** the atomic claim under the domain's lock (`reach_out_claim`, 00184). The door's day is the backstop.
   - **C8** rows first: the email row under a send-derived id before the send leaves `claimed`, then its job (PR 6).
   - **C9** the token minted per person and email at the write (`lib/reach-out/request.ts`).
   - **C10** `campaignFooter` and `ownDomainIdentity` frozen into the request (PR 6).
   - **C11** a permanent bounce marks the lead's address invalid (PR 7).
   - **C12** no broadcast email branch was needed: a reach-out's run releases no `broadcast_send`, and its sends are
     the reach-out clock's (`isReachOutRun`, PR 4).
   - **C13** the clock claims nothing without the cold lane's secrets, and answers 503 `cold_lane_unset` while a send is
     due (PR 6).
   - **C14** an email taken as the last of its second waits out `ratelimit-reset` before the next leaves (PR 6).
4. **Built 26–27 Sep 2026 in ten PRs (00197, 00211 and 00212).** **The words and the pages:** #1125 (PR 1, the words,
   pure), #1137 (PRs 2 and 3, a send checked before it goes and the check's clock on the edge, 00197), #1153 (PRs 4
   and 5, the member doors and the routes, 00211), #1174 (PR 8, Playbooks' chain row and Templates' email rows), #1178
   (PR 6, the sheet and the Leads door), #1180 (PR 7, the approval sheet's reach-out block), #1168 (PR 9, Leads' five dead
   doors, carried from Part 1, 00212) and PR 10 (the proof on a stack, and these notes). 00213 (#1165, another plan's)
   made `reach_out_claim`'s pick a materialized CTE, so a claim never takes more than the domain's room.
   `docs/superpowers/plans/2026-09-26-reach-out-part-4-the-words-and-pages.md` has the decisions (F1–F16, R1–R24) and
   what each PR built. The bulk door moved to Part 7 and *Leads while it writes* to Part 6 (§4.11).
5. **Built 27–28 Sep 2026 in twelve PRs (00220, 00222, 00226, 00227 and 00228).** **Replies:** the intent classifier,
   pause and resume, said no, the dated-step door, notifications, Today's rows, the Inbox strips; the first use of draft
   mode on a lead thread. #1197 (PR 1, the reading, pure, and decision 0017), #1204 (PR 2, a no reaches the business's
   own domain, 00220), #1216 (PR 3, a reply is read, 00222), #1237 (PR 4, an automatic out-of-office pauses a chain and
   a person's reply may leave by its own domain, 00226), #1242 (PR 5, the receptionist's draft), #1243 (PR 6, the
   dashboard's doors and the reply frozen with its twin), #1245 (PR 7, the Inbox), #1250 (PR 8, Today, the bell and
   Settings), #1263 (PR 9, a booking or a deal stops a chain, 00227), #1271 (PR 10, a call or a note for you, the
   engine, 00228), #1273 (PR 11, the same in the sheet) and PR 12 (the proof on a stack, and these notes).
   `docs/superpowers/plans/2026-09-27-reach-out-part-5-replies.md` has the decisions (G1–G20, N1–N6) and what each PR
   built. Two PRs became twelve so that each holds in either deploy order and each page is seen drawn. Carried from
   Part 2.5, and where each landed:
   - **C15**, the owner's reply leaves from the thread's own domain. The dashboard freezes the mailbox's request, as
     every reply before, and beside it a twin from the own domain the reach-out wrote from, while that domain is
     verified (`meta.email.own_request`, PR 6). The wire sends the twin when an own route for its From holds, and the
     mailbox's request otherwise (PR 4), and records which left (`meta.email.left_as`). Whenever the own domain cannot
     carry it, the reply leaves from the mailbox and the thread says so (N5).
   - **C16**, the door refuses a cold email to anyone who ever wrote back (00181). Not narrowed: no human reply lets a
     chain go on, not `away` in their own words and not `not_now` (N1; §4.7 already said "Not now: the chain stops").
     Only an automatic out-of-office pauses, through a fact of its own (`away`, 00226), not through `wrote_back`.
     `wrote_back` was widened once, in its one place: an automatic reply read as no or wrong person counts (00222).
6. **Built 28–29 Sep 2026 in one PR (00241).** **What comes back:** Reports by step, angle and domain; interested and
   booked on the chain's row; Leads while it writes (the strip, the Stage line, the peek's story, Stop writing to them,
   the undo on the lead); a person's rows; and the day's numbers at 6 PM, a line in the bell (§4.9).
   `docs/superpowers/plans/2026-09-28-reach-out-part-6-what-comes-back.md` has the decisions (H1–H12) and what was built.
7. **Later:** bring your own list (leads from a CSV, checked first, as a search). 1 PR.

Then the PRD's Part 1 (customers' channels) and the rest of its order.

## 7. Tests

Pure: the timetable (hours, closed days, cap, gap, rotation, tomorrow's roll), the zones map, slot filling, the check's
code rules, the intent fixtures (twelve real-shaped replies). Doors over the fake db: a send skipped for each stop; a
receipt landing on its row and its lead; the unsubscribe token; the dated-step door. Database: the new CHECKs, the
audience resolver, the privileges suite for every new door. Pages: the sheet, the Leads door and the strip in the legacy
harness. Nightly, on the test workspace with the dry wire: a reach-out is made, checked and approved; three "sent"; a
simulated reply stops the chain and leaves a draft; a simulated bounce drops the address.

**As built (Part 5).** The nightly's reply moved onto a stack:
`tooling/scripts/tests/reach-out-replies/replies.integration.db.test.mjs` writes a chain to four businesses, has each
reply through the intake's own job, runs `reply_read` over a scripted reader and brain, and holds what each reading
did, the owner's answer leaving by the own domain and then by the mailbox, and the undo of the no. It runs with the
database suites: on a local stack (`corepack pnpm test:db`) and in the Migrations replay when a database path changes.
The nightly's integration step does not run it: it makes a workspace and signs its owner in, so it refuses a database
that is not on its machine. The intent fixtures are nineteen, not twelve
(`tooling/scripts/fixtures/replies/replies.json`), and `tooling/scripts/evals/reply-intents.mjs --live` reads them
with the model.

## 8. Risks

Resend's shared reputation (the second key and own domains); model cost at scale (two Haiku-class calls per email;
cached); the classifier misreading a reply (the owner always sees the draft; a "no" is undoable for seven days); a lead
without hours (9–17 local); a state map that is wrong for the few split-zone counties (the timetable errs by an hour);
the law's differences outside the US (the finder is US-only today; a non-US lead card brings its own rules).

## 9. Decisions for Ruben

**All eight approved by Ruben on 25 Sep 2026, as recommended.** Part 2.5 then took D1–D13 (its plan's first table:
a cold email is always a broadcast; what the door checks at send; a cold send never moves the Inbox; a cold failure
recorded, not flagged; a timed-out send re-posted once under its key; cold routes need both secrets; a complaint is a
no; only permanent bounces count; the reputation window's own clock; a provider hold that lifts itself; mail typed to
the From address goes where that domain's mail goes; the footer's "no thanks" kept, by Part 3; the unsubscribe secret
verified under the current and the previous value). **Still his:** D14, a support address the product can name (until
then no refusal prints one: it says the platform was told, and pages it).

**Part 3 approved 25 Sep 2026, after Part 2.6, with five more (D15–D19), as recommended.** A domain's ramp counts
the days it actually sent, not calendar days (D15). A second reputation hold within 30 days pages the platform instead
of offering Resume (D16). A separate cold-only link and reply domain comes before scale (D17). Reputation is also held
on the rates the product can see, since Gmail sends no per-message complaints: unsubscribes and replies read as no,
beside Postmaster Tools (D18). A nudge keeps "Re:" (D19). Part 3's plan also takes: a "wait" refusal (at the cap, a
domain not ready) defers a send and never cancels it (C5, C8); the door keyed by lead; one capacity read shared by the
timetable, the claim and the door; C7 as an atomic SQL claim; and every cold row carrying its `contact_id`.

**Part 5 approved 27 Sep 2026 with six more (N1–N6).** Only an automatic out-of-office read as away pauses a chain,
until the day it names or seven days on; a person's "I'm away" or "not now" stops it like any reply, with a dated step
on Today, and C16 is not narrowed for any human reply (N1). Settings › Notifications' Reach-outs group is rows that say
what is sent, with no switch: they wrote back, a reach-out waits, a reach-out holds an email, a sending domain held and
when it sends again; the day's numbers at 6 PM move to Part 6 (N2). Booked is read from the calendar now: an
appointment carrying an address or a number of a reach-out's lead, starting after its first email, converts the lead
within the sweep's hour (N3). "Read as no · undo" covers a no only, for seven days from the reading, by an owner or an
operator, and is refused once the person has unsubscribed or complained since (N4); the door admits a partner too, who
ranks above an operator. When the thread's own domain cannot carry the owner's reply, it leaves from the workspace's
mailbox, and the composer says so before Send, or the thread after it when only the wire could know (N5). A no
suppresses the exact address always, and the whole domain only when it is the business's own website's, never a shared
ISP's or a free-mail domain for one person's no (N6).

1. Pull Reach out ahead of Part 1 and W1–W3 of the PRD. Recommended: yes.
2. Several own domains per workspace, rotated (§4.6), or E4's one. Recommended: several.
3. A second Resend account for cold mail (a second plan's cost) or one key. Recommended: a second.
4. The owner's email adapted per lead by the receptionist (§4.3), a fixed template with slots, or a brief the model
   writes from. Recommended: adapted.
5. No open or click tracking (decision 8). Recommended: none.
6. Your own CSV of leads as an audience, after the finder's (§6.7). Recommended: yes, later.
7. The hand-to-you step as a dated step on Today (§4.9). Recommended: yes.
8. The ramp 30 → 100 → 200 a day per domain over clean days, or the campaigns spec's 30 → 100 per workspace.
   Recommended: per domain.
