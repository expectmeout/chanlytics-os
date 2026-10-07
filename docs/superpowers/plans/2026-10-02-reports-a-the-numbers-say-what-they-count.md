# Reports phase A: the numbers say what they count — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four numbers today's Reports page states wrongly, and the words it says them in (spec §12, A1-A6), without changing the page's layout.

**Architecture:** Two migrations give Reports and Today one rule each for "a connected call", "a person's first moment" and "who answered" (now also returning the hold each reply waited and leaving automated sends out of "you"), and `report_series` returns when each message and call came in by quarter hour. The contracts view model then says reply speed against the hold, counts what came while the business was closed by its own hours (one `openAt` predicate beside the calendar's hours reader), says durations one way, and names channels in the product's words. The reader hands the workspace's hours to the view model. A dashboard running against the old SQL falls back to today's sentences, so either deploy order works.

**Tech Stack:** Postgres (Supabase migrations, plpgsql and SQL functions), TypeScript (`packages/contracts`, `apps/dashboard` Next.js app), `node:test` via `tooling/scripts/checks/test.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§12 is this phase; §3 D14-D16 and §7's "new person" rule). Data facts: `docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md`.

## Global Constraints

- **No commit, no push, no PR** until Ruben says so (his standing rule, 2 Oct 2026). Every "Stage" step is `git add`, never `git commit`.
- Work in a fresh worktree off `origin/main`: `git -C "C:/Users/Ruben/Documents/Claude Projects/Claude Video/cm-live" worktree add -b fix/reports-say-what-they-count "../cm-reports-a" origin/main`, then `corepack pnpm install` in it. Never edit the tree that serves `localhost:3300` (`cm-kit-threads`).
- **Never run the whole suite locally** (it takes ~20 minutes). Run each touched test file alone: `node tooling/scripts/checks/test.mjs <file>`; plus `corepack pnpm -r typecheck` and `corepack pnpm lint`.
- Tests import `@chanlytics/contracts` from its built `dist`: run `corepack pnpm --filter "./packages/*" build` after every contracts change and before its tests. The rebuilt `packages/*/dist` is staged with the change (CI fails on drift).
- Migrations: numbered above the ledger's head (`supabase/migrations-ledger.json`; the head is `00284` at `32328415f`, so `00285` and `00286`; re-check the head before writing and take the next free numbers), forward-only, re-runnable (`create or replace`, `drop ... if exists`), named for the change, a header of a few lines, grants restated. Record the ledger with `node tooling/scripts/checks/migration-ledger.mjs --record`.
- One predicate per rule (`CLAUDE.md`): "connected call", "first moment", "open at" and "a duration in words" each get exactly one implementation, and every caller reads it.
- No real customer in tests or docs: phone numbers `+1555013xxxx`, slugs and names like `harbor`, `Harbor Studio`.
- Words: SMS is said **"Text"**; durations come from `durationWords` only; never "outside 8am to 8pm".
- Either deploy order works: a payload without `hold` or `arrivals` (the SQL before `00286`) must draw today's sentences, never throw.
- Prettier owns formatting: run `corepack pnpm exec prettier --write <files>` on every touched file before staging (`docs/superpowers/` is Prettier-ignored).

## Review Focus

1. **A report from the SQL before `00286` reaches the new view model** (a deploy in either order): no `hold`, no `arrivals`, and `channels` may still carry `instagram`. Expected: today's sentences ("Half of its replies went out within …"), no closed count, no Instagram row, no crash. Test in Task 6 and Task 7.
2. **The hold changed mid-period** (replies held 30 s and 60 s). Expected: the label is the hold most replies waited, and every count stays true. Test in Task 6.
3. **A tenant whose zone is not UTC**: a message at 23:20 local lands on the local date and quarter 93, not the UTC date. Test in Task 5.
4. **A broadcast send follows a customer's message in the same thread, then the owner replies**: the broadcast is nobody's answer, and the owner's reply is "you". Test in Task 4.
5. **A closure written with `until` before `date`** (stored rows are not validated on read): it shuts its `date` only, as `closedOn` already reads it. Test in Task 3.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `packages/contracts/src/shared/clock.ts` | modify | `durationWords`: the one way a length of time is said |
| `packages/contracts/src/shared/index.ts` | modify | export `durationWords` |
| `packages/contracts/src/today/today-bands.ts` | modify | `secondsPhrase` reads `durationWords` |
| `packages/contracts/src/calendar/availability.ts` | modify | `openAt`, `hasHours` beside `dayIntervals` and `closedOn` |
| `packages/contracts/src/calendar/index.ts` | modify | export `openAt`, `hasHours` |
| `packages/contracts/src/reports/reports.ts` | modify | channels' words; `fmtSeconds` reads `durationWords`; reply buckets on the words' own edges; `holdOf` and the hold sentences; `closedOf` and `ReportHoursVM.closed`; `toReportVM(dto, { profile })` |
| `packages/contracts/src/reports/report-facts.ts` | modify | "N while you were closed" |
| `packages/contracts/src/reports/index.ts` | modify | export the new names |
| `supabase/migrations/00285_a_connected_call_a_first_moment_and_an_answer_are_each_said_once.sql` | create | `call_connected`, `contact_first_moments`, `first_replies` with the hold and without automated sends |
| `supabase/migrations/00286_a_report_counts_only_what_it_says.sql` | create | `report_series` v5, `metrics_summary` on the two rules |
| `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md` | regenerate | from the migrations |
| `apps/dashboard/src/server/readers/report.ts` | modify | hand the profile's hours and closures to the page and Ask |
| `apps/dashboard/src/surfaces/reports/surface.ts` | modify | `toReportVM(data.report, { profile: data.profile })` |
| `apps/dashboard/src/server/ask/context/pages.ts`, `apps/dashboard/src/server/ask/tools/read/report.ts` | modify | the same call |
| `tooling/scripts/tests/shared/duration-words.test.mjs` | create | durations |
| `tooling/scripts/tests/calendar/open-at.test.mjs` | create | the open-at predicate |
| `tooling/scripts/tests/reports/report-answers.db.test.mjs` | create | 00285 on a real Postgres |
| `tooling/scripts/tests/reports/report-counts.db.test.mjs` | create | 00286 on a real Postgres |
| `tooling/scripts/tests/reports/reports-hold.test.mjs` | create | speed against the hold |
| `tooling/scripts/tests/reports/reports-closed.test.mjs` | create | while you were closed |
| `tooling/scripts/tests/reports/{reports-vm,reports-where-when,report-facts,reports-page,report-series.db}.test.mjs`, `tooling/scripts/tests/ask/readers.test.mjs` | modify | the expectations the fixes change |

---

### Task 1: One way to say a length of time

**Files:**
- Modify: `packages/contracts/src/shared/clock.ts` (append after `callLength`, ~line 277)
- Modify: `packages/contracts/src/shared/index.ts:110` (the named export list that holds `callLength`)
- Modify: `packages/contracts/src/today/today-bands.ts:23-29`
- Modify: `packages/contracts/src/reports/reports.ts:241-249`
- Create: `tooling/scripts/tests/shared/duration-words.test.mjs`
- Modify: `tooling/scripts/tests/reports/reports-vm.test.mjs:132-133`

**Interfaces:**
- Produces: `durationWords(seconds: number): string` exported from `@chanlytics/contracts`; `fmtSeconds(s: number | null | undefined): string` keeps its name and signature and now reads `durationWords`.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/shared/duration-words.test.mjs`:

```js
/**
 * A length of time is said one way on every page (the Reports lenses spec, A5): Today's measured median said "1m 5s"
 * and Reports said "1m 05s". Seconds under ten minutes, whole minutes under an hour, then hours and minutes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { durationWords, fmtSeconds } from "@chanlytics/contracts";

test("seconds under ten minutes, whole minutes under an hour, then hours and minutes", () => {
  const cases = [
    [0, "0s"],
    [41, "41s"],
    [59.6, "1m"],
    [60, "1m"],
    [65, "1m 5s"],
    [72, "1m 12s"],
    [599, "9m 59s"],
    [600, "10m"],
    [3570, "1h"],
    [3600, "1h"],
    [3900, "1h 5m"],
    [7800, "2h 10m"],
  ];
  for (const [s, words] of cases) assert.equal(durationWords(s), words, `${s} seconds`);
});

test("Reports' fmtSeconds says what durationWords says, and a dash for nothing", () => {
  for (const s of [5, 65, 72, 600, 3900]) assert.equal(fmtSeconds(s), durationWords(s));
  assert.equal(fmtSeconds(null), "—");
  assert.equal(fmtSeconds(Number.NaN), "—");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm --filter "./packages/*" build` then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shared/duration-words.test.mjs`
Expected: FAIL — `durationWords` is not exported (`TypeError: durationWords is not a function`).

- [ ] **Step 3: Write the helper and point both callers at it**

Append to `packages/contracts/src/shared/clock.ts`:

```ts
/**
 * A length of time in an owner's words, said one way on every page: "41s", "1m", "1m 12s" under ten minutes, whole
 * minutes under an hour ("14m"), then hours and minutes ("2h", "2h 10m"). Today's measured median and Reports' reply
 * times both read it; they said "1m 5s" and "1m 05s" before (the Reports lenses spec, A5).
 */
export function durationWords(seconds: number): string {
  const v = Math.max(0, Math.round(seconds));
  if (v < 60) return `${v}s`;
  if (v < 600) {
    const m = Math.floor(v / 60);
    const r = v % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }
  const minutes = Math.round(v / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
```

In `packages/contracts/src/shared/index.ts`, add `durationWords,` on the line after `callLength,` (line 110) in the same export list.

In `packages/contracts/src/today/today-bands.ts`, add `import { durationWords } from "../shared/clock";` with the imports, and replace the `secondsPhrase` function (lines 23-29) with:

```ts
/** "41s" / "1m 12s": a measured median, said the one way a length of time is said (durationWords). */
export function secondsPhrase(s: number): string {
  return durationWords(s);
}
```

In `packages/contracts/src/reports/reports.ts`, add `import { durationWords } from "../shared/clock";` with the imports, and replace `fmtSeconds` (lines 241-249) with:

```ts
/** A duration in an owner's words (durationWords), or a dash where there is none. */
export function fmtSeconds(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s)) return "—";
  return durationWords(s);
}
```

In `tooling/scripts/tests/reports/reports-vm.test.mjs`, change lines 132-133 to:

```js
  assert.equal(fmtSeconds(65), "1m 5s");
  assert.equal(fmtSeconds(3900), "1h 5m");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build`, then each of:
`node tooling/scripts/checks/test.mjs tooling/scripts/tests/shared/duration-words.test.mjs`
`node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs`
`node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-lines.test.mjs`
`node tooling/scripts/checks/test.mjs tooling/scripts/tests/today/today-vm.test.mjs`
Expected: PASS. (No other test pins a duration said with padded seconds or of ten minutes and more with seconds; checked at `32328415f`.)

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/shared/clock.ts packages/contracts/src/shared/index.ts packages/contracts/src/today/today-bands.ts packages/contracts/src/reports/reports.ts tooling/scripts/tests/shared/duration-words.test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
git add packages/contracts tooling/scripts/tests/shared/duration-words.test.mjs tooling/scripts/tests/reports/reports-vm.test.mjs
```

---

### Task 2: Channels in the product's words

**Files:**
- Modify: `packages/contracts/src/reports/reports.ts:36-47` (`ReportChannelKey`, `REPORT_CHANNELS`) and `:447-466` (`channelNoun`, `channelsLine`)
- Modify: `tooling/scripts/tests/reports/reports-where-when.test.mjs:225-245`

**Interfaces:**
- Produces: `ReportChannelKey = "whatsapp" | "voice" | "email" | "sms"`; `REPORT_CHANNELS` labels `WhatsApp`, `Calls`, `Email`, `Text`.

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/reports/reports-where-when.test.mjs`, replace the channel-order assertion (the array `["whatsapp", "voice", "email", "sms", "instagram"]` near line 231) with `["whatsapp", "voice", "email", "sms"]`, and the expected `channelsOf` row `{ key: "sms", label: "SMS", value: 1, prior: 0 }` (near line 241) with `{ key: "sms", label: "Text", value: 1, prior: 0 }`. Append:

```js
test("texts are said as texts, and a channel no message can arrive on is never listed", () => {
  const ch = channelsOf({
    current: { whatsapp: 0, voice: 0, email: 0, sms: 6, instagram: 0 },
    previous: { whatsapp: 0, voice: 0, email: 0, sms: 1, instagram: 3 },
  });
  assert.deepEqual(
    ch.map((c) => c.key),
    ["sms"],
    "an instagram count from an older report is ignored: the messages CHECK admits no Instagram",
  );
  const vm = toReportVM(dto({ channels: { current: { whatsapp: 0, voice: 0, email: 0, sms: 6 }, previous: { whatsapp: 0, voice: 0, email: 0, sms: 0 } } }));
  assert.equal(vm.lines.channels, "Mostly texts.");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm --filter "./packages/*" build` then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-where-when.test.mjs`
Expected: FAIL — the order still lists `instagram`, the label is `SMS`, and the line says "Mostly SMS."

- [ ] **Step 3: Change the words**

In `packages/contracts/src/reports/reports.ts` replace lines 36-45 with:

```ts
/** The channels a report names, in the order their colours are fixed (a channel keeps its colour whatever its rank).
 *  No Instagram: the messages CHECK admits none, so a report would only ever say zero (spec A5). */
export type ReportChannelKey = "whatsapp" | "voice" | "email" | "sms";

export const REPORT_CHANNELS: readonly { key: ReportChannelKey; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "voice", label: "Calls" },
  { key: "email", label: "Email" },
  { key: "sms", label: "Text" },
];
```

Replace `channelNoun` (line 447-449) with:

```ts
/** A channel inside a sentence: calls, email and texts are common nouns there; WhatsApp is a name. */
const channelNoun = (c: ReportChannelVM): string =>
  c.key === "voice" ? "calls" : c.key === "email" ? "email" : c.key === "sms" ? "texts" : c.label;
```

In `channelsLine`, change `${top.key === "voice" ? "lead" : "leads"}` to `${top.key === "voice" || top.key === "sms" ? "lead" : "leads"}` (calls and texts are plural: "Texts lead").

Run `grep -rn "instagram" packages/contracts/src/reports apps/dashboard/src/surfaces/reports`; for each hit outside a comment, remove the `instagram` key (the sample's channel counts, any `ReportChannelCounts` literal). `channelsOf` already reads only `REPORT_CHANNELS`, so a payload that still carries `instagram` is ignored.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build`, then each of `reports-where-when.test.mjs`, `reports-lines.test.mjs`, `report-facts.test.mjs`, `reports-sample.test.mjs` under `tooling/scripts/tests/reports/` with `node tooling/scripts/checks/test.mjs <file>`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports/reports.ts tooling/scripts/tests/reports/reports-where-when.test.mjs
git add packages/contracts apps/dashboard/src/surfaces/reports tooling/scripts/tests/reports/reports-where-when.test.mjs
```

---

### Task 3: One answer to "were they open then?"

**Files:**
- Modify: `packages/contracts/src/calendar/availability.ts:20` (imports) and after `closedOn` (~line 89)
- Modify: `packages/contracts/src/calendar/index.ts` (the export list holding `dayIntervals`, `freeWindows`)
- Create: `tooling/scripts/tests/calendar/open-at.test.mjs`

**Interfaces:**
- Consumes: `dayIntervals(h)`, `closedOn(closures, key)` (same module), `DAYS` from `config/workspace-config/business-profile`.
- Produces: `openAt(hours: Record<string, Hours | undefined> | undefined, closures: Closure[] | undefined, dateKey: string, minute: number): boolean` and `hasHours(hours: Record<string, Hours | undefined> | undefined): boolean`, both exported from `@chanlytics/contracts`.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/calendar/open-at.test.mjs`:

```js
/**
 * "Were they open then?" has one answer (spec A2): a day's hours as dayIntervals reads them, and never on a closure.
 * Reports asks it for each quarter hour something came in. 14 Sep 2026 is a Monday.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { openAt, hasHours } from "@chanlytics/contracts";

const hours = {
  mon: { open: "09:30", close: "18:00" },
  tue: { intervals: [{ open: "09:30", close: "13:00" }, { open: "15:00", close: "19:00" }] },
  sun: {},
};
const at = (h, m = 0) => h * 60 + m;

test("open inside the day's hours; closed before it opens and from the minute it closes", () => {
  assert.equal(openAt(hours, [], "2026-09-14", at(9, 15)), false);
  assert.equal(openAt(hours, [], "2026-09-14", at(9, 30)), true);
  assert.equal(openAt(hours, [], "2026-09-14", at(17, 45)), true);
  assert.equal(openAt(hours, [], "2026-09-14", at(18, 0)), false);
});

test("a split shift is closed over lunch; a day with no hours, or not in the week, is closed", () => {
  assert.equal(openAt(hours, [], "2026-09-15", at(14)), false);
  assert.equal(openAt(hours, [], "2026-09-15", at(15)), true);
  assert.equal(openAt(hours, [], "2026-09-20", at(12)), false, "Sunday has no hours");
  assert.equal(openAt(hours, [], "2026-09-16", at(12)), false, "Wednesday is not in the week");
});

test("a closure shuts every day it covers, its until included; a reversed one shuts its date only", () => {
  const closures = [{ date: "2026-09-14", until: "2026-09-15" }];
  assert.equal(openAt(hours, closures, "2026-09-14", at(12)), false);
  assert.equal(openAt(hours, closures, "2026-09-15", at(10)), false);
  assert.equal(openAt(hours, closures, "2026-09-21", at(12)), true, "the Monday after");
  const reversed = [{ date: "2026-09-21", until: "2026-09-14" }];
  assert.equal(openAt(hours, reversed, "2026-09-21", at(12)), false);
  assert.equal(openAt(hours, reversed, "2026-09-15", at(10)), true);
});

test("a workspace that never said its hours has none: that is unknown, never always closed", () => {
  assert.equal(hasHours(undefined), false);
  assert.equal(hasHours({ sun: {} }), false);
  assert.equal(hasHours(hours), true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm --filter "./packages/*" build` then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/calendar/open-at.test.mjs`
Expected: FAIL — `openAt is not a function`.

- [ ] **Step 3: Write the predicate**

In `packages/contracts/src/calendar/availability.ts`, change the import on line 20 to:

```ts
import { DAYS, type Closure, type Hours } from "../config/workspace-config/business-profile";
```

After `closedOn` add:

```ts
const minutesOf = (s: string): number | null => {
  const t = hhmm(s);
  return t ? t[0] * 60 + t[1] : null;
};

/**
 * Whether the business is open at a minute of a day on its own clock ("2026-09-17", 19 * 60): that weekday's hours
 * as dayIntervals reads them, and never on a closure (closedOn). The one answer to "were they open then?"; Reports'
 * while-you-were-closed asks it for each quarter hour something came in (spec A2).
 */
export function openAt(
  hours: Record<string, Hours | undefined> | undefined,
  closures: Closure[] | undefined,
  dateKey: string,
  minute: number,
): boolean {
  if (closedOn(closures, dateKey)) return false;
  const [y, m, d] = dateKey.split("-").map(Number);
  const weekday = DAYS[(new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay() + 6) % 7];
  return dayIntervals(hours?.[weekday]).some(([o, c]) => {
    const from = minutesOf(o);
    const to = minutesOf(c);
    return from !== null && to !== null && from <= minute && minute < to;
  });
}

/** Whether a workspace has said when it is open at all. A week with no open day says nothing, never "always closed". */
export function hasHours(hours: Record<string, Hours | undefined> | undefined): boolean {
  return DAYS.some((d) => dayIntervals(hours?.[d]).length > 0);
}
```

In `packages/contracts/src/calendar/index.ts`, add `openAt,` and `hasHours,` to the export list beside `dayIntervals` and `freeWindows`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build` then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/calendar/open-at.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/calendar/availability.ts packages/contracts/src/calendar/index.ts tooling/scripts/tests/calendar/open-at.test.mjs
git add packages/contracts tooling/scripts/tests/calendar/open-at.test.mjs
```

---

### Task 4: A connected call, a first moment and an answer, each said once (migration 00285)

**Files:**
- Create: `supabase/migrations/00285_a_connected_call_a_first_moment_and_an_answer_are_each_said_once.sql`
- Create: `tooling/scripts/tests/reports/report-answers.db.test.mjs`

**Interfaces:**
- Produces (SQL, granted to `authenticated` and `service_role`):
  - `public.call_connected(p_status text, p_duration_ms integer) returns boolean` — `ongoing` or `ended`, or `error` with a duration.
  - `public.contact_first_moments(p_tenant_id uuid) returns table (contact_id uuid, first_at timestamptz)` — each person's first message or connected call; erased people, people with an imported history, and people with neither are absent.
  - `public.first_replies(p_tenant_id uuid, p_start timestamptz)` returns its six columns as before plus `ai_hold_s numeric` (the hold the answering reply waited, 0 when sent at once; null when the receptionist did not answer first), and a broadcast's or reach-out's send is never `human_at`.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/reports/report-answers.db.test.mjs`:

```js
/**
 * 00285 on a real Postgres: one rule for a connected call, one for a person's first moment, and who answered with
 * the hold the answer waited. A broadcast's or a reach-out's send is written as 'human' and is nobody's answer.
 * Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);
const plus = (d, s) => new Date(d.getTime() + s * 1000).toISOString();

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-answers-${Date.now()}`, name: "Harbor Answers", timezone: "UTC" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

async function person(phone, over = {}) {
  const contact = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: tenantId, phone_e164: phone, display_name: "Harbor Guest", ...over })
      .select("id")
      .single(),
  );
  const conv = ok(
    await db
      .from("conversations")
      .insert({ tenant_id: tenantId, contact_id: contact.id, state: "open", last_message_at: ago(1).toISOString() })
      .select("id")
      .single(),
  );
  return { contact: contact.id, conv: conv.id };
}

const message = (p, over) => ({
  tenant_id: tenantId,
  conversation_id: p.conv,
  contact_id: p.contact,
  channel: "whatsapp",
  type: "text",
  body: "hi",
  meta: {},
  ...over,
});

test("a connected call is one rule: ended or ongoing, or an error someone spoke on", { skip }, async () => {
  const cases = [
    ["ended", null, true],
    ["ongoing", null, true],
    ["error", 30_000, true],
    ["error", 0, false],
    ["error", null, false],
    ["not_connected", null, false],
    ["registered", null, false],
  ];
  for (const [status, ms, want] of cases) {
    const got = ok(await db.rpc("call_connected", { p_status: status, p_duration_ms: ms }));
    assert.equal(got, want, `${status} ${ms}`);
  }
});

test("who answered: the receptionist's answer carries its hold; a broadcast is nobody's; the owner's is yours", { skip }, async () => {
  const a = await person("+15550138001");
  const b = await person("+15550138002");
  const askA = ago(120);
  const askB = ago(60);
  ok(
    await db.from("messages").insert([
      message(a, { direction: "inbound", sender: "customer", status: "received", created_at: askA.toISOString() }),
      message(a, {
        direction: "outbound",
        sender: "ai",
        status: "sent",
        body: "hello",
        created_at: plus(askA, 61),
        meta: { source: "veto_window", delay_ms: 60000 },
      }),
      message(b, { direction: "inbound", sender: "customer", status: "received", created_at: askB.toISOString() }),
      message(b, {
        direction: "outbound",
        sender: "human",
        status: "sent",
        body: "This month's offer",
        created_at: plus(askB, 30),
        meta: { source: "broadcast" },
      }),
    ]),
  );
  const since = ago(24 * 60).toISOString();
  const rows = ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since }));
  const byConv = Object.fromEntries(rows.map((r) => [r.conversation_id, r]));
  assert.equal(byConv[a.conv].who, "ai");
  assert.equal(Math.round(Number(byConv[a.conv].ai_seconds)), 61);
  assert.equal(Number(byConv[a.conv].ai_hold_s), 60, "the hold the answer waited");
  assert.equal(byConv[b.conv].who, "none", "a broadcast's send is nobody's answer");
  assert.equal(byConv[b.conv].ai_hold_s, null);

  ok(
    await db.from("messages").insert(
      message(b, { direction: "outbound", sender: "human", status: "sent", body: "Yes, Saturday", created_at: plus(askB, 90) }),
    ),
  );
  const again = ok(await db.rpc("first_replies", { p_tenant_id: tenantId, p_start: since }));
  assert.equal(again.find((r) => r.conversation_id === b.conv).who, "you", "the owner's own reply is still yours");
});

