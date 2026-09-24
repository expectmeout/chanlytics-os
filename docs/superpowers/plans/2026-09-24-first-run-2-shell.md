# The first run, PR 2: the shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new owner's workspace is made from their sign-up answers with no second screen, and they land in a
full-screen first run at `#/start`: four steps over Setup's own rows, with their receptionist filling in beside them.
Settings › Setup is gone and its address redirects. Today shows what is left as one card, with a Skip this person
keeps on every device.

**Architecture:**
- **Contracts.** `packages/contracts/src/first-run.ts` holds every rule and sentence of the first run. It covers:
  - which of Setup's rows each step draws, which step a workspace is on, and the phone's step line;
  - the receptionist card and the Today card;
  - the landing rule.

  The phone greeting moves from channels into contracts so the browser can show it.
- **Bridge.** `legacy-bridge/setup.ts` publishes these helpers as `window.__firstRun`. It reads the member's put-off
  rows through the views door (`GET views`) and saves them through `PUT views/setup`.
- **Pages.** `setup.jsx` keeps Setup's rows and panels as `SetupRows` and `SetupTry` and loses its pane.
  `first-run.jsx` is the page. The shell draws it instead of its chrome, the way it draws the shared viewer.
- **F5 (create once).** Sign-up keeps the invite code it checked. The create route reads that code for itself. The
  create screen presses Create on arrival.

**Tech Stack:** TypeScript (contracts, bridge, dashboard server), classic-script JSX for the legacy pages, node:test
(`corepack pnpm test`), committed `packages/*/dist`. No new dependencies and no migration.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `feat/first-run-shell`, off `origin/main` at
`4ff6f3bc`. One PR at the end. Spec: `docs/superpowers/specs/2026-09-24-first-run-design.md`. Canvas boards: R10
(Today, after), R11 (Settings, after), P1–P9 (phone), V1 (Google sign-up), V8 (skipping the test), C1 (parts).

**What is not in this PR:**
- The new content of each step is PRs 3–5. Here each step draws Setup's own rows, with their own buttons, words and
  panels:
  - Find and Check (PR 3);
  - the three ways to a number, with the codes (PR 4);
  - the three-moment test and the activation (PR 5).
- The Google sign-up's name step is V1, in PR 3. Such an account still sees the create screen.
- The edge keeps writing `admin/setup` into bell rows (voice-provision, forwarding, provision). That keeps either
  deploy order working, and the dashboard redirects the old address.
- There is no move of old per-device "Later" choices. Such a row shows once more on Today's card, and one Skip keeps
  it put off on every device.

---

### Task 0: The worktree can run the gates

**Files:** none.

- [ ] **Step 1:** `corepack pnpm install --frozen-lockfile --prefer-offline`
- [ ] **Step 2:** `corepack pnpm --filter "./packages/*" build`, then restore the dists whose diff is line endings only:
  `for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done`
- [ ] **Step 3:** `corepack pnpm test`, and record the pass / fail / skipped counts here as the baseline.

---

### Task 1: The phone greeting is contracts'

The receptionist card shows the greeting "word for word" (C1). `greetingFor` is in `packages/channels`, which the
browser may not import, so it moves to contracts, and channels re-exports it.

**Files:**
- Create: `packages/contracts/src/greeting.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from "./greeting";`)
- Modify: `packages/channels/src/voice-shell.ts` (remove the two definitions; import and re-export them)
- Test: `tooling/scripts/tests/first-run.test.mjs` (new)

- [ ] **Step 1: Write the failing test** at the top of the new `first-run.test.mjs`:

```js
/**
 * The first run (docs/superpowers/specs/2026-09-24-first-run-design.md): Setup's own rows, one step to a screen at
 * #/start, the owner's receptionist beside them, and what is left as one card on Today. Run here: the contracts that
 * decide all of it, on Setup's own fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingFor, GREETING_DEFAULT } from "@chanlytics/contracts";
import { greetingFor as shellGreeting, GREETING_DEFAULT as SHELL_DEFAULT } from "@chanlytics/channels";

test("the phone greeting is one sentence, composed once: contracts', and the voice shell says the same", () => {
  assert.equal(
    greetingFor("Harbor Moving"),
    "Thank you for calling Harbor Moving! This call may be recorded. I'm the automated assistant — how can I help you today?",
  );
  assert.equal(shellGreeting("Harbor Moving"), greetingFor("Harbor Moving"));
  assert.equal(GREETING_DEFAULT, SHELL_DEFAULT);
  assert.equal(
    GREETING_DEFAULT,
    "Thank you for calling! This call may be recorded. I'm the automated assistant — how can I help you today?",
  );
});
```

- [ ] **Step 2:** `node --conditions=react-server --import tsx --test tooling/scripts/tests/first-run.test.mjs`.
  Expect FAIL: contracts has no `greetingFor`.
- [ ] **Step 3: Move it.** Create `packages/contracts/src/greeting.ts` with the function and constant moved verbatim
  from `voice-shell.ts:57-81`, including its doc comment. Add one line to that comment: "Contracts' since the first
  run shows it to the owner; the voice shell re-exports it." In `voice-shell.ts`, delete the two definitions and add
  this beside its other contracts import:

```ts
import { greetingFor, GREETING_DEFAULT } from "@chanlytics/contracts";
export { greetingFor, GREETING_DEFAULT };
```

  Then add `export * from "./greeting";` to `packages/contracts/src/index.ts`.
- [ ] **Step 4:** `corepack pnpm --filter @chanlytics/contracts build && corepack pnpm --filter @chanlytics/channels build`,
  then run the test. Expect PASS. Also run `voice-shell*.test.mjs` and `voice-*.test.mjs`. Expect PASS: the re-export
  keeps every caller.
- [ ] **Step 5: Commit:** `refactor(greeting): the phone greeting is contracts', so the first run can show it`

---

### Task 2: The first run's view model

**Files:**
- Create: `packages/contracts/src/first-run.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from "./first-run";`)
- Modify: `packages/contracts/src/setup.ts`:
  - add `setupLaterOf`;
  - `SetupInputs.later` is documented as the member's own list;
  - delete `shouldLandOnSetup`, which moves here;
  - delete `SetupVM.line` and its sentence, since nothing reads them after Task 8.
- Modify: `packages/contracts/src/signup.ts` (Task 9 uses it; nothing here)
- Test: `tooling/scripts/tests/first-run.test.mjs`
- Modify: `tooling/scripts/tests/setup.test.mjs`. Move the landing test to `first-run.test.mjs`, rewritten for
  `shouldLandOnFirstRun`, and drop the `shouldLandOnSetup` import.

