# Email is the business's own mailbox

**The hosted address goes; every email leaves from, and every reply is read in, a mailbox the business connects; and
Campaigns sends by email the way it sends by WhatsApp and text: a PRD.**

**Date:** 9 October 2026 · **Owner:** Ruben · **Status:** proposal, waiting on the decisions in §9. Once they are
taken, §3 becomes a decision note (`docs/decisions/0039-…`, or the next free number) and each part of §6 a plan under
`docs/superpowers/plans/`. · **Written against:** `origin/main` at `7ff1797` (#1525, 9 October 2026). Every fact in
§1 was read from that tree on 9 October by four read-only passes (the email wire and intake; the Campaigns surface; the
reach-out engine; the Google connection, the jobs ledger, the sweeps, realtime and erasure), with the file and line
beside it. Where this document and the code disagree, the code wins and this document is corrected. · **Follows:** the
email plan (`docs/plans/2026-09-17-email-channel.md`), the Reach out spec
(`docs/superpowers/specs/2026-09-25-reach-out-design.md`), the campaigns spec
(`docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md`), "A campaign says where it goes"
(`docs/superpowers/specs/2026-10-08-a-campaign-says-where-it-goes-design.md`), decisions 0001, 0017, 0019, 0027, 0031 to
0036. · **Supersedes:** the email plan's E4 ("Own domain, assisted"), the Reach out spec's §4.6 (the wire) and §4.8's
domain rules, the campaigns spec's §4.6 (three sending tiers), and the runbook's "Turn on cold email" checklist, which
is not to be run.

> **In one paragraph.** A business connects its own mailbox, Google Workspace or Microsoft 365, by OAuth, in Settings ›
> Connections. From then on every email the product sends for that business leaves from that mailbox, under that
> mailbox's own day (a cold cap that ramps, a provider guard, a gap), and every reply, bounce and out-of-office is read
> back from the same mailbox and taken through the intake that exists today. A cold reach-out needs a mailbox on the
> business's own domain whose SPF, DKIM and DMARC the product has read as good; a second mailbox on a spare domain is
> the recommended shape, as it is at Instantly and Smartlead. The hosted `<name>@mail.chanlytics.com` address, the
> platform-wide campaigns domain, the second Resend account and the `sending_domains` engine all retire. The chain of
> playbooks, the timetable, the check before each send, the reply reading, the stops, the unsubscribe page and the
> never-again list stay as they are; they are the product, and none of them cared which provider carried the email.
> What a customer notices: the business writes from `hello@thebusiness.com`, and when they answer, the answer lands in
> the business's own inbox and in the Chanlytics thread at once.

---

## 0. Why, and what this is

Ruben, 9 October 2026: "the user must only be able to send emails from their google workspace/gmail not from a
chanlytics backed email … that whole concept may need to be scrapped to avoid further issues … lets think
instantly/smartlead etc in this regard the things they do to get users to connect their email and dns stuff to ensure
we get good data and also avoid going to spam", and, the same day: "totally scrapping away and deleting the concept of
providing users a chanlytics backed email. it was a wrong turn … the clear path is the instantly model of connecting to
your business email and having users set up sequences/templates to auto send spaced out in between to not trigger
spam … fitting and unifying that page and the wiring to work cleanly with email in a universal kind of way".

Three facts make the case, in order of weight:

1. **A transactional provider is the wrong carrier for cold email.** Resend's acceptable use policy bars unsolicited
   bulk email and lists list brokers among prohibited uses; a secondary source says it expressly prohibits cold
   outreach (Appendix C, 1 and 2; the official page could not be fetched from here and is to be read before anyone
   relies on it). Every transactional provider the author knows of forbids cold prospecting. The Reach out program as
   built sends to scraped Maps leads from a second Resend account (`apps/edge/lib/reach-out/sender.ts:114-134`), one
   account for every workspace: one tenant's bad week can close it for all. The spec names the risk itself ("Resend's
   shared reputation", its §8).
2. **Deliverability belongs to the business's own mailbox.** Mail from a Workspace or Microsoft 365 account to Gmail and
   Outlook recipients rides the provider's own infrastructure and the business's own domain reputation; mail from a
   shared provider rides shared IPs whose reputation other tenants set. That is why Instantly, Smartlead, Apollo,
   lemlist and HubSpot's sales sequences all send through the user's connected mailbox and none through an ESP of their
   own. It is not a UX preference; it is the deliverability model.
3. **Nobody publishes a hosted address.** The hosted mailbox was the email plan's launch convenience (E2: email with no
   DNS work, `docs/plans/2026-09-17-email-channel.md:395-399`), and it put a second identity beside the one every
   business already has. A cold email today leaves `From: sam@theirdomain.com` with `Reply-To:
   r+token@mail.chanlytics.com` (`packages/channels/src/email/identity.ts:14-17, 108-118`): a mismatch receivers score,
   and a reply that never reaches the owner's Gmail.

This document plans the replacement in one program, in the house shape, against the code as it stands:

