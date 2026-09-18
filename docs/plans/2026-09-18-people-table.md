# People Table (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make People's table better for every workspace: where each person came from (decided once in SQL), columns each member shows and hides, one keyboard listener, a bulk bar that acts on the people shown, and a header and Person column that stay put. No leads in it.

**Architecture:** Migration 00136 recreates `people_list` with one more returned column, `came_from`, and an order that ends on the id; contracts turn it into words once (`PERSON_CAME_FROM_WORDS`, `cameFromOf`) and put `cameFrom` on the row view model. The legacy People page draws its `<table class="cl-table">` from column definitions (`PL_COLUMNS`) through one hookless table component with a generic shape (rows, columns, selection, cursor, open) that Phase 1's Leads scope will reuse; a member's columns ride in `views.people` with the sort, and every save sends every key. On a desktop (901px and wider) the table becomes its own scroller, so the header sticks to its top and Person to its left; phones and tablets keep their cards.

**Tech Stack:** Supabase Postgres (a SQL function under RLS; the local stack through Supabase CLI 2.116.0), TypeScript contracts built by tsup into a committed `dist`, legacy React JSX loaded through Babel globals (`apps/dashboard/src/legacy`), plain CSS, `node:test` with the people-honest stub-React harness, Playwright (nightly, against production).

---

## Read this first

**The spec** is PRD v2, `cm-leads/docs/plans/2026-09-17-people-table-and-lead-finder.md`: section 14 "Phase 0", with sections 2 and 6. Ruben approved it on 18 September: "the table first, since it improves People as it is today". Phase 0 has no leads, no Apify, no AI, no SQL paging and no words-to-chips; those are Phase 1 or later.

**Proven before this plan was written.** Every code block in Tasks 1 to 7 was applied to copies of the files at origin/main `98d37a57` and run. If a step's output differs from what is written here, main has moved: re-read the file before editing (Task 0, Step 4 checks this).
- Each `old` text below occurs exactly once in its file at the point its task uses it. Line numbers in the **Files** lists are origin/main's, and earlier tasks move them, so every edit is anchored on its text: use your editor's exact-text replace, never a line number.
- `people-honest.test.mjs`: each task's new tests fail on the code before that task, for the reason given, and pass after it. The 16 existing tests pass at every step, 26 at the end. `person-honest.test.mjs` (24) passes on the final page.
- The source pins (calendar-people, attention-strip, consent-door, marketing-consent, saved-lists, today-queue, exports, layout-measure: 98 tests) pass at every step with the calendar-people edits below. Without those edits, only the two tests this plan names fail.
- The legacy lint rules (react-hooks, script mode) report 0 errors and 0 warnings on every intermediate page. The contracts change type-checks under the package's own tsconfig.
- The migration ran on the local Postgres, first inside a rolled-back transaction, then for the DB test; 00127's function was restored afterwards. It returned every `came_from` value, the one-person read, the whole order and paging. It leaves one function (no overload), and anon cannot execute it. The DB test failed before the migration (3 of 3) and passed after it, beside `people-pages`, `person-email` and `email-intake`.
- In a real browser (the People harness, final page and stylesheet), at 1000px the table scrolls in its own box (474x458 for a 1031x4450 table). Person and its heading stay put while State slides under them; the header stays at the top while rows scroll under it; the hairline switches on. The selected row is an ink tint in light and dark. The cursor's first cell carries the accent edge, and its row actions show. At 375px and 800px the cards are unchanged, Came from and the Columns button are hidden, and nothing scrolls the page sideways. At 1280px the Columns menu opens fully on screen and stays open.
- **Today**, at 1280px with a calendar connected, the table is 921px wide inside a 746px clipped box. 176px are cut off, so Visits is half hidden and Offers and the row actions cannot be reached. Task 7 fixes that.

**Where the spec and the code disagree, and what this plan does:**
1. **Migration number.** The spec says 00135, but #673 took `00135_a_failed_intake_can_be_taken_again.sql` (merged and in production, 18 Sep). This plan takes **00136** and re-checks right before pushing (Task 9).
2. **The saved view.** The spec (sections 2 and 6.1) says `{ sortBy, sortDir, attentionTab, columns }`. The page stopped saving `attentionTab` when the attention strip went (`clients-a.jsx:1459-1461`: "the next save drops it"). Every save sends every key the page owns, `{ sortBy, sortDir, columns }`. The three comments that still say `attentionTab` are corrected (Task 5).
3. **Receptionist by default.** Spec section 6.2 lists it as off. Today it is the fourth column when there is no calendar, `e2e/people.spec.ts:56` pins that, and Phase 0 is done only when the e2e specs pass unchanged apart from the new column. So it stays on without a calendar and off with one. While its column is hidden, its word sits beside the state, as it does today.
4. **The sticky column.** Spec section 2 says the header is sticky, and it is. But `.cl-table-wrap { overflow: clip }` (`clients.css:778-784`) means nothing scrolls sideways, and a wide table is cut off. A pinned column needs a scroller, so on a desktop the table becomes its own scroller and the page above it holds still. The design canvas does the same (`.lt-shell`, `.lt-wrap`).
5. **Keys beyond the list.** Spec sections 6.4 and 6.5 also name Shift-extend, F, C and Cmd-K; Phase 0's list does not, so they are not built. "Row actions show on the keyboard cursor" is already true (`clients.css:1710`, `tr.focused .cl-row-actions`); it is kept and tested.
6. **Drifted line numbers.** The calendar-people pins are at 601, 704, 710, 713 and 715 (the facts file said 595, 698, 704 and 709). The e2e header list is asserted at `people.spec.ts:56`; line 52 is its locator.
7. **Came from** is not sortable and not in the selection's CSV export: `calendar-people.test.mjs:654` pins that file's columns.

**House rules this plan follows:**
- Never add a `readCode(` or `readRaw(` assertion. Pins that the change must alter are removed or narrowed inside their existing assertions, and behaviour tests through the people-honest harness replace them. No `readCode(` call is removed, so no source-scan count falls; Task 9 runs the ratchet anyway.
- Migrations: take the next free number and re-check it right before pushing. The production `db push` is the agent's since 18 Sep (Ruben: "every production database push — please do this yourself"), in the order Task 9, Step 7 gives.
- `packages/*/dist` is committed. Rebuild after any source change and keep only dists with a real diff (`git diff -w --ignore-cr-at-eol`). The unit tests import `@chanlytics/contracts` from its `dist`, so rebuild before believing a red test.
- Legacy JSX: bump `?v=N` in `apps/dashboard/src/legacy/Chanlytics.html` once per edited file per PR. No new legacy file is added (the table stays in `clients-a.jsx` until Leads needs it), so neither `manifest.ts` nor the file lists change.
- No route changes: the two route files get comment edits only, so `route-policy.json` and the route registry are not regenerated; Task 9 runs both tests to prove it.
- Commands Ruben runs are PowerShell 5.1 one-liners: no `&&`, and env vars are set first.

**The people-honest harness** (`tooling/scripts/tests/people-honest.test.mjs`) renders the real page through the real `peopleOverride.apply()` over a faked `fetch` (`wire`), on a stub React. The stub has `useState`, `useReducer` and `useRef`, keyed by one global call order; `useMemo` runs its function every draw; `useEffect` honours deps and cleanups. It has no `memo`, `useLayoutEffect`, `forwardRef` or `useId`. `draw()` renders, `press(key, target)` sends a keydown with no Shift to every window listener and returns whether `preventDefault` was called, `click(node)` presses a node, and `byTestId`, `find`, `all` and `textOf` read the tree. `select-all` is pressed as `.props.onChange()` with no event. `MoreMenu` is stubbed to `() => null`, so its `items` are read from props. Hook order is global, so anything that comes and goes (a list's own controls above the table) shifts the hooks drawn after it: **the table and the Columns menu are hookless**, and their state lives on the page.

**Commands.** Every command runs in Git Bash from the worktree root. The tool's working directory does not persist, so start each command with `cd "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-people-table" && `. The commands below leave that prefix out.
- One test file: `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`
- The Supabase CLI (2.116.0, the version CI pins; it is also the binary `check-db-types.mjs` wants): `SB="$HOME/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"`. It is not a repo dependency. If it is missing, ask Ruben before `npx -y supabase@2.116.0 --version`, which downloads it again.
- The local database's env, in the same command as the test: `eval "$("$SB" status -o env | sed -n 's/^\(SERVICE_ROLE_KEY\|ANON_KEY\)=/export SUPABASE_\1=/p')"; export SUPABASE_URL=http://127.0.0.1:54321;`
- The local stack needs Docker Desktop. If `docker version --format '{{.Server.Version}}'` errors, start it with PowerShell `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` and poll until it answers (up to about 4 minutes). The stack (`supabase_*_chanlytics-messaging`) is shared by every worktree on this machine.

---

## File structure

| File | Change | Its one responsibility |
|---|---|---|
| `supabase/migrations/00136_a_person_says_where_they_came_from.sql` | create | `people_list` recreated with `came_from` and a whole order |
| `tooling/scripts/tests/people-came-from.db.test.mjs` | create | proves each `came_from`, the member's RLS path and the whole order on Postgres |
| `packages/db/src/database.types.ts` | modify (generated) | `people_list` Returns gains `came_from: string` |
| `packages/contracts/src/people.ts` | modify | `PersonRowDto.came_from?`, `PersonCameFrom`, `PERSON_CAME_FROM_WORDS`, `cameFromOf`, `PersonRowVM.cameFrom` |
| `packages/*/dist/**` | modify (built) | the committed builds; only real diffs |
| `apps/dashboard/src/legacy/pages/clients-a.jsx` | modify | `PL_COLUMNS` and the generic `PeopleTable`; the Columns menu; the one keyboard listener; the view save; the bulk bar on what is shown; the scroller's state |
| `apps/dashboard/src/legacy/styles/clients.css` | modify | the new cells and their card rules, the Columns menu, the selected tint, the desktop scroller with its sticky header, pinned column and hairline |
| `apps/dashboard/src/legacy/Chanlytics.html` | modify | `clients-a.jsx?v=17`, `clients.css?v=9` |
| `apps/dashboard/src/legacy-bridge/people-detail.ts` | modify (comment) | `saveView`'s comment says what a view holds |
| `apps/dashboard/app/api/v1/views/route.ts`, `apps/dashboard/app/api/v1/views/[page]/route.ts` | modify (comments) | the same, on the routes |
| `tooling/scripts/tests/people-vm.test.mjs` | modify | `cameFromOf` and the words |
| `tooling/scripts/tests/people-honest.test.mjs` | modify | `wire`/`freshPage` take a calendar, views and a booking link; the Phase 0 behaviour tests |
| `tooling/scripts/tests/calendar-people.test.mjs` | modify | four pins removed or narrowed (601, 704, 710, 713), their behaviour now tested in people-honest |
| `e2e/people.spec.ts` | modify | the header list gains "came from"; the Columns menu, and the pinned column at 960px |
| `docs/system-prd.md`, `apps/dashboard/src/legacy/CLAUDE.md` | modify | say what People's table does now |
| `docs/plans/2026-09-18-people-table.md` | create (copy) | this plan, committed with the work |

**Why the table stays in `clients-a.jsx`.** Its shape is generic now: rows, column definitions, what a cell needs, a selection, a cursor and an open. Moving it to a legacy file of its own would mean adding that file to both `apps/dashboard/src/legacy-bridge/manifest.ts` and `Chanlytics.html` (`legacy-harness.test.mjs` pins the two lists together). It would also need adding to every harness that imports the page directly (people-honest, person-honest, refusals-on-the-page) and to the visual harness's build list, with nothing else drawing it yet. Phase 1 moves it when Leads draws it. It will then also lift the three People words still inside it into props: the row id prefix `person-`, the foot's "person/people", and the empty state's sentence.

---

## Task 0: A worktree of its own

**Files:** none changed yet (the plan is copied in at Step 5).

- [ ] **Step 1: Create the worktree from origin/main**

```bash
git -C "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-leads" fetch origin
git -C "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-leads" worktree add "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-people-table" -b feat/people-table-phase-0 origin/main
```

Expected: `Preparing worktree (new branch 'feat/people-table-phase-0')` and `HEAD is now at <origin/main>`.

- [ ] **Step 2: Install, in the worktree**

Run: `corepack pnpm install --frozen-lockfile --prefer-offline`
Expected: `Done in …` (about two minutes). The worktree gets its own `node_modules`, so `@chanlytics/*` resolve to its own packages.

- [ ] **Step 3: The People suites are green before anything changes**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/person-honest.test.mjs tooling/scripts/tests/people-vm.test.mjs tooling/scripts/tests/calendar-people.test.mjs tooling/scripts/tests/migrations.test.mjs tooling/scripts/tests/source-scan-ratchet.test.mjs`
Expected: `# fail 0`.

- [ ] **Step 4: Check what main changed since this plan was written**

Run: `git diff --stat 98d37a57..origin/main -- apps/dashboard/src/legacy/pages/clients-a.jsx apps/dashboard/src/legacy/styles/clients.css apps/dashboard/src/legacy/Chanlytics.html packages/contracts/src/people.ts supabase/migrations tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/people-vm.test.mjs tooling/scripts/tests/calendar-people.test.mjs e2e/people.spec.ts docs/system-prd.md apps/dashboard/src/legacy/CLAUDE.md`
Expected: no output. If a file is listed, read what changed before its task and fit the `old` texts to it. If `supabase/migrations` is listed, take the next free number in Task 1.

- [ ] **Step 5: Commit this plan with the work**

```bash
cp "/c/Users/Ruben/Documents/Claude Projects/Claude Video/cm-leads/docs/plans/2026-09-18-people-table.md" docs/plans/2026-09-18-people-table.md
git add docs/plans/2026-09-18-people-table.md
git commit -m "The People table's plan: Phase 0" -m "Phase 0 of the People and lead-finder PRD (docs/plans/2026-09-17-people-table-and-lead-finder.md, which stays in the cm-leads worktree until Ruben decides Phase 1)." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 1: `people_list` says where each person came from (00136)

**Files:**
- Create: `tooling/scripts/tests/people-came-from.db.test.mjs`
- Create: `supabase/migrations/00136_a_person_says_where_they_came_from.sql`
- Modify: `packages/db/src/database.types.ts` (the `people_list` Returns, near line 3016; generated)
- Modify: `packages/*/dist/**` (built; only real diffs)

- [ ] **Step 1: Write the failing DB test**

Create `tooling/scripts/tests/people-came-from.db.test.mjs`:

```js
/**
 * People says where each person came from -- decided once, in SQL (00136).
 *
 * The page, the profile and every other reader of people_list say the same
 * thing because the rule lives in the function: the door that added them wins
 * (the calendar, a lead, a hand), then an imported history, then their first
 * spoken event -- a call, or the wire a message travelled. A function body, the
 * events it reads under a member's own RLS, and an order that pages without
 * repeating anyone are what reading source cannot prove, so these run against
 * Postgres in the database workflow; skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

let db;
const tenants = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const tenant = async (slug) => {
  const t = ok(await db.from("tenants").insert({ slug: `${slug}-${Date.now()}-${tenants.length}`, name: slug }).select("id").single());
  tenants.push(t.id);
  return t.id;
};

before(() => {
  if (!skip) db = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of tenants) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

let phones = 0;
/** A person; how a door added them (a contact.added source, `null` for an event with none); what they said and when. */
const person = async (tenantId, name, { added, messages = [], calls = [] } = {}) => {
  phones += 1;
  const c = ok(await db.from("contacts").insert({ tenant_id: tenantId, display_name: name, phone_e164: `+1555013${String(phones).padStart(4, "0")}` }).select("id").single());
  if (added !== undefined) {
    ok(await db.from("events").insert({ tenant_id: tenantId, kind: "contact.added", category: "contact", subject_type: "contact", subject_id: c.id, data: added === null ? {} : { source: added } }));
  }
  if (messages.length || calls.length) {
    const conv = ok(await db.from("conversations").insert({ tenant_id: tenantId, contact_id: c.id, state: "open" }).select("id").single());
    if (messages.length) {
      ok(await db.from("messages").insert(messages.map((m) => ({ tenant_id: tenantId, conversation_id: conv.id, contact_id: c.id, type: "text", direction: "inbound", sender: "customer", status: "received", body: "Hello", meta: {}, ...m }))));
    }
    for (const [i, k] of calls.entries()) {
      ok(await db.from("calls").insert({ tenant_id: tenantId, contact_id: c.id, conversation_id: conv.id, retell_call_id: `came-from-${c.id}-${i}`, direction: "inbound", status: "ended", from_e164: "+15550139999", ended_at: k.started_at, duration_ms: 60_000, raw: {}, ...k }));
    }
  }
  return c.id;
};

const T0 = "2026-08-01T12:00:00Z";
const T1 = "2026-08-02T12:00:00Z";

test("people_list says where each person came from: how a door added them, else an import, else their first call or the wire of their first word", { skip }, async () => {
  const t = await tenant("came-from");
  const ids = {
    calendar: await person(t, "From the calendar", { added: "calendar", messages: [{ channel: "whatsapp", channel_ts: T0 }] }),
    lead: await person(t, "A lead", { added: "lead" }),
    manual: await person(t, "By hand", { added: "manual" }),
    otherDoor: await person(t, "Through another door", { added: "import_csv" }),
    noSource: await person(t, "An event with no source", { added: null }),
    imported: await person(t, "Imported", { messages: [{ channel: "whatsapp", channel_ts: null, meta: { backfill: "true" } }], calls: [{ started_at: T0 }] }),
    phoned: await person(t, "Phoned first", { calls: [{ started_at: T0 }], messages: [{ channel: "whatsapp", channel_ts: T1 }] }),
    whatsapp: await person(t, "Wrote on WhatsApp first", { messages: [{ channel: "whatsapp", channel_ts: T0 }], calls: [{ started_at: T1 }] }),
    sms: await person(t, "Texted", { messages: [{ channel: "email", direction: "outbound", sender: "ai", status: "failed", channel_ts: T0 }, { channel: "sms", channel_ts: T1 }] }),
    email: await person(t, "Emailed", { messages: [{ channel: "email", channel_ts: T0 }, { channel: "whatsapp", channel_ts: T1 }] }),
    nothing: await person(t, "Nothing yet"),
  };
  const rows = ok(await db.rpc("people_list", { p_tenant_id: t }));
  const said = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, rows.find((r) => r.id === id)?.came_from]));
  assert.deepEqual(said, {
    calendar: "calendar", lead: "lead", manual: "manual", otherDoor: "manual", noSource: "manual",
    imported: "import", phoned: "call", whatsapp: "whatsapp", sms: "sms", email: "email", nothing: null,
  }, "the event wins over their words; an import over a call; a failed send is nobody's first word");
  const one = ok(await db.rpc("people_list", { p_tenant_id: t, p_contact_id: ids.calendar }));
  assert.equal(one[0].came_from, "calendar", "one person, as the profile reads them: the same answer");
});

