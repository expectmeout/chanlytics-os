# Reach out: design spec

**Date:** 25 Sep 2026 · **Owner:** Ruben · **Status:** proposed; decisions 1–8 in §9 are his ·
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
(`broadcasts-real.jsx:98-195`); Today's queue and Steps due; one thread per person; the email intake's classification of
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

### 4.5 The timetable

`timetable(recipients, {zone, hours} per lead, pace, domains, now)` is a pure function in contracts: it assigns each
recipient a domain (round-robin over the verified, unheld ones) and a `send_at`: the next open moment in the lead's own
hours (the listing's `hours`, else 9:00–17:00), on an open day, at least `gap_min` after the previous send on that
domain (±25% jitter so no two runs look alike), under the domain's cap for that day; what does not fit today takes
tomorrow's first slots. A lead's zone comes from its state (a 50-state map in contracts; the finder is US-only). The run's
"sends 9:40" is its first slot. The ticker (`broadcast_send`, every minute) claims recipients with `send_at ≤ now`, at most
five a second across the platform (Resend allows ten a second per team by default), re-checks the stops (§4.7) and the domain's state, and sends. Pausing a reach-out clears
the future `send_at`s; resuming rebuilds them.

### 4.6 The wire

`sending_domains`: `tenant_id`, `host` (unique across the platform), `from_name`, `from_local`, `provider_domain_id`,
`records jsonb` (SPF, DKIM as Resend returns them, and the DMARC record we recommend), `state` (`records | verifying |
verified | held`), `held_why`, `held_at`, `clean_since`, `cap` (30 → 100 → 200 by clean days), `bounced_500`,
`complaints_1000`, `dnsbl_listed`, `checked_at`. Resend creates the domain by API; Connections › Email shows the records
with *Check*; a ten-minute sweep (a new clock, `domains`) reads verification and DMARC, counts bounces and complaints
from receipts, looks the host up on the DNS blocklists once a day, and holds the domain when any rule trips.

Every cold email is a queued row written before the send with a minted id, built by `buildEmailRequest` given `parent:
null` and its own subject (W0), `From` the domain's identity, `Reply-To` the mailbox's token address so the reply lands in
the Inbox, `List-Unsubscribe` (mailto and https) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
`Auto-Submitted: auto-generated`, plain text with a minimal HTML twin and no images; `Idempotency-Key` the recipient row's
id; tags `cl_message`, `cl_tenant`; the second Resend key. Receipts land on that row: delivered, bounced (the address
dropped on the lead: `email_state = 'invalid'`; the domain's counter), complained (the address suppressed; the domain
held), suppressed. `deliver()` gains the `outreach` purpose: allowed only for a recipient made from a lead, from an own
domain, with the footer.

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

### 4.8 Protection

- **Addresses:** `email_state = 'ok'` only, by default; catch-all and unknown held until included; a customer's number or
  domain never written cold; the never-again list (`lead_suppressions`) checked at reach and at send.
- **The law:** the Business record's address on every email (a workspace without one cannot start a reach-out, and the
  sheet says why); "why you are hearing from us"; one-click unsubscribe honoured within seconds; a reply meaning no
  honoured the same way; US leads only while the finder is.
- **The domain:** own domains only; verification, SPF, DKIM and DMARC read every ten minutes; bounces over 2% of the
  last 500 or any complaint hold the domain and its runs; a held domain sends nothing until Check passes; a DNS blocklist
  hit is shown and holds.
- **Volume:** the ramp per domain; the gap; the lead's hours; the month's allowance per workspace (cold sends counted
  from `messages` where `meta.source = 'reach_out'`, beside `maySpend`); the Campaigns head says "1,940 of 2,000 emails
  this month" once half is used.
- **The owner:** the first run waits for approval; later runs give thirty minutes; every held email waits for a decision;
  nothing is rerouted to another channel or domain on a failure.

### 4.9 Notifications and Today

`reach_out.replied {intent}` → the bell, a push and an email, right away by default (Settings › Notifications gains the
Reach-outs group: wrote back · a run waits · a domain held or a run stopped · the day's numbers at 6 PM). Today's queue
shows the run going out (with Stop in the veto window), each reply with its intent and the drafted answer's door, and the
hand-to-you calls under Steps due. A new definer door, `person_step_from_playbook(contact, due_on, words, for_user)`,
makes the dated step the hand-to-you and "write again in January" need (today only a signed-in member can, 00166:86-88).

### 4.10 Reports

Campaigns › Reports gains, per reach-out and per step: written, delivered, wrote back, interested, booked, said no,
bounced; replies by angle; sends by domain with delivered, bounced and complaint rates and the domain's state; written by
day. The sources table shows each step on its own line. No opens or clicks anywhere.

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
2. **The wire:** `sending_domains`, the `domains` clock and sweep, Connections › Email's domains block, the second Resend
   key in `env.ts`; the unsubscribe door (`GET/POST /u/<token>`) and the footer; `set_email_marketing` with the
   `unsubscribe` source; `lead_suppressions` written; the `outreach` purpose at the door; the gates. Migration first.
   3 PRs.
3. **The engine:** the `playbooks` columns and CHECKs, the `leads` audience kind, sending creates the person, `after_step`
   and `lead_first`, the stops, the timetable and the US zones, the ticker's due claim and re-check, metering. Migration
   first. 3 PRs.
4. **The words and the pages:** email template rows and their validator, the slots, the opening and check jobs, the
   sheet, the Leads door and the bulk door, the approval sheet's words, the Playbooks open row, Templates' switch.
   2 PRs.
5. **Replies:** the intent classifier, pause and resume, said no, the dated-step door, notifications, Today's rows, the
   Inbox strips; the first use of draft mode on a lead thread. 2 PRs.
6. **What comes back:** Reports by step, angle and domain; the person page's rows. 1 PR.
7. **Later:** bring your own list (leads from a CSV, checked first, as a search). 1 PR.

Then the PRD's Part 1 (customers' channels) and the rest of its order.

## 7. Tests

Pure: the timetable (hours, closed days, cap, gap, rotation, tomorrow's roll), the zones map, slot filling, the check's
code rules, the intent fixtures (twelve real-shaped replies). Doors over the fake db: a send skipped for each stop; a
receipt landing on its row and its lead; the unsubscribe token; the dated-step door. Database: the new CHECKs, the
audience resolver, the privileges suite for every new door. Pages: the sheet, the Leads door and the strip in the legacy
harness. Nightly, on the test workspace with the dry wire: a reach-out is made, checked and approved; three "sent"; a
simulated reply stops the chain and leaves a draft; a simulated bounce drops the address.

## 8. Risks

Resend's shared reputation (the second key and own domains); model cost at scale (two Haiku-class calls per email;
cached); the classifier misreading a reply (the owner always sees the draft; a "no" is undoable for seven days); a lead
without hours (9–17 local); a state map that is wrong for the few split-zone counties (the timetable errs by an hour);
the law's differences outside the US (the finder is US-only today; a non-US lead card brings its own rules).

## 9. Decisions for Ruben

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