- **Planned here:** the connected mailbox as the one email identity (one or several per workspace, one primary); the
  OAuth flows for Google and Microsoft on the connection and Vault shape that exists for Google Business Profile; the
  wire (one lane, our own Message-ID, the headers that keep the unsubscribe honest) and the mailbox's day (a cold
  ramp per mailbox, a provider guard, a gap); reading the mailbox (push, history or delta, one planner that decides what
  is kept, bounces read from delivery reports, the owner's own sends seen); Reach out re-keyed from a domain to a
  mailbox; Campaigns sending every kind of email from the same place under one readiness and one words rule; the
  receptionist answering email in draft mode from the primary mailbox (the PRD of 24 September's W3a, now with a real
  address to answer from); what retires, and the cut.
- **Given, not re-planned:** the chain, the audience, the timetable, the check, the holds, the reply reading, the
  stops, the reports' shape, the unsubscribe page and token, the never-again list, the one send door, the jobs ledger
  (0031 to 0035), realtime (0019), erasure (0036).
- **Not here:** a warmup network, open or click tracking, SMTP or IMAP, done-for-you domains, Google Calendar on the
  same connection, team assignment, a rich HTML composer (Appendix B).

The measure of done is §6's proof column: each part is proven on production, on the test workspace with a mailbox
Ruben owns, before the next starts.

---

## 1. What the code says today

### 1.1 Three identities, three lanes, two accounts

An email leaves by one of three routes `emailWireFor` builds (`apps/edge/lib/email/email.ts:101-139`), chosen by the
send's purpose in `emailSender` (`packages/core/src/wire-senders.ts:146-166`: `outreach → own`, `marketing →
campaigns`, else `hosted`), then matched by the frozen request's From against the route's address (`:160`):

| Lane      | From                                      | Reply-To                                       | Account                                                  | Carries                                                                                                 |
| --------- | ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| hosted    | `<local_part>@EMAIL_DOMAIN`               | `r+<reply_token>@EMAIL_DOMAIN`                 | the platform's Resend key                                | replies, visit messages, the Inbox's first email (`packages/channels/src/email/identity.ts:20-50`)      |
| campaigns | `<local_part>@EMAIL_CAMPAIGNS_DOMAIN`     | the mail domain                                | the same key                                             | offers and the business's own news (`identity.ts:57-79`; `apps/edge/lib/email/campaigns-domain.ts`)    |
| own       | `<from_local>@<verified sending domain>`  | the mail domain, or `COLD_REPLY_DOMAIN` (D17)  | the second, cold Resend account (`RESEND_COLD_API_KEY`)  | cold email from reach-outs only, and a person's reply to one when it can go from there (`:88-118`)      |

The own lane binds only when `RESEND_COLD_API_KEY` and `RESEND_COLD_WEBHOOK_SECRET` are both set
(`email.ts:117-132`); the campaigns lane only for `broadcast_send` jobs and only while Resend reads the campaigns domain
verified (`campaigns-domain.ts:98-119`; bound at `apps/edge/lib/ops/jobs-tick.ts:115-128`). Twelve edge environment
variables carry the three (`apps/edge/lib/env.ts:110-173`; `apps/edge/.env.example:55-113`): `RESEND_API_KEY`,
`RESEND_COLD_API_KEY`, `EMAIL_DOMAIN`, `EMAIL_CAMPAIGNS_DOMAIN`, `RESEND_WEBHOOK_SECRET`, `RESEND_COLD_WEBHOOK_SECRET`,
`UNSUBSCRIBE_SECRET`, `UNSUBSCRIBE_ORIGIN`, `COLD_REPLY_DOMAIN`, `COLD_REPLY_DOMAIN_PREVIOUS`, `LEAD_FROM`, `LEAD_TO`.
`/api/diag` reports six of them as booleans (`apps/edge/lib/ops/diagnostic.ts:83-123`), and the health sweep pages the
mail domain, each cold reply domain and the campaigns domain (`apps/edge/lib/ops/health-sweep.ts:133-158`).
`docs/architecture.md:197-208` describes two lanes; the campaigns lane is undocumented there.

The request itself is provider-neutral already: `EmailRequest {from, to[], reply_to[], subject, text, html, headers,
tags[], idempotency_key}` (`packages/channels/src/email/request.ts:46-56`), built by `buildEmailRequest` (`:200-239`)
with `Re:` once from the parent, the HTML twin, In-Reply-To and References, `Auto-Submitted`, and for a campaign
`List-Unsubscribe` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (`:162-174`). It mints no Message-ID; the
provider's receipt supplies it (`:184-185`; `stamp_email_sent`, 00128:33-45). The frozen request is stored on the row as
`meta.email.request` (and, for a reply that may leave by an own domain, a twin `own_request`,
`packages/core/src/conversations/reply.ts:316-327`), and the job that sends reads it back
(`packages/jobs/src/handlers.ts:81-99`). The send door classifies a send by `purpose` (`conversational | marketing |
outreach`), `about`, `proactive` and `kind` (`packages/contracts/src/consent/consent.ts:80-116`;
`packages/core/src/deliver.ts:93, 201-209`), and its refusals, in order, are at `deliver.ts:417-475`.

Member notifications (`apps/edge/lib/ops/notify.ts`) are not on this wire: they post plain mail with the platform key
from `LEAD_FROM`, a `chanlytics.com` sender (`:70-123`), and the email plan kept them out of scope on purpose
(`docs/plans/2026-09-17-email-channel.md:437`). Nothing here touches them.

### 1.2 The hosted mailbox and its intake

`mailboxes` (00126:21-46; `supabase/schema.sql:21972-21998`) holds one hosted address per workspace: `local_part`,
`reply_token`, `reply_token_prev`, `from_name`, `reply_mode` (`draft | veto | auto`), `last_received_at`,
`last_error`, the offers' pause (00299:98-111) and Gmail's forwarding confirmation for booking notices
(`forward_confirm_*`, 00345:211-217). One per workspace is held by `mailboxes_tenant_uq` (00126:48-49) and
`create_mailbox` (00129:61-62; re-created 00201:124-191), and assumed by `mailboxOfTenant`
(`packages/db/src/repositories/email.ts:254-258`) and the wire (`email.ts:110-112`). No foreign key references it;
`mailbox_id` travels only in `email_ingest` and `booking_read` job payloads (`apps/edge/lib/email/resend-event.ts:130`;
`packages/jobs/src/handlers.ts:176-192`). Two columns are dead: `reply_mode` is read by no code, and `reply_token_prev`
is read but never written. The table is not realtime-watched (`packages/db/src/realtime.ts:34-68`), and its columns
sit unregistered in the erasure baseline but for the forwarding four
(`tooling/scripts/tests/baselines/erasure-strategies.json:136-140`; `packages/db/src/erasure-registry.ts:180`).

Inbound mail arrives as a Resend `email.received` event on `/api/resend-webhook`
(`apps/edge/lib/email/resend-event.ts:47-139`), is routed by envelope to the mailbox whose address or reply route it
names (`packages/channels/src/email/intake.ts:29-77`), and becomes one `email_ingest` job per mailbox, once per
received id (`jobs_email_ingest_uq`, 00135:28; `scheduleJobOnce`, `packages/jobs/src/schedule.ts:89-100`). The job
fetches the email through a port the tick injects (`JobContext.email.fetch`, `apps/edge/lib/email/email.ts:185`) and
hands it to `ingestEmail` (`packages/core/src/messages/email-ingest.ts:190-268`), which decides what it is
(`classifyReceived`: a delivery report, a booking notice, a forwarding confirmation, an automatic reply, automated
mail, a person; `packages/channels/src/email/intake.ts:222-248`), drops our own mail coming back (`our_own`: the
mailbox's address, or a Message-ID we sent, `:208-209`), keeps a person's through `ingest_inbound` with the provider's
id as the replay key, resolves the person through 0034's door (00344), schedules `reply_read` for a reach-out's reply
and `booking_read` for a booking notice, and flags the thread `email_review`. It never answers: "until the receptionist
drafts email replies, every email from a person is a person's to answer" (`:18-35`;
`EMAIL_NOT_ANSWERED_SENTENCE`, `packages/contracts/src/email/mailbox.ts:118-119`). Whether a sender is proven comes
from Resend's `authentication` verdict alone (`intake.ts:215-220`).

### 1.3 Sending domains

`sending_domains` (00175 to 00188, 00314) is the cold lane's identity: a host verified at the cold account, its DNS
records as Resend returns them, DMARC read at the host or a parent (`apps/edge/lib/email/dmarc.ts`), a state
(`records | verifying | verified | held`), a hold reason (`verification | dmarc | bounces | complaint | unsubscribes |
provider`), the ramp's clock (`clean_since`), the reputation window's clock (`counted_since`), the day's counters, and
`sent_days`. The `domains` sweep reads each every ten minutes (00175:104-131; `apps/edge/lib/email/domains-sweep.ts`),
holds and lifts (`sending-domain-check.ts`, `sending-domain-holds.ts`; `reputationHoldOf`,
`packages/contracts/src/email/sending-domains.ts:208-214`: any complaint, or bounces or unsubscribes over 2% of the last
500 sent, over 3 while fewer than 150 have gone), and pages the platform when a verified domain's emails hear no
receipt (`cold-receipts.ts`). The admin door (`apps/edge/api/admin/sending-domains.ts`) takes `status | add | check |
remove | resume`; the dashboard's four routes under `app/api/v1/sending-domains/` call it; Connections › Email draws
the block (`apps/dashboard/src/surfaces/settings/connections/domains-block.tsx`). The ramp is `DOMAIN_RAMP`: 30 a day,
100 after 14 sent-days, 200 after 30 (`sending-domains.ts:71-89`); at most five per workspace. A nightly keep copies
each domain's counters into `sending_domain_days` (00314). Across the tree the domain is named in 151 files (apps 33,
packages 30, migrations 25, tests 63), most of them tests.

### 1.4 Reach out: what is provider-free, and what is keyed on a domain

Read function by function (`supabase/migrations/00183` to `00261`), the engine divides cleanly:

- **Provider-free, keyed on nothing of the wire:** the chain (`playbooks.kind`, `after_playbook_id`, `after_days`,
  `gap_minutes`, 00183), the audience (`reach_out_audience`, 00220:124), the followers (`reach_out_followers`,
  00241:272), the person made at the send (`reach_out_person`, now through `resolve_person`, 00344:934), the check and
  its holds (00197; `apps/edge/lib/reach-out/check.ts`, `check-one.ts`, which import nothing about a domain), the
  decide and recheck doors (00211), the hand step (00228), the reply reading and its apply, undo, booked and stop doors
  (00222, 00226, 00227, 00241), the day's numbers (`reach_out_day_due`), the month's count
  (`reach_out_month_sent`, 00301:130, over `messages.meta.source = 'reach_out'`), the timetable, which sees a sender only
  as `{id, cap, recent}` (`packages/contracts/src/reach-out/reach-out-timetable.ts:23-52, 162-199`), the lead's hours
  and zone, the words, the writer and the reader.
- **Keyed on a domain:** `reach_out_sends.domain_id` (00183:132; a composite FK `(tenant_id, domain_id)` on delete set
  null, 00279:92), `playbooks.domain_ids` (00183:24), `reach_out_plan_run` (00185:50-58), `reach_out_claim` under the
  advisory lock `'reach_out_claim:' || domain` with `sending_domain_capacity` (00213:10-37; 00184:33-66, which counts
  what left and is queued **by From host**, and claims by `domain_id`), `reach_out_due_domains` (00197:158-185),
  `outreach_facts` (00184:153-176, reading `sending_domains` by host), `reach_out_save` (00228:131-134, 222, 268), and
  the three readers that join `sending_domains` for a host to print: `reach_out_report` (00261:386-394, 469-474),
  `reach_out_search_lines` (00261:509, 541) and `reach_out_lead_timeline` (00280:100-111). On the edge: `sender.ts`
  (the claim per domain, five a tick, `domainDailyCap(min(c.sent_days, domain.sent_days))`, `:498-535`),
  `replan.ts`, `run-context.ts` (the domains port), `request.ts` (the From is `ownDomainIdentity`, the Reply-To the
  mailbox's token on the cold reply domain, `:120-145`), and `coldLane()`, which answers 503 `cold_lane_unset` naming
  five variables while a send is due (`sender.ts:114-134`; `reach-out-sweep.ts:26-33`; `check-sweep.ts:34-40`). On the
  dashboard: `chainsOf` reads the domains for the sheet (`apps/dashboard/src/server/campaigns/reach-outs.ts:116-159`),
  the sheet's `RoFrom` switches (`apps/dashboard/src/surfaces/campaigns/reach-out/sheet-plan.tsx:61-110`), the
  approval block's share (`packages/contracts/src/reach-out/reach-out-approval.ts:63-68`), the Leads strip's "from
  host" (`reach-out-leads.ts:210-232`).
- **Keyed on Resend's receipts:** a send becomes `sent` when the door marks the message sent on the provider's accept
  (`packages/core/src/deliver.ts:668-676`), with no receipt; `delivered` is written only by a receipt
  (`apps/edge/lib/email/email-receipts.ts:73-126`; `packages/channels/src/email/receipts.ts:98-114`), and the reports
  count it (`reach_out_report` totals, steps and domains, 00261:388-444; `reach_out_chain_report`, 00261:277-278); a
  permanent bounce marks the lead's address invalid (`leadAddressBounced`); a complaint is the person's no and holds the
  domain; an outcome left `unknown` by a timeout is settled by a receipt or failed after a day (`clock.ts:132-135`);
  `reach_out_reply_of`'s first match is In-Reply-To or References against `meta.email.message_id`, which only the
  receipt stamps (00237:295). The owner's reply to a reach-out is frozen twice, the mailbox's request and an own-domain
  twin, and which one left is stamped `left_as` (`apps/dashboard/src/server/connections/email.ts:58-140`;
  `wire-senders.ts:153-185`; 00226:114-145).

### 1.5 Campaigns: templates, playbooks, broadcasts, offers, reports

Campaigns is one home with two rooms, Sent and the Library (`packages/contracts/src/shell/campaign-rooms.ts:8-13`), all
TSX under `apps/dashboard/src/surfaces/campaigns/` since decision 0015; no campaign page remains in the legacy tree. A
**campaign message** is a name with a version per channel: WhatsApp's approved by Meta, an email's or a text's ready when
saved (`save_template_version`, 00296:25-124: email subject at most 60, body at most 2,000; `create_message_version`
for a first version with no WhatsApp row, 00343). A reach-out's emails are `templates` rows too, under their own
validator (subject at most 80, body at most 1,200 characters and 120 words, one link, no line in capitals, known slots;
`packages/contracts/src/reach-out/reach-out-words.ts:65-68, 222-300`), written whole by `reach_out_save`. The email foot
is never stored: `emailFoot` adds it at send, in three kinds, `visit | offer | cold`
(`packages/contracts/src/templates/email-foot.ts:26-133`).

A **playbook** carries `channels[]` (00298:41-56), read as one standing per channel, `on | waits | could | off`
(`playbookChannelsRead`, `packages/contracts/src/playbooks/playbook-channels.ts:87-116`), and its run is a `broadcasts`
row with `broadcast_recipients.channel` chosen per person by `reachFor` (`packages/contracts/src/broadcasts/reach-for.ts:250-268`:
the channel they last wrote on, else WhatsApp, text, email; each held under the strictest reason). Email is ready for
a workspace only when the edge reports a mail domain and key and a mailbox exists (`channelsReady`, `reach-for.ts:167-204`;
the edge's `/api/admin/email/wire`). An **offer by email** (`isOfferByEmail`, `consent.ts:106-116`) needs the campaigns
lane open, the postal address and an unsubscribe link, and a yes or a relationship on record
(`OFFER_GATES`, `packages/contracts/src/broadcasts/email-offers.ts:40-43`; `offerRefusal`,
`packages/core/src/deliver-email.ts:47-54`; `mayMessageFor`'s email branch, `consent.ts:189-227`). The batch sender
sends 25 people a job, 300 ms apart, on every channel alike, inside 9:00 to 20:59, and continues itself
(`packages/contracts/src/broadcasts/broadcasts.ts:138-162`; `packages/core/src/messages/broadcast.ts:314-456`). **Email
has no per-day cap for broadcasts or runs**: only the month's allowance (email 2,000, text 500; `reach-for.ts:327-330`,
counted by `campaign_month_sent`, 00298:437) and Resend's own limits, which stop a run (`broadcast.ts:292-297`). Per-day
caps exist only for the cold lane.

"A campaign says where it goes" (#1501, 8 October) added the marks, the drawer's switches, readiness said once at the
head with doors to Connections, "Who can hear you" split by channel, and decided that a new playbook ticks every
ready-and-held channel (`NEW_PLAYBOOK_TICKS_EVERY_CHANNEL = true`, `reach-for.ts:60`), "the one call Ruben may want
back, because email and text cost Chanlytics" (its §3, decision 5; the status block says his word is owed and was not
updated after the merge). Reports count sent, delivered, read and replied per channel (`campaign_series`, 00329;
decision 0030: a read is WhatsApp's share only), and the Reach-outs lens counts written, delivered, wrote back,
interested, booked, said no, bounced, by step and by domain (`apps/dashboard/src/surfaces/reports/reach-outs.tsx`).
Two warts to carry: a reach-out run's `broadcasts.channels` keeps the default `{whatsapp}` though it sends email only
(00185:41-45; 00228:338-342), and one channel has two words rules (60/2,000 for a campaign email, 80/1,200 for a
reach-out's).

### 1.6 The Google connection, Vault, Connections and Setup

A Google connection exists for Business Profile, and it is the pattern a mailbox connection copies whole:
`packages/channels/src/google/google-oauth.ts` (the authorize URL with `access_type=offline`, `prompt=consent`,
`include_granted_scopes=false`, `login_hint`; the signed state `{t, u, n, exp}`; the token exchange, refresh and revoke;
`grantHasScope`), `PROFILE_SCOPES = ["openid", "email", "…/business.manage"]` (`:22`), sent on every authorize
(`:32-49`). The dashboard starts it (`GET /api/v1/google/connect`, role partner; `startGoogleConnect`,
`apps/dashboard/src/server/connections/google-actions.ts:81-98`) and takes the callback (`GET /api/v1/google/callback`,
`:40-79`: Google's error, `verifyState`, the state's person is the caller, `memberContext`, the settings permission),
then calls the edge's admin door with the code (`edgeGoogle`, `connections/google.ts:117-126`, over `callEdge` and the
one-minute `x-edge-token`, `src/server/edge.ts:65-151`; verified by `apps/edge/lib/admin-auth.ts:89-146`). The edge
exchanges the code, requires the scope and a refresh token, reads what it needs, upserts the row and stores the grant
in Vault (`apps/edge/lib/google/profile-connection.ts:75-185`; `put_google_credentials`, `get_google_credentials`,
`drop_google_credentials`, 00070:48-114, `security definer`, service role only, the secret named for the workspace);
`tokenFor` refreshes a minute before expiry and re-stores (`profile-credentials.ts:77-101`). Disconnect revokes at
Google, drops the secret and the row, and writes `google.disconnected` (`:274-299`). `google_connections` is one per
workspace by primary key (00070:15-33), realtime-watched (00265:98), and its columns too are unregistered in the
erasure baseline (`erasure-strategies.json:59-68`). The `google` sweep syncs connections due, forty a tick, hourly
(`apps/edge/lib/google/google-sweep.ts:23-99`; `00069:130`), the shape a mailbox's watch renewal takes. The deployment
already carries a `GOOGLE_OAUTH_AUDIENCE` of `testing | unverified | verified` and words for each on the Connections
row (`apps/edge/lib/env.ts:257-271`; `packages/contracts/src/setup/connections.ts:561-605`).

Connections (`apps/dashboard/src/surfaces/settings/connections/pane.tsx:238-352`) reads three surfaces and draws nine
rows from `connectionRows` (`packages/contracts/src/setup/connections.ts:758-797`); the Email row says the hosted
address, "Waiting on us", or "N domains held", with "Change the name" and "Choose the address" (`:691-740`), and the
domains block sits under it (`pane.tsx:339`). Setup's email row is never required and says the receptionist does not
answer email (`packages/contracts/src/setup/setup-rows.ts:314-347`); the first run lists email among `LIVE_ROWS`
(`first-run.ts:48`). `EmailSetupDto` carries a single `mailbox` and the sending domains
(`packages/contracts/src/email/mailbox.ts:106-115`). No Microsoft, Graph, MSAL or Gmail API code exists anywhere; the
only Outlook mentions are text heuristics (`free-mail.ts:11`; `reach-out-replies.ts:291-305`).

### 1.7 The spine the new parts stand on

- **Jobs.** A kind arrives with its handler, its caller, the `jobs.kind` CHECK and its lane in one change
  (`CLAUDE.md`; held by `repo/store-retired.test.mjs:97-145`, the generated schema sets, and
  `jobs/jobs-lanes.db.test.mjs`). The CHECK is at 00347:24-26 (thirteen kinds), the lanes at 00347:28-37 (lane 0 the
  inbound and a person's sends, lane 1 provisioning, readings and booking reads, lane 2 bulk and outreach), the
  handlers typed whole (`packages/jobs/src/handlers.ts:486-500`), scheduling a plain insert with a dedupe key
  (`schedule.ts:39-100`; `jobs_dedupe_live`, 00333), the wake on insert (00333) with the ten-second poll as backstop,
  retries 2 then 10 minutes (5 then 30 for `email_ingest`), capacity counted in the claim (`job_capacity (scope, key,
  max_in_flight)`, scopes `workspace | provider | domain`, 0033).
- **Sweeps.** Every cron door is `sweepDoor` (`apps/edge/lib/ops/sweep-door.ts:37-53`), scheduled by pg_cron in its own
  migration, registered in `sweep_status` with a `max_silence` (00107), requested only when there is work
  (`trigger_domains_sweep`, 00175:104-117, is the shape), budgeted against a time limit
  (`repo/ops-hygiene.test.mjs:208-268`), and classified as a reconcile, judge, keep or roll clock, never event-shaped
  (`tooling/scripts/tests/clocks/_clocks.mjs`; 0031's invariant 6).
- **Events and the intake ledger.** A fact and its event share a transaction from a closed catalogue (0032); a provider's
  webhook door keeps its delivery before its verdict (00336, `keepDelivery`, `resend-event.ts:84-92`); below the commit
  line everything is at least once and idempotent (0031's invariant 3).
- **Realtime.** A watched table carries three `workspace_tell_*` statement triggers and a row in `WATCHED`
  (`packages/db/src/realtime.ts:34-68`; 0019 rule 5; `database/each-workspace-is-told-what-changed.db.test.mjs`).
- **Erasure and tenancy.** Every personal column of a workspace table names a strategy
  (`packages/db/src/erasure-registry.ts`; the baseline may only fall); a new table gets no default grants (00339) and is
  proven by `database/tenancy.db.test.mjs` and `privileges.db.test.mjs`; each table has one door that writes it
  (`baselines/writers.json`; `mailboxes` has six writers today).
- **Secrets.** Every per-workspace credential is in Vault behind service-role definer functions
  (`put_channel_credentials`, `put_line_credentials`, `put_google_credentials`); a deployment's provider keys live on
  the edge alone, and a test holds that the dashboard never sees one (`google/google-profile.test.mjs:715-783`).

### 1.8 What production holds, and what to read before the cut

This document cannot read production. Before the cut (§4.12) three numbers are read and written into the decision
note: hosted mailboxes with any inbound email in the last 30 days (`mailboxes.last_received_at`); sending domains ever
verified, and cold emails ever sent (`messages` where `meta.source = 'reach_out'`; the runbook's "Turn on cold email"
checklist stands open, so the expected answer is none); offers sent from the campaigns domain. The spec's own read of
the live workspace on 7 October found one person with an email address
(`docs/superpowers/specs/2026-10-07-a-conversation-begins-from-the-inbox-design.md`, §0): the hosted identity has
almost nothing on it, which is what makes the cut cheap.

---

## 2. What the providers allow

Read on 9 October 2026; the links are Appendix C. Each number below is a vendor's or a third party's unless it says
Google's or Microsoft's; the ones the design rests on are re-read from the provider's own page before the part that
needs them is planned.

### 2.1 Why nobody sends cold email through a transactional provider

Resend's acceptable use policy, as a third-party copy has it, prohibits "mass, non-personalized, unsolicited messages"
and lists list brokers and list rental among prohibited content; a secondary source says it expressly prohibits
unsolicited cold outreach (C1, C2). Postmark and SendGrid say the same in their own words. The exposure is not a fine
print detail: the provider shuts the account, and the account is every workspace's.

### 2.2 Google Workspace and the Gmail API

- **Basic authentication is gone.** Since 14 March 2025, third-party apps reach Gmail, Calendar and Contacts by OAuth
  only; IMAP, SMTP, POP and CalDAV no longer take a password (Google's admin help, C3). App passwords survive as a
  legacy exception behind two-step verification. So there is no SMTP shortcut: the Gmail API by OAuth is the way.
- **Scopes and verification.** `gmail.send` is a sensitive scope (brand verification). `gmail.readonly` and
  `gmail.modify` are restricted: Google requires an independent CASA Tier 2 security assessment by an approved lab,
  renewed yearly, when the app stores or transmits that data through a server; vendors put the self-serve labs at about
  $540 to $1,000 a year and the whole verification at two to eight weeks; until it passes, the consent screen says
  "unverified" and the app is capped at 100 users (C4 to C6). There is no way to read replies in the mailbox without a
  restricted scope. Google's Limited Use policy then governs what the product may do with the data: only user-facing
  features, no ads, no human reading but for security, consent or aggregated use; the privacy page must say so.
- **Sending.** `users.messages.send` takes the whole RFC 5322 message, base64url-encoded, in `raw` (Google's guide, C7);
  a header written into the raw text, `List-Unsubscribe` or our own `Message-ID`, leaves with it. Google's quota page
  states a per-user limit of 15,000 quota units a minute and a send at 100 units (C8): far above any cap in this
  document. Quota errors come back 429 or 403 and are backed off. A Workspace user may send 2,000 messages a day (500 on
  a trial) to 10,000 recipients; past a limit the account cannot send for up to 24 hours (Google's limits page, C9).
- **Reading.** `users.watch` on a Pub/Sub topic delivers a push per mailbox change and must be renewed at least every
  seven days (Google recommends daily); `users.history.list` from a stored `historyId` lists what was added, in order,
  and answers 404 for a stale id, on which the app does a full sync; a `historyId` is usually valid for at least a week
  (Google's push and history pages, C10, C11).
- **Policy.** The Workspace acceptable use policy prohibits generating, distributing or facilitating "unsolicited mass
  email, promotions, advertisements, or other solicitations (spam)" (C12). Targeted, personalised, low-volume outreach
  with an honoured opt-out is what the whole category runs on Workspace, and the product's rules keep it there (§4.9);
  what Google enforces, by suspending a mailbox, is volume and complaints, which the caps and the holds are for.

### 2.3 Microsoft 365 and Graph

Delegated `Mail.Send` and `Mail.Read` (C13). `sendMail` takes a MIME message as well as a JSON one, so the same raw
message serves both providers. Change notifications on a mailbox's messages expire after at most 4,230 minutes (under
three days) on Microsoft's Outlook notifications page, 10,080 on one locale of the subscription reference (C14, C15):
the renewal clock is written for three days. Delta queries on a folder give a cursor-based pull as the backstop. A
mailbox may send 30 messages a minute and 10,000 recipients a day; a tenant's external recipients are capped at 500 ×
licences^0.7 + 9,500 a day (C16). Basic authentication for SMTP AUTH was retired, moved from September 2025 to March to
April 2026 (C17). A multi-tenant app needs publisher verification (an MPN account, no charge) or many tenants' users
cannot consent to it (C18). No CASA.

### 2.4 The receivers' rules

Google's and Yahoo's requirements for senders over 5,000 messages a day to their users (since February 2024): SPF and
DKIM, DMARC at least `p=none`, alignment of one of them with the From domain, a one-click unsubscribe (RFC 8058:
`List-Unsubscribe` with an https URL and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`) on marketing mail honoured
within two days, a spam rate under 0.3% and ideally under 0.1%, read in Postmaster Tools (C19, C20). Microsoft published
its own version for May 2025. The thresholds apply to bulk senders; the practice applies to everyone. A Workspace domain
whose admin never turned DKIM on signs with Google's default key, which does not align with the From domain and fails
DMARC: the single most common reason a small business's mail lands in spam, and the first thing the product checks
(§4.1). CAN-SPAM wants a physical postal address, an honest subject and a working opt-out honoured within ten business
days; the foot and the page already give the first and the last.

