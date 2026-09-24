# The first run, PR 3a: Find

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first step of the first run opens on Google's answer for the name typed at sign-up ("Is this Luna
Studio?"), the owner links their listing with one press or says they are not on Google, and a Google sign-up names
the business on the screen before it.

**Architecture:**
- **Contracts.** `first-run.ts` decides when the business step is Find: an owner, Google findable here, no listing,
  and the Google row not put off. It also holds every word of Find. Setup's Google row stops opening a finder of
  its own and names the step, so there is one finder.
- **The search.** It learns the kind of place (Google's `primaryTypeDisplayName`, the same Pro tier as the name it
  already asks for). With no words, it falls back to the workspace's name when the receptionist has none.
- **The page.** `first-run.jsx` draws Find in place of the step's rows. Linking and putting Google off go through the
  bridge's existing verbs (`__google.find`, `__google.link`, `__setup.later`). The page's own toast outlives the
  screen it came from.
- **V1.** A first workspace with no name kept from sign-up (a Google sign-up) is asked "What's your business
  called?" on the create screen, and lands on Find, already searched.

**Tech Stack:** TypeScript (contracts, channels, the edge, dashboard routes), classic-script JSX for the legacy pages,
`node:test` (`corepack pnpm test`), committed `packages/*/dist`. No new dependencies and no migration.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `feat/first-run-business`, off `origin/main` at
`1238fbe4`. Spec: `docs/superpowers/specs/2026-09-24-first-run-design.md`. Canvas boards: R1, P1 (Find) and V1
(signed up with Google).

## PR 3 in three parts

The spec's PR 3 ("Find and Check on the Business tab's record kit, Google's facts, category suggestions, how
customers buy, decision 2") ships as three pull requests, each working on its own in either deploy order:

1. **3a, Find (this plan).** The search already run, one finder, V1.
2. **3b, decision 2 (the reading half).** `BrainConfigSchema` accepts a receptionist with no booking link. The
   prompt, the voice tools and the Business tab's words handle it. Nothing saves one without a link yet.
   - The staging is why this is its own PR. Today a config with no link fails to parse, Setup calls it broken and
     the edge silences the receptionist (`apps/edge/lib/tenant-runtime.ts`). So the reading side has to ship before
     any writer does.
3. **3c, Check.** Google's facts reach the page and become the receptionist's first config. The screen shows the
   Business tab's own editors, "How do customers buy?" (`tenants.sells_by`), the services Google's category
   suggests, and languages. Proposal sellers save without a link (decision 2, the writing half). V2 and V3 land here.

## What is not in this PR

- **Check.** After a listing is linked, the business step draws Setup's own rows as it does today ("Start in
  Business" and so on).
- **Filling the receptionist from Google.** A new workspace has no receptionist config, and the config cannot be
  written without a booking link until 3b.
- **The rating on Find.** `rating` and `userRatingCount` would move every search to the Enterprise tier, and
  `google-door.test.mjs` forbids it. Find shows the kind of place and the address.
- **Pre-filling the number to keep from the listing.** That is PR 4.

## Files

- Modify: `packages/channels/src/google-places.ts`: the search mask and the candidate's `category`.
- Modify: `packages/contracts/src/google.ts`: `GoogleCandidateDto.category`.
- Modify: `apps/dashboard/app/api/v1/google/search/route.ts`: fall back to the workspace's name, pass the category on.
- Modify: `packages/contracts/src/first-run.ts`: `find` in `FirstRunVM`, `firstRunOf(vm, at, owner)`,
  `FIRST_RUN_WORDS.find`, `firstRunKicker`.
- Modify: `packages/contracts/src/setup.ts`: the Google row's verb names the step.
- Modify: `packages/contracts/src/signup.ts`: the words of V1.
- Modify: `apps/dashboard/src/legacy/pages/setup.jsx`: `ListingFinder` goes; the Google row's door is gated for
  owners.