test("a member reads the same answer under their own RLS: the events the rule reads are theirs to read", { skip }, async () => {
  const t = await tenant("came-from-member");
  const id = await person(t, "From the calendar", { added: "calendar" });
  const email = `came-from-${Date.now()}@example.test`;
  const made = ok(await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true }));
  try {
    ok(await db.from("memberships").insert({ tenant_id: t, user_id: made.user.id, role: "viewer" }));
    const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
    const { error: signIn } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
    assert.equal(signIn, null, signIn?.message);
    const rows = ok(await as.rpc("people_list", { p_tenant_id: t }));
    assert.equal(rows.find((r) => r.id === id)?.came_from, "calendar");
  } finally {
    await db.auth.admin.deleteUser(made.user.id);
  }
});

test("the order is whole: people alike in everything it reads come back by id, so a page never repeats or skips one", { skip }, async () => {
  const t = await tenant("came-from-order");
  // One statement: one created_at, and no message or call to order them by.
  const made = ok(await db.from("contacts").insert([1, 2, 3, 4, 5].map((i) => ({ tenant_id: t, display_name: `Tie ${i}`, phone_e164: `+155501490${i}` }))).select("id"));
  const byId = made.map((m) => m.id).sort();
  const all = ok(await db.rpc("people_list", { p_tenant_id: t }));
  assert.deepEqual(all.map((r) => r.id), byId, "the id decides");
  const pages = [];
  for (const offset of [0, 2, 4]) pages.push(...ok(await db.rpc("people_list", { p_tenant_id: t, p_limit: 2, p_offset: offset })));
  assert.deepEqual(pages.map((r) => r.id), byId, "and paged two at a time, each person once");
});
```

The member signs in with a password the way `activations.db.test.mjs:44-45` does. A failed sign-in fails the test, never passes it (review E11). `people-pages.db.test.mjs:77-78` and `person-email.db.test.mjs:98-99` carry the old line, `if (sErr) { assert.ok(true, …); return; }`, so their RLS checks never ran when sign-in failed. Change both to `assert.equal(sErr, null, sErr?.message);` in this task.

- [ ] **Step 2: Run it against the local database, and watch it fail**

Make sure Docker answers (see Commands), then: `"$SB" status >/dev/null 2>&1 || "$SB" start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector`

Run: `eval "$("$SB" status -o env | sed -n 's/^\(SERVICE_ROLE_KEY\|ANON_KEY\)=/export SUPABASE_\1=/p')"; export SUPABASE_URL=http://127.0.0.1:54321; node --conditions=react-server --import tsx --test tooling/scripts/tests/people-came-from.db.test.mjs`

Expected: `# fail 3`. Test 1 fails with its message "the event wins over their words; …" because every `came_from` is `undefined`. Test 2 fails with `Expected values to be strictly equal` (`undefined` against `'calendar'`). Test 3 fails with "the id decides": today's order ends on `created_at`, so people added in one statement come back in no particular order.

- [ ] **Step 3: Re-check the migration number, then write the migration**

Run: `git fetch origin && git ls-tree -r --name-only origin/main -- supabase/migrations | tail -3 && gh pr list --repo expectmeout/chanlytics-os --state open --limit 100 --json number,files | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const p of JSON.parse(s))for(const f of p.files)if(f.path.startsWith('supabase/migrations/'))console.log('#'+p.number,f.path)})"`

