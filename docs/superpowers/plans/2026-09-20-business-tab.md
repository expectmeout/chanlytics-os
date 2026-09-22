# Settings · Business tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Settings › Business from a nine-row card plus a fourteen-section form into one record whose every fact is a row you edit where it is stated.

**Architecture:** Three layers, bottom up. Pure view models in `packages/contracts` (a `fact` tone kind and a new `business-tab.ts`). A `record-*` component kit in the legacy tree, shaped like the charts kit. Then the page itself, composed from both, replacing `PaneWorkspace` and deleting `BusinessEditor` in the same PR. Nothing here needs a new route, column or edge change.

**Tech Stack:** TypeScript + zod (contracts), single-page React under Babel with no bundler (legacy tree), `node --test` under `tsx` for tests, `corepack pnpm` for everything.

**Spec:** `docs/superpowers/specs/2026-09-20-business-tab-design.md`
**Canvas:** https://claude.ai/artifact/GomguHCbTbFahYS9aotLn2
**Branch:** `design/business-is-a-record` in the `cm-settings` worktree, off `origin/main` at `eea146af`.

---

## Before you start

Run these once. `pnpm` is **not** on PATH in this environment — always `corepack pnpm`.

```bash
corepack pnpm install
corepack pnpm --filter "./packages/*" build
corepack pnpm test
```

Expect: install is a no-op (this worktree has its own `node_modules`), the build writes `packages/*/dist`, and the suite is green. If the suite is not green before you start, stop and say so — nothing below is safe on a red baseline.

A single test file runs as:

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/settings-words.test.mjs
```

### Rules that bite in this tree

- **Apps typecheck against built `dist`.** After any change under `packages/`, re-run `corepack pnpm --filter "./packages/*" build` before `corepack pnpm -r typecheck`. The `dist` diff is committed — it is a real artefact here, not noise.
- **A change to `contracts` moves five dists, not one.** `channels`, `core`, `db` and `jobs` each bundle `@chanlytics/contracts`, so a new export or union member lands in their `dist/index.js` too. Stage `packages/*/dist`, never `packages/contracts/dist` alone, and prove it with:

  ```bash
  corepack pnpm run check:dist
  ```

  Expected: `dist in sync with src`. Anything else and CI is red. This bit Task 1.1 — it staged contracts' own dist and left the other four behind.
- **A new legacy file goes in BOTH load lists**, in the same order: `apps/dashboard/src/legacy-bridge/manifest.ts` and `apps/dashboard/src/legacy/Chanlytics.html`. `tooling/scripts/tests/legacy-harness.test.mjs` pins them together. Bump `?v=N` on every edited file in the HTML.
- **No `readCode` assertions in a new test.** Execute the page on the stub React. `settings-editor.test.mjs` builds its own stub window; `today-page.test.mjs` uses the newer `./_legacy-react.mjs` helpers. New tests use `_legacy-react.mjs`.
- **A save patches, never rebuilds.** Every fold starts from the stored profile object and writes its own keys.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `packages/contracts/src/business-tab.ts` | The tab's sentence tables: the standing line, the rule strengths, the ability rows and `cannotRows`. Pure. |
| `packages/contracts/src/prompt-blocks.ts` | The prompt view: `promptBlocks`, the composed prompt cut into the blocks that wrote it. Split out of `business-tab.ts` by the Phase 1 review. Pure. A fold's consequence is composed from it in the bridge (Task 3.1). |
| `apps/dashboard/src/legacy/components/record-row.jsx` | `RecordRow`, `RecordSourceChip` — one row grammar. |
| `apps/dashboard/src/legacy/components/record-field.jsx` | `RecordField`, `RecordSwitch`, `RecordToggleGroup`, `RecordCombobox`. |
| `apps/dashboard/src/legacy/components/record-fold.jsx` | `RecordFold`, `RecordInline` (lifted from the page in Task 3.2's review) + the one-open-at-a-time registry. |
| `apps/dashboard/src/legacy/components/record-sheet.jsx` | `RecordSheet`. |
| `apps/dashboard/src/legacy/styles/record.css` | The kit's styles. Nothing page-specific. |
| `apps/dashboard/src/legacy/pages/business-tab.jsx` | The page: the head, the standing line, and the cards composed. |
| `apps/dashboard/src/legacy/pages/business-tab-save.jsx` | What the page's saves write: the one saver, the zone's own door, each row's check and patch (Task 3.2's review). Loads first. |
| `apps/dashboard/src/legacy/pages/business-tab-folds.jsx` | Each fold's helpers (Task 3.6), and what a save will say (`willSay`, Task 3.3). |
| `apps/dashboard/src/legacy/pages/business-tab-gestures.jsx` | The page's two gestures, `BtRow` and `BtFold`, and the two questions both ask (Task 3.3's quality review). Load order: save → folds → gestures → the cards → the page, in BOTH lists. |
| `apps/dashboard/src/legacy/pages/business-tab-who.jsx` | The *Who you are* card (Task 3.2), a file of its own since Task 3.3's quality review; `window.BtWhoCard`. |
| `apps/dashboard/src/legacy/pages/business-tab-open.jsx` | The *When you're open* card: the week, the zone, the closed days, the calendar it reads (Task 3.3); `window.BtOpenCard`. |
| `apps/dashboard/src/legacy/pages/business-tab-offer.jsx` | The *What you offer* card: the services row, the booking rules and consult-first (Task 3.4); `window.BtOfferCard`, and, since the quality review, nothing of the services sheet. |
| `apps/dashboard/src/legacy/pages/business-tab-services.jsx` | The services sheet (Task 3.4's quality review): `window.BtServicesSheet`, which the page draws after every card. |
| `apps/dashboard/src/legacy/pages/business-can.jsx` | The *What it can do* card and the prompt sheet. |
| `tooling/scripts/tests/business-tab-vm.test.mjs` | The sentence tables, as pure functions. |
| `tooling/scripts/tests/prompt-blocks.test.mjs` | The prompt view, whose words are in it, and the resolver's equivalence. |
| `tooling/scripts/tests/record-kit.test.mjs` | The record kit, executed (Phase 2). Named apart from the page's file, since the kit serves every Settings tab. |
| `tooling/scripts/tests/_business-tab-harness.mjs` | The page as every test draws it: the stub, the globals, the fixture, `drawTab`, the presses. Not named `*.test.mjs`, so the runner skips it (Task 3.3's quality review). |
| `tooling/scripts/tests/business-tab-page.test.mjs` | The page, executed: the head, the standing line, the saver, *Who you are*, and the gestures. Each card's tests are a file of their own over the harness. |
| `tooling/scripts/tests/business-tab-open.test.mjs` | *When you're open*, executed (Task 3.3). Tasks 3.4 and 3.5 add `business-tab-offer.test.mjs` and `business-tab-answers.test.mjs` the same way. |
| `tooling/scripts/tests/business-tab-folds.test.mjs` | Each fold patches only its own keys. |

**Modified**

| File | Change |
|---|---|
| `packages/contracts/src/tone.ts` | Add the `fact` StateKind. |
| `packages/contracts/src/index.ts` | Export `business-tab`. |
| `apps/dashboard/src/legacy/pages/settings.jsx:1013-1965` | Delete `BusinessEditor`. |
| `apps/dashboard/src/legacy/pages/settings.jsx:1998-2189` | `PaneWorkspace` renders the new page. |
| `apps/dashboard/src/legacy/pages/settings.jsx:2190-2242` | Delete `PromptPreview`; the sheet replaces it. |
| `apps/dashboard/src/legacy/styles/settings.css` | Delete the `.biz-*`, `.set-hours`, `.set-svc-*`, `.set-br-*`, `.set-ident-*`, `.set-fact-src`, `.set-prompt-*` families. |
| `apps/dashboard/src/legacy/styles/components.css` | Four motion additions + the reduced-motion block. |
| `apps/dashboard/src/legacy-bridge/manifest.ts` | Five new files. |
| `apps/dashboard/src/legacy/Chanlytics.html` | The same five, plus `record.css`, plus `?v=` bumps. |
| `apps/dashboard/src/legacy-bridge/settings-vm.ts` *(new, or extend `inbox-verbs.ts`)* | Publish the view models on `window`. |
| Seven test files | Rewritten against rows and folds (Task 3.7). |

---

## Phase 1 — Contracts (PR 1: "A fact says where it came from, and a rule says how far it goes")

### Task 1.1: The `fact` tone kind

**Files:**
- Modify: `packages/contracts/src/tone.ts`
- Test: `tooling/scripts/tests/business-tab-vm.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/business-tab-vm.test.mjs`:

```js
/**
 * The Business tab's own view models, as pure functions: a fact's tone, how far a rule goes,
 * the standing line's three clauses, the ability rows and the prompt's blocks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stateOf, SOURCE_WORDS } from "@chanlytics/contracts";

test("a fact's source carries a tone and the words facts.ts already wrote", () => {
  assert.equal(stateOf("fact", "verified").tone, "ok");
  assert.equal(stateOf("fact", "provisioned").tone, "ok");
  assert.equal(stateOf("fact", "typed").tone, "plain");
  assert.equal(stateOf("fact", "workspace").tone, "plain");
  assert.equal(stateOf("fact", "absent").tone, "plain");
  assert.equal(stateOf("fact", "disputed").tone, "warn");
  // One copy of the words: the pill reads facts.ts, it does not restate it.
  assert.equal(stateOf("fact", "verified").label, SOURCE_WORDS.verified);
  assert.equal(stateOf("fact", "provisioned").label, SOURCE_WORDS.provisioned);
  assert.equal(stateOf("fact", "disputed").label, "doesn't match");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: FAIL — `stateOf("fact", …)` throws reading `TONE_OF["fact"]` of undefined.

- [ ] **Step 3: Add the kind**

In `packages/contracts/src/tone.ts`, add the import beside the others at the top:

```ts
import { SOURCE_WORDS } from "./facts";
```

Add `| "fact"` to the `StateKind` union, with its comment, after `"calendar"`:

```ts
  /** Where a fact came from: the chip beside a value on the Business tab. */
  | "fact"
```

Add to `TONE_OF`, after `calendar`:

```ts
  // Two sources are a claim somebody else stands behind; the rest are neutral, and a
  // disagreement is warn because a person has to settle it.
  fact: { verified: "ok", provisioned: "ok", workspace: "plain", typed: "plain", absent: "plain", disputed: "warn" },
```

Add to `LABEL_OF`, after `calendar`:

```ts
  // facts.ts already wrote these words for the row; a second copy is one that would drift.
  fact: { ...SOURCE_WORDS, disputed: "doesn't match" },
```

- [ ] **Step 4: Build and re-run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/tone.ts packages/*/dist tooling/scripts/tests/business-tab-vm.test.mjs
git commit -m "A fact's source is a state the one pill can draw"
```

---

### Task 1.2: How far a rule goes

> **Changed by the Phase 1 review.** The price rule's sentence below predates the owner's decision of 20 Sep 2026 that a receptionist never states a price: the detector runs whether the switch is on or off, and the switch changes only one prompt line. `ruleStrength("never_quote_prices").sentence` now says so. `GUARDRAIL_KEYS` is read inside a call marked pure, so the four dists that bundle contracts drop it. Read `business-tab.ts`.

**Files:**
- Create: `packages/contracts/src/business-tab.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `tooling/scripts/tests/business-tab-vm.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `business-tab-vm.test.mjs`:

```js
import { ruleStrength, GUARDRAIL_KEYS } from "@chanlytics/contracts";

test("the four rules carry three different guarantees", () => {
  assert.equal(ruleStrength("never_confirm_booking").strength, "structural");
  assert.equal(ruleStrength("never_quote_prices").strength, "checked");
  assert.equal(ruleStrength("disclose_ai").strength, "instructed");
  assert.equal(ruleStrength("no_health_advice").strength, "instructed");
  // Every key the editor writes has a strength, and no key has one it does not write.
  assert.deepEqual([...GUARDRAIL_KEYS].sort(), ["disclose_ai", "never_confirm_booking", "never_quote_prices", "no_health_advice"]);
  for (const k of GUARDRAIL_KEYS) {
    const r = ruleStrength(k);
    assert.ok(r.chip.length > 0 && r.sentence.length > 0, `${k} needs a chip and a sentence`);
  }
  // The structural one says the switch does not decide it.
  assert.match(ruleStrength("never_confirm_booking").sentence, /no appointments table/i);
  // The checked one names both channels, because they differ -- and it names them in
  // checkedOn, not in the sentence: the page draws both, so a sentence that said the
  // channels too would print the same fact twice on one row.
  const priced = ruleStrength("never_quote_prices");
  assert.equal(priced.checkedOn?.length, 2);
  assert.deepEqual(priced.checkedOn.map((c) => c.channel), ["whatsapp", "voice"]);
  // On chat a draft sits in between, so the swap happens before anyone reads it.
  assert.match(priced.checkedOn[0].words, /before the customer sees them/i);
  // On a call there is no before. Saying there is would be the one dishonest sentence
  // on a page whose whole point is that these four rules are not equivalent.
  assert.doesNotMatch(priced.checkedOn[1].words, /before/i);
  assert.match(priced.checkedOn[1].words, /already been heard/i);
  assert.doesNotMatch(priced.sentence, /WhatsApp|call/i);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: FAIL — `ruleStrength is not a function`.

- [ ] **Step 3: Write `business-tab.ts`**

Create `packages/contracts/src/business-tab.ts`:

```ts
/**
 * What the Business tab says, as view models.
 *
 * Named apart from `business-page.ts` (the public /b/<slug> page) and
 * `business-record.ts` (the carrier record). This one is the operator's own tab.
 *
 * Every sentence with a number or a judgement in it is composed here rather
 * than in the page, for the reason Today and Reports already hold to: a
 * sentence written in JSX cannot be tested, and the same sentence written
 * twice is one that will be edited once.
 */

/** The guardrail keys the profile stores. The editor writes exactly these. */
export const GUARDRAIL_KEYS = ["never_quote_prices", "never_confirm_booking", "disclose_ai", "no_health_advice"] as const;
export type GuardrailKey = (typeof GUARDRAIL_KEYS)[number];

/**
 * How far a rule actually goes.
 *
 * The page drew four identical switches over three different guarantees, which
 * is the quietest dishonesty it had. One of these the product cannot break at
 * all; one has a detector on both channels; two are lines in a prompt, and
 * `policy.ts` says in its own header that an instruction is not an enforcement.
 */
export type RuleStrength = "structural" | "checked" | "instructed";

export interface RuleStrengthVM {
  strength: RuleStrength;
  /** The chip beside the rule's name. */
  chip: string;
  /** What actually happens, in the owner's words. */
  sentence: string;
  /** For a checked rule, what happens per channel. Null otherwise. */
  checkedOn: { channel: "whatsapp" | "voice"; words: string }[] | null;
}

const STRENGTHS: Record<GuardrailKey, RuleStrengthVM> = {
  never_confirm_booking: {
    strength: "structural",
    chip: "It cannot anyway",
    sentence:
      "There is no appointments table in this product; nothing in it can create, move or cancel one. Switching this off would not let it book — it would only stop it being told not to claim it had.",
    checkedOn: null,
  },
  never_quote_prices: {
    strength: "checked",
    chip: "Checked, not just told",
    // The sentence says the rule. `checkedOn` says how it lands per channel, and the
    // page draws both -- so the sentence must not say the channels too, or an owner
    // reads the same fact twice, once in prose and once in the two boxes under it.
    sentence: "A detector reads every reply for a currency figure. It offers a consult or the booking link instead.",
    checkedOn: [
      { channel: "whatsapp", words: "The words are swapped before the customer sees them. A draft sits in between." },
      { channel: "voice", words: "It has already been heard. A correction goes into the live call, and you are told while it is still up." },
    ],
  },
  disclose_ai: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence:
      "A line in what it reads, and it follows it reliably — but nothing checks the answer afterwards. There is no clean signal to check against: the phrase that would catch a denial also catches the correct disclosure.",
    checkedOn: null,
  },
  no_health_advice: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence: "Skin reactions, allergies, pregnancy, medication — a professional advises at the appointment.",
    checkedOn: null,
  },
};

export function ruleStrength(key: GuardrailKey): RuleStrengthVM {
  return STRENGTHS[key];
}
```

In `packages/contracts/src/index.ts`, add beside the other exports (keep the file's alphabetical-ish grouping; put it under the `business-page` line):

```ts
export * from "./business-tab";
```

- [ ] **Step 4: Build and re-run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/business-tab.ts packages/contracts/src/index.ts packages/*/dist tooling/scripts/tests/business-tab-vm.test.mjs
git commit -m "A rule says how far it goes"
```

---

### Task 1.3: The standing line

> **Changed by the Phase 1 review.** `wont` is "It offers a consult or the booking link instead of a price." whenever there are services, whatever the price switch says (the owner's decision, Task 4.2), and `StandingInputs` no longer takes `guardrails`. Read `business-tab.ts`.

Three clauses: what it can say, what it deliberately will not, and what is missing. Never a percentage — a completion meter is a number nobody can act on.

**Files:**
- Modify: `packages/contracts/src/business-tab.ts`
- Test: `tooling/scripts/tests/business-tab-vm.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { standingLine } from "@chanlytics/contracts";

const full = {
  business_name: "Melany's Beauty Salon",
  booking_link: "https://booksy.com/en-us/1817434",
  profile: {
    address: "2581 Pitkin Ave, Brooklyn, NY 11208",
    tone: "Warm and unhurried.",
    hours: { mon: { open: "09:30", close: "18:00" } },
    services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
    escalate_when: ["They ask for Melany"],
    guardrails: { never_quote_prices: true },
  },
};

test("the standing line is three clauses, and never a percentage", () => {
  const s = standingLine(full);
  assert.match(s.can, /where you are/);
  assert.match(s.can, /when you.re open/);
  assert.match(s.can, /how to book/);
  assert.equal(s.missing, null, "a full record is missing nothing");
  assert.match(s.wont ?? "", /consult instead of a price/);
  assert.equal(typeof s.percent, "undefined", "there is no score on this page");
});

test("the standing line names the one thing missing, and where to fix it", () => {
  const noVoice = { ...full, profile: { ...full.profile, tone: undefined } };
  const s = standingLine(noVoice);
  assert.match(s.missing.sentence, /no voice of its own/i);
  assert.equal(s.missing.row, "tone");
});

test("a record with nothing says so without listing every gap", () => {
  const s = standingLine({ business_name: "", booking_link: "", profile: {} });
  assert.match(s.can, /cannot answer anyone yet/i);
  assert.equal(s.wont, null);
  assert.equal(s.missing.row, "name");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: FAIL — `standingLine is not a function`.

- [ ] **Step 3: Implement**

Append to `packages/contracts/src/business-tab.ts`:

```ts
/** The subset of the brain the standing line reads. */
export interface StandingInputs {
  business_name?: string | null;
  booking_link?: string | null;
  profile?: {
    address?: string | null;
    tone?: string | null;
    hours?: Record<string, unknown> | null;
    services?: unknown[] | null;
    escalate_when?: string[] | null;
    guardrails?: Partial<Record<GuardrailKey, boolean>> | null;
  } | null;
}

export interface StandingVM {
  /** What it can answer, in one clause. */
  can: string;
  /** What it deliberately will not do, by a rule the owner set. Null when there is none. */
  wont: string | null;
  /** The single most useful gap, and the row that fixes it. Null when there is none. */
  missing: { sentence: string; row: string } | null;
}

const has = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v as object).length > 0;