test("a first moment is a message or a connected call; never an erased person, never a person with neither", { skip }, async () => {
  const spoke = await person("+15550138003");
  const erased = await person("+15550138004", { erased_at: new Date().toISOString() });
  const silent = await person("+15550138005");
  const caller = await person("+15550138006");
  ok(
    await db.from("messages").insert([
      message(spoke, { direction: "inbound", sender: "customer", status: "received", created_at: ago(30).toISOString() }),
      message(erased, { direction: "inbound", sender: "customer", status: "received", created_at: ago(30).toISOString() }),
    ]),
  );
  ok(
    await db.from("calls").insert([
      { tenant_id: tenantId, retell_call_id: `ans-${Date.now()}-a`, contact_id: caller.contact, status: "error", started_at: ago(20).toISOString(), duration_ms: 0 },
      { tenant_id: tenantId, retell_call_id: `ans-${Date.now()}-b`, contact_id: caller.contact, status: "error", started_at: ago(10).toISOString(), duration_ms: 45_000 },
    ]),
  );
  const firsts = ok(await db.rpc("contact_first_moments", { p_tenant_id: tenantId }));
  const ids = new Set(firsts.map((f) => f.contact_id));
  assert.ok(ids.has(spoke.contact));
  assert.ok(!ids.has(erased.contact), "an erased person has no first moment");
  assert.ok(!ids.has(silent.contact), "a person who never wrote or phoned has none");
  const callerFirst = firsts.find((f) => f.contact_id === caller.contact);
  assert.ok(callerFirst, "a call someone spoke on is a first moment");
  assert.ok(Math.abs(new Date(callerFirst.first_at).getTime() - ago(10).getTime()) < 120_000, "the call that errored at once is not");
});
```

- [ ] **Step 2: Run it to verify it fails**

Start the local stack if it is not running (`npx supabase start` from the worktree root; `docs/runbook.md`, "Test it"), export `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `npx supabase status`, then:
Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/report-answers.db.test.mjs`
Expected: FAIL — `Could not find the function public.call_connected`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00285_a_connected_call_a_first_moment_and_an_answer_are_each_said_once.sql`:

```sql
-- 00285 · A connected call, a person's first moment and an answer are each said once.
--
-- Reports (report_series) and Today (metrics_summary) each wrote their own "a call that connected" (status is not
-- not_connected, which counted a call that errored before anyone spoke) and their own "when a person first reached
-- us" (Reports kept the erased, Today did not). And first_replies (00250), their one rule for who answered, took a
-- broadcast's, a playbook's or a reach-out's send for the owner's answer, because those are written as 'human'.
-- Now each is one function the reports read (the Reports lenses spec, A3, A4, A6), and first_replies returns the
-- hold each answer waited (messages.meta.delay_ms, stamped as the reply is queued), so a report can say how fast
-- the receptionist was apart from the hold the owner set (A1). first_replies' columns change, so it is dropped and
-- made again; report_series and metrics_summary call it by name at run time and read it as before.

create or replace function public.call_connected(p_status text, p_duration_ms integer)
returns boolean
language sql
immutable
set search_path = public
as $$
  -- Someone spoke: the call is under way or ended, or it errored after it had a length.
  select coalesce(p_status in ('ongoing', 'ended') or (p_status = 'error' and coalesce(p_duration_ms, 0) > 0), false)
$$;

revoke all on function public.call_connected(text, integer) from public, anon;
grant execute on function public.call_connected(text, integer) to authenticated, service_role;

create or replace function public.contact_first_moments(p_tenant_id uuid)
returns table (contact_id uuid, first_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  -- Each person's first word or connected call, whichever came first. Absent: the erased (a deletion is never
  -- growth, 00026), a person whose history was imported (no true first moment), and a person with neither (00254).
  select c.id as contact_id, f.first_at
    from contacts c
   cross join lateral (
     select least(
       (select min(m.channel_ts) from messages m where m.contact_id = c.id),
       (select min(k.started_at) from calls k
         where k.contact_id = c.id and public.call_connected(k.status, k.duration_ms))
     ) as first_at
   ) f
   where c.tenant_id = p_tenant_id
     and c.erased_at is null
     and f.first_at is not null
     and not exists (select 1 from messages b
                      where b.contact_id = c.id
                        and coalesce(b.meta->>'backfill', 'false') = 'true')
$$;

revoke all on function public.contact_first_moments(uuid) from public, anon;
grant execute on function public.contact_first_moments(uuid) to authenticated, service_role;

drop function if exists public.first_replies(uuid, timestamptz);

create function public.first_replies(p_tenant_id uuid, p_start timestamptz)
returns table (
  asked_at        timestamptz,
  conversation_id uuid,
  ai_at           timestamptz,
  human_at        timestamptz,
  who             text,
  ai_seconds      numeric,
  ai_hold_s       numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  asks as (
    select m.created_at as asked_at, m.conversation_id
      from real_msgs m
     where m.created_at >= p_start
       and m.direction = 'inbound' and m.sender = 'customer'
  ),
  -- when each outbound row actually LEFT: the send event for the queued path, the row itself for an immediate send
  sent as not materialized (
    select o.id, o.conversation_id, o.sender, o.created_at,
           coalesce((select min(e.created_at) from events e
                      where e.tenant_id = p_tenant_id
                        and e.kind = 'message.sent'
                        and e.subject_type = 'message'
                        and e.subject_id = o.id), o.created_at) as sent_at,
           -- the hold the owner set, as the reply was queued (draft-queue.ts); none for a reply sent at once
           case when jsonb_typeof(o.meta->'delay_ms') = 'number'
                then (o.meta->>'delay_ms')::numeric / 1000.0 else 0 end as hold_s,
           -- written as 'human' and nobody's answer (00285)
           coalesce(o.meta->>'source', '') in ('broadcast', 'reach_out') as automated
      from real_msgs o
     where o.direction = 'outbound'
       and o.status in ('sent', 'delivered', 'read')
  ),
  firsts as (
    select a.asked_at, a.conversation_id, ai.sent_at as ai_at, ai.hold_s,
           (select min(s.sent_at) from sent s
             where s.conversation_id = a.conversation_id and s.sender = 'human' and not s.automated
               and s.created_at > a.asked_at) as human_at
      from asks a
      left join lateral (
        select s.sent_at, s.hold_s from sent s
         where s.conversation_id = a.conversation_id and s.sender = 'ai' and s.created_at > a.asked_at
         order by s.sent_at
         limit 1
      ) ai on true
  )
  select asked_at, conversation_id, ai_at, human_at,
         case when ai_at is not null and (human_at is null or ai_at <= human_at) then 'ai'
              when human_at is not null then 'you'
              else 'none' end as who,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then extract(epoch from (ai_at - asked_at)) end as ai_seconds,
         case when ai_at is not null and (human_at is null or ai_at <= human_at)
              then hold_s end as ai_hold_s
    from firsts
$$;

revoke all on function public.first_replies(uuid, timestamptz) from public, anon;
grant execute on function public.first_replies(uuid, timestamptz) to authenticated, service_role;
```

