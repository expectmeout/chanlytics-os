# A proposal is a link on the person — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner pastes a proposal's web address on a person's page; the receptionist sends that address when the person asks about price, and the owner sends it in one tap from the page or the thread — never a file, never a figure the receptionist states.

**Architecture:** The booking-link pattern scoped to one person. One column on `contacts` behind a `security definer` door that writes a ledger event without the value (00054/00125's shape); one sentence appended to the per-person block every channel already shares (`describeLead`); the person view model derives the door's words and whether the address has gone out from the messages the page already reads; the page and the thread carry the words into the existing composer (`sessionStorage["chanlytics-compose"]`, a new `inbox:compose` event). Three PRs, in order, with 00154 pushed to production between the first and the second.

**Tech Stack:** Postgres migrations (Supabase, local stack via Docker for `*.db.test.mjs` and `gen:db-types`), zod contracts (`packages/contracts`, dist committed), Next.js route handlers (`apps/dashboard/app/api/v1`), legacy JSX pages on the app's tokens (`apps/dashboard/src/legacy`, `?v=` cache-bust in `Chanlytics.html`), `node:test` (`corepack pnpm test`, `test:db`), Playwright nightly (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-09-22-proposal-link-design.md`. Worktree `cm-proposal`, branch `feat/a-person-may-have-a-proposal` off `1b26296d` (#884).

Run one test file with `node --conditions=react-server --import tsx --test tooling/scripts/tests/<file>.test.mjs` from the worktree root. Database tests need the local stack's env (`supabase status -o env`) as `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `SUPABASE_CLI=<exe>` for the privileges suite and the type generator. Never add a `readCode` assertion; update the two pins that break and no more.

---

## File map

| PR | File | What changes |
|---|---|---|
| 1 | `supabase/migrations/00154_a_person_may_have_a_proposal.sql` | column + CHECK, erase trigger, door `set_person_proposal`, event `contact.proposal_set` |
| 1 | `packages/db/src/database.types.ts` | generated: `contacts.proposal_url`, `set_person_proposal` |
| 1 | `packages/contracts/src/link.ts` (new), `index.ts` | `normalizeLink`, `whyNotALink`, `linkHost` |
| 1 | `packages/contracts/src/enums.ts`, `activity.ts` | the kind and its sentence |
| 1 | `apps/dashboard/app/api/v1/contacts/[id]/details/route.ts` | `proposal` in the body, through the door |
| 1 | `apps/dashboard/src/legacy-bridge/people-detail.ts`, `seed-globals.ts` | `DetailsBody.proposal`, `window.__whyNotALink` |
| 1 | `tooling/scripts/tests/link.test.mjs` (new), `person-proposal.db.test.mjs` (new), `people-routes.test.mjs`, `calendar-people.test.mjs` | tests; one pin updated |
| 1 | `packages/contracts/dist/*` | rebuilt |
| 2 | `packages/db/src/repositories/thread.ts` | `LeadContext.proposalUrl`, the select, the sentence |
| 2 | `packages/contracts/src/people.ts` | `PersonDetailDto.proposal_url`, `PersonProposalVM`, `proposalAction`, `proposalMessage`, the About row, the sent derivation |
| 2 | `apps/dashboard/app/api/v1/contacts/[id]/route.ts` | selects `proposal_url` beside `notes` |
| 2 | `apps/dashboard/src/legacy-bridge/seed-globals.ts` | `window.__proposalMessage` |
| 2 | `apps/dashboard/src/legacy/pages/client-profile.jsx`, `Chanlytics.html` (`client-profile.jsx?v=22`), `legacy/CLAUDE.md` | `PersonProposal`, the About row, the Right now button; one bullet |
| 2 | `tooling/scripts/tests/lead-context.test.mjs`, `people-vm.test.mjs`, `person-honest.test.mjs`, `calendar-people.test.mjs` | tests; one pin updated |
| 2 | `e2e/people-consent.spec.ts`, `tooling/scripts/e2e-workspace.mjs` | the nightly walk; the seed resets the column |
| 2 | `packages/contracts/dist/*`, `packages/db/dist/*` | rebuilt |
| 3 | `apps/dashboard/src/server/dto.ts`, `packages/contracts/src/viewmodels.ts` | `proposal_url` on the thread's contact; `InboxThreadVM.proposalUrl` |
| 3 | `apps/dashboard/src/legacy/pages/inbox-thread.jsx`, `Chanlytics.html` (`inbox-thread.jsx?v=36`) | the Actions item; the composer's `inbox:compose` listener |
| 3 | `apps/dashboard/src/server/ask/tools.ts` | `getPerson` reads `proposal_url` |
| 3 | `packages/channels/src/email.ts`, `tooling/scripts/tests/email-wire.test.mjs` | `emailHtml` links addresses |
| 3 | `packages/contracts/dist/*`, `packages/channels/dist/*` | rebuilt |

---

## PR 1 — a person may have a proposal link

### Task 1: The migration

**Files:**
- Create: `supabase/migrations/00154_a_person_may_have_a_proposal.sql`
- Test: `tooling/scripts/tests/person-proposal.db.test.mjs` (Task 2)

- [ ] **Step 1: Write the migration**

```sql
-- 00154 · A person may have a proposal.
--
-- A business that talks its way to a booked time also talks its way to a
-- priced piece of work: a move, a package, a project. The owner writes that
-- up somewhere else -- a document, a quote tool -- and what the customer
-- needs from the receptionist is the way to it. So a proposal is a LINK on
-- the person, the way booking is a link on the workspace (00012): nothing is
-- uploaded, nothing is stored but the address, and the receptionist sends the
-- address in its own words and states none of the figures behind it (the
-- no-prices rule, contracts policy.ts, is untouched).
--
-- One column, beside the notes (00054) and the address (00125): a second home
-- for one fact is how two homes drift. The CHECK holds the STORED shape only
-- -- trimmed, a web address, no whitespace, at most 500 characters, the
-- workspace's booking link's own cap (config.ts). What is and is not a link is
-- decided once, in packages/contracts/src/link.ts (normalizeLink), and every
-- writer goes through it; the constraint is what stops a writer that did not.

alter table public.contacts
  add column if not exists proposal_url text;

alter table public.contacts drop constraint if exists contacts_proposal_url_check;
alter table public.contacts add constraint contacts_proposal_url_check
  check (proposal_url is null or (
    proposal_url = btrim(proposal_url)
    and char_length(proposal_url) between 10 and 500
    and proposal_url ~ '^https?://[^[:space:]]+$'
  ));

comment on column public.contacts.proposal_url is
  'The owner''s proposal for this person, as a web address (normalizeLink stores it). The receptionist sends the address when they ask about price or the proposal, and states none of its figures. Never a file.';

-- An erased row holds no proposal: a trigger in 00125's shape, so whatever
-- path erases a row takes the address with it, and the one function the right
-- to be forgotten runs through is not recreated to add a column.
create or replace function public.contact_proposal_on_erase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    new.proposal_url := null;
  end if;
  return new;
end $$;

drop trigger if exists contacts_erase_clears_proposal on public.contacts;
create trigger contacts_erase_clears_proposal
  before update of erased_at on public.contacts
  for each row execute function public.contact_proposal_on_erase();

-- The door. Owner or operator, like the name, the notes and the address. An
-- empty address clears it. The event says THAT a proposal was set or cleared
-- and by whom, never the address: events outlive an erasure (00027), and an
-- address can name a person.
create or replace function public.set_person_proposal(p_contact_id uuid, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_tenant uuid;
  v_url    text := nullif(btrim(coalesce(p_url, '')), '');
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  if v_url is not null and (
       char_length(v_url) not between 10 and 500
       or v_url !~ '^https?://[^[:space:]]+$') then
    raise exception 'That is not a web address.' using errcode = '22023';
  end if;
  select c.tenant_id into v_tenant from contacts c where c.id = p_contact_id and c.erased_at is null;
  if v_tenant is null or not public.is_acting_member(v_tenant) then
    raise exception 'Person not found.' using errcode = 'P0002';
  end if;
  update contacts set proposal_url = v_url, updated_at = now() where id = p_contact_id;
  insert into events (tenant_id, kind, category, subject_type, subject_id, data)
  values (v_tenant, 'contact.proposal_set', 'contact', 'contact', p_contact_id,
          jsonb_build_object('set', v_url is not null, 'by', v_user));
  return jsonb_build_object('contact_id', p_contact_id, 'proposal_url', v_url);
end $$;

revoke execute on function public.set_person_proposal(uuid, text) from public, anon;
grant execute on function public.set_person_proposal(uuid, text) to authenticated;
comment on function public.set_person_proposal(uuid, text) is
  'Owner or operator sets a person''s proposal link; empty clears it. The event records that it changed, never the address.';
```

- [ ] **Step 2: Apply it locally and regenerate the types**

Run: `"$SB" migration up` then `SUPABASE_CLI=<exe> corepack pnpm gen:db-types`
Expected: `packages/db/src/database.types.ts` gains `proposal_url: string | null` in `contacts.Row` (and `?:` in Insert/Update) and `set_person_proposal: { Args: { p_contact_id: string; p_url: string }; Returns: Json }` between `set_person_notes` and `set_template_hidden`. Nothing else moves.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00154_a_person_may_have_a_proposal.sql packages/db/src/database.types.ts
git commit -m "A person may have a proposal link: the column, its door and its event (00154)"
```

### Task 2: The door, proved on Postgres

**Files:**
- Create: `tooling/scripts/tests/person-proposal.db.test.mjs`

- [ ] **Step 1: Write the test** (skipped without a local database, like `person-email.db.test.mjs`)

```js
/**
 * A person may have a proposal -- on a real database.
 *
 * 00154 is a column, a CHECK, a trigger on erasure and a definer door. A
 * constraint, a trigger and a function body are what reading source cannot
 * prove, so these run against Postgres in the database workflow; skipped
 * without a local database.
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
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

let db;
let tenantId;
const person = async (row) => {
  const { data, error } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, ...row })
    .select("id")
    .single();
  return { id: data?.id ?? null, error };
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `person-proposal-${Date.now()}`, name: "Person proposal" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

test("the column holds the stored shape only: a trimmed web address, no whitespace, at most 500 characters", { skip }, async () => {
  const ok = await person({ phone_e164: "+15550100201", proposal_url: "https://docs.example.com/p/42" });
  assert.equal(ok.error, null, ok.error?.message);
  for (const bad of [
    " https://docs.example.com/p/42",
    "docs.example.com/p/42",
    "mailto:ana@example.com",
    "https://docs.example.com/p 42",
    `https://docs.example.com/${"x".repeat(500)}`,
    "https://",
  ]) {
    const r = await person({ phone_e164: "+15550100202", proposal_url: bad });
    assert.match(r.error?.message ?? "", /contacts_proposal_url_check/, `refused: ${JSON.stringify(bad)}`);
  }
});

test("an erased row holds no proposal: whatever sets erased_at, the trigger clears it", { skip }, async () => {
  const { id } = await person({ phone_e164: "+15550100211", proposal_url: "https://docs.example.com/p/gone" });
  const { error } = await db.from("contacts").update({ erased_at: new Date().toISOString() }).eq("id", id);
  assert.equal(error, null, error?.message);
  const { data } = await db.from("contacts").select("proposal_url, erased_at").eq("id", id).single();
  assert.equal(data.proposal_url, null);
  assert.ok(data.erased_at);
});

test(
  "set_person_proposal: an acting member where the person lives, trimmed, a non-address refused in the owner's words, an empty one clears, the event names no address",
  { skip },
  async () => {
    const email = `person-proposal-${Date.now()}@example.test`;
    const { data: made, error: uErr } = await db.auth.admin.createUser({
      email,
      password: "a-long-test-password-1",
      email_confirm: true,
    });
    assert.equal(uErr, null, uErr?.message);
    const userId = made.user.id;
    try {
      const { error: mErr } = await db
        .from("memberships")
        .insert({ tenant_id: tenantId, user_id: userId, role: "operator" });
      assert.equal(mErr, null, mErr?.message);
      const as = createClient(URL_, process.env.SUPABASE_ANON_KEY ?? KEY, { auth: { persistSession: false } });
      const { error: sErr } = await as.auth.signInWithPassword({ email, password: "a-long-test-password-1" });
      assert.equal(sErr, null, sErr?.message);

      const { id } = await person({ display_name: "Dee", phone_e164: "+15550100221" });

      const { data: set, error } = await as.rpc("set_person_proposal", {
        p_contact_id: id,
        p_url: "  https://docs.example.com/p/dee ",
      });
      assert.equal(error, null, error?.message);
      assert.deepEqual(set, { contact_id: id, proposal_url: "https://docs.example.com/p/dee" }, "stored trimmed");

      const { error: shapeless } = await as.rpc("set_person_proposal", { p_contact_id: id, p_url: "docs.example.com/p/dee" });
      assert.match(shapeless?.message ?? "", /not a web address/);

      const { data: cleared } = await as.rpc("set_person_proposal", { p_contact_id: id, p_url: "" });
      assert.deepEqual(cleared, { contact_id: id, proposal_url: null });

      const { data: events } = await db
        .from("events")
        .select("kind, data")
        .eq("tenant_id", tenantId)
        .eq("subject_id", id)
        .eq("kind", "contact.proposal_set")
        .order("created_at");
      assert.deepEqual(events.map((e) => e.data.set), [true, false], "set, then cleared");
      assert.ok(
        events.every((e) => !JSON.stringify(e.data).includes("example.com")),
        "an event outlives an erasure, so it names no address",
      );

      const { data: other } = await db
        .from("tenants")
        .insert({ slug: `person-proposal-far-${Date.now()}`, name: "Far" })
        .select("id")
        .single();
      try {
        const { data: far } = await db
          .from("contacts")
          .insert({ tenant_id: other.id, phone_e164: "+15550100231" })
          .select("id")
          .single();
        const { error: stranger } = await as.rpc("set_person_proposal", {
          p_contact_id: far.id,
          p_url: "https://docs.example.com/p/x",
        });
        assert.match(stranger?.message ?? "", /Person not found/, "a person in a workspace the caller does not act in does not exist");
      } finally {
        await db.from("tenants").delete().eq("id", other.id);
      }
    } finally {
      await db.auth.admin.deleteUser(userId);
    }
  },
);
```

- [ ] **Step 2: Run it against the local stack**

Run: `set -a; . "$SCRATCH/sb.env"; set +a; SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY SUPABASE_ANON_KEY=$ANON_KEY node --conditions=react-server --import tsx --test tooling/scripts/tests/person-proposal.db.test.mjs`
Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/tests/person-proposal.db.test.mjs
git commit -m "The proposal door, proved on Postgres"
```

### Task 3: One derivation of a web address

**Files:**
- Create: `packages/contracts/src/link.ts`
- Modify: `packages/contracts/src/index.ts` (add `export * from "./link";` after `email-address`)
- Create: `tooling/scripts/tests/link.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
/**
 * One derivation of "a web address": the person's page, the details route and the
 * door that stores a proposal link all judge the same way (contracts link.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkHost, normalizeLink, whyNotALink } from "@chanlytics/contracts";

test("normalizeLink keeps a web address as typed, trimmed, and supplies a missing https://", () => {
  assert.equal(normalizeLink("  https://docs.example.com/p/42 "), "https://docs.example.com/p/42");
  assert.equal(normalizeLink("http://docs.example.com/p/42"), "http://docs.example.com/p/42");
  assert.equal(normalizeLink("docs.example.com/p/42?v=2"), "https://docs.example.com/p/42?v=2");
  assert.equal(normalizeLink("Docs.Example.com/P/42"), "https://Docs.Example.com/P/42", "a path is case-sensitive: nothing is lower-cased");
});

test("normalizeLink refuses what is not a page anyone opens", () => {
  for (const bad of ["", "   ", null, undefined, "docs", "https://docs", "mailto:ana@example.com", "javascript:alert(1)", "https://docs.example.com/p 42", `https://docs.example.com/${"x".repeat(500)}`])
    assert.equal(normalizeLink(bad), null, JSON.stringify(bad));
});

test("whyNotALink says which kind of not-an-address it was, in the owner's words, and nothing for an address", () => {
  assert.equal(whyNotALink("https://docs.example.com/p/42"), null);
  assert.equal(whyNotALink(""), "A web address is needed.");
  assert.equal(whyNotALink("https://docs.example.com/p 42"), "Only the address itself, with no spaces in it.");
  assert.equal(whyNotALink("mailto:ana@example.com"), "That needs to be a web address, starting with https://.");
  assert.equal(whyNotALink(`https://docs.example.com/${"x".repeat(500)}`), "That address is too long to store: paste the link itself, not a whole page.");
  assert.equal(whyNotALink("docs"), "That needs a full web address, like docs.example.com/proposal.");
});

test("linkHost is the host without its www., for a row that says where the proposal lives", () => {
  assert.equal(linkHost("https://www.docs.example.com/p/42"), "docs.example.com");
  assert.equal(linkHost("https://Docs.Example.com/P/42"), "docs.example.com");
  assert.equal(linkHost("not a link"), "not a link");
});
```

- [ ] **Step 2: Run it, expect a failure** — `normalizeLink` is not exported.

- [ ] **Step 3: Write `link.ts`**

```ts
/**
 * THE web-address normalizer, beside email-address.ts and phone.ts. One
 * implementation, imported by the person's page (before a round trip), the
 * details route (before the door) and the door's own CHECK is what stops a
 * writer that did not go through it (00154).
 *
 * Returns the address as it will be stored -- trimmed, with its scheme, at
 * most 500 characters (the booking link's own cap) -- or null when the input
 * cannot be one. A missing scheme is supplied: people paste
 * "docs.example.com/p/42" as readily as the full address, and the two are one
 * place. Nothing else is changed: a path is case-sensitive, and the owner
 * pasted what the proposal tool gave them. Anything that is not http or https
 * is refused: a mailto: or a javascript: address is not a page anyone opens,
 * and the page draws what is stored as a link.
 */

const MAX_LINK = 500;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function normalizeLink(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = SCHEME.test(s) ? s : `https://${s}`;
  if (withScheme.length > MAX_LINK) return null;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!HOST.test(u.hostname)) return null;
  return withScheme;
}

