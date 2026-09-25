# Reach out, Part 2: the wire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a cold email needs before the first one is sent. A person can unsubscribe in one click and is
never written to again. A workspace sends from domains it owns, created at a second mail account, which are
watched every ten minutes and held when they misbehave. The one send door carries a new purpose, `outreach`, and
refuses it outside its rules.

**Architecture:** Five PRs, each merged before the next branches from main, each shippable in either deploy order.
Each PR carries its own migration, pushed to production before its merge: 00174, 00175 and 00176, re-checked
against production's ledger before each push. The unsubscribe is a public route handler in the dashboard at
`/u/<token>` over a service-role SQL door. A sending domain is a row the edge writes: it holds the cold mail
account's key, and the dashboard reaches it through a new admin door. The `domains` clock asks the edge every ten
minutes; the edge reads the provider and DNS, and a pure judge in contracts decides the next state. The door
(`deliver()`) re-reads the outreach facts at the wire. Nothing in this part sends a cold email: that is Part 3's
batch writer, which will stand on every piece built here.

**Tech Stack:** Postgres (Supabase) migrations and definer functions; TypeScript packages (contracts, channels,
db, core) with committed tsup `dist`; Vercel Node functions on the edge; Next.js 16 route handlers in the
dashboard; the legacy React shell (window globals, `?v=` versions); `node:test` over `_fake-db.mjs`; database
suites against a local stack.

