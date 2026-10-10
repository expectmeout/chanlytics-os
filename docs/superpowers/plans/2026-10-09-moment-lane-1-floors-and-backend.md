# A moment holds many campaigns, lane 1: the floors and the backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person's own words and a reach-out report's period each say one thing (spec §4.0), and every number Campaigns
shows is counted once, in SQL, in one call (spec §4.7): `playbook_totals`, `run_counts`, `template_sends`, the reply
window said once, every chain's numbers behind one member check, and `playbooks` on the realtime topic.

**Architecture:** Five migrations (00360–00364, renumbered at push) proved on a throwaway Supabase stack against seeded
truth; `packages/db` wrappers that answer `"missing"` while a function is absent, so the dashboard keeps today's fold
for one release and either deploy order works; contracts guards in place of casts; the dashboard's readers over the
functions with `GET playbooks` answering the same bytes; the fake database (`_fake-db.mjs`) given twins of the three
functions the dashboard calls, held to SQL by the database test.

**Tech Stack:** Postgres 17 (Supabase CLI 2.116.0, local throwaway stack), PostgREST via `@supabase/supabase-js`,
TypeScript (contracts, db, dashboard server), Node's test runner through `tooling/scripts/checks/test.mjs`.

---

## Read this first

- **Spec:** `docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md` (§4.0, §4.7, §6 groups 1–2, §7's
  database half, §8's oracle risk). **Report:** `C:\Users\Ruben\Documents\Claude Projects\Claude Video\reports\Campaigns ledger backend and Ask flow.md`, corrections 1–12, decisions D1, D5, D35–D39.
- **Repo rules:** `CLAUDE.md` (every rule there is a red build). The canonical shapes this lane copies: a migration
  `supabase/migrations/00125_a_person_may_have_an_email.sql` (header) with `00329` (a function re-declared whole),
  `00357` (header voice), `00321` (topic triggers); the db wrapper `packages/db/src/repositories/reports/report-series.ts`
  (`reviewsLedger` + `isMissingDoor`); a db test `tooling/scripts/tests/reach-out-back/what-comes-back.db.test.mjs` and
  `tooling/scripts/tests/reports/report-series.db.test.mjs`.
- **The code wins.** File:line citations here were read on `7ff179717` (HEAD after #1525). Read each file before you
  edit it. If a snippet's surroundings differ, keep the snippet's intent and say so in your report.
- **Worktree:** `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-campaigns-2`, branch
  `campaigns/a-moment-holds-many`. Never `cd` elsewhere, never `git stash`, never push. Your Bash shell does not keep
  its directory or variables between calls: every command block below starts by setting `W` (and `ENV` for the stack)
  and `cd "$W"`.
- **The throwaway stack is already running** (project `cm-moment-test`, API `http://127.0.0.1:57521`, db `57522`). Its
  scratch project is
  `/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test`
  and its env file (sets `SUPABASE_CLI`, `SUPABASE_WORKDIR`, `SUPABASE_URL`, both keys, and refuses any other URL) is
  `/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh`.
  Never the shared stack (`supabase_db_chanlytics-messaging`, ports 5432x), never `supabase link`, never `db push`,
  never production. A new migration is copied into `$SUPABASE_WORKDIR/supabase/migrations/` and applied with
  `"$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR"` (a clean replay, about two minutes). A migration you
  edit after copying is copied again before the next reset.
- **Tests:** one file per command, `node tooling/scripts/checks/test.mjs <file>`. Never the whole suite. A database
  test needs the env file sourced in the same command, or it skips (a skip is not a pass: look for `# skip 0`).
- **Packages are consumed through committed `dist`:** after a change under `packages/*`, run
  `corepack pnpm --filter "./packages/*" build` and commit the changed `packages/*/dist` files with the source.
- **New files:** the barrel and tree tests read `git ls-files`; run `git add -N <new files>` before running them.
- **Folders at 20 modules take no 21st:** `tooling/scripts/tests/reports` (20), `tooling/scripts/tests/playbooks` (20),
  `packages/contracts/src/conversations` (20), `packages/db/src/repositories` (20), `apps/dashboard/src/server/readers`
  (32, held). This plan's new files go where there is room (see the file map); do not move them.
- **Commit format** (the pre-commit hook formats what you stage):

  ```bash
  git commit -m "$(cat <<'EOF'
  <what changed, in the repo's sentence style>

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  EOF
  )"
  ```

- **Do not build the dashboard** (`next build`) or start a dev server in this lane.

## File map

Created:

| File | Responsibility |
| --- | --- |
| `supabase/migrations/00360_a_booking_notice_is_no_person_s_words.sql` | `message_is_a_persons_words` with `EMAIL_CLAIMS`' list |
| `supabase/migrations/00361_a_reach_out_report_reads_any_period.sql` | `reach_out_report` over 1–90 days |
| `supabase/migrations/00362_a_playbook_s_runs_are_counted_where_they_are.sql` | `campaign_reply_window`, `run_counts`, `playbook_totals`, `template_sends`, `campaign_series` on the window |
| `supabase/migrations/00363_every_chain_is_counted_behind_one_member_check.sql` | `may_read_workspace`, `reach_out_chain_totals` |
| `supabase/migrations/00364_a_playbook_changed_is_told_to_its_workspace.sql` | `playbooks` on the workspace topic |
| `packages/contracts/src/playbooks/playbook-totals.ts` | `PlaybookTotalsDto`, `isPlaybookTotalsDto` (playbooks/ holds 15) |
| `tooling/scripts/tests/reports/periods/reach-out-month.db.test.mjs` | the month on `reach_out_report` (reports/ is at 20; periods/ holds 3) |
| `tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs` | seeded truth for 00362; GET playbooks byte-equality; the fold past its caps; the twins held to SQL |
| `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs` | guards, twins, Sent, GET playbooks and Settings' templates over the fake database (a folder earns its place at its second module) |
| `tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs` | every chain past the report's twenty; `may_read_workspace` |

Modified:

| File | Change |
| --- | --- |
| `packages/contracts/src/conversations/message-author.ts` | `EMAIL_CLAIMS`, `EmailClaim`, `NOT_A_PERSONS_CLAIMS` read off it |
| `packages/contracts/src/conversations/index.ts` | export them |
| `packages/channels/src/email/intake.ts`, `packages/core/src/messages/email-ingest.ts` | `EmailClaim` is contracts' |
| `packages/contracts/src/broadcasts/broadcasts.ts`, `.../broadcasts/index.ts` | `runCountsOf` |
| `packages/contracts/src/templates/templates.ts`, `.../templates/index.ts` | `templateSendsOf` |
| `packages/contracts/src/playbooks/index.ts` | export `isPlaybookTotalsDto`, `PlaybookTotalsDto` |
| `packages/contracts/src/reach-out/reach-out-sheet.ts` | the period refusal's comment (words kept for a database before 00361) |
| `packages/contracts/src/browser.generated.ts` | regenerated |
| `packages/db/src/repositories/reports/report-series.ts`, `packages/db/src/index.ts` | `playbookTotals`, `runCounts`, `templateSends`, `reachOutChainTotals` |
| `packages/db/src/realtime.ts` | `playbooks` in `WATCHED` |
| `packages/db/src/database.types.ts` | regenerated |
| `apps/dashboard/src/server/campaigns/broadcasts.ts` | `withCounts` and a run's sheet over `run_counts`, the fold kept as the fallback |
| `apps/dashboard/src/server/campaigns/playbooks.ts` | `listPlaybooks` = `playbookRows` + totals (`playbook_totals`, else the fold) |
| `apps/dashboard/src/server/readers/shape.ts` | reads `playbookRows` |
| `apps/dashboard/src/server/readers/templates.ts` | sends over `template_sends`, the scan kept as the fallback |
| `apps/dashboard/src/server/ask/context/pages.ts` | private `playbookRows` renamed `playbookContextRows` (the copies ratchet) |
| `apps/dashboard/app/api/v1/playbooks/route.ts` | `GET` in the `aggregate` bucket |
| `apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts`, `.../reach-out/surface.ts` | `refreshOnTables` |
| `tooling/scripts/tests/_fake-db.mjs` | twins of `run_counts`, `playbook_totals`, `template_sends` |
| `tooling/scripts/tests/route-policy.json`, `docs/api.md` | the bucket |
| `supabase/schema.sql`, `supabase/migrations-ledger.json` | regenerated, recorded |
| tests: `broadcasts/campaign-channels.db.test.mjs`, `email/email-intake.test.mjs`, `reach-out-back/what-comes-back.db.test.mjs`, `database/each-workspace-is-told-what-changed.db.test.mjs`, `shell/surfaces/refresh-coverage.test.mjs`, `reports/report-repository.test.mjs`, `broadcasts/broadcast-counts-are-whole.test.mjs`, `ask/ask-context.test.mjs`, `ask/readers.test.mjs` | as each task says |

---

## Task 1: The throwaway stack answers, and the folders are as this plan counted them

**Files:** none (read only; nothing to commit).

- [ ] **Step 1: The stack's containers are up**

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep cm-moment-test
```

Expected: seven lines (`supabase_db_cm-moment-test`, `_rest_`, `_auth_`, `_kong_`, `_realtime_`, `_storage_`,
`_pg_meta_`), each `Up`. If none: stop and report (the coordinator owns starting it).

- [ ] **Step 2: The API answers, and the CLI reads the scratch project from the worktree**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && "$SUPABASE_CLI" --version && curl -s -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL/rest/v1/" -H "apikey: $SUPABASE_ANON_KEY" && "$SUPABASE_CLI" status -o json 2>/dev/null | grep -o '"API_URL": *"[^"]*"'
```

Expected: `2.116.0`, then `200`, then `"API_URL": "http://127.0.0.1:57521"`. The last line proves the CLI honours
`SUPABASE_WORKDIR` from the worktree (the gen scripts and the db tests run it there). If it prints 54321, stop: the gens
would dump the shared stack.

- [ ] **Step 3: The scratch project replays exactly the worktree's migrations**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && diff <(ls supabase/migrations) <(ls "$SUPABASE_WORKDIR/supabase/migrations") && echo same && ls supabase/migrations | tail -1
```

Expected: `same`, then `00359_the_days_replies_ride_with_the_days_numbers.sql`.

- [ ] **Step 4: The folders hold what this plan counted**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && for d in tooling/scripts/tests/reports tooling/scripts/tests/reports/periods tooling/scripts/tests/playbooks tooling/scripts/tests/reach-out-back packages/contracts/src/conversations packages/contracts/src/playbooks; do n=$(echo "$d" | awk -F/ '{print NF}'); echo "$d $(git ls-files "$d" | grep -E '\.(m?[jt]sx?)$' | awk -F/ -v n=$n 'NF==n+1' | wc -l)"; done
```

Expected: `reports 20`, `reports/periods 3`, `playbooks 20`, `reach-out-back 6`, `conversations 20`, `playbooks 15`
(the contracts one). If any differs, stop and report: a new file's home depends on these.

---

## Task 2: `EMAIL_CLAIMS`, declared once in contracts and read by channels, core and `isPersonsWords`

**Files:**
- Modify: `packages/contracts/src/conversations/message-author.ts:38-52`
- Modify: `packages/contracts/src/conversations/index.ts:40, 43`
- Modify: `packages/channels/src/email/intake.ts:6, 162-179`
- Modify: `packages/core/src/messages/email-ingest.ts:1-11, 36-38`
- Modify: `packages/contracts/src/browser.generated.ts` (regenerated)
- Test: `tooling/scripts/tests/email/email-intake.test.mjs`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/email/email-intake.test.mjs`, add `import { EMAIL_CLAIMS, isPersonsWords } from "@chanlytics/contracts";`
after the `import { createHmac } from "node:crypto";` line, and add this test right after the test named
`"what a message claims to be: a report and an automatic reply before the generic automated mark, ..."` (it ends at
the line `assert.equal(claim({ "list-unsubscribe": "<mailto:u@brand.example>" }), "automated");` and its `});`):

```js
test("every claim the intake answers is one contracts' EMAIL_CLAIMS declares, the set is no larger, and a person's words are what it marks them", () => {
  const from = { address: "ana@example.com", name: null };
  const said = new Set([
    classifyReceived({ headers: {}, from }),
    classifyReceived({ headers: { "content-type": "multipart/report; report-type=delivery-status" }, from }),
    classifyReceived({ headers: { "auto-submitted": "auto-replied" }, from }),
    classifyReceived({ headers: { precedence: "bulk" }, from }),
    classifyReceived({
      headers: { "auto-submitted": "auto-generated" },
      from: { address: "no-reply@booksy.com", name: "Booksy" },
      subject: "Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
      text: "Dana Rivera\n(305) 555-0144\nThursday, October 8, 2026, 3:00 PM",
    }),
    classifyReceived({
      headers: {},
      from: { address: "forwarding-noreply@google.com", name: "Gmail Team" },
      subject: "(#4815162) Gmail Forwarding Confirmation - Receive Mail from owner@example.com",
      text: "owner@example.com has requested to automatically forward mail to your email address salon@mail.example.com.\nConfirmation code: 4815162\n\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc",
    }),
  ]);
  assert.deepEqual(
    [...said].sort(),
    EMAIL_CLAIMS.map((c) => c.claim).sort(),
    "each claim the intake answers is declared, and each declared one is answered",
  );
  for (const { claim, personsWords } of EMAIL_CLAIMS)
    assert.equal(isPersonsWords({ email: { claim } }), personsWords, `isPersonsWords reads the mark: ${claim}`);
  assert.deepEqual(
    EMAIL_CLAIMS.filter((c) => !c.personsWords)
      .map((c) => c.claim)
      .sort(),
    ["auto_reply", "automated", "booking_notice", "forwarding_confirmation", "report"],
    "a booking tool's notice and Gmail's forwarding confirmation are no person's words (decision 5)",
  );
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/email/email-intake.test.mjs
```

Expected: FAIL in the new test with `TypeError: Cannot read properties of undefined (reading 'map')` (contracts exports
no `EMAIL_CLAIMS` yet); every other test passes.

- [ ] **Step 3: Declare the set in contracts**

In `packages/contracts/src/conversations/message-author.ts`, replace

```ts
/** What the email intake read a message as when it is not a person writing (channels email/intake.ts EmailClaim). */
const NOT_A_PERSONS_CLAIMS: readonly string[] = ["automated", "auto_reply", "report", "booking_notice"];
```

with

```ts
/**
 * What the email intake reads a received email as (channels email/intake.ts classifyReceived, from headers anyone can
 * write), each marked whether its words are a person's own. THE one statement of the set: channels' and core's
 * EmailClaim are its names, isPersonsWords reads its marks, and broadcasts/campaign-channels.db.test.mjs runs every claim
 * through public.message_is_a_persons_words (00360), its twin in SQL, so a claim added here and not there fails.
 *
 *   report                   a bounce or a delivery status notification
 *   booking_notice           a booking tool writing about one of the business's appointments (bookingNoticeOf)
 *   forwarding_confirmation  Gmail asking whether it may forward an account's mail here: Google's mail, never a person's
 *   auto_reply               an out-of-office or a responder answering something of ours
 *   automated                mail a program produced or a list sent
 *   person                   none of the above: somebody writing
 */
export const EMAIL_CLAIMS = [
  { claim: "report", personsWords: false },
  { claim: "booking_notice", personsWords: false },
  { claim: "forwarding_confirmation", personsWords: false },
  { claim: "auto_reply", personsWords: false },
  { claim: "automated", personsWords: false },
  { claim: "person", personsWords: true },
] as const;

/** One of EMAIL_CLAIMS: what a received email claims to be. */
export type EmailClaim = (typeof EMAIL_CLAIMS)[number]["claim"];

/** The claims that are not a person writing, read off EMAIL_CLAIMS. */
const NOT_A_PERSONS_CLAIMS: readonly string[] = EMAIL_CLAIMS.filter((c) => !c.personsWords).map((c) => c.claim);
```

In the same file's `isPersonsWords` comment, replace `public.message_is_a_persons_words (00299) is its twin in SQL, read by
has_relationship and the people list: the two change together.` with `public.message_is_a_persons_words (00360) is its
twin in SQL, read by has_relationship, the people list and the campaign counts: the two change together through
EMAIL_CLAIMS.` (keep the comment's line width at 120).

In `packages/contracts/src/conversations/index.ts`, change

```ts
export { isAutomatedSend, isPersonsWords, messageVia, messageAuthor, messageWhy } from "./message-author";
```

to

```ts
export { EMAIL_CLAIMS, isAutomatedSend, isPersonsWords, messageVia, messageAuthor, messageWhy } from "./message-author";
```

and `export type { MessageAuthor } from "./message-author";` to `export type { EmailClaim, MessageAuthor } from "./message-author";`.

- [ ] **Step 4: Channels and core take the type from contracts**

In `packages/channels/src/email/intake.ts`, change line 6 to

```ts
import { bookingNoticeOf, forwardingConfirmationOf, type EmailClaim } from "@chanlytics/contracts";
```

and replace the whole comment-and-type block that starts `/**\n * What a received email CLAIMS to be, from headers anyone can write. The order` and ends
`export type EmailClaim =\n  "report" | "auto_reply" | "automated" | "person" | "booking_notice" | "forwarding_confirmation";` with

```ts
/**
 * What a received email CLAIMS to be, from headers anyone can write: one of contracts' EMAIL_CLAIMS, the one list of
 * them, which also says whether each is a person's words. The order classifyReceived tests them in is the rule: a
 * delivery report and an automatic reply are tested before the generic automated mark, because both carry it, and
 * each is handled apart.
 *
 *   report                   a bounce or a delivery status notification, by email. Recorded
 *                            for a person; what stops sends to an address is the provider's
 *                            signed receipt, never this.
 *   booking_notice           a booking tool writing about one of the business's appointments.
 *   forwarding_confirmation  Gmail asking whether it may forward an account's mail here.
 *   auto_reply               an out-of-office or a responder answering something of ours
 *                            (RFC 3834 auto-replied, and the markers older systems use).
 *                            Never answered: two responders answering each other is a loop.
 *   automated                mail a program produced or a list sent. Kept, and kept from the
 *                            receptionist. (A lead notification is automated mail too; the
 *                            day one is parsed, its source is tested before this.)
 *   person                   none of the above.
 */
export type { EmailClaim };
```

In `packages/core/src/messages/email-ingest.ts`, add `type EmailClaim,` to the import list from `"@chanlytics/contracts"`
(after `type BookingTool,`), and replace

```ts
/** What an email claims to be, from headers anyone can write (the adapter decides it: channels classifyReceived). */
export type EmailClaim =
  "report" | "auto_reply" | "automated" | "person" | "booking_notice" | "forwarding_confirmation";
```

with

```ts
/** What an email claims to be, from headers anyone can write (the adapter decides it: channels classifyReceived), one of contracts' EMAIL_CLAIMS. */
export type { EmailClaim };
```

- [ ] **Step 5: Build, regenerate the browser entry, typecheck**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && corepack pnpm --filter "./packages/*" build && node tooling/scripts/gen/contracts-browser-entry.mjs && corepack pnpm --filter @chanlytics/contracts --filter @chanlytics/channels --filter @chanlytics/core typecheck
```

Expected: the builds succeed, the generator writes `packages/contracts/src/browser.generated.ts` (its conversations line
now names `EMAIL_CLAIMS`), and the three typechecks print nothing but their headers.

- [ ] **Step 6: Run the tests**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/email/email-intake.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/email/core-email-ingest.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-barrels.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/broadcasts.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/playbooks.test.mjs
```

Expected: each `# fail 0`.

- [ ] **Step 7: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add packages/contracts/src/conversations/message-author.ts packages/contracts/src/conversations/index.ts packages/contracts/src/browser.generated.ts packages/channels/src/email/intake.ts packages/core/src/messages/email-ingest.ts tooling/scripts/tests/email/email-intake.test.mjs packages/contracts/dist packages/channels/dist packages/core/dist && git status --short && git commit -m "$(cat <<'EOF'
What an email claims to be is one list, declared once in contracts, each claim marked a person's words or not

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

`git status --short` before the commit must show no other `dist` drift. If another package's `dist` changed
(`packages/jobs/dist`, say), read its diff: a change that is only `EmailClaim` now coming from contracts is this task's,
so add that `dist` to the commit; any other change is not, so stop and report it.

---

## Task 3: Migration 00360 — SQL says a person's own words as `EMAIL_CLAIMS` does

**Files:**
- Create: `supabase/migrations/00360_a_booking_notice_is_no_person_s_words.sql`
- Modify: `tooling/scripts/tests/broadcasts/campaign-channels.db.test.mjs:413-450`
- Modify: `supabase/schema.sql`, `supabase/migrations-ledger.json` (regenerated)

- [ ] **Step 1: The parity test iterates the set**

In `tooling/scripts/tests/broadcasts/campaign-channels.db.test.mjs`, replace the test that starts
`test("the two rules a message's meta decides are said the same way in TypeScript and in SQL: an automated send, and a person's own words", async (t) => {`
and ends with `assert.deepEqual([isAutomatedSend(null), isPersonsWords(null), isPersonsWords(undefined)], [false, true, true]);\n});` with

```js
test("the two rules a message's meta decides are said the same way in TypeScript and in SQL: an automated send, and a person's own words", async (t) => {
  if (skip) return t.skip(skip);
  const { isAutomatedSend, isPersonsWords, EMAIL_CLAIMS } = await import("@chanlytics/contracts");
  // Every shape the column holds or could: the sources a run stamps, every claim the email intake keeps (contracts
  // EMAIL_CLAIMS, iterated, so a claim added there is tried here), and what is absent, empty or of the wrong kind. A pair
  // that disagrees on one of them counts one way on a page and another in a report.
  const metas = [
    {},
    { source: "broadcast" },
    { source: "reach_out" },
    { source: "voice" },
    { source: null },
    { source: 7 },
    ...EMAIL_CLAIMS.map(({ claim }) => ({ email: { claim } })),
    { email: { claim: "a claim no intake writes" } },
    { email: { claim: null } },
    { email: {} },
    { email: "not an object" },
    { email: { claim: "auto_reply" }, source: "broadcast" },
  ];
  for (const meta of metas) {
    const what = JSON.stringify(meta);
    assert.equal(
      ok(await db.rpc("automated_send", { p_meta: meta }), what),
      isAutomatedSend(meta),
      `automated: ${what}`,
    );
    assert.equal(
      ok(await db.rpc("message_is_a_persons_words", { p_meta: meta }), what),
      isPersonsWords(meta),
      `a person's words: ${what}`,
    );
  }
  // Each claim is what EMAIL_CLAIMS marks it, in SQL too: a booking tool's notice and Gmail's forwarding confirmation are
  // no person's words (00360, decision 5), so Reports' replies and People's "last wrote" stop counting them.
  for (const { claim, personsWords } of EMAIL_CLAIMS)
    assert.equal(
      ok(await db.rpc("message_is_a_persons_words", { p_meta: { email: { claim } } }), claim),
      personsWords,
      `SQL marks ${claim} as contracts does`,
    );
  // No meta at all, as a caller may hold it: nobody's campaign, and a person's words.
  assert.deepEqual([isAutomatedSend(null), isPersonsWords(null), isPersonsWords(undefined)], [false, true, true]);
});
```

- [ ] **Step 2: Run it to see it fail on the stack**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/campaign-channels.db.test.mjs
```

Expected: `# skip 0`, and FAIL in the parity test with `a person's words: {"email":{"claim":"booking_notice"}}`
(`true !== false`: SQL still counts it).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00360_a_booking_notice_is_no_person_s_words.sql`:

```sql
-- 00360 · A booking tool's notice is no person's words, nor is Gmail's forwarding confirmation.
--
-- public.message_is_a_persons_words (00299) is the one statement in SQL of whether an inbound message's words are a
-- person's own, and contracts' isPersonsWords its twin in TypeScript. They drifted on 7 October (#1469, bookings by
-- email): TypeScript learned that a booking tool's notice (meta.email.claim 'booking_notice') is a program writing, and
-- SQL kept counting it, so Reports' replies (campaign_series) and People's "last wrote" (people_list, has_relationship)
-- counted a booking tool's email as a person answering while a run's card and Sent did not. Gmail asking whether it may
-- forward an account's mail ('forwarding_confirmation') is Google's mail, and neither twin said so.
--
-- The claims are declared once now, in contracts (EMAIL_CLAIMS, packages/contracts/src/conversations/message-author.ts),
-- each marked a person's words or not, and broadcasts/campaign-channels.db.test.mjs iterates that set against this
-- function, so a claim added there and not here fails. Only the body changes (language sql, immutable, search_path
-- empty), so create or replace takes it; no index, check or generated column reads it. Grants and comment restated.
--
-- Deploy order: either. After it, booking notices stop counting as replies on Reports and as a person writing on People.
-- Re-runnable.

create or replace function public.message_is_a_persons_words(p_meta jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_meta->'email'->>'claim', 'person')
         not in ('automated', 'auto_reply', 'report', 'booking_notice', 'forwarding_confirmation')
$$;
revoke execute on function public.message_is_a_persons_words(jsonb) from public, anon;
grant execute on function public.message_is_a_persons_words(jsonb) to authenticated, service_role;
comment on function public.message_is_a_persons_words(jsonb) is
  'Whether an inbound message''s words are a person''s own: false for an email the intake read as automated mail, an automatic reply, a delivery report, a booking tool''s notice or Gmail''s forwarding confirmation (meta.email.claim; contracts EMAIL_CLAIMS marks each), true for everything else, a message with no claim included. The one statement of it in SQL: has_relationship, people_list''s last_wrote_at and the campaign counts read it.';
```

- [ ] **Step 4: Apply it on a clean replay**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && cp supabase/migrations/00360_a_booking_notice_is_no_person_s_words.sql "$SUPABASE_WORKDIR/supabase/migrations/" && "$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR"
```

Expected: ends with `Finished supabase db reset on branch …` (or `Resetting local database... Seeding data...` and no
`ERROR`). Use a 600000 ms timeout.

- [ ] **Step 5: Run the parity test and the suites over the same function**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/campaign-channels.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/consent/email-offers.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/messages/a-released-person-is-tried-again.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/privileges.db.test.mjs
```

Expected: each `# fail 0` and `# skip 0`.

