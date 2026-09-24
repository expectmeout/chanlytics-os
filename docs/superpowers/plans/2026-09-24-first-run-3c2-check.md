# The first run, PR 3c-2: Check

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first run's business step becomes Check (canvas R2, V2, P2). Google's facts become the receptionist's
first config. The owner then checks what the receptionist answers from, in the Business tab's own rows, answers how
customers buy, and moves on with "Looks right".

**Architecture:**
- **The first receptionist is built on the server.** Google's facts (`google_listings.facts`) never reach the browser
  (`LISTING_COLUMNS` leaves them out), so one route, `POST /api/v1/settings/receptionist`, builds the first config from
  what is known and writes it only where none is set up:
  - the name is the resolver's own answer (`resolveFacts`): the listing's, else the workspace's;
  - the hours are Google's (`hoursFromGoogle`), with each closed day stored as closed and the days the record cannot
    hold left out;
  - the address is the listing's, unless Google says the business goes to its customers (`service_area_only`);
  - the website is Google's when the schema takes it;
  - the prompt and the three messages are the product's own (`newReceptionistDefaults`).
- **Every creation is an owner's press.** Find's "Yes, this is us" links the listing, then asks for the first
  receptionist. "We're not on Google" does the same once Google is put off. Check itself offers the press where there
  is still none: a listing linked before this PR, a failed ask, or a deployment that cannot search Google. Nothing is
  written because a page was looked at.
- **Check draws the Business tab's own rows.** The rows it needs move out of their cards into components the cards
  and Check both draw, so the two screens can never disagree:
  - hours;
  - timezone;
  - address;
  - website;
  - booking link;
  - the rules it always keeps (the price rule, shown as its default);
  - services, with the services sheet;
  - languages.
  How customers buy is the Business tab's own choice, drawn open and saved at once through the workspace's door.
  "Looks right" sends the answer shown if none is stored, as the create card does.
- **The sheets open over the first run.** The record kit portals its sheets into `.app-root`, which the first run's
  full-screen shell does not have. It portals into `.fr-shell` there.
- **What Check asks about.** Setup's read carries the days whose hours Google gives in a form the record cannot hold
  (past midnight, around the clock) and the record does not state. Check names them under the hours.
- **Words.** Every sentence Check says is contracts' (`first-run.ts`). The receptionist card's "Books with" follows how
  customers buy.

**Tech Stack:** TypeScript contracts, a dashboard route and the bridge, classic-script JSX pages, `node:test`,
committed dists. One new route (route policy, typed client). No migration, no environment variable.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `feat/first-run-check`, off `origin/main` at `14d1013f`.

## 3c in four parts

1. **3c-1** (#994, merged): proposal sellers save with no link, and the words follow.
2. **3c-2 (this plan), Check:** Google's facts become the first config, and the Business tab's rows are on the first
   run. This covers how customers buy, languages, the price rule, V2 (not on Google) and V3 (a service area).
3. **3c-3, suggestions:** services suggested from the Google category and languages, as chips a tap adds (canvas R2's
   "Tap what you offer").
4. **3c-4:** the booking link found on the business's website.

## What is not in this PR

- The chips (3c-3). Check's services and languages are the Business tab's rows until then: "Add one" opens the same
  sheet and fold the tab opens.
- Google's time zone. The workspace's zone is set at sign-up from the device, and Check shows the Business tab's zone
  row under the hours, so a wrong one is seen and changed there.
- A service-area business's words beyond not storing an address. The listing's region is still what the resolver
  gives when the record holds none, as it is today.
- The Business tab's create card, which stays the tab's own way to set up a receptionist by hand.

## Tasks

### Task 1: What is known, in contracts

**Files:**
- `packages/contracts/src/google.ts` (`listingFactsOf`);
- `config.ts` (export one day-name table, `DAY_NAMES`, and alias the second copy to it);
- `first-run.ts` (`firstReceptionistOf`);
- `tooling/scripts/tests/first-run.test.mjs`.

- [ ] Test:
  - `listingFactsOf` reads what the edge stores, returns null for `{}` (a row linked before the details read), and
    drops a malformed period rather than throwing.
  - `firstReceptionistOf` with a listing: the listing's name, Google's hours with each closed day stored as `{}`, the
    address and the website. The prompt and messages are the product's, and the result passes
    `TenantConfigWriteSchema`.
  - A service-area business stores no address. A period past midnight leaves its day out. Around the clock stores no
    hours. A website the schema refuses is left out.
  - With no listing: the workspace's name and nothing else. With no name at all: null.
- [ ] Code as tested. The name comes from `resolveFacts(null, known).business_name` (one derivation), trimmed to what
  the schema takes. The hours are `hoursFromGoogle`'s, and a day Google lists no period for is closed, unless it is
  unsure.

### Task 2: What Check reads, in Setup

**Files:** `packages/contracts/src/setup.ts`; `apps/dashboard/src/server/google.ts` (`listingFactsFor`);
`apps/dashboard/src/server/setup.ts`; the setup tests.

- [ ] Test:
  - `setupSteps` gives `check: { receptionist, listed, unsure }`, where `receptionist` is `"none"`, `"set"` or
    `"broken"` from the business facts, `listed` says a listing is on record, and `unsure` is the DTO's days.
  - `setupDtoFor` sets `google.unsure` to Google's unsure days that the record does not state (a day the record holds,
    even closed as `{}`, is not asked about).