**Spec:** `docs/superpowers/specs/2026-09-25-reach-out-design.md` §4.6–§4.8, §6 Part 2 (all eight decisions approved
by Ruben, 25 Sep 2026). **Canvas:** boards 11 (Connections) and the states board.
**Follows:** Part 1 (`docs/superpowers/plans/2026-09-25-reach-out-part-1-send-path.md`, #1018 + #1020).
**Written against:** `origin/main` at `ec68ed02`.

---

## What this part settles

The spec leaves these open or names them loosely. Each is decided here, with its reason.

1. **Five PRs, not the spec's three.** Unsubscribe; the domain engine on the edge; the Connections block; the
   outreach door; reputation holds. Each is one reviewable idea, and each is whole on its own.
2. **The unsubscribe link is https only.** RFC 8058's one click needs one https URI, and Part 1's plan left mailto
   open. A mailto address would need an intake path that reads a new address shape and acts on it. It adds a way to
   fail and nothing the one click and "Reply no thanks" (Part 5) do not already give. `unsubscribeMailto` stays
   optional in `buildEmailRequest` and nothing sets it.
3. **One route, `/u/<token>`, in the dashboard.** GET draws a page with one button and changes nothing, because
   link scanners fetch every URL in an email. POST is either the mail client's one click (`List-Unsubscribe=One-Click`)
   or the page's button. Either records the no and answers 200 in the same response: no redirect, no cookie, no
   sign-in (RFC 8058 §3). It is the first public route that writes, and all it can write is "stop". The gate test
   says so where it pins the prefix. The link rides on `app.chanlytics.com`. *Risk, for Ruben later:* one tenant's
   abuse could put that domain on URI blocklists. Mailchimp's answer is a separate registered domain for recipient
   links (`list-manage.com`). The origin is one function (the edge's `dashboardOrigin()`), so moving it later is
   one change.
4. **An unsubscribe is "said no"** (the canvas's states board, which Ruben approved). It does three things:
   - sets `contacts.email_marketing = 'opted_out'`;
   - puts the address on the workspace's never-again list (`lead_suppressions`, `email_opt_out`), so no later search
     mails it;
   - closes the leads still being written to (`ready`, `nurture`) as `archived` / `said_no`.

   A converted lead (Talking, a deal) keeps its stage; the door still refuses outreach to them. It writes no
   `lead_operations` row, so it cannot be undone: a person's own "stop" is not the owner's to reverse. The
   classifier's misread "no" (Part 5) is undoable.
5. **The token is 87 characters and never expires.**
   - What it holds: a version byte, the tenant, the contact and the message as 16 bytes each, and the first 16 bytes
     of HMAC-SHA256 under `UNSUBSCRIBE_SECRET`.
   - Why no expiry: CAN-SPAM wants the way out working for at least 30 days, and a late "stop" must still stop.
     All a token can ever do is narrow what may be sent.
   - Where the secret lives: in both apps, like `EDGE_CALL_SECRET`. The dashboard reads it from this part (the page
     verifies); the edge's getter arrives with its first reader, Part 3's writer.
6. **A domain's life:** `records` (add these at your registrar) → `verifying` (Check was pressed; the provider is
   looking) → `verified` (the provider verified SPF and DKIM, and a DMARC record exists) → `held`.
   - **DNS holds** (`verification`, `dmarc`) lift themselves when the sweep reads everything good again.
   - **Reputation holds** (`bounces`, `complaint`) lift only when the owner presses Resume (PR 5).
   - Every lift restarts the ramp: `clean_since` = now, so "clean days" means days since the last trouble.
7. **The cap is computed, never stored.** `domainDailyCap(clean_since, now)`: 30 a day, 100 after 14 clean days,
   200 after 30. One derivation, so the Connections row, the timetable (Part 3) and the door cannot disagree.
8. **DMARC is read as presence.** Any `v=DMARC1` TXT at `_dmarc.<host>` or at a parent down to two labels counts,
   an approximation of RFC 7489's organisational-domain fallback. The recommended record is `v=DMARC1; p=none;`:
   Gmail and Yahoo accept it, and unlike `p=quarantine` it cannot break a domain that also sends other mail.
9. **Five domains per workspace at most** (`SENDING_DOMAINS_MAX`). 5 × 200 = 1,000 a day at full ramp, under Part
   3's monthly allowance.
10. **DNS blocklists are deferred.** Spamhaus refuses queries from public and cloud resolvers, and wants a paid DQS
    key for commercial use. The spec's `dnsbl_listed` column and the "on none of the lists we check" line arrive
    together with a real lookup. Until then the page states no blocklist fact.
11. **The bounce rule** is judged over the last 500 sends since `clean_since`: `bounced × 50 > max(sent, 150)`. On a
    new domain four bounces hold it and three do not; after 150 sends it is the true 2%. **The complaint rule:** any
    complaint since `clean_since`.
12. **A row's domain is read from its frozen request's From**, by one SQL function (`email_from_host`). The door
    already holds the From to the identity it sends as, so a second stamp would be a second spelling of one fact.
13. **The owner is told when a domain is held:** a `sweep` notification, which opens Connections, plus email. No
    notification when a domain verifies: the page repaints, and Part 5's Reach-outs group adds "ready".
14. **The outreach purpose.**
    - `mayMessageFor(c, "outreach")`: refused when opted out or unsubscribed from email; otherwise no recorded yes is
      needed. US law lets a business write to a business until told to stop.
    - `deliver()` adds the wire's rules: email only; to a person made from a lead; carrying the unsubscribe headers;
      From one of this workspace's own domains, verified and not held.
    - Consent reasons outrank wire reasons, so a person who unsubscribed is recorded as `unsubscribed`, whatever
      else is also true.
15. **One webhook door, two accounts.** `resend-webhook.ts` accepts a signature from either secret:
    `RESEND_WEBHOOK_SECRET` or `RESEND_COLD_WEBHOOK_SECRET`. Receipts find their row by the `cl_message` and
    `cl_tenant` tags whichever account sent the email.

## Ruben's steps (none blocks a merge)

| When | What | Where |
| --- | --- | --- |
| Before PR 2's domains can be added | Create a second Resend account for cold mail; copy its API key | resend.com |
| Same | Set `RESEND_COLD_API_KEY` to that key (Production) | Vercel: the edge project |
| Before the first cold send (Part 3) | In the cold account, add a webhook to `https://<edge>/api/resend-webhook` for `email.*` events; set `RESEND_COLD_WEBHOOK_SECRET` to its signing secret | Resend + Vercel edge |
| Now (the dashboard reads it from PR 1) | Generate one secret (`openssl rand -base64 32`); set `UNSUBSCRIBE_SECRET` to it | Vercel: the dashboard project now, the edge project too |
| After PR 3 | Add a domain on Connections (a domain of its own, like `get<business>.com`); publish its records at the registrar; press Check | the app + the registrar |
| After PR 4, with a verified domain | Say yes to one test email from that domain to the workspace's own address, so the DKIM signature can be read for `List-Unsubscribe` coverage (Part 1's carried check) | the app |

---

## PR 1 — A person can unsubscribe, in one click

Branch `reach-out-2a-unsubscribe` from main. The plan is its first commit.

### Files

- Create `supabase/migrations/00174_a_person_may_unsubscribe_from_email.sql`: the column, the door.
- Create `packages/channels/src/unsubscribe-token.ts`: sign, verify, the URL. Export from `packages/channels/src/index.ts`.
- Create `packages/contracts/src/reach-out.ts`: the campaign footer, the page's words. Export from the index.
- Modify `packages/contracts/src/consent.ts`: `EMAIL_MARKETING_STATES`.
- Modify `packages/contracts/src/schema-sets.ts`: hold it to the database.
- Modify `packages/contracts/src/people.ts`: the timeline's words for an unsubscribe.
- Modify `packages/contracts/src/schema-sets.generated.ts`: generated.
- Modify `packages/db/src/database.types.ts`: generated.
- Create `apps/dashboard/src/server/unsubscribe.ts`: verify, record, render.
- Create `apps/dashboard/app/u/[token]/route.ts`: GET and POST.
- Modify `apps/dashboard/proxy.ts`: `/u/` joins `PUBLIC_PREFIXES`, with its argument.
- Modify `apps/dashboard/.env.example`: `UNSUBSCRIBE_SECRET`.
- Tests:
  - create `tooling/scripts/tests/unsubscribe-token.test.mjs`;
  - create `tooling/scripts/tests/unsubscribe-door.test.mjs`;
  - create `tooling/scripts/tests/email-marketing.db.test.mjs`;
  - modify `tooling/scripts/tests/auth-gate.test.mjs`;
  - modify the file that tests `consentChangeWords` (grep for it).

### Task 1.1 — The migration

- [ ] Write `supabase/migrations/00174_a_person_may_unsubscribe_from_email.sql`:

```sql
-- 00174 · A person may unsubscribe from a business's email.
--
-- Reach out, Part 2 (docs/superpowers/specs/2026-09-25-reach-out-design.md, §4.6-§4.8): every campaign email
-- carries a one-click unsubscribe (RFC 8058), and a press of it is honoured by the database, for every later send
-- and every later search. Email marketing is its own answer, apart from the two consent columns: US law lets a
-- business write to another business until it is told to stop (CAN-SPAM), so it starts "not asked", and the one
-- thing a person can say to it here is no.
--
--   contacts.email_marketing   unknown | opted_in | opted_out, with its source and when.
--   set_email_marketing(...)    the door an unsubscribe goes through. Service role only: the public page holds no
--                               session. It records the no, puts the address on the workspace's never-again list
--                               (lead_suppressions, email_opt_out) so no search mails it again, and closes the
--                               leads still being written to as said no (the canvas's states board). A converted
--                               lead keeps its stage; the send door refuses it anyway.

set local lock_timeout = '3s';

alter table public.contacts
  add column if not exists email_marketing text not null default 'unknown',
  add column if not exists email_marketing_source text,
  add column if not exists email_marketing_updated_at timestamptz;

alter table public.contacts drop constraint if exists contacts_email_marketing_check;
alter table public.contacts add constraint contacts_email_marketing_check
  check (email_marketing in ('unknown', 'opted_in', 'opted_out'));

comment on column public.contacts.email_marketing is
  'Whether this person may be sent marketing email (a reach-out, an offer): unknown until they say, opted_out once they unsubscribe. Apart from consent and marketing_consent, which are the texting and WhatsApp answers.';

create or replace function public.set_email_marketing(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_state text,
  p_source text,
  p_evidence jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business text;
  v_contact  public.contacts%rowtype;
  v_changed  boolean := false;
  v_lead     record;
begin
  -- One answer a public page can be trusted with: no, from an unsubscribe link. "No thanks" in a reply (Part 5)
  -- and a member's own reset widen this door when they arrive.
  if p_state is distinct from 'opted_out' or p_source is distinct from 'unsubscribe' then
    raise exception 'set_email_marketing records an unsubscribe: opted_out, from unsubscribe' using errcode = '22023';
  end if;
  select t.name into v_business from public.tenants t where t.id = p_tenant_id;
  select * into v_contact from public.contacts c
   where c.id = p_contact_id and c.tenant_id = p_tenant_id
   for update;
  -- A person who is gone, or asked to be forgotten, receives nothing already: nothing is written about them.
  if not found then
    return jsonb_build_object('changed', false, 'found', false, 'business', v_business);
  end if;
  if v_contact.erased_at is not null then
    return jsonb_build_object('changed', false, 'found', true, 'business', v_business);
  end if;

  if v_contact.email_marketing is distinct from 'opted_out' then
    update public.contacts
       set email_marketing = 'opted_out', email_marketing_source = p_source, email_marketing_updated_at = now()
     where id = p_contact_id and tenant_id = p_tenant_id;
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'contact.consent_changed', 'contact', 'contact', p_contact_id,
            jsonb_build_object('purpose', 'email_marketing', 'consent', 'opted_out', 'source', p_source)
            || coalesce(p_evidence, '{}'::jsonb));
    v_changed := true;
  end if;

  -- The never-again list, by the address as it is stored (lower-cased, 00125): the finder drops a suppressed
  -- address from every lead it finds later (core leads runner), and the audience (Part 3) skips it.
  if v_contact.email is not null then
    insert into public.lead_suppressions (tenant_id, kind, hash, what)
    values (p_tenant_id, 'email', public.lead_suppression_hash(p_tenant_id, v_contact.email), 'email_opt_out')
    on conflict (tenant_id, kind, hash) do nothing;
  end if;

  -- The leads still being written to are closed as said no, each with its event. No lead_operations row: the
  -- person's own stop is not the owner's to undo.
  for v_lead in
    update public.leads
       set stage = 'archived', closed_reason = 'said_no', version = version + 1
     where tenant_id = p_tenant_id and contact_id = p_contact_id
       and stage in ('ready', 'nurture') and erased_at is null and blanked_at is null
    returning id
  loop
    insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
    values (p_tenant_id, 'lead.stage', 'lead', 'lead', v_lead.id,
            jsonb_build_object('stage', 'archived', 'reason', 'said_no', 'by', null, 'source', 'unsubscribe'));
  end loop;

  return jsonb_build_object('changed', v_changed, 'found', true, 'business', v_business);
end $$;

revoke execute on function public.set_email_marketing(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.set_email_marketing(uuid, uuid, text, text, jsonb) to service_role;
comment on function public.set_email_marketing(uuid, uuid, text, text, jsonb) is
  'The unsubscribe door (Reach out, Part 2): records opted_out from unsubscribe, once (a repeat changes nothing and writes no second event), puts the address on lead_suppressions (email_opt_out) and closes the person''s ready and nurture leads as said_no. Service role only.';
```

- [ ] Check the lead event's category against an existing `lead.stage` insert (00142:275). If it is not `'lead'`,
  use what 00142 uses.
- [ ] Replay the migration inside a rolled-back transaction on the local stack (memory: supabase-cli-cached-binary,
  "Verifying one migration without disturbing other sessions"):
  `docker cp` the file in, then run `begin; \i /tmp/00174.sql; … rollback;`.
  Expected: no error.

### Task 1.2 — The database test (write it first; it runs against the local stack)

- [ ] Create `tooling/scripts/tests/email-marketing.db.test.mjs` in the shape of `consent-paths.db.test.mjs`: skip
  without a local database, a service client, two workspaces, one contact with an email, and leads linked to it in
  `ready`, `nurture` and `converted`. Cases:
  1. `set_email_marketing` with `opted_in` or `customer_message` raises `22023` and writes nothing.
  2. An unknown contact returns `{changed:false, found:false}` and writes nothing.
  3. The first call returns `{changed:true, found:true, business:<tenant name>}`, and:
     - `email_marketing = 'opted_out'`, source `unsubscribe`, with a time;
     - one `contact.consent_changed` event with `purpose: 'email_marketing'` and the evidence merged in;
     - one `lead_suppressions` row whose hash equals `lead_suppression_hash(tenant, email)`;
     - the `ready` and `nurture` leads are `archived` / `said_no` with their versions moved, and each has one
       `lead.stage` event;
     - the `converted` lead is untouched.
  4. A second call returns `changed:false`, writes no second event, and the suppression is still one row.
  5. The other workspace's contact id, called with this workspace's id, returns `found:false`.
  6. A signed-in member calling it gets permission denied (`42501`).
- [ ] Run: `SUPABASE_CLI=<exe> SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… node --test tooling/scripts/tests/email-marketing.db.test.mjs`
  on a stack with 00174 applied. Use the isolated second stack when another session holds the shared one. Expected:
  all pass.

### Task 1.3 — Closed sets and types

- [ ] `packages/contracts/src/consent.ts`: `export const EMAIL_MARKETING_STATES = ["unknown", "opted_in", "opted_out"] as const;`
  plus its type, beside the two other answers.
- [ ] `packages/contracts/src/schema-sets.ts`: hold it to `SchemaSet<"contacts.email_marketing">` the way the other
  consent sets are held.
- [ ] Regenerate `schema-sets.generated.ts` (`corepack pnpm gen:schema-sets`, with the stack at 00174) and
  `database.types.ts` (`SUPABASE_CLI=<2.116.0 exe> node tooling/scripts/check-db-types.mjs`). Use the pinned CLI;
  the diff must be only this migration's.

### Task 1.4 — The token (test first)

- [ ] Create `tooling/scripts/tests/unsubscribe-token.test.mjs` (it imports `@chanlytics/channels`, so it reads the
  built dist). Cases:
  - a round trip returns the three ids exactly;
  - the token is 87 characters of `[A-Za-z0-9_-]`;
  - `unsubscribeUrl("https://app.chanlytics.com", t)` is accepted by `buildEmailRequest` as a campaign's
    `unsubscribeUrl`, in the real request shape: `List-Unsubscribe` is `<https://app.chanlytics.com/u/…>`;
  - the wrong secret is null, and so is an empty secret;
  - flipping any single character is null;
  - a truncated or overlong token is null, and so is one with another version byte (re-sign bytes by hand in the
    test) or `+` / `/` characters;
  - signing a non-uuid id throws.
- [ ] Create `packages/channels/src/unsubscribe-token.ts`:

```ts
/**
 * The unsubscribe link a campaign email carries: whose "stop" it is, sealed.
 *
 * RFC 8058's one click takes no sign-in, so the link is the authority: it names the workspace, the person and the
 * email it came in, and a keyed MAC makes it unforgeable. It never expires. The law wants the way out working for
 * at least thirty days (CAN-SPAM), a stop pressed late must still stop, and all a token can ever do is narrow what
 * may be sent, so a leaked one costs the person nothing they did not ask for.
 *
 * 65 bytes as base64url, 87 characters: a version, three uuids of 16 bytes each, and the first 16 bytes of an
 * HMAC-SHA256 over them under UNSUBSCRIBE_SECRET, which the edge (minting, Part 3) and the dashboard (the page)
 * share.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface UnsubscribeClaims {
  tenantId: string;
  contactId: string;
  messageId: string;
}

/** Where the page lives on the dashboard's origin. */
export const UNSUBSCRIBE_PATH = "/u/";

const VERSION = 1;
const PAYLOAD_BYTES = 1 + 16 * 3;
const MAC_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{87}$/;

const bytesOf = (uuid: string): Buffer => Buffer.from(uuid.replace(/-/g, ""), "hex");
const uuidOf = (b: Buffer): string => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const macOf = (secret: string, payload: Buffer): Buffer =>
  createHmac("sha256", secret).update("chanlytics-unsubscribe:").update(payload).digest().subarray(0, MAC_BYTES);

export function signUnsubscribeToken(secret: string, c: UnsubscribeClaims): string {
  if (!secret) throw new Error("signUnsubscribeToken: no secret");
  for (const id of [c.tenantId, c.contactId, c.messageId])
    if (!UUID.test(id)) throw new Error("signUnsubscribeToken: the workspace, the person and the email are uuids");
  const payload = Buffer.concat([
    Buffer.from([VERSION]),
    bytesOf(c.tenantId),
    bytesOf(c.contactId),
    bytesOf(c.messageId),
  ]);
  return Buffer.concat([payload, macOf(secret, payload)]).toString("base64url");
}

/** The claims a token seals, or null for anything that is not a token this secret made. Never throws. */
export function verifyUnsubscribeToken(secret: string | null | undefined, token: string): UnsubscribeClaims | null {
  if (!secret || !TOKEN.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  if (raw.length !== PAYLOAD_BYTES + MAC_BYTES || raw[0] !== VERSION) return null;
  const payload = raw.subarray(0, PAYLOAD_BYTES);
  if (!timingSafeEqual(raw.subarray(PAYLOAD_BYTES), macOf(secret, payload))) return null;
  return {
    tenantId: uuidOf(payload.subarray(1, 17)),
    contactId: uuidOf(payload.subarray(17, 33)),
    messageId: uuidOf(payload.subarray(33, 49)),
  };
}

/** The link, on an origin with no trailing slash: what the footer shows and List-Unsubscribe carries. */
export function unsubscribeUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${UNSUBSCRIBE_PATH}${token}`;
}
```

- [ ] Export it from `packages/channels/src/index.ts`. Build the packages, run the test, expect a pass.

### Task 1.5 — The footer and the page's words (test first)

- [ ] Tests (a new `tooling/scripts/tests/reach-out-words.test.mjs`):
  - `campaignFooter({why, business, address, unsubscribeUrl})` returns exactly four lines:
    1. the reason (`WHY_FROM_MAPS` is `I found your business on Google Maps.`);
    2. `Name · address`;
    3. `Not interested? Reply "no thanks" and I won't write again.`;
    4. `Unsubscribe: <url>`.
  - A blank business, address or reason throws.
  - The footer given to `buildEmailRequest` as a campaign's footer ends the request's text.
  - `unsubscribePageWords` covers each of `ask`, `done`, `bad_link` and `unavailable`, with and without a business
    name:
    - only `ask` has a button;
    - no sentence contains `undefined` or `null`.