- [ ] **Step 6: Regenerate the snapshot and record the ledger**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && corepack pnpm gen:schema-snapshot && node tooling/scripts/checks/migration-ledger.mjs --record && git diff --stat supabase/ && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs
```

Expected: `supabase/schema.sql` changes only `message_is_a_persons_words`' body and comment; the ledger gains 00360;
`migrations.test.mjs` `# fail 0`. (The tests wrote rows, not schema: a dump right after a reset and tests is a clean
replay's schema.)

- [ ] **Step 7: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add supabase/migrations/00360_a_booking_notice_is_no_person_s_words.sql supabase/schema.sql supabase/migrations-ledger.json tooling/scripts/tests/broadcasts/campaign-channels.db.test.mjs && git commit -m "$(cat <<'EOF'
A booking tool's notice is no person's words in SQL, as in TypeScript, and the parity test reads every claim

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migration 00361 — Reports' "This month so far" reads the reach-outs

**Files:**
- Create: `supabase/migrations/00361_a_reach_out_report_reads_any_period.sql`
- Create: `tooling/scripts/tests/reports/periods/reach-out-month.db.test.mjs`
- Modify: `tooling/scripts/tests/reach-out-back/what-comes-back.db.test.mjs:477-481`
- Modify: `packages/contracts/src/reach-out/reach-out-sheet.ts:71-72` (comment only), `packages/contracts/dist`
- Modify: `supabase/schema.sql`, `supabase/migrations-ledger.json`

The period is held to 1–90 days the way `campaign_series` holds its own (`least(greatest(coalesce(p_days, 30), 1), 90)`,
00329 line 19), so a database with 00361 never raises the period's refusal; `REACH_OUT_REFUSALS.period` keeps its words
for a database before it (a new dashboard on an old database still says the right sentence).

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reports/periods/reach-out-month.db.test.mjs`:

```js
/**
 * Reports' Reach-outs section for "This month so far" (00361), on a real Postgres. reach_out_report took 7, 30 or 90
 * days and raised for any other, and the month sends the day of the month, so the section answered 422 on every day but
 * the 7th and the 30th. It reads any period of 1 to 90 days now, one outside them held to them as campaign_series holds
 * its own, and still only for a member of the workspace.
 *
 * Local stack only: it makes workspaces, members, a chain and its emails.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { monthDaysAt, zoneDayKey } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const TZ = "America/Chicago";
const DAY = 24 * 3_600_000;
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

let db;
let A;
let B;
let viewer;
let stranger;
const users = [];
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single(), "the write").id;

/** A member signed in: the report is a definer that asks who is calling. */
async function member(tenant, role) {
  const email = `month-${role}-${RUN}@example.com`;
  const password = `pw-${RUN}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  return c;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `month-a-${RUN}`, name: "Month A", timezone: TZ }));
  B = await one(db.from("tenants").insert({ slug: `month-b-${RUN}`, name: "Month B", timezone: TZ }));
  viewer = await member(A, "viewer");
  stranger = await member(B, "owner");
  const template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "email", name: "reach_month", language: "en", meta_status: "approved" }),
  );
  const search = await one(
    db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "movers", name: "Movers · Austin", asked: "movers in Austin", plan: {} }),
  );
  const root = await one(
    db.from("playbooks").insert({
      tenant_id: A,
      kind: "reach_out",
      trigger: "lead_first",
      name: "Reach out · Movers",
      template_id: template,
      template_name: "reach_month",
      template_language: "en",
      params: [],
      policy_class: "outreach",
      gap_minutes: 12,
      lead_search_id: search,
      state: "running",
    }),
  );
  const run = await one(
    db.from("broadcasts").insert({
      tenant_id: A,
      name: "Movers",
      template_id: template,
      template_name: "reach_month",
      template_language: "en",
      audience: { kind: "reach_out", root_id: root, step_id: root },
      state: "sent",
      scheduled_for: new Date().toISOString(),
      playbook_id: root,
      run_for: "2097-01-01",
    }),
  );
  const lead = (n) =>
    one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJmonth${RUN}${n}`,
        business_name: `Month Movers ${n}`,
        city: "Austin",
        region: "TX",
        email: `owner-${RUN}-${n}@example.com`,
        email_state: "ok",
        stage: "nurture",
      }),
    );
  const sent = async (n, at) =>
    ok(
      await db.from("reach_out_sends").insert({
        id: crypto.randomUUID(),
        tenant_id: A,
        broadcast_id: run,
        playbook_id: root,
        root_id: root,
        lead_id: await lead(n),
        state: "sent",
        send_at: new Date(at).toISOString(),
        sent_at: new Date(at).toISOString(),
      }),
      "an email that left",
    );
  // One email now, and one forty days ago: inside every period of the month, and inside ninety days alone.
  await sent(1, Date.now());
  await sent(2, Date.now() - 40 * DAY);
});

after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("This month so far: every day of a month is a period the report reads, as Reports asks for it", { skip }, async () => {
  for (let d = 1; d <= 31; d += 1) {
    const r = ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: d }), `${d} days`);
    assert.equal(r.days, d, `${d} days: the period asked`);
    assert.equal(r.series.length, d, `${d} days: a row a day`);
    assert.equal(r.totals.written, 1, `${d} days: today's email, and not the one forty days ago`);
  }
  const month = monthDaysAt(zoneDayKey(Date.now(), TZ));
  const r = ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: month }), "the month");
  assert.equal(String(r.since).slice(8, 10), "01", "the month so far starts on its 1st, in the workspace's zone");
});

test("a period outside 1 to 90 days is held to them, as campaign_series holds its own; 7, 30 and 90 read as they did", { skip }, async () => {
  const days = async (p) => ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: p }), `${p} days`).days;
  assert.deepEqual([await days(0), await days(-3), await days(91), await days(365)], [1, 1, 90, 90]);
  assert.equal(ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 90 })).totals.written, 2, "ninety days hold the email forty days ago");
  assert.equal(ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 30 })).totals.written, 1);
  assert.equal(ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 7 })).series.length, 7);
});

