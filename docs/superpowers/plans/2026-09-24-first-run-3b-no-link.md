# The first run, PR 3b: a receptionist with no booking link

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A receptionist config with no booking link parses and is answered, and every sentence that would have
offered the link says what the receptionist does instead. Every save still requires the link until 3c.

**Architecture:**
- **Contracts.**
  - `BrainConfigSchema.booking_link` becomes optional to read.
  - `TenantConfigWriteSchema` refuses a brain without one, at `brain.booking_link`, in the Business tab's own words.
  - A new `no-booking-link.ts` holds the one list the receptionist asks for instead: `NO_LINK_DETAILS`, "their name,
    what they need, and where and when".
  - `composeSystemPrompt` takes `booking_link: string | null`. With none, it leaves out the link's line and says the
    details at each of the six places it offered the link. With a link, the prompt is byte for byte what it was.
  - `describeOpenings`, `describeVisits` and `frameGuardrail` take a required `hasBookingLink`.
- **The edge.**
  - `retell-fn` answers a workspace with no link before it reads a contact or sends anything.
  - `retell-availability` has no-link words for "no calendar" and "cannot see it".
  - The openings and visits blocks, and the call's price correction, pass the flag.
- **Core and the dashboard.**
  - The Inbox's template reply refuses only a template that sends the link.
  - Its facts port answers with the business name alone.
  - The Business tab's read now gets the brain (it was "broken"). Its existing words say "It has no booking link to
    send anyone."

**Tech Stack:** TypeScript (contracts, core, the edge, dashboard server code), `node:test` (`corepack pnpm test`),
committed `packages/*/dist`. No new dependency, no migration, no environment variable.

**Worktree and branch:** `Claude Video/cm-first-run`, branch `feat/first-run-link-optional`, off `origin/main` at
`966edb3b`. Spec: `docs/superpowers/specs/2026-09-24-first-run-design.md`, decision 2, and Delivery's PR 3, part 3b:
"a receptionist with no booking link parses, and the prompt, the voice tools and the Business tab say so; nothing
saves one yet".

## Why this is its own PR

Today a config with no link fails the read schema. On the edge that is `configBroken`
(`apps/edge/lib/tenant-runtime.ts`): the receptionist stays silent and staff are told the settings could not be read.
3c writes the first such configs, for businesses that quote each job. Its reading side has to be deployed first, on
both apps, so this ships alone and writes nothing.

## What is not in this PR

- **Saving without a link (3c).** The Business tab's check (`business-tab-save.jsx`), the write schema's new rule and
  `withFirstAlertAddress` all still require one. `tenants.sells_by` is not in the config, so 3c decides how the rule
  learns a business sells by proposal.
- **Owner words that turn on how customers buy (3c).**
  - Setup's link row.
  - The first run's "Books with —".
  - People's "Text the booking link".
  - The Business tab's price sentence ("a consult or the booking link") and its standing gap.
  - The booking-link starter offered to every workspace.
  - Each one reads true for a receptionist with no link. None can be reached until 3c saves one.
- **The default fallback wording.**
  - With no link, `fillDetails` leaves out the sentence naming it, as designed.
  - The greeting keeps a dangling "Or reply here", and the holding message loses its "we will reply".
  - 3c writes a proposal seller's own defaults. Changing `FALLBACK_DEFAULTS` now would turn every workspace storing
    today's wording into "in your words" (`fallbacksWords`).
- **The shared voice shell.** Its tool descriptions still name the booking link, because changing them is an agent
  update for every workspace. The per-call prompt tells a workspace with no link not to use the tool, and the tool
  answers with the details if it is used anyway.
- **A deal from the details.** Decision 2 has the receptionist take a customer's details "for a deal". Here it
  takes them, and the team is told the way a handoff is told today: in chat by escalating, on a call by the call's
  analysis asking for a call back. Opening the deal stays the team's, as on any Pipeline workspace today. Whether
  the receptionist should open one itself is not decided by this PR or by 3c.

## Files

- Create: `packages/contracts/src/no-booking-link.ts`, the clause. Export it from `packages/contracts/src/index.ts`.
- Modify: `packages/contracts/src/config.ts`:
  - the schema;
  - the write rule;
  - `composeSystemPrompt`;
  - `resolveSystemPrompt`;
  - `fallbackMessages`.
- Modify: `packages/contracts/src/availability.ts` (`describeOpenings`), `calendar-people.ts` (`describeVisits`) and
  `whisper.ts` (`frameGuardrail`).