- [ ] Create `packages/contracts/src/reach-out.ts`:

```ts
/**
 * Reach out's words that more than one layer says: the foot every campaign email carries, and the unsubscribe
 * page. Pure (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.3, §4.8).
 */

/** Why a business the finder found is hearing from this one: the first line of the foot. */
export const WHY_FROM_MAPS = "I found your business on Google Maps.";

/**
 * The foot, as the law asks (CAN-SPAM): why they are hearing from you, who you are and where, and the two ways to
 * say no. The sender adds it; a template never stores it (the spec's §4.3). It throws on a blank part rather than
 * send an email whose foot says less than the law needs; the sheet (Part 4) refuses to start without an address.
 */
export function campaignFooter(f: { why: string; business: string; address: string; unsubscribeUrl: string }): string {
  const why = f.why.trim();
  const business = f.business.trim();
  const address = f.address.trim();
  if (!why || !business || !address || !f.unsubscribeUrl.trim())
    throw new Error("campaignFooter: a campaign's foot names why, who, where and how to stop");
  return [
    why,
    `${business} · ${address}`,
    `Not interested? Reply "no thanks" and I won't write again.`,
    `Unsubscribe: ${f.unsubscribeUrl.trim()}`,
  ].join("\n");
}

/** What the unsubscribe page is showing. */
export type UnsubscribeView =
  | { kind: "ask"; business: string | null }
  | { kind: "done"; business: string | null }
  | { kind: "bad_link" }
  | { kind: "unavailable" };

export interface UnsubscribePageWords {
  title: string;
  lead: string;
  body: string;
  /** The one button, on the page that asks; null elsewhere. */
  button: string | null;
  foot: string | null;
}

export function unsubscribePageWords(v: UnsubscribeView): UnsubscribePageWords {
  const who = (b: string | null) => b?.trim() || null;
  switch (v.kind) {
    case "ask": {
      const b = who(v.business);
      return {
        title: "Unsubscribe",
        lead: b ? `Stop emails from ${b}?` : "Stop these emails?",
        body: `Press the button and ${b ?? "this business"} won't send you emails like that one again. If you write to them, they can still answer you.`,
        button: "Unsubscribe",
        foot: `${b ?? "This business"} sends its email with Chanlytics.`,
      };
    }
    case "done": {
      const b = who(v.business);
      return {
        title: "Unsubscribed",
        lead: "You're unsubscribed.",
        body: `${b ?? "This business"} won't send you emails like that one again.`,
        button: null,
        foot: `${b ?? "This business"} sends its email with Chanlytics.`,
      };
    }
    case "bad_link":
      return {
        title: "Unsubscribe",
        lead: "This link doesn't work.",
        body: "It may have been cut short when it was copied. Open the Unsubscribe link in the email itself, or reply to the email and ask them to stop.",
        button: null,
        foot: null,
      };
    case "unavailable":
      return {
        title: "Unsubscribe",
        lead: "That didn't go through.",
        body: "We couldn't record it just now. Try the link again in a minute.",
        button: null,
        foot: null,
      };
  }
}
```

- [ ] Export from `packages/contracts/src/index.ts`. Build, run, pass.

### Task 1.6 — The timeline says it

- [ ] Find the `ConsentChange` builder in `packages/contracts/src/people.ts` (around line 2300, where
  `contact.consent_changed` rows become items). Make sure `purpose: "email_marketing"` reaches `consentChangeWords`
  rather than defaulting to conversational.
- [ ] In `consentChangeWords`, return `{ who: "Email", text: "Unsubscribed from your emails", sub: "Pressed Unsubscribe in an email" }`
  for `purpose === "email_marketing"` with `consent === "opted_out"` and `source === "unsubscribe"`, before the
  other branches.
- [ ] Add a case to the test file that covers `consentChangeWords`: the unsubscribe's words, and the other purposes
  unchanged.
- [ ] If `activity.ts` words `contact.consent_changed` by purpose, give `email_marketing` its own words there too, in
  the same test.

### Task 1.7 — The route (test first)

- [ ] Create `tooling/scripts/tests/unsubscribe-door.test.mjs`:
  - Set `UNSUBSCRIBE_SECRET`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then import
    `apps/dashboard/app/u/[token]/route.ts` and `src/server/unsubscribe.ts` with `setServiceClient()`, the test seam.
    Mint tokens with `signUnsubscribeToken`.
  - GET, bad token: 404, HTML with "This link doesn't work", `cache-control: no-store`, `x-robots-tag: noindex`.
  - GET, good token: 200, and:
    - the business name is read (`tenants`) and escaped (a name of `<b>&` shows as `&lt;b&gt;&amp;`);
    - one `<form method="post">` with a hidden `unsubscribe=yes`;
    - `set_email_marketing` is never called.
  - POST `List-Unsubscribe=One-Click` (urlencoded): the rpc is called once with `p_state: "opted_out"`,
    `p_source: "unsubscribe"` and
    `p_evidence: { channel: "email", via: "one_click", message_id }`; the answer is 200 plain text with no
    `location` header.
  - POST the same as `multipart/form-data`: the same.
  - POST `unsubscribe=yes`: the rpc gets `via: "page"`; the answer is 200 HTML with "You're unsubscribed." and the
    rpc's `business`.
  - POST with neither field: 400, no rpc.
  - POST with a bad token: 400, no rpc.
  - POST where the rpc errors: 503 and "That didn't go through."
  - No response is ever 3xx.
  - With no `UNSUBSCRIBE_SECRET`: GET is 503 "That didn't go through.", POST is 503, and no rpc is called.
- [ ] Create `apps/dashboard/src/server/unsubscribe.ts`:
  - It is `server-only`.
  - `secret()` reads `process.env.UNSUBSCRIBE_SECRET`.
  - `service()` builds the service client the way `consent-page.ts` does, plus a `setServiceClient` seam for tests.
  - `html(status, words, form)` renders a small self-contained page:
    - the `.yes` page's look as inline CSS, with a light and dark palette;
    - `<meta name="robots" content="noindex">`;
    - every interpolation escaped.
  - `text(status, body)` answers plain text.
  - Every response carries `cache-control: no-store`, `x-robots-tag: noindex, nofollow` and
    `referrer-policy: no-referrer`.
  - `unsubscribeGet(token)`:
    1. With no secret, answer 503 `unavailable`.
    2. Verify the token; a bad one is 404 `bad_link`.
    3. Read the business name: `tenants.name` by id, where a failed read is `null`.
    4. Answer 200 `ask` with the form.
  - `unsubscribePost(token, req)`:
    1. With no secret, answer 503.
    2. Refuse a body over 4 KB (by content-length) with 413.
    3. Read `formData()`, catching a bad body as 400.
    4. `oneClick` is `List-Unsubscribe` equal to `One-Click`; `pressed` is `unsubscribe` equal to `yes`. Neither is
       400.
    5. Verify the token; a bad one is 400. A pressed bad token also shows the `bad_link` page.
    6. Call `rpc("set_email_marketing", …)`. An error is logged as
       `console.error("unsubscribe_not_recorded", JSON.stringify({ tenant, message, error }))` and answered 503.
    7. One click answers `text(200, "Unsubscribed.")`; a press answers the `done` page with the rpc's `business`.
- [ ] Create `apps/dashboard/app/u/[token]/route.ts`:

```ts
/**
 * /u/<token> — the unsubscribe link every campaign email carries (RFC 8058). GET shows one button and changes
 * nothing: link scanners fetch every URL in an email. POST is the mail client's one click or that button, and
 * either records the stop in the same response, with no redirect, no cookie and no sign-in. The token is the
 * authority (packages/channels unsubscribe-token.ts); all it can do is narrow what may be sent.
 */