- [ ] **Step 1: Write the failing tests** (append to `first-run.test.mjs`; the fixtures are `setup.test.mjs`'s own):

```js
import {
  setupSteps,
  firstRunOf,
  firstRunStepOf,
  setupCardOf,
  receptionistCardOf,
  shouldLandOnFirstRun,
  setupLaterOf,
  openWeekWords,
  servicesWords,
  FIRST_RUN_STEPS,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const VOICE = "+13055550124";
const WA = "+13055550123";
const HANDOFF = "+13055550100";
const empty = (over = {}) => ({
  business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  later: [],
  ...over,
});
const facts = { name: "Northside Movers", hours: true, services: 4, bookingLink: true, address: true, handoff: HANDOFF, broken: false };
const live = (over = {}) =>
  empty({
    business: facts,
    channels: {
      whatsapp: { present: true, active: true, number: WA, quality: "GREEN", lastInboundAt: "2026-09-07T14:30:00Z" },
      voice: { present: true, active: true, number: VOICE, lastInboundAt: "2026-09-06T14:30:00Z" },
    },
    templates: { approved: 6, pending: 0, startersApproved: 5 },
    calendar: { state: "ok" },
    team: { members: 2, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 3, offers: 1, offersSaidYes: 1 },
    activations: [
      { capability: "voice", activated_at: "2026-09-08T09:00:00Z", activated_by: "u-owner", deactivated_at: null },
      { capability: "whatsapp", activated_at: "2026-09-08T09:00:00Z", activated_by: "u-owner", deactivated_at: null },
    ],
    ...over,
  });
const ids = (rows) => rows.map((r) => r.id);

test("a new workspace starts on its business: one step current, the rest ahead, and the step draws only its own rows", () => {
  const fr = firstRunOf(setupSteps(empty(), NOW));
  assert.deepEqual(fr.steps.map((s) => [s.key, s.state]), [["business", "current"], ["phone", "ahead"], ["try", "ahead"], ["live", "ahead"]]);
  assert.equal(fr.current, "business");
  assert.equal(fr.complete, false);
  assert.equal(fr.shown.key, "business");
  assert.deepEqual(ids(fr.shown.rows), ["facts"], "Setup's facts row; no Google row on a deployment without it");
  assert.equal(fr.primaryRow, "facts", "the step's one coral action is its first open row");
  assert.equal(fr.heading, "Your business");
  assert.equal(fr.phoneLine, "Step 1 of 4 · Your business");
  assert.equal(fr.progress, 25);
  assert.equal(fr.back, null);
  assert.equal(fr.onward, null, "nothing to continue to while the step asks something");
  assert.deepEqual(ids(fr.steps.find((s) => s.key === "phone").rows), ["line", "keep"], "no billing row without billing");
  assert.deepEqual(ids(fr.steps.find((s) => s.key === "try").rows), ["receptionist", "handoff"]);
});

test("the facts are in: the phone is current, the business can be looked at again, and a step ahead cannot", () => {
  const vm = setupSteps(empty({ business: facts }), NOW);
  const fr = firstRunOf(vm);
  assert.deepEqual(fr.steps.map((s) => s.state), ["done", "current", "ahead", "ahead"]);
  assert.equal(fr.shown.key, "phone");
  const back = firstRunOf(vm, "business");
  assert.equal(back.shown.key, "business", "a step already reached opens");
  assert.deepEqual(back.onward, { label: "Continue", to: "start" }, "and Continue goes on to where the workspace is");
  assert.equal(firstRunOf(vm, "try").shown.key, "phone", "a step not reached yet shows where the workspace is instead");
  assert.equal(firstRunOf(vm, "phone").back, "business");
});

test("answering: Live is current, with what is left after, and Finish goes to Today", () => {
  const vm = setupSteps(live(), NOW);
  const fr = firstRunOf(vm);
  assert.equal(fr.complete, true);
  assert.equal(fr.current, "live");
  assert.deepEqual(fr.steps.map((s) => s.state), ["done", "done", "done", "current"]);
  assert.equal(fr.heading, "Your receptionist is answering");
  assert.equal(fr.lead, vm.readiness.sentence, "Setup's own sentence says what it answers on");
  assert.deepEqual(ids(fr.shown.rows), ["whatsapp", "calendar", "team", "yes"]);
  assert.equal(fr.primaryRow, null, "on Live the one action is Finish");
  assert.deepEqual(fr.onward, { label: "Finish", to: "today" });
  assert.equal(fr.progress, 100);
});

test("an address names a step or nothing", () => {
  assert.deepEqual(FIRST_RUN_STEPS.map((s) => s.key), ["business", "phone", "try", "live"]);
  assert.equal(firstRunStepOf("phone"), "phone");
  assert.equal(firstRunStepOf("setup"), null);
  assert.equal(firstRunStepOf(null), null);
});

test("Today's card: while nothing answers, one row that opens the first run; after, Setup's own rows in the order they help most, never one put off", () => {
  const before = setupCardOf(setupSteps(empty(), NOW));
  assert.equal(before.title, "Finish setting up");
  assert.equal(before.left, "3 steps left");
  assert.deepEqual(before.start, {
    name: "Your receptionist isn't answering yet",
    sentence: "Next: your business.",
    cta: "Continue setting up",
    to: "start",
  });
  assert.deepEqual(before.rows, []);
  assert.equal(before.hide, null, "the first run cannot be put off");

  const after = setupCardOf(setupSteps(live(), NOW));
  assert.equal(after.start, null);
  assert.deepEqual(ids(after.rows), ["keep"], "the one thing a workspace answering everywhere has left");
  assert.equal(after.left, "1 left");
  assert.equal(after.hide, "Hide");
  assert.equal(after.skip, "Skip");
  assert.equal(setupCardOf(setupSteps(live({ later: ["keep"] }), NOW)), null, "nothing left once it is put off");

  const quiet = live({ calendar: { state: "none" }, team: { members: 1, invitesOpen: 0, alertEmails: 0 } });
  assert.deepEqual(ids(setupCardOf(setupSteps(quiet, NOW)).rows), ["calendar", "team", "keep"], "WhatsApp, the calendar, a back-up, then the rest");
});

test("the receptionist card: every value is Setup's or the settings read's, the greeting is the phone's word for word, and a blank is a dash", () => {
  const hours = { mon: { open: "09:00", close: "17:00" }, tue: { open: "09:00", close: "17:00" } };
  const services = [{ name: "Local move", duration_min: 120 }, { name: "Packing" }, { name: "Storage" }, { name: "Piano" }];
  const card = receptionistCardOf({
    setup: live(),
    answering: true,
    brain: {
      business_name: "Northside Movers",
      booking_link: "https://www.northside.example/book/",
      profile: { hours, services, languages: ["English", "Spanish"] },
    },
    numbers: { voiceLine: VOICE, keptLine: "+12125550142", handoff: HANDOFF },
    workspaceName: "Northside",
    tz: "America/New_York",
  });
  assert.equal(card.caption, "Your receptionist, so far");
  assert.equal(card.initials, "NM");
  assert.equal(card.name, "Northside Movers");
  assert.deepEqual(card.status, { tone: "ok", words: "Answering" });
  assert.equal(card.strip, "Your receptionist · Answering");
  assert.equal(card.greeting, greetingFor("Northside Movers"));
  const sv = servicesWords(services);
  assert.deepEqual(
    card.rows.map((r) => [r.key, r.label, r.value]),
    [
      ["open", "Open", openWeekWords(hours, "America/New_York")],
      ["knows", "Knows", `${sv.chips.map((c) => c.name).join(", ")} ${sv.more}`],
      ["books", "Books with", "northside.example/book"],
      ["speaks", "Speaks", "English, Spanish"],
      ["answers", "Answers", "+1 (212) 555-0142 when nobody picks up"],
      ["through", "Puts through to", "+1 (305) 555-0100"],
    ],
  );
  assert.equal(card.foot, "Fills in as you go. You can change any of it later in Settings › Business.");

  const bare = receptionistCardOf({ setup: empty(), answering: false, brain: null, numbers: null, workspaceName: "Luna Studio", tz: "America/New_York" });
  assert.equal(bare.name, "Luna Studio", "the workspace's name until the receptionist has one");
  assert.equal(bare.initials, "LS");
  assert.deepEqual(bare.status, { tone: "plain", words: "Not answering yet" });
  assert.equal(bare.greeting, greetingFor("Luna Studio"));
  assert.deepEqual(bare.rows.map((r) => r.value), [null, null, null, null, null, null]);

  const untried = receptionistCardOf({
    setup: live({ channels: { whatsapp: empty().channels.whatsapp, voice: { present: true, active: true, number: VOICE, lastInboundAt: null } } }),
    answering: true,
    brain: null,
    numbers: null,
    workspaceName: null,
    tz: "America/New_York",
  });
  assert.deepEqual(untried.status, { tone: "ok", words: "Answering · not tried yet" });
  assert.equal(untried.rows.find((r) => r.key === "answers").value, "+1 (305) 555-0124", "the line itself, with no number kept");
});

test("the landing rule: an owner whose receptionist answers nowhere lands on the first run once, from Today or nothing", () => {
  assert.equal(shouldLandOnFirstRun("owner", false, "today", false), true);
  assert.equal(shouldLandOnFirstRun("owner", false, "", false), true);
  assert.equal(shouldLandOnFirstRun("owner", false, "inbox", false), false, "a deep link is respected");
  assert.equal(shouldLandOnFirstRun("owner", false, "today", true), false, "once per session");
  assert.equal(shouldLandOnFirstRun("owner", true, "today", false), false, "answering: Today is the page");
  assert.equal(shouldLandOnFirstRun("operator", false, "today", false), false, "only the owner is sent");
  assert.equal(shouldLandOnFirstRun(null, false, "today", false), false);
});

test("the rows a member put off are ids from their saved view, and nothing else", () => {
  assert.deepEqual(setupLaterOf({ later: ["calendar", "calendar", 7, "team"] }), ["calendar", "team"]);
  assert.deepEqual(setupLaterOf({ later: "calendar" }), []);
  assert.deepEqual(setupLaterOf(null), []);
  assert.deepEqual(setupLaterOf({ later: ["x".repeat(41)] }), [], "an id is short");
});
```

- [ ] **Step 2:** Run the file. Expect FAIL: `firstRunOf` is not a function.
- [ ] **Step 3: Write `packages/contracts/src/first-run.ts`:**

```ts
/**
 * The first run (docs/superpowers/specs/2026-09-24-first-run-design.md): Setup's own rows, one step to a screen at
 * `#/start`, with the owner's receptionist filling in beside them, and what is left afterwards as one card on Today.
 *
 * Nothing here is stored. The step a workspace is on is worked out from Setup's view model on every draw, so the first
 * run resumes from what is true: a line bought in another tab moves the owner on, and a fact taken away in Settings
 * brings them back. Every sentence the first run says is here; the page composes (first-run.jsx).
 */
import { formatPhoneDisplay } from "./phone";
import { greetingFor } from "./greeting";
import { openWeekWords, servicesWords, type ServiceWordsInput } from "./business-tab";
import type { Hours } from "./config";
import type { SetupDto, SetupRowVM, SetupVM } from "./setup";

/** The first run's address: `#/start`, and `#/start/<step>` for a step already reached. */
export const FIRST_RUN_ROUTE = "start";

export type FirstRunStepKey = "business" | "phone" | "try" | "live";

interface FirstRunStepDef {
  key: FirstRunStepKey;
  /** On the rail, in the phone's step line and as the step's heading. */
  name: string;
  /** What the step is for, under its heading. */
  lead: string;
  /** Setup's rows the step draws, in this order; a row the workspace does not have is left out. */
  rows: readonly string[];
  /** The rows that must be ready for the step to be done; a row the workspace does not have is not waited for. */
  needs: readonly string[];
}

export const FIRST_RUN_STEPS: readonly FirstRunStepDef[] = [
  {
    key: "business",
    name: "Your business",
    lead: "What your receptionist says about you: your name, when you're open, what you offer.",
    rows: ["facts", "google"],
    needs: ["facts"],
  },
  {
    key: "phone",
    name: "Your phone",
    lead: "The number your customers call, and how those calls reach your receptionist.",
    rows: ["billing", "line", "keep"],
    needs: ["billing", "line"],
  },
  {
    key: "try",
    name: "Try it",
    lead: "Call it from your own phone and hear what your customers will hear.",
    rows: ["receptionist", "handoff"],
    needs: ["receptionist"],
  },
  { key: "live", name: "Live", lead: "", rows: [], needs: [] },
];

/** What is left once the receptionist answers, on Live: Setup's rows no step asks for. */
const LIVE_ROWS = ["whatsapp", "calendar", "team", "email", "yes"] as const;

/**
 * Today's card, in the order each row helps most: WhatsApp first, because the booking link goes out by WhatsApp on a
 * call; then the calendar, so it can say which times are open; then someone to back the owner up; then the rows a
 * step offered and nobody took.
 */
export const SETUP_CARD_ORDER = ["whatsapp", "calendar", "team", "handoff", "keep", "google", "email", "yes"] as const;

export const FIRST_RUN_WORDS = {
  title: "Setting up",
  later: "Finish later",
  laterShort: "Later",
  back: "Back",
  continue: "Continue",
  finish: "Finish",
  liveHeading: "Your receptionist is answering",
  liveNext: "When you're ready",
  reading: "Reading your workspace…",
  failedWhat: "your workspace",
  failedBody: "This page can't read your workspace at the moment. Nothing you set up is lost.",
  toToday: "Back to Today",
  putOff: "Later",
  undoPutOff: "Undo later",
} as const;

export type FirstRunStepState = "done" | "current" | "ahead";

export interface FirstRunStepVM {
  key: FirstRunStepKey;
  name: string;
  /** 1 to 4. */
  number: number;
  state: FirstRunStepState;
  rows: SetupRowVM[];
}

export interface FirstRunVM {
  steps: FirstRunStepVM[];
  /** The first step not done: where `#/start` opens. Live once the other three are. */
  current: FirstRunStepKey;
  /** Your business, your phone and try it are done. */
  complete: boolean;
  /** The step on screen: the one the address names when it has been reached, else the current one. */
  shown: FirstRunStepVM;
  heading: string;
  lead: string;
  /** "Step 2 of 4 · Your phone", the phone's header. */
  phoneLine: string;
  /** How much of the phone's bar is filled, in percent: the shown step's own place. */
  progress: number;
  /** The row whose button is the step's one coral action: its first open row with something to press. */
  primaryRow: string | null;
  /** The step before the shown one, for Back. */
  back: FirstRunStepKey | null;
  /** Once the shown step asks nothing more: on to where the workspace is, or Finish to Today from Live. */
  onward: { label: string; to: string } | null;
}

const rowOf = (vm: SetupVM, id: string): SetupRowVM | null => vm.rows.find((r) => r.id === id) ?? null;
const stepDone = (vm: SetupVM, def: FirstRunStepDef): boolean =>
  def.needs.every((id) => {
    const r = rowOf(vm, id);
    return !r || r.state === "ready";
  });

/** The step a `#/start/<step>` address names, or null for anything else. */
export function firstRunStepOf(param: string | null | undefined): FirstRunStepKey | null {
  const hit = FIRST_RUN_STEPS.find((s) => s.key === param);
  return hit ? hit.key : null;
}

/** Where the workspace is in the first run, and what the step on screen draws. `at` is the address's step. */
export function firstRunOf(vm: SetupVM, at?: string | null): FirstRunVM {
  const open = FIRST_RUN_STEPS.find((s) => s.key !== "live" && !stepDone(vm, s));
  const current: FirstRunStepKey = open ? open.key : "live";
  const steps: FirstRunStepVM[] = FIRST_RUN_STEPS.map((def, i) => ({
    key: def.key,
    name: def.name,
    number: i + 1,
    state: def.key === current ? "current" : def.key !== "live" && stepDone(vm, def) ? "done" : "ahead",
    rows: (def.key === "live" ? LIVE_ROWS : def.rows)
      .map((id) => rowOf(vm, id))
      .filter((r): r is SetupRowVM => r !== null),
  }));
  const asked = firstRunStepOf(at);
  const shown =
    steps.find((s) => s.key === asked && s.state !== "ahead") ?? steps.find((s) => s.key === current) ?? steps[0];
  const def = FIRST_RUN_STEPS[shown.number - 1];
  const live = shown.key === "live";
  const primary = live ? null : shown.rows.find((r) => r.state !== "ready" && !r.later && r.verb) ?? null;
  return {
    steps,
    current,
    complete: !open,
    shown,
    heading: live ? FIRST_RUN_WORDS.liveHeading : def.name,
    lead: live ? vm.readiness.sentence : def.lead,
    phoneLine: `Step ${shown.number} of ${FIRST_RUN_STEPS.length} · ${shown.name}`,
    progress: Math.round((shown.number / FIRST_RUN_STEPS.length) * 100),
    primaryRow: primary ? primary.id : null,
    back: shown.number > 1 ? FIRST_RUN_STEPS[shown.number - 2].key : null,
    onward: live
      ? { label: FIRST_RUN_WORDS.finish, to: "today" }
      : shown.state === "done"
        ? { label: FIRST_RUN_WORDS.continue, to: FIRST_RUN_ROUTE }
        : null,
  };
}

export interface SetupCardVM {
  title: string;
  /** "3 steps left" while the first run is not done; "2 left" after. */
  left: string;
  /** While the receptionist is not answering: the one row, which opens the first run. */
  start: { name: string; sentence: string; cta: string; to: string } | null;
  /** After: Setup's own rows, open and not put off, in SETUP_CARD_ORDER. */
  rows: SetupRowVM[];
  /** Puts every row off at once; only where rows can be put off. */
  hide: string | null;
  skip: string;
}

/** Today's card: what is left to set up, or null when nothing is. */
export function setupCardOf(vm: SetupVM): SetupCardVM | null {
  const fr = firstRunOf(vm);
  if (!fr.complete) {
    const left = fr.steps.filter((s) => s.key !== "live" && s.state !== "done").length;
    const next = fr.steps.find((s) => s.key === fr.current) ?? fr.steps[0];
    return {
      title: "Finish setting up",
      left: `${left} ${left === 1 ? "step" : "steps"} left`,
      start: {
        name: "Your receptionist isn't answering yet",
        sentence: `Next: ${next.name.toLowerCase()}.`,
        cta: "Continue setting up",
        to: FIRST_RUN_ROUTE,
      },
      rows: [],
      hide: null,
      skip: "Skip",
    };
  }
  const rows = SETUP_CARD_ORDER.map((id) => rowOf(vm, id)).filter(
    (r): r is SetupRowVM => r !== null && r.state !== "ready" && !r.later && !!r.verb,
  );
  if (!rows.length) return null;
  return { title: "Finish setting up", left: `${rows.length} left`, start: null, rows, hide: "Hide", skip: "Skip" };
}

export interface ReceptionistCardInputs {
  setup: SetupDto;
  answering: boolean;
  /** The receptionist's brain as the settings read has it; null until that read lands. */
  brain: {
    business_name?: string | null;
    booking_link?: string | null;
    profile?: {
      hours?: Partial<Record<string, Hours>> | null;
      services?: readonly ServiceWordsInput[] | null;
      languages?: readonly string[] | null;
    } | null;
  } | null;
  /** The numbers as the settings read resolved them (facts.ts); null until that read lands. */
  numbers: { voiceLine: string | null; keptLine: string | null; handoff: string | null } | null;
  /** The workspace's own name, for a receptionist with none yet. */
  workspaceName: string | null;
  /** The workspace's clock, which the hours are in. */
  tz: string;
}

export interface ReceptionistCardVM {
  caption: string;
  initials: string;
  name: string;
  status: { tone: "plain" | "ok"; words: string };
  /** The phone's one line for the card: "Your receptionist · Answering". */
  strip: string;
  greetingLabel: string;
  greeting: string;
  rows: Array<{ key: "open" | "knows" | "books" | "speaks" | "answers" | "through"; label: string; value: string | null }>;
  foot: string;
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** A link as a person reads it: no scheme, no "www.", no trailing slash. */
const linkShown = (url: string): string => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");

/** The owner's receptionist, so far: who it is, whether it answers, what it greets with and what it knows. */
export function receptionistCardOf(i: ReceptionistCardInputs): ReceptionistCardVM {
  const b = i.brain;
  const p = b?.profile ?? null;
  const name = (b?.business_name || i.setup.business.name || i.workspaceName || "").trim();
  const tried = !!(i.setup.channels.voice.lastInboundAt || i.setup.channels.whatsapp.lastInboundAt);
  const status: ReceptionistCardVM["status"] = !i.answering
    ? { tone: "plain", words: "Not answering yet" }
    : { tone: "ok", words: tried ? "Answering" : "Answering · not tried yet" };
  const sv = servicesWords(p?.services ?? null);
  const kept = i.numbers?.keptLine ?? null;
  const line = i.numbers?.voiceLine ?? i.setup.channels.voice.number ?? null;
  const through = i.numbers?.handoff ?? i.setup.business.handoff ?? null;
  const show = (n: string | null) => (n ? formatPhoneDisplay(n) ?? n : null);
  return {
    caption: "Your receptionist, so far",
    initials: initialsOf(name),
    name: name || "Your receptionist",
    status,
    strip: `Your receptionist · ${status.words}`,
    greetingLabel: "Greets every caller with",
    greeting: greetingFor(name || null),
    rows: [
      { key: "open", label: "Open", value: i.setup.business.hours && p?.hours ? openWeekWords(p.hours, i.tz) : null },
      {
        key: "knows",
        label: "Knows",
        value: sv.count ? [sv.chips.map((c) => c.name).join(", "), sv.more].filter(Boolean).join(" ") : null,
      },
      { key: "books", label: "Books with", value: b?.booking_link ? linkShown(b.booking_link) : null },
      { key: "speaks", label: "Speaks", value: p?.languages?.length ? p.languages.join(", ") : null },
      { key: "answers", label: "Answers", value: kept ? `${show(kept)} when nobody picks up` : show(line) },
      { key: "through", label: "Puts through to", value: show(through) },
    ],
    foot: "Fills in as you go. You can change any of it later in Settings › Business.",
  };
}

/**
 * Whether this arrival lands on the first run: an owner, a receptionist that answers nowhere yet, a plain arrival
 * (Today or nothing), and not already sent there this session. Everyone else gets Today. Setup's rule, moved with the
 * page it lands on.
 */
export function shouldLandOnFirstRun(
  role: string | null | undefined,
  answering: boolean,
  route: string,
  landed: boolean,
): boolean {
  if (landed || role !== "owner" || answering) return false;
  return route === "" || route === "today";
}
```

  In `setup.ts`:
  - Delete `shouldLandOnSetup` and its comment.
  - Delete `line` from `SetupVM` and from the returned object.
  - Change the `SetupInputs.later` comment to "Row ids this member put off: their saved Setup view (setupLaterOf)."
  - Add this after `setupRoute`:

```ts
/**
 * The rows a member put off, as their saved Setup view keeps them (`memberships.views.setup`, the door People's own
 * view goes through): short ids, each once, nothing else. A view somebody hand-edited is no rows, never a throw.
 */
export function setupLaterOf(view: unknown): string[] {
  const later = view && typeof view === "object" ? (view as { later?: unknown }).later : null;
  if (!Array.isArray(later)) return [];
  return [...new Set(later.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 40))];
}
```

  Add `export * from "./first-run";` to `index.ts`. In `setup.test.mjs`, delete the landing test at lines 808-818
  (it moved here) and remove `shouldLandOnSetup` from its import.
- [ ] **Step 4:** Build contracts, then run `first-run.test.mjs` and `setup.test.mjs`. Expect PASS on both. If
  `setup.test.mjs` asserts `vm.line` anywhere (`grep -n "\.line\b" tooling/scripts/tests/setup.test.mjs` showed none
  on 24 Sep), delete those lines too.
- [ ] **Step 5: Commit:** `feat(first-run): the view model -- steps over Setup's rows, the receptionist card, Today's card, the landing`

---

### Task 3: Setup's rows are one component, and the pane goes

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/setup.jsx:298-484`. Replace `PaneSetup` with `SetupRows` and `SetupTry`.
  `LineChooser`, `ForwardingCard`, `ListingFinder`, `SETUP_GATES` and `act` are kept whole.
- Modify: `tooling/scripts/tests/setup-page-activate.test.mjs`. `Page` draws `SetupRows` over every row, and the
  failed-read test moves to Task 5's page test.

- [ ] **Step 1: Point the test at the component.** In `setup-page-activate.test.mjs`:
  - Replace `const Page = globalThis.window.PaneSetup;` with the lines below.
  - Delete the test "the page: a failed read draws a card with a retry, and the retry reads again" (lines 374-403).
    Task 5's page test has it now, on the first run.
  - Give `__setup` a `later: async (ids, on) => { calls.later.push([ids, on]); return { ok: true, message: "" }; }`.
    Add `later: []` to `calls`.
  - Add one test for the Later button.

```js
const Page = () =>
  globalThis.window.SetupRows({
    S: globalThis.window.__SETUP,
    rows: globalThis.window.__SETUP.vm.rows,
    primary: globalThis.window.__SETUP.vm.next ? globalThis.window.__SETUP.vm.next.row : null,
  });
```

```js
test("the page: Later puts a row off through the bridge, and waits for it like any other press", async () => {
  fresh();
  const tree = mount();
  const later = byTestId(tree, "setup-later-keep");
  assert.ok(later, "an optional row that is not ready can be put off");
  assert.equal(textOf(later), "Later");
  later.props.onClick();
  await tick();
  assert.deepEqual(calls.later.at(-1), ["keep", true]);
});
```

  (If the file has no `textOf`, add the one `create-workspace-screen.test.mjs` defines.)
- [ ] **Step 2:** Run it. Expect FAIL: `window.SetupRows` is not a function.
- [ ] **Step 3: Rewrite the end of `setup.jsx`.** Change the header comment's first line to "Setup's rows: every fact
  the workspace holds, drawn wherever a page asks what is left to set up. The first run draws them one step at a
  time (first-run.jsx); Today draws what is left after (dashboard-a-brief.jsx)." Then replace lines 298-484 with:

```jsx
// What a row's second button says when it puts the row off. The first run offers Later and its undo; Today's card
// offers Skip, and a row skipped there is not on the card to undo.
const SETUP_LATER_WORDS = { put: "Later", undo: "Undo later" };

/**
 * Setup's rows, as attention rows, with everything a row does: a route, a dial, or one of the page's own acts (asking a
 * person, the line chooser, forwarding, the Google finder, activation, billing), each behind its door's role
 * (SETUP_GATES). `rows` are Setup's (contracts setupSteps), in the order to draw them; `primary` names the row whose
 * button is the one coral action. Holds the panels' state and the one verb on its way, so a second press waits for the
 * first (S23). The list only: the caller draws the card it sits in.
 */
const SetupRows = ({ S, rows, primary = null, later = SETUP_LATER_WORDS, testid = "setup-rows" }) => {
  const [toastNode, flash] = window.usePPToast();
  const [chooser, setChooser] = React.useState(false);
  const [forwarding, setForwarding] = React.useState(false);
  const [finder, setFinder] = React.useState(false);
  const [pending, setPending] = React.useState(null);
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  const once = async (to, run) => {
    if (pending) return;
    setPending(to);
    try { await run(); } finally { setPending(null); }
  };
  // (the whole `act` function from the old PaneSetup, lines 331-405, unchanged)
  const putOff = (r) =>
    once(`later:${r.id}`, async () => {
      const res = await window.__setup.later(r.id, !r.later);
      if (!res.ok) flash(window.refusalToast(res, "Not saved"));
    });
  const laterLabel = (r) => (r.later ? later.undo : later.put);
  return (
    <div className="tq-list setup-rows" data-testid={testid}>
      {rows.map((r) => (
        <div key={r.id} className={r.later ? "setup-later" : undefined}>
          <window.AttnRow
            glyph={r.icon}
            name={r.title}
            sentence={r.sentence}
            quoted={false}
            status={[r.stateWords]}
            note={r.details.join(" · ")}
            tone={setupTone(r.state)}
            cta={r.verb ? { label: r.verb.label, kind: primary === r.id ? "primary" : "ghost", onClick: () => act(r.verb), gate: setupGate(r.verb), busy: pending === r.verb.to } : null}
            also={r.undo
              ? { label: r.undo.label, onClick: () => act(r.undo), gate: setupGate(r.undo), busy: pending === r.undo.to, testid: `setup-undo-${r.id}` }
              : !r.required && r.state !== "ready" && laterLabel(r)
                ? { label: laterLabel(r), onClick: () => putOff(r), busy: pending === `later:${r.id}`, testid: `setup-later-${r.id}` }
                : null}
            // The row is a click target for a navigation, never for a dial: a mis-click on the receptionist row must
            // not ring the shop. Nor is it a way around its own gated button.
            onOpen={r.verb && !r.verb.to.startsWith("tel:") && !setupGated(r.verb) ? () => act(r.verb) : undefined}
            testid={`setup-row-${r.id}`}
            ctaTestid="setup-verb"
          />
          {r.id === "line" && chooser && <LineChooser S={S} flash={flash} onDone={() => setChooser(false)} onKeep={() => setForwarding(true)} />}
          {r.id === "keep" && forwarding && <ForwardingCard S={S} flash={flash} onDone={() => setForwarding(false)} />}
          {r.id === "google" && finder && <ListingFinder flash={flash} onDone={() => setFinder(false)} />}
        </div>
      ))}
      {toastNode}
    </div>
  );
};

/** The numbers to try once the receptionist answers somewhere: call it, then open Live; text it, then open the Inbox. */
const SetupTry = ({ tryIt }) => {
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  return (
    <section className="fl-card set-card setup-try" data-testid="setup-try">
      {/* the old PaneSetup's try card, lines 426-447, unchanged, with `vm.tryIt` read as `tryIt` and `dial(n)` inlined as `tel:${n}` */}
    </section>
  );
};

window.SetupRows = SetupRows;
window.SetupTry = SetupTry;
```

  `act` moves in unchanged. It still calls `nav`, `flash`, `once`, `setChooser`, `setForwarding` and `setFinder`,
  all of which `SetupRows` defines. The try card's markup moves in unchanged too. The two bracketed comments stand
  for those moves, and only for moved code. Delete `useSetupTick`: the page that draws the rows re-reads on
  `surface:setup` itself.

- [ ] **Step 4:** Run `setup-page-activate.test.mjs`. Expect PASS.
- [ ] **Step 5: Commit:** `refactor(setup): Setup's rows are one component the first run and Today both draw`

---

### Task 4: The bridge publishes the first run, and a put-off row is the member's

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/setup.ts`:
  - imports;
  - `SetupSurface.later`;
  - `publish`;
  - `apply` reads `GET views` too;
  - `__setup.later` saves the view;
  - the landing goes to `start`;
  - `window.__firstRun`;
  - delete `laterKey`, `readLater`, `writeLater` and `safeStorage`.
- Test: `tooling/scripts/tests/setup-later.test.mjs` (new): the bridge's `later`, run over a fake API.

- [ ] **Step 1: Write the failing test:**

```js
/**
 * A row put off is the member's, on every device: the Setup surface reads their saved view beside the workspace's
 * facts (GET views), and Later or Skip saves it through the door People's own view goes through (PUT views/setup).
 * Run here: the bridge's own installSetup and setupOverride, over a fetch that answers as the routes do.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const asked = [];
let viewsAnswer = { views: { setup: { later: ["calendar"] } } };
let putOk = true;
const SETUP = {
  business: { name: "Harbor Moving", hours: true, services: 2, bookingLink: true, address: true, handoff: null, broken: false },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: true, number: "+13055550123", lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
};
globalThis.window = globalThis;
globalThis.sessionStorage = { getItem: () => "1", setItem() {} };
globalThis.location = { hash: "#/today", origin: "https://app.chanlytics.test", pathname: "/w/harbor" };
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.test");
  asked.push([init.method ?? "GET", u.pathname, init.body ? JSON.parse(init.body) : null]);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (u.pathname === "/api/v1/setup") return json(200, { setup: SETUP, role: "owner" });
  if (u.pathname === "/api/v1/views") return json(200, viewsAnswer);
  if (u.pathname === "/api/v1/views/setup") return putOk ? json(200, { views: {} }) : json(429, { error: { code: "rate_limited", message: "Too many changes -- try again in a minute." } });
  return json(404, { error: { code: "not_found", message: "no" } });
};
const bridge = await import(pathToFileURL(path.join(ROOT, "apps/dashboard/src/legacy-bridge/setup.ts")).href);
bridge.installSetup(globalThis);

test("the surface reads the member's put-off rows with the workspace's facts, and the rows say so", async () => {
  await bridge.setupOverride.apply();
  assert.deepEqual(window.__SETUP.later, ["calendar"]);
  assert.equal(window.__SETUP.vm.rows.find((r) => r.id === "calendar").later, true);
  assert.ok(asked.some(([m, p]) => m === "GET" && p === "/api/v1/views"), "read through the views door");
});

test("Later saves the member's whole list through the views door; Undo takes one off", async () => {
  asked.length = 0;
  const r = await window.__setup.later("team", true);
  assert.equal(r.ok, true);
  assert.deepEqual(asked.at(-1), ["PUT", "/api/v1/views/setup", { view: { later: ["calendar", "team"] } }]);
  assert.deepEqual(window.__SETUP.later, ["calendar", "team"]);
  await window.__setup.later(["calendar"], false);
  assert.deepEqual(asked.at(-1)[2], { view: { later: ["team"] } });
});

test("a save the server refuses puts the row back, and says why", async () => {
  putOk = false;
  const before = [...window.__SETUP.later];
  const r = await window.__setup.later("keep", true);
  putOk = true;
  assert.equal(r.ok, false);
  assert.match(r.message, /try again/);
  assert.deepEqual(window.__SETUP.later, before, "not put off, since it was not kept");
});

test("a views read that fails puts nothing off, and Setup still reads", async () => {
  viewsAnswer = null;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).endsWith("/api/v1/views") ? new Response("no", { status: 500 }) : real(url, init));
  try {
    await bridge.setupOverride.apply();
    assert.deepEqual(window.__SETUP.later, []);
    assert.ok(window.__SETUP.vm.rows.length > 0);
  } finally {
    globalThis.fetch = real;
  }
});

test("the first run's helpers are published for the pages", () => {
  for (const k of ["of", "card", "today", "words"]) assert.ok(window.__firstRun[k], k);
});
```

  First run the file as it is. If `api.ts` needs globals the stub above lacks (the workspace id, the Supabase client,
  the fetch wrapper), copy the globals `checkout-return.test.mjs` or `surface-data*.test.mjs` set up for the same
  client, and keep the assertions unchanged.
- [ ] **Step 2:** Run it. Expect FAIL: `__SETUP.later` is undefined.
- [ ] **Step 3: Implement in `setup.ts`:**

```ts
import {
  setupSteps,
  setupRoute,
  setupLaterOf,
  shouldLandOnFirstRun,
  firstRunOf,
  receptionistCardOf,
  setupCardOf,
  FIRST_RUN_WORDS,
  FIRST_RUN_ROUTE,
  // ...the rest of the existing list, unchanged
} from "@chanlytics/contracts";
import { saveView } from "./people-detail";

export interface SetupSurface {
  dto: SetupDto;
  role: string;
  /** The rows this member put off: their saved Setup view (memberships.views.setup), the same on every device. */
  later: string[];
  vm: SetupVM;
  fetchedAt: number;
}