Expected: main ends at `00135_a_failed_intake_can_be_taken_again.sql` (#673, merged 18 Sep), and no open PR claims `00136`. If 00136 is taken, use the next free number here and in every later mention (Task 9, Step 2 lists them).

Create `supabase/migrations/00136_a_person_says_where_they_came_from.sql`:

```sql
-- 00136 · A person says where they came from.
--
-- People's table gains a "Came from" column (docs/plans/2026-09-18-people-table.md),
-- and the answer is decided here, once, for every reader of people_list: the
-- page, the profile, Ask and the playbooks read the same thing.
--
--   * A contact.added event wins. The doors that add a person by hand or from
--     the calendar write one (create_person, 00053; the calendar sweep,
--     apps/edge/lib/calendar-people.ts); a message or a call that makes a
--     person writes none. Source 'calendar' is calendar, 'lead' is lead, and
--     any other -- 'manual', or whatever POST contacts was given -- is manual.
--     The event is the record: purge_events never touches it (00038), and an
--     erasure keeps its source (00131).
--   * Else an imported history is import: what we hold of them began before
--     Chanlytics did, so their first word is not ours to name.
--   * Else their first spoken event: a connected call is call; a message is the
--     wire it travelled, whatsapp, sms or email. Spoken is the ev CTE's rule: a
--     queued, canceled or failed send is nobody's first word.
--   * Else null: there is nothing to say yet.
--
-- The body is 00127's. The change: the `added` CTE (one index range per events
-- partition for the whole call, never one per person), one aggregate in `ma`,
-- the column, and the order's last key. `c.id` makes the order whole: people
-- alike in everything it reads -- a calendar sweep adds several in one
-- statement, with one created_at and no contact yet -- come back in one order,
-- so a page of them never repeats a person or skips one.
--
-- Dropped and recreated because a returned column cannot be added in place.
-- The signature is the same, so every caller keeps calling it as it does; the
-- guard, the grants and the comment are restated.
drop function if exists public.people_list(uuid, uuid, text, integer, integer);

create function public.people_list(p_tenant_id uuid, p_contact_id uuid default null, p_query text default null, p_limit integer default 1000, p_offset integer default 0)
returns table (
  id                      uuid,
  display_name            text,
  wa_profile_name         text,
  phone_e164              text,
  email                   text,
  consent                 text,
  consent_source          text,
  consent_updated_at      timestamptz,
  dnc                     boolean,
  marketing_consent            text,
  marketing_consent_source     text,
  marketing_consent_updated_at timestamptz,
  channels                text[],
  conversation_count      integer,
  escalation_count        integer,
  needs_human             boolean,
  open_escalation_reason  text,
  open_escalation_since   timestamptz,
  latest_conversation_id  uuid,
  latest_state            text,
  latest_paused_until     timestamptz,
  latest_assignee_user_id uuid,
  latest_snooze_until     timestamptz,
  latest_wa_inbound_at    timestamptz,
  last_message_at         timestamptz,
  last_message_direction  text,
  last_message_sender     text,
  last_inbound_text       text,
  last_inbound_at         timestamptz,
  last_call_at            timestamptz,
  last_inbound_call_at    timestamptz,
  last_inbound_call_summary text,
  call_count              integer,
  call_seconds            integer,
  first_contact_at        timestamptz,
  earliest_row_at         timestamptz,
  has_backfill            boolean,
  has_chat                boolean,
  message_channels        text[],
  queued_reply_at         timestamptz,
  came_from               text
)
language sql
stable
set search_path = public
as $$
  with ev as (
    select m.contact_id, m.direction, m.sender, m.type, m.channel, m.body, m.status, m.created_at,
           case when coalesce(m.meta->>'backfill', 'false') = 'true'
                then m.channel_ts
                else coalesce(m.channel_ts, m.created_at) end as at,
           coalesce(m.meta->>'backfill', 'false') = 'true' as backfill,
           -- Something the customer actually saw or said. A reply still in its
           -- cancel window, a canceled or failed send, an internal note and a
           -- call's own summary row are not "the last word" in the thread.
           m.type in ('text', 'template', 'media')
             and m.status not in ('queued', 'canceled', 'failed') as spoken
      from messages m
     where m.tenant_id = p_tenant_id
       and m.contact_id is not null
       and (p_contact_id is null or m.contact_id = p_contact_id)
  ),
  -- How they were added, when a door added them: the first contact.added event
  -- for each person, should a door ever write two.
  added as (
    select distinct on (e.subject_id)
           e.subject_id,
           coalesce(e.data->>'source', 'manual') as source
      from events e
     where e.tenant_id = p_tenant_id
       and e.kind = 'contact.added'
       and e.subject_type = 'contact'
       and (p_contact_id is null or e.subject_id = p_contact_id)
     order by e.subject_id, e.created_at
  )
  select
    c.id, c.display_name, c.wa_profile_name, c.phone_e164, c.email,
    c.consent, c.consent_source, c.consent_updated_at, c.dnc,
    c.marketing_consent, c.marketing_consent_source, c.marketing_consent_updated_at,
    coalesce(ids.channels, '{}'::text[]),
    coalesce(cvs.n, 0),
    coalesce(esc.n, 0),
    coalesce(cvs.needs_human, false),
    oe.reason,
    oe.created_at,
    lc.id, lc.state, lc.paused_until, lc.assignee_user_id, lc.snooze_until, lc.last_wa_inbound_at,
    lm.at, lm.direction, lm.sender,
    li.body, li.at,
    lk.last_at,
    lk.last_inbound_at,
    lks.summary,
    coalesce(lk.n, 0),
    coalesce(lk.seconds, 0),
    least(ma.first_at, lk.first_at),
    least(ma.first_row_at, lk.first_row_at),
    coalesce(ma.has_backfill, false),
    coalesce(ma.has_chat, false),
    coalesce(ma.channels, '{}'::text[]),
    ma.queued_at,
    -- Where they came from: how they were added, else an import, else their
    -- first spoken event.
    case
      when ad.source = 'calendar' then 'calendar'
      when ad.source = 'lead' then 'lead'
      when ad.source is not null then 'manual'
      when coalesce(ma.has_backfill, false) then 'import'
      when lk.first_at is not null and (ma.first_at is null or lk.first_at <= ma.first_at) then 'call'
      when ma.first_channel in ('whatsapp', 'sms', 'email') then ma.first_channel
    end
  from contacts c
  left join added ad on ad.subject_id = c.id
  left join lateral (
    select array_agg(distinct ci.channel order by ci.channel) as channels
      from contact_identities ci where ci.contact_id = c.id
  ) ids on true
  left join lateral (
    select count(*)::int as n, bool_or(cv.state = 'needs_human') as needs_human
      from conversations cv where cv.contact_id = c.id
  ) cvs on true
  left join lateral (
    select count(*)::int as n
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id
  ) esc on true
  left join lateral (
    select e.reason, e.created_at
      from escalations e join conversations cv on cv.id = e.conversation_id
     where cv.contact_id = c.id and e.state = 'open'
     order by e.created_at desc
     limit 1
  ) oe on true
  left join lateral (
    select cv.id, cv.state, cv.paused_until, cv.assignee_user_id, cv.snooze_until, cv.last_wa_inbound_at
      from conversations cv
     where cv.contact_id = c.id
     order by cv.last_message_at desc nulls last, cv.created_at desc
     limit 1
  ) lc on true
  left join lateral (
    select e.at, e.direction, e.sender
      from ev e
     where e.contact_id = c.id and e.at is not null and e.spoken
     order by e.at desc
     limit 1
  ) lm on true
  left join lateral (
    select e.at, e.body
      from ev e
     where e.contact_id = c.id and e.at is not null
       and e.direction = 'inbound' and e.spoken and e.body is not null
     order by e.at desc
     limit 1
  ) li on true
  left join lateral (
    select min(e.at) filter (where e.spoken) as first_at,
           min(e.created_at) as first_row_at,
           bool_or(e.backfill) as has_backfill,
           bool_or(e.type in ('text', 'template', 'media')) as has_chat,
           -- Which wires those words travelled: a person who only ever wrote by email has not used WhatsApp.
           array_agg(distinct e.channel order by e.channel) filter (where e.type in ('text', 'template', 'media')) as channels,
           max(e.created_at) filter (where e.direction = 'outbound' and e.status = 'queued') as queued_at,
           -- The wire of their first spoken message, for came_from.
           (array_agg(e.channel order by e.at, e.created_at) filter (where e.spoken and e.at is not null))[1] as first_channel
      from ev e where e.contact_id = c.id
  ) ma on true
  left join lateral (
    select count(*)::int as n,
           (coalesce(sum(k.duration_ms), 0) / 1000)::int as seconds,
           max(k.started_at) as last_at,
           -- The one that means they reached out.
           max(k.started_at) filter (where k.direction = 'inbound') as last_inbound_at,
           min(k.started_at) as first_at,
           min(k.created_at) as first_row_at
      from calls k where k.contact_id = c.id
       and k.status <> 'not_connected'
  ) lk on true
  left join lateral (
    -- What the call they placed was about: what the caller wanted, in the
    -- analysis's plain words, else the provider's summary. The attention
    -- strip reads it where a caller has written nothing.
    select coalesce(k.wanted, k.summary) as summary
      from calls k
     where k.contact_id = c.id
       and k.direction = 'inbound'
       and k.status <> 'not_connected'
       and coalesce(k.wanted, k.summary) is not null
     order by k.started_at desc
     limit 1
  ) lks on true
  where c.tenant_id = p_tenant_id
    and c.erased_at is null
    and c.merged_into_contact_id is null
    and (p_contact_id is null or c.id = p_contact_id)
    -- The search: a name, their name on WhatsApp, their email address, or
    -- three digits of the number, the way the page's own box matches.
    -- Nothing else is indexed here; the page still narrows by state and
    -- list over what it holds.
    and (
      nullif(trim(p_query), '') is null
      or c.display_name ilike '%' || trim(p_query) || '%'
      or c.wa_profile_name ilike '%' || trim(p_query) || '%'
      or c.email ilike '%' || trim(p_query) || '%'
      or (length(regexp_replace(p_query, '\D', '', 'g')) >= 3
          and regexp_replace(coalesce(c.phone_e164, ''), '\D', '', 'g') like '%' || regexp_replace(p_query, '\D', '', 'g') || '%')
    )
  order by greatest(lm.at, lk.last_at) desc nulls last, c.created_at desc, c.id
  limit least(greatest(coalesce(p_limit, 1000), 1), 1000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke execute on function public.people_list(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.people_list(uuid, uuid, text, integer, integer) to authenticated, service_role;

comment on function public.people_list(uuid, uuid, text, integer, integer) is
  'Everyone this workspace has ever heard from, with both consent answers: `consent` for conversation and their own appointments, `marketing_consent` for offers. Two answers because the carriers require them collected separately (error 30913). `came_from` says where each first came from: the door that added them (calendar, lead, manual), an imported history (import), else their first call (call) or the wire of their first message (whatsapp, sms, email); null when nothing says. p_query matches a name, a WhatsApp name, an email address or three digits of the number; p_limit (at most 1000) and p_offset page under one whole order: latest contact first, then the newest added, then the id.';
```

- [ ] **Step 4: The folder still reads in order**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/migrations.test.mjs`
Expected: `# fail 0`.

- [ ] **Step 5: Replay the migrations locally and watch the test pass**

`db reset` replays this checkout's migrations and seed into the **shared** local database, so another session's local rows go. If a session is mid-run on it, wait.

Run: `"$SB" db reset`
Expected: ends with `Finished supabase db reset on branch …`.

Run: `eval "$("$SB" status -o env | sed -n 's/^\(SERVICE_ROLE_KEY\|ANON_KEY\)=/export SUPABASE_\1=/p')"; export SUPABASE_URL=http://127.0.0.1:54321; node --conditions=react-server --import tsx --test tooling/scripts/tests/people-came-from.db.test.mjs tooling/scripts/tests/people-pages.db.test.mjs tooling/scripts/tests/person-email.db.test.mjs tooling/scripts/tests/email-intake.db.test.mjs`
Expected: `# fail 0`.

- [ ] **Step 6: Regenerate the database types from the replayed database**

Run: `SUPABASE_CLI="$SB" corepack pnpm gen:db-types && git diff --ignore-cr-at-eol --stat packages/db/src/database.types.ts`
Expected: `1 file changed, 1 insertion(+)`, with line endings ignored (use the generator CI pins, 2.116.0: 2.117 adds unrelated formatting hunks). `git diff packages/db/src/database.types.ts` shows one line, `+          came_from: string`, between `call_seconds: number` and `channels: string[]` in `people_list`'s Returns. If more changed, the local database was not replayed from this checkout: run Step 5 again first.

Run: `SUPABASE_CLI="$SB" corepack pnpm check:db-types`
Expected: exit 0. (Without Docker, add that one line by hand; CI's Database workflow runs the same check.)

- [ ] **Step 7: Rebuild the packages and keep only real dist diffs**

Run: `corepack pnpm --filter "./packages/*" build && for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done; git status --short packages`
Expected: `packages/db/src/database.types.ts` and `packages/db/dist/index.d.ts` modified (it carries the `Database` types), plus any other dist whose build really changed. Nothing is left that is only line endings.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/00136_a_person_says_where_they_came_from.sql tooling/scripts/tests/people-came-from.db.test.mjs packages/db/src/database.types.ts packages/*/dist
git commit -m "people_list says where each person came from, once, in SQL (00136)" -m "The door that added them (calendar, lead, by hand), else an imported history, else their first call or the wire of their first message; null when nothing says. The order ends on the id, so people alike in everything it reads page without repeats or gaps." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Contracts say where a person came from, in words

**Files:**
- Modify: `packages/contracts/src/people.ts` (the DTO near line 88, the words after line 349, the row VM near lines 634 and 725)
- Modify: `packages/contracts/dist/**` and any dist that bundles contracts (built)
- Test: `tooling/scripts/tests/people-vm.test.mjs`

- [ ] **Step 1: Write the failing test**

In `tooling/scripts/tests/people-vm.test.mjs`, replace:

```js
} from "@chanlytics/contracts";
```

with:

```js
} from "@chanlytics/contracts";
// A namespace too: a word this change adds is missing from the module until the dist is rebuilt, and a named import
// of it would fail the whole file instead of the one test that reads it.
import * as contracts from "@chanlytics/contracts";
```

and add at the end of the file:

```js
test("where a person came from, in the words People says it: one per stored value, and nothing for what this build does not know", () => {
  assert.deepEqual(contracts.PERSON_CAME_FROM_WORDS, {
    whatsapp: "WhatsApp", sms: "Text", email: "Email", call: "Phone call",
    calendar: "Your calendar", manual: "Added by you", import: "Imported history", lead: "A lead you found",
  });
  for (const [key, label] of Object.entries(contracts.PERSON_CAME_FROM_WORDS)) assert.deepEqual(contracts.cameFromOf({ came_from: key }), { key, label });
  assert.equal(contracts.cameFromOf({ came_from: null }), null, "nothing known, nothing said");
  assert.equal(contracts.cameFromOf({}), null, "a row read before 00136 has no came_from at all");
  assert.equal(contracts.cameFromOf({ came_from: "carrier_pigeon" }), null, "a value this build does not know is never shown raw");
  assert.equal(contracts.cameFromOf({ came_from: "toString" }), null, "nor one every object answers to");
  assert.deepEqual(toPersonRowVM(row({ came_from: "calendar" }), ZONE, NOW).cameFrom, { key: "calendar", label: "Your calendar" }, "the row carries it");
  assert.equal(toPersonRowVM(row(), ZONE, NOW).cameFrom, null);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-vm.test.mjs`
Expected: `# fail 1`, the new test. It fails with `Expected values to be strictly deep-equal`, because `contracts.PERSON_CAME_FROM_WORDS` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `packages/contracts/src/people.ts`, replace:

```ts
  queued_reply_at: string | null;
```

with:

```ts
  queued_reply_at: string | null;
  /** Where they first came from (00136): calendar | lead | manual | import | call | whatsapp | sms | email, or null
   *  when nothing says. In words through cameFromOf; absent on a row read before the column existed. */
  came_from?: string | null;
```

Replace the line:

```ts
export const PERSON_CHANNEL_WORDS: Record<PersonChannel, string> = { whatsapp: "WhatsApp", sms: "Text", voice: "Phone", email: "Email" };
```

with:

```ts
export const PERSON_CHANNEL_WORDS: Record<PersonChannel, string> = { whatsapp: "WhatsApp", sms: "Text", voice: "Phone", email: "Email" };

/**
 * Where a person first came from, as people_list decides it once (00136): the
 * door that added them (calendar, lead, manual), an imported history (import),
 * else their first call (call) or the wire of their first message (whatsapp,
 * sms, email). People's "Came from" column says it in these words; a stored
 * value is never shown.
 */
export type PersonCameFrom = "whatsapp" | "sms" | "email" | "call" | "calendar" | "manual" | "import" | "lead";

/** The words for each, once. The three wires say what a reply on them says (REPLY_VIA). */
export const PERSON_CAME_FROM_WORDS: Record<PersonCameFrom, string> = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  call: "Phone call",
  calendar: "Your calendar",
  manual: "Added by you",
  import: "Imported history",
  lead: "A lead you found",
};

/** A row's came_from in words, or null: nothing known, a row read before 00136, or a value this build does not know. */
export function cameFromOf(r: { came_from?: string | null }): { key: PersonCameFrom; label: string } | null {
  const k = r.came_from;
  if (!k || !Object.prototype.hasOwnProperty.call(PERSON_CAME_FROM_WORDS, k)) return null;
  return { key: k as PersonCameFrom, label: PERSON_CAME_FROM_WORDS[k as PersonCameFrom] };
}
```

Replace:

```ts
  firstContact: PersonFirstContact;
```

with:

```ts
  firstContact: PersonFirstContact;
  /** Where they first came from, in words (cameFromOf); null when nothing says. */
  cameFrom: { key: PersonCameFrom; label: string } | null;
```

Replace:

```ts
    firstContact: first,
```

with:

```ts
    firstContact: first,
    cameFrom: cameFromOf(r),
```

- [ ] **Step 4: Rebuild contracts and watch the test pass**

Run: `corepack pnpm --filter @chanlytics/contracts build && node --conditions=react-server --import tsx --test tooling/scripts/tests/people-vm.test.mjs`
Expected: `# fail 0`. The test imports the dist, so without the build it stays red.

- [ ] **Step 5: Type-check contracts, rebuild every package, keep real diffs**

Run: `corepack pnpm --filter @chanlytics/contracts typecheck`
Expected: no errors.

Run: `corepack pnpm --filter "./packages/*" build && for d in contracts db jobs channels core; do git diff -w --ignore-cr-at-eol --quiet -- packages/$d/dist && git checkout -- packages/$d/dist; done; git status --short packages`
Expected: `packages/contracts/src/people.ts` and `packages/contracts/dist/*` modified, plus any other dist that bundles `people.ts` with a real diff.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/people.ts packages/*/dist tooling/scripts/tests/people-vm.test.mjs
git commit -m "Contracts say where a person came from, in words" -m "came_from on the DTO (optional: a row read before 00136 has none), the words once (WhatsApp, Text, Email, Phone call, Your calendar, Added by you, Imported history, A lead you found), cameFromOf, and cameFrom on the row view model." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The table is drawn from its columns, with Came from

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx`. Four edits: the `plCols` block (lines 982-998); `PeopleTable` (lines 1043-1146); a block inserted before `const filtered` (line 1594); the `<PeopleTable …/>` call (lines 1717-1736).
- Modify: `apps/dashboard/src/legacy/styles/clients.css` (after line 1715, and inside the `max-width: 900px` block ending at line 1730)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (lines 17 and 93)
- Test: `tooling/scripts/tests/people-honest.test.mjs` (`wire` at lines 76-101, `freshPage` at 219-231, new tests at the end)
- Modify: `tooling/scripts/tests/calendar-people.test.mjs` (lines 601, 704, 713)
- Modify: `e2e/people.spec.ts` (lines 54-56)

- [ ] **Step 1: Let the harness give a calendar, saved views and a booking link**

In `tooling/scripts/tests/people-honest.test.mjs`, replace `wire` (lines 76-101):

```js
/** Everyone over pages of `per`, the saved lists (or their read failing), and what a search answers. */
const wire = ({ people, per = 1000, lists = [], listsFail = false, search = null } = {}) => {
  const seen = { offsets: [], queries: [] };
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts") {
      const q = u.searchParams.get("q");
      if (q !== null) {
        seen.queries.push(q);
        const found = search ? search(q) : { people: [], total: 0, has_more: false };
        return json(200, { ok: true, data: { people: found.people, page: { q, offset: 0, limit: 1000, total: found.total, has_more: found.has_more }, calendar: { state: "none", source: "your calendar" }, booking_link: null } });
      }
      const offset = Number(u.searchParams.get("offset") || 0);
      seen.offsets.push(offset);
      return json(200, { ok: true, data: { people: people.slice(offset, offset + per), page: { q: null, offset, limit: per, total: people.length, has_more: offset + per < people.length }, calendar: { state: "none", source: "your calendar" }, booking_link: null } });
    }
    if (u.pathname === "/api/v1/segments") {
      return listsFail
        ? json(500, { ok: false, error: { code: "internal", message: "The lists could not be read." } })
        : json(200, { ok: true, data: { lists } });
    }
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  return seen;
};
```

with:

```js
/** Everyone over pages of `per`, the saved lists (or their read failing), what a search answers, the calendar's state, the member's saved views and the booking link on file. */
const wire = ({ people, per = 1000, lists = [], listsFail = false, search = null, calendar = "none", views = {}, bookingLink = null } = {}) => {
  const seen = { offsets: [], queries: [] };
  const cal = { state: calendar, source: calendar === "ok" ? "Google Calendar" : "your calendar" };
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname === "/api/v1/contacts") {
      const q = u.searchParams.get("q");
      if (q !== null) {
        seen.queries.push(q);
        const found = search ? search(q) : { people: [], total: 0, has_more: false };
        return json(200, { ok: true, data: { people: found.people, page: { q, offset: 0, limit: 1000, total: found.total, has_more: found.has_more }, calendar: cal, booking_link: bookingLink } });
      }
      const offset = Number(u.searchParams.get("offset") || 0);
      seen.offsets.push(offset);
      return json(200, { ok: true, data: { people: people.slice(offset, offset + per), page: { q: null, offset, limit: per, total: people.length, has_more: offset + per < people.length }, calendar: cal, booking_link: bookingLink } });
    }
    if (u.pathname === "/api/v1/segments") {
      return listsFail
        ? json(500, { ok: false, error: { code: "internal", message: "The lists could not be read." } })
        : json(200, { ok: true, data: { lists } });
    }
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  return seen;
};
```

and replace `freshPage` (lines 219-231):

```js
/** People published by the real surface over the wire, and a page with nothing drawn yet. */
const freshPage = async ({ people, lists: saved = [], listsFail = false } = {}) => {
  wire({ people, lists: saved, listsFail });
  await quietly(() => peopleOverride.apply());
  cells = [];
  flashes.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  globalThis.window.location.hash = "#/clients";
  delete globalThis.window.__setPersonConsentMany;
  globalThis.window.__lists = lists();
};
```

with:

```js
/** People published by the real surface over the wire, and a page with nothing drawn yet: no view remembered on this device and none saved over the wire, unless a test gives one. */
const freshPage = async ({ people, lists: saved = [], listsFail = false, calendar = "none", views = {}, bookingLink = null } = {}) => {
  wire({ people, lists: saved, listsFail, calendar, views, bookingLink });
  await quietly(() => peopleOverride.apply());
  cells = [];
  flashes.length = 0;
  opened.length = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.document.activeElement = null;
  globalThis.window.location.hash = "#/clients";
  globalThis.localStorage.removeItem("chanlytics-people-view");
  delete globalThis.window.__saveView;
  delete globalThis.window.__setPersonConsentMany;
  globalThis.window.__lists = lists();
};
```

- [ ] **Step 2: Write the failing tests**

Add at the end of `tooling/scripts/tests/people-honest.test.mjs`:

```js
/* ------------------------- the table, drawn from its columns (Phase 0) ------------------------- */

