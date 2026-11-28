# 0149 · Every call out goes through one door, and says its time under its name

**Status:** Decided and built on one branch (`wiring/outside-calls-one-door`, lane 1 of the code refinement plan of 25
November 2026: layer 12, integrations and observability). Ruben asked that day for one standard for the wiring and that
each choice take the cleanest standard option; this is that choice, taken in the lane. Written against main at
`421be6183a`. No migration.

## Context

At `421be6183a` a call that left a process went one of several ways. A provider's went through channels'
`fetchFromProvider` (`packages/channels/src/shared/provider-fetch.ts`): bounded, never thrown, retried by outcome, a
breaker per provider, but its time said nowhere. The dashboard's JSON calls to the edge went through `callEdge`, its
three streamed ones (Ask's speech, Reach out's pressed check, the model gateway) each wrote their own `fetch` beside it,
and the gateway's had no bound. Ask's presses called the dashboard's own routes with a `fetch` each (`ask/act/run.ts`,
`ask/act/stop.ts`, the second unbounded). The files bucket was read by a signed link in two apps with a `fetch` each, the
edge's unsubscribe probe and its one call to the dashboard each had their own, and four pages wrote a `fetch` of their
own for routes the typed client does not hold. Nineteen calls in seventeen files, by syntax tree; the ratchet
`fetches-outside-a-client` held the eight in the server trees.

A read that stopped at PostgREST's 1,000-row cap was a `db_answer_at_cap` warning (decision 0111, rule 7), and no line is
shipped or alerted on (`docs/runbook.md`, "Where the logs go").

## Decision

1. **One way out: `fetchFromProvider`.** Every call from a server process to another service goes through it, named by
   what it calls: a provider, `edge` (the dashboard's calls to the edge), `dashboard` (the edge's, the probe's and Ask's
   calls to the dashboard) and `storage` (the files bucket by a signed link). Each carries its bound (`timeoutMs`,
   required), its retry policy (`tries`, `idempotent`, `deadlineMs`) and its breaker (`hold`, or `count` for a call that
   must always be made). Our own two apps and the bucket are `count`: named for their time and faults, never held.
2. **Its time under its name.** Each call notes how long its caller waited as `out.<name>` in the request's timings
   (packages/log `noteTiming`), beside `db` and `read.<reader>`: the dashboard's answer says it in Server-Timing and its
   `route_answered` line. A call that took half its bound or more says so (`outside_call_slow`). A per-call line for every
   call was weighed and not taken: a sweep makes hundreds, and the slow ones are what an incident reads.
3. **The dashboard's edge client is two calls:** `callEdge` (JSON) and `streamEdge` (a 2xx body handed back unread), both
   over the one way out.
4. **A page's call to its own server** goes through the API client by route key, or, for a route outside the typed set
   (sign-up, a lead's preview, the version), `askOwnRoute` (`apps/dashboard/src/client/own-route.ts`).
5. **Named exceptions, held outright** (`FETCH_EXCEPTIONS`, `tests/repo/rules/_rules.mjs`): `packages/channels` (the
   providers' wire; two byte downloads from a provider's CDN stay off its breaker), `apps/relay` (a Cloudflare Worker that
   bundles nothing of ours), `apps/mobile` (paused, shares no client with the site) and the Google button's read of
   Supabase's auth settings (a page's call to the identity store stays in the browser). `fetches-outside-a-client` is
   retired: `rules.test.mjs` fails any other global `fetch` in `apps` or `packages`.
6. **One logger.** `console` is the transport in two places only (`CONSOLE_SINKS`: the logger's own, and db's stand-in
   before an app hands it the logger); the new `console-calls` measure counts every other call, the browser's and the
   phone app's, so they only fall.
7. **The cap is an alarm.** db's observer port gains `atCap(table)`, told once per table per instance per ten minutes.
   Each app notes the read in the pager's memory (`operator_pages`, `db_answer_at_cap:<table>`), so Health shows it under
   what paged us, and the edge's health sweep pages each one noted and untold, once per the pager's window
   (`apps/edge/lib/ops/cap-watch.ts`). The edge does not page from its logger: the pager logs through it.

