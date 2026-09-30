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
["Date"], now })`), and one that builds an instant gives it its offset.

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
money lock). `database/fake-db-agrees.db.test.mjs` sends the same requests to the replayed stack and to the double and
fails when the two answer differently. A fixture makes its rows with `tooling/scripts/tests/_rows.mjs`, one factory
per table for the ten the suite seeds most: every column the table has, so a migration that adds a NOT NULL column
breaks one factory, not forty fixtures. After a migration, `corepack pnpm gen:db-types` writes the types and the unique
keys from the stack, and `database/unique-keys.db.test.mjs` fails a stale file. The database suites run in parallel
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

Four records. `nightly` is the seeded `chanlytics-e2e` workspace, DERIVED from
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

`record` starts the harness above for each record and opens each route at 1440 by 900 and at a phone's 390 by 844 with
a coarse pointer, dark and light: the salon's pages, a seeded person and every Settings pane; the pipeline's People,
Pipeline, Leads and person's page; the nightly's empty Business pane; the kit's gallery, which draws every class of the
kit (a recording made before the gallery joined is not compared with one after: exit 2). Then eleven scenes, each a
route and a press or two (a click, a hover, a focus or a key): a menu open, a Confirm, a toast, the person's fold open
in place, the menu's danger item under the pointer, a button focused by a key, a record sheet, a combobox's list open
in a fold, a segmented control with its picked segment, a switch that is on, and a tooltip. Motion is stopped before a
page draws, and its clock stands still at one moment and moves only as the recorder steps it, ten simulated seconds a
route, so a timer's work is in every recording or in none. It writes every element's edges, to 1/64 of a pixel, and every computed longhand, a
`::before`, `::after`, `::marker` and `::placeholder`'s included, and which rules of each stylesheet the pages drew. It
refuses a page that did not draw what it opened: an empty root, a "No surface at" card, the wrong theme, an error the
page threw, a stylesheet or a font that did not load or answered with an error, 4xx or 5xx (a page drawn without its
rules or in a fallback face is another page), or a request that never ended. A full recording takes ten to fifteen minutes.

`compare`, and `record` with `--against`, exits 0 when the two are equal: every edge within an eighth of a pixel (the
browser once laid one line of text out 2/64 of a pixel apart in two recordings of one tree), a pseudo-element's laid-out
lengths held the same way, and every other value the same. It exits 1 with the differences, what is gone or new before
what moved (`--limit N` lists more), and 2 when the two were recorded differently (another browser, other pages,
longhands or scenes) or the command failed.
Either way it names the rules the change touched that no page of either tree drew: nothing here proves those, so the
pull request names them with how they were checked, says what was compared, and that it was equal.

What it cannot prove, so a pull request does not claim it:

- a state no scene reaches: hover and focus but the scenes', a menu, sheet, fold or toast other than theirs, anything
  after typing;
- a route it does not record, and the real surfaces the mockup stubs: Today, the Inbox, the Calendar and Live draw the
  seeded page, and Leads waits and then says it could not be read;
- what the three's canvas draws, or any canvas;
- motion: animations and transitions are stopped, so a change to one is not seen;
- text: what an element says is not recorded, only its style and where it stands;
- a width between 390 and 1440, and the 900px and 720px breaks among them;
- an edge that moved an eighth of a pixel or less.

It needs the network: the page loads React and Babel from unpkg and its fonts from Google. Record both runs on one
machine, in one sitting; a new browser is a different recording, and `compare` says so rather than compare.

### Add a look

A look is a set of token values (`docs/plans/2026-09-28-the-interface-kit-and-its-looks.md`, §3.1 and §3.2). Classic,
what members see, is the roles block of `apps/dashboard/src/legacy/styles/tokens.css` itself. Glass, the canvases'
finish, is drawn, and not yet offered: steps 1 to 4 below were its 5.1 to 5.3 in the plan, and steps 5 and 6 will be
its 5.5 and 5.6. A third look also adds its name to `LookPref`, `LOOK_OPTIONS` and `isLookPref` in
`packages/contracts/src/shell/chrome.ts` (the head's script reads the list), to the list's pins in
`tooling/scripts/tests/shell/chrome.test.mjs`, to the gallery's `?look=` and `l` key
(`tooling/scripts/e2e-harness/kit-gallery.mjs`), and to the looks `e2e/kit/kit.spec.ts` runs.

1. **The blocks.** `[data-look="<name>"]` after the roles block, and `[data-look="<name>"][data-theme="dark"]` after
   that for its dark side, as Glass's are. They set the roles: the surfaces' fills, edges, radii and depths, the
   controls, the actions. Where the look's colours differ, they also set the theme's own (`--bg*`, `--ink*`, `--line*`,
   the tones, the accent), which many kit rules read directly. A colour the first block sets is set again in the
   second: both come after the themes' blocks, so otherwise the first would hold in both themes. They set no scale,
   and no token a kit rule keeps for itself.
2. **Classic keeps its values.** A role the look needs that nothing reads yet comes with its reader in
   `apps/dashboard/src/surfaces/kit/kit.css`, and with Classic's value in the roles block: the one that draws what the
   rule drew before. For a blur, that is `none`, read through `var()` in both `backdrop-filter` and
   `-webkit-backdrop-filter`. The build drops `backdrop-filter: none` written beside its prefixed twin (#929), and
   cannot drop a `var()`. `blur(0)` is not `none`: any value but `none` makes its element a containing block for its
   fixed children, and a stacking context. A translucent fill falls back to an opaque one under
   `@supports not (backdrop-filter: blur(1px))` and under `prefers-reduced-transparency: reduce`.
3. **It moves nothing in Classic.** The recorder draws every page in Classic, the look the harness's documents stamp
   (`TWEAK_DEFAULTS` in `apps/dashboard/src/legacy/Chanlytics.html`, and the gallery without `?look=`), in both
   themes. A recording from before the change and one after it are equal ("Prove a style change", above), backdrop
   filters included.
4. **It draws.** The gallery shows it in both themes, at a desk and on a phone: `?theme=light&look=<name>`, or `l` on
   the page ("See the kit", above). `e2e/kit/kit.spec.ts` runs every width, theme and look, and holds each entry to
   the tokens it reads there. It compares a twin with its source under Classic alone, since a source reads the theme's
   colours where the kit reads the look's roles. The pull request shows the gallery in the four pairings, at both
   widths.

   Two readers of the tokens stand outside the gallery. The mascot reads the document's `--bg`, `--ink`, `--accent`
   and `--accent-fg`, and reads them again only when `data-theme` changes
   (`apps/dashboard/src/legacy-bridge/mascot/driver.ts`). The charts' palette was validated against the surfaces it
   sits on (`apps/dashboard/src/legacy/styles/charts.css`, whose header says how). A look that changes those is
   looked at on them, and the palette's validator runs again.

   To see the look on the app itself before it is offered, set `look` to its name in the object this device keeps
   under `chanlytics-os-prefs` in local storage, and reload: the head's script stamps it before first paint.

5. **Offered.** `LOOK_OFFERED` in `chrome.ts` turns true, and the account menu draws Look under Theme. The flag's pins
   change with it (`chrome.test.mjs`, and `e2e/shell/sidebar.spec.ts`, which expects no Look while it is off), and
   the packages' `dist` is rebuilt and committed. Ruben walks it on production.
6. **The default.** `DEFAULT_LOOK_PREF` becomes the look: every device that never chose one draws it from its next
   load, since a device keeps a look only once it is chosen (`apps/dashboard/src/legacy-bridge/device-prefs.ts`), and
   a member who chose Classic keeps it. `chrome.test.mjs` and `tooling/scripts/tests/shell/theme-boot.test.mjs` pin
   the default, and `apps/dashboard/app/layout.tsx` stamps it on the document the server sends.

## What CI proves

| Workflow                                   | On                                                                                                | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`, Secret scan                      | every pull request and push to main                                                               | No secret in what the pull request adds                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ci.yml`, Typecheck                        | same, and a merge queue's commit                                                                  | On a pull request, its title first (`tooling/scripts/checks/pr-title.mjs`); no production dependency with a high or critical advisory (`pnpm audit --prod`) or under a licence we may not ship (`tooling/scripts/checks/licences.mjs`); `dist` matches the sources; typecheck; lint, which includes the layer boundaries and the edge's env and log rules; dead exports (knip); the formatting check; the node suite; the dashboard builds the way Vercel builds it; the workspace route's bundle budget    |
| `ci.yml`, Mobile                           | every pull request, push to main and merge queue's commit                                         | The phone app's types, lint, Expo's doctor (the SDK's patch drift warns) and a Metro bundle for each platform                                                                                                                                                                                                                                                                                                                                                                                               |
| `ci.yml`, Node suite, Pacific/Auckland     | every pull request and push to main                                                               | The node suite with the clock at UTC+12 or +13, where a rule that reads the viewer's zone gives the wrong day. Not required, and not a merge queue's; green since the tests lane (29 tests failed under it on 29 Sep 2026), so a failure fails the run                                                                                                                                                                                                                                                      |
| `ci.yml`, What landed keeps the title rule | every push to main                                                                                | Each commit the push landed: its subject keeps the title rule and carries its `(#N)`, and it is not a merge commit. A break opens an issue, since what landed cannot be undone                                                                                                                                                                                                                                                                                                                              |
| `database.yml`, Migrations replay          | every pull request, push to main and merge queue's commit                                         | Every migration from zero on a fresh Postgres; the closed sets and `database.types.ts` regenerate to what is committed; the database suites pass against that stack. It replays only when database paths changed: on a pull request, in its diff; on main, since main's last replay that passed, so a cancelled or failed one is made up by the next push (`tooling/scripts/checks/replay-range.mjs`). On a pull request it also holds the migration ledger to main's: every entry main recorded, unchanged |
| `nightly-e2e.yml`                          | 09:00 UTC; by hand, the credential-free specs alone (against an address that needs no bypass too) | The integration suites against real Postgres and the browser suite against production, in the suite's own workspace; Ask's day against its lines. One rolling issue each, closed by the first green run; the second red run in a row pages                                                                                                                                                                                                                                                                  |
| `release.yml`                              | every push to main                                                                                | A tag `vYYYY.MM.DD-<sha>` and a release whose note lists the pull requests merged since the tag before it                                                                                                                                                                                                                                                                                                                                                                                                   |
| `migration-ledger.yml`                     | Mondays, and by hand; off until `SUPABASE_PROD_READ_URL` is set                                   | Production has applied every migration main carries, and nothing main does not; a day's disagreement keeps an issue open and pages                                                                                                                                                                                                                                                                                                                                                                          |
| `preview-smoke.yml`                        | a dashboard preview ready; off until the variable `PREVIEW_SMOKE` is `1`                          | The credential-free specs against the pull request's preview                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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

- `Require branches to be up to date before merging` (`strict: true`), or a
  merge queue (both workflows answer `merge_group`): two green pull requests
  can no longer land a red main together, as they did three times on 28 Sep.
- `Do not allow bypassing the above settings` (`enforce_admins: true`).
- `Mobile (typecheck, lint, doctor, bundle)` among the required checks.
- `Require review from Code Owners` once reviews are posted as GitHub reviews
  (`.github/CODEOWNERS`).
- Squash only: `allow_merge_commit: false` and `allow_rebase_merge: false`,
  with the squash commit's title from the pull request's title
  (`squash_merge_commit_title: PR_TITLE`), so the subject is the checked title.

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
the pages are", says the 75th percentile of each over the last seven days (00255). That is the number to hold the
bundle's budget against (`check:bundle`): LCP for the page drawn, INP for a tap answered.

1. **Read it** on the back office, or in SQL as the service role: `select * from page_vitals_p75();` gives one row per
   metric over every page (`page` null), then one per metric and page.
2. **An empty card** after the migration is applied means no page has been hidden since: open a workspace, switch
   tabs, and read it again.
3. **Watch** `page_vitals_not_kept` on the dashboard's logs: the table refused a load's reports, which on a deploy
   ahead of its migration is expected, and otherwise is the database.

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
refuses.