export interface FirstRunApi {
  of: typeof firstRunOf;
  card: typeof receptionistCardOf;
  today: typeof setupCardOf;
  words: typeof FIRST_RUN_WORDS;
}
```

  Changes inside the file:
  - **`SetupApi.later`:** its type becomes
    `later(ids: string | string[], on: boolean): Promise<{ ok: boolean; message: string }>;`. Its comment reads
    "Put optional rows off, or take them back: this member's, saved to their view, on every device."
  - **Declarations:** add `__firstRun?: FirstRunApi;` to the `declare global` block.
  - **Publishing:**

```ts
function publish(dto: SetupDto, role: string, later: string[]): void {
  window.__SETUP = { dto, role, later, vm: setupSteps({ ...dto, later }), fetchedAt: Date.now() };
}
```

  - **`apply`:**

```ts
  apply: async () => {
    try {
      // The rows this member put off ride on their own saved view, read beside the workspace's facts. A views read
      // that fails puts nothing off rather than failing Setup.
      const [d, v] = await Promise.all([
        read("GET setup"),
        read("GET views").catch(() => ({ views: {} as Record<string, unknown> })),
      ]);
      publish(d.setup, d.role, setupLaterOf(v.views.setup));
    } catch (e) {
      window.__SETUP = null;
      throw e;
    }
  },
