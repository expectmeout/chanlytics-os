# First Credentialed Nightly — Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the seven failures from the first nightly that actually ran, fixing the four stale specs outright and turning the two undiagnosed failures into self-diagnosing ones before any product code is touched.

**Architecture:** Four of the seven are assertions that drifted while nobody ran them, and each is fixed by deriving from the source of truth instead of a copied literal. The remaining three (one billing, one calendar, and the leftover workspace behind the count) are not yet understood, so this plan does not guess at fixes: it makes each failure carry the evidence needed to fix it on the next run, then acts on that evidence in Task 7 along a decision tree whose branches are all written out.

**Tech Stack:** Node 22 `node:test` with `tsx`, Playwright against production, Supabase/PostgREST, pnpm workspaces. Tests live in `tooling/scripts/tests/*.test.mjs` (node) and `e2e/*.spec.ts` (browser).

---

## Background: what the run reported

Run [34274028660](https://github.com/expectmeout/chanlytics-os/actions/runs/34274028660), the first with the four `E2E_*` secrets present.

| Suite | Result |
|---|---|
| node (`pnpm test`) | 1088 tests, 1085 pass, **3 fail**, 0 skipped |
| browser (`pnpm e2e`) | 128 specs, 123 pass, **4 fail**, 1 skipped |

Before the secrets, the node integration half ran nowhere and the browser suite ran 24 of 128. These seven failures are the first output those 165 tests have ever produced.

| # | Where | Symptom | Cause |
|---|---|---|---|
| 1–3 | `provisioning.integration.test.mjs:56,91,103` | `7 !== 6` | Stale literal: `POLICY_CLASSES` grew to seven when the `reviews` autonomy class landed |
| 4 | `sidebar.spec.ts:26` | expected `billing@rjcapital.io` | Spec hardcodes an address; the account is whatever `E2E_USER_EMAIL` holds |
| 5 | `workspace-create.spec.ts` | `toHaveCount(2)` got 3 | Spec pins an absolute count; the account has a leftover **Billing probe** workspace |
| 6 | `billing.spec.ts:55` | status 400, expected one of 403/409/503 | **Unknown.** The route's own mapping cannot produce 400 |
| 7 | `calendar.spec.ts:109` | status 400, expected 200 | **Unknown value.** Three layers disagree about what a phone number is |

### The disagreement behind failure 7

| Layer | Rule |
|---|---|
| `contacts.phone_e164` (`00002_conversations.sql:31`) | `text` — **no constraint at all** |
| `normalizePhone` (`packages/contracts/src/phone.ts:10`) | 8–15 digits; exactly 10 becomes `+1…` |
| `create_person` (`00053_calendar_people_sweep.sql`) | `^\+[1-9][0-9]{7,14}$` — no leading zero |

Ingest writes through the loosest rule and the create door reads through the strictest, so the product can hold a number it will then refuse to accept, telling the owner "A phone number is needed to add a person" about a number printed on their own screen. Which stored value trips it is not knowable from the source; Task 6 makes the spec name it.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `tooling/scripts/tests/policy-matrix.test.mjs` | Pins the autonomy classes by value and forbids a copied count in the provisioning suite. Runs without credentials, so it gates every PR. | **Create** |
| `tooling/scripts/tests/provisioning.integration.test.mjs` | Proves a new tenant is born configurable. | Modify: derive the count from `POLICY_CLASSES` |
| `e2e/sidebar.spec.ts` | The sidebar's chrome on a real workspace. | Modify: assert the configured account, not a literal |
| `e2e/workspace-create.spec.ts` | A second workspace from the menu, then cleaned up. | Modify: count relatively |
| `e2e/billing.spec.ts` | Billing's states on a real workspace. | Modify: carry the response body into the failure |
| `e2e/calendar.spec.ts` | The calendar board and get-or-create. | Modify: name the offending number in the failure |
| `packages/contracts/src/phone.ts` | The one rule for what a phone number is. | Modify in Task 7, branch A or B only |
| `tooling/scripts/tests/phone.test.mjs` | The rule's own test. **Does not exist today** — its absence is why the rule drifted. | Create in Task 7, branch A or B |
| `supabase/migrations/00078_*.sql` | Reconciling the stored column with the rule. | Create in Task 7, branch C only |

---

## Task 1: Stop the policy matrix count going stale again

**Files:**
- Create: `tooling/scripts/tests/policy-matrix.test.mjs`
- Modify: `tooling/scripts/tests/provisioning.integration.test.mjs:56,91,103` and its imports

Two guards, because the literal `6` was only ever wrong in a file nobody ran. The new test runs on every PR with no credentials, so the next class addition fails fast.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/policy-matrix.test.mjs`:

```javascript
/**
 * The autonomy matrix, pinned — and the rule that nothing may copy its size.
 *
 * `provisioning.integration.test.mjs` asserted the matrix had six rows in
 * three places. It grew to seven when the `reviews` class landed, and the
 * assertions stayed wrong for as long as they did because that suite needs
 * service credentials and so ran nowhere at all. A literal count copied out
 * of a list is a fact with no owner; this gives it one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICY_CLASSES } from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

test("the autonomy classes are pinned by value", () => {
  // BY VALUE: adding a class is a deliberate edit here, reviewed, because it
  // widens what the receptionist may decide on its own.
  assert.deepEqual([...POLICY_CLASSES], [
    "reply", "booking", "faq", "reengage", "campaign", "reviews", "money",
  ]);
});

test("nothing hardcodes the size of the matrix", () => {
  const src = readCode("tooling/scripts/tests/provisioning.integration.test.mjs");
  assert.ok(src.includes("POLICY_CLASSES"), "the provisioning suite must derive the count, not copy it");
  assert.ok(
    !/policies\.length,\s*\d/.test(src) && !/p\.length,\s*\d/.test(src),
    "a bare number here is the bug this test exists to prevent",
  );
});
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
node --import tsx --test tooling/scripts/tests/policy-matrix.test.mjs
```

Expected: the first test PASSES (the classes really are those seven); the second FAILS with `the provisioning suite must derive the count, not copy it`.

- [ ] **Step 3: Make the provisioning suite derive its count**

In `tooling/scripts/tests/provisioning.integration.test.mjs`, add the import beneath the existing ones:

```javascript
import { createClient } from "@supabase/supabase-js";
import { POLICY_CLASSES } from "@chanlytics/contracts";
```

Then replace all three assertions. Line 56:

```javascript
  assert.equal(policies.length, POLICY_CLASSES.length, `expected the full matrix, got ${policies.length}`);
```

Line 91:

```javascript
  assert.equal(policies.length, POLICY_CLASSES.length, "a second call duplicated the matrix");
```

Line 103:

```javascript
    assert.equal(p.length, POLICY_CLASSES.length, `${t.slug} has ${p.length} policy rows`);
```

- [ ] **Step 4: Run both to verify they pass**

```bash
node --import tsx --test tooling/scripts/tests/policy-matrix.test.mjs tooling/scripts/tests/provisioning.integration.test.mjs
```

Expected: `# fail 0`. The provisioning tests report as skipped without `SUPABASE_URL`; that is correct here — the nightly runs them for real.

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/tests/policy-matrix.test.mjs tooling/scripts/tests/provisioning.integration.test.mjs && git -c core.safecrlf=false commit -m "The matrix count comes from the list, not a copy of its length"
```

---

## Task 2: The sidebar asserts the account that is configured

**Files:**
- Modify: `e2e/sidebar.spec.ts:26`

The spec expects `billing@rjcapital.io`; the signed-in account is whatever `E2E_USER_EMAIL` holds, and the two differ. `session.ts` already reads that variable, so the spec can too.

- [ ] **Step 1: Replace the literal with the configured address**

At `e2e/sidebar.spec.ts:26`:

```javascript
      // The address the run signed in as, not a literal: session.ts mints the
      // session for E2E_USER_EMAIL, so anything else is a spec asserting a
      // different person than the one it logged in.
      await expect(me.getByTestId("sb-me")).toContainText(process.env.E2E_USER_EMAIL!);
```

- [ ] **Step 2: Run the spec**

```bash
corepack pnpm e2e -- sidebar.spec.ts
```

Expected without credentials: `1 skipped`. With them: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add e2e/sidebar.spec.ts && git -c core.safecrlf=false commit -m "The sidebar spec asserts the account it signed in as"
```

---

## Task 3: The workspace spec counts relatively

**Files:**
- Modify: `e2e/workspace-create.spec.ts` — the `toHaveCount(2)` assertion

The account owns more than one workspace today, and will own a different number tomorrow. What the spec means is "one more than before", and it already has the menu open at the right moment to learn that.

- [ ] **Step 1: Count before creating**

Replace the block that opens the menu and creates, so the count is taken while the menu is already open:

```javascript
      await page.getByTestId("sb-workspace").click();
      // How many there were, taken with the menu already open. An absolute
      // count assumed this account owned exactly one workspace; it owns as
      // many as it owns, and what this test means is "one more than before".
      const before = await page.getByTestId("sb-workspace-menu").getByTestId("sb-ws-item").count();
      await page.getByTestId("sb-ws-new").click();
```

- [ ] **Step 2: Assert one more**

Replace `await expect(items).toHaveCount(2);` with:

```javascript
      await expect(items).toHaveCount(before + 1);
```

- [ ] **Step 3: Run the spec**

```bash
corepack pnpm e2e -- workspace-create.spec.ts
```

Expected without credentials: `1 skipped`. With them: `1 passed`, and the probe workspace deleted by the existing `finally`.

- [ ] **Step 4: Commit**

```bash
git add e2e/workspace-create.spec.ts && git -c core.safecrlf=false commit -m "The workspace spec counts one more, not exactly two"
```

---

## Task 4: The billing refusal carries its body

**Files:**
- Modify: `e2e/billing.spec.ts:55`

The route's own mapping produces 409, 503 or 502 and never 400, so the observed 400 comes from somewhere this plan has not identified. The spec asserted only the status, so the body — which names the reason — was never printed. This does not fix the failure; it makes the next run explain it.

- [ ] **Step 1: Put the body in the assertion message**

Replace lines 54–57 of `e2e/billing.spec.ts`:

```javascript
    const res = await page.request.post("/api/v1/billing/checkout", { headers: { origin: baseURL!, "content-type": "application/json" }, data: {} });
    // The body, in the message. The route maps the edge's answer to 409, 503
    // or 502 and cannot produce 400, so a 400 means something upstream of the
    // handler refused — and a bare status assertion threw that away.
    const body = await res.json();
    expect([403, 409, 503], `checkout answered ${res.status()}: ${JSON.stringify(body)}`).toContain(res.status());
    expect(body.ok).toBe(false);
    if (res.status() === 409) expect(body.error.message).toContain("direct arrangement");
```

- [ ] **Step 2: Verify the file still parses**

```bash
corepack pnpm -r --if-present typecheck
```

Expected: `Done` for both apps, no errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/billing.spec.ts && git -c core.safecrlf=false commit -m "A refused checkout says what it answered"
```

---

## Task 5: The calendar failure names the number

**Files:**
- Modify: `e2e/calendar.spec.ts:107-111`

Which stored `phone_e164` the product refuses to re-accept is data-dependent and not knowable from source. The spec picks the first contact with a phone; make it say which one, and what the door said back.

- [ ] **Step 1: Carry the number and the reason into the failure**

Replace the `if (known)` block:

```javascript
    const known = before.find((p) => p.phone_e164);
    if (known) {
      const again = await page.request.post("/api/v1/contacts", { data: { phone: known.phone_e164, source: "calendar" }, ...fromTheApp });
      // The number, in the message. `contacts.phone_e164` has no constraint,
      // normalizePhone accepts 8-15 digits, and create_person demands
      // ^\+[1-9][0-9]{7,14}$ — three rules, so a number the product stored can
      // be one it then refuses. Which one it is decides where the fix goes.
      const againBody = await again.json();
      expect(again.status(), `re-adding ${known.phone_e164} answered ${again.status()}: ${JSON.stringify(againBody)}`).toBe(200);
      expect(againBody.data).toEqual({ contact_id: known.id, existed: true });
      const after = (await (await page.request.get("/api/v1/contacts")).json()).data.people as unknown[];
      expect(after.length, "an existing number adds nobody").toBe(before.length);
    }
```

- [ ] **Step 2: Verify the file still parses**

```bash
corepack pnpm -r --if-present typecheck
```

Expected: `Done` for both apps, no errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/calendar.spec.ts && git -c core.safecrlf=false commit -m "The get-or-create failure names the number it refused"
```

---

## Task 6: Ship Tasks 1–5 and re-run the nightly

**Files:** none — this task opens a pull request and reads a run.

- [ ] **Step 1: Run every gate locally**

```bash
corepack pnpm --filter "./packages/*" build && corepack pnpm -r --if-present typecheck && corepack pnpm test && corepack pnpm lint
```

Expected: packages build, both apps typecheck `Done`, `# fail 0` with 1090 tests, and `0 errors` with 23 warnings (the baseline).

- [ ] **Step 2: Confirm no dist drift**

```bash
git status --short -- packages
```

Expected: empty, or `packages/*/dist` changes that must be committed — CI fails on `git diff --exit-code -- packages/*/dist`.

- [ ] **Step 3: Open the pull request**

```bash
gh pr create --title "The four assertions that drifted while nobody ran them" --body "Four of the seven failures from the first credentialed nightly, plus two failures made self-diagnosing. Fixes: the matrix count now comes from POLICY_CLASSES; the sidebar asserts the account it signed in as; the workspace spec counts one more rather than exactly two. Diagnostics: the billing and calendar failures now carry their response bodies, so the next run explains itself."
```

- [ ] **Step 4: Merge once CI is green**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Re-run the nightly and read the two diagnostics**

```bash
gh workflow run nightly-e2e.yml --repo expectmeout/chanlytics-os
```

Expected: node `# fail 0`; browser down to two failures, each now printing the response body. **Record the exact `phone_e164` from the calendar failure and the exact body from the billing failure — Task 7 branches on them.**

---

## Task 7: Reconcile the three phone rules

**Files:** depends on the value recorded in Task 6, Step 5. All three branches are written out; take exactly one.

The rule this task establishes: **whatever the product stores, the product accepts.** Do not weaken `create_person` — its regex is correct E.164 and the money and consent paths depend on it.

### Branch A — the value has fewer than 8 digits (a short code, e.g. `+22395`)

`normalizePhone` returns `null`, so the route throws before the database is asked. A short code is a real sender that cannot be a person: it cannot receive a reply and has no owner.

- [ ] **Step A1: Write the failing test**

`normalizePhone` has no test file today — that absence is why it drifted. Create `tooling/scripts/tests/phone.test.mjs`:

```javascript
/**
 * What the product calls a phone number.
 *
 * `normalizePhone` had no test of its own, which is how it drifted apart from
 * `create_person`'s own rule (`^\+[1-9][0-9]{7,14}$`) without anyone noticing:
 * the app accepted shapes the database then refused, and the owner was told
 * "A phone number is needed to add a person" about a number on their screen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, shortCode } from "@chanlytics/contracts";

test("a short code is refused as a person, and said so by name", () => {
  assert.equal(normalizePhone("22395"), null, "five digits is a short code, not a person");
  assert.equal(shortCode("+22395"), true);
  assert.equal(shortCode("+15551234567"), false);
});
```

- [ ] **Step A2: Run it to verify it fails**

```bash
node --import tsx --test tooling/scripts/tests/phone.test.mjs
```

Expected: FAIL with `shortCode is not defined`.

- [ ] **Step A3: Add the predicate**

In `packages/contracts/src/phone.ts`:

```typescript
/** A short code — 3 to 7 digits — is a sender, never a person: nothing can reply to it. */
export function shortCode(e164: string | null | undefined): boolean {
  const digits = String(e164 ?? "").replace(/[^\d]/g, "");
  return digits.length >= 3 && digits.length <= 7;
}
```

- [ ] **Step A4: Say so at the door**

In `apps/dashboard/app/api/v1/contacts/route.ts`, replace the validation line:

```typescript
  const raw = typeof body?.phone === "string" ? body.phone : null;
  const phone = normalizePhone(raw);
  if (!phone) {
    throw new AppError("validation", shortCode(raw)
      ? "That is a short code, not a phone number — nobody can be reached on it."
      : "A phone number is needed to add a person.");
  }
```

Add `shortCode` to the existing `@chanlytics/contracts` import.

- [ ] **Step A5: Stop the calendar spec choosing one**

In `e2e/calendar.spec.ts`, narrow the pick:

```javascript
    const known = before.find((p) => p.phone_e164 && !shortCode(p.phone_e164));
```

Import `shortCode` from `@chanlytics/contracts` at the top of the spec.

- [ ] **Step A6: Run and commit**

```bash
corepack pnpm --filter "./packages/*" build && corepack pnpm test && git add -A && git -c core.safecrlf=false commit -m "A short code is a sender, not a person, and the door says so"
```

### Branch B — the value has 8–15 digits but starts with `+0`

`normalizePhone` accepts it and `create_person` rejects it, so the two rules disagree with each other. `normalizePhone` is the one that is wrong: no country code begins with zero.

- [ ] **Step B1: Write the failing test**

`normalizePhone` has no test file today — that absence is why it drifted. Create `tooling/scripts/tests/phone.test.mjs` (drop `shortCode` from the import; this branch does not add it):

```javascript
/**
 * What the product calls a phone number.
 *
 * `normalizePhone` had no test of its own, which is how it drifted apart from
 * `create_person`'s own rule (`^\+[1-9][0-9]{7,14}$`) without anyone noticing:
 * the app accepted shapes the database then refused, and the owner was told
 * "A phone number is needed to add a person" about a number on their screen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "@chanlytics/contracts";

test("no country code starts with zero, and normalizePhone agrees with the database", () => {
  assert.equal(normalizePhone("+012345678"), null, "the create_person regex refuses this; so must the app");
  assert.equal(normalizePhone("+15551234567"), "+15551234567");
  assert.equal(normalizePhone("5551234567"), "+15551234567");
});
```

- [ ] **Step B2: Run it to verify it fails**

```bash
node --import tsx --test tooling/scripts/tests/phone.test.mjs
```

Expected: FAIL — `normalizePhone("+012345678")` returns `'+012345678'`, not `null`.

- [ ] **Step B3: Make the app's rule match the database's**

In `packages/contracts/src/phone.ts`:

```typescript
export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  // The leading digit must not be zero: create_person's own rule is
  // ^\+[1-9][0-9]{7,14}$, and a looser rule here only moves the refusal from
  // a sentence the owner can act on to a database error they cannot.
  if (digits.length >= 8 && digits.length <= 15 && digits[0] !== "0") return `+${digits}`;
  return null;
}
```

- [ ] **Step B4: Run and commit**

```bash
corepack pnpm --filter "./packages/*" build && corepack pnpm test && git add -A && git -c core.safecrlf=false commit -m "The app's phone rule and the database's are one rule"
```

### Branch C — the value is malformed (no `+`, more than 15 digits, or not a number)

Then ingest stored something that is not a phone number, and the fix belongs at the write, not the read.

- [ ] **Step C1: Find every offending row**

Ruben runs this in the Supabase SQL editor; it writes nothing:

```sql
select tenant_id, id, phone_e164, first_seen_at
  from contacts
 where erased_at is null
   and (phone_e164 !~ '^\+[1-9][0-9]{7,14}$')
 order by first_seen_at desc;
```

- [ ] **Step C2: Write the failing test**

Create `tooling/scripts/tests/contacts.integration.test.mjs`, copying the credential gate verbatim from the top of `people.integration.test.mjs` (the `URL_` / `KEY` / `skip` triple and the `before` that builds `db`), then add:

```javascript
import { normalizePhone } from "@chanlytics/contracts";

test("every stored number is one the product would accept back", { skip }, async () => {
  const { data } = await db.from("contacts").select("id, phone_e164").is("erased_at", null).not("phone_e164", "is", null);
  const bad = (data ?? []).filter((c) => normalizePhone(c.phone_e164) !== c.phone_e164);
  assert.deepEqual(bad, [], "a number the product stored must be one it will re-accept");
});
```

- [ ] **Step C3: Run it to verify it fails**

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node --import tsx --test tooling/scripts/tests/contacts.integration.test.mjs
```

Expected: FAIL, listing the offending rows.

- [ ] **Step C4: Normalise on write and constrain the column**

Create `supabase/migrations/00078_contacts_phone_shape.sql`:

```sql
-- 00078 · A stored number is one the product will accept back.
--
-- contacts.phone_e164 was plain text with no constraint, so ingest could write
-- a shape create_person then refused — and "add this person" failed forever
-- for someone whose number was printed on the owner's own screen.

update contacts
   set phone_e164 = '+' || regexp_replace(phone_e164, '[^0-9]', '', 'g')
 where phone_e164 is not null
   and phone_e164 !~ '^\+'
   and regexp_replace(phone_e164, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{7,14}$';

alter table public.contacts
  add constraint contacts_phone_e164_shape
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
  not valid;
```

`not valid` so the constraint governs every future write without failing on rows the update could not repair; validate it once Step C1 returns no rows.

- [ ] **Step C5: Apply and verify**

```bash
~/AppData/Local/npm-cache/_npx/*/node_modules/.bin/supabase db push --linked -p "$PW"
```

Then re-run Step C3. Expected: PASS.

- [ ] **Step C6: Commit**

```bash
git add -A && git -c core.safecrlf=false commit -m "A stored number is one the product will accept back"
```

---

## Task 8: Clear the leftover probe workspace

**Files:** none — this is console work, and it is Ruben's.

The **Billing probe** workspace `ee0e86b7-6afc-4c12-b404-fcae14652205` was created during Stripe test-mode work and is the third workspace behind failure 5. Task 3 stops it breaking the spec, but it should still go before live Stripe keys, or it will appear in a real customer's workspace menu.

- [ ] **Step 1: Confirm it is the test-mode probe and nothing else**

```sql
select id, name, slug, created_at from tenants where id = 'ee0e86b7-6afc-4c12-b404-fcae14652205';
```

- [ ] **Step 2: Delete it**

Only after Step 1 confirms the name. `tenants` cascades to its policies and config.

```sql
delete from events where tenant_id = 'ee0e86b7-6afc-4c12-b404-fcae14652205';
delete from tenants where id = 'ee0e86b7-6afc-4c12-b404-fcae14652205';
```

---

## Task 9: Confirm the nightly is green and means it

**Files:** none.

- [ ] **Step 1: Trigger the run**

```bash
gh workflow run nightly-e2e.yml --repo expectmeout/chanlytics-os
```

- [ ] **Step 2: Read both step summaries**

```bash
gh run list --workflow=nightly-e2e.yml --limit 1 --json databaseId --jq '.[0].databaseId'
```

Then, with that id:

```bash
gh run view <id> --log | grep -E "# (tests|pass|fail|skipped)|passed|failed|skipped"
```

Expected: node `# fail 0` and `# skipped 0`; browser `0 failed`, `127 passed`, `1 skipped` — the one conditional skip inside `billing.spec.ts` for a card-paying workspace.

- [ ] **Step 3: Check the guards still bite**

A green run must not be green because the guards stopped working. Confirm both ran rather than skipped:

```bash
gh run view <id> --log | grep -E "a run that claims to cover Postgres|the signed-in half of this suite"
```

Expected: both named, neither reported as skipped.

---

## Self-Review

**Spec coverage.** All seven failures have a task: 1–3 in Task 1, 4 in Task 2, 5 in Task 3 and Task 8, 6 in Task 4, 7 in Task 5 then Task 7. The two undiagnosed ones are deliberately split into "make it explain itself" (Tasks 4–5) and "fix it" (Task 7), with the branch chosen by evidence from Task 6, Step 5.

**Placeholders.** None. Every branch of Task 7 is written out; no step says "handle the error case" without showing the code. The one genuinely unknown — which stored number is bad — is not guessed at; Task 5 makes the next run print it, and Task 7's three branches cover every shape it can be.

**Type consistency.** `shortCode` is defined in Task 7 Step A3 and used in A4 and A5 with the same signature. `POLICY_CLASSES` is imported in Task 1 Step 3 and asserted against in Step 1. `normalizePhone` keeps its signature in Branch B and is used unchanged in Branch C's test.

**Risk left standing.** Task 7 Branch C adds a `check` constraint to a live table. It is `not valid`, so it governs new writes without rejecting existing rows, and the repair `update` runs first. Ingest paths that write a malformed number will begin failing at the database rather than storing something the product refuses later — which is the intended change, but it is the one step in this plan that can make a write path throw where it previously succeeded. Land it on its own, not bundled with Tasks 1–5.