Check the one other reader of the function's columns before going on: `grep -n "first_replies" supabase/migrations/00277_*.sql packages/db/src/repositories/ingest.ts`. 00277's `platform_metrics_roll` reads it through a lateral join by column name (unchanged columns keep their names); the `ingest.ts` hit is a comment. Neither changes.

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase migration up` (local stack only), then `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/report-answers.db.test.mjs`
Expected: PASS (3 tests). Also run `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/report-series.db.test.mjs` and `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/today/a-person-who-never-wrote-is-not-new.db.test.mjs`: both PASS unchanged (report_series and metrics_summary still read first_replies by name).

- [ ] **Step 5: Stage**

```bash
git add supabase/migrations/00285_a_connected_call_a_first_moment_and_an_answer_are_each_said_once.sql tooling/scripts/tests/reports/report-answers.db.test.mjs
```

---

### Task 5: A report counts only what it says (migration 00286)

**Files:**
- Create: `supabase/migrations/00286_a_report_counts_only_what_it_says.sql`
- Create: `tooling/scripts/tests/reports/report-counts.db.test.mjs`
- Modify: `tooling/scripts/tests/reports/report-series.db.test.mjs:133-134`
- Regenerate: `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md`

**Interfaces:**
- Consumes: `call_connected`, `contact_first_moments`, `first_replies.ai_hold_s` (Task 4).
- Produces: `report_series(p_tenant_id, p_days)` returns everything it returned, except `channels.*.instagram`, plus `replies[].hold` (seconds, rounded) and `arrivals: [{ d: "YYYY-MM-DD", q: 0..95, n }]` (this period's customer messages and connected calls by local day and quarter hour). `out_you` and `answered_you` no longer count automated sends; `calls`, `call_seconds`, `voicemail`, `sentiments` and the hours count connected calls only; `new_contacts` leaves the erased out. `metrics_summary` counts `calls`, `messages_out_you` and `new_contacts` by the same rules.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/reports/report-counts.db.test.mjs`:

```js
/**
 * 00286 on a real Postgres, in a zone that is not UTC: report_series and metrics_summary count only what they say.
 * A broadcast is not "you"; a call that errored before anyone spoke is not a call; an erased person is not new, and
 * Reports and Today agree on who is; each reply carries its hold; and arrivals say each message and call by the local
 * day and quarter hour. Runs against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine"
      : false;

const ZONE = "America/New_York";
let db;
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * 60_000);
const plus = (d, s) => new Date(d.getTime() + s * 1000).toISOString();
/** The day and quarter hour an instant falls in on the tenant's clock. */
function local(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { d: `${p.year}-${p.month}-${p.day}`, q: Number(p.hour) * 4 + Math.floor(Number(p.minute) / 15) };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-counts-${Date.now()}`, name: "Harbor Counts", timezone: ZONE })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

test("Reports and Today count only what they say", { skip }, async () => {
  const mk = async (phone, over = {}) => {
    const c = ok(await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: phone, display_name: "Harbor Guest", ...over }).select("id").single());
    const v = ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: c.id, state: "open", last_message_at: ago(1).toISOString() }).select("id").single());
    return { contact: c.id, conv: v.id };
  };
  const msg = (p, over) => ({ tenant_id: tenantId, conversation_id: p.conv, contact_id: p.contact, channel: "whatsapp", type: "text", body: "hi", meta: {}, ...over });
  const a = await mk("+15550138101");
  const b = await mk("+15550138102");
  const gone = await mk("+15550138103", { erased_at: new Date().toISOString() });
  const askA = ago(300);
  const askB = ago(200);
  const askGone = ago(100);
  ok(
    await db.from("messages").insert([
      msg(a, { direction: "inbound", sender: "customer", status: "received", created_at: askA.toISOString() }),
      msg(a, { direction: "outbound", sender: "ai", status: "sent", body: "hello", created_at: plus(askA, 61), meta: { source: "veto_window", delay_ms: 60000 } }),
      msg(b, { direction: "inbound", sender: "customer", status: "received", created_at: askB.toISOString() }),
      msg(b, { direction: "outbound", sender: "human", status: "sent", body: "Offer", created_at: plus(askB, 20), meta: { source: "broadcast" } }),
      msg(b, { direction: "outbound", sender: "human", status: "sent", body: "Saturday works", created_at: plus(askB, 600) }),
      msg(gone, { direction: "inbound", sender: "customer", status: "received", created_at: askGone.toISOString() }),
    ]),
  );
  const callOk = ago(50);
  ok(
    await db.from("calls").insert([
      { tenant_id: tenantId, retell_call_id: `cnt-${Date.now()}-a`, contact_id: a.contact, status: "ended", started_at: callOk.toISOString(), duration_ms: 60_000 },
      { tenant_id: tenantId, retell_call_id: `cnt-${Date.now()}-b`, contact_id: a.contact, status: "error", started_at: ago(40).toISOString(), duration_ms: 0 },
    ]),
  );

  const r = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 7 }));
  const now = r.series.slice(-7);
  const sum = (k) => now.reduce((s, d) => s + d[k], 0);

  assert.equal(sum("answered_ai"), 1);
  assert.equal(sum("answered_you"), 1, "the owner's reply; the broadcast before it answered nobody");
  assert.equal(sum("out_you"), 1, "the broadcast is not the owner's send");
  assert.equal(sum("calls"), 1, "the call that errored before anyone spoke is not a call");
  assert.equal(sum("new_contacts"), 2, "a and b; the erased person is not new");
  assert.deepEqual(r.replies.map((x) => [x.s, x.hold]), [[61, 60]]);
  assert.equal("instagram" in r.channels.current, false);

  const want = new Map();
  for (const t of [askA, askB, askGone, callOk]) {
    const k = local(t);
    const key = `${k.d}|${k.q}`;
    want.set(key, (want.get(key) ?? 0) + 1);
  }
  const got = new Map(r.arrivals.map((x) => [`${x.d}|${x.q}`, x.n]));
  assert.deepEqual(got, want, "each message and connected call by its local day and quarter hour");

  const m = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 7 }));
  assert.equal(m.period.new_contacts, sum("new_contacts"), "Reports and Today say the same people are new");
  assert.equal(m.period.calls, 1);
  assert.equal(m.period.messages_out_you, 1);
  assert.equal(m.period.answered_by_you, 1);
});
```

In `tooling/scripts/tests/reports/report-series.db.test.mjs`, change lines 133-134 to:

```js
  assert.deepEqual(r.channels.current, { whatsapp: 2, sms: 1, email: 1, voice: 1 });
  assert.deepEqual(r.channels.previous, { whatsapp: 0, sms: 0, email: 0, voice: 0 });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/report-counts.db.test.mjs`
Expected: FAIL — `answered_you` is 0 or 2 and `out_you` is 2 (the broadcast counted), `r.replies[0].hold` is undefined, and `r.arrivals` is undefined.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00286_a_report_counts_only_what_it_says.sql`. Part one is `report_series`, whole:

```sql
-- 00286 · A report counts only what it says.
--
-- Reports and Today said things their numbers did not hold (the Reports lenses spec, §12): a broadcast's, a
-- playbook's and a reach-out's sends counted as the owner's; a call that errored before anyone spoke counted as a
-- call; an erased person was new on Reports though not on Today; and Reports listed an Instagram channel the messages
-- CHECK cannot admit. Both functions now read 00285's rules (call_connected, contact_first_moments, first_replies).
-- report_series also returns each reply's hold, and when each message and connected call came in by local day and
-- quarter hour (arrivals), so the page counts what came while the business was closed by its own hours (contracts'
-- openAt), never 8 to 8. Each function is copied from its latest migration (00251, 00254) with only those changes;
-- only the bodies change, so `create or replace` takes them and the grants stand; they are restated.

create or replace function public.report_series(p_tenant_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz     text;
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_span   integer;
  v_today  date;
  v_start  timestamptz;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  v_start := ((v_today - (v_span - 1))::timestamp) at time zone v_tz;

  with days as (
    select (v_today - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  -- NOT MATERIALIZED (00037): same reason as in metrics_summary.
  real_msgs as not materialized (
    select * from messages
     where tenant_id = p_tenant_id
       and coalesce(meta->>'backfill', 'false') <> 'true'
  ),
  msgs as (
    select m.*, (m.created_at at time zone v_tz)::date as day
      from real_msgs m
     where m.created_at >= v_start
  ),
  inbound as (select * from msgs where direction = 'inbound' and sender = 'customer'),
  out_sent as (
    select * from msgs
     where direction = 'outbound' and status in ('sent', 'delivered', 'read')
  ),
  -- ONE definition of "who answered" and "how fast", shared with metrics_summary (00035, 00285).
  answered as (
    select r.*, (r.asked_at at time zone v_tz)::date as day
      from public.first_replies(p_tenant_id, v_start) r
  ),
  -- A call someone spoke on (00285).
  calls_w as (
    select k.*, (k.started_at at time zone v_tz)::date as day
      from calls k
     where k.tenant_id = p_tenant_id and k.started_at >= v_start
       and public.call_connected(k.status, k.duration_ms)
  ),
  escs as (
    select e.*, (e.created_at at time zone v_tz)::date as day
      from escalations e
     where e.tenant_id = p_tenant_id and e.created_at >= v_start
  ),
  -- Each person's first moment, one rule with metrics_summary (00285).
  fresh as (
    select (f.first_at at time zone v_tz)::date as day
      from public.contact_first_moments(p_tenant_id) f
     where f.first_at >= v_start
  ),
  per_day as (
    select d.day,
           coalesce(i.messages_in, 0)   as messages_in,
           coalesce(i.conversations, 0) as conversations,
           coalesce(a.answered_ai, 0)   as answered_ai,
           coalesce(a.answered_you, 0)  as answered_you,
           coalesce(a.unanswered, 0)    as unanswered,
           coalesce(o.out_ai, 0)        as out_ai,
           coalesce(o.out_you, 0)       as out_you,
           coalesce(e.escalations, 0)   as escalations,
           coalesce(k.calls, 0)         as calls,
           coalesce(k.call_seconds, 0)  as call_seconds,
           coalesce(f.new_contacts, 0)  as new_contacts
      from days d
      left join (select i.day, count(*) as messages_in, count(distinct i.conversation_id) as conversations
                   from inbound i group by i.day) i on i.day = d.day
      left join (select a.day,
                        count(*) filter (where a.who = 'ai')   as answered_ai,
                        count(*) filter (where a.who = 'you')  as answered_you,
                        count(*) filter (where a.who = 'none') as unanswered
                   from answered a group by a.day) a on a.day = d.day
      left join (select o.day,
                        count(*) filter (where o.sender = 'ai') as out_ai,
                        -- the owner's own sends; a broadcast's, a playbook's or a reach-out's are not (00286)
                        count(*) filter (where o.sender = 'human'
                                           and coalesce(o.meta->>'source', '') not in ('broadcast', 'reach_out')) as out_you
                   from out_sent o group by o.day) o on o.day = d.day
      left join (select e.day, count(*) as escalations from escs e group by e.day) e on e.day = d.day
      left join (select k.day, count(*) as calls, round(sum(k.duration_ms) / 1000.0) as call_seconds
                   from calls_w k group by k.day) k on k.day = d.day
      left join (select f.day, count(*) as new_contacts from fresh f group by f.day) f on f.day = d.day
  ),
  -- When people reached the business this period, on the tenant's clock: one source for the hours and the arrivals.
  arrivals_now as (
    select (i.created_at at time zone v_tz) as t from inbound i where i.day > v_today - v_days
    union all
    select (k.started_at at time zone v_tz) as t from calls_w k where k.day > v_today - v_days
  ),
  hour_counts as (
    select extract(isodow from x.t)::int as dow, extract(hour from x.t)::int as hr, count(*)::int as n
      from arrivals_now x
     group by 1, 2
  ),
  hour_grid as (
    select d.dow, jsonb_agg(coalesce(hc.n, 0) order by h.hr) as cells
      from generate_series(1, 7) as d(dow)
     cross join generate_series(0, 23) as h(hr)
      left join hour_counts hc on hc.dow = d.dow and hc.hr = h.hr
     group by d.dow
  ),
  -- 00286: each local day and quarter hour something came in, for the page's while-you-were-closed (openAt).
  arrival_counts as (
    select to_char(x.t::date, 'YYYY-MM-DD') as d,
           (extract(hour from x.t)::int * 4 + floor(extract(minute from x.t) / 15)::int) as q,
           count(*)::int as n
      from arrivals_now x
     group by 1, 2
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'series', (select jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day, 'YYYY-MM-DD'),
                 'messages_in', p.messages_in,
                 'conversations', p.conversations,
                 'answered_ai', p.answered_ai,
                 'answered_you', p.answered_you,
                 'unanswered', p.unanswered,
                 'out_ai', p.out_ai,
                 'out_you', p.out_you,
                 'escalations', p.escalations,
                 'calls', p.calls,
                 'call_seconds', p.call_seconds,
                 'new_contacts', p.new_contacts) order by p.day)
                from per_day p),
    'reasons', coalesce((select jsonb_object_agg(reason, n) from (
                 select reason, count(*) as n from escs
                  where day > v_today - v_days
                  group by reason) r), '{}'::jsonb),
    'reply_seconds', coalesce((select jsonb_agg(round(ai_seconds)) from answered
                                where day > v_today - v_days and ai_seconds is not null), '[]'::jsonb),
    'sentiments', coalesce((select jsonb_object_agg(coalesce(sentiment, 'Unknown'), n) from (
                    select sentiment, count(*) as n from calls_w
                     where day > v_today - v_days
                     group by sentiment) s), '{}'::jsonb),
    'voicemail', (select count(*) from calls_w where day > v_today - v_days and in_voicemail),
    'replies', coalesce((select jsonb_agg(jsonb_build_object(
                                  'day', to_char(a.day, 'YYYY-MM-DD'),
                                  's', round(a.ai_seconds),
                                  'hold', round(coalesce(a.ai_hold_s, 0)))
                                order by a.asked_at)
                           from answered a
                          where a.day > v_today - v_days and a.ai_seconds is not null), '[]'::jsonb),
    'channels', jsonb_build_object(
      'current', jsonb_build_object(
        'whatsapp', (select count(*) from inbound i where i.day > v_today - v_days and i.channel = 'whatsapp'),
        'sms',      (select count(*) from inbound i where i.day > v_today - v_days and i.channel = 'sms'),
        'email',    (select count(*) from inbound i where i.day > v_today - v_days and i.channel = 'email'),
        'voice',    (select count(*) from calls_w k where k.day > v_today - v_days)),
      'previous', jsonb_build_object(
        'whatsapp', (select count(*) from inbound i where i.day <= v_today - v_days and i.channel = 'whatsapp'),
        'sms',      (select count(*) from inbound i where i.day <= v_today - v_days and i.channel = 'sms'),
        'email',    (select count(*) from inbound i where i.day <= v_today - v_days and i.channel = 'email'),
        'voice',    (select count(*) from calls_w k where k.day <= v_today - v_days))),
    'hours', (select jsonb_agg(g.cells order by g.dow) from hour_grid g),
    'arrivals', coalesce((select jsonb_agg(jsonb_build_object('d', a.d, 'q', a.q, 'n', a.n) order by a.d, a.q)
                            from arrival_counts a), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.report_series(uuid, integer) from public, anon;
grant execute on function public.report_series(uuid, integer) to authenticated;
```

Part two is `metrics_summary`. Append to the same file the function exactly as `supabase/migrations/00254_a_person_who_never_wrote_or_phoned_is_not_new.sql` has it, from the line `create or replace function public.metrics_summary(p_tenant_id uuid, p_days integer default 1)` through its `end $$;`, followed by its two grant lines (00254:167-168), with exactly these three replacements:

(a) the `calls_win` block

```sql
  calls_win as (
    select * from calls where tenant_id = p_tenant_id and started_at >= v_start
       and status <> 'not_connected'   -- ADDED (00031): a dial that never connected is not a call
  ),
```

becomes

```sql
  calls_win as (
    select * from calls where tenant_id = p_tenant_id and started_at >= v_start
       and public.call_connected(status, duration_ms)   -- 00286: a call someone spoke on, one rule with Reports (00285)
  ),
```

(b) the whole `fresh_contacts` block (from `fresh_contacts as (` to its closing `),`) becomes

```sql
  -- Each person's first moment, one rule with report_series (00285): never the erased, never a person with neither.
  fresh_contacts as (
    select f.contact_id as id
      from public.contact_first_moments(p_tenant_id) f
     where f.first_at >= v_start
  ),
```

(c) the line

```sql
      'messages_out_you', (select count(*) from out_sent where sender = 'human'),
```

becomes

```sql
      'messages_out_you', (select count(*) from out_sent where sender = 'human'
                             and coalesce(meta->>'source', '') not in ('broadcast', 'reach_out')),
```

Confirm nothing else differs: `diff <(sed -n '/create or replace function public.metrics_summary/,/^end \$\$;/p' supabase/migrations/00254_a_person_who_never_wrote_or_phoned_is_not_new.sql) <(sed -n '/create or replace function public.metrics_summary/,/^end \$\$;/p' supabase/migrations/00286_a_report_counts_only_what_it_says.sql)` shows only the three hunks.

- [ ] **Step 4: Apply, regenerate and run the tests**