```

  - **`later` in `installSetup`:**

```ts
    async later(ids, on) {
      const s = win.__SETUP;
      if (!s) return { ok: false, message: "Setup is still being read." };
      const list = Array.isArray(ids) ? ids : [ids];
      const next = on ? [...new Set([...s.later, ...list])] : s.later.filter((x) => !list.includes(x));
      publish(s.dto, s.role, next);
      win.dispatchEvent(new CustomEvent("surface:setup"));
      // The whole list each time: a save replaces the page's view (member_view_set, 00113).
      const r = await saveView("setup", { later: next });
      if (r.ok) return { ok: true, message: "" };
      const now = win.__SETUP;
      if (now) {
        publish(now.dto, now.role, s.later);
        win.dispatchEvent(new CustomEvent("surface:setup"));
      }
      return { ok: false, message: r.message };
    },
```

  - **The landing listener:**
    - `shouldLandOnSetup(...)` becomes `shouldLandOnFirstRun(...)`, with the same arguments.
    - `nav("admin/setup")` becomes `nav(FIRST_RUN_ROUTE)`.
    - `win.location.hash = "/admin/setup"` becomes ``win.location.hash = `/${FIRST_RUN_ROUTE}` ``.
  - **Publishing the helpers:** at the end of `installSetup`, add
    `win.__firstRun = { of: firstRunOf, card: receptionistCardOf, today: setupCardOf, words: FIRST_RUN_WORDS };`.
  - **Removals:** delete `laterKey`, `readLater`, `writeLater` and `safeStorage`, and the `getActiveWorkspace` import
    if nothing else uses it.

- [ ] **Step 4:** Run `setup-later.test.mjs`, `setup-page-activate.test.mjs` and `setup.test.mjs`.
  - Expect PASS on the first two.
  - `setup.test.mjs`'s wiring test pins `"chanlytics.setup.later."` and the old landing call. Update the landing pin
    to `shouldLandOnFirstRun(s.role, s.vm.readiness.answering, setupRoute(win.location.hash), landed)`, and change the
    later/landed pin to `bridge.includes("chanlytics.setup.landed")` alone. The count stays the same or falls.
  - Expect PASS.
- [ ] **Step 5: Commit:** `feat(setup): a row put off is the member's, on every device; the landing goes to the first run`

---

### Task 5: The first run page

**Files:**
- Create: `apps/dashboard/src/legacy/pages/first-run.jsx`
- Create: `apps/dashboard/src/legacy/styles/first-run.css`
- Modify: `apps/dashboard/src/legacy-bridge/manifest.ts`: `import "@/legacy/pages/first-run.jsx";` right after
  `setup.jsx`.
- Modify: `apps/dashboard/src/legacy/Chanlytics.html`:
  - `<script type="text/babel" src="pages/first-run.jsx?v=1"></script>` right after `setup.jsx`;
  - `<link rel="stylesheet" href="styles/first-run.css?v=1" />` after `settings.css`;
  - bump `setup.jsx`'s `?v=`.
- Modify: `apps/dashboard/src/legacy-bridge/legacy.css`: `@import "../legacy/styles/first-run.css";` after `settings.css`.
- Test: `tooling/scripts/tests/first-run-page.test.mjs` (new)

- [ ] **Step 1: Write the failing test.** The harness is `setup-page-activate.test.mjs`'s: stub React over
  `_hook-frames.mjs`, with `data-bits.jsx`, `attention-bits.jsx`, `setup.jsx` and `first-run.jsx` loaded for real.

