# Reach out, Part 3: the engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reach-out (a chain of playbook steps over one lead search) sends its cold emails by itself: each step's run is assembled over the leads it may write to, every email gets a time in the lead's own hours on one of the workspace's own domains under that domain's ramp, and a clock sends what is due. It sends one email per claim, stops a lead the moment anything stops them, and waits (never cancels) when a domain has no room.

**Architecture:** A reach-out is `playbooks` rows with `kind = 'reach_out'`: a root (`lead_first`, over a `lead_search_id`) and steps (`after_step`, `after_playbook_id` + `after_days`). A step's run is a `broadcasts` row, and each lead in it is a `reach_out_sends` row. That row is planned with a `send_at` and a `domain_id` by a pure `timetable()`, claimed atomically per domain under that domain's capacity, and written as a queued email message with its own `outbound_send` job. Its outcome is read back from that message row. The one door (`deliver.ts`) stays the last word. Every rule reads one SQL fact per question, in `outreach_facts` (keyed by the lead) and `sending_domain_capacity`, and one pure mapping in contracts.

**Tech Stack:** Postgres (Supabase migrations, plpgsql definer doors), TypeScript packages (contracts pure, core verbs over ports, db repositories, jobs), the edge's Vercel functions (a new `reach-out` clock), node:test over the in-memory `_fake-db.mjs` and over a replayed local stack (`*.db.test.mjs`).