/** The table's headings as a person reads them: the checkbox's and the actions' empty ones left out, the sort arrow off. */
const headings = (tree) => all(tree, (n) => n.type === "th").map((th) => textOf(th).replace(/[▲▼]/g, "").trim()).filter(Boolean);
/** A person's row, by their id. */
const rowOf = (tree, id) => find(tree, (n) => n.type === "tr" && n.props?.id === `person-${id}`);

test("the table's columns: Person, State, Last contact, the receptionist or, with a calendar, Visits, Offers, and Came from", async () => {
  await freshPage({ people: [person(1)] });
  assert.deepEqual(headings(draw()), ["Person", "State", "Last contact", "Receptionist", "Offers", "Came from"]);
  await freshPage({ people: [person(1)], calendar: "ok" });
  assert.deepEqual(headings(draw()), ["Person", "State", "Last contact", "Visits", "Offers", "Came from"], "with a calendar the outcome takes the receptionist's column");
});

test("a row says where the person came from, in words, and nothing when nothing is known", async () => {
  await freshPage({ people: [person(1, { came_from: "calendar" }), person(2, { came_from: "sms" }), person(3, { came_from: null }), person(4)] });
  const tree = draw();
  const said = (id) => textOf(byTestId(rowOf(tree, id), "row-came-from")).trim();
  assert.deepEqual(["p1", "p2", "p3", "p4"].map(said), ["Your calendar", "Text", "", ""], "and a row read before the column existed says nothing either");
});

test("a row with a thread offers the booking link on file; with none on file, only the thread", async () => {
  await freshPage({ people: [person(1)], bookingLink: "https://booksy.com/salon" });
  assert.ok(byTestId(draw(), "row-booking-link"), "the workspace's link reaches the row");
  await freshPage({ people: [person(1)] });
  const tree = draw();
  assert.ok(byTestId(tree, "row-open-thread"), "the thread is one press away");
  assert.equal(byTestId(tree, "row-booking-link"), null, "and there is no link to offer");
});
```

- [ ] **Step 3: Run them and watch two fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs`
Expected: `# tests 19`, `# fail 2`. "the table's columns…" fails with a deep-equal diff missing `'Came from'`, and "a row says where the person came from…" gets `['', '', '', '']`. The booking-link test passes already: it replaces a source pin (Step 7) and is mutation-checked in Step 6.

- [ ] **Step 4: Write the implementation**

In `apps/dashboard/src/legacy/pages/clients-a.jsx`, replace the `plCols` block (lines 982-998):

```jsx
// With a calendar connected the outcome takes the column the receptionist's
// state held: "Answering" on every row said nothing, the next visit does.
// The columns answer the three questions an owner brings to the page — who
// needs me, who is booked, who can I message. With a calendar connected the
// outcome takes the column the receptionist's state held ("Answering" on
// every row said nothing). Offers is the fact that gates every campaign.
// First contact lives in the identity cell now; the last column is the
// row's own actions, shown on hover.
const plCols = (withCalendar) => [
  { key: "name", label: "Person", sortable: true },
  { key: "state", label: "State", sortable: true },
  { key: "last", label: "Last contact", sortable: true },
  withCalendar ? { key: "visits", label: "Visits", sortable: true } : { key: "receptionist", label: "Receptionist", sortable: false },
  { key: "offers", label: "Offers", sortable: true },
  { key: "actions", label: "", sortable: false },
];
const PL_SORT_KEYS = ["last", "name", "state", "visits", "offers"];
```

with:

```jsx
// The keys a view may sort by; PL_COLUMNS, below, says which headings sort.
const PL_SORT_KEYS = ["last", "name", "state", "visits", "offers"];
```

Replace everything from the line that begins `const PeopleTable = ({ rows, total, sortBy, sortDir, onSort, onOpen, filtered, onClearFilters, withCalendar = false,` down to, **not including**, the line `const PL_NO_SEL = new Set();` with:

```jsx
// ---- The table, drawn from its columns -------------------------------------------------------------------------
// Each column is defined once: its heading, whether it sorts, whether a member may hide it, and how its cell is drawn
// from a row and what the page knows (`x`: withCalendar, bookingLink, attention, onOpen, drop, listsOf, shows).
// Person is pinned and always shown; a member shows or hides any other with the Columns menu, and the choice rides
// with their view (views.people.columns). With a calendar connected the outcome takes the column the receptionist's
// state held ("Answering" on every row said nothing); the receptionist stays a column a member can show, and while it
// is hidden its word sits beside the state. Offers is the fact that gates every campaign. First contact lives in the
// identity cell; the last column is the row's own actions, shown on hover and on the keyboard's row.

// The identity cell: who, on which wires, since when, and their last words.
const plNameCell = (p, { attention, onOpen }) => {
  // Named by an identifier, a number or an address: nobody has named them yet.
  const byNumber = plIsNumber(p.name);
  const numbered = byNumber || plIsAddress(p);
  // Their words, or what they said on the phone, as the attention strip says them: a row in Needs you
  // said neither, and gave no reason for the state either.
  const said = attention && attention[p.id];
  const words = said && (said.quoted || p.callSummary) ? (said.quoted ? `“${said.sentence}”` : said.sentence) : null;
  return (
    <td key="name" className="cl-name-cell pl-pin">
      <div className="cl-row-name">
        {numbered
          ? <div className="ix-thread-avatar cl-row-avatar-glyph" title="No name yet"><Icon name={byNumber ? "phone" : "mail"} size={12} /></div>
          : <div className="ix-thread-avatar">{p.initials}</div>}
        <div className="cl-row-name-block">
          <div className="cl-row-fullname">
            <span className={byNumber ? "tabular" : ""}>{p.name}</span>
            {numbered && <button className="cl-row-name-them" onClick={(e) => { e.stopPropagation(); onOpen(p.id); }} title="Give them a name on their profile" data-testid="row-name-them">Name them <Icon name="arrow-right" size={9} /></button>}
          </div>
          <div className="cl-row-meta">
            <PeopleChannels channels={p.channels} />
            {!numbered && p.phone && <><span className="dot" /><span className="tabular">{p.phone}</span></>}
            {/* The address stands in for the number only when there is none: a row says one identifier. */}
            {!numbered && !p.phone && p.email && <><span className="dot" /><span>{p.email}</span></>}
            {!numbered && p.waName && p.waName !== p.name && <><span className="dot" /><span title="Their name on WhatsApp">{p.waName} on WhatsApp</span></>}
            <span className="dot" />
            <span>{p.threads === 0 && p.calls === 0 ? "no messages yet" : `${p.threads} thread${p.threads === 1 ? "" : "s"}${p.calls ? ` · ${p.calls} call${p.calls === 1 ? "" : "s"}` : ""}`}</span>
            {p.firstContact.label !== "—" && <><span className="dot" /><span title={p.firstContact.estimate ? "The earliest row we hold; the true first contact is earlier" : "First contact"}>since {p.firstContact.label.replace(/^Before /, "before ")}</span></>}
          </div>
          {words && <div className="cl-row-words" title={words} data-testid="row-words">{words}</div>}
        </div>
      </div>
    </td>
  );
};

// The Offers cell reads the OFFERS answer, and its tooltip is that answer's own history.
const plOffersCell = (p) => {
  const offers = PL_OFFERS[p.consent.marketing] || PL_OFFERS.unknown;
  return <td key="offers" className="shrink cl-offers-cell" title={p.consent.marketingSub} data-testid="row-offers"><span className={`cl-row-offers ${offers[1]}`}>{offers[0]}</span></td>;
};

const PL_COLUMNS = [
  { key: "name", label: "Person", sortable: true, pinned: true, cell: plNameCell },
  {
    key: "state", label: "State", sortable: true,
    cell: (p, x) => (
      <td key="state" className="shrink cl-state-cell">
        <PeopleStatePill state={p.state} label={p.stateLabel} />
        {/* The receptionist's word beside the state while its own column is hidden: said once, somewhere. */}
        {!x.shows.receptionist && p.receptionist.tone !== "answering" && <span className="cl-row-recept-mark" title={p.receptionist.label}>{PL_RECEPT_MARK[p.receptionist.tone] || p.receptionist.tone}</span>}
        {p.stateDetail && <span className="cl-row-state-detail" title={p.stateDetail} data-testid="row-state-detail">{p.stateDetail}</span>}
      </td>
    ),
  },
  { key: "last", label: "Last contact", sortable: true, cell: (p) => <td key="last" className="shrink dim cl-last-cell" title={plWhen(p.lastContact.at)}>{p.lastContact.label}</td> },
  {
    key: "visits", label: "Visits", sortable: true, needs: (x) => x.withCalendar,
    cell: (p) => (
      <td key="visits" className="shrink cl-visits-cell" title={p.nextVisit || p.lastVisit || "Never on the calendar"} data-testid="row-next-visit">
        {p.nextVisitDate || p.lastVisitDate
          ? (
            // The visit opens its day on the Calendar; the row around it opens the person.
            <button type="button" className="cl-row-visit" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(`calendar/${p.nextVisitDate || p.lastVisitDate}`); }} title={`Open ${p.nextVisitDay || p.lastVisitDay} on the Calendar`} data-testid="row-visit-open">
              {p.nextVisitDay
                ? <><span className="cl-row-next">{p.nextVisitDay}</span><span className="dim"> · {(p.nextVisit || "").split(" · ")[1] || ""}</span></>
                : <span className="cl-row-last-visit">Last · {p.lastVisitDay}</span>}
            </button>
          )
          : <span className="dim">—</span>}
      </td>
    ),
  },
  { key: "receptionist", label: "Receptionist", sortable: false, on: (x) => !x.withCalendar, cell: (p) => <td key="receptionist" className="cl-recept-cell"><PeopleReceptionist r={p.receptionist} /></td> },
  { key: "offers", label: "Offers", sortable: true, cell: plOffersCell },
  // Where they first came from: people_list's came_from, in contracts' words; nothing when nothing says.
  { key: "came_from", label: "Came from", sortable: false, cell: (p) => <td key="came_from" className="shrink dim cl-came-cell" data-testid="row-came-from">{p.cameFrom ? p.cameFrom.label : ""}</td> },
  { key: "email", label: "Email", sortable: false, on: false, cell: (p) => <td key="email" className="shrink dim cl-email-cell" data-testid="row-email">{p.email || ""}</td> },
  { key: "lists", label: "Lists", sortable: false, on: false, cell: (p, x) => <td key="lists" className="dim cl-lists-cell" data-testid="row-lists">{(x.listsOf[p.id] || []).join(", ")}</td> },
  { key: "actions", label: "", sortable: false, fixed: true, cell: (p, x) => <td key="actions" className="shrink cl-actions-cell"><PeopleRowActions p={p} bookingLink={x.bookingLink} drop={x.drop} /></td> },
];

// Whether a column shows: Person and the row's actions always; any other by the member's own choice, else its default.
const plShows = (c, choices, x) => !!(c.pinned || c.fixed) || (typeof choices[c.key] === "boolean" ? choices[c.key] : typeof c.on === "function" ? c.on(x) : c.on !== false);
// The columns a member sees, in their order: the ones this workspace can show (Visits needs a calendar), as chosen.
const plVisibleColumns = (choices, x) => PL_COLUMNS.filter((c) => (!c.needs || c.needs(x)) && plShows(c, choices, x));

// The table, for any rows: the columns it is given, what a cell needs (`cell`), a selection, a keyboard cursor and a
// way to open a row. People draws it; Leads, a scope of People in Phase 1, will draw it with columns of its own. It
// stays in this file until then: a legacy file of its own must join the manifest, Chanlytics.html and every test that
// loads the page, and nothing else draws it yet. Still a <table class="cl-table">, so the page's selectors and the
// phone's card rules hold. On a desktop it scrolls in its own box (pl-table-scroll): the header sticks to its top and
// the pinned column to its left, and the hairline beside that column shows once it has scrolled sideways (`scrolled`,
// the page's state). Hookless on purpose: the tests' stub React keys state by call order, and a list's own controls
// above the table come and go.
const PeopleTable = ({ columns, cell, rows, total, sortBy, sortDir, onSort, onOpen, filtered, onClearFilters, selectable = false, sel = PL_NO_SEL, onToggle = () => {}, onToggleAll = () => {}, cursor = null, empty = null, scrolled = false, onScrolled = () => {} }) => {
  const selecting = rows.some((p) => sel.has(p.id));
  return (
    <div className={`cl-table-wrap pl-table-wrap ${selecting ? "selecting" : ""}`}>
      <div className={`pl-table-scroll ${scrolled ? "scrolled" : ""}`} onScroll={(e) => { const on = e.currentTarget.scrollLeft > 0; if (on !== scrolled) onScrolled(on); }} data-testid="people-table-scroll">
        {/* pl-table is the phone's hook: on a narrow screen these rows stop being a
            sideways scroll and stack, so the state is on the row instead of off the
            right edge. The seeded page, Leads and Lists keep the table. */}
        <table className="cl-table pl-table">
          <thead>
            <tr>
              {selectable && (
                <th className="cl-sel">
                  <input type="checkbox" className="cl-check" checked={rows.length > 0 && rows.every((p) => sel.has(p.id))} onChange={onToggleAll} aria-label="Select everyone shown" title="Select everyone shown" data-testid="select-all" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={`${c.sortable ? "sortable" : ""} ${c.pinned ? "pl-pin" : ""} ${c.key === "actions" ? "cl-actions-head" : ""}`} onClick={() => c.sortable && onSort(c.key)} aria-sort={sortBy === c.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                  {c.label}
                  {sortBy === c.key && <span className="sort-arr">{sortDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} id={`person-${p.id}`} className={`${sel.has(p.id) ? "selected" : ""} ${cursor === p.id ? "focused" : ""}`} aria-selected={selectable ? sel.has(p.id) : undefined} onClick={() => onOpen(p.id)}>
                {selectable && (
                  <td className="cl-sel" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="cl-check" checked={sel.has(p.id)} onChange={() => onToggle(p.id)} aria-label={`Select ${p.name}`} data-testid="row-select" />
                  </td>
                )}
                {columns.map((c) => c.cell(p, cell))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)}>
                  <EmptyState kind="line" className="empty-center" glyph="search" title={empty ? empty.title : total === 0 ? "Nobody has written or phoned yet." : "No one matches this view."} body={empty ? empty.body : undefined} action={empty ? empty.action : total > 0 && filtered ? { label: "Clear filters", onClick: onClearFilters } : null} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="cl-table-foot">
        <span>{filtered ? `Showing ${rows.length} of ${total}` : `${total} ${total === 1 ? "person" : "people"}`}</span>
        <span className="cl-table-keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> opens · <kbd>space</kbd> selects · <kbd>/</kbd> searches</span>
      </div>
    </div>
  );
};
```

In `ClientsAReal`, replace:

