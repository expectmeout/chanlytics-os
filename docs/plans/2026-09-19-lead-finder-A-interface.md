# Lead finder, release A: the interface the two plans share

19 September 2026. `2026-09-19-lead-finder-A1-data.md` (migration 00139, the contracts) and `2026-09-19-lead-finder-A2-pipeline.md` (the provider, the judge's call, the core, the handlers, the webhook, the sweep, the engine's routes, the gates) were written from this file at the same time, so every name and shape here is the name in the code. Release B (`2026-09-19-lead-finder-B-product.md`) builds on it and widens what it must (`leads_page` gains `p_list`; `lead_searches_view` gains the undo operation; `lead_operations.kind` gains `stage | bulk`). Where this file and the PRD disagree, this file wins for names and shapes and the PRD (v3, §0 and §12) for behaviour.

Both plan writers follow this exactly. A name here is the name in the code. Where this file and the PRD disagree, this file wins for names and shapes; the PRD (v3, `docs/plans/2026-09-17-people-table-and-lead-finder.md`, §0 and §12) wins for behaviour.

## Migration 00139 (A1) — `supabase/migrations/00139_the_lead_finder_engine.sql`

Tables exactly as PRD §12.4: `lead_searches`, `lead_rounds`, `lead_runs`, `lead_judgments`, `leads`, `lead_places`, `lead_search_members`, `lead_counters`, `lead_operations`, `lead_preferences`, `lead_suppressions`, `lead_niche_priors`, `lead_platform`. Stored sets (CHECKs), which contracts mirror and `schema-sets.generated.ts` regenerates:

- `lead_searches.via`: `people | ask`
- `lead_rounds.purpose`: `probe | main | topup | renew`
- `lead_rounds.state`: `queued | probing | waiting_on_owner | running | checking | ended`
- `lead_rounds.ending`: `target_reached | searched_everything | month_leads_used | budget_used | few_new_matches | stopped | source_failed | question_unanswered | paused`
- `lead_rounds.answered`: `keep | include | stop`
- `lead_runs.purpose`: `discover | check`
- `lead_runs.state`: `claimed | starting | running | succeeded | failed | aborted | timed_out | unknown`
- `leads.email_state`: `none | checking | ok | catch_all | unknown | invalid`
- `leads.stage`: `ready | nurture | converted | archived`; `leads.closed_reason`: `said_no | not_a_fit | customer | stale | search_removed`
- `lead_search_members.class`: `qualified | review | excluded`; `.fit`: `strong | look | long`
- `lead_counters.kind`: `allowance | budget | day`; `period` text (`YYYY-MM` for allowance and budget, `YYYY-MM-DD` for day); `tenant_id` null means the platform (only `day`)
- `lead_operations.kind`: `undo_search | keep | exclude | put_back | include | stop`
- `lead_preferences.kind`: `chain | wrong_kind | too_far`
- `lead_suppressions.kind`: `email | place | phone`; `.what`: `email_opt_out | customer | erased`
- `jobs.kind` gains `lead_round_start | lead_collect | lead_check`
- events gain `lead.round | lead.no_card` (A) — `lead.stage | lead.emailed | lead.call | lead.converted | lead.not_a_fit` are B's

Every id is `uuid default gen_random_uuid()`; every table has `tenant_id uuid not null references tenants(id) on delete cascade` (except `lead_counters` and `lead_platform`, `lead_niche_priors`); every table has member-select RLS (`is_member(tenant_id)` the 00002 shape) except `lead_counters`, `lead_platform`, `lead_niche_priors`, `lead_judgments`; no insert/update/delete policies.

### Doors (SECURITY DEFINER, `set search_path = public`, check `is_acting_member()` and the role via the existing helpers; `authenticated` may execute; `anon` may not)