test("still a member's read: another workspace's member and a caller who is nobody are told the workspace is not found", { skip }, async () => {
  for (const [who, client] of [
    ["another workspace's member", stranger],
    ["the service role, nobody signed in", db],
  ]) {
    const r = await client.rpc("reach_out_report", { p_tenant_id: A, p_days: 9 });
    assert.ok(r.error, `${who}: refused`);
    assert.equal(r.error.code, "P0002", `${who}: ${r.error.message}`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && git add -N tooling/scripts/tests/reports/periods/reach-out-month.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/reach-out-month.db.test.mjs
```

Expected: `# skip 0`; the first two tests FAIL with `1 days: A period is 7, 30 or 90 days.`; the third passes.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00361_a_reach_out_report_reads_any_period.sql`. It is the header below, then **00261's
definition of `public.reach_out_report` (its lines 312–476) copied verbatim except that its three lines 329–331**

```sql
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'A period is 7, 30 or 90 days.' using errcode = '22023';
  end if;
```

**become the three lines**

```sql
  -- Any period of 1 to 90 days, one outside them held to them as campaign_series holds its own (00361): Reports'
  -- "This month so far" is the day of the month.
  p_days := least(greatest(coalesce(p_days, 30), 1), 90);
```

then the comment statement. The full file:

```sql
-- 00361 · A reach-out report reads any period of 1 to 90 days.
--
-- reach_out_report (00241, gated for a partner's second factor in 00261) took 7, 30 or 90 days and raised 22023 for any
-- other. Reports' "This month so far" (2026-10-05, Reports B1) sends the day of the month, so the Reach-outs section
-- answered 422 on every day but the 7th and the 30th. It now holds the period to 1 to 90 days, as campaign_series holds
-- its own (00329): reports/periods/reach-out-month.db.test.mjs asks for each day of a month.
--
-- 00261's definition, copied whole with only the period's three lines changed; its member check and the partner's
-- second factor stand (partners/second-factor.db.test.mjs). Only the body changes, so create or replace takes it and the
-- grants stand; the comment is restated. Contracts' REACH_OUT_REFUSALS.period keeps its words for a database before this.
--
-- Deploy order: either. A dashboard before this never asks for another period but the month, which now answers.
-- Re-runnable.

create or replace function public.reach_out_report(p_tenant_id uuid, p_days int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_today date;
  v_since timestamptz;
begin
  if auth.uid() is null or not exists (
       select 1 from public.memberships m where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
          and (m.role <> 'partner' or public.session_shows_second_factor())) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  -- Any period of 1 to 90 days, one outside them held to them as campaign_series holds its own (00361): Reports'
  -- "This month so far" is the day of the month.
  p_days := least(greatest(coalesce(p_days, 30), 1), 90);
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_today := (now() at time zone v_tz)::date;
  v_since := (v_today - (p_days - 1))::timestamp at time zone v_tz;
  return (
    -- An email that left (00179's one spelling, email_left): sent, or failed by a receipt after it left, which is how
    -- the clock settles a send whose email bounced before it was read sent. Dated by when it left.
    with left_ as (
      select s.id, s.root_id, s.playbook_id, s.lead_id, s.contact_id, s.domain_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at,
             lower(nullif(btrim(s.angle), '')) as angle, m.status, m.error, m.meta
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    sent as (
      select * from left_ x where x.sent_at >= v_since
    ),
    handed as (
      select s.root_id, s.playbook_id, count(*) as n
        from public.reach_out_sends s
       where s.tenant_id = p_tenant_id and s.state = 'handed' and s.sent_at >= v_since
       group by s.root_id, s.playbook_id
    ),
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.playbook_id, x.lead_id, x.contact_id, x.angle,
             l.closed_reason, l.booked_at
        from sent x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    answers as (
      select ls.root_id, ls.playbook_id, ls.lead_id, ls.angle,
             coalesce(ls.contact_id in (select contact_id from wrote), false) as wrote_back,
             exists (select 1 from public.reach_out_replies r
                      where r.tenant_id = p_tenant_id and r.lead_id = ls.lead_id and r.undone_at is null
                        and r.claim <> 'auto_reply' and r.intent in ('interested', 'question')) as interested,
             ls.booked_at is not null as booked,
             coalesce(ls.closed_reason = 'said_no', false) as said_no
        from last_sent ls
    ),
    angles as (
      select x.angle, count(*) as written,
             (select count(*) from answers a where a.angle = x.angle and a.wrote_back) as wrote_back,
             row_number() over (order by count(*) desc, x.angle) as rank
        from sent x
       where x.angle is not null
       group by x.angle
    ),
    domains as (
      select x.domain_id, d.host, d.state, d.held_why, d.held_at, count(*) as sent,
             count(*) filter (where x.status in ('delivered', 'read')) as delivered,
             count(*) filter (where x.status = 'failed' and x.error->>'provider' = 'bounced'
                                and lower(coalesce(x.error->>'kind', '')) = 'permanent') as bounced,
             count(*) filter (where x.meta->'email'->>'complained_at' is not null) as complained
        from sent x
        left join public.sending_domains d on d.id = x.domain_id and d.tenant_id = p_tenant_id
       group by x.domain_id, d.host, d.state, d.held_why, d.held_at
    )
    select jsonb_build_object(
      'timezone', v_tz,
      'days', p_days,
      'today', v_today,
      'since', v_today - (p_days - 1),
      'has_reach_out', exists (select 1 from public.playbooks p
                               where p.tenant_id = p_tenant_id and p.kind = 'reach_out' and p.trigger = 'lead_first'),
      'totals', jsonb_build_object(
        'written', (select count(*) from sent),
        'delivered', (select count(*) from sent where status in ('delivered', 'read')),
        'bounced', (select count(*) from sent where status = 'failed' and error->>'provider' = 'bounced'),
        'wrote_back', (select count(*) from answers where wrote_back),
        'interested', (select count(*) from answers where interested),
        'booked', (select count(*) from answers where booked),
        'said_no', (select count(*) from answers where said_no),
        'handed', coalesce((select sum(n) from handed), 0)),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object('day', g.day, 'written', coalesce(c.n, 0)) order by g.day), '[]'::jsonb)
          from (select (v_today - k) as day from generate_series(0, p_days - 1) k) g
          left join (select (x.sent_at at time zone v_tz)::date as day, count(*) as n from sent x group by 1) c
            on c.day = g.day),
      'chains', coalesce((
        select jsonb_agg(ch.body order by ch.last_at desc nulls last)
          from (
            select r.id,
                   (select max(x.sent_at) from sent x where x.root_id = r.id) as last_at,
                   jsonb_build_object(
                     'root_id', r.id,
                     'name', r.name,
                     'state', r.state,
                     'search', (select jsonb_build_object('id', q.id, 'name', q.name)
                                  from public.lead_searches q where q.id = r.lead_search_id),
                     'last_at', (select max(x.sent_at) from sent x where x.root_id = r.id),
                     'runs', (select count(*) from public.broadcasts b
                               where b.tenant_id = p_tenant_id and b.audience->>'kind' = 'reach_out'
                                 and b.audience->>'root_id' = r.id::text and b.run_for >= v_today - (p_days - 1)),
                     'steps', (
                       with recursive c as (
                         select p.id, 0 as n from public.playbooks p where p.id = r.id
                         union all
                         select p.id, c.n + 1 from public.playbooks p join c on p.after_playbook_id = c.id
                       )
                       select coalesce(jsonb_agg(jsonb_build_object(
                         'id', c.id,
                         'n', c.n,
                         'hand', p.hand->>'kind',
                         'written', (select count(*) from sent x where x.playbook_id = c.id),
                         'delivered', (select count(*) from sent x where x.playbook_id = c.id
                                         and x.status in ('delivered', 'read')),
                         'bounced', (select count(*) from sent x where x.playbook_id = c.id
                                       and x.status = 'failed' and x.error->>'provider' = 'bounced'),
                         'wrote_back', (select count(*) from answers a where a.playbook_id = c.id and a.wrote_back),
                         'interested', (select count(*) from answers a where a.playbook_id = c.id and a.interested),
                         'booked', (select count(*) from answers a where a.playbook_id = c.id and a.booked),
                         'said_no', (select count(*) from answers a where a.playbook_id = c.id and a.said_no),
                         'handed', coalesce((select h.n from handed h where h.playbook_id = c.id), 0))
                         order by c.n), '[]'::jsonb)
                         from c join public.playbooks p on p.id = c.id)) as body
              from public.playbooks r
             where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
               and (exists (select 1 from sent x where x.root_id = r.id)
                    or exists (select 1 from handed h where h.root_id = r.id))
             order by 2 desc nulls last
             limit 20
          ) ch), '[]'::jsonb),
      'angles', coalesce((
        select jsonb_agg(jsonb_build_object('angle', a.angle, 'written', a.written, 'wrote_back', a.wrote_back)
                         order by a.rank)
          from angles a where a.rank <= 8), '[]'::jsonb),
      'other_angles', jsonb_build_object(
        'written', coalesce((select sum(a.written) from angles a where a.rank > 8), 0),
        'wrote_back', coalesce((select sum(a.wrote_back) from angles a where a.rank > 8), 0)),
      'no_angle', (select count(*) from sent where angle is null),
      'domains', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'host', d.host, 'state', d.state, 'held_why', d.held_why, 'held_at', d.held_at,
                 'sent', d.sent, 'delivered', d.delivered, 'bounced', d.bounced, 'complained', d.complained)
               order by d.sent desc, d.host)
          from (select * from domains order by sent desc, host limit 10) d), '[]'::jsonb))
  );
end $$;

comment on function public.reach_out_report(uuid, integer) is
  'Reports'' Reach-outs section (Reach out Part 6, H1, H3-H6), for a member: over the last p_days days in the workspace''s zone (1 to 90; one outside them is held to them, as campaign_series holds its own, 00361), the emails that left and what came of them. has_reach_out, totals, series (written per day), chains (at most 20, each with its steps), angles (the top 8, other_angles, no_angle) and domains (at most 10; a removed domain''s host is null). Each lead is counted once per chain at its last email of the period; wrote back is outreach_wrote_back.';
```

- [ ] **Step 4: Prove the copy changed only the period**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && diff <(sed -n '312,476p' supabase/migrations/00261_a_partner_s_seat_opens_no_door_without_the_second_factor.sql) <(awk '/^create or replace function public.reach_out_report/{p=1} p{print} /^end \$\$;/{if(p)exit}' supabase/migrations/00361_a_reach_out_report_reads_any_period.sql)
```

Expected: exactly one hunk, `18,20c18,20`, the three `if p_days … end if;` lines against the comment and
`p_days := least(greatest(coalesce(p_days, 30), 1), 90);`. Anything else is a transcription error: fix the file.

- [ ] **Step 5: The words and the old test follow**

In `packages/contracts/src/reach-out/reach-out-sheet.ts`, replace the comment line
`  /** 00241 reach_out_report: only Reports' own periods. */` with
`  /** 00241's reach_out_report refused any period but 7, 30 or 90 days; 00361 holds any to 1 to 90, so only a database before it says this. */`.

In `tooling/scripts/tests/reach-out-back/what-comes-back.db.test.mjs`, replace

```js
    refusedWith(
      await as.viewer.c.rpc("reach_out_report", { p_tenant_id: A, p_days: 14 }),
      "22023",
      REACH_OUT_REFUSALS.period,
    );
```

with

```js
    // Any period of 1 to 90 days since 00361 (reports/periods/reach-out-month.db.test.mjs): fourteen is read, not refused.
    assert.equal(ok(await as.viewer.c.rpc("reach_out_report", { p_tenant_id: A, p_days: 14 })).days, 14);
```

If `REACH_OUT_REFUSALS` is no longer used anywhere in that file, remove it from its `@chanlytics/contracts` import.

- [ ] **Step 6: Apply, run, regenerate, record**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && corepack pnpm --filter @chanlytics/contracts build && cp supabase/migrations/00361_a_reach_out_report_reads_any_period.sql "$SUPABASE_WORKDIR/supabase/migrations/" && "$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/periods/reach-out-month.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/what-comes-back.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/partners/second-factor.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-sheet/reach-out-sheet-words.test.mjs && corepack pnpm gen:schema-snapshot && node tooling/scripts/checks/migration-ledger.mjs --record && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs
```

Expected: each test file `# fail 0`, `# skip 0` for the db ones; `schema.sql` changes only `reach_out_report`'s body and
comment.

- [ ] **Step 7: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add supabase/migrations/00361_a_reach_out_report_reads_any_period.sql supabase/schema.sql supabase/migrations-ledger.json tooling/scripts/tests/reports/periods/reach-out-month.db.test.mjs tooling/scripts/tests/reach-out-back/what-comes-back.db.test.mjs packages/contracts/src/reach-out/reach-out-sheet.ts packages/contracts/dist && git commit -m "$(cat <<'EOF'
A reach-out report reads any period of 1 to 90 days, so Reports' month so far stops answering 422

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The seeded world, and its truth asked of functions that do not exist yet

**Files:**
- Create: `tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs`

This task writes the database test's seeds and every SQL assertion of spec §4.7's "seeded truth"; it fails until Task 6
writes 00362. The dashboard half (byte-equality, the fold past its caps, the twins) is added in Task 16.

- [ ] **Step 1: Write the test file**

Create `tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs`:

```js
/**
 * A playbook's totals, a run's counts and a message's sends, counted where they are (00362), proved against seeded
 * truth on a real Postgres -- never against the fold they replace, which is wrong past its caps and for a thread two
 * people on one run share (apps/dashboard/src/server/campaigns/broadcasts.ts countRecipients):
 *
 *   1. A salon (A) whose numbers the fold counts right: three moment playbooks and a reach-out chain; forty runs of
 *      Win-back across every state, one waiting; skipped and failed people, a failed one with a message; replies inside
 *      and outside the 72 hours, at the window's edge and a second past it, an automatic reply and a booking tool's
 *      notice inside them, a call's note, a reply before the send; a thread on two runs; a one-off broadcast and a
 *      template the Inbox sent. Each number is the hand count beside its seed.
 *   2. A shop (B) past the fold's caps: 1,050 runs on one playbook, and eleven runs of 2,000 people in the newest chunk
 *      of two hundred runs.
 *   3. A studio (C) whose one run reached two people on one thread: the reply came an hour after the first send.
 *   4. The floor: an empty workspace answers {}, and a signed-in member of another workspace reads {} of the salon's (the
 *      suites run as the service role, which row security never stops). The window is contracts' REPLY_WINDOW_MS, and
 *      campaign_series reads it.
 *
 * Local stack only: it makes workspaces, people, runs and users.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { REPLY_WINDOW_MS, isReplyTo } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const CLI = process.env.SUPABASE_CLI || "supabase";
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, runs and users"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

/** One SQL read of the local stack, for what PostgREST does not serve (pg_proc, an interval's seconds). */
function query(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  if (r.status !== 0) throw new Error(`${CLI} db query failed: ${[r.stderr, r.stdout].join("\n").trim().slice(-800)}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  if (start < 0) return [];
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const dayOf = (ms) => iso(ms).slice(0, 10);
const RUN = `${NOW.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const uuid = () => crypto.randomUUID();

const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });
const tenants = [];
const users = [];
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

/** Rows written a thousand at a time; every row of one call carries the same keys, as PostgREST's bulk insert wants. */
async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 1000) ok(await db.from(table).insert(rows.slice(i, i + 1000)), `${table} written`);
}
/** A workspace in UTC, so the hours are the fixture's. */
async function workspace(label) {
  const id = ok(
    await db.from("tenants").insert({ slug: `totals-${label}-${RUN}`, name: `Totals ${label}`, timezone: "UTC" }).select("id").single(),
  ).id;
  tenants.push(id);
  return id;
}
async function template(tenant, name, channel = "whatsapp") {
  return ok(
    await db.from("templates").insert({ tenant_id: tenant, channel, name, language: "en_US", meta_status: "approved" }).select("id").single(),
  ).id;
}
async function moment(tenant, tpl, { name, trigger, policy_class, template_name }) {
  return ok(
    await db
      .from("playbooks")
      .insert({ tenant_id: tenant, name, trigger, template_id: tpl, template_name, template_language: "en_US", params: [], policy_class, state: "running" })
      .select("id")
      .single(),
  ).id;
}
/** People, each with a thread of their own. */
async function people(tenant, n) {
  const out = Array.from({ length: n }, () => ({ contact: uuid(), thread: uuid() }));
  await insertAll("contacts", out.map((p) => ({ id: p.contact, tenant_id: tenant })));
  await insertAll("conversations", out.map((p) => ({ id: p.thread, tenant_id: tenant, contact_id: p.contact })));
  return out;
}
/** A member signed in: the functions run on the caller's rights, so who calls decides what they read. */
async function member(tenant, role) {
  const email = `totals-${role}-${RUN}-${users.length}@example.com`;
  const password = `pw-${RUN}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  return c;
}

/** A message row; every one carries the same keys (template_name and external_id null unless the Inbox sent a template). */
const message = (tenant, who, at, over) => ({
  id: uuid(),
  tenant_id: tenant,
  conversation_id: who.thread,
  contact_id: who.contact,
  channel: "whatsapp",
  direction: "outbound",
  sender: "human",
  type: "template",
  body: "We miss you",
  status: "delivered",
  meta: { source: "broadcast" },
  template_name: null,
  external_id: null,
  created_at: iso(at),
  ...over,
});

/** The salon (A): its playbooks, its runs and its people's words, each seed beside what it counts. */
async function salon() {
  const tenant = await workspace("salon");
  const winbackTpl = await template(tenant, "winback_offer");
  const welcomeTpl = await template(tenant, "welcome_note");
  const reachTpl = await template(tenant, "reach_hello", "email");
  const winback = await moment(tenant, winbackTpl, { name: "Win-back", trigger: "quiet_30", policy_class: "reengage", template_name: "winback_offer" });
  const welcome = await moment(tenant, welcomeTpl, { name: "Welcome", trigger: "new_week", policy_class: "campaign", template_name: "welcome_note" });
  const lapsed = await moment(tenant, winbackTpl, { name: "Lapsed", trigger: "lapsed", policy_class: "reengage", template_name: "winback_offer" });
  const search = ok(
    await db
      .from("lead_searches")
      .insert({ tenant_id: tenant, via: "people", card: "movers", name: "Movers · Austin", asked: "movers in Austin", plan: {} })
      .select("id")
      .single(),
  ).id;
  const chain = ok(
    await db
      .from("playbooks")
      .insert({
        tenant_id: tenant,
        kind: "reach_out",
        trigger: "lead_first",
        name: "Reach out · Movers",
        template_id: reachTpl,
        template_name: "reach_hello",
        template_language: "en_US",
        params: [],
        policy_class: "outreach",
        gap_minutes: 12,
        lead_search_id: search,
        state: "running",
      })
      .select("id")
      .single(),
  ).id;
  const folk = await people(tenant, 150);
  let next = 0;
  const fresh = () => folk[next++];
  const T0 = NOW - 45 * DAY;
  const runs = [];
  const recipients = [];
  const messages = [];
  const runOf = (playbook, i, at, over = {}) => {
    const r = {
      id: uuid(),
      tenant_id: tenant,
      name: `Run ${i}`,
      template_id: winbackTpl,
      template_name: "winback_offer",
      template_language: "en_US",
      audience: { kind: "playbook", id: playbook, label: "Win-back", trigger: "quiet_30" },
      state: "sent",
      scheduled_for: iso(at),
      recipient_count: 0,
      playbook_id: playbook,
      run_for: dayOf(at),
      created_at: iso(at),
      ...over,
    };
    runs.push(r);
    return r;
  };
  /** One person on a run: with a message of the run's in their thread when `status` names its receipt. */
  const on = (run, who, state, { sentAt = null, status = null, channel = null } = {}) => {
    const sent = status ? message(tenant, who, sentAt, { status, channel: channel ?? "whatsapp" }) : null;
    if (sent) messages.push(sent);
    recipients.push({
      broadcast_id: run.id,
      contact_id: who.contact,
      tenant_id: tenant,
      state,
      reason: state === "skipped" ? "opted_out" : null,
      message_id: sent?.id ?? null,
      sent_at: sentAt === null ? null : iso(sentAt),
      channel,
    });
    run.recipient_count += 1;
  };
  /** What a person wrote: on their thread, at `at`. */
  const wrote = (who, at, over = {}) =>
    messages.push(
      message(tenant, who, at, { direction: "inbound", sender: "customer", type: "text", body: "Yes please", status: "received", meta: {}, ...over }),
    );

  // Win-back, runs 0-29, sent: three people sent (read, delivered, sent) and one held back. Run 7's second went by
  // email, run 8's first by text (a carrier's "read" is no read).
  const slots = {};
  for (let i = 0; i < 30; i += 1) {
    const at = T0 + i * DAY;
    const run = runOf(winback, i, at);
    const first = fresh();
    const second = fresh();
    slots[i] = { first, second, at };
    on(run, first, "sent", { sentAt: at, status: "read", channel: i === 8 ? "sms" : null });
    on(run, second, "sent", { sentAt: at + MIN, status: "delivered", channel: i === 7 ? "email" : null });
    on(run, fresh(), "sent", { sentAt: at + 2 * MIN, status: "sent" });
    on(run, fresh(), "skipped");
  }
  // Runs 30-39: three scheduled, one sending, two failed, three canceled, the newest waiting for a person.
  for (let i = 30; i < 40; i += 1) {
    const at = T0 + i * DAY;
    const state =
      i <= 32 ? "scheduled" : i === 33 ? "sending" : i <= 35 ? "failed" : i <= 38 ? "canceled" : "pending_approval";
    const run = runOf(winback, i, at, { state });
    if (state === "scheduled" || state === "pending_approval") {
      on(run, fresh(), "queued");
      on(run, fresh(), "queued");
    }
    if (state === "sending") {
      on(run, fresh(), "sent", { sentAt: at, status: "sent" });
      on(run, fresh(), "queued");
    }
    if (i === 34) {
      const first = fresh();
      slots[34] = { first, at };
      on(run, first, "failed", { sentAt: at, status: "delivered" });
      on(run, fresh(), "failed");
    }
    if (i === 35) {
      on(run, fresh(), "failed");
      on(run, fresh(), "failed");
    }
  }
  // One person on runs 20 and 24, four days apart: each answered by its own send.
  const x = fresh();
  for (const i of [20, 24]) on(runs.find((r) => r.name === `Run ${i}`), x, "sent", { sentAt: T0 + i * DAY + 3 * MIN, status: "delivered" });
  wrote(x, T0 + 20 * DAY + 3 * MIN + 2 * HOUR);
  wrote(x, T0 + 24 * DAY + 3 * MIN + HOUR);
  // What came back on the sent runs' first threads.
  wrote(slots[0].first, slots[0].at + HOUR); // a reply: counted
  wrote(slots[1].first, slots[1].at + 73 * HOUR); // past the 72 hours: not
  wrote(slots[2].first, slots[2].at + 2 * HOUR, { channel: "email", meta: { email: { claim: "auto_reply" } } }); // an out-of-office: not
  wrote(slots[3].first, slots[3].at + 2 * HOUR, { channel: "email", meta: { email: { claim: "booking_notice" } } }); // a booking tool's notice: not (00360)
  wrote(slots[4].first, slots[4].at + REPLY_WINDOW_MS); // at the window's edge: counted
  wrote(slots[5].first, slots[5].at + REPLY_WINDOW_MS + 1000); // a second past it: not
  wrote(slots[6].first, slots[6].at + HOUR); // twice on one thread: counted once
  wrote(slots[6].first, slots[6].at + 2 * HOUR);
  wrote(slots[7].second, slots[7].at + MIN + HOUR, { channel: "email", meta: { email: { claim: "person" } } }); // by email, their own words: counted
  wrote(slots[8].first, slots[8].at + HOUR, { channel: "voice", sender: "system", type: "call_summary" }); // a call's note: not
  wrote(slots[9].first, slots[9].at - HOUR); // before the send: not
  wrote(slots[34].first, slots[34].at + 3 * HOUR); // a failed person with a message, answered: counted
  // Welcome: three runs of two, delivered, nobody answered.
  for (let i = 0; i < 3; i += 1) {
    const at = T0 + i * DAY + 12 * HOUR;
    const run = runOf(welcome, 100 + i, at, {
      template_id: welcomeTpl,
      template_name: "welcome_note",
      audience: { kind: "playbook", id: welcome, label: "Welcome", trigger: "new_week" },
    });
    on(run, fresh(), "sent", { sentAt: at, status: "delivered" });
    on(run, fresh(), "sent", { sentAt: at + MIN, status: "delivered" });
  }
  // The chain's step run, a one-off broadcast, and the Inbox's template: none is a moment's run.
  const chainRun = runOf(chain, 200, T0 + 5 * HOUR, {
    template_id: reachTpl,
    template_name: "reach_hello",
    audience: { kind: "reach_out", root_id: chain, step_id: chain },
  });
  on(chainRun, fresh(), "sent", { sentAt: T0 + 5 * HOUR, status: "delivered", channel: "email" });
  const oneOff = runOf(null, 300, T0 + 7 * HOUR, { playbook_id: null, run_for: null, audience: { kind: "everyone", id: null, label: "Everyone" } });
  on(oneOff, fresh(), "sent", { sentAt: T0 + 7 * HOUR, status: "delivered" });
  on(oneOff, fresh(), "sent", { sentAt: T0 + 7 * HOUR + MIN, status: "read" });
  const inboxWho = fresh();
  messages.push(message(tenant, inboxWho, T0 + 30 * DAY, { meta: {}, template_name: "winback_offer", external_id: `wamid.salon-${RUN}` }));
  messages.push(message(tenant, inboxWho, T0 + 31 * DAY, { meta: {}, status: "queued", template_name: "winback_offer" })); // still in its veto window: not sent
  await insertAll("broadcasts", runs);
  await insertAll("messages", messages);
  await insertAll("broadcast_recipients", recipients);
  return {
    tenant,
    winback,
    welcome,
    lapsed,
    chain,
    runs,
    slots,
    T0,
    run: (playbook, i) => runs.find((r) => r.playbook_id === playbook && r.name === `Run ${i}`),
  };
}

/** The shop (B), past the fold's caps: 1,050 runs on Big, the oldest; eleven runs of 2,000 people on Wide, the newest. */
async function shop() {
  const tenant = await workspace("shop");
  const tpl = await template(tenant, "winback_offer");
  const big = await moment(tenant, tpl, { name: "Big", trigger: "lapsed", policy_class: "reengage", template_name: "winback_offer" });
  const wide = await moment(tenant, tpl, { name: "Wide", trigger: "new_week", policy_class: "campaign", template_name: "winback_offer" });
  const [alone] = await people(tenant, 1);
  const crowd = await people(tenant, 2000);
  const T0 = NOW - 30 * DAY;
  const runs = [];
  const recipients = [];
  const runOf = (playbook, name, at, runFor, count) => {
    const id = uuid();
    runs.push({
      id,
      tenant_id: tenant,
      name,
      template_id: tpl,
      template_name: "winback_offer",
      template_language: "en_US",
      audience: { kind: "playbook", id: playbook, label: name, trigger: "lapsed" },
      state: "sent",
      scheduled_for: iso(at),
      recipient_count: count,
      playbook_id: playbook,
      run_for: runFor,
      created_at: iso(at),
    });
    return id;
  };
  for (let i = 0; i < 1050; i += 1) {
    const at = T0 + i * MIN;
    const id = runOf(big, `Big ${i}`, at, dayOf(T0 - i * DAY), 1);
    recipients.push({ broadcast_id: id, contact_id: alone.contact, tenant_id: tenant, state: "sent", sent_at: iso(at) });
  }
  for (let j = 0; j < 11; j += 1) {
    const at = T0 + (1100 + j) * MIN;
    const id = runOf(wide, `Wide ${j}`, at, dayOf(T0 - j * DAY), 2000);
    for (const p of crowd) recipients.push({ broadcast_id: id, contact_id: p.contact, tenant_id: tenant, state: "sent", sent_at: iso(at) });
  }
  await insertAll("broadcasts", runs);
  await insertAll("broadcast_recipients", recipients);
  return { tenant, big, wide };
}

/** The studio (C): one run, two people on one thread, the second sent 80 hours after the first; a reply an hour after the first. */
async function studio() {
  const tenant = await workspace("studio");
  const tpl = await template(tenant, "winback_offer");
  const pb = await moment(tenant, tpl, { name: "Shared", trigger: "quiet_30", policy_class: "reengage", template_name: "winback_offer" });
  // The fold keeps the thread's send of the person whose id sorts last: the later send goes to that one.
  const [early, late] = [uuid(), uuid()].sort();
  await insertAll("contacts", [{ id: early, tenant_id: tenant }, { id: late, tenant_id: tenant }]);
  const thread = uuid();
  await insertAll("conversations", [{ id: thread, tenant_id: tenant, contact_id: early }]);
  const T = NOW - 10 * DAY;
  const run = uuid();
  await insertAll("broadcasts", [
    {
      id: run,
      tenant_id: tenant,
      name: "Shared run",
      template_id: tpl,
      template_name: "winback_offer",
      template_language: "en_US",
      audience: { kind: "playbook", id: pb, label: "Shared", trigger: "quiet_30" },
      state: "sent",
      scheduled_for: iso(T),
      recipient_count: 2,
      playbook_id: pb,
      run_for: dayOf(T),
      created_at: iso(T),
    },
  ]);
  const first = message(tenant, { contact: early, thread }, T);
  const second = message(tenant, { contact: late, thread }, T + 80 * HOUR);
  const reply = message(tenant, { contact: early, thread }, T + HOUR, { direction: "inbound", sender: "customer", type: "text", body: "Yes please", status: "received", meta: {} });
  await insertAll("messages", [first, second, reply]);
  await insertAll("broadcast_recipients", [
    { broadcast_id: run, contact_id: early, tenant_id: tenant, state: "sent", message_id: first.id, sent_at: iso(T) },
    { broadcast_id: run, contact_id: late, tenant_id: tenant, state: "sent", message_id: second.id, sent_at: iso(T + 80 * HOUR) },
  ]);
  return { tenant, pb, run };
}

let W;
/** Built once, whether it lands or fails: every test that needs it says the same thing. */
const world = () => (W ??= build());
async function build() {
  const A = await salon();
  const B = await shop();
  const C = await studio();
  const E = await workspace("empty");
  return { A, B, C, E };
}

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("the salon: playbook_totals says what every Win-back and Welcome run earned, the run that waits and the newest ten, and nothing of a playbook that never ran or of a reach-out's step", { skip }, async () => {
  const w = await world();
  const got = ok(await db.rpc("playbook_totals", { p_tenant_id: w.A.tenant, p_history: 10 }), "playbook_totals");
  assert.deepEqual(Object.keys(got).sort(), [w.A.winback, w.A.welcome].sort(), "the two moments that ran: not Lapsed, never the chain");
  const run = (i) => w.A.run(w.A.winback, i);
  const t = got[w.A.winback];
  // Sent: 30 runs x 3, the person on two runs, run 33's one. Delivered: two of three on each sent run, that person's
  // two, run 34's failed person with a delivered message. Replied: runs 0, 4, 6, 7, 20, 24 and 34. Held: 30 skipped, 4 failed.
  assert.deepEqual([t.runs, t.sent, t.delivered, t.replied, t.held], [40, 93, 63, 7, 34]);
  assert.deepEqual(t.last_run, { id: run(39).id, state: "pending_approval", run_for: run(39).run_for, recipient_count: 2 });
  assert.deepEqual(t.waiting, { id: run(39).id, recipient_count: 2, name: "Run 39", run_for: run(39).run_for, trigger: "quiet_30" });
  assert.deepEqual(
    t.history.map((h) => [h.id, h.state, h.recipient_count, h.sent, h.held, h.delivered, h.replied]),
    [
      [run(39).id, "pending_approval", 2, 0, 0, 0, 0],
      [run(38).id, "canceled", 0, 0, 0, 0, 0],
      [run(37).id, "canceled", 0, 0, 0, 0, 0],
      [run(36).id, "canceled", 0, 0, 0, 0, 0],
      [run(35).id, "failed", 2, 0, 2, 0, 0],
      [run(34).id, "failed", 2, 0, 2, 1, 1],
      [run(33).id, "sending", 2, 1, 0, 0, 0],
      [run(32).id, "scheduled", 2, 0, 0, 0, 0],
      [run(31).id, "scheduled", 2, 0, 0, 0, 0],
      [run(30).id, "scheduled", 2, 0, 0, 0, 0],
    ],
  );
  for (const h of t.history) {
    const seeded = w.A.runs.find((r) => r.id === h.id);
    assert.equal(Date.parse(h.scheduled_for), Date.parse(seeded.scheduled_for), "a run's time, as it was set");
    assert.equal(h.run_for, seeded.run_for);
  }
  const welcome = got[w.A.welcome];
  assert.deepEqual([welcome.runs, welcome.sent, welcome.delivered, welcome.replied, welcome.held, welcome.waiting], [3, 6, 6, 0, 0, null]);
  assert.equal(welcome.last_run.id, w.A.run(w.A.welcome, 102).id);
  assert.equal(welcome.history.length, 3);
  const three = ok(await db.rpc("playbook_totals", { p_tenant_id: w.A.tenant, p_history: 3 }), "three");
  assert.deepEqual(three[w.A.winback].history.map((h) => h.id), [run(39).id, run(38).id, run(37).id], "p_history is the card's ten, said by the caller");
});

test("the salon: run_counts says each run's people, receipts and replies as Sent and a run's sheet say them -- each thread once from its first send, the 72 hours to the second, a person's own words alone -- and nothing of a run nobody is on", { skip }, async () => {
  const w = await world();
  const id = (i) => w.A.run(w.A.winback, i).id;
  const got = ok(
    await db.rpc("run_counts", { p_tenant_id: w.A.tenant, p_run_ids: [0, 4, 5, 7, 8, 20, 34, 36, 39].map(id) }),
    "run_counts",
  );
  const counts = (queued, sent, skipped, failed, delivered, read, replied, whatsapp, sms, email) => ({
    queued,
    sent,
    skipped,
    failed,
    delivered,
    read,
    replied,
    sent_by: { whatsapp, sms, email },
  });
  assert.deepEqual(got[id(0)], counts(0, 3, 1, 0, 2, 1, 1, 3, 0, 0), "a reply an hour after");
  assert.deepEqual(got[id(4)], counts(0, 3, 1, 0, 2, 1, 1, 3, 0, 0), "a reply at the window's edge");
  assert.deepEqual(got[id(5)], counts(0, 3, 1, 0, 2, 1, 0, 3, 0, 0), "a second past it");
  assert.deepEqual(got[id(7)], counts(0, 3, 1, 0, 2, 1, 1, 2, 0, 1), "by email, in their own words");
  assert.deepEqual(got[id(8)], counts(0, 3, 1, 0, 2, 0, 0, 2, 1, 0), "a text a carrier read is no read; a call's note no reply");
  assert.deepEqual(got[id(20)], counts(0, 4, 1, 0, 3, 1, 1, 4, 0, 0), "the thread on two runs answers this one by its own send");
  assert.deepEqual(got[id(34)], counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0), "a failed person with a message, answered");
  assert.deepEqual(got[id(39)], counts(2, 0, 0, 0, 0, 0, 0, 0, 0, 0), "a run that waits: its people queued");
  assert.equal(got[id(36)], undefined, "a run nobody is on is absent: the dashboard says it as zeros");
  // The window is contracts' to the second: the edge counts and a second past it does not, as isReplyTo says.
  const edge = w.A.slots[4].at;
  const past = w.A.slots[5].at;
  assert.equal(isReplyTo(iso(edge), iso(edge + REPLY_WINDOW_MS)), true);
  assert.equal(isReplyTo(iso(past), iso(past + REPLY_WINDOW_MS + 1000)), false);
});

test("the salon: template_sends says how many of each message went out -- a person a run sent, or a template the Inbox sent that WhatsApp took -- and when the latest did", { skip }, async () => {
  const w = await world();
  const got = ok(await db.rpc("template_sends", { p_tenant_id: w.A.tenant }), "template_sends");
  assert.deepEqual(Object.keys(got).sort(), ["reach_hello", "welcome_note", "winback_offer"]);
  // Win-back's 93, the one-off's 2 and the Inbox's one that left; not the one still in its veto window.
  assert.deepEqual([got.winback_offer.count, got.welcome_note.count, got.reach_hello.count], [96, 6, 1]);
  assert.equal(Date.parse(got.winback_offer.last_at), w.A.T0 + 33 * DAY, "run 33's send, after the Inbox's on day 30");
  assert.equal(Date.parse(got.welcome_note.last_at), w.A.T0 + 2 * DAY + 12 * HOUR + MIN);
  assert.equal(Date.parse(got.reach_hello.last_at), w.A.T0 + 5 * HOUR);
});

test("the shop, past the fold's caps: 1,050 runs on one playbook and eleven runs of 2,000 people, every run and every person counted", { skip }, async () => {
  const w = await world();
  const got = ok(await db.rpc("playbook_totals", { p_tenant_id: w.B.tenant, p_history: 10 }), "playbook_totals");
  assert.deepEqual([got[w.B.big].runs, got[w.B.big].sent, got[w.B.big].history.length], [1050, 1050, 10]);
  assert.deepEqual([got[w.B.wide].runs, got[w.B.wide].sent], [11, 22000]);
});

test("the studio: a thread two people on one run share is answered from the run's first send there", { skip }, async () => {
  const w = await world();
  const got = ok(await db.rpc("playbook_totals", { p_tenant_id: w.C.tenant, p_history: 10 }), "playbook_totals");
  const t = got[w.C.pb];
  assert.deepEqual([t.runs, t.sent, t.delivered, t.replied], [1, 2, 2, 1]);
});

test("the floor: an empty workspace answers {}, and a member of another workspace reads {} of the salon's, where its own member reads what the service role reads", { skip }, async () => {
  const w = await world();
  assert.deepEqual(ok(await db.rpc("playbook_totals", { p_tenant_id: w.E })), {});
  assert.deepEqual(ok(await db.rpc("template_sends", { p_tenant_id: w.E })), {});
  assert.deepEqual(ok(await db.rpc("run_counts", { p_tenant_id: w.E, p_run_ids: [] })), {});
  const stranger = await member(w.E, "owner");
  const ids = w.A.runs.map((r) => r.id);
  assert.deepEqual(ok(await stranger.rpc("playbook_totals", { p_tenant_id: w.A.tenant })), {}, "row security is the floor");
  assert.deepEqual(ok(await stranger.rpc("run_counts", { p_tenant_id: w.A.tenant, p_run_ids: ids })), {});
  assert.deepEqual(ok(await stranger.rpc("template_sends", { p_tenant_id: w.A.tenant })), {});
  const own = await member(w.A.tenant, "viewer");
  assert.deepEqual(
    ok(await own.rpc("playbook_totals", { p_tenant_id: w.A.tenant })),
    ok(await db.rpc("playbook_totals", { p_tenant_id: w.A.tenant })),
    "a member reads its own workspace whole, p_history the card's ten by default",
  );
  assert.deepEqual(ok(await own.rpc("template_sends", { p_tenant_id: w.A.tenant })), ok(await db.rpc("template_sends", { p_tenant_id: w.A.tenant })));
});

test("the window is said once in SQL, contracts' 72 hours, and campaign_series reads it: Reports counts the salon's replies by it", { skip }, async () => {
  const w = await world();
  const [{ ms }] = query("select (extract(epoch from public.campaign_reply_window()) * 1000)::bigint as ms");
  assert.equal(Number(ms), REPLY_WINDOW_MS);
  const [{ reads, literal }] = query(
    `select p.prosrc ~ 'public\\.campaign_reply_window\\(\\)' as reads, p.prosrc ~ '72 hours' as literal
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'campaign_series'`,
  );
  assert.deepEqual([reads, literal], [true, false], "campaign_series reads the window, and writes no 72 hours of its own");
  const series = ok(await db.rpc("campaign_series", { p_tenant_id: w.A.tenant, p_days: 90 }), "campaign_series");
  const src = series.sources.find((s) => s.id === w.A.winback);
  // Per person sent (a failed one is not): runs 0, 4 (the edge), 6, 7 and the person on runs 20 and 24.
  assert.deepEqual([src.sent, src.replied], [93, 6]);
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && git add -N tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs
```

Expected: `# skip 0`; the seeds land (no `written:` failure); every test FAILs with `Could not find the function
public.playbook_totals` (or `run_counts`, `template_sends`, `campaign_reply_window`). If a seed write fails instead, fix
the seed (a column or CHECK the schema has), never the assertion.

- [ ] **Step 3: Commit the failing test**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs && git commit -m "$(cat <<'EOF'
Seeded truth for a playbook's totals, a run's counts and a message's sends, asked of the database before it counts them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Migration 00362 — the counts, counted where they are

**Files:**
- Create: `supabase/migrations/00362_a_playbook_s_runs_are_counted_where_they_are.sql`
- Modify: `supabase/schema.sql`, `supabase/migrations-ledger.json`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00362_a_playbook_s_runs_are_counted_where_they_are.sql`. Its `campaign_series` is
**00329's lines 11–171 verbatim except one line**: `                      and i.created_at <= s.sent_at + interval '72 hours')  as replied`
becomes `                      and i.created_at <= s.sent_at + public.campaign_reply_window())  as replied`. The full file:

```sql
-- 00362 · A playbook's runs, a run's people and a message's sends are counted where they are, in one read each.
--
-- GET playbooks summed every run's people and replies in the dashboard (listPlaybooks over listRuns, peopleOnRuns and
-- inboundOn): the runs were read unpaged, so PostgREST's thousand rows kept the newest thousand, reach-out steps' runs
-- among them, each two hundred runs' people were cut again at 20,000 rows, and every page's boot paid for it, on the
-- order of 150 round trips at 3,600 runs. Sent and a run's sheet counted a run in TypeScript beside it, and Settings'
-- GET templates?all=1 paged every sent person and every templated message for one count per message. Now:
--
--   campaign_reply_window  the 72 hours a reply to a campaign is counted in (contracts REPLY_WINDOW_HOURS and isReplyTo),
--                          said once in SQL; not WhatsApp's service window (contracts replyWindow). campaign_series reads
--                          it: its 00329 body with that one change.
--   run_counts             a run's queued, sent, skipped, failed, delivered, read (WhatsApp's own receipt), replied and
--                          sent by channel, by run id: what Sent, a run's sheet and a playbook's card all say. Replied is
--                          each thread the run reached, once, from its first send there, where the customer wrote words
--                          of their own (message_is_a_persons_words) within the window.
--   playbook_totals        each moment playbook's runs, sent, delivered, replied and held (its people skipped or failed),
--                          its newest run, the run that waits, and its newest p_history runs, from run_counts. Moments
--                          only: a reach-out step's runs share broadcasts and are never scanned. One jsonb by playbook id,
--                          which no row cap cuts; a playbook with no run is absent.
--   template_sends         how many of each message went out (a person a run marked sent, a template the Inbox sent that
--                          WhatsApp took) and when the latest did, by name.
--
-- Each runs on the caller's rights (security invoker), so row security decides what it reads, as campaign_series does,
-- and a member of another workspace reads nothing; language sql (no plan cached for a cost that runs from nothing to a
-- whole history), stable, an empty search_path. playbooks/totals/playbook-totals.db.test.mjs holds them to seeded truth.
--
-- Deploy order: either. A dashboard before this never calls them; one after it reads the old way while a function is
-- missing (packages/db isMissingDoor), for one release. Re-runnable: create or replace, grants restated.

create or replace function public.campaign_reply_window()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '72 hours'
$$;
revoke execute on function public.campaign_reply_window() from public, anon;
grant execute on function public.campaign_reply_window() to authenticated, service_role;
comment on function public.campaign_reply_window() is
  'The window a reply to a campaign is counted in after its send: 72 hours (contracts REPLY_WINDOW_HOURS and isReplyTo; playbooks/totals/playbook-totals.db.test.mjs holds the two equal). Not WhatsApp''s service window (contracts replyWindow). campaign_series and run_counts read it.';

create or replace function public.run_counts(p_tenant_id uuid, p_run_ids uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with people as (
    select r.broadcast_id, r.state, r.sent_at,
           -- The channel it went by (00298); a row naming none went by WhatsApp, as every run before channels did.
           case when r.channel in ('sms', 'email') then r.channel else 'whatsapp' end as channel,
           m.status, m.conversation_id
      from public.broadcast_recipients r
      left join public.messages m on m.id = r.message_id
     where r.tenant_id = p_tenant_id
       and r.broadcast_id = any (p_run_ids)
  ),
  counted as (
    select p.broadcast_id,
           count(*) filter (where p.state = 'queued')                           as queued,
           count(*) filter (where p.state = 'sent')                             as sent,
           count(*) filter (where p.state = 'skipped')                          as skipped,
           count(*) filter (where p.state = 'failed')                           as failed,
           count(*) filter (where p.status in ('delivered', 'read'))            as delivered,
           -- A read is WhatsApp's own receipt (0030): a text a carrier marked read is no read here.
           count(*) filter (where p.status = 'read' and p.channel = 'whatsapp') as was_read,
           count(*) filter (where p.state = 'sent' and p.channel = 'whatsapp')  as by_whatsapp,
           count(*) filter (where p.state = 'sent' and p.channel = 'sms')       as by_sms,
           count(*) filter (where p.state = 'sent' and p.channel = 'email')     as by_email
      from people p
     group by p.broadcast_id
  ),
  -- Each thread a run reached, once, from the first time it reached it there.
  threads as (
    select p.broadcast_id, p.conversation_id, min(p.sent_at) as sent_at
      from people p
     where p.conversation_id is not null and p.sent_at is not null
     group by p.broadcast_id, p.conversation_id
  ),
  replied as (
    select t.broadcast_id, count(*) as replied
      from threads t
     where exists (
             select 1 from public.messages i
              where i.conversation_id = t.conversation_id
                and i.tenant_id = p_tenant_id
                and i.direction = 'inbound'
                and i.sender = 'customer'
                and public.message_is_a_persons_words(i.meta)
                and i.created_at > t.sent_at
                and i.created_at <= t.sent_at + public.campaign_reply_window())
     group by t.broadcast_id
  )
  select coalesce(jsonb_object_agg(c.broadcast_id::text, jsonb_build_object(
           'queued', c.queued,
           'sent', c.sent,
           'skipped', c.skipped,
           'failed', c.failed,
           'delivered', c.delivered,
           'read', c.was_read,
           'replied', coalesce(y.replied, 0),
           'sent_by', jsonb_build_object('whatsapp', c.by_whatsapp, 'sms', c.by_sms, 'email', c.by_email))), '{}'::jsonb)
    from counted c
    left join replied y on y.broadcast_id = c.broadcast_id
$$;
revoke execute on function public.run_counts(uuid, uuid[]) from public, anon;
grant execute on function public.run_counts(uuid, uuid[]) to authenticated, service_role;
comment on function public.run_counts(uuid, uuid[]) is
  'Each named run''s people by state (queued, sent, skipped, failed), its receipts (delivered; read, WhatsApp''s own), the threads it reached that the customer answered in their own words within campaign_reply_window after the run first reached them there (replied), and what went by each channel (sent_by), by run id; a run nobody is on is absent. What Sent, a run''s sheet and a playbook''s card all say (00362). Security invoker: row security decides what is read.';

create or replace function public.playbook_totals(p_tenant_id uuid, p_history integer default 10)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with runs as (
    -- Moments only: a reach-out step's runs share broadcasts and are never scanned.
    select b.id, b.playbook_id, b.name, b.state, b.run_for, b.scheduled_for, b.recipient_count,
           case when jsonb_typeof(b.audience -> 'trigger') = 'string' then b.audience ->> 'trigger' end as trigger,
           row_number() over (partition by b.playbook_id order by b.created_at desc, b.id desc) as n
      from public.broadcasts b
      join public.playbooks p on p.id = b.playbook_id and p.tenant_id = b.tenant_id and p.kind = 'moment'
     where b.tenant_id = p_tenant_id
  ),
  counts as (
    -- Each run's counts as run_counts says them to Sent: one statement of what a run earned.
    select public.run_counts(p_tenant_id, coalesce(array_agg(x.id), '{}'::uuid[])) as c from runs x
  ),
  per_run as (
    select x.*,
           coalesce((k.c -> x.id::text ->> 'sent')::bigint, 0)      as sent,
           coalesce((k.c -> x.id::text ->> 'skipped')::bigint, 0)
             + coalesce((k.c -> x.id::text ->> 'failed')::bigint, 0) as held,
           coalesce((k.c -> x.id::text ->> 'delivered')::bigint, 0) as delivered,
           coalesce((k.c -> x.id::text ->> 'replied')::bigint, 0)   as replied
      from runs x
     cross join counts k
  )
  select coalesce(jsonb_object_agg(t.playbook_id::text, t.totals), '{}'::jsonb)  -- one scalar: no row cap cuts it
    from (
      select r.playbook_id, jsonb_build_object(
               'runs', count(*),
               'sent', sum(r.sent),
               'delivered', sum(r.delivered),
               'replied', sum(r.replied),
               'held', sum(r.held),
               'last_run', (array_agg(jsonb_build_object(
                              'id', r.id, 'state', r.state, 'run_for', r.run_for,
                              'recipient_count', r.recipient_count) order by r.n))[1],
               'waiting', (array_agg(jsonb_build_object(
                             'id', r.id, 'recipient_count', r.recipient_count, 'name', r.name,
                             'run_for', r.run_for, 'trigger', r.trigger) order by r.n)
                           filter (where r.state = 'pending_approval'))[1],
               'history', coalesce(jsonb_agg(jsonb_build_object(
                             'id', r.id, 'run_for', r.run_for, 'state', r.state,
                             'scheduled_for', r.scheduled_for, 'recipient_count', r.recipient_count,
                             'sent', r.sent, 'held', r.held, 'delivered', r.delivered, 'replied', r.replied)
                           order by r.n) filter (where r.n <= p_history), '[]'::jsonb)) as totals
        from per_run r
       group by r.playbook_id
    ) t
$$;
revoke execute on function public.playbook_totals(uuid, integer) from public, anon;
grant execute on function public.playbook_totals(uuid, integer) to authenticated, service_role;
comment on function public.playbook_totals(uuid, integer) is
  'Each moment playbook''s runs, sent, delivered, replied and held (its people skipped or failed), its newest run (last_run), the run waiting for a person (waiting, else null) and its newest p_history runs (history, newest first), by playbook id, from run_counts; a playbook with no run is absent, and a reach-out step''s runs are never scanned. One jsonb, which PostgREST''s row cap never cuts: what GET playbooks answers of every card (00362). Security invoker: row security decides what is read.';

create or replace function public.template_sends(p_tenant_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with went as (
    -- A person a run marked sent: what left, apart from what was delivered (Reports counts "Messages sent" so).
    select b.template_name as name, r.sent_at as at
      from public.broadcast_recipients r
      join public.broadcasts b on b.id = r.broadcast_id and b.tenant_id = r.tenant_id
     where r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and coalesce(b.template_name, '') <> ''
    union all
    -- A template the Inbox sent into a closed window, on its own message row, which left when WhatsApp took it (its
    -- wamid). A run's own messages name no template, so nothing above is counted again here.
    select m.template_name, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id
       and m.direction = 'outbound'
       and coalesce(m.template_name, '') <> ''
       and coalesce(m.external_id, '') <> ''
  )
  select coalesce(jsonb_object_agg(w.name, jsonb_build_object('count', w.n, 'last_at', w.last_at)), '{}'::jsonb)
    from (select x.name, count(*) as n, max(x.at) as last_at from went x group by x.name) w
$$;
revoke execute on function public.template_sends(uuid) from public, anon;
grant execute on function public.template_sends(uuid) to authenticated, service_role;
comment on function public.template_sends(uuid) is
  'How many times each message went out (a person a run marked sent; a template the Inbox sent that WhatsApp took, its wamid) and when the latest did, by name; a message never sent is absent. What Settings'' templates say (00362). Security invoker: row security decides what is read.';

create or replace function public.campaign_series(p_tenant_id uuid, p_days integer default 30)
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
  v_cur    date;
  v_result jsonb;
begin
  select timezone into v_tz from tenants where id = p_tenant_id;
  if v_tz is null then
    return jsonb_build_object('error', 'unknown_tenant');
  end if;

  v_span  := v_days * 2;
  v_today := (now() at time zone v_tz)::date;
  v_start := ((v_today - (v_span - 1))::timestamp) at time zone v_tz;
  v_cur   := v_today - (v_days - 1);

  with days as (
    select (v_today - (v_span - 1) + g)::date as day
      from generate_series(0, v_span - 1) g
  ),
  -- Every message a broadcast or a playbook run actually sent in the span,
  -- with the receipt WhatsApp gave it and the thread it landed in.
  sent as (
    select r.broadcast_id, r.contact_id, r.sent_at,
           -- The channel it went by (00298); a row from before channels went by WhatsApp, as every run then did.
           coalesce(r.channel, 'whatsapp') as channel,
           (r.sent_at at time zone v_tz)::date as day,
           m.status as message_status, m.conversation_id,
           b.playbook_id, b.name as broadcast_name, b.template_name
      from broadcast_recipients r
      join broadcasts b on b.id = r.broadcast_id
      left join messages m on m.id = r.message_id
     where r.tenant_id = p_tenant_id
       and r.state = 'sent'
       and r.sent_at >= v_start
  ),
  -- Replied: the customer wrote in that thread after the message went out, in their own words: not a call's note
  -- (an inbound row the system wrote) and not a program writing from their address (message_is_a_persons_words, 00299).
  -- The same rule the Broadcasts page counts by (the dashboard's broadcasts reader, contracts isPersonsWords).
  sent_r as (
    select s.*,
           (s.message_status in ('delivered', 'read')) as delivered,
           (s.message_status = 'read')                as was_read,
           exists (select 1 from messages i
                    where i.conversation_id = s.conversation_id
                      and i.direction = 'inbound'
                      and i.sender = 'customer'
                      and public.message_is_a_persons_words(i.meta)
                      and i.created_at > s.sent_at
                      and i.created_at <= s.sent_at + public.campaign_reply_window())  as replied
      from sent s
  ),
  -- A yes or a stop, from the desk or in the customer's own words: the
  -- consent ledger both doors write (00013, 00043), email's own answer with them (00174: the one-click unsubscribe an
  -- offer by email invites, and YES OFFERS by email), which this left out while offers went by WhatsApp alone. One
  -- answer a person a day each way: the unsubscribe page's "stop all" writes the STOP and email's own no for one
  -- press (stop_all_messages), and that is one stop.
  consent as (
    select distinct (e.created_at at time zone v_tz)::date as day, e.subject_id, e.data->>'consent' as consent
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.consent_changed'
       and e.created_at >= v_start
  ),
  -- Each day from one pass over each source, grouped by the day (00251), where a scalar subquery per day and per
  -- count scanned both again for every day.
  per_day as (
    select d.day,
           coalesce(s.sent, 0)      as sent,
           coalesce(s.delivered, 0) as delivered,
           coalesce(s.was_read, 0)  as was_read,
           coalesce(s.replied, 0)   as replied,
           coalesce(c.opt_ins, 0)   as opt_ins,
           coalesce(c.opt_outs, 0)  as opt_outs
      from days d
      left join (select s.day, count(*) as sent,
                        count(*) filter (where s.delivered) as delivered,
                        count(*) filter (where s.was_read)  as was_read,
                        count(*) filter (where s.replied)   as replied
                   from sent_r s group by s.day) s on s.day = d.day
      left join (select c.day,
                        count(*) filter (where c.consent = 'opted_in')  as opt_ins,
                        count(*) filter (where c.consent = 'opted_out') as opt_outs
                   from consent c group by c.day) c on c.day = d.day
  ),
  -- The current period by source: a playbook's runs together, a one-off
  -- broadcast on its own.
  sources as (
    select coalesce(s.playbook_id, s.broadcast_id) as id,
           (s.playbook_id is not null)             as is_playbook,
           coalesce(max(p.name), max(s.broadcast_name)) as name,
           max(s.template_name)                    as template_name,
           count(distinct s.broadcast_id)          as runs,
           count(*)                                as sent,
           count(*) filter (where s.delivered)     as delivered,
           count(*) filter (where s.was_read)      as was_read,
           count(*) filter (where s.replied)       as replied,
           max(s.sent_at)                          as last_at
      from sent_r s
      left join playbooks p on p.id = s.playbook_id
     where s.day >= v_cur
     group by coalesce(s.playbook_id, s.broadcast_id), (s.playbook_id is not null)
  ),
  -- The current period by the channel each message went by (0030): each channel's own receipts, read receipts
  -- WhatsApp's alone, so a share of them is said over WhatsApp's own sends.
  by_channel as (
    select s.channel,
           count(*)                            as sent,
           count(*) filter (where s.delivered) as delivered,
           count(*) filter (where s.was_read)  as was_read,
           count(*) filter (where s.replied)   as replied
      from sent_r s
     where s.day >= v_cur
     group by s.channel
  )
  select jsonb_build_object(
    'timezone', v_tz,
    'days', v_days,
    'span_days', v_span,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'series', (select jsonb_agg(jsonb_build_object(
                 'day', to_char(p.day, 'YYYY-MM-DD'),
                 'sent', p.sent,
                 'delivered', p.delivered,
                 'read', p.was_read,
                 'replied', p.replied,
                 'opt_ins', p.opt_ins,
                 'opt_outs', p.opt_outs) order by p.day)
               from per_day p),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', x.id,
                 'kind', case when x.is_playbook then 'playbook' else 'broadcast' end,
                 'name', x.name,
                 'template_name', x.template_name,
                 'runs', x.runs,
                 'sent', x.sent,
                 'delivered', x.delivered,
                 'read', x.was_read,
                 'replied', x.replied,
                 'last_at', x.last_at) order by x.sent desc, x.last_at desc)
               from sources x), '[]'::jsonb),
    'by_channel', coalesce((select jsonb_agg(jsonb_build_object(
                 'channel', c.channel,
                 'sent', c.sent,
                 'delivered', c.delivered,
                 'read', c.was_read,
                 'replied', c.replied) order by c.sent desc, c.channel)
               from by_channel c), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.campaign_series(uuid, integer) from public, anon;
grant execute on function public.campaign_series(uuid, integer) to authenticated;

comment on function public.campaign_series(uuid, integer) is
  'Reports › Campaigns: messages sent by broadcasts and playbook runs, delivered and read receipts, replies within campaign_reply_window (the customer''s own words: not a call''s note, an automatic reply, a list''s mail or a booking tool''s notice), yeses and stops (an unsubscribe from offers by email among them, 00174; one a person a day each way), day by day over two periods, and the current period by source and by the channel each went by (0030; a row naming none went by WhatsApp).';
```

- [ ] **Step 2: Prove `campaign_series` changed one line**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && diff <(sed -n '11,171p' supabase/migrations/00329_a_campaign_is_counted_by_its_channel.sql) <(awk '/^create or replace function public.campaign_series/{p=1} p{print} /^end \$\$;/{if(p)exit}' supabase/migrations/00362_a_playbook_s_runs_are_counted_where_they_are.sql)
```

Expected: one hunk, `59c59`, `interval '72 hours'` against `public.campaign_reply_window()`. Anything else: fix the file.

- [ ] **Step 3: Apply it and run the seeded truth**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && cp supabase/migrations/00362_a_playbook_s_runs_are_counted_where_they_are.sql "$SUPABASE_WORKDIR/supabase/migrations/" && "$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs
```

Expected: `# pass 7`, `# fail 0`, `# skip 0`. If a number differs, recount the seed by hand from Task 5's comments
before touching the SQL: the hand count is the oracle, the fold is not.

- [ ] **Step 4: The suites over `campaign_series` and the privileges**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-days.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out/email-marketing.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/privileges.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/partners/second-factor-catalog.db.test.mjs
```

Expected: each `# fail 0`, `# skip 0`.

- [ ] **Step 5: Regenerate the snapshot and record the ledger**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && corepack pnpm gen:schema-snapshot && node tooling/scripts/checks/migration-ledger.mjs --record && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs
```

Expected: `schema.sql` gains the four functions and `campaign_series`' changed line and comment; `# fail 0`.

- [ ] **Step 6: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add supabase/migrations/00362_a_playbook_s_runs_are_counted_where_they_are.sql supabase/schema.sql supabase/migrations-ledger.json && git commit -m "$(cat <<'EOF'
A playbook's totals, a run's counts and a message's sends are counted where they are, and the reply window is said once in SQL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Migration 00363 — every chain's numbers, behind one member check

**Files:**
- Create: `tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs`
- Create: `supabase/migrations/00363_every_chain_is_counted_behind_one_member_check.sql`
- Modify: `supabase/schema.sql`, `supabase/migrations-ledger.json`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs`:

```js
/**
 * Every chain's numbers (00363 reach_out_chain_totals), behind one question of who may read a workspace
 * (may_read_workspace), on a real Postgres. Reports' reach_out_report lists twenty chains, the ones that wrote in the
 * period, so the twenty-first and a chain that sent nothing were both absent; this answers every chain, by its id, and
 * says of each chain the report lists what the report says.
 *
 * Local stack only: it makes workspaces, members, chains, leads and their emails.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../_second-factor.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const TZ = "America/Chicago";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

let db;
let A;
let B;
let viewer;
let stranger;
const roots = [];
const users = [];
const ok = (res, what = "the read") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single(), "the write").id;

async function member(tenant, role) {
  const email = `chains-${role}-${RUN}-${users.length}@example.com`;
  const password = `pw-${RUN}-${role}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), "the membership");
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await c.auth.signInWithPassword({ email, password }), "the sign-in");
  return c;
}

/**
 * Twenty-four chains: 0-21 each wrote to one business in the last day (chain n, n hours ago), 22 wrote forty days ago,
 * 23 never wrote. Chain 0's business wrote back.
 */
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(db.from("tenants").insert({ slug: `chains-a-${RUN}`, name: "Chains A", timezone: TZ }));
  B = await one(db.from("tenants").insert({ slug: `chains-b-${RUN}`, name: "Chains B", timezone: TZ }));
  viewer = await member(A, "viewer");
  stranger = await member(B, "owner");
  const template = await one(
    db.from("templates").insert({ tenant_id: A, channel: "email", name: "reach_chain", language: "en", meta_status: "approved" }),
  );
  for (let n = 0; n < 24; n += 1) {
    const search = await one(
      db.from("lead_searches").insert({ tenant_id: A, via: "people", card: "movers", name: `Movers ${n}`, asked: `movers ${n}`, plan: {} }),
    );
    const root = await one(
      db.from("playbooks").insert({
        tenant_id: A,
        kind: "reach_out",
        trigger: "lead_first",
        name: `Reach out ${n}`,
        template_id: template,
        template_name: "reach_chain",
        template_language: "en",
        params: [],
        policy_class: "outreach",
        gap_minutes: 12,
        lead_search_id: search,
        state: "running",
      }),
    );
    roots.push(root);
    if (n === 23) continue;
    const run = await one(
      db.from("broadcasts").insert({
        tenant_id: A,
        name: `Movers ${n}`,
        template_id: template,
        template_name: "reach_chain",
        template_language: "en",
        audience: { kind: "reach_out", root_id: root, step_id: root },
        state: "sent",
        scheduled_for: new Date().toISOString(),
        playbook_id: root,
        run_for: "2097-01-01",
      }),
    );
    const contact = await one(db.from("contacts").insert({ tenant_id: A, email: `owner-${RUN}-${n}@example.com` }));
    const lead = await one(
      db.from("leads").insert({
        tenant_id: A,
        place_id: `ChIJchains${RUN}${n}`,
        business_name: `Chain Movers ${n}`,
        city: "Austin",
        region: "TX",
        email: `owner-${RUN}-${n}@example.com`,
        email_state: "ok",
        stage: "nurture",
        contact_id: contact,
      }),
    );
    const at = new Date(n === 22 ? Date.now() - 40 * DAY : Date.now() - n * HOUR).toISOString();
    ok(
      await db.from("reach_out_sends").insert({
        id: crypto.randomUUID(),
        tenant_id: A,
        broadcast_id: run,
        playbook_id: root,
        root_id: root,
        lead_id: lead,
        contact_id: contact,
        state: "sent",
        send_at: at,
        sent_at: at,
      }),
      "an email that left",
    );
    if (n === 0) {
      const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: contact }));
      ok(
        await db.from("messages").insert({
          tenant_id: A,
          conversation_id: thread,
          contact_id: contact,
          channel: "email",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "Tell me more",
          status: "received",
          meta: {},
        }),
        "the business wrote back",
      );
    }
  }
});