- [ ] Code:
  - `SetupGoogleFacts.unsure?: Day[]`.
  - `listingFactsFor(db, tenantId)` selects `name, address, facts` and parses them with `listingFactsOf`.
  - `setupDtoFor` reads it beside `listingFor`, and computes the days from `hoursFromGoogle` and the parsed profile.

### Task 3: The route that sets the first receptionist up

**Files:**
- `apps/dashboard/src/server/settings-changed.ts` (the `settings.changed` event, moved out of the PUT);
- `apps/dashboard/src/server/first-receptionist.ts`;
- `apps/dashboard/app/api/v1/settings/receptionist/route.ts`, and the PUT in `settings/route.ts`;
- `tooling/scripts/tests/route-policy.json` and the typed client (`gen-route-types.mjs`);
- `tooling/scripts/tests/first-receptionist.test.mjs`.

- [ ] Test (the route through `run`, over `fakeDb`):
  - The policy: a write, the workspace's, owners only, the settings rate.
  - With a listing and no brain, it writes the brain from Google's facts at the next version, records
    `settings.changed` with the fields, and answers `{ made: true }`.
  - With no listing, it writes the workspace's name and the product's prompt and messages.
  - With a brain, nothing is written: `{ made: false }`.
  - A config that does not parse is refused in words, and nothing is written.
  - If the version moved and a colleague has set one up, the answer is `{ made: false }`; if nothing was set up, it is
    the PUT's conflict words.
- [ ] Code as tested. The built config goes through `TenantConfigWriteSchema`, and the write through
  `putTenantConfig`. The PUT and this route record the change with the one helper.

### Task 4: The bridge

**Files:** `legacy-bridge/setup.ts` (`__setup.receptionist()`), `refresh-map.ts`, and their tests.

- [ ] Test: `receptionist()` posts to the route and answers `{ ok, made, message }`. The refresh map re-reads what a
  settings PUT re-reads.
- [ ] Code as tested.

### Task 5: The Business tab's rows, drawn by either screen

**Files:** `business-tab-who.jsx`, `business-tab-open.jsx`, `business-tab-offer.jsx`, `business-tab-answers.jsx`;
`components/record-fold.jsx` and `record-sheet.jsx`.

- [ ] Move each row Check draws into a published component that takes `{ brain, base, canEdit, flash, saver }` and
  that its card draws in its place:
  - `BtAddressRow`, `BtWebsiteRow` and `BtBookingLinkRow` (who);
  - `BtHoursRow`, with an optional `note` under it (open);
  - `BtServicesRow` (offer; the row `BtwServicesRow` was);
  - `BtLanguagesRow` and `BtRulesRow` (answers).
- [ ] The kit portals a sheet into `.app-root`, else `.fr-shell`.
- [ ] Test: the Business tab's own tests pass unchanged. Nothing it draws moved.

### Task 6: Check