- Modify: `apps/edge/lib/calendar/availability.ts`, `apps/edge/api/retell-availability.ts`,
  `apps/edge/api/retell-webhook.ts` and `apps/edge/api/retell-fn.ts`.
- Modify: `packages/core/src/conversations/reply.ts` and `apps/dashboard/src/server/core-ports.ts`.
- Modify: `apps/dashboard/src/server/prompt-preview.ts` and `apps/dashboard/src/server/ask/openings.ts`.
- Test (new): `tooling/scripts/tests/no-booking-link.test.mjs`.
- Test (new cases in):
  - `retell-fn-door.test.mjs`;
  - `availability-tool.test.mjs`;
  - `core-reply.test.mjs`;
  - `settings-routes.test.mjs`.
- Test (callers of the three texts): `availability.test.mjs`, `calendar-people.test.mjs`, `voice-guardrail.test.mjs`,
  `call-controls.test.mjs`, `retell-webhook-door.test.mjs` and `prompt-preview.test.mjs`.

---

### Task 0: The link prompt, before

- [ ] **Step 1: Save today's prompts from main's committed dist**, so Task 2 can prove the link prompt did not move.
  Run `node <scratchpad>/prompt-before.mjs` against `packages/contracts/dist/index.js` before anything is built. It
  composes the chat and voice prompts for:
  - a full profile, with every guardrail on;
  - a handoff number;
  - `escalate_when`;
  - Booking under "ask".

  It also writes `describeOpenings` (both shapes), `describeVisits` and `frameGuardrail`, all with a link, to
  `<scratchpad>/prompts-before.json`.

### Task 1: The schema reads it, the save refuses it

**Files:** `packages/contracts/src/config.ts`, `tooling/scripts/tests/no-booking-link.test.mjs` (new).

- [ ] **Step 1: The failing tests.** Create `no-booking-link.test.mjs` with the fixtures and the first two tests:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";
import { parseTenantConfigResult, TenantConfigWriteSchema } from "@chanlytics/contracts";

const here = path.dirname(fileURLToPath(import.meta.url));
const { loadTenantRuntime } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/tenant-runtime.ts")).href
);

/** A business that quotes each job: no link. */
const QUOTES = {
  business_name: "Harbor Moving",
  system_prompt: "You answer for Harbor Moving, a moving company that quotes each job before it is booked.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};
const BOOKS = { ...QUOTES, booking_link: "https://book.example/harbor" };

test("the read takes a receptionist with no booking link; the save still refuses one, at the field, in the Business tab's words", () => {
  const read = parseTenantConfigResult({ brain: QUOTES });
  assert.equal(read.ok, true, read.ok ? "" : read.issues.join("; "));
  assert.equal(read.config.brain.booking_link, undefined);
  const saved = TenantConfigWriteSchema.safeParse({ brain: QUOTES });
  assert.equal(saved.success, false, "nothing saves one until the first run's Check asks how customers buy");
  assert.deepEqual(
    saved.error.issues.map((i) => [i.path.join("."), i.message]),
    [["brain.booking_link", "The receptionist needs a booking link before it can answer anyone."]],
  );
  assert.equal(TenantConfigWriteSchema.safeParse({ brain: BOOKS }).success, true, "one with a link saves as before");
  assert.equal(TenantConfigWriteSchema.safeParse({}).success, true, "and a config with no receptionist yet");
  assert.equal(
    parseTenantConfigResult({ brain: { ...BOOKS, booking_link: "not-a-url" } }).ok,
    false,
    "a link that is there is still read as a link",
  );
});

test("the edge reads it as a receptionist to answer with, not a broken config", async () => {
  const T = "dddddddd-0000-4000-8000-00000000b3b1";
  const db = fakeDb(
    {
      tenants: [{ id: T, name: "Harbor Moving", timezone: "America/New_York", status: "active" }],
      tenant_channels: [],
      tenant_config: [{ tenant_id: T, config: { brain: QUOTES } }],
      policies: [],
      google_listings: [],
    },
    {},
    { runtime_stamp: () => "stamp-no-link" },
  );
  const rt = await loadTenantRuntime(db, { tenantId: T, channelId: "wa-1", kind: "whatsapp", credentialsRef: null });
  assert.equal(rt.configBroken, false, "it was: the receptionist silent, and staff told the settings could not be read");
  assert.equal(rt.brain?.business_name, "Harbor Moving");
});
```

- [ ] **Step 2: Run them. Both fail** (`read.ok` is false, `configBroken` is true):
  `node --conditions=react-server --import tsx --test tooling/scripts/tests/no-booking-link.test.mjs`. The contracts
  come from the dist, so run `corepack pnpm --filter @chanlytics/contracts build` before each run from here on.

- [ ] **Step 3: The schema.** In `BrainConfigSchema`:

```ts
    /**
     * Where a customer books. Optional to READ since the first run's decision 2 (24 Sep 2026): a business that quotes
     * each job has none, and its receptionist takes the customer's details instead (no-booking-link.ts). Required to
     * SAVE until the first run's Check asks how customers buy (TenantConfigWriteSchema).
     */
    booking_link: z.string().url().max(500).optional(),
```

- [ ] **Step 4: The write rule.** It goes first in `TenantConfigWriteSchema`'s `superRefine`:

```ts
  // Read without one since decision 2; saved with one until the first run's Check asks how customers buy (3c). The
  // words are the Business tab's own check (business-tab-save.jsx btCheckBookingLink), so a refusal reads the same
  // from the page, the settings door and the Ask palette.
  if (cfg.brain && !cfg.brain.booking_link) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["brain", "booking_link"],
      message: "The receptionist needs a booking link before it can answer anyone.",
    });
  }