- Modify: `apps/dashboard/src/legacy/pages/first-run.jsx`: `FrFind`, the page's toast.
- Modify: `apps/dashboard/src/legacy/styles/first-run.css`: Find's styles.
- Modify: `apps/dashboard/src/legacy/styles/settings.css`: the finder's dead styles go.
- Modify: `apps/dashboard/src/legacy-bridge/CreateWorkspace.tsx`: V1.
- Modify: `apps/dashboard/src/legacy/Chanlytics.html`: `?v=` for every edited legacy file.
- Tests:
  - `google-door.test.mjs` (the mask, the candidates)
  - `google-routes.test.mjs` (the fallback)
  - `first-run.test.mjs` (`find`, the kicker, the words)
  - `google.test.mjs` (the row's verb; the finder's source pins go)
  - `setup-page-activate.test.mjs` (the finder's test becomes the door's)
  - `first-run-page.test.mjs` (Find)
  - `create-workspace-screen.test.mjs` (V1)
- Nightly: `e2e/google.spec.ts`.
- Docs: `apps/dashboard/src/legacy/CLAUDE.md` (the first run), the spec's Delivery (the three parts).

---

### Task 0: The worktree can run the gates

- [ ] **Step 1:** `corepack pnpm install --frozen-lockfile --prefer-offline`, then `corepack pnpm --filter "./packages/*" build`. Restore the dists whose diff is line endings only (`git diff -w --ignore-cr-at-eol --stat`).
- [ ] **Step 2:** `corepack pnpm test`, and record the pass / fail / skipped counts here as the baseline.

### Task 1: Google's kind of place in the search

**Files:** `packages/channels/src/google-places.ts`, `packages/contracts/src/google.ts`,
`apps/dashboard/app/api/v1/google/search/route.ts`, `tooling/scripts/tests/google-door.test.mjs`.

- [ ] **Step 1: The failing test.** In `google-door.test.mjs`'s search test, the fake Places answer gives the first
  place `primaryTypeDisplayName: { text: "Moving company", languageCode: "en" }` and the second none. The expected
  candidates gain `category: "Moving company"` and `category: null`. Beside the rating assertion:

```js
assert.ok(
  req.headers["X-Goog-FieldMask"].includes("places.primaryTypeDisplayName"),
  "the kind of place, which tells two listings of one name apart, is a Pro field like the name",
);
```

- [ ] **Step 2:** Run `node --conditions=react-server --import tsx --test tooling/scripts/tests/google-door.test.mjs`. Expect FAIL (no `category`).
- [ ] **Step 3: Channels.** Add `places.primaryTypeDisplayName` to `PLACES_SEARCH_MASK`, `category: string | null` to
  `PlaceCandidate`, and `category: localized(p.primaryTypeDisplayName).text` in `candidateOf`. Update the header
  comment: the search asks for Pro fields only, now "a name, an address, a link and the kind of place". Checked
  against Google's Text Search (New) field list on 24 Sep 2026: `primaryTypeDisplayName` is in the Text Search Pro
  SKU, and `rating` and `userRatingCount` are Enterprise.
- [ ] **Step 4: Contracts.** In `GoogleCandidateDto`:

```ts
  /** Google's name for the kind of place ("Moving company"), when it gives one: it tells two listings of one name apart. */
  category: string | null;
```

- [ ] **Step 5: The route** maps `category: c.category ?? null`. An edge from before this change sends none, so
  either deploy order draws the candidate, without its kind.
- [ ] **Step 6:** Build channels and contracts, run the test (PASS), and commit: `The search learns the kind of place (Pro, like the name)`.

### Task 2: The search falls back to the workspace's name

**Files:** `apps/dashboard/app/api/v1/google/search/route.ts`, `tooling/scripts/tests/google-routes.test.mjs`.

A new workspace's config is `{}`, so a search with no words found nothing to ask and answered 400. The name typed at
sign-up is the workspace's own (`tenants.name`, read by `tenantFacts` in `server/tenant.ts` under the member's own
access).