/**
 * Which kind of not-an-address it was given, in the product's words; null for
 * an address. The door refuses the same things (00154), and says less.
 */
export function whyNotALink(raw: string | null | undefined): string | null {
  if (normalizeLink(raw)) return null;
  const s = String(raw ?? "").trim();
  if (!s) return "A web address is needed.";
  if (/\s/.test(s)) return "Only the address itself, with no spaces in it.";
  if (SCHEME.test(s) && !/^https?:/i.test(s)) return "That needs to be a web address, starting with https://.";
  if (s.length > MAX_LINK) return "That address is too long to store: paste the link itself, not a whole page.";
  return "That needs a full web address, like docs.example.com/proposal.";
}

/** The host a stored address lives at, without its www., for a row that says where the proposal is; the address itself when it cannot be read. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url;
  }
}
```

- [ ] **Step 4: Run the test, expect 4 passing** (the test imports the package through its dist: run `corepack pnpm --filter ./packages/contracts build` first, or rely on the `@chanlytics/contracts` source condition the test runner uses — check how `people-vm.test.mjs` resolves it; it imports the built dist, so build).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/link.ts packages/contracts/src/index.ts tooling/scripts/tests/link.test.mjs
git commit -m "One derivation of a web address: normalizeLink, whyNotALink, linkHost"
```

### Task 4: The kind and its sentence

**Files:**
- Modify: `packages/contracts/src/enums.ts` — after `"contact.email_set",`
- Modify: `packages/contracts/src/activity.ts` — after the `contact.email_set` sentence

- [ ] **Step 1: Add the kind**

```ts
  "contact.email_set",
  /** A person's proposal link set or cleared at the desk (00154). Never the address. */
  "contact.proposal_set",