import { unsubscribeGet, unsubscribePost } from "@/server/unsubscribe";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return unsubscribeGet((await ctx.params).token);
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return unsubscribePost((await ctx.params).token, req);
}
```

- [ ] `apps/dashboard/proxy.ts`: `PUBLIC_PREFIXES = ["/yes/", "/b/", "/.well-known/", "/u/"]`. Extend the comment:
  `/u/` carries a token, not a slug. It is the one public route that takes input. Its only write is a person's own
  "stop", made under a key only we hold, and a GET changes nothing.
- [ ] `tooling/scripts/tests/auth-gate.test.mjs`:
  - pin `["/yes/", "/b/", "/.well-known/", "/u/"]`, with a paragraph beside the others that argues it;
  - pin `app/u` to exactly `["[token]"]` and `app/u/[token]` to exactly `["route.ts"]`;
  - grep the rest of the file for any list of non-`/api/v1` route files, and add `/u/[token]` there.
- [ ] `apps/dashboard/.env.example`: add `UNSUBSCRIBE_SECRET=` with a comment:
  - it signs the unsubscribe link in every campaign email;
  - set the same value on the edge (Part 3 mints with it);
  - generate it with `openssl rand -base64 32`;
  - without it, the page answers "That didn't go through."
- [ ] Run the door test, `env-manifest.test.mjs` and `auth-gate.test.mjs`. Expect a pass.

### Task 1.8 — Whole-repo checks, the push, the PR

- [ ] Run `corepack pnpm --filter "./packages/*" build`, then restore the dist drift that is CRLF-only (memory:
  dists bundle each other); `node tooling/scripts/check-dist.mjs` says in sync.
- [ ] Run `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`: all green.
- [ ] Run `node tooling/scripts/tests/migrations.test.mjs` and re-list production's ledger head
  (`db query --linked`); 00174 must still be free.
- [ ] Open the PR; one combined review; fix.
- [ ] `db push --linked --dry-run` lists only 00174; then `db push --linked --yes`; read back the column, the
  function and the ledger head.
- [ ] Merge on green (squash, delete the branch).

PR text: what changes for a customer (nothing visible yet: no email carries the link until Part 3); what to set
(`UNSUBSCRIBE_SECRET` on the dashboard; 00174 applied before the merge); deploy order (either: no link exists to
be pressed).

---

## PR 2 — A workspace's own domains, watched

Branch `reach-out-2b-domains` from main after PR 1 merges.

### Files

- Create `supabase/migrations/00175_a_workspace_sends_from_its_own_domains.sql`: the table, the clock.
- Create `packages/contracts/src/sending-domains.ts`: the sets, the rules, the ramp, the judge, the words. Export from
  the index.
- Modify `packages/contracts/src/schema-sets.ts` and `schema-sets.generated.ts`: three sets.
- Modify `packages/contracts/src/enums.ts` and `activity.ts`: five event kinds, with words.
- Create `packages/channels/src/email-domains.ts`: the provider's domain API, and `dmarcOf`. Export it.
- Create `packages/db/src/repositories/sending-domains.ts`: every read and write of the table. Export it.
- Modify `packages/db/src/database.types.ts`: generated.
- Modify `packages/db/src/realtime.ts`: the table is watched.
- Create `apps/edge/lib/email/dmarc.ts`: the DNS read, with its test seam.
- Create `apps/edge/lib/email/sending-domains.ts`: add, check, remove, and telling the owner.
- Create `apps/edge/api/admin/sending-domains.ts`: the door the dashboard calls.
- Create `apps/edge/api/cron/domains.ts`: the sweep.
- Modify `apps/edge/vercel.json`: both functions listed.
- Modify `apps/edge/lib/env.ts` and `apps/edge/.env.example`: `RESEND_COLD_API_KEY`.
- Modify `tooling/scripts/delete-tenant.mjs`: `sending_domains`, and a printed reminder of the provider ids to remove.
- Tests:
  - create `sending-domains.test.mjs` (contracts);
  - create `email-domains.test.mjs` (channels);
  - create `edge-dmarc.test.mjs`;
  - create `admin-sending-domains-door.test.mjs`;
  - create `cron-domains-door.test.mjs`;
  - modify `sweep-registry.db.test.mjs`, `sweep-health.integration.test.mjs` (three lists), `tenancy.db.test.mjs`,
    `delete-tenant.test.mjs` if it pins `TABLES`, and the realtime list test.

### Task 2.1 — The migration

- [ ] Write `supabase/migrations/00175_a_workspace_sends_from_its_own_domains.sql`:

```sql
-- 00175 · A workspace sends cold email from domains it owns.
--
-- Reach out, Part 2 (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.6, §4.8): a reach-out leaves only from
-- a domain the business owns, several per workspace, each with its own identity, ramp and health. The edge creates
-- each at the cold mail account and writes this row; the account's key never reaches the dashboard. A ten-minute
-- clock reads each domain's verification and DMARC, and holds one that stops passing. A held domain sends nothing
-- (the send door, PR 4).
--
--   sending_domains   who it sends as, the records to publish, where it stands. Members read; the service role writes.
--   the domains clock every ten minutes, asking the edge only when a domain is being checked or can send.

create table if not exists public.sending_domains (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  -- getbestmovers.com: lower-case, a registrable name or a subdomain; unique across the platform, so a domain is
  -- one workspace's until it is removed.
  host               text not null
                       check (char_length(host) between 4 and 253
                              and host ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  -- sam -> sam@getbestmovers.com, and the name beside it.
  from_local         text not null check (char_length(from_local) <= 40 and from_local ~ '^[a-z0-9]+([.-][a-z0-9]+)*$'),
  from_name          text not null check (char_length(btrim(from_name)) between 1 and 80),
  -- The mail provider's id. Null only between the reservation and the provider's answer, which the edge writes in
  -- the same request or removes the row.
  provider_domain_id text,
  -- The records to publish, as the provider returned them ({label, type, name, value, priority, status}).
  records            jsonb not null default '[]'::jsonb check (jsonb_typeof(records) = 'array'),
  state              text not null default 'records' check (state in ('records', 'verifying', 'verified', 'held')),
  -- The provider's own word, as it arrived; judged in contracts (sending-domains.ts judgeDomain).
  provider_status    text,
  -- A DMARC record at the host or a parent: found, missing, or null when never read.
  dmarc              text check (dmarc in ('found', 'missing')),
  held_why           text check (held_why in ('verification', 'dmarc', 'bounces', 'complaint')),
  held_at            timestamptz,
  verified_at        timestamptz,
  -- Since when it has been sending without trouble: the ramp's clock (contracts domainDailyCap).
  clean_since        timestamptz,
  checked_at         timestamptz,
  created_by         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint sending_domains_held_is_whole check ((state = 'held') = (held_why is not null and held_at is not null)),
  constraint sending_domains_sending_is_dated
    check (state not in ('verified', 'held') or (verified_at is not null and clean_since is not null))
);

create unique index if not exists sending_domains_host_uq on public.sending_domains (host);
create unique index if not exists sending_domains_provider_uq on public.sending_domains (provider_domain_id)
  where provider_domain_id is not null;
create index if not exists sending_domains_tenant on public.sending_domains (tenant_id, created_at);
create index if not exists sending_domains_due on public.sending_domains (checked_at nulls first)
  where state in ('verifying', 'verified', 'held');

drop trigger if exists sending_domains_set_updated_at on public.sending_domains;
create trigger sending_domains_set_updated_at
  before update on public.sending_domains
  for each row execute function extensions.moddatetime('updated_at');

alter table public.sending_domains enable row level security;
drop policy if exists sending_domains_member_select on public.sending_domains;
create policy sending_domains_member_select on public.sending_domains
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
comment on table public.sending_domains is
  'The domains a workspace sends cold email from (Reach out): the identity, the provider''s records, and where each stands. Members read; the service role writes (apps/edge lib/email/sending-domains.ts).';

-- A domain checked, verified or held by the sweep repaints Connections (packages/db realtime.ts). Re-runnably, as
-- 00169 adds its lists.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sending_domains'
  ) then
    alter publication supabase_realtime add table public.sending_domains;
  end if;
end $$;

/* ----------------------------------------------------------- the clock -- */