- [ ] **Step 1: The failing test.** Rewrite the search test's middle case. With `tenants: [{ id: <B's tenant>, name: "Bayside Studio", timezone: "America/Chicago" }]`,
  and no config, `POST {}` reaches the edge and stops at its credential (502). With the tenant's name `"Al"`, it is
  still 400 "Give the business name and where it is".
- [ ] **Step 2: The route:**

```ts
    if (!query) {
      const row = await getTenantConfig(ctx.supabase, member.tenantId);
      const parsed = row ? parseTenantConfigResult(row.config) : null;
      const cfg = parsed && parsed.ok ? parsed.config : null;
      // The receptionist's own name first; a workspace with no receptionist yet has the name typed at sign-up.
      const name = cfg?.brain?.business_name?.trim() || (await tenantFacts(ctx.supabase, member.tenantId)).name.trim();
      const address = cfg?.brain?.profile?.address?.trim() ?? "";
      query = [name, address].filter(Boolean).join(", ");
      fromFacts = true;
    }
```

- [ ] **Step 3:** Run the test (PASS), and commit: `The search asks for the workspace's own name before there is a receptionist`.

### Task 3: When the business step is Find, in contracts

**Files:** `packages/contracts/src/first-run.ts`, `packages/contracts/src/setup.ts`,
`packages/contracts/src/signup.ts`, `tooling/scripts/tests/first-run.test.mjs`, `tooling/scripts/tests/google.test.mjs`.

- [ ] **Step 1: The failing tests** (first-run.test.mjs), on the Setup fixtures with `google: { ready: true, places: true, listing: null }`:

```js
test("Find is the business step for an owner while Google can be searched and nothing is linked or put off", () => {
  const g = (over = {}) => empty({ google: { ready: true, places: true, listing: null, connected: false }, ...over });
  assert.equal(firstRunOf(setupSteps(g(), NOW), null, true).find, true);
  assert.equal(firstRunOf(setupSteps(g(), NOW), null, false).find, false, "search and link are the owner's");
  assert.equal(firstRunOf(setupSteps(g({ later: ["google"] }), NOW), null, true).find, false, "said: not on Google");
  const linked = g({ google: { ready: true, places: true, listing: { name: "Harbor Moving", rating: 4.8, review_count: 12, checked_at: null, check_error: null } } });
  assert.equal(firstRunOf(setupSteps(linked, NOW), null, true).find, false, "a listing linked is found");
  const profileOnly = g({ google: { ready: true, places: false, listing: null } });
  assert.equal(firstRunOf(setupSteps(profileOnly, NOW), null, true).find, false, "no search here: the profile's door");
  assert.equal(firstRunOf(setupSteps(empty(), NOW), null, true).find, false, "no Google on this deployment");
});

test("the step line is one sentence wherever it is said", () => {
  assert.equal(firstRunKicker("business"), "Step 1 of 4 · Your business");
  assert.equal(firstRunOf(setupSteps(empty(), NOW)).phoneLine, firstRunKicker("business"));
});
```

  In `google.test.mjs`, the Google row's verb becomes `{ label: "Find it", to: "start/business" }`. The two source
  pins of the finder's wiring go (the ratchet's baseline falls).
- [ ] **Step 2:** Run both (FAIL).
- [ ] **Step 3: Implement.**
  - **first-run.ts:**
    - `firstRunKicker(key)` returns `` `Step ${n} of ${FIRST_RUN_STEPS.length} · ${name}` ``, and `phoneLine` uses it.
    - `firstRunOf(vm, at, owner = false)` adds `find`:

      ```ts
      const google = rowOf(vm, "google");
      const find = shown.key === "business" && owner && !!google && google.state === "not_started" && !google.later && google.verb?.to === firstRunStepRoute("business");
      ```

    - `primaryRow` is null while `find` is true (the rows are not drawn).
    - `FIRST_RUN_WORDS.find`, every word of the screen:

      ```ts
      find: {
        heading: (name: string | null) => (name ? `Is this ${name}?` : "Which one is your business?"),
        lead: "We looked you up on Google with the name you signed up with.",
        typed: (q: string) => `What Google has for “${q}”.`,
        reading: "Looking on Google…",
        pick: "Your listing on Google",
        best: "Best match",
        maps: "See it on Maps",
        noAddress: "No address on Google",
        none: (q: string) => `Nothing on Google for “${q}”.`,
        search: "Not these? Search by name or phone number",
        searchCta: "Search",
        yes: "Yes, this is us",
        notOnGoogle: "We're not on Google",
        linked: (name: string, read: boolean) => `${name} is your listing on Google — ${read ? "read just now" : "Google will be read within the hour"}.`,
        notLinked: "Not linked",
        retry: "Try again",
      },
      ```

  - **setup.ts:** the Google row with no listing and search available:
    `verb: { label: "Find it", to: firstRunStepRoute("business") }`. `first-run.ts` imports only types from
    `setup.ts`, so the value import is not a cycle.
  - **signup.ts** (`SIGNUP_WORDS`):

    ```ts
    nameTitle: "What's your business called?",
    nameLead: "We'll look it up on Google next.",
    nameCta: "Find it",
    ```