## Steps

One pull request, either deploy order: nothing either app sends the other changes shape.

## Tests

`tests/ops/provider-fetch.test.mjs` (the time under its name, the slow line), `tests/edge/dashboard-edge.test.mjs`
(`callEdge`, `streamEdge`), `tests/repo/rules/rules.test.mjs` (the rule and its exceptions, `console-calls`),
`tests/database/client/row-cap.test.mjs` (the alarm told once per window), `tests/ops/cap-watch.test.mjs` (the sweep's
page), `tests/shell/own-route.test.mjs` (a page's own-route call), and each moved caller's own tests.

## Risks

- A timeout's `detail` in `callEdge`'s refusal reads `timeout`, `fetchFromProvider`'s word, where it read the platform's
  "The operation was aborted due to timeout"; an unreachable edge's carries the network's cause beside its message. Each
  caller words the code itself.
- A failed note of the cap is said and gone past; the line is written first.

## One act, one name: the search that follows it (28 November 2026, lane 8 of the "prove it works" plan)

"My reel didn't post" should be one search. An act gets its name where it enters (`packages/channels/src/tokens/request-id.ts`
chooses it): an owner's press is named by the dashboard's `withRoute`, a webhook's delivery and a clock's tick by the
edge's `door()`. Read on main at `a2f4353851`, the name already rode:

- on every log line written inside it, both apps' and every package's (`request_id`, packages/log);
- from the dashboard to the edge, in `x-request-id` and signed into the edge token (`rid`), so a press's lines in both
  apps are one search;
- into every event row, whether TypeScript or a SQL function wrote it (`events.request_id`, 00277, from the header the
  database client sends on every call);
- into a job TypeScript schedules (`payload.request_id`, packages/jobs `schedule.ts`), which the runner runs under that
  name, so the job's own lines, events and next jobs carry it too.

What was missing, and is now carried:

- **A job a SQL door writes** (a post approved, a webhook's reply queued, an event's delivery to its subscriber) ran as
  its own row id. Since 00731 `jobs_take_their_kind` stamps the insert's request into a payload that names none. A
  clock's own SQL sends no header, and its jobs run as themselves, named by their row, as before.
- **Whose and what for**: each unit of work says its workspace, its purpose and its try, and its outside calls in one
  `outside_calls` line when it ends ("The table", lane 8's part one).
- **The service's own name for the request** on the door's lines (`provider_request`), for its support.

Where the name rides in the call itself: in our own two apps' calls, as above. No provider is sent it yet. Three could
carry it and give it back on their receipts: WhatsApp's `biz_opaque_callback_data` (Meta's status webhook returns it; the
send's field was not found in the reference pages read on 28 Nov), Twilio's status callback address (a query string on
it is signed with the rest of the address), and Resend's `tags` (letters, digits, `_` and `-` only, so the name is
written over; returned as `data.tags`). Each changes a live send to customers, so each waits on one real send's proof.
Until then a receipt is followed by the provider's id the send kept on its message row (`messages.external_id`), which
the receipt's own line names (`wa_status` `id`, the text's and the email's ids likewise).

### The search

1. **The logs.** In Vercel's logs for both projects (`chanlytics-messaging` for the edge, the dashboard's own), search
   `request_id:"<the name>"`. The first line names the workspace (`tenant_id`). A press's name is in the dashboard's
   answer (`x-request-id`) and on its `route_answered` line.
