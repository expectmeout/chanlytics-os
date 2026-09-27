# Runbook

How to run Chanlytics OS on a laptop, test it, deploy it, apply a migration,
and roll it back. `docs/architecture.md` says what the parts are; this page
says what to type. Where this page and a workflow file disagree, the workflow
is right.

## The three things that run

| Part             | Runs on                                                                           | Locally                                            |
| ---------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| `apps/dashboard` | Vercel project `chanlytics-os`, root directory `apps/dashboard`, Next.js          | `corepack pnpm --filter @chanlytics/dashboard dev` |
| `apps/edge`      | Vercel project `chanlytics-messaging`, root directory `apps/edge`, Node functions | No dev script; see below                           |
| The database     | Supabase project (`supabase/config.toml` names it)                                | `supabase start` (needs Docker)                    |

Both Vercel projects deploy production from `main` on every merge and a
preview for every pull request, independently of each other. Vercel builds
with Node 24, and so does CI. Node 22 still runs everything locally: `engines`
says `>=22`, and the types are Node 22's, so nothing may call an API only 24 has.

## Run it locally

**Install and build once.** `corepack pnpm install`, then
`corepack pnpm --filter "./packages/*" build`. The apps import the built
`dist`, which is committed; rebuild it whenever a package changes.

**The dashboard.** Copy `apps/dashboard/.env.example` to
`apps/dashboard/.env.local` and fill in the Supabase URL and keys (a local
stack's, or a project you own). Then:

```bash
corepack pnpm --filter @chanlytics/dashboard dev
```

`.claude/launch.json` starts the same command on port 3100. An unset
`VERCEL_ENV` is a laptop, never production (`src/server/deployment.ts`): every
call that would reach a provider through the edge answers "not here" unless
`EDGE_PROVIDERS=live` and `EDGE_URL` point at an edge holding sandbox keys.

**The edge.** It has no dev server script. Its doors are standard
`Request`/`Response` handlers under `apps/edge/api`, so `vercel dev` inside
`apps/edge` with a `.env` copied from `.env.example` serves them. In practice a
door is exercised through its test world: `tooling/scripts/tests/**/*-door.test.mjs`
runs the real handler over an in-memory database, which is how the code is run
on a laptop most of the time.

**The database.** From the repository root:

```bash
supabase start          # the local stack; migrations and supabase/seed.sql apply
supabase status -o env  # the URL and the two published demo keys
supabase db reset       # replay every migration from zero, then the seed
supabase stop --no-backup
```

Point anything at it with `SUPABASE_URL=http://127.0.0.1:54321` and the keys
`supabase status` prints. They are the published local-stack keys, not secrets.

### See a real page

**Run the app. Do not judge a page by the standalone mockup.**
`Chanlytics.html` (`serve-legacy.mjs`) loads every legacy file over
`data/bridge-stubs.jsx`, so the surfaces fed by the bridge never mount in it:
Today, the real Calendar, People, Leads and Live render a `soon` placeholder or
the seeded mockup instead. Its data is the demo's, at a density nobody has, and
a screenshot of it is not evidence about the product. It is for the shell, the
seeded pages, and checking that a new file loads in both lists -- nothing else.

To see what a member sees, run the dashboard against a real project and open a
workspace:

```bash
corepack pnpm --filter @chanlytics/dashboard dev
# then, in the browser, the workspace in the PATH:
#   http://localhost:3100/w/<workspace-slug>/
```

Three things trip this up, in this order:

1. **`apps/dashboard/.env.local` needs `SUPABASE_SERVICE_ROLE_KEY`**, not only
   the two `NEXT_PUBLIC_` keys. Without it `/api/v1/*` answers 500
   (`supabaseKey is required`) and every surface falls back to its seed: the
   page renders, so it looks like a quiet day rather than a broken read. The
   Calendar says "Couldn't read the calendar" -- believe it.
2. **The workspace goes in the path.** The typed client reads it from `/w/<slug>/`.
   An account in more than one workspace gets "This account belongs to more than
   one workspace -- say which one first" on every surface, and `/` alone will not
   do.
3. **A page renders before its surfaces land.** Wait for the thing you came to
   look at, not for the shell.

A page that a spec should hold is still a spec (`e2e:local`, below); this is for
looking at one while you change it.

### The lead map's streets

The lead map draws a square of pins from what the search found and asks nobody
for anything. Streets under it come from a basemap the product hosts ITSELF --
one PMTiles archive plus the fonts and sprites its style reads -- under one
address, `NEXT_PUBLIC_LEAD_MAP_BASE` (`legacy-bridge/lead-map.ts`). Unset, the
square stands. Set, the page draws streets wherever the archive has ground under
the leads and the square everywhere else, so a metro extract is honest, not
broken. Nothing reaches a map vendor: the browser reads byte ranges of the
archive from that address.

Make the bundle (sizes measured 23 September 2026 against build `20260922`):

```bash
# 1. The pmtiles CLI: one binary from https://github.com/protomaps/go-pmtiles/releases
# 2. The archive. --dry-run says the size first. The contiguous US at full detail is
#    19 GB; with --maxzoom=14 (streets, fewer footpaths and buildings) 8.9 GB; one
#    metro is a few hundred MB (NYC and its suburbs, 192 MB):
pmtiles extract https://build.protomaps.com/20260922.pmtiles lead-map/basemap.pmtiles --bbox=-125,24,-66.5,49.5
# 3. The fonts and sprites the style reads, about 20 MB:
git clone --depth 1 https://github.com/protomaps/basemaps-assets
cp -r basemaps-assets/fonts lead-map/fonts
mkdir -p lead-map/sprites && cp -r basemaps-assets/sprites/v4 lead-map/sprites/v4
```

Host the `lead-map/` folder where a browser can read it with Range requests and
CORS. A public Storage bucket on the workspace's Supabase project needs no CSP
change (its origin is already allowed); any other origin is added to
`connect-src` and `img-src` from the variable by `src/csp.ts`. Set
`NEXT_PUBLIC_LEAD_MAP_BASE` to the folder's address without a trailing slash,
e.g. `https://<ref>.supabase.co/storage/v1/object/public/lead-map`. On a laptop,
put the folder at `apps/dashboard/public/lead-map/` (ignored by git) and set the
variable to `/lead-map`. The basemap is OpenStreetMap data under the ODbL, and
the map carries its attribution.

## Format it

Prettier owns formatting (`.prettierrc.json`); `.prettierignore` names what it
leaves alone and why. `corepack pnpm install` installs a pre-commit hook
(`.husky/pre-commit`, through `tooling/scripts/prepare-hooks.mjs`, which skips
on CI and on Vercel) that formats whatever is staged, so a commit made with the
hook on is always formatted. CI runs `pnpm format:check` and fails a commit
made without it.

```bash
corepack pnpm format          # the whole tree
corepack pnpm format:check    # what CI runs
git commit --no-verify        # skips the hook; CI will still check
```

**Bringing a branch across the formatting commit.** A branch older than the
commit that formatted the tree conflicts on every file it touched. Do not
resolve by hand: take the branch's side, format, continue. Which side is
"the branch's" depends on the operation, because git names them from the
point of view of what is being applied:

```bash
# Rebasing: the branch's commits are replayed onto main, so the branch is "theirs".
git rebase origin/main
git checkout --theirs -- <file>
corepack pnpm exec prettier --write <file>
git add <file>
git rebase --continue

# Merging main into the branch: the branch is the checkout, so it is "ours".
git merge origin/main
git checkout --ours -- <file>
corepack pnpm exec prettier --write <file>
git add <file>
git commit
```

Before opening the pull request, `corepack pnpm exec prettier --write` every
non-ignored file the branch touched, so `format:check` is green on the first
run. The ported shell and the committed dists are outside the check
(`.prettierignore`) and need nothing.

## Test it

| Suite                                                        | Command                                | Needs                                                                                              |
| ------------------------------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The node suite: routes, doors, verbs, view models over fakes | `corepack pnpm test`                   | Nothing. Database and integration suites skip, with the reason printed                             |
| The database suites: RLS, CHECKs, triggers, tenancy, erasure | `corepack pnpm test:db`                | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, usually the local stack's                          |
| The browser suite                                            | `corepack pnpm e2e`                    | Chromium (`corepack pnpm e2e:install` once); signed-in specs need the four variables in the README |
| The edge's frozen HTTP contract                              | `node tooling/scripts/golden-edge.mjs` | `BASE_URL` plus the Meta and Retell secrets                                                        |

A skip is not a pass. A run that is meant to hold credentials says so with
`REQUIRE_SERVICE_CREDENTIALS=1`, and the coverage guard then fails instead of
skipping. The nightly sets it; the pull-request jobs do not.

### A signed-in spec, on this machine

A signed-in spec needs a session, and no developer machine holds a service-role
key -- so those specs skip locally and are first RUN by the nightly, against
production. That is a slow way to find out a spec is wrong, and no way at all
to mutation-test one. `tooling/scripts/e2e-harness` closes the gap: a local
server that answers the two Supabase calls `e2e/session.ts` makes, serves the
standalone mockup from this worktree's source with a fixture first in its head,
and answers the spec's own `/api/v1` reads from a record.

```bash
corepack pnpm e2e:local -- e2e/settings-business.spec.ts
corepack pnpm e2e:local -- e2e/settings-business.spec.ts --scenario=salon
corepack pnpm e2e:local -- e2e/settings-business.spec.ts --grep "fits a phone"
corepack pnpm e2e:local -- e2e/people.spec.ts --scenario=pipeline --grep "the Pipeline is a third scope"
```

It takes a free port, sets what `signIn()` reads, runs the REAL spec unmodified
and stops the server. Nothing leaves the machine, no key of any kind is needed,
and the harness cannot write: every route but the two auth calls answers a GET
or a HEAD and refuses the rest, so nothing on it can look like a write that
landed. It runs with `--retries=0`, where the config retries once locally: a
mutation run asks whether the journey went red, and a retry that passes turns a
caught mutant into a flake.

Three records. `nightly` is the seeded `chanlytics-e2e` workspace, DERIVED from
`tooling/scripts/e2e-workspace.mjs` -- the config it writes, the line it
provisions, the clock it sets -- so it changes when the seed changes rather than
drifting from it; `e2e-harness.test.mjs` holds the two together. `salon` is a
fuller, fictional record for the branches the nightly's data cannot reach: a
week of hours, closures at the cap, services, and one language short of the cap.
`pipeline` is the salon's record made a studio whose customers buy by proposal
(`sells_by: "proposal"`, so deals are on), with eight people across the
Pipeline's four groups in `people_list`'s row shape and the person read's own.
For it alone the server answers People's reads and the fixture runs the app's
People surface, courier and route gate over them, so People, the Pipeline and a
person's page are real there; a route whose surface the harness does not serve
(Today, the Inbox, Leads) waits on it and then says it could not be read.

What it cannot prove: anything behind a Save (the page's saver refuses, by
design, and the specs that run here never press one), and anything about timing
in the real bundle -- the harness compiles the legacy tree with Babel in the
browser, so the runner raises the per-test timeout where production runs under
the config's own 45s. Green here is not a green nightly.

`e2e/settings-business.spec.ts` runs on it, and `e2e/people.spec.ts`'s Pipeline
walk on the `pipeline` record. Another
surface needs its own globals added to `e2e-harness/fixture-src.ts` -- whatever
that page's bridge publishes -- and any read it makes added to `answer()` in
`e2e-harness/server.mjs`.

One flake to know about, in the product and not in the harness: the week's copy
menu is an `escape` `MoreMenu`, which closes on any captured scroll event
(`data-bits.jsx`), so a scroll into view between the menu opening and the item
being clicked closes it and the item is never there -- rare, likelier on the
harness because its page is slower, and the nightly can hit it too.

## What CI proves

| Workflow                          | On                                                    | Proves                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`, Secret scan             | every pull request and push to main                   | No secret in what the pull request adds                                                                                                                                                                |
| `ci.yml`, Typecheck               | same                                                  | `dist` matches the sources; typecheck; lint, which includes the layer boundaries and the edge's env and log rules; the formatting check; the node suite; the dashboard builds the way Vercel builds it |
| `database.yml`, Migrations replay | same, and it replays only when database paths changed | Every migration from zero on a fresh Postgres; the closed sets and `database.types.ts` regenerate to what is committed; the database suites pass against that stack                                    |
| `nightly-e2e.yml`                 | 09:00 UTC                                             | The integration suites against real Postgres and the browser suite against production, in the suite's own workspace                                                                                    |

Branch protection requires three checks by name: `Secret scan`, `Typecheck`
and `Migrations replay, SQL rules hold`. The replay is required because the
product's safety model lives in the schema, and it is safe to require because
it reports on every pull request: whether a database path changed is a step
inside the job, not a filter on the workflow. Renaming either job would leave
every pull request waiting for a check that never reports.

## Deploy

1. Merge to `main`. Both Vercel projects build and deploy production on their own.
2. A change both apps must agree on ships in a shape that works whichever
   lands first. Neither deploy waits for the other.
3. A Vercel environment variable reaches a running deployment only after a
   redeploy. Set it, then redeploy the project from its Deployments page.
4. Confirm: `GET /api/health` on the edge answers 200 when the platform's
   clocks are healthy and due work is draining; `GET /api/diag` (keyed) says
   what the deployment holds. The dashboard's `/api/version` names its build.

Each project's variables are listed in its `.env.example`, and a test fails
when the code reads one the file does not list. Provider keys live on the edge
only; the dashboard holds none.

`EDGE_CALL_SECRET` is held by both projects or by neither: a dashboard that
holds it signs every edge call and sends no key, and an edge without it
refuses those calls. On an edge that holds it, `DIAG_KEY` opens only
`GET /api/diag` and the sending-domains lift of a domain held twice
(`op: resume`, `by: platform`); `admin_door_key_only` in the edge log names
every door the key alone still knocks on, and whether it came in. The eval
harness (`tooling/scripts/eval-brain.mjs`) mints a token for its door from
`EDGE_CALL_SECRET`, as the dashboard does; there is no raw key knock to make.

Before setting `RETELL_DOORS_SIGNED=1`, read `voice_door_auth` in the edge log
for `sig: true` on each of the three voice doors. The verifier tries one key,
`RETELL_WEBHOOK_KEY` (`RETELL_API_KEY` when it is unset): `sig: false` on the
fn and availability doors while the webhook shows `true` can mean the wrong
key, not an unsigned delivery.

## Turn on cold email

Reach out sends from a workspace's own domains through a second Resend
account, apart from the one every reply and every page uses, so a cold
complaint never touches the platform's reputation. Reach out Part 3 built
the engine that sends it; nothing sends cold until these switches are set, in
order, and a reach-out exists (step 8).

1. **The cold account.** Create the second Resend account on a plan with
   enough domains (five per workspace at most).
2. **Its key, on the edge:** `RESEND_COLD_API_KEY`. Connections › Email then
   offers "Domains you send from", and the `domains` sweep reads them.
3. **Its webhook.** In the cold account, point a webhook at
   `https://<edge>/api/resend-webhook` for its sending events (`email.sent`,
   `email.delivered`, `email.delivery_delayed`, `email.bounced`,
   `email.complained`, `email.failed` and `email.suppressed`; not opens or
   clicks, which nothing reads, nor `email.received`: replies come back to the
   workspace's mailbox, on the platform account), and set its
   signing secret on the edge as `RESEND_COLD_WEBHOOK_SECRET`. The door takes
   either account's signature. Cold routes open only when the key and this
   secret are both set, so no cold email leaves while its receipts would be
   refused. A secret set wrong is found for you: the sweep pages
   `email_cold_receipts_missing` once a domain's emails of the last day have
   heard nothing back.
4. **The unsubscribe secret, the same value on both projects:**
   `UNSUBSCRIBE_SECRET`, generated once with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   The dashboard's `/u/<token>` page opens the links; the edge seals them.
   Without it the page says it cannot record anything, and logs
   `unsubscribe_unavailable` once a minute at most. A value that differs
   between the two is found for you: every `domains` sweep seals a link that
   names nobody, opens it on the page, and pages
   `email_unsubscribe_links_broken` when the page refuses it.
5. **Redeploy both projects**, then check `GET /api/diag` on the edge:
   `env.emailDomain`, `env.resendWebhook`, `env.resendCold`,
   `env.resendColdWebhook` and `env.unsubscribe` all `true`. Cold routes also
   need `env.resend` (the platform account's key) and the workspace's mailbox:
   a cold email's replies come back to it.
6. **The first domain.** Add it on Connections › Email, publish its records at
   the registrar, and press Check until it reads verified (the sweep reads it
   every ten minutes too).
7. **The DKIM check, once, with Ruben's yes:** one real email from that domain
   to an inbox you own. Its headers show `dkim=pass`, with
   `List-Unsubscribe` and `List-Unsubscribe-Post` among the signed headers:
   Gmail and Yahoo honour a one-click unsubscribe only when DKIM signs both
   (RFC 8058 §4).
8. **The first reach-out.** Made on Part 4's sheet: a chain over a lead
   search, its words and its domains. Until the sheet ships there is no door
   that makes one; `tooling/scripts/tests/reach-out/reach-out.integration.db.test.mjs`
   seeds one on a local stack and runs it end to end. Its first run waits for
   its owner on Broadcasts; the `reach-out-check-sweep` clock (every minute)
   checks each email before it may go, and the `reach-out-sweep` clock (every
   minute) sends what is due and checked from then on, each email through the
   jobs tick and the door.

**What the reach-out clock's 503 means.** `POST /api/cron/reach-out` answers
`503 cold_lane_unset` with the variables it lacks (`RESEND_API_KEY`,
`RESEND_COLD_API_KEY`, `RESEND_COLD_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`,
`EMAIL_DOMAIN`) while a send is due: nothing is claimed until they are set,
and the sends keep. With nothing due it answers 200 and names them under
`lane_missing`. A workspace at its month's allowance (2,000) claims nothing
until the month turns in its zone (`reach_out_month_spent` in the logs); one
without a mailbox or a business address claims nothing either
(`reach_out_workspace_held`).

**What the reach-out check's 503 means.** `POST /api/cron/reach-out-check`
answers `503 check_unset` while a send waits to be checked and the edge has no
`ANTHROPIC_API_KEY` (it touches nothing: `reach_out_check_unset`), `503
cold_lane_unset` while one waits and the cold lane lacks a secret (nothing
checked could leave), and `503 model_unavailable` for a tick in which every
model call failed (`reach_out_check_unanswered`). A send whose tries fail for an
hour is held `check_unavailable` for its owner (`reach_out_check_held`, warn),
and the clock puts it back to be checked an hour on. A workspace that may not
spend, is at its month's allowance, or has spent its 400 model attempts of
the UTC day (`reach_out_check_spend`) is asked again an hour on
(`reach_out_check_gated`).

**A domain held twice in 30 days.** Its owner cannot resume it: the platform
is paged (`sending_domain_held_twice:<host>`, naming the workspace and the
domain). Look at what it sent, then lift it:
`POST /api/admin/sending-domains` with `x-diag-key` and
`{ "op": "resume", "tenant_id": "…", "domain_id": "…", "by": "platform" }`.
The owner is told it sends again, from 30 a day. Only the platform's
`DIAG_KEY` opens this lift, a dashboard's token never does: keep `DIAG_KEY` on
the edge, even once every caller carries a token.

**Rotating the unsubscribe secret.** A link already in someone's inbox must
keep working for at least thirty days (CAN-SPAM). The dashboard first: move
its current value to `UNSUBSCRIBE_SECRET_PREVIOUS`, set the new one as its
`UNSUBSCRIBE_SECRET`, and redeploy it. Then set the new one on the edge and
redeploy that. The other way round, every link the edge seals in between is
one the page cannot open, and the sweep pages
`email_unsubscribe_links_broken`. Clear the previous value no sooner than
thirty days later.

**Before scale: a cold-only domain (D17).** Until these are set, a cold
email's unsubscribe link points at `app.chanlytics.com/u/…` and its replies
come back on `EMAIL_DOMAIN`. Both are judged by the mail they appear in. Before
cold mail is sent at scale, give it a domain of its own, so the app's links and
every workspace's replies never answer for it:

1. Buy a domain for cold mail's links and replies: not a workspace's, and not
   chanlytics.com.
2. Add it to the dashboard's Vercel project, so `https://<it>/u/<token>` is the
   unsubscribe page, and set `UNSUBSCRIBE_ORIGIN=https://<it>` on the
   dashboard: on that host it then answers `/u/` and nothing else (a 404),
   so no sign-in form stands on a domain cold mail names.
3. Set the same `UNSUBSCRIBE_ORIGIN=https://<it>` on the edge, then redeploy
   both. The domains sweep's probe then opens the page there. A value that is
   not an https origin is ignored and logged once (`email_switch_rejected`),
   and the links stay on the dashboard; `GET /api/diag` shows the origin in
   use (`unsubscribeOrigin`, `unsubscribeOriginRejected`).
4. Receive mail on a subdomain of it on the platform's Resend account (MX to
   Resend, as for `mail.chanlytics.com`). The platform account's existing
   webhook, already pointed at the edge's `/api/resend-webhook`, carries its
   deliveries: add no second one, whose signing secret the door would not
   know. Wait until the provider reads it verified for receiving.
5. Set `COLD_REPLY_DOMAIN=<that subdomain>` on the edge. New cold emails'
   Reply-To moves to `r+<token>@<it>`. Replies to older ones still arrive on
   `EMAIL_DOMAIN`, which keeps receiving, and an email queued before the
   switch still leaves as it was frozen. Only reply routes route there: no
   workspace publishes an address on it. The health sweep checks it receives,
   and pages `cold_reply_domain:<it>` when it does not.

**Moving it, or turning it off.** Never simply change or unset
`COLD_REPLY_DOMAIN`: every cold email already sent is answered there, and a
reply that no longer routes is dropped, a lead's "no thanks" among them. Set
`COLD_REPLY_DOMAIN_PREVIOUS` to the old value in the same change, keep it
receiving, and clear it no sooner than 30 days plus the longest chain's length
later. Keep an old link host on the dashboard's project for at least 30 days
after `UNSUBSCRIBE_ORIGIN` moves too: the law wants every link already in an
inbox working that long.

## Turn on push

The phone app is told through Expo's push service (`apps/edge/lib/ops/push.ts`, PR 0 and PR 2 of the phone app).
Nothing sends until a build carries push credentials, and nothing is signed until the token is set.

1. **Credentials, once per platform**, from `apps/mobile`: `eas credentials --platform ios` and say yes to the push
   key (needs the Apple Developer Program); `eas credentials --platform android` and upload the FCM V1 service
   account JSON from the Firebase project (Project settings, Service accounts). Then a new build of each.
2. **Enhanced push security**, in the Expo dashboard under Access tokens: turn it on for the project, then set
   `EXPO_ACCESS_TOKEN` on the edge (Vercel, the messaging project) to a token of that account. In that order: the
   variable first is harmless, the switch first refuses every send until the variable lands.
3. **Watch** `push_send` and `push_receipts` on the jobs ledger: a `push_rejected 401` is the token; a phone the
   receipts say is gone is forgotten by the job, never by hand.

## Turn on the call in progress on phones

A call the receptionist is on appears on the workspace's iPhones as a Live Activity (PR 7 of the phone app): the edge
starts it with a push straight to Apple's service, since Expo's push service does not carry `liveactivity` pushes
(`apps/edge/lib/ops/apns.ts`; the rule is `apps/edge/lib/voice/call-activity.ts`). Nothing is sent until the four
keys are set; a phone hands out its push-to-start token on iOS 17.2 and later, and the site keeps it on the device's
row (00191).

1. **A key**, once: Apple Developer, Certificates, Identifiers & Profiles → Keys, a key with Apple Push Notifications
   service (APNs). Keep the `.p8` it downloads once. The same key may be the one EAS holds for push.
2. **On the edge** (Vercel, the messaging project): `APNS_TEAM_ID` (the account's team id), `APNS_KEY_ID` (the key's
   id), `APNS_KEY_P8` (the `.p8` file's contents; a base64 of it is accepted, since a one-line value is what a
   dashboard takes), `APNS_BUNDLE_ID=com.chanlytics.app`. `APNS_SANDBOX=on` only for a development build's tokens.
3. **Watch** `call_activity_started`, `call_activity_refused` and `call_activity_failed` on the edge's logs: a 403 is
   the key or the team, a 400 `BadDeviceToken` a sandbox token against production (or the reverse), a 410 a phone
   that no longer has the app.

## Turn on native sign-in

The app signs in with Apple and Google natively (PR 3 of the phone app) and hands the identity token to
`POST /auth/native` (PR 0). Until the providers know the app, only the email door works inside it.

1. **Apple**, once the Apple Developer Program account exists: in the hosted Supabase project, Providers → Apple, add
   the app's bundle id `com.chanlytics.app` to the client ids (the Services ID and key are for the web's own Apple
   sign-in, if ever). EAS Build turns the Sign in with Apple capability on from `usesAppleSignIn`.