```js
/**
 * The first run's page (#/start), drawn without a browser: Setup's rows one step at a time, the rail, the phone's step
 * line, the receptionist card, Finish later, a step already reached opened in place, a failed read and its retry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setupSteps,
  firstRunOf,
  receptionistCardOf,
  setupCardOf,
  FIRST_RUN_WORDS,
  roleGate,
} from "@chanlytics/contracts";
import { hookFrames } from "./_hook-frames.mjs";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const blank = {
  business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
};
const withFacts = { ...blank, business: { name: "Harbor Moving", hours: true, services: 2, bookingLink: true, address: true, handoff: null, broken: false } };
const answering = {
  ...withFacts,
  channels: { ...blank.channels, voice: { present: true, active: true, number: "+13055550123", lastInboundAt: null } },
  calendar: { state: "ok" },
};
const surface = (dto) => ({ dto, role: "owner", later: [], vm: setupSteps({ ...dto, later: [] }, NOW), fetchedAt: NOW });

const went = [];
const replaced = [];
const store = {};
let refreshed = 0;
globalThis.Icon = "Icon";
globalThis.React = { Fragment: "Fragment" };
globalThis.window = {
  location: { hash: "#/start", replace: (to) => replaced.push(to) },
  sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
  __SETUP: surface(blank),
  __firstRun: { of: firstRunOf, card: receptionistCardOf, today: setupCardOf, words: FIRST_RUN_WORDS },
  __setup: { refresh: async () => { refreshed += 1; }, later: async () => ({ ok: true, message: "" }) },
  __WORKSPACES: [{ id: "w1", name: "Harbor Moving", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "w1",
  __roleGate: roleGate,
  __DEMO_MODE: false,
  usePPToast: () => [null, () => {}],
  appNavigate: () => {},
  canDo: () => true,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document ??= { body: {}, addEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
globalThis.ReactDOM ??= { createPortal: (node) => node };
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
globalThis.FailedRead = globalThis.window.FailedRead;
globalThis.window.usePPToast = () => [null, () => {}];
await import("../../../apps/dashboard/src/legacy/pages/attention-bits.jsx");
await import("../../../apps/dashboard/src/legacy/pages/setup.jsx");
await import("../../../apps/dashboard/src/legacy/pages/first-run.jsx");

// Stub React: the mount(), walk(), byTestId() and textOf() helpers from setup-page-activate.test.mjs, lines 207-283,
// copied as they are, with `Page` = () => window.FirstRun({ param, onNavigate: (to) => went.push(to) }).
let param = null;
const Page = () => globalThis.window.FirstRun({ param, onNavigate: (to) => went.push(to) });

test("a new workspace opens on its business: the rail says where it is, the step draws its own rows, and nothing answers yet", () => {
  window.__SETUP = surface(blank);
  param = null;
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your business");
  assert.ok(byTestId(tree, "fr-rail-business"), "the step on screen is a button on the rail");
  assert.equal(byTestId(tree, "fr-rail-phone"), null, "a step not reached is not a button");
  const rows = byTestId(tree, "fr-rows");
  assert.ok(byTestId(rows, "setup-row-facts"), "the business step draws the facts row");
  assert.equal(byTestId(rows, "setup-row-line"), null, "and not the phone's");
  assert.equal(textOf(byTestId(tree, "fr-phone-line")), "Step 1 of 4 · Your business");
  assert.equal(textOf(byTestId(tree, "fr-card-status")), "Not answering yet");
  assert.equal(byTestId(tree, "fr-back"), null);
  assert.equal(byTestId(tree, "fr-onward"), null);
  assert.equal(store["chanlytics.setup.landed"], "1", "being here is the landing: Today does not send this tab back");
});

test("a step already reached opens in place from the rail, and Continue goes on to where the workspace is", () => {
  window.__SETUP = surface(withFacts);
  param = "business";
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your business");
  byTestId(tree, "fr-onward").props.onClick();
  assert.equal(replaced.at(-1), "#/start");
  byTestId(tree, "fr-rail-phone").props.onClick();
  assert.equal(replaced.at(-1), "#/start", "the current step is the bare address");
  param = null;
  fresh();
  const phone = mount();
  byTestId(phone, "fr-back").props.onClick();
  assert.equal(replaced.at(-1), "#/start/business", "Back opens the step before, replaced so the browser's Back leaves");
});

test("answering: Live, with what is left, and Finish goes to Today", () => {
  window.__SETUP = surface(answering);
  param = null;
  fresh();
  const tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your receptionist is answering");
  const onward = byTestId(tree, "fr-onward");
  assert.equal(textOf(onward), "Finish");
  onward.props.onClick();
  assert.equal(went.at(-1), "today");
  assert.equal(textOf(byTestId(tree, "fr-card-status")), "Answering · not tried yet");
});

test("Finish later leaves for Today from every step", () => {
  window.__SETUP = surface(blank);
  fresh();
  byTestId(mount(), "fr-later").props.onClick();
  assert.equal(went.at(-1), "today");
});

test("the card fills in from the settings read once it lands", () => {
  window.__SETUP = surface(withFacts);
  window.__SETTINGS = { config: { brain: { business_name: "Harbor Moving", booking_link: "https://harbor.example/book" } } };
  window.__FACTS = { facts: { voice_line: { value: null }, kept_line: { value: null }, handoff_number: { value: "+13055550100" } } };
  try {
    fresh();
    const tree = mount();
    assert.equal(textOf(byTestId(tree, "fr-card-books")), "Books withharbor.example/book");
    assert.equal(textOf(byTestId(tree, "fr-card-through")), "Puts through to+1 (305) 555-0100");
  } finally {
    delete window.__SETTINGS;
    delete window.__FACTS;
  }
});

test("a failed read says so, and the retry reads again; before the read, Reading your workspace…", () => {
  window.__SETUP = null;
  fresh();
  const failed = mount();
  assert.ok(byTestId(failed, "fr-failed"));
  byTestId(failed, "fr-retry").props.onClick();
  assert.equal(refreshed, 1);
  window.__SETUP = undefined;
  fresh();
  assert.equal(textOf(byTestId(mount(), "fr-reading")), "Reading your workspace…");
});
```

  (Copy the `mount`/`fresh`/`walk`/`byTestId` block from `setup-page-activate.test.mjs:207-283` into the comment's
  place. If `FailedRead` names its retry test id differently from `retryTestid`, read `data-bits.jsx:908` and use its
  prop.)
- [ ] **Step 2:** Run it. Expect FAIL: `window.FirstRun` is not a function.
- [ ] **Step 3: Write `first-run.jsx`:**

```jsx
/* global React, Icon, FailedRead */
// Chanlytics — the first run (#/start).
//
// Setup's own rows, one step to a screen, full screen, with the owner's receptionist filling in beside them
// (docs/superpowers/specs/2026-09-24-first-run-design.md). The steps, which one the workspace is on and every sentence
// are contracts' (first-run.ts, published by the bridge as window.__firstRun); the rows and everything a row does are
// Setup's (setup.jsx SetupRows). Nothing is stored: the step is worked out from Setup's view model on every draw.
//
// Drawn by the shell INSTEAD of its chrome (app-shell.jsx, the start route, as it draws the shared viewer), so the
// page is the whole screen. Loaded after setup.jsx and before app-shell.jsx (both load lists).

const useFrTick = (event) => {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener(event, bump);
    return () => window.removeEventListener(event, bump);
  }, [event]);
};

// What the card reads beyond Setup: the brain and the resolved numbers from the settings read, once it has landed,
// and the workspace's name and clock from the list the shell already holds.
const frCardInputs = (S) => {
  const cfg = window.__SETTINGS && window.__SETTINGS.config;
  const facts = window.__FACTS && window.__FACTS.facts;
  const ws = (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;
  const value = (f) => (f && f.value) || null;
  return {
    setup: S.dto,
    answering: S.vm.readiness.answering,
    brain: (cfg && cfg.brain) || null,
    numbers: facts ? { voiceLine: value(facts.voice_line), keptLine: value(facts.kept_line), handoff: value(facts.handoff_number) } : null,
    workspaceName: (ws && ws.name) || null,
    tz: (ws && ws.timezone) || window.DEFAULT_TIMEZONE || "America/New_York",
  };
};

/** The four steps across the top: a step done or on screen opens in place; a step not reached is only its name. */
const FrRail = ({ fr, go, label }) => (
  <ol className="fr-rail" aria-label={label}>
    {fr.steps.map((s) => {
      const body = (
        <>
          <span className="fr-rail-mark" aria-hidden="true">{s.state === "done" ? <Icon name="check" size={10} /> : s.number}</span>
          <span className="fr-rail-name">{s.name}</span>
        </>
      );
      return (
        <li key={s.key} className="fr-rail-step" data-state={s.state} aria-current={s.key === fr.shown.key ? "step" : undefined}>
          {s.state === "ahead"
            ? <span className="fr-rail-btn">{body}</span>
            : <button type="button" className="fr-rail-btn" onClick={() => go(s.key)} data-testid={`fr-rail-${s.key}`}>{body}</button>}
        </li>
      );
    })}
  </ol>
);

/** The owner's receptionist, so far: beside the step on a desktop; under the strip, once opened, on a phone. */
const FrCard = ({ card, open }) => (
  <aside className="fr-card" data-open={open ? "true" : undefined} aria-label={card.caption} data-testid="fr-card">
    <div className="fr-card-cap">{card.caption}</div>
    <div className="fr-card-box">
      <div className="fr-card-head">
        <span className="fr-card-av" aria-hidden="true">{card.initials}</span>
        <div className="fr-card-who">
          <b>{card.name}</b>
          <span className="fr-card-status" data-tone={card.status.tone} data-testid="fr-card-status">{card.status.words}</span>
        </div>
      </div>
      <p className="fr-card-greet"><span className="fr-card-k">{card.greetingLabel}</span>“{card.greeting}”</p>
      <dl className="fr-card-rows">
        {card.rows.map((r) => (
          <div key={r.key} className="fr-card-row" data-testid={`fr-card-${r.key}`}>
            <dt className="fr-card-k">{r.label}</dt>
            <dd className={r.value ? "fr-card-v" : "fr-card-v is-empty"}>{r.value || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
    <p className="fr-card-foot">{card.foot}</p>
  </aside>
);

const FirstRun = ({ param = null, onNavigate }) => {
  useFrTick("surface:setup");
  useFrTick("surface:settings");
  const [cardOpen, setCardOpen] = React.useState(false);
  // Being here is the landing: Today does not send this tab back again this session.
  React.useEffect(() => {
    try { window.sessionStorage.setItem("chanlytics.setup.landed", "1"); } catch { /* still here */ }
  }, []);
  const F = window.__firstRun;
  const S = window.__SETUP;
  const leave = (to) => onNavigate(to);
  if (S === null && F) {
    return (
      <div className="fr-root fr-waiting" data-testid="first-run">
        <FailedRead
          kind="card"
          what={F.words.failedWhat}
          body={F.words.failedBody}
          onRetry={() => window.__setup && window.__setup.refresh && window.__setup.refresh()}
          also={{ label: F.words.toToday, onClick: () => leave("today") }}
          testid="fr-failed"
          retryTestid="fr-retry"
        />
      </div>
    );
  }
  if (!S || !F) {
    return (
      <div className="fr-root fr-waiting" data-testid="first-run">
        <p className="fr-reading" data-testid="fr-reading">{F ? F.words.reading : "Reading your workspace…"}</p>
      </div>
    );
  }
  const W = F.words;
  const fr = F.of(S.vm, param);
  const card = F.card(frCardInputs(S));
  const step = fr.shown;
  // The step on screen is the address's, replaced rather than pushed, so the browser's Back leaves the first run.
  const go = (key) => window.location.replace(key === fr.current ? "#/start" : `#/start/${key}`);
  const onward = () => (fr.onward.to === "today" ? leave("today") : window.location.replace(`#/${fr.onward.to}`));
  return (
    <div className="fr-root" data-testid="first-run" data-step={step.key}>
      <header className="fr-top">
        <span className="fr-brand"><span className="sidebar-brand-mark" aria-hidden="true">C</span>Chanlytics</span>
        <FrRail fr={fr} go={go} label={W.title} />
        <button type="button" className="fr-later" onClick={() => leave("today")} data-testid="fr-later">{W.later}</button>
      </header>
      <div className="fr-phone">
        <div className="fr-phone-top">
          <span data-testid="fr-phone-line">{fr.phoneLine}</span>
          <button type="button" className="fr-later" onClick={() => leave("today")}>{W.laterShort}</button>
        </div>
        <div className="fr-bar" aria-hidden="true"><span style={{ width: `${fr.progress}%` }} /></div>
        <button type="button" className="fr-strip" aria-expanded={cardOpen} onClick={() => setCardOpen((v) => !v)} data-testid="fr-strip">
          <span className="fr-card-av" aria-hidden="true">{card.initials}</span>
          <span className="fr-strip-words">{card.strip}</span>
          <Icon name="chevron-down" size={12} />
        </button>
      </div>
      <div className="fr-body">
        <main className="fr-step" aria-labelledby="fr-heading">
          <h1 className="fr-heading" id="fr-heading" data-testid="fr-heading">{fr.heading}</h1>
          {fr.lead ? <p className="fr-lead">{fr.lead}</p> : null}
          {step.key === "try" && S.vm.tryIt ? <window.SetupTry tryIt={S.vm.tryIt} /> : null}
          {step.key === "live" && step.rows.length ? <h2 className="fr-sub">{W.liveNext}</h2> : null}
          {step.rows.length ? (
            <section className="tq fr-rows">
              <window.SetupRows S={S} rows={step.rows} primary={fr.primaryRow} testid="fr-rows" />
            </section>
          ) : null}
          {fr.back || fr.onward ? (
            <div className="fr-foot">
              {fr.back ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(fr.back)} data-testid="fr-back">{W.back}</button> : <span />}
              {fr.onward ? <button type="button" className="fr-onward" onClick={onward} data-testid="fr-onward">{fr.onward.label}</button> : null}
            </div>
          ) : null}
        </main>
        <FrCard card={card} open={cardOpen} />
      </div>
    </div>
  );
};