2. **The database.** One read-only statement, the name and the workspace pasted in (the window keeps it on the
   workspace's own rows):

```sql
with act as (select '<the name>'::text as id, '<the workspace>'::uuid as tenant, now() - interval '7 days' as since)
select 'event' as what, e.created_at as at, e.kind as name, e.subject_type || ' ' || e.subject_id as about, null as stands
  from public.events e, act
 where e.tenant_id = act.tenant and e.created_at > act.since and e.request_id = act.id
union all
select 'job', j.created_at, j.kind, j.id::text, j.state || coalesce(': ' || j.last_error, '') || ' after ' || j.attempts
  from public.jobs j, act
 where j.tenant_id = act.tenant and j.created_at > act.since and j.payload ->> 'request_id' = act.id
union all
select 'message', m.created_at, m.channel || ' ' || m.direction, m.id::text, m.status || coalesce(' ' || m.external_id, '')
  from public.messages m, act
 where m.tenant_id = act.tenant
   and m.id in (select e.subject_id from public.events e
                 where e.tenant_id = act.tenant and e.created_at > act.since
                   and e.request_id = act.id and e.subject_type = 'message')
 order by at;
```

3. **The last service's answer.** A message's `stands` holds the provider's id: search the logs for it (`wa_status` for a
   WhatsApp receipt). A line with `provider_request` names the service's own record of the call, to hand its support.

## What the rule reads, 26 November 2026 (round three of the code refinement)

Written against main at `9131fdef1b`. The rule's check (`fetchesIn`) counted a bare `fetch(…)` and `globalThis.fetch(…)`
only, so it read none past the door while 21 modules of `apps` and `packages` wrote `fetch(`. Read one by one:

- **Ten made no call out.** Two were comments: `apps/dashboard/proxy.ts`, and the edge's alert mail, which already leaves
  through `fetchFromProvider("resend")`. Four were a port's method named `fetch`: jobs' `booking-read.ts`,
  `incoming-email.ts` and `handlers.ts`, and core's `messages/email-ingest.ts`. One was a fetch handed in: contracts'
  `calendar/feed-url.ts` `fetchPublic`, which every caller hands channels' `publicFetcher`. Two were the browser's own
  script inside a string: a website form's post (`server/public/form-draw.ts`) and the document head's first reads
  (`shell/route-prefetch.ts`). The tenth was relay's second proof script.
- **Six were named already:** relay, the phone app and the Google button.
- **The browser's own calls went unseen:** `window.fetch` in the API client's transport (`bridge/api.ts`), the preview
  claim and the files' byte transfers, and `globalThis.fetch` handed on in `client/own-route.ts`.

So the check now counts **every reach for the global fetch**: a call of it, the function handed on (`deps.fetch ?? fetch`,
`client(fetch, token)`, a default `fetchImpl = fetch`), and `window.fetch`, `self.fetch` or `globalThis.fetch` in any
place. A key, a method signature, `typeof fetch` and a module's own `fetch` binding are names, and are not counted.
Read that way, five server modules handed the global fetch on:

- The edge's Apify clients (`leads/wires.ts`, `leads/sources.ts`) and Expo's push client (`ops/push.ts`) handed it to
  clients that already leave through `fetchFromProvider`, whose own default is that same fetch. They hand it nothing now:
  a test's stand-in is still taken, and nothing else changes.
- db's transport (`shared/observe.ts` `namedFetch`, `shared/service-client.ts` `boundedFetch`) is supabase-js's way to
  PostgREST and auth. It is bounded and timed under `db`. db leans on contracts alone (decision 0110), so it cannot reach
  channels' door, and a read of our own database is no call out. **Named, with that reason.**

In the browser, the two pages that wrote their own fetch for a route of ours, the preview claim (`auth/preview-claim.ts`)
and the waitlist (`bridge/waitlist.ts`), now ask through `askOwnRoute`. The page's two clients (`bridge/api.ts`,
`client/own-route.ts`) are named as what they are. So are the two byte transfers that go from the browser to a store at
an address their route gave: a photo's PUT to the bucket with a kept file read as a blob (`surfaces/files/verbs.ts`), and
a clip's resumable upload to Cloudflare Stream (`surfaces/files/video/send.ts`). No JSON client carries bytes, and the
bytes never pass a server of ours. Twelve exceptions in all, each with its why; none past the door.

`console` past the logger: the server's are 0 and the browser's go through its report seam (decision 0151). The three left
are the phone app's (`app/_layout.tsx`, `shell/files.ts`, `shell/notifications.ts`). They are counted, and they wait for
the phone app, which is paused.