```

- [ ] **Step 2: Add the sentence**

```ts
  "contact.email_set": "A person's email address changed",
  "contact.proposal_set": "A person's proposal link changed",
```

- [ ] **Step 3: Run** `node --conditions=react-server --import tsx --test tooling/scripts/tests/event-kinds.test.mjs` — passes because the migration's `insert into events` writes the kind and the enum declares it.

- [ ] **Step 4: Commit** — `git commit -am "The ledger names a changed proposal link"`

### Task 5: The route, the bridge, the global

**Files:**
- Modify: `apps/dashboard/app/api/v1/contacts/[id]/details/route.ts`
- Modify: `apps/dashboard/src/legacy-bridge/people-detail.ts` (`DetailsBody`)
- Modify: `apps/dashboard/src/legacy-bridge/seed-globals.ts` (`__whyNotALink`)
- Modify: `tooling/scripts/tests/people-routes.test.mjs` (new case), `tooling/scripts/tests/calendar-people.test.mjs` (the refine-words pin)

- [ ] **Step 1: Write the failing route test** (append after the email case)

```js
test("details: a proposal link is judged by the one normalizer before the door opens, stored with its scheme, cleared by an empty string", async () => {
  const doors = [];
  const rpcs = {
    set_person_proposal: (a) => {
      doors.push(a);
      return { proposal_url: a.p_url || null };
    },
  };
  const tables = {
    memberships: both("viewer", "operator"),
    contacts: [contact(P1, A), contact(P2, B), contact(P3, B, { erased_at: "2026-09-01T00:00:00Z" })],
  };
  const put = (body, id = P2) => details.PUT.run(send("PUT", body), ctxFor(tables, { id }, rpcs));
  await refused(put({ proposal: "https://docs.example.com/p/1" }, P1), "forbidden", 403);
  await refused(put({ proposal: "https://docs.example.com/p/1" }, P3), "not_found", 404, "erased");
  for (const [typed, words] of [
    ["docs", /full web address/],
    ["mailto:ana@example.com", /starting with https/],
    ["https://docs.example.com/p 1", /no spaces/],
  ]) {
    await assert.rejects(put({ proposal: typed }), (e) => {
      assert.equal(e.code, "validation");
      assert.match(e.message, words);
      return true;
    });
  }
  assert.equal(doors.length, 0, "no door was opened for a refusal");
  const out = await put({ proposal: " docs.example.com/p/1 " });
  assert.deepEqual(out, { contact_id: P2, proposal_url: "https://docs.example.com/p/1" }, "the scheme is supplied, the rest kept");
  assert.deepEqual(doors, [{ p_contact_id: P2, p_url: "https://docs.example.com/p/1" }]);
  const cleared = await put({ proposal: "" });
  assert.deepEqual(cleared, { contact_id: P2, proposal_url: null }, "an empty string clears");
  assert.deepEqual(doors[1], { p_contact_id: P2, p_url: "" });
});
```

- [ ] **Step 2: Run it, expect a failure** — the body refuses `proposal` as unknown / the refine fires.

- [ ] **Step 3: Change the route**

```ts
import { AppError, normalizeEmail, normalizeLink, whyNotALink, whyNotAnEmail } from "@chanlytics/contracts";
```
Body:
```ts
/** Any field alone; an empty string clears it. */
const Body = z
  .object({
    name: z.string().optional(),
    notes: z.string().optional(),
    email: z.string().max(320).optional(),
    proposal: z.string().max(600).optional(),
  })
  .refine(
    (b) => b.name !== undefined || b.notes !== undefined || b.email !== undefined || b.proposal !== undefined,
    "Send a name, notes, an email address or a proposal link.",
  );
