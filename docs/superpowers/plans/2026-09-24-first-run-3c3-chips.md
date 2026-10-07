# The first run, PR 3c-3: what it offers and the languages it speaks, a tap each

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Check, the services Google's category suggests and the common languages are chips. A tap adds one, a tap
on one already there takes it out with an Undo, and the Business tab's own editors are one press away (canvas R2: "Tap
what you offer. A few is enough.", "Languages it answers in").

**Architecture:**
- **The suggestions are contracts'** (`service-suggestions.ts`): a table keyed by Google's primary type (Places API
  "Table A" names, e.g. `moving_company`, `nail_salon`), with the near types sharing one entry (`hair_care` is
  `hair_salon`, `massage_spa` is `spa`, `dental_clinic` is `dentist`, `gym` is `fitness_center`). A type with no entry
  suggests nothing. The salon lines carry `trade-word:`, since the table only ever reaches a business Google lists as
  that trade (trade-neutral.test.mjs).
- **The languages list moves to contracts** (`COMMON_LANGUAGES`), so the Business tab's languages box and the chips
  offer one list.
- **What is on and off is contracts'** (`checkChipsOf`): the chips are the suggestions, each on when a service of that
  name is listed (foldName, the one rule for "the same name"); the languages are the common ones, each on when chosen,
  and any chosen language the list does not name, on. Words for each toast are contracts'.
- **Setup's read carries the type** (`google.type`, from `google_listings.facts.primary_type`), beside `unsure`.
- **The page** (first-run.jsx): chips under the services row, and the languages row's fold drawn with the chips as its
  rest (BtFold's `rest`), so "+ Other" opens the Business tab's own languages editor and "+ Your own" its services
  sheet. A tap saves through the tab's one saver as a one-key change of the profile; a removal's toast carries Undo,
  which puts the row back, whole, where it was. A role that may not change the business sees the chips and cannot
  press them.

**Tech Stack:** TypeScript contracts, the setup read, classic-script JSX pages, `node:test`, committed dists. No
migration, no route, no environment variable.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `feat/first-run-chips`, off `origin/main` at `95cd0b27`.

## What is not in this PR

- The booking link found on the website (3c-4).
- Services with a duration or a price from a chip: a chip adds the name; the sheet is where the rest is written.

## Tasks

### Task 1: The suggestions and the chips, in contracts

**Files:** `packages/contracts/src/service-suggestions.ts` (new, exported from index.ts); `first-run.ts` (the chips'
words); `tooling/scripts/tests/service-suggestions.test.mjs`.

- [ ] Test:
  - `serviceSuggestionsOf("moving_company")` names the moves; `"hair_care"` is `"hair_salon"`'s list; an unknown type
    and null are none.
  - Every entry's names are unique by `foldName` and fit the schema's service name.
  - `checkChipsOf({ type, services, languages })`: a suggestion is on when a service of that name is listed, however
    it is written ("local move" and "Local move" are one); the languages are the common ones plus any chosen one the
    list does not name, each on when chosen; none past the profile's caps offered as addable (`full`).
- [ ] Code as tested.

### Task 2: Setup's read carries the type

**Files:** `packages/contracts/src/google.ts` (`SetupGoogleFacts.type`); `apps/dashboard/src/server/setup.ts`;
`setup.test.mjs`.

- [ ] Test: `setupDtoFor` sets `google.type` to the listing's primary type, and null with no listing or no facts.
- [ ] Code as tested.

### Task 3: The languages box and the chips offer one list

**Files:** `business-tab-answers.jsx` (reads `COMMON_LANGUAGES` from the bridge); `legacy-bridge/business-tab.ts`
(publishes it); the bridge and answers tests.

- [ ] Test: the box offers contracts' list, as before, word for word.
- [ ] Code as tested; `data/business-tab.js` rebuilt for the mockup.

### Task 4: The chips on Check

**Files:** `first-run.jsx`, `business-tab-answers.jsx` (`BtaLanguagesRow` takes an optional `rest`),
`first-run.css`, `first-run-check.test.mjs`.

- [ ] Test (drawn over the Business tab's harness):
  - a mover's Check offers its suggestions; a tap adds the service through the saver, and its chip is on;
  - a tap on a chip that is on takes the service out, and the toast's Undo puts it back where it was, whole;
  - the languages are chips, a tap adds one, and "+ Other" opens the tab's own languages editor;
  - "+ Your own" opens the services sheet;
  - a role that may not change the business cannot press a chip.
- [ ] Code as tested.

### Task 5: The gates, the look, the review, the PR

- [ ] Bump `?v=`; rebuild the dists; typecheck, lint, format:check, the route types and the whole suite.
- [ ] Look at the chips on the probe, desktop and phone.
- [ ] One review round and one fix round. Merge main, open the PR, watch CI, squash-merge, check main's run.

## As built (24 September 2026)

Tasks 1 to 5 as planned, with these differences:
- **The module is `check-chips.ts`**, not `service-suggestions.ts`. It holds the suggestions and the chips' view model
  (`checkChipsOf`) together, and `first-run.ts` publishes the builder (`FIRST_RUN_HELPERS.chips`). Its test is
  `check-chips.test.mjs`.
- **More of Google's near kinds share a list** than the plan's four: `hair_care`, `beautician`, `massage`,
  `massage_spa`, `dental_clinic`, `medical_clinic`, `medical_center`, `gym` and `pet_boarding_service`.
- **The language chips stand in the languages row's place** (BtFold's `rest`), since they name every language the
  record holds. The service chips sit under the services row, which also counts the services no chip names.

**Fixed in the review round** (one whole-branch review, standards and spec, then one fix round):
- **One test of "the same name" on a list:** `sameListed` (availability.ts, beside `foldName`). The chips and the
  Business tab's languages box both ask it, the box through the bridge. The box compared trimmed, lower-cased words,
  so a language stored as "Haitian Créole" turned the chip "Haitian Creole" on while the box still offered it.
  facts.ts `sameName` stays the business name's test, which lets punctuation go too.
- **A chip saves as the tab's own editor saves its list:** the fold's draft as the next save finds it (`draftOf`),
  sent as the fold's one job (`foldJob`). That job writes the list with the tab's writers and refuses to go when the
  list moved under it. A removal takes out every row of that name, and its Undo puts each back at its place, whole.
- **The chips are gated** with `window.gate("settings", …)`. A role that may not change the business sees them and is
  told why at the press; "+ Your own" and "+ Other" stay out of its sight.
- **At the cap, no chip that is off is drawn.** The ones on stay, over contracts' sentence for the cap
  (`profileRefusal`), and the first run's own words for it are gone.
- **Every common language is a chip** (the plan's "the common ones"), not the first six.
- **A chip that is on is outlined in ink**, with its tick, as canvas R2 draws it; it was filled.
- **BtFold's `rest` no longer marks a fold whose row holds its fact as stating nothing.** "+ Other"'s editor, opened
  over languages the record has, closes on an untouched Save, as a row's does. The create card's (no fact in its row)
  is judged as before.
- **The beauty salon's `trade-word:` note** names the beautician too, whom that list reaches.
- **A listing whose facts say nothing gives no kind** (setup.test).
- **Left as it is:**
  - "Removed …" is the first run's word, in contracts, as every word on it is; the tab's pages keep their own inline.
  - Each list's gate says what the tab's rows say ("change your services", "change the languages it speaks"), written
    where the chips spread it, as every gate names its act.
  - A tap refused because a colleague's save landed between the tap and its send says the fold's words ("Close it
    and open it again").
