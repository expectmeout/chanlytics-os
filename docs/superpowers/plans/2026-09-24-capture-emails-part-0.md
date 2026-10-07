# Capture customers' emails (Part 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give email campaigns someone to reach: a business imports its own client list with addresses, and an address a customer gives — in a message, on the calendar, or on a call — is kept on their page.

**Status (24 Sep 2026):** both PRs merged (#999 → 7d32e7ae, #1005 → 90c3b755); migrations 00170 and 00171 are on production and read back (`import_person`, the verb CHECK with `import`, `set_person_email` with its no-session `customer_message` branch). The PRs' "push 00169" lines meant these two. Open: Task 15 Step 2 (no record of the in-app look), the voice agent converge (Ruben's go), and the nightly import spec from the spec's "Done when".

**Architecture:** Two PRs from spec `docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md` §6 Part 0. PR 1 adds a hand-rolled CSV reader in contracts, one definer door `import_person` that dedupes by number then address and fills only what is empty, an owner-only batch route of 50 rows, and a People sheet that reads the file in the browser; the paper form gains an Email line. PR 2 adds a receptionist switch that asks for an email when it sends the booking link, keeps an address a customer writes back (through `set_person_email` given a no-session branch for the edge), fills an empty address from a calendar event, and records the address a caller gives as a post-call suggestion. Nothing here records a yes.

**Tech Stack:** TypeScript (contracts, Next routes, edge), plpgsql migrations (forward-only), the legacy React shell (Babel JSX, no bundler, `?v=` bumps), `node --test` on the stub React, Playwright nightly.

**Repo conventions that bind every task:** run from the worktree `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-camp-compact`; a changed `packages/contracts/src` file means `corepack pnpm --filter "./packages/*" build` and committing every `packages/*/dist` file that changed (CI fails on drift); a new legacy file goes in BOTH `apps/dashboard/src/legacy-bridge/manifest.ts` and `apps/dashboard/src/legacy/Chanlytics.html` in the same order, and every edited legacy file's `?v=N` is bumped; a route change means `node tooling/scripts/gen-route-types.mjs` and a `tooling/scripts/tests/route-policy.json` entry; the worktree converts files to CRLF — edit with tools that keep line endings; never stage `apps/dashboard/tsconfig.json` or `next-env.d.ts` after a dev-server run. Tests run as `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs`. Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; hooks run Prettier on staged files and are never skipped.

---

## PR 1 — Import people from a spreadsheet, and the paper form's Email line

Branch: `design/campaign-channels` (it already holds the spec commit `8b31b707`). Migration number: `00169` — open PR #992 holds `00168`, and two files on one number are silently skipped (check `ls supabase/migrations | tail -1` and the open PRs' migrations first; take the next free number). Where this plan says 00168 for PR 1, read 00169.

### Task 1: The CSV reader and the column matcher (contracts)

**Files:**
- Modify: `packages/contracts/src/csv.ts` (append below `csvCell`)
- Test: `tooling/scripts/tests/csv-import.test.mjs`

- [x] **Step 1: Write the failing test**

```js
/**
 * A business's own client list, read in the browser: RFC 4180 cells (quotes, escaped quotes, commas inside quotes,
 * CRLF), a BOM, a header found by its words or by what its values are, and rows normalised to the one phone rule and
 * the one email rule. No dependency: the repository hand-rolls file formats on purpose.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, matchColumns, importRowsOf, importCounts } from "@chanlytics/contracts";

const BOOKSY = [
  "\uFEFFFirst name,Last name,Mobile,E-mail,Visits",
  'Ana,"Ruiz, Jr.",(646) 555-0101,Ana@Example.com,12',
  "Dee,Lopez,646-555-0102,,3",
  'Eli,"O""Neil",,eli@example.com,1',
  ",,,,",
  "Fay,Kim,555-0104,not-an-address,0",
].join("\r\n");

test("cells are read as a spreadsheet writes them: quotes, escaped quotes, a comma inside quotes, CRLF, a BOM, blank lines dropped", () => {
  const rows = parseCsv(BOOKSY);
  assert.deepEqual(rows[0], ["First name", "Last name", "Mobile", "E-mail", "Visits"]);
  assert.deepEqual(rows[1], ["Ana", "Ruiz, Jr.", "(646) 555-0101", "Ana@Example.com", "12"]);
  assert.deepEqual(rows[3], ["Eli", 'O"Neil', "", "eli@example.com", "1"]);
  assert.equal(rows.length, 5, "the all-blank line is not a row");
  assert.deepEqual(parseCsv("name;mobile\nAna;6465550101"), [["name", "mobile"], ["Ana", "6465550101"]], "a semicolon file reads too");
});

test("the columns are found by the header's words, a last name joins the first", () => {
  const { columns, header } = matchColumns(parseCsv(BOOKSY));
  assert.equal(header, true);
  assert.deepEqual(columns, { name: 0, last: 1, phone: 2, email: 3 });
});

test("without a header the columns are found by what the values are", () => {
  const rows = parseCsv("Ana Ruiz,+16465550101,ana@example.com\nDee Lopez,+16465550102,\nEli,,eli@example.com");
  const { columns, header } = matchColumns(rows);
  assert.equal(header, false);
  assert.deepEqual(columns, { name: 0, last: null, phone: 1, email: 2 });
});

test("rows are normalised to the one phone and the one email rule, and counted", () => {
  const rows = parseCsv(BOOKSY);
  const { columns, header } = matchColumns(rows);
  const people = importRowsOf(rows, columns, header);
  assert.deepEqual(people, [
    { line: 2, name: "Ana Ruiz, Jr.", phone: "+16465550101", email: "ana@example.com" },
    { line: 3, name: "Dee Lopez", phone: "+16465550102", email: null },
    { line: 4, name: 'Eli O"Neil', phone: null, email: "eli@example.com" },
    { line: 6, name: "Fay Kim", phone: null, email: null },
  ]);
  assert.deepEqual(importCounts(people), { rows: 4, withPhone: 2, withEmail: 2, unreadable: 1 });
});

test("a column the file lacks is null and the rows still read", () => {
  const rows = parseCsv("Name,Email\nAna,ana@example.com");
  const { columns } = matchColumns(rows);
  assert.deepEqual(columns, { name: 0, last: null, phone: null, email: 1 });
  assert.deepEqual(importRowsOf(rows, columns, true), [{ line: 2, name: "Ana", phone: null, email: "ana@example.com" }]);
});
```

- [x] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/csv-import.test.mjs`
Expected: FAIL — `parseCsv` is not exported by `@chanlytics/contracts`.

- [x] **Step 3: Implement**

Append to `packages/contracts/src/csv.ts`:

```ts
import { normalizeEmail } from "./email-address";
import { normalizePhone } from "./phone";

/* ------------------------------------------------------------------ reading a file */

/** The delimiter a file uses: a semicolon when its first line has more of them than commas (a European export). */
function delimiterOf(text: string): "," | ";" {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  return (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ";" : ",";
}

/**
 * A CSV as a spreadsheet writes one (RFC 4180): cells quoted when they must be, a quote inside a cell doubled, CRLF or
 * LF between rows, a BOM at the front. A row every cell of which is blank is not a row. Hand-rolled: the repository
 * takes no dependency for a file format it can read in forty lines.
 */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = delimiterOf(s);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === sep) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Which column holds what; null for a column the file lacks. `last` is a surname column joined onto the name. */
export interface ImportColumns {
  name: number | null;
  last: number | null;
  phone: number | null;
  email: number | null;
}

const NAME_WORDS = /^(name|full ?name|client|client ?name|customer|customer ?name|first ?name|given ?name|nombre)$/i;
const LAST_WORDS = /^(last ?name|surname|family ?name|apellidos?)$/i;
const PHONE_WORDS = /^(phone|mobile|cell|cell ?phone|tel|telephone|phone ?number|mobile ?number|number|tel[eé]fono|m[oó]vil|celular)$/i;
const EMAIL_WORDS = /^(e-?mail|email ?address|e-?mail ?address|correo|correo electr[oó]nico)$/i;

/** The share of a column's non-empty cells that `is` accepts. */
function share(rows: string[][], col: number, is: (v: string) => boolean): number {
  let seen = 0;
  let hit = 0;
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (!v) continue;
    seen += 1;
    if (is(v)) hit += 1;
  }
  return seen ? hit / seen : 0;
}

/**
 * Where the name, the number and the address are. The first row is a header when none of its cells is a number or an
 * address; a header names its columns by their words, and a column no header names is known by its values (six in ten
 * of its filled cells a number, or an address). The name is the header's, else the first column of letters that is
 * neither.
 */
export function matchColumns(rows: string[][]): { columns: ImportColumns; header: boolean } {
  const first = rows[0] ?? [];
  const width = Math.max(0, ...rows.map((r) => r.length));
  const header = first.length > 0 && !first.some((c) => normalizePhone(c) !== null || normalizeEmail(c) !== null);
  const body = header ? rows.slice(1) : rows;
  const columns: ImportColumns = { name: null, last: null, phone: null, email: null };
  if (header) {
    first.forEach((h, i) => {
      const w = h.trim();
      if (columns.email === null && EMAIL_WORDS.test(w)) columns.email = i;
      else if (columns.phone === null && PHONE_WORDS.test(w)) columns.phone = i;
      else if (columns.last === null && LAST_WORDS.test(w)) columns.last = i;
      else if (columns.name === null && NAME_WORDS.test(w)) columns.name = i;
    });
  }
  for (let i = 0; i < width; i++) {
    if (Object.values(columns).includes(i)) continue;
    if (columns.email === null && share(body, i, (v) => normalizeEmail(v) !== null) >= 0.6) columns.email = i;
    else if (columns.phone === null && share(body, i, (v) => normalizePhone(v) !== null) >= 0.6) columns.phone = i;
  }
  if (columns.name === null) {
    for (let i = 0; i < width; i++) {
      if (Object.values(columns).includes(i)) continue;
      if (share(body, i, (v) => /\p{L}/u.test(v) && normalizeEmail(v) === null && normalizePhone(v) === null) >= 0.6) {
        columns.name = i;
        break;
      }
    }
  }
  return { columns, header };
}

/** One line of the file, normalised: `line` is its 1-based line in the file, for the words that say what was skipped. */
export interface ImportRow {
  line: number;
  name: string | null;
  phone: string | null;
  email: string | null;
}

/** The rows as the door takes them: the one phone rule, the one email rule, a name of at most 80 characters. */
export function importRowsOf(rows: string[][], columns: ImportColumns, header: boolean): ImportRow[] {
  const cell = (r: string[], i: number | null): string => (i === null ? "" : (r[i] ?? "").trim());
  return (header ? rows.slice(1) : rows).map((r, n) => {
    const name = [cell(r, columns.name), cell(r, columns.last)].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 80);
    return {
      line: n + (header ? 2 : 1),
      name: name || null,
      phone: normalizePhone(cell(r, columns.phone)),
      email: normalizeEmail(cell(r, columns.email)),
    };
  });
}