```
Docblock: `PUT /api/v1/contacts/:id/details — { name?, notes?, email?, proposal? }` and a line: `The proposal is the owner's priced answer for this person as a web address (00154): the receptionist sends the address, never a file, never a figure; the link is judged HERE by the one normalizer (normalizeLink) so the refusal says which kind of not-an-address it was.` Also "through three definer doors" → "four".
`out` type gains `proposal_url?: string | null`. After the email branch:
```ts
    if (input.proposal !== undefined) {
      const typed = input.proposal.trim();
      const url = typed ? normalizeLink(typed) : null;
      if (typed && !url) throw new AppError("validation", whyNotALink(typed) ?? "That is not a web address.");
      const { data, error: doorErr } = await ctx.supabase.rpc("set_person_proposal", {
        p_contact_id: id,
        p_url: url ?? "",
      });
      if (doorErr) throw new AppError("validation", doorErr.message);
      out.proposal_url = ((data ?? {}) as { proposal_url?: string | null }).proposal_url ?? null;
    }
```

- [ ] **Step 4: Update the one pin** in `calendar-people.test.mjs`: `'"Send a name, notes or an email address."'` → `'"Send a name, notes, an email address or a proposal link."'`; and the same regex in `people-routes.test.mjs`'s existing details case (`/Send a name, notes or an email address\./` → `/Send a name, notes, an email address or a proposal link\./`).

- [ ] **Step 5: The bridge and the global**

`people-detail.ts`: docblock `window.__setPersonDetails(id, { name?, notes?, email?, proposal? })`; `DetailsBody` gains `proposal?: string;`.
`seed-globals.ts`: import `whyNotALink` beside `whyNotAnEmail`; the Window type gains `__whyNotALink: typeof whyNotALink;`; install `window.__whyNotALink = whyNotALink;` with the comment `// And for a proposal link typed on a person's page (link.ts).`