```
lead_search_create(p_tenant_id uuid, p_plan jsonb, p_via text) returns jsonb
  -- owner only. Validates p_plan.version = 1 and the required keys (card, terms[], area{center{lat,lng},radius_m,label,state,kind}, count 1..1000, contact 'phone'|'email', criteria[]{key,text,standard 'likely'|'seen',required bool}, exclusions[]{key,text,origin}, asked, name).
  -- refuses: {error:'paused'} when lead_searches_on(p_tenant_id) is false; {error:'month_leads_used', left int}; {error:'budget_used', left_usd numeric}; {error:'day_cap'}.
  -- in ONE transaction: insert lead_searches; insert lead_rounds(seq 1, purpose 'probe', plan p_plan, plan_version 1, target least(25, count), state 'queued'); lock counters in order allowance→budget→day(tenant)→day(null) and reserve: allowance_reserved = count, cost_reserved_usd = lead_round_estimate_usd(p_plan, 'probe'); insert jobs(kind 'lead_round_start', payload {round_id}, run_after now()); insert events 'lead.round'.
  -- returns {search_id, round_id}.
lead_round_answer(p_round_id uuid, p_answer text, p_plan jsonb default null) returns jsonb
  -- owner; round must be waiting_on_owner. 'keep' → state 'running' + a 'main' round is NOT created here: the collect that asked left the probe round waiting; the answer inserts jobs(kind 'lead_round_start', payload {round_id: <the probe round>, resume: true}); 'include' → p_plan is the amended plan (version+1), stored on lead_searches.plan and on the round as plan (the round records plan_version+1 — the only in-place plan change, allowed while waiting), then as 'keep'; 'stop' → lead_round_end(round, 'stopped').
lead_round_stop(p_search_id uuid) returns jsonb
  -- operator. For every live round (state not ended): bump lease_gen on its runs, insert jobs(kind 'lead_collect', payload {run_id, seq:'stop'}) per running discover run, and lead_round_end(round, 'stopped') is done by the collect after aborting (so the strip says "Stopping · checking the emails").
lead_search_more(p_search_id uuid, p_purpose text, p_plan jsonb) returns jsonb
  -- owner; purpose 'topup'|'renew'; latest round must be ended; same reservation path as create with target = p_plan.count minus what already counted (topup) or p_plan.count (renew); inserts the round (seq+1) and its start job.
lead_member_keep(p_search_id uuid, p_lead_id uuid) / lead_member_exclude(...) / lead_member_put_back(...) returns jsonb
  -- owner with permission 'find' (has_permission(auth.uid(), tenant, 'find')). keep: class review→qualified, counted true, counted_month = lead_month(tenant now), reserves+settles 1 allowance (refuses {error:'month_leads_used'}); exclude: review→excluded, excluded_by 'owner'; put_back: excluded→qualified through keep's path; refuses when the place is suppressed ('customer'|'erased') or out of area ({error:'hidden'} / {error:'out_of_area'}). Each writes lead_operations(kind, before, after, version = lead_search_members.version) and returns {op_id, version}.
lead_undo(p_op_id uuid, p_version int) returns jsonb
  -- owner. Refuses {error:'changed'} when any touched member's version differs; restores `before`; returns allowance to counted_month's counter (never budget); refuses undo_search for exported leads (leads.exported_at not null are kept and charged).
lead_search_rename(p_search_id uuid, p_name text) / lead_search_remove(p_search_id uuid)
  -- rename operator; remove owner: sets removed_at, ends live rounds 'stopped', keeps members whose lead stage is nurture|converted, blanks the rest's membership.
lead_searches_on(p_tenant_id uuid) returns boolean   -- searches_on or p_tenant_id = any(tenants_on); STABLE; anyone signed in may call
lead_niche_prior(p_category_key text) returns jsonb    -- {places, matched, with_email} or null
lead_month(p_tenant_id uuid, p_at timestamptz) returns text  -- 'YYYY-MM' in the workspace's zone (tenants.timezone, the way the other date functions read it)
```

### Service RPCs (the edge, service_role only; each is one transaction)