create or replace function public.trigger_domains_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.sending_domains d where d.state in ('verifying', 'verified', 'held')) then
    return public.request_sweep('domains', '/api/cron/domains', 65000);
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('domains', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_domains_sweep() from public, anon, authenticated;
comment on function public.trigger_domains_sweep() is
  'The domains clock (Reach out). Calls the edge (/api/cron/domains) only when a domain is being checked or can send; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every ten minutes, recording itself each time: forty minutes is four missed ticks.
  ('domains', 'domains-sweep', interval '40 minutes', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

-- Minutes 2, 12, … 52: off the health check's grid (13, 43), the five-minute clocks, the lines sweep and the
-- stale-jobs sweep.
select cron.unschedule('domains-sweep') where exists (select 1 from cron.job where jobname = 'domains-sweep');
select cron.schedule('domains-sweep', '2,12,22,32,42,52 * * * *', $$select public.trigger_domains_sweep()$$);
```

- [ ] Replay in a rolled-back transaction. Expected: no error, and `trigger_domains_sweep()` returns null on an empty
  table.

### Task 2.2 — contracts: the rules, the ramp, the judge, the words (test first)

- [ ] `tooling/scripts/tests/sending-domains.test.mjs` cases:
  - `whyNotASendingHost`:
    - null for `getbestmovers.com` and `mail.getbestmovers.co.uk`;
    - a sentence each for: empty; a scheme or path (`https://x.com/a`); `www.` in front; a free-mail domain
      (`gmail.com`); the platform's mail domain or its parent (given `mail.chanlytics.com`: that, and
      `chanlytics.com`); no dot; a bad label; over 253 characters.
  - `whyNotAFromLocal`:
    - null for `sam` and `sam.lee`;
    - a sentence each for: empty; over 40 characters; `noreply`; `postmaster`; a leading dot; `sam..lee`; a space.
  - `domainDailyCap(null)` is 0. From `clean_since`:
    - day 0 is 30, and day 13.9 is still 30;
    - day 14 is 100, and day 29.9 is still 100;
    - day 30 is 200.
  - `judgeDomain`, one case per transition in the table below, plus:
    - an unreadable provider (`null`) changes nothing;
    - an unreadable DMARC (`null`) never holds, and never verifies.
  - `sendingDomainWords` for each state:
    - the pill and tone;
    - the line, with the provider's `failed`, and with DMARC missing;
    - the cap and next-ramp words for verified at 3, 20 and 40 clean days;
    - the held words for each of the four reasons;
    - no sentence contains `undefined` or `null`.
- [ ] Create `packages/contracts/src/sending-domains.ts`:

```ts
/**
 * A workspace's own sending domains: what may be added, the ramp, how a domain's facts become its state, and what
 * the Connections row says. Pure; the edge (lib/email/sending-domains.ts) reads the facts and writes the row, the
 * page (integrations-real.jsx) draws these words (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.6, §4.8).
 */
import type { Tone } from "./tone";

export const SENDING_DOMAIN_STATES = ["records", "verifying", "verified", "held"] as const;
export type SendingDomainState = (typeof SENDING_DOMAIN_STATES)[number];
export const DOMAIN_HOLDS = ["verification", "dmarc", "bounces", "complaint"] as const;
export type DomainHold = (typeof DOMAIN_HOLDS)[number];
export const DMARC_STATES = ["found", "missing"] as const;
export type DmarcState = (typeof DMARC_STATES)[number];

/** The holds that lift themselves when the domain reads good again; the rest wait for the owner (PR 5). */
export const DNS_HOLDS: readonly DomainHold[] = ["verification", "dmarc"];

export const SENDING_DOMAINS_MAX = 5;
/** What we recommend when a domain has no DMARC: accepted by Gmail and Yahoo, and harmless to other mail it sends. */
export const DMARC_RECOMMENDED = "v=DMARC1; p=none;";

/** The ramp (decision 8): per domain, by clean days. */
export const DOMAIN_RAMP: ReadonlyArray<{ days: number; perDay: number }> = [
  { days: 0, perDay: 30 },
  { days: 14, perDay: 100 },
  { days: 30, perDay: 200 },
];

const DAY_MS = 86_400_000;

export function cleanDays(cleanSince: string | null, nowMs: number): number {
  if (!cleanSince) return 0;
  return Math.max(0, Math.floor((nowMs - Date.parse(cleanSince)) / DAY_MS));
}

/** How many a day this domain may send: 0 until it is verified; the ramp's step by clean days after. */
export function domainDailyCap(cleanSince: string | null, nowMs: number): number {
  if (!cleanSince) return 0;
  const days = (nowMs - Date.parse(cleanSince)) / DAY_MS;
  let cap = 0;
  for (const step of DOMAIN_RAMP) if (days >= step.days) cap = step.perDay;
  return cap;
}

/** Free mail: nobody can publish records there, and a cold email from one is the spam it looks like. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com",
  "yandex.com", "mail.com",
]);

export function normalizeHost(typed: string): string {
  return typed.trim().toLowerCase().replace(/\.$/, "");
}

const HOST = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Why this cannot be a sending domain, in a sentence; null when it can (whether it is free is the table's to say). */
export function whyNotASendingHost(typed: string, platform: { mailDomain: string | null }): string | null {
  const h = normalizeHost(typed);
  if (!h) return "Write the domain you'll send from, like getyourbusiness.com.";
  if (/[/:@\s]/.test(h)) return "Write the domain alone, like getyourbusiness.com: no https://, no address, no path.";
  if (h.startsWith("www.")) return "Write the domain without www.";
  if (h.length > 253 || !HOST.test(h)) return "That isn't a domain name. It looks like getyourbusiness.com.";
  if (FREE_MAIL_DOMAINS.has(h)) return `${h} is free mail: nobody can add records to it. Use a domain you own.`;
  const mine = platform.mailDomain?.toLowerCase() ?? null;
  const parent = mine ? mine.split(".").slice(-2).join(".") : null;
  if (mine && (h === mine || h === parent || h.endsWith(`.${parent}`)))
    return "That domain is Chanlytics' own. Use a domain your business owns.";
  return null;
}

const RESERVED_FROM: ReadonlySet<string> = new Set(["r", "postmaster", "abuse", "mailer-daemon", "noreply", "no-reply"]);

export function normalizeFromLocal(typed: string): string {
  return typed.trim().toLowerCase();
}

/** Why this cannot be the part before the @, in a sentence; null when it can. */
export function whyNotAFromLocal(typed: string): string | null {
  const s = normalizeFromLocal(typed);
  if (!s) return "Write the part before the @, like your first name.";
  if (s.length > 40) return "Keep it to 40 characters or fewer.";
  if (!/^[a-z0-9]+([.-][a-z0-9]+)*$/.test(s)) return "Use letters and numbers, with dots or hyphens between them.";
  if (RESERVED_FROM.has(s)) return `“${s}” is kept for the mail system. Use a name people can write back to.`;
  return null;
}

export interface DomainRecord {
  /** The provider's group for it: SPF, DKIM, or the return path's MX. */
  label: string;
  type: string;
  name: string;
  value: string;
  priority: number | null;
  status: string;
}

/** A sending domain as the page is told about it (dashboard server/sending-domains.ts). No provider id. */
export interface SendingDomainDto {
  id: string;
  host: string;
  from_local: string;
  from_name: string;
  /** sam@getbestmovers.com. */
  address: string;
  state: SendingDomainState;
  held_why: DomainHold | null;
  held_at: string | null;
  verified_at: string | null;
  clean_since: string | null;
  provider_status: string | null;
  dmarc: DmarcState | null;
  records: DomainRecord[];
  checked_at: string | null;
  created_at: string;
}

/** What the edge just read: the provider's word (null: could not ask) and DMARC (null: could not read). */
export interface DomainFacts {
  provider: string | null;
  dmarc: DmarcState | null;
}

export type DomainRowState = Pick<SendingDomainDto, "state" | "held_why" | "held_at" | "verified_at" | "clean_since">;

export interface DomainJudgement extends DomainRowState {
  /** What changed, for the event and the owner; null when nothing did. */
  change: null | "verified" | "held" | "released";
}

const CHECKING: ReadonlySet<string> = new Set(["pending", "temporary_failure", "partially_verified"]);

/**
 * The next state, from the row and what was just read. The table:
 *   records|verifying  provider verified + DMARC found      → verified (clean from now)       change "verified"
 *                      provider verified + DMARC missing    → records
 *                      provider pending/partly/temporarily  → verifying
 *                      anything else                        → records
 *   verified           provider not verified                → held, verification            change "held"
 *                      DMARC missing                        → held, dmarc                   change "held"
 *   held (DNS)         provider verified + DMARC found      → verified (clean from now)       change "released"
 *   held (reputation)  unchanged: only the owner resumes it (PR 5).
 * An unreadable provider changes nothing, and an unreadable DMARC neither holds nor verifies: "we could not look"
 * is not a fact about the domain.
 */
export function judgeDomain(row: DomainRowState, facts: DomainFacts, nowIso: string): DomainJudgement {
  const same: DomainJudgement = { ...row, change: null };
  if (facts.provider === null) return same;
  const verified = facts.provider === "verified";
  if (row.state === "records" || row.state === "verifying") {
    if (verified && facts.dmarc === "found")
      return { state: "verified", held_why: null, held_at: null, verified_at: nowIso, clean_since: nowIso, change: "verified" };
    if (verified) return facts.dmarc === "missing" ? { ...same, state: "records" } : same;
    return { ...same, state: CHECKING.has(facts.provider) ? "verifying" : "records" };
  }
  if (row.state === "verified") {
    if (!verified) return { ...row, state: "held", held_why: "verification", held_at: nowIso, change: "held" };
    if (facts.dmarc === "missing") return { ...row, state: "held", held_why: "dmarc", held_at: nowIso, change: "held" };
    return same;
  }
  // held
  if (row.held_why && DNS_HOLDS.includes(row.held_why) && verified && facts.dmarc === "found")
    return { ...row, state: "verified", held_why: null, held_at: null, clean_since: nowIso, change: "released" };
  return same;
}

const HOLD_WORDS: Record<DomainHold, string> = {
  verification: "it stopped verifying",
  dmarc: "its DMARC record is missing",
  bounces: "bounces passed 2%",
  complaint: "someone marked an email from it as spam",
};

export interface SendingDomainWords {
  pill: string;
  tone: Tone;
  /** The line under the host. */
  line: string;
  /** The right-hand column: the cap, or that it is not sending. */
  cap: string;
  /** What comes next, when anything does. */
  next: string | null;
}

export function sendingDomainWords(d: SendingDomainDto, nowMs: number): SendingDomainWords {
  const who = `${d.from_name} · ${d.address}`;
  if (d.state === "records") {
    const line =
      d.provider_status === "verified" && d.dmarc === "missing"
        ? "SPF and DKIM pass. Add the DMARC record below, then Check."
        : d.provider_status === "failed" || d.provider_status === "partially_failed"
          ? "The records weren't found. Check each one below at your registrar, then Check again."
          : "Add the records below at your registrar, then Check.";
    return { pill: "Records to add", tone: "warn", line, cap: "Not sending yet", next: null };
  }
  if (d.state === "verifying")
    return {
      pill: "Checking",
      tone: "info",
      line: "Checking the records. It usually takes minutes, and can take a few hours.",
      cap: "Not sending yet",
      next: null,
    };
  if (d.state === "verified") {
    const days = cleanDays(d.clean_since, nowMs);
    const cap = domainDailyCap(d.clean_since, nowMs);
    const step = DOMAIN_RAMP.find((s) => s.perDay > cap);
    return {
      pill: "Verified",
      tone: "ok",
      line: `${who} · ${days} clean day${days === 1 ? "" : "s"}`,
      cap: `Up to ${cap} a day`,
      next: step ? `${step.perDay} a day after ${step.days} clean days` : null,
    };
  }
  const why = d.held_why ? HOLD_WORDS[d.held_why] : "it was held";
  const since = d.held_at ? new Date(d.held_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return {
    pill: "Held",
    tone: "warn",
    line: `${since ? `Held since ${since}` : "Held"} · ${why}`,
    cap: "Sending nothing",
    next:
      d.held_why && DNS_HOLDS.includes(d.held_why)
        ? "Nothing leaves from it until Check passes."
        : "Nothing leaves from it until you resume it.",
  };
}
```

- [ ] Hold `SENDING_DOMAIN_STATES`, `DOMAIN_HOLDS` and `DMARC_STATES` to their `SchemaSet`s in `schema-sets.ts`.
  Regenerate `schema-sets.generated.ts` and `database.types.ts`.
- [ ] Add the event kinds to `EVENT_KINDS` (`enums.ts`), with words in `activity.ts`:
  - `sending_domain.added` → "Added <host> to send from"
  - `sending_domain.verified` → "<host> is verified"
  - `sending_domain.held` → "<host> was held: <why>"
  - `sending_domain.released` → "<host> is sending again"
  - `sending_domain.removed` → "Removed <host>"

  Adjust `activity.test.mjs`'s `TONED_KINDS` if the held kind is toned.
- [ ] Build, run, pass.

### Task 2.3 — channels: the provider's domain API (test first)

- [ ] `tooling/scripts/tests/email-domains.test.mjs`, with `fetch` stubbed:
  - `createMailDomain(cfg, "getx.com")`:
    - POSTs `https://api.resend.com/domains` with the bearer key and a JSON body of exactly
      `{ name, region: "us-east-1", open_tracking: false, click_tracking: false, capabilities: { sending: "enabled", receiving: "disabled" } }`;
    - reads Resend's documented answer into `{ ok: true, domain: { id, name, status, records } }`, where records are
      `{label, type, name, value, priority, status}`;
    - a 422 answers `{ ok: false, status: 422, message }` with the provider's message;
    - a network error answers `status: 0`.
  - `getMailDomain`:
    - 200 gives the domain;
    - 404 gives `{ ok: true, domain: null }`;
    - 500 gives `{ ok: false }`.
  - `verifyMailDomain` POSTs `/domains/{id}/verify`.
  - `removeMailDomain` DELETEs, and treats 404 as gone.
  - `dmarcOf`:
    - `[["v=DMARC1; p=none;"]]` is found, and so is a record split into chunks;
    - `[["v=spf1 …"]]` is missing, and so is `[]`;
    - case-insensitive `V=dmarc1` is found.
- [ ] Create `packages/channels/src/email-domains.ts`:
  - `createMailDomain`, `getMailDomain`, `verifyMailDomain` and `removeMailDomain` never throw, like `postEmail`:
    - each returns `{ ok: true, … } | { ok: false, status, message }`;
    - each carries a 15 s `AbortSignal.timeout`;
    - `message` is the provider's `message` field, else the text sliced to 200.
  - `providerDomainFrom(body)` parses and validates: an id and name are required; records that are not objects are
    dropped.
  - `dmarcOf(txt: string[][])` joins each record's chunks and tests `/^v=DMARC1\s*(;|$)/i`.
  - `DomainRecord` is imported as a type from `@chanlytics/contracts`.
  - Its head comment says: the cold account's key only; tracking off explicitly, because the provider's example
    turns opens on.
- [ ] Export it. Build, run, pass.

### Task 2.4 — db: the repository

- [ ] Create `packages/db/src/repositories/sending-domains.ts` (the one place the table is typed):
  - `type SendingDomainRow`.
  - `sendingDomainsOf(db, tenantId)`: ordered by `created_at`.
  - `sendingDomainOf(db, tenantId, id)`: a `maybeSingle` scoped by tenant.
  - `dueSendingDomains(db, limit)`: `state in (verifying, verified, held)`, ordered by `checked_at` ascending with
    nulls first.
  - `countSendingDomains(db, tenantId)`: `count: exact, head: true`.
  - `reserveSendingDomain(db, {tenantId, host, fromLocal, fromName, by})` → `{ok:true,row} | {ok:false,reason:"taken"}`.
    A `23505` is `taken`; any other error throws.
  - `recordProviderDomain(db, id, {providerDomainId, records, providerStatus})` returns the row.
  - `applyDomainCheck(db, row, patch)`: an update `where id = row.id and updated_at = row.updated_at`, which returns
    the new row, or null when another writer got there first.
  - `deleteSendingDomain(db, tenantId, id)` returns a boolean.

  Every error throws with the table's name in it, as `repositories/email.ts` does.
- [ ] Export it from `packages/db/src/index.ts`. Add `{ table: "sending_domains", event: "*" }` to `WATCHED` in
  `realtime.ts`, with a one-line reason: a domain checked, verified or held by the sweep repaints Connections. Update
  the realtime list test if it pins `WATCHED`.

### Task 2.5 — The edge: DMARC, the logic, the door, the sweep (tests first)

- [ ] `tooling/scripts/tests/edge-dmarc.test.mjs`. `readDmarc(host, resolve)`, with a stub resolver, cases:
  - found at `_dmarc.<host>`;
  - found only at the parent (`mail.x.com` → `_dmarc.x.com`);
  - ENODATA/ENOTFOUND everywhere is `missing`;
  - ETIMEOUT at the first name is `null`;
  - never asks `_dmarc.com` (it stops at two labels).
- [ ] Create `apps/edge/lib/email/dmarc.ts`:

```ts
/**
 * Whether a sending domain has a DMARC record: at the host, else at a parent down to two labels (RFC 7489's
 * organisational fallback, approximated without the public suffix list). Presence is the rule (decision 8 of the
 * plan); "could not read" is null and is never read as missing.
 */
import { Resolver } from "node:dns/promises";
import { dmarcOf } from "../packages/channels.js";

export type TxtResolver = (name: string) => Promise<string[][]>;

let resolver: TxtResolver = (name) => {
  const r = new Resolver({ timeout: 3000, tries: 2 });
  return r.resolveTxt(name);
};

/** For tests: the resolver every read uses. */
export function setTxtResolver(r: TxtResolver): void {
  resolver = r;
}

export async function readDmarc(host: string, resolve: TxtResolver = resolver): Promise<"found" | "missing" | null> {
  const labels = host.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const name = `_dmarc.${labels.slice(i).join(".")}`;
    try {
      if (dmarcOf(await resolve(name)) === "found") return "found";
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "ENODATA" && code !== "ENOTFOUND") return null;
    }
  }
  return "missing";
}
```

  Check that `apps/edge/lib/packages/channels.js` re-exports `dmarcOf`. The edge imports the packages through
  `lib/packages/*`; add the export there if that file lists names.
- [ ] `tooling/scripts/tests/admin-sending-domains-door.test.mjs`, a world over `_fake-db.mjs` with `fetch` and DNS
  stubbed. The key's absence is set with `withEnv`. Cases:
  - Auth: no token or key is 403; a token for another workspace is 403 `workspace_mismatch`.
  - `status`: `{ok:true, ready:false}` without `RESEND_COLD_API_KEY`, and `ready:true` with it.
  - `add`, refused before the provider is asked:
    - every other op without the key is 503 `no_cold_key`;
    - a bad host, a bad local part or a bad name is 400 with contracts' sentence;
    - a sixth domain is 409 `too_many`;
    - a host another workspace holds is 409 `host_taken`, with the sentence "Another workspace already sends from
      that domain.";
    - in none of these was the provider asked.
  - `add`, when the provider refuses: 502 with the provider's message, and the reserved row is deleted.
  - `add`, success:
    - the row holds the provider's id, records and status, in state `records`;
    - one `sending_domain.added` event;
    - the answer is the DTO, with no provider id.
  - `check`:
    - verify is POSTed, then the domain is GET;
    - DMARC is read and the judge applied;
    - verified plus found gives state `verified` and one `sending_domain.verified` event;
    - the owner is told nothing (decision 13);
    - another workspace's domain id is 404.
  - `remove`:
    - the provider's DELETE is called, and a 404 from it still removes the row;
    - the row is deleted, with one `sending_domain.removed` event;
    - a provider 500 is 502 and keeps the row.
- [ ] `tooling/scripts/tests/cron-domains-door.test.mjs` over `_cron-doors-world.mjs`. Cases:
  - `refusedAtTheDoor(POST, "domains", setPg)`.
  - Without the cold key: 503 `no_cold_key`.
  - Only due rows are read; `records` rows are never asked about.
  - A verified domain whose provider now says `temporary_failure`:
    - it is held for `verification`, with one `sending_domain.held` event;
    - one notification of kind `sweep`, route `admin/integrations`, whose subject names the host and the reason
      (from the `notify` capture of the Resend call in `_cron-doors-world.mjs`).
  - A held-for-DMARC domain that reads good is released: `clean_since` moves, and one `sending_domain.released`
    event.
  - A DNS timeout leaves a verified domain verified.
  - A provider 500 on every row answers 503 `no_domain_readable`. One row readable among unreadable ones answers 200
    with the counts.
  - `checked_at` is stamped on every row the sweep read.
  - A row changed by another writer between the read and the write (`applyDomainCheck` returns null) is left alone.
- [ ] Create `apps/edge/lib/email/sending-domains.ts`:
  - `domainDto(row)`: the address is `${from_local}@${host}`; there is no provider id.
  - `addSendingDomain(ports, input)`.
  - `checkSendingDomain(ports, row, { verify })`.
  - `removeSendingDomain(ports, row)`.
  - `tellDomainHeld(db, row, why)`: `loadTenantNotifications` plus `notify` with:
    - kind `sweep`, route `admin/integrations`, about `{type: "sending_domain", id}`;
    - subject `${host} is held: ${why words}`;
    - body: why, then "Nothing leaves from it until it's fixed. Connections has the details.";
    - redactedBody "A workspace's sending domain was held."
  - `ports = { db, cfg, dmarc, now, log }`. Events go through `emitEvent(db, tenant, kind, "setup", "sending_domain", id, data)`.
- [ ] Create `apps/edge/api/admin/sending-domains.ts`, in the shape of `admin/lines.ts`:
  1. `authorizeAdmin(request, "/api/admin/sending-domains")`, then `workspaceFor`.
  2. `op: status` answers before any key check.
  3. The other ops need `RESEND_COLD_API_KEY` (503 `no_cold_key`), `pg()` (503 `no_database`) and a uuid
     `tenant_id` (400).
  4. `add` takes `{host, from_local, from_name, user_id}`; `check` and `remove` take `{domain_id}`.

  Answers are `{ ok: true, domain }` or `{ ok: false, error, message }`.
- [ ] Create `apps/edge/api/cron/domains.ts`, in the shape of `cron/registrations.ts`:
  - `config = { maxDuration: 60 }`, `MAX_PER_TICK = 30`, five at a time;
  - the flow: `logger({ sweep: "domains" })`, then `pg()`, then `authorizeCron`, then the cold key, then
    `dueSendingDomains`;
  - each row goes through `checkSendingDomain(…, { verify: false })`, in a try/catch;
  - log `domains_swept` with `{checked, moved, held, released, unreadable}`;
  - every row unreadable answers 503; otherwise 200.
- [ ] `apps/edge/vercel.json`: `"api/cron/domains.ts": { "maxDuration": 60 }` and `"api/admin/sending-domains.ts": { "maxDuration": 30 }`.
- [ ] `env.ts`: `get RESEND_COLD_API_KEY() { return read(process.env.RESEND_COLD_API_KEY); }`, commented: the cold
  mail account's key; own domains and reach-outs only, so one tenant's cold mail cannot touch anyone's reminders.
  `.env.example`: the same line and comment.
- [ ] Run the four new test files and `env-manifest`/`edge-env`. Pass.

### Task 2.6 — The registers every clock and tenant table is held to

- [ ] Add `domains: "domains-sweep"` to `EVERY_CLOCK` in `sweep-registry.db.test.mjs`, with a comment: the domains
  clock, ten minutes, asks the edge only when a domain is being checked or can send.
- [ ] Add `"domains"` to both sorted lists in `sweep-health.integration.test.mjs`, and `"domains-sweep"` to its
  schedules list.
- [ ] In `tenancy.db.test.mjs`, seed a `sending_domains` row for workspace A, and add the stranger case in the shape
  of `mailboxes`.
- [ ] `delete-tenant.mjs`:
  - add `"sending_domains"` to `TABLES` in dependency order;
  - add a printed line per row: "remove <host> (<provider id>) from the cold mail account by hand";
  - update its test if it pins `TABLES`.
- [ ] Run the database suites on a stack with 00175: sweep registry, sweep health, tenancy, privileges and schema
  sets. Pass.

### Task 2.7 — Whole-repo checks, the push, the PR

- [ ] Build, restore the CRLF-only dist drift, check-dist, typecheck, lint, test.
- [ ] Check production's ledger; open the PR; one combined review; fix.
- [ ] Dry-run, push 00175, read it back; merge on green.

PR text:
- What changes for a customer: nothing visible; the door has no caller until PR 3.
- What to set: `RESEND_COLD_API_KEY` on the edge; 00175 applied.
- Deploy order: either. The clock asks the edge only once a domain row exists, and only the door can make one.

---

## PR 3 — Connections › Email: Domains you send from

Branch `reach-out-2c-domains-page` from main after PR 2 merges.

### Files

- Create `apps/dashboard/src/server/sending-domains.ts`:
  - `edgeDomains()`, like `edgeGoogle`, behind `deployment.providersLive`;
  - `domainsReadiness()`, cached 5 min when ready and 30 s when not, like `linesStatus`;
  - `sendingDomainsFor(db, tenantId)`: an RLS read with explicit columns, to DTOs;
  - the three verbs, mapping the edge's answers to `AppError` sentences.
- Create `apps/dashboard/app/api/v1/sending-domains/route.ts` (POST add). Body
  `z.object({ host: z.string().max(253), from_local: z.string().max(64), from_name: z.string().max(200) }).strict()`;
  `write({ scope: workspace, role: "owner", rate: "settings", input: Body, … })`.
- Create `apps/dashboard/app/api/v1/sending-domains/[id]/route.ts` (DELETE), with the same policy.
- Create `apps/dashboard/app/api/v1/sending-domains/[id]/check/route.ts` (POST), with the same policy.
- Modify `tooling/scripts/tests/route-policy.json`: the three rows. Regenerate `apps/dashboard/src/client/routes.generated.ts`.
- Modify `packages/contracts/src/mailbox.ts`: `EmailSetupDto` gains
  `sending: { ready: boolean; domains: SendingDomainDto[] } | null`, which is null when email is off here.
- Modify `apps/dashboard/src/server/email.ts`: `emailSetupFor` fills `sending` in parallel with the mailbox read.
- Create `apps/dashboard/src/legacy-bridge/sending-domains.ts`: `window.__sendingDomains = { add, check, remove, whyNotAHost, whyNotAFromLocal, words, max }`.
  Install it in `LegacyApp.tsx`.
- Modify `apps/dashboard/src/legacy-bridge/refresh-map.ts`: the three routes refresh setup.
- Modify the setup surface's `refreshOnTables`, adding `sending_domains`; update its pin in `setup.test.mjs:914`.
- Modify `apps/dashboard/src/legacy/pages/integrations-real.jsx`: the `SendingDomains` block under the Email row.
- Modify `apps/dashboard/src/legacy/styles/settings.css`: `.set-domains`, `.set-dom` and `.set-records`, from the
  canvas's `css3.mjs` lines 245–268 and its phone rule at 527, on the product's tokens.
- Modify `manifest.ts` and `Chanlytics.html`: bump `?v=` on both edited files.
- Tests:
  - create `sending-domain-routes.test.mjs`, in the shape of `mailbox-routes.test.mjs`;
  - modify `settings-doors.test.mjs` (the harness);
  - modify `setup.test.mjs`.

### Task 3.1 — The routes (test first)

- [ ] `sending-domain-routes.test.mjs`:
  - Each route's declared policy matches `route-policy.json`.
  - An operator is refused (403) before the edge is asked.
  - The body is strict: an extra key is 400.
  - The edge's answers become sentences:
    - `no_cold_key` → 409 "Sending from your own domain isn't switched on here yet.";
    - `host_taken` → 409, with the edge's sentence;
    - `too_many` → 409 "A workspace sends from five domains at most.";
    - the provider's refusal → 502, carrying its message;
    - `preview` → 409 "Domains can't be added from a preview.".
  - A success returns `{ domain }`.
  - `emailSetupFor` returns `sending: null` when email is off, and `{ ready, domains }` when it is on. The domains come
    from `sending_domains` via RLS, with no `provider_domain_id` column selected.
- [ ] Implement it. Regenerate the typed client; `gen-route-types --check` is clean.

### Task 3.2 — The block (the canvas's board 11, on real data)

- [ ] Harness cases in `settings-doors.test.mjs`:
  - The block appears under the Email row only when the mailbox exists and `sending.ready`, or when it already has
    domains.
  - Head: "Domains you send from", with "cold email leaves only from a domain you own · replies come back to
    <mailbox address>".
  - One row per domain:
    - the host in mono;
    - the words' line;
    - the cap column;
    - the pill with its tone;
    - Check on a domain in `records`, `verifying` or a DNS hold;
    - Remove behind a Confirm ("Remove <host>? Nothing more is sent from it; what was sent stays.").
  - The records panel for `records` and `verifying`:
    - each record's label, `name` (shown as `name.host` when the provider gave a relative name), type and value;
    - one Copy each, which flashes "Copied";
    - the DMARC row, whenever `dmarc` is not `found`: `_dmarc.<host>` TXT `v=DMARC1; p=none;`.
  - The foot row:
    - the sentence "Add the records at your registrar, then Check. A new domain starts at 30 a day and grows as the
      days stay clean; a held one sends nothing until it's fixed.";
    - "Add a domain", drawn only while fewer than `SENDING_DOMAINS_MAX`.
  - The add form:
    - three boxes: the domain; the part before the @, with an `@<host>` affix; the name, which defaults to the
      mailbox's `from_name`;
    - the hint "A domain of its own is safest, like get<business>.com: your everyday email stays out of it.";
    - problems under their box from `window.__sendingDomains.why*`;
    - a `conflict` from the server lands under the domain box.
  - The phone rule stacks each row.
  - Buttons are gated to owners through `window.gate("team", …)`.
- [ ] Implement it with `ConnectionRow`'s classes and the canvas markup (`.set-domains`, `.set-dom`, `.set-records`);
  quiet indicators (memory: subtle frontend).
- [ ] Run the real app (`corepack pnpm --filter @chanlytics/dashboard dev`, `/w/<slug>/#/admin/integrations`) with
  `EMAIL_DOMAIN` set and a local edge answering `status: ready`. Screenshot the block with a row in each state
  (seed rows through the service client). Check phone width and dark mode.

### Task 3.3 — Whole-repo checks, the PR

- [ ] Build, check-dist, typecheck, lint, test. Open the PR; one combined review; fix; merge on green.

PR text:
- What changes for a customer: owners see "Domains you send from" under Email on Connections, once
  `RESEND_COLD_API_KEY` is set. They can add a domain, copy its records, press Check, and watch it verify.
- What to set: nothing new.
- Deploy order: after PR 2's edge is live (the page asks the edge's `status`, and an older edge answers 404, which
  reads as not ready).

