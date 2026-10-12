# Reports: what every lens can show, and what the backend should start keeping

2 Oct 2026. Read against origin/main `32328415f` (paths below are from the repo root; `S:n` is a line of `supabase/schema.sql`),
the uncommitted `:3300` tree, and the real salon workspace's last 30 days (read-only). Companion to the canvas
`Downloads/reports-liquid-glass.html` (generator in this folder). Nothing here is built.

**Status words**

| Word | Means |
| --- | --- |
| **Now** | Stored today; a read (usually one SQL pass) away. |
| **Small** | One column, one event field, one exposed value, or one new read function. No new mechanism. |
| **New** | The product does not capture it; a writer and a place to keep it are needed. |
| **Avoid** | Measurable but misleading, or against a decision already taken. |

---

## 1. The backend work, ranked by how many charts it unlocks

Each row is a refactor or capture. The lens columns say which pages it feeds.

| # | Work | Status | Unlocks | Where it starts |
| --- | --- | --- | --- | --- |
| 1 | **The appointments record** (decision 0002): a row per visit from the feed sync, keeping `status` (the parser drops CANCELLED today), the feed's CREATED/DTSTAMP, `service`, and the message or call that came before it. "Missed" only by a person's door. | New | Calendar (whole lens), People (returning, rebook, gap between visits, at-risk, lifetime), Campaigns (booked after a send), Overview funnel, Journey, Receptionist ("it booked") | `packages/contracts/src/calendar/feed.ts:22-37,248-250`, `apps/edge/api/cron/calendar.ts:101-106` |
| 2 | **What each message was about and how it ended**: stamp the inbound message's `meta` with `{intent, handled: ai\|held\|handoff\|blocked}` (both already exist in the turn); add `topic` and `language` to the call analysis fields. | Small | Overview funnel, Receptionist (topics across calls and texts, outcomes, languages), People (what new people ask) | `packages/db/src/repositories/ingest.ts:160` (markProcessed), `packages/core/src/inbound/dispatch.ts:60`, `voice-shell.ts:330` (CALL_ANALYSIS_FIELDS) |
| 3 | **First touch, stamped once**: `contacts.acquired_via` + `acquired_ref` (line dialled, broadcast/playbook/lead id, a WhatsApp ad's `referral`). `came_from` stops being guessed at read time. | Small | People (sources), Overview, Pipeline (win rate by source), Campaigns (new people per campaign), Leads | `ingest.ts:257`, create_person (00052-53), import (00170), lead convert (00220:576,597) |
| 4 | **A cost spine** (operator side; owners see plan share): parse `calls.cost` into the ledger; keep Meta's `pricing` block on WhatsApp statuses; keep SMS `num_segments`; write invoice `amount_cents` on `invoice.paid`; tie the lead judge's spend to its round. | Small ×5 | Usage (operator margin), fleet report, pricing decision inputs | `voice-retell.ts:181`; `apps/edge/api/whatsapp.ts:179-195` → `ingest.ts:394-408`; `lib/sms/sms.ts:173-185`; `stripe-webhook.ts:295-303`; `lead-wires.ts:76-77` |
| 5 | **An owner-readable daily rollup**: a SECURITY INVOKER read over `platform_metrics` scoped to the caller's workspace, and the roll widened to read `ai_usage` (not purged events) plus intent and held/handed counts. | Small | Every lens past 90 days, anything older than the 30-day evidence purge, Overview trends | `platform_metrics_roll` (S:10085, 00277:406) |
| 6 | **History for state that is overwritten**: `escalations.resolved_at` + an `escalation.changed {from,to}` event (a new reason overwrites the old today); `from` on `lead.stage` + `leads.stage_at`; amount and reason on `deal.*`; a daily snapshot of sending-domain counters; template quality applied from its webhook; WhatsApp `quality_rating` refreshed. | Small ×6 | Receptionist (time to resolve), Leads (time in stage), Pipeline (stage movement), Campaigns (number and template health trends) | `packages/jobs/src/escalate.ts:30-70`, `verbs.ts:248`, `00220:610-661`, `00160:229-247`, `email/sending-domains.ts:412,566`, `waba-events.ts:225-290` |
| 7 | **Plan allowances**: a `PLAN_ALLOWANCES` map keyed by `price_id`, read against the usage counters (waits on the pricing decision, PR #1039). | Small | Usage (the plan bar), Overview's Usage tile | contracts, beside `ai/usage.ts` |
| 8 | **Google Business Profile as the norm**: the profile sync already stores every review and reply; the gap is getting owners connected. Then Google's own insights (views, calls, directions) and nearby competitors' ratings. | Now / New | Reviews (stars, response rate and time, velocity), Overview | `profile-sync.ts:94-125`, `google/listing-check.ts:99-103` |
| 9 | **Two missing events**: `booking_link.sent` in chat (voice already records it as an outcome) and `call.transferred {answered}`. | Small | Receptionist (links sent → booked), Calendar (booked by the receptionist) | `conversations/reply.ts:~192`, `apps/edge/api/retell-webhook.ts:~401` |
| 10 | **Review requests**: a playbook purpose that asks a client for a review after a kept visit, so reviews gained can be tied to it. | New feature | Reviews, Campaigns | playbooks `policy_class` (S:18285); needs #1 for "after a kept visit" |

**Traps found on the way** (fix or design around):
- "New person" has three definitions: `report_series` (no erased filter), `metrics_summary` (filters erased), `person_moments.new_at` (spoken only). One registry entry, one definition.
- `report_series` has an Instagram channel that is always 0 (00251:189,195): the messages check admits no Instagram.
- Deals exist only where `tenants.sells_by = 'proposal'` (`deals/sells-by.ts:38-40`). Pipeline is a lens only there.
- Booking and deal reports read the whole people pool in TypeScript (`readers/report.ts:36`). New lenses should be SQL passes, one per source, grouped by day, SECURITY INVOKER (00251 is the pattern), each with its own period function: People, Leads, Calendar and Pipeline have none.
- `platform_metrics` and `page_vitals` are service-role only; `ask_messages` is per member. A workspace-wide Ask chart needs `ai_usage` (purpose `ask`).
- Google read through Places returns five reviews and no replies; only the Business Profile gives the full set.

---

## 2. Lens by lens

Each lens: what the canvas shows, what can be added from what is stored (**Now**), what needs a little wiring (**Small**), what should be built (**New**), and what to leave out (**Avoid**). The form names a chart.

### Overview

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **What came in, and what came of it**: everything that came in → the receptionist took it → booked / handed to you / answered, nothing else to do / still open | horizontal funnel with an outcome split at the end (Intercom's involvement × resolution, said as two numbers, never one "AI %") | Small (#2) | inbound `meta.handled` + `first_replies` + booking read |
| The week ahead: visits booked, open hours left | two figures + a 7-day strip | Now (feed, open windows) | `CalendarDayDto.windows`, `people-visits.ts` |
| A month-on-month line of the four headline numbers | sparkline per figure | Small (#5) for > 90 days | rollup |
| The weekly owner email | same view model | Small | Settings toggle exists, no sender |

Avoid: a single "AI success %"; "hours saved"; ROI multiples.

### Receptionist

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **Your hold window**: of the replies that waited, sent as the hold ended / sooner / cancelled by you / edited by you / overtaken by a newer message | funnel or stacked bar | Now | `messages.meta.source`, `meta.delay_ms`, status, `error.reason` (`superseded_by_newer_message`), decisions `cancel_send`, `edit` |
| **Languages** customers wrote in | donut ≤ 3 + "other" | Now | `messages.meta.language` |
| **Sure and unsure**: replies by confidence, and how many held at the floor | histogram or two-part bar | Now | `meta.confidence`, `meta.source='low_confidence'` |
| **Sends it refused**, by reason (opted out, a person has it, superseded…) | bar list | Now | `message.send_blocked` events (`deliver.ts:599`) |
| **Why calls ended early** | bar list | Now | `calls.disconnection_reason` |
| **Calls that want a call back**, oldest first, as doors | list rows | Now | `calls.follow_up`, `calls.wanted`, `callback` escalations |
| **Booking link sent → booked** | two-step funnel | Now for calls (`outcome='booking_link_sent'`), Small for chat (#9) | calls + booking read |
| **You, after a handover**: time to your first reply, time to resolve | median + slow quarter, per reason | Small (#6) | `first_replies.human_at`; escalation → `decision_id` → `decisions.created_at` |
| **Handover reasons over time** | stacked bars by week | Now | `escalations.reason`, `created_at` |
| **Conversations that came back** (reopened) | figure + rate | Now | `conversation.reopened` events |
| Topics across calls and texts in one list | bar list | Small (#2: calls lack a topic) | `meta.intent`, call `topic` |
| Missed-call recovery: missed or voicemail → any touch within N hours | figure | Now | `calls` ⨝ `messages` by contact |
| Handling time per reply (the receptionist's own seconds, apart from the hold) | median | Now | `meta.processed_at − created_at` |

Avoid: the voice provider's `call_successful` as an accuracy score (it grades against criteria someone wrote); latency, concurrency, cost per call on the owner's page (operator only); sentiment as satisfaction (keep "as the voice provider read it").

### People

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **How fresh your book is**: in touch < 7 days, 7-30, 30-60, 60-90, 90+ | histogram | Built 10 Oct 2026 (C3) | People's Quiet rule over the people pool (`PersonRowVM.heardDays`, the days since they were last heard in the workspace's days; the buckets end where the Quiet list begins), not `person_moments.in_touch_at`. `recencyCells`, which bucketed 24-hour blocks and had no reader, is gone |
| **How the yeses were won**: in person, sign-up form, their own message, imported | bar list | Built 10 Oct 2026 (C3) | `contact.consent_changed.source` (`people_series`, 00395) |
| **Repeat contact**: people by how many times they wrote or called | histogram | Not drawn (C3) | `people_list.conversation_count` is 0 or 1; no count of the days a person reached you is kept |
| **Channels per person**: WhatsApp only, phone only, both | bar | Built 10 Oct 2026 (C3) | People's `PersonRowVM.channels` over the pool, and the window's people per channel (`people_series`) |
| **Steps you owe**: due, overdue, done on time | figures + list | Built 10 Oct 2026 (C3) | `person_notes.due_on`, `done_at` (`people_series` for the window; `PersonRowVM.nextStep` over the pool for now) |
| Email that bounced or complained | figure | Built 10 Oct 2026 (C3), as email that stopped working | `contact.email_suppressed` events for the window; `contacts.email_suppressed_reason` for now |
| **New, returning and rebooked clients**, % returning (only for windows old enough to have come back) | three figures + stacked bar | New (#1) | appointments |
| **At risk**: past their own usual gap between visits | list rows, sized by gap | New (#1) | appointments |
| Lifetime and average spend per client | figures, cohort | New (#1 + price per visit) | appointments + service price |
| Where your customers are | dot map by postal code | New (a postal code on the person) | `contacts.postal_code` + existing ZCTA centroids |
| List sizes over time | lines | Small (#5 snapshot) | nightly rollup |

Avoid: retention for windows that haven't matured (Boulevard's rule); ratios on a handful of people without the n beside them.

### Pipeline (proposal businesses only)

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **Consultation → proposal → client**, with % moving on | stage funnel (Pipedrive) | Now | `consultation_booked`, deals |
| **Why they passed** (price, timing, went elsewhere, no reply, not a fit, other) | bar list | Now (closed set exists) | `deals.lost_reason` |
| **Worth by service** | bar list | Now | `deals.service`, `amount_cents` |
| **Win rate by where they came from** | bar list | Now (Small with #3) | `came_from` |
| **Proposals expiring this week** | list rows | Now | `deals.valid_until` |
| **Next steps**: due, overdue | figures + rows | Now | `person_notes.due_on` with `deal_id` |
| Days in each stage, stage movement over time | box or bars per stage | Small (#6: amount and reason on events; re-proposing resets `proposed_at`) | `deal.*` events |
| Money actually paid | figure | New (decision 0005) | payments writing deals |

Avoid: "revenue" (amounts are what proposals say); a weighted forecast on a handful of deals.

### Campaigns

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **Yes and stop**: the answers to a campaign, once for each person and period | two figures | Built 11 Oct 2026 (C4) | `contact.consent_changed` events of a person a run reached, within 72 hours of the message or an exact unsubscribe (`campaign_answers`, 00403, held equal to `answersToRuns`) |
| **Who it reached, and who it left out**: eligible → never said yes / heard this already / no number / over the cap → sent | stacked bar | Built 11 Oct 2026 (C4) for who it reached and who was held back; who it left out on purpose before the run was made stays Now | `broadcast_recipients.reason`, dated by their run (`campaign_ledger`, 00405); `broadcasts.audience.reach` (RunReach, whose keys are of mixed styles) is not read yet |
| **How fast it landed**: median seconds to delivered, hours to read | two figures | Now; not drawn in C4 (the review's avoid list: delivery latency) | `messages.meta.status_at` |
| **Reply rate by template** | bar list | Built 11 Oct 2026 (C4) | `campaign_ledger` (00405): for each template and language the sends that have had their 72 hours and the replies to them; `campaign_series.sources.template_name` stays the Home's |
| **By channel**: WhatsApp, text, email | stacked bar | Built 11 Oct 2026 (C4) | `messages.channel` on recipients (`campaign_series.by_channel`) |
| **Templates**: approved, paused, rejected, quality | list rows with a state pill | Built 11 Oct 2026 (C4) as the messages Meta stopped, in what is stuck now (quality Small: not applied from its webhook) | `templates.meta_status` (`campaign_stuck`, 00406) |
| **Your number**: quality and messaging tier over time | step line with flags | Small (#6); not drawn in C4 (a few points in 90 days: the avoid list), its health now is a figure of what is stuck now | `channel.phone_number_quality_update` events (kept); the channel's own config for now |
| **Why sends failed**, by provider code | bar list | Built 11 Oct 2026 (C4) | `messages.status`, `messages.error` of the recipient's message (`campaign_ledger`, 00405): a number or one word of a closed set and the channel, never the body (Meta errors, Twilio `code`, email bounce) |
| **Approval wait**: created → started | figure | Built 11 Oct 2026 (C4), from the decision, not from `started_at` (the send beginning) | `decisions` verb `send_broadcast` with `approved`, against `broadcasts.created_at` |
| **Booked after a campaign** (within N days) | funnel's last step | New (#1); deals won after a send is Now | appointments; `deals` ⨝ recipients |
| **Clicks** on a link in WhatsApp/SMS | rate | New (a first-party redirect writing `link.clicked`); not drawn in C4 | decide first: email stays without tracking (decision 8) |
| Cost per message | figure | New (#4) | WhatsApp pricing, SMS segments |

Avoid: open rates and email click tracking (decision 8); "read" as a headline (it depends on the recipient's receipts); sent counts as the hero.

### Reviews

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **Stars**: 1-5 distribution | bar | Now with the Business Profile | `google_reviews.rating` (profile origin) |
| **Answered**: share and median time to reply | figure + figure | Now with the Business Profile | `replied_at − published_at` |
| **Reviews per week** (velocity) | bars | Now | `published_at`, `google_listing_days` |
| **Replies held** because they named a price | figure + doors | Now | `google.reply_held` events |
| **Written by the receptionist vs you** | two-part bar | Now | `google.replied.by` |
| Languages of reviews | donut | Not drawable: `language_code` is null on every profile review (the sync does not read it) | `google_reviews.language_code` |
| **Asking for reviews → reviews gained** | funnel | New (#10) | review requests |
| **Near you**: competitors' rating and count | small multiples | New | competitor reads |
| Profile views, calls, direction requests | lines | New (scope unverified) | no table: `google_insight_days` was never built |

Avoid: a pseudo-NPS from star ratings; review "sentiment" as a score.

### Usage (owner)

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **Other allowances**: Ask today (of its day budget), reach-out emails this month (of 2,000), leads this month (of 500) | meters | Now (Ask's day sum is service-role: Small) | `ask_tokens_day()`, `REACH_OUT_MONTH_EMAILS`, `lead_month_used` |
| A soft warning at a threshold, never a cut-off of the receptionist | state on the plan bar | Small | with #7 |
| Export of the period | CSV | Small | the lens's view model |

Operator only: model dollars by purpose and day, cache hit rate, fallback rate, shadow-model agreement, voice dollars, margin per workspace.

### Leads (finder workspaces only) — new on the canvas (R8)

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **From found to client**: found → a fit → kept → contacted → wrote back → interested → booked → client | funnel (cohort) | Now | `leads`, `lead_search_members`, `reach_out_replies.intent` |
| **By search**: found, kept, cost | table | Now (cost Small, #4) | `lead_rounds` |
| **Which kinds of business answer** | bar list | Now | `leads.category` × replies, `converted_at` |
| **Where they are** | dot map | Now | `leads.lat`, `lng` |
| **What their replies said**: interested / a question / not now / no / wrong person / away | bar list | Now | `reach_out_replies.intent` |
| **Email you can trust**: verified / catch-all / unknown / invalid | stacked bar | Now | `leads.email_state` |
| **Held before sending**, by reason | bar list | Now | `reach_out_sends.held` reason |
| **This month's leads** of the plan's size | meter | Now | `lead_counters` |
| Time in each stage | bars | Small (#6) | `leads.stage_at`, `from` |
| Your yield against others in the same niche | bullet chart | Now (platform priors exist) | `lead_niche_priors` |

### Calendar — new on the canvas (R9)

| Add | Form | Status | Source |
| --- | --- | --- | --- |
| **This week and next: booked hours of open hours** | meter per day | Now (live from the feed and your hours) | open windows, feed |
| **When people book** (hours × weekday) | heat grid | Now | feed items |
| **What gets booked** | bar list by title | Now (titles are free text) | feed |
| **Asked → booked**, by week | line | Small (an RPC; today TypeScript only) | `people-visits.ts:135` |
| **Kept, missed, cancelled** | stacked bar | New (#1) | appointments |
| **Booked how far ahead** | histogram | New (#1, CREATED) | appointments |
| **Booked by the receptionist** vs elsewhere | two-part bar | New (#1 + #9) | appointments + attribution |
| **Rebooked before leaving** | rate | New (#1) | appointments |

Avoid: inferring no-shows from silence (decision 0002 forbids it).

### Team (later, owner only)

Now: replies by member (`messages.sent_by`), actions by member (`decisions.actor_user_id`), handovers taken and handed back. As counts, never a leaderboard, and only where a workspace has more than one person.

### Operator fleet (back office, not this page)

Now: answer rate and brain p95 per workspace (`platform_metrics`, 7 days read, 1 drawn), provider failures by outcome, the activation funnel (`workspace.activated`, read by nothing), billing mix (status, trials, failed payments), partner revenue, page speed by day (`page_vitals.at`), job failures by kind, incidents (`operator_pages`), phone-app adoption (`push_devices`). Small/New: MRR and churn (#4 invoice amounts), cost to serve per workspace (#4 + #5), provider health history (persist breaker outcomes).

---

## 3. Chart parts the kit lacks

The charts kit has bars, bar lists, lines/areas, donut (≤ 5), radar, radial, a 24-hour heat strip and a segment bar. The lenses above also need:

| Part | Used by |
| --- | --- |
| **Figure** (number, words, change in plain ink, door) | every lens |
| **Funnel** (steps with % moving on, an outcome split at the end) | Overview, Leads, Campaigns, Pipeline, Receptionist (hold) |
| **Heat grid** (weekday × hour, with your hours shaded) | Receptionist, People, Calendar |
| **Dot plot** (each reply as a dot against a line) | Receptionist (speed vs hold) |
| **Meter with a pace mark** | Usage, Leads, Calendar |
| **Dot map** (no tiles; centroids on a plain ground) | Leads, People |
| **Histogram with n** (shows the count, greys out under a minimum) | People, Calendar, Receptionist |

---

## 4. Sources

Benchmark (read 2 Oct 2026): Intercom Fin performance and automation rate; Smith.ai call dashboard; Retell analytics; Podium homepage and call reporting; Weave analytics; Fresha client summary and performance summary; Boulevard reporting best practices and retention benchmark; Square Appointments reporting; GlossGenius reports; Birdeye review reports; NiceJob insights; Pipedrive deal conversion and duration; HubSpot sales analytics; respond.io and WATI campaign analytics; Klaviyo SMS metrics; Instantly analytics; Smartlead dashboard; Anthropic Console usage; OpenAI spend limits; Twilio usage page. URLs are in this session's research notes; the code facts above are cited by file.