- [ ] **Step 6: Run** `people-routes.test.mjs`, `calendar-people.test.mjs`, then `corepack pnpm typecheck`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/app/api/v1/contacts/[id]/details/route.ts apps/dashboard/src/legacy-bridge/people-detail.ts apps/dashboard/src/legacy-bridge/seed-globals.ts tooling/scripts/tests/people-routes.test.mjs tooling/scripts/tests/calendar-people.test.mjs
git commit -m "The details route takes a proposal link through its own door"
```

### Task 6: Dist, the whole suite, the PR

- [ ] `corepack pnpm --filter "./packages/*" build`; `git status -- packages/*/dist`; commit only dists with a real diff (`git diff -w --stat`).
- [ ] `corepack pnpm test` (whole), `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm check:db-types` (with `SUPABASE_CLI`), the `test:db` suite with the env.
- [ ] Push; `gh pr create` with the spec's summary; watch CI; squash-merge on green (no reader of the column ships here, so production needs nothing first).
- [ ] Then: `"$SB" db push --linked --dry-run`, the push, `db query` reading the column, the door and the trigger back — **Ruben's yes first**.

---

## PR 2 — the receptionist and the person page send it

### Task 7: The receptionist's sentence

**Files:**
- Modify: `packages/db/src/repositories/thread.ts`
- Test: `tooling/scripts/tests/lead-context.test.mjs`

- [ ] **Step 1: Failing test** (append)

```js
test("a proposal on file rides with who the person is: the address to send, the rule to state no figure, and never to read it out on a call", () => {
  const lead = {
    contactId: "c1",
    name: "Maria Lopez",
    returning: true,
    lastSeenAt: null,
    history: [{ role: "user", content: "hi" }],
    optedOut: false,
    notes: null,
    proposalUrl: " https://docs.example.com/p/maria ",
  };
  const d = describeLead(lead, NOW);
  assert.ok(
    d.includes(
      "The owner has a proposal ready for them at https://docs.example.com/p/maria. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out — say it is being sent to them in writing.",
    ),
    d,
  );
  assert.ok(!describeLead({ ...lead, proposalUrl: null }, NOW).includes("proposal"), "no sentence without one");
  assert.ok(!describeLead({ ...lead, proposalUrl: undefined }, NOW).includes("proposal"), "a reader without the column says nothing");
});
```

- [ ] **Step 2: Change `thread.ts`**

`LeadContext`:
```ts
  /** The owner's proposal for them, as a web address (00154): sent when they ask about price, its figures never stated. */
  proposalUrl?: string | null;
```
`readLeadContext` select: `"id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url"`; return adds `proposalUrl: contact.proposal_url ?? null,`.
`describeLead`, after the notes:
```ts
  // The owner's priced answer for this person is a link; the receptionist hands it over and prices nothing itself.
  const proposal = (lead.proposalUrl ?? "").trim();
  if (proposal)
    bits.push(
      `The owner has a proposal ready for them at ${proposal}. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out — say it is being sent to them in writing.`,
    );
```

- [ ] **Step 3: Build the db dist, run the test, commit** — `git commit -m "The receptionist knows the person's proposal link and sends it when asked about price"`

### Task 8: The view model

**Files:**
- Modify: `packages/contracts/src/people.ts`
- Test: `tooling/scripts/tests/people-vm.test.mjs`

- [ ] **Step 1: Failing tests** (append; `contracts` is the namespace import already in the file)

```js
test("proposalAction: the send-the-proposal button's words by the wire, 'again' once it went out, and no button where a closed window would make it a lie", () => {
  const f = contracts.proposalAction;
  assert.deepEqual(f("Email", { open: true, hoursLeft: 0 }, null), {
    label: "Email the proposal",
    title: "Opens the thread with the proposal link ready to send by email",
    ready: true,
  });
  assert.deepEqual(f("Text", { open: true, hoursLeft: 0 }, "Sep 22, 2026 · Text"), {
    label: "Text the proposal again",
    title: "Opens the thread with the proposal link ready to send as a text · sent Sep 22, 2026 · Text",
    ready: true,
  });
  assert.deepEqual(f("WhatsApp", { open: true, hoursLeft: 5 }, null), {
    label: "Send the proposal",
    title: "Opens the thread with the proposal link ready to send · 5h left in their reply window",
    ready: true,
  });
  assert.equal(f("WhatsApp", { open: false, hoursLeft: 0 }, null).ready, false);
  assert.equal(f(null, null, null).ready, false);
});

test("a person's proposal: the address, its host in About, and the newest message that carried it and went out", () => {
  const url = "https://www.docs.example.com/p/dani";
  const d = detail({ proposal_url: url });
  d.conversations[0].messages.push(
    msg({ id: "m-q", at: iso(2 * H), body: `Here's the proposal we put together for you: ${url}`, direction: "outbound", sender: "human", status: "queued", channel: "whatsapp" }),
    msg({ id: "m-s", at: iso(5 * H), body: `Here's the proposal we put together for you: ${url}`, direction: "outbound", sender: "human", status: "sent", channel: "whatsapp" }),
  );
  const vm = toPersonVM(d, ZONE, NOW);
  assert.equal(vm.proposal.url, url);
  assert.equal(vm.proposal.host, "docs.example.com");
  assert.equal(vm.proposal.sent.via, "WhatsApp");
  assert.equal(vm.proposal.sent.at, iso(5 * H), "the one that went out, not the one still in its cancel window");
  assert.ok(vm.about.some((a) => a.k === "Proposal" && a.v === "docs.example.com"));
  assert.match(vm.proposalAction.label, /again$/);
  assert.equal(toPersonVM(detail(), ZONE, NOW).proposal, null);
  assert.equal(toPersonVM(detail({ proposal_url: "https://docs.example.com/p/new" }), ZONE, NOW).proposal.sent, null, "a new address has not gone out");
  assert.equal(contracts.proposalMessage(url), `Here's the proposal we put together for you: ${url}`);
});
```
(`msg()` in that file takes `{ id, at, body, ...over }` — check its fields at edit time and pass `direction`, `sender`, `status`, `channel` as the DTO names them.)

- [ ] **Step 2: Change `people.ts`**

`PersonDetailDto`: after `notes?`:
```ts
  /** The owner's proposal link for this person (00154): the About row and the one-step send. */
  proposal_url?: string | null;
```
New exports beside `bookingLinkAction`:
```ts
/** The owner's proposal for a person, for the page: the address, where it lives, and whether it went out. */
export interface PersonProposalVM {
  url: string;
  host: string;
  /** The newest message that carried the address and went out: when, and on which wire. */
  sent: { at: string; via: string | null } | null;
}

/** The words the one-step send carries into the composer, once, for the page and the thread. */
export function proposalMessage(url: string): string {
  return `Here's the proposal we put together for you: ${url}`;
}

/**
 * What the send-the-proposal button says, by the wire a reply goes out on:
 * bookingLinkAction's twin. Nothing is sent from the button: it opens the
 * thread with the address ready in the composer. There is no template for a
 * proposal, so where WhatsApp's window has shut there is no button (`ready`
 * false) -- the About rail's Reply window row already says why. `again` once
 * the address has gone out, so the page says what it knows without a second line.
 */