---

## PR 4 — The door knows outreach

Branch `reach-out-2d-outreach-door` from main after PR 3 merges.

### Files

- Modify `packages/contracts/src/consent.ts`:
  - `SendPurpose` adds `"outreach"`;
  - `PurposeBearing` adds `email_marketing`;
  - `PurposeRefusal` adds `"unsubscribed"`;
  - `mayMessageFor` handles outreach.
- Modify `packages/core/src/deliver.ts`:
  - `WireFacts.contact.email_marketing`;
  - `outreachFacts()`, read only for outreach: a lead linked to the contact, and the sending domain whose host is the
    request's From host;
  - the new refusals;
  - `emailSender(routes)`.
- Modify `packages/channels/src/email.ts`: `sendsAsOwnDomain()` and `ownDomainIdentity()`.
- Modify `apps/edge/lib/email/email.ts`: `emailWireFor` binds the hosted route, plus one cold route per verified own
  domain when the cold key exists.
- Modify `packages/core/src/messages/send.ts`: the purpose line learns outreach; the page keys per account.
- Modify `apps/edge/lib/email/email-ingress.ts` and `api/resend-webhook.ts`: either secret verifies.
- Modify `apps/edge/lib/env.ts` and `.env.example`: `RESEND_COLD_WEBHOOK_SECRET`.
- Modify `packages/jobs/src/handlers.ts`: the payload comment names outreach.
- Tests: `deliver.test.mjs`, `core-send-path.test.mjs`, `email-wire.test.mjs`, the webhook door's test, and the
  consent predicate's test file.