**Files:**
- `packages/contracts/src/first-run.ts` (the words, `FirstRunVM.check`, the heading, the lead, `onward.held`, and the
  card's `sellsBy`);
- `pages/first-run.jsx`;
- `styles/first-run.css`;
- `tooling/scripts/tests/first-run.test.mjs`, `first-run-page.test.mjs`, and a new `first-run-check.test.mjs` drawn
  over the Business tab's harness.

- [ ] Test (view model):
  - The business step is Check whenever Find is not shown and the config parses.
  - A broken config keeps Setup's rows, whose facts row asks for the repair.
  - With a listing on record, the heading and lead are "Here's what we found"; without one, "Tell us the basics".
  - No receptionist: an owner is offered the press, and anyone else is told an owner sets it up.
  - "Looks right" is the onward, held with the facts row's own sentence until the step is done.
  - `unsure` names the days, or every day.
  - "On Google after all? Find it" appears only where Google can be searched, nothing is linked, and an owner is
    looking.
  - The card's "Books with" row says "Takes their details" for a business that quotes with no link. Leaving out
    `sellsBy` is a TypeError.
- [ ] Test (the page):
  - Check draws the Business tab's rows and the choice of how customers buy.
  - A tap on the choice saves through the workspace's door.
  - The booking link row's words follow the answer.
  - "Add one" on services opens the services sheet.
  - The note under the hours names the unsure days.
  - With no receptionist, the press calls `receptionist()`, and a refusal is said.
  - Find's "Yes, this is us" and "We're not on Google" each ask for the receptionist.
  - "Looks right" is held with the sentence until the step is done. Once pressed, it sends the answer shown when none
    is stored, and goes on once that is taken.
- [ ] Code:
  - `FrCheck` draws the rows over the settings read's brain. A brain not read yet says "Reading…", and a settings read
    that failed offers its retry.
  - The first run holds the ask for the receptionist (`making`) and lends it to Find and Check. It subscribes to the
    tab's saver and doors, as the Business tab does, and draws the services sheet last.

### Task 7: The gates, the look, the review, the PR

- [ ] Bump `?v=` for each edited page and style in `Chanlytics.html`.
- [ ] Rebuild the dists, keeping only real diffs. Run typecheck, lint, format:check, the route types and the whole
  suite.
- [ ] Look at Check on the probe, on a desktop and a phone: a listing's facts, the basics, a sheet open over it.
- [ ] One review round and one fix round. Merge main, open the PR, watch CI, squash-merge, and check main's run.

## As built (24 September 2026)

Tasks 1 to 7 as planned, with these differences:
- **The builder has its own module**, `contracts/first-receptionist.ts`, not `first-run.ts`. `google.ts`'s imports reach
  back to `first-run.ts` through the leads, so the builder sits where nothing it imports imports it.
- **The first run scrolls.** The probe showed that the app holds `html` and `body` to the viewport (legacy.css) and
  that the first run's shell never scrolled itself, so anything taller than the screen was cut off. `.fr-shell` is the
  page's scroll now, and a step's own move opens the next step at its top.

**Fixed in the review round** (one whole-branch review, standards and spec, then one fix round):
- **Check stays on screen until Looks right.** At `#/start` the first run opens where the workspace is. When a
  service was saved in the sheet, the business step was done and the page went on to the phone under the owner, so
  Looks right was never pressed and the answer to how customers buy was never sent. Once Check is drawn, the business
  step is asked for by name until the owner moves.
- **A role that may not change the business** goes on with Looks right and sends nothing: the workspace's door is
  owner-only, and a refusal left the step with no way on.
- **Google's facts reach a receptionist set up before the link.** Set up by hand, or with the name alone after "We're
  not on Google" and then Find, it now takes what the listing says where it states nothing (`googleFillsOf`), never
  over what is there. The route answers `{ wrote }`.
- **One test of whether a receptionist is set up:** `receptionistOf(parsed)` in `config.ts`, which the setup read (as
  `business.receptionist`) and the route both ask.
- **The booking link row is drawn for a business that books** (the spec's "only for businesses that book"), and for
  one that quotes only while it has a link to show. In its place, the row's own words say what it does without one.
- **Words.** The press no longer promises "hours, address and website", which a service-area listing, or one Google
  said little about, cannot back. The failed read's words are contracts'.
- **Standards:**
  - `BtoHoursRow`, `BtaLanguagesRow` and `BtaRulesRow` carry their files' prefixes and are published under the plain
    names;
  - the zone and services rows own their gates;
  - one portal root for the kit (`recPortalRoot`);
  - one cascade for a step's heading, lead and onward;
  - the name's cap is the schema's own;
  - gap, not margins;
  - a made-up street in the fixtures;
  - the ledger and setup-read pins are deleted, now that tests run that code (facts.test's baseline fell by one).
- **Left as it is:** new code reads `tenants` and `google_listings` with the session client from `src/server`, as the
  rest of the dashboard's server code does (`server/google.ts`, `server/deals.ts`). There is no repository for either
  in `packages/db`.