```jsx
  const filtered = tab !== "all" || !!listId || !!savedId || !!q.trim();
```

with:

```jsx
  // The columns this member sees (PL_COLUMNS: Person always, any other as chosen, else by its default), and what a
  // cell needs to draw itself: the booking link, each row's words, the list open for taking people off, their lists.
  const colCtx = { withCalendar };
  const columns = plVisibleColumns({}, colCtx);
  const listsOf = useMemo(() => {
    const m = {};
    for (const s of saved) for (const id of s.ids) (m[id] = m[id] || []).push(s.name);
    return m;
  }, [saved]);
  const cellCtx = {
    withCalendar,
    bookingLink: people.bookingLink || null,
    attention: people.attention,
    onOpen: onOpenProfile,
    drop: activeSaved && canEditLists && window.__lists ? { list: activeSaved, onDrop: dropFromList } : null,
    listsOf,
    shows: Object.fromEntries(columns.map((c) => [c.key, true])),
  };
  const filtered = tab !== "all" || !!listId || !!savedId || !!q.trim();
```

and replace the table's call:

```jsx
          <PeopleTable
            withCalendar={withCalendar}
            selectable={canEditLists || canExport}
            sel={sel}
            onToggle={toggleSel}
            onToggleAll={toggleAll}
            cursor={cursor}
            bookingLink={people.bookingLink || null}
            attention={people.attention}
            rows={shown}
            total={people.page && people.page.has_more ? people.page.total : rows.length}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            onOpen={onOpenProfile}
            filtered={filtered}
            onClearFilters={() => { setQ(""); setTab("all"); setListId(null); setSavedId(null); }}
            empty={activeSaved && activeSaved.count === 0 && tab === "all" && !listId && !q.trim() ? { title: `Nobody on ${activeSaved.name} yet`, body: "Pick people and use Add to list, or add them from their profile.", action: { label: "Show everyone", onClick: () => setSavedId(null) } } : null}
            drop={activeSaved && canEditLists && window.__lists ? { list: activeSaved, onDrop: dropFromList } : null}
          />
```

with:

```jsx
          <PeopleTable
            columns={columns}
            cell={cellCtx}
            selectable={canEditLists || canExport}
            sel={sel}
            onToggle={toggleSel}
            onToggleAll={toggleAll}
            cursor={cursor}
            rows={shown}
            total={people.page && people.page.has_more ? people.page.total : rows.length}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={onSort}
            onOpen={onOpenProfile}
            filtered={filtered}
            onClearFilters={() => { setQ(""); setTab("all"); setListId(null); setSavedId(null); }}
            empty={activeSaved && activeSaved.count === 0 && tab === "all" && !listId && !q.trim() ? { title: `Nobody on ${activeSaved.name} yet`, body: "Pick people and use Add to list, or add them from their profile.", action: { label: "Show everyone", onClick: () => setSavedId(null) } } : null}
          />
```

In `apps/dashboard/src/legacy/styles/clients.css`, replace:

```css
.cl-table-keys kbd { font: inherit; font-size: 10px; padding: 0 4px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; color: var(--ink-dim); background: var(--bg-raised); }
```

with:

```css
.cl-table-keys kbd { font: inherit; font-size: 10px; padding: 0 4px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; color: var(--ink-dim); background: var(--bg-raised); }
/* The lists a person is on: one quiet line, cut with an ellipsis rather than widening the table. */
.cl-table td.cl-lists-cell { max-width: 24ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

and, inside the `@media (max-width: 900px)` block that holds the pinned phone card rule, replace:

```css
  .cl-table td.cl-actions-cell { display: none; }
  .cl-table-keys { display: none; }
}
```

with:

```css
  .cl-table td.cl-actions-cell { display: none; }
  .cl-table-keys { display: none; }
  /* A card keeps its own few facts: where they came from, their address and their lists are the desktop's columns. */
  .cl-table td.cl-came-cell, .cl-table td.cl-email-cell, .cl-table td.cl-lists-cell { display: none; }
  /* Visits and the receptionist share one place on a card; with both columns chosen, the visit keeps it. */
  .cl-table td.cl-visits-cell ~ td.cl-recept-cell { display: none; }
}
```

In `apps/dashboard/src/legacy/Chanlytics.html`, bump the two files this PR edits: `styles/clients.css?v=8` becomes `styles/clients.css?v=9` (line 17), and `pages/clients-a.jsx?v=16` becomes `pages/clients-a.jsx?v=17` (line 93). No later task bumps them again.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/person-honest.test.mjs`
Expected: `# fail 0` (19 and 24 tests).

- [ ] **Step 6: Mutation-check the booking-link test**

In the `cellCtx` you just added, change `bookingLink: people.bookingLink || null,` to `bookingLink: null,` and run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs`
Expected: `# fail 1`, "a row with a thread offers the booking link on file…". Put the line back and run it again: `# fail 0`.

- [ ] **Step 7: Change the three calendar-people pins this task makes untrue**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/calendar-people.test.mjs`
Expected: `# fail 2`, the list-page test (it stops at line 601) and the table test (it stops at line 704).

The line numbers below are main's. Once line 601 is gone the later ones move up by one, so match on the text, not the number. In `tooling/scripts/tests/calendar-people.test.mjs`, delete line 601, whose columns are now tested by "the table's columns…" in people-honest:

```js
  assert.ok(page.includes('withCalendar ? { key: "visits", label: "Visits", sortable: true } : { key: "receptionist", label: "Receptionist", sortable: false }'));
```

Replace line 704:

```js
  assert.ok(page.includes('withCalendar ? { key: "visits", label: "Visits", sortable: true } : { key: "receptionist", label: "Receptionist", sortable: false }') && page.includes('{ key: "offers", label: "Offers", sortable: true }') && !page.includes('label: "First contact"'), "the columns");
```

with the part that is still true:

```js
  assert.ok(!page.includes('label: "First contact"'), "First contact lives in the identity cell, never a column of its own");
```

and delete line 713, whose behaviour is now "a row with a thread offers the booking link on file…":

```js
  assert.ok(page.includes('bookingLink={people.bookingLink || null}'));
```

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/calendar-people.test.mjs tooling/scripts/tests/attention-strip.test.mjs tooling/scripts/tests/consent-door.test.mjs tooling/scripts/tests/marketing-consent.test.mjs tooling/scripts/tests/saved-lists.test.mjs tooling/scripts/tests/today-queue.test.mjs tooling/scripts/tests/exports.test.mjs tooling/scripts/tests/layout-measure.test.mjs tooling/scripts/tests/source-scan-ratchet.test.mjs`
Expected: `# fail 0`. The ratchet holds: no `readCode(` call was removed.

- [ ] **Step 8: The e2e header list gains the new column**

In `e2e/people.spec.ts`, replace:

```ts
    // With a calendar connected the outcome takes the receptionist's column; the checkbox and the actions columns have no words. First contact lives in the identity cell.
    // The first column is Person: a page called People (B19); "Customer" was the mockup's word.
    expect(headers).toEqual(["person", "state", "last contact", cal?.state === "ok" ? "visits" : "receptionist", "offers"]);
```

with:

```ts
    // With a calendar connected the outcome takes the receptionist's column; the checkbox and the actions columns have no words. First contact lives in the identity cell.
    // The first column is Person: a page called People (B19); "Customer" was the mockup's word. Came from ends the default columns.
    expect(headers).toEqual(["person", "state", "last contact", cal?.state === "ok" ? "visits" : "receptionist", "offers", "came from"]);
```

Run: `corepack pnpm exec playwright test e2e/people.spec.ts --list`
Expected: the spec's tests are listed, with no compile error. They run nightly against production, after this deploys.

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/src/legacy/pages/clients-a.jsx apps/dashboard/src/legacy/styles/clients.css apps/dashboard/src/legacy/Chanlytics.html tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/calendar-people.test.mjs e2e/people.spec.ts
git commit -m "People's table is drawn from its columns, with where each person came from" -m "PL_COLUMNS defines each column once; PeopleTable takes rows, columns, a selection, a cursor and an open, the shape Leads will reuse. Came from is on by default; Email and Lists wait for the Columns menu; the receptionist's word sits beside the state while its column is hidden. The pins on the old column list and the booking-link prop are behaviour tests now." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: One keyboard listener for the page's life

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx`. Five edits: helpers above `ClientsAReal` (line 1408); the `useHotkey` block (1510-1514); the keyboard block (1596-1625); `keys.current` above the `return (` (1627); the table's foot (in `PeopleTable`).
- Test: `tooling/scripts/tests/people-honest.test.mjs` (new tests at the end)
- Modify: `tooling/scripts/tests/calendar-people.test.mjs` (line 710)

- [ ] **Step 1: Write the failing tests**

Add at the end of `tooling/scripts/tests/people-honest.test.mjs`:

```js
test("REGRESSION: the keyboard is one listener for the page's life, and it walks the rows shown now -- it was taken down and added again on every draw", async () => {
  const needs = (i) => person(i, { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(H), latest_state: "needs_human" });
  await freshPage({ people: [needs(1), person(2), needs(3)] });
  draw();
  assert.equal(listeners.keydown?.size, 1, "one listener");
  const [only] = listeners.keydown;
  draw();
  byTestId(draw(), "people-standing-needs").props.onClick();
  draw();
  assert.equal(listeners.keydown.size, 1);
  assert.ok(listeners.keydown.has(only), "REGRESSION: a draw put a new listener in its place");
  press("j");
  press("j");
  const focused = find(draw(), (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""));
  assert.equal(focused?.props.id, "person-p3", "two steps down the people who need you: Person 2 is not among them");
});

test("the keyboard: J/K and the arrows move, x and Space select, Enter opens, / searches, Esc clears the selection", async () => {
  await freshPage({ people: [person(1), person(2), person(3)] });
  const cursorOn = () => find(draw(), (n) => n.type === "tr" && /\bfocused\b/.test(n.props?.className || ""))?.props.id ?? null;
  draw();
  assert.equal(press("j"), true, "J is the page's");
  assert.equal(cursorOn(), "person-p1");
  press("ArrowDown");
  assert.equal(cursorOn(), "person-p2");
  press("k");
  assert.equal(cursorOn(), "person-p1");
  press("ArrowUp");
  assert.equal(cursorOn(), "person-p1", "the first row holds");
  press("J");
  press("j");
  press("ArrowDown");
  assert.equal(cursorOn(), "person-p3", "and so does the last");
  assert.equal(press("x"), true);
  let tree = draw();
  assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/, "x selects the row under the cursor");
  assert.equal(rowOf(tree, "p3").props["aria-selected"], true, "and the row says it is selected");
  press("k");
  draw();
  press(" ");
  assert.match(textOf(byTestId(draw(), "bulk-bar")), /2 selected/, "Space selects too");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "bulk-bar"), null, "Esc clears the selection");
  assert.equal(press("Enter", { tagName: "TR", isContentEditable: false, closest: () => null }), true);
  assert.deepEqual(opened, ["p2"], "Enter opens the person under the cursor");
  const box = find(draw(), (n) => n.type === "input" && /Search/.test(n.props?.placeholder || ""));
  let focusedSearch = 0;
  box.props.ref.current = { focus: () => { focusedSearch += 1; } };
  assert.equal(press("/"), true);
  assert.equal(focusedSearch, 1, "/ puts you in the search box");
  assert.equal(press("j", { tagName: "INPUT", type: "text", isContentEditable: false, closest: () => null }), false, "and a J typed there is a letter");
  assert.equal(press("j", { tagName: "INPUT", type: "checkbox", isContentEditable: false, closest: () => ({}) }), true, "a row's checkbox is not a place to type: after a click on one, J still walks");
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs`
Expected: `# tests 21`, `# fail 2`. The first fails with "REGRESSION: a draw put a new listener in its place". The second fails with "J is the page's" (`false !== true`), because only the arrows move today.

- [ ] **Step 3: Write the implementation**

In `apps/dashboard/src/legacy/pages/clients-a.jsx`, replace:

```jsx
const ClientsAReal = ({ onOpenProfile = () => {}, initialSegment = null, initialSaved = null, initialState = null }) => {
```

with:

```jsx
// Typing: a field that takes words. A row's checkbox is not one, so after a click on it J, K, x and Esc still work.
const plTyping = (el) => !!el && ((el.tagName === "INPUT" && !/^(checkbox|radio)$/i.test(el.type || "")) || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || !!el.isContentEditable);
// What Enter and Space press when it has focus, instead of the row under the cursor.
const PL_CONTROL = 'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="option"]';

const ClientsAReal = ({ onOpenProfile = () => {}, initialSegment = null, initialSaved = null, initialState = null }) => {
```

Replace the second hotkey, which `/` now joins in the one listener:

```jsx
  const scrollRef = React.useRef(null);
  useHotkey(
    (e, typing) => !typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/",
    () => searchRef.current && searchRef.current.focus()
  );
```

with:

```jsx
  const scrollRef = React.useRef(null);
```

Replace the keyboard block (lines 1596-1625):

```jsx
  const shownIds = shown.map((p) => p.id);
  // A keyboard walks the rows like the Inbox walks threads: ↑ ↓ move, Enter
  // opens, Space selects. Never while typing, never with a modifier.
  const [cursor, setCursor] = useState(null);
  React.useEffect(() => { setCursor((c) => (c && shownIds.includes(c) ? c : null)); }, [shownIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey || !shownIds.length) return;
      // Enter and Space on a focused button, link, tab or menu item are that control's: they opened
      // the profile under the cursor, or selected its row, instead of pressing what had focus.
      if ((e.key === "Enter" || e.key === " ") && el && el.closest && el.closest('button, a[href], [role="button"], [role="menuitem"], [role="tab"], [role="option"]')) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => {
          const i = c ? shownIds.indexOf(c) : -1;
          const next = e.key === "ArrowDown" ? Math.min(shownIds.length - 1, i + 1) : Math.max(0, i - 1);
          const id = shownIds[next];
          const row = document.getElementById(`person-${id}`);
          if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
          return id;
        });
      } else if (e.key === "Enter" && cursor) { e.preventDefault(); onOpenProfile(cursor); }
      else if (e.key === " " && cursor && (canEditLists || canExport)) { e.preventDefault(); toggleSel(cursor); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const toggleAll = () => setSel((s) => (shownIds.length && shownIds.every((id) => s.has(id)) ? new Set() : new Set(shownIds)));
```

with:

```jsx
  const shownIds = shown.map((p) => p.id);
  // A keyboard walks the rows the way the Inbox walks threads: J/K or ↓/↑ move the cursor, x or Space selects the row
  // under it, Enter opens it, / goes to the search, Esc closes the Columns menu and then clears the selection. Never
  // while typing, never with a modifier. The cursor's row shows its actions, as a hovered row does (clients.css).
  const [cursor, setCursor] = useState(null);
  React.useEffect(() => { setCursor((c) => (c && shownIds.includes(c) ? c : null)); }, [shownIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveCursor = (step) => setCursor((c) => {
    const i = c ? shownIds.indexOf(c) : -1;
    const id = shownIds[step > 0 ? Math.min(shownIds.length - 1, i + 1) : Math.max(0, i - 1)];
    const row = document.getElementById(`person-${id}`);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    return id;
  });
  // One listener for the page's life, reading what the latest render left in `keys`: the Calendar's pattern. It was
  // taken down and added again on every render, and / had a second listener of its own.
  const keys = React.useRef(null);
  React.useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      const el = document.activeElement;
      if (!k || plTyping(el) || e.metaKey || e.ctrlKey || e.altKey) return;
      // The Columns menu is the page's: Esc closes it, and the rows hold still behind it. The phone's lists sheet
      // listens for its own Esc.
      if (k.menuOpen) { if (e.key === "Escape") { e.preventDefault(); k.closeMenu(); } return; }
      if (k.sheetOpen) return;
      if (e.key === "/") { e.preventDefault(); k.focusSearch(); return; }
      // Esc inside the bulk bar or one of its menus is theirs: the menu closes and the selection stays.
      if (e.key === "Escape") {
        if (k.selected && !(el && el.closest && el.closest('.cl-bulk, [role="menu"]'))) { e.preventDefault(); k.clearSel(); }
        return;
      }
      if (!k.ids.length) return;
      // Enter and Space on a focused button, link, box, tab or menu item are that control's: they opened the profile
      // under the cursor, or selected its row, instead of pressing what had focus.
      if ((e.key === "Enter" || e.key === " ") && el && el.closest && el.closest(PL_CONTROL)) return;
      const down = e.key === "ArrowDown" || e.key === "j" || e.key === "J";
      const up = e.key === "ArrowUp" || e.key === "k" || e.key === "K";
      if (down || up) { e.preventDefault(); k.move(down ? 1 : -1); }
      else if (e.key === "Enter" && k.cursor) { e.preventDefault(); k.open(k.cursor); }
      else if ((e.key === " " || e.key === "x" || e.key === "X") && k.cursor && k.canSelect) { e.preventDefault(); k.toggle(k.cursor); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const toggleAll = () => setSel((s) => (shownIds.length && shownIds.every((id) => s.has(id)) ? new Set() : new Set(shownIds)));
```

Replace:

```jsx
  return (
    <div className="clients">
      <PeopleRail
```

with:

```jsx
  // What the keyboard's one listener reads: this render's rows, cursor and doors.
  keys.current = {
    ids: shownIds,
    cursor,
    move: moveCursor,
    open: onOpenProfile,
    toggle: toggleSel,
    canSelect: canEditLists || canExport,
    selected: sel.size > 0,
    clearSel: () => setSel(new Set()),
    focusSearch: () => { if (searchRef.current) searchRef.current.focus(); },
    sheetOpen: listsOpen,
  };

  return (
    <div className="clients">
      <PeopleRail
```

and in `PeopleTable`, replace the foot's keys:

```jsx
        <span className="cl-table-keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> opens · <kbd>space</kbd> selects · <kbd>/</kbd> searches</span>
```

with:

```jsx
        <span className="cl-table-keys"><kbd>J</kbd><kbd>K</kbd> move · {selectable && <><kbd>x</kbd> selects · <kbd>esc</kbd> clears · </>}<kbd>↵</kbd> opens · <kbd>/</kbd> searches</span>
```

`keys.current` has no `menuOpen` until Task 5, so the listener's menu branch is inert until then.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/person-honest.test.mjs`
Expected: `# fail 0` (21 and 24). The existing B14 test ("Enter or Space on a focused button presses that button") still passes, which proves the control guard.

- [ ] **Step 5: Remove the keyboard pin**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/calendar-people.test.mjs`
Expected: `# fail 1`, the table test, at its keyboard pin.

Delete that pin from `tooling/scripts/tests/calendar-people.test.mjs`: line 710 on main, 709 after Task 3's edits. The keyboard is now tested by the two people-honest tests above:

```js
  assert.ok(page.includes('if (e.key === "ArrowDown" || e.key === "ArrowUp")') && page.includes('else if (e.key === "Enter" && cursor)') && page.includes('e.key === " " && cursor'), "arrows, Enter, Space");
```

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/calendar-people.test.mjs tooling/scripts/tests/source-scan-ratchet.test.mjs`
Expected: `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/legacy/pages/clients-a.jsx tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/calendar-people.test.mjs
git commit -m "People's keyboard is one listener for the page's life" -m "Registered once, reading a keys ref (the Calendar's pattern): J/K or the arrows move the cursor, x or Space select, Enter opens, / searches, Esc clears the selection. It was taken down and added again on every render, and / had a listener of its own. A row's checkbox is not typing." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Columns a member shows and hides, saved with the sort

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx`. Five edits: the sort state and view save (lines 1457-1470); the columns block from Task 3; the controls row (the sort button, line 1668); `keys.current`; helpers and `PeopleColumnsMenu` above `const PL_NO_SEL`.
- Modify: `apps/dashboard/src/legacy/styles/clients.css` (after the Task 3 lists rule)
- Modify (comments): `apps/dashboard/src/legacy-bridge/people-detail.ts` (lines 181-182), `apps/dashboard/app/api/v1/views/route.ts` (line 6), `apps/dashboard/app/api/v1/views/[page]/route.ts` (lines 12-13)
- Test: `tooling/scripts/tests/people-honest.test.mjs` (new tests at the end)
- Modify: `e2e/people.spec.ts` (a new test at the end of the describe block)

- [ ] **Step 1: Write the failing tests**

Add at the end of `tooling/scripts/tests/people-honest.test.mjs`:

```js
/** The Columns menu's rows: which column, whether it shows, and whether it is Person's, which always does. */
const menuItems = (tree) => all(byTestId(tree, "people-columns-menu"), (n) => n.props?.role === "menuitemcheckbox")
  .map((n) => ({ key: n.props["data-testid"].replace(/^column-/, ""), on: n.props["aria-checked"], locked: n.props["aria-disabled"] === true }));

test("the Columns menu shows and hides columns and stays open while it does; Person always shows; Esc closes it", async () => {
  await freshPage({ people: [person(1, { came_from: "whatsapp" }), person(2)], lists: [{ id: "s1", name: "Regulars", ids: ["p1"] }] });
  let tree = draw();
  assert.equal(byTestId(tree, "people-columns-menu"), null, "closed until asked");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  assert.deepEqual(menuItems(tree), [
    { key: "name", on: true, locked: true },
    { key: "state", on: true, locked: false },
    { key: "last", on: true, locked: false },
    { key: "receptionist", on: true, locked: false },
    { key: "offers", on: true, locked: false },
    { key: "came_from", on: true, locked: false },
    { key: "email", on: false, locked: false },
    { key: "lists", on: false, locked: false },
  ], "every column this workspace can show; Visits waits for a calendar");
  click(byTestId(tree, "column-came_from"));
  tree = draw();
  assert.ok(byTestId(tree, "people-columns-menu"), "it stays open: MoreMenu closes on every pick");
  assert.ok(!headings(tree).includes("Came from"), "hidden");
  click(byTestId(tree, "column-lists"));
  tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Last contact", "Receptionist", "Offers", "Lists"]);
  assert.equal(textOf(byTestId(rowOf(tree, "p1"), "row-lists")).trim(), "Regulars", "the lists kept by hand that they are on");
  click(byTestId(tree, "column-name"));
  assert.ok(headings(draw()).includes("Person"), "Person cannot be hidden");
  assert.equal(press("Escape"), true);
  assert.equal(byTestId(draw(), "people-columns-menu"), null, "Esc closes it");
});

test("a view keeps its columns with its sort, and every save sends every key -- member_view_set replaces the page's whole object", async () => {
  await freshPage({ people: [person(1)], views: { people: { sortBy: "name", sortDir: "asc", columns: { came_from: false, email: true } } } });
  const saves = [];
  globalThis.window.__saveView = async (page, view) => { saves.push([page, view]); return { ok: true, data: { views: { [page]: view } } }; };
  let tree = draw();
  assert.deepEqual(headings(tree), ["Person", "State", "Last contact", "Receptionist", "Offers", "Email"], "the member's own columns");
  assert.deepEqual(saves, [], "the view it already holds is not saved again");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  click(byTestId(tree, "column-lists"));
  tree = draw();
  assert.deepEqual(saves.at(-1), ["people", { sortBy: "name", sortDir: "asc", columns: { came_from: false, email: true, lists: true } }], "a column change keeps the sort");
  click(find(tree, (n) => n.type === "th" && textOf(n).startsWith("State")));
  draw();
  assert.deepEqual(saves.at(-1), ["people", { sortBy: "state", sortDir: "desc", columns: { came_from: false, email: true, lists: true } }], "and a new sort keeps the columns");
});