/** What the preview says before anything is written: rows, how many can be reached by number, by address, and neither. */
export function importCounts(rows: ImportRow[]): { rows: number; withPhone: number; withEmail: number; unreadable: number } {
  return {
    rows: rows.length,
    withPhone: rows.filter((r) => r.phone).length,
    withEmail: rows.filter((r) => r.email).length,
    unreadable: rows.filter((r) => !r.phone && !r.email).length,
  };
}
```

`csv.ts` is already exported from `packages/contracts/src/index.ts` (`export * from "./csv"`), so nothing to add there.

- [x] **Step 4: Build contracts and run the test**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/csv-import.test.mjs`
Expected: PASS, 5 tests. (The line-number expectation in test 4 skips the all-blank line 5: rows are lines 2, 3, 4, 6.)

- [x] **Step 5: Commit**

```bash
git add packages/contracts/src/csv.ts packages/contracts/dist packages/core/dist packages/channels/dist packages/jobs/dist packages/db/dist tooling/scripts/tests/csv-import.test.mjs
git commit -m "A client list is read as a spreadsheet writes it: cells, a header by its words or its values, rows on the one phone and email rules"
```
(Add only the dist files `git status` shows changed; `git add packages/*/dist` is fine when the build touched several.)

### Task 2: The `import_person` door, the `import` decision verb, and "Imported"