- [ ] **Step 4:** Build contracts (and every package that bundles it), run first-run.test, google.test, setup.test (PASS), and commit: `The business step is Find while there is a listing to find`.

### Task 4: One finder: Setup's rows open the step

**Files:** `apps/dashboard/src/legacy/pages/setup.jsx`, `apps/dashboard/src/legacy/styles/settings.css`,
`tooling/scripts/tests/setup-page-activate.test.mjs`.

- [ ] **Step 1: The failing test** replaces "the finder asks Google…":

```js
test("the page: the Google row's Find it opens the first run's Find, and only an owner may press it", async () => {
  // … the Google row with Places ready and no listing …
  assert.equal(gRow.cta.label, "Find it");
  await gRow.cta.onClick();
  assert.equal(calls.nav.at(-1), "start/business", "one finder: the business step's");
  // As an operator: the press is gated, with the sentence, and goes nowhere.
});
```

- [ ] **Step 2: Implement.**
  - `ListingFinder` goes, with the `finder` state, the `verb:google-find` case and the row's panel.
  - `SETUP_GATES` gains `["start/business", "team", "find the business on Google"]`. The row's verb is now a
    route, so `act` navigates.
  - settings.css drops `.setup-google`, `.setup-places`, `.setup-place*` and `.setup-google-row`. Grep first that
    nothing else draws them.
- [ ] **Step 3:** Run setup-page-activate, today-doors, first-run-page (PASS), and commit: `One finder: the Google row opens the business step`.

### Task 5: The Find screen

**Files:** `apps/dashboard/src/legacy/pages/first-run.jsx`, `apps/dashboard/src/legacy/styles/first-run.css`,
`tooling/scripts/tests/first-run-page.test.mjs`.