**Status:** Written 25 Sep 2026 against `main` at `e745cd2e` (Part 2.6 complete: #1086, #1092, #1098; the broadcast claim fix, #1100). Part 3 is approved (Ruben, 25 Sep: "go with your recommendations"), with D15–D19 and the design notes below decided. Every file:line below was read that day by three code maps and checked by hand where the plan leans on it.

---

## 0. What is decided, and what this plan decides

### 0.1 Ruben's (approved 25 Sep 2026)

| # | Decision | Where it lands |
| --- | --- | --- |
| D15 | A domain's ramp counts the **days it actually sent** from it, not calendar days. | PR 3 (`sent_days` in `sending_domain_capacity`; `domainDailyCap(sentDays)`) |
| D16 | A **second reputation hold within 30 days pages the platform** instead of offering the owner Resume. | PR 7 (`sending_domains.resume_by`) |
| D17 | A **separate cold-only link and reply domain before scale**. | PR 8 (`UNSUBSCRIBE_ORIGIN`, `COLD_REPLY_DOMAIN`, the runbook's "Before scale") |
| D18 | Reputation also held on the rates the product can see: **unsubscribes** now, "no" replies when Part 5 reads them, beside Postmaster Tools. | PR 7 (the `unsubscribes` hold); Postmaster Tools is §0.4 |
| D19 | A **nudge keeps "Re:"**: it threads under the step before it. | PR 6 (the nudge's parent is our own first email) |
| — | A "wait" refusal (at the cap, a domain not ready) **defers** a send, never cancels it (C5, C8). | PR 5 (the reconcile) |
| — | The door is **keyed by lead**. | PR 3 (`outreach_facts` takes `p_lead_id`) |
| — | **One capacity read** shared by the timetable, the claim and the door. | PR 3 (`sending_domain_capacity`) |
| — | C7 is an **atomic SQL claim**. | PR 3 (`reach_out_claim`, an advisory lock per domain) |
| — | Every cold row **carries its `contact_id`** (and its lead, its send, its step). | PR 6 (`meta.reach_out`) |

### 0.2 This plan's own (E1–E12), with why

- **E1. A table of its own for a reach-out's recipients, `reach_out_sends`, not `broadcast_recipients`.**
  - `broadcast_recipients` is keyed `(broadcast_id, contact_id)` with `contact_id NOT NULL` (00046:41-50), and a lead has no person until its first send (§4.2).
  - It has no `send_at`, domain or attempt, and its states are final after one move (00116:25-43; 00182 lets only the claim settle).
  - Widening it would re-key a live table the WhatsApp sender writes every run.
  - A run is still a `broadcasts` row (one per step per day, `broadcasts_playbook_run`, 00048:39-42), so approval, the Broadcasts page and Reports keep one object.
- **E2. The sender is a clock over `outbound_send`, not a new branch of `broadcast_send` (C12 settled this way).** Each claimed send becomes one queued email row plus one `outbound_send` job, the path every email reply already takes (`reply.ts:363-384`; `send.ts`; `handlers.ts:37-73`).
  - The rows-first rule (`deliver.ts:537-540`: an email leaves only from a pre-written queued row whose `idempotency_key` is its id) holds by construction.
  - `settle.ts` already settles a dead `outbound_send` (`:186-233`).
  - `SPEAKS_TO_A_PERSON` already gives up a second claim (`ledger.ts:85`).
  - No new job kind means no `jobs_kind_check`, `JOB_WORK` or `store-retired` pin to move (the maps' constraint list).
- **E3. A send's outcome is read from its message row, never written twice.**
  - Each tick the clock reconciles: sent/delivered/read → `sent`; failed with outcome unknown → still `queued`; failed → `failed`; canceled with a wait refusal → `planned` again (C5); canceled otherwise → `skipped`.
  - The row's reason is the door's own word (`DELIVERY_REFUSALS`), so the thread, the run's report and Reports say one thing.
- **E4. An attempt has its own message id: `sendMessageId(send.id, attempts)`, a v5-shaped uuid.** It follows the `runIdFor` precedent (`core/leads/ids.ts:16-20`).
  - A deferred send's second attempt is a new row under a new Resend idempotency key.
  - A retry of the same attempt meets the same row (`messages.id` primary key).
  - This settles C8 and the maps' 24-hour idempotency caveat.
- **E5. The person is made when the send is claimed, before its row is written, by a service-role door `reach_out_person`.**
  - The unsubscribe token needs the contact (`unsubscribe-token.ts:39-50`), the door needs a conversation and `contacts.email = to` (`deliver.ts:390-399`), and `outreach_facts` finds the lead through the person.
  - The door switches off `contacts_link_lead` for its own insert. That trigger would set the lead `converted` and could link a newer lead with the same address (00140:819-868).
  - The lead moves to `nurture` / `emailed` only when the email is sent (the reconcile), never at the claim.
- **E6. The timetable is planned at assembly and re-planned when a send is deferred, a run is approved late, or a paused chain resumes.**
  - A paused chain's sends are not claimed (the claim joins `playbooks.state`), so pausing clears nothing and resuming re-plans what went stale.
  - This is the spec's "pausing clears the future `send_at`s; resuming rebuilds them" (§4.5) with one writer instead of two.
- **E7. The first run of a chain always waits for approval (`pending_approval`). A later run follows the class `outreach`'s mode, seeded `veto`: thirty minutes to be stopped (`PLAYBOOK_VETO_DELAY_MS`, `playbook-triggers.ts:118`), or `ask` (it waits too), or `never`.** There is no `auto`: cold email never goes the moment a run is made (`POLICY_CLASS_MODES.outreach`). This is §4.8's rule, with the owner's switch honest.
- **E8. The month's allowance per workspace is `REACH_OUT_MONTH_EMAILS = 2000`**, the spec's number (§4.8, "1,940 of 2,000"). It is counted from `messages` with `meta.source = 'reach_out'` that left this calendar month in the workspace's zone.
  - A workspace that may not spend (`maySpend`, `billing.ts:145-161`) sends nothing and its run says why.
  - The number is a price, so it is Ruben's to change (§0.3); it is one constant.
- **E9. A reach-out step's words are a `templates` row on `channel = 'email'`** (the channel is already in the set: `schema-sets.generated.ts:133`).
  - HEADER is the subject, BODY the body. Slots are `{{business}}`, `{{city}}` and `{{your business}}` in Part 3; Part 4 adds `{{your name}}`, `{{booking link}}`, `{{opening}}` and the validator.
  - A slot with no value skips the send as `missing_value`, the reason that exists (`broadcast.ts:170-186`).
- **E10. Nothing in Part 3 is drawn.**
  - The two triggers are in `PLAYBOOK_TRIGGERS` (the schema-set pin is Exactly, `schema-sets.ts:131`) but never offered (`triggerOffered`).
  - `listPlaybooks` lists moments only; the playbooks sweep hands a reach-out row to its own verb.
  - Part 4 draws the sheet, the Leads door and the words.
  - Part 3 is proved end to end by a database-backed integration test (PR 9), not by a page.
- **E11. The clock runs every minute (`* * * * *`) and calls the edge only when something is due** (a planned send whose time came, or a queued send waiting on its outcome). It is registered in `sweep_status` with a 5-minute silence, as the domains clock is (00175:104-131).
- **E12. Wait refusals are a named set in contracts, `OUTREACH_WAIT_REFUSALS = ["sending_domain_at_cap", "sending_domain_not_ready"]`.**
  - The reconcile defers on these and skips on every other refusal.
  - The door's refusal words for the cap already promise "It goes when there is room" (`consent.ts:170-171`); this makes it true.

### 0.3 Still Ruben's (with the default the code ships)

- **The month's allowance** (E8): 2,000 emails per workspace per calendar month until the price of cold email is set (decision 0011 v2's tiers, draft #1039).
- **The cold-only domain** (D17): which domain to buy for links and replies, and its DNS. PR 7 ships the switches with today's addresses as defaults; the runbook says what to set.
- **The secrets** already owed: `UNSUBSCRIBE_SECRET` (both projects), `RESEND_COLD_API_KEY`, `RESEND_COLD_WEBHOOK_SECRET`, and a yes for the one DKIM send. Until they are set, the clock claims nothing and its sweep says which is missing (C13).

### 0.4 Out of Part 3, on purpose

- **Postmaster Tools (D18's third leg).** Google's API reports a domain's reputation only after a domain is verified in Postmaster and sends enough daily volume to Gmail, and it needs a Google Cloud project and OAuth consent Ruben must create. It is its own part, after the first domains have volume; §0.1's unsubscribe-rate hold is the signal the product has from day one.
- The words and pages (Part 4), the reply classifier and dated steps (Part 5), Reports (Part 6).

---

## 1. The facts this builds on (read 25 Sep 2026)

- **playbooks**
  - Created 00048:12-36.
  - Latest trigger CHECK 00167:37-40 (`quiet_30, new_week, phoned_only, everyone_monthly, visit_tomorrow, visited, lapsed, saved_list, proposal_waiting`); latest `policy_class` CHECK 00167:33-35 (`reengage, campaign, booking, follow_up`); `policies_class_check` 00167:29-31.
  - Latest column UPDATE grant 00168:24-27; `last_run_*` are service-role only.
  - `provision_tenant` latest body 00167:53-77.
  - One run per playbook per day: `broadcasts_playbook_run (playbook_id, run_for)` (00048:39-42).
- **Closed sets**
  - `packages/contracts/src/schema-sets.generated.ts` (regenerated by `corepack pnpm gen:schema-sets`), pinned by `schema-sets.ts`:
    - `PLAYBOOK_TRIGGERS` Exactly `playbooks.trigger` (:131)
    - `playbooks.policy_class` Within `POLICY_CLASSES` (:132)
    - `POLICY_CLASSES` Exactly `policies.class` (:123)
  - `PLAYBOOK_CLASS_LABEL: Record<PlaybookPolicyClass,…>` (`playbook-reach.ts:273-278`) and `POLICY_CLASS_WORDS: Record<PolicyClass,…>` (`config.ts:97`) fail the build without an entry.
  - `playbookRunReach` falls through to "everyone" for any kind it does not know (`playbook-reach.ts:121-138`).
- **broadcasts**: `template_id NOT NULL → templates` (00046:20); states `pending_approval|scheduled|sending|sent|canceled|failed` (00048:45-47); guard `broadcasts_guard` (00106:24-50); approval `core/campaigns/approve.ts:21-73`; cancel `cancel.ts:20-39`.
- **leads** (00140:197-232 and 00144:20-31)
  - `stage ready|nurture|converted|archived`, `closed_reason said_no|not_a_fit|customer|stale|search_removed`, `email_state none|checking|ok|catch_all|unknown|invalid`, `last_outcome` (no CHECK; `lead_set_stage` checks it, 00142:175).
  - `region` is a two-letter state (`core/leads/clean.ts:31`); `hours jsonb [{day, hours}]` in the listing's words (00144:34).
  - `contact_id`, `contacted_at`, `version`.
- **The lead link trigger**: `contacts_link_lead` → `lead_link_contact()` (00140:819-868). On a service-role insert it links the newest lead with the same phone or email, sets `converted`, and bumps no version.
- **Searches and suppressions**
  - `lead_search_members` (00140:262-283): class `qualified|review|excluded`, `counted`, `blanked_at`.
  - `lead_suppressions (kind email|place|phone, what email_opt_out|customer|erased, hash)` via `lead_suppression_hash(tenant, value)` (00140:340-348, 527-537).
- **The door**
  - `deliver.ts` `refusalFor` (:369-457), `outreachFacts` (:318-360), `kindOf` (:186-194).
  - `outreach_facts(p_tenant_id, p_contact_id, p_to, p_host, p_since)` (00181), service role.
  - A refusal of a queued email cancels its row with `error {reason}` (:549-566).
- **The email path**
  - `buildEmailRequest(EmailRequestInput)` (`channels/src/email.ts:66-90, 232-270`), with `campaign {unsubscribeUrl, footer, footerHtml?}` and `parent: EmailParent | null` (:18-26).
  - `ownDomainIdentity(domain, mailbox, mailDomain)` (:703-713).
  - `campaignFooter` / `campaignFooterHtml` / `whyFrom` (`contracts/reach-out.ts:10-63`).
  - `signUnsubscribeToken` / `unsubscribeUrl` (`channels/unsubscribe-token.ts`); edge `env.UNSUBSCRIBE_SECRET`, `dashboardOrigin()`.
  - `emailWireFor` (`apps/edge/lib/email/email.ts:46-70`).
  - `outbound_send` payload `{message_id, conversation_id, to_email, purpose, proactive}` (`handlers.ts:37`, `send.ts:21-22, 56-79`).
- **Domains**
  - `DOMAIN_RAMP` and `domainDailyCap(cleanSince, nowMs)` (`contracts/sending-domains.ts:45-66`); `judgeDomain` / `reputationHoldOf` (:159-276).
  - Hold history lives only in `events` `sending_domain.held {host, why, …}` (`apps/edge/lib/email/sending-domains.ts:391-424`); `domainHeldSince` (`db/repositories/sending-domains.ts:226-243`).
  - `email_sent_at`, `email_left`, `email_from_host` SQL helpers (00180, 00179, 00176).
- **Clocks**
  - `request_sweep` (00086:45-76); `sweep_status` register and `sweep_status_registered` (00107:18-95); `EVERY_CLOCK` (`sweep-registry.db.test.mjs:58-98`).
  - Every cron and jobs door needs a `vercel.json` limit (`ops-hygiene.test.mjs`).
  - `/api/health` is red whenever a scheduled job is overdue by two minutes (`platform.ts:527`), so pacing uses future times on the send rows and never leaves due jobs unclaimed.
- **Zones**: `zoneOffsetMs`, `localToUtcMs(tz, y, m, d, hh, mm)`, `clockInZone`, `dayInZone`, `dayPlusInZone` (`contracts/availability.ts:105-173`). There is no state→zone map and no multi-range hours parser (`lead-helpers.ts:5-8` reads one range, display only).

---

## 2. The flow, end to end

```
playbooks sweep (hourly, :05)           reach-out clock (every minute)
  a reach_out step due today              1. reconcile: queued sends <- their message rows
  -> runReachOut                          2. finish: a run whose sends are all final is sent
     audience (SQL reach_out_audience)    3. claim, per domain with due sends:
     or the parent's sent leads              reach_out_claim (lock; cap - used)
     -> broadcasts row (ask | veto)          -> reach_out_person (the person, once)
     -> reach_out_sends planned             -> the frozen request (words, identity,
        (timetable: domain + send_at)          footer, token, nudge parent)
  approve (first run) -> re-plan             -> messages row queued + outbound_send job
                                             -> send: queued
jobs tick (10 s) -> outbound_send -> sendQueued -> deliver (the door) -> Resend (cold key)
receipts (webhook) -> the message row; a bounce -> the lead's email_state invalid
```

---

## 3. Files

**New**
- `supabase/migrations/00183_a_reach_out_is_a_chain_of_playbooks.sql`: the columns, the CHECKs, `reach_out_sends`, the class, the provisioner (PR 1).
- `supabase/migrations/00184_a_domain_has_one_capacity.sql`: `sending_domain_capacity`, `outreach_facts` keyed by lead, `reach_out_audience`, `reach_out_followers`, `reach_out_person`, `reach_out_claim`, the link switch (PR 3).
- `supabase/migrations/00185_the_reach_out_clock.sql`: `trigger_reach_out_sweep`, its register row, its schedule (PR 5).
- `supabase/migrations/00186_a_domain_is_held_for_its_unsubscribes.sql`: `resume_by`, the `unsubscribes` hold and its count (PR 7).
- `packages/contracts/src/us-zones.ts`: the 50 states and DC → one IANA zone each (PR 2).
- `packages/contracts/src/lead-hours.ts`: a listing's hours → open windows per weekday (PR 2).
- `packages/contracts/src/reach-out-timetable.ts`: `timetable()` (PR 2).
- `packages/contracts/src/reach-out-rules.ts`: `outreachRefusalOf`, `OUTREACH_WAIT_REFUSALS`, `sendMessageIdParts`, `REACH_OUT_MONTH_EMAILS`, `reachOutSlots` (PR 2).
- `packages/db/src/repositories/reach-out.ts`: every read and write of `reach_out_sends` and the four doors (PR 3).
- `packages/core/src/campaigns/run-reach-out.ts` and `reach-out-ports.ts`: assembling a step's run (PR 4).
- `apps/edge/lib/reach-out/`: `run-context.ts` (PR 4), `reconcile.ts` (PR 5), `sender.ts` and `request.ts` (PR 6).
- `apps/edge/api/cron/reach-out.ts`: the clock's door (PR 5).
- Tests (`tooling/scripts/tests/`):
  - `us-zones.test.mjs`, `lead-hours.test.mjs`, `reach-out-timetable.test.mjs`, `reach-out-rules.test.mjs` (PR 2)
  - `reach-out-doors.db.test.mjs` (PR 3)
  - `core-run-reach-out.test.mjs` (PR 4)
  - `cron-reach-out-door.test.mjs` (PRs 5 and 6), `reach-out-request.test.mjs` (PR 6)
  - `reach-out.integration.db.test.mjs` (PR 9)

**Modified (principal)**
- `packages/contracts/src/{playbook-triggers.ts, playbook-reach.ts, config.ts, consent.ts, sending-domains.ts, enums.ts, schema-sets.ts, index.ts}`
- `packages/core/src/deliver.ts`
- `packages/db/src/repositories/{outreach.ts, sending-domains.ts, email.ts}`
- `apps/edge/api/cron/playbooks.ts`, `apps/edge/lib/playbooks.ts`, `apps/edge/lib/ops/sweep-rotation.ts`, `apps/edge/lib/email/{email-receipts.ts, sending-domains.ts}`
- `apps/dashboard/src/server/playbooks.ts`
- `apps/edge/vercel.json`, `apps/edge/lib/env.ts`, `apps/edge/.env.example`
- `tooling/scripts/tests/sweep-registry.db.test.mjs`
- docs

---

## 4. The PRs

Each is cut from `main` after the one before it merges, and each is shippable on its own.
- **Migration-first:** each migration goes to production (dry run, push, read back) before its PR merges.
- **Deploy order:** either, unless a PR says otherwise.
- **The gate, every PR:** `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`, `test:db` on the private stack with the migration applied, `git status` clean of dist drift, one combined review, fixes, CI green, squash-merge.

| PR | Branch | What it does | Migration |
| --- | --- | --- | --- |
| 1 | `reach-out-3a-objects` | the chain's columns and CHECKs, `reach_out_sends`, the class, the sets; nothing runs | 00183 |
| 2 | `reach-out-3b-clock-of-a-lead` | zones, hours, `timetable()`, the rules (pure) | none |
| 3 | `reach-out-3c-doors` | one capacity read, the door keyed by lead, D15, the audience, the person, the claim | 00184 |
| 4 | `reach-out-3d-the-run` | `runReachOut`: a step's run assembled, approved, planned | none |
| 5 | `reach-out-3e-the-clock` | the clock: reconcile, closed runs, stale sends, finishing; nothing claimed (C5) | 00185 |
| 6 | `reach-out-3f-the-sender` | the claim and the write: the person, the frozen request, the row and its job; C6–C10, C13, C14, D19 | none |
| 7 | `reach-out-3g-holds` | C11, D16, D18 (unsubscribes) | 00186 |
| 8 | `reach-out-3h-cold-domains` | D17's switches and the runbook | none |
| 9 | `reach-out-3i-proof` | the integration test over a replayed stack; docs; As built | none |

---

## PR 1 — The objects (00183)

Nothing runs after this PR. It gives the chain its columns and rules, the recipients their table, and the class its
row, and it teaches every reader of playbooks that a reach-out is not a moment.

### Task 1.1: The migration

**Files:**
- Create: `supabase/migrations/00183_a_reach_out_is_a_chain_of_playbooks.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00183 · A reach-out is a chain of playbooks, and each lead it writes to is a send.
--
-- Reach out, Part 3 (docs/superpowers/plans/2026-09-25-reach-out-part-3-the-engine.md, PR 1). Nothing sends yet.
--
--   playbooks            gains kind ('moment' | 'reach_out'), and for a reach-out: lead_search_id (the root's
--                        audience), after_playbook_id + after_days (a step after the one before it), gap_minutes (the
--                        pace) and domain_ids (empty = every verified domain). The trigger set gains lead_first and
--                        after_step, the class set outreach; one shape CHECK ties them together.
--   policies             gains the class outreach, veto for every workspace and in the provisioner: a chain's first
--                        run always waits for its owner, and a later one gives thirty minutes to be stopped.
--   reach_out_sends      one row per lead in a step's run: when it goes, from which domain, and how it went.
--   sessions             write none of the new columns, and insert no reach-out: until the reach-out sheet's door
--                        exists (Part 4), only the service role makes a chain. A step's parent and a root's search are
--                        its own workspace's (composite keys).

set local lock_timeout = '3s';

alter table public.playbooks
  add column if not exists kind text not null default 'moment',
  add column if not exists lead_search_id uuid,
  add column if not exists after_playbook_id uuid,
  add column if not exists after_days int,
  add column if not exists gap_minutes int,
  add column if not exists domain_ids uuid[] not null default '{}';

alter table public.playbooks drop constraint if exists playbooks_kind_check;
alter table public.playbooks add constraint playbooks_kind_check check (kind in ('moment', 'reach_out'));

alter table public.playbooks drop constraint if exists playbooks_trigger_check;
alter table public.playbooks add constraint playbooks_trigger_check check (trigger in (
  'quiet_30', 'new_week', 'phoned_only', 'everyone_monthly', 'visit_tomorrow', 'visited', 'lapsed', 'saved_list',
  'proposal_waiting', 'lead_first', 'after_step'));

alter table public.playbooks drop constraint if exists playbooks_policy_class_check;
alter table public.playbooks add constraint playbooks_policy_class_check check (policy_class in (
  'reengage', 'campaign', 'booking', 'follow_up', 'outreach'));

-- One shape per kind: a reach-out is outreach on one of its two triggers, a root has a search and no parent, a step
-- has a parent and a delay; a moment carries none of it.
alter table public.playbooks drop constraint if exists playbooks_reach_out_shape;
-- Each branch is coalesced to false: a CHECK passes on NULL, and a NULL pace or delay must not pass for a value.
alter table public.playbooks add constraint playbooks_reach_out_shape check (
  case kind
    when 'reach_out' then coalesce(
      policy_class = 'outreach'
      and gap_minutes is not null and gap_minutes between 5 and 120
      and case trigger
            when 'lead_first' then lead_search_id is not null and after_playbook_id is null and after_days is null
            when 'after_step' then after_playbook_id is not null and after_days is not null
                                    and after_days between 2 and 30 and lead_search_id is null
            else false
          end, false)
    else coalesce(
      policy_class <> 'outreach' and trigger not in ('lead_first', 'after_step')
      and lead_search_id is null and after_playbook_id is null and after_days is null and gap_minutes is null
      and domain_ids = '{}', false)
  end);

-- A step's parent and a root's search are its own workspace's: keyed by (tenant_id, id), so no row can point across.
alter table public.playbooks drop constraint if exists playbooks_tenant_id_id_key;
alter table public.playbooks add constraint playbooks_tenant_id_id_key unique (tenant_id, id);
alter table public.lead_searches drop constraint if exists lead_searches_tenant_id_id_key;
alter table public.lead_searches add constraint lead_searches_tenant_id_id_key unique (tenant_id, id);
alter table public.playbooks drop constraint if exists playbooks_after_same_workspace;
alter table public.playbooks add constraint playbooks_after_same_workspace
  foreign key (tenant_id, after_playbook_id) references public.playbooks (tenant_id, id) on delete cascade;
alter table public.playbooks drop constraint if exists playbooks_search_same_workspace;
alter table public.playbooks add constraint playbooks_search_same_workspace
  foreign key (tenant_id, lead_search_id) references public.lead_searches (tenant_id, id) on delete restrict;

-- A chain, not a tree: one next step per step.
create unique index if not exists playbooks_one_next on public.playbooks (after_playbook_id)
  where after_playbook_id is not null;
create index if not exists playbooks_lead_search on public.playbooks (lead_search_id) where lead_search_id is not null;

-- Sessions: 00168's column grant stands as it is, so none of the new columns is a session's to write (a column grant
-- names its columns: 00121). And a session inserts moments only: a reach-out is the service role's to make until the
-- reach-out sheet's own door exists (Part 4), so no chain runs without the checks that door makes.
drop policy if exists playbooks_acting_insert on public.playbooks;
create policy playbooks_acting_insert on public.playbooks
  for insert to authenticated
  with check (public.is_acting_member(tenant_id) and created_by = (select auth.uid()) and kind = 'moment');

/* ------------------------------------------------------------------- the class -- */

alter table public.policies drop constraint if exists policies_class_check;
alter table public.policies add constraint policies_class_check check (class in (
  'reply', 'booking', 'faq', 'reengage', 'campaign', 'reviews', 'money', 'follow_up', 'outreach'));

insert into public.policies (tenant_id, class, mode, limits)
select t.id, 'outreach', 'veto', '{}'::jsonb from public.tenants t
on conflict (tenant_id, class, subject_type, subject_id) do nothing;

-- 00167's provisioner with one more class.
create or replace function public.provision_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.policies (tenant_id, class, mode, limits)
  select p_tenant_id, c.class, c.mode,
         case when c.class = 'reply'
              then '{"max_replies_day": 20, "pause_hours": 24}'::jsonb
              else '{}'::jsonb end
  from (values
    ('faq','auto'), ('booking','auto'), ('reply','auto'),
    ('reengage','ask'), ('campaign','ask'), ('reviews','ask'), ('money','never'), ('follow_up','ask'),
    ('outreach','veto')
  ) as c(class, mode)
  on conflict (tenant_id, class, subject_type, subject_id) do nothing;

  insert into public.tenant_config (tenant_id) values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  insert into public.billing_accounts (tenant_id, mode, status) values (p_tenant_id, 'stripe', 'none')
  on conflict (tenant_id) do nothing;
end $$;

/* ------------------------------------------------------------ the sends -- */

create table if not exists public.reach_out_sends (
  id            uuid primary key,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  broadcast_id  uuid not null references public.broadcasts (id) on delete cascade,
  playbook_id   uuid references public.playbooks (id) on delete set null,
  -- The chain's root (its lead_first step): a lead is written to once per chain, whichever step.
  root_id       uuid not null references public.playbooks (id) on delete cascade,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  contact_id    uuid references public.contacts (id) on delete set null,
  domain_id     uuid references public.sending_domains (id) on delete set null,
  send_at       timestamptz,
  state         text not null default 'planned'
                check (state in ('planned', 'claimed', 'queued', 'sent', 'skipped', 'failed')),
  reason        text check (reason is null or char_length(reason) <= 60),
  attempts      int not null default 0 check (attempts between 0 and 20),
  message_id    uuid references public.messages (id) on delete set null,
  claimed_at    timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (broadcast_id, lead_id),
    -- A planned send has its time; its domain may be gone (a removed domain), and the clock plans it on another. A queued
  -- or sent send's email row may be gone too (an erasure deletes it): the clock skips a queued one, and a sent one
  -- keeps when it left. Nothing an erasure or a removal takes away is required here.
  constraint reach_out_sends_planned_is_timed check (state <> 'planned' or send_at is not null),
  constraint reach_out_sends_sent_is_dated check (state <> 'sent' or sent_at is not null)
);

create index if not exists reach_out_sends_due on public.reach_out_sends (domain_id, send_at) where state = 'planned';
create index if not exists reach_out_sends_open on public.reach_out_sends (tenant_id, state) where state in ('claimed', 'queued');
create index if not exists reach_out_sends_lead on public.reach_out_sends (tenant_id, lead_id);
create index if not exists reach_out_sends_chain on public.reach_out_sends (root_id, lead_id);
create index if not exists reach_out_sends_message on public.reach_out_sends (message_id) where message_id is not null;
create index if not exists reach_out_sends_run on public.reach_out_sends (broadcast_id, state);

drop trigger if exists reach_out_sends_updated_at on public.reach_out_sends;
create trigger reach_out_sends_updated_at before update on public.reach_out_sends
  for each row execute function extensions.moddatetime('updated_at');

-- The moves, and only these. A deferred send goes back to planned (a wait refusal, C5); sent, skipped and failed
-- are final. A same-state update is not a move.
create or replace function public.reach_out_sends_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.state is distinct from OLD.state then
    if not (
      (OLD.state = 'planned' and NEW.state in ('claimed', 'skipped')) or
      (OLD.state = 'claimed' and NEW.state in ('queued', 'planned', 'skipped', 'failed')) or
      (OLD.state = 'queued' and NEW.state in ('sent', 'planned', 'skipped', 'failed'))
    ) then
      raise exception 'reach_out_sends.state moves % -> % refused', OLD.state, NEW.state;
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists reach_out_sends_guard on public.reach_out_sends;
create trigger reach_out_sends_guard before update on public.reach_out_sends
  for each row execute function public.reach_out_sends_guard();

alter table public.reach_out_sends enable row level security;
drop policy if exists reach_out_sends_member_select on public.reach_out_sends;
create policy reach_out_sends_member_select on public.reach_out_sends
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.reach_out_sends from anon, authenticated;
grant select on public.reach_out_sends to authenticated;
grant all on public.reach_out_sends to service_role;

comment on table public.reach_out_sends is
  'Reach out: one lead in one step''s run. Planned (a time and a domain), claimed under the domain''s capacity, queued as an email row with its outbound_send job, then what that row became. Written by the service role only (the reach-out clock, apps/edge/lib/reach-out).';
```

- [ ] **Step 2: Check the shapes it copies are still the ones on `main`**

Run: `grep -n "sending_domains_member_select" -A2 supabase/migrations/00175_*.sql; grep -n moddatetime supabase/migrations/00048_playbooks.sql`
Expected: the member policy reads `tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid()))`, and the updated_at trigger is `extensions.moddatetime('updated_at')`. Those are the two shapes this migration copies.

- [ ] **Step 3: Apply to the private stack and regenerate what the schema drives**

```bash
S="$SCRATCH/reach-stack"; CLI="$HOME/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"
cp supabase/migrations/00183_a_reach_out_is_a_chain_of_playbooks.sql "$S/supabase/migrations/"
"$CLI" migration up --local --workdir "$S"
SUPABASE_WORKDIR="$S" SUPABASE_CLI="$CLI" corepack pnpm gen:schema-sets
SUPABASE_WORKDIR="$S" SUPABASE_CLI="$CLI" corepack pnpm gen:db-types
```
Expected: `schema-sets.generated.ts` gains `playbooks.kind`, the two triggers, `outreach` in both class sets and
`reach_out_sends.state`; `database.types.ts` gains the table and the columns. `schema-sets.ts` now fails to compile
until Task 1.2 (the Exactly pins), which is the point.

### Task 1.2: The contracts learn the kind, the triggers and the class

**Files:**
- Modify: `packages/contracts/src/playbook-triggers.ts` (`PLAYBOOK_TRIGGERS`, `triggerOffered`)
- Modify: `packages/contracts/src/config.ts:79-97` (`POLICY_CLASSES`, `POLICY_CLASS_WORDS`)
- Modify: `packages/contracts/src/playbook-reach.ts:121-138, 273-278`
- Modify: `packages/contracts/src/enums.ts` (`REACH_OUT_SEND_STATES`) and `schema-sets.ts` (its pin)
- Test: `tooling/scripts/tests/playbooks.test.mjs` (or the file that pins `PLAYBOOK_TRIGGERS`; `grep -ln "PLAYBOOK_TRIGGERS" tooling/scripts/tests`)

- [ ] **Step 1: Write the failing tests**

```js
// In the playbook triggers' test file.
test("a reach-out's two triggers are known and never offered: Part 4's sheet makes them, not the moments' composer", () => {
  for (const id of ["lead_first", "after_step"]) {
    const t = PLAYBOOK_TRIGGERS.find((x) => x.id === id);
    assert.ok(t, id);
    assert.equal(t.kind, "reach_out");
    assert.equal(t.cls, "outreach");
    assert.equal(triggerOffered(t, { hasLists: true, hasVisits: true, dealsOn: true }), false, id);
  }
});

test("a reach-out never reaches the moments' audience: no fall-through to everyone", () => {
  const reach = playbookRunReach(
    { trigger: "lead_first", policy_class: "outreach", cap_per_run: 25, gap_days: 90, cadence_days: 30 },
    { people: [person({ id: "k1" })], touches: NO_TOUCHES, now: NOW },
  );
  assert.equal(reach.sending.length, 0);
});
```
Use the file's own `person`, `NO_TOUCHES` and `NOW` fixtures; if its `triggerOffered` takes other arguments, pass what its existing tests pass.

- [ ] **Step 2: Run them to see them fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/playbooks.test.mjs`
Expected: FAIL (no such trigger; `sending.length` is 1, the fall-through).

- [ ] **Step 3: Implement**

`playbook-triggers.ts`, in `PLAYBOOK_TRIGGERS` (the entry shape is `{id,label,list,cls,kind,hint}`):
```ts
  // Reach out (Part 3): a chain's root over a lead search, and a step after the one before it. Made by the reach-out
  // sheet (Part 4), never offered among the moments.
  { id: "lead_first", label: "Businesses a search found", list: null, cls: "outreach", kind: "reach_out", hint: "The first email of a reach-out" },
  { id: "after_step", label: "After the step before", list: null, cls: "outreach", kind: "reach_out", hint: "A nudge, days after the step before" },
```
Widen the entry's `kind` union with `"reach_out"`. In `triggerOffered`, first line:
```ts
  if (t.kind === "reach_out") return false;
```

`config.ts`: add `"outreach"` to `POLICY_CLASSES`, and to `POLICY_CLASS_WORDS`:
```ts
  outreach: { name: "Cold email to businesses a search found", short: "Reach-outs", note: "every email a reach-out sends" },
```

`playbook-reach.ts`:
- Before the audience switch at :121, add `if (t.kind === "reach_out") return { sending: [], held: [], reason: "reach_out" };`. Match `RunReach`'s real field names (`:65-84`); if it has no `reason`, return the empty reach its "no one" branch returns.
- In `PLAYBOOK_CLASS_LABEL` add `outreach: "Reach-outs"`.

`enums.ts`: `export const REACH_OUT_SEND_STATES = ["planned", "claimed", "queued", "sent", "skipped", "failed"] as const;`
In `schema-sets.ts` add a pin beside `:128-130`: `Exactly(REACH_OUT_SEND_STATES, "reach_out_sends.state")`, in the file's own pin syntax.

- [ ] **Step 4: Run the tests and the build**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && node --conditions=react-server --import tsx --test tooling/scripts/tests/playbooks.test.mjs tooling/scripts/tests/schema-sets*.test.mjs`
Expected: PASS; typecheck clean (every `Record<PolicyClass|PlaybookPolicyClass,…>` has its entry).

### Task 1.3: Readers of playbooks read moments

**Files:**
- Modify: `apps/edge/lib/ops/sweep-rotation.ts:117-130` (`playbooksDue`)
- Modify: `apps/dashboard/src/server/playbooks.ts:402-480` (`listPlaybooks`) and `triggerPools` (`:250-398`)
- Test: `tooling/scripts/tests/cron-playbooks-door.test.mjs` (or the playbooks sweep's door test), `tooling/scripts/tests/playbooks-list.test.mjs` (or the list's test: `grep -ln "listPlaybooks" tooling/scripts/tests`)

- [ ] **Step 1: The failing tests**
  - The sweep: a world with one running `kind: "reach_out"` row and one moment. The sweep runs only the moment (`runPlaybook` is never given the reach-out; it gets its own verb in PR 4).
  - The list: a reach-out row in the table is not in `GET /api/v1/playbooks`' `playbooks`.

- [ ] **Step 2: Implement**
  - `playbooksDue`: add `.eq("kind", "moment")` to its query. PR 4 adds a second page for reach-outs.
  - `listPlaybooks`: add `.eq("kind", "moment")` to the first read. Its existing column-missing fallback (`:406-423`, the re-read without new columns) must also drop the `kind` filter when the error is a missing column, so a dashboard deployed before 00183 still lists playbooks.
  - `triggerPools`: nothing to add; `triggerOffered` already hides the two.

- [ ] **Step 3: Run, then the full gate** (§4). Expected: all green; `database.yml`'s `gen:schema-sets --check` passes on the regenerated file.

### Task 1.4: The database test

**Files:**
- Create: `tooling/scripts/tests/reach-out-objects.db.test.mjs`

- [ ] **Step 1: Write it** (the `outreach-facts.db.test.mjs` shape: local stack only, two workspaces, `before`/`after`)

It proves:
- A reach-out root without a `lead_search_id` is refused by `playbooks_reach_out_shape`.
- A moment with `gap_minutes` is refused.
- A step with `after_days: 1` is refused.
- A second step after the same parent is refused (`playbooks_one_next`).
- A send moves `planned → claimed → queued → sent` and refuses `sent → planned`, `planned → queued` and `skipped → planned`.
- A planned send without a time is refused. One whose domain was removed stays planned with no domain, and an erased
  email row leaves its sent send standing (the CHECKs never require what a deletion takes away: PR 1's review).
- A session inserts no reach-out, and writes none of the new columns. A step under another workspace's root is refused
  (`playbooks_after_same_workspace`).
- A member session can read its own workspace's sends and not another's.
- An `authenticated` session cannot insert or update a send.
- Every tenant has an `outreach` policy row with mode `veto`.

Use a real lead (insert into `leads` as `lead-engine.db.test.mjs` does) and an email template row (`templates` with `channel: 'email'`, `source: 'chanlytics'`, `category: 'marketing'`, `meta_status: 'approved'`, `components: [{type:'HEADER',text:'Your quotes'},{type:'BODY',text:'Hi {{business}}'}]`) for the broadcast's `template_id`.

- [ ] **Step 2: Run it against the stack with 00183 applied**, then `test:db` whole. Expected: PASS; the privileges suite passes (the new table has RLS, no anon grant, and its guard pins `search_path`).

- [ ] **Step 3: Production (before merging).** Dry run, push, read back:
  - the column list of `playbooks`;
  - `select count(*) from policies where class = 'outreach'` = the tenant count;
  - `has_table_privilege('anon', 'public.reach_out_sends', 'select')` = false.

- [ ] **Step 4: Commit, review, PR** ("Reach out 3 (1 of 9): a reach-out is a chain of playbooks; nothing sends yet").

---

## PR 2 — The clock of a lead (pure)

Everything here is pure contracts: no database, no runtime. It is the part of Part 3 most worth getting exactly right,
because every send's time comes from it.

### Task 2.1: A state's time zone

**Files:**
- Create: `packages/contracts/src/us-zones.ts`
- Modify: `packages/contracts/src/index.ts` (export it)
- Test: `tooling/scripts/tests/us-zones.test.mjs`

- [ ] **Step 1: The failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { US_STATE_ZONES, zoneOfRegion } from "@chanlytics/contracts";

test("every state, DC and Puerto Rico has one zone, and each is a zone the runtime knows", () => {
  assert.equal(Object.keys(US_STATE_ZONES).length, 52);
  for (const [state, zone] of Object.entries(US_STATE_ZONES)) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-US", { timeZone: zone }), `${state}: ${zone}`);
  }
});

test("a lead's region reads its zone in any case or spacing; anything else is no zone, never a guess", () => {
  assert.equal(zoneOfRegion("TX"), "America/Chicago");
  assert.equal(zoneOfRegion(" ca "), "America/Los_Angeles");
  assert.equal(zoneOfRegion("AZ"), "America/Phoenix", "Arizona keeps no daylight time");
  assert.equal(zoneOfRegion("Ontario"), null);
  assert.equal(zoneOfRegion(null), null);
});
```

- [ ] **Step 2: Run it: FAIL** (`zoneOfRegion` is not exported). Command: `corepack pnpm --filter @chanlytics/contracts build && node --test tooling/scripts/tests/us-zones.test.mjs`

- [ ] **Step 3: Implement**

```ts
/**
 * A US state's time zone, for the hours a business keeps (Reach out, Part 3). One zone per state, the one most of
 * its people live in. Where a state straddles two (the Florida panhandle, Indiana's and Michigan's western corners,
 * Kentucky, Tennessee's east, western Texas, Kansas, Nebraska, the Dakotas, Oregon, Idaho), a business on the far side
 * reads an hour off; the send window keeps half an hour clear of each end (lead-hours.ts), which absorbs most of it.
 * The finder is US-only (leads.region is a two-letter state, core/leads/clean.ts), so a region outside this map has
 * no zone, and the timetable falls back to the workspace's.
 */
export const US_STATE_ZONES = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver",
  NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
  UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver", PR: "America/Puerto_Rico",
} as const;

export type UsStateCode = keyof typeof US_STATE_ZONES;

export function zoneOfRegion(region: string | null | undefined): string | null {
  const code = (region ?? "").trim().toUpperCase();
  return (US_STATE_ZONES as Record<string, string>)[code] ?? null;
}
```

- [ ] **Step 4: Run it: PASS.** Then the cycle test (`contracts-import-cycles.test.mjs`): the new module imports nothing.

### Task 2.2: A listing's hours

**Files:**
- Create: `packages/contracts/src/lead-hours.ts`
- Test: `tooling/scripts/tests/lead-hours.test.mjs`

- [ ] **Step 1: The failing test** (real shapes: Apify's `openingHours`, `core/leads/cards.ts:183-186`, stored as `[{day, hours}]`)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { weekHoursOf, DEFAULT_WEEK } from "@chanlytics/contracts";

const h = (hh, mm = 0) => hh * 60 + mm;

test("a listing's week, as Maps words it: ranges, split days, closed days, all day, past midnight", () => {
  const { week, read } = weekHoursOf([
    { day: "Monday", hours: "9 AM to 6 PM" },
    { day: "Tuesday", hours: "9:30 AM to 12 PM, 1 to 5:30 PM" },
    { day: "Wednesday", hours: "Closed" },
    { day: "Thursday", hours: "Open 24 hours" },
    { day: "Friday", hours: "6 PM to 2 AM" },
    { day: "Saturday", hours: "10 AM–4 PM" },
  ]);
  assert.equal(read, true);
  assert.deepEqual(week.mon, [{ from: h(9), to: h(18) }]);
  assert.deepEqual(week.tue, [{ from: h(9, 30), to: h(12) }, { from: h(13), to: h(17, 30) }]);
  assert.deepEqual(week.wed, []);
  assert.deepEqual(week.thu, [{ from: 0, to: h(24) }]);
  assert.deepEqual(week.fri, [{ from: h(18), to: h(26) }], "past midnight runs on");
  assert.deepEqual(week.sat, [{ from: h(10), to: h(16) }], "an en dash is a range too");
  assert.deepEqual(week.sun, [], "a day the listing does not name is closed");
});

test("noon and midnight, and a range whose start borrows its end's meridiem", () => {
  const { week } = weekHoursOf([{ day: "Monday", hours: "12 PM to 12 AM" }, { day: "Tuesday", hours: "8 to 11 AM" }]);
  assert.deepEqual(week.mon, [{ from: h(12), to: h(24) }]);
  assert.deepEqual(week.tue, [{ from: h(8), to: h(11) }]);
});

test("hours nobody can read are the default week, and say so", () => {
  for (const hours of [null, [], [{ day: "Monday", hours: "Hours might differ" }], "9-5", { mon: "9-5" }]) {
    const out = weekHoursOf(hours);
    assert.equal(out.read, false, JSON.stringify(hours));
    assert.deepEqual(out.week, DEFAULT_WEEK);
  }
  assert.deepEqual(DEFAULT_WEEK.mon, [{ from: h(9), to: h(17) }]);
  assert.deepEqual(DEFAULT_WEEK.sat, []);
});
```

- [ ] **Step 2: Run it: FAIL.**

- [ ] **Step 3: Implement**

```ts
/**
 * A listing's hours as the send window reads them (Reach out, Part 3): Maps' own words ("9 AM to 6 PM",
 * "9:30 AM to 12 PM, 1 to 5:30 PM", "Closed", "Open 24 hours"), stored as `[{day, hours}]` (00144:34), turned into open
 * windows per weekday in minutes after the business's local midnight. A window past midnight runs on (6 PM to 2 AM is
 * 1080 to 1560). Hours that cannot be read are the default week, Monday to Friday, nine to five, and `read` says so;
 * the display readers (lead-facts.ts) are left as they are, since they read one range for a line of text.
 */
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export interface OpenWindow {
  from: number;
  to: number;
}
export type WeekHours = Record<WeekdayKey, OpenWindow[]>;

export const WEEKDAY_ORDER: readonly WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const NINE_TO_FIVE: OpenWindow[] = [{ from: 9 * 60, to: 17 * 60 }];
export const DEFAULT_WEEK: WeekHours = {
  mon: NINE_TO_FIVE, tue: NINE_TO_FIVE, wed: NINE_TO_FIVE, thu: NINE_TO_FIVE, fri: NINE_TO_FIVE, sat: [], sun: [],
};

const DAY_OF: Record<string, WeekdayKey> = {
  mon: "mon", monday: "mon", tue: "tue", tues: "tue", tuesday: "tue", wed: "wed", wednesday: "wed",
  thu: "thu", thur: "thu", thurs: "thu", thursday: "thu", fri: "fri", friday: "fri",
  sat: "sat", saturday: "sat", sun: "sun", sunday: "sun",
};

/** "9", "9:30", "12 PM", "noon": minutes after midnight, and whether a meridiem was said. Null for anything else. */
function timeOf(s: string): { min: number; meridiem: "am" | "pm" | null } | null {
  const t = s.trim().toLowerCase().replace(/\./g, "");
  if (t === "noon") return { min: 12 * 60, meridiem: "pm" };
  if (t === "midnight") return { min: 0, meridiem: "am" };
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? 0);
  if (hh < 1 || hh > 12 || mm > 59) return hh === 0 && !m[3] ? { min: mm, meridiem: null } : null;
  return { min: (hh % 12) * 60 + mm, meridiem: (m[3] as "am" | "pm" | undefined) ?? null };
}
const withMeridiem = (min: number, meridiem: "am" | "pm") => (meridiem === "pm" ? min + 12 * 60 : min);

/** One range: "9 AM to 6 PM", "8 to 11 AM", "6 PM–2 AM". Null when it is not one. */
function rangeOf(s: string): OpenWindow | null {
  const parts = s.split(/\s*(?:to|–|—|-)\s*/i);
  if (parts.length !== 2) return null;
  const a = timeOf(parts[0]);
  const b = timeOf(parts[1]);
  if (!a || !b || !b.meridiem) return null;
  const to0 = withMeridiem(b.min, b.meridiem);
  // A start with no meridiem borrows its end's, unless that puts it after the end ("11 to 2 PM" is 11 AM).
  let from = a.meridiem ? withMeridiem(a.min, a.meridiem) : withMeridiem(a.min, b.meridiem);
  if (!a.meridiem && from > to0) from = a.min;
  // Midnight at the end is the day's end; an end before the start runs past midnight.
  const to = to0 === 0 ? 24 * 60 : to0 <= from ? to0 + 24 * 60 : to0;
  return { from, to };
}

/** One day's words: every range, or all day, or closed. Null when nothing in it reads. */
function dayOf(words: string): OpenWindow[] | null {
  const w = words.trim().toLowerCase();
  if (w === "closed") return [];
  if (w === "open 24 hours" || w === "24 hours") return [{ from: 0, to: 24 * 60 }];
  const ranges = w.split(/\s*,\s*/).map(rangeOf);
  return ranges.every((r): r is OpenWindow => r !== null) && ranges.length > 0 ? ranges : null;
}

export function weekHoursOf(hours: unknown): { week: WeekHours; read: boolean } {
  if (!Array.isArray(hours) || hours.length === 0) return { week: DEFAULT_WEEK, read: false };
  const week: WeekHours = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  let readAny = false;
  for (const e of hours) {
    if (!e || typeof e !== "object") continue;
    const day = DAY_OF[String((e as { day?: unknown }).day ?? "").trim().toLowerCase()];
    const said = (e as { hours?: unknown }).hours;
    if (!day || typeof said !== "string") continue;
    const windows = dayOf(said);
    if (windows === null) continue;
    week[day] = windows;
    readAny = true;
  }
  return readAny ? { week, read: true } : { week: DEFAULT_WEEK, read: false };
}
```

- [ ] **Step 4: Run it: PASS.** If `timeOf`'s `hh === 0` branch reads oddly under review, the tests are the spec: 24-hour clocks do not appear in Maps' English output (`language: "en"`, cards.ts:146).

### Task 2.3: The timetable

**Files:**
- Create: `packages/contracts/src/reach-out-timetable.ts`
- Test: `tooling/scripts/tests/reach-out-timetable.test.mjs`

> **As built (PR 2, 26 Sep 2026).** The file in the tree is the reference; it differs from the code below in three ways,
> each tested:
> - **A day's frame.** A send also falls inside 8 AM–8 PM in the lead's time (`SEND_DAY_FRAME`). Without it, an "Open 24
>   hours" listing took its first send at 00:30. `sendWindowsOf(week)` applies the margin and the frame. A week with
>   open hours but no daytime window (a bar from nine) takes the default week's; a week closed every day stays unplaced.
> - **Sorted times, searched.** The gap and cap checks use binary search over sorted times, and a lead's spans are worked
>   out once per zone and week. The code below took 1 s for 500 sends and 5 s for 2,000. The build takes 19 ms and 40 ms
>   for the same placements.
> - **No re-export of the weekday order.** Part 4 imports what it needs from `lead-hours.ts`.
>
> `lead-hours.test.mjs` also pins the odd shapes production holds (all 47 distinct strings read, 25 Sep 2026).

- [ ] **Step 1: The failing tests** — each a rule of §4.5:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { timetable, DEFAULT_WEEK, SEND_WINDOW_MARGIN_MIN } from "@chanlytics/contracts";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const at = (iso) => Date.parse(iso);
const send = (id, zone = NY, week = DEFAULT_WEEK) => ({ id, zone, week });
const domain = (id, cap, recent = []) => ({ id, cap, recent });
const none = () => 0; // no jitter: the tests read exact times

test("a send goes at the lead's own next open moment, half an hour inside the window", () => {
  // Monday 7:00 in New York: the window opens at 9:00, so the first send is 9:30 local (13:30Z in September).
  const out = timetable({ sends: [send("a")], domains: [domain("d1", 30)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  assert.deepEqual(out.placed, [{ id: "a", domainId: "d1", sendAtMs: at("2026-09-28T13:30:00Z") }]);
  assert.equal(SEND_WINDOW_MARGIN_MIN, 30);
});

test("each lead in its own zone: a Los Angeles lead waits for Los Angeles' morning", () => {
  const out = timetable({ sends: [send("ny"), send("la", LA)], domains: [domain("d1", 30)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  const by = Object.fromEntries(out.placed.map((p) => [p.id, p.sendAtMs]));
  assert.equal(by.ny, at("2026-09-28T13:30:00Z"));
  assert.equal(by.la, at("2026-09-28T16:30:00Z"), "9:30 in Los Angeles");
});

test("the gap between two sends on one domain, and the second domain takes the next lead meanwhile", () => {
  const one = timetable({ sends: [send("a"), send("b")], domains: [domain("d1", 30)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  assert.equal(one.placed[1].sendAtMs - one.placed[0].sendAtMs, 12 * 60_000);
  const two = timetable({ sends: [send("a"), send("b")], domains: [domain("d1", 30), domain("d2", 30)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  assert.deepEqual(two.placed.map((p) => [p.domainId, p.sendAtMs]), [["d1", at("2026-09-28T13:30:00Z")], ["d2", at("2026-09-28T13:30:00Z")]]);
});

test("a domain's day is its cap, counted with what it already sent; what does not fit waits for room", () => {
  // Cap 2, one already sent at 13:00Z: one more today, and the third a day after the first of the two.
  const out = timetable({ sends: [send("a"), send("b")], domains: [domain("d1", 2, [at("2026-09-28T13:00:00Z")])], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  assert.equal(out.placed[0].sendAtMs, at("2026-09-28T13:30:00Z"));
  assert.ok(out.placed[1].sendAtMs >= at("2026-09-29T13:00:00Z"), "rolled to when the first leaves the 24 hours");
});

test("a closed day is skipped, and a lead with no room within the horizon is left unplaced, never forced", () => {
  const fridayOnly = { ...DEFAULT_WEEK, mon: [], tue: [], wed: [], thu: [] };
  const out = timetable({ sends: [send("f", NY, fridayOnly)], domains: [domain("d1", 30)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  assert.equal(new Date(out.placed[0].sendAtMs).getUTCDay(), 5, "Friday");
  const closed = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
  const never = timetable({ sends: [send("x", NY, closed)], domains: [domain("d1", 30)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  assert.deepEqual([never.placed, never.unplaced], [[], ["x"]]);
});

test("no domain with a day's share places nothing", () => {
  const out = timetable({ sends: [send("a")], domains: [domain("d1", 0)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: none });
  assert.deepEqual(out.unplaced, ["a"]);
});

test("jitter moves each gap by at most a quarter, so no two runs keep one rhythm", () => {
  const out = timetable({ sends: [send("a"), send("b"), send("c")], domains: [domain("d1", 30)], gapMinutes: 12, nowMs: at("2026-09-28T11:00:00Z"), jitter: () => 1 });
  const gaps = out.placed.slice(1).map((p, i) => (p.sendAtMs - out.placed[i].sendAtMs) / 60_000);
  assert.deepEqual(gaps, [15, 15]);
});
```

- [ ] **Step 2: Run them: FAIL.**

- [ ] **Step 3: Implement**

```ts
/**
 * When each email of a run goes, and from which domain (Reach out §4.5): a pure plan. Each send takes the earliest
 * moment that is inside its lead's own open hours (half an hour clear of each end), at least a gap after every other
 * send on the same domain (the gap moved by up to a quarter either way, so runs keep no rhythm), and inside the
 * domain's share of any rolling day. The domain is whichever gives the earliest such moment: the domains share a run
 * without a fixed turn. What finds no moment within the horizon is left unplaced, and the run says so: nothing is
 * forced into a closed day or past a domain's share. `recent` is every time the domain already spends, planned sends
 * ahead included, read once for the run (db sending_domain_capacity); the claim is what enforces it (C7).
 */
import { dayPlusInZone, localToUtcMs } from "./availability";
import { WEEKDAY_ORDER, type WeekHours, type WeekdayKey } from "./lead-hours";

export const SEND_WINDOW_MARGIN_MIN = 30;
export const TIMETABLE_HORIZON_DAYS = 7;
const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

export interface TimetableSend {
  id: string;
  zone: string;
  week: WeekHours;
}
export interface TimetableDomain {
  id: string;
  /** The domain's share of a day now (contracts domainDailyCap). */
  cap: number;
  /** When it already spends a send: left, of unknown outcome, queued, claimed or planned (ms). */
  recent: number[];
}
export interface TimetableInput {
  sends: TimetableSend[];
  domains: TimetableDomain[];
  gapMinutes: number;
  nowMs: number;
  horizonDays?: number;
  /** A number in [-1, 1] per send: how far its gap moves (a quarter at most). Math.random by default. */
  jitter?: () => number;
}
export interface Placed {
  id: string;
  domainId: string;
  sendAtMs: number;
}
export interface TimetableResult {
  placed: Placed[];
  unplaced: string[];
}

/** The open windows of the lead's days, as UTC instants, from `fromMs` for `days` days. */
function openSpans(s: TimetableSend, fromMs: number, days: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (let i = -1; i <= days; i += 1) {
    const day = dayPlusInZone(s.zone, fromMs, i);
    const windows = s.week[day.weekday as WeekdayKey] ?? [];
    for (const w of windows) {
      const from = w.from + SEND_WINDOW_MARGIN_MIN;
      const to = w.to - SEND_WINDOW_MARGIN_MIN;
      if (to <= from) continue;
      const start = localToUtcMs(s.zone, day.y, day.m, day.d, Math.floor(from / 60), from % 60);
      const end = localToUtcMs(s.zone, day.y, day.m, day.d, Math.floor(to / 60), to % 60);
      if (end > fromMs) spans.push([Math.max(start, fromMs), end]);
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/** Whether one more send at `t` keeps every rolling day on this domain within its cap. */
function fitsCap(times: number[], t: number, cap: number): boolean {
  const all = [...times, t].sort((a, b) => a - b);
  for (const q of all) {
    if (q < t || q >= t + DAY_MS) continue;
    const inWindow = all.filter((x) => x > q - DAY_MS && x <= q).length;
    if (inWindow > cap) return false;
  }
  return true;
}

/** The earliest moment for this send on this domain, or null within the horizon. */
function earliest(spans: Array<[number, number]>, times: number[], cap: number, gapMs: number, limitMs: number): number | null {
  // A move forward (a gap, a full day) carries into the next window: a later window starts no earlier than it.
  let floor = 0;
  for (const [start, end] of spans) {
    let t = Math.max(start, floor);
    for (let guard = 0; guard < 500 && t < end && t < limitMs; guard += 1) {
      const near = times.find((x) => Math.abs(x - t) < gapMs);
      if (near !== undefined) {
        t = near + gapMs;
        floor = t;
        continue;
      }
      if (!fitsCap(times, t, cap)) {
        // Wait for the oldest send of the day before it to leave the window.
        const oldest = times.filter((x) => x > t - DAY_MS && x <= t).sort((a, b) => a - b)[0];
        t = (oldest ?? t) + DAY_MS + 1;
        floor = t;
        continue;
      }
      return t;
    }
  }
  return null;
}

export function timetable(input: TimetableInput): TimetableResult {
  const horizon = input.horizonDays ?? TIMETABLE_HORIZON_DAYS;
  const limitMs = input.nowMs + horizon * DAY_MS;
  const jitter = input.jitter ?? (() => Math.random() * 2 - 1);
  const domains = input.domains.filter((d) => d.cap > 0).map((d) => ({ ...d, times: [...d.recent].sort((a, b) => a - b), placed: 0 }));
  const placed: Placed[] = [];
  const unplaced: string[] = [];
  for (const s of input.sends) {
    const gapMs = Math.round(input.gapMinutes * MIN_MS * (1 + 0.25 * Math.max(-1, Math.min(1, jitter()))));
    const spans = openSpans(s, input.nowMs, horizon);
    let best: { d: (typeof domains)[number]; t: number } | null = null;
    for (const d of domains) {
      const t = earliest(spans, d.times, d.cap, gapMs, limitMs);
      if (t === null) continue;
      if (!best || t < best.t || (t === best.t && d.placed < best.d.placed)) best = { d, t };
    }
    if (!best) {
      unplaced.push(s.id);
      continue;
    }
    best.d.times.push(best.t);
    best.d.times.sort((a, b) => a - b);
    best.d.placed += 1;
    placed.push({ id: s.id, domainId: best.d.id, sendAtMs: best.t });
  }
  return { placed, unplaced };
}

/** The weekday order, re-exported for the sheet's "sends Mon–Fri" line (Part 4). */
export { WEEKDAY_ORDER };
```

- [ ] **Step 4: Run the tests: PASS.** If the "gap" test's second domain places `b` at 13:30 on `d2` while `a` holds `d1`, that is the rotation working (the earliest moment wins, ties to the emptier domain).

### Task 2.4: The rules, once

**Files:**
- Create: `packages/contracts/src/reach-out-rules.ts`
- Modify: `packages/core/src/deliver.ts:402-420` (the lead-fact refusals read `outreachRefusalOf`)
- Test: `tooling/scripts/tests/reach-out-rules.test.mjs`, and `deliver.test.mjs` stays green unchanged (the proof that the mapping moved, not changed)

- [ ] **Step 1: The failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { outreachRefusalOf, OUTREACH_WAIT_REFUSALS, isWaitRefusal, reachOutSlots, REACH_OUT_MONTH_EMAILS } from "@chanlytics/contracts";

const facts = (over = {}) => ({ leadStage: "ready", suppressed: false, wroteBack: false, ...over });

test("the lead's own facts, in the door's order: not a lead, closed, the never-again list, wrote back", () => {
  assert.equal(outreachRefusalOf(facts({ leadStage: null })), "outreach_not_a_lead");
  for (const stage of ["converted", "archived"]) assert.equal(outreachRefusalOf(facts({ leadStage: stage })), "outreach_lead_closed");
  assert.equal(outreachRefusalOf(facts({ suppressed: true, wroteBack: true })), "outreach_suppressed");
  assert.equal(outreachRefusalOf(facts({ wroteBack: true })), "outreach_wrote_back");
  assert.equal(outreachRefusalOf(facts({ leadStage: "nurture" })), null);
});

test("a wait is the cap and a domain not ready: a send that meets one goes later, never nowhere", () => {
  assert.deepEqual([...OUTREACH_WAIT_REFUSALS], ["sending_domain_at_cap", "sending_domain_not_ready"]);
  assert.equal(isWaitRefusal("sending_domain_at_cap"), true);
  assert.equal(isWaitRefusal("outreach_wrote_back"), false);
});

test("the slots Part 3 fills, and a slot with nothing to say holds the email", () => {
  const lead = { business_name: "Harbor Movers", city: "Austin" };
  assert.deepEqual(reachOutSlots("Hi {{business}} in {{city}}, from {{your business}}", lead, { businessName: "Best Movers" }), {
    ok: true,
    text: "Hi Harbor Movers in Austin, from Best Movers",
  });
  assert.deepEqual(reachOutSlots("Hi {{business}} in {{city}}", { business_name: "Harbor", city: null }, { businessName: "Best" }), {
    ok: false,
    reason: "missing_value",
  });
  assert.equal(REACH_OUT_MONTH_EMAILS, 2000);
});
```

- [ ] **Step 2: Run it: FAIL.**

- [ ] **Step 3: Implement**

```ts
/**
 * Reach out's rules that more than one place asks (Part 3), each said once.
 *
 *   outreachRefusalOf   the lead's own facts, as the send door reads them (deliver.ts) and as the clock reads them
 *                       before it claims a send: one mapping, so the two never disagree about who may be written to.
 *   OUTREACH_WAIT_REFUSALS   the door's refusals that mean "not now": the send is planned again, never canceled (C5).
 *   reachOutSlots       a step's words with the lead's and the workspace's values in; a slot with no value holds the
 *                       email (missing_value, the reason that exists: broadcast.ts). Part 4 adds the rest of §4.3's.
 *   REACH_OUT_MONTH_EMAILS   the month's allowance per workspace (§4.8's number; the price is Ruben's to set).
 */
import type { DeliveryRefusal } from "./consent";

export interface OutreachLeadFacts {
  leadStage: string | null;
  suppressed: boolean;
  wroteBack: boolean;
}

export function outreachRefusalOf(f: OutreachLeadFacts): DeliveryRefusal | null {
  if (!f.leadStage) return "outreach_not_a_lead";
  if (f.leadStage !== "ready" && f.leadStage !== "nurture") return "outreach_lead_closed";
  if (f.suppressed) return "outreach_suppressed";
  if (f.wroteBack) return "outreach_wrote_back";
  return null;
}

export const OUTREACH_WAIT_REFUSALS = ["sending_domain_at_cap", "sending_domain_not_ready"] as const;
export function isWaitRefusal(reason: string | null | undefined): boolean {
  return (OUTREACH_WAIT_REFUSALS as readonly string[]).includes(reason ?? "");
}

export const REACH_OUT_MONTH_EMAILS = 2000;

export interface SlotLead {
  business_name: string | null;
  city: string | null;
}
export function reachOutSlots(
  words: string,
  lead: SlotLead,
  workspace: { businessName: string | null },
): { ok: true; text: string } | { ok: false; reason: "missing_value" } {
  const values: Record<string, string | null> = {
    business: lead.business_name?.trim() || null,
    city: lead.city?.trim() || null,
    "your business": workspace.businessName?.trim() || null,
  };
  let missing = false;
  const text = words.replace(/\{\{\s*([a-z ]+?)\s*\}\}/gi, (whole, name: string) => {
    const v = values[name.toLowerCase()];
    if (v == null) missing = true;
    return v ?? whole;
  });
  return missing ? { ok: false, reason: "missing_value" } : { ok: true, text };
}
```

In `deliver.ts`, the four lines at `:404-409` become:
```ts
    const lead = outreachRefusalOf({ leadStage: o.leadStage, suppressed: o.suppressed, wroteBack: o.wroteBack });
    if (lead) return lead;
```
(import `outreachRefusalOf` from `@chanlytics/contracts`; the comment above them moves to `reach-out-rules.ts`).

- [ ] **Step 4: Run** `reach-out-rules.test.mjs` and `deliver.test.mjs`: both PASS, `deliver.test.mjs` unchanged.

- [ ] **Step 5: The gate** (§4); commit; review; PR ("Reach out 3 (2 of 9): the clock of a lead").

---

## PR 3 — The doors (00184)

Four SQL doors and one reading of capacity. Each is proved on the replayed stack before anything calls it. D15 lands
here, because the capacity read is where "days actually sent" is counted.

> **As built (PR 3, 26 Sep 2026).** `supabase/migrations/00184_a_domain_has_one_capacity.sql` is the reference. It
> differs from the block below in these ways, each proved in `reach-out-doors.db.test.mjs`:
> - **D15 counts the days sent within the last 90** since the domain was clean. The read is bounded, so it no longer
>   scans every email since a domain was verified, and a domain idle for months warms again.
> - **`sending_domains.sent_days`**: the domains sweep writes the capacity's days beside its other counts, and a Resume
>   clears them. Members cannot ask the capacity (service role only), so without the column Connections would always
>   say "0 days". The door reads the capacity itself.
> - **The audience honours a `phone` suppression** (a customer's or an erased person's number). A business erased, or
>   already a customer, is not written to under a new address. It **orders by fit as a rank** (strong, look, long):
>   the text sorts `long` first.
> - **`reach_out_person` refuses a lead no longer ready or nurture** (`lead_closed`). A lead that became a customer
>   since it was planned was linked and converted by the insert trigger. The door would have returned the customer's
>   own person, and the writer would have put a cold row into their thread.
> - **The door keeps "never clean, no share"**: `cleanSince` stays beside `sentDays`, since `domainDailyCap(0)` is 30.
> - The trigger copy keeps 00140's comment on its two lookups.
> - The words: "N days sending" (or "nothing sent yet"), and "100 a day after N more days of sending" in place of a
>   date. `sendingDomainWords` and `checkResultWords` no longer take the clock. A DTO without `sent_days` (from an edge
>   built before) reads as none sent.

### Task 3.1: The migration

**Files:**
- Create: `supabase/migrations/00184_a_domain_has_one_capacity.sql`

- [ ] **Step 1: Write it**

```sql
-- 00184 · A domain has one capacity, the door is keyed by lead, and a claimed send has its person.
--
-- Reach out, Part 3 (the plan's PR 3).
--
--   sending_domain_capacity(domain, at)   the one read of what a domain may still send: its days actually sent since
--                                         it was clean (D15: the ramp counts them, not calendar days), what it spends
--                                         in the rolling day at `at` (left, of unknown outcome, queued, claimed), and
--                                         the times it spends them (the timetable's `recent`). The door, the claim
--                                         and the timetable all read it.
--   outreach_facts(..., p_lead_id)        keyed by the lead a send is for (its stage, not "any lead of this
--                                         person's"), and the domain's sent_days. Without a lead, as 00181.
--   reach_out_audience(...)               the leads a chain's first step may write to (§4.2).
--   reach_out_person(tenant, lead)        the person a first send needs, made once, without the insert trigger
--                                         calling the lead converted (it is not: nobody has written back).
--   lead_link_contact()                   skips an insert made with chanlytics.link_lead = off, and only then.
--   reach_out_claim(domain, cap, at, n)   up to n due sends of a running chain, claimed under the domain's lock so
--                                         two ticks can never spend its day twice (C7).

set local lock_timeout = '3s';

/* ------------------------------------------------------------- capacity -- */

create or replace function public.sending_domain_capacity(p_domain_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with d as (
    select id, tenant_id, host, state, clean_since from public.sending_domains where id = p_domain_id
  ),
  gone as (
    -- What left the domain, or went and nobody knows how: by when it left (00180's clock), back 30 days at most.
    select public.email_sent_at(m.meta, m.status_updated_at, m.created_at) as at
      from public.messages m, d
     where m.tenant_id = d.tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and public.email_from_host(m.meta) = d.host
       and m.created_at >= least(coalesce(d.clean_since, p_at), p_at - interval '1 day') - interval '30 days'
       and (public.email_left(m.status, m.error)
            or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown'))
  ),
  waiting as (
    -- Queued email rows from the domain (written, not yet left), and claimed sends with no row yet.
    select now() as at from public.messages m, d
     where m.tenant_id = d.tenant_id and m.channel = 'email' and m.direction = 'outbound' and m.status = 'queued'
       and public.email_from_host(m.meta) = d.host
    union all
    select coalesce(s.claimed_at, p_at) from public.reach_out_sends s, d
     where s.domain_id = d.id and s.state = 'claimed'
  ),
  planned as (
    select s.send_at as at from public.reach_out_sends s, d where s.domain_id = d.id and s.state = 'planned'
  )
  select jsonb_build_object(
    'state', d.state,
    'clean_since', d.clean_since,
    -- D15: the days it actually sent on (UTC days), since it was last clean.
    'sent_days', (select count(distinct (g.at at time zone 'UTC')::date) from gone g
                   where d.clean_since is not null and g.at >= d.clean_since),
    'used', (select count(*) from gone g where g.at > p_at - interval '1 day' and g.at <= p_at)
            + (select count(*) from waiting),
    'recent', coalesce((select jsonb_agg((extract(epoch from x.at) * 1000)::bigint order by x.at) from (
                 select at from gone where at > p_at - interval '1 day'
                 union all select at from waiting
                 union all select at from planned) x), '[]'::jsonb),
    'last_sent_at', (select max(g.at) from gone g)
  ) from d
$$;
revoke execute on function public.sending_domain_capacity(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_capacity(uuid, timestamptz) to service_role;

/* --------------------------------------------------- the door, by lead -- */

drop function if exists public.outreach_facts(uuid, uuid, text, text, timestamptz);
create or replace function public.outreach_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_host text,
  p_since timestamptz,
  p_lead_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    -- The send's own lead when it names one (a reach-out's always does); else the lead still being written to wins.
    'lead_stage', coalesce(
      (select l.stage from public.leads l
        where p_lead_id is not null and l.id = p_lead_id and l.tenant_id = p_tenant_id
          and l.contact_id = p_contact_id and l.erased_at is null and l.blanked_at is null),
      (select l.stage from public.leads l
        where p_lead_id is null and l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
          and l.erased_at is null and l.blanked_at is null
        order by (l.stage in ('ready', 'nurture')) desc, l.found_at desc
        limit 1)),
    'suppressed', exists (
      select 1 from public.lead_suppressions s
       where s.tenant_id = p_tenant_id and s.kind = 'email'
         and s.hash = public.lead_suppression_hash(p_tenant_id, lower(btrim(p_to)))),
    'wrote_back', (
      -- 00181's three, unchanged.
      exists (
        select 1 from public.messages m
          join public.conversations c on c.id = m.conversation_id and c.tenant_id = m.tenant_id
         where m.tenant_id = p_tenant_id and c.contact_id = p_contact_id
           and m.direction = 'inbound' and m.sender = 'customer'
           and not (m.channel = 'email' and coalesce(m.meta->'email'->>'claim', 'person') = 'auto_reply'))
      or exists (
        select 1 from public.messages o
          join public.conversations c on c.id = o.conversation_id and c.tenant_id = o.tenant_id
         where o.tenant_id = p_tenant_id and c.contact_id = p_contact_id
           and o.channel = 'email' and o.direction = 'outbound' and o.meta->'email'->>'message_id' is not null
           and (exists (
                  select 1 from public.messages r
                   where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
                     and r.sender = 'customer'
                     and r.meta->'email'->>'in_reply_to' = o.meta->'email'->>'message_id'
                     and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')
                or exists (
                  select 1 from public.messages r
                   where r.tenant_id = p_tenant_id and r.channel = 'email' and r.direction = 'inbound'
                     and r.sender = 'customer'
                     and r.meta->'email'->'references' @> jsonb_build_array(o.meta->'email'->>'message_id')
                     and coalesce(r.meta->'email'->>'claim', 'person') <> 'auto_reply')))
      or exists (
        select 1 from public.calls k
         where k.tenant_id = p_tenant_id and k.contact_id = p_contact_id and k.direction = 'inbound')),
    'domain', (
      select jsonb_build_object('state', d.state, 'from_local', d.from_local, 'clean_since', d.clean_since,
                                'sent_days', (public.sending_domain_capacity(d.id, now())->>'sent_days')::int)
        from public.sending_domains d
       where d.tenant_id = p_tenant_id and d.host = lower(btrim(p_host))),
    'sent_since', (
      select count(*) from public.messages m
       where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
         and public.email_from_host(m.meta) = lower(btrim(p_host))
         and m.created_at >= p_since - interval '30 days'
         and public.email_sent_at(m.meta, m.status_updated_at, m.created_at) >= p_since
         and (public.email_left(m.status, m.error)
              or (m.status = 'failed' and coalesce(m.error->>'outcome', '') = 'unknown')))
  )
$$;
revoke execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz, uuid) to service_role;

/* ------------------------------------------------------------ the audience -- */

create or replace function public.reach_out_audience(p_tenant_id uuid, p_search_id uuid, p_root_id uuid, p_limit int)
returns table (lead_id uuid, email text, business_name text, city text, region text, hours jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, lower(btrim(l.email)), l.business_name, l.city, l.region, l.hours
    from public.lead_search_members sm
    join public.lead_searches s on s.id = sm.search_id and s.tenant_id = sm.tenant_id and s.removed_at is null
    join public.leads l on l.id = sm.lead_id and l.tenant_id = sm.tenant_id
   where sm.tenant_id = p_tenant_id and sm.search_id = p_search_id
     and sm.class = 'qualified' and sm.counted and sm.blanked_at is null
     and l.stage = 'ready' and l.closed_reason is null and l.erased_at is null and l.blanked_at is null
     and l.email_state = 'ok' and nullif(btrim(l.email), '') is not null
     -- Never a customer's: nobody in People shares the address or the number, and the finder saw no share.
     and coalesce(jsonb_array_length(sm.judgment->'shares'), 0) = 0
     and not exists (select 1 from public.contacts c where c.tenant_id = l.tenant_id and c.erased_at is null
                       and (c.email = lower(btrim(l.email)) or (l.phone_e164 is not null and c.phone_e164 = l.phone_e164)))
     and not exists (select 1 from public.lead_suppressions x where x.tenant_id = l.tenant_id and (
                       (x.kind = 'email' and x.hash = public.lead_suppression_hash(l.tenant_id, lower(btrim(l.email))))
                    or (x.kind = 'place' and x.hash = public.lead_suppression_hash(l.tenant_id, l.place_id))))
     -- Never twice by one chain: no step of it has a send for this lead, bar one in a run its owner skipped.
     and not exists (select 1 from public.reach_out_sends ro
                      where ro.root_id = p_root_id and ro.lead_id = l.id
                        and not (ro.state = 'skipped' and ro.reason = 'run_canceled'))
   order by sm.fit nulls last, l.found_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_audience(uuid, uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.reach_out_audience(uuid, uuid, uuid, int) to service_role;

-- A step's leads: sent the step before at least p_after_days ago, not on this step yet, each with the door's own
-- facts (outreach_facts, keyed by the lead: the same answer the send will get) and whether any email of the chain
-- to them bounced (C4: any bounce stops the chain).
create or replace function public.reach_out_followers(
  p_tenant_id uuid, p_step_id uuid, p_parent_id uuid, p_after_days int, p_limit int)
returns table (lead_id uuid, contact_id uuid, email text, region text, hours jsonb, parent_message_id uuid,
               facts jsonb, bounced boolean)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, s.contact_id, lower(btrim(l.email)), l.region, l.hours, s.message_id,
         public.outreach_facts(p_tenant_id, s.contact_id, lower(btrim(l.email)),
                               coalesce(public.email_from_host(m.meta), ''), now() - interval '1 day', l.id),
         exists (select 1 from public.reach_out_sends b join public.messages bm on bm.id = b.message_id
                  where b.root_id = s.root_id and b.lead_id = l.id
                    and bm.status = 'failed' and bm.error->>'provider' = 'bounced')
    from public.reach_out_sends s
    join public.leads l on l.id = s.lead_id and l.tenant_id = s.tenant_id
    join public.messages m on m.id = s.message_id
   where s.tenant_id = p_tenant_id and s.playbook_id = p_parent_id and s.state = 'sent'
     and s.sent_at <= now() - make_interval(days => p_after_days)
     and s.contact_id is not null
     and not exists (select 1 from public.reach_out_sends x where x.playbook_id = p_step_id and x.lead_id = l.id)
   order by s.sent_at
   limit greatest(p_limit, 0)
$$;
revoke execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.reach_out_followers(uuid, uuid, uuid, int, int) to service_role;

/* -------------------------------------------------------------- the person -- */

-- 00140's trigger, with one switch: an insert made by reach_out_person says so, and is not a lead converting.
create or replace function public.lead_link_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
begin
  begin
    if current_setting('chanlytics.link_lead', true) = 'off' then return null; end if;
    if auth.uid() is not null then return null; end if;
    if NEW.erased_at is not null or NEW.merged_into_contact_id is not null then return null; end if;
    if NEW.phone_e164 is null and NEW.email is null then return null; end if;
    if NEW.phone_e164 is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = NEW.tenant_id and l.phone_e164 = NEW.phone_e164
         and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       order by l.found_at desc
       limit 1;
    end if;
    if v_lead is null and NEW.email is not null then
      select l.id into v_lead from public.leads l
       where l.tenant_id = NEW.tenant_id and l.email = NEW.email
         and l.contact_id is null and l.erased_at is null and l.blanked_at is null
       order by l.found_at desc
       limit 1;
    end if;
    if v_lead is null then return null; end if;
    update public.leads
       set contact_id = NEW.id, stage = 'converted', closed_reason = null, converted_at = now(), contacted_at = coalesce(contacted_at, now())
     where id = v_lead;
    if not exists (select 1 from public.events e where e.tenant_id = NEW.tenant_id and e.subject_type = 'contact' and e.subject_id = NEW.id and e.kind = 'contact.added') then
      insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
      values (NEW.tenant_id, 'contact.added', 'contact', 'contact', NEW.id, jsonb_build_object('source', 'lead'));
    end if;
  exception when others then
    raise warning 'lead_link_contact: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.lead_link_contact() from public, anon, authenticated;

create or replace function public.reach_out_person(p_tenant_id uuid, p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_email text;
  v_contact uuid;
  v_conv uuid;
  v_made boolean := false;
begin
  select * into v_lead from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id and erased_at is null and blanked_at is null
   for update;
  if not found then return jsonb_build_object('refused', 'lead_gone'); end if;
  v_email := nullif(lower(btrim(coalesce(v_lead.email, ''))), '');
  if v_email is null then return jsonb_build_object('refused', 'no_address'); end if;
  if v_lead.contact_id is not null then
    v_contact := v_lead.contact_id;
  else
    -- Somebody in People already has this address: a customer, never written to cold (§4.8).
    if exists (select 1 from public.contacts c where c.tenant_id = p_tenant_id and c.email = v_email and c.erased_at is null) then
      return jsonb_build_object('refused', 'already_yours');
    end if;
    perform set_config('chanlytics.link_lead', 'off', true);
    insert into public.contacts (tenant_id, display_name, email)
    values (p_tenant_id, left(nullif(v_lead.business_name, ''), 80), v_email)
    returning id into v_contact;
    perform set_config('chanlytics.link_lead', 'on', true);
    insert into public.contact_identities (tenant_id, contact_id, channel, external_id)
    values (p_tenant_id, v_contact, 'email', v_email)
    on conflict (tenant_id, channel, external_id) do nothing;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.added', 'contact', 'contact', v_contact,
            jsonb_build_object('source', 'lead', 'lead_id', p_lead_id, 'by', 'reach_out'));
    update public.leads set contact_id = v_contact, version = version + 1 where id = p_lead_id;
    v_made := true;
  end if;
  insert into public.conversations (tenant_id, contact_id) values (p_tenant_id, v_contact)
  on conflict (tenant_id, contact_id) do nothing;
  select id into v_conv from public.conversations where tenant_id = p_tenant_id and contact_id = v_contact;
  return jsonb_build_object('contact_id', v_contact, 'conversation_id', v_conv, 'made', v_made);
end $$;
revoke execute on function public.reach_out_person(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reach_out_person(uuid, uuid) to service_role;

/* --------------------------------------------------------------- the claim -- */

create or replace function public.reach_out_claim(p_domain_id uuid, p_cap int, p_at timestamptz, p_limit int)
returns setof public.reach_out_sends
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room int;
begin
  -- One claimer per domain at a time: the count below and the claim after it are one step (C7).
  perform pg_advisory_xact_lock(hashtext('reach_out_claim:' || p_domain_id::text));
  if not exists (select 1 from public.sending_domains where id = p_domain_id and state = 'verified') then return; end if;
  v_room := least(p_limit, p_cap - (public.sending_domain_capacity(p_domain_id, p_at)->>'used')::int);
  if v_room <= 0 then return; end if;
  return query
  update public.reach_out_sends s
     set state = 'claimed', claimed_at = p_at
   where s.id in (
     select s2.id from public.reach_out_sends s2
       join public.playbooks p on p.id = s2.playbook_id
       join public.broadcasts b on b.id = s2.broadcast_id
      where s2.domain_id = p_domain_id and s2.state = 'planned' and s2.send_at <= p_at
        and p.state = 'running' and b.state in ('scheduled', 'sending')
      order by s2.send_at
      limit v_room
      for update of s2 skip locked)
  returning s.*;
end $$;
revoke execute on function public.reach_out_claim(uuid, int, timestamptz, int) from public, anon, authenticated;
grant execute on function public.reach_out_claim(uuid, int, timestamptz, int) to service_role;
```

- [ ] **Step 2: Check the names**: `lead_searches.removed_at`, `lead_search_members.fit`, `contact_identities`' unique key, `conversations`' unique `(tenant_id, contact_id)`, and `leads.place_id` as the place suppression's value.

Run: `grep -n "removed_at\|unique (tenant_id, channel, external_id)\|unique (tenant_id, contact_id)" supabase/migrations/00140_*.sql supabase/migrations/00002_*.sql; grep -n "kind = 'place'" supabase/migrations/*.sql | head -3`

Expected: each exists as written. Adjust the one that does not to its real spelling before applying. The place hash's value must be what `lead_blank` / `lead_erase` hash for a place (00142:428-442).

- [ ] **Step 3: Apply and regenerate** (as Task 1.1 Step 3). `database.types.ts` gains the four functions and the sixth argument.

### Task 3.2: The repository

**Files:**
- Create: `packages/db/src/repositories/reach-out.ts`
- Modify: `packages/db/src/repositories/outreach.ts` (`outreachFactsOf` takes `leadId`; `OutreachFactsRow.domain.sent_days`)
- Modify: `packages/db/src/index.ts` (export)

- [ ] **Step 1: Write it**

```ts
/**
 * Reach out's sends and the doors they go through (Part 3): the one place `reach_out_sends` is typed, and the four
 * doors of 00184. The service role asks every one of them (the edge's clock and run); a read or a door that fails
 * throws, because "we could not check" is not "yes".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;
export type ReachOutSendRow = Database["public"]["Tables"]["reach_out_sends"]["Row"];

export interface DomainCapacity {
  state: string;
  clean_since: string | null;
  sent_days: number;
  used: number;
  recent: number[];
  last_sent_at: string | null;
}

export async function domainCapacityOf(db: Db, domainId: string, at: Date): Promise<DomainCapacity> {
  const { data, error } = await db.rpc("sending_domain_capacity", { p_domain_id: domainId, p_at: at.toISOString() } as never);
  if (error) throw new Error(`cannot read the domain's capacity: ${error.message}`);
  const c = (data ?? {}) as Partial<DomainCapacity>;
  if (typeof c.used !== "number" || typeof c.sent_days !== "number")
    throw new Error("cannot read the domain's capacity: the database answered without its counts");
  return {
    state: String(c.state ?? ""),
    clean_since: typeof c.clean_since === "string" ? c.clean_since : null,
    sent_days: c.sent_days,
    used: c.used,
    recent: Array.isArray(c.recent) ? c.recent.map(Number).filter(Number.isFinite) : [],
    last_sent_at: typeof c.last_sent_at === "string" ? c.last_sent_at : null,
  };
}

export interface AudienceLead {
  lead_id: string;
  email: string;
  business_name: string | null;
  city: string | null;
  region: string | null;
  hours: unknown;
}

export async function reachOutAudience(db: Db, p: { tenantId: string; searchId: string; rootId: string; limit: number }): Promise<AudienceLead[]> {
  const { data, error } = await db.rpc("reach_out_audience", {
    p_tenant_id: p.tenantId, p_search_id: p.searchId, p_root_id: p.rootId, p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot read who a reach-out may write to: ${error.message}`);
  return (data ?? []) as AudienceLead[];
}

export type PersonForSend =
  | { ok: true; contactId: string; conversationId: string; made: boolean }
  | { ok: false; refused: "lead_gone" | "no_address" | "already_yours" };

export async function reachOutPerson(db: Db, tenantId: string, leadId: string): Promise<PersonForSend> {
  const { data, error } = await db.rpc("reach_out_person", { p_tenant_id: tenantId, p_lead_id: leadId } as never);
  if (error) throw new Error(`cannot make the person this send is for: ${error.message}`);
  const r = (data ?? {}) as { refused?: string; contact_id?: string; conversation_id?: string; made?: boolean };
  if (r.refused === "lead_gone" || r.refused === "no_address" || r.refused === "already_yours") return { ok: false, refused: r.refused };
  if (!r.contact_id || !r.conversation_id) throw new Error("cannot make the person this send is for: no person came back");
  return { ok: true, contactId: r.contact_id, conversationId: r.conversation_id, made: r.made === true };
}

export async function claimSends(db: Db, p: { domainId: string; cap: number; at: Date; limit: number }): Promise<ReachOutSendRow[]> {
  const { data, error } = await db.rpc("reach_out_claim", {
    p_domain_id: p.domainId, p_cap: p.cap, p_at: p.at.toISOString(), p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot claim the domain's due sends: ${error.message}`);
  return (data ?? []) as ReachOutSendRow[];
}

/** One send's move, only from the state it was read in: a stale writer changes nothing and is told so. */
export async function moveSend(
  db: Db,
  p: { tenantId: string; id: string; from: ReachOutSendRow["state"]; patch: Partial<ReachOutSendRow> },
): Promise<boolean> {
  const { data, error } = await db
    .from("reach_out_sends")
    .update(p.patch as never)
    .eq("tenant_id", p.tenantId)
    .eq("id", p.id)
    .eq("state", p.from)
    .select("id");
  if (error) throw new Error(`cannot move the send: ${error.message}`);
  return (data ?? []).length === 1;
}

export interface FollowerLead {
  lead_id: string;
  contact_id: string;
  email: string;
  region: string | null;
  hours: unknown;
  parent_message_id: string;
  facts: { lead_stage: string | null; suppressed: boolean; wrote_back: boolean };
  bounced: boolean;
}

export async function reachOutFollowers(
  db: Db,
  p: { tenantId: string; stepId: string; parentId: string; afterDays: number; limit: number },
): Promise<FollowerLead[]> {
  const { data, error } = await db.rpc("reach_out_followers", {
    p_tenant_id: p.tenantId, p_step_id: p.stepId, p_parent_id: p.parentId, p_after_days: p.afterDays, p_limit: p.limit,
  } as never);
  if (error) throw new Error(`cannot read who a step may write to: ${error.message}`);
  const rows = (data ?? []) as FollowerLead[];
  // The door's facts without the one it added last read as a failed read, as outreachFactsOf does (00181).
  for (const r of rows)
    if (typeof r.facts?.wrote_back !== "boolean")
      throw new Error("cannot read who a step may write to: the database did not say whether they wrote back");
  return rows;
}

export async function planSends(db: Db, rows: Array<Database["public"]["Tables"]["reach_out_sends"]["Insert"]>): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("reach_out_sends").upsert(rows as never, { onConflict: "broadcast_id,lead_id", ignoreDuplicates: true });
  if (error) throw new Error(`cannot plan the run's sends: ${error.message}`);
}
```

In `outreach.ts`:
- `outreachFactsOf`'s input gains `leadId?: string | null`, passed as `p_lead_id: p.leadId ?? null`.
- `OutreachFactsRow.domain` gains `sent_days: number`, read as `Number(f.domain.sent_days ?? 0) || 0`.

- [ ] **Step 2: Build.** `corepack pnpm --filter "./packages/*" build`. Expected: the repository compiles against the regenerated types.

### Task 3.3: D15: the ramp counts the days a domain sent

**Files:**
- Modify: `packages/contracts/src/sending-domains.ts` (`domainDailyCap`, the DTO `sent_days`, the three word sites at `:444-464, :580`)
- Modify: `packages/core/src/deliver.ts:309, 419` (`o.sentDays` from `facts.domain.sent_days`)
- Modify: `apps/edge/lib/email/sending-domains.ts` (the status op reads `domainCapacityOf` into each DTO's `sent_days`), `apps/dashboard/src/legacy-bridge/sending-domains.ts:11, 50` (the signature)
- Test: `tooling/scripts/tests/sending-domains.test.mjs`, `deliver.test.mjs`, `admin-sending-domains-door.test.mjs`

- [ ] **Step 1: The failing tests**

```js
test("the ramp counts the days a domain actually sent, not the days since it was clean (D15)", () => {
  assert.equal(domainDailyCap(0), 30);
  assert.equal(domainDailyCap(13), 30);
  assert.equal(domainDailyCap(14), 100);
  assert.equal(domainDailyCap(30), 200);
});

test("a verified domain says how many days it has sent and how many more to the next step", () => {
  const w = domainWords({ ...verified, sent_days: 10 }, NOW);
  assert.equal(w.cap, "Up to 30 a day");
  assert.equal(w.line, "Sam at Harbor · 10 days sending");
  assert.equal(w.next, "100 a day after 4 more days of sending");
});
```
Use the file's own verified-domain fixture and its words function's real name. In `deliver.test.mjs`, the D2 case `sent_since: 100` becomes a domain with `sent_days: 0` (cap 30) at `sent_since: 30`, and one with `sent_days: 14` at `sent_since: 99` sends.

- [ ] **Step 2: Implement**

```ts
/** How many a day this domain may send: the ramp's step by the days it has actually sent since it was clean (D15). */
export function domainDailyCap(sentDays: number): number {
  let cap = 0;
  for (const step of DOMAIN_RAMP) if (sentDays >= step.days) cap = step.perDay;
  return cap;
}
```

The words:
- Verified: `line: \`${who} · ${days} day${days === 1 ? "" : "s"} sending\``, with `days = d.sent_days`.
- `next: step ? \`${step.perDay} a day after ${step.days - d.sent_days} more day${step.days - d.sent_days === 1 ? "" : "s"} of sending\` : null`.
- Held: `was = domainDailyCap(d.sent_days)`.
- `checkResultWords`: `cap = domainDailyCap(d.sent_days)`.

`SendingDomainDto` gains `sent_days: number` (`0` wherever it is built without a read: a fresh add, a remove). In `deliver.ts`, `cleanSince` becomes `sentDays: own?.sent_days ?? 0`, and the cap line is `if (o.sentSince >= domainDailyCap(o.sentDays)) return "sending_domain_at_cap";`.

`cleanDays` stays only if something else reads it (`grep -rn cleanDays`). Otherwise delete it: one clock, not two.

- [ ] **Step 3: Run the three test files, then the gate.** Expected: PASS. The legacy harness's sending-domains block renders the new line (`sending-domains.test.mjs` or the page's render test pins it; update the pinned words there, not elsewhere).

### Task 3.4: The doors, proved on the stack

**Files:**
- Create: `tooling/scripts/tests/reach-out-doors.db.test.mjs`

- [ ] **Step 1: Write it.** It uses one workspace with a verified domain (`sending_domains` row as `outreach-facts.db.test.mjs` makes it), a lead search with three members, their leads, an email template and a reach-out chain (root + one step). Cases:
  1. **Capacity**:
     - with nothing sent: `used 0, sent_days 0`;
     - after two cold rows left today and one yesterday (written by `buildEmailRequest` with `ownDomainIdentity`, stamped `status_at.sent`): `sent_days 2`, `used 2`;
     - a queued row from the host and a claimed send add 1 each to `used`;
     - a planned send's `send_at` is in `recent`, and a row from another host counts nothing.
  2. **The door by lead**: two leads point at one person, one `archived` and one `ready`. With `p_lead_id` = the archived one, `lead_stage` is `archived`. Without it, `ready` (00181's rule).
  3. **The audience**: of five members, it returns only the qualified, counted, ready one with an `ok` address. It drops:
     - a `review` member;
     - an `archived` lead;
     - a `catch_all` address;
     - a lead whose address a person already has;
     - a suppressed address;
     - a lead that already has a send in this chain.
  4. **The person**:
     - A first call makes the contact, the email identity, the conversation and one `contact.added` event with `source: lead`. The lead gets its `contact_id` and a bumped `version`, and **stays `ready`** (the trigger did not convert it).
     - A second call returns the same contact with `made: false`.
     - A lead whose address a person has gets `already_yours`.
     - A normal service-role contact insert with a lead's address still links and converts it (the trigger's switch is local to the door's transaction).
  5. **The followers**:
     - A lead sent the root 4 days ago, with the step's `after_days` 3, is a follower.
     - A lead sent 2 days ago is not.
     - A lead already on the step is not.
     - A lead whose chain email bounced comes back with `bounced: true`.
     - A lead who wrote back comes back with `facts.wrote_back: true` (the caller drops both).
  6. **The claim**:
     - Cap 2, `used` 1, three due planned sends: exactly one is claimed.
     - Two claims run at once (`Promise.all` of two `rpc` calls) claim two sends in total at cap 3, never three.
     - A paused root's sends are not claimed, nor a pending-approval run's, nor a send not yet due.
     - A domain `held` claims nothing.

- [ ] **Step 2: Run it** on the stack with 00184 applied; then `test:db` whole (privileges: every new function is service-role only and pins `search_path`).

- [ ] **Step 3: Production (before merging).** Dry run, push, read back: `select public.sending_domain_capacity(id, now()) from sending_domains limit 1` answers `{…, sent_days, used, recent}`; the 6-argument `outreach_facts` exists and the 5-argument one does not; `has_function_privilege('anon', 'public.reach_out_claim(uuid,int,timestamptz,int)', 'execute')` is false.
  - **Deploy order:** the migration first, then either app. An edge built before this PR calls `outreach_facts` with five named arguments, which the new function answers (its sixth has a default).

- [ ] **Step 4: Commit, review, PR** ("Reach out 3 (3 of 9): one capacity, the door by lead, the person and the claim").

---

## PR 4 — The run

A step's run is assembled over the leads it may write to, and every send is planned. Nothing is claimed yet: PR 5's
clock does that. After this PR a reach-out made in the database (a test, or Part 4's sheet) produces a run waiting for
its owner, with its sends planned.

### Task 4.1: The ids

**Files:**
- Create: `packages/core/src/campaigns/reach-out-ids.ts`
- Test: `tooling/scripts/tests/core-run-reach-out.test.mjs` (its first cases)

- [ ] **Step 1: The failing test**

```js
test("a send's id is its run and its lead; an attempt's message id is its send and its number, each stable", async () => {
  const a = await sendIdFor(RUN, LEAD);
  assert.equal(a, await sendIdFor(RUN, LEAD));
  assert.notEqual(a, await sendIdFor(RUN, OTHER_LEAD));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const m0 = await sendMessageId(a, 0);
  assert.equal(m0, await sendMessageId(a, 0), "a retry of one attempt meets its own row");
  assert.notEqual(m0, await sendMessageId(a, 1), "a deferred send's next attempt is a new row, under a new key");
});
```

- [ ] **Step 2: Implement** (the `runIdFor` shape, `core/leads/ids.ts:16-20`)

```ts
/**
 * Reach out's identities (Part 3), derived from what they are, so a retry meets its own row: a send is its run and its
 * lead; the email an attempt writes is its send and its number (E4). A deferred send's next attempt is a new row under
 * a new Resend idempotency key, which a key's 24 hours at Resend would otherwise hand the first one's answer.
 */
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function v5(name: string): Promise<string> {
  const h = hex(await crypto.subtle.digest("SHA-1", enc.encode(name)));
  const v = `${h.slice(0, 12)}5${h.slice(13, 16)}${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 32)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

export const sendIdFor = (runId: string, leadId: string): Promise<string> => v5(`reach_out_send:${runId}:${leadId}`);
export const sendMessageId = (sendId: string, attempt: number): Promise<string> => v5(`reach_out_email:${sendId}:${attempt}`);
```

### Task 4.2: The verb

**Files:**
- Create: `packages/core/src/campaigns/reach-out-ports.ts`, `packages/core/src/campaigns/run-reach-out.ts`
- Modify: `packages/core/src/index.ts` (export `runReachOut`, `sendIdFor`, `sendMessageId`, the types)
- Test: `tooling/scripts/tests/core-run-reach-out.test.mjs`

- [ ] **Step 1: The failing tests** (fakes for the ports, the `core-thread-verbs.test.mjs` shape)

```js
const NOW = Date.parse("2026-09-28T11:00:00Z"); // a Monday, 7 AM in New York
const lead = (id, over = {}) => ({ lead_id: id, email: `${id}@fixture.example`, business_name: `Biz ${id}`, city: "Austin", region: "TX", hours: [], ...over });
const root = (over = {}) => ({
  id: "p1", root_id: "p1", tenant_id: "t1", name: "Movers in Austin", trigger: "lead_first", state: "running",
  lead_search_id: "s1", after_playbook_id: null, after_days: null, gap_minutes: 12, domain_ids: [], cap_per_run: 25,
  template_id: "tpl1", template_name: "reach_first", template_language: "en", ...over,
});
function ports(over = {}) {
  const made = { runs: [], sends: [], told: [] };
  return {
    made,
    ports: {
      now: () => NOW,
      workspaceZone: "America/New_York",
      mode: "veto",
      maySpend: true,
      alreadyRan: async () => false,
      chainState: async () => "none",
      audience: async () => [lead("a"), lead("b", { region: "CA" })],
      followers: async () => [],
      domains: async () => [{ id: "d1", cap: 30, recent: [] }],
      createRun: async (row) => (made.runs.push(row), { id: "run1" }),
      planSends: async (rows) => void made.sends.push(...rows),
      notifyWaiting: async (runId, n) => void made.told.push([runId, n]),
      ...over,
    },
  };
}

test("a chain's first run waits for its owner, with every send planned in its lead's own hours", async () => {
  const { ports: p, made } = ports();
  const out = await runReachOut(p, root(), { runFor: "2026-09-28" });
  assert.deepEqual(out, { outcome: "held", reason: "waiting_for_you", planned: 2 });
  assert.equal(made.runs[0].state, "pending_approval");
  assert.deepEqual(made.runs[0].audience, { kind: "reach_out", root_id: "p1", step_id: "p1", search_id: "s1" });
  const by = Object.fromEntries(made.sends.map((s) => [s.lead_id, s]));
  assert.equal(by.a.send_at, "2026-09-28T14:30:00.000Z", "9:30 in Austin (Central)");
  assert.equal(by.b.send_at, "2026-09-28T16:30:00.000Z", "9:30 in California");
  assert.ok(made.sends.every((s) => s.state === "planned" && s.domain_id === "d1" && s.root_id === "p1" && s.broadcast_id === "run1"));
  assert.deepEqual(made.told, [["run1", 2]]);
});

test("a later run of an approved chain gives thirty minutes, and is not asked; one whose owner asks for every run waits", async () => {
  const { ports: p, made } = ports({ chainState: async () => "approved" });
  const out = await runReachOut(p, root(), { runFor: "2026-09-28" });
  assert.equal(out.outcome, "sent");
  assert.equal(made.runs[0].state, "scheduled");
  assert.ok(made.sends.every((s) => Date.parse(s.send_at) >= NOW + 30 * 60_000));
  assert.deepEqual(made.told, []);
  const asked = ports({ chainState: async () => "approved", mode: "ask" });
  assert.equal((await runReachOut(asked.ports, root(), { runFor: "2026-09-28" })).reason, "waiting_for_you");
  assert.equal(asked.made.runs[0].state, "pending_approval");
});

test("nothing is assembled while the chain's first run still waits, or when no domain may send, or the workspace may not spend", async () => {
  assert.deepEqual(await runReachOut(ports({ chainState: async () => "waiting" }).ports, root(), { runFor: "d" }), { outcome: "held", reason: "waiting_for_you", planned: 0 });
  assert.deepEqual(await runReachOut(ports({ domains: async () => [] }).ports, root(), { runFor: "d" }), { outcome: "held", reason: "no_domain", planned: 0 });
  assert.deepEqual(await runReachOut(ports({ maySpend: false }).ports, root(), { runFor: "d" }), { outcome: "held", reason: "billing", planned: 0 });
  assert.deepEqual(await runReachOut(ports({ mode: "never" }).ports, root(), { runFor: "d" }), { outcome: "off", reason: "never", planned: 0 });
});

test("a step writes to the leads sent the step before, less anyone the door would refuse or whose email bounced", async () => {
  const step = root({ id: "p2", trigger: "after_step", lead_search_id: null, after_playbook_id: "p1", after_days: 3 });
  const f = (id, over = {}) => ({ lead_id: id, contact_id: `k${id}`, email: `${id}@x.example`, region: "TX", hours: [], parent_message_id: `m${id}`, facts: { lead_stage: "nurture", suppressed: false, wrote_back: false }, bounced: false, ...over });
  const { ports: p, made } = ports({
    chainState: async () => "approved",
    followers: async () => [f("a"), f("b", { facts: { lead_stage: "nurture", suppressed: false, wrote_back: true } }), f("c", { bounced: true }), f("d", { facts: { lead_stage: "archived", suppressed: false, wrote_back: false } })],
  });
  const out = await runReachOut(p, step, { runFor: "2026-09-28" });
  assert.equal(out.planned, 1);
  assert.deepEqual(made.sends.map((s) => [s.lead_id, s.contact_id]), [["a", "ka"]]);
});
```

- [ ] **Step 2: Run: FAIL.**

- [ ] **Step 3: The ports**

```ts
/**
 * What assembling a reach-out step's run needs (Part 3), as ports: the edge's run context builds them (apps/edge
 * lib/reach-out/run-context.ts) over the database; tests build them from arrays.
 */
import type { TimetableDomain } from "@chanlytics/contracts";

export interface ReachOutStep {
  id: string;
  root_id: string;
  tenant_id: string;
  name: string;
  trigger: "lead_first" | "after_step";
  state: "running" | "paused";
  lead_search_id: string | null;
  after_playbook_id: string | null;
  after_days: number | null;
  gap_minutes: number;
  domain_ids: string[];
  cap_per_run: number;
  template_id: string;
  template_name: string;
  template_language: string;
}

export interface ReachOutLead {
  lead_id: string;
  region: string | null;
  hours: unknown;
  /** Known for a step's leads (their person was made at the first send); null for a first step's. */
  contact_id?: string | null;
}

export interface ReachOutFollower extends ReachOutLead {
  contact_id: string;
  facts: { lead_stage: string | null; suppressed: boolean; wrote_back: boolean };
  bounced: boolean;
}

export interface NewReachOutRun {
  tenant_id: string;
  playbook_id: string;
  run_for: string;
  name: string;
  template_id: string;
  template_name: string;
  template_language: string;
  state: "pending_approval" | "scheduled";
  scheduled_for: string;
  recipient_count: number;
  audience: { kind: "reach_out"; root_id: string; step_id: string; search_id: string | null };
}

export interface ReachOutRunPorts {
  now(): number;
  workspaceZone: string;
  /** The workspace's policy for the class outreach: veto | ask | never (POLICY_CLASS_MODES.outreach). */
  mode: "veto" | "ask" | "never";
  maySpend: boolean;
  alreadyRan(stepId: string, runFor: string): Promise<boolean>;
  /** none: no run of the chain was ever approved; waiting: its first run waits; approved: one was. */
  chainState(rootId: string): Promise<"none" | "waiting" | "approved">;
  audience(step: ReachOutStep): Promise<ReachOutLead[]>;
  followers(step: ReachOutStep): Promise<ReachOutFollower[]>;
  domains(step: ReachOutStep): Promise<TimetableDomain[]>;
  /** "exists" when this step already has a run for the day (broadcasts_playbook_run). */
  createRun(row: NewReachOutRun): Promise<{ id: string } | "exists">;
  planSends(rows: PlannedSend[]): Promise<void>;
  notifyWaiting(runId: string, planned: number): Promise<void>;
}

export interface PlannedSend {
  id: string;
  tenant_id: string;
  broadcast_id: string;
  playbook_id: string;
  root_id: string;
  lead_id: string;
  contact_id: string | null;
  domain_id: string;
  send_at: string;
  state: "planned";
}

export type ReachOutRunOutcome =
  | { outcome: "sent"; planned: number }
  | { outcome: "held"; reason: "waiting_for_you" | "no_domain" | "no_room" | "billing"; planned: number }
  | { outcome: "empty"; reason: "already_ran" | "nobody"; planned: 0 }
  | { outcome: "off"; reason: "paused" | "never"; planned: 0 };
```

- [ ] **Step 4: The verb**

```ts
/**
 * One step of a reach-out, on its day (Reach out §4.1, §4.5): who it writes to, a run for them, and when each email
 * goes. The first run of a chain waits for its owner (the class outreach is asked, §4.8); every later run gives thirty
 * minutes to be stopped. A lead the door would refuse is never planned (outreachRefusalOf, the door's own mapping), nor
 * one whose email from the chain bounced (C4). What the timetable cannot place within its horizon waits for the next
 * run. Nothing here sends: the reach-out clock claims what is due (apps/edge api/cron/reach-out.ts).
 */
import {
  PLAYBOOK_VETO_DELAY_MS,
  outreachRefusalOf,
  timetable,
  weekHoursOf,
  zoneOfRegion,
} from "@chanlytics/contracts";
import { sendIdFor } from "./reach-out-ids";
import type { ReachOutLead, ReachOutRunOutcome, ReachOutRunPorts, ReachOutStep } from "./reach-out-ports";

export async function runReachOut(
  ports: ReachOutRunPorts,
  step: ReachOutStep,
  cmd: { runFor: string },
): Promise<ReachOutRunOutcome> {
  if (step.state !== "running") return { outcome: "off", reason: "paused", planned: 0 };
  if (ports.mode === "never") return { outcome: "off", reason: "never", planned: 0 };
  if (!ports.maySpend) return { outcome: "held", reason: "billing", planned: 0 };
  if (await ports.alreadyRan(step.id, cmd.runFor)) return { outcome: "empty", reason: "already_ran", planned: 0 };
  const chain = await ports.chainState(step.root_id);
  if (chain === "waiting") return { outcome: "held", reason: "waiting_for_you", planned: 0 };
  const first = chain === "none";
  // The first run always waits; a later one waits too when its owner asked for that (E7).
  const asks = first || ports.mode === "ask";

  let leads: ReachOutLead[];
  if (step.trigger === "lead_first") leads = await ports.audience(step);
  else {
    const followers = await ports.followers(step);
    leads = followers.filter(
      (f) =>
        !f.bounced &&
        outreachRefusalOf({ leadStage: f.facts.lead_stage, suppressed: f.facts.suppressed, wroteBack: f.facts.wrote_back }) === null,
    );
  }
  leads = leads.slice(0, step.cap_per_run);
  if (leads.length === 0) return { outcome: "empty", reason: "nobody", planned: 0 };

  const domains = (await ports.domains(step)).filter((d) => d.cap > 0);
  if (domains.length === 0) return { outcome: "held", reason: "no_domain", planned: 0 };

  const now = ports.now();
  const startAt = asks ? now : now + PLAYBOOK_VETO_DELAY_MS;
  const plan = timetable({
    sends: leads.map((l) => ({
      id: l.lead_id,
      zone: zoneOfRegion(l.region) ?? ports.workspaceZone,
      week: weekHoursOf(l.hours).week,
    })),
    domains,
    gapMinutes: step.gap_minutes,
    nowMs: startAt,
  });
  if (plan.placed.length === 0) return { outcome: "held", reason: "no_room", planned: 0 };

  const firstAt = Math.min(...plan.placed.map((p) => p.sendAtMs));
  const run = await ports.createRun({
    tenant_id: step.tenant_id,
    playbook_id: step.id,
    run_for: cmd.runFor,
    name: step.name,
    template_id: step.template_id,
    template_name: step.template_name,
    template_language: step.template_language,
    state: asks ? "pending_approval" : "scheduled",
    scheduled_for: new Date(firstAt).toISOString(),
    recipient_count: plan.placed.length,
    audience: { kind: "reach_out", root_id: step.root_id, step_id: step.id, search_id: step.lead_search_id },
  });
  if (run === "exists") return { outcome: "empty", reason: "already_ran", planned: 0 };

  const contactOf = new Map(leads.map((l) => [l.lead_id, l.contact_id ?? null]));
  await ports.planSends(
    await Promise.all(
      plan.placed.map(async (p) => ({
        id: await sendIdFor(run.id, p.id),
        tenant_id: step.tenant_id,
        broadcast_id: run.id,
        playbook_id: step.id,
        root_id: step.root_id,
        lead_id: p.id,
        contact_id: contactOf.get(p.id) ?? null,
        domain_id: p.domainId,
        send_at: new Date(p.sendAtMs).toISOString(),
        state: "planned" as const,
      })),
    ),
  );
  if (asks) {
    await ports.notifyWaiting(run.id, plan.placed.length);
    return { outcome: "held", reason: "waiting_for_you", planned: plan.placed.length };
  }
  return { outcome: "sent", planned: plan.placed.length };
}
```

- [ ] **Step 5: Run the tests: PASS.** Then the cycle test (`run-reach-out.ts` imports contracts' value exports only).

### Task 4.3: The edge runs it

**Files:**
- Create: `apps/edge/lib/reach-out/run-context.ts` (the ports over the database)
- Modify: `apps/edge/lib/ops/sweep-rotation.ts` (`reachOutsDue`, a page of running reach-out steps, least-recently-run first, as `playbooksDue`)
- Modify: `apps/edge/api/cron/playbooks.ts` (after the moments: the reach-out steps due today, `runReachOut` each; `out` counts them in the same buckets; `last_run_for` / `last_run_at` written as `lib/playbooks.ts:269` does)
- Modify: `packages/core/src/campaigns/approve.ts:34-40` (a reach-out run stays approvable past its day: its sends are planned again when they are stale, PR 5)
- Test: `tooling/scripts/tests/cron-playbooks-door.test.mjs` (a reach-out root due at its hour makes one pending run with its sends; a paused one makes none; a second tick the same day makes none), `core-campaigns-approve.test.mjs` (or approve's test file: a reach-out run from yesterday is approved; a moment's from yesterday is still refused)

- [ ] **Step 1: `run-context.ts`.** Each port in one short function over the repositories:
  - `chainState`: the broadcasts whose `audience->>'root_id'` is the root:
    - any in `scheduled | sending | sent` → `approved`;
    - else any `pending_approval` → `waiting`;
    - else `none`.
  - `audience`: `reachOutAudience(db, { tenantId, searchId: step.lead_search_id, rootId: step.root_id, limit: step.cap_per_run })`.
  - `followers`: `reachOutFollowers(db, { …, parentId: step.after_playbook_id, afterDays: step.after_days })`.
  - `domains`:
    - read the verified `sending_domains` of the workspace, those in `step.domain_ids` when it names any;
    - for each, `domainCapacityOf(db, id, now)` gives `{ id, cap: domainDailyCap(c.sent_days), recent: c.recent }`.
  - `createRun`: an insert into `broadcasts` that reads 23505 as `"exists"`.
  - `planSends`: `planSends(db, rows)`.
  - `notifyWaiting`: the bell and the owner's mail, through the same helper `run-playbook`'s `notify` uses for an ask run (`apps/edge/lib/playbooks.ts`), with kind `reach_out.waiting`, subject "A reach-out waits for you", and body "{n} emails to businesses your search found, from {first time}. Approve them on Broadcasts."
  - `mode`: the workspace's `outreach` policy row, `ask` when there is none (fail safe, as the runtime reads an unexpected mode).
  - `maySpend`: `maySpend(billing.mode, billing.status)` from `billing_accounts`.
  - `workspaceZone`: `tenants.timezone`.
  - The root's id: for `lead_first` steps it is the step's own; for steps, walk `after_playbook_id` up to the root (at most 10 reads; a chain is short). `ReachOutStep.root_id` carries it.
- [ ] **Step 2: The sweep.** In `apps/edge/api/cron/playbooks.ts`, after the moments loop:

```ts
  // Reach-outs (Part 3): each step on its day, as the moments are, through its own verb.
  const reachOuts = await reachOutsDue(db, PLAYBOOKS_PER_TICK).catch((e) => {
    L.error("reach_outs_read_failed", { error: e instanceof Error ? e.message : String(e) });
    return { rows: [], remaining: 0 };
  });
  for (const step of reachOuts.rows) {
    const tz = zoneOfTenant.get(step.tenant_id) ?? "America/New_York";
    if (!runDueNow(step as unknown as PlaybookDto, tz, now)) continue;
    const ctx = await reachOutRunContext(db, step, now);
    const r = await runReachOut(ctx, step, { runFor: localDate(tz, now) });
    await stampRun(db, step.id, localDate(tz, now), now);
    out[r.outcome === "sent" ? "sent" : r.outcome] += 1;
  }
```
`zoneOfTenant` is a small map the loop fills as it reads each tenant's zone; `stampRun` is the existing `last_run_*` write, moved to a helper both loops call.
- [ ] **Step 3: `approve.ts`.** The day check at `:34-40` becomes `if (dayPassed && run.audience?.kind !== "reach_out") return refuse(...)`, with a comment: a reach-out's sends are planned again when they are stale, so its run keeps.
- [ ] **Step 4: Run the tests, then the gate.** Commit; review; PR ("Reach out 3 (4 of 9): a step's run, assembled and planned").

---

## PR 5 — The clock (00185): reconcile, finish, re-plan; nothing claimed yet

The clock runs every minute. This PR gives it everything except the claim, so it can merge and run against production
while no send is claimable: it reads, reconciles and finishes runs, and it is watched (`sweep_status`) from its first
tick.

### Task 5.1: The migration

**Files:**
- Create: `supabase/migrations/00185_the_reach_out_clock.sql`
- Modify: `tooling/scripts/tests/sweep-registry.db.test.mjs` (`EVERY_CLOCK` gains `reach_out`)

- [ ] **Step 1: Write it** (00175:104-131's shape)

```sql
-- 00185 · The reach-out clock.
--
-- Reach out, Part 3 (the plan's PR 5). Every minute; calls the edge (/api/cron/reach-out) only when a send is due, one
-- is waiting on its email's outcome, or a reach-out run is open. Otherwise it records that it looked, so a silent
-- clock is still a watched one (00107).

set local lock_timeout = '3s';

create or replace function public.trigger_reach_out_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.reach_out_sends where state = 'planned' and send_at <= now())
     or exists (select 1 from public.reach_out_sends where state in ('claimed', 'queued'))
     or exists (select 1 from public.broadcasts b
                 where b.state in ('scheduled', 'sending', 'canceled') and b.audience->>'kind' = 'reach_out'
                   and exists (select 1 from public.reach_out_sends s where s.broadcast_id = b.id and s.state = 'planned')) then
    return public.request_sweep('reach_out', '/api/cron/reach-out', 55000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('reach_out', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_reach_out_sweep() from public, anon, authenticated;
comment on function public.trigger_reach_out_sweep() is
  'The reach-out clock (Reach out, Part 3). Calls the edge only when a send is due, one waits on its outcome, or an open run has planned sends; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every minute, recording itself each time: five minutes is five missed ticks.
  ('reach_out', 'reach-out-sweep', interval '5 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('reach-out-sweep') where exists (select 1 from cron.job where jobname = 'reach-out-sweep');
select cron.schedule('reach-out-sweep', '* * * * *', $$select public.trigger_reach_out_sweep()$$);
```

- [ ] **Step 2**: `sweep-registry.db.test.mjs`'s `EVERY_CLOCK` gains `reach_out: "reach-out-sweep"` (its map's own shape). The per-second clocks' short cron history (`purge_cron_history`, 00099:35) does not apply to a per-minute clock; the fourteen days it keeps are what the others keep.

### Task 5.2: The door and the three steps

**Files:**
- Create: `apps/edge/api/cron/reach-out.ts`, `apps/edge/lib/reach-out/reconcile.ts`
- Modify: `apps/edge/vercel.json` (`"api/cron/reach-out.ts": { "maxDuration": 60 }`)
- Modify: `packages/db/src/repositories/reach-out.ts` (`queuedSends`, `sendsOfClosedRuns`, `staleSends`, `openRuns`, `leadWritten`)
- Test: `tooling/scripts/tests/cron-reach-out-door.test.mjs` (a world over `_fake-db.mjs`, `cron-domains-door.test.mjs`'s shape)

- [ ] **Step 1: The failing tests**:
  1. The cron key or nothing (`refusedAtTheDoor`).
  2. **Reconcile**, one queued send per message outcome:

     | The message row | The send |
     | --- | --- |
     | `sent`, `delivered`, `read` | `sent`, its `sent_at` the message's `status_at.sent`; its lead `nurture` (from `ready`), `contacted_at`, `last_outcome: "emailed"`, `version + 1`, one `lead.emailed` event |
     | `failed` with `outcome: "unknown"` | still `queued` |
     | `failed` with `provider: "bounced"` | `failed`, reason `bounced` |
     | `canceled` with `sending_domain_at_cap` | `planned` again, `attempts + 1`, `message_id` null, a `send_at` from the timetable on its domain |
     | `canceled` with `outreach_wrote_back` | `skipped`, reason `outreach_wrote_back` |
     | `canceled` with `outreach_needs_own_domain` (a removed domain) | `planned` on another verified domain |

  3. **Closed runs:** a canceled run's planned sends are `skipped`, reason `run_canceled`.
  3a. **What a deletion took:**
     - a queued send whose email row is gone (an erasure) is `skipped`, reason `erased`;
     - a planned send whose domain was removed (`domain_id` null) is re-planned on another verified domain, or `skipped` `no_domain` when none is left.
  4. **Stale sends:** a planned send whose `send_at` is 20 minutes past (a run approved late, a chain resumed) is re-planned from now. One 5 minutes past is left for the claim.
  5. **Finishing:** a run whose sends are all final becomes `sent` with `finished_at`; one with a send still `queued` does not.
  6. **The answer:** `{ ok, reconciled, sent, deferred, skipped, finished, replanned }`; 200.

- [ ] **Step 2: Implement `reconcile.ts`**

```ts
/**
 * What became of the emails the reach-out clock wrote (Part 3, E3): each queued send reads its email row and moves
 * once. A sent email is a sent send, and its lead is written to (nurture, contacted, emailed). An email whose
 * outcome is unknown waits for its receipt. A failed one is failed. One the door refused with a wait (the domain's
 * day is full, the domain is not ready: contracts OUTREACH_WAIT_REFUSALS) is planned again, never lost (C5). Any
 * other refusal is the door's word for why this lead is not written to. A removed domain is a wait too: the send goes
 * from another.
 */
import { isWaitRefusal } from "../packages/contracts.js";
import { moveSend, queuedSends, leadWritten, type ReachOutSendRow } from "../packages/db.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import type { Logger } from "../log.js";

export interface ReconcileCounts {
  reconciled: number;
  sent: number;
  deferred: number;
  skipped: number;
  failed: number;
}

export async function reconcile(
  db: SupabaseClient<Database>,
  now: Date,
  log: Logger,
  replan: (sends: ReachOutSendRow[]) => Promise<number>,
): Promise<ReconcileCounts> {
  const out: ReconcileCounts = { reconciled: 0, sent: 0, deferred: 0, skipped: 0, failed: 0 };
  const rows = await queuedSends(db, 500);
  const again: ReachOutSendRow[] = [];
  for (const { send, message } of rows) {
    const status = message?.status ?? null;
    const error = (message?.error ?? null) as { reason?: string; provider?: string; outcome?: string } | null;
    if (status === "sent" || status === "delivered" || status === "read") {
      const at = String((message?.meta as { status_at?: { sent?: string } } | null)?.status_at?.sent ?? message?.created_at ?? now.toISOString());
      if (await moveSend(db, { tenantId: send.tenant_id, id: send.id, from: "queued", patch: { state: "sent", sent_at: at } })) {
        await leadWritten(db, { tenantId: send.tenant_id, leadId: send.lead_id, at, sendId: send.id });
        out.sent += 1;
      }
    } else if (status === "failed" && error?.outcome === "unknown") {
      continue; // its receipt settles it (00177's guard), then the next tick reads it
    } else if (status === "failed") {
      const reason = error?.provider === "bounced" ? "bounced" : (error?.reason ?? "send_failed");
      if (await moveSend(db, { tenantId: send.tenant_id, id: send.id, from: "queued", patch: { state: "failed", reason } })) out.failed += 1;
    } else if (status === "canceled") {
      const reason = error?.reason ?? "canceled";
      if (isWaitRefusal(reason) || reason === "outreach_needs_own_domain") again.push(send);
      else if (await moveSend(db, { tenantId: send.tenant_id, id: send.id, from: "queued", patch: { state: "skipped", reason } })) out.skipped += 1;
    } else if (status === null) {
      // Its email row is gone: an erasure deletes the person's messages (erase_contact), and the send never goes.
      if (await moveSend(db, { tenantId: send.tenant_id, id: send.id, from: "queued", patch: { state: "skipped", reason: "erased" } })) out.skipped += 1;
    } else continue; // still queued: its job has not run yet
    out.reconciled += 1;
  }
  if (again.length) out.deferred += await replan(again);
  return out;
}
```
`queuedSends(db, limit)` reads `reach_out_sends` in state `queued` with `messages(status, error, meta, created_at)` joined through `message_id`, oldest first. `leadWritten` is:
```ts
export async function leadWritten(db: Db, p: { tenantId: string; leadId: string; at: string; sendId: string }): Promise<void> {
  const { data: lead, error } = await db.from("leads").select("stage, version").eq("tenant_id", p.tenantId).eq("id", p.leadId).maybeSingle();
  if (error) throw new Error(`cannot read the lead a send wrote to: ${error.message}`);
  if (!lead) return;
  const { error: e2 } = await db
    .from("leads")
    .update({ stage: lead.stage === "ready" ? "nurture" : lead.stage, contacted_at: p.at, last_outcome: "emailed", version: lead.version + 1 } as never)
    .eq("tenant_id", p.tenantId).eq("id", p.leadId).eq("version", lead.version);
  if (e2) throw new Error(`cannot record the lead as written to: ${e2.message}`);
  await db.from("events").insert({ tenant_id: p.tenantId, kind: "lead.emailed", category: "lead", subject_type: "lead", subject_id: p.leadId, data: { by: "reach_out", send_id: p.sendId } } as never);
}
```
Write `contacted_at` only when it is null (`coalesce`): use `.is("contacted_at", null)` on a second update, or read it with the stage and keep the first. The event kind `lead.emailed` exists (00142:255-259). `emitEvent`'s literal rule (feedback_event_kinds_lint_literals) applies if you use `emitEvent`.

- [ ] **Step 3: The re-plan.** `replan(sends)`:
  - groups the sends by run;
  - reads each run's step (`gap_minutes`, `domain_ids`) and each send's lead (`region`, `hours`);
  - asks `timetable()` with the verified domains' capacities (`recent` without these sends' own times);
  - moves each placed send `planned` with its new `send_at` / `domain_id`, `attempts + 1` and `message_id: null` (from `queued` or `claimed`), or leaves an already-planned stale one planned with a new time.

  A send the timetable cannot place is `skipped` with reason `no_room`. So is one with 10 attempts already, with reason `kept_waiting`. The same function serves step 4 (stale planned sends).

- [ ] **Step 4: The door** (the deadman shape: `pg()`, `authorizeCron`, a logger with `sweep: "reach_out"`, 503 without a database)

```ts
export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const L = logger({ sweep: "reach_out" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  const now = new Date();
  const replan = (sends: ReachOutSendRow[]) => replanSends(db, sends, now, L);
  const rec = await reconcile(db, now, L, replan);
  const closed = await skipClosedRunSends(db, now); // run_canceled
  const replanned = await replan(await staleSends(db, now, STALE_AFTER_MS, 200));
  const finished = await finishRuns(db, now);
  L.info("reach_out_swept", { ...rec, closed, replanned, finished, took_ms: Date.now() - started });
  return json(200, { ok: true, ...rec, closed, replanned, finished });
}
```
`STALE_AFTER_MS = 15 * 60_000`. `finishRuns` moves each open reach-out run with no send in `planned | claimed | queued` to `sent` (and `finished_at`) through `broadcasts_guard`'s own moves (scheduled/sending → sent). A run still `pending_approval` is left to its owner.

- [ ] **Step 5: Run the tests, the gate, and `test:db` with 00185** (the sweep registry and `sweep_health` know `reach_out`). Production: dry run, push, read back (`select * from sweep_status where sweep = 'reach_out'`; `select schedule from cron.job where jobname = 'reach-out-sweep'`). Commit; review; PR ("Reach out 3 (5 of 9): the reach-out clock; nothing is claimed yet").

---

## PR 6 — The sender: claim and write

The one PR that sends. After it, a reach-out run approved on Broadcasts goes out, one email per claim, from the
workspace's own domains. It is complete only with the secrets set (C13); until then the clock answers 503 while
sends are due and says which is missing.

### Task 6.1: The frozen request

**Files:**
- Create: `apps/edge/lib/reach-out/request.ts`
- Test: `tooling/scripts/tests/reach-out-request.test.mjs`

- [ ] **Step 1: The failing tests** (pure over its inputs; the real `buildEmailRequest`, `ownDomainIdentity`, `signUnsubscribeToken`, `verifyUnsubscribeToken`):
  1. A first step's request:
     - From is the domain's `from_name <from_local@host>`; Reply-To is the mailbox's route on the mail domain.
     - The subject and body are filled from the template (`{{business}}` becomes the lead's name).
     - `List-Unsubscribe` is `<https://app.chanlytics.com/u/TOKEN>` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and the token verifies to `{tenant, contact, message}`.
     - The foot carries "This is a marketing email.", the business's name and address, and "Unsubscribe".
     - `idempotency_key` is the message id; the tags are `cl_message` and `cl_tenant`; `Auto-Submitted: auto-generated`.
  2. A step's request (D19): its subject is `Re: ` + the first email's subject, and `In-Reply-To` / `References` name the first email's Message-ID.
  3. A slot with no value: `{ ok: false, reason: "missing_value" }`.
  4. No business address on the profile: `{ ok: false, reason: "no_business_address" }`.

- [ ] **Step 2: Implement**

```ts
/**
 * The email a reach-out send leaves as, frozen before its row is written (Part 3; C9, C10, D19): the step's words with
 * the lead's values in, the workspace's own domain as From and its mailbox as Reply-To (so a reply lands in the
 * Inbox), the foot the law asks for, and the one-click unsubscribe sealed for this person and this email. A step after
 * the first answers the first: "Re:" and its Message-ID, so the nudge reads as the same thread (D19).
 */
import { buildEmailRequest, ownDomainIdentity, signUnsubscribeToken, unsubscribeUrl, type EmailParent, type EmailRequest } from "../packages/channels.js";
import { campaignFooter, campaignFooterHtml, reachOutSlots, whyFrom } from "../packages/contracts.js";

export interface RequestInput {
  tenantId: string;
  messageId: string;
  contactId: string;
  to: string;
  words: { subject: string; body: string };
  lead: { business_name: string | null; city: string | null };
  workspace: { businessName: string | null; address: string | null };
  domain: { host: string; from_local: string; from_name: string };
  mailbox: { local_part: string; reply_token: string; from_name: string };
  mailDomain: string;
  unsubscribe: { secret: string; origin: string };
  /** The first email of the chain to this lead, for a step after it; null for the first. */
  parent: EmailParent | null;
}

export function reachOutRequest(i: RequestInput):
  | { ok: true; request: EmailRequest; subject: string; body: string }
  | { ok: false; reason: "missing_value" | "no_business_address" } {
  const subject = i.parent ? null : reachOutSlots(i.words.subject, i.lead, i.workspace);
  const body = reachOutSlots(i.words.body, i.lead, i.workspace);
  if ((subject && !subject.ok) || !body.ok) return { ok: false, reason: "missing_value" };
  if (!i.workspace.address?.trim() || !i.workspace.businessName?.trim()) return { ok: false, reason: "no_business_address" };
  const token = signUnsubscribeToken(i.unsubscribe.secret, { tenantId: i.tenantId, contactId: i.contactId, messageId: i.messageId });
  const url = unsubscribeUrl(i.unsubscribe.origin, token);
  const foot = { why: whyFrom("maps"), business: i.workspace.businessName, address: i.workspace.address, unsubscribeUrl: url };
  const request = buildEmailRequest({
    identity: ownDomainIdentity(i.domain, i.mailbox, i.mailDomain),
    to: i.to,
    parent: i.parent,
    ...(subject ? { subject: subject.text } : {}),
    body: body.text,
    signature: null,
    actor: "human",
    campaign: { unsubscribeUrl: url, footer: campaignFooter(foot), footerHtml: campaignFooterHtml(foot) },
    messageId: i.messageId,
    tenantId: i.tenantId,
  });
  return { ok: true, request, subject: request.subject, body: body.text };
}
```
Match `campaignFooter`'s real argument names (`contracts/reach-out.ts:29-43`) and `ownDomainIdentity`'s (`channels/email.ts:703-713`) before running. `actor: "human"`: the owner's words, sent by the machine. `Auto-Submitted` is set by the campaign either way (`email.ts:246-253`).

### Task 6.2: Claim and write

**Files:**
- Create: `apps/edge/lib/reach-out/sender.ts`
- Modify: `apps/edge/api/cron/reach-out.ts` (the claim, after the reconcile; the lane check; the month's allowance)
- Modify: `packages/db/src/repositories/reach-out.ts` (`dueDomains`, `monthSent`, `insertQueuedEmail`)
- Modify: `packages/jobs/src/handlers.ts:37-73` and `packages/core/src/messages/send.ts` (the queued row's `meta.reach_out.lead_id` reaches the door as `Delivery.leadId`), `packages/core/src/deliver.ts` (`outreachFactsOf(…, { leadId: d.leadId })`)
- Test: `cron-reach-out-door.test.mjs` (the claim cases), `deliver.test.mjs` (the lead-keyed facts)

- [ ] **Step 1: The failing tests**:
  1. **One claim becomes one email.** A due planned send on a verified domain with room is claimed. It gets a person made (`reach_out_person`) and one `messages` row: `queued`, `channel email`, the message id `sendMessageId(send, 0)`, and `meta` holding `{ source: "reach_out", email: { subject, to, request }, reach_out: { send_id, lead_id, contact_id, playbook_id, root_id, broadcast_id, attempt: 0 } }`. It also gets one `outbound_send` job due now with `{ message_id, conversation_id, to_email, purpose: "outreach", proactive: true }`. The send ends `queued` and the run `sending`.
  2. **The lane:** without `UNSUBSCRIBE_SECRET` (or either cold key, or `EMAIL_DOMAIN`), nothing is claimed, and the answer is 503 `cold_lane_unset` naming what is missing (C13). With nothing due, it is still 200.
  3. **The month:** a workspace at `REACH_OUT_MONTH_EMAILS` claims nothing. One with 3 left claims 3 at most.
  4. **The person refused:** the send is `skipped`, `already_yours`.
  5. **The request refused:** `skipped`, `missing_value` or `no_business_address`.
  6. **A step's send:** it threads under its lead's first email, and waits (planned, `send_at` + 1 hour) while that email has no Message-ID yet (`parent_unstamped`).
  7. **A retry of a written send** (its row exists) schedules nothing twice and moves the send to `queued`.
  8. **A claimed send left `claimed` for five minutes** (a tick that died after the claim) is written again: its row's id is the same, so it is the same email.
  9. **The door by lead:** `deliver` asks `outreach_facts` with the row's lead id.

- [ ] **Step 2: Implement `sender.ts`**

```ts
/**
 * The reach-out clock's claim (Part 3): for each domain with due sends, a claim under the domain's lock (C7, 00184),
 * then for each claimed send the person (made once, E5), the frozen request (C9, C10), the email row and its
 * outbound_send job (rows first, C8). The send goes when the jobs tick runs it, through the one door. A send that
 * cannot be written says why and is skipped; one that must wait is planned again.
 */
import { REACH_OUT_MONTH_EMAILS, domainDailyCap } from "../packages/contracts.js";
import { sendMessageId } from "../packages/core.js";
import {
  claimSends, domainCapacityOf, dueDomains, insertQueuedEmail, monthSent, moveSend, reachOutPerson, type ReachOutSendRow,
} from "../packages/db.js";

export const CLAIM_PER_DOMAIN_PER_TICK = 5;
export const CLAIM_YIELD_AT_MS = 40_000;

export interface Lane {
  unsubscribeSecret: string;
  unsubscribeOrigin: string;
  mailDomain: string;
}

export async function claimAndWrite(p: {
  db: Db; now: Date; started: number; lane: Lane; log: Logger;
  schedule: (tenantId: string, payload: OutboundSendPayload) => Promise<void>;
  replan: (sends: ReachOutSendRow[]) => Promise<number>;
}): Promise<{ claimed: number; written: number; skipped: number; waited: number }> {
  const out = { claimed: 0, written: 0, skipped: 0, waited: 0 };
  const allowance = new Map<string, number>();
  for (const d of await dueDomains(p.db, p.now, 50)) {
    if (Date.now() - p.started > CLAIM_YIELD_AT_MS) break;
    if (!allowance.has(d.tenant_id)) allowance.set(d.tenant_id, REACH_OUT_MONTH_EMAILS - (await monthSent(p.db, d.tenant_id, p.now)));
    const left = allowance.get(d.tenant_id) ?? 0;
    if (left <= 0) continue;
    const cap = domainDailyCap((await domainCapacityOf(p.db, d.id, p.now)).sent_days);
    const claimed = await claimSends(p.db, { domainId: d.id, cap, at: p.now, limit: Math.min(CLAIM_PER_DOMAIN_PER_TICK, left) });
    out.claimed += claimed.length;
    allowance.set(d.tenant_id, left - claimed.length);
    for (const send of claimed) {
      const r = await writeOne(p, send);
      out[r] += 1;
    }
  }
  return out;
}
```
`writeOne(p, send)` returns `"written" | "skipped" | "waited"`. In order:
1. The person: `send.contact_id ?? reachOutPerson(...)`. A refusal moves the send `claimed → skipped` with the refusal. A made person is written onto the send (`contact_id`) in the same move as `queued`.
2. The words: the step's template row (`templates` by `playbooks.template_id`, `channel = 'email'`): HEADER is the subject, BODY the body.
3. The lead: `business_name`, `city`, `email`.
4. The workspace: `tenants.name` and the profile's address (`tenant_config.config.brain.profile.address`, what drafts use: `lead-helpers.ts:71-86`).
5. The domain's identity, and the mailbox (`mailboxOfTenant`).
6. For a step: its parent. That is the lead's send on the step before (`reach_out_sends` where `root_id` and `lead_id` match and `playbook_id` is the step's `after_playbook_id`). Its message's `meta.email` gives `message_id` (the Message-ID its receipt stamped), `references` and `subject`. A parent with no Message-ID yet moves the send `claimed → planned` with `send_at + 1 hour` (`waited`).
7. `reachOutRequest(...)`. A refusal is `skipped` with its reason.
8. `insertQueuedEmail(db, { id: messageId, tenant_id, conversation_id, contact_id, channel: "email", direction: "outbound", sender: "human", type: "text", body, status: "queued", meta })`. A 23505 on the id means the row exists (a retry): go on.
9. `p.schedule(tenant, { message_id, conversation_id, to_email, purpose: "outreach", proactive: true })`. On a retry whose row existed, schedule only when the send is still `claimed` (step 10 has not run).
10. `moveSend(claimed → queued, { message_id, contact_id })`, and the run `scheduled → sending` (an update where `state = 'scheduled'`).

A send left `claimed` for five minutes is read by `staleClaims(db, now)` at the tick's start and handed to `writeOne` again.

- [ ] **Step 3: The door's lane check** (C13), in `api/cron/reach-out.ts` before the claim:

```ts
  const missing = [
    !env.RESEND_COLD_API_KEY && "RESEND_COLD_API_KEY",
    !env.RESEND_COLD_WEBHOOK_SECRET && "RESEND_COLD_WEBHOOK_SECRET",
    !env.UNSUBSCRIBE_SECRET && "UNSUBSCRIBE_SECRET",
    !env.EMAIL_DOMAIN && "EMAIL_DOMAIN",
  ].filter((x): x is string => !!x);
  const claim = missing.length
    ? { claimed: 0, written: 0, skipped: 0, waited: 0, due: await dueCount(db, now) }
    : { ...(await claimAndWrite({ db, now, started, lane: { unsubscribeSecret: env.UNSUBSCRIBE_SECRET!, unsubscribeOrigin: dashboardOrigin(), mailDomain: env.EMAIL_DOMAIN! }, log: L, schedule, replan })), due: 0 };
  if (missing.length && claim.due > 0) return json(503, { ok: false, error: "cold_lane_unset", missing, ...rec, ...claim });
```
`schedule` is `scheduleJob(db, tenantId, "outbound_send", now, payload)` (`packages/jobs/src/schedule.ts:18-26`).

- [ ] **Step 4: The door keyed by lead.**
  - `handlers.ts` reads `meta.reach_out.lead_id` from the queued row it already loads (`:38-73`) and passes `leadId` into `sendQueued`'s delivery.
  - `Delivery` gains `leadId?: string | null`.
  - `outreachFacts` passes it to `outreachFactsOf`.
  - `deliver.test.mjs`: a cold row naming an archived lead is refused `outreach_lead_closed` even when the person has another ready lead.

- [ ] **Step 5: C14, the provider's own rate.** `packages/channels/src/email-resend.ts`: after a successful send, read `ratelimit-remaining` and `ratelimit-reset`. When the remaining is `0`, wait out the reset (capped at `LIMIT_WAIT_MAX_MS`) before returning, so the next email this instance sends does not meet a 429. Test with a stubbed `fetch` that answers 200 with `ratelimit-remaining: 0, ratelimit-reset: 1`: the send returns after about a second, and one without those headers returns at once.

- [ ] **Step 6: Run the tests, then the gate.** Commit; review; PR ("Reach out 3 (6 of 9): the sender: one claim, one email").
  - **Before merging**: nothing to apply. **Deploy order**: either. The dashboard does not change.
  - Nothing sends until a reach-out exists (Part 4's sheet, or the integration test's seed) and the secrets are set.

---

## PR 7 — The holds (00186): C11, D16, D18

### Task 7.1: A bounce marks the lead (C11)

**Files:**
- Modify: `apps/edge/lib/email/email-receipts.ts` (after `suppressEmailOf` on a permanent bounce)
- Modify: `packages/db/src/repositories/reach-out.ts` (`leadAddressBounced`)
- Test: `tooling/scripts/tests/email-receipts.test.mjs`

- [ ] **Step 1: The failing test.**
  - A permanent bounce of a cold row whose `meta.reach_out.lead_id` is `l1` leaves `l1` with `email_state: "invalid"`, `email_checked_at` set and `version + 1`.
  - A transient bounce leaves it `ok`.
  - A reply's bounce touches no lead.
- [ ] **Step 2: Implement**
  - `leadAddressBounced(db, { tenantId, leadId, at })` updates `leads set email_state = 'invalid', email_checked_at = at, version = version + 1` for that lead when it is not erased.
  - The receipt calls it when `effect.suppress` is `hard_bounce` and the row's `meta.reach_out.lead_id` is a string. Read `meta` in the same select that already reads the row for `isCampaignEmail` (`sentEmailRequestOf`; widen it to return the meta it reads).
  - The chain stops on any bounce already (PR 3's followers, C4). The address stops at the door already (`email_suppressed`). This makes the Leads page say it (`email_state` drives the lead's shape, `leads-cells.jsx LeadShape`).

### Task 7.2: A second reputation hold is the platform's to lift (D16)

**Files:**
- Create: `supabase/migrations/00186_a_domain_is_held_for_its_unsubscribes.sql` (with Task 7.3's)
- Modify: `packages/contracts/src/sending-domains.ts` (`resumeDomain`'s refusal, the words), `apps/edge/lib/email/sending-domains.ts` (`applyDomainCheck` on a reputation hold; `resumeSendingDomain`), `packages/db/src/repositories/sending-domains.ts` (`reputationHoldsSince(db, host, since)`)
- Test: `cron-domains-door.test.mjs`, `admin-sending-domains-door.test.mjs`, `sending-domains.test.mjs`

- [ ] **Step 1: The migration's first part**

```sql
alter table public.sending_domains add column if not exists resume_by text not null default 'owner';
alter table public.sending_domains drop constraint if exists sending_domains_resume_by_check;
alter table public.sending_domains add constraint sending_domains_resume_by_check check (resume_by in ('owner', 'platform'));
```
- [ ] **Step 2: The failing tests.**
  - A domain held for bounces 10 days after an earlier bounces hold of the same host (an event `sending_domain.held {host, why: bounces}`) is held with `resume_by: platform`, and the platform is paged `sending_domain_held_twice:<host>`.
  - The owner's Resume on it is refused ("Held twice in 30 days: the platform lifts this hold, and has been told").
  - A first hold stays `owner`.
  - The platform's resume (`op: resume` with the `DIAG_KEY` door, `by: "platform"`) lifts it and sets `resume_by` back to `owner`.
  - The domain row's words say "Held twice in 30 days · we were told".
- [ ] **Step 3: Implement.**
  - When `applyDomainCheck` writes a reputation hold (`bounces | complaint | unsubscribes`), it counts that host's reputation holds in the last 30 days (`events` of kind `sending_domain.held`, `data->>host` the host, `data->>why` one of the three: the host, since a removed and re-added domain has a new id).
  - When there is one before this, the same write sets `resume_by = 'platform'` and the page is sent.
  - `resumeSendingDomain` refuses the owner when `resume_by = 'platform'`.
  - The admin door's `resume` takes `by: "platform"` only on the `DIAG_KEY` path, and that path writes `resume_by = 'owner'`.

### Task 7.3: Unsubscribes hold a domain (D18)

**Files:**
- Modify: 00186 (its second part), `packages/contracts/src/sending-domains.ts` (`reputationHoldOf`, `domainHoldWords`), `packages/db/src/repositories/sending-domains.ts` (the counts read)
- Test: `sending-domains.test.mjs`, `outreach-facts.db.test.mjs` or a new `sending-domain-counts.db.test.mjs`

- [ ] **Step 1: The migration's second part.**
  - `held_why` gains `unsubscribes` (re-issue 00178's CHECK with it).
  - `sending_domain_counts` (latest body 00179:38-66) gains `unsubscribed`: the distinct emails among its window (the last 500 that left since `counted_since`) that a `contact.consent_changed` event with `data->>'purpose' = 'email_marketing'`, `data->>'source' = 'unsubscribe'` names by `data->>'message_id'`.
  - Re-create it whole, service role only, as 00179 did.
- [ ] **Step 2: The failing tests.**
  - `reputationHoldOf({ sent: 200, bounced: 0, complained: 0, unsubscribed: 5 })` is `unsubscribes` (5 × 50 > 200).
  - `{ sent: 100, unsubscribed: 3 }` is null (150 floor).
  - A complaint still outranks, then bounces, then unsubscribes.
  - The words: "Held · a lot of people unsubscribed from its last emails". The fix line is the bounces one (check the list, write to fewer).
- [ ] **Step 3: Implement.**
  - `reputationHoldOf` gains `if (c.unsubscribed * 50 > Math.max(c.sent, 150)) return "unsubscribes";` after the bounces rule.
  - `DomainCounts` gains `unsubscribed`.
  - The owner lifts it with Resume (a reputation hold: `judgeDomain`'s "reputation outranks self-lifting holds" covers it once the type knows it).
  - "No" replies join this rule in Part 5, when a reply is read for what it means.
- [ ] **Step 4:** apply 00186 to the stack, regenerate the sets and types, run `test:db`; production dry run, push, read back (`resume_by` column, the CHECK, `sending_domain_counts` answers `unsubscribed`). Commit; review; PR ("Reach out 3 (7 of 9): a bounce marks the lead; a second hold is the platform's; unsubscribes hold a domain").

---

## PR 8 — A cold-only link and reply domain (D17)

No migration. The switches ship with today's addresses as their defaults, so nothing moves until Ruben sets them.

### Task 8.1: The switches

**Files:**
- Modify: `apps/edge/lib/env.ts`, `apps/edge/.env.example` (`UNSUBSCRIBE_ORIGIN`, `COLD_REPLY_DOMAIN`)
- Modify: `apps/edge/lib/dashboard-origin.ts` (an `unsubscribeOrigin()` beside `dashboardOrigin()`), `apps/edge/lib/email/unsubscribe-probe.ts` (the probe opens the links where they are minted), `apps/edge/api/cron/reach-out.ts` (the lane's `unsubscribeOrigin` and `mailDomain`)
- Modify: `packages/channels/src/email.ts` (the platform-recipient reader accepts reply routes on `COLD_REPLY_DOMAIN` too; `ownDomainIdentity` is given the cold reply domain when set)
- Modify: `apps/dashboard/middleware.ts` or the canonical-host redirect (`/u/` is already exempt; confirm it answers on any host the project serves)
- Test: `env-manifest.test.mjs` (the two lines), `reach-out-request.test.mjs` (a set `COLD_REPLY_DOMAIN` makes Reply-To `r+<token>@<it>`), the email intake's test (a delivery to `r+<token>@<cold reply domain>` routes to the mailbox), `cron-domains-door.test.mjs` (the probe opens `UNSUBSCRIBE_ORIGIN` when set)

- [ ] **Step 1: The failing tests** (as above).
- [ ] **Step 2: Implement.**

```ts
  /** Where a cold email's unsubscribe links point (D17): its own domain before scale, so the app's is never judged by cold mail. Empty = the dashboard's origin. An origin only. */
  get UNSUBSCRIBE_ORIGIN() {
    return read(process.env.UNSUBSCRIBE_ORIGIN);
  },
  /** The domain a cold email's replies come back on (D17); the mailbox's reply routes there. Empty = EMAIL_DOMAIN. */
  get COLD_REPLY_DOMAIN() {
    return read(process.env.COLD_REPLY_DOMAIN);
  },
```
`unsubscribeOrigin()` validates an `https://host` origin, as `dashboardOrigin()` does, and falls back to it.

- [ ] **Step 3: The runbook**, "Before scale: a cold-only domain" (D17):
  1. Buy a domain for cold mail's links and replies (not a workspace's, not chanlytics.com).
  2. Add it to the dashboard's Vercel project, so `https://<it>/u/<token>` is the unsubscribe page.
  3. Set `UNSUBSCRIBE_ORIGIN=https://<it>` on the edge, then redeploy it. The probe then opens the page there.
  4. Receive mail on a subdomain of it on the platform Resend account (MX to Resend, as `mail.chanlytics.com`), and point its inbound webhook at `/api/resend-webhook`.
  5. Set `COLD_REPLY_DOMAIN=<that subdomain>` on the edge. New cold emails' Reply-To moves there; replies to older ones still arrive on `EMAIL_DOMAIN`, which keeps receiving.
- [ ] **Step 4: The gate**, commit, review, PR ("Reach out 3 (8 of 9): a cold-only link and reply domain, when it is set").

---

## PR 9 — The proof and the docs

### Task 9.1: End to end, on a replayed stack

**Files:**
- Create: `tooling/scripts/tests/reach-out.integration.db.test.mjs`

- [ ] **Step 1: Write it.** Local stack only; one workspace. The seed:
  - a verified `sending_domains` row and a mailbox;
  - the profile's address;
  - a lead search with three qualified members: Texas, California, and one whose address a person already has;
  - an email template;
  - a chain: a root, and a step three days after it.

  Stub `fetch` for Resend with the cold key, answering each `POST /emails` with an id and recording the request. The test then runs the real code, step by step:
  1. **The playbooks sweep** (the edge's POST with the cron key through `_cron-doors-world.mjs`'s vault) makes one `pending_approval` run with two planned sends (the customer is not among them), and one `reach_out.waiting` notification.
  2. **Approve** (core `approveRun` with the dashboard's ports over the stack's service client); backdate the sends' `send_at` to a minute ago.
  3. **The clock** (`POST /api/cron/reach-out`) claims two, makes two people (the leads stay `ready`), writes two queued rows with `meta.reach_out`, and schedules two `outbound_send` jobs.
  4. **The jobs** (`handlers.outbound_send` with the edge's email wire): both leave through the door, From the own domain, `List-Unsubscribe` sealed for each person, `Auto-Submitted: auto-generated`.
  5. **A receipt** (`applyEmailReceipt` with a signed `email.sent` then `email.delivered`) stamps the Message-IDs; the clock reconciles: both sends `sent`, both leads `nurture` and `emailed`.
  6. **Three days on** (backdate `sent_at`): the sweep runs the step.
     - The Texas lead has written back, from `owner@` their own domain, answering the first email (`in_reply_to`). It is not planned.
     - The California lead is: its email's subject is `Re: <the first>` and its `In-Reply-To` is the first's Message-ID.
  7. **A permanent bounce** of the nudge makes the California lead `invalid`.
  8. **The clock** finishes both runs `sent`.
  9. **At the cap:** with the domain's cap at 1 (a `sent_days` of 0 and one send today), a third due send is not claimed. The door refuses a hand-written cold row past the cap as `sending_domain_at_cap`, and the reconcile plans it again, never skips it.
- [ ] **Step 2: Run it** with every Part 3 migration applied, then `test:db` whole.

### Task 9.2: The docs say what was built

- [ ] The spec: §4.1–4.5 and §4.7 "As built (Part 3)" paragraphs (the table, the clock, the timetable's rules, E1–E12 where they changed the spec's words); §6's Part 3 line with its PRs and migrations; C1–C14 each marked with where it landed.
- [ ] The PRD: S-14.4's reach-out bullets (the chain, the sends, the clock, the allowance), Appendix B's two switches, the clocks table's `reach_out` row.
- [ ] The runbook: "Turn on cold email" gains step 8, the first reach-out (made in Part 4's sheet; until then, the integration test's seed is the only way), what the clock's 503 `cold_lane_unset` means, and "Before scale" (PR 8).
- [ ] `docs/architecture.md`: the reach-out paragraph (the objects, the clock, rows first, the door by lead).
- [ ] `docs/glossary.md`: **Reach-out** (a chain of playbook steps over one lead search) and **Send** (one lead in one step's run: `reach_out_sends`).
- [ ] This plan's "As built" section: what each PR did, where it differed from this plan and why.
- [ ] The gate; commit; review; PR ("Reach out 3 (9 of 9): the proof, end to end, and the docs").

---

## 5. Self-review (run 25 Sep 2026)

**Spec coverage** (§4.1–4.5, §4.7–4.8, §4.12, §6's C1–C14, D15–D19):

| Item | Where |
| --- | --- |
| §4.1 the object | PR 1 |
| §4.2 audience and person | PR 3 (audience, person), PR 4 (run) |
| §4.3 words | E9: Part 3's three slots; the rest are Part 4 |
| §4.4 the check | Part 4 (its model rules); Part 3's code rules are the door's, the audience's and `reachOutSlots` |
| §4.5 timetable and ticker | PR 2, PR 5, PR 6 |
| §4.7 stops | replied, unsubscribed, said_no, bounced and closed (the door by lead, the followers); booked, not_now and away are Part 5's (the classifier) |
| §4.8 protection | PRs 3, 6, 7 |
| §4.12 failure handling | the reconcile (PR 5); `check_unavailable` is Part 4's (the check's model) |

C1–C14 and D15–D19:

| Item | Where |
| --- | --- |
| C1 | 00181 plus the followers' `wrote_back` |
| C2 | 00181's reply match |
| C3 | the claim `auto_reply` |
| C4 | the followers' `bounced` |
| C5 | reconcile |
| C6 | `REACH_OUT_MONTH_EMAILS` plus `maySpend` |
| C7 | `reach_out_claim` |
| C8 | rows first, `sendMessageId` |
| C9 | the token in `reachOutRequest` |
| C10 | the frozen request |
| C11 | PR 7 |
| C12 | E2 (the clock over `outbound_send`, not `broadcast_send`) |
| C13 | the lane check |
| C14 | PR 6 step 5 |
| D15 | PR 3 |
| D16 | PR 7 |
| D17 | PR 8 |
| D18 | PR 7, plus §0.4 |
| D19 | PR 6 |

**Placeholders.** Each "match the real name" note names the file and line to read before running; none leaves code unwritten.

**Type consistency:**
- `ReachOutStep`, `PlannedSend`, `ReachOutRunPorts` (PR 4), `ReachOutSendRow`, `DomainCapacity`, `AudienceLead`, `FollowerLead`, `PersonForSend` (PR 3), `TimetableDomain` / `timetable()` (PR 2), `sendIdFor` / `sendMessageId` (PR 4), `reachOutRequest` (PR 6).
- `domainDailyCap(sentDays)` after PR 3, everywhere.
- The run's `audience` is `{kind: "reach_out", root_id, step_id, search_id}` in PR 4, PR 5's trigger and PR 6's claim.