after(async () => {
  if (skip) return;
  for (const t of [A, B]) if (t) await db.from("tenants").delete().eq("id", t);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("every chain is answered by its id -- past the report's twenty, and with nothing sent -- saying what the report says of each it lists", { skip }, async () => {
  const totals = ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30 }), "the chains");
  assert.deepEqual(Object.keys(totals).sort(), [...roots].sort(), "every chain of the workspace, and nothing else");
  const report = ok(await viewer.rpc("reach_out_report", { p_tenant_id: A, p_days: 30 }), "the report");
  assert.equal(report.chains.length, 20, "the report's twenty");
  for (const c of report.chains) {
    const sum = (k) => c.steps.reduce((t, s) => t + s[k], 0);
    assert.deepEqual([totals[c.root_id].written, totals[c.root_id].wrote_back], [sum("written"), sum("wrote_back")], c.name);
    assert.equal(Date.parse(totals[c.root_id].last_at), Date.parse(c.last_at), `${c.name}: when it last wrote`);
  }
  const listed = new Set(report.chains.map((c) => c.root_id));
  const past = roots.slice(0, 22).filter((r) => !listed.has(r));
  assert.deepEqual(past, [roots[20], roots[21]], "the two oldest of this month's writers are past the report's twenty");
  for (const r of past) assert.equal(totals[r].written, 1, "and still say what they wrote");
  assert.deepEqual(totals[roots[22]], { written: 0, wrote_back: 0, last_at: null }, "wrote forty days ago: nothing in thirty");
  assert.deepEqual(totals[roots[23]], { written: 0, wrote_back: 0, last_at: null }, "never wrote: nothing, and never absent");
  assert.equal(totals[roots[0]].wrote_back, 1, "the business that wrote back");
  const ninety = ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 90 }), "ninety days");
  assert.equal(ninety[roots[22]].written, 1, "ninety days hold it");
  assert.equal(ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 500 }))[roots[22]].written, 1, "a period past 90 is held to 90");
});

test("a member's read alone: another workspace's member and a caller who is nobody are told the workspace is not found, and may_read_workspace says who may", { skip }, async () => {
  for (const [who, client] of [
    ["another workspace's member", stranger],
    ["the service role, nobody signed in", db],
  ]) {
    const r = await client.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30 });
    assert.ok(r.error, `${who}: refused`);
    assert.equal(r.error.code, "P0002", `${who}: ${r.error.message}`);
  }
  assert.equal(ok(await viewer.rpc("may_read_workspace", { p_tenant: A })), true, "a viewer reads its workspace");
  assert.equal(ok(await viewer.rpc("may_read_workspace", { p_tenant: B })), false, "and no other");
  assert.equal(ok(await db.rpc("may_read_workspace", { p_tenant: A })), false, "the service role is no member");
  const partner = await member(A, "partner");
  assert.equal(ok(await partner.rpc("may_read_workspace", { p_tenant: A })), false, "a partner's password alone (00261)");
  await showSecondFactor(partner);
  assert.equal(ok(await partner.rpc("may_read_workspace", { p_tenant: A })), true, "and once the session showed its code");
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && git add -N tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs
```

Expected: `# skip 0`; both tests FAIL with `Could not find the function public.reach_out_chain_totals`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00363_every_chain_is_counted_behind_one_member_check.sql`:

```sql
-- 00363 · Every chain's numbers are counted, behind one question of who may read a workspace.
--
-- Reach out Part 6's report (reach_out_report: 00241, 00261, 00361) lists at most twenty chains, the ones that wrote or
-- handed in the period, so a chain past the twentieth and a chain that sent nothing looked the same: absent. Campaigns'
-- ledger says each chain's last 30 days on its row, and "—" only where nothing was read. Now:
--
--   may_read_workspace(tenant)  whether the caller may read a workspace: a member of it, and a partner's seat only on a
--                               session that showed its second factor (00218, 00261, 00280). The member check ten definer
--                               reads write inline, said once for the next ones (those ten keep theirs until each is next
--                               changed). Security definer, since it reads memberships for the caller; it asks auth.uid(),
--                               never a parameter.
--   reach_out_chain_totals      every chain of the workspace (a reach-out's first step), by its id: what it wrote over the
--   (tenant, days)              last p_days days in the workspace's zone (1 to 90, held there as campaign_series holds its
--                               own), how many of the businesses it wrote to wrote back, and when it last wrote. One pass
--                               over the emails that left (email_left, email_sent_at), each business counted once a chain
--                               at its last email, wrote back as the report says it (outreach_wrote_back): for a chain
--                               the report lists, the sums of its steps. A chain that wrote nothing is
--                               { written: 0, wrote_back: 0, last_at: null }, never absent. Security definer, because
--                               outreach_wrote_back is the service role's; behind may_read_workspace.
--
-- reach-out-back/chain-totals.db.test.mjs holds both. Deploy order: either. Nothing calls reach_out_chain_totals until
-- Campaigns reads it, and that read says "—" while it is missing (packages/db isMissingDoor). Re-runnable.

create or replace function public.may_read_workspace(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant
       and m.user_id = auth.uid()
       and (m.role <> 'partner' or public.session_shows_second_factor()))
$$;
revoke execute on function public.may_read_workspace(uuid) from public, anon;
grant execute on function public.may_read_workspace(uuid) to authenticated, service_role;
comment on function public.may_read_workspace(uuid) is
  'Whether the caller (auth.uid(), never a parameter) may read this workspace: a member of it, a partner''s seat only on a session that showed its second factor (00218, 00261). The one member check for a definer read (00363); the ten that inline it keep theirs until each is next changed.';

create or replace function public.reach_out_chain_totals(p_tenant_id uuid, p_days integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_tz    text;
  v_since timestamptz;
begin
  if not public.may_read_workspace(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  select coalesce(nullif(t.timezone, ''), 'America/New_York') into v_tz from public.tenants t where t.id = p_tenant_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  v_since := (((now() at time zone v_tz)::date - (v_days - 1))::timestamp) at time zone v_tz;
  return (
    -- An email that left (email_left), dated by when it left (email_sent_at), as reach_out_report counts it.
    with sent as (
      select s.root_id, s.lead_id, s.contact_id,
             coalesce(s.sent_at, public.email_sent_at(m.meta, m.status_updated_at, m.created_at)) as sent_at
        from public.reach_out_sends s
        left join public.messages m on m.id = s.message_id
       where s.tenant_id = p_tenant_id
         and (s.state = 'sent' or (s.state = 'failed' and public.email_left(m.status, m.error)))
    ),
    period as (
      select x.* from sent x where x.sent_at >= v_since
    ),
    -- Each business once a chain, at its last email of the period.
    last_sent as (
      select distinct on (x.root_id, x.lead_id) x.root_id, x.lead_id, x.contact_id
        from period x
        join public.leads l on l.id = x.lead_id and l.tenant_id = p_tenant_id
       order by x.root_id, x.lead_id, x.sent_at desc
    ),
    wrote as (
      select w.contact_id from public.outreach_wrote_back(p_tenant_id, array(
        select distinct ls.contact_id from last_sent ls where ls.contact_id is not null)) w(contact_id)
    ),
    per_chain as (
      select x.root_id, count(*) as written, max(x.sent_at) as last_at
        from period x
       group by x.root_id
    ),
    wrote_back as (
      select ls.root_id, count(*) as wrote_back
        from last_sent ls
       where ls.contact_id in (select w.contact_id from wrote w)
       group by ls.root_id
    )
    select coalesce(jsonb_object_agg(r.id::text, jsonb_build_object(
             'written', coalesce(c.written, 0),
             'wrote_back', coalesce(b.wrote_back, 0),
             'last_at', c.last_at)), '{}'::jsonb)
      from public.playbooks r
      left join per_chain c on c.root_id = r.id
      left join wrote_back b on b.root_id = r.id
     where r.tenant_id = p_tenant_id and r.kind = 'reach_out' and r.trigger = 'lead_first'
  );
end $$;
revoke execute on function public.reach_out_chain_totals(uuid, integer) from public, anon;
grant execute on function public.reach_out_chain_totals(uuid, integer) to authenticated, service_role;
comment on function public.reach_out_chain_totals(uuid, integer) is
  'Every chain of the workspace (a reach-out''s first step), by its id, for a member (may_read_workspace): what it wrote over the last p_days days in the workspace''s zone (1 to 90), how many businesses it wrote to wrote back (outreach_wrote_back, each once a chain at its last email) and when it last wrote; a chain that wrote nothing is { written: 0, wrote_back: 0, last_at: null } (00363).';
```