2. **Google**: in the Google Cloud project, an iOS OAuth client for `com.chanlytics.app` and a web client; in
   Supabase, Providers → Google → Authorized Client IDs, add the iOS client id. Then `eas env:create` for
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in each environment, and a new build:
   the Google button and its URL scheme exist only in a build made with the ids.
3. **Watch** `native_sign_in_failed` on the dashboard's logs: a provider that does not know the app answers there.

## Apply a migration

1. Write it: the next free number, named for the schema change, re-runnable
   statements, a header of a few lines. Never edit or rename an applied one.
2. Replay it locally: `supabase db reset`. Then regenerate what the schema
   drives: `corepack pnpm gen:schema-sets` and `corepack pnpm gen:db-types`,
   and rebuild `dist` if a package changed. Commit the generated files.
3. Let CI replay it from zero and run the database suites against it.
4. Merge, and let both apps deploy.
5. Apply to production from a laptop linked to the project:

```bash
supabase db push --linked
```

Apply after the apps have deployed whenever the migration tightens something
the old code still writes (a CHECK, a dropped column, a renamed function);
apply before them when the new code reads something only the migration
provides. The migration's header should say which. Most migrations are safe in
either order, and say so by being additive.

## Roll back

**An app.** Vercel keeps every deployment. Promote the previous production
deployment from the project's Deployments page; it is live in seconds and the
code on `main` is unchanged. Then fix forward with a pull request.

**A migration.** Migrations are forward-only. Write a new migration that
undoes the change, replay it locally, and push it the same way. Never delete
or edit the applied file: the CLI keys applied migrations by version, and a
rewritten file replays differently on the next fresh database.

**A workspace, not the platform.** The levers in `docs/system-prd.md` S-23:
silence one receptionist (`tenant_channels.status = 'disabled'`), hold one
person, cap a workspace, stop a queued reply. None of them needs a deploy.

**What to look at first.** `events` is the append-only ledger of what
happened, `decisions` of what people did, `escalations` of what needed a
person. `sweep_status` and `/api/cron/health` say whether every clock is
running. The edge's logs are structured JSON with the tenant id and the tail
of the message id on every line.

## Scripts that touch production

Every writing script in `tooling/scripts` is a dry run by default, writes a
JSONL backup first, is idempotent, and takes `--apply` to mean it. Read the
header of the script before running it; each says what it needs and what it
refuses.