```

- [ ] **Step 5: The compiler's list.** In `resolveSystemPrompt`, use
  `booking_link: facts.booking_link.value ?? brain.booking_link ?? null`, and do the same for `"booking link"` in
  `fallbackMessages`. Widen `composeSystemPrompt`'s and `composeSystemPromptWith`'s `base.booking_link` to
  `string | null` (Task 2 uses it). Build the contracts, then run `corepack pnpm -r typecheck`. The only errors left
  should be `retell-fn.ts` (Task 4) and `reply.ts`/`core-ports.ts` (Task 5).

- [ ] **Step 6: Run the two tests. They pass.**

### Task 2: The prompt says what it does instead

**Files:** `packages/contracts/src/no-booking-link.ts` (new), `packages/contracts/src/index.ts`,
`packages/contracts/src/config.ts`, `no-booking-link.test.mjs`.

- [ ] **Step 1: The failing test.** Add to `no-booking-link.test.mjs` (and import `NO_LINK_DETAILS`,
  `composeSystemPrompt`, `resolveSystemPrompt`, `fallbackMessages` and `FALLBACK_DEFAULTS`):

```js
const PROFILE = {
  address: "12 Pier Rd, Brooklyn",
  hours: { mon: { open: "08:00", close: "18:00" } },
  services: [{ name: "Local move", price_note: "quoted per job" }],
  guardrails: { never_quote_prices: true, never_confirm_booking: true, no_health_advice: true },
};

test("the prompt says what it does instead, on both channels, wherever it would have offered the link", () => {
  const base = { business_name: "Harbor Moving", booking_link: null };
  const chat = composeSystemPrompt(base, PROFILE, "whatsapp");
  const call = composeSystemPrompt(base, PROFILE, "voice");
  for (const p of [chat, call]) {
    assert.doesNotMatch(p, /Booking link:/, "no line for a link there is not");
    assert.doesNotMatch(p, /offer the booking link|send the booking link|send the link/);
    assert.ok(p.includes(`then take ${NO_LINK_DETAILS} so the team can confirm one — the calendar decides, never you.`));
    assert.ok(p.includes(`Say it is quoted in person or at a consult, and take ${NO_LINK_DETAILS}.`));
    assert.ok(p.includes("Booking happens with staff."));
    assert.ok(p.includes("say a professional will advise at the appointment."));
  }
  assert.ok(
    chat.includes(
      `There is no booking link to send. When someone wants to book or get a quote, take ${NO_LINK_DETAILS}; once they have told you, say the team will follow up and set escalate to true.`,
    ),
  );
  assert.ok(
    call.includes(
      `Booking: there is no booking link, so never use send_booking_link. When the caller wants to book or get a quote, take ${NO_LINK_DETAILS}, and say the team will follow up.`,
    ),
  );
  assert.ok(call.includes("Keep answers to one or two sentences, and never read a URL out character by character."));
  assert.equal(
    resolveSystemPrompt({ ...QUOTES, profile: PROFILE }, "voice"),
    call,
    "the resolver hands the composer no link, not undefined",
  );
});

