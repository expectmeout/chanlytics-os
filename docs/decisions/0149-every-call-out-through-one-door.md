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

## The table: each service's rules (28 November 2026, lane 8 of the "prove it works" plan)

Written against main at `10a175d150`, with each vendor's own pages read that day. The door reads the same rows from
`packages/channels/src/shared/provider-rules.ts`; a change to one is a change to both.

What every row shares, said once:

- **A repeat** is made only where it cannot do the work twice: a read, or a write the service dedupes by a key the call
  carries. A write that got no answer (a timeout, a dropped connection, a 5xx) is `unknown`: never sent again blind,
  and settled by what its row names.
- **Tries in all** are the call's own on a job's first attempt, and one on every later attempt (the request's store says
  which, from the ledger's `attempts`). So a call asked twice in a job tried five times makes at most six requests, not
  ten, and a call the door held (an open breaker, a "too many", no room) makes none.
- **"Too many"** is named on the answer (`tooMany`: the workspace's, the platform's, or one call's own). A 429 is
  retryable, as it always was; a "too many" said in a 400 or a 403 (Graph's codes, Google's reasons) keeps the outcome
  its status says, since each adapter already reads it as not now. The wait the service named holds the calls whose
  limit it spent: the workspace's own where the row says the limit is each workspace's, everyone's where it is the
  platform's. A wait of up to two seconds that fits the call's deadline is waited out; a longer one hands the call back
  with `retryAfterMs`. A "too many" that names no wait holds nothing: the caller's backoff chooses. Either way it halves
  how many of those calls run at once in the instance, and a run of answers raises it back by one.
- **At once** is per instance and per limit holder, and starts generous, so an ordinary day queues nothing. A call that
  finds no room waits at most two seconds inside its deadline, then is answered `too_many_at_once` without leaving.
- **The breaker** opens after five faults in a row (no answer, or a 5xx) and holds for thirty seconds. A workspace's
  faults open its own breaker, which holds only its calls; the provider's opens when at least two of the faults in the
  row were other workspaces' than the one with most, or came from calls that name no workspace. After the pause one call
  goes and the rest wait for its answer. A send to a person (`breaker: "count"`) is always made and only counted. A
  refusal, a sign-in the service will not take (401, 403) and a "too many" are answers, never faults.
- **Whose and what for:** each call is counted under the workspace the work acts on and the work's purpose (a door's or
  a route's path, a job's kind), in one `outside_calls` line when the work ends. Our own two apps are left out.

The rows. "Bound" is each try's; "at once" is the door's starting room.

- **Meta, WhatsApp** (`meta`): bound 15 s for a send, 15 to 30 s for templates. A send is asked once (Meta keeps no
  key); reads twice. "Too many" is a 400 or 429 with Graph's code: 4, and 613 with subcode 1996, are the app's
  (everyone's); 80007 is the WhatsApp account's, 130429 the number's throughput (80 messages a second by default),
  131048 a number held back for spam, 131056 one person written to too often (it holds nobody else). The wait is the
  usage header's minutes, where Graph sends one. At once 16 per workspace. An unknown send is settled by its receipt (the status
  webhook for its wamid); the health sweep pages for sends with no receipt after six hours.
- **Meta, ads** (`meta_ads`): bound 20 s. Reads are asked twice, a change once. "Too many": 4 (the app's), 17 (a
  sign-in's), 613, and 80000 to 80014 (the ad account's business use case), waited for the usage header's minutes. At
  once 8 per workspace. An unknown change is settled by reading the ad back (lane 6's Turn on).
- **Meta, Instagram** (`instagram`) and **Facebook Pages** (`facebook`): bound 10 s for a connect or a read, the
  caller's for a post. Reads twice; a DM, a comment and a publish once. "Too many": Graph's codes as above (80002 the
  Instagram account's, 80001 the Page's). At once 8 per workspace. An unknown publish is settled by
  reading the account's posts and matching the caption (lane 5); a DM by its echo.
- **Google** (`google`: mail, calendar, Drive, the Business Profile, Places): bound 10 s for a read, 15 s for a send
  or Drive. Reads twice; a send and a post once. "Too many": a 403 whose reason is `userRateLimitExceeded` is the
  workspace's (Gmail 6,000 units a minute per user, Drive 325,000, Calendar 600 requests); `rateLimitExceeded` or
  `quotaExceeded` is the project's; a 429 (a user's mail sending, Drive's backend, the Business Profile's 300 a minute
  and ten edits a minute per profile) is the workspace's, since Google says it for both. Google names no wait as a
  rule, so it holds nothing and its gate is lowered. At once 8 per workspace. An unknown post is settled by listing the profile's posts (by time, and now by their words,
  `summary`); an ask that provably never left is typed (`GoogleUnanswered`, `neverLeft`).