- [ ] **Step 4: Apply, run, and run the doors' catalog**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && cp supabase/migrations/00363_every_chain_is_counted_behind_one_member_check.sql "$SUPABASE_WORKDIR/supabase/migrations/" && "$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/partners/second-factor-catalog.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/privileges.db.test.mjs
```

Expected: each `# fail 0`, `# skip 0`. The catalog passes because `may_read_workspace` asks
`session_shows_second_factor` and `reach_out_chain_totals` reads no seat itself; if it lists either, the gate is wrong:
fix the function, never `NOT_A_SEATS_DOOR`.

- [ ] **Step 5: Regenerate, record, commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && corepack pnpm gen:schema-snapshot && node tooling/scripts/checks/migration-ledger.mjs --record && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs && git add supabase/migrations/00363_every_chain_is_counted_behind_one_member_check.sql supabase/schema.sql supabase/migrations-ledger.json tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs && git commit -m "$(cat <<'EOF'
Every chain's numbers are counted, past the report's twenty, behind one question of who may read a workspace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Migration 00364 — a playbook changed is told to its workspace, and Campaigns' surfaces hear it

**Files:**
- Create: `supabase/migrations/00364_a_playbook_changed_is_told_to_its_workspace.sql`
- Modify: `packages/db/src/realtime.ts:63-67`, `packages/db/dist`
- Modify: `apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts:279-283`
- Modify: `apps/dashboard/src/surfaces/campaigns/reach-out/surface.ts:107-121`
- Modify: `tooling/scripts/tests/database/each-workspace-is-told-what-changed.db.test.mjs`
- Modify: `tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs`
- Modify: `supabase/schema.sql`, `supabase/migrations-ledger.json`

00321 is the precedent for the triggers; its publication step is **not** copied: 00324 took every table out of
`supabase_realtime`, and `database/realtime-publication.db.test.mjs` fails one put back.

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/database/each-workspace-is-told-what-changed.db.test.mjs`, in `world()`'s `declare` line
`      a uuid; b uuid; ta text; tb text; ca uuid; cb uuid; conv uuid; conv_b uuid; seg_a uuid; seg_b uuid;` append ` tpl uuid;`
(the line becomes `      a uuid; b uuid; ta text; tb text; ca uuid; cb uuid; conv uuid; conv_b uuid; seg_a uuid; seg_b uuid; tpl uuid;`),
and right after

```js
      delete from public.person_notes where tenant_id = b;
      ${told("note_removed")}
```

insert

```js

      -- A playbook made, paused and removed by a teammate (00364): Campaigns' rows and acts repaint. Its message is no
      -- watched row.
      insert into public.templates (tenant_id, channel, name, language, meta_status)
        values (a, 'whatsapp', 'told_offer', 'en_US', 'approved') returning id into tpl;
      ${told("template_made")}
      insert into public.playbooks (tenant_id, name, trigger, template_id, template_name, template_language, policy_class)
        values (a, 'Win-back', 'quiet_30', tpl, 'told_offer', 'en_US', 'reengage');
      ${told("playbook_made")}
      update public.playbooks set state = 'paused' where tenant_id = a;
      ${told("playbook_paused")}
      delete from public.playbooks where tenant_id = a;
      ${told("playbook_removed")}