test("the messages sent in its name leave out the link's sentence, and nothing else", () => {
  const f = fallbackMessages({ ...QUOTES, fallbacks: { ...FALLBACK_DEFAULTS } });
  for (const m of Object.values(f)) assert.doesNotMatch(m, /\{|booking link|Book anytime/i);
  assert.ok(f.greeting.startsWith("Hi! Thanks for reaching out to Harbor Moving."));
  assert.ok(f.error.startsWith("Thanks for reaching out to Harbor Moving!"));
});
```

- [ ] **Step 2: Run it. It fails** (`NO_LINK_DETAILS` is undefined, and the prompt says `Booking link: null`).

- [ ] **Step 3: The clause.** Create `packages/contracts/src/no-booking-link.ts`:

```ts
/**
 * What a receptionist with no booking link asks for, where it would have sent one.
 *
 * A business that quotes each job -- a mover, a caterer, a contractor -- has no booking link (the first run's
 * decision 2, 24 Sep 2026): the price comes before anyone books, so its receptionist takes what the team needs to
 * follow up. Every sentence that would have offered the link finishes this one list instead: the prompt on both
 * channels (config.ts), the openings and a correction on a call (availability.ts, whisper.ts), and the phone's two
 * tools (apps/edge/api/retell-fn.ts, retell-availability.ts). However the receptionist comes to it, it asks for the
 * same things.
 *
 * Read, not yet written: a receptionist with no link parses, and the save still refuses one
 * (TenantConfigWriteSchema) until the first run's Check asks how customers buy.
 */
export const NO_LINK_DETAILS = "their name, what they need, and where and when";
```

  Add `export * from "./no-booking-link";` after `export * from "./config";` in `index.ts`, and
  `import { NO_LINK_DETAILS } from "./no-booking-link";` in `config.ts`.

- [ ] **Step 4: The composer.** In `composeSystemPromptWith`, after `const s: string[] = [];`:

```ts
  // A business that quotes each job has no booking link (the first run's decision 2). Each place below that offers
  // the link says instead what the receptionist takes for the team (NO_LINK_DETAILS). With a link, every word is as
  // it was.
  const link = base.booking_link || null;
```

  Then change the six places:
  - `s.push(\`Booking link: ${base.booking_link}\`)` becomes `if (link) s.push(\`Booking link: ${link}\`);`
  - **The call's tools.** Wrap the four "Booking:" strings in `link ? ... :`, with the no-link branch
    `` `Booking: there is no booking link, so never use send_booking_link. When the caller wants to book or get a quote, take ${NO_LINK_DETAILS}, and say the team will follow up.\n` ``.
    Comment it: the tool is on the one shell every workspace shares, so it is named to be left alone.
  - **The medium.** Two named consts before the push:

```ts
  // Medium, not facts. A phone caller cannot re-read a paragraph.
  const callMedium = link
    ? "Keep answers to one or two sentences, never read a URL out character by character, and offer to send the booking link to the caller's WhatsApp instead."
    : "Keep answers to one or two sentences, and never read a URL out character by character.";
  // In chat, escalating is what tells the team to follow up; a call's analysis does it on the phone (callback_needed).
  const chatMedium = link
    ? "Send the booking link rather than describing how to book."
    : `There is no booking link to send. When someone wants to book or get a quote, take ${NO_LINK_DETAILS}; once they have told you, say the team will follow up and set escalate to true.`;
  s.push(
    channel === "voice"
      ? `\n${PROMPT_OPENINGS.callMedium} ${callMedium}`
      : `\n${PROMPT_OPENINGS.chatMedium} ${chatMedium}`,
  );
```

  - **The open times.**

```ts
  s.push(
    `\n${PROMPT_OPENINGS.openTimes}, offer up to three that fit what the customer wants, ` +
      (link
        ? "then send the booking link — the calendar decides, never you. If none are listed, do not guess at open times; send the link."
        : `then take ${NO_LINK_DETAILS} so the team can confirm one — the calendar decides, never you. If none are listed, do not guess at open times.`),
  );
```

  - **The three rules.**

```ts
    rules.push(
      `Never quote or confirm a price. Say it is quoted in person or at a consult, and ${link ? "offer the booking link" : `take ${NO_LINK_DETAILS}`}.`,
    );
    ...
    rules.push(
      `Never promise or confirm an appointment yourself. Booking happens ${link ? "on the booking link or " : ""}with staff.`,
    );
    ...
    rules.push(
      `Never give medical or health advice — for anything about skin reactions, allergies, pregnancy or medication, say a professional will advise at the appointment${link ? " and offer the booking link" : ""}.`,
    );
```

- [ ] **Step 5: Run it. It passes.** Then run `node <scratchpad>/prompt-before.mjs --after`. It must report every link
  prompt identical to Task 0's.

- [ ] **Step 6: Commit.** `feat(contracts): a receptionist with no booking link parses, and its prompt takes the details instead`.

### Task 3: The texts beside the prompt

**Files:**
- Contracts: `availability.ts`, `calendar-people.ts`, `whisper.ts`.
- The edge: `apps/edge/lib/calendar/availability.ts`, `apps/edge/api/retell-webhook.ts`.
- The dashboard: `prompt-preview.ts`, `ask/openings.ts`.
- Tests: `no-booking-link.test.mjs`, plus each existing caller's test.

- [ ] **Step 1: The failing test.** Add to `no-booking-link.test.mjs` (and import `describeOpenings`,
  `describeVisits` and `frameGuardrail`):

```js
test("the openings, a caller's appointment and a correction on a call each end in the details, not the link", () => {
  const TZ = "America/New_York";
  const monday = Date.UTC(2026, 8, 28, 13);
  const openings = [
    { key: "2026-09-28", weekday: "mon", label: "Monday, September 28", windows: [{ start: monday, end: monday + 2 * 3_600_000 }] },
  ];
  assert.ok(
    describeOpenings(openings, TZ, { daysAhead: 14, hasBookingLink: false }).endsWith(
      `Offer up to three of these that fit what they want, then take ${NO_LINK_DETAILS} so the team can confirm one. Never confirm a slot yourself; the calendar decides.`,
    ),
  );
  assert.equal(
    describeOpenings([], TZ, { daysAhead: 14, hasBookingLink: false }),
    "Open times (from the calendar): nothing is open in the next 14 days. Offer to have someone call back.",
  );
  const visits = {
    next: { id: "v1", start: monday, end: monday + 3_600_000, title: "Estimate visit", allDay: false, via: "phone" },
    last: null,
  };
  const said = describeVisits(visits, TZ, monday - 86_400_000, false);
  assert.ok(said.includes("to change or cancel it, say the team will follow up — nothing is changed from here."));
  assert.doesNotMatch(said, /booking link/);
  assert.ok(
    frameGuardrail("price", false).includes(
      `say you cannot confirm pricing yourself, that the team confirms it, and take ${NO_LINK_DETAILS}.`,
    ),
  );
  assert.doesNotMatch(frameGuardrail("price", false), /booking link/);
});
```

- [ ] **Step 2: Run it. It fails.**

- [ ] **Step 3: `describeOpenings`.** `opts` becomes required, with `hasBookingLink: boolean`. Add to the doc:
  "`hasBookingLink` is required: what follows an opening is the link, or for a business with none, the details the
  team needs." Import `NO_LINK_DETAILS` from `./no-booking-link`.

```ts
  const link = opts.hasBookingLink;
  if (!openings.length) {
    return `Open times (from the calendar): nothing is open in the next ${ahead} days. Offer to have someone call back${link ? ", and send the booking link so they are told when a slot frees up" : ""}.`;
  }
  ...
  return (
    `Open times (from the calendar, checked just now — these change as bookings come in):\n${lines.join("\n")}\n` +
    (link
      ? "Offer up to three of these that fit what they want, then send the booking link to lock one in. Never confirm a slot yourself; the calendar decides."
      : `Offer up to three of these that fit what they want, then take ${NO_LINK_DETAILS} so the team can confirm one. Never confirm a slot yourself; the calendar decides.`)
  );
```

- [ ] **Step 4: `describeVisits(visits, tz, nowMs, hasBookingLink: boolean)`.** Only the change or cancel clause
  moves: `` `to change or cancel it, ${hasBookingLink ? "send the booking link" : "say the team will follow up"} — nothing is changed from here.` ``.
  Add to the doc: "With no booking link to send (the first run's decision 2), a change goes to the team."

- [ ] **Step 5: `frameGuardrail(rule: "price", hasBookingLink: boolean)`.** Only the offer moves:
  `` `... that the team confirms it, and ${hasBookingLink ? "offer the booking link" : `take ${NO_LINK_DETAILS}`}. ` ``.
  Import `NO_LINK_DETAILS`.

- [ ] **Step 6: The callers.** Each passes the workspace's own answer: `offersBookingLink(<brain>)` (as built; see the note at the end).
  - `apps/edge/lib/calendar/availability.ts`:
    - `openingsFor`: `{ daysAhead: data.daysAhead, hasBookingLink: !!rt.brain?.booking_link }`.
    - `visitsFor`: add `!!rt.brain?.booking_link` as the fourth argument.
  - `apps/edge/api/retell-webhook.ts`. In the correction block, before `updateLiveCall`, add
    `const { brain } = await loadTenantRuntime(db, routed);`. Comment it: "what the correction offers is what this
    receptionist offers". Then `frameGuardrail(guard.breach.rule, !!brain?.booking_link)`.
  - `apps/dashboard/src/server/prompt-preview.ts`:
    `describeOpenings(openings, cfg.tz, { daysAhead, hasBookingLink: !!cfg.brain?.booking_link })`.
  - `apps/dashboard/src/server/ask/openings.ts`:
    `describeOpenings(picked, timezone, { maxDays: 3, daysAhead, hasBookingLink: !!cfg?.brain?.booking_link })`.
  - `retell-availability.ts`'s `availabilityAnswer` is Task 4.

- [ ] **Step 7: The tests that call them.** Each passes `true` (their fixtures have a link):
  - `availability.test.mjs:180,184`;
  - `calendar-people.test.mjs:308,395,400,402,404`, plus the pin at :561, whose regex gains the fourth argument;
  - `voice-guardrail.test.mjs:67,99`;
  - `call-controls.test.mjs:188`;
  - `retell-webhook-door.test.mjs:1253` (its world's brain has a link);
  - `prompt-preview.test.mjs:148`.

- [ ] **Step 8: Build, run the whole suite. It passes. Commit:**
  `feat: the openings, a caller's appointments and a call's price correction take the details where there is no link`.

### Task 4: The phone's two tools

**Files:** `apps/edge/api/retell-fn.ts`, `apps/edge/api/retell-availability.ts`, `retell-fn-door.test.mjs`,
`availability-tool.test.mjs`.

- [ ] **Step 1: The failing tests.**

  In `retell-fn-door.test.mjs`, beside the constants:
  `const NO_LINK = "This business has no booking link, so nothing was sent. Take their name, what they need, and where and when, and say the team will follow up.";`

```js
test("a business with no booking link (one that quotes each job) has the details taken instead: nothing is sent, nobody is made a contact, and it is said", async () => {
  const { booking_link: _none, ...quotes } = BRAIN;
  const w = world({ brain: quotes });
  await listening(async (log) => {
    w.open();
    assert.equal(await spoken(await knock(w.ask(w.number()))), NO_LINK);
    assert.deepEqual(log.fields("retell_fn_no_link").map((f) => f.tenant), [w.T]);
  });
  assert.deepEqual([w.tables.contacts, w.tables.messages], [[], []], "asked before anyone is looked up or recorded");
  assert.deepEqual(w.left().calls, [], "and nothing is sent");
});
```

  In `availability-tool.test.mjs`, add a world with a no-link brain and no feed. It is the same shape as the
  booking-held test, without the booking policy and with
  `tenant_config: [{ tenant_id: T, config: { brain: { business_name: "Harbor Moving", system_prompt: "x".repeat(50), fallbacks: { greeting: "g", error: "e", non_text: "n" } } } }]`.
  Assert that the door's result is
  `"There is no calendar to check. Take their name, what they need, and where and when, and say the team will follow up."`.
  Also assert that
  `availabilityAnswer(data, profile, {}, { hasBookingLink: false }).result` ends in `so the team can confirm one. Never confirm a slot yourself; the calendar decides.`.
  Every existing `availabilityAnswer` call gains `hasBookingLink: true`.

- [ ] **Step 2: Run them. They fail.**

- [ ] **Step 3: `retell-fn.ts`.** Import `NO_LINK_DETAILS`. Beside `CANNOT_SEND`:

```ts
/**
 * Spoken when the business has no booking link: one that quotes each job (the first run's decision 2). Its prompt says
 * to leave the tool alone; this is the answer if the agent reaches for it anyway, since the tool is on the one shell
 * every workspace shares.
 */
const NO_LINK = `This business has no booking link, so nothing was sent. Take ${NO_LINK_DETAILS}, and say the team will follow up.`;
```

  and after the `if (!brain) { ... }` block:

```ts
  if (!brain.booking_link) {
    L.info("retell_fn_no_link", { tenant: routed.tenantId });
    return json(200, { result: NO_LINK });
  }
```

- [ ] **Step 4: `retell-availability.ts`.** Import `NO_LINK_DETAILS`. Beside `NO_CALENDAR`:

```ts
/**
 * The same two for a business with no booking link (the first run's decision 2): with nothing to send, a caller who
 * cannot be offered times is offered a call back, or has their details taken for the team.
 */
const CANNOT_SEE_NO_LINK = "I can't see the calendar right now. Offer to have someone call back.";
const NO_CALENDAR_NO_LINK = `There is no calendar to check. Take ${NO_LINK_DETAILS}, and say the team will follow up.`;
```

  - `availabilityAnswer`'s `opts` becomes `{ client?: boolean; hasBookingLink: boolean }` (required), and its
    `describeOpenings` passes `hasBookingLink: opts.hasBookingLink`.
  - In `POST`, after the booking-held answer, add `const hasBookingLink = offersBookingLink(rt.brain);`.
  - The no-calendar answer becomes `hasBookingLink ? NO_CALENDAR : NO_CALENDAR_NO_LINK`, and the could-not-read one
    `hasBookingLink ? CANNOT_SEE : CANNOT_SEE_NO_LINK`. An unrouted call keeps `CANNOT_SEE`: with no workspace, there
    is no link to ask about.
  - `availabilityAnswer(..., { client: deal?.stage === "won", hasBookingLink })`.

- [ ] **Step 5: Run them. They pass. Commit:**
  `feat(edge): the phone's booking-link and calendar tools take the details where there is no link`.

### Task 5: The Inbox's template reply

**Files:** `packages/core/src/conversations/reply.ts`, `apps/dashboard/src/server/core-ports.ts`,
`core-reply.test.mjs`.

- [ ] **Step 1: The failing tests.** In `core-reply.test.mjs`:

```js
test("a business with no booking link replies with any template that does not send one; one that does is refused in words, before anything is queued", async () => {
  const closed = conv({ last_wa_inbound_at: iso(NOW - 30 * HOUR) });
  const quotes = { templateFacts: { business_name: "Harbor Moving", booking_link: null } };
  const linked = fakes(quotes);
  await refused(
    replyToConversation(linked.ports, cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } })),
    "validation",
    /takes the booking link, and none is on file/,
  );
  assert.deepEqual(linked.ops(), [], "refused before the thread is claimed or anything queued");
  const named = fakes({
    ...quotes,
    template: { ...approved, body_preview: "Thanks for asking {{1}}!", variables: [{ label: "Business name", position: 1 }] },
  });
  const r = await replyToConversation(named.ports, cmd({ conv: closed, body: { template: { name: "reservar_ahora", language: "en_US" } } }));
  assert.equal(r.status, "queued");
  assert.deepEqual(named.call("schedule")[3].template.params, ["Harbor Moving"]);
});

test("the facts port answers with the business name alone: no link is null, and no name is no facts", async () => {
  const { replyPorts } = await import("../../../apps/dashboard/src/server/core-ports.ts");
  const { fakeDb } = await import("./_fake-db.mjs");
  const at = (config) =>
    replyPorts({ supabase: fakeDb({ tenant_config: [{ tenant_id: "t1", config }] }), userId: "u1" }).templateFacts("t1");
  assert.deepEqual(await at({ brain: { business_name: "Harbor Moving" } }), { business_name: "Harbor Moving", booking_link: null });
  assert.deepEqual(await at({ brain: { business_name: "Harbor Moving", booking_link: "https://book.example/harbor" } }), {
    business_name: "Harbor Moving",
    booking_link: "https://book.example/harbor",
  });
  assert.equal(await at({ brain: { booking_link: "https://book.example/harbor" } }), null);
  assert.equal(await at({}), null);
});
```

- [ ] **Step 2: Run them. They fail.**

- [ ] **Step 3: `reply.ts`.**
  - The port type becomes `templateFacts(tenantId: string): Promise<{ business_name: string; booking_link: string | null } | null>`.
  - After the `if (!facts)` refusal, which stays as it is:

```ts
    const slots = inboxSlots(tpl);
    // A business that quotes each job has no link (the first run's decision 2). Its templates that name none still
    // go; one that sends the link is refused here, in words, rather than sent with the slot empty.
    if (!facts.booking_link && slots.some((s) => s.kind === "booking_link"))
      throw new AppError(
        "validation",
        "This template takes the booking link, and none is on file. Pick another template, or add the link in Settings › Business first.",
      );
    const params: string[] = resolveParams(slots, {
      firstName: firstNameOf(conv.display_name, conv.wa_profile_name),
      businessName: facts.business_name,
      bookingLink: facts.booking_link?.replace(/^https?:[/][/]/, "") ?? null,
    });
```

- [ ] **Step 4: `core-ports.ts`.**

```ts
      // The name is enough: a template that sends no link needs none, and the verb refuses one that does (reply.ts).
      return brain?.business_name
        ? { business_name: brain.business_name, booking_link: brain.booking_link || null }
        : null;
```

- [ ] **Step 5: Run them. They pass. Commit:**
  `feat: the Inbox replies with a template for a business with no booking link, unless the template sends one`.

### Task 6: The Business tab's read and save

**Files:** `settings-routes.test.mjs`. No source change is expected: this proves the read the tab stands on.

- [ ] **Step 1: The test.** It uses the settings read world (`tables`, `get(inA)`, `ctxFor`), with
  `tenant_config: [{ tenant_id: A, config: { brain: <no-link brain> }, version: 4, ... }]`:
  - GET answers `configBroken: false` with `config.brain.business_name`, and `facts.booking_link.value` null. The tab's
    `standingLine` then says "It has no booking link to send anyone." and its ability row says "No booking link yet,
    so there is nothing to send." (both already pinned in `business-tab-vm.test.mjs`).
  - PUT of that brain is refused with
    `Config rejected — brain.booking_link: The receptionist needs a booking link before it can answer anyone.`
    Nothing changes (version 4).

- [ ] **Step 2: Run it. It passes** on Task 1's code. Before Task 1 it would have failed with `configBroken: true`.

- [ ] **Step 3: Commit:** `test: the settings read gives the Business tab a receptionist with no booking link, and the save still refuses one`.

### Task 7: The gates, the review, the pull request

- [ ] Prettier on the changed sources. Then `corepack pnpm --filter "./packages/*" build`, keeping only real dist
  diffs (`git diff -w --ignore-cr-at-eol`).
- [ ] `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`,
  `node tooling/scripts/gen-route-types.mjs --check` and `corepack pnpm test`. Check `git status` shows no dist drift.
- [ ] `node <scratchpad>/prompt-before.mjs --after`: every link prompt is identical.
- [ ] One whole-branch review (code-review: standards and spec) and one fix round.
- [ ] Merge main if it moved, rebuild the dists and test the combined tree. Open the PR:
  - what changes for a customer (nothing today; a business with no link is answered once 3c saves one);
  - nothing to set;
  - either deploy order.
- [ ] Watch CI, squash-merge on green, and check main's run.

## As built (24 September 2026)

Tasks 0 to 6 as planned, then one whole-branch review (standards and spec) and one fix round.

**Before the review, from the whole suite.** A workspace with no receptionist config at all is not one with no link.
Nothing is known about it, and a call is then told `FACTS_UNAVAILABLE`, which offers the link. So the rule "does this
receptionist offer the link?" is one predicate, `offersBookingLink(brain)` in `no-booking-link.ts`: yes unless the
config is known to hold none. Every reader uses it. `voice-booking-link.test.mjs` caught the difference.

**Fixed in the review round.**
- **A stored prompt.** A receptionist answered from its own stored prompt (no details to compose from) is told there
  is no link too, first among the rules after it. It was told nothing, and on a call could reach for the shell's
  tool. With a link, a stored prompt is byte for byte what it was.
- **Changes and cancellations.** The no-link line covers changing or cancelling a booking as well as booking and a
  quote, on both channels. In chat, a caller's appointment says "the team will follow up", and only an escalation
  tells the team.
- **One sentence per refusal.** A save with no link is refused in one sentence, `BOOKING_LINK_NEEDED`: "The
  receptionist needs a booking link to send anyone who wants to book." Its old words ("before it can answer anyone")
  stopped being true once a receptionist with no link is answered. The Business tab's own check says the same, and
  `business-tab-create.test.mjs` holds the two equal.
- **The price offer.** The phrase that follows a price declined ("offer the booking link", or the details) is
  `priceNextStep`, shared by the prompt's rule and the call's correction.
- **Named flags.** `describeVisits` and `frameGuardrail` take `{ hasBookingLink }`, not a bare boolean.
- **Tests that run the code.**
  - `visitsFor` without a link is run over a served feed, and its source pin no longer pins the new argument.
  - The webhook's correction is proven with a receptionist with no link. With a link, a hard-coded answer would
    have passed too.
  - The calendar tool's could-not-read answer is covered.

**Kept on purpose.**
- **A withheld number, then no link.** A caller whose number cannot be read is asked to read it back before the
  workspace is known, even when that workspace has no link. That check runs before anything is read, by design, and
  a door test pins it. The prompt already tells a workspace with no link never to use the tool.
- **The Inbox's refusal with no facts** still says "Add the business name and booking link". A workspace with no
  receptionist needs both to save one until 3c.
- **Two questions about a template's link.** The Inbox's refusal asks the slots the Inbox fills (`inboxSlots`).
  `bookingTemplate` asks the default kinds the voice send picks by. They differ on a template whose slots were never
  recorded, which the Inbox sends with its two (I6).
- **The Business tab's words for a stored prompt.** "Followed only by any rules your Autonomy tab adds"
  (`RULES_WITHOUT_FIELDS_WORDS`) is not true of a receptionist with no link and no composed details. Nothing can
  save one until 3c, and those words may be on a live workspace's tab, so 3c changes them with how customers buy.
