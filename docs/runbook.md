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

**A checkout from before one TypeScript** (main before `b28d3791d`, #1293)
keeps each project's old compiler and its `node_modules/.bin/tsc` after a
plain install. Install, delete every project's `node_modules` (the root's
stays), install again, then build; `typescript-is-installed-once.test.mjs`
fails until it is done and names what is left.

**pnpm's settings** (the hoisted linker the edge's functions need, the
overrides, the patched packages) are in `pnpm-workspace.yaml` and nowhere
else: Dependabot's pnpm 11 reads no other place
(`tooling/scripts/tests/repo/settings/pnpm-settings.test.mjs`).

**The dashboard.** Copy `apps/dashboard/.env.example` to
`apps/dashboard/.env.local` and fill in the Supabase URL and keys (a local
stack's, or a project you own). Then:

```bash
corepack pnpm --filter @chanlytics/dashboard dev
```

`.claude/launch.json` starts the same command on port 3100. An unset
`VERCEL_ENV` is a laptop, never production (`src/server/env.ts`): every
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
address, `NEXT_PUBLIC_LEAD_MAP_BASE` (`apps/dashboard/src/surfaces/leads/map/lead-map.ts`). Unset, the
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

| Suite                                                        | Command                                    | Needs                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| The node suite: routes, doors, verbs, view models over fakes | `corepack pnpm test`                       | Nothing. Database and integration suites skip, with the reason printed                             |
| The database suites: RLS, CHECKs, triggers, tenancy, erasure | `corepack pnpm test:db`                    | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, usually the local stack's                          |
| The browser suite                                            | `corepack pnpm e2e`                        | Chromium (`corepack pnpm e2e:install` once); signed-in specs need the four variables in the README |
| The edge's frozen HTTP contract                              | `node tooling/scripts/ops/golden-edge.mjs` | `BASE_URL` plus the Meta and Retell secrets                                                        |

A skip is not a pass. A run that is meant to hold credentials says so with
`REQUIRE_SERVICE_CREDENTIALS=1`, and the coverage guard then fails instead of
skipping. The nightly sets it; the pull-request jobs do not.

**One clock.** `pnpm test` and `pnpm test:db` run through `tooling/scripts/checks/test.mjs`, which sets the zone
before Node starts: UTC, whatever the machine's, or `TEST_TZ`'s. `TEST_TZ=Pacific/Auckland corepack pnpm test`
(PowerShell: `$env:TEST_TZ='Pacific/Auckland'; corepack pnpm test`) is CI's second leg, "Node suite,
Pacific/Auckland": the whole suite twelve hours east, where a rule that reads the viewer's zone, or a test that builds a
date with no zone, gives the wrong day. A test that reads the wall clock pins it (`t.mock.timers.enable({ apis:
["Date"], now })`), and one that builds an instant gives it its offset. **CI runs the two legs only when asked** (Ruben,
1 Oct 2026: the suite took 27 minutes of every push): on a pull request labelled `suite` (adding the label starts
`suite.yml`; a later push runs them in `ci.yml`), or by hand from the Actions tab (`workflow_dispatch`). Every other
pull request runs the tests of what it changed (`tooling/scripts/checks/changed-tests.mjs`: the folders its paths name,
the rules and ratchets always, the whole suite when the runner or a helper every test loads changed), and the nightly
runs the whole suite. Every push still gets the typecheck, the lint, the dead-export and format checks, the build and
the bundle; before a push, run the test files a change touches
(`node tooling/scripts/checks/test.mjs <file>`, one per command) and the ratchets, never the whole suite on a laptop.

**What the suite ran of the code.** A full run in UTC has Node measure line coverage and prints it per package and
per tree at its end, with the floor of the three that are held: `core`, the edge's doors (`apps/edge/api`) and the
dashboard's routes (`apps/dashboard/app/api`), in `tooling/scripts/tests/baselines/coverage.json`. Under a floor is a
red run; a floor is raised by `UPDATE_BASELINES=1 corepack pnpm test` (two points under the measure, so another platform's
V8 does not fail it) and lowered only by `COVERAGE_FLOORS=lower corepack pnpm test`, argued under "Rises" in `docs/debt.md` (`UPDATE_BASELINES=raise` is for the other ratchets, and neither lowers nor hides a floor). A run of
some files, a flag, the database suites and the Auckland leg are not held to the floors (`TEST_COVERAGE=1` prints the table for some files); `TEST_COVERAGE=0` skips the measure
for a full run that wants the speed. A package's code runs from its committed `dist`, so its lines are read back to the
module that wrote them (`tooling/scripts/checks/coverage.mjs`).

**The database in memory refuses what the real one refuses.** `tooling/scripts/tests/_fake-db.mjs` reads the schema
the migrations generate (`packages/db/src/database.types.ts`, `packages/contracts/src/schema-sets.generated.ts`
and `tooling/scripts/tests/_unique-keys.generated.json`, through `_schema.mjs`) and answers a table, column, function
or embed the database lacks (`PGRST205`, `42703`, `PGRST204`, `PGRST202`, `PGRST200`), a NOT NULL left empty
(`23502`), a value outside a CHECK's set (`23514`), a second row on a unique key (`23505`; a key is judged when the
write moves a column it reads, as Postgres does), an upsert whose conflict target no key matches (`42P10`), a request
line past the gateway's 8 KiB (about 208 uuids in one `.in()`), and reads at most 1,000 rows. It knows no trigger and
no foreign key: a state machine's writers are run through the real guard by one `*.db.test.mjs` each (a broadcast
through both guards, an escalation, a job's claim to its end, a message from queued to read, a line's voice, the lead
money lock). `database/fake-db/fake-db-agrees.db.test.mjs` sends the same requests to the replayed stack and to the double and
fails when the two answer differently. A fixture makes its rows with `tooling/scripts/tests/_rows.mjs`, one factory
per table for the thirteen the suite seeds most: every column the table has, so a migration that adds a NOT NULL column
breaks one factory, not forty fixtures. After a migration, `corepack pnpm gen:db-types` writes the types and the unique
keys from the stack, and `database/generated/unique-keys.db.test.mjs` fails a stale file. The database suites run in parallel
processes against one database, and each makes its own workspace; the few rows that are the platform's (the lead finder's
switch list, the jobs ledger) are behind a file lock (`tooling/scripts/tests/_file-lock.mjs`) that a suite writing or
counting them takes for its whole file. `partners/partner.db.test.mjs` writes ledger rows that outlive their workspace
and passes once per database: reset the stack (`supabase db reset`) before running it again.

### A signed-in spec, on this machine

A signed-in spec needs a session, and no developer machine holds a service-role
key -- so those specs skip locally and are first RUN by the nightly, against
production. That is a slow way to find out a spec is wrong, and no way at all
to mutation-test one. `tooling/scripts/e2e-harness` closes the gap: a local
server that answers the two Supabase calls `e2e/session.ts` makes, serves the
standalone mockup from this worktree's source with a fixture first in its head,
and answers the spec's own `/api/v1` reads from a record.

```bash
corepack pnpm e2e:local -- e2e/settings/settings-business.spec.ts
corepack pnpm e2e:local -- e2e/settings/settings-business.spec.ts --scenario=salon
corepack pnpm e2e:local -- e2e/settings/settings-business.spec.ts --grep "fits a phone"
corepack pnpm e2e:local -- e2e/people/people.spec.ts --scenario=pipeline --grep "the Pipeline is a third scope"
```

It takes a free port, sets what `signIn()` reads, runs the REAL spec unmodified
and stops the server. Nothing leaves the machine, no key of any kind is needed,
and the harness cannot write: every route but the two auth calls answers a GET
or a HEAD and refuses the rest, so nothing on it can look like a write that
landed. It runs with `--retries=0`, where the config retries once locally: a
mutation run asks whether the journey went red, and a retry that passes turns a
caught mutant into a flake.