- **Gemini** (`gemini`): the platform's key. A 429 holds everyone for its wait; at once 8.
- **Microsoft 365 mail** (`microsoft`): bound 10 s. Reads twice; a send once. A 429 with Retry-After in seconds is the
  workspace's (Outlook takes four requests at once per app per mailbox); at once 4 per workspace. Paused with the
  Microsoft mailbox work.
- **Twilio** (`twilio`): bound 20 s. Reads twice; a text once. Each workspace has its own subaccount, so a 429 (error
  20429, "the request was not processed") is the workspace's; at once 16. An unknown text is settled by its status
  callback.
- **Retell** (`retell`, the phone line's voice) and **ElevenLabs** (`elevenlabs`, Ask spoken): the platform's accounts.
  Bound 8 to 25 s. Reads twice; nothing that places a call is built (decision 0038). A 429 holds everyone for its
  wait; at once 16 and 8.
- **Anthropic** (`anthropic`): the route's bound (8 s for a read, 20 s for the receptionist, 55 s for Ask and drafts).
  The door does not pace it: its port asks a fast request again at standard speed on a 429 or a 529, then the fallback
  model, and a call is always made (`count`). A 429's `retry-after` (seconds) is honoured by the door's retry up to two
  seconds. A streamed answer ends at the provider when its caller's signal ends.
- **Resend** (`resend`): bound 15 s for a send, 6 s for a read. A send carries `Idempotency-Key`, the queued row's id
  (kept 24 hours), so the ledger's repeat is safe; the door asks it once. The limit is the team's (10 a second by
  default), so a 429 holds everyone for its `retry-after`; at once 8. Its own adapter also waits out a short one and
  sends the same bytes under the same key.
- **Cloudflare Stream** (`cloudflare`): bound 8 to 30 s. Reads twice; an upload once. The account's 1,200 requests per
  five minutes is the platform's: a 429 holds everyone for its `retry-after` seconds; at once 8.
- **The relay** (`relay`, the shelf): our own Worker, not paced. Bound 10 s for an ask, 35 s for a copy; asks twice.
- **Apify** (`apify`): bound 20 s. The account's (250,000 requests a minute, 60 a second per resource): a 429 holds
  everyone for its wait; at once 16.
- **Firecrawl** (`firecrawl`): bound the page's own plus 2 s; reads only, asked once. The team's: a 429 holds everyone
  for its wait; at once 8.
- **Expo** (`expo`, the phone's pushes): bound 10 s. 600 a second per project: a 429 holds everyone for its wait; at
  once 8.
  Expo delivers at least once and keeps no key.
- **TypeSafe** (`typesafe`): bound 6 s, asked once; a 429 holds everyone for its wait; at once 8.
- **Our two apps** (`edge`, `dashboard`) and **the files bucket** (`storage`): always made (`count`), never paced. A 429
  from the edge is its answer (a workspace's AI budget spent), never a pace. The bucket's reads count as outside calls;
  the two apps' calls do not.
- **Stripe**: its own client, not this door (`apps/edge/lib/billing/subscription.ts`): bound 20 s, one network retry by
  the client, an `Idempotency-Key` on Checkout. Stripe allows 100 requests a second live, 25 per endpoint, 50 at once;
  the door does not pace it.

What the door does not do yet, named so it is not taken for done: every adapter still reads its own service's "too
many" codes beside the door's (WhatsApp's `graphThrottled`, the ads' `slowed`, Instagram's and Facebook's busy codes,
Gmail's and Drive's pace). They agree with the door's word, `reply.tooMany`, and can fold into it one by one. The
state is per instance: a "too many" one instance meets is not known to another until it meets it too. And a test world
that runs several cases in one process meets the providers afresh in each (`resetBreakers`, which lets every breaker,
hold and gate go): a wait one case's answer named is the door's to keep for the calls after it.

Tests: `tests/ops/outside-calls/each-service-s-pace.test.mjs` (each fix, the service faked: a "too many" in each way a
service says it, a slow answer, a lost answer, a dead service, a breaker opening and closing, two workspaces of which
one is failing), `tests/ops/provider-fetch.test.mjs`, `tests/jobs/job-request-name.test.mjs` (the job says whose and
which try), `tests/edge/request-id-doors.test.mjs` (a door's calls said once, under its path),
`tests/google/profile/what-the-wire-says-of-a-post.test.mjs`.