**Files:**
- Create: `supabase/migrations/00168_people_may_be_imported.sql`
- Modify: `packages/contracts/src/enums.ts` (DECISION_VERBS), `packages/contracts/src/activity.ts` (the verb's words), `packages/contracts/src/person-words.ts:41`, `packages/db/src/database.types.ts` (Functions)
- Test: `tooling/scripts/tests/import-person.db.test.mjs`

- [x] **Step 1: Write the failing database test**

```js
/**
 * A spreadsheet's line becomes a person, or fills one, on a real database.
 *
 * 00168 is a definer door whose body plpgsql does not parse until it runs, a widened decisions CHECK, and a recreated
 * people_list: what reading source cannot prove. Runs against Postgres in the database workflow; skipped without a
 * local database. The door needs a signed-in member, so a user is made and signs in, as person-email.db.test.mjs does.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { erasedPhoneHash } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
let as;
let tenantId;
let userId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db.from("tenants").insert({ slug: `import-${Date.now()}`, name: "Import" }).select("id").single();
  if (t.error) throw new Error(t.error.message);
  tenantId = t.data.id;
  const email = `owner-${Date.now()}@example.com`;
  const made = await db.auth.admin.createUser({ email, password: "a-long-test-password-1", email_confirm: true });
  if (made.error) throw new Error(made.error.message);
  userId = made.data.user.id;
  const m = await db.from("memberships").insert({ tenant_id: tenantId, user_id: userId, role: "owner" });
  if (m.error) throw new Error(m.error.message);
  as = createClient(URL_, ANON, { auth: { persistSession: false } });
  const s = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
  if (s.error) throw new Error(s.error.message);
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
  if (userId) await db.auth.admin.deleteUser(userId);
});

const door = (args) => as.rpc("import_person", { p_tenant_id: tenantId, p_name: null, p_phone_e164: null, p_email: null, ...args });

test("a new line makes a person once, by number then by address, filling only what is empty", { skip }, async () => {
  const a = await door({ p_name: "Ana Ruiz", p_phone_e164: "+16465550101", p_email: "ana@example.com" });
  assert.equal(a.error, null, a.error?.message);
  assert.equal(a.data.existed, false);
  assert.equal(a.data.email, "set");
  // The same number again, with a different spelling of the name: the person, unchanged.
  const again = await door({ p_name: "Ana R.", p_phone_e164: "+16465550101" });
  assert.equal(again.data.contact_id, a.data.contact_id);
  assert.equal(again.data.existed, true);
  const { data: row } = await db.from("contacts").select("display_name, email, phone_e164").eq("id", a.data.contact_id).single();
  assert.deepEqual(row, { display_name: "Ana Ruiz", email: "ana@example.com", phone_e164: "+16465550101" });
  // An address alone that is Ana's finds Ana; a number for her stays hers.
  const byMail = await door({ p_email: "ANA@example.com", p_phone_e164: "+16465550199" });
  assert.equal(byMail.data.contact_id, a.data.contact_id, "found by the stored spelling of the address");
  const { data: kept } = await db.from("contacts").select("phone_e164").eq("id", a.data.contact_id).single();
  assert.equal(kept.phone_e164, "+16465550101", "a number on file is never overwritten");
  // A person made from an address alone, then given their number by a later line.
  const eli = await door({ p_name: "Eli", p_email: "eli@example.com" });
  assert.equal(eli.data.existed, false);
  const eliNumbered = await door({ p_email: "eli@example.com", p_phone_e164: "+16465550103" });
  assert.equal(eliNumbered.data.contact_id, eli.data.contact_id);
  const { data: eliRow } = await db.from("contacts").select("phone_e164").eq("id", eli.data.contact_id).single();
  assert.equal(eliRow.phone_e164, "+16465550103", "an empty number is filled");
  // The event says where they came from, never the address.
  const { data: ev } = await db.from("events").select("data").eq("subject_id", a.data.contact_id).eq("kind", "contact.added").single();
  assert.equal(ev.data.source, "import");
  assert.equal(JSON.stringify(ev.data).includes("example.com"), false);
});

test("an address another person here holds is not moved: the line's person keeps none, and the door says taken", { skip }, async () => {
  await door({ p_name: "Dee", p_phone_e164: "+16465550104", p_email: "dee@example.com" });
  const fay = await door({ p_name: "Fay", p_phone_e164: "+16465550105", p_email: "dee@example.com" });
  assert.equal(fay.error, null, fay.error?.message);
  assert.equal(fay.data.existed, false);
  assert.equal(fay.data.email, "taken");
  const { data } = await db.from("contacts").select("email").eq("id", fay.data.contact_id).single();
  assert.equal(data.email, null);
});

test("a line with neither a number nor an address, or a malformed one, is refused as that row (22023)", { skip }, async () => {
  const none = await door({ p_name: "Nobody" });
  assert.equal(none.error?.code, "22023");
  const bad = await door({ p_phone_e164: "555-0101" });
  assert.equal(bad.error?.code, "22023");
  const shapeless = await door({ p_email: "dee.example.com" });
  assert.equal(shapeless.error?.code, "22023");
});

test("a person who asked to be forgotten is not brought back by a spreadsheet", { skip }, async () => {
  const phone = "+16465550106";
  const gone = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: null, erased_at: new Date().toISOString(), erased_phone_hash: await erasedPhoneHash(tenantId, phone) }).select("id").single();
  assert.equal(gone.error, null, gone.error?.message);
  const r = await door({ p_name: "Gone", p_phone_e164: phone, p_phone_digest: await erasedPhoneHash(tenantId, phone) });
  assert.equal(r.error?.code, "42501");
});

test("people_list says an imported person came from an import, and the import verb is a decision the ledger takes", { skip }, async () => {
  const r = await door({ p_name: "Gil", p_phone_e164: "+16465550107" });
  const { data: rows, error } = await as.rpc("people_list", { p_tenant_id: tenantId, p_q: null, p_offset: 0, p_limit: 50 });
  assert.equal(error, null, error?.message);
  assert.equal(rows.find((p) => p.id === r.data.contact_id)?.came_from, "import");
  const d = await db.from("decisions").insert({ tenant_id: tenantId, subject_type: "workspace", subject_id: tenantId, verb: "import", actor_type: "user", actor_user_id: userId, payload: {} });
  assert.equal(d.error, null, d.error?.message);
});
```

(`people_list`'s argument names: copy them from the latest definition — `git grep -n "people_list(" supabase/migrations | tail -3` — if they differ from `p_tenant_id, p_q, p_offset, p_limit`.)

- [x] **Step 2: Run it to see it fail (or skip without a stack)**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/import-person.db.test.mjs`
Expected: with a local Supabase stack (`corepack pnpm supabase start`, env from `docs/runbook.md`): FAIL — `function public.import_person does not exist`. Without a stack: all skipped ("no database in env"); CI's database workflow runs it because a migration changed.

- [x] **Step 3: Write the migration**

`supabase/migrations/00168_people_may_be_imported.sql`:

```sql
-- A business's own client list arrives as a spreadsheet: a name, a number and an
-- address per line (Part 0 of docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md).
-- One door takes one line. It finds the person by number, then by address, fills
-- only what is empty (a name, an address, a number), never overwrites, makes nobody
-- who asked to be forgotten (the digests of 00124 and 00125, computed by the route
-- with the deployment's key), and records no yes: an address on file is not consent.
-- Re-runnable: create or replace, add-if-not-exists, drop-then-add for the CHECKs.

create or replace function public.import_person(
  p_tenant_id    uuid,
  p_name         text,
  p_phone_e164   text,
  p_email        text,
  p_phone_digest text default null,
  p_email_digest text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_name      text := left(nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), ''), 80);
  v_phone     text := nullif(btrim(coalesce(p_phone_e164, '')), '');
  v_email     text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id        uuid;
  v_existed   boolean := false;
  v_email_out text := null;   -- 'set' | 'kept' | 'taken' | null
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if p_tenant_id is null or not public.is_acting_member(p_tenant_id) then
    raise exception 'Workspace not found.' using errcode = 'P0002';
  end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A phone number in international form is needed.' using errcode = '22023';
  end if;
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'A number or an address is needed.' using errcode = '22023';
  end if;
  -- The erased stay erased: a line that names one is left alone (00124, 00125).
  if (p_phone_digest is not null and exists (
        select 1 from contacts c where c.tenant_id = p_tenant_id and c.erased_phone_hash = p_phone_digest))
     or (p_email_digest is not null and exists (
        select 1 from contacts c where c.tenant_id = p_tenant_id and c.erased_email_hash = p_email_digest)) then
    raise exception 'That person asked to be forgotten.' using errcode = '42501';
  end if;

  if v_phone is not null then
    select c.id into v_id from contacts c
     where c.tenant_id = p_tenant_id and c.phone_e164 = v_phone
       and c.erased_at is null and c.merged_into_contact_id is null
     limit 1;
  end if;
  if v_id is null and v_email is not null then
    select c.id into v_id from contacts c
     where c.tenant_id = p_tenant_id and c.email = v_email
       and c.erased_at is null and c.merged_into_contact_id is null
     limit 1;
  end if;

  if v_id is not null then
    v_existed := true;
    -- A name, a number or an address we did not have is worth keeping; one we have is never overwritten.
    if v_name is not null then
      update contacts set display_name = v_name, updated_at = now() where id = v_id and display_name is null;
    end if;
    if v_phone is not null then
      begin
        update contacts set phone_e164 = v_phone, updated_at = now() where id = v_id and phone_e164 is null;
      exception when unique_violation then
        null; -- another person here holds the number: theirs stays theirs
      end;
    end if;
    if v_email is not null then
      if exists (select 1 from contacts c where c.id = v_id and c.email is not null) then
        v_email_out := 'kept';
      elsif exists (select 1 from contacts c where c.tenant_id = p_tenant_id and c.email = v_email) then
        v_email_out := 'taken';
      else
        perform public.set_person_email(v_id, v_email);
        v_email_out := 'set';
      end if;
    end if;
  else
    begin
      insert into contacts (tenant_id, phone_e164, email, display_name)
      values (p_tenant_id, v_phone, v_email, v_name)
      returning id into v_id;
      insert into events (tenant_id, kind, category, subject_type, subject_id, data)
      values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
              jsonb_build_object('source', 'import', 'title', null, 'by', v_user));
      v_email_out := case when v_email is not null then 'set' else null end;
    exception when unique_violation then
      -- The number won a race, or the address is another person's here.
      select c.id into v_id from contacts c
       where c.tenant_id = p_tenant_id and c.erased_at is null
         and ((v_phone is not null and c.phone_e164 = v_phone) or (v_phone is null and c.email = v_email))
       limit 1;
      if v_id is null then
        -- A new number whose address belongs to someone else: the person is made without the address.
        insert into contacts (tenant_id, phone_e164, display_name)
        values (p_tenant_id, v_phone, v_name)
        returning id into v_id;
        insert into events (tenant_id, kind, category, subject_type, subject_id, data)
        values (p_tenant_id, 'contact.added', 'contact', 'contact', v_id,
                jsonb_build_object('source', 'import', 'title', null, 'by', v_user));
        v_email_out := 'taken';
      else
        v_existed := true;
      end if;
    end;
  end if;

  return jsonb_build_object('contact_id', v_id, 'existed', v_existed, 'email', v_email_out);
end $$;

revoke execute on function public.import_person(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.import_person(uuid, text, text, text, text, text) to authenticated;
comment on function public.import_person(uuid, text, text, text, text, text) is
  'One line of an imported client list: find by number, then address; fill what is empty; never a yes; the erased stay erased.';

-- The ledger takes an import: one row per part of fifty, subject the workspace.
alter table public.decisions drop constraint if exists decisions_verb_check;
alter table public.decisions add constraint decisions_verb_check
  check (verb in (
    'approve', 'edit', 'decline', 'snooze', 'wake', 'take_over', 'hand_back',
    'resolve', 'archive', 'reply', 'cancel_send', 'pause_agent', 'resume_agent',
    'invite', 'revoke_invite', 'change_role', 'remove_member', 'erase', 'whisper',
    'connect_channel', 'consent_change', 'send_broadcast', 'cancel_broadcast',
    'start_playbook', 'pause_playbook', 'reply_review', 'export', 'end_call',
    'record_deal', 'import'
  ));
```

Then, **in the same file**, recreate `people_list` so an imported person reads as one: find the latest definition (`git grep -ln "function public.people_list" supabase/migrations | sort | tail -1`, 00166 at the time of writing), copy its whole `create or replace function public.people_list(...)` block verbatim to the end of 00168, and change only the `came_from` CASE: before the arm `when ad.source is not null then 'manual'` insert the arm `when ad.source = 'import' then 'import'`. Nothing else in the copy changes.

- [x] **Step 4: The verb, its words, the label, the types**

`packages/contracts/src/enums.ts`, inside `DECISION_VERBS` after `"record_deal"`:

```ts
  /** A client list brought in from a spreadsheet: one row per part of fifty, subject the workspace. */
  "import",
```

`packages/contracts/src/activity.ts`: beside the line `export: "Exported data",` add `import: "Imported people from a spreadsheet",`. In the `switch` that has `case "export": {` (line ~204), add an arm that mirrors it and says the counts from the payload:

```ts
    case "import": {
      const p = (d.payload ?? {}) as { rows?: number; added?: number; existed?: number; skipped?: number };
      return `Imported ${p.rows ?? 0} rows from a spreadsheet: ${p.added ?? 0} new, ${p.existed ?? 0} already here, ${p.skipped ?? 0} skipped`;
    }
```
(Use the same variable name the `export` arm reads its row from.)

`packages/contracts/src/person-words.ts:41`: `import: "Imported history",` → `import: "Imported",` (the word now covers a person brought in by a spreadsheet and a history moved in). Run `git grep -n "Imported history"` and update any test that pins the old words.

`packages/db/src/database.types.ts`, in `Functions` in alphabetical order (before `ingest_call`):

```ts
      import_person: {
        Args: {
          p_tenant_id: string
          p_name: string | null
          p_phone_e164: string | null
          p_email: string | null
          p_phone_digest?: string | null
          p_email_digest?: string | null
        }
        Returns: Json
      }
```

- [x] **Step 5: Build, run the database test, run the enum and activity tests**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/import-person.db.test.mjs tooling/scripts/tests/enums-vs-checks.test.mjs`
Expected: the db test PASS (or skipped without a stack), `enums-vs-checks` PASS (it holds `DECISION_VERBS` to the CHECK in the migrations). Then `corepack pnpm test` for the words: fix any test that pinned "Imported history".

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/00168_people_may_be_imported.sql packages/contracts/src/enums.ts packages/contracts/src/activity.ts packages/contracts/src/person-words.ts packages/db/src/database.types.ts packages/*/dist tooling/scripts/tests/import-person.db.test.mjs
git commit -m "import_person: one line of a client list finds the person by number then address and fills only what is empty; the ledger takes an import"
```

### Task 3: The route `POST /api/v1/contacts/import`

**Files:**
- Create: `apps/dashboard/app/api/v1/contacts/import/route.ts`
- Modify: `apps/dashboard/src/server/rate-limit.ts` (a bucket beside `person_create`), `tooling/scripts/tests/route-policy.json` (an entry after `"POST contacts/[id]/deal"`), `apps/dashboard/src/legacy-bridge/refresh-map.ts:74` (a line), `apps/dashboard/src/client/routes.generated.ts` (generated)
- Test: `tooling/scripts/tests/import-people.test.mjs`

- [x] **Step 1: Write the failing route test**

```js
/**
 * The import route, run through route(): the real module's `run` over a database in memory, the door modelled. What is
 * proved is the policy it declares and what the handler answers: a part of fifty normalised on the one phone and email
 * rules before the door sees it, the unreadable skipped with the product's words, a row the door refuses skipped, a
 * fault that refuses every row stopping the part, and one decision per part.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/contacts/import/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const IMPORT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const tables = () => ({
  memberships: [{ user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  decisions: [],
});
const ctxFor = (rpcs) => ({ supabase: fakeDb(tables(), {}, rpcs), userId: USER, email: "ada@example.com", params: {} });
const post = (body) =>
  new Request(`http://localhost/api/v1/contacts/import?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });

test("the route declares its policy: the owner's, counted in its own bucket, never spending", () => {
  assert.deepEqual(route.POST.policy, { kind: "write", scope: "workspace", role: "owner", rate: "person_import", spend: false });
});

test("a part is normalised before the door sees it, the unreadable are skipped in the product's words, and one decision says the counts", async () => {
  const calls = [];
  const ctx = ctxFor({
    import_person: (args) => {
      calls.push(args);
      return { contact_id: `k-${calls.length}`, existed: calls.length === 2, email: args.p_email ? "set" : null };
    },
  });
  const out = await route.POST.run(
    post({
      import_id: IMPORT,
      rows: [
        { name: "Ana Ruiz", phone: "(646) 555-0101", email: "Ana@Example.com" },
        { name: "Dee", phone: "646-555-0102" },
        { name: "Nobody" },
        { name: "Short", phone: "12345" },
      ],
    }),
    ctx,
  );
  assert.deepEqual(calls.map((c) => [c.p_phone_e164, c.p_email, c.p_name]), [
    ["+16465550101", "ana@example.com", "Ana Ruiz"],
    ["+16465550102", null, "Dee"],
  ]);
  assert.ok(calls[0].p_phone_digest && calls[0].p_email_digest, "the digests of the number and the address travel with the row");
  assert.equal(calls[1].p_email_digest, null);
  assert.equal(out.added, 1);
  assert.equal(out.existed, 1);
  assert.equal(out.emails_set, 1);
  assert.deepEqual(out.skipped, [
    { line: 3, reason: "No number and no address." },
    { line: 4, reason: "That is a short code, not a phone number — nobody can be reached on one." },
  ]);
  assert.deepEqual(out.failed, []);
  assert.equal(out.stopped, false);
  const decisions = ctx.supabase.tables.decisions;
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].verb, "import");
  assert.equal(decisions[0].subject_type, "workspace");
  assert.deepEqual(
    { ...decisions[0].payload, via: undefined },
    { import_id: IMPORT, rows: 4, added: 1, existed: 1, emails_set: 1, skipped: 2, failed: 0, via: undefined },
  );
});

test("a row the door refuses is skipped with its sentence; a fault that refuses every row stops the part and is said", async () => {
  let n = 0;
  const refusing = ctxFor({
    import_person: () => {
      n += 1;
      if (n === 1) throw Object.assign(new Error("That person asked to be forgotten."), { code: "42501" });
      return { contact_id: "k-2", existed: false, email: null };
    },
  });
  const out = await route.POST.run(post({ import_id: IMPORT, rows: [{ phone: "+16465550101" }, { phone: "+16465550102" }] }), refusing);
  assert.deepEqual(out.skipped, [{ line: 1, reason: "That person asked to be forgotten." }]);
  assert.equal(out.added, 1);

  const broken = ctxFor({
    import_person: () => {
      throw Object.assign(new Error("permission denied for table contacts"), { code: "42501X" });
    },
  });
  const stopped = await route.POST.run(post({ import_id: IMPORT, rows: [{ phone: "+16465550101" }, { phone: "+16465550102" }] }), broken);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.failed.length, 1, "the first fault stops the part; nothing after it is tried");
});

test("more than fifty rows, or none, is refused before the door", async () => {
  const ctx = ctxFor({ import_person: () => ({ contact_id: "k", existed: false, email: null }) });
  await assert.rejects(route.POST.run(post({ import_id: IMPORT, rows: [] }), ctx), (e) => e.code === "validation");
  await assert.rejects(
    route.POST.run(post({ import_id: IMPORT, rows: Array.from({ length: 51 }, (_, i) => ({ phone: `+1646555${String(i).padStart(4, "0")}` })) }), ctx),
    (e) => e.code === "validation",
  );
});
```

Check how `fakeDb` exposes written rows (people-routes.test.mjs reads `ctx.supabase.seen`; if `tables` is not exposed, read the insert from `ctx.supabase.seen.find((s) => s.op === "insert" && s.table === "decisions")` and adjust the two assertions).

- [x] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/import-people.test.mjs`
Expected: FAIL — cannot find module `.../contacts/import/route.ts`.

- [x] **Step 3: The bucket, the route, the policy, the refresh**

`apps/dashboard/src/server/rate-limit.ts`, beside `person_create`:

```ts
  /** A client list arrives in parts of fifty: two hundred and forty parts an hour is twelve thousand people, and a script is not. */
  person_import: { limit: 240, windowMs: 3_600_000, noun: "import parts" },
```

`apps/dashboard/app/api/v1/contacts/import/route.ts`:

```ts
import { z } from "zod";
import {
  afterPersonRefused,
  erasedEmailHash,
  erasedPhoneHash,
  normalizeEmail,
  normalizePhone,
  whyNotAPhone,
  whyNotAnEmail,
} from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { recordDecision } from "@/server/verbs";

const Row = z.object({
  name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(320).optional(),
});
const Body = z.object({
  /** One id for the whole file, so the ledger's parts read as one import. */
  import_id: z.string().uuid(),
  rows: z.array(Row).min(1, "Nothing to import.").max(50, "Fifty at a time."),
});

/**
 * POST /api/v1/contacts/import -- { import_id, rows[≤50] }: a part of a business's own client list.
 *
 * Owner only, in its own bucket. Each row is normalised here on the one phone rule and the one email rule (the door
 * refuses the same things and says less), the digests of the number and the address are computed here with the
 * deployment's key so the door can leave the erased erased, and each row goes through `import_person`: found by number
 * then address, fills only what is empty, never a yes. A row the door refuses (22023, or 42501 for the erased) is
 * skipped and said; any other fault refuses every row and stops the part. One decision per part, subject the
 * workspace, with the counts.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "person_import",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const tenantId = member.tenantId;
    const out = {
      added: 0,
      existed: 0,
      emails_set: 0,
      skipped: [] as { line: number; reason: string }[],
      failed: [] as { line: number; message: string }[],
      stopped: false,
    };
    for (const [i, r] of input.rows.entries()) {
      const line = i + 1;
      const phone = normalizePhone(r.phone ?? null);
      const email = normalizeEmail(r.email ?? null);
      if (!phone && !email) {
        const said = r.phone?.trim() ? whyNotAPhone(r.phone) : r.email?.trim() ? whyNotAnEmail(r.email) : null;
        out.skipped.push({ line, reason: said ?? "No number and no address." });
        continue;
      }
      const { data, error } = await ctx.supabase.rpc("import_person", {
        p_tenant_id: tenantId,
        p_name: (r.name ?? "").trim().slice(0, 80) || null,
        p_phone_e164: phone,
        p_email: email,
        p_phone_digest: phone ? await erasedPhoneHash(tenantId, phone) : null,
        p_email_digest: email ? await erasedEmailHash(tenantId, email) : null,
      });
      if (error) {
        if (afterPersonRefused(error.code) === "skip" || error.code === "42501") {
          out.skipped.push({ line, reason: error.message });
          continue;
        }
        out.failed.push({ line, message: error.message });
        out.stopped = true;
        break;
      }
      const made = data as { contact_id: string; existed: boolean; email: "set" | "kept" | "taken" | null };
      if (made.existed) out.existed += 1;
      else out.added += 1;
      if (made.email === "set") out.emails_set += 1;
    }
    await recordDecision(ctx, tenantId, "workspace", tenantId, "import", {
      import_id: input.import_id,
      rows: input.rows.length,
      added: out.added,
      existed: out.existed,
      emails_set: out.emails_set,
      skipped: out.skipped.length,
      failed: out.failed.length,
    });
    return out;
  },
});
```

`tooling/scripts/tests/route-policy.json`, after the `"POST contacts/[id]/deal"` entry:

```json
    "POST contacts/import": {
      "kind": "write",
      "scope": "workspace",
      "role": "owner",
      "rate": "person_import",
      "spend": false
    },
```

`apps/dashboard/src/legacy-bridge/refresh-map.ts`, after `"POST contacts": people,`:

```ts
  "POST contacts/import": people,
```

Then regenerate the typed client: `node tooling/scripts/gen-route-types.mjs` (and `node tooling/scripts/gen-route-types.mjs --check` must pass).

- [x] **Step 4: Run the tests**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/import-people.test.mjs tooling/scripts/tests/route-policy.test.mjs tooling/scripts/tests/people-routes.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/dashboard/app/api/v1/contacts/import/route.ts apps/dashboard/src/server/rate-limit.ts tooling/scripts/tests/route-policy.json apps/dashboard/src/legacy-bridge/refresh-map.ts apps/dashboard/src/client/routes.generated.ts tooling/scripts/tests/import-people.test.mjs
git commit -m "POST contacts/import: a part of fifty rows through import_person, the unreadable and the refused said, one decision per part"
```

### Task 4: The bridge publishes the reader and the door

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/people-detail.ts` (a function beside `addPerson`, its window type at the `__addPerson` declaration, its assignment beside `window.__addPerson = addPerson;`)
- Modify: `apps/dashboard/src/legacy-bridge/seed-globals.ts` (the import list at line ~26, the `Window` type at line ~82, the assignment at line ~170)

- [x] **Step 1: The door's client**

In `people-detail.ts`, after `addPerson`:

```ts
/**
 * One part of an imported client list: `window.__importPeople({ import_id, rows })`, fifty rows at most, through the
 * owner's door (POST /contacts/import). The People surface re-reads after each part (refresh-map).
 */
export async function importPeople(body: {
  import_id: string;
  rows: { name?: string; phone?: string; email?: string }[];
}): Promise<
  ApiResult<{
    added: number;
    existed: number;
    emails_set: number;
    skipped: { line: number; reason: string }[];
    failed: { line: number; message: string }[];
    stopped: boolean;
  }>
> {
  return api()("POST contacts/import", { body });
}
```

In the `declare global { interface Window { … } }` block, after `__addPerson?: …;`:

```ts
    __importPeople?: typeof importPeople;
```

Beside `window.__addPerson = addPerson;`:

```ts
  window.__importPeople = importPeople;
```

- [x] **Step 2: The reader on the window**

In `seed-globals.ts`, add `parseCsv, matchColumns, importRowsOf, importCounts` to the `@chanlytics/contracts` import beside `csvCell`; in the `Window` type beside `__csvCell: typeof csvCell;`:

```ts
    __csvImport: {
      parseCsv: typeof parseCsv;
      matchColumns: typeof matchColumns;
      importRowsOf: typeof importRowsOf;
      importCounts: typeof importCounts;
    };
```

Beside `window.__csvCell = csvCell;`:

```ts
  window.__csvImport = { parseCsv, matchColumns, importRowsOf, importCounts };
```

- [x] **Step 3: Typecheck**

Run: `corepack pnpm -r typecheck`
Expected: clean.

- [x] **Step 4: Commit**

```bash
git add apps/dashboard/src/legacy-bridge/people-detail.ts apps/dashboard/src/legacy-bridge/seed-globals.ts
git commit -m "The bridge publishes the spreadsheet reader and the import door to the People page"
```

### Task 5: The import sheet on People

**Files:**
- Create: `apps/dashboard/src/legacy/pages/people-import.jsx`
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx` (the phone menu at ~2778, the desk controls at ~2850, a state and the sheet's mount in `PeopleReal`), `apps/dashboard/src/legacy-bridge/manifest.ts:85-86`, `apps/dashboard/src/legacy/Chanlytics.html:128-129`
- Test: `tooling/scripts/tests/people-import.test.mjs`

- [x] **Step 1: Write the failing page test**

```js
/**
 * Import people, drawn on the stub React and run: the pasted rows read, the columns matched, the counts said before
 * anything is written, the door called in parts of fifty with one import id, and the summary in the owner's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, matchColumns, importRowsOf, importCounts } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, byTestId, textOf, all } from "./_legacy-react.mjs";

installLegacyReact();
globalThis.window.__csvImport = { parseCsv, matchColumns, importRowsOf, importCounts };
// The kit's sheet, as a shell: its body, and its one Save when the sheet has one.
globalThis.window.RecordSheet = ({ children, onSave = null, saveLabel = "Save", saving = false, savingLabel = "Saving…", testid = null }) =>
  React.createElement(
    "div",
    { "data-testid": testid || "rec-sheet" },
    children,
    onSave ? React.createElement("button", { "data-testid": "sheet-save", onClick: onSave, disabled: saving }, saving ? savingLabel : saveLabel) : null,
  );
globalThis.window.Icon = () => null;
await import("../../../apps/dashboard/src/legacy/pages/people-import.jsx");
const Sheet = globalThis.window.PeopleImportSheet;
assert.equal(typeof Sheet, "function");

const csv = (n) => ["Name,Mobile,Email", ...Array.from({ length: n }, (_, i) => `P${i},+1646555${String(i).padStart(4, "0")},p${i}@example.com`), "Nobody,,"].join("\n");
const press = (node) => node.props.onClick({ preventDefault() {}, stopPropagation() {} });
const settle = () => new Promise((r) => setImmediate(r));

test("pasted rows are read and counted before anything is written; the door is called in parts of fifty under one import id; the summary says what happened", async () => {
  const parts = [];
  globalThis.window.__importPeople = async (body) => {
    parts.push(body);
    return { ok: true, data: { added: body.rows.length - 1, existed: 1, emails_set: body.rows.length, skipped: [], failed: [], stopped: false } };
  };
  const props = { onClose() {}, onDone() {}, flash() {} };
  fresh();
  const draw = () => Sheet(props);
  let tree = again(draw);
  assert.equal(byTestId(tree, "sheet-save"), null, "nothing to save before a file is read");
  byTestId(tree, "import-paste").props.onChange({ target: { value: csv(60) } });
  tree = again(draw);
  press(byTestId(tree, "import-read"));
  tree = again(draw);
  const counts = textOf(byTestId(tree, "import-counts"));
  assert.ok(counts.includes("61 rows") && counts.includes("60 with a number") && counts.includes("60 with an email") && counts.includes("1 with neither"), counts);
  assert.equal(textOf(byTestId(tree, "sheet-save")), "Import 60 people");
  await press(byTestId(tree, "sheet-save"));
  await settle();
  tree = again(draw);
  assert.equal(parts.length, 2, "sixty readable rows are two parts");
  assert.deepEqual(parts.map((p) => p.rows.length), [50, 10]);
  assert.equal(parts[0].import_id, parts[1].import_id);
  assert.match(parts[0].import_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(parts[0].rows[0], { name: "P0", phone: "+16465550000", email: "p0@example.com" });
  const summary = textOf(byTestId(tree, "import-summary"));
  assert.ok(summary.includes("58 new") && summary.includes("2 already here") && summary.includes("1 skipped"), summary);
  assert.equal(byTestId(tree, "sheet-save"), null, "done: nothing left to save");
});

test("a part the door refuses stops the import and says so; nothing after it is sent", async () => {
  let calls = 0;
  globalThis.window.__importPeople = async () => {
    calls += 1;
    return { ok: false, message: "Only the owner can import people." };
  };
  fresh();
  const draw = () => Sheet({ onClose() {}, onDone() {}, flash() {} });
  let tree = again(draw);
  byTestId(tree, "import-paste").props.onChange({ target: { value: csv(60) } });
  tree = again(draw);
  press(byTestId(tree, "import-read"));
  tree = again(draw);
  await press(byTestId(tree, "sheet-save"));
  await settle();
  tree = again(draw);
  assert.equal(calls, 1);
  assert.ok(textOf(byTestId(tree, "import-error")).includes("Only the owner can import people."));
});
```

(`fresh`/`again` are the harness's mount and redraw, `_legacy-react.mjs:150-166`; if `again` needs a prior first draw by another name there, use it and keep the assertions.)

- [x] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-import.test.mjs`
Expected: FAIL — cannot find `pages/people-import.jsx`.

- [x] **Step 3: The sheet**

`apps/dashboard/src/legacy/pages/people-import.jsx`:

```jsx
/* global React, Icon */
// Import people: a business's own client list (a Booksy or Square export) read in the browser, matched, counted and
// written in parts of fifty through the owner's door (window.__importPeople), on the record kit's sheet. Nothing is
// written until the owner has seen the counts; the door fills only what is empty and records no yes.

const PL_IMPORT_PART = 50;

// The file as a plan: its rows, where the columns are, the people as the door takes them, and the counts the owner sees
// before anything is written. Pure, and on the window for the tests.
const plImportPlan = (text) => {
  const C = window.__csvImport;
  const rows = C.parseCsv(text || "");
  const { columns, header } = C.matchColumns(rows);
  const people = C.importRowsOf(rows, columns, header);
  return { rows, columns, header, people, counts: C.importCounts(people), headers: header ? rows[0] : [] };
};

const plImportCountWords = (c) => {
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  return `${n(c.rows, "row", "rows")} · ${c.withPhone} with a number · ${c.withEmail} with an email · ${c.unreadable} with neither`;
};

// The one id of the whole file: the ledger's parts read as one import by it.
const plImportId = () => (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`.replace(/\./g, ""));

const PeopleImportSheet = ({ onClose, onDone, flash }) => {
  const [text, setText] = React.useState("");
  const [plan, setPlan] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(null);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const readable = plan ? plan.people.filter((p) => p.phone || p.email) : [];
  const read = (t) => {
    const p = plImportPlan(t);
    setPlan(p);
    setResult(null);
    setError(null);
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { const t = String(r.result || ""); setText(t); read(t); };
    r.readAsText(f);
  };
  const run = async () => {
    if (busy || !readable.length || !window.__importPeople) return;
    setBusy(true); setError(null);
    const importId = plImportId();
    const totals = { added: 0, existed: 0, emails_set: 0, skipped: plan.people.filter((p) => !p.phone && !p.email).map((p) => ({ line: p.line, reason: "No number and no address." })), failed: [] };
    for (let i = 0; i < readable.length; i += PL_IMPORT_PART) {
      const part = readable.slice(i, i + PL_IMPORT_PART).map((p) => ({ ...(p.name ? { name: p.name } : {}), ...(p.phone ? { phone: p.phone } : {}), ...(p.email ? { email: p.email } : {}) }));
      setProgress({ done: i, total: readable.length });
      const r = await window.__importPeople({ import_id: importId, rows: part });
      if (!r.ok) { setError(r.message || "The import could not go on."); break; }
      totals.added += r.data.added; totals.existed += r.data.existed; totals.emails_set += r.data.emails_set;
      // The door's lines are the part's; said as the file's.
      for (const s of r.data.skipped) totals.skipped.push({ line: readable[i + s.line - 1].line, reason: s.reason });
      for (const f of r.data.failed) totals.failed.push({ line: readable[i + f.line - 1].line, message: f.message });
      if (r.data.stopped) { setError(`Stopped at line ${readable[i + r.data.failed[0].line - 1].line}: ${r.data.failed[0].message}`); break; }
    }
    setProgress(null); setBusy(false); setResult(totals);
    if (flash && (totals.added || totals.existed)) flash({ msg: <>Imported <b>{totals.added}</b> new {totals.added === 1 ? "person" : "people"}{totals.existed ? `, ${totals.existed} already here` : ""}</> });
    if (onDone) onDone(totals);
  };
  const saveLabel = `Import ${readable.length} ${readable.length === 1 ? "person" : "people"}`;
  const savingLabel = progress ? `Importing ${progress.done} of ${progress.total}…` : "Importing…";
  return (
    <window.RecordSheet
      id="people-import"
      title="Import people"
      sub="A spreadsheet of your clients: names, mobile numbers, emails. Nothing is overwritten, and nobody is signed up for anything."
      onClose={onClose}
      closeLabel={result ? "Done" : "Cancel"}
      onSave={plan && readable.length && !result ? run : null}
      saveLabel={saveLabel}
      saving={busy}
      savingLabel={savingLabel}
      testid="people-import-sheet"
    >
      <div className="pl-import">
        {!result && (
          <>
            <label className="pl-import-file">
              <span className="rec-field-label">Choose a CSV file</span>
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} disabled={busy} data-testid="import-file" />
            </label>
            <label className="pl-import-paste">
              <span className="rec-field-label">Or paste the rows</span>
              <textarea rows={5} value={text} disabled={busy} placeholder={"Name,Mobile,Email\nAna Ruiz,(646) 555-0101,ana@example.com"} onChange={(e) => setText(e.target.value)} data-testid="import-paste" />
              <button type="button" className="btn btn-sm" disabled={busy || !text.trim()} onClick={() => read(text)} data-testid="import-read">Read the rows</button>
            </label>
          </>
        )}
        {plan && !result && (
          <div className="pl-import-preview" data-testid="import-preview">
            <p className="pl-import-counts" data-testid="import-counts">{plImportCountWords(plan.counts)}</p>
            <p className="cl-prof-aut-hint">
              {plan.header ? `Columns: name ${plan.columns.name === null ? "not found" : `"${plan.headers[plan.columns.name]}"`}, mobile ${plan.columns.phone === null ? "not found" : `"${plan.headers[plan.columns.phone]}"`}, email ${plan.columns.email === null ? "not found" : `"${plan.headers[plan.columns.email]}"`}.` : "No header row: the columns were told apart by what is in them."}
              {plan.counts.unreadable ? ` ${plan.counts.unreadable} ${plan.counts.unreadable === 1 ? "row has" : "rows have"} neither a number nor an address and will be skipped.` : ""}
            </p>
            <table className="cl-table pl-import-table">
              <thead><tr><th>Name</th><th>Mobile</th><th>Email</th></tr></thead>
              <tbody>
                {readable.slice(0, 5).map((p) => (
                  <tr key={p.line}><td>{p.name || <span className="cl-prof-aut-hint">—</span>}</td><td className="tabular">{p.phone || "—"}</td><td>{p.email || "—"}</td></tr>
                ))}
              </tbody>
            </table>
            {readable.length > 5 && <p className="cl-prof-aut-hint">and {readable.length - 5} more</p>}
          </div>
        )}
        {error && <p className="bc-excl-hint danger" role="alert" data-testid="import-error">{error}</p>}
        {result && (
          <div className="pl-import-summary" data-testid="import-summary">
            <p><b>{result.added}</b> new · <b>{result.existed}</b> already here · <b>{result.emails_set}</b> {result.emails_set === 1 ? "email" : "emails"} added · <b>{result.skipped.length}</b> skipped{result.failed.length ? <> · <b>{result.failed.length}</b> could not be added</> : null}</p>
            {result.skipped.length > 0 && (
              <ul className="pl-import-skipped">
                {result.skipped.slice(0, 8).map((s) => <li key={s.line}>Line {s.line}: {s.reason}</li>)}
                {result.skipped.length > 8 && <li>and {result.skipped.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    </window.RecordSheet>
  );
};

Object.assign(window, { PeopleImportSheet, plImportPlan, plImportCountWords });
```

Styles, appended to `apps/dashboard/src/legacy/styles/components.css` in the People block (find `.cl-bulk-naming`), and bump `components.css?v=` in `Chanlytics.html` by one:

```css
/* Import people: the sheet's body -- a file, or pasted rows; the counts before anything is written; five rows as a taste. */
.pl-import { display: flex; flex-direction: column; gap: 14px; }
.pl-import-file, .pl-import-paste { display: flex; flex-direction: column; gap: 6px; }
.pl-import-paste textarea { font: inherit; font-size: var(--text-sm); padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--bg-raised); color: var(--ink); resize: vertical; }
.pl-import-paste .btn { align-self: flex-start; }
.pl-import-counts { margin: 0; font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--ink); }
.pl-import-table td, .pl-import-table th { padding: 6px 10px; font-size: var(--text-xs); }
.pl-import-summary p { margin: 0; font-size: var(--text-sm); }
.pl-import-skipped { margin: 8px 0 0; padding-left: 18px; font-size: var(--text-xs); color: var(--ink-dim); }
```

- [x] **Step 4: Wire it into People**

In `clients-a.jsx`, inside `PeopleReal` beside the other `React.useState` hooks (unconditional, above any early return):

```jsx
  // Import people: the owner's sheet, over the page (people-import.jsx). The refresh-map re-reads People after each part.
  const [importOpen, setImportOpen] = React.useState(false);
```

In the phone menu (`const phoneMenu = [ … ]`), after the "Add a person" entry:

```jsx
    ...(canExport && window.__importPeople ? [{ label: "Import people", icon: "download", meta: "CSV", onClick: () => setImportOpen(true) }] : []),
```

In the desk controls, after `<AddPersonButton …/>`:

```jsx
              {canExport && window.__importPeople && window.PeopleImportSheet && (
                <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)} data-testid="import-people"><Icon name="download" size={12} /> Import</button>
              )}
```

Where the page draws its phone sheets (the `AddPersonSheet` mount), beside it:

```jsx
      {importOpen && window.PeopleImportSheet && (
        <window.PeopleImportSheet onClose={() => setImportOpen(false)} onDone={() => {}} flash={plFlash} />
      )}
```

`manifest.ts`, before `import "@/legacy/pages/clients-a.jsx";`:

```ts
import "@/legacy/pages/people-import.jsx";
```

`Chanlytics.html`, before the `clients-a.jsx` script line, and bump `clients-a.jsx?v=62` → `63`:

```html
  <script type="text/babel" src="pages/people-import.jsx?v=1"></script>
```

- [x] **Step 5: Run the tests**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/people-import.test.mjs tooling/scripts/tests/legacy-harness.test.mjs tooling/scripts/tests/consent-door.test.mjs`
Expected: PASS (the harness test holds the two lists equal).

- [x] **Step 6: See it in the app**

Start the dev server from the worktree (`.claude/launch.json` entry `cm-camp-compact-app`, port 3290), open `/w/<workspace-slug>/#/clients`, press *Import*, paste three rows with your own test addresses, read, and import; then check the three people on People and one person's page (the address, "Imported" under where they came from). Take a screenshot at desk width and at 375px. Do not import a real list here.

- [x] **Step 7: Commit**

```bash
git add apps/dashboard/src/legacy/pages/people-import.jsx apps/dashboard/src/legacy/pages/clients-a.jsx apps/dashboard/src/legacy/styles/components.css apps/dashboard/src/legacy-bridge/manifest.ts apps/dashboard/src/legacy/Chanlytics.html tooling/scripts/tests/people-import.test.mjs
git commit -m "People: Import people -- a client list read in the browser, counted, then written in parts of fifty"
```

### Task 6: The paper form's Email line

**Files:**
- Modify: `packages/contracts/src/consent-page.ts:361` (`fields`) and the `office` sentence beside it
- Test: `tooling/scripts/tests/consent-page.test.mjs` (the `consentFormVM` test at ~153)

- [x] **Step 1: Extend the test**

In the `consentFormVM(salon)` test, after `assert.match(form.office, /Sign-up form/ …)`:

```js
  // An email line, for the offers a business will send by email once it can (Part 0 of the campaigns-on-every-channel
  // spec): typed in on the person's page as the signed boxes are recorded. Nothing on it is an input.
  assert.deepEqual(form.fields, ["Name", "Mobile number", "Email"]);
  assert.match(form.office, /type the email on their page/);
```

- [x] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/consent-page.test.mjs`
Expected: FAIL on the `fields` assertion.

- [x] **Step 3: Change the two lines**

```ts
    fields: ["Name", "Mobile number", "Email"],
```
and extend `office` so it ends: `…as “Sign-up form”, type the email on their page, and keep this sheet. Recorded on ______` (keep the existing words before "and keep this sheet").

- [x] **Step 4: Build, run, look**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/consent-page.test.mjs`
Expected: PASS. Open `/yes/<workspace-slug>/form` on the dev server: three ruled lines, the page still one sheet in print preview.

- [x] **Step 5: Commit**

```bash
git add packages/contracts/src/consent-page.ts packages/*/dist tooling/scripts/tests/consent-page.test.mjs
git commit -m "The paper sign-up form takes an email, typed in on the person's page"
```

### Task 7: The whole suite, the spec's status, the PR

- [x] **Step 1: Everything green**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test && node tooling/scripts/gen-route-types.mjs --check && git status --short`
Expected: all pass; `git status` shows nothing unstaged but the files you are about to commit (no dist drift; never `apps/dashboard/tsconfig.json`).

- [x] **Step 2: Spec status**

In `docs/superpowers/specs/2026-09-24-campaigns-on-every-channel-design.md`, Part 0 item 1: prefix with `**Shipped (PR 1).**`. Commit: `git commit -am "Spec: Part 0's import shipped"`.

- [x] **Step 3: Open the PR**

Push `design/campaign-channels`; `gh pr create` titled "Capture emails 1 of 2: People imports a client list, and the paper form takes an email" with a body that says: what changes for a customer (Import people on People for the owner, "Imported" as where they came from, the form's third line); before merging: **push migration 00169 to production before merging** (dry run first, then read back: `import_person` exists, `decisions_verb_check` includes `import`, `people_list` maps `import`); either deploy order works otherwise. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Wait for CI green, squash-merge, delete the branch. Then verify on production: `/api/version` carries the merge SHA, and People shows *Import* for the owner.

---

## PR 2 — Addresses customers give

Branch: `design/campaign-channels-0b` from `origin/main` after PR 1 merges. Migration number: the next free one after PR 1's 00169 and whatever landed meanwhile (`00170` if nothing else did); where this plan says 00169 for PR 2, read that number.

### Task 8: The receptionist asks for an email when it sends the booking link

**Files:**
- Modify: `packages/contracts/src/config.ts` (`BookingRulesSchema` ~453-469; the booking-rules prompt block ~1335-1353), `packages/contracts/src/business-tab.ts` (`BookingRulesWordsInput` ~614, `bookingRulesWords` ~642), `apps/dashboard/src/legacy/pages/business-tab-folds.jsx` (~184, ~235-241, ~356-362), `apps/dashboard/src/legacy/pages/business-tab-offer.jsx` (`BtwRules` ~165-195), `apps/dashboard/src/legacy/Chanlytics.html` (bump both files' `?v=`)
- Tests: `tooling/scripts/tests/availability.test.mjs` (~215-224), `tooling/scripts/tests/business-tab-bridge.test.mjs` (~250-262)

- [x] **Step 1: Extend the two tests**

In `availability.test.mjs`, next to the assertions at ~222-223 (they read a composed prompt `text` from a profile with `booking_rules`), add a composition of the same profile with `booking_rules: { …, ask_email: true }` and assert:

```js
  assert.ok(
    textAsking.includes(
      "- When you send the booking link and no email address is on file for them, ask once for the best email for their booking confirmation, then move on. Never insist; thank them if they give one.",
    ),
  );
  assert.ok(!text.includes("ask once for the best email"), "off by default: the switch adds the line, nothing else does");
```

In `business-tab-bridge.test.mjs`, beside the `bookingRulesWords(STORED.profile.booking_rules)` parity assertion, add:

```js
  assert.match(bookingRulesWords({ lead_hours: 2, ask_email: true }).line, /asks for an email when sending the booking link/);
  assert.equal(bookingRulesWords({ ask_email: false }).line, null);
```
(`line` is the VM's joined sentence field — use the name `BookingRulesWordsVM` gives it.)

- [x] **Step 2: Run them to see them fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/availability.test.mjs tooling/scripts/tests/business-tab-bridge.test.mjs`
Expected: FAIL (the schema is strict: `ask_email` is refused; the words lack the part).

- [x] **Step 3: Schema, prompt, words**

`config.ts`, in `BookingRulesSchema` after `party_max`:

```ts
    /** Ask, once, for an email when sending the booking link -- for the confirmation, and for the campaigns that follow. Absent = no. */
    ask_email: z.boolean().optional(),
```

In the prompt block, widen the condition and add the line:

```ts
  if (br && (br.lead_hours !== undefined || br.consult_first?.length || br.party_max || br.notes?.length || br.ask_email)) {
    …
    if (br.ask_email)
      lines.push(
        "When you send the booking link and no email address is on file for them, ask once for the best email for their booking confirmation, then move on. Never insist; thank them if they give one.",
      );
    for (const n of br.notes ?? []) lines.push(n);
```

`business-tab.ts`: `BookingRulesWordsInput` gains `ask_email?: boolean | null;`; in `bookingRulesWords`, after the `party_max` part:

```ts
  if (r.ask_email) parts.push("asks for an email when sending the booking link");
```

- [x] **Step 4: The fold**

`business-tab-folds.jsx`: at ~184 add `"brain.profile.booking_rules.ask_email"` to the `booking_rules` key list; in the `booking_rules` read (~235) add `draft.ask_email = !!rules.ask_email;`; in the write (~356) after the notes: `btPut(rules, "ask_email", d.ask_email ? true : undefined);`.

`business-tab-offer.jsx`, in `BtwRules` between the grid and the notes field:

```jsx
      <window.RecordSwitch
        on={!!draft.ask_email}
        onChange={() => update((d) => ({ ...d, ask_email: !d.ask_email }), ["ask_email"])}
        label="Ask for an email when sending the booking link"
        readOnly={readOnly}
        testid="rec-rule-ask-email"
      />
```

Bump `business-tab-folds.jsx?v=` and `business-tab-offer.jsx?v=` in `Chanlytics.html` by one each.

- [x] **Step 5: Build and run**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/availability.test.mjs tooling/scripts/tests/business-tab-bridge.test.mjs tooling/scripts/tests/business-tab-offer.test.mjs`
Expected: PASS; if a Business tab test pins the fold's key list, add `ask_email` to its pin.

- [x] **Step 6: Commit**

```bash
git add packages/contracts/src/config.ts packages/contracts/src/business-tab.ts packages/*/dist apps/dashboard/src/legacy/pages/business-tab-folds.jsx apps/dashboard/src/legacy/pages/business-tab-offer.jsx apps/dashboard/src/legacy/Chanlytics.html tooling/scripts/tests/availability.test.mjs tooling/scripts/tests/business-tab-bridge.test.mjs
git commit -m "Booking rules: a switch asks for an email when the booking link goes out, once, never insisting"
```

### Task 9: The receptionist knows whether an address is on file

**Files:**
- Modify: `packages/db/src/repositories/thread.ts` (`LeadContext` ~187, `EMPTY_LEAD` ~229, the two contact selects ~265 and ~284, the contact type, `describeLead` ~433)
- Test: `tooling/scripts/tests/lead-context.test.mjs`

- [x] **Step 1: Extend the test**

```js
test("the description says whether an email address is on file, so the receptionist never asks for one it has", () => {
  const base = { contactId: "k1", conversationId: "c1", name: "Ana", returning: false, lastSeenAt: null, history: [], optedOut: false };
  assert.match(describeLead({ ...base, hasEmail: true }), /Their email address is on file\./);
  assert.match(describeLead({ ...base, hasEmail: false }), /No email address on file\./);
  assert.doesNotMatch(describeLead(base), /email address/, "a reader that never learned it says nothing");
});
```

And in the `readLeadContext` test that runs over `fakeDb`, assert the contact select names `email`: `assert.ok(db.seen.some((s) => s.table === "contacts" && String(s.select).includes("email")))` (use the shape `fakeDb.seen` records selects in; see `_fake-db.mjs`).

- [x] **Step 2: Run to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-context.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement**

In `LeadContext` after `optedOut`:

```ts
  /** Whether an email address is on file for them: the receptionist asks for one only when there is none. Undefined for a reader that never learned it. */
  hasEmail?: boolean;
```

Both contact selects gain `email` (`"id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email, tenants(sells_by)"` and the older one likewise); the local contact type gains `email: string | null;`; where the `LeadContext` is assembled from `contact`, add `hasEmail: !!contact.email`. In `describeLead`, after the name bit:

```ts
  if (lead.hasEmail === true) bits.push("Their email address is on file.");
  else if (lead.hasEmail === false) bits.push("No email address on file.");
```

- [x] **Step 4: Build db, run**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-context.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db/src/repositories/thread.ts packages/*/dist tooling/scripts/tests/lead-context.test.mjs
git commit -m "The receptionist is told whether an email address is on file"
```

### Task 10: An address in a customer's own words (contracts)

**Files:**
- Modify: `packages/contracts/src/email-address.ts` (append)
- Test: `tooling/scripts/tests/email-address.test.mjs` (create if none exists; else append)

- [x] **Step 1: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressInMessage } from "@chanlytics/contracts";

test("a message that is an address, or a few words with one address in them, gives the address in its stored spelling", () => {
  assert.equal(addressInMessage("Ana.Ruiz@Example.com"), "ana.ruiz@example.com");
  assert.equal(addressInMessage("  ana@example.com. "), "ana@example.com");
  assert.equal(addressInMessage("it's ana@example.com"), "ana@example.com");
  assert.equal(addressInMessage("my email is <ana@example.com>"), "ana@example.com");
  assert.equal(addressInMessage("mi correo es ana@example.com"), "ana@example.com");
});

test("a sentence about someone else's address, two addresses, a long message or a malformed address give nothing", () => {
  assert.equal(addressInMessage("send it to my husband at bob@example.com please, he handles the bookings"), null);
  assert.equal(addressInMessage("ana@example.com or bob@example.com"), null);
  assert.equal(addressInMessage("ana@example"), null);
  assert.equal(addressInMessage(`${"x".repeat(150)} ana@example.com`), null);
  assert.equal(addressInMessage("hello, no address here"), null);
  assert.equal(addressInMessage(null), null);
});
```

- [x] **Step 2: Run to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/email-address.test.mjs`
Expected: FAIL — `addressInMessage` is not exported.

- [x] **Step 3: Implement**

Append to `email-address.ts`:

```ts
/** The words a person uses to hand over their own address, in the two languages the receptionist answers in. */
const OWN_ADDRESS_WORDS = /\b(my|mine|it'?s|is|email|e-mail|mail|correo|mi|es)\b/i;

/**
 * The address a customer gives in their own words: a message that is an address and nothing else, or a short one (up
 * to eight words) with exactly one address and a word that makes it theirs ("my email is …", "it's …", "mi correo
 * es …"). Two addresses, a long message, or one address in a sentence about someone else give nothing: the
 * receptionist asks again rather than keeps a guess. The address comes back in its stored spelling.
 */
export function addressInMessage(body: string | null | undefined): string | null {
  const s = String(body ?? "").trim();
  if (!s || s.length > 160) return null;
  const tokens = s.split(/\s+/);
  const found = new Set<string>();
  for (const raw of tokens) {
    const t = raw.replace(/^[("'<[]+|[)"'>\].,;:!?]+$/g, "");
    if (!t.includes("@")) continue;
    const e = normalizeEmail(t);
    if (!e) return null;
    found.add(e);
  }
  if (found.size !== 1) return null;
  const alone = tokens.length === 1;
  const theirs = tokens.length <= 8 && OWN_ADDRESS_WORDS.test(s);
  return alone || theirs ? [...found][0] : null;
}
```

- [x] **Step 4: Build and run**

Run: `corepack pnpm --filter "./packages/*" build && node --conditions=react-server --import tsx --test tooling/scripts/tests/email-address.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/contracts/src/email-address.ts packages/*/dist tooling/scripts/tests/email-address.test.mjs
git commit -m "addressInMessage: the address a customer gives in their own words, and nothing that is a guess"
```

### Task 11: `set_person_email` takes the edge's call

**Files:**
- Create: `supabase/migrations/00169_an_address_a_customer_gives.sql`
- Test: `tooling/scripts/tests/person-email.db.test.mjs` (a new case)

- [x] **Step 1: The failing database test**

Append to `person-email.db.test.mjs`:

```js
test("set_person_email: with no session (the edge, holding the service key) the address a customer gave is kept, and the event says it came from their message", { skip }, async () => {
  const { id } = await person({ phone_e164: "+16465550301" });
  const { data, error } = await db.rpc("set_person_email", { p_contact_id: id, p_email: "Given@Example.com" });
  assert.equal(error, null, error?.message);
  assert.equal(data.email, "given@example.com");
  const { data: ev } = await db.from("events").select("data").eq("subject_id", id).eq("kind", "contact.email_set").order("created_at", { ascending: false }).limit(1).single();
  assert.equal(ev.data.by, null);
  assert.equal(ev.data.source, "customer_message");
  assert.equal(JSON.stringify(ev.data).includes("example.com"), false, "never the address itself");
});
```

- [x] **Step 2: Run to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/person-email.db.test.mjs`
Expected: FAIL with "Sign in required." (or skipped without a stack).

- [x] **Step 3: The migration**

```sql
-- An address a customer gives in their own message is kept by the edge, which
-- holds the service key and no session: set_person_email (00125) takes that
-- call, as set_marketing_consent does (00142), and its event says the address
-- came from the customer's message. A signed-in caller still has to act where
-- the person lives. Never the address in the event.
create or replace function public.set_person_email(p_contact_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_email  text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_email is not null and (
       char_length(v_email) not between 3 and 254
       or v_email !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$') then
    raise exception 'That is not an email address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  -- No session is the edge recording what a customer wrote; a session must be a member here.
  if v_tenant is null or (v_user is not null and not public.is_acting_member(v_tenant)) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  begin
    update contacts set email = v_email, updated_at = now() where id = p_contact_id;
  exception when unique_violation then
    raise exception 'Another person here already has that address.' using errcode = '23505';
  end;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.email_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_email is not null, 'by', v_user,
                             'source', case when v_user is null then 'customer_message' else 'member' end));
  return jsonb_build_object('contact_id', p_contact_id, 'email', v_email);
end $$;

revoke execute on function public.set_person_email(uuid, text) from public, anon;
grant execute on function public.set_person_email(uuid, text) to authenticated;
```

- [x] **Step 4: Run**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/person-email.db.test.mjs`
Expected: PASS (or skipped). The existing cases (a member, a stranger refused) still pass: a stranger has a session and is not a member.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/00169_an_address_a_customer_gives.sql tooling/scripts/tests/person-email.db.test.mjs
git commit -m "set_person_email takes the edge's call: an address a customer gave, its event naming their message"
```

### Task 12: The inbound path keeps the address

**Files:**
- Modify: `packages/core/src/inbound/ports.ts` (`InboundSink` ~157), `packages/core/src/inbound/answer.ts` (after `const sink = ports.persist.sink(…)` ~215), `apps/edge/lib/whatsapp/persist.ts` (`pgSink` ~200-290)
- Tests: `tooling/scripts/tests/sms-door.test.mjs` (the fake sink at ~338, a new case after the approved-line case ~654), `tooling/scripts/tests/whatsapp-door.test.mjs` and `tooling/scripts/tests/inbound-executed.test.mjs` (their fake sinks gain the method)

- [x] **Step 1: Extend the SMS door test**

In `receptionist()`'s `seen`, add `emails: [],`; in its sink, after `unreachableSender: async () => {},` add:

```js
        noteEmail: async (address) => {
          seen.emails.push(address);
        },
```

Do the same in the fake sinks of `whatsapp-door.test.mjs` and `inbound-executed.test.mjs` (search `unreachableSender: async`). Then, after the approved-line test, add:

```js
test("a text that is an address and nothing else is kept on the person before anything is answered; two addresses, or someone else's, are not", async () => {
  const w = world();
  w.open();
  const seen = receptionist();
  const from = w.customer();
  await listening(async () => {
    assert.deepEqual(await heard(await text(w.form(from, { Body: "Ana.Ruiz@Example.com" }), w.TOKEN)), twiml(200));
    assert.deepEqual(seen.emails, ["ana.ruiz@example.com"], "kept in its stored spelling");
    assert.deepEqual(await heard(await text(w.form(from, { Body: "ana@example.com or bob@example.com" }), w.TOKEN)), twiml(200));
    assert.deepEqual(seen.emails, ["ana.ruiz@example.com"], "two addresses: nothing kept");
  });
});
```

- [x] **Step 2: Run to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/sms-door.test.mjs`
Expected: the new case FAILS (`seen.emails` is empty).

- [x] **Step 3: The port, the core, the edge**

`ports.ts`, in `InboundSink` after `unreachableSender`:

```ts
  /** An address the customer gave in their own words: kept only where none is on file; a taken address is said, never moved. */
  noteEmail(address: string): Promise<unknown>;
```

`answer.ts`: import `addressInMessage` from `@chanlytics/contracts`; right after `const sink = ports.persist.sink(db, tenantId, ing, rt, channel, wires);`:

```ts
  // An address a customer gives in their own words is kept, the way YES OFFERS is read from their words: the message
  // that is an address and nothing else, or a few words with one address that is theirs (contracts addressInMessage).
  // Only where none is on file; the sink says nothing when it is taken (Part 0 of the campaigns-on-every-channel spec).
  if (ing && n.type === "text") {
    const given = addressInMessage(n.body);
    if (given) await sink.noteEmail(given);
  }
```

`persist.ts`, in `pgSink` after `unreachableSender`:

```ts
    noteEmail: (address: string) =>
      on
        ? pgSafe("note_email", async () => {
            const { data } = await db!.from("contacts").select("email").eq("id", ing!.contact_id).maybeSingle();
            if (data?.email) return;
            const { error } = await db!.rpc("set_person_email", { p_contact_id: ing!.contact_id, p_email: address });
            // Another person here holds the address: theirs stays theirs, and the owner merges them if they are one.
            if (error && error.code === "23505") {
              logger().info("inbound_email_taken", { tenant_id: tenantId, contact: ing!.contact_id });
              return;
            }
            if (error) throw new Error(error.message);
          })
        : Promise.resolve(),
```

- [x] **Step 4: Build and run the door tests**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && node --conditions=react-server --import tsx --test tooling/scripts/tests/sms-door.test.mjs tooling/scripts/tests/whatsapp-door.test.mjs tooling/scripts/tests/inbound-executed.test.mjs tooling/scripts/tests/whatsapp-steps.test.mjs`
Expected: PASS (whatsapp-steps pins the file's source in places; if its pin around the sink creation moved, update the pinned snippet, not the code).

- [x] **Step 5: Commit**

```bash
git add packages/core/src/inbound/ports.ts packages/core/src/inbound/answer.ts packages/*/dist apps/edge/lib/whatsapp/persist.ts tooling/scripts/tests/sms-door.test.mjs tooling/scripts/tests/whatsapp-door.test.mjs tooling/scripts/tests/inbound-executed.test.mjs
git commit -m "An address a customer writes back is kept on their page, where none is on file"
```

### Task 13: The calendar fills an empty address

**Files:**
- Modify: `packages/contracts/src/calendar-people.ts` (`CalendarPerson` ~568, `peopleFromItems` ~584-620), `apps/edge/lib/calendar/calendar-people.ts` (`addPeopleFromCalendar`), `apps/dashboard/src/server/calendar.ts` (`addPeopleSeen` ~262-300)
- Tests: `tooling/scripts/tests/calendar-people.test.mjs`, `tooling/scripts/tests/calendar-counts.test.mjs`

- [x] **Step 1: Extend the tests**

`calendar-people.test.mjs`, beside the `peopleFromItems` cases:

```js
test("an appointment with one number and one address carries the address to the person; two addresses, or none, carry nothing", () => {
  const at = Date.parse("2026-09-25T15:00:00Z");
  const one = { uid: "u1", title: "Gel manicure — Ana 646-555-0101 ana@example.com", description: "", location: "", attendees: [], organizer: null, start: at, end: at + 3_600_000, allDay: false };
  const two = { ...one, uid: "u2", description: "cc bob@example.com" };
  const [a] = peopleFromItems([one], ["Gel manicure"], at - 86_400_000);
  assert.equal(a.email, "ana@example.com");
  const [b] = peopleFromItems([two], ["Gel manicure"], at - 86_400_000);
  assert.equal(b.email, null, "two addresses: whose is it?");
});
```

`calendar-counts.test.mjs`, where `addPeopleFromCalendar` runs over `fakeDb` (add a case in its style):

```js
test("the sweep fills an empty address from the appointment, never overwrites one, and makes a new person with theirs", async () => {
  const T = "tttttttt-tttt-4ttt-8ttt-tttttttttttt";
  const db = fakeDb({
    contacts: [
      { id: "k1", tenant_id: T, phone_e164: "+16465550101", display_name: "Ana", email: null, erased_at: null, merged_into_contact_id: null },
      { id: "k2", tenant_id: T, phone_e164: "+16465550102", display_name: "Dee", email: "dee@kept.example", erased_at: null, merged_into_contact_id: null },
    ],
  });
  const r = await addPeopleFromCalendar(db, T, [
    { phone: "+16465550101", name: "Ana", title: "Cut", uid: "u1", start: 1, email: "ana@example.com" },
    { phone: "+16465550102", name: "Dee", title: "Cut", uid: "u2", start: 1, email: "other@example.com" },
    { phone: "+16465550103", name: "Eli", title: "Cut", uid: "u3", start: 1, email: "eli@example.com" },
  ]);
  assert.equal(r.emailed, 1);
  assert.equal(r.added, 1);
  const updates = db.seen.filter((s) => s.op === "update" && s.table === "contacts");
  assert.deepEqual(updates.map((u) => u.values.email), ["ana@example.com"], "Dee's address stays hers");
  const insert = db.seen.find((s) => s.op === "insert" && s.table === "contacts");
  assert.equal(insert.values.email, "eli@example.com");
});
```
(Read `_fake-db.mjs` for the exact shape `seen` records an update's values in, and adjust the two property names.)

- [x] **Step 2: Run to see them fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/calendar-people.test.mjs tooling/scripts/tests/calendar-counts.test.mjs`
Expected: FAIL (`email` undefined; `emailed` undefined).

- [x] **Step 3: Contracts**

`CalendarPerson` gains:

```ts
  /** The one address the appointment carried beside the one number, else null: two addresses are nobody's. */
  email: string | null;
```

In `peopleFromItems`, where `extractContacts(it, NO_OWN_ADDRESSES).phones` is read, keep the whole answer and set the row's email:

```ts
    const found = extractContacts(it, NO_OWN_ADDRESSES);
    const phones = found.phones;
    if (!phones.length) continue;
    const email = phones.length === 1 && found.emails.length === 1 ? found.emails[0] : null;
    const name = guessName(it, services);
    for (const phone of phones) {
      const row: CalendarPerson = { phone, name, title: it.title || "Busy", uid: it.uid, start: it.start, email };
```
Where `better()` picks one row per phone, keep the chosen row's email, else the other's: after the pick, `byPhone.set(phone, { ...chosen, email: chosen.email ?? have.email })`.

- [x] **Step 4: The edge sweep**

In `addPeopleFromCalendar`: `AddedFromCalendar` gains `emailed: number` (init 0); the existing-contacts select gains `email`; in the `have` branch, after the name fill:

```ts
      if (!have.email && r.email) {
        const { error: eErr } = await db
          .from("contacts")
          .update({ email: r.email })
          .eq("id", have.id)
          .is("email", null);
        // Another person here holds the address: theirs stays theirs.
        if (!eErr) out.emailed += 1;
        else if (eErr.code !== "23505") throw new Error(`calendar_people_email: ${eErr.message}`);
      }
```
In the insert, add `email: r.email` to the row; on a `23505` insert error, insert again without the address (`{ tenant_id, phone_e164, display_name }`) before counting `added`. In `apps/edge/api/cron/calendar.ts`, add `out.emailed += r.emailed;` beside the other counts and include `emailed` in the `calendar_people_added` log condition (`r.added || r.named || r.emailed`).

- [x] **Step 5: The dashboard's read**

In `addPeopleSeen`, after a successful `create_person` and before `added.push(…)`:

```ts
    // The appointment's one address, for a person just made from its number: the door refuses a taken or malformed
    // address (23505, 22023) and the person keeps none; never fatal to the board.
    if (r.email && !out.existed) {
      const { error: eErr } = await ctx.supabase.rpc("set_person_email", { p_contact_id: out.contact_id, p_email: r.email });
      if (eErr && eErr.code !== "23505" && eErr.code !== "22023")
        console.error("calendar_person_email_failed", JSON.stringify({ tenant: tenantId, code: eErr.code }));
    }
    added.push({ id: out.contact_id, name: r.name ?? "", phone: r.phone, email: r.email ?? null });
```

- [x] **Step 6: Build, typecheck, run**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && node --conditions=react-server --import tsx --test tooling/scripts/tests/calendar-people.test.mjs tooling/scripts/tests/calendar-counts.test.mjs`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add packages/contracts/src/calendar-people.ts packages/*/dist apps/edge/lib/calendar/calendar-people.ts apps/edge/api/cron/calendar.ts apps/dashboard/src/server/calendar.ts tooling/scripts/tests/calendar-people.test.mjs tooling/scripts/tests/calendar-counts.test.mjs
git commit -m "An appointment's one address fills an empty one on the person it names"
```

### Task 14: The address a caller gives, as a suggestion

**Files:**
- Modify: `packages/channels/src/voice-shell.ts` (`CALL_ANALYSIS_FIELDS` ~336-368), `apps/dashboard/src/server/dto.ts` (the calls select ~22, `CallDto`'s fields ~84, the mapping ~232), `packages/contracts/src/viewmodels.ts` (`CallDto` ~1153, the bullets ~1336)
- Test: `tooling/scripts/tests/call-outcomes.test.mjs`

- [x] **Step 1: Extend the test**

Beside the case that asserts `Gave their name as`:

```js
  assert.ok(bullets({ caller_email: "Ana@Example.com" }).includes("Gave their email as ana@example.com"), "the address in its stored spelling, a suggestion for the person's page");
  assert.ok(!bullets({ caller_email: "not an address" }).some((b) => b.startsWith("Gave their email")), "a spelled address that is not one is not offered");
```
(`bullets(over)` is however that test draws a call VM from a DTO; use its helper.)

- [x] **Step 2: Run to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/call-outcomes.test.mjs`
Expected: FAIL.

- [x] **Step 3: Implement**

`voice-shell.ts`, in `CALL_ANALYSIS_FIELDS` after the `caller_name` field:

```ts
  {
    type: "string",
    name: "caller_email",
    description: "The email address the caller gave, exactly as they spelled it out. Leave empty if they did not give one.",
    examples: ["ana.ruiz@example.com"],
  },
```

`dto.ts`: add `analysis` to the calls select string; `CallDto` (the server's) gains `caller_email?: string | null;`; in the mapping beside `caller_name: c.caller_name ?? null,`:

```ts
    // The address the caller spelled out, from the post-call analysis (voice-shell CALL_ANALYSIS_FIELDS): a suggestion, never applied by itself.
    caller_email: normalizeEmail((c.analysis as { caller_email?: unknown } | null)?.caller_email as string | undefined) ?? null,
```
(import `normalizeEmail` from `@chanlytics/contracts`.)

`viewmodels.ts`: `CallDto` gains `caller_email?: string | null;`; after the `caller_name` bullet:

```ts
  if (dto.caller_email) bullets.push(`Gave their email as ${dto.caller_email}`);
```

- [x] **Step 4: Build, typecheck, run**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && node --conditions=react-server --import tsx --test tooling/scripts/tests/call-outcomes.test.mjs tooling/scripts/tests/voice-provision.test.mjs`
Expected: PASS (the provision plan carries the new field; a test that pins the field list gains `caller_email`).

- [x] **Step 5: Commit**

```bash
git add packages/channels/src/voice-shell.ts packages/*/dist apps/dashboard/src/server/dto.ts packages/contracts/src/viewmodels.ts tooling/scripts/tests/call-outcomes.test.mjs
git commit -m "A caller's spelled-out email is a post-call suggestion, beside the name they gave"
```

### Task 15: The whole suite, the spec's status, the PR

- [x] **Step 1: Everything green**

Run: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test && git status --short`
Expected: all pass, no dist drift.

- [ ] **Step 2: See it in the app**

Dev server on the worktree: Settings › Business › Booking rules shows the switch; turn it on and read the receptionist's prompt through the Business tab's preview if it has one, else trust the prompt test. On a person's page, the call summary of a call whose analysis carries `caller_email` shows the bullet (a seeded call in the salon's data may not; the unit test is the proof).

- [x] **Step 3: Spec status**

Prefix Part 0 item 2 in the spec with `**Shipped (PR 2).**` and the "Done when" line with the date. Commit.

- [x] **Step 4: Open the PR**

Branch `design/campaign-channels-0b`; title "Capture emails 2 of 2: the receptionist asks, a written address is kept, the calendar fills one, a caller's is suggested". Body: what changes for a customer; before merging: **push migration 00169 to production before merging** (dry run, read back that `set_person_email` runs with no session on a test row of the nightly workspace and refuses a stranger); after merging: **converge the salon's voice agent** so the new analysis field reaches Retell (`apps/edge/api/admin/voice-provision` plans it; the planner reports the drift until it is applied — Ruben's go, it changes a live agent). Either deploy order works. Wait for CI green, squash-merge, delete the branch, verify on production.

---

## Self-review against the spec (Part 0)

- Import from a spreadsheet: Tasks 1–5 (reader, door with dedupe/fill/erased/never-a-yes, owner route in parts of 50, bridge, sheet with counts before writing, `contact.added {source:'import'}`, one decision per part, "Imported"). The spec says "one `decisions` row per import"; this plan records one per part of fifty under one `import_id` — the ledger reads them as one import; the spec's sentence is corrected in Task 7's status edit.
- Paper form Email line: Task 6.
- The ask switch on the booking link: Task 8; "never asks twice": Task 9.
- An address in the customer's own message, at ingest, through `set_person_email` with a no-session branch, the event kept: Tasks 10–12.
- The calendar fills an empty address: Task 13.
- Voice `caller_email` as a suggestion: Task 14.
- Not in Part 0, and not here: a typed field on `/yes/<slug>`.

Type consistency: `import_person` returns `{ contact_id, existed, email: 'set' | 'kept' | 'taken' | null }` in Task 2, read as such in Task 3 and 5; `__importPeople` takes `{ import_id, rows }` in Tasks 4 and 5 and the route's `Body` in Task 3 is the same shape; `noteEmail(address)` is declared in Task 12's port and implemented in the same task; `CalendarPerson.email` is written in Task 13's contracts and read by both callers in the same task.