/**
 * Three clauses, worst last.
 *
 * The gaps are ordered by what a customer notices: a receptionist with no name
 * cannot introduce itself, one with no hours cannot answer the commonest
 * question, and one with no voice answers correctly in nobody's words. Only
 * the first gap is named — a list of six is a list nobody starts.
 */
export function standingLine(i: StandingInputs): StandingVM {
  const p = i.profile ?? {};
  const gaps: { sentence: string; row: string }[] = [];
  if (!has(i.business_name)) gaps.push({ sentence: "It has no name to introduce itself with.", row: "name" });
  if (!has(i.booking_link)) gaps.push({ sentence: "It has no booking link to send anyone.", row: "booking_link" });
  if (!has(p.hours)) gaps.push({ sentence: "It cannot say when you are open.", row: "hours" });
  if (!has(p.services)) gaps.push({ sentence: "It cannot say what you offer.", row: "services" });
  if (!has(p.address)) gaps.push({ sentence: "It cannot say where you are.", row: "address" });
  if (!has(p.tone)) gaps.push({ sentence: "It has no voice of its own yet — it answers correctly, in nobody in particular's words.", row: "tone" });

  const answers: string[] = [];
  if (has(p.address)) answers.push("where you are");
  if (has(p.hours)) answers.push("when you're open");
  if (has(p.services)) answers.push("what you offer");
  if (has(i.booking_link)) answers.push("how to book");

  const can = answers.length
    ? `It can say ${answers.length === 1 ? answers[0] : `${answers.slice(0, -1).join(", ")} and ${answers.at(-1)}`}.`
    : "It cannot answer anyone yet.";

  const quiet = p.guardrails?.never_quote_prices !== false && has(p.services);
  const wont = quiet ? "It offers a consult instead of a price, by your rule." : null;

  return { can, wont, missing: gaps[0] ?? null };
}
```

- [ ] **Step 4: Build and re-run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/business-tab.ts packages/*/dist tooling/scripts/tests/business-tab-vm.test.mjs
git commit -m "The page says what it can answer, what it will not, and what is missing"
```

---

### Task 1.4: The ability rows

> **Superseded in execution — read `business-tab.ts` and the tests that pin it, not the code below.** The shipped `abilityRows` takes every input, all required: `voiceLive`, `whatsappLive`, `hasCalendarFeed`, `hasBookingLink`, `hasBookingTemplate`, `hasHandoffNumber`, `hasEscalateWhen`, `pauseHours`, `visionOn` and `bookingHeld`. It throws a `TypeError` naming any boolean input that is not a boolean, because its caller is untyped JSX. `pauseHours` is the stored value, read through `hardLimitsWords`. `CANNOT_ROWS` became `cannotRows({ smsLive })`. Task 4.1 says where each input comes from on the page.

**Files:**
- Modify: `packages/contracts/src/business-tab.ts`
- Test: `tooling/scripts/tests/business-tab-vm.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { abilityRows, CANNOT_ROWS } from "@chanlytics/contracts";

test("an ability names its channels and the row it runs on", () => {
  const rows = abilityRows({
    voiceLive: true,
    whatsappLive: true,
    hasCalendarFeed: true,
    hasBookingLink: true,
    hasHandoffNumber: true,
    hasEscalateWhen: true,
    visionOn: false,
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  assert.deepEqual(byId.open_times.channels, { voice: true, whatsapp: true });
  assert.match(byId.open_times.detail, /at that moment/i, "the phone asks live; chat is handed a snapshot");
  assert.equal(byId.open_times.runsOn.row, "calendar");

  assert.match(byId.booking_link.detail, /texts it to the number they rang from/i);

  assert.deepEqual(byId.transfer.channels, { voice: true, whatsapp: false });
  assert.deepEqual(byId.handoff.channels, { voice: false, whatsapp: true });

  assert.equal(byId.vision.on, false);
});

test("an ability whose input is missing says which row to fill", () => {
  const rows = abilityRows({
    voiceLive: true, whatsappLive: true, hasCalendarFeed: false,
    hasBookingLink: true, hasHandoffNumber: false, hasEscalateWhen: true, visionOn: false,
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.open_times.ready, false);
  assert.equal(byId.transfer.ready, false);
  assert.match(byId.transfer.detail, /takes a message instead/i);
});

test("what it cannot do is stated, and is not a setting", () => {
  const ids = CANNOT_ROWS.map((r) => r.id);
  assert.deepEqual(ids, ["book", "outbound_call", "sms"]);
  assert.match(CANNOT_ROWS[0].detail, /no appointments table/i);
  assert.match(CANNOT_ROWS[1].detail, /never dials/i);
  assert.equal(CANNOT_ROWS[2].soon, true);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: FAIL — `abilityRows is not a function`.

- [ ] **Step 3: Implement**

Append to `packages/contracts/src/business-tab.ts`:

```ts
/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent texts
 * the booking link to the number a caller rang from.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled.
 */
export interface AbilityInputs {
  voiceLive: boolean;
  whatsappLive: boolean;
  hasCalendarFeed: boolean;
  hasBookingLink: boolean;
  hasHandoffNumber: boolean;
  hasEscalateWhen: boolean;
  visionOn: boolean;
}

export interface AbilityRowVM {
  id: "answer" | "open_times" | "booking_link" | "transfer" | "handoff" | "vision";
  title: string;
  detail: string;
  channels: { voice: boolean; whatsapp: boolean };
  /** The row on this page that supplies it. Null when nothing does. */
  runsOn: { label: string; row: string } | null;
  ready: boolean;
  /** Only the opt-in ability carries this. */
  on?: boolean;
}

export function abilityRows(i: AbilityInputs): AbilityRowVM[] {
  const both = { voice: i.voiceLive, whatsapp: i.whatsappLive };
  return [
    {
      id: "answer",
      title: "Answer from your facts",
      detail: "Hours, address, services, your notes — and it records which facts it leaned on.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: i.voiceLive || i.whatsappLive,
    },
    {
      id: "open_times",
      title: "Say which times are open",
      detail: i.hasCalendarFeed
        ? "On a call it asks the calendar at that moment. In chat it is handed the day's openings with each message. Up to three that fit, then the link."
        : "No calendar to read, so it does not guess at open times — it sends the link instead.",
      channels: both,
      runsOn: { label: "The calendar it reads", row: "calendar" },
      ready: i.hasCalendarFeed,
    },
    {
      id: "booking_link",
      title: "Send the booking link",
      detail: "On a call it texts it to the number they rang from and says so. In chat it sends it in the thread.",
      channels: both,
      runsOn: { label: "The booking link", row: "booking_link" },
      ready: i.hasBookingLink,
    },
    {
      id: "transfer",
      title: "Put a caller through",
      detail: i.hasHandoffNumber
        ? "Dials the number you gave and steps out."
        : "No number yet, so it takes a message instead — which is better than a number nobody picks up.",
      channels: { voice: i.voiceLive, whatsapp: false },
      runsOn: { label: "The transfer number", row: "handoff_number" },
      ready: i.voiceLive && i.hasHandoffNumber,
    },
    {
      id: "handoff",
      title: "Hand the thread to you",
      detail:
        "It stops answering, the thread turns Needs you in the Inbox, and your staff are emailed. It will not pick the thread back up on its own.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Your reasons", row: "escalate_when" },
      ready: i.whatsappLive && i.hasEscalateWhen,
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn
        ? "It says what it sees and suggests the next step, under the rules above."
        : "Off. A photo is acknowledged and passed to a person.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Turn it on", row: "vision" },
      ready: i.visionOn,
      on: i.visionOn,
    },
  ];
}

export interface CannotRowVM {
  id: "book" | "outbound_call" | "sms";
  title: string;
  detail: string;
  /** True when it is a thing the product intends to sell later. */
  soon?: boolean;
}

/**
 * Said here so nobody has to find out from a customer.
 *
 * None of these is a setting that could be switched on, and saying so on the
 * page that holds the switches is the difference between a limit and a bug.
 */
export const CANNOT_ROWS: readonly CannotRowVM[] = [
  {
    id: "book",
    title: "Book, move or cancel an appointment",
    detail:
      "Not a setting you could switch on. There is no appointments table in this product — nothing in it can create, move or cancel one. Your booking link does that, whichever tool is behind it.",
  },
  {
    id: "outbound_call",
    title: "Ring a customer",
    detail:
      "It answers your line; it never dials out. A call back is a person's, and the receptionist tells you when one is wanted.",
  },
  {
    id: "sms",
    title: "Send a text message",
    detail:
      "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when. The booking link a caller receives goes to their WhatsApp.",
    soon: true,
  },
];
```

- [ ] **Step 4: Build and re-run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/business-tab.ts packages/*/dist tooling/scripts/tests/business-tab-vm.test.mjs
git commit -m "What the receptionist can do, and what it cannot"
```

---

### Task 1.5: The prompt, cut into blocks

> **Superseded in execution — read `business-tab.ts` and the tests that pin it, not the code below.** The algorithm below cuts on headings alone, and running it on real prompts showed three faults: the owner's own words (`extra_instructions`) have no reliable heading and were folded into whatever came before; the call's hand-off heading (`Handing the caller to a person:`) was missed; and Chanlytics' own per-workspace text landed in rows, including "Who you are". The shipped signature is `promptBlocks(text, channel, from)`, where `from` is required and says what the prompt was composed from: the stored brain for the resolved prompt, `{ profile }` for a draft run through `composeSystemPrompt`, or `null`. Leaving it out throws, because the caller is untyped JSX. The owner's words are the ones `ownWordsOf(from)` names — the resolver's own carry rule, so a prompt carried into a blank box is found too — and they are fenced off by literal text before any heading is matched. The product's baseline prompt is the platform's, not the owner's. The hand-off is one `handoff` row on both channels, and says it is always sent. A workspace with no fields is its own words, then `autonomy` rules. Every block has a unique `id`, because the platform's text recurs on a call, and `chars` sum to the prompt. Every later task passes `from`.

**Files:**
- Modify: `packages/contracts/src/business-tab.ts`
- Test: `tooling/scripts/tests/business-tab-vm.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
import { promptBlocks, composeSystemPrompt } from "@chanlytics/contracts";

const brain = { business_name: "Melany's Beauty Salon", phone_display: "+1 (308) 336-8109", booking_link: "https://booksy.com/x" };
const profile = {
  tone: "Warm and unhurried.",
  languages: ["English", "Spanish"],
  address: "2581 Pitkin Ave, Brooklyn, NY 11208",
  hours: { mon: { open: "09:30", close: "18:00" }, sat: { open: "09:30", close: "19:00" } },
  services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }],
  notes: [{ title: "Walk-ins", text: "Walk-ins are welcome." }],
  escalate_when: ["They ask for Melany"],
  guardrails: { never_quote_prices: true },
};

test("the prompt is cut into blocks, each naming the row that wrote it", () => {
  const text = composeSystemPrompt(brain, profile, "whatsapp", "America/New_York");
  const blocks = promptBlocks(text, "whatsapp");

  const ids = blocks.map((b) => b.row);
  assert.ok(ids.includes("identity"), "who you are");
  assert.ok(ids.includes("hours"));
  assert.ok(ids.includes("services"));
  assert.ok(ids.includes("escalate_when"));
  assert.ok(ids.includes("guardrails"), "the rules compose into the prompt too");
  // The head block holds the tone and the languages, which have no heading of their own.
  const head = blocks.find((b) => b.row === "identity");
  assert.match(head.text, /^Tone: Warm and unhurried\./m);
  assert.match(head.text, /You speak: English, Spanish\./);

  // Each block carries its own size, and the sizes add up to the whole.
  const total = blocks.reduce((n, b) => n + b.chars, 0);
  assert.ok(total <= text.length, "blocks cannot claim more than the prompt holds");
  for (const b of blocks) assert.ok(b.chars > 0 && b.label.length > 0);
});

test("the hand-off block is WhatsApp's alone", () => {
  const wa = promptBlocks(composeSystemPrompt(brain, profile, "whatsapp", "America/New_York"), "whatsapp");
  const voice = promptBlocks(composeSystemPrompt(brain, profile, "voice", "America/New_York"), "voice");
  assert.ok(wa.some((b) => b.row === "escalate_when"), "chat is told how to hand over");
  assert.ok(!voice.some((b) => b.row === "escalate_when"), "the phone has its own transfer, so the block is absent");
  assert.match(wa.find((b) => b.row === "escalate_when").note ?? "", /WhatsApp only/i);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: FAIL — `promptBlocks is not a function`.

- [ ] **Step 3: Implement**

Append to `packages/contracts/src/business-tab.ts`:

```ts
/**
 * The composed prompt, cut into the blocks that wrote it.
 *
 * The preview was one 4,000-character <pre> behind a Show toggle. Every block
 * in it came from one row upstairs, and naming the row turns a dump into a map
 * back into the page — which is also the only way an owner can see that
 * services and their own words are more than half of everything it reads.
 *
 * Cut on the headings the composer itself writes, so this cannot drift from it:
 * a heading that composeSystemPrompt stops emitting simply stops appearing here.
 */
export interface PromptBlockVM {
  /** The row on the page that wrote it. */
  row: string;
  label: string;
  text: string;
  chars: number;
  /** A caveat worth saying beside the block. */
  note?: string;
}

/**
 * Read off `composeSystemPrompt`, not guessed. Each `startsWith` is the exact
 * heading that function emits; a heading it stops emitting simply stops
 * appearing here, which is the point of cutting on them.
 */
const BLOCK_MARKS: { row: string; label: string; startsWith: string; note?: string }[] = [
  { row: "hours", label: "When you're open", startsWith: "Opening hours" },
  { row: "closures", label: "Days you're closed", startsWith: "Closed on these dates" },
  { row: "services", label: "Services", startsWith: "Services:" },
  { row: "notes", label: "Things it should know", startsWith: "Other things to know:" },
  { row: "booking_rules", label: "Booking rules", startsWith: "Booking rules:" },
  {
    row: "escalate_when",
    label: "Hand-off",
    startsWith: "Handing the conversation to a person:",
    note: "WhatsApp only — on a call the agent has its own transfer, so this block is absent.",
  },
  { row: "guardrails", label: "Rules it always keeps", startsWith: "Rules you must follow:" },
];

export function promptBlocks(text: string, _channel: "whatsapp" | "voice"): PromptBlockVM[] {
  const lines = text.split("\n");
  const starts: { at: number; mark: (typeof BLOCK_MARKS)[number] }[] = [];
  lines.forEach((line, n) => {
    const mark = BLOCK_MARKS.find((m) => line.trim().startsWith(m.startsWith));
    if (mark && !starts.some((s) => s.mark.row === mark.row)) starts.push({ at: n, mark });
  });
  starts.sort((a, b) => a.at - b.at);

  const out: PromptBlockVM[] = [];
  // Everything before the first marked heading is who you are: the opening
  // sentence, the tone, the languages, the address, the phone and the link.
  const first = starts[0]?.at ?? lines.length;
  const head = lines.slice(0, first).join("\n").trim();
  if (head) out.push({ row: "identity", label: "Who you are", text: head, chars: head.length });

  starts.forEach((s, n) => {
    const end = starts[n + 1]?.at ?? lines.length;
    const body = lines.slice(s.at, end).join("\n").trim();
    if (!body) return;
    out.push({ row: s.mark.row, label: s.mark.label, text: body, chars: body.length, ...(s.mark.note ? { note: s.mark.note } : {}) });
  });
  return out;
}
```

- [ ] **Step 4: Build and re-run**

```bash
corepack pnpm --filter "./packages/*" build
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-vm.test.mjs
```

Expected: PASS, 10 tests. If the hand-off assertion fails, read `composeSystemPrompt`'s hand-off branch in `config.ts` and correct `startsWith` to the exact heading it emits — the mark must match the composer, not the other way round.

- [ ] **Step 5: Run the whole suite and commit**

```bash
corepack pnpm test
git add packages/contracts/src/business-tab.ts packages/*/dist tooling/scripts/tests/business-tab-vm.test.mjs
git commit -m "The prompt is a table of contents, not a dump"
```

- [ ] **Step 6: Typecheck, then open the PR**

```bash
corepack pnpm --filter "./packages/*" build
corepack pnpm -r typecheck
gh pr create --title "A fact says where it came from, and a rule says how far it goes" --body "$(cat <<'EOF'
The contracts the Business tab's redesign composes from, with no page attached yet.

- `tone.ts` gains a `fact` kind, so a source chip is the one pill and not a
  private CSS family. Its words come from `SOURCE_WORDS`, which already had them.
- `business-tab.ts` is new: how far each of the four guardrails actually goes
  (one is structural, one has a detector, two are prompt lines), the standing
  line's three clauses, the six abilities with the channel each belongs to and
  the three things the receptionist cannot do, and the composed prompt cut into
  the blocks that wrote it.

Nothing renders any of this yet. Spec: `docs/superpowers/specs/2026-09-20-business-tab-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 2 — The record kit (PR 2: "One row, one field, one fold, one sheet")
> **Two corrections to this phase's test code, found 21 Sep before it ran.** (1) `fresh()` in `_legacy-react.mjs` takes no argument: it only resets hook state. Draw as `today-page.test.mjs` does, with `const draw = (Comp, props = {}) => { fresh(); return W.React.createElement(Comp, props); };`, and redraw with `again(() => W.React.createElement(Comp, props))`. Every `fresh(() => W.X(...))` below draws nothing. (2) `installLegacyReact` does not install `window.__chrome.state`, so `StatePill` renders every tone as plain and any `pill-ok` or `pill-warn` assertion fails. Install it from contracts: `installLegacyReact({ __DEMO_MODE: false, __chrome: { state: stateOf } })`, with `stateOf` imported from `@chanlytics/contracts`.

The kit is shaped like the charts kit: its own files, its own stylesheet, both load lists, and it knows nothing about the Business tab.

### Task 2.1: `record.css`

**Files:**
- Create: `apps/dashboard/src/legacy/styles/record.css`
- Modify: `apps/dashboard/src/legacy/Chanlytics.html`

- [ ] **Step 1: Write the stylesheet**

Create `apps/dashboard/src/legacy/styles/record.css`. Take the exact values from the canvas artboards (`Record.dc.html` for the row, `Edit-Fold.dc.html` for the fold, `Edit-Sheet.dc.html` for the sheet). The classes:

```css
/* ============================================================
   THE RECORD KIT — a row, a field, a fold, a sheet.
   Shaped like the charts kit: its own file, its own classes, no
   page knows anything but these names.
   ============================================================ */