- [ ] **Step 1: The failing tests** (first-run-page.test.mjs). A `__google` stub records `find` and `link` and
  answers from a script. `__setup.later` records.
  1. On arrival: `find()` is asked with no words, and "Looking on Google…" shows.
  2. After it answers:
     - the heading is "Is this Harbor Moving?" (the workspace's name, from `__WORKSPACES`);
     - the first candidate is the best match, checked, and says "Moving company · 1 Main St…";
     - the others follow, unchecked.
  3. Checking the second, then "Yes, this is us": `link` is asked for the second's place id, and the page's toast
     says "… is your listing on Google — read just now."
  4. Nothing found: "Nothing on Google for “…”." with the search and "We're not on Google".
  5. A search of the owner's own words (3+ characters) asks `find(words)`. Fewer than 3 is not sent.
  6. A failed search says the server's sentence with "Try again", which asks again.
  7. "We're not on Google" asks `__setup.later("google", true)`. A refusal is said.
  8. An operator sees Setup's rows, never Find.
- [ ] **Step 2: Implement `FrFind`** in first-run.jsx: its own state (the answer, the checked place, the owner's
  words, one press at a time), and the page's `flash`. Candidates are native radios in a `radiogroup` named by
  `W.find.pick`. The best match carries `W.find.best`. Each candidate shows `[category, address || noAddress]`
  joined with " · ", and "See it on Maps" when Google gave a link. The search is a `<form>`, sent on Enter or
  `W.find.searchCta`. The acts are `W.find.yes` (`fr-onward`, gated `team`) and `W.find.notOnGoogle` (a quiet
  link). `FirstRun` draws it when `fr.find`, with `W.find.heading(name)` and `W.find.lead` in place of the step's.
  `name` is the receptionist's (`S.dto.business.name`), else the workspace's (`__WORKSPACES`). `FirstRun` holds
  the toast (`usePPToast`), because a link ends Find as the surfaces repaint.
- [ ] **Step 3: Styles** (first-run.css, tokens only): `.fr-find` (a grid with gap), `.fr-find-hit` (a label row,
  radio, body, the tag, the Maps link; the best match raised as the setup card is), `.fr-find-search` (the field
  and its button), `.fr-find-acts`, `.fr-find-skip` (a quiet link, like `.tq-open`). On a phone the acts sit in the
  foot as Back and Continue do.
- [ ] **Step 4:** Run first-run-page (PASS), and commit: `Find: the listing, found already, one press to link`.

### Task 6: V1, a Google sign-up names the business

**Files:** `apps/dashboard/src/legacy-bridge/CreateWorkspace.tsx`, `tooling/scripts/tests/create-workspace-screen.test.mjs`.

- [ ] **Step 1: The failing test:**

```js
test("V1: a first workspace with no name kept from sign-up is asked for the business, and nothing else", () => {
  const tree = render({ email: "owner@luna.example", posture: "open", onCreated() {} });
  assert.equal(textOf(byTestId(tree, "cw-kicker")), "Step 1 of 4 · Your business");
  assert.match(textOf(tree), /What's your business called\?/);
  assert.equal(find(tree, (n) => n.type === "select"), null, "the zone is the device's; Check shows it");
  assert.equal(textOf(find(tree, (n) => n.type === "button" && n.props.type === "submit")), "Find it");
  const invite = render({ email: "owner@luna.example", posture: "invite", onCreated() {} });
  assert.ok(find(invite, (n) => n.props?.["aria-label"] === "Invite code"), "the code is asked here while sign-up is by invitation");
});
```

  "New workspace", from inside the app, keeps its own form: its title, the zone and Back.
- [ ] **Step 2: Implement.** For a first workspace (`!another`), the form's head becomes:
  - the kicker `firstRunKicker("business")` (`cw-kicker`);
  - `SIGNUP_WORDS.nameTitle` and `SIGNUP_WORDS.nameLead`;
  - the name field, the invite code as today, no zone select (the device's zone, as email sign-up keeps it);
  - the submit `SIGNUP_WORDS.nameCta`, busy `SIGNUP_WORDS.making`.

  The way out (`leave`) and the foot stay.
- [ ] **Step 3:** Run create-workspace-screen and account-routes (PASS), and commit: `V1: a Google sign-up names the business, then Find`.

### Task 7: The nightly specs, the conventions, the spec

- [ ] **e2e/google.spec.ts:** at `/#/start/business` with the places ready, no listing, and the owner signed in:
  `fr-find` is visible with "Yes, this is us" or the nothing-found line, and never runs a link. Otherwise the
  Google row as today.
- [ ] **apps/dashboard/src/legacy/CLAUDE.md**, the first run's bullet: the business step opens on Find while an owner
  can link a listing (`fr.find`), and Setup's Google row opens it.
- [ ] **The spec's Delivery:** PR 3 in three parts (the list above).
- [ ] Commit: `docs(first-run): Find in the conventions, PR 3 in three parts`.

### Task 8: The gates, the look, the review, the pull request

- [ ] Prettier on the changed sources, then build every package. Keep only the dists whose diff is real.
- [ ] `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check && corepack pnpm test` and
  `node tooling/scripts/gen-route-types.mjs --check`. Record the counts.
- [ ] Look at Find with the card probe: the real `FirstRun` over a stubbed `__google`, at 1440 and at 375, found,
  none and failed.
- [ ] One whole-branch review (standards and spec) and one fix round.
- [ ] Merge `origin/main` if it moved, rebuild the dists, run the whole suite.
- [ ] The PR:
  - **Title:** "First run 3a of 5: Find — the listing, found already".
  - **What changes for a customer:**
    - the first step opens on Google's answer for their name;
    - one press links it, or they say they are not on Google;
    - a Google sign-up names the business first;
    - Setup's Google row opens the same screen.
  - **Set before merging:** nothing.
  - **Deploy order:** either. An edge before the category sends none, and the page draws the candidate without it.
- [ ] Squash-merge on green, check main's run, and update the memory file.