### 2.5 What Instantly, Smartlead and their kind do, and which of it is theirs

| They do                                                                          | Why                                                                                 | Here                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect by OAuth, Google and Microsoft; SMTP for the rest                        | Basic auth is gone at both                                                          | OAuth on the connection shape that exists; SMTP later, if a cohort needs it (Appendix B)                                                                 |
| A setup score per mailbox: SPF, DKIM, DMARC, a tracking domain                   | Alignment is what receivers score                                                   | SPF, DKIM, DMARC per mailbox, read every day and on Check, with the records to publish; no tracking domain (decision 8 of the Reach out spec stands)    |
| 25 to 30 cold emails a day per mailbox once warm, a ramp over two to four weeks  | The number every source converges on (C21 to C24)                                   | A ramp per mailbox, 10 → 20 → 30, ceiling 50 after 30 clean days, the owner may lower it and never raise it past the ramp (§4.4)                       |
| Secondary domains; never the primary                                             | One bad week must not poison the business's everyday mail                           | Guidance in the product, and a warning when the mailbox's domain is the business's own website's; not a refusal (§9, decision 6)                        |
| Verify every address first                                                       | Bounces over 1 to 2% get a mailbox throttled                                        | Built (bounceverify; `email_state = 'ok'`)                                                                                                               |
| Pause a mailbox on bounces or complaints                                         | The same                                                                            | Built per domain; carried per mailbox (§4.4). Complaints are not observable from a mailbox; unsubscribes and replies read as no stand in (D18)          |
| Read replies, out-of-office and bounces from the mailbox itself                  | A mailbox send has no provider receipts                                             | The sync (§4.5): push, then history or delta, through the intake that exists                                                                             |
| A warmup network                                                                 | Mailboxes trading mail look used                                                    | No (the Reach out spec's decision 10): Google detects it, and the ramp plus real use is the honest version                                               |
| Open and click tracking                                                          | Their customers ask for it                                                          | No (decision 8): Apple's privacy makes opens fiction, tracking links hurt placement, replies are the truth                                               |
| A unified inbox                                                                  | Replies land in many mailboxes                                                      | Built, and better: one thread per person, every channel                                                                                                  |
| Stop a sequence when the owner wrote to the lead themselves                      | The Sent folder shows what the sequence cannot                                      | New, cheap once the mailbox is read: the owner's own send to a lead stops the chain (§4.5)                                                               |

### 2.6 The verification cost, and the vendor shortcut

Nylas and its kind sell a unified mailbox API priced per connected account a month (public tiers from about $2 to $5;
C25, C26) and, on contract plans only, a "Shared GCP App" that lets a customer skip Google's verification and CASA
(C27). The shortcut is real and the trade is permanent: a fee per mailbox for ever, a vendor between every customer email
and the product, a vendor outage that is every workspace's email outage, and Chanlytics's own Google project still
needed for Business Profile. The direct route costs a yearly assessment, a few weeks of calendar once, and nothing per
mailbox; the OAuth client, the state signing, Vault and the admin door already exist. §3 recommends direct, with the
vendor as the fallback if the assessment stalls past eight weeks.

---

## 3. The honest comparison, and the decisions

### 3.1 Four shapes, side by side

| Shape                                                                                       | Deliverability                                              | Provider terms                                   | What the customer sees                           | Replies                                                | Blast radius of one bad tenant | Cost to Chanlytics                          | Cost to the business                           | Verification burden                | Time to the first cold send   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------ | ------------------------------ | ------------------------------------------- | ---------------------------------------------- | ---------------------------------- | ----------------------------- |
| **A. As built:** hosted mailbox, a campaigns domain, own domains on a cold Resend account   | Shared IPs; the business's domain reputation only for cold  | Cold outreach is a policy violation (§2.1)       | `name@mail.chanlytics.com`, and a Reply-To that is not the From | On a Chanlytics address, forwarded to nobody's inbox   | The cold account: everyone's   | Two Resend plans, five domains a workspace  | Nothing                                        | None                               | Days (the open checklist)     |
| **B. Hybrid:** connected mailbox for cold, hosted for the rest                              | Right for cold, wrong for everything else                   | Clean                                            | Two addresses for one business                   | Cold replies in Gmail, customer replies elsewhere      | The platform account for customer mail | One Resend plan, a CASA assessment    | Workspace seats for cold                       | CASA                               | Six to ten weeks              |
| **C. Recommended:** connected mailboxes only; one primary; several for cold                  | The provider's own, under the business's own domain         | Clean; the caps keep a mailbox inside Google's   | `hello@thebusiness.com`, always                  | In the business's inbox and the thread at once         | One mailbox, one business      | A CASA assessment, model calls; no mail plan | Workspace seats (one per 30 cold emails a day) | CASA, publisher verification       | Six to ten weeks, Google first |
| **D. C through a unified-API vendor**                                                       | As C                                                        | As C                                             | As C                                             | As C                                                   | The vendor: everyone's         | $2 to $5 a mailbox a month for ever         | As C                                           | None, on a contract plan           | Three to five weeks           |

C wins on every column that is the product's; D buys weeks with a permanent fee and a permanent dependency; B is C
with the wrong turn kept; A is what stands. A fifth shape, "the business's own domain on our ESP for everything" (the
HubSpot marketing model, the email plan's E4), is right for a marketing platform sending a million opted-in emails a
month and wrong for a receptionist writing to one person: it keeps cold mail on an ESP (§2.1) and keeps a second
identity.

### 3.2 Where the first sketch of this idea was incomplete

Said out loud so the design below is read with them in mind:

- "All email" had three hosted identities to retire, not two: the platform-wide campaigns domain carries offers
  (§1.1), which the first sketch missed.
- Two numbers die with the receipts: "delivered" and "complained". A mailbox send has no delivery receipt, and neither
  Gmail nor Microsoft gives a sender a per-message complaint. The reports say sent, bounced, wrote back, interested,
  booked, said no; the holds read unsubscribes, replies read as no, and bounces from delivery reports (§4.10).
- The intake's rule, "keep every email that reaches the mailbox", came from a hosted address that only customers ever
  wrote to. A real inbox holds the accountant, the newsletters and the suppliers. The sync needs one planner that says
  what is kept (§4.5), and the receptionist's draft needs the same planner to know whom to answer.
- The ESP model could never see what the owner sent from Gmail themselves. The mailbox model can: the Sent folder stops
  a chain the owner has taken over by hand, and puts the owner's own email to a known person on the person's thread.
- Volume is per mailbox and the arithmetic is the business's: 150 cold emails a day is five Workspace seats on a spare
  domain. That is the industry's shape, and the right place for the cost.
- Microsoft is a second provider with its own verification, its own notification shape and its own limits; it comes
  second and is designed for from the start, so nothing in the mailbox's shape says Google.

### 3.3 Decisions

Recommended, numbered; Ruben confirms in §9. Each names the smallest change.

1. **The workspace's email identity is a mailbox the business connects**, Google Workspace by the Gmail API or Microsoft
   365 by Graph, by OAuth, in Settings › Connections. No hosted address is made again once Connect ships; the ones that
   exist are retired by a dated cut (decision 13). No SMTP or IMAP.
2. **Several mailboxes per workspace, one primary.** The primary carries the receptionist, the Inbox, visit messages and
   offers; any mailbox may be a reach-out's sender when it is on the business's own domain and its records read good.
   At most five (as the sending domains were).
3. **Every email leaves through a connected mailbox, through the one door, on one lane.** The purpose still decides the
   rules; it no longer decides the carrier. The request's From names the mailbox; a request whose From is no connected
   mailbox's is refused in words.
4. **The product mints the Message-ID and the headers, and reads back what left.** `Message-ID: <uuid@mailbox-domain>`
   at the freeze, `List-Unsubscribe` and one-click on marketing and cold mail, `X-Chanlytics-Message` on everything, no
   Reply-To (replies go where the From is). A send's outcome is the provider's accept; a timed-out send is settled by
   the Sent folder, never retried blind.
5. **Replies, bounces, automatic replies and the owner's own sends are read from the mailbox**, by push with a pull as
   the backstop, and taken through the intake that exists (`email_ingest`, `ingestEmail`, `resolve_person`,
   `reply_read`, `booking_read`). One pure planner decides what is kept: a known person's email always; a reply to
   something the workspace sent always; a stranger's only on a mailbox set to take strangers (the primary by default);
   automated mail never; the owner's own send to a known person as the owner's words, never making a person.
6. **A cold reach-out needs a sender mailbox on the business's own domain whose SPF, DKIM and DMARC the product has
   read as good**, aligned with the provider's own DKIM selector. Free mail (`@gmail.com`, `@outlook.com`) may be a
   primary mailbox and may never send cold. The product warns, and does not refuse, when the sender's domain is the
   business's own website's.
7. **The mailbox's day replaces the domain's day.** A cold ramp per mailbox of 10 → 20 → 30 a day by days actually sent
   (D15 kept), a ceiling of 50 after 30 clean days, an owner's cap that may only lower it; the step's gap and the lead's
   hours unchanged; a provider guard of 1,500 a day for all mail from a mailbox; one in flight per mailbox; a 2.5-second
   gap between a Microsoft mailbox's sends. Replies and a person's own words are never held by the product's caps, only
   by the provider's.
8. **Reputation holds move to the mailbox and keep D18's shape:** bounces or unsubscribes over 2% of the last 500 sent
   (over 3 while fewer than 150 have gone), a reply read as no counted beside them, a provider's day refusal, revoked
   credentials; a hold lifts itself when its cause does (records, revocation) or waits for Resume (reputation); a second
   reputation hold in 30 days is the platform's to lift (D16 kept).
9. **Delivered and complained leave the reports.** Written, bounced, wrote back, interested, booked, said no stay;
   "landed" is written and not bounced. Campaigns' per-channel report counts email delivered as landed; 0030's note gains
   the line.
10. **Campaigns is universal because the carrier is one.** Readiness for email is "a primary mailbox connected, its
    records good, not held"; offers need the same plus the postal address; the head says the address and the day; one
    words rule for an email (subject at most 80, body at most 2,000 characters) with the cold rules layered on it; a
    reach-out run says `channels = {email}`; a provider's day refusal holds a run's email people until tomorrow instead
    of stopping the run.
11. **The receptionist answers email from the primary mailbox, in draft mode first**, as the PRD of 24 September's W3a
    designed it (its decision 2), with `mailboxes.reply_mode` finally read, and veto or auto only on a mailbox whose
    records read good; an owner's first email and Ask's draft go from the primary; booking notices are read natively and
    the forwarding path retires.
12. **Google first and direct, Microsoft second.** A second Google Cloud project for the mail scopes, so the Business
    Profile app's verification is not entangled; the consent screen, the OAuth client and the Pub/Sub topic in it; the
    verification and the CASA assessment started in the first week, in parallel with the build, with the 100 test users
    as the build's room; the vendor route only if the assessment stalls past eight weeks. The Entra registration and
    publisher verification started the same week.
13. **The hosted mailbox, the campaigns domain, the cold account and `sending_domains` retire by a cut**, on a date Ruben
    sets once every live workspace with inbound email in the last 30 days has connected a mailbox; until then the hosted
    lane keeps those workspaces' mail flowing and the Connections row says the date. The platform's own mail to members
    stays on Resend, untouched.
14. **A workspace with neither provider has no email channel**, and Connections and Setup say so plainly. Nothing hosted
    is offered in its place.

---

## 4. The design

Each section says contracts · core · db · jobs · edge · dashboard · events · tests · deploy order where they apply.
"None" is said out loud. The recipes are `CLAUDE.md`'s canonical table; a new door follows 00129's and 00070's shapes;
a new job kind arrives as the rule says; a new watched table as 0019 says; a new column names its erasure strategy.

### 4.1 The object: a connected mailbox

`mailboxes` stays the table and the word; what changes is who hosts it. The glossary's row becomes "the business's own
email account, connected by its owner; one is primary".

- **db (one migration, the next free number above 00359).** Columns added, every one nullable or defaulted so the
  deployed edge keeps working: `provider text check (provider in ('google','microsoft'))`, `address text` (lower-case,
  the mailbox's own), `domain text` (its host), `is_primary boolean not null default false`, `state text not null
  default 'connected' check (state in ('connected','held','disconnected'))`, `held_why text check (held_why in
  ('records','bounces','unsubscribes','provider','revoked'))`, `held_at`, `resume_by text check (resume_by in
  ('owner','platform'))`, `provider_user_id text`, `scopes text[]`, `credentials_ref text`, `connected_by uuid`,
  `connected_at`, `disconnected_at`, `sync_cursor text` (Gmail's `historyId`, Graph's delta links as JSON), `watch_id
  text`, `watch_expires_at`, `synced_at`, `sync_error text`, `dns jsonb` (what was read: spf, dkim, dmarc, each with its
  record and verdict), `dns_state text not null default 'unread' check (dns_state in ('good','missing','unread'))`,
  `dns_checked_at`, `takes_strangers boolean not null default true`, `cold_cap int check (cold_cap between 1 and 50)`,
  `clean_since`, `counted_since`, `sent_days int not null default 0`, `sent_recent int not null default 0`,
  `bounced_recent int not null default 0`, `unsubscribed_recent int not null default 0`, `said_no_recent int not null
  default 0`. `local_part`, `reply_token`, `reply_token_prev` and the four `forward_confirm_*` columns become nullable
  now and are dropped at the cut (§4.12). `mailboxes_tenant_uq` is dropped; `mailboxes_address_uq (address)` (one
  business's mailbox is one workspace's), `mailboxes_primary_uq (tenant_id) where is_primary`, and a five-per-workspace
  trigger (00175:64-80's shape) take its place. The three `workspace_tell_*` triggers go on (0019); `WATCHED` gains
  `mailboxes` in the same change. Grants as 00339 asks. The erasure registry registers every column of the table: the
  address, the name, the cursor, the errors and the credentials reference are the workspace's own (`not_personal`), and
  the baseline falls by the five it holds today.
- **Doors (SQL, `security definer`, the 00129 shape with `caller_has_permission(…, 'settings')`):** `mailbox_connect`
  (the service role's: upserts by `(tenant_id, address)`, revives a disconnected row, sets the first mailbox primary,
  writes `mailbox.connected`), `mailbox_disconnect` (owner or partner; the edge revokes first), `mailbox_set_primary`,
  `mailbox_set_reply_mode` (owner; the PRD of 24 September's door), `mailbox_set_cold_cap` (owner; refuses a value
  above the ramp's), `mailbox_set_takes_strangers`, `mailbox_hold` and `mailbox_resume` (the service role's and the
  owner's; `heldTwice`'s rule, 00188, carried). Vault: `put_mailbox_credentials(p_tenant_id, p_mailbox_id, p_secret)`,
  `get_mailbox_credentials`, `drop_mailbox_credentials`, the 00070 shape, the secret named `mailbox-creds-<mailbox
  id>`, execute revoked from everyone but the service role. Reads: `mailbox_capacity(p_mailbox_id, p_now)`
  (`sending_domain_capacity`'s shape, counting cold sends by the mailbox's address in the request's From and claims by
  `mailbox_id`), `mailbox_counts(p_mailbox_id)` (`sending_domain_counts`'s shape by address: sent, bounced,
  unsubscribed, said no over the last 500 that left), `mailbox_day(p_mailbox_id)` (all mail that left the address in the
  rolling day, for the provider guard). `create_mailbox` is re-created to refuse with "Connect your mailbox instead"
  while the hosted lane winds down, and dropped at the cut. With these, `mailboxes`' writers fall from six to the doors.
- **contracts (`packages/contracts/src/email/mailboxes.ts`, replacing `sending-domains.ts` at the cut):**
  `MailboxDto` (no token, no reference), `MAILBOXES_MAX = 5`, `MAILBOX_COLD_RAMP` and `mailboxDailyCap(sent_days)`
  (10 from day 0, 20 from 7 sent-days, 30 from 14, 50 from 30), `PROVIDER_DAY = 1500`, `PROVIDER_GAP_MS = {google: 0,
  microsoft: 2500}`, `reputationHoldOf` (carried), `judgeDns(provider, records)` (SPF includes the provider's include,
  `_spf.google.com` or `spf.protection.outlook.com`; DKIM's selector published, `google._domainkey` or `selector1` and
  `selector2._domainkey`; DMARC at the host or a parent), the records table and the words (`dnsRecordRows`, the
  provider's own admin-console steps in one sentence each), `mailboxWords` (connected as, held and why, the day: "12 of
  30 cold today · 41 sent"), `mayPickForColdOf(mailbox)` (own domain, dns good, not held, connected), `MailboxReadyFor`
  (`receptionist | offers | cold`), the refusals' words.
- **Erasure, tenancy, writers:** as above. **Events:** `mailbox.connected {provider, domain}`, `mailbox.disconnected`,
  `mailbox.held {why}`, `mailbox.resumed {by}`, `mailbox.primary_set`, in the catalogue with their schemas (0032).
- **Tests:** `email/mailboxes.db.test.mjs` (the constraints: one address one workspace, one primary, five at most, the
  nullable hosted columns), `email/mailbox-doors.db.test.mjs` extended (who may, the Vault functions' privileges, the
  revive on reconnect), `email/mailboxes.test.mjs` (contracts: the ramp, the DNS judge over a fixture per provider and
  per failure, the words), the erasure registry and completeness suites, the realtime watched-table test.

### 4.2 Connecting

- **Google.** `GET /api/v1/mailboxes/connect?provider=google` (role partner, the settings permission, rate `google_link`;
  `startMailboxConnect`, beside `startGoogleConnect`) signs the state `{t, u, n, exp, p: 'google'}` and answers a 302 to
  Google's authorize URL with the scopes `openid email https://www.googleapis.com/auth/gmail.send
  https://www.googleapis.com/auth/gmail.readonly`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=false`
  and the caller's address as `login_hint`. `authorizeUrl` takes a scopes argument (today it sends `PROFILE_SCOPES`
  unconditionally, `google-oauth.ts:32-49`). The client is a second one, `GMAIL_OAUTH_CLIENT_ID`,
  `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI` (`https://app.chanlytics.com/api/v1/mailboxes/callback`) and
  `GMAIL_OAUTH_AUDIENCE`, in the second Google Cloud project (decision 12), each a getter in `apps/edge/lib/env.ts` and
  a line in `.env.example`; the dashboard holds only the state secret it already holds. `GET /api/v1/mailboxes/callback`
  does what `googleCallback` does (`google-actions.ts:40-79`) and calls the edge's `/api/admin/mailboxes` with `{op:
  'connect', provider: 'google', code}` over `callEdge`. The edge (`apps/edge/lib/mailboxes/connect.ts`, the
  `profile-connection.ts` shape) exchanges the code, requires both Gmail scopes and a refresh token (else revokes and
  answers `scope_missing` or `no_refresh_token`), reads `users.getProfile` (the address and the current `historyId`),
  refuses an address another workspace holds (`taken`), writes the row through `mailbox_connect`, stores the grant in
  Vault, restores the prior row on a Vault failure as the Google connect does (`:147-171`), reads the DNS once, starts
  the watch (`users.watch` on `GMAIL_PUSH_TOPIC`, the expiry and the `historyId` recorded as the cursor), and answers
  the outcome; the dashboard redirects to Connections with `?mailbox=<outcome>`, whose words are `MAILBOX_CONNECT_WORDS`.
  A reconnect is the same flow; a disconnect (`DELETE /api/v1/mailboxes/[id]`) revokes at Google, stops the watch,
  drops the secret, and marks the row `disconnected` (it keeps its history and its sends' foreign keys).
- **Microsoft (M3b).** The twin: `packages/channels/src/microsoft/microsoft-oauth.ts` (`login.microsoftonline.com/common`,
  scopes `openid email offline_access User.Read Mail.Send Mail.Read`), `MS_OAUTH_CLIENT_ID`, `MS_OAUTH_CLIENT_SECRET`,
  `MS_OAUTH_REDIRECT_URI`, `MS_GRAPH_NOTIFY_SECRET`; the edge reads `/me` for the address and id, creates one change
  subscription on `/me/messages` with a `clientState` that is an HMAC of the mailbox id under `MS_GRAPH_NOTIFY_SECRET`
  (stateless to verify), and takes the inbox's and the sent folder's delta links as the cursor. A tenant that requires
  admin consent answers with Microsoft's error, and the row's words say what to ask the admin.
- **Connections › Email, redrawn** (`apps/dashboard/src/surfaces/settings/connections/mailboxes-block.tsx` in the
  domains block's place): two doors, "Connect Google Workspace" and "Connect Microsoft 365", with the audience words
  the Google row already has while an app is unverified; then one row per mailbox: the address, "Primary" or "Sends
  reach-outs", the provider, connected as whom and when, the DNS score as three pills (SPF · DKIM · DMARC) with the
  records table and Check under them when one is missing, the day ("12 of 30 cold today · 41 sent"), the hold and its
  Resume, the reply mode (M6), "Takes strangers", the cold cap, Make primary, Disconnect. The words are contracts'. The
  Email row's own line becomes the primary's address or "Connect your mailbox"; `EmailSetupDto` becomes `{ready,
  mailboxes: MailboxDto[], primary_id}` and the routes in the refresh map (`refresh-map.ts:252-259`) follow. Realtime
  repaints it (the table is watched now). PREFETCH: Settings' entry is unchanged (the pane reads `setup`).
- **Setup.** The email row says "Connect your mailbox" (not started, never required) or the primary's address (ready);
  `EMAIL_NOT_ANSWERED_SENTENCE` stays until M6 and goes with it.
- **Routes** (each a row in `route-policy.json`, the client regenerated, `docs/api.md` regenerated): `GET
  mailboxes/connect`, `GET mailboxes/callback` (scope account), `DELETE mailboxes/[id]`, `PUT mailboxes/[id]` (the
  name, `takes_strangers`, `cold_cap`, `reply_mode`), `POST mailboxes/[id]/check`, `/resume`, `/primary`. `POST
  mailboxes` (the hosted create) answers the refusal until the cut, then goes.
- **Tests:** `email/mailbox-connect.test.mjs` (the edge op over a stubbed token endpoint and profile: scopes refused,
  no refresh token refused, an address taken refused, the row and the secret written, the watch started, the Vault
  failure restoring), `email/mailbox-routes.test.mjs` (the policies, the state's person is the caller, the redirect
  outcomes), `connections/connections.test.mjs` (the rows), the Google door test's "the dashboard never sees the
  secret" case repeated for the mailbox.
- **Deploy order:** the migration first, then either app; a dashboard ahead of the edge gets `edge_unavailable` from
  the connect op and says so, as the Google connect does on a preview.

### 4.3 The wire

- **channels.** `packages/channels/src/email/mime.ts`: a pure builder from `EmailRequest` to an RFC 5322 message:
  `From`, `To`, `Subject` (RFC 2047 where needed), `Date`, `Message-ID` (the request's own), `In-Reply-To`,
  `References`, `MIME-Version`, `Auto-Submitted`, `List-Unsubscribe`, `List-Unsubscribe-Post`, `X-Chanlytics-Message:
  <message id>`, then `multipart/alternative` with `text/plain` and `text/html`, each `quoted-printable`, UTF-8; and
  `base64url` or `base64` of it for the transport. Hand-rolled, as the ICS reader and the phone formatter are, and
  proven by a round trip through a small reader beside it. `packages/channels/src/google/gmail.ts`: `sendRaw(token,
  raw)` → `{id, threadId}`, `getProfile`, `watch(topic)`, `stopWatch`, `historyList(startHistoryId, pageToken)`,
  `messageGet(id, format)`, `messagesList(q)`, over `providerFetch` with the breaker, and `gmailLimitOf(status, body)`
  mapping `rateLimitExceeded` and `userRateLimitExceeded` to `rate`, `dailyLimitExceeded` and the sending-quota
  refusal to `daily`, `401 invalid_grant` on refresh to `revoked`. `packages/channels/src/microsoft/graph-mail.ts`: the
  same verbs (`sendMime`, `me`, `subscribe`, `renew`, `delta`, `messageGet`, `messagesByInternetMessageId`), with
  `graphLimitOf` (429 and `Retry-After` → `rate`, `ErrorSendQuotaExceeded` and `MessageSubmissionExceededLimit` →
  `daily`). `buildEmailRequest` mints the Message-ID when the identity is a mailbox's (`<uuid@domain>`), and
  `mailboxIdentity(mailbox)` joins `identity.ts`: From `"<from_name>" <address>`, no Reply-To. `tokens/` is unchanged.
- **core.** `EmailRoute.lane` gains `mailbox` and `cfg` the mailbox's `{provider, mailboxId}`; the route's `as` is the
  mailbox's identity; `emailSender` matches the request's From against the routes as today (`wire-senders.ts:160`) and
  no longer chooses a lane by purpose: a `mailbox` route is taken whenever one matches, the three old lanes stand only
  for a From that is a hosted or campaigns address, until the cut. The transport call is made through a port the edge
  binds per mailbox (the token read and refreshed by `tokenFor`'s twin). The outcome of a send is the provider's accept:
  `external_id` the provider's message id, `meta.email.message_id` already known. A timeout stays `unknown` (as today,
  `deliver.ts`'s unknown outcome) and is settled by the sync (§4.5), never re-posted: there is no idempotency key at a
  mailbox, and the claim before the wire (00352) is the guard. New refusals in `DELIVERY_REFUSALS` with their words:
  `email_needs_mailbox` (the From is no connected mailbox's), `mailbox_not_ready` (held, disconnected, records
  missing), `mailbox_at_cap` (a wait: the cold cap or the provider's day), `mailbox_revoked`; `outreach_needs_own_domain`,
  `sending_domain_not_ready` and `sending_domain_at_cap` keep their rows until the cut and their words name the mailbox.
- **Who freezes which From.** One function in contracts, `mailboxFor(purpose, thread, mailboxes)`: outreach takes the
  send's own sender mailbox (the chain's pick); a reply takes the mailbox the thread last left from, if it is connected
  and not held, else the primary, and the composer says which before Send (N5 kept, simplified: `replyIdentityOf` and
  the twin go); everything else takes the primary. The dashboard's `freezeReply` and `freezeFirst`, the jobs'
  `emailRequestPort` and the edge's `reach-out/request.ts` call it; `meta.email.own_request` is written no more;
  `left_as` keeps its stamp as the address the email left from, for the Inbox's bubble words.
- **edge.** `emailWireFor` builds one `mailbox` route per connected, unheld mailbox (`mailboxesOf(db, tenantId)`), the
  hosted and campaigns routes beside them while they last, the own routes no more once M4 lands; an unreadable
  `mailboxes` read is `WireUnavailable` as the domains' is (`email.ts:133-136`). `/api/admin/email/wire` answers
  `{ready, offers, cold, mailboxes: [{id, address, state, dns_state, is_primary}]}`.
- **Tests:** `email/mime.test.mjs` (the builder: every header, the twin, encodings, a round trip), `email/gmail.test.mjs`
  and `email/graph-mail.test.mjs` (each verb over a stubbed fetch, the limit mapping, a revoked refresh),
  `email/email-wire-routes.test.mjs` extended (a mailbox route per mailbox, a held one left out, the From match),
  `messages/deliver.test.mjs` extended (the new refusals, the mailbox lane, a timeout left unknown).
- **Deploy order:** either. A dashboard ahead of the edge freezes a mailbox identity the edge cannot route; the edge's
  `emailSender` answers `request_leaves_as_another_sender` today for an unknown From, which a reply's row says in words
  and a queued row keeps; so the dashboard freezes a mailbox's From only when the edge's `/api/admin/email/wire` has
  said that mailbox is ready, and the hosted From otherwise, until the cut.

### 4.4 The mailbox's day

- **The cold cap** is `mailboxDailyCap(sent_days)` over `mailbox_capacity`: what left the address as a cold email in the
  rolling 24 hours, plus what is claimed and queued; `sent_days` counts the UTC days the mailbox sent cold since
  `clean_since` (D15). An owner's `cold_cap` lowers it. The step's `gap_minutes` and the timetable's jitter stand.
- **The provider guard** is `PROVIDER_DAY` over `mailbox_day`: every email that left the address in the rolling day,
  the owner's own excluded (the product cannot see those until the sync does, and does not count them). A send over it
  is `mailbox_at_cap`, a wait refusal (C5's rule): a reach-out send is planned again for the next open moment; a
  broadcast's email people are held to tomorrow and the run goes on for the others (`emailRunStop`, `broadcast-stops.ts`,
  becomes a hold, not a stop); a reply is never refused by the product's own counts, and a provider's `daily` answer
  holds the mailbox (`held_why = 'provider'`) until the day turns, lifting itself.
- **Order on one mailbox** is not a scheduler: replies and a person's own words have no product cap; visit messages
  and offers have the campaigns allowance and the provider guard; cold email has its own cap. The three never contend
  for the same count.
- **Concurrency.** Every email job names `capacity: ["mailbox:<id>"]`, and `job_capacity` gains the scope `mailbox`
  with `max_in_flight = 1` per connected mailbox (written by `mailbox_connect`), so the claim never runs two sends
  from one mailbox at once (Graph refuses a second concurrent app call on a mailbox; Gmail does not care). A Microsoft
  mailbox's batch sender waits `PROVIDER_GAP_MS` between sends (30 a minute is the limit).
- **Holds.** The `mailboxes` sweep re-reads `mailbox_counts` on each tick and applies `reputationHoldOf` as the domains
  sweep does (`sending-domain-check.ts:66, 168`); `held_why = 'bounces' | 'unsubscribes'` wait for Resume,
  `heldTwice` pages the platform; `records` lifts itself when the DNS reads good; `revoked` when a reconnect lands;
  `provider` when the day turns. The owner is told once per hold (`sayDomainChange`'s shape) and once on resume.
- **A nightly keep** copies each mailbox's counters into `mailbox_days` (00314's shape, re-keyed) so Reports can say a
  mailbox's history after the counters move on; `sending_domain_days` keeps its rows until the cut.
- **Tests:** `reach-out/reach-out-doors.db.test.mjs` re-keyed (one capacity per mailbox, the lock), a new
  `email/mailbox-day.db.test.mjs` (the provider guard, the owner's cap, the nightly keep), `jobs/jobs-lanes.db.test.mjs`
  and the capacity suite extended for the `mailbox` scope, `broadcasts/core-broadcast.test.mjs` for the hold-not-stop.

### 4.5 Reading the mailbox

- **Push doors.** `apps/edge/api/gmail-push.ts`, a `door()` for Pub/Sub's push: it verifies the bearer token Google
  signs for the push subscription (an OIDC token, RS256, checked against Google's published certificates with Web
  Crypto in a new `packages/channels/src/google/google-id-token.ts`, audience the door's URL, issuer Google, the
  subscription's service account as the email) and the `GMAIL_PUSH_TOKEN` in the URL as the second lock; keeps the
  delivery in the intake ledger (00336, `keepDelivery`'s shape); reads `{emailAddress, historyId}` from the message's
  data; finds the connected Google mailbox by address; schedules once `{kind: 'mailbox_sync', payload: {mailbox_id}}`
  under the dedupe key `mailbox_sync:<id>` (a burst of pushes is one job); answers 204 at once. Nothing is read in the
  request. `apps/edge/api/graph-notify.ts`: the validation handshake (`?validationToken=` echoed as text within ten
  seconds), then each notification's `clientState` verified against the HMAC, the same job scheduled once per mailbox,
  202. Both doors are in `LOG_EVENTS` and `EDGE_ERROR_CODES` as the webhook doors are, and `edge/request-id-doors.test.mjs`
  runs them.
- **The job.** `mailbox_sync` (a job kind: handler `packages/jobs/src/mailbox-sync.ts`, the CHECK, lane 0, the dedupe
  key, its callers the two doors and the sweep): it reads the cursor; for Google, `history.list` from it, pages
  through, and for each message added with the `INBOX` or `SENT` label and without `SPAM`, `TRASH` or `DRAFT`,
  schedules once `{kind: 'email_ingest', payload: {mailbox_id, received_id: <gmail id>, folder}}` (the kind that exists;
  `jobs_email_ingest_uq` already holds one live job per mailbox and id); then writes the new cursor. A 404 on the
  cursor is a full resync: `messages.list` newer than `synced_at` minus a day, the same scheduling, and a fresh
  `historyId` from `getProfile`. For Microsoft, the inbox's and the sent folder's delta links, the same way. The job
  runs twice without harm (0031's invariant 3): the dedupe index and the cursor make it so.
- **The intake's fetch port** per provider: Google `messages.get(format=full)` is already parsed (headers, parts, bodies
  base64), Graph's message with `internetMessageHeaders`, `body`, `uniqueBody` and the attachments' metadata too, so no
  MIME reader is needed for inbound; a pure `incomingEmailOfGmail` and `incomingEmailOfGraph` beside `incomingEmailOf`
  build the same `IncomingEmail` the intake takes, with `received_for` the mailbox's address and the sender's proof read
  from the message's own `Authentication-Results` header (`authResultsOf`, replacing Resend's verdict in
  `senderAuthenticated`, `intake.ts:215-220`: DMARC pass, or DKIM pass with DMARC absent).
- **The planner.** `planMailboxIntake(message, mailbox, facts)` in `packages/core/src/messages/mailbox-intake.ts`, pure,
  called by `ingestEmail` first: given `classifyReceived`'s claim, the folder, whether the From is the mailbox itself, a
  member, a known person (through `resolve_person`'s lookup, never a write), whether In-Reply-To or References name a
  Message-ID the workspace sent, and `takes_strangers`, it answers one of: `our_own` (settle an unknown outcome to
  `sent` when the row is unknown or failed by timeout, else drop), `own_sent` (the owner's own email from the mailbox
  to a known person: recorded on the person's thread as the member's words, direction out, `meta.source = 'mailbox'`,
  through no door since nothing is sent; a lead the chain is writing to is stopped as `wrote_by_hand`, a new fact in
  `outreach_lead_facts` and a new stop reason beside `owner_stopped`; to a stranger: dropped), `report` (the delivery
  report path), `booking_notice` (as today), `reply` (a known person, or a thread match: kept as today, the reach-out
  reading asked as today), `stranger` (kept only when `takes_strangers`, else dropped and counted), `automated` and
  `auto_reply` (as today), `dropped`. Every drop is a log line, never a row.
- **Delivery reports.** `packages/channels/src/email/dsn.ts`, pure: from a report's `message/delivery-status` part and
  the original's headers in its `message/rfc822` part (Gmail's and Exchange's both carry them), `{original_message_id,
  final_recipient, action, status, diagnostic}`; `action = failed` with a `5.x.x` status is a permanent bounce,
  `delayed` with `4.x.x` nothing. `applyEmailReceipt`'s bounce branch runs on it: `recordEmailStatus failed`,
  `suppressEmailOf` (hard bounce), `leadAddressBounced`, the mailbox's `bounced_recent`. Everything downstream (the
  followers' `bounced`, the reports, the lead's address) is unchanged.
- **The sweep.** `apps/edge/api/cron/mailboxes.ts`, `sweepDoor({sweep: 'mailboxes'})`, every fifteen minutes, requested
  only while a connected mailbox exists (00175:104-117's shape), registered with a `max_silence` of 50 minutes, a
  **reconcile** clock in `_clocks.mjs` ("renews each mailbox's watch, re-reads its records and its counts, and pulls
  what a push missed"): renews Google watches whose expiry is within two days, Microsoft subscriptions within twelve
  hours; re-reads DNS daily and on Check; applies the holds; schedules `mailbox_sync` for any mailbox not synced in ten
  minutes (the backstop for a lost push); and runs the unsubscribe-link probe the domains sweep ran
  (`unsubscribe-probe.ts`). Twenty mailboxes a tick, under the 30-second budget.
- **Events:** `mailbox.synced` is not written (a reconcile, not a fact); `message.*` events are the intake's as today.
- **Tests:** `email/mailbox-sync.test.mjs` (the handler over a stubbed provider: a page of history, the labels'
  filter, one ingest per message, the cursor written, the 404 resync, twice is once), `email/gmail-push-door.test.mjs`
  and `email/graph-notify-door.test.mjs` (the token verified over a recorded certificate fixture, the handshake, the
  delivery kept, scheduled once, 204), `email/mailbox-intake.test.mjs` (the planner over twenty fixtures: a Gmail DSN,
  an Exchange NDR, a Gmail and an Outlook out-of-office, a newsletter with `List-Unsubscribe`, a booking notice, a
  stranger on a primary and on a sender mailbox, the owner's own send to a lead, to a customer, to a stranger, our own
  send coming back with and without an unknown outcome), `email/dsn.test.mjs`, `email/email-intake.test.mjs` extended
  (`authResultsOf`, the two incoming shapes), `cron/cron-mailboxes-door.test.mjs`, `clocks/clock-kinds.test.mjs` (the
  new clock classified), and the double-delivery harness for `mailbox_sync`.
- **Deploy order:** the migration, then the edge (the kind's handler rides its dist), then the dashboard; a push that
  arrives before the edge knows the kind is kept and alarmed by the ledger as an unknown kind is (24 hours).

### 4.6 Reach out on mailboxes

- **db (one migration):** `reach_out_sends.mailbox_id uuid`, a composite FK `(tenant_id, mailbox_id)` on delete set
  null and the due index on it; `playbooks.mailbox_ids uuid[] not null default '{}'` (empty is every eligible sender
  mailbox); `domain_id` and `domain_ids` kept nullable until the cut. Re-created, each in place of its domain twin:
  `reach_out_plan_run` (takes `mailbox_id`; writes `broadcasts.channels = '{email}'`), `reach_out_claim` (the lock
  `'reach_out_claim:' || mailbox_id`, room from `mailbox_capacity`, a mailbox that must be connected, own-domain, dns
  good and unheld), `reach_out_due_mailboxes`, `outreach_facts(p_from_address)` (the mailbox's state, dns, clean_since,
  sent_days by address), `reach_out_save` (validates `mailbox_ids` as the workspace's), `reach_out_report`,
  `reach_out_search_lines`, `reach_out_lead_timeline` (the address in the host's place; `delivered` and `complained`
  columns gone, `unsubscribed` and `said_no` by mailbox in their place), `reach_out_chain_report` (no `delivered`).
  `reach_out_hand_run` writes `channels = '{email}'` too (00228:338-342).
- **contracts:** the timetable's `domains` input is renamed `senders` (the shape is the same); `reachOutSendsFrom`
  becomes `mayPickForColdOf`; `REACH_OUT_DOMAINS_MAX` → `REACH_OUT_MAILBOXES_MAX = 5`; the sheet's and the approval
  block's words say the address; the report's words drop delivered and complained; `reachOutStripOf` says "from
  sam@…"; `PURPOSE_REFUSALS` gains the four new refusals' words.
- **core:** `runReachOut` takes `ports.senders` (the chain's eligible mailboxes with `{id, cap, recent}`) and holds
  `no_sender` where it held `no_domain` (`run-reach-out.ts:64-65`); `outreachFacts` passes the From address.
- **edge:** `sender.ts` claims per mailbox (`CLAIM_PER_MAILBOX_PER_TICK = 5`, `mailboxDailyCap`), reads the mailbox for
  a claimed send, plans again a send whose mailbox is held or disconnected (C5), freezes the request with
  `mailboxIdentity` and no Reply-To (`request.ts`), and `mailboxLane()` replaces `coldLane()`: 503 `mailbox_lane_unset`
  names `UNSUBSCRIBE_SECRET` and the provider client variables while a send is due; `check-sweep.ts` the same;
  `replan.ts` and `run-context.ts` read mailboxes. `cold-receipts.ts` retires with the cold account (nothing owes a
  receipt). The day's numbers and the held notice are unchanged.
- **dashboard:** `chainsOf` reads the workspace's eligible mailboxes; the sheet's `RoFrom` lists them ("Every mailbox
  that may send cold", then one switch per mailbox: `sam@spare-domain.example · SPF DKIM DMARC good · 12 of 30 today`),
  refuses Start with none, and says why a mailbox is not offered (free mail, records missing, held, the primary on the
  business's own website domain with the warning of decision 6); the approval block's share sums the chain's mailboxes'
  caps; the Leads strip and the peek say the address; the owner's reply on a reach-out thread leaves from the mailbox
  that wrote (§4.3). The Reach-outs lens draws "By mailbox" where it drew "By domain".
- **Tests:** every `reach-out*/` suite that named a domain re-keyed (the maps list 63 files; most change a fixture
  column), `reach-out.integration.db.test.mjs` and `replies.integration.db.test.mjs` on a stack with a stubbed Gmail
  (the stub answers `send`, `history`, `get` and `watch` from the test's own store), `reach-out-sheet-page.test.mjs`
  for the picker's words.
- **Deploy order:** the migration first (additive; the domain columns stay readable), then either app: a dashboard
  ahead of the edge saves `mailbox_ids` the old edge ignores and keeps offering domains until the edge answers
  mailboxes; an edge ahead of the dashboard claims by mailbox for a chain whose `mailbox_ids` is empty, which means
  every eligible one.

### 4.7 Campaigns, universal

- **Readiness is one predicate.** `channelsReady`'s email branch (`reach-for.ts:167-204`) and `OFFER_GATES`
  (`email-offers.ts:40-43`) read the edge's `/api/admin/email/wire` answer: email is ready when a primary mailbox is
  connected, its records good and it is not held; offers when that and the postal address hold. The campaigns domain's
  gate, `campaignsBinding` and `judgeOfferGates`' domain check go; `email_marketing_disabled`'s words say "Connect a
  mailbox on your own domain to send offers". The head's channel line (`parts/channels-line.tsx`) says the address and,
  when held, why; `playbookChannelsRead` is unchanged.
- **Offers and visit messages leave from the primary.** `emailRequestPort` (`broadcast-send.ts:120-157`) freezes
  `mailboxIdentity(primary)` for every email, offer or not; the foot's kinds are unchanged; `CAMPAIGN_EMAIL_TAG` stays
  in the frozen request's `tags` (`isCampaignEmail` reads the row, not the wire). A provider's `daily` holds the email
  people to tomorrow (§4.4).
- **One words rule.** `EMAIL_SUBJECT_MAX` 60 → 80 and `EMAIL_BODY_MAX` 2,000 stand for every email version;
  `validateReachOutWords` is `validateEmailVersion` plus `coldEmailRules` (120 words, one link, no line in capitals,
  known slots); `save_template_version` is re-created with the one bound (its CHECK at 00296:64-76). Decision 10; a
  minor one for Ruben in §9.
- **Pacing.** `BROADCAST_CHUNK` and `GAP` stand; an email batch on a Microsoft mailbox waits `PROVIDER_GAP_MS`; the
  provider guard is read at the head of each batch beside `offersAtTheHead`.
- **The Library and the drawer** are unchanged: a reach-out's email rows, the version switch, the marks. The 10-08
  spec's decision 5 (a new playbook ticks every ready channel) loses its cost objection for email: the mailbox is the
  business's, and the product's cost is the model's. Text still costs; the decision stays his.
- **Reports.** `campaign_series` counts email `delivered` as landed (sent and not bounced); 0030's note gains the line
  "a delivery is WhatsApp's and text's; email's is landed". Sent's rows are unchanged (`sent_by`).
- **Ask** reads the same readiness and the same words (its campaign-channel cards, `ask-turn.jsx:130-143`), so the
  number Ask says is the number the page shows.
- **Tests:** `broadcasts/offers-by-email.test.mjs` and `email/email-offers-edge.test.mjs` re-pointed at the mailbox;
  `templates/message-versions.test.mjs` and `template-versions.db.test.mjs` for the one bound;
  `playbooks/home/channels-on-the-home.test.mjs` for the head's address; `broadcasts/core-broadcast.test.mjs` for the
  hold; `reports/campaign-report.test.mjs` for landed.

### 4.8 The receptionist answers email, and the Inbox

The PRD of 24 September's W3a, built as written there (`docs/plans/2026-09-24-every-business-every-channel.md:322-347`),
with four differences the mailbox makes: the answer leaves from the primary mailbox through the one door (no hosted
From); the sender's proof is the mailbox's own `Authentication-Results`, so E0's trust policy is this; the planner
(§4.5) decides whom the receptionist may answer (a known person, a reply, a stranger on a primary that takes
strangers; never automated mail); and `mailbox_set_reply_mode` is §4.1's door, on the primary only. `escalations.reason`
gains `email_draft`; `effectiveReplyMode` takes the mailbox's mode (most restrictive wins); `ingestEmail` gains the
`answer` port after `record`; draft mode writes the draft into the escalation and queues nothing; veto and auto queue
through `queueDraft` with `to_email`; the thread shows "Drafted for you" with Edit and Send; the person page's Email row
says the mailbox's mode. The Inbox's first message (`begin.ts`) and Ask's draft (`person-draft.ts`) freeze
`mailboxIdentity(primary)`; the `no_history` hold ("goes from Campaigns") is unchanged. Booking notices arrive natively
and `booking_read` runs as today; the forwarding confirmation (`forward_confirm_*`, `keepForwarding`) retires, and
Settings › Business's "Bookings by email" line says "forward nothing: your mailbox is connected" or, for a workspace
still on the hosted address, what it says today until the cut. `EMAIL_NOT_ANSWERED_SENTENCE` and `emailWaitingMessage`
go. Tests as the PRD names them (`email-draft.test.mjs`, `email-optout.test.mjs`), plus `new-conversation/begin-conversation.test.mjs`
for the primary's From. Deploy order: the migration, then the edge (the widened unions ride its dist), then the
dashboard. Proof: an email from a stranger to a primary that takes strangers yields a draft in the Inbox within a
minute; Send leaves from the mailbox, threads in Gmail's Sent, and the reply lands on the row.

### 4.9 Protection

Rules, not settings, per mailbox; each is held by a test named in §7.

| Rule                                                                                                         | How                                                                                                   | On failure                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Cold email only from a mailbox on the business's own domain                                                  | `mayPickForColdOf`: `domain` not in `free-mail.ts`'s list                                             | not offered in the sheet; `mailbox_not_ready` at the door                    |
| SPF, DKIM and DMARC read good, aligned with the provider's selector                                           | `judgeDns` on connect, daily, on Check                                                                | `held_why = 'records'`, lifts itself; the records table says what to publish |
| A warning when the sender's domain is the business's website's                                               | contracts, from `business_records` and the lead profile                                               | words only (decision 6)                                                      |
| 10 → 20 → 30 → 50 cold a day by days sent; an owner may only lower                                            | `mailboxDailyCap`, `mailbox_set_cold_cap`, the claim's room                                           | `mailbox_at_cap`: planned again                                              |
| 1,500 of any mail a day from one mailbox                                                                     | `mailbox_day`                                                                                         | `mailbox_at_cap`: a wait                                                     |
| One send in flight per mailbox; 2.5 s between a Microsoft mailbox's sends                                    | `job_capacity` scope `mailbox`; `PROVIDER_GAP_MS`                                                     | the claim waits                                                              |
| The step's gap, jitter, the lead's own hours                                                                 | the timetable, unchanged                                                                              | as today                                                                     |
| Verified addresses only; catch-all and unknown held until included                                           | the audience, unchanged                                                                               | as today                                                                     |
| The never-again list, a customer's number or domain, anyone who wrote back, a bounce, a stop, an away        | `outreach_lead_facts`, unchanged, plus `wrote_by_hand`                                                | as today                                                                     |
| One-click unsubscribe and the postal address on every marketing and cold email                                | the MIME builder refuses to build one without them; the foot                                          | never sends                                                                  |
| An unsubscribe, a reply read as no, a complaint-shaped reply honoured within seconds                         | the page, `set_email_marketing`, the reading, unchanged                                               | as today                                                                     |
| Bounces or unsubscribes over 2% of the last 500 (over 3 while fewer than 150), a reply read as no beside them | `mailbox_counts`, `reputationHoldOf`, the sweep                                                       | `held_why = 'bounces' \| 'unsubscribes'`, Resume by the owner                |
| A second reputation hold in 30 days                                                                          | `heldTwice`                                                                                           | the platform's to lift (D16)                                                 |
| A revoked grant                                                                                              | `invalid_grant` on refresh                                                                            | `held_why = 'revoked'`, the owner told to reconnect, sends wait              |
| The month's allowance (cold 2,000; campaigns email 2,000)                                                    | `reach_out_month_sent`, `campaign_month_sent`, unchanged                                              | as today                                                                     |
| The first run waits for its owner; later runs give thirty minutes; every held email waits                    | ask/veto/auto, unchanged                                                                              | as today                                                                     |
| Nothing is written to the mailbox                                                                            | the scopes: send and read only; no labels, no moves, no deletes                                       | by construction                                                              |
| What the product reads from a mailbox is used only for the business's own features                           | the planner drops what is not the business's conversation; nothing dropped is stored; the privacy page | Google's Limited Use policy                                                  |

### 4.10 Reports and what each number counts

Written is an email that left (the provider's accept, or the Sent folder's confirmation of a timed-out send); bounced
is a delivery report read from the mailbox, permanent; landed is written and not bounced (Campaigns' "delivered" for
email); wrote back, interested, booked, said no are the product's own readings, unchanged. By mailbox: sent, landed,
bounced, unsubscribed, said no, the mailbox's state now, and a disconnected mailbox's mail on one line. Written by day,
by step, by angle: unchanged. Delivered and complained are not shown for email anywhere; a read before the migration
says them as unknown, never as a zero (the 00241 rule, kept).

### 4.11 Notifications

`mailbox_held` and `mailbox_resumed` take the sending domain's notices' place in Settings › Notifications' Reach-outs
group (N2's row "A sending domain is held, and when it sends again" reads "A mailbox is held…"); `mailbox_revoked`
("Reconnect your mailbox: Google no longer lets Chanlytics send from it") is new and sent once; the rest are unchanged.

### 4.12 What retires, and the cut

Three moments:

1. **With M1:** no new hosted mailbox (`create_mailbox` refuses; the Connections verb is Connect); the domains block is
   drawn only for a workspace that already has a sending domain, and its Add is gone.
2. **With M4:** the cold account is no longer read for a send (the own lane leaves `emailWireFor`), `sending_domains`
   stops being offered anywhere, the `domains` sweep keeps running only to lift holds on rows that still exist, and the
   cold receipts watch and the cold webhook secret are no longer required (`/api/diag` says so).
3. **The cut (M7), on Ruben's date, once every live workspace with inbound email in the last 30 days has connected a
   mailbox** (§1.8's numbers, read again that week): the receiving MX of `mail.chanlytics.com` is removed and Resend
   receiving turned off; `EMAIL_DOMAIN`, `EMAIL_CAMPAIGNS_DOMAIN`, `RESEND_WEBHOOK_SECRET`, `RESEND_COLD_API_KEY`,
   `RESEND_COLD_WEBHOOK_SECRET`, `COLD_REPLY_DOMAIN` and `COLD_REPLY_DOMAIN_PREVIOUS` leave `env.ts` and `.env.example`
   (the manifest test holds both lists); `/api/resend-webhook` goes (member notifications' receipts land nowhere, as
   they land nowhere useful today, `email-receipts.ts:74`); `resend-event.ts`, `email-ingress.ts`, `intake.ts`'s reply
   route parsing, `campaigns-domain.ts`, `offer-gates.ts`' domain check, `cold-receipts.ts`, `sending-domains*.ts`,
   `domains-sweep.ts`, the admin door, the four dashboard routes, the block, `packages/contracts/src/email/sending-domains.ts`
   and `packages/db/src/repositories/sending-domains.ts` are deleted (knip's baseline falls); the `hosted`, `campaigns`
   and `own` lanes leave `wire-senders.ts` and `identity.ts`; `mailboxes.local_part`, `reply_token`, `reply_token_prev`,
   `forward_confirm_*`, `reach_out_sends.domain_id`, `playbooks.domain_ids`, `sending_domains`, `sending_domain_days`,
   `cold_receipts_owed`, `sending_domain_capacity`, `sending_domain_counts`, `reach_out_due_domains`,
   `trigger_domains_sweep` and the `domains` and `sending_domain_days` clocks are dropped in one migration; the health
   sweep's mail-domain, cold-reply and campaigns-domain checks go; the clocks baseline falls by two; `docs/glossary.md`'s
   Mailbox and Sending domain rows, `docs/architecture.md`'s lanes, `docs/runbook.md`'s "Turn on cold email" (which
   becomes "Connect a mailbox", with the two consoles' steps, the verification's state, what a 503 means, and how a
   revoked grant is found), `docs/system-prd.md`'s S-08, S-09, S-14.4 and 23.1, `docs/data-model.md` and `docs/api.md`
   (regenerated) are rewritten; the Reach out spec's §4.6 and §4.8 get their "superseded by" line. The platform's
   `RESEND_API_KEY`, `LEAD_FROM` and `LEAD_TO` stay for `notify.ts`.

Until the cut, a workspace that has not connected keeps its hosted address receiving and sending as today, and its
Connections row says "Connect your mailbox before <date>; your hosted address closes then". A customer who still has
the hosted address in their address book after the cut gets a bounce from Resend's receiving; the words the Connections
row and the bell say in the month before name that, and the owner's own announcement is theirs to send (from their
mailbox, through the product, as a broadcast to everyone with an address: the first offer-shaped email the new lane
carries, and a fitting proof).

### 4.13 Failure handling

A revoked grant holds the mailbox and tells the owner once; sends wait, nothing is rerouted (C5). A lost push is caught
by the sweep's ten-minute backstop. A stale cursor is a full resync from the day before. A send that times out stays
unknown until the Sent folder confirms it, or fails after a day as today. A provider outage is one workspace's outage,
not every workspace's, and the wire's `WireUnavailable` keeps the row queued. A mailbox another workspace holds is
refused at connect in words. A DNS record that disappears holds the mailbox at the next daily read and lifts itself.
Nothing falls back to another channel, mailbox or address.

---

## 5. What does not change

The one send door and its order of refusals; the consent predicate; the chain of playbooks and `after_step`; the
audience, the followers, the person made at the send; the timetable, the zones, the lead's hours; the check, its
writer, its reader and its holds; the reply reading, its intents, the undo, the dated step, the hand step; the stops;
the unsubscribe page, its token, `set_email_marketing` and the never-again list; the month's allowances; ask, veto and
auto; one conversation per person; `email_ingest` and `ingestEmail`'s outcomes; `resolve_person`; the Campaigns home,
its rooms, the marks and the drawer; the Library's versions; the reports' lenses; the routes' names where a route is
kept; member notifications on Resend; every rule in `CLAUDE.md`.

---

## 6. Parts and PRs

Each to 100% before the next, each shippable in either deploy order unless said, each with its proof on production
before the next starts. Migrations are additive until M7.

| Part                                                 | Builds                                                                                                                                                                                                                                                                                                                                                                                                                       | Deploy order                                           | Proof                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 · The ground** (no code but the note and the page) | The decision note from §3; the second Google Cloud project (consent screen with the two Gmail scopes, the OAuth client, the Pub/Sub topic and its push subscription with OIDC, the test users), the verification and the CASA assessment started; the Entra multi-tenant registration and publisher verification started; the privacy page's Limited Use statement; the `GMAIL_*`, `MS_*` and `GMAIL_PUSH_*` variables set on the edge (unset reads as off) | none                                                   | The consent screens open on the test users; the Pub/Sub topic accepts a publish; the note is in `docs/decisions/README.md`                                                                                                                     |
| **M1 · A mailbox is connected** (Google)              | §4.1 whole; §4.2's Google flow, routes, the redrawn Connections row and block, Setup's row, `EmailSetupDto`; the DNS judge; `mailboxes` sweep for DNS and holds (its watch work waits for M3); `create_mailbox` refuses                                                                                                                                                                                                       | migration, then either app                             | Ruben connects a Workspace mailbox on the test workspace; the row says connected as whom, SPF · DKIM · DMARC good; Disconnect revokes (Google's account page shows it gone); a free-mail mailbox connects as primary and is marked "may not send cold" |
| **M2 · Every email leaves from the mailbox**          | §4.3 whole: the MIME builder, the Message-ID, the headers, `gmail.ts`, the `mailbox` lane, `mailboxFor`, the new refusals, the provider guard and `mailbox_at_cap`, the `mailbox` capacity scope, `/api/admin/email/wire`'s answer; the hosted and campaigns lanes stay for a workspace with no mailbox                                                                                                                       | migration (capacity scope), then either app (§4.3's rule) | A reply, a first email from the Inbox, a visit message and an offer each leave from the connected mailbox: `dkim=pass` with `List-Unsubscribe` among the signed headers, our Message-ID kept, the email in Gmail's Sent, threaded                 |
| **M3 · The mailbox is read**                          | §4.5 whole: the push door, `mailbox_sync`, the Google fetch port, the planner, the DSN reader, `own_sent` and `wrote_by_hand`, `takes_strangers`, the watch renewal and backstop in the sweep, `authResultsOf`                                                                                                                                                                                                              | migration (the kind, the lane), edge, then dashboard   | A reply read into the thread within a minute of landing; a bounce from a made-up address marks it invalid; a booking tool's notice read natively; a newsletter dropped; the owner's own Gmail reply to a customer on the thread                   |
| **M3b · Microsoft 365**                               | §4.2's Microsoft flow, `microsoft-oauth.ts`, `graph-mail.ts`, the notify door, delta cursors, `PROVIDER_GAP_MS`                                                                                                                                                                                                                                                                                                                | either                                                 | M1 to M3's proofs on a Microsoft 365 mailbox Ruben owns                                                                                                                                                                                       |
| **M4 · Reach out on mailboxes**                       | §4.6 whole, §4.4's cold cap and holds, §4.10's reports, §4.11's notices, `mailbox_days`; the own lane and the cold account leave the wire; the domains block loses Add                                                                                                                                                                                                                                                       | migration, then either app (§4.6's rule)               | The two integration tests green on a stack with the Gmail stub; then one real chain of three steps from a spare-domain mailbox to three inboxes Ruben owns: the opening checked, the send spaced in the leads' hours, a reply read and drafted, a no suppressed, a bounce stopping the chain, "12 of 30 today from sam@…" on Leads |
| **M5 · Campaigns, universal**                         | §4.7 whole                                                                                                                                                                                                                                                                                                                                                                                                                   | migration (the words bound), then either app           | An offer to an opted-in person and a visit message leave from the primary; the head says the address and the day; a run on a mailbox at its provider day holds its email people to tomorrow and sends the rest                                  |
| **M6 · The receptionist answers email, and the Inbox** | §4.8 whole                                                                                                                                                                                                                                                                                                                                                                                                                   | migration, edge, then dashboard                        | §4.8's proof; the nightly's Inbox spec extended                                                                                                                                                                                               |
| **M7 · The cut**                                      | §4.12's third moment, on Ruben's date                                                                                                                                                                                                                                                                                                                                                                                       | migration last, after both apps                        | `/api/diag` reads no hosted switch; the env manifest, knip, the docs and the clocks baselines fall; no workspace's hosted mailbox had inbound in 30 days; the announcement broadcast went from each connected mailbox                           |

Roughly: M0 in the first week and running throughout; M1 to M3 two to three weeks; M3b one; M4 two; M5 one; M6 one;
M7 when the numbers say. The verification is the long pole and gates nothing but the 100-user cap on the Google
consent, which the build's test users sit well inside.

---

## 7. Tests

Pure: the MIME builder (every header, the twin, the encodings, a round trip through its reader), the DNS judge for
each provider and each failure, the ramp and the provider guard, the planner over twenty fixtures (§4.5), the DSN
reader over Gmail's and Exchange's reports, `authResultsOf`, the two incoming shapes, the Google id-token verifier over a
recorded certificate, the history and delta planners, `mailboxFor`'s pick per purpose, the words. Doors over the fake
db: the connect op (scopes, refresh token, taken, the row and the secret, the watch, the Vault failure restoring), the
push and notify doors (verified, kept, scheduled once, fast), `mailbox_sync` twice is once, the claim per mailbox, the
provider guard's wait, the hold and its lift, the disconnect's revoke. Database: the constraints and the doors'
privileges, tenancy, the erasure registry and completeness, the writers and clocks baselines, the realtime watched
table, the jobs lanes and the `mailbox` capacity scope, the re-keyed reach-out doors. Pages: Connections' block in the
stub harness and on the gallery's kit parts, the sheet's picker, the head's line, the Inbox's "goes from" line. On a
stack: the two reach-out integration tests over a Gmail stub that answers `send`, `watch`, `history` and `get` from the
test's own store (`tooling/scripts/tests/_fake-gmail.mjs`, beside `_fake-db.mjs`). Nightly, against production on the
test workspace with a mailbox the suite owns, behind an `E2E_MAILBOX` switch as the dry wire is: the Connections row
reads connected; a reach-out of two steps to two addresses the suite reads; a reply the suite sends stops the chain and
leaves a draft. Live, by hand, per part: §6's proof column, on mailboxes Ruben owns, with the DKIM headers read in
Gmail's "Show original".

---

## 8. Risks

- **Google's verification and CASA.** Weeks and a yearly fee; until passed, "unverified" and 100 users. Started in M0
  on a separate project; the vendor route is the fallback at eight weeks (decision 12). A Workspace admin who blocks
  unverified third-party apps blocks the connect until then; the row says so.
- **Google's and Microsoft's policies on unsolicited mail** (§2.2, §2.3). The caps, the ramp, verified addresses, the
  opening written per lead, the unsubscribe honoured at once and a reply read as no suppressing the domain keep a
  mailbox inside what the providers enforce; a mailbox that is suspended is one business's, told to its owner, and
  nothing of another workspace's is touched.
- **No receipts.** Delivered is gone; a bounce is only as good as the delivery report that comes back (Gmail's and
  Exchange's are reliable; a receiving server that bounces silently is invisible, as it is to Instantly).
- **Pub/Sub and Graph notifications are at least once and unordered.** The cursor and the dedupe index make the sync
  idempotent; the sweep's backstop makes a lost push a ten-minute delay.
- **A grant is revoked without notice** (a password change, an admin policy). The hold and the reconnect notice are the
  answer; sends wait rather than fail.
- **A full inbox is private.** The planner keeps only the business's conversations and drops the rest unstored; the
  registry names every column; the privacy page says what is read and why; the scopes write nothing to the mailbox.
- **One business's mailbox in two workspaces.** Refused by the address's uniqueness, in words.
- **A partner connecting their own mailbox into a client's workspace.** The words say "the business's mailbox, not
  yours"; a free-mail primary is allowed, so a small business on `@gmail.com` is not locked out of the receptionist.
- **The re-key's breadth.** 151 files name a domain; most are tests changing a fixture column, and the integration
  tests on a stack are the net under the engine.
- **Two words rules become one** (80/2,000) and a WhatsApp-approved message's email twin may need its subject
  shortened nowhere (the bound rises); nothing stored becomes invalid.

---

## 9. Decisions for Ruben

Each recommended as in §3.3; say the word to change any.

1. Connected mailboxes only, Google Workspace and Microsoft 365 by OAuth; no hosted address, no SMTP. **Recommended:
   yes.**
2. Several mailboxes per workspace, one primary, at most five. **Recommended: yes.**
3. Google first and direct, on a second Cloud project, with the verification and CASA started in week one; Microsoft
   second; a unified-API vendor only if the assessment stalls past eight weeks. **Recommended: as stated.** Budget: the
   assessment's fee (vendors say $540 to $1,000 a year on the self-serve labs); an MPN account for publisher
   verification (no charge).
4. The cold ramp per mailbox 10 → 20 → 30, ceiling 50 after 30 clean days, an owner's cap that only lowers.
   **Recommended: yes.**
5. The provider guard at 1,500 a day of any mail from one mailbox, one send in flight, 2.5 s between a Microsoft
   mailbox's sends. **Recommended: yes.**
6. Cold email only from a mailbox on the business's own domain; free mail may be a primary and never sends cold; a
   warning, not a refusal, when the sender's domain is the business's website's. **Recommended: warn.**
7. All customer email (visit messages, offers, the receptionist, the Inbox) from the primary mailbox too, rather than
   keeping an ESP on the business's domain for automated mail. **Recommended: the mailbox.** A multi-location group that
   outgrows a mailbox's day is the moment to revisit, not before.
8. Delivered and complained leave the reports; landed takes delivered's place for email. **Recommended: yes.**
9. The owner's own sends from the mailbox: recorded on a known person's thread as the owner's words, a lead's chain
   stopped as "wrote by hand", never a person made from one. **Recommended: yes.**
10. A primary mailbox takes strangers by default; a sender mailbox does not. **Recommended: yes.**
11. The receptionist answers email in draft mode in this program (M6), veto and auto only on a mailbox whose records
    read good. **Recommended: yes.**
12. One words rule for every email, subject at most 80 and body at most 2,000 characters, with the cold rules layered
    on. **Recommended: yes.**
13. The cut: on a date he sets, once every live workspace with inbound email in the last 30 days has connected;
    announced on the Connections row and in the bell a month ahead. **Recommended: yes; the date his.**
14. The month's allowances (cold 2,000, campaigns email 2,000) stay as plan knobs, now that the carrier costs Chanlytics
    nothing but the model's calls. **Recommended: keep the knobs; the price his, as before.**
15. "A campaign says where it goes" decision 5 (a new playbook ticks every ready channel): email no longer costs
    Chanlytics; text still does. **Recommended: keep it ticking every ready channel.**
16. The cold-only link and reply domain (D17) is no longer needed: links are `UNSUBSCRIBE_ORIGIN`'s and replies go to the
    mailbox. **Recommended: drop D17; keep `UNSUBSCRIBE_ORIGIN` as it is.**

---

## Appendix A · Names added, renamed, retired

| Kind              | Added                                                                                                                                                                                                                                                                                                                                                                                                                     | Retired at the cut                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Env (edge)        | `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_OAUTH_REDIRECT_URI`, `GMAIL_OAUTH_AUDIENCE`, `GMAIL_PUSH_TOPIC`, `GMAIL_PUSH_TOKEN`, `GMAIL_PUSH_SERVICE_ACCOUNT`, `MS_OAUTH_CLIENT_ID`, `MS_OAUTH_CLIENT_SECRET`, `MS_OAUTH_REDIRECT_URI`, `MS_GRAPH_NOTIFY_SECRET`                                                                                                                                       | `EMAIL_DOMAIN`, `EMAIL_CAMPAIGNS_DOMAIN`, `RESEND_WEBHOOK_SECRET`, `RESEND_COLD_API_KEY`, `RESEND_COLD_WEBHOOK_SECRET`, `COLD_REPLY_DOMAIN`, `COLD_REPLY_DOMAIN_PREVIOUS`; the dashboard's `EMAIL_DOMAIN`                                                                            |
| Tables, columns   | `mailboxes.{provider, address, domain, is_primary, state, held_why, held_at, resume_by, provider_user_id, scopes, credentials_ref, connected_by, connected_at, disconnected_at, sync_cursor, watch_id, watch_expires_at, synced_at, sync_error, dns, dns_state, dns_checked_at, takes_strangers, cold_cap, clean_since, counted_since, sent_days, *_recent}`, `mailbox_days`, `reach_out_sends.mailbox_id`, `playbooks.mailbox_ids` | `mailboxes.{local_part, reply_token, reply_token_prev, forward_confirm_*}`, `sending_domains`, `sending_domain_days`, `reach_out_sends.domain_id`, `playbooks.domain_ids`                                                                                                             |
| SQL doors         | `mailbox_connect`, `mailbox_disconnect`, `mailbox_set_primary`, `mailbox_set_reply_mode`, `mailbox_set_cold_cap`, `mailbox_set_takes_strangers`, `mailbox_hold`, `mailbox_resume`, `put_mailbox_credentials`, `get_mailbox_credentials`, `drop_mailbox_credentials`, `mailbox_capacity`, `mailbox_counts`, `mailbox_day`, `reach_out_due_mailboxes`, `mailbox_days_keep`                                                     | `create_mailbox`, `rename_mailbox`, `mint_reply_token`, `sending_domain_capacity`, `sending_domain_counts`, `reach_out_due_domains`, `cold_receipts_owed`, `sending_domain_days_keep`, `trigger_domains_sweep`                                                                      |
| Job kinds         | `mailbox_sync` (lane 0)                                                                                                                                                                                                                                                                                                                                                                                                   | none (`email_ingest` stays, fed by the sync)                                                                                                                                                                                                                                       |
| Clocks            | `mailboxes` (reconcile, every 15 min)                                                                                                                                                                                                                                                                                                                                                                                     | `domains`, `sending_domain_days`                                                                                                                                                                                                                                                   |
| Edge doors        | `/api/gmail-push`, `/api/graph-notify`, `/api/admin/mailboxes`, `/api/cron/mailboxes`                                                                                                                                                                                                                                                                                                                                     | `/api/resend-webhook`, `/api/admin/sending-domains`, `/api/cron/domains`                                                                                                                                                                                                           |
| Routes            | `GET mailboxes/connect`, `GET mailboxes/callback`, `DELETE mailboxes/[id]`, `PUT mailboxes/[id]`, `POST mailboxes/[id]/{check,resume,primary}`                                                                                                                                                                                                                                                                             | `POST mailboxes`, the four `sending-domains` routes                                                                                                                                                                                                                                |
| Refusals          | `email_needs_mailbox`, `mailbox_not_ready`, `mailbox_at_cap`, `mailbox_revoked`; the stop `wrote_by_hand`; the 503s `mailbox_lane_unset`                                                                                                                                                                                                                                                                                | `outreach_needs_own_domain`, `sending_domain_not_ready`, `sending_domain_at_cap`, `cold_lane_unset`                                                                                                                                                                                 |
| Events            | `mailbox.connected`, `mailbox.disconnected`, `mailbox.held`, `mailbox.resumed`, `mailbox.primary_set`                                                                                                                                                                                                                                                                                                                     | `mailbox.created`, `mailbox.renamed`, the sending domain's                                                                                                                                                                                                                         |
| Notifications     | `mailbox_held`, `mailbox_resumed`, `mailbox_revoked`                                                                                                                                                                                                                                                                                                                                                                      | the sending domain's                                                                                                                                                                                                                                                               |
| channels          | `email/mime.ts`, `email/dsn.ts`, `google/gmail.ts`, `google/google-id-token.ts`, `microsoft/microsoft-oauth.ts`, `microsoft/graph-mail.ts`; `mailboxIdentity` in `email/identity.ts`; `authResultsOf` in `email/intake.ts`                                                                                                                                                                                                | `email/email-domains.ts`, `email/email-resend.ts`'s send and receive (its domains read stays until the cut), the hosted, campaigns and own identities, the reply route parsing                                                                                                       |
| core              | `messages/mailbox-intake.ts` (the planner), `mailboxFor` (contracts), the `mailbox` lane                                                                                                                                                                                                                                                                                                                                  | the three lanes, `own_request`, `replyIdentityOf`                                                                                                                                                                                                                                  |
| contracts         | `email/mailboxes.ts`, `MAILBOX_COLD_RAMP`, `mailboxDailyCap`, `PROVIDER_DAY`, `PROVIDER_GAP_MS`, `judgeDns`, `mayPickForColdOf`, `MailboxDto`, the words                                                                                                                                                                                                                                                                 | `email/sending-domains.ts` whole                                                                                                                                                                                                                                                   |
| edge              | `lib/mailboxes/{connect,sync,dns,holds,sweep}.ts`, `lib/email/providers.ts` (the per-mailbox transport binding)                                                                                                                                                                                                                                                                                                           | `lib/email/{sending-domains,sending-domains-ops,sending-domain-check,sending-domain-holds,sending-domain-provider,sending-domain-ports,domains-sweep,cold-receipts,campaigns-domain,offer-gates' domain check,resend-event,email-ingress,email-receipts' Resend half,mail-domain}.ts` |
| dashboard         | `server/connections/mailboxes.ts`, `surfaces/settings/connections/mailboxes-block.tsx`, `mailboxes.ts`                                                                                                                                                                                                                                                                                                                    | `server/connections/sending-domains.ts`, `email-setup.tsx`'s hosted form, `domains-block.tsx`, `domains.ts`                                                                                                                                                                       |
| Glossary          | Mailbox (redefined), Primary mailbox, Sender mailbox, Records (SPF · DKIM · DMARC), The mailbox's day, Landed, Wrote by hand                                                                                                                                                                                                                                                                                              | Sending domain, the hosted mail domain                                                                                                                                                                                                                                             |

## Appendix B · What this plan does not build

- A warmup network, a mailbox farm, done-for-you domains or seats (the business buys its own; a guide page is words).
- Open or click tracking, a tracking domain, inbox-placement seed tests (a "send yourself a test" step is in M2's proof
  and may become a button later).
- SMTP or IMAP for providers that are neither Google nor Microsoft; revisited if a cohort needs it.
- Writing to the mailbox: labels, moves, archiving, drafts in the owner's Drafts folder.
- Google Calendar on the same Google account (0002's appointments record names its own sources; a later note).
- Attachments sent by the product, rich HTML composition, signatures with images.
- A shared team inbox with assignment (0003), Postmaster Tools read by the product (the owner's to open; a guide line).
- Per-message cost rows for email (there is no per-message cost any more).
- Any change to WhatsApp, text or voice.

## Appendix C · Sources

Read on 9 October 2026. Vendor pages are marked; a number the design rests on is re-read from the provider's own page
before the part that needs it is planned.

1. Resend acceptable use policy, third-party copy: https://tostracker.app/document/resend-acceptable-use
2. mails.ai on Resend's policy and cold outreach (vendor): https://mails.ai/acceptable-use
3. Google Workspace admin help, "Transition from less secure apps to OAuth":
   https://knowledge.workspace.google.com/admin/sync/transition-from-less-secure-apps-to-oauth
4. Nylas, Google OAuth scopes (vendor): https://developer.nylas.com/docs/cookbook/use-cases/build/google-oauth-scopes/
5. Unipile, Google OAuth verification and Gmail API credentials (vendor):
   https://www.unipile.com/integrating-google-oauth-2-0-user-authentication-into-your-app/
6. CASA Tier 2 requirements for Gmail restricted scopes (consultant): https://singhamandeep.com/category/google-youtube-api/
7. Google, "Create and send email messages" (Gmail API): https://developers.google.com/workspace/gmail/api/guides/sending
8. Google, Gmail API usage limits: https://developers.google.com/workspace/gmail/api/reference/quota
9. Google Workspace admin help, Gmail sending limits:
   https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
10. Google, "Configure push notifications" (Gmail API): https://developers.google.com/gmail/api/guides/push
11. Google, `users.history.list`: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
12. Google Workspace and Cloud Identity acceptable use policy: https://workspace.google.com/terms/use_policy.html
13. Nylas, Microsoft Graph mailbox agent best practices (vendor):
    https://cli.nylas.com/guides/microsoft-graph-mailbox-agent-best-practices
14. Microsoft, change notifications for Outlook resources:
    https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview
15. Microsoft, subscription resource type: https://learn.microsoft.com/graph/api/resources/subscription
16. Microsoft, outbound spam sending limits and the tenant external recipient rate limit:
    https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-sending-limits-troubleshoot
17. Microsoft 365 message center MC786329, SMTP AUTH basic authentication retirement (mirror):
    https://mc.merill.net/message/MC786329
18. Microsoft, publisher verification and multi-tenant consent (2020):
    https://blog.thoughtstuff.co.uk/2020/11/end-users-can-no-longer-grant-consent-to-unverified-multi-tenant-apps-what-this-means-for-you/
19. Close, requirements for bulk email senders (vendor summary of Google's and Yahoo's):
    https://help.close.com/docs/requirements-for-bulk-email-senders
20. Bounteous, 2024 Gmail and Yahoo deliverability changes:
    https://www.bounteous.com/insights/2024/01/31/2024-gmail-and-yahoo-deliverability-changes/
21. Smartlead, how many cold emails per day (vendor): https://www.smartlead.ai/blog/how-many-cold-emails-per-day
22. Prospeo, sequence email send limits (vendor): https://prospeo.io/s/sequence-email-send-limits
23. LeadHaste, cold email sending limits 2026 (vendor): https://leadhaste.com/blog/cold-email-sending-limits-2026
24. GTM Stack forum thread on warmup and daily limits (community):
    https://gtm-stack.deepline.com/gtm-stack/questions/hello-everyone-when-it-comes-down-to-warm-up-the-e-mails-for-ihzcnZ
25. Nylas pricing: https://www.nylas.com/pricing
26. Zeeg, Nylas API pricing in 2026 (third party): https://zeeg.me/en/blog/post/nylas-api-pricing
27. Nylas, Shared GCP App (vendor): https://developer.nylas.com/docs/provider-guides/google/shared-gcp-app/