.rec-card { padding: 18px 18px 6px; background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
.rec-card-head { display: flex; align-items: baseline; gap: 10px; padding-bottom: 12px; }
.rec-card-title { margin: 0; font-size: var(--text-md); font-weight: var(--weight-semibold); letter-spacing: -0.01em; color: var(--ink); }
.rec-card-sub { flex: 1; font-size: var(--set-hint, var(--text-sm)); color: var(--ink-dim); }

.rec-row { display: flex; align-items: baseline; gap: 16px; padding: 11px 0; border-top: 1px solid var(--line); }
.rec-row-top { align-items: flex-start; }
.rec-row-key { flex: 0 0 168px; font-size: var(--text-sm); color: var(--ink-dim); }
.rec-row-val { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; color: var(--ink); }
.rec-row-empty { color: var(--ink-faint); }
.rec-row-act { flex: none; font-size: var(--text-sm); color: var(--ink-faint); transition: color var(--duration-fast) var(--ease-out); }
.rec-row:hover .rec-row-act, .rec-row:focus-within .rec-row-act { color: var(--ink); font-weight: var(--weight-medium); }
.rec-row:hover { background: var(--bg-hover); border-radius: var(--radius-md); box-shadow: 0 0 0 12px var(--bg-hover); }
/* An act on an empty row is never hidden: there is no value to point at. */
.rec-row[data-empty="true"] .rec-row-act { color: var(--ink-muted); }

.rec-fold { border-top: 1px solid var(--line); border-left: 2px solid var(--accent); margin-left: -18px; padding-left: 16px; background: linear-gradient(to right, var(--bg-sunken), var(--bg-raised) 380px); }
.rec-fold-head { display: flex; align-items: baseline; gap: 16px; padding: 11px 18px 4px 0; }
.rec-fold-body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows var(--duration-base) var(--ease-out), opacity var(--duration-base) var(--ease-out); }
.rec-fold-body > * { overflow: hidden; }
.rec-fold[data-open="false"] .rec-fold-body { grid-template-rows: 0fr; opacity: 0; }
.rec-fold-says { display: flex; flex-direction: column; gap: 6px; padding: 11px 12px; background: var(--bg-sunken); border-radius: var(--radius-md); }
.rec-fold-says-eyebrow { font-size: var(--text-xs); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-wide); text-transform: uppercase; color: var(--ink-faint); }
.rec-fold-says pre { margin: 0; font-family: var(--font-mono); font-size: var(--text-sm); line-height: var(--leading-relaxed); color: var(--ink-muted); white-space: pre-wrap; }
.rec-fold-foot { display: flex; align-items: center; gap: 9px; padding: 2px 18px 16px 0; }

.rec-sheet { position: fixed; top: 0; right: 0; bottom: 0; width: min(540px, 92vw); background: var(--bg-raised); border-left: 1px solid var(--line-strong); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; z-index: 40; }
.rec-sheet-head { padding: 20px 22px 14px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; gap: 14px; }
.rec-sheet-body { flex: 1; min-height: 0; overflow: auto; padding: 0 22px; }
.rec-sheet-foot { padding: 14px 22px 18px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 11px; }

.rec-field { display: flex; flex-direction: column; gap: 5px; }
.rec-field-label { font-size: var(--text-sm); color: var(--ink-muted); }
.rec-input { box-sizing: border-box; width: 100%; height: 32px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--bg-raised); font-size: var(--text-base); color: var(--ink); }
/* The house ring, as .set-input and .biz-input draw it: the 3px accent-soft glow read 1.2:1 and the faint border 2.5:1,
   under WCAG 1.4.11's 3:1 (amended 21 Sep, by the Phase 2 quality review). */
.rec-input:focus-visible { outline: none; box-shadow: var(--focus-ring); border-color: var(--accent); }
.rec-input[aria-invalid="true"] { border-color: var(--danger); }
.rec-input-group { display: flex; align-items: stretch; height: 32px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-raised); }
.rec-input-group:focus-within { box-shadow: var(--focus-ring); border-color: var(--accent); }
.rec-input-group .rec-input { border: none; height: 30px; }
.rec-input-unit { display: flex; align-items: center; padding: 0 10px; border-left: 1px solid var(--line); background: var(--bg-sunken); font-size: var(--text-sm); color: var(--ink-dim); }
.rec-hint { font-size: var(--text-sm); color: var(--ink-faint); }

.rec-switch { flex: none; width: 30px; height: 18px; border-radius: var(--radius-full); background: var(--line-strong); position: relative; transition: background var(--duration-fast) var(--ease-out); }
.rec-switch[aria-checked="true"] { background: var(--ok); }
.rec-knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: var(--radius-full); background: oklch(1 0 0); transition: transform var(--duration-fast) var(--ease-out); }
.rec-switch[aria-checked="true"] .rec-knob { transform: translateX(12px); }

.rec-seg { display: inline-flex; padding: 2px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-sunken); }
.rec-seg-btn { height: 26px; padding: 0 12px; border-radius: var(--radius-sm); font-size: var(--text-sm); color: var(--ink-dim); }
.rec-seg-btn[aria-checked="true"] { background: var(--bg-raised); box-shadow: var(--shadow-sm); font-weight: var(--weight-medium); color: var(--ink); }

@media (max-width: 760px) {
  /* No hover on a phone: the row is the act, and the chevron is always drawn. */
  .rec-row { flex-direction: column; align-items: stretch; gap: 3px; min-height: 44px; }
  .rec-row-key { flex: none; }
  .rec-row-act { color: var(--ink-muted); }
  .rec-row:hover { background: none; box-shadow: none; }
  .rec-sheet { width: 100vw; top: auto; height: 88vh; border-left: none; border-top-left-radius: var(--radius-xl); border-top-right-radius: var(--radius-xl); }
}
```

- [ ] **Step 2: Load it in the harness**

In `apps/dashboard/src/legacy/Chanlytics.html`, beside the other stylesheet links, add:

```html
  <link rel="stylesheet" href="styles/record.css?v=1">
```

The app loads stylesheets through the Next layout; check how `settings.css` is imported there and add `record.css` the same way.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/legacy/styles/record.css apps/dashboard/src/legacy/Chanlytics.html
git commit -m "The record kit's styles"
```

---

### Task 2.2: `RecordRow` and `RecordSourceChip`

**Files:**
- Create: `apps/dashboard/src/legacy/components/record-row.jsx`
- Test: `tooling/scripts/tests/record-kit.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/record-kit.test.mjs`:

```js
/**
 * The record kit and the Business tab, EXECUTED on the stub React.
 * No source-text assertions: every claim here is something the page drew.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, classes, press } from "./_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const L = "../../../apps/dashboard/src/legacy";
Object.assign(globalThis, {
  CHANLY: { nav: () => {}, R: {} },
  canDo: () => true,
  gate: () => ({}),
  usePPToast: () => [null, () => {}],
});
await import(`${L}/components/data-bits.jsx`);
await import(`${L}/components/record-row.jsx`);
const W = globalThis.window;

test("a row draws its label, its value and one act", () => {
  const tree = fresh(() =>
    W.RecordRow({ label: "Website", value: "melanysbeautysalon.com", act: { label: "Change", onClick: () => {} } }),
  );
  assert.match(textOf(tree), /Website/);
  assert.match(textOf(tree), /melanysbeautysalon\.com/);
  assert.match(textOf(tree), /Change/);
});

test("an empty row says so and keeps its act reachable", () => {
  const tree = draw(W.RecordRow, { label: "Website", value: null, empty: "Not set", act: { label: "Add one", onClick: () => {} } });
  assert.match(textOf(tree), /Not set/);
  const row = find(tree, (n) => classes(n).includes("rec-row"));
  assert.equal(row.props["data-empty"], "true");
});

test("a source chip is the one pill, in the fact kind's tone", () => {
  const tree = draw(W.RecordRow, { label: "Address", value: "2581 Pitkin Ave", source: "verified" });
  const pill = find(tree, (n) => classes(n).some((c) => c.startsWith("pill-")));
  assert.ok(pill, "the chip is a StatePill");
  assert.ok(classes(pill).includes("pill-ok"), "verified is ok");
  assert.match(textOf(pill), /from Google/);
});

test("a disputed fact wears warn and offers the other answer", () => {
  const used = [];
  const tree = fresh(() =>
    W.RecordRow({
      label: "Address",
      value: "2581 Pitkin Avenue",
      source: "typed",
      disputed: { value: "2581 Pitkin Ave, Brooklyn, NY 11208, USA", source: "verified", onUse: () => used.push(1) },
    }),
  );
  const pill = find(tree, (n) => classes(n).includes("pill-warn"));
  assert.ok(pill, "a disagreement is warn");
  const use = find(tree, (n) => typeof n.props?.onClick === "function" && /Use Google/i.test(textOf(n)));
  press(use);
  assert.equal(used.length, 1, "the row offers the fill, it does not just record the difference");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: FAIL — `Cannot find module …/components/record-row.jsx`.

- [ ] **Step 3: Write the component**

Create `apps/dashboard/src/legacy/components/record-row.jsx`. It must:

- Render `.rec-row`, `.rec-row-key`, `.rec-row-val`, `.rec-row-act` exactly as `record.css` names them.
- Set `data-empty="true"` when there is no value.
- Draw the source through `StatePill kind="fact"` — never its own colours.
- When `disputed` is present, draw a `pill-warn` chip plus a row under the value carrying the other answer and two buttons: "Use Google's" (calls `disputed.onUse`) and "Keep mine" (calls `disputed.onKeep`). The words come from `SOURCE_WORDS` through the pill, never typed here.
- Spread `act.gate` after the handler, the way every committing control in this tree does.
- Export through `Object.assign(window, { RecordRow, RecordSourceChip })`.

Follow `data-bits.jsx`'s file shape: `/* global React */` at the top, one `const` per component, the `Object.assign(window, …)` at the bottom.

- [ ] **Step 4: Run it and watch it pass**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy/components/record-row.jsx tooling/scripts/tests/record-kit.test.mjs
git commit -m "One row, and a fact that carries where it came from"
```

---

### Task 2.3: `RecordField`, `RecordSwitch`, `RecordToggleGroup`, `RecordCombobox`

**Files:**
- Create: `apps/dashboard/src/legacy/components/record-field.jsx`
- Test: `tooling/scripts/tests/record-kit.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `record-kit.test.mjs` (add the import beside the others at the top of the file):

```js
await import(`${L}/components/record-field.jsx`);

test("a field carries its label, its unit and its refusal, wired for a screen reader", () => {
  const tree = fresh(() =>
    W.RecordField({ label: "Least notice", unit: "hours", value: "2", onChange: () => {}, hint: "Empty means no rule.", id: "lead" }),
  );
  assert.match(textOf(tree), /Least notice/);
  assert.match(textOf(tree), /hours/);
  assert.match(textOf(tree), /Empty means no rule\./);

  const bad = fresh(() =>
    W.RecordField({ label: "Booking link", value: "booksy", onChange: () => {}, problem: "Needs a full web address, starting with https://", id: "link" }),
  );
  const input = find(bad, (n) => classes(n).includes("rec-input"));
  assert.equal(input.props["aria-invalid"], true);
  assert.equal(input.props["aria-describedby"], "rec-link-problem");
  assert.match(textOf(bad), /starting with https/);
});

test("a switch is a switch, and says which state it is in", () => {
  const flips = [];
  const tree = draw(W.RecordSwitch, { on: true, label: "Never quote a price", onChange: () => flips.push(1) });
  const sw = find(tree, (n) => classes(n).includes("rec-switch"));
  assert.equal(sw.props.role, "switch");
  assert.equal(sw.props["aria-checked"], true);
  assert.equal(sw.props["aria-label"], "Never quote a price");
  press(sw);
  assert.equal(flips.length, 1);
});