The records are `nightly`, `salon`, `pipeline`, `email-only` and `kit`. `nightly` is the seeded `chanlytics-e2e` workspace, DERIVED from
`tooling/scripts/ops/e2e-workspace.mjs` -- the config it writes, the line it
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
`email-only` is the nightly's record with no WhatsApp number, for what a message that needs no WhatsApp row looks like:
a mailbox the campaigns send from (`ready`, by contracts' `channelsReady`), two messages with no WhatsApp version (the
starter "How did it go" as an email and a text, and an offer as an email alone, both as the table's rows) and three people
who wrote by email, on a saved list. The server answers GET templates from it as the route does
(`tooling/scripts/e2e-harness/templates-read.mjs`, held to the reader's own answer), GET channels, and People's reads. The
Campaigns pages are App Router pages that the mockup does not draw, so no spec of them runs on a record here: what the
Library and the two composers draw of this one is run in `tooling/scripts/tests/e2e/e2e-harness-campaigns.test.mjs`, over
the real pages and against what the three specs expect.
`kit` is the nightly's record with the kit's gallery for its page in place of
the mockup (below, "See the kit").

What it cannot prove: anything behind a Save (the page's saver refuses, by
design, and the specs that run here never press one), and anything about timing
in the real bundle -- the harness compiles the legacy tree with Babel in the
browser, so the runner raises the per-test timeout where production runs under
the config's own 45s. Green here is not a green nightly.

`e2e/settings/settings-business.spec.ts` runs on it, and `e2e/people/people.spec.ts`'s Pipeline
walk on the `pipeline` record. Another
surface needs its own globals added to `e2e-harness/fixture-src.ts` -- whatever
that page's bridge publishes -- and any read it makes added to `answer()` in
`e2e-harness/server.mjs`. The harness signs in as the workspace's owner, and the
role store the mockup makes (`window.ST_STORE`, in `settings.jsx`) is completed
by the shell's own `installRoles` (`legacy-bridge/identity.ts`) the moment it is
assigned, so `myRole()`, `mayAtLeast()` and View-as answer as they do in the app
and an owner-only item (a person's "Delete person") is offered.

One flake to know about, in the product and not in the harness: the week's copy
menu is an `escape` `MoreMenu`, which closes on any captured scroll event
(`data-bits.jsx`), so a scroll into view between the menu opening and the item
being clicked closes it and the item is never there -- rare, likelier on the
harness because its page is slower, and the nightly can hit it too.

### See the kit

The kit's gallery is one page that draws every class in `apps/dashboard/src/surfaces/kit/classes.json`, in the app's
own stylesheets in the app's order (`docs/plans/2026-09-28-the-interface-kit-and-its-looks.md`, step 2.3). The harness
serves it as the `kit` record's page, at `/` and at the workspace's address, and production never does.

```bash
corepack pnpm e2e:local -- e2e/kit/kit.spec.ts --scenario=kit   # the gallery's checks
node tooling/scripts/e2e-harness/server.mjs 3210 kit        # http://localhost:3210/ ; t turns the theme, l the look
```

Its families and entries are data in `tooling/scripts/e2e-harness/kit-gallery.mjs`: each entry is the markup a kit
component renders, written out, with every state its rules name, and a form that is fixed or placed over the page (a
sheet, a menu, the toasts) stands in a stage of its own. `?theme=light&look=glass` opens it in either.

`e2e/kit/kit.spec.ts` runs at a desk and on a phone, in both themes and both looks, and at a desk with reduced motion,
and in each run again with every entry pressed: hovered, active and focused, forced by the browser's devtools
protocol. It checks that every class in `classes.json` is drawn; that every selector of every rule of `kit.css` is
drawn by an entry, each selector of a list alone and a press's with the presses forced; that every `var()` a kit rule
reads moves every longhand it feeds when that token is planted on the element, and a longhand a page's rule keeps is
named; and that a new primitive computes every longhand its source computes, on every element and pseudo-element,
pressed or not, but those its entry excepts. In both looks and at both widths, a toast raised over an open sheet must
stand clear of the sheet's foot. Under Glass, at both widths and in both themes, every control an entry draws must show
the house's ring when a key focuses it, and every word an entry draws must read 4.5:1, a large one 3:1, on the pixels
drawn under it (a control that cannot be used is not held). It fails on faults planted in the page, which is its own
proof, and it prints what it saw: the entries, the selectors drawn, the token reads per run, pressed too, the twins,
the controls it focused and each run's lowest ratio. What it cannot see is in the header of `e2e/kit/kit-checks.ts`.
`tooling/scripts/tests/styles/kit-gallery.test.mjs` holds the classes in `corepack pnpm test`, where no browser runs:
a kit class added without its entry is red there. Against production the spec skips, and the nightly's skip ceiling
does not count it.

A kit step adds its entries in the pull request that adds the rules, and shows the spec's run in it.

The kit's components with behaviour of their own, on Base UI (the Sheet, the Menu, the Popover, the Select, the
Combobox, the Tooltip, the toast, the Switch, the Segmented control and the Field), run on a page of their own on the
same harness, at `/behaves` (`tooling/scripts/e2e-harness/kit-behaves-entries.tsx`, bundled with the dashboard's React
and the pinned Base UI as the harness starts):

```bash
corepack pnpm e2e:local -- e2e/kit/kit-behaves.spec.ts --scenario=kit   # how they behave, and what they draw
node tooling/scripts/e2e-harness/server.mjs 3210 kit        # http://localhost:3210/behaves
```

Its spec drives each with a keyboard and a pointer, at a desk and on a phone, in both themes and both looks: Escape
closes the sheet, a menu and the popover and gives focus back to what opened them; Tab stays in the sheet and the page
behind it holds still; a menu's arrows walk it and typing finds an item; a switch answers Space and the segmented
control the arrows; the combobox narrows and chooses by the keys; the tooltip shows on hover and on focus and hides on
Escape; a toast arrives in a region a screen reader hears and goes on its ×; a field's problem reaches its box's
`aria-describedby` and `aria-invalid`. A menu's items are chosen by Enter and by a press, an item that opens a page is a
link, one of a set is chosen and marked, and a press outside closes it; the popover stays for a press inside and closes
for one outside; the select is walked and chosen from; the sheet closes for its Close and its wash; and the sheet, an
option with a sentence and a select in its field are named and described as the browser resolves it. In Glass it checks
that no popup is held under a blurred pane or bar. And it
holds what each draws, state by state, to its family "on Base UI" in the gallery, so the gallery the first spec reads
draws what the components draw; `tooling/scripts/tests/styles/kit-behaves.test.mjs` holds what a server can draw of
them in `corepack pnpm test`. It waits by condition, never for a fixed time, and each check is shown to fail on a fault planted in the page (one for a
check, not for every line of it). No CI job runs this spec, so a change to a Base UI component shows its run in the pull
request, as does a bump of Base UI's pinned version; the dashboard's `tsc` compiles the harness page, so a props change
that an entry no longer meets fails `corepack pnpm -r typecheck`.

### Prove a style change

A change that must not move anything on screen (a literal that becomes its token, a rule that moves into the kit, a
class a page trades for the kit's) is proven by recording the pages before it and after it and comparing the two
(`docs/plans/2026-09-28-the-interface-kit-and-its-looks.md`, §3.5):

```bash
corepack pnpm check:style-equality -- record before-my-branch.json      # on the base, before you change anything
corepack pnpm check:style-equality -- record after-my-branch.json --against before-my-branch.json   # with the change
corepack pnpm check:style-equality -- compare before-my-branch.json after-my-branch.json   # the two again, later
corepack pnpm check:style-equality -- self-test   # two recordings of one tree agree, and a planted token does not
```

A bare file name is written to and read from the system's temporary directory (the command prints where), and a path
inside the repository is refused: recordings stay out of it. Name them for the branch, since every worktree shares
that directory. Record the base first, before you edit: the harness reads the pages and the stylesheets from disk on
every request, so what is recorded is the working tree as it stands.

`record` starts the harness above for each record and opens each route at 1440 by 900 and at a phone's 390 by 844 with a
coarse pointer, dark and light. The harness is the mockup's static server, so it draws the shell's own table and the kit's
gallery and nothing else: a page that has left the shell (an App Router page, `apps/dashboard/src/surfaces/routes.ts`:
Today, the Inbox, People, Leads, the Calendar, Reports, Campaigns, Settings, the first run) is drawn by Next alone, and the
harness answers it with "No surface at", which `record` refuses. What `record` opens today is the kit's gallery, which draws
every class of the kit (a recording made before the gallery joined, or with other records, is not compared with one after:
exit 2); the salon's and the pipeline's pages and the eleven scenes it once pressed left with the pages they pressed
(`styles/style-equality-pages.test.mjs` fails a list that names a page that has left). Motion is stopped before a page
draws, and its clock stands still at one moment and moves only as the recorder steps it, ten simulated seconds a route, so a
timer's work is in every recording or in none. It writes every element's edges, to 1/64 of a pixel, and every computed
longhand, a `::before`, `::after`, `::marker` and `::placeholder`'s included, and which rules of each stylesheet the pages
drew. It refuses a page that did not draw what it opened: an empty root, a "No surface at" card, the wrong theme, an error
the page threw, a stylesheet or a font that did not load or answered with an error, 4xx or 5xx (a page drawn without its
rules or in a fallback face is another page), or a request that never ended. A full recording takes a few minutes.

A change to a page that has left the shell is proved by what can draw it: a **move** by value, in a test that draws the old
and the new on the page's stub React and compares them (decision 0015; Reports' lenses, `tooling/scripts/tests/reports/`);
a **kit part** by the gallery's spec (`e2e/kit/kit.spec.ts`), which holds each rule to the tokens it reads in both themes,
both widths and the one look; and a page's **own restyle** by the running app, looked at at 1440 and at 390 in both themes
("See a real page", above), with the change's list of what must differ written in the pull request.

`compare`, and `record` with `--against`, exits 0 when the two are equal: every edge within an eighth of a pixel (the
browser once laid one line of text out 2/64 of a pixel apart in two recordings of one tree), a pseudo-element's laid-out
lengths held the same way, and every other value the same. It exits 1 with the differences, what is gone or new before
what moved (`--limit N` lists more), and 2 when the two were recorded differently (another browser, other pages
or longhands) or the command failed.
Either way it names the rules the change touched that no page of either tree drew: nothing here proves those, so the
pull request names them with how they were checked, says what was compared, and that it was equal.

What it cannot prove, so a pull request does not claim it:

- a state after the page is drawn: hover, focus, a menu, sheet, fold or toast, anything after typing;
- a page that has left the shell, which the harness cannot draw (above), and the real surfaces the mockup stubs: Today, the
  Inbox, the Calendar and Live draw the seeded page, and Leads waits and then says it could not be read;
- what the three's canvas draws, or any canvas;
- motion: animations and transitions are stopped, so a change to one is not seen;
- text: what an element says is not recorded, only its style and where it stands;
- a width between 390 and 1440, and the 900px and 720px breaks among them;
- an edge that moved an eighth of a pixel or less.

It needs the network: the page loads React and Babel from unpkg and its fonts from Google. Record both runs on one
machine, in one sitting; a new browser is a different recording, and `compare` says so rather than compare.

### Add a look

A look is a set of token values (`docs/plans/2026-09-28-the-interface-kit-and-its-looks.md`, §3.1 and §3.2). Glass,
the canvases' finish, is the one look since Classic, the app as it was drawn before, retired on 2 October 2026 (the
plan's step 5.7): its values are the roles block of `apps/dashboard/src/legacy/styles/tokens.css` itself and the
`[data-theme="dark"]` block after it, and every sheet's rules are its. `data-look` stays stamped on the document as the
setting for the next look (contracts `DEFAULT_LOOK_PREF`, `LOOK_OPTIONS`). A second look adds its name to `LookPref`,
`LOOK_OPTIONS` and `isLookPref` in `packages/contracts/src/shell/chrome.ts` (the head's script reads the list), turns
`LOOK_OFFERED` on so the account menu offers the two, adds the name to the list's pins in
`tooling/scripts/tests/shell/chrome.test.mjs`, to the gallery's `?look=` (`tooling/scripts/e2e-harness/kit-gallery.mjs`)
and to the looks `e2e/kit/kit.spec.ts` runs.

1. **The blocks.** `[data-look="<name>"]` after the roles block, and `[data-look="<name>"][data-theme="dark"]` after
   that for its dark side, as Glass's were before they folded in. They set the roles: the surfaces' fills, edges, radii
   and depths, the controls, the actions. Where the look's colours differ, they also set the theme's own (`--bg*`,
   `--ink*`, `--line*`, the tones, the accent), which many kit rules read directly. A colour the first block sets is
   set again in the second: both come after the themes' blocks, so otherwise the first would hold in both themes.
   They set no scale, and no token a kit rule keeps for itself.
2. **Glass keeps its values.** A role the look needs that nothing reads yet comes with its reader in
   `apps/dashboard/src/surfaces/kit/kit.css`, and with Glass's value in the roles block: the one that draws what the
   rule drew before. For a blur a look does not want, that is `none`, read through `var()` in both `backdrop-filter`
   and `-webkit-backdrop-filter`. The build drops `backdrop-filter: none` written beside its prefixed twin (#929), and
   cannot drop a `var()`. `blur(0)` is not `none`: any value but `none` makes its element a containing block for its
   fixed children, and a stacking context. A translucent fill falls back to an opaque one under
   `@supports not (backdrop-filter: blur(1px))` and under `prefers-reduced-transparency: reduce`.
3. **It moves nothing in Glass.** The recorder draws every page the shell still holds in Glass, the look the
   harness's documents stamp (`TWEAK_DEFAULTS` in `apps/dashboard/src/legacy/Chanlytics.html`, and the gallery), in
   both themes. A recording from before the change and one after it are equal ("Prove a style change", above),
   backdrop filters included. The pages that left the shell are recorded on the app itself (step 5.7 did so on the dev
   server against the stand-in, every element's edges and computed longhands, the same comparison).
4. **It draws.** The gallery shows it in both themes, at a desk and on a phone: `?theme=light&look=<name>` ("See the
   kit", above). `e2e/kit/kit.spec.ts` runs every width, theme and look, and holds each entry to the tokens it reads
   there. The pull request shows the gallery in the pairings, at both widths.

   Two readers of the tokens stand outside the gallery. The mascot reads the document's `--bg`, `--ink`, `--accent`
   and `--accent-fg`, and reads them again only when `data-theme` changes
   (`apps/dashboard/src/legacy-bridge/mascot/driver.ts`). The charts' palette was validated against the surfaces it
   sits on (`apps/dashboard/src/legacy/styles/charts.css`, whose header says how). A look that changes those is
   looked at on them, and the palette's validator runs again.

   To see the look on the app itself before it is offered, set `look` to its name in the object this device keeps
   under `chanlytics-os-prefs` in local storage, and reload: the head's script stamps it before first paint.

5. **Offered.** `LOOK_OFFERED` in `chrome.ts` is true (30 September 2026, once Glass was drawn on every canvas), and
   the account menu draws Look under Theme. The flag's pins hold it (`chrome.test.mjs`, and `e2e/shell/sidebar.spec.ts`,
   which expects the Look offered and the default checked), and the packages' `dist` is rebuilt and committed with a
   change to it. Ruben walks it on production.
6. **The default.** `DEFAULT_LOOK_PREF` becomes the look (Glass, 1 October 2026): every device that never chose one
   draws it from its next load, since a device keeps a look only once it is chosen
   (`apps/dashboard/src/legacy-bridge/device-prefs.ts`), and a member who chose the other keeps it. `chrome.test.mjs`
   and `tooling/scripts/tests/shell/theme-boot.test.mjs` pin the default, `apps/dashboard/app/layout.tsx` stamps it on
   the document the server sends, and the browser's bars, the manifest and the native shell's own screens take its
   paper (`THEME_COLORS`, the default look's). A look with type of its own names its faces in `app/globals.css` over
   `public/fonts` and in the mockup's Google Fonts link (`Chanlytics.html`), and sets `--font-sans` in its block, as
   Glass names Mona Sans.

## What CI proves

| Workflow                                   | On                                                                                                | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`, Secret scan                      | every pull request and push to main                                                               | No secret in what the pull request adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ci.yml`, Typecheck                        | same, and a merge queue's commit                                                                  | On a pull request, its title first (`tooling/scripts/checks/pr-title.mjs`); no production dependency with a high or critical advisory (`pnpm audit --prod`; one with no patched version anywhere is ignored by its GHSA under `auditConfig.ignoreGhsas` in a `pnpm-workspace.yaml`, until a fix ships) or under a licence we may not ship (`tooling/scripts/checks/licences.mjs`); `dist` matches the sources; typecheck; lint, which includes the layer boundaries and the edge's env and log rules; dead exports (knip); the formatting check; on a pull request the tests of what it changed (`tooling/scripts/checks/changed-tests.mjs`: the folders its paths name, the rules and ratchets always, the whole suite when the runner or a shared helper changed), and the whole node suite under the `suite` label; the dashboard builds the way Vercel builds it; what a workspace loads, held to what the change adds (past its line, a `Bundle: <why>` line in the description) and to the ceilings |
| `ci.yml`, Mobile                           | the same; its steps run only when the change reaches the app (`mobile-paths-changed.mjs`)         | The phone app's types, lint, Expo's doctor (the SDK's patch drift warns) and a Metro bundle for each platform                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ci.yml`, Node suite, Pacific/Auckland     | a push to a pull request labelled `suite`, and by hand                                            | The node suite with the clock at UTC+12 or +13, where a rule that reads the viewer's zone gives the wrong day. Not required, and not a merge queue's; green since the tests lane (29 tests failed under it on 29 Sep 2026), so a failure fails the run                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ci.yml`, What landed keeps the title rule | every push to main                                                                                | Each commit the push landed: its subject keeps the title rule and carries its `(#N)`, and it is not a merge commit. A break opens an issue, since what landed cannot be undone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `suite.yml`, Node suite on the label       | the `suite` label added to a pull request                                                         | The whole node suite once, in UTC and in Pacific/Auckland. Its own workflow, so a label starts these two jobs alone and never CI again; not required                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `database.yml`, Migrations replay          | every pull request, push to main and merge queue's commit                                         | Every migration from zero on a fresh Postgres; the closed sets and `database.types.ts` regenerate to what is committed; the database suites pass against that stack. It replays only when database paths changed: on a pull request, in its diff; on main, since main's last replay that passed, so a cancelled or failed one is made up by the next push (`tooling/scripts/checks/replay-range.mjs`). On a pull request it also holds the migration ledger to main's: every entry main recorded, unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `nightly-e2e.yml`                          | 09:00 UTC; by hand, the credential-free specs alone (against an address that needs no bypass too) | The node suite with its integration suites against real Postgres (its own job and 45-minute cap), then, whatever it said, the browser suite against production, in the suite's own workspace; Ask's day against its lines. One rolling issue each, saying which half was red and closed by the first green run; the second red run in a row pages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nightly-evals.yml`                        | 10:00 UTC once the variable `NIGHTLY_EVALS` is `1`, and by hand                                   | The receptionist's regression cases, asked of a sandbox model key (`ANTHROPIC_EVAL_KEY`, never the platform's) and judged against the pass line. Off, the night's run is skipped in grey and no runner starts; on or by hand with no key, it fails and says so                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `release.yml`                              | every push to main                                                                                | A tag `vYYYY.MM.DD-<sha>` and a release whose note lists the pull requests merged since the tag before it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `bundle-week.yml`                          | Mondays, and by hand                                                                              | What a workspace loads, main beside main a week before, from the records every push to main keeps; a sum grown past its week's line keeps one issue open, naming the merges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `migration-ledger.yml`                     | Mondays, and by hand; off until `SUPABASE_PROD_READ_URL` is set                                   | Production has applied every migration main carries, and nothing main does not; a day's disagreement keeps an issue open and pages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `preview-smoke.yml`                        | a dashboard preview ready; off until the variable `PREVIEW_SMOKE` is `1`                          | The credential-free specs against the pull request's preview                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Every run on main finishes: a pull request's newer run cancels its older one,
and each main commit runs in a concurrency group of its own, so no merge goes
unverified (before 29 Sep 2026, 44% of main's CI runs were cancelled).

`release.yml` runs one at a time and never cancels one in flight; a merge that queues behind a running release and is
replaced by a newer merge gets no tag of its own, and its pull requests are in the newer merge's note.

Branch protection requires three checks by name: `Secret scan`, `Typecheck`
and `Migrations replay, SQL rules hold`. The replay is required because the
product's safety model lives in the schema, and it is safe to require because
it reports on every pull request: whether a database path changed is a step
inside the job, not a filter on the workflow. Renaming either job would leave
every pull request waiting for a check that never reports.

**The settings only Ruben changes** (Settings, Branches, `main`; Settings,
General), which the workflows are ready for:

- `Require branches to be up to date before merging` (`strict: true`): two green pull requests can no longer
  land a red main together, as they did three times on 28 Sep. A merge queue would do the same with no second run
  (both workflows answer `merge_group`), but a private repository on a personal account is not offered one (read
  9 Oct 2026). What `strict` costs: every pull request open when another merges must take main in and run CI again,
  about ten minutes of Actions and two preview builds each time, on an account whose Actions minutes have run out
  three times. So it waits for CI to be cheaper, or for the repository to move to an organisation that has the queue.
- `Do not allow bypassing the above settings` (`enforce_admins: true`). With it, nothing merges while Actions is
  refused for billing, the fix for a broken main included: on once the minutes are no longer a way CI stops.
- `Mobile (typecheck, lint, doctor, bundle)` among the required checks. It reports on every pull request, in seconds
  when the change does not reach the app, so it is safe to require.
- `Require review from Code Owners` once reviews are posted as GitHub reviews
  (`.github/CODEOWNERS`).
- Squash only: `allow_merge_commit: false` and `allow_rebase_merge: false`,
  with the squash commit's title from the pull request's title
  (`squash_merge_commit_title: PR_TITLE`), so the subject is the checked title.
  **Set on 9 October 2026**, on Ruben's word (`gh api -X PATCH repos/<owner>/<repo>` with those three fields; it
  had allowed all three ways to merge, and titled a squash by its commit when there was one).

**The secrets only Ruben sets** (Settings, Secrets and variables, Actions),
each off until set:

- `PAGER_URL` (the edge's origin, `https://chanlytics-messaging.vercel.app`)
  and `PAGER_KEY` (the edge's `DIAG_KEY`): the nightly and the ledger compare
  page the platform through `POST /api/admin/page`. Unset, their issues are
  the only word.
- `SUPABASE_PROD_READ_URL`: a connection string for a role that reads the
  migration ledger and nothing else ("Apply a migration", below). A GitHub-hosted
  runner has no IPv6 and Supabase's direct database host is IPv6 only, so it is
  the project's session-mode pooler string (Connect, Session pooler), with the
  role written `ledger_reader.<project-ref>`.
- The variable `PREVIEW_SMOKE=1` and the secret
  `VERCEL_AUTOMATION_BYPASS_SECRET` (the dashboard project's Protection Bypass
  for Automation): a preview answers 302 to Vercel's sign-in without it.
- The secret `ANTHROPIC_EVAL_KEY` (a sandbox model key with a cap of its own, never the platform's) and then the
  variable `NIGHTLY_EVALS=1`: the nightly evals. The secret first: on with no key, the night fails and says so.

**Branches no pull request holds.** A lane folded into another pull request
leaves its branch on the remote.
`git fetch --prune origin && node tooling/scripts/ops/stale-branches.mjs --days 7`
lists them; deleting one is Ruben's call.

## Deploy

1. Merge to `main` with Squash and merge, the pull request's title as the
   subject. Both Vercel projects build and deploy production on their own,
   and `release.yml` tags the merge `vYYYY.MM.DD-<sha>` with its note.
2. A change both apps must agree on ships in a shape that works whichever
   lands first. Neither deploy waits for the other.
3. A Vercel environment variable reaches a running deployment only after a
   redeploy. Set it, then redeploy the project from its Deployments page.
4. Confirm: `GET /api/version` on each project names the merge's commit
   (`curl -s https://chanlytics-messaging.vercel.app/api/version`, and the
   dashboard's `https://app.chanlytics.com/api/version`); `GET /api/health` on
   the edge answers 200 when the platform's clocks are healthy and due work is
   draining; `GET /api/diag` (keyed) says what the deployment holds, its
   `migrations.head` production's newest applied migration. The first two are one command,
   `node tooling/scripts/checks/smoke.mjs --edge https://chanlytics-messaging.vercel.app --dashboard https://app.chanlytics.com --sha <the merge's commit>`
   (exit 0 when both answer as they should, 1 when one does not; a protected preview takes
   `VERCEL_AUTOMATION_BYPASS_SECRET`, and `--allow-unhealthy` takes a 503 from a preview with no database), and
   `node tooling/scripts/ops/golden-edge.mjs --no-secret` probes the edge's public pages and each door refusing a
   stranger, with `BASE_URL` or a preview's `VERCEL_URL`, holding no secret.
5. A merge that carried a migration: compare production's ledger with main's,
   "Apply a migration" step 6. Nothing may be missing.

Each project's variables are listed in its `.env.example`, and a test fails
when the code reads one the file does not list. Provider keys live on the edge
only; the dashboard holds none.

`EDGE_CALL_SECRET` is held by both projects or by neither: a dashboard that
holds it signs every edge call and sends no key, and an edge without it
refuses those calls. On an edge that holds it, `DIAG_KEY` opens only
`GET /api/diag`, the pager's door `POST /api/admin/page` (the two conditions
only a workflow sees) and the sending-domains lift of a domain held twice
(`op: resume`, `by: platform`); `admin_door_key_only` in the edge log names
every door the key alone still knocks on, and whether it came in. The eval
harness (`tooling/scripts/eval-brain.mjs`) mints a token for its door from
`EDGE_CALL_SECRET`, as the dashboard does; there is no raw key knock to make.

Before setting `RETELL_DOORS_SIGNED=1`, read `voice_door_auth` in the edge log
for `sig: true` on each of the three voice doors. The verifier tries one key,
`RETELL_WEBHOOK_KEY` (`RETELL_API_KEY` when it is unset): `sig: false` on the
fn and availability doors while the webhook shows `true` can mean the wrong
key, not an unsigned delivery.

Each switch that keeps a weaker mode open has a row in contracts' registry (`packages/contracts/src/ai/flags.ts`) with
its day, the log line that proves it can close, and what closes it. `GET /api/diag` answers `securitySwitches`, one
entry per switch the edge holds: whether its weaker mode is open on the deployment you asked, its day, and the days left.
Start the 3 October read there. `RETELL_DOORS_SIGNED` closes the voice secret on any value but an explicit off (`0`,
`false`, `off`, `no`); the edge never sets it, and the build fails a month after a switch's day.

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
8. **The first reach-out, made from the sheet.** On Leads, open a search
   and press **Write to the N ready** (an owner, an operator or a partner).
   The sheet takes who gets it, the email with its slots, the nudge after it,
   the pace and the domains; **Before it goes** shows the email as the first
   business would read it, its opening written by the check. A booking link
   in the words needs one on Settings › Business, and the sheet says so
   before Start. **Start** saves the chain and plans its first run at once,
   which waits for its owner on Broadcasts: the reach-out block there counts
   what is ready today, what the check still reads, and what it held, each
   with its doors. The `reach-out-check-sweep` clock (every minute) checks
   each email before it may go, and after Approve the `reach-out-sweep` clock
   (every minute) sends what is due and checked, each email through the jobs
   tick and the door. `tooling/scripts/tests/reach-out/reach-out.integration.db.test.mjs`
   runs the same path on a local stack, from the save to two emails sent.

**The model the check needs.** The check writes and reads each opening with
Haiku through `ANTHROPIC_API_KEY` on the edge, the key the notes sweep already
uses, so there is nothing new to set. Words that name no `{{opening}}` ask no
model at all. The sheet's preview asks the same model through the edge's
`/api/admin/reach-out-preview`, and counts in the workspace's Ask budget
(`ask_budget_spent` once the last 24 hours' is spent).

**What `check_unavailable` means.** The model did not answer one email's
check for an hour of tries, so the email waits, held, and never sends
unchecked. It is not about the business, and it needs nothing from anyone:
the check puts such a hold back to be checked an hour on, and **Check the
held again** on the run's block does it at once. A hold that names a rule
(a link, a price, a line in capitals) is the opening's own, and waits for
its owner's Rewrite, Include, Skip or Not a fit.

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

**Replies to a reach-out (Part 5).** A reply to a reach-out's email is read
for what it means before anyone answers it. The email intake asks
`reach_out_reply_of` of every email it keeps, and for a reach-out's reply it
schedules one `reply_read` job instead of telling anyone itself. The job reads
the reply with the model, applies what the reading means through
`reach_out_reply_apply`, drafts an answer when the reading asks one, and tells
the workspace once (`reach_out_replied`). The readings are rows of
`reach_out_replies`, one per message.

- **Once per message and stage.** A partial unique index,
  `jobs_reply_read_once`, holds one live `reply_read` per message and stage;
  a failed one does not count. The stage is in the payload: none (or `read`)
  for the first read, `reread-<n>` for the n-th read again, and `draft` for a
  draft a first job had no time left for. A second schedule of the same
  message and stage is answered `already_scheduled`, never an error.
- **Cancel them.** Only a job still `scheduled` can be canceled (the ledger's
  guard refuses the rest):
  `update public.jobs set state = 'canceled' where kind = 'reply_read' and state = 'scheduled' and tenant_id = '…';`
  A canceled job still holds its message and stage on the index until
  `purge_jobs` deletes it a week later, so the same read is not scheduled
  again before then. A reading already applied stays applied; cancel the
  jobs, not the readings.
- **The model the reading needs.** Haiku 4.5 (contracts' `REACH_OUT_MODEL`)
  through `ANTHROPIC_API_KEY` on the edge, the key the check already uses;
  the draft asks the receptionist's own model through the same key. A
  workspace reads at most 200 replies a UTC day (`REACH_OUT_READS_PER_DAY`,
  counted in `reach_out_check_spend.reads`), and only while it may spend.
- **What "unread" means.** A reading whose `unread` is set was not read, and
  is `other` until it is: `no_model` (no key on the edge), `may_not_spend`
  (the workspace may not spend), `day_spent` (its 200 reads of the UTC day
  are spent) or `model_failed` (the model threw, ran out of time or answered
  nothing usable). A person's unread reply stops the chain as any reply does,
  and an automatic one changes nothing until it is read; nothing is drafted,
  and the thread says they wrote back. It is read again at most
  three times within seven days of the reply (`REPLY_REREADS`,
  `REPLY_REREAD_DAYS`): after `no_model` or `model_failed`, an hour on the
  first time and the next UTC day after that; after `day_spent` or
  `may_not_spend`, the next UTC day. A re-read that finds a no applies it and
  tells the workspace again.
- **A read job that failed for good** is not scheduled again, and the
  re-reads it would have made are lost with it: after three failed tries the
  workspace hears "A reply to your reach-out could not be read or told" on
  the Inbox. After the edge is rolled back past Part 5 (an older edge fails
  `reply_read` as work it does not know) and then forward again, schedule
  again what is still owed:
  `insert into jobs (tenant_id, kind, due_at, payload) select tenant_id, 'reply_read', now(), jsonb_build_object('message_id', message_id, 'stage', 'reread-' || (rereads + 1)) from reach_out_replies where unread is not null and undone_at is null and rereads < 3 and read_at > now() - interval '7 days' on conflict do nothing;`
- **Why nothing was drafted.** The reading says why in `draft_why`:
  `no_receptionist` (no receptionist configured, no mailbox, or no model key),
  `off` (the reply mode is never), `budget` (the day's tokens are spent),
  `may_not_spend`, or `not_drafted` (the brain handed off, refused or failed).
  The edge logs `reach_out_reply_draft` with `drafted` and `why`.
- **A reply that left from the mailbox, and why.** An owner's reply to a
  reach-out's thread is frozen twice: the mailbox's request, and a twin from
  the domain the reach-out wrote from while that domain is verified. The wire
  sends the twin when it can and records which left on the row:
  `meta.email.left_as` is `own` or `mailbox`, with the reason
  (00226 `stamp_email_left_as`). The reasons for `mailbox` are
  `domain_held` (the twin's domain was held after the freeze; the Inbox line
  says so), `no_own_route` (no own domain is bound: the cold lane's keys are
  unset, the domains could not be read that tick, `email_own_domains_unread`,
  or none is verified now), `domain_has_no_route` (the twin's domain was
  removed after the freeze, or is being verified again), `route_refuses_twin` (its Reply-To is on a reply domain
  the edge has retired) and `twin_names_another_recipient`. A reply with no
  `left_as` left as every reply did before: the dashboard froze no twin
  (the domain held or removed at Send, or no reach-out email on the thread),
  or the edge predates Part 5. A stamp that fails is logged
  (`deliver_left_as_failed`) and never thrown: the words already left.
- **Microsoft 365's out-of-office stops a chain.** Its documented headers
  claim `automated`, not `auto_reply`, so it counts as writing back and the
  chain stops, with a step for the day they are back, rather than pausing.
  A capture from a live Exchange Online mailbox is still owed; if it claims
  `auto_reply`, the change is to `classifyReceived` alone.
- **The proof.** The nightly's run of a reply is
  `tooling/scripts/tests/reach-out-replies/replies.integration.db.test.mjs`:
  on a stack, a chain written to four businesses, each reply read by the
  real job, the owner's answer by the own domain and then the mailbox, and
  the undo of a no. It runs with the database suites, locally with
  `corepack pnpm test:db`.

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

1. **Credentials, once per platform**, from `apps/mobile`: `npx eas-cli@latest credentials --platform ios` and say
   yes to the push key (needs the Apple Developer Program); `npx eas-cli@latest credentials --platform android` and
   upload the FCM V1 service account JSON from the Firebase project (Project settings, Service accounts).
2. **Android's Firebase file, once**: the app's own `google-services.json` from the same project (Project settings,
   Your apps, the Android app `com.chanlytics.app`), handed to EAS as a file variable and never to the tree
   (`apps/mobile/.gitignore` refuses it). From `apps/mobile`:

   ```bash
   npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment preview --environment production --visibility secret
   ```

   Then delete the local copy. EAS writes the file for each job and names its path in `GOOGLE_SERVICES_JSON`, which
   `app.config.ts` hands to `android.googleServicesFile`; without it a phone is never given a push token, and the app
   logs `push_token_unavailable`. The file is part of the native fingerprint, so no update can bring it to an
   installed app: build again (`npx eas-cli@latest build --profile preview --platform android` for the preview app).

3. **Enhanced push security**, in the Expo dashboard under Access tokens: turn it on for the project, then set
   `EXPO_ACCESS_TOKEN` on the edge (Vercel, the messaging project) to a token of that account. In that order: the
   variable first is harmless, the switch first refuses every send until the variable lands.
4. **Watch** `push_send` and `push_receipts` on the jobs ledger: a `push_rejected 401` is the token; a phone the
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
   Supabase, Providers → Google → Authorized Client IDs, add the iOS client id. Then, from `apps/mobile`, the two ids
   in the preview and production environments (plain text: an `EXPO_PUBLIC_` value is in the app's bundle anyway),
   and a new build, since the Google button and its URL scheme exist only in a build made with the ids:

   ```bash
   npx eas-cli@latest env:set --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value <ios client id> --environment preview --environment production --visibility plaintext
   npx eas-cli@latest env:set --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value <web client id> --environment preview --environment production --visibility plaintext
   ```

3. **Watch** `native_sign_in_failed` on the dashboard's logs: a provider that does not know the app answers there.

## Turn on Ask, spoken

Ask as a voice conversation on ElevenLabs Agents, with Ask itself as the agent's model (the design,
`docs/superpowers/specs/2026-10-03-ask-spoken-design.md`; the door, `docs/decisions/0026-a-provider-calls-the-dashboard.md`).
Nothing of it runs until the five variables are set, and each app refuses in words until the other is there.

1. **The agent's key and the webhook's secret on the edge:** `ELEVENLABS_API_KEY` (the vendor's API key: the edge
   mints a conversation token with it, `POST /api/admin/voice/session`, and erases a conversation once its minutes
   are written), `ELEVENLABS_AGENT_ID` (step 3's), `ELEVENLABS_WEBHOOK_SECRET` (step 4's). None reaches the
   dashboard.
2. **The two secrets on the dashboard:** `ASK_VOICE_SECRET` (any long random string: the member's access token is
   sealed under it in `ask_voice_sessions` for the hour the brain door may need it) and `ELEVENLABS_LLM_SECRET` (any
   long random string: the agent sends it in `x-chanlytics-agent` on every request to the brain door). Both are
   required in production (`env.ts`); a dashboard without them answers `upstream_voice` and the door 401.
3. **The agents, from code:** two from one body, production's `chanlytics-ask` and a laptop's `chanlytics-ask-dev`
   (the spec's §3.7 as amended 4 Oct 2026). `node tooling/scripts/voice/elevenlabs-agent.mjs --url https://<the dashboard's host>/api/ask/voice/llm`
   prints production's body; `--apply` creates or converges it by name, reads every field back and exits 1 on any that
   differs (`agentDrift`), so a converge is proved and a vendor default cannot survive one; `--check` does the
   read-back alone. The laptop's is `--name chanlytics-ask-dev --url https://<tunnel>/api/ask/voice/llm --apply`, and
   `--set-url` refuses production's name. The key comes from the environment or `apps/edge/.env.local`, the header's
   value from `ELEVENLABS_LLM_SECRET` (each agent its own). The id an edge mints on is its `ELEVENLABS_AGENT_ID`. The
   body is `tooling/scripts/voice/elevenlabs-agent-config.mjs`, held to the spec by
   `tooling/scripts/tests/ask-voice/elevenlabs-agent.test.mjs`: the agent says nothing on connect (the session comes
   up during the hold; the first words are the person's), patient turns, the turn timeout at its longest (30) and the
   silence end off (the session's microphone is muted; the brain door answers the vendor's "..." with the buffer words,
   and the browser ends an idle session after a minute, `idle`), room voices detected and the listener's words
   ignored, Ask's one voice (contracts `ASK_VOICE_ID`) on its one model (`ASK_VOICE_MODEL`, Turbo v2), `audio` among
   the client events (it gates the agent's speech), no override but the extra body, the vendor's
   transcript readers off, `cascade_timeout_seconds` 15 (the vendor's ceiling; the brain door sends the vendor's buffer
   words whenever ten seconds pass with nothing speakable, contracts `ASK_VOICE_PULSE_MS`), audio not recorded, seven
   days' retention, the limits of the plan.
4. **The post-call webhook:** in the vendor's console (Agents › Settings › Post-call webhooks), one webhook at
   `https://<the edge's host>/api/elevenlabs-webhook` for `post_call_transcription`; its signing secret is
   `ELEVENLABS_WEBHOOK_SECRET`; then `--apply` again with `--webhook <the webhook's id>` so the agent names it. The
   door verifies `elevenlabs-signature` (`t=…,v0=…`, HMAC-SHA256 over `t.body`, thirty minutes), ends the session row
   with its minutes, logs each turn's timings (`ask_voice_session_ended`: `ttfb_ms`, `ttf_sentence_ms`) and erases
   the vendor's record. A delivery it cannot use is 200 and a line (`elevenlabs_webhook_unknown`), never a retry.
5. **A laptop:** the brain door needs a public address, so run a tunnel to the dev server
   (`cloudflared tunnel --url http://localhost:<port>`) and point a throwaway agent at it
   (`--set-url <agent_id> --url https://<tunnel>/api/ask/voice/llm`); the pane cannot open a microphone, so a voice
   session is tried in a real browser at `http://localhost:<port>` after the sign-in helper.

**Reading aloud is not a conversation** (4 Oct 2026): Today's Listen and an answer's Read aloud send the words on
screen to `POST /api/v1/ask/speech`, which asks the edge's `POST /api/admin/voice/speech` (door E, the signed admin
token and the spend check) for the vendor's text-to-speech stream in the same voice, and the browser plays the clip.
No agent, no microphone, no row. Logged as `ask_speech` (`purpose`, `chars`, `ttfb_ms`) and `ask_speech_refused`
on the dashboard, `voice_speech_spoken` and `voice_speech_refused` on the edge; counted as `speech`, sixty an hour a
person. The browser's own synthesis is gone: a clip that cannot be made says why beside the button, and nothing
else speaks. **The hold is the one mic** (4 Oct, evening): the mic's press asks for the agent's session (its microphone
muted) and starts the browser's recogniser; the lift sends the words heard to the agent as a text turn, and the agent
answers aloud at once, its words streaming into the Line as it speaks; a session not up by the lift leaves the words
to the typed way, read aloud by the clip when the answer lands; the next hold cuts the agent off; a typed question is
answered in text alone and ends the session. One voice at a time: a clip ends a session that is running, and a hold
ends a clip. The
words of each clip go into the vendor's text-to-speech history under the account's retention (zero retention is an
Enterprise switch); deleting each after it plays is the spec's §8 follow-up.

What to read: `ask_voice_session` (a conversation began: its thread and conversation ids), `ask_voice_turn` (one
spoken turn: `ms`, `chars`, `pulses`, `followed` for a duplicate the vendor sent, `failed`), `ask_voice_door_refused`
(`why`: `secret`, `session`, `no_session`, `ended`, `expired`, `member`, `rate`, and since 4 Oct the door's canned
lines too, `silence` and `missed`), `ask_voice_session_end` (`reason`, `connect_ms`, `first_audio_ms`: the browser's
word for how it ended and what it measured from the tap), `voice_session_minted` and `voice_session_refused` on the
edge, `ask_voice_session_ended` from the webhook. The rows: `ask_voice_sessions` (the member's own under RLS;
`turn_key` and `turn_started_at` are the door's claim; since 00300 `end_reason`, `connect_ms` and `first_audio_ms`
say how it ended and how long each wait was), swept a day after their token expired (`sweep_voice_sessions`, 00288,
nightly, judged on its runs).

**The voice doctor.** The vendor erases its record of each conversation after the call, so the row is the one record,
and one query answers how voice is doing without a log pulled:

```sql
select date_trunc('hour', created_at) as hour, end_reason, count(*) as n,
       round(avg(extract(epoch from (ended_at - created_at))))::int as lived_s,
       percentile_cont(0.5) within group (order by connect_ms) as connect_p50_ms,
       percentile_cont(0.5) within group (order by first_audio_ms) as first_audio_p50_ms,
       count(*) filter (where turn_key is not null) as spoke
  from public.ask_voice_sessions
 where created_at > now() - interval '7 days'
 group by 1, 2 order by 1 desc, 3 desc;
```

A row with `end_reason` null ended by the webhook alone (the browser never said), `start` never came up, `vendor` was
cut from the far side, `superseded` was replaced (a hold on another thread, a clip), `idle` waited a minute with
nothing asked (the usual end since the hold became the one mic: most rows), `typed` and `navigated` are the person's.
Healthy: `connect_p50_ms` under 3,000, `first_audio_p50_ms` under 6,000 (the press to the agent's first word of the
answer: the hold itself is in it), `spoke` close to `n`, few `start` and `vendor`.

The gate, as every phase's: `E2E_BASE_URL=https://<host> ELEVENLABS_LLM_SECRET=… REPS=3 node tooling/scripts/eval-ask.mjs --spoken`
asks every first turn through the brain door as the agent would and adds the spoken rules to the judge
(`tooling/scripts/eval-ask-spoken.mjs`): no id, no route, no bracketed tag, an early comma in a long headline; the
numbers go into the spec's §4.

## Walk the phone app

The preview app on an Android emulator or phone, walked end to end from this computer: cleared to its sign-in screen,
signed in as the nightly's own owner, each tab, the bell's sheet and Back, More's drawer, a chart's CSV to the share
sheet, and More pressed again while in front. Every step leaves a screenshot, and the walk says which bundle it ran.
The flows are Maestro's (`apps/mobile/.maestro`); the rest is `tooling/scripts/mobile`, over adb and the WebViews'
DevTools, which a preview or development build opens and a store build does not.

1. **An emulator, once**: Android Studio's SDK with an x86_64 Google APIs image, and one virtual device made from it
   (`emulator -avd <name>` starts it). adb comes with the SDK. A phone with USB debugging on works too.
2. **The preview APK**: the newest finished preview build's artifact, from the Expo dashboard or
   `npx eas-cli@latest build:list --platform android --build-profile preview --status finished --limit 1`, then
   `adb install -r <file>.apk`. An update published to the preview channel reaches it on its second launch.
3. **Maestro, once**: its CLI from its GitHub releases, which runs on a JDK 17 or newer (Android Studio ships one).
   `maestro` on the PATH, or the launcher's path in `MAESTRO`, and `JAVA_HOME` set.
4. **Walk it**, with the e2e suite's three keys (`e2e/session.ts`) and the nightly owner's address:

   ```bash
   E2E_USER_EMAIL=e2e-owner@example.com node --env-file=apps/dashboard/.env.local --import tsx tooling/scripts/mobile/walk.mjs
   ```

   It ends with the bundle it walked (an update's id and when it was published, or the build's own) and where the
   screenshots are (`--out <dir>` names the folder). `--store` takes the store listing's screenshots instead
   (`docs/store/screenshots.md`), on a display of 1080 × 1920, and puts the display back after.

5. **Time a cold start**, signed in: `node tooling/scripts/mobile/cold-start.mjs` (five runs; `--runs <n>`) says, from
   the moment the app was started, when the system drew its first frame, when the site answered, the first paint,
   and when Today was drawn with its data. `sign-in.mjs` on its own signs the app in and nothing else.

What trips it:

- **The walk comes back to the sign-in screen.** The site's sign-out is global: the nightly's specs sign its owner
  out of every device, the emulator's app included. Run the walk (or `sign-in.mjs`) again.
- **adb lists an `emulator-55xx` that is offline, and Maestro says the device is not connected.** Another program is
  listening on an emulator's port (on one of our machines, an audio driver's daemon on 5563). Restart adb looking at
  the first emulator's port only: `adb kill-server`, then `ADB_LOCAL_TRANSPORT_MAX_PORT=5555 adb start-server`
  (PowerShell: `$env:ADB_LOCAL_TRANSPORT_MAX_PORT=5555; adb start-server`).
- **A tab pressed again is not in the flows.** The bar's selected item takes no click, and a Maestro tap is one;
  `walk.mjs` presses More again with a touch and hears the page ask for its drawer.

## See how fast the pages are

Each page load in a workspace sends its web vitals when the page is hidden, and the back office's card, "How fast
the pages are", says the 75th percentile of each over the last seven days (00255). That is the number the bundle's
ceiling answers to (`check:bundle -- --ceiling js=<bytes> css=<bytes> page=<bytes>`, the line no pull request crosses; set
on 10 Oct 2026 at 800 KiB for the route's JS, 160 KiB for its CSS and 256 KiB for each page's own, with room for a month's
work at the rate main grew in early October, read again with these numbers): LCP for the page drawn, INP for a tap
answered.

1. **Read it** on the back office, or in SQL as the service role: `select * from page_vitals_p75();` gives one row per
   metric over every page (`page` null), then one per metric and page.
2. **An empty card** after the migration is applied means no page has been hidden since: open a workspace, switch
   tabs, and read it again.
3. **Watch** `page_vitals_not_kept` on the dashboard's logs: the table refused a load's reports, which on a deploy
   ahead of its migration is expected, and otherwise is the database.

## Read the logs

### What a log line holds

Every line the platform writes is one JSON object on stdout, from one logger (`packages/channels/src/log/`; the edge's
`apps/edge/lib/log.ts` and the dashboard's `apps/dashboard/src/server/log.ts` re-export it, and core, jobs, db and
channels write through it). A line holds, in this order:

| Key          | What                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`      | `info`, `warn` or `error`. Nothing else is written to stdout: `no-console` holds every tree.                                                                                       |
| `event`      | The name, a closed set (`LOG_EVENTS`, `DASHBOARD_LOG_EVENTS`; `repo/log-events.test.mjs`). It never changes once shipped: alerting greps for it.                                   |
| `request_id` | The request the line belongs to: the answer's `x-request-id`, a job's originating request (or its own row for a clock's), a delivery's platform id. Absent only outside a request. |
| `tenant_id`  | The workspace, once the request has said which; the one spelling of it on any line.                                                                                                |
| the fields   | The line's own, named, never positional. An `Error` is `"Name: message"`, and on an `error` line its first frames ride beside it as `<key>_stack`.                                 |

A line has no clock of its own: the platform stamps it as it arrives, and so does any drain.

What a line may not say is taken out where it is written, so no caller can forget (`edge/log-line.test.mjs` plants each):

- **A number or an address**, by the key it is under (`to`, `from`, `phone`, `email`, `*_phone`, `*_email`): four digits, or
  the domain. **What a person wrote** (`body`, `text`, `*_body`, `*_text`): its length.
- **A credential**, by name (`token`, `secret`, `password`, `authorization`, `api_key`, `cookie`, `signature`, and any key
  ending in one: a model's key included): nothing.
- **What looks like either, in any string** (a provider's error text, an exception's message, a URL with `?key=`): an
  address keeps its domain, an international number four digits, and a bearer token, a model or provider key, a JWT
  and a `name=value` credential are replaced.

To follow one thing from the click to the provider: take the `x-request-id` the dashboard answered with (the browser's
network tab, or the `request_id` on any line of the route), and search it in both projects' logs. The dashboard's
calls to the edge carry it, so the admin door's lines carry the same one; a job the request scheduled runs under it a
minute or a day later; and the ledger's rows say it (`select * from events where request_id = '...'`).

Other lines to know:

- `client_error`: a page broke in someone's browser (`POST /api/v1/client-errors`, once per error per page load, twenty
  an hour per person): which boundary caught it, the page, the error and its first frames, the workspace when they
  hold one. Search it by `page`. It is a warning, not an error: a customer's browser is not the platform's failure,
  and a drain's alert on `level = error` stays about the platform.
- `breaker_open` and `breaker_closed`: a provider's breaker held its calls after five faults in a row, and let them
  through again; `GET /api/diag` (`breakers`) says each provider's state in the instance that answered, with how many
  times it has opened.
- `emit_event_failed`, `paged_read_capped`: the database package's, now in the same shape.
- `sms_code_skipped`: a text that was a one-time code (a service's "your code is ...") came to a Chanlytics line and was not
  answered: no person, no conversation, no reply. The line holds the service it read (`service`), never the code or a
  number. The owner reads the codes sent to the line on Settings, Connections, from Twilio's own record of them; nothing of
  ours stores one. `line_codes_read_failed` (a warning, with the workspace) is Twilio refusing to list them for that page.
- `wa_standing_read`, `wa_standing_read_failed`, `wa_standing_keep_failed`, `wa_standing_tell_failed`, `wa_standing_told`:
  what Meta holds about a connected WhatsApp number (whether it may send, its display name, the business's verification,
  whether a payment method is on file), read as a number is connected, by the channel-quality sweep and when an owner opens
  Connections. The first is every read that answered, at info: the word for whether it may send (`can_send`) and each
  problem's entity and code (`problems`, as `WABA:141006`), never Meta's words. It is how the codes of Meta's calling
  problems (SIP) are learned, which the row tells apart by their words until then (contracts number-standing.ts). The next is
  Meta not answering or refusing (a warning, with its `status` and `code`; the row keeps what it held); the third is the
  database door refusing to keep a reading or a display-name decision and the fourth the owner's notice failing to send
  (both errors, with the `channel_id` where a read wrote them; the webhook's line for a display name's decision holds the
  workspace and the `error` alone). None of them fails the thing that asked for the read. `wa_standing_told` is the owner
  told that Meta will not let the number send: the bell row, and `mailed` says whether the owner's mail went too (false: a
  mail provider or a mailbox to look at). Meta's own words are never logged: they often name the number.
- `wa_signup_finished_unclaimed`: at info, not error: Meta finished a WhatsApp sign-up for an account no workspace holds
  (the owner reloaded or left the page before Chanlytics heard back), so there is nothing to keep. The line holds the
  `waba_id`, the `entry_id` Meta addressed the notice to (the partner's portfolio) and the `account_event`. The owner presses
  Connect WhatsApp again and chooses the account Meta already made. `waba_unroutable` stays an error: a change about an
  account a workspace should hold and none does.

### Where the logs go

Vercel keeps each invocation's stdout for its plan's retention, which is short: nothing here ships a line anywhere else,
and nothing alerts on one. Two things are Ruben's to switch on, neither is code, and the day either is on, this section
says so:

1. **A log drain** on both Vercel projects (Settings, Log Drains) to a store that keeps thirty days and can be searched by
   `request_id` and `event` (Axiom, Datadog, Better Stack). Then an alert on `level = error` by `event`, and on
   `breaker_open`, so an outage that was silent is a message.
2. **An external pinger** on `GET /api/health` (it answers 200 or 503), with SMS or push to a person: the health door is
   the one door with no key so that a monitor outside the failure domain can page.

The day's numbers are in the back office ("Each workspace's day", `platform_metrics`, counted at 00:17 UTC for the day
before); the health sweep pages `answer_rate_zero` when a workspace's customers wrote all day and nobody answered. Who
played a call's recording is a decision (`open_recording`, one per member per call per hour) on Settings, Activity.

## Answer WhatsApp after the acknowledgement

A WhatsApp message is answered inside Meta's request, under the function's sixty seconds. A workspace named in the
edge's `WHATSAPP_ANSWERS_AS_JOBS` (workspace ids, comma-separated, or `all`) takes the road a text takes instead:
the webhook records the message, schedules its answer as an `inbound_answer` job and answers 200, and the job answers
it (`apps/edge/lib/whatsapp/answer-later.ts`). Unset is the default, and changes nothing.

To try it: name one workspace on the edge's production environment and redeploy the edge (an environment variable is
read by a new deployment). Write to that workspace's number. In the logs, `wa_inbound` then `wa_answer_taken_up`
under one request id, and the reply's own lines after it; in the ledger, one `inbound_answer` row for the message,
`done`. To go back: remove the workspace from the variable and redeploy. A message recorded before the change is
still answered by its job.

What to watch while it is on: `wa_answer_unscheduled` (the job could not be written: the message is the deadman
sweep's to hand to a person, within a quarter of an hour), and a reply's lateness on the heartbeat's line
(`reply_late_ms`), which pages past a minute.

## Read the jobs ledger

Everything that happens later is a row in `jobs` (S-08): a reply 15 seconds after Send, a broadcast's batches, an email's
intake, the lead finder, a phone told. pg_cron asks every ten seconds whether one is due and calls `api/jobs/tick`,
which runs up to three at once (`CLAIM_SLOTS`; `1` is the old one at a time). The claim takes a reply first, then someone
waiting who is not a customer, then bulk, each workspace taking its turn at bulk (decision 0018).

- **Is a reply waiting?** Each `jobs_tick` line in the edge's logs carries `late_ms_<kind>`, the worst first-claim wait of
  each kind in that heartbeat, and `reply_late_ms`, the reply lane's. A reply claimed more than a minute late pages the
  platform (`jobs_replies_late`, once per window). If it pages, the ledger's heartbeat was slow to start or every runner
  was busy with replies: read `sweep_health()` for the `jobs` clock, then the `jobs_tick` lines.
- **A job failed.** The workspace's owner was told, and the row is `failed`, final, kept 90 days. The page for many at once
  says the query to list them. When the cause is fixed (a provider's outage over, a key replaced), run one again from a
  platform admin's session: `POST /api/v1/platform/jobs/requeue` with `{ "tenant_id": "<workspace>", "job_id": "<job>" }`.
  It makes a fresh row of the same kind and payload, due now, and writes who asked first (`platform.acted`, in the
  workspace's activity). It refuses work that speaks to a person (`outbound_send`, `broadcast_send`: it may have reached
  them; send it again from the thread or the broadcast), a job that has not failed, a kind this deploy does not know,
  and work the ledger already holds again.
- **A kind the runner does not know** is kept, not failed: a newer deploy wrote it. It is looked at again every five minutes
  and fails as never run after a day, which is longer than any deploy takes.
- **A broadcast that says it stopped.** "WhatsApp could not be reached" is a connection that never opened: nobody was
  written to, the run waited through its waits and stopped. A run by email or text says its own provider
  (`wire_unavailable:email`, `throttled:sms`, `stalled:email` in `broadcasts.failure`; a code with no channel is WhatsApp's,
  as every run before 00298 was). "Its people or its number's credentials could not be read" is thirty minutes of failed
  reads. "The day's sending hours ran out" is a run that had waited (a throttle, a stall) and woke past the last hour, or
  a visit's run, whose words name the day; any other run still going at 21:00 is not stopped, it waits for nine the next
  morning by the business's clock and goes on from there. "The domain offers by email leave from is not verified"
  (`campaigns_domain_unverified`) is a run of offers that met a campaigns domain Resend does not verify: nobody was held
  for it, and the platform was paged. A campaigns domain Resend could not be asked about is not a stop: a run of offers
  waits a minute and asks again (paged as `campaigns_domain_unread`), and a visit's email, which leaves from the mail
  domain, goes. Each says how many got it, and sending it again reaches the whole list.
- **A yes by email is recorded only from a sender the provider proved.** Nothing is set for it. The proof is Resend's
  own verdict on each received email (`authentication` in its answer: SPF, DKIM and DMARC as its receiving server
  worked them out, which nothing in the message can write): DMARC passed, or DKIM passed by the From domain. An email
  with no verdict, or any other, proves nothing, and no yes by email is recorded from it (a STOP or an UNSUBSCRIBE by
  email never needs one). **Bookings by email stand on the same proof** (00345): a booking tool's email becomes an
  appointment only from a proved sender, in a workspace that named that tool, and a forward by hand only from a member
  whose own address is proved. Unproved, none is read: each lands in the Inbox as an automated email, and Settings ›
  Business keeps saying "Waiting for the first booking email". What the provider said is on the intake's own log line
  (`email_ingested`, its `sender_checks`): `null` there on every email is the provider handing no verdict over (on
  one email it is also what an email the provider no longer had reads as). A yes that was refused is
  `email_yes_unauthenticated`, the same request's line (`request_id`).
- **A statement that hangs.** The service role's statements end at 30 seconds (00283) and the client gives up on a request
  at 40, so a hung statement no longer holds a function until it is killed.

## Apply a migration

The practice every lane follows, since migrations began to reach production from branches before they merged
(28 Sep 2026): production applies a migration once, in number order, and its ledger must end where main's does.
The CLI keys an applied migration by its version and never reads the file again, so a file numbered below
production's head applies after the ones above it (an order no replay runs), and an edited or renamed one replays
differently on the next fresh database than it ran in production.

1. **Write it** at the number free when it lands: above main's head and above production's
   (`supabase migration list --linked` shows production's). Named for the schema change, re-runnable statements, a
   header of a few lines, `lock_timeout` set. Record it in the ledger:

   ```bash
   node tooling/scripts/checks/migration-ledger.mjs --record
   ```

   `supabase/migrations-ledger.json` holds every migration main carries with the checksum of its text, and
   `database/migrations.test.mjs` fails a file not recorded, a file at or below the ledger's head, a gap below the
   head the ledger does not argue, and any edit, rename or deletion of a recorded file. `database.yml` also holds each
   pull request's ledger to main's (`migration-ledger.mjs --base origin/main`): an entry main recorded may not change,
   which a folder and a ledger edited together would hide from the test. A number renumbered before it
   lands is recorded again by the same command, which also lets go of the reserved gaps the new number now covers.

   **An index on a table that is always being written** (`messages`, `events`, `calls`, `contacts`,
   `broadcast_recipients`, `jobs`) is built `CONCURRENTLY`, in a file that holds that one statement and nothing else,
   not even a `lock_timeout`: a plain build holds every write to the table for as long as it takes, and an index made
   concurrently cannot share a transaction, which is how the runner sends a file of several statements
   (`00355_a_person_s_runs_are_found_by_the_person.sql` is the shape; `database/migrations.test.mjs` fails any other).
   A concurrent build that is interrupted leaves the index behind marked invalid, and `if not exists` then skips it
   for ever. After the push, ask production for any:

   ```sql
   select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid where not i.indisvalid;
   ```

   None is the answer wanted. One named: `drop index concurrently public.<name>;` in the SQL editor, then run the
   migration's statement again there by hand (the ledger already holds its version, and the file is unchanged).

2. **Replay it locally**: `supabase db reset` (a worktree uses a stack of its own, `project_id` and ports moved, so it
   touches no one else's). Then regenerate what the schema drives, `corepack pnpm gen:schema-sets` and
   `corepack pnpm gen:db-types`, rebuild `dist` if a package changed, and commit the generated files. With the stack
   still up, `corepack pnpm gen:schema-snapshot` writes `supabase/schema.sql` (the schema it built); then
   `corepack pnpm gen:data-model` writes `docs/data-model.md` from that file, with no stack. Commit both: a plain run fails a stale
   data model or a stale function body in the snapshot, and the Database workflow's replay fails any other drift of the
   snapshot.
3. **Let CI replay it** from zero and run the database suites against it.
4. **Apply it to production** just before the merge, from the pull request's branch with `origin/main` merged into
   it, so the checkout holds every migration main has:

   ```bash
   supabase db push --linked --dry-run   # lists this pull request's migrations and nothing else; anything more, stop
   supabase db push --linked --yes
   ```

   Never `--include-all`: it applies a file below production's head, after the ones above it. If the dry run
   lists a file below the head, renumber it above, record it again and push again. A migration the new code needs is
   applied before the merge; one that tightens something the old code still writes (a CHECK, a dropped column, a
   renamed function) is applied after both apps have deployed. The migration's header says which.

5. **Merge**, and let both apps deploy.
6. **Compare** production's ledger with main's:

   ```bash
   supabase migration list --linked | node tooling/scripts/checks/migration-ledger.mjs --compare -
   ```

   It exits 0 when production holds every migration main carries and nothing main does not. Keyed `/api/diag`
   answers `migrations.head`, which must be main's head. `.github/workflows/migration-ledger.yml` runs the same
   compare every Monday and pages when main has been ahead of production for a day, once Ruben sets
   `SUPABASE_PROD_READ_URL`: a connection string for a role that reads the ledger and nothing else, made once in
   production's SQL editor (the password generated, never written down anywhere but the secret). The string is the
   project's session-mode pooler one, the role written `ledger_reader.<project-ref>`: a runner cannot reach the direct
   host, which has no IPv4 address.

   ```sql
   create role ledger_reader login password '<generated>';
   grant usage on schema supabase_migrations to ledger_reader;
   grant select on supabase_migrations.schema_migrations to ledger_reader;
   ```

## Roll back

**An app.** Vercel keeps every deployment. Promote the previous production deployment from the project's
Deployments page (or `vercel promote <deployment-url> --scope expectmeouts-projects`); it is live in seconds, no
build runs, and the code on `main` is unchanged. Then fix forward with a pull request. Each deploy's tag
(`gh release list`) names the commit to go back to.

**A migration.** Migrations are forward-only. Write a new migration that undoes the change, replay it locally, and
apply it the same way. Never delete or edit the applied file: the CLI keys applied migrations by version, and a
rewritten file replays differently on the next fresh database.

**What a rolled-back build meets.** The schema stays where it is, so an older build runs against a newer database;
that is why a migration is additive and a shape both apps agree on works whichever deploys first. Two things to know
while an older build is live:

- An older edge reads a config section with a field it does not know and keeps its brain
  (`tenant-config-forward-compat.test.mjs`).
- An older dashboard's settings save writes back only what it knows, so it drops a newer section or field (the
  scorecard's defect 19). While the dashboard runs an older build, nobody saves Settings.

**Rehearse it**, once a quarter and after any change to how the apps build, and write down when:

1. `gh release list --limit 2`: the release before the current one, its tag and commit.
2. On each Vercel project's Deployments page, the production deployment built from that commit: Promote to
   Production. The edge first, then the dashboard; either order works, and the edge is the one customers reach.
3. Confirm: `/api/version` on each project answers the older commit, `/api/health` on the edge 200, and keyed
   `/api/diag` the same `migrations.head` as before (nothing in the database moved).
4. Promote the current release's deployments back, and confirm `/api/version` answers its commit again.

Rehearsed: never yet (29 Sep 2026). The first rehearsal is Ruben's, with a deploy that carried no migration.

## Restore the database

Written on 8 October 2026 from the architecture review, which found no backup or restore page anywhere in `docs/`.
**Rehearsed: never yet.** Until it has been, every step below is a plan and every time a guess.

**What a restore brings back, and what it does not.** The database is the system of record: every workspace, person,
message, decision, job and event, the sign-in accounts (`auth`), the secrets the sweeps read (`vault`), and the
clocks (`cron.job`). A restore brings all of those back together, to one moment. It does not bring back: recordings
and other files (Storage is kept apart from the database's backups), anything a provider holds (a WhatsApp template's
review, a Twilio line, a Resend domain), or the two apps' environment (Vercel's, listed in each `.env.example`).

**Which backups there are** is a fact of the project's plan. Read on 9 October 2026 with
`supabase backups list --project-ref <ref> --experimental` (the project's Database, Backups page says the same), and
to be read again whenever the plan changes:

- Daily backups: one physical backup a night, at about 04:05 UTC, the last seven kept (the nights of 2 to 8 October
  were there, each complete). Everything since the newest is lost by a restore from it: up to a day.
- Point-in-time recovery: **off**. So the loss in a bad hour is up to a day of messages and bookings; on, it is
  minutes. It is the add-on that buys the difference, and the review recommends it for a product whose customers'
  conversations are its only memory. Turning it on is Ruben's: it is billed.
- The project is in `us-east-1`.

**When to restore, and when not.** A bad migration is undone by a migration (Roll back, above), and a bad write by a
script with its backup (Scripts that touch production, below): neither is a restore, and a restore to undo either
takes every workspace back with it. A restore is for a database that is gone, or wrong in a way nothing narrower
reaches: a dropped table, a mass update with no backup file, the project lost.

**How.** Prefer a copy to an overwrite, so the damaged database is still there to read and to compare with:

1. **Stop the writers**, so nothing more is written to a database that is about to be left behind, and write down
   the minute. How is settled at the first rehearsal and written here; it has not been tried. The candidates: pausing
   each Vercel project from its settings, if the plan offers it (a provider whose webhook is refused sends it again
   for hours, so a paused edge loses no message that arrives after the restore point); failing that, removing the
   edge's production domain for the length of the restore.
2. **Restore to a new project** from the Backups page (a daily backup, or the minute just before the damage with
   point-in-time recovery), if the plan offers it. In place is the fallback: it overwrites the project, and everything
   written since the chosen moment is gone the moment it starts.
3. **Check the copy before anything points at it**: `supabase migration list` against it ends at main's head
   (`migration-ledger.mjs --compare`); the newest `messages.created_at` and `events.created_at` are the moment
   chosen; `select count(*) from tenants` is what it was; `cron.job` holds the sweeps and
   `vault.decrypted_secrets` names the edge's key and base URL.
4. **Point the apps at it**: both Vercel projects' `SUPABASE_URL` and keys (a new project has new ones), the
   Supabase Auth settings the old project held (site URL, redirect URLs, the Google provider, the SMTP sender), and
   the base URL the clocks call (`vault`, 00018: a copy keeps the original's, which is right only when the edge's
   address did not change). Redeploy both, the edge first.
5. **Bring the writers back** the way they were stopped, then read `/api/cron/health`, the jobs ledger (Read the
   jobs ledger, above) for what was due while it was down, and the Inbox of one real workspace.
6. **Tell the workspaces** what window was lost, in their own words: a message a customer sent in it is gone from
   the Inbox though the customer still has it on their phone.

**Rehearse it** before it is needed, on a copy that nothing points at: step 2 and step 3 alone, timed. Write the
date, how long the restore took and what step 3 found here.

**A workspace, not the platform.** The levers in `docs/system-prd.md` S-23:
silence one receptionist (`tenant_channels.status = 'disabled'`), hold one
person, cap a workspace, stop a queued reply. None of them needs a deploy.

**What to look at first.** `events` is the append-only ledger of what
happened, `decisions` of what people did, `escalations` of what needed a
person. `sweep_status` and `/api/cron/health` say whether every clock is
running. The edge's logs are structured JSON with the tenant id and the tail
of the message id on every line.

## Scripts that touch production

Every writing script in `tooling/scripts/ops` is a dry run by default, writes a
JSONL backup first, is idempotent, and takes `--apply` to mean it. Read the
header of the script before running it; each says what it needs and what it
refuses. Their statements go through PostgREST as the service role, which ends
a statement at 30 seconds (00283): a script that must run one longer, a
workspace's whole history deleted at once, says so in its header and is run from
psql after `set statement_timeout = 0`.