```
lead_run_claim(p_run_id uuid, p_owner text) returns boolean            -- update lead_runs set claimed_by=p_owner, claimed_at=now(), state='starting' where id=p_run_id and claimed_by is null
lead_run_record_start(p_run_id uuid, p_owner text, p_apify_run_id text, p_dataset_id text, p_cap_usd numeric) returns boolean  -- only where claimed_by = p_owner and state='starting'; sets state 'running'
lead_run_mark_unknown(p_run_id uuid, p_owner text) returns boolean     -- state 'unknown' (the start's answer was lost)
lead_run_reconcile(p_run_id uuid, p_apify_run_id text, p_dataset_id text, p_state text) returns boolean  -- the sweep, from the provider's list; only where state='unknown'
lead_run_lease(p_run_id uuid, p_owner text, p_seconds int) returns int  -- takes or renews: where lease_until < now() or lease_owner = p_owner; returns the generation, or null when held by another
lead_run_release(p_run_id uuid, p_owner text, p_gen int) returns boolean
lead_collect_commit(p_run_id uuid, p_owner text, p_gen int, p_from_offset int, p_to_offset int, p_page jsonb) returns jsonb
  -- refuses {ok:false, why:'lease'} unless lease_owner=p_owner and lease_gen=p_gen; refuses {ok:false, why:'offset'} unless read_offset = p_from_offset (compare-and-set).
  -- p_page: {judgment: {op_id, request_hash, answer, model, tokens} | null, places: [ {place: <leads columns>, member: {judgment, class, excluded_by, fit, reason, distance_m}, duplicate_of_place_id text|null, shares: [{kind:'phone'|'email'|'host', lead_id|contact_id}] } ], usage_usd numeric, items_seen int, run_state text|null, next: {kind:'lead_collect', seq: text, run_after_seconds int} | null, round: {state: text|null, question: jsonb|null, ending: text|null} }
  -- inserts leads (on conflict (tenant_id, place_id) do nothing → then the member points at the existing lead), lead_places for duplicate_of, lead_search_members (on conflict (search_id, lead_id) do nothing), lead_judgments (on conflict (op_id) do nothing), settles counted qualified members (counted=true, counted_month; allowance_used += n, allowance_reserved -= n), settles usage (budget used += delta usage; day counters likewise), sets read_offset = p_to_offset, items_seen, run state, inserts the next job (the partial unique index on payload run_id+seq makes it once), applies round state/question/ending (ending → lead_round_end inline), appends events; returns {ok:true, counted:int, qualified:int, review:int, excluded:int, round_state:text}.
lead_check_commit(p_round_id uuid, p_results jsonb, p_usage_usd numeric, p_last boolean) returns jsonb
  -- p_results: [{lead_id, email_state, checked_at}]; sets email_state on leads; for each member of the round with class 'review' whose only reason was the email standard and whose email is now 'ok' → qualified + counted (through the allowance); settles usage; when p_last → lead_round_end(round, the ending the collect left in lead_rounds.ending_pending, default 'target_reached' if counted >= target else 'searched_everything'/'budget_used' as recorded).
lead_round_end(p_round_id uuid, p_ending text) returns boolean
  -- state 'ended', ending, ended_at; releases allowance_reserved - allowance_used and cost_reserved_usd - cost_usd from the counters; inserts events 'lead.round'.
lead_round_estimate_usd(p_plan jsonb, p_purpose text) returns numeric   -- IMMUTABLE-ish: the card's price table in SQL is NOT duplicated: A1 stores the estimate the route computed: create/more take p_estimate_usd numeric computed by contracts' estimateRoundUsd; this function is dropped. (Writers: the route computes; SQL stores.)
```

`lead_searches_view`: every column of `lead_searches` plus the latest round's `round_id, seq, purpose, state, ending, question, answered, target, plan_version`, the counts over `lead_search_members` for that search (`qualified, review, excluded, counted`), and `judge_tokens`. `leads_page(p_tenant_id, p_search_id, p_class, p_sort, p_after_key, p_limit)` keyset-pages members joined to leads (release A needs it for the internal runs and G2; sort keys `found | fit | distance`).

### Jobs and payloads (A2 handlers; A1 adds the kinds, `JOB_KINDS`, the sets, the partial unique index on `((payload->>'run_id'), (payload->>'seq')) where kind = 'lead_collect'`, and the three kinds to `RETRY_WAITS_MS` in `packages/jobs/src/ledger.ts` with waits `[30_000, 120_000, 600_000]`)

