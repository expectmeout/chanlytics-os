# First Credentialed Nightly — Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all seven failures from the first nightly that actually ran, and leave the suite unable to fail this way again.

**Architecture:** Six of the seven are test defects, and three of those are one defect: two specs write to the API without naming a workspace, which the server correctly refuses for an account holding more than one membership. The fix is to make the specs do what the real client already does. No product code changes and no migration.

**Tech Stack:** Node 22 `node:test` with `tsx`, Playwright against production, Supabase/PostgREST, pnpm workspaces.

**Shell:** every command below is **bash** (Git Bash on Windows). `until`, `$(...)` and glob expansion differ in PowerShell; run these in the Bash shell rather than translating them.

---

## Background

Run [34274028660](https://github.com/expectmeout/chanlytics-os/actions/runs/34274028660): node 1088 tests, 1085 pass, 3 fail, 0 skipped; browser 128 specs, 123 pass, 4 fail, 1 skipped. Before the `E2E_*` secrets existed the integration half ran nowhere and the browser suite ran 24 of 128.

| # | Where | Cause | Task |
|---|---|---|---|
| 1–3 | `provisioning.integration.test.mjs:56,91,103` | `POLICY_CLASSES` grew to seven with the `reviews` class; three literals still say six | 4 |
| 4 | `sidebar.spec.ts:26` **and `:41`** | A hardcoded email, and an absolute workspace count | 2 |
| 5 | `workspace-create.spec.ts:42` | An absolute workspace count | 3 |
| 6 | `billing.spec.ts:55` | **The ambiguity guard** | 1 |
| 7 | `calendar.spec.ts:109` | **The ambiguity guard** | 1 |

### Failures 6 and 7 are one cause, and it is not phone numbers

`memberContext` returns `ambiguous: !wanted && rows.length > 1` (`with-route.ts:162`). `requireRole` turns that into `AppError("validation", "This account belongs to more than one workspace — say which one before changing anything.")` (`with-route.ts:180-183`), which `DEFAULT_STATUS` maps to **400** (`errors.ts:40`). Both failing POSTs omit `?workspace=`, and both handlers pass `searchParams.get("workspace")` — null — into `memberContext` before calling `requireRole` (`billing/checkout/route.ts:13-14`, `contacts/route.ts:40-41`).

Three things prove it is this and nothing else:

- `/api/v1/ask` never calls `requireRole`, and `ask.spec.ts` fires eight unscoped writes that all pass.
- `steer.spec.ts:47` POSTs unscoped and passes, because `requireOperator(ctx, m.tenant_id)` forwards the **row's** tenant id as `wanted` (`verbs.ts:26`), so `ambiguous` is false by construction. The two specs that failed are exactly the two whose write resolves the workspace from the *caller*.
- In `calendar.spec.ts` the deliberately-bad phone at `:104` still returns its expected 400, because `normalizePhone` runs at `contacts/route.ts:36` — before `memberContext` at `:40`. The phone layer is reached; the workspace layer is what refuses.

The real client never has this problem: `scoped()` (`surface-data.ts:113-116`) appends `?workspace=` to every URL, and its own comment records this exact bug being fixed once already — *"the verb courier fetched its URLs verbatim, so every mutation arrived with no workspace named."* The specs bypass `scoped()` by calling `page.request` directly.

### What is deliberately NOT in this plan

An earlier draft proposed reconciling `normalizePhone` with `create_person` and adding a CHECK constraint to `contacts.phone_e164`. That work targeted a cause the source rules out, and each branch was independently dangerous:

- `normalizePhone` has five call sites across both runtimes. At `retell-inbound.ts:96` a null return skips `readLeadContext`, so a caller who texted that morning meets a receptionist with no memory of them. At `forwarding.ts:140` a null `dest` **skips the guard entirely**, marking a line verified by the wrong call. At `retell-fn.ts:75` `const target = asked ?? caller` turns a refusal into a text sent to the caller instead of the number they gave.
- A CHECK constraint is enforced on every INSERT **and UPDATE** even when added `NOT VALID`, and three writers of that column never call `normalizePhone` — `persist.ts:102` builds `` `+${digits}` `` by hand. On WhatsApp and SMS the violation is swallowed and the customer's message is discarded with a 200 to Meta.

Two genuine issues survive from that work and are filed separately as Task 8, neither urgent.

---

## Task 1: The specs name their workspace, as the app does

**Files:**
- Create: `e2e/workspace.ts`
- Modify: `e2e/billing.spec.ts:52-57`, `e2e/calendar.spec.ts:101-115`
- Modify: `tooling/scripts/tests/e2e-shape.test.mjs` (create if absent)

Closes failures 6 and 7, and stops the class recurring the day the account legitimately owns two workspaces — which self-serve sign-up makes ordinary.

- [ ] **Step 1: Write the failing guard test**

Create `tooling/scripts/tests/e2e-shape.test.mjs`:

```javascript
/**
 * A spec that writes must name its workspace, because the app does.
 *
 * `scoped()` (apps/dashboard/src/legacy-bridge/surface-data.ts:113) appends
 * ?workspace= to every URL the client fetches, and its comment records this
 * bug being fixed there once already. Specs that call page.request directly
 * skip that, so they test something the product never does — and the server's
 * ambiguity guard (with-route.ts:180) refuses them with a 400 the moment the
 * account holds a second membership.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readCode } from "./_source.mjs";

const SPECS = fs.readdirSync(path.join(ROOT, "e2e")).filter((f) => f.endsWith(".spec.ts"));

test("every direct write in the e2e suite names a workspace", () => {
  const offenders = [];
  for (const f of SPECS) {
    const src = readCode(`e2e/${f}`);
    for (const line of src.split("\n")) {
      if (!/request\.(post|patch|put|delete)\(/.test(line)) continue;
      // Absolved: an absolute URL to the edge (its own auth), a route that
      // takes the workspace from the row it names, and anything already scoped.
      if (line.includes("workspace=") || line.includes("https://")) continue;
      if (/\/(messages|conversations)\//.test(line)) continue;
      offenders.push(`${f}: ${line.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [], "these writes would 400 for an account with two workspaces");
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node --import tsx --test tooling/scripts/tests/e2e-shape.test.mjs
```

Expected: FAIL, listing `billing.spec.ts` and `calendar.spec.ts` among the offenders. `ask.spec.ts` will also appear — that is correct and Step 5 handles it.

- [ ] **Step 3: Add the helper**

Create `e2e/workspace.ts`:

```typescript
import type { Page } from "@playwright/test";

/**
 * The active workspace id, and a URL that names it.
 *
 * The mirror of scoped() in apps/dashboard/src/legacy-bridge/surface-data.ts:
 * the client appends ?workspace= to everything it fetches, so a spec that
 * calls page.request directly must too, or it is exercising a request the
 * product never makes. Without it, requireRole refuses every write from an
 * account holding more than one membership, with a 400 that reads as a
 * validation error and has nothing to do with the thing being tested.
 */
export async function activeWorkspace(page: Page): Promise<string> {
  const { data } = await (await page.request.get("/api/v1/workspaces")).json();
  const id = data.activeWorkspaceId ?? data.workspaces?.[0]?.id;
  if (!id) throw new Error("no workspace for this account");
  return id;
}

/** `scoped()`'s rule, with the id passed in rather than read from window. */
export function scoped(url: string, workspaceId: string): string {
  if (url.includes("workspace=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(workspaceId)}`;
}
```

- [ ] **Step 4: Scope the billing write**

In `e2e/billing.spec.ts`, add `import { activeWorkspace, scoped } from "./workspace";` beside the existing imports, then replace lines 52–57:

```typescript
  test("Checkout is refused for a direct arrangement, and says so", async ({ page, baseURL }) => {
    const { data } = await (await page.request.get("/api/v1/billing")).json();
    test.skip(data.billing.account.mode !== "direct", "the live workspace pays by card; the refusal is for direct arrangements");
    const ws = await activeWorkspace(page);
    const res = await page.request.post(scoped("/api/v1/billing/checkout", ws), { headers: { origin: baseURL!, "content-type": "application/json" }, data: {} });
    const body = await res.json();
    // The body in the message: a bare status assertion threw away the one
    // sentence that says which refusal this was.
    expect([403, 409, 503], `checkout answered ${res.status()}: ${JSON.stringify(body)}`).toContain(res.status());
    expect(body.ok).toBe(false);
    if (res.status() === 409) expect(body.error.message).toContain("direct arrangement");
  });
```

- [ ] **Step 5: Scope the calendar writes**

In `e2e/calendar.spec.ts`, add the same import, then replace the `get-or-create` test body (lines 101–115):

```typescript
  test("adding a person from an appointment is get-or-create: an existing number returns them, a bad one is refused, nothing is duplicated", async ({ page }) => {
    const ws = await activeWorkspace(page);
    const before = (await (await page.request.get("/api/v1/contacts")).json()).data.people as Array<{ id: string; phone_e164: string | null }>;
    const bad = await page.request.post(scoped("/api/v1/contacts", ws), { data: { phone: "not a number", source: "calendar" }, ...fromTheApp });
    expect(bad.status()).toBe(400);
    expect(((await bad.json()).error?.message ?? "") as string).toContain("phone");
    const known = before.find((p) => p.phone_e164);
    if (known) {
      const again = await page.request.post(scoped("/api/v1/contacts", ws), { data: { phone: known.phone_e164, source: "calendar" }, ...fromTheApp });
      const body = await again.json();
      // The status and the reason, never the number: this message reaches the
      // GitHub Actions run log, which is not the seven-day artifact the
      // workflow deliberately confines a real workspace's data to.
      expect(again.status(), `re-adding a stored number answered ${again.status()}: ${JSON.stringify(body.error ?? {})}`).toBe(200);
      expect(body.data).toEqual({ contact_id: known.id, existed: true });
      const after = (await (await page.request.get("/api/v1/contacts")).json()).data.people as unknown[];
      expect(after.length, "an existing number adds nobody").toBe(before.length);
    }
  });
```

- [ ] **Step 6: Scope the remaining offenders the guard names**

Run the guard again and apply the same two-line treatment — `const ws = await activeWorkspace(page);` and `scoped(url, ws)` — to every spec it still lists. `ask.spec.ts` is the expected remainder.

```bash
node --import tsx --test tooling/scripts/tests/e2e-shape.test.mjs
```

Expected: PASS, offenders empty.

- [ ] **Step 7: Commit**

```bash
git add e2e/workspace.ts e2e/billing.spec.ts e2e/calendar.spec.ts e2e/ask.spec.ts tooling/scripts/tests/e2e-shape.test.mjs && git -c core.safecrlf=false commit -m "A spec that writes names its workspace, as the app does"
```

---

## Task 2: The sidebar spec stops assuming one workspace

**Files:**
- Modify: `e2e/sidebar.spec.ts:26`, `:41-43`

Line 26 is the failure that was reported. Line 41 is `toHaveCount(1)` — a stricter version of the same assumption, masked only because line 26 failed first. Fixing one without the other buys a red run either way.

- [ ] **Step 1: The account it signed in as**

Line 26:

```typescript
      // The address this run signed in as, not a literal: session.ts mints the
      // session for E2E_USER_EMAIL, and asserting anything else is a spec
      // checking a different person than the one it logged in.
      await expect(me.getByTestId("sb-me")).toContainText(process.env.E2E_USER_EMAIL!);
```

- [ ] **Step 2: However many workspaces there are**

Lines 41–43:

```typescript
      const items = ws.getByTestId("sb-ws-item");
      // At least one, and the active one is checked. An absolute count assumed
      // this account owned exactly one workspace; self-serve sign-up makes a
      // second one ordinary, and workspace-create.spec.ts makes one on purpose.
      await expect(items.first()).toBeVisible();
      const checked = items.filter({ has: page.locator('[aria-checked="true"]') }).or(items.and(page.locator('[aria-checked="true"]')));
      await expect(checked).toHaveCount(1);
      await expect(items.filter({ hasText: "Owner" }).first()).toBeVisible();
```

- [ ] **Step 3: Run it**

```bash
corepack pnpm e2e -- sidebar.spec.ts
```

Expected credential-free: `1 skipped`.

- [ ] **Step 4: Commit**

```bash
git add e2e/sidebar.spec.ts && git -c core.safecrlf=false commit -m "The sidebar spec stops assuming one workspace"
```

---

## Task 3: The workspace spec counts one more, and waits for the menu

**Files:**
- Modify: `e2e/workspace-create.spec.ts:31-42`

- [ ] **Step 1: Take the baseline with an auto-waiting read in front of it**

After `await page.getByTestId("sb-workspace").click();`:

```typescript
      const menu = page.getByTestId("sb-workspace-menu");
      // toBeVisible first: count() is the one Playwright read that does NOT
      // retry, and sidebar.jsx:201 falls back to [] until __WORKSPACES lands —
      // so a bare count() here yields 0 and turns a deterministic failure into
      // an intermittent one.
      await expect(menu.getByTestId("sb-ws-item").first()).toBeVisible();
      const before = await menu.getByTestId("sb-ws-item").count();
      await page.getByTestId("sb-ws-new").click();
```

- [ ] **Step 2: Assert one more**

Replace `await expect(items).toHaveCount(2);` with:

```typescript
      await expect(items).toHaveCount(before + 1);
```

- [ ] **Step 3: Commit**

```bash
git add e2e/workspace-create.spec.ts && git -c core.safecrlf=false commit -m "The workspace spec counts one more, after the menu has drawn"
```

---

## Task 4: The matrix count comes from the list

**Files:**
- Modify: `tooling/scripts/tests/provisioning.integration.test.mjs`

Three lines. No new test file: `enums-vs-checks.test.mjs:119` already asserts `deepEqual(sqlSet("class"), [...POLICY_CLASSES].sort())` credential-free on every PR, so a third copy of that pin would make adding a class a three-file edit for no extra safety.

- [ ] **Step 1: Import the list**

Beneath the existing imports:

```javascript
import { POLICY_CLASSES } from "@chanlytics/contracts";
```

- [ ] **Step 2: Assert the classes, not the count, at line 56**

`byClass` is already built one line above from the `class` column, so the set is free — and it catches a missing, extra or renamed class, which a count cannot:

```javascript
  assert.deepEqual(Object.keys(byClass).sort(), [...POLICY_CLASSES].sort(), "the matrix must hold exactly the classes contracts declares");
```

- [ ] **Step 3: Lines 91 and 103**

```javascript
  assert.equal(policies.length, POLICY_CLASSES.length, "a second call duplicated the matrix");
```

```javascript
    assert.equal(p.length, POLICY_CLASSES.length, `${t.slug} has ${p.length} policy rows`);
```

- [ ] **Step 4: Run**

```bash
node --import tsx --test tooling/scripts/tests/provisioning.integration.test.mjs
```

Expected: skipped without `SUPABASE_URL`, which is correct — the nightly runs it for real.

- [ ] **Step 5: Commit**

```bash
git add tooling/scripts/tests/provisioning.integration.test.mjs && git -c core.safecrlf=false commit -m "The matrix assertion names the classes, not their number"
```

---

## Task 5: A red nightly reaches a person, and silence stops reading as success

**Files:**
- Modify: `.github/workflows/nightly-e2e.yml`
- Modify: `e2e/coverage.spec.ts`

The defect that produced this plan was a green light that meant nothing. Restoring its meaning while leaving nobody looking at it is half a fix — and the data-shaped version of the same defect is still live: 27 of the 28 conditional skips in `e2e/` are gated on the live workspace's **data**, so a quiet month at the salon can gut the suite and still exit 0.

- [ ] **Step 1: One run at a time, and tell somebody when it breaks**

In `.github/workflows/nightly-e2e.yml`, after `on:`:

```yaml
# One at a time. workspace-create.spec.ts really creates and deletes a tenant,
# retries: 2 means up to three per run, and create_workspace allows five an
# hour — so a dispatch overlapping the cron exhausts the budget and the spec
# then fails with "Too many new workspaces", which looks nothing like the bug.
concurrency:
  group: nightly-e2e
  cancel-in-progress: false
```

And in the job, raise permissions and add a final step:

```yaml
    permissions:
      contents: read
      issues: write
```

```yaml
      - name: Say so, where a person will see it
        if: failure()
        run: gh issue create --title "Nightly e2e failed $(date -u +%F)" --body "Run: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID" --label nightly
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: A ceiling on skips**

In `e2e/coverage.spec.ts`, add:

```typescript
// A skip ceiling. The credential guard above catches a suite that cannot sign
// in; this catches the quieter version — 27 of this suite's conditional skips
// are gated on the live workspace HAVING data, so a slow month at the salon
// can hollow the run out while it still exits 0.
test("the run covered most of the suite", async () => {
  test.skip(process.env.REQUIRE_SERVICE_CREDENTIALS !== "1", "not a credentialed run");
  const max = Number(process.env.E2E_MAX_SKIPS ?? "8");
  const skipped = test.info().config.metadata.skipped ?? 0;
  expect(skipped, `${skipped} specs skipped; a credentialed run should skip almost none`).toBeLessThanOrEqual(max);
});
```

If Playwright's reporter does not expose that count in this version, implement the ceiling as a `globalTeardown` reading the JSON reporter's output instead, and say so in a comment. Do not ship a test that silently reads `undefined` as zero.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/nightly-e2e.yml e2e/coverage.spec.ts && git -c core.safecrlf=false commit -m "A red nightly reaches a person, and a hollow one is not green"
```

---

## Task 6: Ship it

- [ ] **Step 1: Branch — the earlier tasks committed onto whatever branch you were on**

If you began on `main`, move the commits now:

```bash
git branch nightly-findings && git reset --hard origin/main && git checkout nightly-findings
```

- [ ] **Step 2: Every gate CI runs, in CI's order**

```bash
corepack pnpm --filter "./packages/*" build && git diff --exit-code -- packages/*/dist && corepack pnpm -r --if-present typecheck && corepack pnpm lint && corepack pnpm test
```

Expected: dist clean, typecheck `Done`, lint `0 errors` with 23 warnings, tests `# fail 0`.

- [ ] **Step 3: Typecheck the specs, which the workspace typecheck does not cover**

`pnpm -r typecheck` runs per package; `e2e/` belongs to no package, so nothing above reads the files Tasks 1–3 changed.

```bash
npx tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --types node e2e/*.ts
```

Expected: no output.

- [ ] **Step 4: Push and open the pull request**

```bash
git push -u origin nightly-findings && gh pr create --title "The specs name their workspace, as the app does" --body-file docs/plans/2026-09-08-nightly-findings.md
```

- [ ] **Step 5: Merge when CI is green**

`--auto` *enables* auto-merge and returns immediately; it does not block. So wait for the merge to actually land before doing anything that depends on it.

```bash
gh pr merge --squash --auto --delete-branch
```

```bash
until [ "$(gh pr view --json mergedAt --jq '.mergedAt // empty')" != "" ]; do sleep 20; done; echo merged
```

- [ ] **Step 6: Wait for the deployment of the MERGE COMMIT**

Playwright runs against `https://app.chanlytics.com`, so firing the nightly straight after a merge tests the previous deployment. And the SHA to wait for is the squash **merge commit**, not the feature branch's HEAD — a squash merge creates a new commit, so `git rev-parse HEAD` on the branch names something that will never be deployed.

```bash
SHA=$(gh pr view --json mergeCommit --jq '.mergeCommit.oid') && until curl -s https://app.chanlytics.com/api/version | grep -q "$SHA"; do sleep 15; done; echo "deployed $SHA"
```

- [ ] **Step 7: Run the nightly on the merged code**

`workflow_dispatch` with no `--ref` runs the default branch, which is what you want only after Step 5 landed there.

```bash
gh workflow run nightly-e2e.yml --ref main --repo expectmeout/chanlytics-os
```

- [ ] **Step 8: Read both halves**

```bash
gh run view "$(gh run list --workflow=nightly-e2e.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --log | grep -E "# (tests|pass|fail|skipped)|passed|failed|skipped|a run that claims to cover Postgres|the signed-in half"
```

Expected: node `# fail 0`, `# skipped 0`; browser `0 failed`. **Do not assert a specific skip count** — `billing.spec.ts`'s two conditional skips depend on whether the live workspace pays by card, and the run being fixed proves they did not fire. Both guards must appear as run, not skipped.

---

## Task 7: The probe workspace — separately, and to the repo's bar

**Not part of the pull request above, and not needed by it.** Task 1 makes the suite survive a second membership, so this is hygiene before live Stripe keys, not a fix.

`delete from tenants` cascades through more than twenty-five tables. This repo's rule for production-mutating work is dry-run by default, idempotent, a JSONL backup, and an explicit `--apply`.

**Meet that bar rather than citing it.** An earlier draft of this task named the rule and then prescribed hand-typed SQL guarded by a human reading a name, which meets none of it. Write the tool instead: this will not be the last probe workspace, and a reusable `tooling/scripts/delete-tenant.mjs` costs less than the second time somebody does it by hand.

- [ ] **Step 1: Write the tool**

`tooling/scripts/delete-tenant.mjs`, taking `--tenant <uuid>`, dry-run unless `--apply`:

1. Read the tenant row and refuse if it is missing, or if `--expect-name` does not match its name exactly.
2. Count every table that cascades, and print the table-by-table tally.
3. Write every row it is about to destroy to `backup/tenant-<id>-<timestamp>.jsonl`, one JSON object per line with its table name, and refuse to continue if that file cannot be written.
4. Without `--apply`, stop here and print what would happen. Idempotent: a second run against an already-deleted tenant reports nothing to do and exits 0.
5. With `--apply`, delete inside a transaction, assert exactly one `tenants` row went, and commit.

- [ ] **Step 2: Rehearse, then apply**

```bash
node tooling/scripts/delete-tenant.mjs --tenant ee0e86b7-6afc-4c12-b404-fcae14652205 --expect-name "Billing probe"
```

Read the tally. Then, and only then:

```bash
node tooling/scripts/delete-tenant.mjs --tenant ee0e86b7-6afc-4c12-b404-fcae14652205 --expect-name "Billing probe" --apply
```

- [ ] **Step 3 (reference): what the counts should look like**

```sql
begin;
select 'contacts' t, count(*) from contacts where tenant_id = 'ee0e86b7-6afc-4c12-b404-fcae14652205'
union all select 'conversations', count(*) from conversations where tenant_id = 'ee0e86b7-6afc-4c12-b404-fcae14652205'
union all select 'messages', count(*) from messages where tenant_id = 'ee0e86b7-6afc-4c12-b404-fcae14652205'
union all select 'calls', count(*) from calls where tenant_id = 'ee0e86b7-6afc-4c12-b404-fcae14652205'
union all select 'memberships', count(*) from memberships where tenant_id = 'ee0e86b7-6afc-4c12-b404-fcae14652205';
select id, name, slug, created_at from tenants where id = 'ee0e86b7-6afc-4c12-b404-fcae14652205';
select tenant_id, mode, status, stripe_customer_id from billing_accounts where tenant_id = 'ee0e86b7-6afc-4c12-b404-fcae14652205';
rollback;
```

The tool prints this itself; the query is here so the numbers can be checked independently before `--apply`.

- [ ] **Step 4: Note what does not go**

`billing_events.tenant_id` is `on delete set null` (`00073_billing.sql:48`) — deliberate, since Stripe's dedup ledger must outlive the tenant. And the Stripe **test-mode customer** that `billing_accounts.stripe_customer_id` pointed at is not touched by any of this; remove it in Stripe's own dashboard if you want it gone.

---

## Task 8: The phone inconsistencies — real, latent, and not what the nightly caught

Filed for later. Neither item is urgent and neither belongs in the pull request above.

**8a. The calendar sweep gives up on the first refusal.** `apps/dashboard/src/server/calendar.ts:141` does `break`, not `continue`, when `create_person` returns an error. One appointment carrying a number the door rejects silently stops every later person in that read from being added, leaving only a `console.error`. Change `break` to `continue`, and count the refusals into the existing log line so the truncation is visible. One word, and it wants its own small pull request with a test.

**8b. Four layers disagree about what a phone number is.** `contacts.phone_e164` is `text` with no constraint; `persist.ts:102` writes `` `+${digits}` `` by hand; `normalizePhone` accepts 8–15 digits and turns exactly 10 into `+1…`; `create_person` demands `^\+[1-9][0-9]{7,14}$`. So the product can store a number it will then refuse — a short code arriving over SMS is stored as `+12345` and cannot be added as a person.

The fix is **at the door, not in the shared helper and not in the column**. `normalizePhone` is called by the live inbound voice path, the forwarding verifier and the Retell function handler, and in two of those a null return fails *open* rather than closed. A refusal belongs in `contacts/route.ts`, phrased for the owner: *"That is a short code, not a phone number — nobody can be reached on it."* Decide it deliberately; do not let a test drive it.

---

## Self-Review

**Coverage.** 1–3 → Task 4. 4 → Task 2, both lines. 5 → Task 3. 6 and 7 → Task 1. Every failure has a task that changes a status or an assertion, not a diagnostic.

**Ordering.** Task 1 is first because it is the durable fix; Task 7 would also clear 6 and 7 by removing the second membership, which is precisely why it must not run first — a green run bought by deleting a workspace would ratify specs that break again on the next one.

**Placeholders.** None. Task 5 Step 2 names its own uncertainty about the Playwright reporter API and says what to do instead rather than shipping a test that reads `undefined` as zero.

**Risk left standing.** Task 7's delete, which is why it is out of the pull request, wrapped in a transaction, and preceded by counts. Task 5's issue-creation step needs `issues: write`, a genuine widening of the workflow's permissions — narrower than it looks, since the token is job-scoped, but it is a change to what CI may do.