export function proposalAction(
  replyVia: "WhatsApp" | "Text" | "Email" | null,
  win: { open: boolean; hoursLeft: number } | null,
  sentWords: string | null,
): { label: string; title: string; ready: boolean } {
  const again = sentWords ? " again" : "";
  const sent = sentWords ? ` · sent ${sentWords}` : "";
  if (replyVia === "Email")
    return { label: `Email the proposal${again}`, title: `Opens the thread with the proposal link ready to send by email${sent}`, ready: true };
  if (replyVia === "Text")
    return { label: `Text the proposal${again}`, title: `Opens the thread with the proposal link ready to send as a text${sent}`, ready: true };
  if (win && win.open)
    return {
      label: `Send the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send · ${win.hoursLeft}h left in their reply window${sent}`,
      ready: true,
    };
  return {
    label: "Send the proposal",
    title: "Their reply window is closed — the link can go by WhatsApp once they write again",
    ready: false,
  };
}

/** The newest message that carried the address and went out — a status that is not queued, canceled or failed, the rule people_list calls spoken. */
function proposalSent(conversations: ReadonlyArray<ConversationDto>, url: string): PersonProposalVM["sent"] {
  let best: { at: number; iso: string; channel: string | null } | null = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.direction !== "outbound" || !m.body || !m.body.includes(url)) continue;
      if (m.status && ["queued", "canceled", "failed"].includes(m.status)) continue;
      const iso = m.channel_ts ?? m.created_at;
      const at = Date.parse(iso);
      if (Number.isFinite(at) && (!best || at > best.at)) best = { at, iso, channel: m.channel ?? null };
    }
  }
  if (!best) return null;
  const via = best.channel && best.channel in PERSON_CHANNEL_WORDS ? PERSON_CHANNEL_WORDS[best.channel as PersonChannel] : null;
  return { at: best.iso, via };
}
```
`PersonVM` gains:
```ts
  /** The owner's proposal for them (00154), or null when none is on file. */
  proposal: PersonProposalVM | null;
  /** The send-the-proposal button's words for the wire a reply goes out on (proposalAction); `ready` false hides it. */
  proposalAction: { label: string; title: string; ready: boolean };
```
In `toPersonVM`, before the About rail:
```ts
  const proposalUrl = d.proposal_url?.trim() || null;
  const proposal: PersonProposalVM | null = proposalUrl
    ? { url: proposalUrl, host: linkHost(proposalUrl), sent: proposalSent(d.conversations, proposalUrl) }
    : null;
  const sentAt = proposal?.sent ? ts(proposal.sent.at) : null;
  const sentWords =
    proposal?.sent && sentAt !== null ? `${clockDateYear(sentAt, tz)}${proposal.sent.via ? ` · ${proposal.sent.via}` : ""}` : null;
```
After the Email About row: `if (proposal) about.push({ k: "Proposal", v: proposal.host });`
The return: build the object as today into `const vm = {...}`, then
```ts
  return { ...vm, proposalAction: proposalAction(vm.replyVia ?? null, vm.replyWindow ?? null, sentWords) };
```
with `proposal,` added beside `bookingLink`. (`vm.replyVia` is `"WhatsApp" | "Text" | "Email" | null | undefined` from `base` and the IIFE; check the type at edit time and coerce.) Import `linkHost` from `./link`.

- [ ] **Step 3: Build contracts, run `people-vm.test.mjs`, commit** — `git commit -m "A person's page knows the proposal, where it lives, and whether it went out"`

### Task 9: The route reads it

**Files:**
- Modify: `apps/dashboard/app/api/v1/contacts/[id]/route.ts`: `sb.from("contacts").select("notes, proposal_url").eq("id", id).maybeSingle(),` with the comment `// The owner's notes and their proposal link: the two columns people_list does not carry.`; and `proposal_url: own.data?.proposal_url ?? null,` under `notes:`.
- Modify: `tooling/scripts/tests/calendar-people.test.mjs` pin: `select("notes")` → `select("notes, proposal_url")`.
- [ ] Run `calendar-people.test.mjs`, `people-routes.test.mjs`; commit — `git commit -m "The person read carries the proposal link beside the notes"`

### Task 10: The page

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/client-profile.jsx`, `apps/dashboard/src/legacy-bridge/seed-globals.ts` (`__proposalMessage`), `apps/dashboard/src/legacy/Chanlytics.html` (`client-profile.jsx?v=22`), `apps/dashboard/src/legacy/CLAUDE.md`
- Test: `tooling/scripts/tests/person-honest.test.mjs`

- [ ] **Step 1: Failing render tests** (append; `profile(vm)` mounts the page with a VM; `detail()` and `toPersonVM` are in scope)

```js
test("a proposal on file: an About row that is its control, and the send beside the booking link in Right now — with 'again' once it went out; nothing for a viewer, nothing for someone who opted out", async () => {
  const url = "https://docs.example.com/p/dani";
  const vm = toPersonVM(detail({ proposal_url: url }), ZONE, new Date());
  const draw = await profile(vm);
  let tree = draw();
  const row = byTestId(tree, "person-proposal");
  assert.ok(row, "the About row");
  const link = byTestId(row, "person-proposal-link");
  assert.equal(link.props.href, url);
  assert.equal(textOf(link), "docs.example.com", "the host, not the whole address");
  assert.equal(byTestId(row, "person-proposal-edit").props["aria-label"], "Change the proposal link");
  const actions = find(tree, (n) => cls(n) === "cl-prof-queue-actions");
  const send = byTestId(actions, "send-proposal");
  assert.ok(send, "the send lives in Right now, beside the booking link");
  assert.equal(textOf(send).trim(), vm.proposalAction.label);
  assert.ok(byTestId(actions, "text-booking-link"), "and the booking link keeps its button");

  // Sent: the label says so.
  const d = detail({ proposal_url: url });
  d.conversations[0].messages.push(msg({ id: "m-s", at: iso(H), body: `Here's the proposal we put together for you: ${url}`, direction: "outbound", sender: "human", status: "sent", channel: "whatsapp" }));
  tree = (await profile(toPersonVM(d, ZONE, new Date())))();
  assert.match(textOf(byTestId(tree, "send-proposal")), /again/);

  // None on file: the row invites, the send is absent.
  tree = (await profile(toPersonVM(detail(), ZONE, new Date())))();
  assert.equal(byTestId(tree, "person-proposal-edit").props["aria-label"], "Add a proposal link");
  assert.equal(byTestId(tree, "send-proposal"), null);

  // A viewer sees the host and changes nothing; no row at all when there is none.
  globalThis.window.__ME = { role: "viewer" };
  try {
    tree = (await profile(vm))();
    assert.ok(byTestId(tree, "person-proposal-link"));
    assert.equal(byTestId(tree, "person-proposal-edit"), null);
    assert.equal(byTestId(tree, "send-proposal"), null);
    tree = (await profile(toPersonVM(detail(), ZONE, new Date())))();
    assert.equal(byTestId(tree, "person-proposal"), null);
  } finally {
    globalThis.window.__ME = { role: "owner" };
  }

  // Opted out: never a send.
  tree = (await profile(toPersonVM(detail({ row: row({ consent: "opted_out" }) , proposal_url: url }), ZONE, new Date())))();
  assert.equal(byTestId(tree, "send-proposal"), null);
});
```
(Match the file's own helpers — `cls`, `row`, `detail`, `msg`, `iso`, `H` — at edit time; `detail({ row: ... })` merges `over` into the detail.)

- [ ] **Step 2: The page**

After `PersonEmail`, add `PersonProposal` (the component in the spec: host as a link, pencil, input `type="url"`, `window.__whyNotALink`, `window.__setPersonDetails(p.id, { proposal: next })`, test ids `person-proposal`, `person-proposal-link`, `person-proposal-edit`, `person-proposal-input`, `person-proposal-problem`, `person-proposal-save`, flashes "Proposal link saved — the receptionist sends it when they ask" / "Proposal link removed").

The About rows: after the Email unshift,
```js
  // The proposal is the other About fact changed here (PersonProposal); it sits under the address, and its send is Right now's.
  if (canRecord && !aboutFacts.some((a) => a.k === "Proposal")) {
    const afterEmail = aboutFacts.findIndex((a) => a.k === "Email") + 1;
    aboutFacts.splice(afterEmail, 0, { k: "Proposal", v: "" });
  }