- `lead_round_start { round_id: uuid, resume?: true }`
- `lead_collect { run_id: uuid, seq: string }` — seq is `p<offset>` for a page, `final` from the webhook, `s<minute>` from the sweep, `stop` from the stop door
- `lead_check { round_id: uuid, batch: number }`

## Contracts (A1) — `packages/contracts/src/lead-search.ts`, `lead-judge.ts`

```ts
export type LeadContactStandard = "phone" | "email";
export type LeadCriterionStandard = "likely" | "seen";
export interface LeadCriterion { key: string; text: string; standard: LeadCriterionStandard; required: boolean; }
export interface LeadExclusion { key: string; text: string; origin: "claude" | "you_said"; category_key?: string; }
export interface LeadArea { kind: "zip" | "city" | "radius"; label: string; state: string; center: { lat: number; lng: number } | null; radius_m: number; zip?: string; query: string; }
export interface LeadSearchPlan { version: number; card: "local_businesses"; name: string; asked: string; terms: string[]; area: LeadArea; count: number; contact: LeadContactStandard; criteria: LeadCriterion[]; exclusions: LeadExclusion[]; }
export const LeadSearchPlanSchema: z.ZodType<LeadSearchPlan>;           // zod 4, used by the route's input
export function planSentence(plan: LeadSearchPlan): string;               // "Find 200 personal trainers in Austin, TX with a website, then find their email and check it. Leaving out: chain gyms."
export function planVersionOf(plan: LeadSearchPlan, changed: Partial<LeadSearchPlan>): LeadSearchPlan;  // bumps version when area/count/contact/criteria/exclusions change
export const LEAD_MONTHLY_ALLOWANCE = 500; export const LEAD_MONTHLY_BUDGET_USD = 25; export const LEAD_DAY_CAP_USD = 10; export const LEAD_PLATFORM_DAY_CAP_USD = 50; export const LEAD_QUESTION_THRESHOLD = 0.6; export const LEAD_PROBE_PLACES = 25; export const LEAD_JUDGE_BATCH = 25; export const LEAD_MAX_PLACES = 1000;
export const LEAD_ROUND_ENDINGS: readonly LeadRoundEnding[]; export type LeadRoundEnding = "target_reached" | ...;  // the nine
export const LEAD_ENDING_WORDS: Record<LeadRoundEnding, string>;
export function estimateRoundUsd(plan: LeadSearchPlan, purpose: LeadRoundPurpose, placesToAsk: number): number;   // from the card's brief prices
export function placesToAsk(plan: LeadSearchPlan, remaining: number, yieldSoFar: number | null): { total: number; perTerm: number[] };  // S6: probe 25 across terms; main: remaining / yield clamped 1.2x..4x
export function classify(plan: LeadSearchPlan, answer: JudgePlaceAnswer, facts: PlaceFacts, emailState: LeadEmailState, inArea: boolean): { class: "qualified" | "review" | "excluded"; excluded_by: string | null; fit: "strong" | "look" | "long" | null; reasons: string[] }
export function questionAfterProbe(plan: LeadSearchPlan, members: { class; excluded_by }[]): { ask: true; sentence: string; criterionKey: string; dropTerm: string | null } | { ask: false };  // P4
export function endingOfRound(x: { counted: number; target: number; termsShort: boolean[]; budgetLeftUsd: number; allowanceLeft: number; stopped: boolean; sourceFailed: boolean; unanswered: boolean; paused: boolean }): LeadRoundEnding;  // S7
export const LEAD_CARDS: readonly LeadCardBrief[];   // the half Claude reads: { id: "local_businesses"; goodFor: string[]; notFor: string[]; settings: string[]; costPerPlaceUsd: number; contactsPerPlaceUsd: number; maxPerTerm: number; examples: string[]; approved: true }
export function cleanEmailCandidates(emails: string[], host: string | null): { kept: string[]; dropped: { email: string; why: string }[] }   // §7.2 (carried from v2's cleaner)
export function usPhone(raw: string | null): string | null; export function siteHost(url: string | null): string | null; export function stateCode(name: string | null): string | null;
export function leadMonth(zone: string, at: Date): string;   // 'YYYY-MM'
```