Run, in order:
1. `npx supabase migration up`
2. `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/report-counts.db.test.mjs` — Expected: PASS.
3. `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/report-series.db.test.mjs` — Expected: PASS.
4. `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/reports/report-days.db.test.mjs` — Expected: PASS.
5. `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/today/a-person-who-never-wrote-is-not-new.db.test.mjs` — Expected: PASS.
6. `node tooling/scripts/checks/migration-ledger.mjs --record`
7. `corepack pnpm gen:db-types`, `corepack pnpm gen:schema-snapshot`, `corepack pnpm gen:data-model`
8. `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs` and `node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migration-ledger.test.mjs` — Expected: PASS.

- [ ] **Step 5: Stage**

```bash
git add supabase/migrations/00286_a_report_counts_only_what_it_says.sql supabase/migrations-ledger.json supabase/schema.sql packages/db/src/database.types.ts docs/data-model.md tooling/scripts/tests/reports/report-counts.db.test.mjs tooling/scripts/tests/reports/report-series.db.test.mjs
```

---

### Task 6: Reply speed said against the hold

**Files:**
- Modify: `packages/contracts/src/reports/reports.ts` (`ReportDto.replies`, `REPLY_BUCKETS` and `replyTimeOf` at :303-309 and :676-690, `ReportVM.replyTime`, `linesOf` at :721-745)
- Modify: `packages/contracts/src/reports/index.ts` (export `holdOf`, `HOLD_SLACK_S`, `ReportHoldVM`)
- Create: `tooling/scripts/tests/reports/reports-hold.test.mjs`

**Interfaces:**
- Consumes: `durationWords` (Task 1); `replies[].hold` (Task 5).
- Produces: `ReportDto.replies?: { day: string; s: number; hold?: number }[]`; `HOLD_SLACK_S = 10`; `interface ReportHoldVM { seconds: number; label: string; atEnd: number; sooner: number; later: number; laterMost: number | null }`; `holdOf(replies: ReportDto["replies"]): ReportHoldVM | null`; `ReportVM.replyTime.hold: ReportHoldVM | null`.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/reports-hold.test.mjs`:

```js
/**
 * Reply speed is said against the hold the owner set (spec D14, A1). Every reply waited the workspace's 60-second hold,
 * so "half within 1m 00s" and "nine in ten within 1m 00s" sat beside bars that put 14 of 16 in "1 - 5m". Now each
 * reply is measured from its own hold, and the bars count on the edges the words use.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toReportVM, holdOf } from "@chanlytics/contracts";

const day = (d, over = {}) => ({
  day: d,
  messages_in: 0,
  conversations: 0,
  answered_ai: 0,
  answered_you: 0,
  unanswered: 0,
  out_ai: 0,
  out_you: 0,
  escalations: 0,
  calls: 0,
  call_seconds: 0,
  new_contacts: 0,
  ...over,
});
const days7 = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
const salon = [
  ...Array.from({ length: 13 }, () => ({ day: "2026-09-17", s: 60, hold: 60 })),
  { day: "2026-09-17", s: 72, hold: 60 },
  { day: "2026-09-18", s: 6, hold: 0 },
  { day: "2026-09-18", s: 6, hold: 0 },
];
const dto = (replies) => ({
  timezone: "America/New_York",
  days: 7,
  span_days: 14,
  today: "2026-09-20",
  series: [
    ...days7.map((d) => day(d.replace("-09-", "-08-"))),
    ...days7.map((d, i) => day(d, i === 3 ? { messages_in: 25, answered_ai: 16, answered_you: 3, unanswered: 6 } : {})),
  ],
  reasons: {},
  reply_seconds: replies.map((r) => r.s),
  sentiments: {},
  voicemail: 0,
  replies,
});

test("each reply against its own hold: as it ended, sooner (no hold), and later with the most past it", () => {
  assert.deepEqual(holdOf(salon), { seconds: 60, label: "1-minute", atEnd: 13, sooner: 2, later: 1, laterMost: 12 });
});

test("the hero and the reply line say the hold, not a speed the setting made", () => {
  const vm = toReportVM(dto(salon));
  assert.equal(vm.lines.hero, "16 of 25 customer messages, without you. 13 of 16 went out as your 1-minute hold ended.");
  assert.equal(vm.lines.reply, "1 reply took longer than the hold, at most 12s more.");
  assert.deepEqual(vm.replyTime.hold, holdOf(salon));
});

test("none past the hold says so, and says the ones sent sooner", () => {
  const vm = toReportVM(dto(salon.filter((r) => r.s !== 72)));
  assert.equal(vm.lines.reply, "None waited longer than your hold; 2 went sooner.");
});

test("a hold changed mid-period: the label is the hold most replies waited, and the counts stay true", () => {
  const mixed = [
    { day: "2026-09-17", s: 31, hold: 30 },
    { day: "2026-09-17", s: 30, hold: 30 },
    { day: "2026-09-18", s: 61, hold: 60 },
  ];
  assert.deepEqual(holdOf(mixed), { seconds: 30, label: "30-second", atEnd: 3, sooner: 0, later: 0, laterMost: null });
});

test("a report from before the hold was kept says what it said before, on the words' own edges", () => {
  const old = salon.map(({ day: d, s }) => ({ day: d, s }));
  const vm = toReportVM(dto(old));
  assert.equal(vm.replyTime.hold, null);
  assert.equal(vm.lines.hero, "16 of 25 customer messages, without you. Half of its replies went out within 1m.");
  assert.equal(vm.lines.reply, "Nine in ten within 1m.");
  assert.deepEqual(
    vm.replyTime.buckets.map((b) => [b.id, b.value]),
    [
      ["lt15", 2],
      ["lt60", 13],
      ["lt300", 1],
      ["lt1800", 0],
      ["gte1800", 0],
    ],
    "a reply of exactly 60s is within a minute, as the sentence beside it says",
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm --filter "./packages/*" build` then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-hold.test.mjs`
Expected: FAIL — `holdOf is not a function`.

- [ ] **Step 3: Implement**

In `packages/contracts/src/reports/reports.ts`:

1. Change the `replies` member of `ReportDto` (line 62) to:

```ts
  /** v3 (00139): each receptionist first reply this period, with the day it was asked (tenant zone); 00286 adds the
   *  hold it waited in seconds (0: sent at once). Absent on a report from before 00286. */
  replies?: { day: string; s: number; hold?: number }[];
```

2. Add `hold: ReportHoldVM | null;` as the last member of `ReportVM.replyTime` (after `buckets: ReportBarVM[];`).

3. Replace `REPLY_BUCKETS` (lines 303-309) with:

```ts
/** Each bucket's last second, inclusive, on the same rounded seconds the words say: a reply of 60s is "within 1m". */
const REPLY_BUCKETS: { id: string; label: string; max: number }[] = [
  { id: "lt15", label: "under 15s", max: 14 },
  { id: "lt60", label: "15s – 1m", max: 60 },
  { id: "lt300", label: "1 – 5m", max: 300 },
  { id: "lt1800", label: "5 – 30m", max: 1800 },
  { id: "gte1800", label: "over 30m", max: Infinity },
];
```

4. Add, after `REPLY_BUCKETS`:

```ts
/** A reply that went out within this many seconds past its hold went out as the hold ended: the queue's own tick. */
export const HOLD_SLACK_S = 10;

/** The replies measured against the hold each waited (spec D14). */
export interface ReportHoldVM {
  /** The hold most replies waited, in seconds, and in words ("1-minute"): the owner's own setting as each was queued. */
  seconds: number;
  label: string;
  /** As the hold ended; sooner (sent with no hold); later, with the most any took past its hold. */
  atEnd: number;
  sooner: number;
  later: number;
  laterMost: number | null;
}

/** "30-second", "1-minute", "1m 30s": a hold said as the setting is. */
const holdWords = (s: number): string =>
  s < 60 ? `${s}-second` : s % 60 === 0 && s < 3600 ? `${s / 60}-minute` : durationWords(s);

/**
 * Each reply against its own hold. Null where the payload carries no hold at all (a report from before 00286) or no
 * reply waited one: the sentences then say speed as they did.
 */
export function holdOf(replies: ReportDto["replies"]): ReportHoldVM | null {
  const rs = (replies ?? []).filter((r) => Number.isFinite(r.s));
  if (!rs.some((r) => r.hold !== undefined)) return null;
  const held = rs.filter((r) => (r.hold ?? 0) > 0);
  if (!held.length) return null;
  const counts = new Map<number, number>();
  for (const r of held) counts.set(r.hold as number, (counts.get(r.hold as number) ?? 0) + 1);
  const seconds = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const past = held.map((r) => r.s - (r.hold as number)).filter((p) => p > HOLD_SLACK_S);
  return {
    seconds,
    label: holdWords(seconds),
    atEnd: held.length - past.length,
    sooner: rs.length - held.length,
    later: past.length,
    laterMost: past.length ? Math.max(...past) : null,
  };
}
```

5. Replace `replyTimeOf` (lines 676-690) with:

```ts
/** The receptionist's reply times: how many, the median and the slowest tenth, how many in each span, and the hold. */
function replyTimeOf({ dto, sortedReply, median, p90 }: PeriodFacts): ReportVM["replyTime"] {
  const bucketCounts = REPLY_BUCKETS.map((b, i) => {
    const lo = i === 0 ? -Infinity : REPLY_BUCKETS[i - 1].max;
    const n = sortedReply.filter((s) => {
      const r = Math.round(s);
      return r > lo && r <= b.max;
    }).length;
    return [b.id, b.label, n] as [string, string, number];
  });
  return {
    count: sortedReply.length,
    median,
    p90,
    medianLabel: fmtSeconds(median),
    p90Label: fmtSeconds(p90),
    buckets: bars(bucketCounts),
    hold: holdOf(dto.replies),
  };
}
```

6. In `linesOf`, replace the `hero:` and `reply:` members (lines 727-740) with calls to two new functions, and add those functions above `linesOf`:

```ts
/** How fast, beside the hero: against the hold where replies waited one, since the setting is not the receptionist's speed. */
function heroSpeed({ sortedReply, median }: PeriodFacts, hold: ReportHoldVM | null): string {
  if (!sortedReply.length) return "";
  if (hold && hold.atEnd > 0) return ` ${hold.atEnd} of ${sortedReply.length} went out as your ${hold.label} hold ended.`;
  return ` Half of its replies went out within ${fmtSeconds(median)}.`;
}