```

and add this test after the test named `"a delete is told to the workspace it happened in"`:

```js
test("a playbook made, paused or removed is told to its workspace alone: the table and the event, never the row (00364)", { skip }, () => {
  const { steps } = world();
  assert.deepEqual(steps.template_made, [], "a message's row is not watched");
  assert.deepEqual(steps.playbook_made, [notice("a", "INSERT", "playbooks")]);
  assert.deepEqual(steps.playbook_paused, [notice("a", "UPDATE", "playbooks")]);
  assert.deepEqual(steps.playbook_removed, [notice("a", "DELETE", "playbooks")]);
});
```

In `tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs`, add after the test named
`"a run made or moved is heard by Campaigns' two surfaces wherever the tab is: Today's Approve row is drawn from them"`:

```js
test("a playbook paused, renamed or retimed in another tab is heard where Campaigns draws it: the playbooks and the reach-outs surfaces, which hear a run made or moved too (00364)", async () => {
  const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
  const { watchedTables } = await importSrc("packages/db/src/realtime.ts");
  const { playbooksOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts");
  const { reachOutsOverride } = await importSrc("apps/dashboard/src/surfaces/campaigns/reach-out/surface.ts");
  assert.ok(watchedTables().includes("playbooks"), "the database tells a workspace about its playbooks");
  const change = (table) => ({ table, event: "UPDATE", row: {} });
  for (const o of [playbooksOverride, reachOutsOverride]) {
    for (const table of ["playbooks", "broadcasts"]) {
      assert.equal(wantsRefresh(o, table), true, `${o.key} hears ${table}`);
      assert.equal(wantsRefresh(o, table, change(table)), true, `${o.key}: ${table} heard on any page`);
    }
  }
  // A message is no chain's: the chains' read never hears one.
  for (const table of ["messages", "conversations", "escalations"])
    assert.equal(wantsRefresh(reachOutsOverride, table), false, `reach_outs: ${table} is not its`);
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs; source "$ENV" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/each-workspace-is-told-what-changed.db.test.mjs
```

Expected: refresh-coverage FAILs `the database tells a workspace about its playbooks`; the db test FAILs the new test
(`playbook_made` is `[]`); every other test passes.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00364_a_playbook_changed_is_told_to_its_workspace.sql`:

```sql
-- 00364 · A playbook changed is told to its workspace.
--
-- A playbook paused, resumed, renamed or retimed in one tab or by a teammate, or stamped by the sweep's run, reached no
-- other open page: `playbooks` was not among the tables the database tells a workspace about (00265), so Campaigns kept
-- a paused playbook running on screen until something else re-read it (the ledger's report, P1-7). Now a statement that
-- makes, changes or removes a playbook is told on the workspace's topic as every watched table's is: the table and the
-- event, never the row. The triggers are 00265's, made the way 00321 made broadcasts'; packages/db realtime.ts lists the
-- table (WATCHED) and database/each-workspace-is-told-what-changed.db.test.mjs holds the two equal. A playbook's row
-- changes a few times a day at most (an edit, the sweep's last_run stamp), so the notices are few.
--
-- No place in supabase_realtime: the notices ride realtime.send, and 00324 took every table out of the publication
-- (database/realtime-publication.db.test.mjs fails one put back), so 00321's publication step is not copied.
--
-- Either deploy order works: until the dashboard listens for the table a notice is one Realtime drops, and a dashboard
-- that listens before the triggers exist hears nothing new. Re-runnable: each trigger is dropped first.

do $$
declare
  e text;
begin
  foreach e in array array['insert', 'update', 'delete'] loop
    execute format('drop trigger if exists %I on public.playbooks', 'workspace_tell_' || e);
    execute format(
      'create trigger %I after %s on public.playbooks referencing %s table as changed '
      'for each statement execute function public.workspace_tell_changes()',
      'workspace_tell_' || e, e, case e when 'delete' then 'old' else 'new' end);
  end loop;
end $$;
```

- [ ] **Step 4: The live feed lists it, and the two surfaces hear it**

In `packages/db/src/realtime.ts`, after

```ts
  // a run made by the sweep, approved, stopped, sending or finished: Today's Approve and Stop rows and Campaigns
  // repaint (00321). Its people are not watched: a run's page reads them when it opens.
  { table: "broadcasts", events: EVERY },
```

insert

```ts
  // a playbook paused, resumed, renamed or retimed by a teammate, or stamped by the sweep's run: Campaigns' rows and
  // their acts repaint (00364)
  { table: "playbooks", events: EVERY },
```

In `apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts`, replace

```ts
  // A run the sweep made, or one approved or stopped elsewhere (00321), moves a playbook's row and its "next run":
  // heard wherever the tab is. A message moves a playbook's replies: read again only while its page is on screen, and
  // once when it comes back (surface-registry.ts).
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "broadcasts"],
```

with

```ts
  // A run the sweep made, or one approved or stopped elsewhere (00321), and a playbook paused, renamed or retimed by a
  // teammate (00364), move a playbook's row and its "next run": heard wherever the tab is. A message moves a playbook's
  // replies: read again only while its page is on screen, and once when it comes back (surface-registry.ts).
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "broadcasts", "playbooks"],
```

In `apps/dashboard/src/surfaces/campaigns/reach-out/surface.ts`, in `reachOutsOverride`, after
`  events: ["surface:reach_outs"],` insert

```ts
  // A chain paused or resumed elsewhere (00364), and a step's run made, approved or stopped (00321), move its row and
  // its Approve: heard wherever the tab is. A message is no chain's, and is never heard here.
  refreshOnTables: ["playbooks", "broadcasts"],
```

- [ ] **Step 5: Build db, apply the migration, run every test that names these**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && corepack pnpm --filter @chanlytics/db build && for f in shell/surfaces/refresh-coverage shell/surfaces/message-fan-out shell/surfaces/surface-boot people/lists/a-list-has-a-life playbooks/campaigns-seam reach-out-sheet/reach-out-rows reports/headline/headline-boot; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs || break; done
```

Expected: each `# fail 0`.

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && cp supabase/migrations/00364_a_playbook_changed_is_told_to_its_workspace.sql "$SUPABASE_WORKDIR/supabase/migrations/" && "$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/each-workspace-is-told-what-changed.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/realtime-publication.db.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/privileges.db.test.mjs
```

Expected: each `# fail 0`, `# skip 0`.

- [ ] **Step 6: Regenerate, record, commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && corepack pnpm gen:schema-snapshot && node tooling/scripts/checks/migration-ledger.mjs --record && node tooling/scripts/checks/test.mjs tooling/scripts/tests/database/migrations.test.mjs && git add supabase/migrations/00364_a_playbook_changed_is_told_to_its_workspace.sql supabase/schema.sql supabase/migrations-ledger.json packages/db/src/realtime.ts packages/db/dist apps/dashboard/src/surfaces/campaigns/playbooks/surface.ts apps/dashboard/src/surfaces/campaigns/reach-out/surface.ts tooling/scripts/tests/database/each-workspace-is-told-what-changed.db.test.mjs tooling/scripts/tests/shell/surfaces/refresh-coverage.test.mjs && git commit -m "$(cat <<'EOF'
A playbook changed is told to its workspace, and Campaigns' playbooks and reach-outs hear it wherever the tab is

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: The generated files follow the five migrations

**Files:**
- Modify: `packages/db/src/database.types.ts`, `packages/db/dist` (regenerated)
- Check: `packages/contracts/src/schema-sets.generated.ts`, `docs/data-model.md`, `tooling/scripts/tests/_unique-keys.generated.json` (must not change)

- [ ] **Step 1: Regenerate from a clean replay**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && "$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR" && corepack pnpm gen:schema-snapshot && corepack pnpm gen:db-types && corepack pnpm gen:schema-sets && corepack pnpm gen:data-model && git status --short
```

Expected `git status --short`: ` M packages/db/src/database.types.ts` only (`schema.sql` unchanged since Task 8). In
`database.types.ts` the `Functions` gain `campaign_reply_window`, `may_read_workspace`, `playbook_totals`,
`reach_out_chain_totals`, `run_counts` and `template_sends`, nothing else changes. If `schema-sets.generated.ts`,
`docs/data-model.md` or `_unique-keys.generated.json` changed, stop and report (no CHECK, table or index changed).

- [ ] **Step 2: Build db, typecheck, and run the tests that read the schema**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && corepack pnpm --filter @chanlytics/db build && corepack pnpm --filter @chanlytics/db typecheck && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/broadcasts/broadcast-counts-are-whole.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/send-rails.test.mjs
```

Expected: each `# fail 0` (no code calls the new functions yet, so the fake database's knowing them changes nothing).

- [ ] **Step 3: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add packages/db/src/database.types.ts packages/db/dist && git commit -m "$(cat <<'EOF'
The database's types name the counts, the reply window, the chains' totals and the member check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Contracts read the three answers, never through a cast

**Files:**
- Create: `packages/contracts/src/playbooks/playbook-totals.ts`
- Modify: `packages/contracts/src/playbooks/index.ts`
- Modify: `packages/contracts/src/broadcasts/broadcasts.ts` (after `BroadcastCounts`, ~line 221), `.../broadcasts/index.ts`
- Modify: `packages/contracts/src/templates/templates.ts` (after `templateSends`, ~line 543), `.../templates/index.ts`
- Modify: `packages/contracts/src/browser.generated.ts`, `packages/contracts/dist`
- Create: `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`:

```js
/**
 * A playbook's totals, a run's counts and a message's sends (00362), as the dashboard reads them: contracts' guards and
 * mappings, the fake database's twins of the three functions, and Sent, GET playbooks and Settings' templates saying
 * the same counted by the database as by the fold they replace. Over the database in memory (_fake-db.mjs); the twins
 * are held to SQL in playbook-totals.db.test.mjs, and packages/db's doors in reports/report-repository.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaybookTotalsDto, runCountsOf, templateSendsOf } from "@chanlytics/contracts";

test("isPlaybookTotalsDto takes playbook_totals' answer -- by playbook id, each with its last run, the run that waits or null, and its history -- and nothing else", () => {
  const row = {
    runs: 2,
    sent: 3,
    delivered: 2,
    replied: 1,
    held: 1,
    last_run: { id: "b1", state: "sent", run_for: "2026-09-02", recipient_count: 2 },
    waiting: null,
    history: [
      { id: "b1", run_for: "2026-09-02", state: "sent", scheduled_for: "2026-09-02T14:00:00+00:00", recipient_count: 2, sent: 2, held: 0, delivered: 1, replied: 1 },
    ],
  };
  assert.equal(isPlaybookTotalsDto({}), true, "no playbook has run");
  assert.equal(isPlaybookTotalsDto({ p1: row }), true);
  assert.equal(
    isPlaybookTotalsDto({ p1: { ...row, waiting: { id: "b2", recipient_count: 4, name: "Run 2", run_for: null, trigger: null } } }),
    true,
    "a run that waits, with no day and no moment kept",
  );
  for (const [bad, why] of [
    [null, "null"],
    [[], "an array"],
    ["{}", "text"],
    [{ p1: { ...row, runs: "2" } }, "a count as text"],
    [{ p1: { ...row, last_run: null } }, "a playbook in the answer has run"],
    [{ p1: { ...row, history: [{ ...row.history[0], scheduled_for: null }] } }, "a run's time is never empty"],
    [{ p1: { ...row, waiting: { id: "b2" } } }, "a waiting run says its people, its name, its day and its moment"],
    [{ p1: { ...row, lastRun: row.last_run, last_run: undefined } }, "memory's casing is not the database's"],
  ])
    assert.equal(isPlaybookTotalsDto(bad), false, why);
});

test("runCountsOf reads run_counts' answer in the order Sent has always written a run's counts, and templateSendsOf template_sends' in memory's casing; another shape is null", () => {
  const raw = { b1: { sent_by: { email: 1, sms: 0, whatsapp: 2 }, replied: 1, read: 1, delivered: 2, failed: 0, skipped: 1, sent: 3, queued: 0 } };
  const got = runCountsOf(raw);
  assert.deepEqual(got, { b1: { queued: 0, sent: 3, skipped: 1, failed: 0, delivered: 2, read: 1, replied: 1, sent_by: { whatsapp: 2, sms: 0, email: 1 } } });
  assert.equal(
    JSON.stringify(got.b1),
    '{"queued":0,"sent":3,"skipped":1,"failed":0,"delivered":2,"read":1,"replied":1,"sent_by":{"whatsapp":2,"sms":0,"email":1}}',
    "the fold's key order, whatever order jsonb keeps",
  );
  assert.deepEqual(runCountsOf({}), {});
  for (const bad of [null, [], { b1: { ...raw.b1, sent: "3" } }, { b1: { ...raw.b1, sent_by: null } }, { b1: { ...raw.b1, sent_by: { whatsapp: 2 } } }])
    assert.equal(runCountsOf(bad), null, JSON.stringify(bad));
  assert.deepEqual(
    templateSendsOf({ winback_offer: { count: 3, last_at: "2026-09-17T14:00:00+00:00" }, never_timed: { count: 1, last_at: null } }),
    { winback_offer: { count: 3, lastAt: "2026-09-17T14:00:00+00:00" }, never_timed: { count: 1, lastAt: null } },
  );
  assert.deepEqual(templateSendsOf({}), {});
  for (const bad of [null, [], { x: { count: "3", last_at: null } }, { x: { count: 3 } }])
    assert.equal(templateSendsOf(bad), null, JSON.stringify(bad));
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add -N tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs
```

Expected: FAIL, `isPlaybookTotalsDto is not a function` and `runCountsOf is not a function`.

- [ ] **Step 3: Write the guard module**

Create `packages/contracts/src/playbooks/playbook-totals.ts`:

```ts
/**
 * What a moment playbook's runs earned, as the database counts it (playbook_totals, 00362): one entry per moment
 * playbook that has run, by its id, in storage's casing. The dashboard reads it into a card's totals (server
 * campaigns/playbooks.ts toPlaybookTotals) behind isPlaybookTotalsDto, never a cast, and GET playbooks answers the same
 * bytes it answered when it summed every run itself. A playbook that never ran is absent.
 */
import { recordOrNull } from "../shared/unknown";

/** One run on a card's history, newest first: the day it ran for, and what it earned. */
interface PlaybookHistoryRunDto {
  id: string;
  run_for: string | null;
  state: string;
  scheduled_for: string;
  recipient_count: number;
  sent: number;
  /** Its people skipped or failed: a run's "held", the glossary's first sense of the word. */
  held: number;
  delivered: number;
  replied: number;
}

/** One moment playbook's totals over every run it made, its newest run, the run that waits, and its newest few. */
interface PlaybookTotalsRowDto {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  last_run: { id: string; state: string; run_for: string | null; recipient_count: number };
  waiting: { id: string; recipient_count: number; name: string; run_for: string | null; trigger: string | null } | null;
  history: PlaybookHistoryRunDto[];
}

/** playbook_totals' answer: each moment playbook that has run, by its id. */
export type PlaybookTotalsDto = Record<string, PlaybookTotalsRowDto>;

const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isTextOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

function isHistoryRun(v: unknown): v is PlaybookHistoryRunDto {
  const r = recordOrNull(v);
  return (
    !!r &&
    isText(r.id) &&
    isTextOrNull(r.run_for) &&
    isText(r.state) &&
    isText(r.scheduled_for) &&
    isCount(r.recipient_count) &&
    isCount(r.sent) &&
    isCount(r.held) &&
    isCount(r.delivered) &&
    isCount(r.replied)
  );
}

function isLastRun(v: unknown): v is PlaybookTotalsRowDto["last_run"] {
  const r = recordOrNull(v);
  return !!r && isText(r.id) && isText(r.state) && isTextOrNull(r.run_for) && isCount(r.recipient_count);
}

function isWaiting(v: unknown): v is NonNullable<PlaybookTotalsRowDto["waiting"]> {
  const r = recordOrNull(v);
  return (
    !!r && isText(r.id) && isCount(r.recipient_count) && isText(r.name) && isTextOrNull(r.run_for) && isTextOrNull(r.trigger)
  );
}

function isTotalsRow(v: unknown): v is PlaybookTotalsRowDto {
  const r = recordOrNull(v);
  return (
    !!r &&
    isCount(r.runs) &&
    isCount(r.sent) &&
    isCount(r.delivered) &&
    isCount(r.replied) &&
    isCount(r.held) &&
    isLastRun(r.last_run) &&
    (r.waiting === null || isWaiting(r.waiting)) &&
    Array.isArray(r.history) &&
    r.history.every(isHistoryRun)
  );
}

/** Whether the database answered playbook_totals: totals by playbook id, each whole (an empty object: none has run). */
export function isPlaybookTotalsDto(answer: unknown): answer is PlaybookTotalsDto {
  const byId = recordOrNull(answer);
  return !!byId && Object.values(byId).every(isTotalsRow);
}
```

In `packages/contracts/src/playbooks/index.ts`, add after the line `export type { RunMessage } from "./playbook-purpose";`:

```ts
export { isPlaybookTotalsDto } from "./playbook-totals";
export type { PlaybookTotalsDto } from "./playbook-totals";
```

- [ ] **Step 4: `runCountsOf` beside `BroadcastCounts`**

In `packages/contracts/src/broadcasts/broadcasts.ts`, add `import { finiteOrNull, recordOrNull } from "../shared/unknown";`
after `import { MIN_MS } from "../shared/time";`, and right after the `BroadcastCounts` interface's closing `}` insert:

```ts

/** What run_counts says of each run (00362), in the order Sent writes a run's counts. */
const RUN_COUNTED = ["queued", "sent", "skipped", "failed", "delivered", "read", "replied"] as const;

/**
 * run_counts' answer (00362), by run id, read into Sent's counts in the order the page has always written them (a run
 * nobody is on is absent, and the caller says it as zeros). Null when the answer is not that shape: a read that failed,
 * never a run with nothing in it.
 */
export function runCountsOf(answer: unknown): Record<string, BroadcastCounts> | null {
  const byRun = recordOrNull(answer);
  if (!byRun) return null;
  const out: Record<string, BroadcastCounts> = {};
  for (const [id, raw] of Object.entries(byRun)) {
    const c = recordOrNull(raw);
    const by = recordOrNull(c?.sent_by);
    if (!c || !by) return null;
    const counts: BroadcastCounts = { queued: 0, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
    for (const k of RUN_COUNTED) {
      const n = finiteOrNull(c[k]);
      if (n === null) return null;
      counts[k] = n;
    }
    const whatsapp = finiteOrNull(by.whatsapp);
    const sms = finiteOrNull(by.sms);
    const email = finiteOrNull(by.email);
    if (whatsapp === null || sms === null || email === null) return null;
    out[id] = { ...counts, sent_by: { whatsapp, sms, email } };
  }
  return out;
}
```

In `packages/contracts/src/broadcasts/index.ts`, add `runCountsOf,` to the `export { … } from "./broadcasts";` list
(after `RUN_FILTERS,`).

- [ ] **Step 5: `templateSendsOf` beside `templateSends`**

In `packages/contracts/src/templates/templates.ts`, add `import { recordOrNull } from "../shared/unknown";` after
`import { agoWords } from "../shared/time";`, and right after `templateSends`' closing `}` insert:

```ts

/**
 * template_sends' answer (00362), by message name: storage's `last_at` read into memory's `lastAt`. Null when it is not
 * that shape, which the reader says as a read that failed, never as a message nothing sent.
 */
export function templateSendsOf(answer: unknown): Record<string, TemplateSends> | null {
  const byName = recordOrNull(answer);
  if (!byName) return null;
  const out: Record<string, TemplateSends> = {};
  for (const [name, raw] of Object.entries(byName)) {
    const s = recordOrNull(raw);
    if (!s || typeof s.count !== "number" || !(s.last_at === null || typeof s.last_at === "string")) return null;
    out[name] = { count: s.count, lastAt: s.last_at };
  }
  return out;
}
```

In `packages/contracts/src/templates/index.ts`, add `templateSendsOf,` after `templateSends,`.

- [ ] **Step 6: Build, regenerate the browser entry, run**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add -N packages/contracts/src/playbooks/playbook-totals.ts && corepack pnpm --filter @chanlytics/contracts build && node tooling/scripts/gen/contracts-browser-entry.mjs && corepack pnpm --filter @chanlytics/contracts typecheck && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/shipping/browser-entry.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/contracts-barrels.test.mjs && node tooling/scripts/checks/test.mjs tooling/scripts/tests/templates/template-sends.test.mjs
```

Expected: each `# fail 0`.

- [ ] **Step 7: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add packages/contracts/src/playbooks/playbook-totals.ts packages/contracts/src/playbooks/index.ts packages/contracts/src/broadcasts/broadcasts.ts packages/contracts/src/broadcasts/index.ts packages/contracts/src/templates/templates.ts packages/contracts/src/templates/index.ts packages/contracts/src/browser.generated.ts packages/contracts/dist tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs && git commit -m "$(cat <<'EOF'
Contracts read a playbook's totals, a run's counts and a message's sends as the database answers them, behind guards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `packages/db` calls the four functions, answering "missing" for one release

**Files:**
- Modify: `packages/db/src/repositories/reports/report-series.ts`
- Modify: `packages/db/src/index.ts:217`, `packages/db/dist`
- Modify: `tooling/scripts/tests/reports/report-repository.test.mjs`
- Modify: `tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs` (the dashboard's door)

- [ ] **Step 1: Write the failing tests**

In `tooling/scripts/tests/reports/report-repository.test.mjs`, change the header's sentence `It alone answers null where
the database does not have its function yet (00350 is applied after the dashboard deploys).` to `It answers null where
the database does not have its function yet (00350 is applied after the dashboard deploys), and the counts beside it
(00362, 00363) answer "missing", for one release.`; change the import to

```js
import {
  campaignSeries,
  playbookTotals,
  reachOutChainTotals,
  reachOutReport,
  reportSeries,
  reviewsLedger,
  runCounts,
  templateSends,
} from "@chanlytics/db";
```

and append:

```js
test("the counts' doors (00362, 00363) ask by name for the workspace, answer what the database says, answer 'missing' for a database without the function -- PostgREST's PGRST202, Postgres's 42883 -- so the dashboard reads the old way for one release, and throw every other failure", async () => {
  const { db, asked } = dbWith({
    playbook_totals: { data: { p1: {} }, error: null },
    run_counts: { data: {}, error: null },
    template_sends: { data: {}, error: null },
    reach_out_chain_totals: { data: {}, error: null },
  });
  assert.deepEqual(await playbookTotals(db, W, 10), { p1: {} });
  assert.deepEqual(await runCounts(db, W, ["b1", "b2"]), {});
  assert.deepEqual(await templateSends(db, W), {});
  assert.deepEqual(await reachOutChainTotals(db, W, 30), {});
  assert.deepEqual(asked, [
    ["playbook_totals", { p_tenant_id: W, p_history: 10 }],
    ["run_counts", { p_tenant_id: W, p_run_ids: ["b1", "b2"] }],
    ["template_sends", { p_tenant_id: W }],
    ["reach_out_chain_totals", { p_tenant_id: W, p_days: 30 }],
  ]);
  for (const code of ["PGRST202", "42883"]) {
    const gone = { data: null, error: { message: "Could not find the function", code } };
    const missing = dbWith({ playbook_totals: gone, run_counts: gone, template_sends: gone, reach_out_chain_totals: gone }).db;
    assert.equal(await playbookTotals(missing, W, 10), "missing", code);
    assert.equal(await runCounts(missing, W, []), "missing", code);
    assert.equal(await templateSends(missing, W), "missing", code);
    assert.equal(await reachOutChainTotals(missing, W, 30), "missing", code);
  }
  const down = { data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } };
  const slow = dbWith({ playbook_totals: down, run_counts: down, template_sends: down, reach_out_chain_totals: down }).db;
  await assert.rejects(playbookTotals(slow, W, 10), /playbook_totals: canceling statement/);
  await assert.rejects(runCounts(slow, W, []), /run_counts: canceling statement/);
  await assert.rejects(templateSends(slow, W), /template_sends: canceling statement/);
  await assert.rejects(reachOutChainTotals(slow, W, 30), /reach_out_chain_totals: canceling statement/);
});
```

In `tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs`, add `import { reachOutChainTotals } from "@chanlytics/db";`
after the `showSecondFactor` import, and append:

```js
test("the dashboard reads every chain through packages/db's door, as the member it is signed in as", { skip }, async () => {
  assert.deepEqual(
    await reachOutChainTotals(viewer, A, 30),
    ok(await viewer.rpc("reach_out_chain_totals", { p_tenant_id: A, p_days: 30 })),
  );
  await assert.rejects(reachOutChainTotals(stranger, A, 30), /reach_out_chain_totals: Workspace not found/);
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs
```

Expected: the new test FAILs (`playbookTotals is not a function`); the others pass.

- [ ] **Step 3: Write the doors**

In `packages/db/src/repositories/reports/report-series.ts`, replace the header's first sentence
`The report functions Reports reads (00251, 00304, 00241, 00350): the receptionist's series, the campaigns', the reviews' and the reach-outs', each over a period of days and the period before it.`
with
`The report functions Reports reads (00251, 00304, 00241, 00350): the receptionist's series, the campaigns', the reviews' and the reach-outs', each over a period of days and the period before it; and the counts Campaigns reads (00362, 00363): a playbook's totals, a run's counts, a message's sends and every chain's numbers.`
(keep the rest of the header), and append at the end of the file:

```ts

/**
 * A door's answer where the database may not have the function yet: its data, or "missing" on a database before its
 * migration (isMissingDoor), where the dashboard reads the old way for one release so either deploy order works. Any
 * other failure throws: "we could not read" is never "none", nor "missing".
 */
function answerOrMissing(name: string, data: Json, error: { code: string; message: string } | null): Json | "missing" {
  if (!error) return data;
  if (isMissingDoor(error)) return "missing";
  throw new Error(`${name}: ${error.message}`);
}

/**
 * What each moment playbook's runs earned, with its newest `history` runs (`playbook_totals`, 00362): one jsonb by
 * playbook id, which PostgREST's row cap never cuts; contracts' isPlaybookTotalsDto reads it.
 */
export async function playbookTotals(db: Db, tenantId: string, history: number): Promise<Json | "missing"> {
  const { data, error } = await db.rpc("playbook_totals", { p_tenant_id: tenantId, p_history: history });
  return answerOrMissing("playbook_totals", data, error);
}

/** Each run's people, receipts and replies, by run id (`run_counts`, 00362): what Sent, a run's sheet and a card say. */
export async function runCounts(db: Db, tenantId: string, runIds: readonly string[]): Promise<Json | "missing"> {
  const { data, error } = await db.rpc("run_counts", { p_tenant_id: tenantId, p_run_ids: [...runIds] });
  return answerOrMissing("run_counts", data, error);
}

/** How many of each message went out, and when the latest did, by name (`template_sends`, 00362). */
export async function templateSends(db: Db, tenantId: string): Promise<Json | "missing"> {
  const { data, error } = await db.rpc("template_sends", { p_tenant_id: tenantId });
  return answerOrMissing("template_sends", data, error);
}

/**
 * Every chain's last `days`, by its first step's id (`reach_out_chain_totals`, 00363): what it wrote, how many wrote
 * back, when it last wrote. A definer behind may_read_workspace: a caller who is no member is refused (P0002), thrown.
 */
export async function reachOutChainTotals(db: Db, tenantId: string, days: number): Promise<Json | "missing"> {
  const { data, error } = await db.rpc("reach_out_chain_totals", { p_tenant_id: tenantId, p_days: days });
  return answerOrMissing("reach_out_chain_totals", data, error);
}
```

In `packages/db/src/index.ts`, replace line 217's export with

```ts
export {
  reportSeries,
  campaignSeries,
  reviewsLedger,
  reachOutReport,
  playbookTotals,
  runCounts,
  templateSends,
  reachOutChainTotals,
} from "./repositories/reports/report-series";
```

- [ ] **Step 4: Build, typecheck, run**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && corepack pnpm --filter @chanlytics/db build && corepack pnpm --filter @chanlytics/db typecheck && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reports/report-repository.test.mjs && source "$ENV" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs
```

Expected: each `# fail 0` (`# skip 0` on the db test). If `db.rpc("playbook_totals", …)` does not typecheck, Task 9's
types were not regenerated: redo Task 9 Step 1.

- [ ] **Step 5: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add packages/db/src/repositories/reports/report-series.ts packages/db/src/index.ts packages/db/dist tooling/scripts/tests/reports/report-repository.test.mjs tooling/scripts/tests/reach-out-back/chain-totals.db.test.mjs && git commit -m "$(cat <<'EOF'
packages/db calls the counts and the chains' totals by name, and says "missing" while a database lacks them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: The fake database counts as the SQL counts

**Files:**
- Modify: `tooling/scripts/tests/_fake-db.mjs:36, 776, 1338-1341`
- Modify: `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`, add `import { fakeDb } from "../../_fake-db.mjs";`
after the contracts import, then append this world and test:

```js
/* ---- harbor: one moment that ran, one that never did, a reach-out's step, a one-off and an Inbox template ---- */

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 1, 14);
const iso = (ms) => new Date(ms).toISOString();
const pbRow = (id, over) => ({
  id,
  tenant_id: T,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "tp1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-08-01T00:00:00Z",
  channels: ["whatsapp"],
  ...over,
});
const run = (id, i, over = {}) => ({
  id,
  tenant_id: T,
  name: `Run ${i}`,
  template_id: "tp1",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  audience: { kind: "playbook", id: "p1", label: "Win-back", trigger: "quiet_30" },
  state: "sent",
  scheduled_for: iso(T0 + i * 24 * H),
  started_at: null,
  finished_at: null,
  recipient_count: 2,
  failure: null,
  created_at: iso(T0 + i * 24 * H),
  playbook_id: "p1",
  run_for: iso(T0 + i * 24 * H).slice(0, 10),
  ...over,
});
/** One person on a run, with their message's receipt where it has one, as the fixtures here write a person. */
const person = (broadcast, who, state, sentAt, status = null, channel = null) => ({
  tenant_id: T,
  broadcast_id: broadcast,
  contact_id: who,
  state,
  reason: state === "skipped" ? "opted_out" : null,
  sent_at: sentAt === null ? null : iso(sentAt),
  channel,
  message_id: null,
  messages: status ? { conversation_id: `cv-${who}`, status, meta: {} } : null,
});
const inbound = (id, who, ms, meta = {}) => ({
  id,
  tenant_id: T,
  conversation_id: `cv-${who}`,
  direction: "inbound",
  sender: "customer",
  type: "text",
  meta,
  created_at: iso(ms),
});
/**
 * p1 ran four times: b0 sent two (ana read, bo delivered by email) and held one back, ana answered within the hour and bo
 * only sent a booking tool's notice; b1 sent two by text (eli's carrier "read" is no read), eli answered 80 hours late;
 * b2 failed two, flo with a delivered message, who answered; b3 waits with two queued. p2 never ran; r1's step ran once;
 * h1 was sent by hand; the Inbox sent one template that left.
 */
const harbor = () => ({
  playbooks: [
    pbRow("p1"),
    pbRow("p2", { name: "Lapsed", trigger: "lapsed", created_at: "2026-08-02T00:00:00Z" }),
    pbRow("r1", { kind: "reach_out", name: "Reach out", trigger: "lead_first", policy_class: "outreach", created_at: "2026-08-03T00:00:00Z" }),
  ],
  broadcasts: [
    run("b0", 0),
    run("b1", 1),
    run("b2", 2, { state: "failed" }),
    run("b3", 3, { state: "pending_approval", recipient_count: 3 }),
    run("s1", 4, { playbook_id: "r1", audience: { kind: "reach_out", root_id: "r1", step_id: "r1" } }),
    run("h1", 5, { playbook_id: null, run_for: null, audience: { kind: "everyone", id: null, label: "Everyone" } }),
  ],
  broadcast_recipients: [
    person("b0", "ana", "sent", T0, "read"),
    person("b0", "bo", "sent", T0 + 60_000, "delivered", "email"),
    person("b0", "cy", "skipped", null),
    person("b1", "di", "sent", T0 + 24 * H, "sent", "sms"),
    person("b1", "eli", "sent", T0 + 24 * H, "read", "sms"),
    person("b2", "flo", "failed", T0 + 48 * H, "delivered"),
    person("b2", "gus", "failed", null),
    person("b3", "hal", "queued", null),
    person("b3", "ivy", "queued", null),
    person("s1", "jo", "sent", T0 + 96 * H, "delivered", "email"),
    person("h1", "kim", "sent", T0 + 120 * H, "delivered"),
  ],
  messages: [
    inbound("m1", "ana", T0 + H),
    inbound("m2", "bo", T0 + 2 * H, { email: { claim: "booking_notice" } }),
    inbound("m3", "eli", T0 + 24 * H + 80 * H),
    inbound("m4", "flo", T0 + 51 * H),
    {
      id: "m5",
      tenant_id: T,
      conversation_id: "cv-kim",
      direction: "outbound",
      sender: "human",
      type: "template",
      template_name: "winback_offer",
      external_id: "wamid.harbor-1",
      status: "delivered",
      meta: {},
      created_at: iso(T0 + 200 * H),
    },
  ],
  templates: [],
});
const counts = (queued, sent, skipped, failed, delivered, read, replied, whatsapp, sms, email) => ({
  queued,
  sent,
  skipped,
  failed,
  delivered,
  read,
  replied,
  sent_by: { whatsapp, sms, email },
});

test("the fake database's twins count harbor as the SQL does: each run, each moment playbook's totals, each message's sends", async () => {
  const db = fakeDb(harbor());
  const rc = await db.rpc("run_counts", { p_tenant_id: T, p_run_ids: ["b0", "b1", "b2", "b3", "s1", "h1", "nobody"] });
  assert.equal(rc.error, null, rc.error?.message);
  assert.deepEqual(rc.data, {
    b0: counts(0, 2, 1, 0, 2, 1, 1, 1, 0, 1),
    b1: counts(0, 2, 0, 0, 1, 0, 0, 0, 2, 0),
    b2: counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0),
    b3: counts(2, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    s1: counts(0, 1, 0, 0, 1, 0, 0, 0, 0, 1),
    h1: counts(0, 1, 0, 0, 1, 0, 0, 1, 0, 0),
  });
  const pt = (await db.rpc("playbook_totals", { p_tenant_id: T, p_history: 10 })).data;
  assert.deepEqual(Object.keys(pt), ["p1"], "the moment that ran: not Lapsed, never the reach-out");
  assert.deepEqual([pt.p1.runs, pt.p1.sent, pt.p1.delivered, pt.p1.replied, pt.p1.held], [4, 4, 4, 2, 3]);
  assert.deepEqual(pt.p1.history.map((h) => h.id), ["b3", "b2", "b1", "b0"]);
  assert.deepEqual(pt.p1.last_run, { id: "b3", state: "pending_approval", run_for: "2026-09-04", recipient_count: 3 });
  assert.deepEqual(pt.p1.waiting, { id: "b3", recipient_count: 3, name: "Run 3", run_for: "2026-09-04", trigger: "quiet_30" });
  assert.equal(isPlaybookTotalsDto(pt), true, "the twin answers the shape the guard takes");
  assert.deepEqual((await db.rpc("template_sends", { p_tenant_id: T })).data, {
    winback_offer: { count: 7, last_at: iso(T0 + 200 * H) },
  });
  assert.deepEqual((await db.rpc("playbook_totals", { p_tenant_id: "elsewhere" })).data, {}, "another workspace's are not this one's");
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs
```

Expected: the new test FAILs with `fakeDb: rpc(run_counts) is not modelled; add it to fakeDb's third argument`.

- [ ] **Step 3: Write the twins**

In `tooling/scripts/tests/_fake-db.mjs`, change line 36 to

```js
import { isPersonsWords, isReplyTo, localHour, runDueNow } from "@chanlytics/contracts";
```

After the line `    session_has_partner_seat: () => false,` (in `derived`), insert

```js
    // A run's counts, a moment playbook's totals and a message's sends (00362 run_counts, playbook_totals,
    // template_sends), counted out of the tables a fixture holds as the SQL counts them; held to it over a real database
    // by playbooks/totals/playbook-totals.db.test.mjs. A suite that models a database before 00362 answers them itself
    // (a handler that throws an error with code PGRST202), and the dashboard then reads the old way.
    run_counts: ({ p_tenant_id, p_run_ids }) => runCountsIn(tables, p_tenant_id, p_run_ids ?? []),
    playbook_totals: ({ p_tenant_id, p_history = 10 }) => playbookTotalsIn(tables, p_tenant_id, p_history),
    template_sends: ({ p_tenant_id }) => templateSendsIn(tables, p_tenant_id),
```

After the `primaryKeyOf` function (its closing `}` at line 1340), insert

```js

/* ---- 00362's counts, as the SQL counts them (run_counts, playbook_totals, template_sends) ---- */

/** A person's message on a run: the row's own `messages` where a fixture writes one, else the row its message_id names. */
const messageOfRecipient = (tables, r) =>
  r.messages ?? (r.message_id ? ((tables.messages ?? []).find((m) => m.id === r.message_id) ?? null) : null);

/** The channel a person went by: a row naming none went by WhatsApp, as every run before channels did (00298). */
const channelOfRecipient = (r) => (r.channel === "sms" || r.channel === "email" ? r.channel : "whatsapp");

/**
 * run_counts: each run's people by state, its receipts (a read is WhatsApp's own), what went by each channel, and the
 * threads it reached that the customer answered in their own words within the window after the run first reached them
 * there. A run nobody is on is absent.
 */
function runCountsIn(tables, tenantId, runIds) {
  const wanted = new Set(runIds);
  const out = {};
  const reachedBy = new Map();
  for (const r of tables.broadcast_recipients ?? []) {
    if (r.tenant_id !== tenantId || !wanted.has(r.broadcast_id)) continue;
    const c = (out[r.broadcast_id] ??= {
      queued: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      delivered: 0,
      read: 0,
      replied: 0,
      sent_by: { whatsapp: 0, sms: 0, email: 0 },
    });
    const channel = channelOfRecipient(r);
    if (r.state === "sent") {
      c.sent += 1;
      c.sent_by[channel] += 1;
    } else if (r.state === "queued" || r.state === "skipped" || r.state === "failed") c[r.state] += 1;
    const m = messageOfRecipient(tables, r);
    if (m?.status === "delivered" || m?.status === "read") c.delivered += 1;
    if (m?.status === "read" && channel === "whatsapp") c.read += 1;
    if (m?.conversation_id && r.sent_at) {
      const reached = reachedBy.get(r.broadcast_id) ?? new Map();
      const first = reached.get(m.conversation_id);
      if (first === undefined || Date.parse(r.sent_at) < Date.parse(first)) reached.set(m.conversation_id, r.sent_at);
      reachedBy.set(r.broadcast_id, reached);
    }
  }
  const words = new Map();
  for (const m of tables.messages ?? []) {
    if (m.tenant_id !== tenantId || m.direction !== "inbound" || m.sender !== "customer" || !isPersonsWords(m.meta)) continue;
    words.set(m.conversation_id, [...(words.get(m.conversation_id) ?? []), m.created_at]);
  }
  for (const [run, reached] of reachedBy) {
    let n = 0;
    for (const [conversation, sentAt] of reached)
      if ((words.get(conversation) ?? []).some((at) => isReplyTo(sentAt, at))) n += 1;
    out[run].replied = n;
  }
  return out;
}

/**
 * playbook_totals: each moment playbook's runs summed through run_counts, its newest run, the run that waits, its newest
 * `history` runs. A column the table defaults (state, recipient_count) is read as the database would fill it.
 */
function playbookTotalsIn(tables, tenantId, history) {
  const moments = new Set(
    (tables.playbooks ?? [])
      .filter((p) => p.tenant_id === tenantId && (p.kind ?? "moment") === "moment")
      .map((p) => p.id),
  );
  const newest = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const runs = (tables.broadcasts ?? []).filter((b) => b.tenant_id === tenantId && moments.has(b.playbook_id)).sort(newest);
  const counted = runCountsIn(tables, tenantId, runs.map((b) => b.id));
  const out = {};
  for (const b of runs) {
    const c = counted[b.id] ?? { sent: 0, skipped: 0, failed: 0, delivered: 0, replied: 0 };
    const held = c.skipped + c.failed;
    const state = b.state ?? "scheduled";
    const recipient_count = b.recipient_count ?? 0;
    const run_for = b.run_for ?? null;
    const t = (out[b.playbook_id] ??= {
      runs: 0,
      sent: 0,
      delivered: 0,
      replied: 0,
      held: 0,
      last_run: null,
      waiting: null,
      history: [],
    });
    t.runs += 1;
    t.sent += c.sent;
    t.delivered += c.delivered;
    t.replied += c.replied;
    t.held += held;
    t.last_run ??= { id: b.id, state, run_for, recipient_count };
    if (state === "pending_approval" && !t.waiting) {
      const trigger = typeof b.audience?.trigger === "string" ? b.audience.trigger : null;
      t.waiting = { id: b.id, recipient_count, name: b.name, run_for, trigger };
    }
    if (t.history.length < history)
      t.history.push({
        id: b.id,
        run_for,
        state,
        scheduled_for: b.scheduled_for ?? null,
        recipient_count,
        sent: c.sent,
        held,
        delivered: c.delivered,
        replied: c.replied,
      });
  }
  return out;
}

/** template_sends: each message name a run sent a person on, or the Inbox sent that WhatsApp took, and its latest time. */
function templateSendsIn(tables, tenantId) {
  const nameOf = new Map(
    (tables.broadcasts ?? []).filter((b) => b.tenant_id === tenantId).map((b) => [b.id, b.template_name]),
  );
  const out = {};
  const went = (name, at) => {
    const s = (out[name] ??= { count: 0, last_at: null });
    s.count += 1;
    if (at && (s.last_at === null || Date.parse(at) > Date.parse(s.last_at))) s.last_at = at;
  };
  for (const r of tables.broadcast_recipients ?? []) {
    const name = r.tenant_id === tenantId && r.state === "sent" ? nameOf.get(r.broadcast_id) : null;
    if (name) went(name, r.sent_at ?? null);
  }
  for (const m of tables.messages ?? [])
    if (m.tenant_id === tenantId && m.direction === "outbound" && m.template_name && m.external_id)
      went(m.template_name, m.created_at);
  return out;
}
```

- [ ] **Step 4: Run it, and the suites over the fake that already pass**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && for f in playbooks/totals/playbook-totals broadcasts/broadcast-counts-are-whole playbooks/send-rails playbooks/runs-honest broadcasts/run-report; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs || break; done
```

Expected: each `# fail 0` (nothing calls the twins but the new test yet).

- [ ] **Step 5: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add tooling/scripts/tests/_fake-db.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs && git commit -m "$(cat <<'EOF'
The database in memory counts a run, a playbook's totals and a message's sends as the SQL counts them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Sent and a run's sheet say what `run_counts` says, the fold kept for one release

**Files:**
- Modify: `apps/dashboard/src/server/campaigns/broadcasts.ts:1-21, 328-347, 500-506, 535`
- Modify: `tooling/scripts/tests/broadcasts/broadcast-counts-are-whole.test.mjs`
- Modify: `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`, add these two lines at the top, right after the
`import { fakeDb } from "../../_fake-db.mjs";` line:

```js
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
```

then append:

```js
/* ---- the dashboard over the fake database: the database's count, else the fold ---- */

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const Bc = await import(at("apps/dashboard/src/server/campaigns/broadcasts.ts"));

/** A function a database before 00362 does not have: PostgREST's PGRST202, which packages/db reads as "missing". */
const gone = (name) => () => {
  throw Object.assign(new Error(`Could not find the function public.${name}`), { code: "PGRST202" });
};
/** Harbor as a database before 00362 answers it: the dashboard reads the old way, for one release. */
const before00362 = (tables) =>
  fakeDb(tables, {}, { run_counts: gone("run_counts"), playbook_totals: gone("playbook_totals"), template_sends: gone("template_sends") });

test("Sent and a run's sheet say what run_counts says, read in one call for the fifty, and the same bytes the fold says on a database before it", async () => {
  const sql = fakeDb(harbor());
  const listed = await Bc.listBroadcasts({ supabase: sql }, T);
  assert.deepEqual(sql.seen.filter((q) => q.rpc).map((q) => q.rpc), ["run_counts"], "one call for the fifty");
  assert.equal(sql.seen.some((q) => q.table === "broadcast_recipients"), false, "no person read to count them");
  const folded = await Bc.listBroadcasts({ supabase: before00362(harbor()) }, T);
  assert.equal(JSON.stringify(listed), JSON.stringify(folded), "byte for byte");
  assert.deepEqual(listed.broadcasts.find((b) => b.id === "b0").counts, counts(0, 2, 1, 0, 2, 1, 1, 1, 0, 1));
  assert.deepEqual(listed.broadcasts.find((b) => b.id === "b2").counts, counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0), "a failed person with a message, answered");
  assert.equal(
    JSON.stringify(await Bc.listRuns({ supabase: fakeDb(harbor()) }, T)),
    JSON.stringify(await Bc.listRuns({ supabase: before00362(harbor()) }, T)),
  );
  const sheet = await Bc.getBroadcast({ supabase: fakeDb(harbor()) }, T, "b2");
  assert.deepEqual(sheet.broadcast.counts, counts(0, 0, 0, 2, 1, 0, 1, 0, 0, 0));
  assert.deepEqual((await Bc.getBroadcast({ supabase: before00362(harbor()) }, T, "b2")).broadcast.counts, sheet.broadcast.counts);
});
```

(The `process.env` lines run before the dashboard module is imported, which is why that import is dynamic: a module
that builds a service client on first use reads them.)

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs
```

Expected: the new test FAILs at `one call for the fifty` (`[]` against `["run_counts"]`).

- [ ] **Step 3: Count through `run_counts`, the fold kept as the fallback**

In `apps/dashboard/src/server/campaigns/broadcasts.ts`, add `runCountsOf,` to the `@chanlytics/contracts` import (after
`personName,`) and change `import { readAllRows } from "@chanlytics/db";` to `import { readAllRows, runCounts } from "@chanlytics/db";`.

Replace the whole `withCounts` function and its comment

```ts
/**
 * The rows with the numbers their people earned: every person on every run (peopleOnRuns), and the replies of all their
 * threads in one read (inboundOn) where there was one query for each run with a thread.
 */
async function withCounts(ctx: RouteContext, tenantId: string, rows: BroadcastRow[]): Promise<BroadcastDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { counts, threadsOf } = countRecipients(await peopleOnRuns(ctx, tenantId, ids), ids);
  // Every thread any run reached, read once from the oldest send: each run then reads its own threads off the one read.
  const sends = [...threadsOf.values()].flatMap((threads) => [...threads.values()]).sort();
  const since = sends[0];
  if (since !== undefined) {
    const convIds = [...new Set([...threadsOf.values()].flatMap((threads) => [...threads.keys()]))];
    const inbound = await inboundOn(ctx, tenantId, convIds, since, false);
    for (const [broadcastId, threads] of threadsOf) {
      counts.get(broadcastId)!.replied = firstReplies(threads, inbound).size;
    }
  }
  return rows.map((r) => toDto(r, counts.get(r.id) ?? emptyCounts()));
}
```

with

```ts
/**
 * Each run's numbers, by id: the database's count (run_counts, 00362), the one statement of what a run earned, which
 * Sent, a run's sheet and a playbook's card all say; or, on a database before it, for one release, the fold here
 * (foldCounts). A run nobody is on is all zeros.
 */
async function countsOf(ctx: RouteContext, tenantId: string, ids: string[]): Promise<Map<string, BroadcastCounts>> {
  const read = await runCounts(ctx.supabase, tenantId, ids);
  if (read === "missing") return foldCounts(ctx, tenantId, ids);
  const counted = runCountsOf(read);
  if (!counted) throw new Error("run_counts answered a shape it does not know");
  return new Map(ids.map((id) => [id, counted[id] ?? emptyCounts()]));
}

/**
 * The fold run_counts replaced, kept for one release for a database before 00362: every person on every run
 * (peopleOnRuns), and the replies of all their threads in one read (inboundOn) where there was one query for each run
 * with a thread.
 */
async function foldCounts(ctx: RouteContext, tenantId: string, ids: string[]): Promise<Map<string, BroadcastCounts>> {
  const { counts, threadsOf } = countRecipients(await peopleOnRuns(ctx, tenantId, ids), ids);
  // Every thread any run reached, read once from the oldest send: each run then reads its own threads off the one read.
  const sends = [...threadsOf.values()].flatMap((threads) => [...threads.values()]).sort();
  const since = sends[0];
  if (since !== undefined) {
    const convIds = [...new Set([...threadsOf.values()].flatMap((threads) => [...threads.keys()]))];
    const inbound = await inboundOn(ctx, tenantId, convIds, since, false);
    for (const [broadcastId, threads] of threadsOf) {
      counts.get(broadcastId)!.replied = firstReplies(threads, inbound).size;
    }
  }
  return counts;
}

/** The rows with the numbers their people earned (countsOf). */
async function withCounts(ctx: RouteContext, tenantId: string, rows: BroadcastRow[]): Promise<BroadcastDto[]> {
  if (rows.length === 0) return [];
  const counts = await countsOf(
    ctx,
    tenantId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toDto(r, counts.get(r.id) ?? emptyCounts()));
}

/**
 * A run's sheet's numbers: run_counts' (00362), the same a list of runs says of it; on a database before it, for one
 * release, what the sheet counted of its own people (`own`).
 */
async function sheetCountsOf(
  ctx: RouteContext,
  tenantId: string,
  id: string,
  own: BroadcastCounts,
): Promise<BroadcastCounts> {
  const read = await runCounts(ctx.supabase, tenantId, [id]);
  if (read === "missing") return own;
  const counted = runCountsOf(read);
  if (!counted) throw new Error("run_counts answered a shape it does not know");
  return counted[id] ?? emptyCounts();
}
```

In `getBroadcast`, replace

```ts
  const replied = threads ? await repliedThreads(ctx, tenantId, threads, words) : new Map<string, string>();
  counts.get(id)!.replied = replied.size;
```

with

```ts
  const replied = threads ? await repliedThreads(ctx, tenantId, threads, words) : new Map<string, string>();
  // The sheet's own count of its people, which a database before 00362 is read by (sheetCountsOf).
  const own = { ...(counts.get(id) ?? emptyCounts()), replied: replied.size };
```

and in its `return`, replace `    broadcast: toDto(row as BroadcastRow, counts.get(id) ?? emptyCounts()),` with
`    broadcast: toDto(row as BroadcastRow, await sheetCountsOf(ctx, tenantId, id, own)),`.

- [ ] **Step 4: The fold's own tests run against a database before 00362**

In `tooling/scripts/tests/broadcasts/broadcast-counts-are-whole.test.mjs`:

1. In the header, after the paragraph that ends `before it counts.`, add the paragraph:
   ` * Since 00362 the database counts a run (run_counts) and the route reads its answer; the fold below is what a database
 * before it is read by, for one release, so its paging is proved against a double that has no run_counts.`
2. After `const capped = (tables) => fakeDb(tables);` add

```js
/** A database before 00362: no run_counts (PostgREST's PGRST202), so the route folds the runs itself, as these tests prove. */
const before00362 = (tables) =>
  fakeDb(tables, {}, {
    run_counts: () => {
      throw Object.assign(new Error("Could not find the function public.run_counts"), { code: "PGRST202" });
    },
  });
```

3. In the test `"REGRESSION: a run counts every person on it past PostgREST's thousand rows -- …"`, change
   `  const db = capped(tables());` to `  const db = before00362(tables());`, and after its `"every page under the table's key"`
   assertion add

```js
  assert.deepEqual(
    Object.fromEntries((await listRuns({ supabase: capped(tables()) }, TID)).map((b) => [b.id, b.counts])),
    whole,
    "and the database's own count says the same",
  );
```

4. In the test `"a run's replies are read together, once for every run: …"`, change its `  const db = capped({` to
   `  const db = before00362({`.
5. In the test `"REGRESSION: a run's replies count every thread past a thousand messages -- …"`, change its
   `  const db = capped({` to `  const db = before00362({`.
6. Append

```js
test("with run_counts on the database, a list of runs is its answer, asked once for every run, never a person read", async () => {
  const runs = [peopleOf("r1", { sent: 40, replied: 10 }), peopleOf("r2", { sent: 40, replied: 25 })];
  const tables = () => ({
    broadcasts: ["r1", "r2"].map((id) => broadcast(id, { playbook_id: "pb1" })),
    broadcast_recipients: runs.flatMap((r) => r.recipients),
    messages: runs.flatMap((r) => r.inbound),
  });
  const db = capped(tables());
  const counted = await listRuns({ supabase: db }, TID);
  assert.deepEqual(db.seen.filter((q) => q.rpc).map((q) => q.rpc), ["run_counts"]);
  assert.equal(inboundReads(db).length, 0, "no reply read here");
  assert.deepEqual(ordersOf(db, "broadcast_recipients"), [], "no person read here");
  const folded = await listRuns({ supabase: before00362(tables()) }, TID);
  assert.equal(JSON.stringify(counted), JSON.stringify(folded), "the same bytes the fold says");
});
```

- [ ] **Step 5: Typecheck and run every test over these functions**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && corepack pnpm --filter @chanlytics/dashboard typecheck && for f in playbooks/totals/playbook-totals broadcasts/broadcast-counts-are-whole broadcasts/broadcasts broadcasts/run-report broadcasts/ask-broadcasts-reads broadcasts/ask-run-card broadcasts/ask-campaign-channels broadcasts/preview-by-channel playbooks/send-rails playbooks/runs-honest messages/a-failed-send-says-why shell/polish ask/readers; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs || break; done
```

Expected: each `# fail 0`. If one fails with `run_counts answered a shape it does not know` or a count off by a column
its fixture never set, the fixture omits a column the table holds (read `messages`' or `broadcast_recipients`' columns
in `packages/db/src/database.types.ts`): give the fixture the column, as the database has it. Never loosen
`runCountsOf`.

- [ ] **Step 6: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add apps/dashboard/src/server/campaigns/broadcasts.ts tooling/scripts/tests/broadcasts/broadcast-counts-are-whole.test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs && git commit -m "$(cat <<'EOF'
Sent and a run's sheet say what the database counts of a run, and fold it themselves only for a database before it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: GET playbooks: the rows, and the totals the database counts, the same bytes

**Files:**
- Modify: `apps/dashboard/src/server/campaigns/playbooks.ts:2-33, 249-343`
- Modify: `apps/dashboard/src/server/readers/shape.ts:5, 47`
- Modify: `apps/dashboard/src/server/ask/context/pages.ts:51, 137`
- Modify: `tooling/scripts/tests/ask/ask-context.test.mjs`
- Modify: `tooling/scripts/tests/ask/readers.test.mjs` (the `GET playbooks … asks what it asked at origin/main` test)
- Modify: `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`

`playbookRows` is the seam name; two private top-level functions already carry it (`srv/ask/context/pages.ts:51`,
`cmp/broadcasts/ledger.tsx:250`), and a third file declaring it fails the copies ratchet (`baselines/copies.json`). The
Ask provider's private one is renamed `playbookContextRows` (lane 4 rewrites that provider; it reads the tree).

- [ ] **Step 1: Write the failing tests**

Append to `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`:

```js
const P = await import(at("apps/dashboard/src/server/campaigns/playbooks.ts"));

test("GET playbooks' rows: the database's count read in one call, the same bytes the fold says on a database before it, a playbook that never ran all zeros, and the rows alone read without a run", async () => {
  const sql = fakeDb(harbor());
  const rows = await P.listPlaybooks({ supabase: sql }, T);
  assert.deepEqual(sql.seen.filter((q) => q.rpc).map((q) => q.rpc), ["playbook_totals"]);
  assert.equal(sql.seen.some((q) => q.table === "broadcasts" || q.table === "broadcast_recipients"), false, "no run read to sum them");
  const folded = await P.listPlaybooks({ supabase: before00362(harbor()) }, T);
  assert.equal(JSON.stringify(rows), JSON.stringify(folded), "byte for byte");
  assert.deepEqual(rows.map((r) => r.id), ["p2", "p1"], "the moments, newest first; the reach-out is its own sheet's");
  assert.deepEqual(rows[0].totals, { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] });
  const t = rows[1].totals;
  assert.deepEqual([t.runs, t.sent, t.delivered, t.replied, t.held], [4, 4, 4, 2, 3]);
  assert.deepEqual(t.lastRun, { id: "b3", state: "pending_approval", run_for: "2026-09-04", recipient_count: 3 });
  const bare = fakeDb(harbor());
  const plain = await P.playbookRows({ supabase: bare }, T);
  assert.deepEqual(plain, rows.map(({ totals: _totals, ...r }) => r), "the rows alone, as GET playbooks lists them");
  assert.deepEqual(bare.seen.map((q) => q.table ?? `rpc:${q.rpc}`), ["playbooks"], "and nothing of a run");
});
```

In `tooling/scripts/tests/ask/ask-context.test.mjs`, add after the test named
`"the shape reader is kept across turns for a context that keeps, and read every time for one that does not"`:

```js
test("the shape reads the playbooks' rows alone: no run, no person on one and no count is read to name them", async () => {
  const ctx = ctxFor(
    shapeTables({
      broadcasts: [
        { id: "b1", tenant_id: A, playbook_id: "pb2", name: "Win-back", state: "sent", recipient_count: 9, created_at: iso(NOW.getTime()) },
      ],
      broadcast_recipients: [{ tenant_id: A, broadcast_id: "b1", contact_id: P1, state: "sent", sent_at: iso(NOW.getTime()) }],
    }),
  );
  await load(rcIn(ctx, A, { keep: false }), shape, undefined);
  const asked = ctx.supabase.seen.map((q) => q.table ?? `rpc:${q.rpc}`);
  for (const not of ["broadcasts", "broadcast_recipients", "rpc:playbook_totals", "rpc:run_counts"])
    assert.equal(asked.includes(not), false, `${not}: not the shape's`);
  assert.ok(asked.includes("playbooks"), "the rows themselves");
});
```

- [ ] **Step 2: Run them to see them fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs; node tooling/scripts/checks/test.mjs tooling/scripts/tests/ask/ask-context.test.mjs
```

Expected: the playbooks test FAILs (`[]` against `["playbook_totals"]`); the shape test FAILs at
`broadcasts: not the shape's`.

- [ ] **Step 3: Split `listPlaybooks`**

In `apps/dashboard/src/server/campaigns/playbooks.ts`, add to the `@chanlytics/contracts` import list
`isPlaybookTotalsDto,` (after `dealsAreOn,`), `type BroadcastDto,` and `type PlaybookTotalsDto,` (after
`type ConsentChannel,`); add `playbookTotals,` to the `@chanlytics/db` import list (after `playbookChannels,`).

Replace everything from `export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };` through the closing
`}` of `listPlaybooks` (the line before `export type { PlaybookInput };`) with:

```ts
export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };

/** What a playbook that never ran has earned: nothing, and no run to name. */
const noTotals = (): PlaybookTotals => ({
  runs: 0,
  sent: 0,
  delivered: 0,
  replied: 0,
  held: 0,
  lastRun: null,
  waiting: null,
  history: [],
});

/**
 * The workspace's moment playbooks, newest first, without what their runs earned: the rows GET playbooks lists, the pools
 * count by, and Ask's shape names. A reach-out's steps are its own sheet's (Reach out, Part 4), never cards here.
 */
export async function playbookRows(ctx: RouteContext, tenantId: string): Promise<PlaybookDto[]> {
  // The query is returned as it is built, and runs when it is awaited.
  const read = (
    columns: string,
    moments = true,
  ): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> => {
    const q = ctx.supabase.from("playbooks").select(columns).eq("tenant_id", tenantId);
    return (moments ? q.eq("kind", "moment") : q).order("created_at", {
      ascending: false,
    }) as unknown as ReturnType<typeof read>;
  };
  // A database 00168 has not reached has no list_key, and one 00155 has not reached no list_id: read again without
  // them, and no playbook runs on a People list (or on any list).
  let { data: rows, error } = await read(COLUMNS);
  const missing = (col: string) =>
    !!error && new RegExp(col).test(error.message) && /does not exist|could not find/i.test(error.message);
  // A database 00298 has not reached has no channels, and every playbook there goes by WhatsApp: read again without it,
  // and each of the reads below keeps that.
  let columns = COLUMNS;
  if (missing("channels")) {
    columns = columns.replace(", channels", "");
    ({ data: rows, error } = await read(columns));
  }
  // A database 00183 has not reached has no kind, and every playbook there is a moment.
  const moments = !missing("kind");
  if (!moments) ({ data: rows, error } = await read(columns, false));
  if (missing("list_key")) ({ data: rows, error } = await read(columns.replace("list_key, ", ""), moments));
  if (missing("list_id")) ({ data: rows, error } = await read(columns.replace("list_id, list_key, ", ""), moments));
  if (error) throw new Error(error.message);
  return (rows ?? []).map((r) => ({
    ...(r as unknown as Omit<PlaybookDto, "params" | "trigger" | "policy_class" | "state">),
    list_id: (r.list_id as string | null | undefined) ?? null,
    list_key: (r.list_key as string | null | undefined) ?? null,
    trigger: r.trigger as PlaybookTrigger,
    policy_class: r.policy_class as PlaybookPolicyClass,
    state: r.state as PlaybookDto["state"],
    params: parseParamSpecs(r.params),
  }));
}

/**
 * playbook_totals' answer (00362) in the card's words: storage's `last_run` is the wire's `lastRun` (banked in
 * wire-casing.json, decision 0022), each object written in the order the fold wrote it, so GET playbooks answers the same
 * bytes whichever counted them. The one mapping, behind contracts' isPlaybookTotalsDto, never a cast.
 */
function toPlaybookTotals(dto: PlaybookTotalsDto): Map<string, PlaybookTotals> {
  const out = new Map<string, PlaybookTotals>();
  for (const [id, t] of Object.entries(dto)) {
    out.set(id, {
      runs: t.runs,
      sent: t.sent,
      delivered: t.delivered,
      replied: t.replied,
      held: t.held,
      lastRun: {
        id: t.last_run.id,
        state: t.last_run.state,
        run_for: t.last_run.run_for,
        recipient_count: t.last_run.recipient_count,
      },
      waiting: t.waiting
        ? {
            id: t.waiting.id,
            recipient_count: t.waiting.recipient_count,
            name: t.waiting.name,
            run_for: t.waiting.run_for,
            trigger: t.waiting.trigger,
          }
        : null,
      history: t.history.map((h) => ({
        id: h.id,
        run_for: h.run_for,
        state: h.state,
        scheduled_for: h.scheduled_for,
        recipient_count: h.recipient_count,
        sent: h.sent,
        held: h.held,
        delivered: h.delivered,
        replied: h.replied,
      })),
    });
  }
  return out;
}

/**
 * The fold playbook_totals replaced, kept for one release for a database before 00362: each of `runs` (every run of any
 * playbook, newest first, listRuns) summed into its playbook's totals. Its runs are read unpaged, so past PostgREST's
 * thousand rows it reads short (playbooks/totals/playbook-totals.db.test.mjs shows where); it leaves with listRuns.
 */
function foldTotals(runs: BroadcastDto[]): Map<string, PlaybookTotals> {
  const totals = new Map<string, PlaybookTotals>();
  for (const b of runs) {
    if (!b.playbook_id) continue;
    const t = totals.get(b.playbook_id) ?? noTotals();
    t.runs += 1;
    t.sent += b.counts.sent;
    t.delivered += b.counts.delivered;
    t.replied += b.counts.replied;
    t.held += b.counts.skipped + b.counts.failed;
    if (t.history.length < HISTORY_ON_CARD) {
      t.history.push({
        id: b.id,
        run_for: b.run_for,
        state: b.state,
        scheduled_for: b.scheduled_for,
        recipient_count: b.recipient_count,
        sent: b.counts.sent,
        held: b.counts.skipped + b.counts.failed,
        delivered: b.counts.delivered,
        replied: b.counts.replied,
      });
    }
    if (!t.lastRun) t.lastRun = { id: b.id, state: b.state, run_for: b.run_for, recipient_count: b.recipient_count };
    if (b.state === "pending_approval" && !t.waiting)
      t.waiting = {
        id: b.id,
        recipient_count: b.recipient_count,
        name: b.name,
        run_for: b.run_for,
        trigger: audienceTrigger(b.audience),
      };
    totals.set(b.playbook_id, t);
  }
  return totals;
}

/**
 * What each moment playbook's runs earned, by its id (one that never ran is absent): the database's count
 * (playbook_totals, 00362), one call however long its history, or, on a database before it, for one release, the fold
 * over every run it replaced, so either deploy order works.
 */
async function playbookTotalsOf(ctx: RouteContext, tenantId: string): Promise<Map<string, PlaybookTotals>> {
  const read = await playbookTotals(ctx.supabase, tenantId, HISTORY_ON_CARD);
  if (read === "missing") return foldTotals(await listRuns(ctx, tenantId));
  if (!isPlaybookTotalsDto(read)) throw new Error("playbook_totals answered a shape it does not know");
  return toPlaybookTotals(read);
}

/** The moment playbooks with what their runs earned: GET playbooks' rows (playbookRows), each with its totals. */
export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  const [rows, totals] = await Promise.all([playbookRows(ctx, tenantId), playbookTotalsOf(ctx, tenantId)]);
  return rows.map((r) => ({ ...r, totals: totals.get(r.id) ?? noTotals() }));
}
```

- [ ] **Step 4: The shape reads the rows; Ask's private helper gives the name back**

In `apps/dashboard/src/server/readers/shape.ts`, change `import { listPlaybooks } from "../campaigns/playbooks";` to
`import { playbookRows } from "../campaigns/playbooks";`, change `      listPlaybooks(rc.ctx, rc.tenantId),` to
`      // The rows alone (00362's split): the shape names each by its name, trigger and state, and runs nothing's count.\n      playbookRows(rc.ctx, rc.tenantId),`.

In `apps/dashboard/src/server/ask/context/pages.ts`, rename the private function `playbookRows` to
`playbookContextRows` (its declaration `async function playbookRows(rc: ReaderContext, ids: string[]) {` and its one call
`      ? await playbookRows(` inside `campaigns`).

- [ ] **Step 5: The query-for-query test of GET playbooks says the one call**

In `tooling/scripts/tests/ask/readers.test.mjs`, in the test `"GET playbooks through its reader asks what it asked at
origin/main, in its order, less one read: …"`, insert immediately before the line
`    // 9 Oct 2026: the pools' reads leave with the page's first ones (server/campaigns/playbook-pools.ts poolReads), so the`:

```js
    // 9 Oct 2026 (00362): what the runs earned is the database's count, one call (playbook_totals), where every run of
    // every playbook and every person on one were read to sum it here.
    want.splice(
      want.findIndex(([k, cols]) => k === "broadcasts.select" && cols.startsWith("id, name, template_id")),
      1,
      ["rpc:playbook_totals", null],
    );
    want.splice(
      want.findIndex(([k, cols]) => k === "broadcast_recipients.select" && cols.includes("messages(")),
      1,
    );
```

- [ ] **Step 6: Typecheck and run every test that names these**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && corepack pnpm --filter @chanlytics/dashboard typecheck && for f in playbooks/totals/playbook-totals ask/ask-context ask/readers playbooks/send-rails playbooks/playbooks playbooks/outbound-routes playbooks/follow-up-by-channel playbooks/veto-words playbooks/runs-honest playbooks/playbook-composer playbooks/home/moments-offered calendar/calendar-counts ask/ask-routes ask/honesty/ask-says-what-is-true workspace/ask-workspace-reads e2e/e2e-harness-campaigns people/ask-people people/lists/ask-list-card leads/finder/lead-ask; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs || break; done
```

Expected: each `# fail 0`. If one fails with `playbook_totals answered a shape it does not know`, its fixture's
`broadcasts` rows omit a column the table holds `NOT NULL` without a default (`scheduled_for`, `name`): give the row the
column with a value of the table's own shape. Never loosen the guard.

- [ ] **Step 7: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add apps/dashboard/src/server/campaigns/playbooks.ts apps/dashboard/src/server/readers/shape.ts apps/dashboard/src/server/ask/context/pages.ts tooling/scripts/tests/ask/ask-context.test.mjs tooling/scripts/tests/ask/readers.test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs && git commit -m "$(cat <<'EOF'
GET playbooks reads its rows and the database's totals in one call each, the same bytes, and the shape reads the rows alone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

(If a fixture had to gain a column in Step 6, add that test file to the `git add` list.)

---

## Task 15: Settings' templates read what went out from `template_sends`

**Files:**
- Modify: `apps/dashboard/src/server/readers/templates.ts:1-12, 86-145`
- Modify: `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`

The runs read stays (what sends each message is read off the runs: a run waiting on the owner, the latest two a person
sent); the scans of every sent person and every templated message are what `template_sends` replaces.

- [ ] **Step 1: Write the failing test**

Append to `tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs`:

```js
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { templates: templatesReader } = await import(at("apps/dashboard/src/server/readers/templates.ts"));
const turn = (db) =>
  kernel.readerContext({ supabase: db, userId: "u1", email: "ada@example.com", params: {} }, { tenantId: T, role: "viewer" });

test("Settings' templates: how many of each went out is template_sends', one call where every sent person and every templated message was paged, and the same the fold says on a database before it", async () => {
  const sql = fakeDb(harbor());
  const read = (await kernel.load(turn(sql), templatesReader, { all: true })).data;
  assert.deepEqual(read.sends, { winback_offer: { count: 7, lastAt: iso(T0 + 200 * H) } });
  assert.ok(sql.seen.some((q) => q.rpc === "template_sends"), "the database's count");
  assert.equal(sql.seen.some((q) => q.table === "broadcast_recipients"), false, "no sent person paged");
  assert.equal(sql.seen.some((q) => q.table === "messages"), false, "no templated message paged");
  const folded = (await kernel.load(turn(before00362(harbor())), templatesReader, { all: true })).data;
  assert.deepEqual(folded.sends, read.sends);
  assert.deepEqual(folded.usedBy, read.usedBy, "what sends each is read the same way");
  const composers = fakeDb(harbor());
  await kernel.load(turn(composers), templatesReader, { all: false });
  assert.equal(composers.seen.some((q) => q.rpc === "template_sends"), false, "the composers never ask, and never pay for it");
});
```

- [ ] **Step 2: Run it to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs
```

Expected: the new test FAILs at `the database's count`.

- [ ] **Step 3: Read the sends from the database, the scan kept as the fallback**

In `apps/dashboard/src/server/readers/templates.ts`, replace the imports

```ts
import {
  bookingTemplate,
  campaignMessagesOf,
  runsWords,
  templateBlocked,
  templateHolds,
  templateParts,
  templateSends,
  templateUsage,
} from "@chanlytics/contracts";
import { stamp, type Reader, type ReaderContext } from "./index";
```

with

```ts
import {
  bookingTemplate,
  campaignMessagesOf,
  runsWords,
  templateBlocked,
  templateHolds,
  templateParts,
  templateSends,
  templateSendsOf,
  templateUsage,
  type TemplateSends,
} from "@chanlytics/contracts";
// The database's count of the same sends (00362); contracts' templateSends is the fold it replaced, read below for a
// database before it.
import { templateSends as sendsByTemplate } from "@chanlytics/db";
import { stamp, type Reader, type ReaderContext } from "./index";
```

Add this function right before `async function templatesOf(rc: ReaderContext, all: boolean) {` (after its comment block
ends, place it above that comment):

```ts
/**
 * How many of each message went out, and when the latest did, by its name: the database's count (template_sends, 00362),
 * one call whatever the history, or, on a database before it, for one release, the fold over every person a run sent
 * and every template the Inbox sent that WhatsApp took (contracts templateSends), as this reader read them. `runs` is
 * the reader's own read of every run, which the fold names each send's message by.
 */
async function templateSendsRead(
  rc: ReaderContext,
  runs: PromiseLike<readonly { id: string; template_name: string | null }[]>,
): Promise<Record<string, TemplateSends>> {
  const tenantId = rc.tenantId;
  const read = await sendsByTemplate(rc.ctx.supabase, tenantId);
  if (read !== "missing") {
    const sends = templateSendsOf(read);
    if (!sends) throw new Error("template_sends answered a shape it does not know");
    return sends;
  }
  const [runRows, recipients, inbox] = await Promise.all([
    runs,
    // What LEFT, person by person. A broadcast's `recipient_count` is the
    // audience it was scheduled for; the wire holds people back from it and a
    // run can stop part-way, and Reports › Campaigns counts "Messages sent"
    // from these rows, apart from "Delivered". Counted the way that page counts.
    everyRow("broadcast_recipients", (from, to) =>
      rc.ctx.supabase
        .from("broadcast_recipients")
        .select("broadcast_id, state, sent_at")
        .eq("tenant_id", tenantId)
        .eq("state", "sent")
        .order("broadcast_id")
        .order("contact_id")
        .range(from, to),
    ),
    // The one door a run does not cover: a template the Inbox sent into a closed
    // window, on its own message row. It left when WhatsApp took it -- the
    // wamid; a row still in its veto window, withdrawn or refused has none. A
    // run's own messages name no template (deliver records them without one),
    // so nothing counted on a recipient row above is counted again here.
    everyRow("messages", (from, to) =>
      rc.ctx.supabase
        .from("messages")
        .select("template_name, external_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("direction", "outbound")
        .not("template_name", "is", null)
        .not("external_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  return templateSends({ runs: runRows, recipients, inbox });
}
```

In `templatesOf`, replace everything from `  const [pb, runs, recipients, inbox] = await Promise.all([` through
`  const sends = templateSends({ runs, recipients, inbox });` with:

```ts
  // Every run, a page at a time: a daily playbook alone passes a thousand of
  // them in three years. A run's state says whether its playbook is waiting on
  // the owner; a name and a date let a message people send by hand name the
  // latest two.
  const runs = everyRow("broadcasts", (from, to) =>
    rc.ctx.supabase
      .from("broadcasts")
      .select("id, template_name, playbook_id, name, state, created_at")
      .eq("tenant_id", tenantId)
      .order("id")
      .range(from, to),
  );
  const [pb, runRows, sends] = await Promise.all([
    // Its clock, for the line under what sends it ("runs daily at 10:00").
    rc.ctx.supabase
      .from("playbooks")
      .select("id, name, template_name, state, trigger, run_hour, cadence_days")
      .eq("tenant_id", tenantId),
    runs,
    templateSendsRead(rc, runs),
  ]);
  if (pb.error) throw new Error(pb.error.message);
  const usedBy = templateUsage({
    playbooks: (pb.data ?? []).map((p) => ({ ...p, runs: runsWords(p) })),
    broadcasts: runRows,
    // The booking message is a WhatsApp template the receptionist sends: an email or a text of the same name is none.
    bookingName: bookingTemplate(every.filter((t) => t.channel === "whatsapp"))?.name ?? null,
  });
```

(The old `if (pb.error) …` and `const usedBy = templateUsage({ … })` lines that followed are replaced by the block
above; the `return { templates, held, messages, usedBy, sends };` line stays.)

- [ ] **Step 4: Typecheck and run every test that names the reader**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && corepack pnpm --filter @chanlytics/dashboard typecheck && for f in playbooks/totals/playbook-totals playbooks/outbound-routes ask/readers templates/templates-truth templates/templates-made-here templates/campaign-message templates/starter-templates templates/message-versions-feed templates/message-versions-page broadcasts/ask-campaign-channels; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs || break; done
```

Expected: each `# fail 0`. `outbound-routes`' "past a thousand" test now counts through the twin, which reads the
tables whole: still 2,501.

- [ ] **Step 5: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add apps/dashboard/src/server/readers/templates.ts tooling/scripts/tests/playbooks/totals/playbook-totals.test.mjs && git commit -m "$(cat <<'EOF'
Settings' templates read how many of each went out from the database, in one call, where every send was paged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: GET playbooks counts against the report routes' bucket

**Files:**
- Modify: `apps/dashboard/app/api/v1/playbooks/route.ts:29-32`
- Modify: `tooling/scripts/tests/route-policy.json:1176-1182`
- Modify: `docs/api.md` (regenerated; #1525 touched it, so regenerate, never hand-edit)

- [ ] **Step 1: Declare the bucket on the route**

In `apps/dashboard/app/api/v1/playbooks/route.ts`, replace

```ts
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), playbooks, undefined)).data,
});
```

with

```ts
// The report routes' bucket (rate-limit.ts `aggregate`): the page's counts are SQL aggregates now (00362), and a script
// that hammers this read hammers them.
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), playbooks, undefined)).data,
});
```

- [ ] **Step 2: Run the policy test to see it fail**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/routes/route-policy.test.mjs
```

Expected: FAIL naming `GET playbooks` (`rate: "aggregate"` against the pinned `null`).

- [ ] **Step 3: Pin it, regenerate the reference**

In `tooling/scripts/tests/route-policy.json`, in the `"GET playbooks"` entry, change `"rate": null,` to
`"rate": "aggregate",`. Then:

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && corepack pnpm gen:api-reference && node tooling/scripts/gen/route-types.mjs --check && git diff --stat docs/api.md && for f in routes/route-policy routes/api-reference routes/route-types; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs || break; done
```

Expected: `docs/api.md` changes one line (`GET /api/v1/playbooks`: `no rate bucket` → ``counts against the `aggregate` rate``);
`route-types --check` passes (if it says stale, run it without `--check` and add `apps/dashboard/src/client/routes.generated.ts`
and `packages/contracts/src/route-keys.generated.ts` to the commit); the three tests `# fail 0`.

- [ ] **Step 4: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add apps/dashboard/app/api/v1/playbooks/route.ts tooling/scripts/tests/route-policy.json docs/api.md && git commit -m "$(cat <<'EOF'
GET playbooks counts against the report routes' bucket, now that its numbers are the database's aggregates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Proved on the seeded stack — the same bytes where the fold is right, its wrong answers where it is not

**Files:**
- Modify: `tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs`

- [ ] **Step 1: Add the dashboard half**

In `tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs`, change `import { fileURLToPath } from "node:url";`
to `import { fileURLToPath, pathToFileURL } from "node:url";`, add `import { fakeDb } from "../../_fake-db.mjs";` after the
contracts import, and insert after the line `const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");`:

```js
// The dashboard's own reads, run on the stack: modules that build a service client on first use read these.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL_ ?? "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const P = await import(at("apps/dashboard/src/server/campaigns/playbooks.ts"));
const Bc = await import(at("apps/dashboard/src/server/campaigns/broadcasts.ts"));

/**
 * The session client as a database before 00362 answers it: the named functions are not there (PostgREST's PGRST202),
 * so the dashboard reads the old way, as it will for one release. Everything else is the client's own.
 */
const before00362 = (client, names) =>
  new Proxy(client, {
    get(target, prop) {
      if (prop === "rpc")
        return (name, args, opts) =>
          names.includes(name)
            ? Promise.resolve({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } })
            : target.rpc(name, args, opts);
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
```

and append these tests at the end of the file:

```js
test("GET playbooks' rows are the same bytes counted by the database as by the fold where the fold counts right -- the salon, as the service role and as its own member -- and so are Sent's", { skip }, async () => {
  const w = await world();
  const fold = await P.listPlaybooks({ supabase: before00362(db, ["playbook_totals", "run_counts"]) }, w.A.tenant);
  const sql = await P.listPlaybooks({ supabase: db }, w.A.tenant);
  assert.equal(JSON.stringify(sql), JSON.stringify(fold), "byte for byte");
  const own = await member(w.A.tenant, "operator");
  assert.equal(JSON.stringify(await P.listPlaybooks({ supabase: own }, w.A.tenant)), JSON.stringify(fold), "and for a member, under row security");
  assert.deepEqual(
    sql.find((p) => p.id === w.A.lapsed).totals,
    { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] },
    "a playbook that never ran",
  );
  assert.equal(sql.some((p) => p.id === w.A.chain), false, "a reach-out is its own sheet's");
  const t = sql.find((p) => p.id === w.A.winback).totals;
  assert.deepEqual([t.runs, t.sent, t.delivered, t.replied, t.held], [40, 93, 63, 7, 34], "the hand count");
  const listed = await Bc.listBroadcasts({ supabase: db }, w.A.tenant);
  const folded = await Bc.listBroadcasts({ supabase: before00362(db, ["run_counts"]) }, w.A.tenant);
  assert.equal(JSON.stringify(listed), JSON.stringify(folded), "Sent's fifty, counted by run_counts and by the fold");
});

test("past its caps the fold reads short, which is why seeded truth is the oracle: the shop's newest thousand runs, and a chunk of two hundred cut at 20,000 people", { skip }, async () => {
  const w = await world();
  const fold = await P.listPlaybooks({ supabase: before00362(db, ["playbook_totals", "run_counts"]) }, w.B.tenant);
  const sql = await P.listPlaybooks({ supabase: db }, w.B.tenant);
  const of = (rows, id) => rows.find((p) => p.id === id).totals;
  assert.deepEqual(
    [of(sql, w.B.big).runs, of(sql, w.B.big).sent, of(sql, w.B.wide).runs, of(sql, w.B.wide).sent],
    [1050, 1050, 11, 22000],
    "the database: every run and every person",
  );
  assert.equal(of(fold, w.B.big).runs, 989, "the fold: the newest thousand runs, eleven of them Wide's");
  assert.ok(of(fold, w.B.wide).sent <= 20000, `the fold: the first chunk cut at 20,000 people (${of(fold, w.B.wide).sent})`);
  assert.deepEqual(
    of(sql, w.B.big).history.map((h) => h.id),
    of(fold, w.B.big).history.map((h) => h.id),
    "the newest ten are the same runs: only the totals read short",
  );
});

test("the studio: the fold timed a thread two people share from its later send and missed the reply the database counts", { skip }, async () => {
  const w = await world();
  const fold = await P.listPlaybooks({ supabase: before00362(db, ["playbook_totals", "run_counts"]) }, w.C.tenant);
  const sql = await P.listPlaybooks({ supabase: db }, w.C.tenant);
  assert.deepEqual([sql[0].totals.replied, fold[0].totals.replied], [1, 0]);
});

test("the fake database's twins (_fake-db.mjs) answer what the SQL answers, over the salon's own rows", { skip }, async () => {
  const w = await world();
  const rows = async (table) => ok(await db.from(table).select("*").eq("tenant_id", w.A.tenant), table);
  const tables = {
    playbooks: await rows("playbooks"),
    broadcasts: await rows("broadcasts"),
    broadcast_recipients: await rows("broadcast_recipients"),
    messages: await rows("messages"),
  };
  const fake = fakeDb(tables);
  const ids = tables.broadcasts.map((b) => b.id);
  for (const [name, args] of [
    ["playbook_totals", { p_tenant_id: w.A.tenant, p_history: 10 }],
    ["run_counts", { p_tenant_id: w.A.tenant, p_run_ids: ids }],
    ["template_sends", { p_tenant_id: w.A.tenant }],
  ]) {
    const real = ok(await db.rpc(name, args), name);
    const twin = await fake.rpc(name, args);
    assert.equal(twin.error, null, `${name}: ${twin.error?.message}`);
    assert.deepEqual(twin.data, real, `${name}: the twin says what SQL says`);
  }
});
```

- [ ] **Step 2: Run it on the stack**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && node tooling/scripts/checks/test.mjs tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs
```

Expected: `# pass 11`, `# fail 0`, `# skip 0` (a `paged_read_capped` log line from the shop's fold is expected: it is
the cut the test proves). If the byte-equality fails, print both strings' first difference
(`[...JSON.stringify(sql)].findIndex((c, i) => c !== JSON.stringify(fold)[i])`) and report it with ten characters
either side; do not change the seed to make the two agree.

- [ ] **Step 3: Commit**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add tooling/scripts/tests/playbooks/totals/playbook-totals.db.test.mjs && git commit -m "$(cat <<'EOF'
GET playbooks is proved the same bytes on the seeded stack where the fold counts right, and the fold short past its caps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: EXPLAIN (ANALYZE, BUFFERS) at 3,600 runs × 25, recorded for the pull request

**Files:** none in the repo. Output under the scratchpad:
`/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/moment-explain/`.

- [ ] **Step 1: Write the seed and the measure**

Create `/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/moment-explain/seed-3600x25.sql`
(Write tool):

```sql
-- The measure's seed for 00362 (never committed): one workspace, its owner, three moments, 2,000 people with a thread
-- each, 3,600 runs of 25 (24 sent with a message, one held back), a reply on one thread in ten an hour after the send.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000e0002');
insert into public.tenants (id, slug, name, timezone)
  values ('00000000-0000-4000-8000-0000000e0001', 'explain-3600', 'Explain 3600', 'America/Chicago');
insert into public.memberships (tenant_id, user_id, role)
  values ('00000000-0000-4000-8000-0000000e0001', '00000000-0000-4000-8000-0000000e0002', 'owner');
insert into public.templates (id, tenant_id, channel, name, language, meta_status)
  values ('00000000-0000-4000-8000-0000000e0003', '00000000-0000-4000-8000-0000000e0001', 'whatsapp', 'explain_offer', 'en_US', 'approved');
insert into public.playbooks (id, tenant_id, name, trigger, template_id, template_name, template_language, policy_class)
select ('00000000-0000-4000-8000-0000000e010' || k)::uuid, '00000000-0000-4000-8000-0000000e0001', 'Explain ' || k,
       (array['quiet_30', 'new_week', 'lapsed'])[k], '00000000-0000-4000-8000-0000000e0003', 'explain_offer', 'en_US',
       (array['reengage', 'campaign', 'reengage'])[k]
  from generate_series(1, 3) k;
insert into public.contacts (id, tenant_id)
select md5('explain-contact-' || i)::uuid, '00000000-0000-4000-8000-0000000e0001' from generate_series(1, 2000) i;
insert into public.conversations (id, tenant_id, contact_id)
select md5('explain-thread-' || i)::uuid, '00000000-0000-4000-8000-0000000e0001', md5('explain-contact-' || i)::uuid
  from generate_series(1, 2000) i;
insert into public.broadcasts (id, tenant_id, name, template_id, template_name, template_language, audience, state,
                               scheduled_for, recipient_count, playbook_id, run_for, created_at)
select md5('explain-run-' || r)::uuid, '00000000-0000-4000-8000-0000000e0001', 'Explain run ' || r,
       '00000000-0000-4000-8000-0000000e0003', 'explain_offer', 'en_US',
       jsonb_build_object('kind', 'playbook', 'trigger', (array['quiet_30', 'new_week', 'lapsed'])[1 + r % 3]),
       case when r = 3599 then 'pending_approval' else 'sent' end,
       now() - make_interval(hours => 3600 - r), 25,
       ('00000000-0000-4000-8000-0000000e010' || (1 + r % 3))::uuid, date '2016-01-01' + r / 3,
       now() - make_interval(hours => 3600 - r)
  from generate_series(0, 3599) r;
insert into public.messages (id, tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, meta, created_at)
select md5('explain-message-' || r || '-' || k)::uuid, '00000000-0000-4000-8000-0000000e0001',
       md5('explain-thread-' || (1 + (r * 25 + k) % 2000))::uuid, md5('explain-contact-' || (1 + (r * 25 + k) % 2000))::uuid,
       'whatsapp', 'outbound', 'human', 'template', 'Explain offer',
       case when k % 5 = 0 then 'read' else 'delivered' end, '{"source": "broadcast"}'::jsonb,
       now() - make_interval(hours => 3600 - r)
  from generate_series(0, 3599) r cross join generate_series(0, 23) k;
insert into public.broadcast_recipients (broadcast_id, contact_id, tenant_id, state, reason, message_id, sent_at, channel)
select md5('explain-run-' || r)::uuid, md5('explain-contact-' || (1 + (r * 25 + k) % 2000))::uuid,
       '00000000-0000-4000-8000-0000000e0001',
       case when k = 24 then 'skipped' else 'sent' end, case when k = 24 then 'opted_out' end,
       case when k < 24 then md5('explain-message-' || r || '-' || k)::uuid end,
       case when k < 24 then now() - make_interval(hours => 3600 - r) end, 'whatsapp'
  from generate_series(0, 3599) r cross join generate_series(0, 24) k;
insert into public.messages (tenant_id, conversation_id, contact_id, channel, direction, sender, type, body, status, meta, created_at)
select '00000000-0000-4000-8000-0000000e0001', md5('explain-thread-' || (1 + (r * 25 + k) % 2000))::uuid,
       md5('explain-contact-' || (1 + (r * 25 + k) % 2000))::uuid, 'whatsapp', 'inbound', 'customer', 'text', 'Yes please',
       'received', '{}'::jsonb, now() - make_interval(hours => 3600 - r) + interval '1 hour'
  from generate_series(0, 3599) r cross join generate_series(0, 23) k
 where k % 10 = 3;
commit;
analyze public.broadcasts;
analyze public.broadcast_recipients;
analyze public.messages;
analyze public.playbooks;
```

Create `.../scratchpad/moment-explain/explain-3600x25.sql`:

```sql
-- auto_explain is preloaded on the stack (shared_preload_libraries); its settings are a superuser's, set before the
-- role changes. The nested plans (the function's statement, run_counts' inside it) come back as notices.
\set ON_ERROR_STOP on
set auto_explain.log_min_duration = 0;
set auto_explain.log_analyze = on;
set auto_explain.log_buffers = on;
set auto_explain.log_timing = on;
set auto_explain.log_nested_statements = on;
set auto_explain.log_level = notice;
set client_min_messages = notice;
\timing on
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000e0002", "role": "authenticated"}', true);
explain (analyze, buffers) select public.playbook_totals('00000000-0000-4000-8000-0000000e0001'::uuid, 10);
select pg_column_size(public.playbook_totals('00000000-0000-4000-8000-0000000e0001'::uuid, 10)) as answer_bytes;
explain (analyze, buffers) select public.template_sends('00000000-0000-4000-8000-0000000e0001'::uuid);
rollback;
```

Create `.../scratchpad/moment-explain/cleanup.sql`:

```sql
\set ON_ERROR_STOP on
delete from public.tenants where id = '00000000-0000-4000-8000-0000000e0001';
delete from auth.users where id = '00000000-0000-4000-8000-0000000e0002';
```

- [ ] **Step 2: Seed, measure twice (cold, then warm), clean up**

```bash
X="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/moment-explain"
docker exec -i supabase_db_cm-moment-test psql -U supabase_admin -d postgres -f - < "$X/seed-3600x25.sql" > "$X/seed.log" 2>&1; tail -3 "$X/seed.log"
docker exec -i supabase_db_cm-moment-test psql -U supabase_admin -d postgres -f - < "$X/explain-3600x25.sql" > "$X/explain-cold.txt" 2>&1
docker exec -i supabase_db_cm-moment-test psql -U supabase_admin -d postgres -f - < "$X/explain-3600x25.sql" > "$X/explain-warm.txt" 2>&1
grep -E "Execution Time|Time:|answer_bytes|^ +[0-9]+$" "$X/explain-warm.txt"
docker exec -i supabase_db_cm-moment-test psql -U supabase_admin -d postgres -f - < "$X/cleanup.sql"
```

Expected: the seed log ends with `ANALYZE`; each explain file holds the nested plans as `NOTICE:  duration: … plan:`
blocks and the top `Execution Time`. Use a 600000 ms timeout for the seed.

- [ ] **Step 3: Write down what it says**

Create `.../scratchpad/moment-explain/README.txt` with: the warm `Execution Time` of `playbook_totals` and of
`template_sends`, the answer's bytes, the plan nodes that read `broadcast_recipients` and `messages` (index or
sequential scan, rows, `Buffers: shared hit/read`), and the date. If `playbook_totals` took more than 8,000 ms warm (the
authenticated role's `statement_timeout`, 00283), stop and report it: spec §4.7 makes an index a measured follow-up,
and this is the measure. Nothing to commit: the pull request's body carries these numbers (lane 4's or the
coordinator's PR task reads this file).

---

## Task 19: The lane, checked whole

**Files:** baselines and docs the ratchets bank (`tooling/scripts/tests/baselines/*.json`, `docs/debt.md`), whatever
drift the checks find.

- [ ] **Step 1: A clean replay still writes what is committed**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && for f in supabase/migrations/0036[0-4]_*.sql; do cmp -s "$f" "$SUPABASE_WORKDIR/$f" || echo "STALE COPY $f"; done && "$SUPABASE_CLI" db reset --local --workdir "$SUPABASE_WORKDIR" && node tooling/scripts/gen/schema-snapshot.mjs --check && node tooling/scripts/gen/db-types.mjs --check && node tooling/scripts/gen/schema-sets.mjs --check && node tooling/scripts/checks/migration-ledger.mjs --check && corepack pnpm gen:data-model && git status --short docs/data-model.md
```

Expected: no `STALE COPY`; each check says current; `git status` prints nothing for `docs/data-model.md`. A stale one:
regenerate it (the same command without `--check`), commit it with a line saying which migration's last edit it follows.

- [ ] **Step 2: The lane's database suites, once more on the clean replay**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && for f in playbooks/totals/playbook-totals.db reach-out-back/chain-totals.db reports/periods/reach-out-month.db broadcasts/campaign-channels.db reach-out-back/what-comes-back.db database/each-workspace-is-told-what-changed.db database/realtime-publication.db database/privileges.db partners/second-factor-catalog.db partners/second-factor.db reports/report-days.db reach-out/email-marketing.db consent/email-offers.db messages/a-released-person-is-tried-again.db; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs || break; done
```

Expected: each `# fail 0`, `# skip 0`.

- [ ] **Step 3: Builds, dist, types, lint, format**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && corepack pnpm --filter "./packages/*" build && git status --short packages/ && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check
```

Expected: no `packages/` drift after the build; typecheck and lint clean; `format:check` (CI's own, which honours
`.prettierignore`) ends `All matched files use Prettier code style!`. A file it names is one of this lane's: run
`corepack pnpm exec prettier --write <that file>` and commit it. A lint warning count that fell is banked with `corepack pnpm lint -- --update`; one that rose is fixed, not
raised.

- [ ] **Step 4: Bank the ratchets' falls; no rise**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo && node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo && corepack pnpm check:dead-exports && git status --short tooling/scripts/tests/baselines docs/debt.md
```

Expected: the second run `# fail 0`. The one fall this lane makes is `casts.json`'s `nonNull` for
`apps/dashboard/src/server/campaigns/broadcasts.ts` (2 → 1: the run's sheet no longer writes `counts.get(id)!`);
`docs/debt.md`'s totals move with it. `check:dead-exports` must pass; if it reports a fall, run it with `-- --update`;
a rise (an export nothing reads) is fixed by removing the export, never raised.

- [ ] **Step 5: Every test file this lane touched, and the ones that name what it changed**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && for f in playbooks/totals/playbook-totals email/email-intake email/core-email-ingest reports/report-repository broadcasts/broadcast-counts-are-whole broadcasts/broadcasts broadcasts/run-report broadcasts/ask-broadcasts-reads broadcasts/ask-run-card broadcasts/ask-campaign-channels broadcasts/preview-by-channel playbooks/send-rails playbooks/runs-honest playbooks/playbooks playbooks/outbound-routes playbooks/follow-up-by-channel playbooks/veto-words playbooks/playbook-composer playbooks/campaigns-seam playbooks/home/moments-offered templates/templates-truth templates/templates-made-here templates/campaign-message templates/starter-templates templates/template-sends ask/readers ask/ask-context ask/ask-routes ask/honesty/ask-says-what-is-true workspace/ask-workspace-reads e2e/e2e-harness-campaigns shell/polish shell/surfaces/refresh-coverage shell/surfaces/message-fan-out shell/surfaces/surface-boot people/lists/a-list-has-a-life reach-out-sheet/reach-out-rows reach-out-sheet/reach-out-sheet-words reports/headline/headline-boot calendar/calendar-counts messages/a-failed-send-says-why routes/route-policy routes/api-reference routes/route-types shipping/browser-entry database/migrations; do node tooling/scripts/checks/test.mjs tooling/scripts/tests/$f.test.mjs > /dev/null 2>&1 && echo "ok   $f" || echo "FAIL $f"; done
```

Expected: every line `ok`. For a `FAIL`, run that file alone to read why, fix it within this lane's intent, and rerun
this whole step.

- [ ] **Step 6: Commit what was banked**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git add tooling/scripts/tests/baselines docs/debt.md && git status --short && git commit -m "$(cat <<'EOF'
The counts' lane banks what fell: a run's sheet asserts one count less

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

If Steps 1–5 found nothing to bank, skip the commit and say so. `git status --short` must then be clean apart from the
untracked spec and the other lanes' plan files.

---

## Task 20: The throwaway stack, stopped

**Files:** none.

The scratch project keeps its `supabase/migrations` (with 00360–00364); `stop --no-backup` removes the containers and
their data. Lane 4 needs a stack for 00365: its plan (`2026-10-09-moment-lane-4-ask.md`, R6) starts this same project
again with `start -x …` against this scratch folder, which replays every migration in it. If the coordinator runs lane
4 right after this lane, it may skip this task and leave the stack up; otherwise:

- [ ] **Step 1: Stop it**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"; ENV="/c/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/67a86058-ecd1-438c-a9fe-a84747bd08bd/scratchpad/cm-moment-test.env.sh"
cd "$W" && source "$ENV" && "$SUPABASE_CLI" stop --no-backup --workdir "$SUPABASE_WORKDIR"; docker ps --format '{{.Names}}' | grep cm-moment-test || echo "stopped"
```

Expected: `Stopped supabase local development setup.` then `stopped`.

- [ ] **Step 2: Nothing of the lane is left uncommitted**

```bash
W="/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-campaigns-2"
cd "$W" && git status --short && git log --oneline d1bb65961..HEAD | head -30
```

Expected: only untracked docs (the spec and plan files); the log lists this lane's commits on top of `7ff179717`.

---

## Open points

1. **Test homes (the 20-module folders).** The spec names `reports/reach-out-month.db.test.mjs` and
   `playbooks/playbook-totals.db.test.mjs`; both folders hold 20 modules and the tree-shape ratchet fails a 21st. The
   month test is `reports/periods/reach-out-month.db.test.mjs`; the totals test and its fake-database sibling make
   `playbooks/totals/` (two modules); the chains' test is `reach-out-back/chain-totals.db.test.mjs`.
2. **`reach_out_report` clamps rather than refuses** outside 1–90 days, as `campaign_series` holds its own ("as
   `campaign_series` clamps", spec §4.0). `REACH_OUT_REFUSALS.period` keeps its words for a database before 00361.
3. **00364 drops 00321's publication step.** 00324 took every table out of `supabase_realtime`, and
   `database/realtime-publication.db.test.mjs` fails one put back; the spec's "00321's shape" is the triggers alone.
4. **`playbookRows` is the seam's name and a third declaration.** Two private top-level `playbookRows` exist
   (`srv/ask/context/pages.ts:51`, `cmp/broadcasts/ledger.tsx:250`); the copies ratchet fails a third file. Ask's private
   one is renamed `playbookContextRows`; lane 4 rewrites that provider and should keep the rename.
5. **"A light select"** (spec §4.7) is the rows without the fold: `playbookRows` keeps `COLUMNS` and its fallbacks,
   since a narrower select would be a new `.from("playbooks")` (the tables ratchet counts each) and the weight was the
   fold, not the columns.
6. **Settings' runs read stays.** `template_sends` replaces the scans of every sent person and every templated message;
   the runs read remains, because "what sends it" (`templateUsage`) is read off the runs.
7. **Two `templateSends`.** The seam names the db wrapper `templateSends`, beside contracts' `templateSends` fold; the
   templates reader imports the wrapper as `sendsByTemplate`.
8. **The wrappers answer `Json | "missing"`** (lane 2's assumption, and the brief's word), where `reviewsLedger` answers
   `null`; `reachOutChainTotals` throws on its `P0002` refusal, as the other counts throw on failure.
9. **`reach_out_chain_totals` has no twin in `_fake-db.mjs`:** no lane-1 code calls it through the fake; lane 2's tests
   answer it with their own handlers (their plan's Task 4 does), and an unmodelled call fails loudly as the fake means
   it to.
10. **A run's sheet (`getBroadcast`)** takes its headline counts from `run_counts`; its per-person lines (replied, the
    reply's words, who answered) stay the TypeScript reading of the same rule, as the spec keeps them.
11. **Deleting `listRuns` and the fold** is a later lane (spec §6, "Later lanes"); the report's correction 5 said delete
    it now. The spec wins: the fold is the one-release fallback.
12. **The glossary rows** (the campaign reply window apart from `replyWindow`, the senses of "held") are lane 2's (spec §6
    group 3 (b)); this lane writes none.
13. **The plan on Supabase Micro is still unknown** until Task 18's measure; the local stack is not Micro. Over 8 s warm
    is a stop for Ruben (an index, a `CONCURRENTLY` file of its own).
14. **What customers see change (for the PR body):** a booking tool's notice and Gmail's forwarding confirmation stop
    counting as a reply on Reports and as "last wrote" on People; Reports' Reach-outs section answers on "This month so
    far"; a teammate's pause reaches an open Campaigns.
15. **Migration numbers** are local (00360–00364) and renumbered at push against the ledger, main, every remote branch
    and every open pull request (spec §4.7).
16. **HEAD moved** from `d1bb65961` to `7ff179717` (#1525: voice and Today; it touched `docs/api.md`, `docs/debt.md`,
    `server/rate-limit.ts`). `docs/api.md` is regenerated here, never hand-edited; `rate-limit.ts` is read, not changed.
