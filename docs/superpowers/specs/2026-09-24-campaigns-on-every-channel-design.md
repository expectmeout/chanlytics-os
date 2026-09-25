# Campaigns on every channel: design spec

**Date:** 24 Sep 2026 · **Owner:** Ruben · **Status:** approved ("looks right write the spec and start part 0") ·
**Branch:** `design/campaign-channels` · **Follows:** the Campaigns compact program (#949, #954, #955, #956), the
email channel (docs/plans/2026-09-17-email-channel.md, live 18 Sep), decision 0009 (one idea of a list, in flight).

**Analysis:** every fact below was read on `origin/main` at `8ece615` (file and line beside it) or measured on the
salon's live workspace on 24 Sep. Where this spec and the code disagree, the code wins and the spec is corrected.

## 1. Goal

A playbook or a broadcast reaches each person **once, on the best channel they can be reached on** — WhatsApp, text
or email — instead of WhatsApp only. Email carries appointment messages to customers, offers to customers who have a
relationship with the business, and first emails to the leads the finder found. Text carries appointment messages
once a business's line is approved. Nothing here sends an offer by text.

Ruben, 24 Sep: "we have basically only catered to whatsapp but what about email or sms … the idea is to choose all
or which platforms to broadcast playbooks or custom playbook campaigns to … many businesses like to use email over
whatsapp." On leads: "leads found by finder should be able to get cold emailed that is the whole point of marketing."

## 2. What the product does today

**Every campaign is WhatsApp.** The batch sender sends `channel: "whatsapp"` with a Meta template
(`packages/core/src/messages/broadcast.ts:213-219`), finds recipients and threads by phone (`:142-145`, `:161`;
`core/src/messages/ports.ts:59-65`), and every template read filters `channel = 'whatsapp'` (`packages/jobs/src/handlers.ts:281`,
`core/src/deliver.ts:534`, `apps/edge/lib/playbooks.ts:229`, `apps/dashboard/src/server/campaign-ports.ts:35`).
`broadcasts` and `playbooks` require a `template_id` and carry no channel (00046:20-22, 00048:17-19). A person with no
number is `no_number` (`packages/contracts/src/people.ts:1168-1171`), whose own comment says an address is reached
"when the email wire carries reminders … not before".

**Three decisions made it so, and all three hold.**

- *Text carries no offers.* The carriers refused the registration that mixed reminders with offers (11 Sep, 30913);
  since #411 every business's filing says "No marketing or promotional content is sent from this number"
  (`apps/edge/lib/lines/a2p.ts:250`) and the door refuses `sms_carries_no_promotions` (`deliver.ts:266`). Changing
  that is a new filing per business with a new vetting fee (`a2p.ts:328-330`). Out of scope.
- *Email offers are switched off* "until a release of its own brings the unsubscribe a promotion owes"
  (`deliver.ts:268-271`). There is no unsubscribe header, link or route (`packages/channels/src/email.ts:179-183`), no
  postal address in any footer, and no consent for email anywhere (`ConsentWayKind = "whatsapp" | "sms"`,
  `contracts/src/consent-page.ts:58`).
- *Email is reply-only.* A send with no inbound email to answer is refused (`core/src/conversations/reply.ts:189`);
  an email needs a frozen `WirePayload.email` (`deliver.ts:70-78`, `:116-118`) that only the reply verb builds.

**Consent has no channel.** One `consent` (the START yes) and one `marketing_consent` (the offers yes) per person
(00002:34-37, 00095:56-62); which channel a yes came on is recorded only as evidence on the event (00110:166-168).
`mayMessageFor(contact, purpose, { proactive })` takes no channel (`contracts/src/consent.ts:74-87`) and has five
call sites (`consent.ts`, `people.ts` ×2, `broadcasts.ts`, `deliver.ts`, `apps/edge/lib/receptionist/outbound-gate.ts`).
Purpose is derived twice — the playbook's class at enrolment (`purposeOfPlaybook`, `consent.ts:201-203`) and Meta's
category at send (`purposeOfTemplate`, `broadcast.ts:102`) — and nothing checks they agree.

**Texting is gated at the door, not at the send.** Inbound texts are held unless the line is `active`
(`apps/edge/lib/sms/sms-ingress.ts:153`); neither `deliver` nor the SMS wire reads `lines.sms_state`
(`apps/edge/lib/sms/sms.ts:37-50`, `:123-126`).

**Cost sits with Chanlytics for two of three channels.** WhatsApp sends use the business's own Meta credentials
(`apps/edge/api/jobs/tick.ts:71-73`). Texts go through Chanlytics' Twilio account and emails through the
deployment's Resend key (`deliver.ts:107-108`). No per-message metering or cap exists; `maySpend` guards buying
numbers, registration and lead searches only (`contracts/src/billing.ts:145-153`).

**Health, limits and hours are Meta's.** `numberHealth` reads `tenant_channels kind='whatsapp'` and reports
`canSend: true` with no row at all (`contracts/src/broadcasts.ts:495-501`); `overLimitRefusal` is Meta's daily tier
(`:419-508`); the window is 9:00–20:59 for every channel (`contracts/src/playbooks.ts:114-122`).

**What already fits.** `templates` has a `channel` column (`whatsapp | voice | sms | email | instagram`) and is unique
by `(tenant_id, channel, name, language)` (00004:45-57); the WhatsApp sync touches only `channel = 'whatsapp'` rows and
leaves what Meta does not return alone (`apps/edge/api/admin/whatsapp/templates-sync.ts:8-10`, `:69`). Meta's
`components` — HEADER, BODY, FOOTER, BUTTONS — map onto a subject, a body, a footer and a button. The 7-day rule
("heard from any run in the last 7 days", `playbooks.ts:412-429`) is per person, not per channel. Bounce and complaint
suppression exist (`channels/src/email.ts:575-590`). The batch sender runs one person at a time and **continues itself
in the next job** (`tick.ts:103`, `jobs/src/handlers.ts:116`). The email plan already named the reach rule (`reachFor`,
email-channel.md:138, :273) and postponed it; "email in Broadcasts" was out of scope at launch (:431), not rejected.

**The data, on the one live workspace (24 Sep).** 29 people: 28 with a number, **1 with an email**, 0 with a stored
visit. 96 finder leads: 94 with a number, **57 with a verified email**. Visits are not stored: they come from a live
calendar read over a nine-week window (`apps/dashboard/src/server/calendar.ts:67`). Last inbound channel over the
29 people: WhatsApp 16, voice 9, email 1, none 3.

**How an address gets on file today, and how it does not.** Four ways in: a member types it on the person's page
(`set_person_email`, 00125:76-108, signed-in only; `PUT contacts/[id]/details`); the email intake fills an empty
`contacts.email` from a sender's address, with no event (`packages/db/src/repositories/email.ts:92-106`); a lead's
conversion (00142:197-223); `create_person` has no email parameter and requires a number (00053:16-76). **The
receptionist never books a visit and writes nothing about a person:** the text brain answers in a fixed record with
no tools (`contracts/src/brain.ts:48-89`), voice has four tools, none of which touches the contact
(`packages/channels/src/voice-shell.ts:90-164`), bookings are "offered, never made" (`config.ts:449-451`) — the
receptionist sends the booking link and the visit is made on the business's own booking site. Emails in calendar
events are extracted and discarded, because people are "made from a number, never an address"
(`contracts/src/calendar-people.ts:177-205`, `:602-604`). The sign-up page **is a page with no form**: "No form, no
field, no write" (`app/yes/[slug]/page.tsx:33-36`); a yes is the customer's own message, the keyword read at
`packages/channels/src/whatsapp.ts:221`. The only public write is `POST /api/v1/signup` (same-origin, strict schema,
5 an hour per IP and 3 per address, the address verified by a code). Nothing parses a CSV or uploads a file anywhere.

## 3. Decisions

Made by Ruben on 24 Sep, in order:

1. **Once, on their best channel.** A person gets a campaign's message once, on the first channel they can be reached
   on. Never on every ticked channel, never one channel per campaign.
2. **Offers by email go to customers with a relationship on record, to anyone who said yes to emails, and to the
   finder's leads.** Not to "anyone with an address".
3. **One message, a version per channel.** A message's WhatsApp, email and text wording live together in Templates;
   a campaign points at the message.
4. **Cold email sends from the business's own domain, required.** Customers' messages may use the shared domains.

Made in the design, from the facts above:

5. **No per-business channel order.** The best channel is the one a person last wrote on, else WhatsApp, text, email.
6. **The START yes learns its channel too**, not only the offers yes: a yes sent on WhatsApp is not a text opt-in
   under the registered flow (START by text, the sign-up page, the spoken script).
7. **The template's category is the one purpose.** A playbook whose class disagrees with its template's category is
   refused at check time.
8. **Chanlytics meters what Chanlytics pays for.** Email and text campaign sends count against a monthly allowance per
   workspace, and email offers pause on complaints or bounces.
9. **Over Meta's limit is held, not rerouted.** Nobody gets an email because WhatsApp ran out for the day.
10. **Capturing emails comes first (Part 0).** With one address in 29 people, everything else has nobody to reach.
11. **Email reminders need no yes.** A message about a visit the person booked goes to any address that is not
    suppressed; STOP and do-not-contact still block everything.
12. **Unsubscribe is not STOP.** An email unsubscribe ends email offers; a person keeps their visit messages. The
    landing page offers "stop everything" as a second, confirmed act.
13. **Out:** offers by text; Resend's Broadcasts/Audiences product (a second send door, contacts copied to Resend);
    a stored visits table (decision 2 needs none); a preferred-channel setting.

## 4. Design

### 4.1 Consent learns its channel; one rule

`contacts` gains `consent_channels text[]` and `marketing_channels text[]` — the channels each yes covers — backfilled
from the consent events that carry the channel (00110:166-168), and `email_marketing` (`opted_in | opted_out | null`)
with `email_marketing_source` and `email_marketing_at` for the email yes and the unsubscribe. STOP and `dnc` stay
all-channel (a person who said STOP by text gets nothing anywhere, as today).

`mayMessageFor(contact, purpose, { proactive, channel })` is still the one predicate; the channel is required.

| Channel  | Conversational, proactive                                   | Marketing                                                                                       |
| -------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| WhatsApp | `consent = opted_in` and WhatsApp in `consent_channels`     | `marketing_consent = opted_in` and WhatsApp in `marketing_channels`                             |
| Text     | `consent = opted_in` and text in `consent_channels`         | refused (`sms_carries_no_promotions`)                                                           |
| Email    | an address, not suppressed, not `dnc`/opted out             | not `email_marketing = opted_out`, and: a relationship on record, or `email_marketing = opted_in` |

*A relationship on record* is a fact the row already holds: they wrote or called the business (`last_inbound_at` /
`last_inbound_call_at`), or they have a deal. A lead found by the finder is its own case (4.7). The yes sources of
00100 (a yes to offers comes from `form` or `customer_message`) extend to email: `form` (the sign-up page or the
paper form) or `customer_message` (they asked in writing).

`whyNotReceive(row, purpose, channel)` answers per channel (`no_address`, `no_number`, `stopped`, `no_yes`,
`unsubscribed`, `not_approved_here` for a text line that is not active); `mayReceive` is "on some channel". The list
fact `can_receive` (decision 0009) keeps its words and reads the new rule: reachable for this purpose on any channel.

### 4.2 Reaching a person

`reachFor(person, campaign)` picks the channel, once, at enrolment:

1. the channel of the person's last inbound message, if the campaign ticks it and the rule allows it;
2. else the first of WhatsApp, text, email that the campaign ticks and the rule allows;
3. else held, with the reason the strictest channel gave.

The answer is written to the recipient row (`broadcast_recipients.channel`), so the report and the held-back words
are stable, and the reply channel rule the Inbox already uses (`apps/dashboard/src/server/verbs.ts:180-201`) and this
one are the same idea: where they last wrote.

### 4.3 Versions

A message is its name; a version is a `templates` row with that name and language on another channel:

- **Email**: `channel = 'email'`, `components` HEADER text is the subject (Meta's 60-character head fits a subject),
  BODY the body with the same `{{n}}` slots, BUTTONS a URL button drawn as the email's button. The compliance footer
  is not stored; the sender adds it (4.6).
- **Text**: `channel = 'sms'`, BODY only, the URL button appended as a link; the sender adds "Reply STOP to opt out".
- `meta_status = 'approved'` on save (no Meta review), `category` copied from the WhatsApp version, `source =
  'chanlytics'`. **A version keeps the message's slots:** it may drop a slot, never add one, or the campaign's params
  no longer fit; refused on save.
- A new version starts as a copy of the WhatsApp words; the starter set ships hand-written email and text versions
  (`contracts/src/template-library.ts`). A message may have **no** version on a channel — "Save our number" has no
  email meaning — and that channel is skipped for it.
- The WhatsApp sync is untouched: it already reads and writes only `channel = 'whatsapp'`.
- A campaign keeps `template_name` and `template_language` as today and resolves the row per channel at send;
  `template_id` points at any one version (an email-only business has no WhatsApp row).

### 4.4 The send

`playbooks.channels` and `broadcasts.channels` (`text[]`, default `{whatsapp}`, so nothing already made changes) are
the ticks. `createBroadcast` and the playbook check refuse a tick for a channel the business is not ready on, or that
the message's purpose forbids.

`sendBroadcastBatch` keeps its shape — one person at a time, a job that continues itself — and per recipient builds
the wire for the row's channel:

- **WhatsApp**: the template, as today.
- **Email**: the frozen `WirePayload.email` the door already demands, built here: From the campaign address (4.6),
  Reply-To the mailbox's token address, To `contact.email`, the version's subject and body with the slots filled, the
  button, the footer, and the one-click unsubscribe headers. Resend's `Idempotency-Key` is the recipient row's id,
  so a retried job cannot double-send. Resend's default limit is two requests a second, so the email chunk is small
  (about 100 a job) or uses the batch endpoint; the continuation already exists.
- **Text**: the version's body with the slots filled and the STOP footer, on the workspace's line.

The door (`deliver.ts`) changes in three places: text is refused unless the line is `active` and not a test filing
(a fact the ports carry, the same one `sms-ingress.ts:153` reads); `email_marketing_disabled` gives way to the email
row of the table in 4.1 once the unsubscribe path exists (Part 2); the frozen-request rules stay.

### 4.5 Health, limits, metering and gates

Per ticked channel, computed once per run and shown before a send:

| Channel  | Ready when                                                                      | Daily / monthly limit                                                                    |
| -------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| WhatsApp | an active number (`tenant_channels kind='whatsapp'`) that can send              | Meta's tier, as today                                                                    |
| Text     | `lines.sms_state = 'active'`, not a mock                                        | the brand tier's daily segment cap as the carriers publish it (1,000 for a sole proprietor) |
| Email    | a mailbox whose domain is verified (the `sweep-health` check already watches it) | the workspace's monthly allowance; cold email's daily ramp (4.7)                          |

`numberHealth` with no WhatsApp row stops reporting `canSend: true`: a run that ticks WhatsApp with no number stops
and says so; a run that does not tick it never asks. People over a limit are held to the next open moment, on the
same channel, never rerouted.

**Metering.** Email and text campaign sends are counted from `messages` (outbound, `kind = 'broadcast'`, channel,
calendar month) — no new table — against an allowance per workspace in `contracts/src/billing.ts` beside `maySpend`.
Past the allowance the run holds and the Campaigns head says "1,940 of 2,000 emails this month". The number appears
only once half is used (quiet frontend).

**Gates on email offers**, computed from the receipts we already store: complaints above 0.1% of the last 1,000
marketing emails, or hard bounces above 2% of the last 500 cold emails, set `mailboxes.offers_paused_at` with the
reason. Offers and cold email hold; reminders and replies do not. Connections and the Campaigns head say so; the back
office clears it after the list is fixed.

### 4.6 Email: domains, footer, unsubscribe

Three sending tiers, one Reply-To (the mailbox, so every reply lands in the Inbox):

| What                              | From                                        | Why                                                          |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Replies, visit messages           | `<mailbox>@mail.chanlytics.com` (as today)  | transactional; the mailbox is where they wrote               |
| Offers to customers               | `<mailbox>@campaigns.chanlytics.com` (new)  | a complaint about an offer must not touch the reply domain   |
| Cold email to leads               | the business's **own** verified domain      | the reputation risk stays with the business that takes it    |

The campaigns domain is one more Resend domain with the five records published once (Ruben's DNS). Own domains are
the email plan's E4 as designed: Resend creates the domain by API and returns its records; Connections › Email shows
them with a *Check* that reads verification; `sweep-health` watches them; a domain that stops verifying **holds** that
business's cold email and says so, never a silent switch to a shared domain.

**Every campaign email** carries the footer the finder's drafts already carry for cold mail (`leadDraftFooter`,
`contracts/src/leads.ts`) generalised: why they are getting it ("You're a customer of …" / "You asked for offers from
…" / "I found your business on Google Maps"), the business's name and postal address, and *Unsubscribe*. The address
is the Business record's (`business_records.street … postal_code`, the page at Settings › Business record): a
business with no record with an address cannot tick Email for offers, and the tick says why.

**Unsubscribe** is one door with two roads. `GET /u/<token>` is a public page: "You're unsubscribed from offers from
<Business>. You'll still get messages about your visits." with a second, confirmed act "Stop all messages" (sets
`dnc`). `POST /u/<token>` is the one-click road (RFC 8058: `List-Unsubscribe` and `List-Unsubscribe-Post:
List-Unsubscribe=One-Click` headers on every offer), idempotent, no sign-in. The token is an HMAC over
`(tenant_id, contact_id, purpose)` with a server secret — no row, nothing to enumerate. Both roads write through a
definer door `set_email_marketing(contact, 'opted_out', source 'unsubscribe')` and a consent event; a written "no
thanks" / "unsubscribe" reply classified by the email intake writes through the same door. For a lead the same act
also sets `leads.closed_reason = 'said_no'`.

### 4.7 Leads

The finder's leads carry `email`, `email_state` (`ok | catch_all | unknown | invalid | …`), `stage`, `closed_reason`
(`said_no | not_a_fit | customer | stale | search_removed`), `contact_id`, `contacted_at` and `last_outcome`
(00140:215-227). Today a draft leaves through the owner's own mail app (`POST leads/[id]/draft` returns a `mailto:`,
`legacy-bridge/leads.ts:497`).

- **Who.** A lead with `email_state = 'ok'` (catch-all addresses only when the workspace switches them on; they
  bounce more), stage `ready` or `nurture`, not `said_no`, not excluded from its list.
- **Audience.** A lead search or lead list is an audience kind beside People's lists: the reference gains a third
  kind, `{ kind: "leads", id: <search id> }`, resolved by the leads engine, so consumers still hold one reference
  (decision 0009's resolver takes it).
- **Sending creates the person.** The first send to a lead creates their contact from the lead (the address, the
  business name) and links `leads.contact_id` — the link the contacts insert trigger already makes for a matching
  address (00140:825-846) — so the reply threads on their conversation, the lead moves to `nurture`, and
  `contacted_at`/`last_outcome` are written as the draft path writes them.
- **Two triggers on the existing model**, not a sequence engine: `lead_first` (leads in the audience never
  contacted) and `lead_follow_up` (contacted four or more days ago, no reply, no follow-up yet). Any inbound from the
  lead stops both; "no thanks" sets `said_no`.
- **The finder's drafts use the same door**: beside "Open in your mail app", *Send* sends the draft through the
  campaign wire on the own domain, recorded and threaded.
- **The ramp.** Cold email per workspace per day: 30, then 100 after fourteen clean days (complaints under 0.1%,
  bounces under 2%); sends past the day's cap roll to the next open moment. Verified addresses only by default. The
  own domain is required: with none verified, the lead audience is offered greyed with the reason.

### 4.8 Text

Appointment messages only (`visit_tomorrow`, `proposal_waiting`, and any message whose category is `utility`).
Requires `lines.sms_state = 'active'`, checked at the door; the text version's body plus "Reply STOP to opt out";
the carrier daily cap from 4.5; the same 9:00–20:59 window. A yes covers text only when it came by text, the sign-up
page or the spoken script (`consent_channels`).

### 4.9 What the UI shows

On the compact pages as they stand (no new page):

- **Playbook sheet, broadcast composer**: a *Send by* row of ticks, one per channel the business is ready on and the
  message's purpose allows; an unavailable channel says why on hover ("Texts carry no offers", "Connect a domain to
  email leads"). The reach line shows the split: "Reaches 84: 52 on WhatsApp, 32 by email · 12 can't be reached", and
  the held-back words are per channel.
- **Campaign rows**: the reach cell keeps its number; the split is its hover and the open row's.
- **Templates, open row**: a `WhatsApp | Email | Text` switch beside *Language*; the email version previews as a
  subject line, the body, the button and the footer; the text version shows a character counter including the STOP
  footer. A version missing on a channel offers "Write the email version" (a copy of the WhatsApp words to edit).
- **Campaigns head**: the month's allowance once half used; a paused-offers line while a gate holds.
- **Run report and approval sheet**: each person's channel; the versions that go.
- **Connections › Email**: the campaigns domain state (platform-wide, read-only), the own-domain step with its records
  and *Check*.
- **A person's page**: the Email yes/unsubscribed row beside the two consent rows; a lead's page says "said no".

### 4.10 Failure handling

- A version whose slots differ from the message's is refused on save, naming the slot.
- A run whose ticked channels are all unready stops before enrolling anyone and says which channel and why.
- A tick for a channel the purpose forbids is refused at create/check, not at send.
- A frozen email whose address changed is `recipient_changed` (as today); a suppressed address is skipped with its
  reason; a bounce or complaint after the send suppresses the address for next time.
- A cold-email domain that fails verification holds cold sends; the run says "Your domain stopped verifying".
- A gate that trips holds offers; reminders and replies keep going.
- Nothing ever falls back to another channel or another domain on a failure.

## 5. What does not change

The one send door; the consent predicate as the one rule (it gains a parameter); WhatsApp's template model, Meta
limits and the sync; the 7-day and gap rules; the approval flow (ask / veto / auto); the 9:00–20:59 window; STOP as an
all-channel stop; the Inbox's one conversation per person; the compact pages' shape; the routes' names.

## 6. Parts and PRs

Each part is complete on its own, in either deploy order, and leaves no half-built channel.

**Part 0 — capture customers' emails.** Without addresses nothing else has anyone to reach. Two PRs. Nothing here
records a yes: an address on file is not consent (decision 2 decides who gets offers).

1. **Shipped in PR #999 (24 Sep); 00170 on production 24 Sep.** **Import from a spreadsheet.** People › *Import* (the owner; on a phone More › Import people): a CSV of the business's own client list (a Booksy
   or Square export) read in the browser by a hand-rolled parser (quotes, commas, CRLF; no new dependency), its
   columns matched to *Name*, *Mobile*, *Email* by header and by the values, previewed (the first rows, and the
   counts: new, already here, nothing to reach them by, unreadable), then written in parts of 50 through
   `POST contacts/import` (owner; its own rate bucket, sized for a list of a few thousand) to one definer door,
   `import_person(name, phone, email)`: refuses an erased person's digests; finds by number, then by address; fills
   only what is empty (a name, an address), never overwrites; inserts an email-only person where there is no number
   (the shape lead conversion already inserts, 00142:212-223); writes `contact.added {source: 'import'}` once per new
   person (the label reads "Imported"). One `decisions` row per part of fifty, all under one import id. Never sets a
   consent. The door's refusal of someone who asked to be forgotten has its own SQLSTATE (`PE001`), so a lost grant
   stops a part instead of skipping every row; the migration is `00170` and appends `import` to the verb CHECK as it
   stands, so it lands after the Lists program's 00169 in either order. The paper form gains an *Email* line, typed in on the person's page as the signed boxes are.
2. **Shipped in PR #1005 (24 Sep); 00171 on production 24 Sep.** **Addresses customers give.** (a) A switch on the receptionist, *Ask for an email when sending the booking link*
   (a `booking_rules` field, written into the prompt beside consult-first, `config.ts:1335-1353`; `describeLead`
   gains "email on file" so it never asks twice). (b) An inbound WhatsApp or text that is an address and nothing
   else — or a sentence carrying one after the receptionist asked — fills an empty `contacts.email` at ingest, the way
   YES OFFERS is read from the customer's own words (`whatsapp.ts:221`) and the way the email intake fills an address
   (`email.ts:92-106`), through `set_person_email` given a no-session branch for the edge (as `set_marketing_consent`
   has, 00142:972-976), so the event exists. A wrong-shaped address is asked for once more, never stored. (c) The
   calendar sweep fills an empty address from the event of a person it matched by number — the address is already
   extracted and thrown away (`calendar-people.ts:177-205`). Voice keeps its post-call suggestion pattern: a
   `caller_email` field beside `caller_name`, offered on the person's page, never applied on its own.

   *As built, where it differs:* the caller's address is a call bullet ("Gave their email as …") that reaches Ask and
   search; the call card draws no summary bullets, so the offer on the person's page is a later task. Retell only
   asks for `caller_email` once the salon's voice agent is converged (`tooling/scripts/voice-converge.mjs`, Ruben's
   go: it changes a live agent). The calendar fill writes `contacts.email` directly, with no event, as Part 0 intends.