window.FirstRun = FirstRun;
```

  (`fr-rows` is on the list inside the card, so `byTestId(tree, "fr-rows")` finds the rows. The section's class is
  only for layout.)

- [ ] **Step 4: Write `first-run.css`** (tokens only, `var(--measure-prose)` for the step, never a literal page width):

```css
/* ── The first run (#/start) ─────────────────────────────────────────────────
   Full screen, the shell's chrome set aside (first-run.jsx). Desktop: a top bar with the four steps, the step at the
   prose measure, the receptionist beside it. At 900px and under: the step's line, a 2px bar, the receptionist as one
   line that opens, and the step's button held at the foot. */
.fr-shell { min-height: 100dvh; background: var(--bg); color: var(--ink); }
.fr-root { min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); color: var(--ink); }
.fr-waiting { align-items: center; justify-content: center; padding: 32px var(--gutter-page); }
.fr-reading { margin: 0; color: var(--ink-dim); font-size: 13px; }

.fr-top {
  display: flex; align-items: center; gap: 24px;
  padding: calc(14px + env(safe-area-inset-top, 0px)) var(--gutter-page) 14px;
  border-bottom: 1px solid var(--line);
}
.fr-brand { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
.fr-rail { display: flex; align-items: center; margin: 0 auto; padding: 0; list-style: none; }
.fr-rail-step { display: flex; align-items: center; }
.fr-rail-step + .fr-rail-step::before { content: ""; width: 28px; height: 1px; margin: 0 8px; background: var(--line); }
.fr-rail-btn {
  display: inline-flex; align-items: center; gap: 8px; padding: 6px 8px;
  border: 0; border-radius: var(--radius-md, 8px); background: none;
  font: inherit; font-size: 13px; color: var(--ink-faint);
}
button.fr-rail-btn { cursor: pointer; }
button.fr-rail-btn:hover { background: var(--bg-sunken); color: var(--ink); }
.fr-rail-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.fr-rail-mark {
  display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
  border: 1px solid var(--line-strong); font-size: 11px; font-variant-numeric: tabular-nums;
}
.fr-rail-step[data-state="done"] .fr-rail-btn { color: var(--ink-dim); }
.fr-rail-step[data-state="done"] .fr-rail-mark { border-color: var(--ink-dim); }
.fr-rail-step[data-state="current"] .fr-rail-btn { color: var(--ink); font-weight: 500; }
.fr-rail-step[data-state="current"] .fr-rail-mark { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.fr-rail-step[aria-current="step"] .fr-rail-btn { background: var(--bg-sunken); }
.fr-later {
  padding: 6px 8px; border: 0; border-radius: var(--radius-md, 8px); background: none;
  font: inherit; font-size: 13px; color: var(--ink-dim); cursor: pointer;
}
.fr-later:hover { color: var(--ink); background: var(--bg-sunken); }
.fr-later:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.fr-phone { display: none; }

.fr-body {
  flex: 1 1 auto; display: grid;
  grid-template-columns: minmax(0, var(--measure-prose)) minmax(260px, 340px);
  justify-content: center; align-items: start; gap: 48px;
  padding: 40px var(--gutter-page) 48px;
}
.fr-step { display: grid; gap: 16px; min-width: 0; }
.fr-heading { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; text-wrap: balance; }
.fr-lead { margin: -6px 0 4px; max-width: 60ch; font-size: 14px; color: var(--ink-dim); line-height: var(--leading-relaxed); }
.fr-sub { margin: 8px 0 0; font-size: 13px; font-weight: 500; color: var(--ink-dim); }
.fr-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; }
.fr-onward {
  padding: 9px 16px; border: none; border-radius: var(--radius-md, 8px);
  background: var(--accent); color: var(--accent-fg);
  font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
}
.fr-onward:focus-visible { outline: none; box-shadow: var(--focus-ring); }

.fr-card { position: sticky; top: 24px; display: grid; gap: 8px; min-width: 0; }
.fr-card-cap { font-size: 12px; color: var(--ink-dim); }
.fr-card-box {
  display: grid; gap: 14px; padding: 16px;
  background: var(--bg-raised); border: 1px solid var(--line); border-radius: var(--radius-lg);
}
.fr-card-head { display: flex; align-items: center; gap: 10px; }
.fr-card-av {
  display: inline-grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 50%;
  background: var(--bg-sunken); color: var(--ink); font-size: 12px; font-weight: 600;
}
.fr-card-who { display: grid; gap: 2px; min-width: 0; }
.fr-card-who b { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.fr-card-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-dim); }
.fr-card-status::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--ink-faint); }
.fr-card-status[data-tone="ok"]::before { background: var(--ok); }
.fr-card-greet { margin: 0; display: grid; gap: 4px; font-size: 13px; line-height: var(--leading-relaxed); }
.fr-card-rows { margin: 0; display: grid; gap: 8px; }
.fr-card-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; font-size: 13px; }
.fr-card-row dd { margin: 0; overflow-wrap: anywhere; }
.fr-card-k { font-size: 12px; color: var(--ink-dim); }
.fr-card-v.is-empty { color: var(--ink-faint); }
.fr-card-foot { margin: 0; font-size: 12px; color: var(--ink-faint); line-height: var(--leading-relaxed); }

@media (max-width: 900px) {
  .fr-top { display: none; }
  .fr-phone {
    display: grid; position: sticky; top: 0; z-index: 2;
    padding-top: env(safe-area-inset-top, 0px); background: var(--bg);
  }
  .fr-phone-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px 10px; font-size: 13px; font-weight: 500; }
  .fr-bar { height: 2px; background: var(--line); }
  .fr-bar > span { display: block; height: 100%; background: var(--ink); transition: width var(--duration-fast) var(--ease-out); }
  .fr-strip {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px;
    border: 0; border-bottom: 1px solid var(--line); background: var(--bg-raised);
    font: inherit; font-size: 13px; color: var(--ink); text-align: left; cursor: pointer;
  }
  .fr-strip .fr-card-av { width: 24px; height: 24px; font-size: 10px; }
  .fr-strip-words { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fr-body { grid-template-columns: minmax(0, 1fr); gap: 16px; padding: 20px 16px calc(88px + env(safe-area-inset-bottom, 0px)); }
  .fr-card { position: static; order: -1; display: none; }
  .fr-card[data-open="true"] { display: grid; }
  .fr-card-cap, .fr-card-foot { display: none; }
  .fr-heading { font-size: 20px; }
  .fr-foot {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2; margin: 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--bg); border-top: 1px solid var(--line);
  }
  .fr-foot .fr-onward { flex: 1 1 auto; }
}
@media (prefers-reduced-motion: reduce) { .fr-bar > span { transition: none; } }
```

- [ ] **Step 5:** Add the file to both load lists and the CSS to `legacy.css` and `Chanlytics.html`, as listed under
  Files. Run `first-run-page.test.mjs` and `legacy-harness.test.mjs`. Expect PASS on both.
- [ ] **Step 6: Commit:** `feat(first-run): the #/start page -- the rail, Setup's rows a step at a time, the receptionist card`

---

### Task 6: The shell draws the first run full screen, and Setup's old address lands there

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/app-shell.jsx`:
  - `PARAM_FOLLOWED_AS_PROP` gains `"start"`;
  - a `start` branch in the route chain;
  - the full-screen return after the `shared` one;
  - the moved-route redirect, which asks with the pane and replaces;
  - the admin branch draws nothing for a moved pane.
- Modify: `apps/dashboard/src/legacy-bridge/surface-registry.ts`:
  - `SURFACE_STATES`: add `start: "real"`, delete `"admin/setup": "real"`;
  - `ROUTE_SURFACE`: add `start: "setup"`, delete `"admin/setup": "setup"`;
  - `ROUTE_DRAWS`: add `start: ["settings"]`;
  - add `ROUTES_MOVED`, and `surfaceRetiredTo(page, param)`.
- Modify: `tooling/scripts/tests/surface-registry.test.mjs`. In its pinned list of real routes, `"admin/setup"`
  becomes `"start"`. Add the moved-route test below.
- Modify: `tooling/scripts/tests/calendar-people.test.mjs:984`. The pin's string becomes
  `if (retiredTo) window.location.replace("#/" + retiredTo);`.

- [ ] **Step 1: Write the failing test** (append to `surface-registry.test.mjs`, importing `surfaceRetiredTo` beside
  its other imports from the registry):

```js
test("Setup's old address lands on the first run -- the bell rows the edge wrote still carry it -- and a pane moves alone", () => {
  assert.equal(surfaceRetiredTo("admin", "setup"), "start");
  assert.equal(surfaceRetiredTo("admin", "workspace"), undefined, "the rest of Settings stays where it is");
  assert.equal(surfaceRetiredTo("pipeline", null), "clients", "a retired page still moves as a page");
  assert.equal(surfaceStateFor("start", null), "real");
});
```

- [ ] **Step 2:** Run it. Expect FAIL: `surfaceRetiredTo("admin", "setup")` is undefined.
- [ ] **Step 3: Registry:**

```ts
/**
 * Addresses of one pane that moved elsewhere. Setup left Settings for the first run (docs/superpowers/specs/
 * 2026-09-24-first-run-design.md): bell rows written before then, by the edge and by migrations 00065 and 00123, carry
 * `admin/setup`, so the address stays good and lands where Setup is now.
 */
export const ROUTES_MOVED: Record<string, string> = {
  "admin/setup": "start",
};