/** The line under the speed chart: what took longer than the hold, or, with no hold, the slowest tenth. */
function replyLine({ sortedReply, p90 }: PeriodFacts, hold: ReportHoldVM | null): string | null {
  if (hold) {
    if (hold.later)
      return `${hold.later} ${hold.later === 1 ? "reply" : "replies"} took longer than the hold, at most ${fmtSeconds(hold.laterMost)} more.`;
    return hold.sooner
      ? `None waited longer than your hold; ${hold.sooner} went sooner.`
      : "None waited longer than your hold.";
  }
  // Nine in ten is a claim about a tenth: under ten replies it would be a guess, so the slowest one is said instead.
  if (sortedReply.length >= 10) return `Nine in ten within ${fmtSeconds(p90)}.`;
  return sortedReply.length ? `The slowest took ${fmtSeconds(sortedReply[sortedReply.length - 1])}.` : null;
}
```

and in `linesOf`:

```ts
  const hold = holdOf(f.dto.replies);
  return {
    hero: answeredTotal
      ? `${tot.ai} of ${answeredTotal} customer messages, without you.${heroSpeed(f, hold)}`
      : "No customer wrote in this period.",
    heroBefore: prevAnsweredTotal
      ? `${Math.round((prev.ai / prevAnsweredTotal) * 100)}% the ${rangeLabel} before`
      : null,
    answered: busiestDay ? `Most messages on ${busiestDay.label}: ${busiestDay.in}.` : null,
    reply: replyLine(f, hold),
    calls: tot.calls ? `About ${fmtSeconds(tot.callSeconds / tot.calls)} a call.` : null,
    channels: channelsLine(channels, rangeLabel),
    rhythm: rhythmLine(week),
  };
```

(The destructuring at the top of `linesOf` no longer needs `sortedReply`, `median` and `p90`; remove them so lint stays clean.)

7. In `packages/contracts/src/reports/index.ts`, add `holdOf`, `HOLD_SLACK_S` and `type ReportHoldVM` to the export list beside `toReportVM`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build`, then each of `reports-hold.test.mjs`, `reports-vm.test.mjs`, `reports-lines.test.mjs`, `reports-page.test.mjs`, `reports-sample.test.mjs`, `reports-honest.test.mjs` under `tooling/scripts/tests/reports/` with `node tooling/scripts/checks/test.mjs <file>`.
Expected: PASS. The fixtures there carry no `hold`, so their sentences are unchanged; `reports-vm`'s buckets `[4, 8, 12, 15, 40, 70, 400, 2000]` count the same on the new edges.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports/reports.ts packages/contracts/src/reports/index.ts tooling/scripts/tests/reports/reports-hold.test.mjs
git add packages/contracts tooling/scripts/tests/reports/reports-hold.test.mjs
```

---

### Task 7: What came while the business was closed, by its own hours

**Files:**
- Modify: `packages/contracts/src/reports/reports.ts` (`ReportDto`, `ReportHoursVM` at :141-150, `hoursOf` at :363-378, `toReportVM` at :748)
- Modify: `packages/contracts/src/reports/report-facts.ts:56-70`
- Modify: `packages/contracts/src/reports/index.ts`
- Create: `tooling/scripts/tests/reports/reports-closed.test.mjs`
- Modify: `tooling/scripts/tests/reports/reports-where-when.test.mjs:203-220`, `tooling/scripts/tests/reports/report-facts.test.mjs:119-128`, `tooling/scripts/tests/reports/reports-page.test.mjs:333`

**Interfaces:**
- Consumes: `openAt`, `hasHours` (Task 3); `arrivals` (Task 5).
- Produces: `interface ReportArrivalDto { d: string; q: number; n: number }`; `ReportDto.arrivals?: ReportArrivalDto[]`; `interface ReportProfile { hours?: Record<string, Hours | undefined>; closures?: Closure[] }`; `closedOf(arrivals: ReportDto["arrivals"], profile: ReportProfile | null | undefined): number | null`; `ReportHoursVM.closed: number | null` (replaces `outside`); `hoursOf(grid, closed = null)`; `toReportVM(dto: ReportDto, opts: { profile?: ReportProfile | null } = {}): ReportVM`.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/reports-closed.test.mjs`:

```js
/**
 * What came while the business was closed is counted by the workspace's own hours and closures (spec D16, A2),
 * each quarter hour asked the one question (openAt). Without hours, or from a report that has no arrivals, nothing is
 * said: never a guess at 8 to 8. 14 Sep 2026 is a Monday.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { closedOf, reportFacts, toReportVM } from "@chanlytics/contracts";

const profile = {
  hours: {
    mon: { open: "09:30", close: "18:00" },
    tue: { open: "09:30", close: "18:00" },
    wed: { open: "09:30", close: "18:00" },
    thu: { open: "09:30", close: "18:00" },
    fri: { open: "09:30", close: "19:00" },
    sat: { open: "09:30", close: "19:00" },
  },
  closures: [{ date: "2026-09-18" }],
};
const q = (h, m = 0) => h * 4 + Math.floor(m / 15);
const arrivals = [
  { d: "2026-09-14", q: q(9, 20), n: 1 }, // Monday 9:15-9:30, before opening: closed
  { d: "2026-09-14", q: q(9, 30), n: 2 }, // open
  { d: "2026-09-16", q: q(21), n: 7 }, // Wednesday evening: closed
  { d: "2026-09-18", q: q(12), n: 3 }, // Friday, a closure: closed
  { d: "2026-09-20", q: q(11), n: 1 }, // Sunday, no hours: closed
];

test("each quarter hour against the workspace's own hours and closures", () => {
  assert.equal(closedOf(arrivals, profile), 12);
});

test("no hours said, no profile, or no arrivals: nothing is counted", () => {
  assert.equal(closedOf(arrivals, { hours: {} }), null);
  assert.equal(closedOf(arrivals, null), null);
  assert.equal(closedOf(undefined, profile), null, "a report from before 00286");
});

const day = (d, over = {}) => ({
  day: d,
  messages_in: 0,
  conversations: 0,
  answered_ai: 0,
  answered_you: 0,
  unanswered: 0,
  out_ai: 0,
  out_you: 0,
  escalations: 0,
  calls: 0,
  call_seconds: 0,
  new_contacts: 0,
  ...over,
});
const days7 = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
const hours = Array.from({ length: 7 }, () => Array(24).fill(0));
hours[2][21] = 7;
hours[0][9] = 3;
const dto = {
  timezone: "America/New_York",
  days: 7,
  span_days: 14,
  today: "2026-09-20",
  series: [...days7.map((d) => day(d.replace("-09-", "-08-"))), ...days7.map((d, i) => day(d, i === 2 ? { messages_in: 10 } : {}))],
  reasons: {},
  reply_seconds: [],
  sentiments: {},
  voicemail: 0,
  hours,
  arrivals,
};

test("the busiest day's line says what came while the business was closed, and nothing without hours", () => {
  const withHours = reportFacts(toReportVM(dto, { profile }), null).find((f) => f.id === "busiest");
  assert.match(withHours.sub, /12 while you were closed$/);
  const without = reportFacts(toReportVM(dto), null).find((f) => f.id === "busiest");
  assert.doesNotMatch(without.sub, /closed|8am/);
  assert.equal(toReportVM(dto).hours.closed, null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm --filter "./packages/*" build` then `node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/reports-closed.test.mjs`
Expected: FAIL — `closedOf is not a function`.

- [ ] **Step 3: Implement**

In `packages/contracts/src/reports/reports.ts`:

1. Add with the imports:

```ts
import { hasHours, openAt } from "../calendar/availability";
import type { Closure, Hours } from "../config/workspace-config/business-profile";
```

2. Before `ReportDto`, add:

```ts
/** When something came in, on the business's clock: a day ("2026-09-17"), its quarter hour (0..95) and how many (00286). */
export interface ReportArrivalDto {
  d: string;
  q: number;
  n: number;
}

/** The hours and closures a workspace keeps on its profile (config.brain.profile), as the report reads them. */
export interface ReportProfile {
  hours?: Record<string, Hours | undefined>;
  closures?: Closure[];
}
```

and add to `ReportDto`, after `hours?`:

```ts
  /** 00286: this period's customer messages and connected calls by local day and quarter hour. */
  arrivals?: ReportArrivalDto[];
```

3. Replace `ReportHoursVM`'s `outside` member (lines 146-147) with:

```ts
  /** How many came while the business was closed by its own hours and closures (closedOf); null where the workspace
   *  has not said its hours or the report has no arrivals. Never 8 to 8. */
  closed: number | null;
```

4. Add `closedOf` above `hoursOf`, and replace `hoursOf` (lines 363-378) with:

```ts
/**
 * How many came while the business was closed by its own hours and closures, each quarter hour asked the one
 * question (openAt). Null where the workspace has not said its hours, or the payload has no arrivals (a report from
 * before 00286).
 */
export function closedOf(arrivals: ReportDto["arrivals"], profile: ReportProfile | null | undefined): number | null {
  if (!arrivals || !profile || !hasHours(profile.hours)) return null;
  return arrivals.reduce((s, a) => s + (openAt(profile.hours, profile.closures, a.d, a.q * 15) ? 0 : a.n), 0);
}

/** The hours of the day, the period summed; the busiest two-hour window's first hour (the earliest on a tie); and
 *  what came while closed, as closedOf counted it. Null without v3's grid. */
export function hoursOf(grid: readonly (readonly number[])[] | undefined, closed: number | null = null): ReportHoursVM | null {
  if (!grid || !grid.length) return null;
  const values = Array.from({ length: 24 }, (_, h) => grid.reduce((s, row) => s + (Number(row?.[h]) || 0), 0));
  const total = values.reduce((a, b) => a + b, 0);
  let peak: number | null = null;
  if (total > 0) {
    peak = 0;
    for (let h = 1; h < 23; h++) if (values[h] + values[h + 1] > values[peak] + values[peak + 1]) peak = h;
  }
  return { values, peak, closed, labels: values.map((_, h) => reportHourWords(h)) };
}
```