Done when: the salon's client list imports with its emails and its counts are true; an address a customer writes
back after the receptionist asks is on their page within the minute; a person the calendar matched has the event's
address; the nightly imports a small CSV on the test workspace and finds the people. *(24 Sep: the first three
are built and unit-proven; the nightly's import spec is not written yet.)*

*Not in Part 0:* a typed field on `/yes/<slug>` — it would be the first public write on a path kept for pages that
write nothing. The email yes arrives in Part 2 the way the WhatsApp yes does: the page says "email <the mailbox
address> with YES OFFERS", the email intake reads the keyword and records the yes with the channel as evidence.

**Part 1 — the groundwork, proven with appointment messages by email.** Two PRs.

1. Consent learns its channel (the two arrays, the backfill, `email_marketing`), `mayMessageFor(channel)` at its five
   sites, `whyNotReceive` per channel, the template-category purpose check, versions in Templates with the switch and
   the slot rule, the starter set's email and text versions.
2. `channels` on playbooks and broadcasts, `reachFor`, the sender building each wire, per-channel health, the
   `sms_state` fact at the door, metering, the recipient's channel on the report, the split in the UI. Live proof:
   `visit_tomorrow` and `proposal_waiting` reaching a person by email.

**Part 2 — offers by email, and leads.** Three PRs.

1. The unsubscribe door and page, the one-click headers, the footer, the Business-record address gate, the campaigns
   domain (Ruben publishes its records).
2. Email offers under the rule of 4.1, the complaint and bounce gates, the email yes as the customer's own message
   (the sign-up page and paper form say "email … with YES OFFERS"; the intake reads it, source `customer_message`,
   channel `email` as evidence), the person page's row.
3. Own domains (E4 as designed), the lead audience kind, `lead_first` / `lead_follow_up`, the finder's *Send*, the
   ramp.

**Part 3 — appointment messages by text**, per business as its line goes active: the door's check, the footer, the
carrier cap, the text version in the sheet and the composer.

## 7. Tests

- **Contracts.** `mayMessageFor` over every (channel, purpose, proactive) cell of the table with fixtures in the
  real shape; `reachFor` (last channel wins, order, held with the strictest reason); the version slot rule; metering
  arithmetic; the gate thresholds; the footer's words.
- **Core.** The batch sender with fakes for the ports: picks the row's channel, builds each wire, uses the recipient
  id as the idempotency key, continues past the chunk, holds over a limit without rerouting; the door's text and
  email refusals.
- **Database.** The backfill of `consent_channels` from events (red first on a fixture with a WhatsApp yes and a text
  yes); the import door's dedupe; the unsubscribe door; `leads.contact_id` linking on the first send.
- **Routes.** `route-policy.json` pins `/u/<token>` public and rate-limited, the import route owner-only and sized;
  the typed client regenerated.
- **Pages.** On the stub React: the ticks and their reasons, the switch and the email preview, the split, the
  allowance line, the import preview.
- **End to end (nightly, on the test workspace).** Email sends on a dry wire; the sign-up page's email line; the
  import of a small CSV; a template's three versions.

## 8. Risks

- **The Lists program is in flight** (0009: phase 1 merged as #988, phases 2–5 pending). Parts 1 and 2 touch
  `can_receive`, `audienceMembers` and the campaign ports that its phase 2 rewires. Sequence: rebase on each phase as
  it lands; the reference's third kind is added in phase 2's shape.
- **Meanings move for the START yes.** A person whose yes came on WhatsApp stops being reachable by text. On the live
  workspace no text has ever gone out proactively, so nothing changes for anyone today; the backfill test names each
  row it fills.
- **Shared-domain reputation.** Customers' offers share `campaigns.chanlytics.com` across every business. The gates
  and the relationship rule are the protection; own domains for everything is the escape if a gate trips twice.
- **Resend and Twilio limits are the provider's to change.** The chunk size and the caps are constants in contracts,
  read from one place.
- **Email replies the receptionist cannot yet answer** land in the Inbox as needs-you (the receptionist does not
  draft email yet). Offers by email raise the owner's load until it does; the sheet says so where Email is ticked.
