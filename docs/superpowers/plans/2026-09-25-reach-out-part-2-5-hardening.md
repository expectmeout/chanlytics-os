# Reach out, Part 2.5: the wire hardened and the ground cleared — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before Part 3 writes a single cold email, every rule the spec puts at the door holds. Every failure lands
somewhere a person or the platform sees it. Every use case closes its loop. And the files Part 3 must extend are split
into modules small enough to hold in mind.

**Architecture:** Behaviour changes (PRs 1–4) come first, each test-first. They use the same seams the Parts 1–2 code
uses: contracts rules, one SQL door per fact, the one send door, and the edge doors. Then the pure-move PRs (5–10)
split the monoliths without changing a behaviour. Each is proven by an unchanged suite, an unchanged
`dist/index.d.ts` export list, and the render harnesses. The infra PR (11) and the docs PR (12) close it out. Every PR
branches from `main` after the previous one merges (never stacked). Each gets one combined review, is fixed, and is
squash-merged on green.

**Tech stack:** pnpm monorepo, TypeScript 5.9, tsup-built committed dists, Supabase Postgres (migrations, RLS,
security-definer doors), Vercel functions (apps/edge, Node runtime) and Next 16 (apps/dashboard), and the legacy
Babel JSX shell (`apps/dashboard/src/legacy`, loaded by `legacy-bridge/manifest.ts` and `Chanlytics.html`).
Tests: `node --test` over `_fake-db.mjs`, `*.db.test.mjs` on a local stack, and render harnesses.

**Where this came from.** The 25 Sep audit: eight read-only reviewers (wire, domains, UX, spec coverage, page seams,
backend seams, deps/infra, use cases), with every high claim re-read in code before it was written here. The audit
scored Parts 1–2 at 6.5/10. This plan's target is 8.5–9, and a Part 3 plan whose carried list is complete.

---

## Decisions this plan takes (Ruben may overrule any; each names its PR)