### Task 4.1 — The predicate (test first)

- [ ] Tests for `mayMessageFor(c, "outreach")`:
  - ok for `consent: 'unknown'` with no marketing yes;
  - `opted_out` for dnc, and for `consent: 'opted_out'`;
  - `unsubscribed` for `email_marketing: 'opted_out'`;
  - `proactive` does not demand a yes.

  The other purposes are unchanged: an existing case sweep passes untouched.
- [ ] Implement, after the opted-out line:

```ts
  // Cold email to a business (Reach out): US law lets a business write until it is told to stop (CAN-SPAM), so no
  // recorded yes is asked for. What IS asked: that they did not stop everything, and did not unsubscribe from this
  // business's email. The wire's own rules (email only, a lead, an own domain, the unsubscribe) are the door's.
  if (purpose === "outreach")
    return c.email_marketing === "opted_out" ? { ok: false, reason: "unsubscribed" } : { ok: true, reason: null };
```

### Task 4.2 — The door (test first)

- [ ] `deliver.test.mjs` cases, over a queued email row whose frozen request is built by `buildEmailRequest` with a
  campaign and `ownDomainIdentity`:
  - outreach on sms or whatsapp is refused as `outreach_is_email_only`;
  - `email_marketing: 'opted_out'` is `unsubscribed`, and it outranks a held domain;
  - no lead linked to the contact is `outreach_not_a_lead`;
  - a request without `List-Unsubscribe` (built without a campaign) is `outreach_without_unsubscribe`;
  - From the hosted mailbox address is `outreach_needs_own_domain`;
  - From another workspace's domain is `outreach_needs_own_domain`;
  - From an own domain in `records` or `held` is `sending_domain_not_ready`;
  - an own verified domain with a lead-made contact is sent, through the cold route;
  - each refusal cancels the row with its reason and writes one `message.send_blocked` event;
  - `outreachFacts` is never read for a conversational send (no `leads` or `sending_domains` query in `db.seen`).
- [ ] `emailSender(routes)` cases:
  - the route is chosen by the From address;
  - no route for the From is `request_leaves_as_another_sender`;
  - the chosen route's own `requestLeavesAs` still applies, so a Reply-To that is not the mailbox's is refused;
  - the cold route posts with the cold key.
- [ ] Implement:
  - `DeliveryRefusal` adds `"unsubscribed" | "outreach_is_email_only" | "outreach_not_a_lead" | "outreach_without_unsubscribe" | "outreach_needs_own_domain" | "sending_domain_not_ready"`.
  - `refusalFor` goes in this order:
    1. erased;
    2. sms marketing, then outreach off email;
    3. the email facts (marketing disabled, suppressed, recipient changed);
    4. `mayMessageFor` (opted out, unsubscribed, …);
    5. outreach's wire rules, from `outreachFacts`;
    6. the kind and pause rules as today.
  - `outreachFacts(db, d)`:
    - `leads.select("id").eq("tenant_id").eq("contact_id").limit(1)`, where the contact id comes from the
      conversation's contact;
    - `sending_domains.select("host, state").eq("tenant_id").eq("host", fromHost).maybeSingle()`;
    - `fromHost` is `addressOf(d.email.from)`'s domain;
    - the unsubscribe fact is `!!d.email.headers["List-Unsubscribe"] && d.email.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click"`;
    - a read that fails throws, as `wireFacts` does.
  - `emailSender(routes: EmailRoute[]): Sender | null`: null for no routes; otherwise it finds the route by
    `addressOf(p.email.from)?.address === route.as.address`.
  - In channels:
    - `sendsAsOwnDomain(domain, mailbox, mailDomain)` returns `{ address: \`${from_local}@${host}\`, replyRoutes: sendsAs(mailbox, mailDomain).replyRoutes }`;
    - `ownDomainIdentity(domain, mailbox, mailDomain)` returns
      `{ fromName: domain.from_name, fromAddress, replyTo: replyRouteAddress(mailbox.reply_token, mailDomain) }`,
      which is what Part 3's writer freezes.
  - `emailWireFor`: without a mailbox, null; otherwise the hosted route, plus, when `env.RESEND_COLD_API_KEY` is set,
    one cold route per verified own domain (`sendingDomainsOf`).