```ts
// lead-judge.ts (contracts): the schema, the parser, the prompt's rubric; the brain's split (contracts hold schema+parser, channels make the call)
export interface PlaceFacts { ref: number; name: string; category: string | null; city: string | null; state: string | null; host: string | null; rating: number | null; reviews: number | null; emails: string[]; phone_matches_site: boolean | null; }   // each string capped at 120 chars, control chars stripped
export interface JudgePlaceAnswer { ref: number; criteria: { key: string; answer: "pass" | "fail" | "unknown"; facts: string[] }[]; email_index: number | null; reason: string; }
export const JUDGE_OUTPUT_SCHEMA: Record<string, unknown>;   // hand-written JSON schema, every property required, additionalProperties false
export function judgeSystemPrompt(plan: LeadSearchPlan): string;   // the criteria with their standards; "answer only from the facts; unknown when the facts do not say"
export function judgeUserContent(places: PlaceFacts[]): string;   // the <places> block, quoted JSON
export function parseJudgeAnswer(raw: unknown, plan: LeadSearchPlan, places: PlaceFacts[]): { ok: true; answers: JudgePlaceAnswer[] } | { ok: false; why: string }  // rejects unknown criterion keys, fact keys not on the place, email_index out of range, missing refs
export function judgeOpId(runId: string, fromOffset: number, batch: number): string;  // sha256 hex of `${runId}:${fromOffset}:${batch}`
```

## Channels (A2) — `packages/channels/src/apify.ts`, `packages/channels/src/lead-judge.ts`

```ts
export interface ApifyClient { startRun(actor: string, input: unknown, opts: { build: string; timeoutSecs: number; memoryMb?: number; maxTotalChargeUsd: number; webhooks: { eventTypes: string[]; requestUrl: string }[] }): Promise<{ id: string; datasetId: string }>; getRun(id: string): Promise<{ id: string; status: string; datasetId: string | null; usageTotalUsd: number | null; startedAt: string | null; finishedAt: string | null }>; listActorRuns(actor: string, sinceIso: string): Promise<{ id: string; status: string; startedAt: string; datasetId: string | null }[]>; listItems(datasetId: string, offset: number, limit: number, fields: string[]): Promise<{ items: unknown[]; total: number | null }>; abortRun(id: string): Promise<void>; eventPrices(actor: string): Promise<Record<string, number>>; }
export function apifyClient(fetchImpl: typeof fetch, token: string): ApifyClient;   // 429/5xx → throw ApifyRetryable (the ledger's waits retry); 4xx → throw ApifyRefused
export interface LeadJudge { judge(plan: LeadSearchPlan, places: PlaceFacts[]): Promise<{ answers: JudgePlaceAnswer[]; model: string; tokens: number; raw: unknown } | { refused: true; why: string }>; }
export function leadJudge(client: Anthropic, model: string, fallbacks: boolean): LeadJudge;   // beta.messages.create, output_config {format:{type:'json_schema', schema: JUDGE_OUTPUT_SCHEMA}, effort:'low'}, fallbacks:'default' when on; max_tokens 6000 for 25 places; stop_reason max_tokens → {refused:true, why:'max_tokens'}; records response.model
```

## Core (A2) — `packages/core/src/leads/*` behind ports