test("a toggle group is a radiogroup, not a row of buttons", () => {
  const picked = [];
  const tree = fresh(() =>
    W.RecordToggleGroup({
      label: "The number to publish",
      value: "line",
      options: [{ value: "line", label: "Your line" }, { value: "other", label: "A different number" }],
      onChange: (v) => picked.push(v),
    }),
  );
  const group = find(tree, (n) => n.props?.role === "radiogroup");
  assert.equal(group.props["aria-label"], "The number to publish");
  const opts = all(tree, (n) => n.props?.role === "radio");
  assert.equal(opts.length, 2);
  assert.equal(opts[0].props["aria-checked"], true);
  press(opts[1]);
  assert.deepEqual(picked, ["other"]);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: FAIL — `Cannot find module …/components/record-field.jsx`.

- [ ] **Step 3: Write the components**

Create `apps/dashboard/src/legacy/components/record-field.jsx` with `RecordField`, `RecordSwitch`, `RecordToggleGroup` and `RecordCombobox`. Requirements:

- `RecordField` renders a `<label>` wrapping `.rec-field-label` and either a bare `.rec-input` or a `.rec-input-group` when `unit` is given. A `problem` renders the existing `window.FieldError` with id `rec-<id>-problem`, and sets `aria-invalid` and `aria-describedby` on the input. A `hint` renders only when there is no problem.
- `RecordSwitch` is a `<button role="switch">` with `aria-checked` and `aria-label`, containing `.rec-knob`. Never a `<div onClick>`.
- `RecordToggleGroup` is a `<div role="radiogroup" aria-label>` of `<button role="radio" aria-checked>`.
- `RecordCombobox` is a text input over a filtered list, keyboard-navigable with ↑/↓/Enter/Esc, `role="combobox"` with `aria-expanded` and `aria-activedescendant`. It takes `options: [{ value, label, meta }]`.
- `RecordTip({ text, label })` is the dark chip for a tip you can never click: a `<button>` carrying `data-tip`, `aria-label` and a press that calls `window.__tip.show` — the mechanism `set-mark` already uses, given a name. `RecordTipCard({ title, body, act })` (renamed from RecordCard by the Phase 2 review, so nobody takes it for the section card) is the white card with a shadow, for a tip that *does* have something to press. Two tiers, and the rule that decides between them: if there is nothing to click, it is a chip.
- `Object.assign(window, { RecordField, RecordSwitch, RecordToggleGroup, RecordCombobox, RecordTip, RecordTipCard })`.

Add one more test for the two tiers before implementing them:

```js
test("a tip you cannot click is a chip; one you can is a card", () => {
  const chip = draw(W.RecordTip, { text: "Call audio is not included.", label: "What the file holds" });
  const btn = find(chip, (n) => n.props?.["data-tip"]);
  assert.equal(btn.props["aria-label"], "What the file holds");
  assert.ok(!find(chip, (n) => classes(n).includes("rec-card-tip")), "a chip is not a card");

  const used = [];
  const card = draw(W.RecordTipCard, { title: "Google's address", body: "2581 Pitkin Ave, Brooklyn, NY 11208, USA", act: { label: "Use it", onClick: () => used.push(1) } });
  press(find(card, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Use it"));
  assert.equal(used.length, 1);
});
```

- [ ] **Step 4: Run it and watch it pass**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy/components/record-field.jsx tooling/scripts/tests/record-kit.test.mjs
git commit -m "A field, a switch and a choice, each announced as what it is"
```

---

### Task 2.4: `RecordFold`

The fold is the piece the whole page turns on, and the one-open-at-a-time rule is what stops the page becoming the old form again.

**Files:**
- Create: `apps/dashboard/src/legacy/components/record-fold.jsx`
- Test: `tooling/scripts/tests/record-kit.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
await import(`${L}/components/record-fold.jsx`);

test("a fold opens, says what the receptionist will be told, and saves only itself", () => {
  const saved = [];
  const draw = () =>
    W.RecordFold({
      id: "booking_rules",
      label: "Booking rules",
      hint: "It never books. It says which times are open and sends the link.",
      open: true,
      says: "Booking rules:\n- At least 2 hours' notice for any appointment.",
      onSave: () => saved.push(1),
      onCancel: () => {},
      children: null,
    });
  const tree = fresh(draw);
  const fold = find(tree, (n) => classes(n).includes("rec-fold"));
  assert.equal(fold.props["data-open"], "true");
  assert.match(textOf(tree), /At least 2 hours/);
  const save = find(tree, (n) => typeof n.props?.onClick === "function" && textOf(n) === "Save");
  press(save);
  assert.equal(saved.length, 1);
});

test("only one fold is open, and a dirty one is asked about before it closes", () => {
  W.__recordFolds.reset();
  assert.equal(W.__recordFolds.open(), null);
  W.__recordFolds.request("hours", { dirty: () => false });
  assert.equal(W.__recordFolds.open(), "hours");
  // A clean fold gives way without a word.
  W.__recordFolds.request("services", { dirty: () => false });
  assert.equal(W.__recordFolds.open(), "services");
  // A dirty one does not, and says which fold is holding.
  W.__recordFolds.request("notes", { dirty: () => true });
  const asked = W.__recordFolds.asking();
  assert.equal(W.__recordFolds.open(), "services", "the dirty fold stays open until it is answered");
  assert.equal(asked.wants, "notes");
  W.__recordFolds.discard();
  assert.equal(W.__recordFolds.open(), "notes");
});

test("the page knows when a fold holds unsaved changes", () => {
  W.__recordFolds.reset();
  W.__recordFolds.request("hours", { dirty: () => true });
  assert.equal(W.__settingsUnsaved(), true);
  W.__recordFolds.reset();
  assert.equal(W.__settingsUnsaved(), false);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: FAIL — `Cannot find module …/components/record-fold.jsx`.

- [ ] **Step 3: Write the component and the registry**

Create `apps/dashboard/src/legacy/components/record-fold.jsx`:

- `RecordFold({ id, label, hint, open, says, onSave, onCancel, saving, children })` renders `.rec-fold[data-open]` with `.rec-fold-head` (label, hint, a Close button), `.rec-fold-body` holding `children`, a `.rec-fold-says` block when `says` is a non-empty string, and `.rec-fold-foot` with Save and Cancel.
- `window.__recordFolds` is the registry, a plain object with `open()`, `request(id, { dirty })`, `asking()`, `discard()`, `close()` and `reset()`. `request` opens immediately when nothing is open or the open fold is clean; when the open fold is dirty it records `{ holding, wants }` and leaves the open fold alone until `discard()` or `close()` answers it.
- `window.__settingsUnsaved = () => <the open fold is dirty>` — replacing the whole-form guard `BusinessEditor` installed. Keep the `beforeunload` listener the editor had, driven by the registry.
- `Object.assign(window, { RecordFold })` plus the registry.

- [ ] **Step 4: Run it and watch it pass**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy/components/record-fold.jsx tooling/scripts/tests/record-kit.test.mjs
git commit -m "A fold opens under its row, and only one at a time"
```

---

### Task 2.5: `RecordSheet`

**Files:**
- Create: `apps/dashboard/src/legacy/components/record-sheet.jsx`
- Test: `tooling/scripts/tests/record-kit.test.mjs`

- [ ] **Step 1: Write the failing test**

Append:

```js
await import(`${L}/components/record-sheet.jsx`);

test("a sheet is a dialog with a name, a close and a foot that holds still", () => {
  const closed = [];
  const tree = fresh(() =>
    W.RecordSheet({
      title: "What you offer",
      sub: "Names and rough timings. A price only if you can state it flatly.",
      onClose: () => closed.push(1),
      foot: null,
      children: null,
    }),
  );
  const sheet = find(tree, (n) => classes(n).includes("rec-sheet"));
  assert.equal(sheet.props.role, "dialog");
  assert.equal(sheet.props["aria-modal"], true);
  assert.ok(sheet.props["aria-label"] === "What you offer" || sheet.props["aria-labelledby"]);
  const close = find(tree, (n) => n.props?.["aria-label"] === "Close");
  press(close);
  assert.equal(closed.length, 1);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: FAIL — `Cannot find module …/components/record-sheet.jsx`.

- [ ] **Step 3: Write the component**

Create `apps/dashboard/src/legacy/components/record-sheet.jsx`:

- `RecordSheet({ title, sub, onClose, tools, foot, children })` renders `.rec-sheet[role="dialog"][aria-modal]` with `.rec-sheet-head`, an optional tools strip, a scrolling `.rec-sheet-body` and a sticky `.rec-sheet-foot`.
- Esc closes. Focus moves to the sheet on open and returns to the opener on close.
- Registers in `PL_OVERLAY` so People's row-cursor keys hold still while it is open — the same courtesy the phone's lists sheet takes.
- `Object.assign(window, { RecordSheet })`.

- [ ] **Step 4: Run it and watch it pass**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/record-kit.test.mjs
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy/components/record-sheet.jsx tooling/scripts/tests/record-kit.test.mjs
git commit -m "A sheet for a list you scroll"
```

---

### Task 2.6: Both load lists

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/manifest.ts`
- Modify: `apps/dashboard/src/legacy/Chanlytics.html`

- [ ] **Step 1: Add the four files to the manifest**

In `apps/dashboard/src/legacy-bridge/manifest.ts`, after the `data-bits.jsx` line (the kit depends on `StatePill` and `FieldError`) and before the chart kit:

```ts
import "@/legacy/components/record-row.jsx";
import "@/legacy/components/record-field.jsx";
import "@/legacy/components/record-fold.jsx";
import "@/legacy/components/record-sheet.jsx";
```

- [ ] **Step 2: Add the same four to the harness, in the same order**

In `apps/dashboard/src/legacy/Chanlytics.html`, after the `data-bits.jsx` line:

```html
  <script type="text/babel" src="components/record-row.jsx?v=1"></script>
  <script type="text/babel" src="components/record-field.jsx?v=1"></script>
  <script type="text/babel" src="components/record-fold.jsx?v=1"></script>
  <script type="text/babel" src="components/record-sheet.jsx?v=1"></script>
```

- [ ] **Step 3: Run the harness pin and the whole suite**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/legacy-harness.test.mjs
corepack pnpm test
```

Expected: both green. If `legacy-harness` fails, the two lists differ in order or content — fix the list, not the test.

- [ ] **Step 4: Typecheck, commit, open the PR**

```bash
corepack pnpm -r typecheck
git add apps/dashboard/src/legacy-bridge/manifest.ts apps/dashboard/src/legacy/Chanlytics.html
git commit -m "The record kit loads in both lists"
gh pr create --title "One row, one field, one fold, one sheet" --body "$(cat <<'EOF'
The record kit, shaped like the charts kit: its own files, its own stylesheet,
both load lists, and it knows nothing about any page.

- `RecordRow` replaces four classes that drew one row (`.cl-prof-attr`,
  `.set-row`, `.set-team-row`, `.set-int-row`) and carries a fact's source as
  the one pill, in the `fact` kind added last PR.
- `RecordField` wraps the existing `FieldError` and its aria wiring.
- `RecordFold` is the editing gesture, with one-open-at-a-time and a dirty
  guard that narrows `__settingsUnsaved` from a whole form to one section.
- `RecordSheet` is the list you scroll.

Nothing uses the kit yet. Spec: `docs/superpowers/specs/2026-09-20-business-tab-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 3 — The page (PR 3: "Business is a record")

The big one. The new page lands whole and `BusinessEditor` is deleted in the same commit, because two editors writing one versioned config is how they drift.

> **How Phase 3 runs (21 Sep, before it started).** Four changes to the tasks below, each for a reason the tasks did not have in view:
> 1. **The order is 3.1, 3.2, 3.6, 3.3, 3.4, 3.5, 3.7, 3.8.** Every fold in 3.3–3.5 saves through Task 3.6's helpers, so they come first, and 3.6's patch test is red before any fold can save.
> 2. **The test code draws as the kit's tests draw.** `fresh(() => …)` draws nothing (Phase 2's correction, above). `drawTab` draws with `unmount()` then `W.React.createElement(W.BusinessTab, { flash })`, and a redraw is `again(() => W.React.createElement(W.BusinessTab, props))`, as `record-kit.test.mjs` does.
> 3. **`PromptPreview` stays until Phase 5.** Task 3.7 deleted it, but what replaces it is Phase 5's prompt sheet, so between the two PRs an owner could not read what the receptionist is told. That view exists because a live salon lost its prompt unseen. Task 5.1 deletes it, with its `set-prompt-*` styles and `prompt-preview.test.mjs`, in the PR that brings the sheet.
> 4. **Nothing `BusinessEditor` does is lost with it.** It does two things no task names. It creates the receptionist on a workspace that has none (the unconfigured card's *Set up the receptionist*), and Task 3.7 builds that as a fold of the new page, asking for what the old create form asked for. And it holds the four guardrail switches and the vision switch, which Task 3.5 builds as the *Rules it always keeps* fold: one `rec-rule-<key>` row per switch and the vision switch under a separator, for Phase 4's Task 4.2 to draw at three strengths.

**Every "run it" step from here on is this command**, so it is not repeated in each step:

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-page.test.mjs
```

A failing step fails with the assertion the previous step wrote. A passing step passes it and every test written before it — if an earlier test goes red, stop: the page has lost a behaviour, and that is the thing this plan exists to prevent.

### Task 3.1: The bridge publishes the view models

> **Changed in execution (21 Sep).** The steps below are the plan as written. What shipped differs in four ways. The first is why the others follow. The edge never calls `composeSystemPrompt` on its own. It calls `resolveSystemPrompt`, which decides what composing skips. A record whose profile holds nothing it composes from (`hasProfile`) is answered with its stored prompt, and a cleared box has that prompt carried into it. The Autonomy rows become rules, and the number it gives out is the provisioned line unless one is typed. Composing the draft showed a rules-only record five rules, a notice period and a hand-off token it is never sent.
> 1. `consequenceOf(section, next, channel)` takes the whole brain the fold's save would send, and a required channel. It parses `next` with `BrainConfigSchema` and resolves it with `resolveSystemPrompt`. The zone, the Autonomy rows and the platform's facts come from the settings read's preview, whose `PromptPreviewDto` now carries them as `inputs`. It cuts the result with the brain as `promptBlocks`' source. It is null for a draft that does not parse, with no preview (the same cases the preview is null for), and when the resolver writes no such block. An unknown fold or channel is a `TypeError` naming it.
> 2. `FOLD_BLOCK` also maps the inline rows: the identity rows to `identity`, `consult_first` to `booking_rules`, `handoff_number` to `handoff`. Each real row no draft of the brain can show gets an explicit null with its reason. `fallbacks`, `calendar` and `vision` never reach the cached prompt. `timezone` does, but it is the workspace's, not a key of the brain.
> 3. The helpers live in their own module, `legacy-bridge/business-tab.ts`, shaped like `today.ts` and installed beside `installToday`, not in `inbox-verbs.ts`, which is a courier. The harness gets the same object as `data/business-tab.js`, built by `serve-legacy.mjs`.
> 4. The page's tests need a brain that parses (a `system_prompt` and `fallbacks`) and a `prompt` built with `composePromptPreview`, or every fold's block is null. Task 3.2's `settings()` below carries both.

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/inbox-verbs.ts` (which already publishes `__composedPrompt`)

- [ ] **Step 1: Publish them**

Beside `window.__composedPrompt`, add:

```ts
// promptBlocks lives in contracts' prompt-blocks.ts since the Phase 1 review; the package exports it as before.
import {
  standingLine, abilityRows, cannotRows, bookingHeld, bookingTemplate, ruleStrength, GUARDRAIL_KEYS,
  promptBlocks, composeSystemPrompt, type PromptBlockVM,
} from "@chanlytics/contracts";

/**
 * The prompt block each fold writes into. A fold is named for the keys it saves; a block
 * for the heading the composer writes it under (PROMPT_OPENINGS, cut by prompt-blocks.ts),
 * and some folds share one. The voice and the languages are lines of "Who you are"; the
 * hand-off's reasons compose under the one hand-off heading on either channel, as the
 * transfer number does. The fallbacks are sent when the model cannot be reached and are
 * never part of the prompt, so their fold has no block.
 */
const FOLD_BLOCK: Record<string, string | null> = {
  tone: "identity",
  languages: "identity",
  hours: "hours",
  closures: "closures",
  services: "services",
  booking_rules: "booking_rules",
  notes: "notes",
  escalate_when: "handoff",
  guardrails: "guardrails",
  extra_instructions: "extra_instructions",
  fallbacks: null,
};

/**
 * What one fold will add to the prompt.
 *
 * Composed with the same function the edge runs, over the draft as the fold
 * currently holds it, so a fold shows exactly what the receptionist will be
 * told and nothing the page invented. A section the composer writes nothing
 * for — a rule with no lines, an empty list — returns null, and the fold
 * simply draws no block rather than an empty one.
 */
function consequenceOf(
  section: string,
  draft: { brain: { business_name: string; phone_display?: string | null; booking_link: string }; profile: Record<string, unknown> },
  channel: "whatsapp" | "voice" = "whatsapp",
  tz?: string | null,
): PromptBlockVM | null {
  const row = FOLD_BLOCK[section] ?? null;
  if (!row) return null;
  const text = composeSystemPrompt(draft.brain, draft.profile as never, channel, tz ?? null);
  // Composed from the draft, and the composer never carries the stored prompt in,
  // so the words to look for are the draft's own: `{ profile }`, not the stored
  // brain. Whose words they are is whoseWords' (config.ts), the decision the
  // instructions box reads too.
  return promptBlocks(text, channel, { profile: draft.profile as { extra_instructions?: string | null } }).find((b) => b.row === row) ?? null;
}

window.__businessTab = { standingLine, abilityRows, cannotRows, bookingHeld, bookingTemplate, ruleStrength, GUARDRAIL_KEYS, promptBlocks, consequenceOf };
```

- [ ] **Step 2: Declare it on the Window type**

Beside the existing `__composedPrompt: typeof composedPrompt;` entry in this file's `Window` interface:

```ts
    __businessTab: {
      standingLine: typeof standingLine;
      abilityRows: typeof abilityRows;
      cannotRows: typeof cannotRows;
      bookingHeld: typeof bookingHeld;
      bookingTemplate: typeof bookingTemplate;
      ruleStrength: typeof ruleStrength;
      GUARDRAIL_KEYS: typeof GUARDRAIL_KEYS;
      promptBlocks: typeof promptBlocks;
      consequenceOf: typeof consequenceOf;
    };
```

- [ ] **Step 3: Typecheck and commit**

```bash
corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck
git add apps/dashboard/src/legacy-bridge/inbox-verbs.ts
git commit -m "The bridge hands the page its sentences"
```

---

### Task 3.2: The page — the standing line and *Who you are*

**Files:**
- Create: `apps/dashboard/src/legacy/pages/business-tab.jsx`
- Test: `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the shared harness and the failing test**

Create `business-tab-page.test.mjs`. It is the page's own file: the kit's tests moved to `record-kit.test.mjs` in the Phase 2 review, so a page change cannot break them. Open it as `record-kit.test.mjs` opens: `installLegacyReact` with the chrome bridge's `stateOf`, the page's globals, `data-bits.jsx` and the four `record-*.jsx` files imported, and its `draw`, which unmounts the last tree as React replaces one.

Then add the fixture and the three helpers every later task reuses, after the imports:

```js
import { standingLine } from "@chanlytics/contracts";
// The settings read's own preview, built as the server builds it: a fold's draft is resolved with its inputs (Task 3.1).
const { composePromptPreview } = await import("../../../apps/dashboard/src/server/prompt-preview.ts");

/** Melany's Beauty Salon, the live tenant, as the surface hands it over. */
const melany = {
  address: "2581 Pitkin Ave, Brooklyn, NY 11208",
  website: "https://melanysbeautysalon.com",
  tone: "Warm and unhurried.",
  languages: ["English", "Spanish"],
  hours: { mon: { open: "09:30", close: "18:00" }, tue: { open: "09:30", close: "18:00" }, wed: { open: "09:30", close: "18:00" }, thu: { open: "09:30", close: "18:00" }, fri: { open: "09:30", close: "19:00" }, sat: { open: "09:30", close: "19:00" }, sun: {} },
  services: [{ name: "Balayage", duration_min: 180, price_note: "quoted at consult" }, { name: "Highlights", duration_min: 45, price_note: "quoted at consult" }],
  notes: [{ title: "Walk-ins", text: "Walk-ins are welcome; appointments are recommended for long services." }],
  escalate_when: ["They ask for a person, for Melany or for the owner", "They are upset, or have a complaint"],
  booking_rules: { lead_hours: 2, slot_min: 30, max_days_ahead: 14, party_max: 4, consult_first: ["Color correction", "Extensions"] },
  guardrails: { never_quote_prices: true, never_confirm_booking: true, disclose_ai: true, no_health_advice: true },
  handoff_number: "+16469325775",
};

/** The brain as stored. It parses, as every saved one does, or consequenceOf resolves nothing from it. */
const brainOf = (profile) => ({
  business_name: "Melany's Beauty Salon",
  booking_link: "https://booksy.com/en-us/1817434",
  system_prompt: "You are the WhatsApp assistant for Melany's Beauty Salon. Answer warmly and briefly.",
  fallbacks: { greeting: "Hi! Someone will be with you shortly.", error: "Sorry, something went wrong on our side.", non_text: "Thanks, a person will look at this." },
  profile,
});

const settings = (profile = melany, over = {}) => ({
  version: 7,
  config: { brain: brainOf(profile), calendar: { ical_url: "https://app.chanlytics.com/api/v1/calendar/filler.ics" }, ...over },
  // Beside the config, the settings read hands over its preview, with the inputs it was resolved with.
  prompt: composePromptPreview(brainOf(profile), {
    tz: "America/New_York",
    policy: {},
    known: { workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York" }, channels: [{ kind: "voice", number_e164: "+13083368109", status: "active" }], listing: null },
    openings: null,
  }),
});

const facts = (over = {}) => ({
  facts: {
    business_name: { value: "Melany's Beauty Salon", source: "verified" },
    phone_display: { value: "+1 (308) 336-8109", source: "provisioned" },
    booking_link: { value: "https://booksy.com/en-us/1817434", source: "typed" },
    address: { value: "2581 Pitkin Ave, Brooklyn, NY 11208", source: "verified" },
    website: { value: "https://melanysbeautysalon.com", source: "typed" },
    handoff_number: { value: "+16469325775", source: "typed" },
    voice_line: { value: "+13083368109", source: "provisioned" },
    whatsapp_line: { value: "+13083368109", source: "provisioned" },
    ...(over.facts ?? {}),
  },
  conflicts: over.conflicts ?? [],
});

/** Draw the tab over a given record. Every later test uses this. */
const drawTab = ({ profile = melany, conflicts = [] } = {}) => {
  W.__SETTINGS = settings(profile);
  W.__FACTS = facts({ conflicts });
  W.__WORKSPACES = [{ id: "t-melany", name: "Melany's Beauty Salon", timezone: "America/New_York" }];
  W.__ACTIVE_WORKSPACE = "t-melany";
  return fresh(() => W.BusinessTab({ flash: () => {} }));
};

/** Press a row's act, which is what opens its fold. */
const openFold = (tree, row) => press(byTestId(tree, `rec-row-act-${row}`));

/** Type into a fold's field, the way a person does. */
const typeInto = (tree, row, text) => {
  const input = find(byTestId(tree, `rec-fold-${row}`), (n) => classes(n).includes("rec-input"));
  input.props.onChange({ target: { value: text } });
};
```

Then the tests:

```js
test("the standing line says what contracts said, and never writes its own", () => {
  const tree = drawTab({ profile: melany });
  const band = byTestId(tree, "rec-standing");
  const vm = standingLine(W.__SETTINGS.config.brain);
  assert.match(textOf(band), new RegExp(vm.can.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(textOf(band), new RegExp(vm.wont.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(vm.missing, null, "Melany's record is missing nothing");
});

test("a missing voice is named in the band, and the link opens its row", () => {
  const tree = drawTab({ profile: { ...melany, tone: undefined } });
  const band = byTestId(tree, "rec-standing");
  assert.match(textOf(band), /no voice of its own/i);
  assert.ok(find(band, (n) => typeof n.props?.onClick === "function"), "the gap carries its own door");
});

test("Who you are draws seven rows, in the spec's order", () => {
  const card = byTestId(drawTab({ profile: melany }), "rec-card-who");
  const keys = all(card, (n) => classes(n).includes("rec-row-key")).map(textOf);
  assert.deepEqual(keys, [
    "Name", "Address", "Website", "Booking link", "Answers on", "Tells customers to call", "Transfers a caller to",
  ]);
});

test("the Workspace row is gone, whatever the workspace is called", () => {
  const same = drawTab({ profile: melany });
  assert.equal(byTestId(same, "rec-row-workspace"), null);
  W.__WORKSPACES = [{ id: "t-melany", name: "Billing probe", timezone: "America/New_York" }];
  const different = again(() => W.BusinessTab({ flash: () => {} }));
  assert.equal(byTestId(different, "rec-row-workspace"), null, "a second name for the business is not a row");
});

test("the line it answers is shown, never offered as a box", () => {
  const row = byTestId(drawTab({ profile: melany }), "rec-row-voice_line");
  assert.equal(byTestId(row, "rec-row-act-voice_line"), null, "nothing here is typed");
  const door = find(row, (n) => typeof n.props?.onClick === "function");
  assert.ok(door, "one link to Connections");
});

test("the carrier record is named once, at the foot", () => {
  const card = byTestId(drawTab({ profile: melany }), "rec-card-who");
  const mentions = all(card, (n) => typeof n.props?.children === "string" && /Connections/.test(n.props.children));
  assert.equal(mentions.length, 1, "asked once, said once");
  assert.match(textOf(byTestId(card, "rec-who-foot")), /legal name/i);
});

test("a conflict sits on the row it is about, and there is no banner", () => {
  const conflict = {
    fact: "phone_display",
    severity: "serious",
    used: "+1 (646) 932-5775",
    known: "+1 (308) 336-8109",
    knownSource: "provisioned",
    sentence: "Your receptionist tells customers to call +1 (646) 932-5775, but it answers on +1 (308) 336-8109.",
    to: "admin/workspace",
  };
  const tree = drawTab({ profile: melany, conflicts: [conflict] });
  assert.equal(byTestId(tree, "set-conflict-banner"), null, "the banner above the card is gone");
  const row = byTestId(tree, "rec-row-phone_display");
  assert.match(textOf(row), new RegExp(conflict.sentence.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(find(row, (n) => classes(n).includes("pill-warn")), "and it wears warn, because a person settles it");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-page.test.mjs
```

- [ ] **Step 3: Write the page's first half**

Create `apps/dashboard/src/legacy/pages/business-tab.jsx`. It composes `RecordRow` for every fact and reads every sentence from `window.__businessTab`. The inline editor for a single value is one small local component, `RecordInline`, built on `RecordField` and `useFieldSave` — move `useFieldSave` out of `settings.jsx` into this file unchanged, and have `settings.jsx` take it from `window`.

- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy/pages/business-tab.jsx tooling/scripts/tests/business-tab-page.test.mjs
git commit -m "Who you are, as rows"
```

---

### Task 3.3: *When you're open*

> **Carried from the reviews of Tasks 3.1 and 3.2 (21 Sep). Do these first: they are the kit's and the bridge's, and every fold after this one copies them.**
> - **The fold is level with the inline editor.** `RecordFold` passes `RecordSays` only `says` and `saysLabel`: no lines that will no longer be said, and no sentence for a save that crosses `hasProfile`. Hours, services, the voice, languages, notes and the hand-off reasons all count for `hasProfile`, so their folds need both. And `note` means the foot's line on `RecordFold` but the crossing sentence on `RecordInline`: rename one.
> - **A save in progress is not an open, unsaved editor.** The box stays editable while Save says "Saving…", and what is typed then is dropped without a word when the save lands. The rail's "Leave without saving?" and another row's "Discard your changes?" still ask, and a yes does not stop the save. Make the fields read-only while a save is out, and block the question or change its words.
> - **Focus returns only when it was lost, and to where the person was.** The "Keep editing" refocus fires whenever an ask goes away, typing included, so the caret jumps after the first keystroke; and it returns to the first field, which is wrong for a fold of many fields.
> - The fold's head Close still cancels while a save is out, unlike the foot's Cancel and Esc. `useRecordFold`'s usage comment still draws the Confirm outside the fold; it should show `confirm=`, or a fold built from it gets no focus return. The hidden inline editor draws its own dispute line with an id, so `rec-row-<id>-other` is in the page twice while a disputed row is at rest.
> - **The timezone.** Saving a zone (`window.__workspace.setTimezone`, `PATCH workspaces`) never re-reads settings, so the preview's zone, every fold's consequence and the prompt card keep the old one until something else is saved. Add `"PATCH workspaces": () => [settingsOverride]` to `legacy-bridge/refresh-map.ts`'s `AFTER` table, with a test that the preview's zone follows a zone change. The timezone row's consequence is the local time beside it (spec 4.3), not a prompt block (`FOLD_BLOCK.timezone` is null on purpose: the zone is the workspace's, not the brain's); amend the spec's section 5 to say so.
> - **Every fold saves through Task 3.6's helpers and the page's one saver** (`window.__businessTabSave`): `draftOf` on the saver's base as it opens, kept as `opened`; on Save `saveProblems(fold, base, draft)` (the page's own checks and the save's schema, the page's sentence winning), each sentence under its field, and nothing sent while it holds one; then `saver.save(foldJob(fold, draft, { opened, said, done, flash }))`, never a hand-written patch. `holdsChanges` is its unsaved-changes test for `useRecordFold`. It calls `consequenceOf` only while it is open, on `saveFold(fold, saver.base(), draft).brain`. A list offers no Add past its count in `LIMITS`, and a number box takes its range from `RULES`.
> - **One helper for what a fold will say.** The inline rows work out their "It will say" in `business-tab.jsx` (the base, the patched brain, `profileCrossing`, the block cache per base). Lift that into one helper before the folds copy it twelve times.

> **Changed in execution (21 Sep).** The steps below are the plan as written. What shipped differs in these ways, and Tasks 3.4 and 3.5 build on them.
> 1. **The carried items landed first, one commit each.** `RecordFold` takes `gone`, `goneLabel` and `note` through the one `RecordSays`, and its foot's line is `footNote`. `useRecordFold(id, { dirty, saving })` binds a second test: a fold whose save is out never gives way at once, the ask is recorded and not drawn while the gesture saves, and the save's answer is the answer (taken, the one asked for opens; refused, the question is drawn). The rail asks "Leave while this saves?" through `window.__settingsSaving`. Every kit control takes `readOnly`. Focus goes back only when it was lost, to the last field it was in. Two page tests that put a save out under another row's open editor now put it out through the saver.
> 2. **`willSay({ was, next, sections, channel })`** is the one helper (`business-tab-folds.jsx`, on `window.__businessTabSave`). It answers `{ note, added, removed, whole }`: a row draws `added` and `removed`, a fold draws `whole` under "Your receptionist will be told" and `removed` under "It will no longer be told". A block the save takes away whole goes line by line, unless the record stops composing, where the sentence says all of it. A draft the save's schema refuses says nothing.
> 3. **`BtFold` is the page's fold** (`business-tab.jsx`, the twin of `BtRow`, on `window`): the draft, the two checks, the one job, the two asks and `willSay`, once for every fold. A card hands it `row` (what the row says at rest) and `body({ draft, update, undo, press, problems, readOnly })`. On Save it asks the page's own checks first, because a shift typed half-way is dropped by the save and a week that "changes nothing" for that reason must be refused, not closed; then nothing to write closes; then the schema. A fold nobody typed in closes at once. `undo(fn)` is a toast's Undo that does nothing once the fold has closed. Three rules every body copies (Task 3.3's review): `update` answers whether it took the change, and a body toasts only when it did (a remove pressed under "Saving…" said it had removed a shift that was still there); every add and remove spreads `press(fn)`, which refuses while the fold saves the way Save does; and the fold's unsaved-changes test, for the registry and for Cancel, is "the draft is not the one it opened with", never `holdsChanges`, which judges only what Save would send, so a service row with no name is asked about before it is thrown away.
> 4. **The card is a file of its own**, `pages/business-tab-open.jsx`, loaded between `business-tab-folds.jsx` and `business-tab.jsx` (both load lists), as Today's bands are files of their own. Tasks 3.4 and 3.5 may do the same. Inside a fold, rows that come and go (a day's shifts, the closed days) are drawn hookless, as plain boxes wearing the kit's `rec-input`, and the week's one menu is always drawn: the stub React's hook order.
> 5. **Two sentences with a number moved to contracts**: `openWeekWords(hours, tz)` ("Six days a week, in New York time") and `closuresAheadWords(closures, tz, now)` ("2 ahead · next Dec 24 – 26 · Christmas"), published on `__businessTab`. The closures' dates and the ahead rule are the Calendar's own, lifted out of `toCalendarVM` as `closureDatesLabel` and `closuresFrom`.
> 6. **The calendar's last read** is the Calendar surface's (`window.__CALENDAR`, contracts `toCalendarVM`), drawn with the Calendar page's own pill and `feed.detail`. That surface boots on every route, so nothing is warmed for it to exist; but its "read 4m ago" is counted from the moment IT was read, so the row states a read only for as long as the Calendar page itself keeps one (its `CR_REFRESH_MS`, five minutes, published with that page's words for a read that gives no reason as `window.__calendarPage`). One timer, set for the moment the read stops being fresh, draws the row again; it then asks `window.__calendar.refresh()`, keeps the last read where it is, dimmed, while that is on its way, and says so where the read would be if it fails.
> 7. **The summary is `window.__hoursLines` joined as `hoursSummary` joins it.** `hoursSummary` is a module-level `const` of settings.jsx, which no other file can reach in the app, and it was not moved or published.
> 8. **The ribbon's names are the page's.** The tests below first named them `rec-ribbon-day`, `rec-ribbon-bar` and `rec-hours-ribbon`, before the kit was cut, and the page shipped them under the kit's prefix; Task 3.3's quality review renamed them `bt-ribbon-day`, `bt-ribbon-bar` and `bt-hours-ribbon`, and the tests with them, since they live in settings.css and the kit knows nothing of a week. The fold's label column is `--bt-week-key`, not a literal.
> 9. **The tests** draw with `drawTab`/`redrawTab`, open the week's menu before pressing a copy (`MoreMenu` draws its items only while open, and they carry no test ids, so the copies are found by their words, not by the plan's `rec-hours-copy-all`), and build the Calendar surface with contracts' `toCalendarVM`.

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/business-tab.jsx`
- Create: `apps/dashboard/src/legacy/pages/business-tab-open.jsx` (both load lists)
- Test: `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { hoursLines } from "@chanlytics/contracts";

/** The card's summary is the composer's own run-collapsing, joined. Never a second implementation. */
const summaryOf = (hours) => hoursLines(hours).join(" · ");

test("the ribbon draws the week, and a closed day carries no bar", () => {
  const ribbon = byTestId(drawTab({ profile: melany }), "bt-hours-ribbon");
  const days = all(ribbon, (n) => classes(n).includes("bt-ribbon-day"));
  assert.equal(days.length, 7);
  const sunday = days[6];
  assert.equal(find(sunday, (n) => classes(n).includes("bt-ribbon-bar")), null, "Sunday is shut, and looks it");
});

test("the summary sentence is the one the composer wrote", () => {
  const row = byTestId(drawTab({ profile: melany }), "rec-row-hours");
  assert.match(textOf(row), new RegExp(summaryOf(melany.hours).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("copying a day says what it opened and what it overwrote, and puts it all back", () => {
  const flashes = [];
  W.__SETTINGS = settings(melany);
  W.__FACTS = facts();
  const tree = fresh(() => W.BusinessTab({ flash: (f) => flashes.push(f) }));
  openFold(tree, "hours");
  press(byTestId(again(() => W.BusinessTab({ flash: (f) => flashes.push(f) })), "rec-hours-copy-all"));

  const said = flashes.at(-1);
  assert.match(textOf({ props: { children: said.msg } }), /Sun/, "the day that was closed is named");
  assert.match(textOf({ props: { children: said.msg } }), /Fri|Sat/, "and the days whose own hours went");
  assert.equal(typeof said.undo, "function", "the whole grid goes back in one press");

  said.undo();
  const after = again(() => W.BusinessTab({ flash: () => {} }));
  const days = all(byTestId(after, "bt-hours-ribbon"), (n) => classes(n).includes("bt-ribbon-day"));
  assert.equal(find(days[6], (n) => classes(n).includes("bt-ribbon-bar")), null, "Sunday is shut again");
});

test("the calendar row states its last read, and there is no button for it", () => {
  const tree = drawTab({ profile: melany });
  const row = byTestId(tree, "rec-row-calendar");
  assert.match(textOf(row), /read/i);
  assert.equal(find(row, (n) => /Check the address/i.test(textOf(n))), null, "a row that can say it needs no button");
});
```

**Do not move `hoursSummary`.** It is already a two-line wrapper over `window.__hoursLines`, which is contracts' own `hoursLines` — the composer's run-collapsing, published by the bridge. Its comment says why that matters: two copies of "which days share the same hours" is how the card and the receptionist start disagreeing on the one screen an owner glances at. The new page calls the same wrapper; the test reads `hoursLines` straight from contracts, as above.

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

Port `hoursSummary`, `applyToAll`, `sameShifts`, `toggleDay`, `addShift`, `removeShift` from `BusinessEditor` unchanged in behaviour — their comments carry a year of hard-won decisions, including the salon that lost its Sundays. The fold's body is the week-on-one-scale layout from `Group-Open.dc.html`.

- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -am "The week has a shape"
```

---

### Task 3.4: *What you offer*, and the services sheet

> **Noted 21 Sep, in Task 3.2's review.** `RecordSheet` holds four hooks and exists only while open, so on the tests' stub React it must be the page's last hook-holding child, or every row after it reads shifted cells. And the standing line's `services` door must open the services sheet, which the fold registry does not open.

> **Changed in execution (21 Sep).** The steps below are the plan as written. What shipped differs in these ways, and Task 3.5 builds on them.
> 1. **Task 3.3's re-review landed first, in one commit.** A calendar save whose re-read fails says so with its Retry, where the row had gone blank for good (`before` was asked ahead of `failed`); a `BtRow` with a `door` and no `commit` offers no press on a disagreement; `.bt-week-copy` sits at a phone's edge; and `BtFold`'s contract says a list is changed through `rows()`, never `update`.
> 2. **The sheet is the same editor as a fold, and the registry opens it.** `BtFold`'s body was lifted out whole, hooks in the same order, as `useBtEditor` (business-tab-gestures.jsx), and `BtFold` and a new `BtSheet` both draw it. `BtSheet` holds the registry under its id (`useRecordFold("services")`, inside the editor) and is open while the registry says so, so the note above no longer holds: the standing line's door opens it by its id with no special case, opening it with a dirty fold open asks, and opening a fold with the sheet dirty asks in the sheet, above its Save. `BtSheet` also counts itself on the page (`drawn`), so the rail's "Yes, leave" lets go of it and it does not reopen with the tab. `rows()` is not copied: `removeAt` now answers the Undo it toasted, which the sheet also offers where the row was; either puts the row back once. Since the spec review, a row goes back between the same two rows it was taken from, whatever else was taken out or put back since: `rows()` keeps every waiting put-back in the list's order and moves it with the rows around it, and the sheet draws its Undos from `waiting()`. (Each once kept the index its row had when it went, so Service 6 out, then Service 3, put Service 6 back between 7 and 8.) `willSay` answers `chars`, the blocks' share of the prompt, and `total`, the length of the whole prompt the draft would give, which `consequenceOf` returns with the block, so the share is after the save on both sides of the division. `WRITTEN_ROWS` is published so the foot and Save count the rows the save writes. The consult-first mark and the search are contracts' own rules, `needsConsultation` and `foldName`, published on `__businessTab`, and the services row offers its act only while the sheet could open (`BtSheet.opens`), as a fold does.
> 3. **The page draws the sheet, after every card** (`window.BtServicesSheet`, business-tab.jsx), not the offer card. Of the two ways the brief allowed, this is the one that survives Task 3.5 and Phase 4: *How it answers* and *What it can do* come after *What you offer*, so the card will not stay the page's last. The card's services row asks the registry for `"services"`, as the door does. A test breaks it both ways (the sheet moved before *When you're open* fails 18 tests).
> 4. **The kit grew four things** (record-sheet.jsx, record-fold.jsx, record-row.jsx, record.css): `RecordSheet` takes `focusOn` (a row just added, or the Undo left where one was taken out, takes focus) and `busy` (aria-busy, which record.css draws its boxes read-only by, as a fold's), and after every draw it takes back focus that went with what held it, which landed on the page's body behind the modal; `RecordFoot` is on window for a sheet's Save; `RecordChips` and `.rec-chip` are the row of chips the plan's test counts, which the kit did not have.
> 5. **The sheet's rows are `RecordBox`es, not `RecordField`s**: they come and go before `RecordSheet`'s own hooks, so they hold none. The search hides a row it leaves out (`hidden`), never unmounts or reorders it, and never hides a row changed since the sheet opened, so a name typed over until it no longer matches does not take its box out of sight. The page's classes wear the page's prefix (`bt-service-row`, not the plan's `rec-service-row`), as Task 3.3 renamed the ribbon; the test ids are the plan's (`rec-service-remove-<i>`). "N more below" was skipped; it is Task 6.3's step 1b to build or drop.
> 6. **Six view models in contracts** (business-tab.ts, on `__businessTab`): `servicesWords` (the count, four chips, and how they are priced, judged by `violatesNoPrices`, the replies' own detector), `blockShareWords`, `servicesToldWords`, `servicesSaveWords`, `bookingRulesWords` and `BOOKING_RULE_HINTS`.
> 7. **Words the canvas had that were not true.** An empty least notice is two hours' (availability.ts `BOOKING_DEFAULTS`, which `freeWindows` applies), so its hint is "Empty uses 2 hours.", not "Empty means no rule."; days ahead gains "Empty uses 14."; a record with none of the five set says the calendar's own rules, not "no rule"; and the fold's foot says "Saves these five rules and the notes, and nothing else on the page.", since it saves the notes too. The refusals were the old form's, and two said "leave it empty for no rule" of a rule with a default, in the hint's place under a box whose hint says otherwise; since the spec review each says what empty uses, worked out from `BOOKING_DEFAULTS` (published on `__businessTab`) and the rule's own range ("Least notice is 0 to 168 hours; leave it empty to use 2."). The rule boxes take no `min`/`max`, which a text box ignores.
> 8. **The tests** are `business-tab-offer.test.mjs` (34 after the review), drawn with `drawTab`/`redrawTab`; the plan's search test counts the rows shown, since the hidden ones stay in the tree, and its booking-rules test reads `consequenceOf("booking_rules", saveFold(…).brain, "whatsapp")`, per Task 3.1's note. Ten deliberate breaks were each caught. Task 3.7's Playwright journey should add the sheet's focus paths, which the stub cannot see: after a remove, focus on the Undo left in its place; after that Undo, the row's first box; after Add, the new row's first box; and never on the page's body while the sheet is open.

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/business-tab.jsx`
- Test: `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
const many = { ...melany, services: Array.from({ length: 33 }, (_, i) => ({ name: `Service ${i + 1}`, duration_min: 30 + i, price_note: "quoted at consult" })) };

test("the services row counts them and says how they are priced", () => {
  const row = byTestId(drawTab({ profile: many }), "rec-row-services");
  assert.match(textOf(row), /33 on record/);
  assert.equal(all(row, (n) => classes(n).includes("rec-chip")).length, 5, "four services and a +29 more");
  assert.match(textOf(row), /quoted at consult/i);
});

test("the sheet holds every service, and the search narrows them", () => {
  const tree = drawTab({ profile: many });
  press(byTestId(tree, "rec-row-act-services"));
  const open = () => again(() => W.BusinessTab({ flash: () => {} }));
  assert.equal(all(byTestId(open(), "rec-sheet-services"), (n) => classes(n).includes("rec-service-row")).length, 33);

  const search = find(byTestId(open(), "rec-sheet-services"), (n) => classes(n).includes("rec-input"));
  search.props.onChange({ target: { value: "Service 1" } });
  const shown = all(byTestId(open(), "rec-sheet-services"), (n) => classes(n).includes("rec-service-row"));
  assert.ok(shown.length < 33 && shown.length > 0, "the search narrows without emptying");
});

test("removing a service offers it back at its own index", () => {
  const flashes = [];
  W.__SETTINGS = settings(many);
  W.__FACTS = facts();
  const draw = () => W.BusinessTab({ flash: (f) => flashes.push(f) });
  const tree = fresh(draw);
  press(byTestId(tree, "rec-row-act-services"));
  press(byTestId(again(draw), "rec-service-remove-2"));

  const said = flashes.at(-1);
  assert.equal(typeof said.undo, "function");
  const afterRemove = all(byTestId(again(draw), "rec-sheet-services"), (n) => classes(n).includes("rec-service-row"));
  assert.equal(afterRemove.length, 32);
  said.undo();
  const rows = all(byTestId(again(draw), "rec-sheet-services"), (n) => classes(n).includes("rec-service-row"));
  assert.equal(rows.length, 33);
  assert.match(textOf(rows[2]), /Service 3/, "and it comes back where it was, not at the end");
});

test("the booking-rules fold shows what the composer will write", () => {
  const tree = drawTab({ profile: melany });
  openFold(tree, "booking_rules");
  const says = byTestId(again(() => W.BusinessTab({ flash: () => {} })), "rec-fold-says-booking_rules");
  const block = W.__businessTab.consequenceOf("booking_rules", W.__SETTINGS.config.brain, "whatsapp");
  assert.match(textOf(says), new RegExp(block.text.split("\n")[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("consult-first is its own row with its own name", () => {
  const row = byTestId(drawTab({ profile: melany }), "rec-row-consult_first");
  assert.match(textOf(row), /Needs a consult first/i);
  assert.match(textOf(row), /Color correction/);
});
```

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

Three rows: services (opening a `RecordSheet`), booking rules (opening a `RecordFold`), and consult-first (a `RecordFold` of its own, because it is one of the two unlabelled textareas the old form had). Port `removeService` from `BusinessEditor` unchanged — its undo restores the row at its own index, which is the behaviour the test above pins.

The sheet's rows are `RecordField`s in a three-column grid. The search filters on the service name only; it never reorders, because the stored order is the order the receptionist reads them in.

- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -am "What you offer, and the list that needed room"
```

---

### Task 3.5: *How it answers*, and the voice that had no box

> **Decided 21 Sep, in Task 3.2's review.** The transfer number is edited in one place, Task 3.2's *Transfers a caller to* row. The *Hands you a customer* row below reads it and opens that row; it never edits it.

> **Noted 21 Sep, in Task 3.4's review.** *How it answers* goes ABOVE the services sheet's line in `business-tab.jsx`, never below it. The sheet (`window.BtServicesSheet`) is drawn after every card because the kit's `RecordSheet` holds hooks and exists only while open, so it must be the page's last hook-holding child (Task 3.4's note 3). A card composed below that line is drawn after the sheet, and every hook it holds would read shifted cells whenever the sheet opens. The offer test's "last hook-holding child" check guards only the cards that exist when it runs: it proves nothing about a card added later. So when this card lands, run that test with the sheet open and this card's fold open after it, or add a row of this card to what the test opens and reads.
>
> **Carried from Task 3.1's review.** The rules fold's consequence includes the Autonomy tab's rule lines, since a draft is resolved with the settings read's own policy. The vision switch never changes the prompt's words (`FOLD_BLOCK.vision` is null: a photo's words go in the customer's own turn), so it shows no "It will say". A record whose profile composes nothing has no rules block at all: the fold says why once, in contracts' words, and never draws an empty block.

> **Changed in execution (22 Sep).** The steps below are the plan as written. What shipped differs in these ways.
> 1. **The card is a file of its own**, `pages/business-tab-answers.jsx` (`window.BtAnswersCard`), in both load lists after `business-tab-offer.jsx`, drawn by the page above the services sheet, which stays its last drawn child. Seven folds, each id the key it saves. So the hand-off row is `escalate_when`, not the plan's `handoff`: the plan's test reads `rec-row-escalate_when`. `abilityRows`' two hand-off abilities named `handoff`, a row nothing drew: the chat hand-off now opens `escalate_when`, and, since the review, the transfer opens `handoff_number`, the number's one editor (Task 3.2's decision). The plan's tone test typed Melany's own tone, which changes nothing; it types another and reads the fold's parts.
> 2. **Four things the canvas said were not true, and are not said.** "It stops answering, marks the thread Needs you and emails your staff": the email goes to the Notifications tab's list (`notify.ts` `chooseAddressing`), which may be nobody, and the pause ends; the fold says the ability card's own sentence, now written once (`handoffChatWords`). "The phone agent has its own transfer, so the reasons above do not reach it": the composer writes the reasons under the call's hand-off heading too, so the fold says "Your reasons reach a call too." and the ability card's transfer sentence (`handoffCallWords`). The photos switch's "The four above are limits and start on": health advice starts off. "2 you wrote": a workspace set up before S5 was given messages with its details copied in, which nobody wrote, so the row says how many differ from the default wording (`fallbacksWords`).
> 3. **Contracts** (`business-tab.ts`, on `__businessTab` with `hasProfile`): `TONE_PRESETS`, `handoffWords`, `handoffChatWords`, `handoffCallWords`, `notesWords`, `instructionsWords` and `fallbacksWords`, and `RULES_WITHOUT_FIELDS_WORDS`, the M-2 sentence, written once for Phase 4 to reuse.
> 4. **The gestures grew three things** (business-tab-gestures.jsx, business-tab-folds.jsx). A fold of lines (`BtFold lines`: the voice and the languages are lines of Who you are) says only the lines its draft changes, under "It will be told", where the whole block said eight lines about one. `willSay` answers `caveat`, its blocks' own notes (prompt-blocks.ts), which a fold draws with the whole block: the rules' says which of its lines the Autonomy tab wrote, the hand-off's that it is always sent. And `rows()` puts back a word as itself, where it spread "Spanish" into an object. `linesOf` is published, so the hand-off fold asks the rule its save writes the reasons by.
> 5. **The kit grew two things**, with kit tests: `RecordBox rows` is a textarea (a note's text, a message), and `RecordCombobox` takes `typed`, an option for a name the list does not hold, and `onKeyDown`, asked before its own keys (Backspace on the empty box gives back the last language); since the review, `onLeave(words)` too, as focus leaves a box with words in it, so a language typed and left there is added as the old form's was, not dropped.
> 6. **`SET_LANGS` and `FALLBACK_ROWS` moved into the card**, published as `BT_OFFERED_LANGUAGES` and `BT_FALLBACK_ROWS`, and settings.jsx reads them as it loads, so each is written once. Not into contracts: the bridge installs after the manifest loads, so settings.jsx could read contracts only while drawing, which would have changed `BusinessEditor`'s body. Three settings tests import the card before settings.jsx, as both load lists have it. The four rules' labels and hints are the old form's, and `BusinessEditor` keeps its inline copy until Task 3.7 deletes it.
> 7. **After S4 the own-words block is always the owner's**: the fold's save writes the carried words into the owner's field, so `promptBlocks`' carried note never shows under "Your receptionist will be told". The fold's own hint says where carried words came from and which wins, as the old form's did.
> 8. **How long a hand-off holds off** is the Autonomy reply row's `pause_hours` from `__POLICIES`; a failed read of it (null) draws `FailedRead` where the sentence would be.
> 9. **The tests**: `business-tab-answers.test.mjs` (31), two kit tests, eight vm tests, the bridge's list; 18 deliberate breaks were each caught. For Task 3.7's Playwright journey: after a language is added, focus stays in its box; Backspace in the empty box; the hand-off door moves focus into Who you are's transfer box; a note just added takes focus in its title.
> 10. **Fixed in the review's round (22 Sep).** The M-2 sentence said the four rules "do not reach it", which the price detector makes untrue (it reads every reply whatever the profile, `layerTwo` in chat and `spokenBreach` on a call): it now says the four switches change nothing it is *told*. A fold says a save crosses the resolver's line only when its Save would send something (`holdsChanges`), because the instructions fold of a record that composes nothing opened untouched saying the details would start being given, and Save sent nothing. The hand-off fold says what a call does, and offers its door, only on a workspace with a line to call, as Who you are's transfer row says nothing it will say there. The languages say the old form's "It answers in whichever of these a customer uses.": on WhatsApp the composer says only "You speak: …". The rules fold opens its switches by contracts' `guardrailsInForce`, published on `__businessTab`, where `draftOf` held a copy. `business-tab-answers.test.mjs` is 36 tests, and every one of the review's mutations is now caught by at least one test.

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/business-tab.jsx`
- Test: `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test("the voice has a box, and it is the first row of How it answers", () => {
  // Melany's real record, with no tone on it.
  const tree = drawTab({ profile: { ...melany, tone: undefined } });
  const card = byTestId(tree, "rec-card-answers");
  const rows = all(card, (n) => classes(n).includes("rec-row"));
  assert.match(textOf(rows[0]), /Its voice/);
  assert.match(textOf(rows[0]), /Not set/);
});

test("typing a voice reaches the composer, and nothing else moves", () => {
  const tree = drawTab({ profile: melany });
  openFold(tree, "tone");
  typeInto(tree, "tone", "Warm and unhurried.");
  const says = textOf(byTestId(again(drawTab), "rec-fold-says-tone"));
  assert.match(says, /^Tone: Warm and unhurried\./m, "the fold shows the composer's own line");
});

test("hand-off is one row naming both channels", () => {
  const tree = drawTab({ profile: melany });
  const row = byTestId(tree, "rec-row-handoff");
  assert.match(textOf(row), /WhatsApp/);
  assert.match(textOf(row), /Phone/);
  assert.match(textOf(row), /transfer/i);
});
```

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

`put("tone", …)` already exists in the old save; the field is new. The hand-off row draws the WhatsApp reasons and the phone transfer number together, each under its channel's chip, with the note that the phone agent has its own transfer.

- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Commit**

```bash
git commit -am "The receptionist gets a voice, and a box to type it in"
```

---

### Task 3.6: Each fold patches only its own keys

This is the test that guards the page's one historical catastrophe. Write it red, first.

> **Changed in execution (21 Sep).** The steps below are the plan as written. What shipped differs in three ways.
> 1. The helpers live in `pages/business-tab-folds.jsx`, loaded between `business-tab-save.jsx` (the page's one saver and the rows' tables, created by Task 3.2's review) and the page, not in `business-tab.jsx`. They are published on `window.__businessTabSave` as `PATHS_OF`, `KEYS_OF`, `draftOf(fold, stored)`, `saveFold(fold, stored, draft)` and `problemsOf(fold, draft)`. The plan's `draftFor(fold)` returned a changed draft for the test alone; `draftOf` is the draft a fold opens with, which the folds need anyway, and the test owns its edits.
> 2. `PATHS_OF` names what each fold writes as dotted paths into the whole config, and `KEYS_OF` is read off it, so the test proves the WHOLE config is untouched outside a fold's paths, not only the profile. There are thirteen folds, not ten: `consult_first` (its own key inside `booking_rules`), `extra_instructions` (with the stored prompt) and `calendar` join the plan's list, and `guardrails` also writes `features.vision`.
> 3. **A fold saves as one job, `foldJob(fold, draft, { opened, said, done, flash })`** (Task 3.6's review). Its patch runs on the config at send time, never the one the fold opened with. It sends nothing when the draft holds no changes (`holdsChanges`): some records are stored the way no fold writes them back, and an unchanged save of the instructions on a record that is only its hand-written prompt would have doubled the prompt. And it refuses, with its sentence, when the fold's own part of the settings changed after it opened (`opened` is required), so a services list held open never takes out the service a colleague added. The saver tries every patch: one that throws is said and dropped, and no longer takes the page down as it draws.
> 4. **Two checks before a save.** `problemsOf` says the old form's sentences word for word, and, from one published table (`LIMITS`, `RULES`), the lengths and counts the save's schema refuses. `schemaProblems(fold, base, draft)` says what only the schema can judge (overlapping shifts, a date not on the calendar, a feed the receptionist may not read) under the same field keys, through the bridge's `saveIssues`, with `elsewhere` for a refusal that is not the fold's to fix. A fold sends only when both are `{}`.
> 5. The test clones the stored record before every call and compares against the clone. The saver once handed a patch shallow copies, so a patch that edited a nested object in place changed the base too, was judged to change nothing, and was never sent (Task 3.2's review). Every patch now runs on a copy all the way down, and what a row will say is worked out on the brain its save goes on (the saver's base, one saver per browser tab), not on the settings read.

**Files:**
- Create: `tooling/scripts/tests/business-tab-folds.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
/**
 * A save patches; it never rebuilds.
 *
 * The editor this replaces once started its profile from {} and added the known
 * keys back, which is not a save — it is a rebuild, and a rebuild silently
 * deletes every key the form does not happen to render. That is how a live
 * workspace lost a 5,000-character prompt. Every fold is held to the opposite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const STORED = {
  brain: {
    business_name: "Melany's Beauty Salon",
    booking_link: "https://booksy.com/x",
    system_prompt: "…the workspace's own prompt…",
    profile: {
      address: "2581 Pitkin Ave",
      hours: { mon: { open: "09:30", close: "18:00" } },
      services: [{ name: "Balayage", duration_min: 180 }],
      booking_rules: { lead_hours: 2, slot_min: 30, a_rule_added_later: "keep me" },
      a_key_no_form_renders: "keep me too",
    },
  },
};

for (const fold of ["tone", "hours", "services", "booking_rules", "guardrails", "notes", "escalate_when", "fallbacks", "closures", "languages"]) {
  test(`the ${fold} fold writes its own keys and leaves the rest exactly as they were`, () => {
    const next = saveFold(fold, STORED, draftFor(fold));
    // Nothing outside this fold's keys changed.
    for (const [k, v] of Object.entries(STORED.brain.profile)) {
      if (KEYS_OF[fold].includes(k)) continue;
      assert.deepEqual(next.brain.profile[k], v, `${fold} must not touch ${k}`);
    }
    // The two keys no form renders survive.
    assert.equal(next.brain.profile.a_key_no_form_renders, "keep me too");
    assert.equal(next.brain.profile.booking_rules.a_rule_added_later, "keep me");
    // And the workspace's own prompt is untouched unless this fold owns it.
    assert.equal(next.brain.system_prompt, STORED.brain.system_prompt);
  });
}
```

`KEYS_OF` names, for each fold, exactly the profile keys it owns. It lives in `business-tab.jsx` beside the save helpers and is exported on `window.__businessTabSave` so the test reads the real map rather than a copy of it:

```js
const KEYS_OF = {
  tone: ["tone"],
  hours: ["hours"],
  services: ["services"],
  booking_rules: ["booking_rules"],
  guardrails: ["guardrails"],
  notes: ["notes"],
  escalate_when: ["escalate_when"],
  fallbacks: [],          // fallbacks live on the brain, not the profile
  closures: ["closures"],
  languages: ["languages"],
};
```

`saveFold(fold, stored, draft)` and `draftFor(fold)` come from the same export:

```js
const { KEYS_OF, saveFold, draftFor } = globalThis.window.__businessTabSave;
```

`draftFor` returns a changed draft for that fold — a different tone string, a different Saturday, one service renamed — so each test proves a real write, not a no-op.

The `fallbacks` case is deliberately in the list with no profile keys: it writes `brain.fallbacks`, and the test proves it leaves the whole profile untouched.

- [ ] **Step 2: Run it and watch it fail**

```bash
node --conditions=react-server --import tsx --test tooling/scripts/tests/business-tab-folds.test.mjs
```

Expected: FAIL on the first fold, because no save helper exists yet.

- [ ] **Step 3: Implement the save helpers**

One function per fold, each starting from `{ ...stored.brain.profile }` and writing only `KEYS_OF[fold]`. An emptied field deletes its key rather than storing `""` — the rule the old `put()` held.

- [ ] **Step 4: Run it and watch every fold pass**
- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/tests/business-tab-folds.test.mjs apps/dashboard/src/legacy/pages/business-tab.jsx
git commit -m "A save patches, and the test that proves it"
```

---

### Task 3.7: Swap the page in, delete the form, rewrite the seven tests

> **Changed in execution (22 Sep).** The steps below are the plan as written. What shipped differs in these ways.
> 1. **The create-receptionist fold is its own card**, `pages/business-tab-create.jsx` (`window.BtCreateCard`), in both load lists after `business-tab-services.jsx`. At rest it draws the empty state the old card said, whose "Set up the receptionist" opens a `BtFold` with id `receptionist` holding the old create path's three fields; under it is *When you're open*'s own timezone row (`window.BtZoneRow`), not a copy of it. The fold saves through `foldJob` like every other, and writes `business_name`, `booking_link`, `phone_display` only where a different number is typed, and the product's prompt and messages ONLY where none is stored -- where the form wrote them on every save. It writes no `profile`: the form's profile of three guardrails composed exactly what no profile composes (`hasProfile` does not count guardrails) and absent is the same three rules in force, so it was a second way of saying nothing.
> 2. **Two seams on the gestures made it possible.** `BtFold` takes `rest({ request, can })`, which draws something else in the row's place for a fold with no fact to state yet (`can` is `btOpening`'s own answer — whether there is a config to save onto and a draft that could be worked out of it, which is exactly what gates opening — and NOT whether the role may: a card's primary act is shown gated, where a row's own act is simply absent), and `check(draft)`, the card's own check beside `problemsOf`, for what the draft does not hold and only the page knows -- the line the workspace answers on. And a fold with a `rest` judges an UNTOUCHED Save instead of closing (`nothingYet`): there is nothing stored for a check to judge wrongly, and pressing Save on three empty required boxes must say what is missing, as the create form did, not look as though it saved.
> 3. **The number the receptionist gives out is one box**, `window.btPublishedBox` (`business-tab-who.jsx`), drawn by the *Tells customers to call* row and by the create card, so the choice between the line and a different number and the four sentences that say what each costs are written once. Its placeholder was the LIVE SALON's transfer number (`+1 646 932 5775`), in both number boxes; both are the reserved fictional range now, as the rows they replaced used. That is a "no customer in the code" break that shipped on this branch in Task 3.2.
> 4. **`PaneWorkspace`'s states are four returns, not three**: broken, the record (`window.BusinessTab`, with `PromptPreview` and `WorkspaceData` under it), the create card, and the mockup's own card for a pane with no settings read at all -- which is the standalone harness, and which the old `real ?` branches wrote twice.
> 5. **Deleted with `BusinessEditor`**: `hoursSummary`, `MAX_SHIFTS`, `MAX_CLOSURE_ROWS`, `SET_DAYS`, `SET_LANGS`, `FALLBACK_ROWS`, `DAY_LABEL_SHORT`, and the card's own rows `FactRow`, `FactConflicts`, `PublishedNumberRow`, `HandoffRow` and `TimezoneRow`. `SetSectionHead` stays (Your data draws one). 294 lines of `settings.css` went with them. `settingsRulesKept`/`SET_EDITED_RULES` went too, in the fix round: they had no caller but `settings-save-keeps-rules.test.mjs`, and the guarantee they stood for — the rules a form does not render survive a save — is not a helper any more but the shape of every fold, which `business-tab-folds.test.mjs` proves for EVERY one of them over a record carrying `booking_rules.a_rule_added_later` and `profile.a_key_no_form_renders`. That test file is deleted with them.
> 6. **The rail's second question changed words.** With the form gone, "The changes in the business editor have not been saved." names something that does not exist; it is "Nothing you changed on this tab has been saved."
> 6b. **Task 3.5's carry-overs landed in the fix round.** The twenty caps a fold offers up to were literals in `business-tab-folds.jsx` (`BT_LIMITS`) with every number written again in the sentence beside it; they are contracts' `PROFILE_LIMITS`, read off the schema that would refuse the save, and `profileRefusal` writes each sentence from that one number, the way `bookingRuleRefusal` already did for the five booking rules. The page asks the bridge for both and states no number of its own without it. The fallbacks' "written out" predicate is contracts' `writtenOutDetail`, tested there. `BT_OFFERED_LANGUAGES` and `BT_FALLBACK_ROWS`, published only for the deleted form to read as it loaded, are gone.
> 7. **Sixteen tests in `settings-editor.test.mjs` became four.** What it proved about a form's fields is proved where those fields now live, by drawing them (`business-tab-page/-open/-offer/-answers/-create.test.mjs`); what is left is settings.jsx's own and is what the swap turned on -- which of the cards the pane draws, the rail's question before it replaces a pane, the browser's before it unloads one, and that the record kit's registry is the one answer to both. `business-tab-create.test.mjs` (10) is the create card's own.
> 8. **Sixteen more test files carried pins to the deleted form** and were re-pointed or executed: `availability`, `business-profile`, `calendar`, `facts`, `media`, `one-hours-algorithm`, `prompt-preview`, `receptionist-setup`, `settings-honest`, `settings-truth`, `settings-words`, `settings-owner-panes`, `split-shifts-closures`, `surface-registry`, `voice-pipeline` and `webhook-auth-evidence`. Twelve source reads went for good and `source-scan-baseline.json` fell. The fix round took the rest: a pin moved from the form's source to the PAGE's is still a pin, and `fs.readFileSync` is invisible to the ratchet, so the thirteen in `business-profile.test.mjs` and the one in `surface-registry.test.mjs` became comments naming the test that draws or saves each rule — that file now reads no source at all.
> 9. **Three things the page does not do, on purpose.**
>    - The **counting toast** on a refused save. The old form said "Not saved — 3 fields need a look." beside each sentence under its box; a row or a fold says what is wrong under the box it is about and flashes nothing at all (`business-tab-page.test.mjs`, "what stops a save is said under the box, before any round trip, and nothing is sent", asserts `flashes.length` is 0). The sheet, which can hold a refusal off screen, is the one place that still counts.
>    - The calendar feed's **Check the address** button: the row states its last read and says a failed one with its Retry (the spec's *When you're open*).
>    - The EmptyState **Add your business details**: the standing line names the one gap most worth closing and IS the door to the row that closes it (the spec's §4.1).
> 10. **One deviation from the spec, deliberate.** §8's fact table says of the published number: "Asked once, in its row — not again in the create path." The create fold asks for it, through the very same box the row draws (`window.btPublishedBox`, note 3). A workspace with no receptionist has no row to be asked in — the record does not exist yet — and one whose line has not been provisioned has nothing at all to give a customer until somebody types a number, which is what made it one of the old create form's three required fields. So it is asked once per surface, in one box, with one rule for what it stores; the row is still the only place it is CHANGED afterwards.
> **Noted 21 Sep, in Task 3.3's review. Three things the swap must do, none of which is in the steps below.**
> - **The standalone mockup lacks three of the page's globals.** `data/bridge-stubs.jsx` publishes no `__hoursLines`, no `__configLimits` and no `__workspace`, so once the page is mounted there the Hours row reads "Not set" over a week that has hours, the caps fall back to the page's literals, and the Timezone row offers no act. Publish `__hoursLines` through the contracts-built `data/business-tab.js` (`serve-legacy.mjs` already builds it from `legacy-bridge/business-tab.ts`): a hand port of it in `bridge-stubs.jsx` would be a second run-collapsing implementation, which is the one thing `hoursSummary`'s comment exists to forbid. `__configLimits` can ride the same bundle (contracts' `MAX_INTERVALS_PER_DAY` and `MAX_CLOSURES`); `__workspace` is a stub's to fake.
> - **`BusinessTab` must listen for `surface:settings`, as `PaneWorkspace` does today.** The page subscribes to its saver and the calendar row to `surface:calendar`, and nothing else draws it again. A zone saved through `PATCH workspaces` re-reads settings (Task 3.3), and until the page hears that read the card's line ("Six days a week, in New York time"), the closures count on the business's day and the hours fold's hint keep the old zone. While `PaneWorkspace` is the parent it redraws the page for it; do not lose that in the swap, and test it by dispatching the event, not by redrawing by hand.
> - **The *Who you are* card overflows a phone by 8px.** Measured under real React at 390px in Task 3.3's check: the page scrolls sideways by 8px, and the one element found past the edge is the svg arrow inside the "Answers on" door's visually hidden words (`.rec-row-act-words`, 1px and clipped at a phone's width). Confirm that is the cause, fix it before the swap (the arrow belongs beside the words, not inside the clipped box), and add a no-horizontal-scroll check at 390px to the Playwright journey below, so the next one is caught by a machine.

> **Noted 21 Sep, in Task 3.2's review.** Add one nightly Playwright journey for the focus paths (a row opening and closing, "Keep editing", the standing line's door), which the stub cannot test because it never attaches refs. **Added in Task 3.3's review**, for the same journey, since the kit's `useRecFocus` now holds focus inside an open fold and only a browser can show it: after a shift's or a closed day's remove, focus is in the last field the person was in (the fold's first field when that row went), never on `<body>`; after the Add that fills a list to its cap turns into the sentence, the same; after an item of the week's copy menu, the same; after Add, focus is in the new row's first box, not on Add; and a click on the page outside an open fold, followed by anything that redraws it, leaves focus where the person put it. Both load lists already carry `pages/business-tab-save.jsx` and `pages/business-tab.jsx` (Task 3.2). **Added in Task 3.4's review**, for the same journey:
> - **The services sheet at 390px.** Each service's three boxes stack into one row, with the remove at the right. The columns' head and the foot hold still while the rows scroll. The page and the sheet scroll nowhere sideways, measured with the same check as the page.
> - **The toast and the sheet's Save** (added in Task 3.4's quality review). Open the sheet, remove a row, and check the toast's box and the Save button's box do not overlap, at 1,024, 1,280 and 390px wide. The toast stack is fixed and centred on the window (components.css), and the sheet is `min(540px, 92vw)` on the right with Save bottom-left in its foot, so they overlapped under about 1,290px. record.css now centres the stack over the page left of the sheet from 1,140px, and lifts it 184px above the bottom below that and on a phone. That lift is the foot's height with its told line on two lines and an ask above Save, measured nowhere yet. The journey measures it; if the foot is taller, raise the lift in record.css, never in components.css.
> - **The sheet's focus paths.** As it opens, focus is on the sheet. After a remove, focus is on the Undo left where the row was. After that Undo, it is in the row's first box. After Add, it is in the new row's first box. Escape and Close ask when something was typed. As the sheet closes, focus goes back to the row's act. And while it is open, focus is never on `<body>`, including after the toast's Undo takes its toast away.

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/settings.jsx` — delete `BusinessEditor` (1013-1965) and `PromptPreview` (2190-2242); `PaneWorkspace` renders `window.BusinessTab`.
- Modify: `apps/dashboard/src/legacy/styles/settings.css` — delete the dead families.
- Modify: `apps/dashboard/src/legacy-bridge/manifest.ts`, `apps/dashboard/src/legacy/Chanlytics.html` — add `pages/business-tab.jsx`.
- Modify: the seven test files.

- [ ] **Step 1: Swap the page in and delete the form**

`PaneWorkspace` keeps its three states untouched — broken config, unconfigured, and the read — and renders `<window.BusinessTab flash={flash} />` in place of the card and the editor.

- [ ] **Step 2: Delete the dead CSS**

```bash
grep -rn "biz-\|set-hours\|set-svc-\|set-br-\|set-ident-\|set-fact-src\|set-prompt-\|set-day\|set-rule\|set-token\|set-fallback\|set-closure" apps/dashboard/src/legacy --include=*.jsx --include=*.html
```

Every class with no remaining match comes out of `settings.css`. Expect the file to lose several hundred lines.

- [ ] **Step 3: Rewrite the seven tests, one at a time**

For each of `settings-editor`, `settings-save`, `settings-save-keeps-rules`, `settings-truth`, `settings-words`, `settings-honest`, `settings-owner-panes`:

Read what the test proves, then prove the same thing about the new page. The behaviours are not negotiable and every one of them survives — they are why the file exists:

- every check says what is wrong under the field it belongs to, and the toast only counts them;
- Cancel, another tab and closing the browser all ask before throwing changes away;
- a role that may not press a control never sees a dead button;
- the card says who last changed it and when;
- an emptied field deletes its key;
- the rules a form does not render survive a save.

`settings-truth`'s 14 source-text assertions are replaced by executing assertions. If one of them cannot be proved by execution, say so in the PR rather than deleting it quietly.

- [ ] **Step 4: Run everything**

```bash
corepack pnpm --filter "./packages/*" build
corepack pnpm -r typecheck
corepack pnpm test
```

Expected: green. Nothing lands red.

- [ ] **Step 5: Commit and open the PR**

```bash
git add -A
git commit -m "Business is a record"
gh pr create --title "Business is a record" --body "$(cat <<'EOF'
The tab was two surfaces that disagreed about what exists: a card showing nine
facts, and a form editing about twenty-five across fourteen sections behind one
Save — roughly 150 inputs in one scroll on the live workspace's own record.

Now every fact is a row, and the gesture is the shape of the data: one value
edits inline, a set of fields folds open under its row, a long list opens a
sheet. Each fold patches its own keys onto the stored config and states, from
the composer the edge runs, what the receptionist will be told.

`profile.tone` has a box for the first time. It has been read, diffed, saved and
composed into every prompt since it existed, and `value={tone}` appeared zero
times in the file.

`BusinessEditor` and `PromptPreview` are deleted, not flagged: two editors
writing one versioned config is how they drift.

Spec: `docs/superpowers/specs/2026-09-20-business-tab-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Task 3.8: The box and the prompt view agree on the baseline in the owner's field

Deferred here from Phase 1 on 21 Sep, because it changes what the live form does and Phase 1 promised to change nothing live. Land it in the same PR as Task 3.7, which rewrites the save.

**The case.** A save before S4 copied the product's baseline prompt into the owner's own field (`profile.extra_instructions`). The prompt view (`whoseWords`, `promptBlocks`) calls it the platform's, which is true. The box (`instructionsDraft`) opens it as the owner's text, as it always has. A Phase 1 fix pass routed the box through `whoseWords` and made it open empty, and review found two ways that goes wrong on the old save:

1. **Deletion.** The old save writes `extra_instructions: extra.trim() || undefined`, so an empty box deletes the field. With the loose baseline test that briefly shipped, an owner's own sentences typed where the business's name goes were deleted the same way. `whoseWords` now tests the owner's field strictly (`isBaselineInOwnersField`), so that is closed. The baseline itself would still be deleted.
2. **A prompt that falls back.** A workspace whose only composed field is that copy loses `hasProfile` once the field is deleted, and `resolveSystemPrompt` hands back the bare baseline. In review's simulation it fell from 1,878 characters to 239: no `[[HUMAN]]` hand-off and no rule lines.

**The fix.** Route `instructionsDraft` through `whoseWords` (one rule, as Phase 1 intended). **And** make the new "In your own words" fold's save (Task 3.6's helper) handle `kind: "baseline"` in the owner's field without either failure:
- opening the box empty is right, since no owner wrote it;
- saving the box empty must not flip `hasProfile` off where it was on. Either keep the field until the owner writes their own, or move the baseline back to `system_prompt` in the same write, so the resolver still composes. Prove it with the Task 3.6 patch harness and a before/after `resolveSystemPrompt` comparison on a record whose only composed field is that copy;
- and a rename must reach that copy too (added in Task 3.2's review). The Name row writes the baseline again under a new name only where it is the stored prompt (`system_prompt`); with the baseline in the owner's own field, a rename leaves the old name there, so the resolved prompt keeps it and the Name row's *It will say* shows only the identity line. Whatever this task does with that field must carry the business's current name;
- and not that field alone (widened in Task 3.2's review). Every field `hasProfile` counts can be the last one a save empties, and emptying it hands the receptionist its stored prompt: on a sparse record the prompt fell from 2,128 characters to 240, the hand-off token and every rule line gone. The inline rows say so before the save goes (`profileCrossing` on `__businessTab`, the words `PROFILE_CROSSING_WORDS`), but saying is not reconciling. The reconciliation concerns every field `hasProfile` counts, not only `extra_instructions`, and it needs the before/after `resolveSystemPrompt` test for each.

**Tests.** The Phase 1 pins must flip when this lands, and they're written to:
- `prompt-blocks.test.mjs` "the instructions box opens exactly as it does on main" loses its baseline-in-the-box rows' "unchanged" status;
- "the box and the prompt view disagree on one case, knowingly, until Phase 3" becomes an agreement.

Change both deliberately. Neither may be deleted.

> **Before starting, worth one production query (the owner runs it, per the house rule on production):** how many workspaces store baseline-shaped text in `profile.extra_instructions`, and how many of those compose nothing else? If the answer is none, this task shrinks to the one-rule change.

---

## Phase 4 — What it can do (PR 4: "The page says what it can do, and what it cannot")

> **Carried from the Phase 1 re-review (21 Sep); each first renders in this phase.** All are about wording that is true on one channel and imprecise on the other, and each needs a test that fails on the current wording.
> - **M-1, the standing line on a call.** "It offers a consult or the booking link instead of a price" is exact in chat, where the swap happens before anyone reads the reply. On a call the correction comes after the figure has been heard (`policy.ts` header). With the switch off, nothing tells the phone agent not to read out a service's price note (`config.ts`, the Services block). And with Autonomy's FAQ row on ask, a price question gets a callback promise instead (`policyRules`). Say what holds on both channels, or name the difference once.
> - **M-2, a workspace whose fields compose nothing.** Then none of the four rule switches reaches the prompt (`resolveSystemPrompt`'s no-profile branch returns the stored prompt plus Autonomy's rules only). The rules group should say so once. The prompt view's no-fields note already says the equivalent on the same page, so the two must agree.
> - **M-3, "it sends the link instead" and ", then the link".** `linkGoes` (`business-tab.ts`) ignores `callSendsLink`. On a workspace on both lines with no approved booking-link template, the call cannot send it. Limit those clauses to chat when the call can't.

### Task 4.1: The abilities card

**Files:**
- Create: `apps/dashboard/src/legacy/pages/business-can.jsx`
- Modify: both load lists
- Test: `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { abilityRows, cannotRows } from "@chanlytics/contracts";

test("the card draws every ability, with the channel that has it", () => {
  const card = byTestId(drawTab({ profile: melany }), "rec-card-can");
  // Every input, as the page computes it for Melany (Step 3's table). abilityRows throws on a
  // boolean left out, so a wiring slip fails here instead of drawing a card that lies.
  for (const a of abilityRows({
    voiceLive: true, whatsappLive: true, hasCalendarFeed: true, hasBookingLink: true, hasBookingTemplate: true,
    hasHandoffNumber: true, hasEscalateWhen: true, pauseHours: undefined, visionOn: false, bookingHeld: false,
  })) {
    const row = byTestId(card, `rec-can-${a.id}`);
    assert.ok(row, `${a.id} is drawn`);
    assert.match(textOf(row), new RegExp(a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    // A channel that does not have it is drawn dim, not absent: absence reads as "we did not say".
    assert.equal(all(row, (n) => classes(n).includes("rec-can-chip")).length, 2, `${a.id} names both channels`);
  }
});

test("an ability whose input is missing points at the row that supplies it", () => {
  const thin = { ...melany, handoff_number: undefined };
  const card = byTestId(drawTab({ profile: thin }), "rec-card-can");
  const transfer = byTestId(card, "rec-can-transfer");
  assert.match(textOf(transfer), /takes a message instead/i);
  assert.ok(find(transfer, (n) => typeof n.props?.onClick === "function"), "and offers the row that fixes it");
});

test("the card reads the Autonomy tab: a pause nobody set is a day, and held bookings are said", () => {
  // Nothing under pause_hours is the common case. Passed as a number the page worked out, it
  // read "holds off for NaN hours"; passed as stored, abilityRows reads it as the pane does.
  const card = byTestId(drawTab({ profile: melany }), "rec-card-can");
  assert.match(textOf(byTestId(card, "rec-can-handoff")), /holds off for a day/);
  // Booking on ask: the page asks contracts' bookingHeld, the edge's own question, never a copy.
  const before = W.__POLICIES;
  W.__POLICIES = { rows: [{ class: "reply", mode: "auto", limits: {} }, { class: "booking", mode: "ask", limits: {} }], role: "owner" };
  try {
    const held = byTestId(byTestId(drawTab({ profile: melany }), "rec-card-can"), "rec-can-booking_link");
    assert.match(textOf(held), /Your Autonomy tab holds bookings for you to confirm/);
  } finally {
    W.__POLICIES = before;
  }
});

test("a workspace with both lines and an approved booking-link message is told the call sends the link", () => {
  // hasBookingTemplate is contracts' bookingTemplate over the workspace's templates: left out,
  // every two-channel workspace was told the call can't send it.
  const row = byTestId(byTestId(drawTab({ profile: melany }), "rec-card-can"), "rec-can-booking_link");
  assert.match(textOf(row), /caller's WhatsApp, when their number has one/);
});

test("what it cannot do carries no switch", () => {
  const card = byTestId(drawTab({ profile: melany }), "rec-card-cannot");
  for (const c of cannotRows({ smsLive: false })) {
    const row = byTestId(card, `rec-cannot-${c.id}`);
    assert.ok(row, `${c.id} is drawn`);
    assert.equal(find(row, (n) => n.props?.role === "switch"), null, `${c.id} is not offered as a setting`);
  }
  assert.match(textOf(byTestId(card, "rec-cannot-sms")), /not part of what is sold yet/i);
});
```

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

`abilityRows` is called with every input, each from its own source on the page. None is a number or a sentence the page works out for itself:

| Input | Source |
|---|---|
| `voiceLive`, `whatsappLive` | `capabilityStatus("voice" / "whatsapp", …).live`, through the Setup payload |
| `hasCalendarFeed` | `__SETTINGS.config.calendar?.ical_url` is set |
| `hasBookingLink` | `__SETTINGS.config.brain.booking_link` is set |
| `hasBookingTemplate` | `!!__businessTab.bookingTemplate(window.__TEMPLATES_ALL ?? [])`: contracts' `bookingTemplate` (`template-library.ts`), the function `retell-fn.ts` picks the call's template with |
| `hasHandoffNumber` | `brain.profile.handoff_number` is set |
| `hasEscalateWhen` | `brain.profile.escalate_when` has at least one line |
| `pauseHours` | the Autonomy reply row's `limits.pause_hours` exactly as stored: `__POLICIES.rows.find((r) => r.class === "reply")?.limits?.pause_hours`. Usually nothing; `abilityRows` reads it through `hardLimitsWords`, so nothing, null or 0 is a day |
| `visionOn` | `__SETTINGS.config.features?.vision === true` |
| `bookingHeld` | `__businessTab.bookingHeld(Object.fromEntries(__POLICIES.rows.map((r) => [r.class, { mode: r.mode }])))`: contracts' predicate, the question the edge asks in `retell-fn.ts` |

The cannot rows are `cannotRows({ smsLive })`, with `smsLive` from `capabilityStatus("sms", …).ready`, not `.live`. `live` needs a `tested` that texting never records (`capabilities.ts`), so it is never true, and the row would say texting is not sold on a line where it is on. `ready` is the active, non-rehearsal carrier line that `textingWords` calls "Texting is on."

Both functions throw a `TypeError` naming any boolean input that is not a boolean. When `__POLICIES` is null the read failed, and neither `pauseHours` nor `bookingHeld` can be known. Draw `FailedRead` where the rows that depend on them would be, rather than passing false.

- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Commit**

### Task 4.1b: When Autonomy keeps the receptionist from replying, the card says so once

Found by the Phase 1 fix pass, decided by the controller on 21 Sep. With the Autonomy tab's **Replies** row set to *Asks you* or *Stays quiet*, the WhatsApp receptionist composes no reply at all (`apps/edge/lib/whatsapp/inbound.ts` ~698), and a call's booking-link send is refused (`apps/edge/lib/outbound-gate.ts` ~123). Built as Task 4.1 stands, every chat ability on the card would still read ready — six claims, all false at once.

**The decision: say it once, for the whole card, not on each row.** It is one cause with one fix, on another tab; repeating it on six rows is the page shouting the same thing six times, which the Quiet board's rule ("a refused act is absent and the page says why once") exists to stop.

**Files:**
- Modify: `packages/contracts/src/business-tab.ts` (`abilityRows` gains `replyMode: "auto" | "veto" | "ask" | "never"`; returns alongside its rows a card-level `held: { sentence: string; to: "admin/autonomy" } | null`)
- Modify: `apps/dashboard/src/legacy/pages/business-can.jsx`
- Test: `tooling/scripts/tests/business-tab-vm.test.mjs`, `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the failing tests**

In the view model: under `ask` and `never`, every row's WhatsApp channel is not ready and `held.sentence` names the mode in the Autonomy pane's own words (`POLICY_MODE_WORDS` in contracts — never the stored `auto|veto|ask|never`, per legacy/CLAUDE.md #657); under `auto` and `veto`, `held` is null and nothing changes. The call-only abilities (transfer) are untouched by the reply mode. `replyMode` joins the boolean inputs in throwing a `TypeError` when it is missing or unknown.

On the page: `held` draws once, above the rows, with one door to the Autonomy tab; the chat chips on each row draw dim; no row repeats the sentence.

- [ ] **Step 2: Run them and watch them fail**
- [ ] **Step 3: Implement.** `replyMode` comes from the reply row of `__POLICIES`. When `__POLICIES` is null the read failed: draw `FailedRead` for the card, as Task 4.1 already does, never a guessed mode.
- [ ] **Step 4: Run them and watch them pass**
- [ ] **Step 5: Commit**

> **Not settled here, and not the card's to settle:** under Booking = *Asks you*, the phone's `check_availability` refuses to offer times while the call still starts with the openings list and chat is handed them with every message — the edge disagrees with itself. Until that is decided, the card says only what holds on both channels (the Phase 1 fix pass wrote those sentences). Raised with the owner on 21 Sep.
>
> **Where "texting is live" comes from:** `cannotRows({ smsLive })` reads `capabilityStatus("sms").ready`, not `.live`. `.live` needs evidence of use, which texting never records, so it can never be true; `.ready` is the state `textingWords` already tells an owner is "Texting is on".

### Task 4.2: The rules, at three strengths

> **Noted 22 Sep, in Task 3.5's review. Two things the rules row says at rest that this task must settle.**
> - **The price chip goes when the switch is off.** The row's "Never quotes a price" chip is drawn only for a rule in force (`guardrailsInForce`), but the price detector runs whether the switch is on or off (the owner's decision, 20 Sep 2026: `violatesNoPrices` in chat, `spokenBreach` on a call). With the strengths drawn, keep that chip with the switch off, saying it is checked, never a row that reads as if prices went through.
> - **On a record that composes nothing, the chips still name rules it is not told.** The fold says so once (`RULES_WITHOUT_FIELDS_WORDS`), but the row at rest lists the four as if they were lines it reads. Say at rest what the fold says, in the same words, or name only what holds on such a record: the checked price rule, and the booking it cannot make anyway.

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/business-tab.jsx`
- Test: `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { ruleStrength, GUARDRAIL_KEYS } from "@chanlytics/contracts";

test("each rule says how far it goes, in the words contracts wrote", () => {
  const tree = drawTab({ profile: melany });
  const card = byTestId(tree, "rec-card-answers");
  for (const key of GUARDRAIL_KEYS) {
    const row = byTestId(card, `rec-rule-${key}`);
    const r = ruleStrength(key);
    assert.match(textOf(row), new RegExp(r.chip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${key} shows its chip`);
    assert.match(textOf(row), new RegExp(r.sentence.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${key} shows its sentence`);
  }
});

test("the price rule still says it is checked with the switch off", () => {
  // The owner's decision (20 Sep 2026): a receptionist never states a price. The detector runs
  // whether the switch is on or off; the switch changes one prompt line, and the row says so.
  const off = { ...melany, guardrails: { ...melany.guardrails, never_quote_prices: false } };
  const row = byTestId(drawTab({ profile: off }), "rec-rule-never_quote_prices");
  assert.match(textOf(row), /Checked, not just told/);
  assert.match(textOf(row), /whether this switch is on or off/);
});

test("the checked rule draws both channels, because they differ", () => {
  const row = byTestId(drawTab({ profile: melany }), "rec-rule-never_quote_prices");
  assert.match(textOf(row), /In chat/i);
  assert.match(textOf(row), /On a call/i);
  assert.match(textOf(row), /before the customer sees them/i);
});

test("vision is an ability, not a limit, and is drawn apart", () => {
  const card = byTestId(drawTab({ profile: melany }), "rec-card-answers");
  const vision = byTestId(card, "rec-rule-vision");
  assert.match(textOf(vision), /gives it a power/i);
  assert.equal(find(vision, (n) => classes(n).includes("rec-rule-sep")) !== null, true, "a dashed rule separates it from the four limits");
});
```

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

The four rule rows read `ruleStrength(key)` for the chip and the sentence — never typed in the page. The checked rule renders its two `checkedOn` entries side by side. The vision toggle sits below a `.rec-rule-sep` and carries the "gives it a power" chip.

The price switch does not turn the checking on or off. The owner decided on 20 Sep 2026 that a receptionist never states a price: `violatesNoPrices` (chat) and `spokenBreach` (calls) run whatever the switch says, and the switch adds or removes the one prompt line that tells it not to quote one. So the row keeps its chip and its sentence with the switch off, and the page draws no warning that switching it off lets prices through. The standing line's "It offers a consult or the booking link instead of a price." follows the same decision: it is said whenever there are services, and it no longer reads the switch.

- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Run the suite, commit, open the PR**

```bash
corepack pnpm test
git add -A && git commit -m "Four switches, three guarantees"
gh pr create --title "The page says what it can do, and what it cannot" --body "$(cat <<'EOF'
Two cards the tab has never had.

**What it can do** — the six abilities, each with the channel that has it and
the row that supplies it, computed from `capabilityStatus` and the tool list
rather than typed. The phone agent has four tools; this tab set the inputs to
three of them and never said a tool existed, so an owner could not know their
phone receptionist texts the booking link to the number a caller rang from.

**And what it cannot** — book, move or cancel an appointment; ring a customer;
send a text message. None is a setting, and saying so on the page that holds
the switches is the difference between a limit and a bug.

The four guardrails now carry three different chips, because they carry three
different guarantees: one the product cannot break, one with a detector on both
channels, two that are lines in a prompt.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 5 — The prompt sheet (PR 5: "The prompt is a table of contents")

> **Noted 22 Sep, in Task 3.4's quality review: one sheet slot, drawn last.** The services sheet is the page's last drawn child, because the kit's `RecordSheet` holds hooks and exists only while open (Task 3.4's note 3). A page test holds it there: it draws the page with the sheet closed and open, and asserts `window.BtServicesSheet` is the last child. Phase 5 cannot add a second sheet that is also always last; two cannot both be last. The prompt sheet goes through ONE sheet slot, drawn last in `business-tab.jsx`, which draws whichever sheet is open. Only one editor or sheet opens at a time (the registry), so the slot draws one sheet or none. When that slot lands, the last-child test asserts the slot, not a sheet.

> **Carried from the Phase 1 re-review (21 Sep): M-5, a false block from inside a note.** This predates Phase 1's fixes. A note whose second line happens to open like the heading of a section the record *doesn't* have (e.g. "Services" on a record with no services) gets a block of its own, charged to that row. Review reproduced it. The fix: accept an opening only on a line that follows a blank line, because `composeSystemPrompt` always writes `\n${heading}`. Pin it with the note-continuation case, and check it against the full-sequence tests from Phase 1 item C.

### Task 5.1: The anchored prompt

> **Deletes `PromptPreview` (added 21 Sep).** Phase 3 kept the card, so an owner is never without a view of the prompt. When the sheet lands, it goes: the component in `settings.jsx`, its `set-prompt-*` styles in `settings.css`, and `prompt-preview.test.mjs`'s pins on it, rewritten against the sheet as the rest were in Task 3.7.

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/business-can.jsx`
- Test: `tooling/scripts/tests/business-tab-page.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import { promptBlocks } from "@chanlytics/contracts";

const drawPrompt = (channel = "whatsapp") => {
  const tree = drawTab({ profile: melany });
  press(byTestId(tree, "rec-prompt-open"));
  return again(() => W.BusinessTab({ flash: () => {} }));
};

test("the contents lists one entry per block, with what each costs", () => {
  const tree = drawPrompt();
  // The resolved prompt the sheet cuts, cut the way it cuts it: with the stored brain, so a carried prompt is found.
  const blocks = promptBlocks(W.__SETTINGS.prompt.whatsapp, "whatsapp", W.__SETTINGS.config.brain);
  const entries = all(byTestId(tree, "rec-prompt-contents"), (n) => classes(n).includes("rec-prompt-entry"));
  assert.equal(entries.length, blocks.length);
  for (const b of blocks) {
    const entry = entries.find((e) => textOf(e).includes(b.label));
    assert.ok(entry, `${b.label} is listed`);
    assert.match(textOf(entry), new RegExp(b.chars.toLocaleString("en-US")), "and says what it costs");
  }
});

test("a block carries a door back to the row that wrote it", () => {
  const tree = drawPrompt();
  const block = byTestId(tree, "rec-prompt-block-services");
  const door = find(block, (n) => typeof n.props?.onClick === "function");
  assert.ok(door, "the block opens its row");
});

test("the hand-off block says it is always sent", () => {
  const wa = byTestId(drawPrompt("whatsapp"), "rec-prompt-block-handoff");
  assert.match(textOf(wa), /always sent/i);
});

test("what is sent beside the prompt is drawn apart, and says why", () => {
  const tree = drawPrompt();
  const now = byTestId(tree, "rec-prompt-now");
  assert.match(textOf(now), /rebuilt/i);
  assert.match(textOf(now), /prompt cache/i, "the reason it is separate is the reason it stays separate");
});
```

- [ ] **Step 2: Run it and watch it fail**
- [ ] **Step 3: Implement**

The sheet is `RecordSheet` holding a contents rail and the blocks. Both come from `promptBlocks` (contracts' `prompt-blocks.ts` since the Phase 1 review, exported by the package as before); the page composes nothing. Each block's `note` is drawn as contracts wrote it: the owner's block says when its words were carried in, or when they are a prompt read as it stands; the platform's say whose they are; and "Rules it always keeps" says it also carries the YES OFFERS line and any Autonomy rule. Whose words are whose is `whoseWords` (config.ts), the same decision the instructions box opens with. It cuts `window.__composedPrompt(channel).text`, which is the resolved prompt, so it passes the stored brain (`W.__SETTINGS.config.brain`) as `from`: that is how a prompt carried into a blank box is found. Key each block, and its `rec-prompt-block-*` test id, by `id` rather than `row`, because the platform's text appears twice on a call. The channel switch is `RecordToggleGroup`. The `now` block is `window.__composedPrompt(channel).now`, drawn under a dashed rule with the sentence about the prompt cache that `PromptPreview` already carried — keep those words, they are the reason the split exists.

- [ ] **Step 4: Run it and watch it pass**
- [ ] **Step 5: Run the suite, commit, open the PR**

```bash
corepack pnpm test
git add -A && git commit -m "The prompt is a table of contents"
gh pr create --title "The prompt is a table of contents" --body "$(cat <<'EOF'
It was a 4,345-character `<pre>` behind a Show toggle. Every block in it was
written by one row upstairs, so the blocks are named for their rows, each
carries what it costs, and each opens the row that wrote it.

Which is also the only way an owner can see that services and their own words
are more than half of everything the receptionist reads — the thing that made a
prompt halving invisible when it happened to a live salon.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 6 — Motion and the words (PR 6: "It moves the way everything else here moves")

### Task 6.1: The four motions

**Files:**
- Modify: `apps/dashboard/src/legacy/styles/components.css` (the micro-motion block, currently around 993-1100)
- Modify: `apps/dashboard/src/legacy/styles/record.css`

- [ ] **Step 1: Add the four**

The fold's `grid-template-rows` transition is already in `record.css` from Task 2.1. Add: the value→field cross-fade, the consequence line's 400ms `--ok-soft` wash on the changed clause only, and the save settle. Each uses the existing duration and easing tokens. No new keyframe unless an existing one cannot express it.

- [ ] **Step 2: Extend the reduced-motion block**

Every new animated selector joins the `@media (prefers-reduced-motion: reduce)` list in `components.css`, and the fold becomes a plain show and hide.

- [ ] **Step 3: Check the four refusals hold**

```bash
grep -n "pulse\|shimmer\|skeleton" apps/dashboard/src/legacy/styles/record.css
```

Expected: no matches. Nothing on Settings breathes.

- [ ] **Step 4: Commit**

### Task 6.2: The words

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/business-tab.jsx`, `business-can.jsx`, `calendar-real.jsx`
- Test: `tooling/scripts/tests/settings-words.test.mjs`

- [ ] **Step 1: Write the failing test**

Assert the retired phrases are absent and the kept ones present, by executing the pages — never by reading source.

- [ ] **Step 2–5:** rename, run, commit, open the PR.

### Task 6.2b: On a phone, a row opens a sheet from the bottom

> **Added by the Phase 2 review (21 Sep).** The canvas's phone artboard (`Record-Phone.dc.html`) opens a row as a sheet rising from the bottom, not a fold: the same fields, the same foot, the same one-section save, and every row at least 44px. No phase built it. Phase 2's `RecordFold` folds inline at every width, and only `RecordSheet` knows the phone (`record.css`, under 760px: 88dvh from the bottom, rounded top corners, a foot clear of the home indicator). The rows' 44px is already in.

**Files:**
- Modify: `apps/dashboard/src/legacy/components/record-fold.jsx`
- Modify: `apps/dashboard/src/legacy/styles/record.css`
- Test: `tooling/scripts/tests/record-kit.test.mjs`

- [ ] **Step 1: Write the failing test**

Draw a `RecordFold` with `window.matchMedia` answering `(max-width: 760px)` and assert it is drawn as a sheet: `role="dialog"`, `aria-modal`, named by the fold's label, holding the same fields, the same `says` and the same Save and Cancel. Escape still cancels, and the registry still holds it (`__settingsUnsaved` asks its dirty test). The existing fold tests, drawn at desktop width, pass unchanged.

- [ ] **Step 2: Draw it**

One component, two frames. Under the phone query (read as `reports-sections.jsx`'s `useRptPhone` reads it, kept current as the window changes size), `RecordFold` draws its head, fields and foot in the sheet's frame, with the sheet's `trapTab` and its focus handed back to the row's act. The page calls `RecordFold` the same way at every width: the registry, the dirty guard and the one-section save never learn which frame drew it.

- [ ] **Step 3: See it at 375px**

In the harness: open a row, type, press another row (the ask), then Save. The page behind the sheet does not scroll, and focus comes back to the row's act.

- [ ] **Step 4: Commit**

### Task 6.3: The final sweep

- [ ] **Step 1: Count what is on screen at rest**

Draw the page with no fold open and assert the number of focusable controls is four. This is the spec's §11 claim, and a test is the only thing that keeps it true.

- [ ] **Step 1b: Decide "N more below" in the services sheet**

The canvas's Edit-Sheet says "24 more below" under the rows in view. Task 3.4 skipped it, and it has no other home. It needs the sheet's body measured as it scrolls: which rows are past the bottom edge, recounted on scroll and as the search hides rows. The stub cannot see that, so its test is the Playwright journey's (Task 3.7). Build it here with that test, or drop it and say why in this plan. The head holds still, and Save names the count ("Save 33 services"). The count is already on screen.

- [ ] **Step 2: Run everything one last time**

```bash
corepack pnpm --filter "./packages/*" build
corepack pnpm -r typecheck
corepack pnpm test
```

- [ ] **Step 3: Commit and open the final PR**

---

## When every phase is merged

- [ ] Re-read the spec's §14 and open one issue per out-of-scope item: the `facts_used` aggregate, the Google place imagery, colouring the prompt blocks by which tab wrote them, and the voice half of the loop.
- [ ] Update `docs/system-map.md` if its counts name the settings surface.