| # | Decision | Taken as | PR |
|---|---|---|---|
| D1 | A cold email's pause rules | Always a broadcast (proactive): the workspace pause, the thread pause and a live hold stop it, whoever the row says wrote it | 1 |
| D2 | What the door checks at send (spec §4.8 line 212) | The lead is `ready` or `nurture`; the address is not on the never-again list; the domain has sent fewer than its cap in the last 24 h (rolling, so there is no day boundary to argue about) | 1 |
| D3 | A cold send and the Inbox | A cold send does not move its thread (`last_message_at` untouched), so a run never pushes customers off the Inbox. The thread rises when the business writes back | 1 |
| D4 | A cold failure | Recorded on its row, never a per-email thread flag or owner alert (Part 3's run owns the one notice). Platform pages stay for a 401 and for quota | 1 |
| D5 | A send that timed out | Posted once more under the same idempotency key (safe for 24 h at Resend). If that also times out, the row is `failed` with `outcome: "unknown"`, and a later receipt may still settle it | 1 |
| D6 | Cold routes switch on | Only when both `RESEND_COLD_API_KEY` and `RESEND_COLD_WEBHOOK_SECRET` are set: cold mail never leaves while its receipts would be refused | 1 |
| D7 | A complaint on any email | The same "said no" path as an unsubscribe (`set_email_marketing` source `complaint`): opted out, never-again list, leads closed. The domain is judged at once, not at the next sweep | 1 |
| D8 | Soft bounces | Only a permanent bounce counts toward the 2% hold | 2 |
| D9 | The reputation window | Its own clock, `counted_since`, which only verification and Resume move. A DNS release restarts the ramp but not the count | 2 |
| D10 | A provider that no longer knows a domain (404) or answers a status we don't know | Held as `provider`, a hold that **lifts itself** when the provider knows the domain again (like a DNS hold), emails no owner, and pages the platform once (`sending_domain_provider_lost`, six-hourly). An account swap stops sending (those sends would fail anyway), tells nobody but the platform, and heals itself if the account comes back. This replaced the breaker first planned (as built in PR 2) | 2 |
| D11 | Mail sent straight to the own domain's From address | Said on Connections: replies come back to the Inbox; mail typed to sam@… goes wherever that domain's mail goes. No inbound for own domains | 3 |
| D12 | The footer's "Reply 'no thanks'" promise | Kept. Part 3 must stop writing to an address after any human reply to a reach-out (carried item C1) | 12 |
| D13 | The unsubscribe secret | Verified under the current and the previous value, so a rotation never breaks a link inside CAN-SPAM's 30 days | 4 |
| D14 | A support address the product can name | **Ruben's.** Until he names one, no refusal prints an address: it says the platform was told, and the platform is paged | 2 |

Carried to Part 3 (written into the spec in PR 12), none built here:
- **C1:** the "no thanks" stop by address.
- **C2:** the stop keyed by lead, with In-Reply-To/References matching.
- **C3:** auto-replies excluded from "replied".
- **C4:** any bounce stops the chain.
- **C5:** a held or removed domain defers, not cancels.
- **C6:** `maySpend` and metering per cold send.
- **C7:** the atomic daily claim for the batch writer (the door's 24 h count in PR 1 is the backstop).
- **C8:** the rows-first batch writer with a recipient-derived row id.
- **C9:** token minting plus the edge `UNSUBSCRIBE_SECRET` getter and a probe that both apps hold the same secret.
- **C10:** `campaignFooter` and `ownDomainIdentity` frozen into the request.
- **C11:** a bounce marks the lead's `email_state`.
- **C12:** the broadcast batch's email branch.
- **C13:** a cold send refused while the cold webhook secret is unset (PR 1 already refuses the route).
- **C14:** Resend's real rate limit, read from its `ratelimit-*` headers.

Carried to Part 5:
- **C15:** the owner's reply leaves from the thread's own domain.

---

## How every PR is proven (the same six checks, named once)

1. `corepack pnpm --filter "./packages/*" build`, then `git add -A && node tooling/scripts/check-dist.mjs` prints
   "dist in sync with src".
2. `corepack pnpm -r typecheck` prints no `error TS`.
3. `corepack pnpm lint` shows 0 errors.
4. `corepack pnpm test` shows 0 fail.
5. For any PR with a migration or SQL: the isolated stack (`cm-reach-test`, workdir
   `scratchpad/reach-stack`, ports 594xx) is `db reset` with the new file copied in. Then `corepack pnpm test:db`,
   with `SUPABASE_URL=http://127.0.0.1:59421`, the demo service/anon keys, and `SUPABASE_WORKDIR` and
   `SUPABASE_CLI` exported, shows 0 fail.
6. For any PR that touches a page: the page's render tests, plus a screenshot through the harness.

A pure-move PR adds a seventh check: `tail -1 packages/<pkg>/dist/index.d.ts` (the export list) is byte-identical
before and after, and `git diff --color-moved=dimmed-zebra` shows only moved lines plus imports and re-exports.

Before opening each PR, check the migration ledger (`git ls-tree origin/main supabase/migrations/`, plus open PRs'
files). Another session holds a local 00176 for the money rules (L2, never pushed); 00176 is this feature's and is on
production, so that session must renumber. Tell Ruben if it collides again.

---

## PR 1 — The door holds cold email to every rule

Branch `reach-out-2f-door-rules` from main. Migration **00177**.

### Files
- Create `supabase/migrations/00177_the_door_asks_everything_outreach_owes.sql`
- Modify:
  - `packages/contracts/src/consent.ts`: `DELIVERY_REFUSALS`, the typed word maps.
  - `packages/contracts/src/run-words.ts`: `HELD_REASONS` for every refusal.
  - `packages/core/src/deliver.ts`: `kindOf`, `refusalFor`, `outreachFacts` via the db door, `stampThread` skip,
    timeout outcome.
- Create `packages/db/src/repositories/outreach.ts` (`outreachFactsOf`), and export it from `packages/db/src/index.ts`.
- Modify:
  - `packages/channels/src/email-resend.ts`: a deadline, one re-post on timeout, and a shared `resendRequest()` used
    by `email-domains.ts` too.
  - `packages/channels/src/email-domains.ts`: use `resendRequest()`.
  - `packages/core/src/messages/send.ts`: outreach failures record, never flag.
  - `apps/edge/lib/email/email.ts`: cold routes need both secrets; the false "retry" comment goes.
  - `apps/edge/lib/email/email-receipts.ts`: a complaint goes through `set_email_marketing`, then
    `holdForComplaint`.
  - `apps/edge/lib/email/sending-domains.ts`: `holdForComplaint(p, tenantId, host)`.
  - `packages/db/src/repositories/email.ts`: `recordEmailStatus` lets an unknown-outcome row be settled.
- Tests:
  - Modify: `deliver.test.mjs`, `core-send-path.test.mjs`, `email-wire.test.mjs` (the deadline and timeout),
    `email-wire-routes.test.mjs`, `email-receipts.test.mjs`, `marketing-consent.test.mjs`.
  - Create: `outreach-facts.db.test.mjs`, and extend `email-marketing.db.test.mjs`.

### Task 1.1 — The migration (00177)

```sql
-- 00177 · The door asks everything outreach owes.
--
-- Reach out, Part 2.5 (docs/superpowers/plans/2026-09-25-reach-out-part-2-5-hardening.md, PR 1). The send door
-- (core deliver.ts) asks one question of the database for a cold email, and gets every fact in one answer: the
-- lead's stage, whether the address is on the never-again list, the From domain's state, and how much it sent in
-- the last day. A complaint is a "no" like an unsubscribe. An erased person keeps no email answer, and their
-- address's never-again row says erased. An email whose send timed out may still be settled by its receipt.

set local lock_timeout = '3s';

-- 1. One door for the outreach facts. Service role only: the edge's send path asks it.
create or replace function public.outreach_facts(
  p_tenant_id uuid,
  p_contact_id uuid,
  p_to text,
  p_host text,
  p_since timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'lead_stage', (
      select l.stage from public.leads l
       where l.tenant_id = p_tenant_id and l.contact_id = p_contact_id
         and l.erased_at is null and l.blanked_at is null
       order by (l.stage in ('ready', 'nurture')) desc, l.created_at desc
       limit 1),
    'suppressed', exists (
      select 1 from public.lead_suppressions s
       where s.tenant_id = p_tenant_id and s.kind = 'email'
         and s.hash = public.lead_suppression_hash(p_tenant_id, lower(btrim(p_to)))),
    'domain', (select jsonb_build_object('state', d.state, 'from_local', d.from_local, 'clean_since', d.clean_since)
                 from public.sending_domains d where d.tenant_id = p_tenant_id and d.host = lower(p_host)),
    'sent_since', (
      select count(*) from public.messages m
       where m.tenant_id = p_tenant_id and m.channel = 'email' and m.direction = 'outbound'
         and public.email_from_host(m.meta) = lower(p_host)
         and m.created_at >= p_since
         and m.status in ('sent', 'delivered', 'read', 'failed')
         and not (m.status = 'failed' and not (m.error ? 'provider') and coalesce(m.error->>'outcome', '') <> 'unknown'))
  )
$$;
revoke execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.outreach_facts(uuid, uuid, text, text, timestamptz) to service_role;

-- 2. set_email_marketing takes a complaint too: the same no, from the provider's report.
--    Copy 00174's whole body, changing only the guard and the lead event's source:
--      if p_state is distinct from 'opted_out' or p_source not in ('unsubscribe', 'complaint') then
--        raise exception 'set_email_marketing records a no: opted_out, from unsubscribe or complaint' using errcode = '22023';
--      ...
--      jsonb_build_object('stage', 'archived', 'reason', 'said_no', 'by', null, 'source', p_source)
--    (The executor pastes the full 00174 function with these two edits: a migration never references another's text.)

-- 3. An erased person keeps no email answer (00101's rule, for email), and the never-again row they left says erased.
create or replace function public.email_marketing_on_erase()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.erased_at is not null and old.erased_at is null then
    update public.contacts
       set email_marketing = 'unknown', email_marketing_source = 'erasure', email_marketing_updated_at = now()
     where id = new.id and email_marketing is distinct from 'unknown';
    if new.email is not null then
      insert into public.lead_suppressions (tenant_id, kind, hash, what)
      values (new.tenant_id, 'email', public.lead_suppression_hash(new.tenant_id, new.email), 'erased')
      on conflict (tenant_id, kind, hash) do update set what = 'erased';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.email_marketing_on_erase() from public, anon, authenticated;
drop trigger if exists contacts_erase_clears_email_marketing on public.contacts;
create trigger contacts_erase_clears_email_marketing
  after update of erased_at on public.contacts
  for each row execute function public.email_marketing_on_erase();
-- The leads trigger (00140 leads_erase_on_contact) wrote its rows "on conflict do nothing", so an earlier opt-out
-- row stayed an opt-out and the finder's erased-place check never saw it. Upgrade what exists.
update public.lead_suppressions s set what = 'erased'
  from public.leads l
 where l.erased_at is not null and s.tenant_id = l.tenant_id and s.kind = 'email' and l.email is not null
   and s.hash = public.lead_suppression_hash(l.tenant_id, l.email) and s.what <> 'erased';

-- 4. An email whose send timed out (error.outcome = 'unknown') may still be settled by its receipt. Copy 00111's
--    whole messages_guard, changing only the terminal rule to:
--      if OLD.status in ('failed','canceled') and NEW.status is distinct from OLD.status
--         and not (OLD.status = 'failed' and OLD.channel = 'email' and OLD.error->>'outcome' = 'unknown'
--                  and NEW.status in ('sent', 'delivered', 'read', 'failed'))
--      then raise exception 'messages.status is terminal (% -> % rejected)', OLD.status, NEW.status;
--    and give an unknown-outcome row rank 1 in the monotone check, so it moves forward to sent/delivered/read.
```

- [ ] Paste the full latest bodies. `set_email_marketing` comes from 00174 and `messages_guard` from 00111 (read the
  file; do not trust this plan's excerpt). Apply the two edits each.
- [ ] Add the new function to `tooling/scripts/tests/privileges.db.test.mjs`'s expectations if it lists service-role
  doors. Run it, because it enforces the grant rules.
- [ ] Write `tooling/scripts/tests/outreach-facts.db.test.mjs`. Rows are written with the real `buildEmailRequest` and
  `ownDomainIdentity` (fixtures copy the real shape). Cases:
  - a `ready` lead reads `ready`;
  - a `converted` lead reads `converted`;
  - two leads, one ready and one archived, read `ready`;
  - an address suppressed by `set_email_marketing` reads `suppressed: true`, in any case or spacing;
  - `sent_since` counts sent, delivered and receipt-failed rows, never `canceled` or a send-time failure, but does
    count an unknown-outcome row;
  - another workspace's rows count nothing.
- [ ] Extend `email-marketing.db.test.mjs`:
  - `p_source 'complaint'` opts out, suppresses, closes a nurture lead with source `complaint`, and says it once;
  - `p_source 'other'` raises 22023;
  - erasing a contact that had opted out leaves `email_marketing = 'unknown'` and the email suppression row
    `what = 'erased'`.
- [ ] Add a guard case (same file or `state-guards.db.test.mjs`):
  - a `failed` email row with `error.outcome = 'unknown'` moves to `delivered`;
  - a `failed` row without it stays terminal;
  - an SMS row with it stays terminal.
- [ ] Copy the file into the stack, `db reset`, then run all three db test files: expected 0 fail.
- [ ] `corepack pnpm gen:db-types` (with the pinned 2.116 CLI) and `gen:schema-sets`; commit what changed.

### Task 1.2 — One closed list of refusals, typed word maps (contracts)

- [ ] Test first, in `marketing-consent.test.mjs`:

```js
import { DELIVERY_REFUSALS, PURPOSE_REFUSALS, HELD_REASONS } from "@chanlytics/contracts";
test("every refusal the door can give has words for the thread and for a run's report", () => {
  for (const r of DELIVERY_REFUSALS) {
    assert.ok(PURPOSE_REFUSALS[r], `thread words for ${r}`);
    assert.ok(HELD_REASONS[r], `run words for ${r}`);
  }
});
```

- [ ] Run it: FAIL. `DELIVERY_REFUSALS` is undefined.
- [ ] In `consent.ts`, add the list and derive the type. Move the list here from `core/deliver.ts`, where the union
  lives today, so contracts owns it and core imports the type:

```ts
export const DELIVERY_REFUSALS = [
  "opted_out", "not_opted_in", "no_marketing_consent", "erased", "paused", "human_has_it", "superseded_by_human",
  "sms_carries_no_promotions", "email_marketing_disabled", "email_suppressed", "recipient_changed",
  "unsubscribed", "outreach_is_email_only", "outreach_not_a_lead", "outreach_lead_closed", "outreach_suppressed",
  "outreach_without_unsubscribe", "outreach_needs_own_domain", "sending_domain_not_ready", "sending_domain_at_cap",
] as const;
export type DeliveryRefusal = (typeof DELIVERY_REFUSALS)[number];
```

  `PURPOSE_REFUSALS` becomes `Record<DeliveryRefusal, string>`. Its keys that are not door refusals stay in a
  separate `Record<string, string>` spread in, so they compile. Add the words:
  - `outreach_lead_closed`: "This business is no longer being written to: it said no, became a customer, or was set
    aside."
  - `outreach_suppressed`: "This address is on the never-again list: it unsubscribed, complained, or was erased."
  - `sending_domain_at_cap`: "The domain this email was to leave from has sent its day's share. It goes when there
    is room."
  - Also fix `outreach_not_a_lead`: "Cold email goes only to a business your searches found."
  - And `unsubscribed`, per the UX review: "This person unsubscribed from your emails. Nothing goes to them by email
    unless they write first."
- [ ] In `run-words.ts`, give `HELD_REASONS` the six outreach words, in the run report's short form ("unsubscribed",
  "cold email goes by email only", "not a found business", "no longer written to", "on the never-again list", "no
  unsubscribe link", "not from your own domain", "the domain isn't sending", "the domain's day is full").
- [ ] `core/deliver.ts` imports `type DeliveryRefusal` from contracts and deletes its own union. Run the test: PASS.

### Task 1.3 — The door (core)

- [ ] Tests first, in `deliver.test.mjs`. The existing `coldWorld` gives the fake db an `outreach_facts` rpc
  answering from the world's tables; add it to `fakeDb`'s third argument. Cases:
  1. **D1:** an outreach row with `sender: "human"`, `proactive` unset, in a paused workspace, is refused `paused`.
     On a paused thread it is refused `human_has_it`. With `sender: "ai"` on a paused thread it is also refused
     `human_has_it`.
  2. **D2:**
     - lead stage `converted` → `outreach_lead_closed`;
     - `archived` → `outreach_lead_closed`;
     - no lead → `outreach_not_a_lead`;
     - `suppressed: true` → `outreach_suppressed`;
     - `sent_since` equal to `domainDailyCap(clean_since, now)` → `sending_domain_at_cap`. The cap is the ramp's,
       so its clock is `clean_since` (1.1's `domain` object carries it); the reputation clock `counted_since` (PR 2)
       is never the cap's.
  3. **D3:** a sent outreach email leaves `conversations.last_message_at` as it was, and a conversational one still
     moves it.
  4. **D5:** a wire answer `{ ok: false, status: 0, errorBody: "timeout" }` finalizes the row as `failed` with
     `error.outcome === "unknown"`; `{ ok:false, status: 0, errorBody: "fetch failed" }` does not carry the marker.
  5. The order (spec's): `unsubscribed` still outranks a closed lead and a held domain.
- [ ] Run them: FAIL.
- [ ] Implement:

```ts
/** The policy a send goes under. A cold email is a broadcast whoever wrote its words: every pause holds it (D1). */
function kindOf(d: Delivery): SendKind {
  if (d.kind) return d.kind;
  if (d.purpose === "outreach") return "broadcast";
  if (d.sender === "human") return d.proactive ? "broadcast" : "reply";
  return d.messageId ? "draft" : "answer";
}
```

  In `refusalFor`, the pause rule treats `kind === "broadcast"` as proactive already. The outreach block now reads:

```ts
  if (d.purpose === "outreach") {
    if (!o) throw new Error(`deliver: an outreach email is judged with its facts (conversation ${d.conversationId})`);
    if (!o.leadStage) return "outreach_not_a_lead";
    if (o.leadStage !== "ready" && o.leadStage !== "nurture") return "outreach_lead_closed";
    if (o.suppressed) return "outreach_suppressed";
    if (!o.unsubscribable) return "outreach_without_unsubscribe";
    if (!o.domainState) return "outreach_needs_own_domain";
    if (o.domainState !== "verified") return "sending_domain_not_ready";
    if (o.sentSince >= domainDailyCap(o.cleanSince, nowMs)) return "sending_domain_at_cap";
  }
```

  `outreachFacts` becomes one call to `outreachFactsOf(db, { tenantId, contactId, to, host, since })` from
  `packages/db`. That is the one place the rpc is typed. `since = nowMs - 24 h`. The From host is parsed once, by
  `addressOf`. `domainState` is null unless `domain.from_local@host === from`, as today, and `cleanSince` is
  `domain.clean_since`.
- [ ] The success path skips `stampThread` when `d.purpose === "outreach"` (D3, with a comment naming the Inbox's
  100-row read).
- [ ] The failure path: when `sent.status === 0 && sent.errorBody === "timeout"`, the failure patch carries
  `outcome: "unknown"`.
- [ ] Run the tests: PASS. Run the whole suite, because `kindOf` is shared.

### Task 1.4 — The wire: a deadline, one re-post on timeout, one request helper (channels)

- [ ] Tests first, in `email-wire.test.mjs`. Stub `fetch`:
  1. The first POST aborts (throw a `DOMException("…", "TimeoutError")`) and the second answers 200: the result is
     ok, and both POSTs carried the same `Idempotency-Key`.
  2. Both abort: `{ ok:false, status:0, errorBody:"timeout" }`.
  3. With `deadlineMs` 1000 and a 429 asking 2 s: no wait and no second POST; the 429 is returned.
  4. Each POST's `signal` times out at `min(15 000, remaining)`, checked by a stub that records the timeout it was
     given, via an injected `timeout(ms)`.
- [ ] Run: FAIL.
- [ ] Implement:
  - `sendEmail(cfg, request, opts = { wait, deadlineMs, now })`. `deadlineMs` defaults to 32 000, the Part 1 budget,
    and each attempt's timeout is `min(SEND_TIMEOUT_MS, deadline − now)`.
  - A timeout (`e.name === "TimeoutError" || "AbortError"`) re-posts once when at least 5 s remain, and answers
    `errorBody: "timeout"` when it can't.
  - Extract `resendRequest(cfg, method, path, body?, { timeoutMs, idempotencyKey })`, returning
    `{ status, json, raw, headers }` and never throwing (status 0 on no answer). Use it in `postEmail` and in
    `email-domains.ts`'s `call`, and delete the second `RESEND_…` base URL.
- [ ] Run: PASS. `email-domains.test.mjs` must still pass unchanged.

### Task 1.5 — The queue: a cold failure is recorded, not flagged (core)

- [ ] Tests first, in `core-send-path.test.mjs`:
  - An outreach send that fails with `reason: "provider", status: 0` makes no `escalate` and no `alert` (ops =
    `["deliver"]`).
  - A 401 on outreach still pages `provider_auth:email_outreach`.
  - A 403 whose `errorBody` mentions `domain` pages nothing, because it is the domain's fact and the sweep judges it.
  - A daily limit still pages `provider_quota:email_outreach`, and a conversational failure is unchanged.
- [ ] Implement in `sendQueued`, after the pages, before the escalation. The 401/403 page condition becomes
  `out.status === 401 || (out.status === 403 && !/domain/i.test(out.errorBody ?? ""))`.

```ts
  // A cold email's failure is its run's to report once (Part 3), never a flag on a thread nobody has opened (D4).
  if (purpose === "outreach") return;
```

### Task 1.6 — Cold routes need both secrets; a complaint is a no (edge)

- [ ] Tests first:
  - `email-wire-routes.test.mjs`: with `RESEND_COLD_API_KEY` set and `RESEND_COLD_WEBHOOK_SECRET` unset, no own
    route is bound (an outreach send answers `request_leaves_as_another_sender`); with both set, it is bound.
  - `email-receipts.test.mjs`: a `complained` receipt calls `set_email_marketing` with `p_source: "complaint"` and
    the row's contact and message; this is modelled in the world's rpcs and asserted by `seen`. The existing
    suppression still happens; `stamp_email_complaint` still runs first.
  - `cron-domains-door.test.mjs` or a new `holdForComplaint` case in `admin-sending-domains-door.test.mjs`: a
    complaint receipt on an email from a verified own domain holds that domain at once (held `complaint`, one
    event, the owner told once).
- [ ] Implement:
  - In `emailWireFor`, `if (coldKey && env.RESEND_COLD_WEBHOOK_SECRET)`. Replace the comment "fail at the wire and
    retry" with the truth: "its sends fail at the wire, and a cold failure is recorded on its row (send.ts)".
  - In `applyEmailReceipt`, for `complained`: after the stamp, call a new db repository function
    `recordEmailNo(db, { tenantId, messageId, source: "complaint" })`. It reads the row's `contact_id` and its
    frozen From (`meta.email.request.from`) with one `messages` select (tenant and id), then calls
    `set_email_marketing(p_tenant_id, p_contact_id, 'opted_out', 'complaint', p_message_id)`. It returns
    `{ contactId, fromHost }`; a row with no contact returns `{ contactId: null }`, and the no is not recorded,
    because a message without a person has no one to stop. Then, best-effort and logged (the next sweep holds it
    anyway), `holdForComplaint(domainPortsFor(db), tenantId, fromHost)`, where `domainPortsFor` builds the same
    `DomainPorts` the cron door builds.
  - `holdForComplaint`: read the domain by host. If it is `verified`, compute counts, judge (the complaint rule
    holds), apply, say the change, and tell the owner. Everything else is a no-op.

### Task 1.7 — Whole-repo checks, one review, the push, the PR

- [ ] The six checks. Open the PR. It changes nothing for a customer (nothing sends cold email yet); what to set:
  00177 applied; deploy order: either. Then the one combined review (a subagent, read-only), fix, CI green.
- [ ] Production: `db push --linked --dry-run` lists only 00177; `db push --linked --yes`; read back with
  `db query --linked`: the head, `outreach_facts` executable by service_role only, the new trigger present, the
  guard's text containing `'unknown'`. Then squash-merge and delete the branch.

---

## PR 2 — The domains engine answers for what it knows

Branch `reach-out-2g-domains-engine` from main after PR 1. Migration **00178**.

### Files
- Create `supabase/migrations/00178_a_domain_counts_from_its_own_clock.sql`
- Modify:
  - `packages/contracts/src/sending-domains.ts`: `counted_since`, the `provider` hold, `temporary_failure` two
    reads, `sendingDomainDtoOf`, `ownDomainAddress`, `domainPatchOf`, `sendingDomainActs`; `FREE_MAIL_DOMAINS` is
    the one list.
  - `packages/contracts/src/lead-search.ts`: `LEAD_FREE_MAIL` is removed and its users import
    `isFreeMail`/`FREE_MAIL_DOMAINS`.
  - `apps/edge/lib/email/sending-domains.ts`: adopt only on no answer, the takeover guard, the notice cooldown,
    removal failures surfaced, the patch helper.
  - `apps/edge/api/cron/domains.ts`: a time budget, `checked_at` on every attempt, reputation holds skipped, the
    404 breaker, the oldest-read age.
  - `packages/db/src/repositories/sending-domains.ts`: `dueSendingDomains` skips reputation holds; the select
    includes `counted_since`.
  - `packages/db/src/repositories/outreach.ts`: `counted_since`.
  - `apps/dashboard/src/server/sending-domains.ts`: `SENDING_DOMAIN_COLUMNS` plus `counted_since`, mapped through
    `sendingDomainDtoOf`.
- Tests: `sending-domains.test.mjs`, `cron-domains-door.test.mjs`, `admin-sending-domains-door.test.mjs`,
  `sending-domain-counts.db.test.mjs`, `sending-domains.db.test.mjs`, `lead-search.test.mjs` (free mail).

### Task 2.1 — The migration (00178)

```sql
-- 00178 · A domain counts from its own clock.
--
-- Reach out, Part 2.5 (plan PR 2). The reputation window gets its own clock, apart from the ramp: a release from a
-- DNS hold restarts the ramp (clean_since) but not the count, so a complaint made while the domain was held still
-- holds it after (00176's claim, made true). Only a permanent bounce counts toward the 2%. A domain the provider no
-- longer knows can be held as 'provider'.

set local lock_timeout = '3s';

alter table public.sending_domains add column if not exists counted_since timestamptz;
update public.sending_domains set counted_since = coalesce(counted_since, verified_at, clean_since) where counted_since is null;
comment on column public.sending_domains.counted_since is
  'Where the reputation count starts (bounces, complaints): set when the domain is first verified and when its owner resumes it, never by a DNS release. clean_since is the ramp''s clock.';

alter table public.sending_domains drop constraint if exists sending_domains_held_why_check;
alter table public.sending_domains add constraint sending_domains_held_why_check
  check (held_why in ('verification', 'dmarc', 'bounces', 'complaint', 'provider'));

-- sending_domain_counts: 00176's body, with the bounce line counting only permanent bounces:
--   'bounced', (select count(*) from recent where status = 'failed' and error->>'provider' = 'bounced'
--                 and lower(coalesce(error->>'kind', '')) = 'permanent'),
-- (the executor pastes 00176's whole function with that one edit).
```

- [ ] Check the constraint's real name (`\d sending_domains` on the stack, or 00175's inline CHECK: an inline
  column CHECK is named `sending_domains_held_why_check`), and adjust.
- [ ] Cases in `sending-domain-counts.db.test.mjs`:
  - a `Transient` bounce is sent but not bounced;
  - a `Permanent` bounce is both.
- [ ] Case in `sending-domains.db.test.mjs`: the judge's `provider` hold writes (the CHECK takes it).
- [ ] `db reset`, run both: 0 fail. Then `gen:db-types` and `gen:schema-sets`, since `DOMAIN_HOLDS` grows, and fix
  what the compiler names in `schema-sets.ts`.

### Task 2.2 — The rules (contracts), test first

- [ ] Tests in `sending-domains.test.mjs`:
  1. **D9:**
     - `judgeDomain` on a held-dmarc row that reads good returns `clean_since = now` and `counted_since` unchanged;
     - `resumeDomain` sets both to now;
     - verification sets both.
  2. **D10:**
     - a verified row reading provider `not_found` → held `provider`;
     - a row reading an unknown status `"weird"` → held `provider`;
     - a held-`provider` row never lifts on its own;
     - `domainHoldWords("provider")` → "the mail provider no longer has it", with next "Remove it and add it again."
  3. **Two reads for `temporary_failure`:**
     - a verified row whose stored `provider_status` is `verified` reading `temporary_failure` is unchanged (the
       status is stored);
     - a second read in a row holds `verification`.
  4. `sendingDomainActs(d)` returns `{ check, resume, remove, showRecords }` for every state × hold:
     - records: check, remove, records;
     - verifying: check, remove, records;
     - verified: remove;
     - held dns: check, remove, records;
     - held reputation: resume, remove;
     - held provider: remove.
  5. `ownDomainAddress({ from_local, host })` lower-cases.
  6. `sendingDomainDtoOf(row)` never carries `provider_domain_id`.
  7. `domainPatchOf(judgement)` carries every judged column.
  8. `isFreeMail("gmail.com")` is true; `FREE_MAIL_DOMAINS` includes every entry the old `LEAD_FREE_MAIL` had.
- [ ] Implement:
  - `DomainRowState` gains `counted_since`, and `SendingDomainDto` gains `counted_since`.
  - `judgeDomain`: the release branch keeps `counted_since`; the verify branch sets it. Unknown or not-found
    provider statuses (anything outside verified, pending, temporary_failure, partially_verified, not_started,
    failed, partially_failed) on a verified row → `provider`. `temporary_failure` holds only when `row.provider_status`
    was already `temporary_failure`.
  - The counts' `since` is `counted_since` (edge and door).
- [ ] Run: PASS.

### Task 2.3 — The edge: adopt, take over, tell, remove, sweep (tests first)

- [ ] Tests in `admin-sending-domains-door.test.mjs`:
  1. **Adopt only on no answer:**
     - a create refused with 422 adopts nothing and says the provider's words;
     - a create that answers status 0 or 5xx adopts a same-name domain in `not_started`;
     - a same-name domain the provider has `verified` is never adopted: 409, "That domain is set up somewhere else.
       We've been told and will get in touch." The platform is paged once (`sending_domain_conflict`, naming the
       host and never the provider id).
     - The existing "write to us" refusal (edge `sending-domains.ts:146`) says the same, with the same page. The
       product has no support address; choosing one is D14, Ruben's.
  2. **Take over:** a holder in `records` whose `provider_status` is `verified` or `partially_verified` is not taken
     over after 72 h, and the delete is fenced on `updated_at`.
  3. **Remove:**
     - a provider that refuses removal keeps the row and answers 502;
     - a `findMailDomain` that fails keeps the row and answers 502;
     - a 404 at the provider is gone.
- [ ] Tests in `cron-domains-door.test.mjs`:
  1. An unreadable row gets `checked_at = now`, so it is not first in line next tick.
  2. Reputation-held rows are not read.
  3. 60 due rows are all read in one tick when the provider answers fast (the budget loop, not a fixed 30).
  4. 3 verified rows reading 404 in one tick: none held, one platform page (`domains_provider_lost`), and the answer
     carries `provider_lost: 3`.
  5. A domain held twice in 24 h tells its owner once (a cooldown read from the last `sending_domain.held` event for
     that domain).
  6. The answer carries `oldest_read_s`.
- [ ] Implement each, using `domainPatchOf` in all three write paths (unreadable, normal, resume) and
  `sendingDomainDtoOf` in both mappers (edge and dashboard).
- [ ] The page's rule moves to contracts: `integrations-real.jsx` reads `API.acts(d)`, installed from
  `sendingDomainActs` by the bridge.
- [ ] Run the domains suites: PASS. Then the six checks, one review, the push (00178: dry run, push, read back the
  column and the widened CHECK), merge.

---

## PR 3 — Connections, the unsubscribe page and the footer speak plainly

Branch `reach-out-2h-domains-words` from main after PR 2. No migration.

### Files
- Create `apps/dashboard/src/legacy/pages/sending-domains.jsx`: `SendingDomains`, `SendingDomainAdd`,
  `SendingDomainRecords`, moved out of `integrations-real.jsx` (lines 119–331). Load it before `integrations-real.jsx`
  in `legacy-bridge/manifest.ts` and `Chanlytics.html`, with `?v=1`. Bump `integrations-real.jsx` to the next `?v=`
  after main's. Publish with `Object.assign(window, { SendingDomains })`.
- Modify:
  - `packages/contracts/src/sending-domains.ts`: `domainRecordRows(d)` (the table model), record labels, the
    per-record state, the Check result words, what a hold costs, per-hold fix words, the foot.
  - `packages/contracts/src/reach-out.ts`: the unsubscribe page names the sender and its failure state has a retry;
    footer link text; a `whyFrom(source)` in place of the constant `WHY_FROM_MAPS`; the one footer
    (`leadDraftFooter` in `leads.ts` calls `campaignFooter`'s pieces).
  - `packages/contracts/src/connections.ts`: the Email row says when a domain is held.
  - `apps/dashboard/src/server/unsubscribe.ts`: the page's facts include the sender address, from the message id in
    the token.
  - `apps/dashboard/src/legacy/styles/settings.css`: the records table, the Add form's gutter, the phone layout;
    bump `?v=`.
- Tests: `sending-domains.test.mjs` (words), `settings-doors.test.mjs` (the rendered block), `unsubscribe*.test.mjs`,
  `reach-out.test.mjs` (footer), `connections.test.mjs`.

### Task 3.1 — The words (contracts), test first

Each of these is one assertion in `sending-domains.test.mjs` or `reach-out.test.mjs`, written before the code.

**The records**

- `domainRecordRows(d)` returns rows `{ kind, type, name, value, priority, found }`, where:
  - `kind` is "Return path" for the MX and the SPF TXT, "Signing (DKIM)", or "Policy (DMARC)";
  - `name` is relative to the host ("send", "resend._domainkey", "_dmarc");
  - `found` is `status === "verified"`.
- A hint line: "Some registrars add getharbor.com for you. If yours does, type only the part shown."
- Above the records: "These records tell Gmail and others that Chanlytics may send as getharbor.com. Add each one
  where you bought the domain, then press Check."

**Check**

- `checkResultWords(before, after, nowMs)` returns `{ tone, msg }`:
  - verified: ok, "getharbor.com is verified. It starts at 30 a day.";
  - still records: warn, "Not found yet (looked 12:04). DNS changes can take a few hours. Press Check again later.";
  - verifying: info, "…We look again every ten minutes; nothing to press.";
  - a DNS hold lifted: ok, "Sending again, starting at 30 a day."

**The row**

- Verified: the stats on their own line; `next` under the cap as a date ("200 a day from Oct 15").
- Held: cap "Sending nothing · was 100 a day"; next for a DNS hold "It sends again by itself once the records read
  right; it starts at 30 a day."
- Per-hold fix words:
  - bounces: "Check the addresses you write to: more than 2% of recent emails bounced.";
  - complaint: "Someone marked an email as spam. Read the email again: a clear reason for writing, and fewer a day.";
  - provider: "Remove it and add it again."
- The owner's notice (edge `tellDomainHeld`) uses the same `domainHoldFixWords`.

**The foot and the Add form**

- The foot says the rule once. At five domains it says "Five is the most. Remove one to add another." It never says
  "never at risk"; it says "so cold email's reputation stays apart from your everyday email's". And (D11): "Replies
  come back to the Inbox. Mail sent straight to sam@… goes wherever that domain's mail goes."
- The Add form's empty state: "No spare domain? Buy one like get<yourbusiness>.com, then add it here."

**The Email row**

- `connections.ts`: the Email row's tone is warn and its line says "· 1 domain held" while any domain is held.

**The unsubscribe page**

- The sender is named: "You're unsubscribed from emails from sam@harbor-mail.com."
- The failure state has a "Try again" form plus "Or reply to the email and ask them to stop."

**The footer**

- In HTML the unsubscribe link reads "Unsubscribe" (text keeps the URL); the email identifies itself as a
  solicitation ("This is a one-time note from a business, not a newsletter."; the exact line is `SAY.footer` in the
  canvas's `story.mjs`, which is the approved copy); the why comes from `whyFrom(source)`, with "maps" by default.

### Task 3.2 — The block, drawn from contracts

- [ ] Move the three components into `sending-domains.jsx` as a pure move first. Commit it alone
  (`git diff --color-moved` shows only the move). Then change it.
- [ ] The records draw as a table (Type · Name · Value · Priority · a quiet found dot). Each row has Copy for the
  name and Copy for the value, with `aria-label="Copy the DKIM value"` and similar labels. When the clipboard is
  missing, the value is selected and a toast says "Copy it by hand".
- [ ] Buttons come from `API.acts(d)`. The Check toast takes `checkResultWords`. The Resume confirm's detail takes
  the per-hold fix words.
- [ ] The Add form gets its inner gutter: measure the glyphs, not the boxes. Per the memory, check the text's left
  edge is ≥ 12 px inside the border.
- [ ] Render proof:
  - `settings-doors.test.mjs` asserts the table's rows, the found dots, the per-state buttons, and the phone layout;
  - the harness screenshots cover desktop and phone, light and dark, and every state;
  - look at them before the PR.
- [ ] The six checks, one review, merge.

---

## PR 4 — The switches, and the watch on them

Branch `reach-out-2i-switches` from main after PR 3. No migration.

### Files
- Modify:
  - `packages/channels/src/unsubscribe-token.ts`: `verifyUnsubscribeToken(secrets: string[], token)`.
  - `apps/dashboard/src/server/unsubscribe.ts`: reads `UNSUBSCRIBE_SECRET` and `UNSUBSCRIBE_SECRET_PREVIOUS`, and
    logs `unsubscribe_unavailable` once per minute at most when blank.
  - `apps/dashboard/.env.example`: the previous-secret line, and the wrong "the edge mints" line corrected.
  - `apps/edge/api/diag.ts`: `env` adds `emailDomain`, `resendWebhook`, `resendCold`, `resendColdWebhook`.
  - `apps/edge/api/cron/domains.ts`: the cold-receipt watch.
- Tests: `unsubscribe-token.test.mjs`, `unsubscribe-route.test.mjs` (or the existing unsubscribe test file),
  `diag.test.mjs` if present (else a case in the edge diag test), `cron-domains-door.test.mjs`.

### Tasks
- [ ] **Rotation, test first.** A token signed under the previous secret verifies when both are given. A token under
  neither is refused. The page answers 200 for a previous-secret token, and the canonical and length checks are
  unchanged.
- [ ] **Blank secret, test first.** A blank secret answers 503 as today and logs once.
- [ ] **Diag, test first.** Diag reports the four email switches as booleans, never values.
- [ ] **The cold-receipt watch, test first.** It runs in the domains sweep, with no new clock. For each verified
  domain, it looks for any own-domain email from 2 to 26 hours ago that is `sent` with no receipt since
  (`status_updated_at` unchanged, no `delivered_at`). When one is found, the platform is paged once a day
  (`email_cold_receipts_missing`, naming the count, never an address). This is how a wrong cold webhook secret is
  found. The read is one repository function over the `messages_email_from_host` index.
- [ ] Implement, then run the six checks, one review, merge.

---

## PRs 5–10 — Clearing the ground (pure moves, no behaviour change)

Every one of these follows one recipe. Its proof is the seventh check above. The line ranges come from the audit's
maps of `af03ca8e`. Re-read each file before cutting, because main moves.

**The recipe (contracts, core, db, server):**
- The big file stays at its path as the home of what remains, and `export * from "./new-module"` re-exports each new
  file, so no importer changes and `index.ts` is untouched. Private helpers shared by two new files go in an
  internal file that is never `export *`-ed from `index.ts` (the `person-words.ts` / `run-words.ts` pattern).
  Two helper names would collide otherwise: `receptionistOf`/`channelsOf` against config.ts and reports.ts, and
  `planArea` against lead-search.ts.
- No other file changes which file it imports from. The audit measured it: repointing one import inside the
  13-module cycle reorders about 1,300 lines of dist, while a pure move costs about 110.
- New core files stay flat (`hygiene.test.mjs` reads the core folders without recursing).
- A pin that reads moved code is repointed at the new path with the same number of reads. Never add a read (the
  ratchet). Delete the assertion where a render test already covers the same test id.

**The recipe (pages):**
- A new page file publishes with `Object.assign(window, {...})` and is consumed with a module-scope
  `const { A } = window;`.
- It is imported in `legacy-bridge/manifest.ts` and tagged in `Chanlytics.html` at the same position, before its
  consumer, with `?v=1`, and the file it came from gets its `?v=` bumped.
- Each page test that imports the consumer imports the new files first.
- `legacy-harness.test.mjs` proves order, tags, versions and the shared scope.
- The ratchet's baseline is banked (`UPDATE_SOURCE_SCAN_BASELINE=1`, then read the baseline diff and keep only the
  files this PR changed).

| PR | Branch | Moves | Pins to repoint or delete |
|---|---|---|---|
| 5 | `reach-out-2j-split-campaigns` | contracts `playbooks.ts`: `playbook-triggers.ts` (35–152), `playbook-follow-ups.ts` (153–242, 518–592), `playbook-reach.ts` (289–458, 676–751), `playbook-schedule.ts` (459–517, 593–675), `playbook-approval.ts` (810–1021). contracts `broadcasts.ts`: `broadcast-audience.ts` (61–253), `broadcast-number.ts` (426–516), `run-report.ts` (562–969) | none |
| 6 | `reach-out-2k-split-people` | contracts `people.ts`: `person-helpers.ts` (internal), `person-notes.ts` (543–749), `people-lists.ts` (1521–1763), `person-attention.ts` (1764–1836), `person-profile.ts` (1837–2795, exported from `index.ts` directly; pipeline.ts's type-only import follows). `toPersonVM` moves whole, and Part 3's rows are written beside it as helpers | attention-strip, call-outcomes and standing stay on `people.ts` (their lines don't move) |
| 7 | `reach-out-2l-split-leads` | contracts `leads.ts`: `lead-words.ts` (46–253, 447–638), `lead-plan.ts` (639–910, 967–1012, 2430–2508), `lead-peek.ts` (1013–1526), `lead-dtos.ts` (1527–1616, 1781–1822, 1906–1950), `lead-review.ts` (1617–1780, 1823–1905), `lead-row.ts` (1951–2429). `leads.ts` keeps the sets, the route and first-day | none (the eight source-path importers go through the re-exports) |
| 8 | `reach-out-2m-split-jobs-and-lead-server` | jobs `handlers.ts`: `broadcast-send.ts` (152–182, 224–419), `context.ts` (`JobContext`, `ClaimedJob`, `must`). dashboard `server/leads.ts`: `lead-answers.ts` (65–220), `lead-searches.ts` (221–486, 879–950, 1472–end), `lead-page.ts` (487–772), `lead-plan-facts.ts` (773–878), `lead-work.ts` (951–1119), `lead-draft.ts` (1120–1262), `lead-suggestions.ts` (1263–1389), `lead-export.ts` (1390–1471); `setSuggestionsWriter` stays with `keep` and `suggestionsFor` | broadcasts.test (8 strings; drop the `broadcast_send: broadcastSend,` check that store-retired already covers), templates-made-here, visit-playbooks: repoint, same count |
| 9 | `reach-out-2n-split-leads-page` | `clients-a.jsx`: `LeadsReal` (3198–3918), plus `ldValuesPref` (677), `leadCellCtxFor` (685), `PL_NO_LEADS`/`useLeads` (794–819), `plCopy`/`plDial` (753–754) to `leads-real.jsx`; `ClientsA` reads `window.LeadsReal`. `leads-scope.jsx`: `leads-cells.jsx` (13–332, after `people-table.jsx`), `leads-bench.jsx` (420–618), `leads-map.jsx` (619–846) | none. The tests `leads-honest` and `leads-peek` import the new files |
| 10 | `reach-out-2o-split-campaign-pages` | `outbound-real.jsx`: `playbook-bits.jsx` (27–126, 273–326), `playbook-card.jsx` (137–272, 731–949), `playbook-composer.jsx` (327–730). `broadcasts-real.jsx`: `broadcasts-run.jsx` (54–381), `broadcasts-ledger.jsx` (495–771). The composer inside `BroadcastsReal` stays (its state is tangled; it's left for Part 4) | playbooks.test:306, :346; visit-playbooks:311; starter-templates:334; broadcasts.test:456, :531: delete the assertions a render test covers, repoint the rest (`playbooks-real`, `pb-starter`) at the new file with no new read |

**Each PR's tasks:**
- [ ] Record `tail -1 packages/<pkg>/dist/index.d.ts` to a scratch file.
- [ ] Cut the ranges. Add the re-exports (backend) or the load lines (pages).
- [ ] Build, then confirm the export list is byte-identical (`diff`).
- [ ] Run the full suite: 0 fail. For pages, also the page's render tests and the harness screenshot.
- [ ] Check `git diff --color-moved=dimmed-zebra`: only moves, imports and re-exports.
- [ ] One review (it has little to find; the review is of the proof), CI, merge.

**The cycle break (inside PR 7, last commit).** Two moves:
- `leadsFirstDayWays` goes to `lead-first-day.ts`, exported from `index.ts`, with `leads-honest`'s one import
  repointed.
- template-library's import of `triggerOf`/`triggerOffered` points at `playbook-triggers.ts`.

This is one large, mechanical dist diff, said in the PR body. After it the 13-module cycle is five modules, and later
contracts PRs stay small. Simulated in the audit's scratch build before it is done for real.

Deliberately left (large but stable, and Part 3 does not extend them):
- `core/leads/runner.ts` (the finder; three tests import it by path);
- `core/deliver.ts` (683 lines; CLAUDE.md names the path as the one send door, and PR 1 moved its reads into db);
- `channels/email.ts` (split only if Part 3 touches the intake);
- `server/playbooks.ts` and `server/broadcasts.ts` (pins; they're split when Part 3 adds the pools);
- `inbox-thread.jsx` (Part 5).

The rest of the repo's large files (`clients-a.jsx`'s People half, `today.ts`, `config.ts`, `settings.jsx` and others)
are not Reach out's, and are named in PR 12's status block so they're known, not forgotten.

---

## PR 11 — The runtime and the toolchain agree

Branch `reach-out-2p-toolchain` from main after PR 10. No migration.

### Tasks
- [ ] **Node 24.** Set `.nvmrc` to `24`; set `engines.node` in the root `package.json` to `">=24 <25"`; set
  `node-version: 24` in `.github/workflows/ci.yml`, `database.yml` and `nightly-e2e.yml`; set `@types/node` to
  `^24`. Run the whole suite locally on Node 24 (check `node --version` first). Delete `docs/runbook.md`'s line
  18 caveat ("CI runs Node 22").
- [ ] **pnpm.** `packageManager` becomes the latest 10.x (read it with `corepack pnpm view pnpm@10 version`), then
  `corepack pnpm install` and a lockfile check (`--frozen-lockfile` in CI must pass).
- [ ] **`@eslint/js`** goes to `^10` beside `eslint ^10`; lint must show the same 47 warnings or fewer.
- [ ] **Undeclared packages declared where they are imported.**
  - `apps/edge`: `zod` and `html-to-text`, as the dists import them.
  - `tooling/scripts`: its own `package.json` `devDependencies`, or the root's, per how it resolves today (read
    `pnpm-workspace.yaml`).
  - Prove it with `corepack pnpm install --frozen-lockfile`, then the suite.
- [ ] **One `emailDomain()`.** `packages/contracts/src/email-domain.ts` gets `emailDomainOf(value: string |
  undefined)`, and the edge and dashboard getters call it with their env value.
- [ ] **One place for time limits.** Write a test that every `apps/edge/api/**/*.ts` door has a `vercel.json`
  `functions` entry, and that no file exports `config.maxDuration` too. Then move the 20 `export const config`
  limits into `vercel.json`, or the reverse (whichever `vercel.json` already mostly holds). One source.
- [ ] The six checks, one review, merge.

Not done here, deliberately:
- TypeScript 7: tsup's d.ts builds need the API 7 drops; revisit when tsup or tsdown supports it.
- The `resend`/`svix` SDKs: the hand-rolled versions are tested and never throw, which the ledger relies on.
- A dashboard-wide env module (24 files; its own plan, not Reach out's).

---

## PR 12 — The documents say what shipped, and what Part 3 must carry

Branch `reach-out-2q-docs` from main after PR 11. Docs only.

### Tasks
- [ ] **The spec, `docs/superpowers/specs/2026-09-25-reach-out-design.md`.**
  - The header status becomes "Parts 1–2 shipped; 2.5 shipped; 3 next".
  - §4.6 matches the built columns and doors (`counted_since`, `sent_recent`/`bounced_recent`/`complaints`,
    `outreach_facts`, the lanes, the two webhook secrets).
  - §4.8 names the door's checks as built.
  - §6's Part 3 list gains C1–C14; Part 5 gains C15.
  - §9 records D1–D13 as taken.
- [ ] **`docs/system-prd.md`.** Add a section for:
  - the public `/u/` door;
  - `email_marketing` and its sources;
  - the admin sending-domains door;
  - the `outreach` purpose and the lanes;
  - the two-account webhook;
  - the cold-receipt watch.

  The switches table gets a "Turn on cold email" row. Appendix B's env table gains `RESEND_COLD_API_KEY`,
  `RESEND_COLD_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET` and `UNSUBSCRIBE_SECRET_PREVIOUS`.
- [ ] **`docs/runbook.md`: "Turning on cold email".**
  - Create the second Resend account on a plan with enough domains.
  - Set its API key on the edge.
  - Point its webhook at `/api/resend-webhook` and set the webhook secret.
  - Set `UNSUBSCRIBE_SECRET` on both Vercel projects: the same value, and generate it with
    `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
  - Check `/api/diag` shows the four switches true.
  - Add the first domain and wait for it to verify.
  - The DKIM check: one send, with Ruben's yes.
  - Rotating the unsubscribe secret: set the previous value, then the new one.
- [ ] **`docs/glossary.md`.**
  - Add a sending domain: a workspace's own domain that cold email leaves from, apart from its mailbox.
  - Fix line 29's "or its own domain" collision.
- [ ] **`docs/architecture.md`.** One paragraph: the send door's lanes, and where outreach's facts come from.
- [ ] **This plan's "As built"**: the PR numbers, SHAs, migrations on production, and what differed. Include a list
  of the repo's other large files (from the audit's measure) as known, unowned work.
- [ ] Merge on green (docs only; format check).

---

## Not in this plan

- Anything that sends a cold email: Part 3. The door refuses outreach nowhere new here except where the spec says it
  must.
- The e2e specs for `/u/` and the domains block. They need Ruben's secrets and the cold account first. They are
  written in Part 3, behind the existing `E2E_*` switch pattern.
- DNS blocklist lookups, a separate link domain, and the platform-wide cold-mail breaker (Part 2's "Not in this part"
  stands).

## As built

(Filled in by PR 12.)