export function surfaceRetiredTo(page: string, param?: string | null): string | undefined {
  return (param ? ROUTES_MOVED[`${page}/${param}`] : undefined) ?? SURFACE_RETIRED[page];
}
```

  Change the `__surfaceRetired` type in `installSurfaceRegistry` to `(page: string, param?: string | null) => string | undefined`.
- [ ] **Step 4: Shell.**
  - Add `"start"` to `PARAM_FOLLOWED_AS_PROP`, so each step is the page already there.
  - In the route chain, before `} else if (page === "admin") {`, add:

```jsx
  } else if (page === "start") {
    // The first run (first-run.jsx): drawn full screen below, after every hook; the crumb names the tab.
    crumbs = [window.__firstRun ? window.__firstRun.words.title : "Setting up"];
    content = null;
```

  - In the admin branch, replace the `content = <SettingsPage ... />` line with:

```jsx
    // A pane that moved (surface-registry ROUTES_MOVED) draws nothing for the frame before the redirect below.
    content = window.__surfaceRetired && window.__surfaceRetired(page, param)
      ? null
      : <SettingsPage tab={param || "workspace"} onTab={(t) => navigate(`admin/${t}`)} />;
```

  - Change the retired computation to `window.__surfaceRetired(page, param)`. Change its effect to
    `if (retiredTo) window.location.replace("#/" + retiredTo);`: replaced, so Back never lands on an address that
    moves again.
  - After the `shared` early return, add:

```jsx
  // The first run: full screen, the shell's chrome set aside, after all hooks as the shared viewer is (first-run.jsx).
  if (page === "start" && !demoGated && window.FirstRun) {
    return (
      <div className="fr-shell" data-theme={theme}>
        <window.FirstRun param={param} onNavigate={navigate} />
      </div>
    );
  }
```

- [ ] **Step 5:** Bump `app-shell.jsx`'s `?v=` in `Chanlytics.html`. Run `surface-registry.test.mjs`,
  `calendar-people.test.mjs`, `chrome.test.mjs` and `phone-shell.test.mjs`. Expect PASS on all four.
- [ ] **Step 6: Commit:** `feat(shell): #/start is full screen, and Setup's old address lands on it`

---

### Task 7: Settings › Setup is gone, and every door to Setup opens the first run

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/settings.jsx:94`. Delete the `setup` entry from `SET_TABS`, and the
  `PaneSetup` mount at `:1782`.
- Modify: `packages/contracts/src/ask.ts:134` (`"admin/setup"` becomes `"start"`) and `:409`, which becomes
  `{ label: "Finish setting up", to: "start", kind: "page", sub: "the four steps to a receptionist that answers" }`.
- Modify: `packages/contracts/src/connections.ts`. Lines 394, 420, 433 and 523 now route to `"start"`:
  - "Open Setup" becomes "Finish setting up";
  - "Find it on Setup" becomes "Find it";
  - "Get a line" and "Ask for a line" keep their words.
- Modify: `packages/contracts/src/leads.ts:410` (`to: "start"`).
- Modify: `packages/contracts/src/notifications.ts:324`. The route-to-words map gains `start: "Finish setting up"`
  and keeps `"admin/setup"`, now also "Finish setting up", for the bell rows already written.
- Modify: `apps/dashboard/src/legacy/pages/conversations.jsx:347`, which becomes
  `action={{ label: "Finish setting up", to: "start" }}`.
- Modify: `apps/dashboard/src/legacy/pages/reports.jsx:110`, which becomes `action={{ label: "Find it", to: "start" }}`.
- Test updates: `ask-palette.test.mjs:1486`, `connections.test.mjs:110,208,262,264` and
  `conversations-doors.test.mjs:391` take the new routes and words. Also update whatever `settings-words.test.mjs`
  and `setup.test.mjs`'s wiring test assert about Setup's tab.

- [ ] **Step 1: Failing tests first.** Change the test expectations above to the new routes and words. For
  `setup.test.mjs`'s wiring test:
  - delete the Settings-rail regex and the `PaneSetup` mount pin (the tab is gone);
  - delete the `"admin/setup"` registry pins (surface-registry.test covers `start` now);
  - change `"window.PaneSetup = PaneSetup;"` to `"window.SetupRows = SetupRows;"`;
  - delete the `data-testid="setup-next"` pin (the head card is gone).

  Run those files. Expect FAIL on the four product tests.
- [ ] **Step 2: Make the changes** listed under Files, then rebuild contracts.
- [ ] **Step 3:** Run the five test files. Expect PASS. Then
  `UPDATE_SOURCE_SCAN_BASELINE=1 node --conditions=react-server --import tsx --test tooling/scripts/tests/source-scan-ratchet.test.mjs`.
  Check with `git diff tooling/scripts/tests/source-scan-baseline.json` that only `setup.test.mjs` fell. Then run
  it again without the variable. Expect PASS.
- [ ] **Step 4:** Remove the Setup pane's own styles, which nothing draws now: `.setup-head`, `.setup-meter`,
  `.setup-meter-fill`, `.setup-next`, `.setup-next-label`, `.setup-count` and `.setup-sentence` in `settings.css`.
  Keep `.setup-rows`, `.setup-try*`, `.setup-later` and the panels' rules, and bump `settings.css`'s `?v=`. Check
  with `grep -n "setup-meter\|setup-next\|setup-head" apps/dashboard/src/legacy -r`, which must be empty.
  `platform.jsx:143` reuses `.setup-meter`: if the grep shows it, keep `.setup-meter` and `.setup-meter-fill`.
- [ ] **Step 5: Commit:** `feat(settings): Setup leaves Settings; every door to it opens the first run`

---

### Task 8: Today's card replaces Setup's line

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx:54-67,201`. Delete `SetupLine` and its use, add
  `TodaySetup`, and publish `window.TodaySetup`.
- Modify: `apps/dashboard/src/legacy/pages/dashboard-a.jsx`. Draw `<TodaySetup />` right after `<HeroBrief />`, add
  it to the `/* global */` line, and add "the card of what is left to set up (dashboard-a-brief.jsx TodaySetup, only
  while something is)" to the band list in the header comment.
- Modify: `apps/dashboard/src/legacy/styles/mobile.css`. On a phone the card shows only the next row.
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (bump `dashboard-a-brief.jsx`, `dashboard-a.jsx`, `mobile.css`)
- Test: `tooling/scripts/tests/today-doors.test.mjs:421-446`

- [ ] **Step 1: Rewrite the failing test.** The stub `__SETUP` becomes a real surface, and `window.__firstRun` is
  published. Draw the card with a `mountSetup` helper: the file's own `mountHero` shape, with `window.TodaySetup`
  as the component.

```js
test("REGRESSION: with no line connected, Today does not say the receptionist is answering -- one sentence, and one door to finishing setting up", () => {
  const dto = {
    business: { name: null, hours: false, services: 0, bookingLink: false, address: false, handoff: null, broken: false },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: false, active: false, number: null, lastInboundAt: null },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 0, offers: 0, offersSaidYes: 0 },
    requests: { line: null },
  };
  globalThis.window.__SETUP = { dto, role: "owner", later: [], vm: setupSteps({ ...dto, later: [] }) };
  globalThis.window.__firstRun = { of: firstRunOf, card: receptionistCardOf, today: setupCardOf, words: FIRST_RUN_WORDS };
  try {
    const vm = todayWith([]);
    const hero = mountHero(vm);
    const recap = mountCard(vm);
    const queue = mountQueue(vm);
    const setup = mountSetup();
    const said = textOf(hero) + textOf(recap) + textOf(queue) + textOf(setup);
    assert.ok(!said.includes("answering on its own"), "REGRESSION: the queue said the receptionist was answering, with no line to answer on");
    assert.ok(!said.includes("Queue clear — nothing needs you"), "nor that the queue was clear, as if all were well");
    assert.equal(buttonsSaying(setup, "Continue setting up").length, 1, "one door to the first run");
    assert.equal(
      [hero, recap, queue, setup].reduce((n, t) => n + buttonsSaying(t, "Open Setup").length, 0),
      0,
      "and none to the tab that is gone",
    );
  } finally {
    delete globalThis.window.__SETUP;
    delete globalThis.window.__firstRun;
  }
});

test("the card once it answers: Setup's own rows, the next one first, Skip for one and Hide for all -- this person's", async () => {
  const dto = {
    business: { name: "Harbor Moving", hours: true, services: 2, bookingLink: true, address: true, handoff: null, broken: false },
    channels: {
      whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
      voice: { present: true, active: true, number: "+13055550123", lastInboundAt: null },
    },
    templates: { approved: 0, pending: 0, startersApproved: 0 },
    calendar: { state: "none" },
    team: { members: 1, invitesOpen: 0, alertEmails: 1 },
    consent: { yes: 0, offers: 0, offersSaidYes: 0 },
    requests: { line: null },
  };
  const put = [];
  globalThis.window.__SETUP = { dto, role: "owner", later: [], vm: setupSteps({ ...dto, later: [] }) };
  globalThis.window.__firstRun = { of: firstRunOf, card: receptionistCardOf, today: setupCardOf, words: FIRST_RUN_WORDS };
  globalThis.window.__setup = { later: async (ids, on) => { put.push([ids, on]); return { ok: true, message: "" }; } };
  try {
    const card = mountSetup();
    const rows = allByTestId(card, /^setup-row-/);
    assert.equal(rows[0].props["data-testid"], "setup-row-whatsapp", "WhatsApp leads: it sends the booking link");
    const hide = byTestId(card, "today-setup-hide");
    hide.props.onClick();
    assert.deepEqual(put.at(-1)[1], true);
    assert.ok(put.at(-1)[0].includes("whatsapp") && put.at(-1)[0].includes("calendar"), "Hide puts every row off at once");
  } finally {
    delete globalThis.window.__SETUP;
    delete globalThis.window.__firstRun;
    delete globalThis.window.__setup;
  }
});
```

  Adapt `allByTestId` to take a RegExp if the file's helper takes only strings, and import `setupSteps`,
  `firstRunOf`, `receptionistCardOf`, `setupCardOf` and `FIRST_RUN_WORDS` from contracts. Make sure `setup.jsx` and
  `attention-bits.jsx` are loaded in this file's harness, the way it loads the other Today pages. The next test,
  email-only, keeps its stub without `line`: `{ vm: { readiness: { answering: false } } }` still draws no card,
  because `window.__firstRun` is absent there.
- [ ] **Step 2:** Run it. Expect FAIL: `window.TodaySetup` is undefined.
- [ ] **Step 3: Implement** in `dashboard-a-brief.jsx`, where `SetupLine` was:

```jsx
// What is left to set up, as one card above the queue (the first run's Today card, canvas R10 and P9): while the
// receptionist is not answering, the one row that opens the first run; after, Setup's own optional rows in the order
// they help most, each with its act and a Skip this person keeps on every device (their saved view). Gone once
// nothing is left. Every word is contracts' (first-run.ts setupCardOf, through window.__firstRun).
const TodaySetup = () => {
  useTcTick("surface:setup");
  const S = window.__SETUP;
  const F = window.__firstRun;
  if (!S || !F) return null;
  const card = F.today(S.vm);
  if (!card) return null;
  const nav = (to) => window.appNavigate && window.appNavigate(to);
  return (
    <section className="tq today-setup" data-testid="today-setup">
      <div className="tq-head">
        <span className="tq-title">{card.title}</span>
        <span className="tq-sub">{card.left}</span>
        {card.hide ? (
          <button className="btn btn-ghost btn-sm" onClick={() => window.__setup && window.__setup.later(card.rows.map((r) => r.id), true)} data-testid="today-setup-hide">{card.hide}</button>
        ) : null}
      </div>
      {card.start ? (
        <div className="tq-list">
          <window.AttnRow
            glyph="flag"
            name={card.start.name}
            sentence={card.start.sentence}
            status={[]}
            tone="warn"
            cta={{ label: card.start.cta, kind: "primary", onClick: () => nav(card.start.to) }}
            onOpen={() => nav(card.start.to)}
            testid="today-setup-start"
            ctaTestid="today-setup-go"
          />
        </div>
      ) : (
        <window.SetupRows S={S} rows={card.rows} primary={card.rows[0].id} later={{ put: card.skip, undo: null }} testid="today-setup-rows" />
      )}
    </section>
  );
};
window.TodaySetup = TodaySetup;
```

  Then add this to `mobile.css`, beside Today's other phone rules:

```css
/* Today's setup card on a phone: only the next thing, one line and one button; its head says how many are left. */
.today-setup .setup-rows > :not(:first-child) { display: none; }
```

  (inside the file's existing `@media (max-width: 900px)` block for Today).
- [ ] **Step 4:** Run `today-doors.test.mjs`, `today-page.test.mjs` and `layout-measure.test.mjs`. Expect PASS.
  `today-page.test.mjs:424` names Setup: take the new card's words there too.
- [ ] **Step 5: Commit:** `feat(today): what is left to set up is one card, with a Skip that is this person's`

---

### Task 9: Create once (F5): sign-up's answers make the workspace, and it opens on the first run

**Files:**
- Modify: `packages/contracts/src/signup.ts`. Add `pendingCodeOf`, and add `making: "Making your workspace…"` to
  `SIGNUP_WORDS`.
- Modify: `apps/dashboard/src/server/signup.ts:94-100`. `signUp` keeps `code` beside the name when one was typed.
- Modify: `apps/dashboard/app/api/v1/workspaces/create/route.ts:83-87`. The door also takes the code sign-up kept.
- Modify: `apps/dashboard/src/legacy-bridge/CreateWorkspace.tsx`:
  - a first workspace with a kept name is made on arrival, with a "making" state;
  - a refusal leaves the form;
  - `create` is shared by the press and the arrival.
- Modify: `apps/dashboard/src/legacy-bridge/surface-data.ts:164-172`. `switchWorkspace(id, knownSlug?, after = "")`.
- Modify: `apps/dashboard/src/legacy-bridge/LegacyApp.tsx:447-474`. Both `onCreated` handlers call
  `switchWorkspace(w.id, w.slug, "#/start")`.
- Tests:
  - `first-run.test.mjs` (`pendingCodeOf`);
  - `account-routes.test.mjs` (the create door with the kept code);
  - `create-workspace-screen.test.mjs` (made on arrival, and a refusal shows the form);
  - `signup.test.mjs` (update any pin on the stored metadata's shape).

- [ ] **Step 1: Failing tests.**
  - `first-run.test.mjs`:

```js
import { pendingCodeOf, pendingWorkspaceOf, PENDING_WORKSPACE_KEY } from "@chanlytics/contracts";

test("the invite code sign-up checked is kept beside the name, and never read back as part of the form", () => {
  const meta = { [PENDING_WORKSPACE_KEY]: { name: "Luna Studio", timezone: "America/New_York", code: " LUNA-2026 " } };
  assert.equal(pendingCodeOf(meta), "LUNA-2026");
  assert.deepEqual(pendingWorkspaceOf(meta), { name: "Luna Studio", timezone: "America/New_York" }, "the page never sees it");
  assert.equal(pendingCodeOf({ [PENDING_WORKSPACE_KEY]: { name: "Luna Studio" } }), null);
  assert.equal(pendingCodeOf(null), null);
  assert.equal(pendingCodeOf({ [PENDING_WORKSPACE_KEY]: { code: "x".repeat(81) } }), null);
});
```

  - `account-routes.test.mjs`, beside the posture door test at ~538, with `SIGNUP_CODE` set as that test sets it:
    - an invite posture with zero memberships and no typed code, where the metadata keeps the right code, gets a 200;
    - the same with a wrong kept code gets a 403 with `SIGNUP_WORDS.codeWrong`;
    - the same with no kept code and no typed code gets a 403.

    The route's ctx takes `metadata` the way that test already passes it (`with-route.ts` `metadata`).
  - `create-workspace-screen.test.mjs`:
    - Add `react.useEffect = (fn) => { if (!effected) { effected = true; fn(); } };` and
      `react.useRef = (v) => (refs[at] ??= { current: v });` beside its `useState` stub. `effected` and `refs` are
      module-level and reset in `fresh`.
    - Record `POST /api/v1/workspaces/create` in its `w.fetch`.
    - Test one: a first workspace with `initial: { name: "Luna Studio", timezone: "America/New_York" }` and posture
      `"open"` draws `cw-making` saying "Making your workspace…". It posts `{ name: "Luna Studio", timezone:
      "America/New_York" }` once, and `onCreated` gets the workspace.
    - Test two: the same, where the fetch answers 403 `codeWrong`, settles to the form, with the name filled in and
      the error said.
    - Test three: with `onCancel` given ("another"), nothing is posted on arrival.
- [ ] **Step 2:** Run them. Expect FAIL.
- [ ] **Step 3: Implement.**
  - `signup.ts` (contracts), after `pendingWorkspaceOf`:

```ts
/**
 * The invite code sign-up checked, kept beside the name so the first workspace is made from sign-up's answers alone:
 * the create route checks it again, as it checks one typed. It is never part of the form -- pendingWorkspaceOf reads
 * the name and the clock only, and zod drops the rest -- and nothing but that check reads it.
 */
export function pendingCodeOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const p = (metadata as Record<string, unknown>)[PENDING_WORKSPACE_KEY];
  const code = p && typeof p === "object" ? (p as { code?: unknown }).code : null;
  if (typeof code !== "string" || code.length > 80) return null;
  return code.trim() || null;
}
```

  - `server/signup.ts` in `signUp`:
    `options: { data: { [PENDING_WORKSPACE_KEY]: { name: input.name, timezone: input.timezone ?? null, ...(input.code ? { code: input.code } : {}) } } }`.
    Extend its comment: "and the invite code it checked, so the first workspace needs nothing typed twice."
  - `create/route.ts`:
    `codeMatches: inviteCodeMatches(parsed.data.code) || inviteCodeMatches(pendingCodeOf(ctx.metadata))`, with a
    comment: "or the one sign-up checked and kept (pendingCodeOf), so the first workspace is made from sign-up's
    answers with nothing typed twice".
  - `CreateWorkspace.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
// ...
  // CREATE ONCE (F5): a first workspace whose name sign-up kept is made as the screen opens, from that name and clock
  // -- and the invite code sign-up checked, which the create route reads for itself -- so there is no second screen.
  // A refusal (a name taken, a code that changed since) leaves the form, filled in, with the server's sentence.
  const kept = !another && door !== "waitlist" ? (initial?.name ?? "").trim() : "";
  const [making, setMaking] = useState(kept.length >= 2);
  const started = useRef(false);

  const create = async (trimmed: string, typed: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const r = await api()("POST workspaces/create", {
      body: { name: trimmed, timezone, ...(door === "invite" && typed ? { code: typed } : {}) },
    });
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
      return false;
    }
    onCreated(r.data.workspace);
    return true;
  };

  useEffect(() => {
    if (!making || started.current) return;
    started.current = true;
    void create(kept, "").then((made) => {
      if (!made) setMaking(false);
    });
    // Once, on arrival: its inputs are sign-up's, and they do not change while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

    `submit` keeps its checks and ends with `await create(trimmed, code.trim());`. Before the waitlist branch (the
    hooks all above it), add:

```tsx
  if (making) {
    return (
      <div className="cw-screen">
        <div className="cw-card" role="status" aria-live="polite" data-testid="cw-making">
          <h1 className="cw-title">{kept}</h1>
          <p className="cw-lede">{SIGNUP_WORDS.making}</p>
        </div>
      </div>
    );
  }
```

  - `surface-data.ts`: `export function switchWorkspace(id: string, knownSlug?: string, after = ""): void`, with
    `window.location.assign(workspaceHref(slug, after));`. The comment says: "`after` is where the new workspace
    opens (`#/start` for one just made); a switch opens on Today."
  - `LegacyApp.tsx`: both handlers call `switchWorkspace(w.id, w.slug, "#/start")`. Their comments say "opens on the
    first run".
- [ ] **Step 4:** Build contracts. Run `first-run.test.mjs`, `account-routes.test.mjs`,
  `create-workspace-screen.test.mjs`, `signup.test.mjs`, `workspace-creation.test.mjs` and
  `workspace-path.test.mjs`. Expect PASS.
- [ ] **Step 5: Commit:** `feat(signup): create once -- sign-up's answers make the first workspace, and it opens on the first run`

---

### Task 10: The nightly specs, the shell's conventions, the wiring pins

**Files:**
- Modify: `e2e/setup.spec.ts`, `e2e/workspace-create.spec.ts`, `e2e/billing.spec.ts`, `e2e/google.spec.ts`,
  `e2e/csp.spec.ts`
- Modify: `apps/dashboard/src/legacy/CLAUDE.md`:
  - the routes list gains `start[/business|phone|try|live]`;
  - a UI-patterns line for the first run, in the style of the others: where its words live, the full-screen return,
    that nothing is stored, and the Today card.
- Modify: `docs/system-prd.md`. Wherever it describes Settings › Setup (`grep -n "Setup" docs/system-prd.md`), say
  the first run and the Today card instead.

- [ ] **Step 1: The specs.**
  - `#/admin/setup` becomes `#/start`.
  - `setup-readiness` becomes `first-run`, and `setup-rows` becomes `fr-rows`. The rows on screen are the current
    step's: a spec that walked every row walks `fr.steps` by pressing `fr-rail-*` for the steps reached, or checks
    only the row it is about by its `setup-row-<id>` test id.
  - `brief-setup` becomes `today-setup`.
  - `workspace-create.spec.ts:60` expects `first-run` after create.
  - `csp.spec.ts:75` lists `#/start` in place of `#/admin/setup`.
  - `setup.spec.ts:98`, "a workspace that answers is not sent to Setup", keeps its meaning with `#/start` as where
    it would have been sent.

  Read each file before editing, and keep every assertion's intent.
- [ ] **Step 2:** `corepack pnpm exec tsc -p e2e --noEmit`, or the repository's e2e typecheck if it has its own
  (see `package.json`). Expect exit 0. The specs run nightly against production after deploy.
- [ ] **Step 3: The docs.** Make the `CLAUDE.md` and `system-prd.md` edits above.
- [ ] **Step 4: Commit:** `docs(first-run): the nightly specs, the shell's conventions and the PRD follow Setup to #/start`

---

### Task 11: The gates, the review, the pull request

- [ ] `corepack pnpm --filter "./packages/*" build`. Restore the dists whose diff is line endings only. Format
  first, then build again (a dist built before Prettier wraps a line drifts):
  `corepack pnpm format` on the changed files, then build.
- [ ] `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check && corepack pnpm test`. Expect
  exit 0 on all; record the counts against Task 0's baseline.
- [ ] `node tooling/scripts/gen-route-types.mjs --check`. Expect "route types: current": no route changed shape.
- [ ] Run the app and look (`reference_browser_pane_keys`, `feedback_run_the_real_app`):
  - `corepack pnpm --filter @chanlytics/dashboard dev` in the worktree, then `/w/<workspace>/#/start` at a desktop
    width and at 375px;
  - Today with the card;
  - `#/admin/setup` redirecting.

  Screenshots are for the review, not for the PR. Afterwards, check `git status` for tsconfig rewrites.
- [ ] One whole-branch review (standards and spec) with the code-review skill, and one fix round. Never re-review
  the fixes.
- [ ] Merge `origin/main` if it moved, rebuild the dists on the merged tree, and run the whole suite again.
- [ ] The PR:
  - **Title:** "First run 2 of 5: the shell — #/start, create once, Today's card".
  - **What changes for a customer:**
    - a new owner's workspace is made from sign-up's answers, and they land on the full-screen first run;
    - Setup leaves Settings;
    - Today shows what is left as one card with a Skip kept per person;
    - old Setup links open the first run.
  - **Set before merging:** nothing.
  - **Deploy order:** either. The edge still writes `admin/setup`, which the dashboard redirects.
- [ ] Squash-merge on green, check main's next CI run, and update the memory file.