```ts
export interface LeadPorts { db: LeadDb; apify: ApifyClient; judge: LeadJudge; now(): Date; webhookBase: string; }
export interface LeadDb { /* one method per service RPC above, same names in camelCase: runClaim, runRecordStart, runMarkUnknown, runReconcile, runLease, runRelease, collectCommit, checkCommit, roundEnd, plus reads: round(id), run(id), runsOfRound(roundId), membersOfRound(roundId), placeIdsHeld(tenantId, placeIds[]), sharesOf(tenantId, {phones, emails, hosts}), suppressed(tenantId, {emails, placeIds}), zoneOf(tenantId), leadSearchesOn(tenantId) */ }
export const CARDS: Record<"local_businesses", LeadCardRunner>;   // the half code holds: { actor: "compass/crawler-google-places"; build: "0.14.757"; buildInput(plan, term, places): unknown; mapItem(item: unknown): MapsPlace | null; fields: string[] /* MAPS_FIELDS incl. location */; checker: { actor: "bounceverify/bounceverify-email-verifier"; build: "<pinned>"; buildInput(emails: string[]): unknown; mapItem(item): { email; state } } }
export function startRound(ports, roundId): Promise<void>;                    // lead_round_start: claim → start → record, per term; unknown on a lost answer; the probe spreads LEAD_PROBE_PLACES across terms
export function collect(ports, runId, seq): Promise<void>;                     // one page per call: lease → getRun → listItems(read_offset, 100) → clean → identity → judge batches of 25 (opId) → classify → distance → collectCommit(one call) → next seq or the question/ending
export function check(ports, roundId, batch): Promise<void>;                   // lead_check
export function reconcileUnknownRuns(ports): Promise<void>;                    // the sweep
export function haversineM(a: {lat,lng}, b: {lat,lng}): number; export function zctaCenter(zip: string): {lat,lng} | null;   // geo.ts, the bundled table `zcta-centroids.json` [zip, lat, lng]
```

## Edge (A2)

- `apps/edge/api/apify-webhook.ts` + `apps/edge/lib/apify-ingress.ts`: `planApifyIngress(input: { runRow | null; tokenOk: boolean; body: { eventType; eventData: { actorRunId }; resource } }): { action: "ignore" | "schedule_final" | "abort_foreign"; ... }` pure, tested; the door reads the run row by the URL's `run` id, compares `sha256(token)` in constant time, and never calls the provider except to abort a foreign run id.
- `apps/edge/api/cron/leads.ts`: `planLeadSweep(rows, now)` pure; every 5 minutes; a `sweep_status` clock `leads` and its row in `sweep_health()`'s expectations (A1's migration adds the clock and the cron schedule; A2 the handler).
- `apps/edge/api/jobs/tick.ts` gets the three handlers registered; `vercel.json` gives `api/jobs/tick.ts` `maxDuration: 60` if it does not already.
- env: `APIFY_TOKEN`, `LEAD_JUDGE_MODEL` (default `claude-opus-5`), `LEAD_JUDGE_FALLBACKS` (default on), `LEAD_WEBHOOK_BASE`.

## Dashboard routes (A2), each with `route()` policies

`POST lead-searches` (owner, rate `lead_search`, spend true, input `LeadSearchPlanSchema`; computes `estimateRoundUsd`, calls `lead_search_create`), `GET lead-searches`, `GET lead-searches/[id]`, `POST lead-searches/[id]/answer`, `/more`, `/stop`, `GET leads` (`leads_page`), `POST leads/[id]/keep|exclude|put-back` (owner; the door checks `find`), `POST lead-operations/[id]/undo`. `ROLE_PERMS` gains `find` (owner only) — the one derivation; routes spell `role: "owner"` and the door checks `find`, and a test proves the two agree.

## The internal runner and the gates (A2)

- `tooling/scripts/lead-search.mjs --workspace <slug> --plan <file.json> [--wait]`: signs in as the nightly's owner (the E2E_* env the nightly uses), posts the plan, polls `GET lead-searches/[id]` until ended, prints the round's ending and counts, and with `--label <labels.json>` scores the members against the labelled set (G2: precision of `qualified` by category, the 95% Wilson interval, yield, review share, cost per qualified from `cost_usd`).
- G3: `tooling/scripts/tests/lead-engine.db.test.mjs` on the real local Postgres: duplicate claims (one wins), competing reservations (the last unit goes once), a stale lease (generation refused), a late webhook (final scheduled once), Stop during checks (the round ends 'stopped' after checks), month rollover (a refund credits the old month), erasure mid-run (the erased place is not inserted), the shared-phone triple (two delivered, marked, no person made), five asked and twenty qualified count five, put back of a hidden place refused, an out-of-area place is review/excluded by rule.
- The replay: `tooling/scripts/tests/lead-search-replay.test.mjs` over `_fake-db.mjs` with the fixtures (real shape, fictional values): a whole search from create to ended, the webhook, and a killed collect resumed by the sweep.