### Task 4.3 — The queue and the webhook (test first)

- [ ] `core-send-path.test.mjs`:
  - `purpose: "outreach"` reaches the door as outreach;
  - a template's marketing purpose is not loosened by a payload that says conversational (existing);
  - a daily limit on an outreach send pages `provider_quota:email_outreach` with "Cold email is refused until it
    resets. Replies and reminders are not affected.";
  - a 401 on outreach pages `provider_auth:email_outreach`.
- [ ] The webhook door's test:
  - a receipt signed with `RESEND_COLD_WEBHOOK_SECRET` is applied;
  - one signed with neither is 401;
  - with only the primary secret set, a primary-signed receipt still works.
- [ ] Implement:
  - The purpose line:
    `const purpose: SendPurpose = p.purpose === "outreach" ? "outreach" : p.purpose === "marketing" ? "marketing" : fromTemplate;`.
    Its comment says outreach is its own lane: it cannot loosen anything, because the door refuses it outside its
    rules.
  - The page keys:
    `const account = purpose === "outreach" ? "email_outreach" : "email";`.
  - `planResendEvent` takes `secrets: string[]` and verifies if any verifies.
  - The door passes `[env.RESEND_WEBHOOK_SECRET, env.RESEND_COLD_WEBHOOK_SECRET].filter(Boolean)`.
  - The new env getter and its `.env.example` line.

### Task 4.4 — Whole-repo checks, the PR

- [ ] Build, check-dist, typecheck, lint, test. Open the PR; one combined review; fix; merge on green.

PR text:
- What changes for a customer: nothing yet. No job sends outreach until Part 3.
- What to set: `RESEND_COLD_WEBHOOK_SECRET` before Part 3.
- Deploy order: either, because the purpose is new and nothing sends it.

---

## PR 5 — Bounces and complaints hold a domain

Branch `reach-out-2e-reputation` from main after PR 4 merges.

### Files

- Create `supabase/migrations/00176_a_domain_answers_for_its_bounces.sql`.
- Modify `packages/db/src/repositories/email.ts`: `stampEmailComplaint`. Modify
  `repositories/sending-domains.ts`: `sendingDomainCounts`.
- Modify `apps/edge/lib/email/email-receipts.ts`: a complaint stamps its row.
- Modify `packages/contracts/src/sending-domains.ts`: the counts, the two rules, `resumeDomain` and the stats line.
- Modify `apps/edge/lib/email/sending-domains.ts` and `api/cron/domains.ts`: count, judge, write the counts.
- Modify `apps/edge/api/admin/sending-domains.ts`: `op: resume`.
- Create `apps/dashboard/app/api/v1/sending-domains/[id]/resume/route.ts`, plus its row in `route-policy.json` and
  the regenerated typed client.
- Modify the bridge and `integrations-real.jsx`: Resume behind a Confirm, and the stats line.
- Tests: the contracts tests, `email-receipts.test.mjs`, the cron and admin door tests, a new
  `sending-domain-counts.db.test.mjs`, the route and harness tests.

### Task 5.1 — The migration

```sql
-- 00176 · A domain answers for its bounces and its complaints.
--
-- Reach out, Part 2 (the spec's §4.8): bounces over 2% of the last 500 sends, or any complaint, hold the domain; only
-- the owner resumes it, and the ramp starts again. A complaint arrives after delivery and left its row untouched;
-- now it stamps the row, so the domain it left from can be counted. The domain a row left from is read from its
-- frozen request's From, the one the door held it to: no second field to disagree with it.

alter table public.sending_domains
  add column if not exists sent_recent integer,
  add column if not exists bounced_recent integer,
  add column if not exists complaints integer;

create or replace function public.email_from_host(p_meta jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(substring(p_meta->'email'->'request'->>'from' from '@([^@<>[:space:]"]+)>?[[:space:]]*$'))
$$;
comment on function public.email_from_host(jsonb) is
  'The domain an email row left from: its frozen request''s From (channels mailboxHeader: "Name" <local@host>, or local@host).';

create or replace function public.stamp_email_complaint(p_tenant_id uuid, p_message_id uuid, p_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.messages
     set meta = jsonb_set(meta, '{email,complained_at}', to_jsonb(p_at), true)
   where id = p_message_id and tenant_id = p_tenant_id and channel = 'email' and direction = 'outbound'
     and meta ? 'email' and not (meta->'email' ? 'complained_at');
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke execute on function public.stamp_email_complaint(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.stamp_email_complaint(uuid, uuid, timestamptz) to service_role;

create or replace function public.sending_domain_counts(p_tenant_id uuid, p_host text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with gone as (
    select m.status, m.error, m.meta, m.created_at
      from public.messages m
     where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
       and m.created_at >= greatest(p_since, now() - interval '90 days')
       and (m.status in ('sent', 'delivered') or (m.status = 'failed' and m.error ? 'provider'))
       and public.email_from_host(m.meta) = lower(p_host)
  ), recent as (
    select * from gone order by created_at desc limit 500
  )
  select jsonb_build_object(
    'sent', (select count(*) from recent),
    'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'),
    'complained', (select count(*) from gone where meta->'email' ? 'complained_at'))
$$;
revoke execute on function public.sending_domain_counts(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.sending_domain_counts(uuid, text, timestamptz) to service_role;
```

- [ ] Confirm that `messages.error` is jsonb, and that `messages_guard` lets a meta-only update through on a terminal
  row, as `stamp_email_sent` needs it to (00128). Revoke `email_from_host` from anon if the privileges suite asks.
- [ ] `sending-domain-counts.db.test.mjs`, with rows whose meta is written by the REAL `buildEmailRequest` (memory:
  fixtures copy the real shape). Cases:
  - own-host rows are counted and other hosts are not;
  - `canceled` and send-time failures are not counted;
  - a bounce is counted from a receipt's error shape (`{provider: "bounced", …}`);
  - only the last 500 count;
  - `p_since` cuts the window;
  - a complaint stamp is counted, and stamping twice changes nothing the second time.

### Task 5.2 — The rules (test first)

- [ ] In contracts:
  - `DomainFacts` gains `counts: { sent: number; bounced: number; complained: number } | null`.
  - On a verified domain, `judgeDomain` holds for `complaint` when `complained >= 1`, which outranks `bounces`. It
    holds for `bounces` when `bounced * 50 > Math.max(sent, 150)`.
  - `resumeDomain(row, nowIso)` lifts a reputation hold only: it returns verified with `clean_since = now`. A DNS
    hold, or a domain that is not held, is returned unchanged.
  - `sendingDomainWords` for verified adds `· 0.4% bounced · none marked as spam` once counts exist (nothing when
    they do not). The held-for-reputation `next` is "Nothing leaves from it until you resume it."
- [ ] Tests:
  - three bounces in 30 sends does not hold, and four does;
  - 3 of 150 does not hold, and 4 of 150 does;
  - 10 of 500 does not hold (it is exactly 2%), and 11 does;
  - one complaint holds;
  - counts of `null` change nothing;
  - resume on a DNS hold changes nothing.

### Task 5.3 — The wiring (tests first)

- [ ] `email-receipts.test.mjs`: a `complained` receipt calls `stamp_email_complaint` with the row, before the
  suppression.
- [ ] The cron door:
  - `sending_domain_counts` is called with `clean_since` for verified domains only;
  - the counts are written to the row;
  - a complaint holds the domain and tells the owner;
  - a counts read that fails leaves the domain as it was, logged.
- [ ] The admin door:
  - `resume` on a reputation hold is verified, with `clean_since` moved and one `sending_domain.resumed` event;
  - on a DNS hold it is 409 "Press Check: this one lifts itself when its records pass.";
  - on another workspace's domain it is 404.
- [ ] The route: POST `sending-domains/[id]/resume`, owner, `settings`.
- [ ] The page:
  - Resume behind a Confirm ("Resume <host>? It starts again at 30 a day. It was held because <why>: fix that
    first.");
  - the stats line.
- [ ] Add the `sending_domain.resumed` kind and its words.

### Task 5.4 — Whole-repo checks, the push, the PR

- [ ] Build, check-dist, typecheck, lint, test, the database suites. Check the ledger, open the PR, one review; then
  dry-run, push 00176 and read it back; merge on green.

PR text:
- What changes for a customer: a domain whose mail bounces or draws a complaint stops sending, and says why on
  Connections. The owner can resume it at 30 a day.
- What to set: 00176 applied.
- Deploy order: either.

---

## Not in this part

- **The batch writer that sends a reach-out** (Part 3). It mints the unsubscribe token (the edge's
  `UNSUBSCRIBE_SECRET` getter arrives with it), composes `campaignFooter` from the Business record, freezes
  `ownDomainIdentity`, rotates domains under `domainDailyCap`, meters the month, and adds `sendEmail`'s deadline.
- **A bounce marking the lead** (`email_state = 'invalid'`, the spec's §4.6). The lead link is made at the first
  send (Part 3), so the receipt learns the lead then. PR 5 counts the bounce against the domain, and 00126 already
  suppresses the address.
- **DNS blocklist lookups** (decision 10): a DQS key is Ruben's call.
- **A separate registered domain for recipient links** (decision 3's risk).
- **The DKIM coverage check**: one real send to the workspace's own address once a domain is verified, with
  Ruben's yes.
- **"Ready" notifications and the Reach-outs group in Settings › Notifications** (Part 5).
- **A member's door to reset `email_marketing`** when a person asks to be written to again.
- **A platform-wide breaker across every tenant's cold mail**, before one tenant's complaints reach the cold
  account's own thresholds (Resend reviews an account whose complaint rate climbs). The per-domain holds are the
  first line; a sum across domains is the second, measured once real sends exist.

## As built

(Filled in after each PR merges: the numbers, the SHAs, and what differed from this plan.)