```
The row render: `{a.k === "Email" ? <PersonEmail … /> : a.k === "Proposal" ? <PersonProposal p={p} canEdit={canRecord} flash={ppFlash} /> : a.v}`.

Right now, after the booking button:
```jsx
                {/* The owner's priced answer for this person, sent the way the booking link is: the composer opens with
                    the words the contract keeps (proposalMessage); nothing is sent from here. Only where free text can
                    go (proposalAction.ready): a closed WhatsApp window has no proposal template to fall back on, and
                    the rail's Reply window row already says so. */}
                {p.openThread && p.proposal && p.proposalAction.ready && canRecord && p.consent.state !== "opted_out" && !p.consent.dnc && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    data-testid="send-proposal"
                    title={p.proposalAction.title}
                    onClick={() => {
                      try { sessionStorage.setItem("chanlytics-compose", JSON.stringify({ threadId: p.openThread.replace(/^inbox\//, ""), text: window.__proposalMessage(p.proposal.url) })); } catch { /* nothing carried */ }
                      window.CHANLY.nav(p.openThread);
                    }}
                  >
                    <Icon name="external" size={12} /> {p.proposalAction.label}
                  </button>
                )}
```
`seed-globals.ts`: import `proposalMessage`; type `__proposalMessage: typeof proposalMessage;`; install `window.__proposalMessage = proposalMessage;`.
`Chanlytics.html`: `pages/client-profile.jsx?v=22`.
`legacy/CLAUDE.md`, under UI patterns: `- **A proposal is a link on the person** (00154; docs/superpowers/specs/2026-09-22-proposal-link-design.md): the About row is its control (`PersonProposal`, PersonEmail's shape, the host as the link), Right now sends it beside the booking link (`send-proposal`; words from contracts `proposalAction`, the message from `proposalMessage`, only where free text can go), and the thread's Actions menu fills the composer with it (`inbox:compose`). Never a file; the receptionist states none of its figures.`

- [ ] **Step 3: Run `person-honest.test.mjs`, `legacy-harness.test.mjs`; commit** — `git commit -m "A person's page holds their proposal link and sends it beside the booking link"`

### Task 11: The nightly walks the door

**Files:**
- Modify: `e2e/people-consent.spec.ts` (a sibling of the email test), `tooling/scripts/e2e-workspace.mjs` (`proposal_url: null` in `fields`, beside `email: null`)

- [ ] Append to the spec:
```ts
  test("a person's proposal link is added, refused when it is not one, stored with its scheme, and cleared — through the real door", async ({ page }) => {
    await page.goto("/#/clients");
    await page.waitForLoadState("networkidle");
    const robin = page.locator(".cl-table tbody tr", { hasText: "Robin Example" });
    test.skip((await robin.count()) === 0, "the seeded person is not in this workspace");
    await robin.first().click();
    await expect(page.locator(".cl-prof-name")).toBeVisible();

    const row = page.getByTestId("person-proposal");
    await expect(row).toBeVisible();
    if ((await page.getByTestId("person-proposal-edit").getAttribute("aria-label")) === "Change the proposal link") {
      await page.getByTestId("person-proposal-edit").click();
      await page.getByTestId("person-proposal-input").fill("");
      await page.getByTestId("person-proposal-save").click();
      await expect(page.getByTestId("person-proposal-edit")).toHaveAttribute("aria-label", "Add a proposal link");
    }

    const puts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PUT" && /\/api\/v1\/contacts\/[^/]+\/details/.test(r.url())) puts.push(r.postData() ?? "");
    });

    await page.getByTestId("person-proposal-edit").click();
    const input = page.getByTestId("person-proposal-input");
    await input.fill("docs");
    await page.getByTestId("person-proposal-save").click();
    await expect(page.getByTestId("person-proposal-problem")).toContainText("full web address");
    expect(puts, "a refusal under the field sends nothing").toHaveLength(0);

    await input.fill(" docs.example.com/p/robin-e2e ");
    await input.press("Enter");
    await expect(page.getByTestId("person-proposal-link")).toHaveText("docs.example.com");
    await expect(page.getByTestId("person-proposal-link")).toHaveAttribute("href", "https://docs.example.com/p/robin-e2e");
    expect(JSON.parse(puts[0])).toEqual({ proposal: "docs.example.com/p/robin-e2e" });

    await page.reload();
    await expect(page.getByTestId("person-proposal-link")).toHaveText("docs.example.com");

    await page.getByTestId("person-proposal-edit").click();
    await page.getByTestId("person-proposal-input").fill("");
    await page.getByTestId("person-proposal-save").click();
    await expect(page.getByTestId("person-proposal-edit")).toHaveAttribute("aria-label", "Add a proposal link");
    await expect(page.getByTestId("person-proposal-link")).toHaveCount(0);
  });
```
- [ ] Commit — `git commit -m "The nightly walks the proposal link through the real door"`

### Task 12: Dists, suite, PR, prod check

- [ ] Rebuild dists (contracts, db); commit real diffs. `corepack pnpm test`, `lint`, `typecheck`, `check:db-types`. Push, PR, CI, merge **only after 00154 is on production** (Task 6's last step). Then read the person page on production at 390px and 1280px.

---

## PR 3 — the thread, Ask and email

### Task 13: The thread knows the link

**Files:**
- Modify: `apps/dashboard/src/server/dto.ts` — `CONVERSATION_COLUMNS` contact select adds `, proposal_url`; `ConversationRow.contacts.proposal_url: string | null`; `toConversationDto` contact adds `proposal_url: c.contacts?.proposal_url ?? null,`
- Modify: `packages/contracts/src/viewmodels.ts` — `ConversationDto.contact.proposal_url?: string | null;` (doc: "The owner's proposal link (00154). Absent on payloads read without it."); `InboxThreadVM.proposalUrl: string | null;` set from `dto.contact.proposal_url ?? null` in `toInboxThreadVM`.
- Test: the thread VM test file that builds `ConversationDto`s (`thread-controls.test.mjs` or `one-thread.test.mjs` — pick the one that already asserts `phone`/`clientId`): `assert.equal(toInboxThreadVM(dto({ contact: { …, proposal_url: "https://docs.example.com/p/1" } })).proposalUrl, "https://docs.example.com/p/1")` and `null` when absent.
- [ ] Commit — `git commit -m "The thread carries the person's proposal link"`

### Task 14: The Actions item and the composer

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/inbox-thread.jsx`, `Chanlytics.html` (`inbox-thread.jsx?v=36`)

- [ ] In the Actions menu's person group, first:
```js
            // The owner's proposal for this person, into the box in the words the contract keeps: the thread is where
            // a pricing question is answered, and the page was a detour. Only where free text can go, never to someone
            // who opted out, and only on a real thread.
            ...(thread.real && thread.proposalUrl && thread.windowOpen && !thread.optedOut && window.__proposalMessage
              ? [{ label: "Send the proposal", hint: (() => { try { return new URL(thread.proposalUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })(), icon: "external", onClick: () => window.dispatchEvent(new CustomEvent("inbox:compose", { detail: { text: window.__proposalMessage(thread.proposalUrl), link: thread.proposalUrl } })), gate: window.gate("approve", "put the proposal link in the reply") }]
              : []),
```
- [ ] In `Composer`, beside the `inbox:focus-composer` listener:
```js
  // Words carried in from the header's Actions ("Send the proposal"): an empty box takes the sentence, a box with words
  // in it takes the address on its own line, and the cursor lands in the box either way.
  React.useEffect(() => {
    const onCompose = (e) => {
      const d = (e && e.detail) || {};
      if (typeof d.text !== "string") return;
      write((cur) => (cur && cur.trim() ? `${cur.trimEnd()}\n${d.link || d.text}` : d.text));
      window.setTimeout(() => { if (taRef.current) taRef.current.focus(); }, 60);
    };
    window.addEventListener("inbox:compose", onCompose);
    return () => window.removeEventListener("inbox:compose", onCompose);
  }, []);
```
`write` takes a value today; make it take a value or an updater: `const write = (v) => { const next = typeof v === "function" ? v(text) : v; setText(next); keepWords(next); };` — and since `text` in a stale closure is the risk, read it through a ref (`textRef.current = text` each render) inside the updater branch.
- [ ] Commit — `git commit -m "The thread's Actions put the proposal link in the reply"`

### Task 15: Ask sees it

**Files:**
- Modify: `apps/dashboard/src/server/ask/tools.ts` `getPerson`: add to the `Promise.all` `sb.from("contacts").select("proposal_url").eq("id", id).maybeSingle()` as `own`, check its error, and set `proposal_url: own.data?.proposal_url ?? null,` on `detail`. The `about` line then carries `Proposal: <host>`.
- Test: the Ask tools test that runs `get_person` over the fake db (`ask-tools*.test.mjs`): a contact with `proposal_url` → `about` includes `"Proposal: docs.example.com"`.
- [ ] Commit — `git commit -m "Ask reads the person's proposal link"`

### Task 16: Email links the address

**Files:**
- Modify: `packages/channels/src/email.ts` — after escaping a paragraph, wrap addresses:
```ts
const LINK_IN_TEXT = /https?:\/\/[^\s<>"']+/g;
/** Trailing punctuation belongs to the sentence, not the address. */
const linkify = (escaped: string): string =>
  escaped.replace(LINK_IN_TEXT, (m) => {
    const trail = /[.,;:!?)]+$/.exec(m)?.[0] ?? "";
    const href = m.slice(0, m.length - trail.length);
    return `<a href="${href}">${href}</a>${trail}`;
  });
```
and `.map((p) => `<p>${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`)`. The docblock: "…nothing else — except that an address in the words is a link, so a proposal or a booking link can be opened where the client does not link plain text itself. Escaped first, so nothing in the words reaches the markup; `&` inside an address is `&amp;`, which a browser reads back as `&`."
- Test (`email-wire.test.mjs`): `assert.equal(emailHtml("See https://docs.example.com/p?a=1&b=2, then write back."), '<p>See <a href="https://docs.example.com/p?a=1&amp;b=2">https://docs.example.com/p?a=1&amp;b=2</a>, then write back.</p>');` and the existing script case unchanged.
- [ ] Rebuild channels dist; commit — `git commit -m "An address in an email is a link"`

### Task 17: Dists, suite, PR

- [ ] Rebuild dists (contracts, channels); `corepack pnpm test`, `lint`, `typecheck`; push; PR; CI; merge; read a thread with a proposal on production.

---

## Self-review

- Spec coverage: storage (T1–2), one derivation (T3), ledger (T4), route/bridge (T5), the receptionist (T7), the VM and its words (T8), the read (T9), the page (T10), the nightly (T11), the thread (T13–14), Ask (T15), email (T16). Out-of-scope items have no task by design.
- Names used across tasks: `proposal_url` (column, DTOs), `proposalUrl` (LeadContext, InboxThreadVM), `proposal` (details body, `PersonVM.proposal`), `proposalAction(replyVia, win, sentWords)`, `proposalMessage(url)`, `normalizeLink`/`whyNotALink`/`linkHost`, `set_person_proposal(p_contact_id, p_url)`, `contact.proposal_set`, test ids `person-proposal*`, `send-proposal`, event `inbox:compose`.