test("with a calendar the receptionist's word sits beside the state until its own column is shown -- then it is said there, once", async () => {
  await freshPage({ people: [person(1, { queued_reply_at: iso(H) })], calendar: "ok" });
  const stateCell = (t) => find(t, (n) => n.type === "td" && /\bcl-state-cell\b/.test(n.props?.className || ""));
  let tree = draw();
  assert.match(textOf(stateCell(tree)), /reply queued/, "beside the state");
  click(byTestId(tree, "people-columns"));
  tree = draw();
  click(byTestId(tree, "column-receptionist"));
  tree = draw();
  assert.ok(headings(tree).includes("Receptionist"), "in a column of its own");
  assert.doesNotMatch(textOf(stateCell(tree)), /reply queued/, "and not beside the state as well");
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs`
Expected: `# tests 24`, `# fail 3`. The menu tests fail with `Cannot read properties of null (reading 'props')` (there is no `people-columns` button). The view test fails with "the member's own columns".

- [ ] **Step 3: Write the implementation**

In `apps/dashboard/src/legacy/pages/clients-a.jsx`, replace the sort state and the view save (lines 1457-1470):

```jsx
  const [sortBy, setSortBy] = useState(PL_SORT_KEYS.includes(remembered.sortBy) ? remembered.sortBy : "last");
  const [sortDir, setSortDir] = useState(remembered.sortDir === "asc" ? "asc" : "desc");
  // The strip's tab was remembered too; a view saved before it went carries an
  // attentionTab this ignores, and the next save drops it.
  const savedView = React.useRef(JSON.stringify({ sortBy: remembered.sortBy, sortDir: remembered.sortDir }));
  React.useEffect(() => {
    const view = { sortBy, sortDir };
    plSaveView(view);
    // The workspace's copy, once per change and never for the view it already holds.
    const key = JSON.stringify(view);
    if (key === savedView.current || !window.__saveView) return;
    savedView.current = key;
    window.__saveView("people", view).then((r) => { if (!r.ok) console.error("people_view_not_saved", r.message); });
  }, [sortBy, sortDir]);
```

with:

```jsx
  const [sortBy, setSortBy] = useState(PL_SORT_KEYS.includes(remembered.sortBy) ? remembered.sortBy : "last");
  const [sortDir, setSortDir] = useState(remembered.sortDir === "asc" ? "asc" : "desc");
  // The columns this member chose to show or hide with the Columns menu; a column they never touched keeps its
  // default (PL_COLUMNS). The menu's open state is the page's, so its one keyboard listener closes it on Esc.
  const [colChoices, setColChoices] = useState(() => plColumnChoices(remembered.columns));
  const [colsOpen, setColsOpen] = useState(false);
  // A view is the sort and the columns. The strip's tab was remembered too; a view saved before it went carries an
  // attentionTab this ignores, and the next save drops it. Every save sends every key the page owns, because
  // member_view_set replaces the page's whole object (00113): a save of the sort alone would lose the columns.
  const colKey = JSON.stringify(colChoices);
  const savedView = React.useRef(JSON.stringify({ sortBy: remembered.sortBy, sortDir: remembered.sortDir, columns: plColumnChoices(remembered.columns) }));
  React.useEffect(() => {
    const view = { sortBy, sortDir, columns: colChoices };
    plSaveView(view);
    // The workspace's copy, once per change and never for the view it already holds.
    const key = JSON.stringify(view);
    if (key === savedView.current || !window.__saveView) return;
    savedView.current = key;
    window.__saveView("people", view).then((r) => { if (!r.ok) console.error("people_view_not_saved", r.message); });
  }, [sortBy, sortDir, colKey]); // eslint-disable-line react-hooks/exhaustive-deps
```

Replace the start of Task 3's columns block:

```jsx
  const colCtx = { withCalendar };
  const columns = plVisibleColumns({}, colCtx);
```

with:

```jsx
  const colCtx = { withCalendar };
  const columns = plVisibleColumns(colChoices, colCtx);
  const colOptions = plColumnOptions(colChoices, colCtx);
  // Show or hide one column; Person and the row's actions are not the member's to hide.
  const pickColumn = (key) => setColChoices((ch) => {
    const c = PL_COLUMNS.find((x) => x.key === key);
    return c && !c.pinned && !c.fixed ? { ...ch, [key]: !plShows(c, ch, colCtx) } : ch;
  });
```

Put the menu before the sort button:

```jsx
              <button className="btn btn-ghost btn-sm" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
```

becomes:

```jsx
              <PeopleColumnsMenu open={colsOpen} onOpenChange={setColsOpen} options={colOptions} onPick={pickColumn} />
              <button className="btn btn-ghost btn-sm" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
```

Let the one listener see the menu:

```jsx
    sheetOpen: listsOpen,
  };
```

becomes:

```jsx
    sheetOpen: listsOpen,
    menuOpen: colsOpen,
    closeMenu: () => setColsOpen(false),
  };
```

and above the selection's empty set, replace:

```jsx
const PL_NO_SEL = new Set();
```

with:

```jsx
// A saved `columns` value, read with care: only the columns a member may hide, and only true or false. A view is the
// member's own JSON, and an older page or another device may have written anything into it.
const plColumnChoices = (raw) => {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const c of PL_COLUMNS) if (!c.pinned && !c.fixed && typeof raw[c.key] === "boolean") out[c.key] = raw[c.key];
  return out;
};
// The Columns menu's rows: every column this workspace can show, whether it shows, and Person, which always does.
const plColumnOptions = (choices, x) => PL_COLUMNS
  .filter((c) => !c.fixed && (!c.needs || c.needs(x)))
  .map((c) => ({ key: c.key, label: c.label, on: plShows(c, choices, x), locked: !!c.pinned }));

// Which columns show, as a menu that stays open while they are switched: MoreMenu closes on every item, which is right
// for an action and wrong for a set of switches. Hookless, with its open state the page's, whose one keyboard listener
// closes it on Esc. A phone draws cards, not columns, so it is hidden there (clients.css).
const PeopleColumnsMenu = ({ open, onOpenChange, options, onPick }) => (
  <div className="more-wrap pl-cols">
    <button type="button" className="btn btn-ghost btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onOpenChange(!open); }} data-testid="people-columns">
      <Icon name="eye" size={12} /> Columns
    </button>
    {open && (
      <>
        <div className="more-backdrop" onClick={(e) => { e.stopPropagation(); onOpenChange(false); }} />
        <div className="more-menu align-right" role="menu" aria-label="Columns" data-testid="people-columns-menu" onClick={(e) => e.stopPropagation()}>
          <div className="more-header">Show on the table</div>
          {options.map((c) => (
            <button key={c.key} type="button" className="more-item" role="menuitemcheckbox" aria-checked={c.on} aria-disabled={c.locked ? true : undefined} onClick={() => { if (!c.locked) onPick(c.key); }} data-testid={`column-${c.key}`}>
              <Icon name="check" size={13} />
              <span className="more-item-label">{c.label}</span>
              {c.locked && <span className="more-item-meta">Always</span>}
            </button>
          ))}
        </div>
      </>
    )}
  </div>
);

const PL_NO_SEL = new Set();
```

In `apps/dashboard/src/legacy/styles/clients.css`, replace:

```css
.cl-table td.cl-lists-cell { max-width: 24ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

with:

```css
.cl-table td.cl-lists-cell { max-width: 24ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* The Columns menu: a check beside what shows; Person, which always shows, says so and does not press. */
.pl-cols .more-item[aria-checked="false"] .icon { visibility: hidden; }
.pl-cols .more-item[aria-disabled="true"] { cursor: default; color: var(--ink-dim); }
.pl-cols .more-item[aria-disabled="true"]:hover { background: transparent; }
/* A phone draws cards, not columns. */
@media (max-width: 900px) { .pl-cols { display: none; } }
```

Make the three comments say what a view holds. In `apps/dashboard/src/legacy-bridge/people-detail.ts`, replace:

```ts
 * A page remembering its view in this workspace: `window.__saveView("people",
 * { sortBy, sortDir, attentionTab })`. The member's own row, per workspace,
```

with:

```ts
 * A page remembering its view in this workspace: `window.__saveView("people",
 * { sortBy, sortDir, columns })`. Each save replaces the page's whole view
 * (member_view_set, 00113), so a page sends every key it owns. The member's own row, per workspace,
```

In `apps/dashboard/app/api/v1/views/route.ts`, replace ` * { views: { people: { sortBy, sortDir, attentionTab }, ... } }, from the` with ` * { views: { people: { sortBy, sortDir, columns }, ... } }, from the`.

In `apps/dashboard/app/api/v1/views/[page]/route.ts`, replace:

```ts
 * A page remembering how this member left it, in this workspace: the People
 * page's sort and attention tab today. Any member, one small object, through
```

with:

```ts
 * A page remembering how this member left it, in this workspace: the People
 * page's sort and columns today, sent whole, since a save replaces the page's
 * view. Any member, one small object, through
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/person-honest.test.mjs tooling/scripts/tests/calendar-people.test.mjs`
Expected: `# fail 0`. The list-page test's view pin (line 607 on main) still finds `plSaveView(view);` and `window.__saveView("people", view)`.

- [ ] **Step 5: An e2e for the menu, with the save intercepted**

In `e2e/people.spec.ts`, replace the end of the file:

```ts
      if (await words.count()) expect((await words.innerText()).trim()).not.toMatch(/nothing written to quote/);
    }
  });
});
```

with (the two new tests; the second belongs to Task 7, but the one describe block closes after it, so it goes in now):

```ts
      if (await words.count()) expect((await words.innerText()).trim()).not.toMatch(/nothing written to quote/);
    }
  });

  test("the Columns menu shows and hides a column and stays open; the view it saves keeps the sort -- the save is intercepted", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Registered before the page loads, so no save from this test reaches the member's real view.
    const saved: Array<{ view?: { sortBy?: unknown; sortDir?: unknown; columns?: Record<string, boolean> } }> = [];
    await page.route(/\/api\/v1\/views\/people(?:[?#]|$)/, async (route) => {
      const req = route.request();
      if (req.method() !== "PUT") { await route.continue(); return; }
      saved.push(req.postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { views: {} } }) });
    });
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const headers = async () => (await page.locator(".cl-table thead th").allInnerTexts()).map((h) => h.replace(/[▲▼]/g, "").trim().toLowerCase()).filter(Boolean);
    expect(await headers()).toContain("came from");
    await page.getByTestId("people-columns").click();
    const menu = page.getByTestId("people-columns-menu");
    await expect(menu).toBeVisible();
    await expect(page.getByTestId("column-name")).toHaveAttribute("aria-disabled", "true");
    await page.getByTestId("column-came_from").click();
    await expect(menu).toBeVisible();
    await expect.poll(headers).not.toContain("came from");
    await expect.poll(() => saved.some((s) => s.view?.columns?.came_from === false)).toBe(true);
    const last = saved[saved.length - 1];
    expect(typeof last.view?.sortBy, "the sort rides with the columns").toBe("string");
    expect(["asc", "desc"]).toContain(last.view?.sortDir);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("on a desktop the table scrolls sideways under a pinned Person column, with a hairline once it has", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const rows = page.locator(".cl-table tbody tr:not(:has(.empty))");
    test.skip((await rows.count()) === 0, "this workspace has nobody to show");
    const scroller = page.getByTestId("people-table-scroll");
    // Beside the sidebar and the rail the columns are wider than their box; the box used to cut them off.
    expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1), "the table scrolls sideways at 960px").toBe(true);
    await expect(scroller).not.toHaveClass(/\bscrolled\b/);
    const name = rows.first().locator("td.cl-name-cell");
    const heading = page.locator(".cl-table thead th.pl-pin");
    const before = { name: (await name.boundingBox())!, heading: (await heading.boundingBox())! };
    await scroller.evaluate((el) => { el.scrollLeft = 240; });
    await expect(scroller).toHaveClass(/\bscrolled\b/);
    const after = { name: (await name.boundingBox())!, heading: (await heading.boundingBox())! };
    expect(Math.round(after.name.x), "Person stays where it was").toBe(Math.round(before.name.x));
    expect(Math.round(after.heading.x), "and so does its heading").toBe(Math.round(before.heading.x));
  });
});
```

Run: `corepack pnpm exec playwright test e2e/people.spec.ts --list`
Expected: both new tests listed, no compile error. The menu test registers its `page.route` before `goto`, so no save from it reaches the member's real view.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/legacy/pages/clients-a.jsx apps/dashboard/src/legacy/styles/clients.css apps/dashboard/src/legacy-bridge/people-detail.ts "apps/dashboard/app/api/v1/views/route.ts" "apps/dashboard/app/api/v1/views/[page]/route.ts" tooling/scripts/tests/people-honest.test.mjs e2e/people.spec.ts
git commit -m "People's columns are the member's to show and hide, saved with the sort" -m "A Columns menu that stays open while columns are switched (MoreMenu closes on every item); Person always shows. The view is { sortBy, sortDir, columns } and every save sends all of it, because member_view_set replaces the page's whole object." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: The bulk bar acts on the people shown

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx`. Three edits: `PeopleBulkBar`'s selection (lines 1169-1170); its count (line 1271); where the page draws it (line 1745).
- Test: `tooling/scripts/tests/people-honest.test.mjs` (a new test at the end)

- [ ] **Step 1: Write the failing test**

Add at the end of `tooling/scripts/tests/people-honest.test.mjs`:

```js
test("REGRESSION: the bulk bar acts on the people shown -- a person a refresh moved out of the view stayed counted, and was written to", async () => {
  const needs = (i) => person(i, { needs_human: true, open_escalation_reason: "human_token", open_escalation_since: iso(H), latest_state: "needs_human" });
  const kept = [{ id: "s1", name: "Regulars", ids: [] }];
  await freshPage({ people: [needs(1), needs(2), person(3)], lists: kept });
  const calls = [];
  globalThis.window.__lists = lists({ add: async (id, ids) => { calls.push(ids); return { ok: true, data: {} }; } });
  let tree = draw({ initialState: "needs_you" });
  byTestId(tree, "select-all").props.onChange();
  tree = draw({ initialState: "needs_you" });
  assert.match(textOf(byTestId(tree, "bulk-bar")), /2 selected/);
  // A refresh: Person 2's escalation was resolved on another device, so they leave Needs you.
  wire({ people: [needs(1), person(2), person(3)], lists: kept });
  await quietly(() => peopleOverride.apply());
  tree = draw({ initialState: "needs_you" });
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "row-select").map((n) => n.props["aria-label"]), ["Select Person 1"], "the view shows one");
  assert.match(textOf(byTestId(tree, "bulk-bar")), /1 selected/, "REGRESSION: the bar counted a person who is not on screen");
  await find(tree, (n) => n.props?.label === "Add to list").props.items.find((i) => i.label === "Regulars").onClick();
  await settle();
  assert.deepEqual(calls, [["p1"]], "REGRESSION: the add wrote to a person the view no longer shows");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs`
Expected: `# tests 25`, `# fail 1`, "REGRESSION: the bar counted a person who is not on screen". The same test fails the same way on the code from before this plan: this bug is live today.

- [ ] **Step 3: Write the implementation**

In `apps/dashboard/src/legacy/pages/clients-a.jsx`, inside `PeopleBulkBar`, replace:

```jsx
  const ids = [...sel];
  const picked = rows.filter((p) => sel.has(p.id));
```

with:

```jsx
  // What is shown and selected, in the order shown. A person the view no longer shows -- a refresh moved them out of
  // Needs you, say -- is not counted, exported or written to: the bar acted on every loaded row the selection named.
  const picked = rows.filter((p) => sel.has(p.id));
  const ids = picked.map((p) => p.id);
```

and:

```jsx
      <span className="cl-bulk-count"><b>{sel.size}</b> selected</span>
```

with:

```jsx
      <span className="cl-bulk-count"><b>{ids.length}</b> selected</span>
```

and where `ClientsAReal` draws the bar, replace:

```jsx
        {sel.size > 0 && <PeopleBulkBar sel={sel} rows={rows} saved={saved} savedRead={people.savedRead !== false} canEdit={canEditLists} canExport={canExport} onClear={() => setSel(new Set())} onKeep={(rest) => setSel(new Set(rest))} flash={plFlash} activeSaved={activeSaved || null} />}
```

with:

```jsx
        {/* The bar counts, and acts on, the people shown and selected. */}
        {shown.some((p) => sel.has(p.id)) && <PeopleBulkBar sel={sel} rows={shown} saved={saved} savedRead={people.savedRead !== false} canEdit={canEditLists} canExport={canExport} onClear={() => setSel(new Set())} onKeep={(rest) => setSel(new Set(rest))} flash={plFlash} activeSaved={activeSaved || null} />}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/person-honest.test.mjs tooling/scripts/tests/calendar-people.test.mjs`
Expected: `# fail 0`. The B4 test (sixty selected, a yes for fifty, "10 more still selected") still passes, which proves the batching reads the shown selection.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy/pages/clients-a.jsx tooling/scripts/tests/people-honest.test.mjs
git commit -m "People's bulk bar acts on the people shown" -m "It counted, exported and wrote to every loaded row the selection named, so a person a refresh moved out of the view stayed selected and was written to. It takes the shown rows now, in their order." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: The table scrolls in its own box, under a pinned Person column

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx`. Three edits: the `scrolledX` state (after Task 5's `colsOpen`); the `pl-main` class on the page's scroller (line 1644); the table's call.
- Modify: `apps/dashboard/src/legacy/styles/clients.css`. Two edits: the `.selected` rule (line 1683); a desktop block before the "Where your attention matters" comment (line 1732).
- Test: `tooling/scripts/tests/people-honest.test.mjs` (a new test at the end)
- e2e: the pinned-column test went in with Task 5 (Step 5).

- [ ] **Step 1: Write the failing test**

Add at the end of `tooling/scripts/tests/people-honest.test.mjs`:

```js
test("on a desktop the table scrolls in its own box, Person pinned, and the hairline beside it shows once it has scrolled sideways", async () => {
  await freshPage({ people: [person(1)] });
  let tree = draw();
  assert.ok(find(tree, (n) => /\bcl-main-scroll\b/.test(n.props?.className || "") && /\bpl-main\b/.test(n.props.className)), "the page's column is the layout that gives the table its own box");
  const scroller = (t) => byTestId(t, "people-table-scroll");
  assert.doesNotMatch(scroller(tree).props.className, /\bscrolled\b/, "no hairline at rest");
  scroller(tree).props.onScroll({ currentTarget: { scrollLeft: 120 } });
  tree = draw();
  assert.match(scroller(tree).props.className, /\bscrolled\b/, "scrolled sideways: the hairline");
  scroller(tree).props.onScroll({ currentTarget: { scrollLeft: 0 } });
  tree = draw();
  assert.doesNotMatch(scroller(tree).props.className, /\bscrolled\b/, "back at the start: none");
  assert.match(find(tree, (n) => n.type === "th" && textOf(n).startsWith("Person")).props.className, /\bpl-pin\b/, "Person's heading is pinned");
  assert.match(find(rowOf(tree, "p1"), (n) => n.type === "td" && /\bcl-name-cell\b/.test(n.props?.className || "")).props.className, /\bpl-pin\b/, "and so are its cells");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs`
Expected: `# tests 26`, `# fail 1`, "the page's column is the layout that gives the table its own box".

- [ ] **Step 3: Write the implementation**

In `apps/dashboard/src/legacy/pages/clients-a.jsx`, replace:

```jsx
  const [colsOpen, setColsOpen] = useState(false);
```

with:

```jsx
  const [colsOpen, setColsOpen] = useState(false);
  // Whether the table has scrolled sideways, for the hairline beside Person: kept here so the table stays hookless.
  const [scrolledX, setScrolledX] = useState(false);
```

Replace:

```jsx
        <div className="cl-main-scroll" ref={scrollRef}>
          <PeopleStanding
```

with:

```jsx
        <div className="cl-main-scroll pl-main" ref={scrollRef}>
          <PeopleStanding
```

and in the table's call, replace:

```jsx
            onClearFilters={() => { setQ(""); setTab("all"); setListId(null); setSavedId(null); }}
```

with:

```jsx
            onClearFilters={() => { setQ(""); setTab("all"); setListId(null); setSavedId(null); }}
            scrolled={scrolledX}
            onScrolled={setScrolledX}
```

In `apps/dashboard/src/legacy/styles/clients.css`, replace:

```css
.cl-table tbody tr.selected { background: var(--bg-raised); box-shadow: inset 2px 0 0 var(--accent); }
```

with:

```css
/* A picked row: an ink tint that shows in light as in dark. It was --bg-raised on --bg -- white on warm paper, which
   nobody could see -- with the accent's edge, and the accent is kept for the receptionist's live state. */
.clients { --pl-selected: oklch(from var(--ink) l c h / 0.07); }
.cl-table tbody tr.selected { background: var(--pl-selected); }
```

and replace:

```css
/* ---- Where your attention matters, redrawn to the mockup ------------------
```

with:

```css
/* ---- On a desktop the People table is its own scroller -----------------------------------------------------
   The page above it holds still and the table scrolls in its box, both ways: the header sticks to its top, the
   checkbox and Person to its left, and a hairline shows beside Person once it has scrolled sideways (.scrolled, the
   page's state). The box used to clip what did not fit (overflow: clip, so that the header could stick to the page),
   so the columns past its right edge were cut off with no way to reach them. The cells draw the row's lines and its
   colour (--pl-row), because a pinned cell sits over the others and must paint its own. Phones and tablets keep the
   cards (max-width: 900px). */
@media (min-width: 901px) {
  .clients .pl-main { display: flex; flex-direction: column; }
  .clients .pl-main > * { flex: none; }
  .clients .pl-main > .pl-table-wrap { flex: 0 1 auto; min-height: 240px; display: flex; flex-direction: column; }
  .pl-table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
  .pl-table { border-collapse: separate; border-spacing: 0; --pl-row: var(--bg); }
  .pl-table tbody tr:hover { --pl-row: var(--bg-hover); }
  .pl-table tbody tr.selected { --pl-row: linear-gradient(var(--pl-selected), var(--pl-selected)), var(--bg); }
  .pl-table tbody tr.focused { --pl-row: var(--bg-hover); }
  .pl-table tbody td { border-bottom: 1px solid var(--line); }
  .pl-table tbody tr:last-child td { border-bottom: none; }
  .pl-table thead th { z-index: 2; }
  .pl-table .cl-sel, .pl-table .pl-pin { position: sticky; left: 0; z-index: 1; background: var(--pl-row); }
  .pl-table thead th.cl-sel, .pl-table thead th.pl-pin { z-index: 3; background: var(--bg-sunken); }
  /* The checkbox's column is exactly Person's offset: the table squeezed it to 26px and left Person 2px off it. */
  .pl-table .cl-sel { min-width: 28px; max-width: 28px; }
  .pl-table .cl-sel + .pl-pin { left: 28px; }
  .pl-table .pl-pin { border-right: 1px solid transparent; }
  .pl-table-scroll.scrolled .pl-pin { border-right-color: var(--line); }
  /* The cursor's edge, on the first cell: a pinned cell paints over the row's own. */
  .pl-table tbody tr.focused > td:first-child { box-shadow: inset 2px 0 0 var(--accent); }
}

/* ---- Where your attention matters, redrawn to the mockup ------------------
```

`clients.css` keeps `overflow: clip;` (`.cl-table-wrap`) and the phone card's `grid-template-areas`, which calendar-people's table test pins (line 715 on main). The phone block (`max-width: 720px`) is untouched. The `.pl-*` rules cannot reach the seeded page or Segments, which draw `.cl-table` without them.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-honest.test.mjs tooling/scripts/tests/person-honest.test.mjs tooling/scripts/tests/calendar-people.test.mjs tooling/scripts/tests/layout-measure.test.mjs`
Expected: `# fail 0` (26 people-honest tests).

- [ ] **Step 5: See it in a browser (recommended: the harness cannot run CSS)**

The People visual harness from 16 September lives in `C:\Users\Ruben\AppData\Local\Temp\claude\C--Users-Ruben-Documents-Claude-Projects-Claude-Video\96540362-a0b8-4e21-9d59-34e3515cf688\scratchpad\harness\`. Copy it into your own scratchpad. In `serve.mjs`, `build-people.sh` and `build-contracts.sh`, point `R=` at `cm-people-table` (for `serve.mjs`, at its `apps/dashboard/src`), and point `H=` at your copy. Then run `bash build-contracts.sh && bash build-people.sh after`. Add a `people-harness` entry for `node <your scratchpad>/harness/serve.mjs` on port 5178 to the session's `C:\Users\Ruben\Documents\Claude Projects\Claude Video\.claude\launch.json`, start it with `preview_start`, and open `/h/people.html?n=60`.

At 1000x760, with the browser tools:
- `.pl-table-scroll` scrolls both ways (`scrollWidth > clientWidth`, `scrollHeight > clientHeight`).
- After `scrollLeft = 220`, `td.cl-name-cell` and `th.pl-pin` keep their x, the State cells slide under them, and the scroller gets `scrolled`.
- After `scrollTop = 700`, the `thead th` keep their y.
- A selected row's background is `oklch(… / 0.07)`, in light and with `?theme=dark`.
- At 375 and 800 the rows are cards, `.pl-cols` is `display: none`, and `documentElement.scrollWidth - clientWidth` is 0.

Reset the viewport and remove the launch entry afterwards.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/legacy/pages/clients-a.jsx apps/dashboard/src/legacy/styles/clients.css tooling/scripts/tests/people-honest.test.mjs
git commit -m "People's table scrolls in its own box, under a pinned Person column" -m "On a desktop the page above holds still and the table scrolls both ways: the header sticks to its top, the checkbox and Person to its left, and a hairline shows beside Person once it has scrolled sideways. The box clipped what did not fit: at 1280px with a calendar, 176px of the table, Offers and the row actions among it, could not be reached. A picked row is an ink tint in light and dark; the accent stays for live state. Phones and tablets keep their cards." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The docs say what the table does now

**Files:**
- Modify: `docs/system-prd.md` (lines 164, 664, 852)
- Modify: `apps/dashboard/src/legacy/CLAUDE.md` (lines 60 and 63)

- [ ] **Step 1: `docs/system-prd.md`**

On line 164, replace `the member's views of a page — People's sort and filters — ride on the row, so a view is the workspace's, not the device's, 00113)` with `the member's views of a page — People's sort and columns — ride on the row, so a view is the workspace's, not the device's, 00113; a save replaces the page's whole view, so a page sends every key it owns)`.

Replace line 664, the People row of S-12, with:

```md
| People | `#/clients` | `people_list`, paged and searched on the server past the first thousand — one row per person: last contact, consent, standing, visits, what their last call was about, and where they came from (`came_from`, decided once in SQL, 00136); the six smart lists by group and the lists kept by hand, in the rail (a sheet on a phone); a picked list is the page's title with its rename, its delete and its one door. The table is drawn from column definitions: Person is pinned and always shown, and each member shows or hides the rest; on a desktop it scrolls in its own box, the header and Person held still | Add a person by hand; select and act on fifty at a time, on the people shown: add to a list or take off it, record which yes and how, set the receptionist, add a note, export; per person: name and notes, receptionist mode, both consent answers, delete; walk the rows from the keyboard (J/K or ↑/↓, x or Space selects, Enter opens, / searches, Esc clears); a view — the sort and the columns — remembered as the workspace's |
```

On line 852, replace `` `people_list` (People — a query, a limit and an offset, 00112) `` with `` `people_list` (People — a query, a limit and an offset, 00112; where each person came from, and an order that ends on the id, 00136) ``.

- [ ] **Step 2: `apps/dashboard/src/legacy/CLAUDE.md`**

On line 60, replace `says its count and its refusals in one toast. Suppress single-key shortcuts while typing.` with:

```md
says its count and its refusals in one toast. People's rows take J/K or ↑/↓ (the row cursor), x or Space (select), Enter (open), `/` (search) and Esc (the Columns menu, then the selection) from ONE listener registered for the page's life that reads a keys ref, as the Calendar's does (`clients-a.jsx`, `calendar-real.jsx`); a keydown listener added again on every render is what it replaced. Suppress single-key shortcuts while typing (a row's checkbox is not typing).
```

After line 63 (`- Unique hook aliases per file …`), add:

```md
- A page's saved view (`window.__saveView(page, view)`, `memberships.views`) is replaced whole on every save (`member_view_set`, 00113): send every key the page owns, each time. People's is `{ sortBy, sortDir, columns }`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/system-prd.md apps/dashboard/src/legacy/CLAUDE.md
git commit -m "The docs say what People's table does now" -m "Where each person came from, the columns and the view that keeps them, the keyboard's one listener, the bulk bar on the people shown." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Verify, re-check the number, open the PR, hand the push to Ruben

**Files:** none new; whatever the checks below require.

- [ ] **Step 1: Bring the branch up to main**

Run: `git fetch origin && git log --oneline HEAD..origin/main`
Expected: no output. If main moved, run `git rebase origin/main`, resolve anything in the files above, rebuild the dists (Task 2, Step 5), and re-run this task from Step 2.

- [ ] **Step 2: Re-check the migration number, right before pushing**

Run the command from Task 1, Step 3, again.
Expected: nothing else holds 00136. If something does, `git mv supabase/migrations/00136_a_person_says_where_they_came_from.sql supabase/migrations/<next>_a_person_says_where_they_came_from.sql`, then find every mention with `grep -rn "00136" --include=*.sql --include=*.mjs --include=*.ts --include=*.md . | grep -v node_modules` and change each: the migration's own header, `people.ts`, the two test files, `docs/system-prd.md` and this plan. Rebuild the dists (the contracts `.d.ts` carries the comments) and commit.

- [ ] **Step 3: The whole unit suite, the ratchet, the dist, the types, the lint**

Run these in a fresh shell, without the `SUPABASE_*` variables (with them set, about 109 database tests join the run, and it is not comparable to CI):
- `corepack pnpm test`. Expected: `# fail 0`.
- `node --conditions=react-server --import tsx --test tooling/scripts/tests/source-scan-ratchet.test.mjs tooling/scripts/tests/route-policy.test.mjs tooling/scripts/tests/route-types.test.mjs tooling/scripts/tests/legacy-harness.test.mjs`. Expected: `# fail 0`. If the ratchet reports "shrank", bank it with `UPDATE_SOURCE_SCAN_BASELINE=1 corepack pnpm test` and commit `tooling/scripts/tests/source-scan-baseline.json`.
- `corepack pnpm check:dist`. Expected: `dist in sync with src` (run after committing; it reads any uncommitted change under `packages` as drift).
- `corepack pnpm -r typecheck` and `corepack pnpm lint`. Expected: no errors (lint holds `react-hooks/rules-of-hooks` on the legacy JSX).
- `NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-build-placeholder corepack pnpm --filter @chanlytics/dashboard build`, with CI's placeholders. Expected: the build completes.

- [ ] **Step 4: The database suites on a replayed local stack**

Run: `"$SB" db reset`, then `eval "$("$SB" status -o env | sed -n 's/^\(SERVICE_ROLE_KEY\|ANON_KEY\)=/export SUPABASE_\1=/p')"; export SUPABASE_URL=http://127.0.0.1:54321; export SUPABASE_CLI="$SB"; corepack pnpm test:db`
Expected: `# fail 0`. `privileges.db.test.mjs` needs `SUPABASE_CLI` exported, or its 12 tests fail with a spawn ENOENT. If `jobs-outbox.db.test.mjs` "a claim takes what is due" returns `[]`, another file claimed the row first; re-run that file alone after a fresh reset before calling it a regression. Then `SUPABASE_CLI="$SB" corepack pnpm check:db-types`. Expected: exit 0.

- [ ] **Step 5: The e2e specs parse**

Run: `corepack pnpm exec playwright test e2e/people.spec.ts --list`
Expected: 11 tests listed (9 today, plus 2). They run nightly against production; the two new ones pass only once this is deployed.

- [ ] **Step 6: Push and open the PR**

Run: `git rev-parse --abbrev-ref HEAD` (expected `feat/people-table-phase-0`), then `git push -u origin feat/people-table-phase-0`.

Write this body to a file in your scratchpad with your file tool, then run `gh pr create --repo expectmeout/chanlytics-os --base main --head feat/people-table-phase-0 --title "People is a table to work in: where each person came from, your columns, one keyboard, Person pinned (00136)" --body-file <that file>`:

```md
Phase 0 of the People and lead-finder PRD, planned in docs/plans/2026-09-18-people-table.md. People only: no leads, no Apify, no AI.

## What changes
- **Came from, once, in SQL (00136).** `people_list` returns `came_from`: the door that added them (calendar, lead, by hand), else an imported history, else their first call or the wire of their first message. Contracts say it in words (`cameFromOf`). The order now ends on the id, so people alike in everything it reads page without repeats or gaps.
- **Columns.** The table is drawn from column definitions; a Columns menu (it stays open) shows and hides them; Person is always there. The view saves `{ sortBy, sortDir, columns }` whole, every time, because `member_view_set` replaces it.
- **One keyboard listener**, registered once and reading a keys ref: J/K and the arrows, x and Space, Enter, /, Esc.
- **The bulk bar acts on the people shown**: a person a refresh moved out of the view is no longer counted or written to.
- **The table scrolls in its own box on a desktop**: the header and Person stay put, with a hairline once it scrolls sideways. At 1280px with a calendar the old box cut off 176px, Offers and the row actions among it. A picked row is an ink tint in light and dark.

## Proof
Every new people-honest test was red before its commit and green after; the four source pins this changed became behaviour tests, and no `readCode` was added; `people-came-from.db.test.mjs` proves each `came_from`, the member's RLS path and the whole order on Postgres; two new e2e tests (the Columns menu with its save intercepted, the pinned column at 960px) run nightly.

## Order
This PR carries a migration, so 00136 goes to production first (a dry run, the push, a read-back), and then it merges. The code is safe on either side of it: a row read before the column has no `came_from`, and the column says nothing for it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Wait for CI (`gh pr checks <number> --repo expectmeout/chanlytics-os --watch`). If a check fails, read its log and fix it. A red Database job with every step failing in about 2 seconds is a billing block; read the run's annotations. **Do not merge**: the PR carries a migration.

- [ ] **Step 7: Push 00136 to production, then merge**

The production push is the agent's (Ruben, 18 Sep). Run it from this worktree, on the PR's branch, once CI is green. A worktree has no Supabase link of its own: if `supabase/.temp/project-ref` is missing, copy the main checkout's `supabase/.temp` in first.

```bash
SB="$HOME/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"
"$SB" db push --linked --dry-run </dev/null
```

Expected: the dry run lists exactly `00136_a_person_says_where_they_came_from.sql`. If it lists anything else, stop and find out why before pushing.

```bash
"$SB" db push --linked --yes </dev/null
"$SB" db query --linked "select string_agg(version, ',' order by version desc) from (select version from supabase_migrations.schema_migrations order by version desc limit 3) t"
```

Expected: the head starts with `00136`. Then merge, from a folder that is not a git checkout: `gh pr merge <number> --repo expectmeout/chanlytics-os --squash --delete-branch`. Then confirm that the next nightly e2e ran `e2e/people.spec.ts` green.

If Claude Code's auto-mode classifier refuses the push, never reroute it: finish everything else and hand Ruben these PowerShell one-liners, run from this worktree:

```powershell
Set-Location "C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-people-table"; & "$env:LOCALAPPDATA\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe" db push --linked --dry-run
```

```powershell
Set-Location "C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-people-table"; & "$env:LOCALAPPDATA\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe" db push --linked
```

---

## Spec coverage

| Phase 0 requirement | Where |
|---|---|
| Came from computed once in SQL, drop + recreate as 00127 did, same signature, grants and comment restated, next free number re-checked, deterministic order | Task 1; Task 9, Step 2 |
| A DB test proves each value | Task 1 (`people-came-from.db.test.mjs`: 11 cases, the member's RLS path, the whole order) |
| `database.types.ts` regenerated | Task 1, Step 6 |
| `PersonRowDto.came_from?`, `cameFromOf`, the words once in contracts, `cameFrom` on the row VM, dist rebuilt | Task 2 |
| The table driven by column definitions, still `<table class="cl-table">`, generic shape for Leads | Task 3 (`PL_COLUMNS`, `PeopleTable`), and File structure (why it stays in this file) |
| A Columns menu that stays open; Person always on and pinned | Task 5 (`PeopleColumnsMenu`), Task 7 (`pl-pin`) |
| Columns saved per member in `views.people` with the sort; every save sends all keys | Task 5 (`{ sortBy, sortDir, columns }`; see disagreement 2 on `attentionTab`) |
| A "Came from" column with a `data-testid`, on by default | Task 3 (`row-came-from`) |
| One keyboard listener with a keys ref: J/K, arrows, x, Space, Enter, /, Esc; row actions on the cursor | Task 4 |
| The bulk bar acts on what is shown, with a people-honest test that fails on today's code | Task 6 |
| Sticky header, sticky Person column, a hairline once scrolled sideways, a selected tint in light (not the accent); the pinned CSS and phone cards kept | Task 7 |
| Docs: `docs/system-prd.md` People, and what `legacy/CLAUDE.md` would otherwise leave untrue | Task 8 |
| Pins changed on purpose, no new `readCode`; e2e specs updated | Task 3, Steps 7-8; Task 4, Step 5; Task 5, Step 5 |
| `?v=` bump, dist rebuild and `check:dist`, source-scan baseline, route policy (unchanged), final verification, the production push (the agent's, dry run first) | Task 3, Step 4; Tasks 1-2; Task 9 |