5. Change `toReportVM`'s signature and its `hours:` member:

```ts
/** The Reports page's view model: a builder per part, over the facts counted once. `profile` is the workspace's hours
 *  and closures, which the while-you-were-closed count needs; without it that count is not said. */
export function toReportVM(dto: ReportDto, opts: { profile?: ReportProfile | null } = {}): ReportVM {
```

```ts
    hours: hoursOf(dto.hours, closedOf(dto.arrivals, opts.profile)),
```

6. In `packages/contracts/src/reports/report-facts.ts`, replace the `outside` line (line 60) and its use with:

```ts
    const closed = h && h.closed ? `${h.closed} while you were closed` : "";
```

and `sub: [peak, closed].filter(Boolean).join(", "),`.

7. In `packages/contracts/src/reports/index.ts`, export `closedOf`, `type ReportArrivalDto` and `type ReportProfile`.

8. Update the three tests that pinned 8 to 8:
   - `reports-where-when.test.mjs` (the test at :203-220): delete the two `outside` assertions and the "before 8am or from 8pm" words from its title; add `assert.equal(h.closed, null, "no profile: nothing said");`.
   - `report-facts.test.mjs:127`: the expected sub becomes `"peak 5pm to 7pm"`; rename the test to "the one busiest day, with the peak hours; a week is said as days".
   - `reports-page.test.mjs:333`: the expected text becomes `"Tuesday was your busiest daypeak 10am to 12pm"`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter "./packages/*" build`, then each of `reports-closed.test.mjs`, `reports-where-when.test.mjs`, `report-facts.test.mjs`, `reports-page.test.mjs`, `reports-sample.test.mjs` under `tooling/scripts/tests/reports/`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write packages/contracts/src/reports tooling/scripts/tests/reports/reports-closed.test.mjs tooling/scripts/tests/reports/reports-where-when.test.mjs tooling/scripts/tests/reports/report-facts.test.mjs tooling/scripts/tests/reports/reports-page.test.mjs
git add packages/contracts tooling/scripts/tests/reports
```

---

### Task 8: The reader hands the workspace's hours to the page and to Ask

**Files:**
- Modify: `apps/dashboard/src/server/readers/report.ts:20-66`
- Modify: `apps/dashboard/src/surfaces/reports/surface.ts:121`
- Modify: `apps/dashboard/src/server/ask/context/pages.ts:36`
- Modify: `apps/dashboard/src/server/ask/tools/read/report.ts:17`
- Modify: `tooling/scripts/tests/ask/readers.test.mjs` (the reports block, ~lines 1484-1600)

**Interfaces:**
- Consumes: `ReportProfile`, `toReportVM(dto, { profile })` (Task 7); `parseTenantConfigResult(raw)` from `@chanlytics/contracts` (`packages/contracts/src/config/workspace-config/config-schema.ts:248`, the parser `readSettings` wraps, without its log line).
- Produces: the `report` reader's data, and so `GET /api/v1/reports`, gains a fourth key, `profile: ReportProfile | null`, after `deals`.

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/ask/readers.test.mjs`, in the test "the reports, for Ask and for the page: GET reports answers its reader's payload…" (~line 1540), change the expected keys to:

```js
    assert.deepEqual(
      Object.keys(r.data),
      ["report", "booking", "deals", "profile"],
      "the keys in the order the route answered them",
    );
```

and after that test add:

```js
test("the report reader hands the workspace's hours and closures beside the report, from the config the booking line read; none said, null", async () => {
  const hours = { mon: { open: "09:30", close: "18:00" } };
  const closures = [{ date: "2026-09-18" }];
  const kept = presetsWorld();
  kept.tables.tenant_config = [{ tenant_id: A, config: { brain: { profile: { hours, closures } } }, version: 1 }];
  const ctx = worldCtx(kept);
  const r = await kernel.load(turnIn(ctx), reportReader, { days: 30 });
  assert.deepEqual(r.data.profile, { hours, closures });
  assert.equal(
    asked(ctx).filter((q) => q === "tenant_config.select").length,
    1,
    "the config is read once in the turn: the booking line's read, not a second",
  );
  const none = await kernel.load(turnIn(worldCtx(presetsWorld())), reportReader, { days: 30 });
  assert.equal(none.data.profile, null, "no profile: the page says nothing about closed");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/readers.test.mjs`
Expected: FAIL — the keys are `["report", "booking", "deals"]` and `r.data.profile` is `undefined`.

- [ ] **Step 3: Implement**

In `apps/dashboard/src/server/readers/report.ts`:

1. Import `parseTenantConfigResult` and `type ReportProfile` from `@chanlytics/contracts` with the others, and widen the reader's output type to `{ report: ReportDto; booking: BookingReportDto | null; deals: DealReportDto | null; profile: ReportProfile | null }`.

2. After the `deals` are read and before the `return`, add (it must come after the deals: `readers.test.mjs` pins the order of every read, and the booking line has already loaded the config into the turn, so this adds none):

```ts
    // The workspace's hours and closures, which Reports' while-you-were-closed counts against (spec A2): the turn's
    // config, which the booking line above already read, parsed as the calendar parses it, without its log line.
    const profile: ReportProfile | null = await load(rc, facts.config, undefined)
      .then((s) => {
        const parsed = parseTenantConfigResult(s.data?.config ?? null);
        const kept = parsed.ok ? parsed.config.brain?.profile : undefined;
        return kept && (kept.hours || kept.closures) ? { hours: kept.hours, closures: kept.closures } : null;
      })
      .catch(() => null);
```

3. Return `data: { report, booking, deals, profile }`.

In `apps/dashboard/src/surfaces/reports/surface.ts:121`: `const vm = toReportVM(data.report, { profile: data.profile });`
In `apps/dashboard/src/server/ask/context/pages.ts:36`: `const vm = toReportVM(r.report, { profile: r.profile });`
In `apps/dashboard/src/server/ask/tools/read/report.ts:17`: `const vm = toReportVM(r.data.report, { profile: r.data.profile });`

Regenerate the typed client: `node tooling/scripts/gen/route-types.mjs`, then `node tooling/scripts/gen/route-types.mjs --check`.

- [ ] **Step 4: Run the tests and the type check**

Run: `corepack pnpm --filter "./packages/*" build`, `corepack pnpm -r typecheck`, then, one per command: `tooling/scripts/tests/ask/readers.test.mjs`, `tooling/scripts/tests/reports/reports-page.test.mjs`, `tooling/scripts/tests/reports/reports-seam.test.mjs`, and every Ask test that reads the report (`grep -rln "tools/read/report\|context/pages" tooling/scripts/tests/ask`).
Expected: PASS; typecheck clean. The test "GET reports through its reader asks what it asked at origin/main, in its order" passes unchanged: the profile adds no read.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write apps/dashboard/src/server/readers/report.ts apps/dashboard/src/surfaces/reports/surface.ts apps/dashboard/src/server/ask/context/pages.ts apps/dashboard/src/server/ask/tools/read/report.ts tooling/scripts/tests/ask/readers.test.mjs
git add apps/dashboard packages tooling/scripts/tests/ask/readers.test.mjs
```

---

### Task 9: Prove it, on the checks and on the page (with Ruben's go-ahead for the build)

**Files:** none new.

- [ ] **Step 1: The checks CI runs, locally, file by file**

Run: `corepack pnpm --filter "./packages/*" build`, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `git status --short packages/*/dist` (every rebuilt dist file is staged), and the code-health ratchets: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs`.
Expected: clean. A ratchet that only fell is banked with `UPDATE_BASELINES=1` on that file's command; one that rose is a defect in this change, fixed here (`reports.ts` stays under 800 lines: split `holdOf` and `closedOf` into `packages/contracts/src/reports/report-speed.ts` and `report-closed.ts` if it crosses).

- [ ] **Step 2: Every test this phase touched, once more**

Run each, one per command: `shared/duration-words`, `calendar/open-at`, `reports/reports-hold`, `reports/reports-closed`, `reports/reports-vm`, `reports/reports-lines`, `reports/reports-where-when`, `reports/report-facts`, `reports/reports-page`, `reports/reports-sample`, `reports/reports-honest`, `reports/reports-seam`, `ask/readers`, `today/today-vm` (all `.test.mjs` under `tooling/scripts/tests/`), and with the local stack the four `--db` files from Tasks 4-5.
Expected: PASS.

- [ ] **Step 3: See the page (after Ruben says to run it)**

Ask Ruben before starting a server. The local app reads the production database, where 00285-00286 are not applied, so it shows the fallbacks: today's sentences without "outside 8am to 8pm", "1m" instead of "1m 00s", "Text", and no Instagram. That proves the old-SQL path. The new sentences are proved by the view-model and database tests. On Ruben's word, run the worktree's own dev server (`corepack pnpm --filter @chanlytics/dashboard dev` on a free port through `.claude/launch.json`), open `/w/<slug>/reports` signed in, and screenshot the hero, Worth knowing and "How fast it answers", desk and phone.

- [ ] **Step 4: Hand back**

Tell Ruben what changed for a customer, in his words: the four numbers, the words, and the two migrations to apply (`00285`, `00286`; either deploy order works: the page falls back until they run). Everything stays staged and uncommitted until he says to commit.
