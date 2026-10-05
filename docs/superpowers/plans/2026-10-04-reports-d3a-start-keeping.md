# Reports phase D3a: start keeping, the third batch, first half (channel health over time, and the day's rollup) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start keeping what the Campaigns lens, the Overview's trends, Usage's earlier periods and the operator's day view will read, and the product does not keep today: a template's quality as its webhook says it (K9); a WhatsApp number's rating, read on a clock, with a kept event whenever it changes (K9); each sending domain's counters as they stood each day (K9); and every workspace's day rolled with how each customer message ended, what they asked about, the model's tokens by purpose, and what the day's calls cost (K10, and the first clause of K8), with the one read an owner's session may make of it (K10). Nothing a customer or an owner's page shows changes, except one thing said in Task 1: a template's quality pill follows its webhook the moment Meta sends it, where it used to wait for the next sync.

**Architecture:** Every capture here is either a SQL function on a clock or a branch of a webhook that already exists, and none of them is a trigger on a live write path, so none can fail, block or delay the row that said it. K9's template quality is one more `update` in the account-news handler that already applies a template's status and category. K9's sending-domain snapshot is a nightly SQL function (a table, a pg_cron job registered as data), reading the counters the ten-minute domains sweep already keeps on the row. K9's number rating is a new six-hourly edge sweep (the reason is in the anchors table) that reads Meta's `quality_rating`, merges it into the channel row beside, and never over, the connect-time rating `numberHealth` gates broadcasts on, and writes an event when it changes. K10 widens the nightly roll with a second statement, in a block that traps its own failure, so the operator's existing columns and the answer-silence alarm never depend on the new ones, and adds one SECURITY DEFINER door that checks membership itself and returns only the columns an owner may see. Nothing is backfilled: an old day reads null, a key with nothing to say is not written, and a lens treats null as absent.

**Tech Stack:** Postgres (plpgsql, pg_cron, forward-only migrations 00296-00299), TypeScript (`apps/edge`, `packages/db`, `packages/contracts`), `node:test` through `tooling/scripts/checks/test.mjs` (the `--db` files need the local Supabase stack).

**Spec:** `docs/superpowers/specs/2026-10-02-reports-lenses-design.md` (§10 K8's first clause and K9-K10 are this batch; §5 phase D, §7 the registry's ids, §9's Usage lens and its operator notes, §13 testing, §15-17 rollout, scope, risks, §18's open decisions). Why each exists and which tile reads it: `docs/superpowers/specs/2026-10-02-reports-lenses-data-catalog.md` (§1 rows 4-6; the Campaigns, Usage and Overview tables). Batches 1 and 2 are `docs/superpowers/plans/2026-10-03-reports-d1-start-keeping.md` and `…-d2-start-keeping.md`; this plan copies their shape and their rules. K8's other four clauses (WhatsApp pricing, SMS segments, invoice amounts, the lead judge's round) are D3b, `docs/superpowers/plans/2026-10-04-reports-d3b-start-keeping.md`, which goes second and is stacked on this one.

## Global Constraints

- **No commit, no push, no PR, no stash, no reset, no `git checkout`** until Ruben says so (his standing rule, 2 Oct 2026). Every task ends with `git add`, never a commit. Nothing is applied to production: Task 7 lists Ruben's steps.
- **The tree is `cm-reports-d1`** (branch `feat/reports-d1-start-keeping`): main `32328415f` + Reports phase A (00285, 00286) + batch 1 (00287-00290) + batch 2 (00291-00295), all staged. Build on it; create no worktree. **Migrations 00296-00299**, contiguous; D3b continues at 00300. Main has since moved (`90be2a94f`) and holds its own 00287-00289 and 00296-00299: the whole run is renumbered above main's head at landing by `dev-tools/reports-renumber.mjs`, before the rebase, so the numbers here stay as written and stay contiguous.
- **Never `supabase db reset`, never `supabase migration up`**: the local stack is shared (another lane's objects live in it, and a demo workspace). Apply each migration additively, twice (a migration is re-runnable, and the second run is the proof): `docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction < supabase/migrations/<file>` (`--single-transaction` is what makes the lock guard's `set local` hold). Then `node tooling/scripts/checks/migration-ledger.mjs --record`, and record the version in the stack's own ledger so `database/migration-head.db.test.mjs` is not red: `docker exec -i supabase_db_chanlytics-messaging psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations (version, name) values ('<NNNNN>', '<name after the number>') on conflict (version) do nothing"`.
- **Never connect to production**, never `--linked`, never print a key. A database test needs the stack's environment: in the same bash command run `source "C:/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/fb3146c6-45b0-45d3-8336-ef4e473e6ac1/scratchpad/sdd-reports-d1/db-env.sh"` (it exports `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_CLI`), then `node tooling/scripts/checks/test.mjs --db <file>`. **Never run the whole suite locally** (about 20 minutes): each touched file alone, plus `corepack pnpm -r typecheck` and `corepack pnpm lint` (lint holds its baseline in `docs/debt.md`, or fewer).
- **Regenerate once, at the end, keeping only this batch's hunks.** The shared stack holds what this tree does not (another lane's `remove_template_version` and `save_template_version`, and partition names a regeneration renames), so after a generator runs, compare each generated file with its staged version and keep only the hunks this batch's migrations explain, restoring every other hunk with the Edit tool, never `git checkout`; `grep -c template_version` must print 0 for `supabase/schema.sql` and `packages/db/src/database.types.ts`. `supabase/schema.sql` and `docs/data-model.md` are regenerated once, in Task 7. **One exception, and why:** the in-memory database every TypeScript test uses (`tooling/scripts/tests/_fake-db.mjs`) refuses a table, column or function that `packages/db/src/database.types.ts` (and `_unique-keys.generated.json`, and `schema-sets.generated.ts` for a CHECK) does not hold, so a task whose TypeScript tests name a new object runs `corepack pnpm gen:db-types` (and `gen:schema-sets` when it adds a CHECK) right after applying its migration and keeps only its own hunks there. Say which in the task.
- **Dists:** tests import the packages' built `dist`: `corepack pnpm --filter "./packages/*" build` after every change to a package. Stage only the dists with a real diff (`git diff --ignore-cr-at-eol --stat -- packages/*/dist`); leave line-ending-only diffs unstaged. `packages/db`'s source changes in this batch (Task 4), so its `dist/index.d.ts` `agrees` comment hunks are restored by hand, never by `git checkout`.
- **Where the new tests go (a folder holds at most 20 modules; direct modules counted 4 Oct):** `tooling/scripts/tests/whatsapp/` (10), `email/domains/` (10), `cron/` (11), `platform/` (9). One file each, none past 20. The root of `tooling/scripts/tests/`, `database/`, `ops/`, `workspace/`, `edge/` and `repo/` are full: a new file never goes there (existing files there are edited). A helper a file needs is copied into the file, as ten neighbours copy `rolledBack`.
- **A migration that locks a live table opens with the lock guard** of 00259, 00277-00284 and 00290: `set local lock_timeout = '3s';` and the DO block that warns when the file was applied outside a transaction (copy `supabase/migrations/00295_*.sql`'s head). None of this batch's migrations locks more than one live table (00298 alters `platform_metrics`, written once a night and read by the back office; the rest add objects), so none needs a `lock_timeout` below `deadlock_timeout`; a later one that does says so in its header. A new trigger is made with `create or replace trigger`, never dropped and created. **This batch adds no trigger on a live table**: the rule that a trigger or stamp traps its own failure, proved by a committed `rolledBack` test (pattern: `tooling/scripts/tests/database/team-changes-and-their-audit.db.test.mjs:680-725`), binds here where the batch has a block that must not fail its host: the roll's second statement (Task 5), and its test forces that failure.
- **A capture never fails, blocks or delays the thing that said it.** A webhook branch is best-effort (its write is one more statement after the one that already happens, inside a try that logs and carries on); a SQL clock writes its own tables only. A door the sweep calls (`channel_keep_quality`) fails whole and is tried again next tick: it is no trigger on a live write.
- **One predicate per rule.** "A call's cost in dollars" is `call_cost_usd`; "a template's quality" is `mapQuality` (the sync and the webhook both); "a day of a workspace" is `platform_metrics_roll`; "may this session read a workspace's days" is `workspace_days`'s one membership predicate, the one `team_roster` and `recording_opened` already say. A closed set a SQL function must repeat (`meta.handled`'s four words, the nine topics) is tied to its contracts set (`HANDLED_OUTCOMES`, `BRAIN_INTENTS`) by a test, never by a second list unheld.
- **Event kinds are declared in the closed set**: `channel.quality_rating` is in `EVENT_KINDS`, has its words in `activity.ts`, and is hidden from the owner's Activity log **by its exact kind** in `ACTIVITY_NOISE_KINDS` (`channel.` is a family the log shows, Meta's own account news among it; a prefix would hide or show the wrong ones). A header comment never says "insert into events": `repo/event-kinds.test.mjs` reads every such phrase in a migration for a kind.
- **Stored SQL text cites code by file and function, never by line**: a function body or `comment on` names `packages/core/src/...` `handledOf`, never `:142` (batch 2's I-1: a line cite in an applied migration rots and cannot be edited).
- **Either deploy order works**, said per task. The one that matters: the edge (the new route and its `vercel.json` entry) before 00297, or the first tick of its clock asks for a route that is not there and `sweep_health` goes red until it is.
- **No backfill, absent never zero (spec D9).** An old day, template, number or domain reads null or has no row; a key with nothing to say is not written.
- **Money and cost are the operator's, never an owner's page (spec D11).** `ai_usd` and `voice_usd` are in `platform_metrics`, which no session can read; `workspace_days` names its columns and never returns them, and its test pins the list.
- **Edit existing files byte-exact: almost every file touched here is CRLF** in this checkout. Use the EOL-preserving helper `C:/Users/Ruben/AppData/Local/Temp/claude/C--Users-Ruben-Documents-Claude-Projects-Claude-Video/fb3146c6-45b0-45d3-8336-ef4e473e6ac1/scratchpad/sdd-reports-d1/edit-lib.cjs` (`edit(path, [[old, new], ...])`, written with `\n`, each match unique) from a script, or the Edit tool one line at a time. Never `sed -i`, never a text-mode Python write, never PowerShell `Get-Content`/`Set-Content` on a source file.
- **The ratchets only fall.** A change that makes a measured number fall (a function's lines after an extraction, a baseline's file) fails the build until it is banked: `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` and stage the baseline and the `docs/debt.md` / `docs/takeover.md` blocks it rewrites. Nothing in D3a extracts a function; D3b does.
- No real customer in a test or a doc: slugs `harbor-*` and `acme-*`, numbers `+1555013xxxx`, made-up ids, addresses at example.com. Never call a real provider in a test: Meta's Graph is a captured `fetch` answering a canned body.
- Prettier owns formatting: `corepack pnpm exec prettier --write <files>` on every touched file before staging (`docs/superpowers/` is Prettier-ignored).
- **The local stack never posts a sweep to production** (`supabase/seed.sql` deletes `edge_base_url` from Vault, so `request_sweep` only records "missing … in Vault"). Add nothing that would.

## Review Focus

1. **A day rolled twice, and a new column that cannot be built:** the same night re-run (a retry, a second call) replaces the new columns and never doubles them, `tokens` read from the ledger is never added to the events' count of the same calls, and a failure in the new columns (forced with a refusing constraint) costs those columns alone: the day's existing counts and the answer-silence alarm are written all the same, and the roll answers instead of raising. Test: Task 5.
2. **Words the roll did not expect:** a `meta.handled` or `meta.intent` or `analysis.topic` outside its closed set, an unstamped message, a backfilled one, a call that never connected or went out, and a call cost that is a string, negative, an array or past any call's possible price: never a key, never a failure, never a zero that is not a fact. Test: Task 5.
3. **Who may read a workspace's days:** another workspace's owner, anon, the service role (which has no session) and a span of years are refused (`42501`, `22023`); a member of the workspace reads exactly the owner-safe column list and never `ai_usd`, `voice_usd`, `brain_p95_ms`, `provider_failures` or the legacy `tokens`; a day rolled before 00298 reads null where the new columns are. Test: Task 6.
4. **Meta's answer to the rating read is not a rating:** an error, a token revoked, an answer in no word Meta uses, no answer at all, a channel with no credentials: the channel is left as it was, nothing is invented, one bad number never costs the next its read, and the tick still answers 200. Test: Task 4.
5. **A template quality webhook that names nothing we hold:** no name, no language, a score outside the four, a template with no row yet, another language of the same name, another workspace's same-named template, and a write the database refuses: nothing is created or changed wrongly, the event is kept as Meta sent it, and the webhook is acknowledged. Test: Task 1.

---

## Spec anchors, checked in this tree

| Spec | Found | Moved, missing or decided |
| --- | --- | --- |
| K9 `waba-events.ts:225-290` | `handleWabaChange` keeps the change as `channel.<field>` (225-230), remembers the newest limit and rating event on the channel (231-252), and applies a template's status or category by name and language (253-291). `message_template_quality_update` is in `WABA_FIELDS` (`enums.ts:117-123`), so it is kept as an event and **never applied**: `templates.quality` is written by the sync alone (`meta-templates.ts:185`, raw `quality_score.score`) | Same bytes on main. `templates.quality` is read only by the Templates page's `StatePill` (`message-row-parts.tsx:274`), keyed `GREEN`/`YELLOW`/`RED`/`UNKNOWN` (`shell/tone.ts:150`): applying the webhook makes that pill move sooner. Nothing gates a send on it |
| K9 `meta-graph.ts:83` | `phoneNumber()` asks Meta for `quality_rating` and is called only at connection (`api/admin/whatsapp/connect.ts:132`), stored once as `tenant_channels.config.quality_rating`. `numberHealth` (`broadcast-number.ts:45`) **gates broadcasts on that stale word**: `RED` or a `FLAGGED` event cannot send, and a number that connected `RED` and recovered stays blocked | Same on main. Writing the refreshed word over `config.quality_rating` would change broadcast gating, so this batch writes it beside it (`quality_read`, `quality_read_at`) and leaves the gate to Ruben (notes, decision 1) |
| K9 "a clock" | No sweep visits a WhatsApp channel: the playbooks sweep reads `config` but runs only for workspaces with playbooks, and `health` is a watcher whose answer must never depend on a write | **A new sweep**, `channel_quality`, every six hours (reasons in Task 3). Checklist: migration (`trigger_channel_quality_sweep`, a `sweep_status` row, `cron.schedule`), route `api/cron/channel-quality.ts` behind `authorizeCron`, `EVERY_CLOCK` in `ops/sweep-registry.db.test.mjs`, both lists in `ops/sweep-health.integration.test.mjs`, `vercel.json` |
| K9 `email/sending-domains.ts:412,566` | `countsPatch` (411-414) and `holdForComplaint` (564-570) write `sent_recent`, `bounced_recent`, `complaints` and `sent_days` over the row on every check; Resume clears them (598-603). The row is the only place they live | On main the file is split (`sending-domain-check.ts:95-96,174`). The snapshot is SQL and edits no TypeScript, so nothing here moves |
| K10 `platform_metrics_roll (00277:406)` | The only definition is `supabase/migrations/00277_what_happened_is_named_audited_and_counted.sql:406-513` (the spec's "00277" is the number, not the name). It reads `usage.llm_tokens` and `usage.ask_tokens` events (purged at 30 days, `RETENTION_DAYS.events_evidence`) for replies and tokens, and `first_replies` (phase A) for asks | Re-running a day older than 30 days zeroes the event-derived columns of its row: this batch does not backfill and says so (notes) |
| K10 "a read scoped to the caller's own workspace" | `platform_metrics` is service-role only on purpose: `brain_p95_ms`, `provider_failures` and `tokens` are the operator's, `tenancy.db.test.mjs` pins it `none`, and the roll now also holds dollars. A SECURITY INVOKER read over it sees nothing; a member policy would hand an owner the dollars; column grants break the harness and any `select *` | **Decided:** `workspace_days`, SECURITY DEFINER, checks membership itself (the predicate `team_roster` uses, partner seats only with a second factor shown) and returns an explicit column list. The reader and route come with the first tile that reads it (phase C/F): an exported repository function with no caller is a dead export, which the baseline refuses |
| K8 `voice-retell.ts:181` | `cost: c.call_cost ?? null`, stored whole in `calls.cost` by `ingest_call` and never read. Retell's `call_cost.combined_cost` is in **cents** (their `get-call` reference) | Same line on main. Delivered as `platform_metrics.voice_usd`, in dollars, by the roll (Task 5), not as a column on `calls` (a trigger on the live call row for a number only the operator reads) and not in `usage_ledger` (`security invoker`, readable by every member: an owner would see voice dollars) |

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `supabase/migrations/00296_a_sending_domain_keeps_each_day_s_counters.sql` | create | `sending_domain_days`, `sending_domain_days_keep`, its clock |
| `supabase/migrations/00297_a_number_s_quality_is_read_on_a_clock.sql` | create | `channel_keep_quality`, `trigger_channel_quality_sweep`, the clock |
| `supabase/migrations/00298_a_day_keeps_what_the_lenses_read.sql` | create | five `platform_metrics` columns, `call_cost_usd`, the widened `platform_metrics_roll` |
| `supabase/migrations/00299_a_member_reads_their_workspace_s_days.sql` | create | `workspace_days` |
| `apps/edge/lib/whatsapp/meta-templates.ts`, `waba-events.ts` | modify | `mapQuality`; the quality webhook applied |
| `apps/edge/lib/whatsapp/number-quality.ts` | create | the sweep's reading loop, over ports |
| `apps/edge/api/cron/channel-quality.ts` | create | the sweep's door |
| `packages/db/src/sweeps.ts`, `packages/db/src/index.ts` | modify | `whatsappNumbersToRead`, `keepChannelQuality` |
| `packages/contracts/src/shared/enums.ts`, `workspace/activity.ts` | modify | `channel.quality_rating`: declared, worded, hidden by name |
| `apps/edge/lib/log-events.ts`, `apps/edge/vercel.json`, `apps/edge/lib/ops/sweep-health.ts` | modify | the sweep's log names, limit and consequence words |
| `tooling/scripts/tests/database/tenancy.db.test.mjs`, `tooling/scripts/ops/delete-tenant.mjs` | modify | the new tenant table (member-readable; backed up on delete) |
| `tooling/scripts/tests/ops/sweep-registry.db.test.mjs`, `ops/sweep-health.integration.test.mjs`, `repo/ops-hygiene.test.mjs`, `workspace/activity.test.mjs` | modify | the two clocks, the sweep's limit, the kind's words |
| `tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs` | create | Task 1 |
| `tooling/scripts/tests/email/domains/a-sending-domain-keeps-each-day-s-counters.db.test.mjs` | create | Task 2 |
| `tooling/scripts/tests/whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs` | create | Task 3 |
| `tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs` | create | Task 4 |
| `tooling/scripts/tests/platform/a-day-keeps-what-the-lenses-read.db.test.mjs`, `a-member-reads-their-workspace-s-days.db.test.mjs` | create | Tasks 5 and 6 |
| `supabase/migrations-ledger.json`, `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md`, `docs/system-prd.md` | regenerate / modify | Task 7 (types earlier, see the constraint) |

---

### Task 1: A template's quality follows its webhook (K9, no migration)

**Files:**
- Modify: `apps/edge/lib/whatsapp/meta-templates.ts` (after `mapCategory`; `templateRow`'s `quality`), `apps/edge/lib/whatsapp/waba-events.ts` (the import line, `handleWabaChange`, one new function), `apps/edge/lib/log-events.ts` (one name)
- Create: `tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs`

**Interfaces:**
- Produces: `mapQuality(q: unknown): "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | null` exported from `meta-templates.ts` (Meta's four words in their own case; anything else is no quality, nothing guessed), used by `templateRow` (the sync) and by the webhook branch, so one function says what a quality is. `applyTemplateQuality(db, tenantId, value, L)`, module-private in `waba-events.ts`: sets `templates.quality` to the update's `new_quality_score` on the row named by `message_template_name` and `message_template_language` in the routed workspace's WhatsApp templates, and writes nothing else. A log name `template_quality_write_failed`.
- Why the history needs nothing new: `channel.message_template_quality_update` is already kept as Meta sent it (`previous_quality_score`, `new_quality_score`, the template's id, name and language), never purged (not an evidence kind), so a template's quality over time is those events; what was missing is only the row following them.
- What an owner sees: the Templates list's quality pill moves when Meta says so instead of at the next sync. Nothing else reads the column.
- Either deploy order: nothing in the database changes; an older edge keeps the sync-only behaviour.

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs`:

```js
/**
 * A template's quality follows its webhook (the Reports lenses spec, K9), run over a database in memory: Meta's
 * message_template_quality_update is kept as the workspace's event, as it always was, and now also moves the quality
 * of the template it names, in that language, in the routed workspace. Meta's four words, in any case, are the only
 * qualities; a template the workspace has no row for yet, a score outside the four and a write the database refuses
 * leave the rows as they were and the webhook acknowledged. The sync (templateRow) says quality through the same
 * function.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";
import { logLineOf } from "../_log-lines.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
const { handleWabaChange } = await import(at("apps/edge/lib/whatsapp/waba-events.ts"));
const { templateRow, mapQuality } = await import(at("apps/edge/lib/whatsapp/meta-templates.ts"));

const T = "aaaaaaaa-0000-4000-8000-0000000000a1";
const OTHER = "bbbbbbbb-0000-4000-8000-0000000000b1";
const WABA = "207650000000901";
const KIND = "channel.message_template_quality_update";

const template = (id, over = {}) => ({
  id,
  tenant_id: T,
  channel: "whatsapp",
  name: "visit_reminder",
  language: "en_US",
  meta_status: "approved",
  quality: "GREEN",
  ...over,
});

function world(faults = {}) {
  const tables = {
    tenant_channels: [
      {
        id: "ch-1",
        tenant_id: T,
        kind: "whatsapp",
        external_id: "106540000000901",
        waba_id: WABA,
        status: "active",
        number_e164: "+13055550901",
        config: {},
      },
    ],
    templates: [
      template("t-en"),
      template("t-es", { language: "es" }),
      template("t-hours", { name: "hours" }),
      template("t-theirs", { tenant_id: OTHER }),
      template("t-sms", { channel: "sms" }),
    ],
    events: [],
    notifications: [],
  };
  return { tables, db: fakeDb(tables, faults) };
}
const qualities = (tables) => Object.fromEntries(tables.templates.map((t) => [t.id, t.quality]));
const GREEN_ALL = { "t-en": "GREEN", "t-es": "GREEN", "t-hours": "GREEN", "t-theirs": "GREEN", "t-sms": "GREEN" };
const update = (db, over = {}) =>
  handleWabaChange(
    db,
    WABA,
    {
      field: "message_template_quality_update",
      value: {
        previous_quality_score: "GREEN",
        new_quality_score: "YELLOW",
        message_template_id: 123,
        message_template_name: "visit_reminder",
        message_template_language: "en_US",
        ...over,
      },
    },
    async () => null,
  );
const kept = (tables) => tables.events.filter((e) => e.kind === KIND);

async function logged(fn) {
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(real)) console[k] = (...args) => lines.push(args);
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, real);
  }
}

test("an update lands on the template it names, in its language, in the routed workspace, and on no other; the event is kept as Meta sent it and nobody is alerted", async () => {
  const { tables, db } = world();
  assert.equal(await update(db), "kept");
  assert.deepEqual(qualities(tables), { ...GREEN_ALL, "t-en": "YELLOW" });
  assert.deepEqual(
    kept(tables).map((e) => [e.tenant_id, e.subject_id, e.data]),
    [
      [
        T,
        "ch-1",
        {
          waba_id: WABA,
          previous_quality_score: "GREEN",
          new_quality_score: "YELLOW",
          message_template_id: 123,
          message_template_name: "visit_reminder",
          message_template_language: "en_US",
        },
      ],
    ],
    "the history is the kept event",
  );
  assert.equal(tables.notifications.length, 0, "a quality score is nobody's alert");
});

test("Meta's four words land, in any case; every other word, and no word, leaves the quality alone; the event is kept either way", async () => {
  for (const [sent, want] of [
    ["GREEN", "GREEN"],
    ["yellow", "YELLOW"],
    [" RED ", "RED"],
    ["UNKNOWN", "UNKNOWN"],
  ]) {
    const { tables, db } = world();
    tables.templates[0].quality = null; // a template the sync has not scored: every word below is a change
    await update(db, { new_quality_score: sent });
    assert.equal(tables.templates[0].quality, want, `${JSON.stringify(sent)}`);
  }
  for (const sent of ["HIGH", "", null, 7, undefined]) {
    const { tables, db } = world();
    assert.equal(await update(db, { new_quality_score: sent }), "kept");
    assert.deepEqual(qualities(tables), GREEN_ALL, `${JSON.stringify(sent)} is not a quality`);
    assert.equal(kept(tables).length, 1, "and Meta's word is on record all the same");
  }
});

test("an update that names no template we hold creates nothing and changes nothing: no name, no language, no row, another channel's", async () => {
  for (const over of [
    { message_template_name: undefined },
    { message_template_language: undefined },
    { message_template_name: "never_synced" },
    { message_template_language: "fr" },
  ]) {
    const { tables, db } = world();
    const before = tables.templates.length;
    assert.equal(await update(db, over), "kept");
    assert.deepEqual(qualities(tables), GREEN_ALL);
    assert.equal(tables.templates.length, before, "a template Meta names and the sync has not met is left for the sync");
  }
});

test("a write the database refuses costs the template its new word and nothing else: the event is kept, the webhook acknowledged, and the failure is on the log", async () => {
  const { tables, db } = world({ "templates.update": { message: "the database is unavailable" } });
  const { result, lines } = await logged(() => update(db));
  assert.equal(result, "kept");
  assert.deepEqual(qualities(tables), GREEN_ALL);
  assert.equal(kept(tables).length, 1);
  assert.deepEqual(
    lines.map(logLineOf).filter(Boolean).map((l) => l.event),
    ["template_quality_write_failed"],
  );
});

test("the sync and the webhook say quality the same way: Meta's four words, and nothing else is a quality", () => {
  const meta = (score) => ({
    id: "9",
    name: "visit_reminder",
    language: "en_US",
    status: "APPROVED",
    category: "UTILITY",
    ...(score === undefined ? {} : { quality_score: { score } }),
  });
  assert.equal(templateRow(meta("YELLOW"), T).quality, "YELLOW");
  assert.equal(templateRow(meta("green"), T).quality, "GREEN");
  assert.equal(templateRow(meta("HIGH"), T).quality, null, "a word Meta does not use is no quality");
  assert.equal(templateRow(meta(undefined), T).quality, null);
  assert.equal(mapQuality("UNKNOWN"), "UNKNOWN");
  assert.equal(mapQuality({}), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs`
Expected: FAIL: `mapQuality` is not exported, and the first case finds `t-en` still `GREEN`.

- [ ] **Step 3: Implement `mapQuality` in `meta-templates.ts` and use it where the sync reads the score**

In `apps/edge/lib/whatsapp/meta-templates.ts`, after `mapCategory`, add the function; one module-private constant holds the four words, never exported (an export nothing else reads is a dead export):

```ts
const TEMPLATE_QUALITIES = ["GREEN", "YELLOW", "RED", "UNKNOWN"] as const;
type TemplateQuality = (typeof TEMPLATE_QUALITIES)[number];

/** A template's quality in Meta's own words (the Templates page's pill is keyed by them); any other value is no quality. */
export function mapQuality(q: unknown): TemplateQuality | null {
  const word = typeof q === "string" ? q.trim().toUpperCase() : "";
  return TEMPLATE_QUALITIES.find((w) => w === word) ?? null;
}
```

`TemplateRow.quality` becomes `TemplateQuality | null`, and `templateRow`'s line `quality: t.quality_score?.score ?? null,` becomes `quality: mapQuality(t.quality_score?.score),`.

- [ ] **Step 4: Apply the webhook's score in `waba-events.ts`**

Change the import `import { mapCategory, mapStatus } from "./meta-templates.js";` to name `mapQuality` too, and `import { logger, errField } from "../log.js";` to name `type Logger`. In `handleWabaChange`, immediately before the line `if (!described || !described.alert) return "kept";`, add:

```ts
  if (change.field === "message_template_quality_update") await applyTemplateQuality(db, routed.tenantId, change.value, L);
```

and add the function above `handleWabaChange`, beside `TEMPLATE_STATUS_EVENTS`:

```ts
/**
 * A template's quality, as Meta just said it (K9): the row the sync keeps takes the new score, by name and language, as a
 * status or a category change does. The sync still sets it whole; the history is the event kept above. A score outside
 * Meta's four, or a name or language missing, changes nothing; a template with no row yet is left for the next sync.
 */
async function applyTemplateQuality(
  db: SupabaseClient<Database>,
  tenantId: string,
  value: Record<string, unknown>,
  L: Logger,
): Promise<void> {
  const quality = mapQuality(value.new_quality_score);
  const name = typeof value.message_template_name === "string" ? value.message_template_name : null;
  const language = typeof value.message_template_language === "string" ? value.message_template_language : null;
  if (!quality || !name || !language) return;
  const { error } = await db
    .from("templates")
    .update({ quality })
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", name)
    .eq("language", language);
  if (error) L.error("template_quality_write_failed", { error: error.message });
}
```

In `apps/edge/lib/log-events.ts` add `"template_quality_write_failed",` in its sorted place (beside `template_category_write_failed` and `template_status_write_failed`).

- [ ] **Step 5: Run the tests, then the ones this change can break**

Run: the new file; then plain `whatsapp/whatsapp-connect.test.mjs`, `whatsapp/whatsapp-door.test.mjs`, `repo/log-events.test.mjs`, `repo/event-kinds.test.mjs`; then `corepack pnpm -r typecheck` and `corepack pnpm lint`.
Expected: PASS (the door file runs `handleWabaChange` through the real webhook and must not move).

- [ ] **Step 6: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs apps/edge/lib/whatsapp/meta-templates.ts apps/edge/lib/whatsapp/waba-events.ts apps/edge/lib/log-events.ts
git add tooling/scripts/tests/whatsapp/a-template-s-quality-follows-its-webhook.test.mjs apps/edge/lib/whatsapp/meta-templates.ts apps/edge/lib/whatsapp/waba-events.ts apps/edge/lib/log-events.ts
```

---

### Task 2: A sending domain keeps each day's counters (K9, migration 00296)

**Files:**
- Create: `supabase/migrations/00296_a_sending_domain_keeps_each_day_s_counters.sql`
- Create: `tooling/scripts/tests/email/domains/a-sending-domain-keeps-each-day-s-counters.db.test.mjs`
- Modify: `tooling/scripts/tests/database/tenancy.db.test.mjs` (a seed beside `ctx.domain`'s at ~226, an entry after `sending_domains` at ~591), `tooling/scripts/ops/delete-tenant.mjs` (`TABLES`, before `"sending_domains"`), `tooling/scripts/tests/ops/sweep-registry.db.test.mjs` (`EVERY_CLOCK`, `RUN_JUDGED`), `tooling/scripts/tests/ops/sweep-health.integration.test.mjs` (both name lists)

**Interfaces:**
- Produces (SQL): table `public.sending_domain_days (tenant_id, domain_id, day, host, state, held_why, sent, bounced, complaints, sent_days, checked_at, kept_at; primary key (domain_id, day))`, a member's read of their own workspace's rows (RLS), the service role's writes; `public.sending_domain_days_keep() returns integer`, which writes one row for each domain that is `verified` or `held`, under yesterday (UTC), copying `sent_recent`, `bounced_recent`, `complaints`, `sent_days`, `state`, `held_why` and `checked_at` as the domains sweep last left them, replaces its own day's row when run again, and answers how many rows it wrote; the pg_cron job `sending-domain-days` at `23 0 * * *` and its `sweep_status` row (`sending_domain_days`, 26 hours, judged on its runs).
- No parameter on purpose: the counters are the row's *now*, so the only day they can honestly be filed under is the one that has just ended. A function that took a day would file today's counters under an old one.
- A row says how stale it is (`checked_at`: the domains sweep's last read of that domain); `sent`, `bounced`, `complaints` and `sent_days` are null where the row had none (a domain verified and not yet counted, or just resumed): absent, never zero.
- No foreign key from `domain_id`: a domain taken off a workspace keeps the days it had, for as long as the workspace lasts (the workspace's deletion takes them, by the tenant key). Kept for the workspace's life, as the privacy page says of everything it names no schedule for.
- Either deploy order: nothing reads it. Run when the line is quiet: the migration locks nothing live.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/email/domains/a-sending-domain-keeps-each-day-s-counters.db.test.mjs`. Header comment, `URL_`, `KEY`, `ANON`, `skip` (the three-way check of `platform/platform-metrics.db.test.mjs:42-52`, saying "this suite makes workspaces and sending domains"), `ROOT` (five levels up from this folder), `CLI`, `DB_URL`, `CLI_TARGET` (copied from `platform/platform-metrics.db.test.mjs:33-41`) and `rolledBack` (copied with its doc comment from `database/team-changes-and-their-audit.db.test.mjs:678-701`). Then:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { DAY_MS, HOUR_MS, MIN_MS } from "@chanlytics/contracts";

const stamp = Date.now().toString(36);
let db;
let T;
const made = [];
const D = {};
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const ago = (ms) => new Date(Date.now() - ms).toISOString();
/** The UTC day before the one a timestamp is in: the day the function files under. */
const dayBefore = (at) => new Date(Date.parse(at) - DAY_MS).toISOString().slice(0, 10);

async function tenant(tag) {
  const id = ok(
    await db.from("tenants").insert({ slug: `harbor-days-${tag}-${stamp}`, name: `Harbor Days ${tag}` }).select("id").single(),
    "workspace",
  ).id;
  made.push(id);
  return id;
}
const domain = async (tenantId, tag, over = {}) =>
  ok(
    await db
      .from("sending_domains")
      .insert({ tenant_id: tenantId, host: `${tag}-${stamp}.example.com`, from_local: "sam", from_name: "Harbor", ...over })
      .select("id, host")
      .single(),
    `domain ${tag}`,
  );
const days = async (tenantId) =>
  ok(await db.from("sending_domain_days").select("*").eq("tenant_id", tenantId).order("host"), "days");

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  T = await tenant("a");
  const sending = { verified_at: ago(30 * DAY_MS), clean_since: ago(10 * DAY_MS) };
  D.verified = await domain(T, "v", { state: "verified", ...sending, sent_recent: 120, bounced_recent: 2, complaints: 0, sent_days: 6, checked_at: ago(3 * MIN_MS) });
  D.held = await domain(T, "h", { state: "held", ...sending, held_why: "bounces", held_at: ago(90 * MIN_MS), sent_recent: 80, bounced_recent: 9, complaints: 1, sent_days: 6, checked_at: ago(5 * MIN_MS) });
  D.fresh = await domain(T, "f", { state: "verified", ...sending });
  D.verifying = await domain(T, "w", { state: "verifying" });
  D.records = await domain(T, "r", { state: "records" });
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test("each verified or held domain is kept once, under the day that has just ended, with the counters its last check left; a domain still being set up is not", { skip }, async () => {
  const wrote = ok(await db.rpc("sending_domain_days_keep"), "keep");
  assert.ok(wrote >= 3, `it answers how many rows it wrote (${wrote}); other workspaces' domains on this stack are kept too`);
  const rows = await days(T);
  assert.deepEqual(rows.map((r) => r.domain_id).sort(), [D.verified.id, D.held.id, D.fresh.id].sort(), "verified and held, not verifying or records");
  const yesterday = dayBefore(rows[0].kept_at);
  assert.ok(rows.every((r) => r.day === yesterday), "every row is under the day that ended, UTC");
  const of = (d) => rows.find((r) => r.domain_id === d.id);
  const counters = (r) => [r.host, r.state, r.held_why, r.sent, r.bounced, r.complaints, r.sent_days];
  assert.deepEqual(counters(of(D.verified)), [D.verified.host, "verified", null, 120, 2, 0, 6]);
  assert.deepEqual(counters(of(D.held)), [D.held.host, "held", "bounces", 80, 9, 1, 6]);
  assert.deepEqual(
    counters(of(D.fresh)),
    [D.fresh.host, "verified", null, null, null, null, null],
    "a domain never counted keeps nothing: absent, never zero",
  );
  assert.ok(Date.parse(of(D.verified).checked_at) > Date.now() - 10 * MIN_MS, "and each row says how stale it is");
});

test("run again, a day's row is replaced and never doubled; a Resume's cleared counters are kept as absent", { skip }, async () => {
  const first = (await days(T)).find((r) => r.domain_id === D.verified.id);
  ok(await db.from("sending_domains").update({ sent_recent: 150, bounced_recent: 3 }).eq("id", D.verified.id), "counters move");
  ok(await db.rpc("sending_domain_days_keep"), "keep again");
  let rows = await days(T);
  assert.equal(rows.length, 3, "one row per domain per day");
  const later = rows.find((r) => r.domain_id === D.verified.id);
  assert.deepEqual([later.sent, later.bounced], [150, 3], "the later run's counters stand");
  assert.ok(Date.parse(later.kept_at) > Date.parse(first.kept_at));

  ok(await db.from("sending_domains").update({ sent_recent: null, bounced_recent: null, complaints: null, sent_days: null }).eq("id", D.held.id), "a Resume clears them");
  ok(await db.rpc("sending_domain_days_keep"), "and the next night");
  rows = await days(T);
  const held = rows.find((r) => r.domain_id === D.held.id);
  assert.deepEqual([held.sent, held.bounced, held.complaints, held.sent_days], [null, null, null, null]);
});

test("a domain taken off keeps the days it had; a workspace's deletion takes them", { skip }, async () => {
  ok(await db.from("sending_domains").delete().eq("id", D.fresh.id), "remove a domain");
  assert.equal((await days(T)).filter((r) => r.domain_id === D.fresh.id).length, 1, "its day stays");
  const T2 = await tenant("b");
  await domain(T2, "x", { state: "verified", verified_at: ago(5 * DAY_MS), clean_since: ago(DAY_MS) });
  ok(await db.rpc("sending_domain_days_keep"), "keep");
  assert.equal((await days(T2)).length, 1);
  ok(await db.from("tenants").delete().eq("id", T2), "delete the workspace");
  assert.equal((await days(T2)).length, 0, "its days went with it");
});

test("the function is the service role's alone: the anon key can neither run it nor read the table", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const run = await anon.rpc("sending_domain_days_keep");
  assert.ok(run.error, "refused");
  const read = await anon.from("sending_domain_days").select("day").limit(1);
  assert.ok(read.error || read.data.length === 0, "and sees nothing");
});

test("the clock: a job at 00:23 UTC, registered as judged on its runs within 26 hours, reported by sweep_health(), and its own command writes the rows", { skip }, async () => {
  const jobs = ok(await db.rpc("sweep_schedules"), "schedules");
  const job = jobs.find((j) => j.jobname === "sending-domain-days");
  assert.ok(job, "no cron job named sending-domain-days is scheduled");
  assert.deepEqual([job.schedule, job.active], ["23 0 * * *", true]);
  const row = ok(await db.from("sweep_status").select("sweep, jobname, judged_by, max_silence").eq("sweep", "sending_domain_days").single(), "register");
  assert.deepEqual(row, { sweep: "sending_domain_days", jobname: "sending-domain-days", judged_by: "run", max_silence: "26:00:00" });
  const health = ok(await db.rpc("sweep_health"), "health").find((r) => r.sweep === "sending_domain_days");
  assert.ok(health, "sweep_health() does not report the clock");
  assert.deepEqual([health.scheduled, health.healthy], [true, true], health.detail ?? "");

  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${T}') then raise exception 'not_this_database'; end if;
    delete from public.sending_domain_days where tenant_id = '${T}';
    -- The command the job holds, run as the job runs it.
    execute (select j.command from cron.job j where j.jobname = 'sending-domain-days');
    seen := jsonb_build_object('rows', (select count(*) from public.sending_domain_days where tenant_id = '${T}'));
  `);
  assert.equal(seen.rows, 2, "the verified and the held domain that are still on the workspace");
});
```

Run-time notes for the implementer: `D.fresh` is removed in the third case, so the clock case sees two domains; if the file is run with `--test-name-pattern` the cases are order-dependent only through `D.fresh`, so keep them in this order.

- [ ] **Step 2: Run it to verify it fails**

Run (database environment as in the Global Constraints): `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/email/domains/a-sending-domain-keeps-each-day-s-counters.db.test.mjs`
Expected: FAIL: `Could not find the function public.sending_domain_days_keep` (and the table is not there).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00296_a_sending_domain_keeps_each_day_s_counters.sql`:

```sql
-- 00296 · A sending domain keeps each day's counters.
--
-- The Reports lenses spec, K9 (the domains' half). A domain's sent, bounced and complaint counts, the days it has sent on
-- and its state live on its own row, which the ten-minute domains sweep rewrites on every check and a Resume clears, so
-- how a domain's reputation went over the weeks could not be read, and a Resume erased the evidence of the episode it
-- answered. Now sending_domain_days_keep() writes one row per verified or held domain each night, under the day that has
-- just ended (UTC), copying what the last check left (pg_cron 'sending-domain-days', 00:23). It takes no day: the counters
-- are the row's now, so the only day they can honestly be filed under is the one that has just ended. Run again the same
-- night it replaces that day's row. A count the row never had (a domain verified and not yet counted, one just resumed) is
-- kept as null: absent, never zero. checked_at says when the sweep last read the domain, so a reader sees how stale a day
-- is. No foreign key from the domain: one taken off the workspace keeps the days it had, until the workspace goes.
--
-- Nothing is backfilled: the days before this night were never kept. Either deploy order works (nothing reads it yet).
-- The table is the members' to read (their own workspace's, as sending_domains is) and the service role's to write.
--
-- The lock. A new table and a function: nothing live is locked. The guard of 00259 is set all the same, and every
-- statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create table if not exists public.sending_domain_days (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  -- No foreign key: a domain taken off the workspace keeps the days it had.
  domain_id  uuid not null,
  day        date not null,
  host       text not null check (char_length(host) between 4 and 253),
  -- sending_domains.state, of the two states a domain is counted in.
  state      text not null check (state in ('verified', 'held')),
  held_why   text check (held_why is null or char_length(held_why) <= 40),
  sent       integer check (sent is null or sent >= 0),
  bounced    integer check (bounced is null or bounced >= 0),
  complaints integer check (complaints is null or complaints >= 0),
  sent_days  integer check (sent_days is null or sent_days >= 0),
  checked_at timestamptz,
  kept_at    timestamptz not null default now(),
  primary key (domain_id, day)
);
create index if not exists sending_domain_days_tenant_day on public.sending_domain_days (tenant_id, day desc);

alter table public.sending_domain_days enable row level security;
drop policy if exists sending_domain_days_member_select on public.sending_domain_days;
create policy sending_domain_days_member_select on public.sending_domain_days
  for select to authenticated
  using (tenant_id in (select m.tenant_id from public.memberships m where m.user_id = (select auth.uid())));
revoke all on public.sending_domain_days from anon, authenticated;
grant select on public.sending_domain_days to authenticated;
grant all on public.sending_domain_days to service_role;
comment on table public.sending_domain_days is
  'One row per sending domain per UTC day: its state and counters as the domains sweep''s last check left them (K9), written by sending_domain_days_keep at 00:23 for the day that ended. Null where the domain had no count; checked_at says how stale. Members read their workspace''s; the service role writes.';

create or replace function public.sending_domain_days_keep()
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date - 1;
  v_n   integer;
begin
  with written as (
    insert into public.sending_domain_days as d
      (tenant_id, domain_id, day, host, state, held_why, sent, bounced, complaints, sent_days, checked_at, kept_at)
    select s.tenant_id, s.id, v_day, s.host, s.state, s.held_why, s.sent_recent, s.bounced_recent, s.complaints,
           s.sent_days, s.checked_at, now()
      from public.sending_domains s
     where s.state in ('verified', 'held')
    on conflict (domain_id, day) do update
       set host = excluded.host, state = excluded.state, held_why = excluded.held_why, sent = excluded.sent,
           bounced = excluded.bounced, complaints = excluded.complaints, sent_days = excluded.sent_days,
           checked_at = excluded.checked_at, kept_at = excluded.kept_at
    returning 1
  )
  select count(*)::integer into v_n from written;
  return v_n;
end $$;
revoke all on function public.sending_domain_days_keep() from public, anon, authenticated;
grant execute on function public.sending_domain_days_keep() to service_role;
comment on function public.sending_domain_days_keep() is
  'Keeps every verified or held sending domain''s state and counters, as the last check left them, under the UTC day that has just ended (K9); replaces that day''s row when run again; answers how many rows it wrote. The nightly clock''s (sending-domain-days, 00:23), and the service role''s to run.';

select cron.unschedule('sending-domain-days') where exists (select 1 from cron.job where jobname = 'sending-domain-days');
select cron.schedule('sending-domain-days', '23 0 * * *', $$select public.sending_domain_days_keep()$$);

-- Judged on its runs, like the nightly purges (00107) and the day's roll (00277): a night it does not run is a clock the
-- health sweep names.
insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  ('sending_domain_days', 'sending-domain-days', interval '26 hours', 'run', null)
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;
```

- [ ] **Step 4: Apply it twice, record it, make the register and the harness know the new table and clock, run the tests**

Apply `00296` as the Global Constraints say, twice, then `--record` and the stack's ledger row (`'00296'`, `'a_sending_domain_keeps_each_day_s_counters'`).

In `tooling/scripts/tests/database/tenancy.db.test.mjs`, after the `ctx.domain = await seed("sending_domains", {…});` statement add:

```js
  // One day of that domain (00296): the clock's function writes it, a member of the workspace reads it.
  await seed(
    "sending_domain_days",
    { tenant_id: A, domain_id: ctx.domain, day: "2026-09-01", host: `tenancy-${Date.now().toString(36)}.example`, state: "verified" },
    null,
  );
```

and, after the `sending_domains: [...]` entry of `TENANT_TABLES`:

```js
  // A sending domain's day (00296): members read their own workspace's, and only the nightly function writes one.
  sending_domain_days: [
    "member",
    () => ({
      tenant_id: A,
      domain_id: ctx.domain,
      day: "2026-09-02",
      host: `stranger-${Date.now().toString(36)}.example`,
      state: "verified",
    }),
  ],
```

In `tooling/scripts/ops/delete-tenant.mjs`, add `"sending_domain_days",` to `TABLES` immediately before `"sending_domains",`.

In `tooling/scripts/tests/ops/sweep-registry.db.test.mjs`, add to `EVERY_CLOCK` after the `platform_metrics_roll` entry:

```js
  // Each sending domain's day (00296): nightly at 00:23 UTC, judged by its run.
  sending_domain_days: "sending-domain-days",
```

and `"sending_domain_days",` to `RUN_JUDGED` (between `"purge_rate_hits"` and `"snoozes"`). In `tooling/scripts/tests/ops/sweep-health.integration.test.mjs`, add a comment line `// 00296 added 'sending_domain_days', the nightly keeping of each sending domain's counters.` beside the 00277 one, and `"sending_domain_days",` between `"registration"` and `"snoozes"` in **both** name lists (the one near line 49 and the one near line 112).

Run: `--db` the new file; `database/tenancy.db.test.mjs`, `database/privileges.db.test.mjs`, `database/migration-head.db.test.mjs`, `ops/sweep-registry.db.test.mjs`, `ops/sweep-health.integration.test.mjs`; plain `platform/delete-tenant.test.mjs`.
Expected: PASS (`tenancy`'s two lists of tenant tables must now hold the new one both ways; `privileges` finds no definer function open to `anon`).

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/email/domains/a-sending-domain-keeps-each-day-s-counters.db.test.mjs tooling/scripts/tests/database/tenancy.db.test.mjs tooling/scripts/ops/delete-tenant.mjs tooling/scripts/tests/ops/sweep-registry.db.test.mjs tooling/scripts/tests/ops/sweep-health.integration.test.mjs
git add supabase/migrations/00296_a_sending_domain_keeps_each_day_s_counters.sql supabase/migrations-ledger.json tooling/scripts/tests/email/domains/a-sending-domain-keeps-each-day-s-counters.db.test.mjs tooling/scripts/tests/database/tenancy.db.test.mjs tooling/scripts/ops/delete-tenant.mjs tooling/scripts/tests/ops/sweep-registry.db.test.mjs tooling/scripts/tests/ops/sweep-health.integration.test.mjs
```

---

### Task 3: A number's quality is kept and said when it changes: the clock and its door (K9, migration 00297)

**Files:**
- Create: `supabase/migrations/00297_a_number_s_quality_is_read_on_a_clock.sql`
- Create: `tooling/scripts/tests/whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs`
- Modify: `packages/contracts/src/shared/enums.ts` (after `"channel.connected"`), `packages/contracts/src/workspace/activity.ts` (`ACTIVITY_NOISE_KINDS` at ~62, `WORDS`), `tooling/scripts/tests/workspace/activity.test.mjs`, `tooling/scripts/tests/ops/sweep-registry.db.test.mjs`, `tooling/scripts/tests/ops/sweep-health.integration.test.mjs`
- Regenerate (types only, see the constraint): `packages/db/src/database.types.ts`, `packages/contracts/src/schema-sets.generated.ts`, `tooling/scripts/tests/_unique-keys.generated.json`

**Interfaces:**
- Produces (SQL): `public.channel_keep_quality(p_tenant_id uuid, p_channel_id uuid, p_rating text) returns text`, SECURITY DEFINER, the service role's alone. It refuses (`22023`) a rating that is not 2 to 12 capital letters; answers `'gone'` and writes nothing for a channel that is not this workspace's active-or-not WhatsApp channel; otherwise merges `quality_read` (the word) and `quality_read_at` (now) into the channel's `config` and answers `'same'` when the word is the last one read, else writes one event of kind `channel.quality_rating` (category `system`, subject `channel` and the channel's id, data `{ from, to }`, `from` absent on the first read) and answers `'first'` or `'changed'`. The merge and the event are one transaction. `public.trigger_channel_quality_sweep() returns bigint`: asks the edge (`request_sweep('channel_quality', '/api/cron/channel-quality')`) only when an active WhatsApp channel exists, and otherwise records that it looked. The pg_cron job `channel-quality-sweep` at `41 */6 * * *` and its `sweep_status` row (`channel_quality`, judged on its requests, `19 hours`: three missed ticks and an hour).
- Produces (TypeScript): the event kind `channel.quality_rating` in `EVENT_KINDS`, worded in `activity.ts`, hidden from the Activity log by its exact kind.
- **Why a sweep of its own.** Nothing visits a WhatsApp channel on a clock. The playbooks sweep reads the channel's config but only runs for workspaces that have playbooks, and a workspace without one would never be read. The health sweep is a watcher whose answer must never depend on a write, and its minute budget is spoken for. A read per connected number from the edge, with that workspace's own token, wants its own budget, its own failure said in `sweep_health`, and its own registration (a sweep that changes something must be watched). **Why six hours:** Meta tells us the moments that matter (flagged, unflagged, a tier change) by webhook already, kept as events; this read is the rating word between those, and nothing is lost to a rating that moves slower than a quarter of a day. About four Graph reads a day for each connected number.
- **Why beside and not over `quality_rating`.** `numberHealth` gates broadcasts on `config.quality_rating`, read once at connection. A refreshed word written over it would stop a flagged number's broadcasts and start a recovered one's again: a behaviour change, not a keeping. So the sweep writes `quality_read`, and `quality_rating` is left as it is (notes, decision 1, for Ruben). The history a lens draws is the events.
- Either deploy order: nothing reads the keys or the kind. The one order that matters is the edge first (Task 4's route must exist before the first tick), said in Task 7's hand-back.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs`. Header comment, `URL_`, `KEY`, `ANON`, `skip` (as Task 2's, saying "this suite makes workspaces and channels"), `ROOT` (four levels up from this folder), `CLI`, `DB_URL`, `CLI_TARGET` and `rolledBack` (as Task 2). Then:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let wa;
let voice;
let theirs;
const made = [];
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const channel = async (tenant, kind, tag, config = {}) =>
  ok(
    await db.from("tenant_channels").insert({ tenant_id: tenant, kind, external_id: `harbor-q-${tag}-${stamp}`, config }).select("id").single(),
    `channel ${tag}`,
  ).id;
const keep = (tenant, id, rating) => db.rpc("channel_keep_quality", { p_tenant_id: tenant, p_channel_id: id, p_rating: rating });
const config = async (id) => ok(await db.from("tenant_channels").select("config").eq("id", id).single(), "config").config;
const said = async (id) =>
  ok(await db.from("events").select("category, subject_type, data").eq("kind", "channel.quality_rating").eq("subject_id", id).order("created_at"), "events");
const GATE = { quality_rating: "GREEN", quality_event: "UPGRADE", messaging_limit: "TIER_1K" };

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const tag of ["a", "b"]) {
    const id = ok(await db.from("tenants").insert({ slug: `harbor-quality-${tag}-${stamp}`, name: `Harbor Quality ${tag}` }).select("id").single()).id;
    made.push(id);
  }
  [A, B] = made;
  wa = await channel(A, "whatsapp", "wa", GATE);
  voice = await channel(A, "voice", "voice");
  theirs = await channel(B, "whatsapp", "theirs", GATE);
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});

test("the first read is kept beside the connect-time rating and said once, with no from; the same word again says nothing; a change says from and to", { skip }, async () => {
  assert.equal(ok(await keep(A, wa, "YELLOW"), "first"), "first");
  let cfg = await config(wa);
  assert.deepEqual([cfg.quality_read, typeof cfg.quality_read_at], ["YELLOW", "string"]);
  assert.ok(Math.abs(Date.parse(cfg.quality_read_at) - Date.now()) < 60 * 1000, "read now");
  assert.deepEqual(
    [cfg.quality_rating, cfg.quality_event, cfg.messaging_limit],
    ["GREEN", "UPGRADE", "TIER_1K"],
    "what broadcasts are gated on, and what the webhook keeps, are not touched",
  );
  assert.deepEqual(await said(wa), [{ category: "system", subject_type: "channel", data: { to: "YELLOW" } }]);

  const readAt = cfg.quality_read_at;
  assert.equal(ok(await keep(A, wa, "YELLOW"), "same"), "same");
  cfg = await config(wa);
  assert.ok(Date.parse(cfg.quality_read_at) >= Date.parse(readAt), "it still says when it last looked");
  assert.equal((await said(wa)).length, 1, "and says nothing new");

  assert.equal(ok(await keep(A, wa, "RED"), "changed"), "changed");
  assert.deepEqual((await said(wa)).map((e) => e.data), [{ to: "YELLOW" }, { from: "YELLOW", to: "RED" }]);
  assert.equal((await config(wa)).quality_read, "RED");
});

test("a channel that is not this workspace's WhatsApp channel is gone: another workspace's, a voice line's, none at all; nothing is written", { skip }, async () => {
  const before_ = [await config(theirs), await config(voice)];
  for (const [tenant, id] of [[A, theirs], [B, wa], [A, voice], [A, "00000000-0000-4000-8000-000000000000"]])
    assert.equal(ok(await keep(tenant, id, "GREEN"), "gone"), "gone");
  assert.deepEqual([await config(theirs), await config(voice)], before_);
  assert.equal((await said(theirs)).length + (await said(voice)).length, 0);
});

test("a word that is not a rating is refused and written nowhere", { skip }, async () => {
  const cfg = await config(wa);
  const events = (await said(wa)).length;
  for (const word of [null, "", "green", "GREEN; drop table x", "A", "ABCDEFGHIJKLMN"]) {
    const r = await keep(A, wa, word);
    assert.equal(r.error?.code, "22023", `${JSON.stringify(word)}`);
  }
  assert.deepEqual(await config(wa), cfg);
  assert.equal((await said(wa)).length, events);
});

test("the merge and its event are one: a ledger that refuses the event takes the rating with it", { skip }, async () => {
  const c = await channel(A, "whatsapp", "atomic", GATE);
  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${A}') then raise exception 'not_this_database'; end if;
    perform public.channel_keep_quality('${A}', '${c}', 'GREEN');
    seen := seen || jsonb_build_object('control', (select count(*) from public.events where kind = 'channel.quality_rating' and subject_id = '${c}'));
    create function public.__quality_refused() returns trigger language plpgsql as $f$
    begin raise exception 'the ledger is unavailable'; end $f$;
    create trigger __quality_refused before insert on public.events
      for each row when (new.kind = 'channel.quality_rating' and new.tenant_id = '${A}') execute function public.__quality_refused();
    begin
      perform public.channel_keep_quality('${A}', '${c}', 'RED');
      seen := seen || jsonb_build_object('raised', false);
    exception when others then
      seen := seen || jsonb_build_object('raised', true, 'message', sqlerrm);
    end;
    seen := seen || jsonb_build_object('read', (select config ->> 'quality_read' from public.tenant_channels where id = '${c}'));
  `);
  assert.equal(seen.control, 1, "the control: a working ledger writes it");
  assert.deepEqual([seen.raised, seen.read], [true, "GREEN"], JSON.stringify(seen));
  assert.equal((await config(c)).quality_read, undefined, "and nothing the block did was kept");
});

test("the door is the service role's alone", { skip: skip || (!ANON && "no SUPABASE_ANON_KEY in env") }, async () => {
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const r = await anon.rpc("channel_keep_quality", { p_tenant_id: A, p_channel_id: wa, p_rating: "RED" });
  assert.ok(r.error, "refused");
  assert.equal((await config(wa)).quality_read, "RED", "and the row is as the service role left it");
});

test("the clock: a job at :41 every sixth hour, registered as judged on its requests within 19 hours, reported by sweep_health(), asking the edge only when a number is connected", { skip }, async () => {
  const jobs = ok(await db.rpc("sweep_schedules"), "schedules");
  const job = jobs.find((j) => j.jobname === "channel-quality-sweep");
  assert.ok(job, "no cron job named channel-quality-sweep is scheduled");
  assert.deepEqual([job.schedule, job.active], ["41 */6 * * *", true]);
  const row = ok(await db.from("sweep_status").select("sweep, jobname, judged_by, max_silence").eq("sweep", "channel_quality").single(), "register");
  assert.deepEqual(row, { sweep: "channel_quality", jobname: "channel-quality-sweep", judged_by: "request", max_silence: "19:00:00" });
  const health = ok(await db.rpc("sweep_health"), "health").find((r) => r.sweep === "channel_quality");
  assert.ok(health, "sweep_health() does not report the clock");
  assert.equal(health.scheduled, true, "and finds its job");

  // Inside a transaction that never commits: with no active WhatsApp channel the tick only says it looked; with one it
  // asks the edge (a local stack has no edge address in Vault, so asking is recorded as that note).
  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${A}') then raise exception 'not_this_database'; end if;
    update public.tenant_channels set status = 'disabled' where kind = 'whatsapp';
    update public.sweep_status set note = null where sweep = 'channel_quality';
    perform public.trigger_channel_quality_sweep();
    seen := jsonb_build_object('idle', (select note from public.sweep_status where sweep = 'channel_quality'));
    update public.tenant_channels set status = 'active' where id = '${wa}';
    perform public.trigger_channel_quality_sweep();
    seen := seen || jsonb_build_object('asked', (select note from public.sweep_status where sweep = 'channel_quality'));
  `);
  assert.equal(seen.idle, null, "no number connected: it looked and asked nothing");
  assert.match(seen.asked, /missing cron_sweep_key or edge_base_url/, "a number connected: it asked the edge");
});
```
(`before_` is a local name chosen not to shadow node:test's `before`.)

- [ ] **Step 2: Run it to verify it fails**

Run (database environment as in the Global Constraints): `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs`
Expected: FAIL: `Could not find the function public.channel_keep_quality`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00297_a_number_s_quality_is_read_on_a_clock.sql`:

```sql
-- 00297 · A number's quality is read on a clock, and said when it changes.
--
-- The Reports lenses spec, K9 (the number's half). A connected WhatsApp number's quality rating (GREEN, YELLOW, RED) was
-- read once, when the number was connected, and kept as tenant_channels.config.quality_rating, which numberHealth
-- (contracts broadcast-number.ts) gates broadcasts on. Meta's webhook says when a number is flagged or its tier moves
-- (kept as channel.phone_number_quality_update events) and never the rating itself, so how a number's rating went over
-- the weeks could not be read, and the connect-time word never moved. Now a six-hourly edge sweep asks Meta
-- (apps/edge/api/cron/channel-quality.ts) and keeps each answer through channel_keep_quality: the word and the moment it
-- was read are merged into the channel's config as quality_read and quality_read_at, BESIDE quality_rating and never over
-- it (what a broadcast is gated on does not change here: that is Ruben's to decide), and a channel.quality_rating event
-- { from, to } is written when the word differs from the last one read (the first read has no from). The merge and the
-- event are one transaction, so neither is ever kept without the other.
--
-- Why a sweep of its own: no sweep visits a WhatsApp channel (the playbooks sweep reads the config but only runs for a
-- workspace with a playbook, and the health sweep is a watcher whose answer must not depend on a write). The clock asks
-- the edge only when an active WhatsApp channel exists, and otherwise records that it looked, as the notes sweep does.
--
-- channel_keep_quality is a door the sweep calls, not a trigger on a live write: if it fails the sweep logs it and the
-- next tick tries again. Nothing is backfilled: a number reads absent until its first read. Either deploy order works
-- (nothing reads the keys or the kind); the edge's route must be live before the first tick, or sweep_health names it.
--
-- The lock. tenant_channels is read and updated one row at a time; nothing here alters it. The guard of 00259 is set all
-- the same, and every statement re-runs.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.channel_keep_quality(p_tenant_id uuid, p_channel_id uuid, p_rating text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev text;
begin
  -- Meta's words are capital letters (GREEN, YELLOW, RED, NA, UNKNOWN); what is kept is a word, never a sentence.
  if p_rating is null or p_rating !~ '^[A-Z]{2,12}$' then
    raise exception 'channel_keep_quality: not a rating word' using errcode = '22023';
  end if;
  select c.config ->> 'quality_read' into v_prev
    from public.tenant_channels c
   where c.id = p_channel_id and c.tenant_id = p_tenant_id and c.kind = 'whatsapp'
     for update;
  if not found then
    return 'gone';
  end if;
  update public.tenant_channels
     set config = config || jsonb_build_object('quality_read', p_rating, 'quality_read_at', now())
   where id = p_channel_id and tenant_id = p_tenant_id;
  if v_prev is not distinct from p_rating then
    return 'same';
  end if;
  insert into public.events (tenant_id, kind, category, subject_type, subject_id, data)
  values (p_tenant_id, 'channel.quality_rating', 'system', 'channel', p_channel_id,
          jsonb_strip_nulls(jsonb_build_object('from', v_prev, 'to', p_rating)));
  return case when v_prev is null then 'first' else 'changed' end;
end $$;
revoke all on function public.channel_keep_quality(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.channel_keep_quality(uuid, uuid, text) to service_role;
comment on function public.channel_keep_quality(uuid, uuid, text) is
  'Keeps the rating Meta holds for a workspace''s WhatsApp number (K9): merges quality_read and quality_read_at into the channel''s config beside quality_rating, never over it, and writes channel.quality_rating { from, to } when the word changed (no from on the first read), in one transaction. Answers first, changed, same, or gone (not this workspace''s WhatsApp channel); refuses a word that is not capital letters. The channel-quality sweep''s door (apps/edge lib whatsapp number-quality).';

create or replace function public.trigger_channel_quality_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if exists (select 1 from public.tenant_channels c where c.kind = 'whatsapp' and c.status = 'active') then
    return public.request_sweep('channel_quality', '/api/cron/channel-quality');
  end if;
  insert into public.sweep_status (sweep, requested_at) values ('channel_quality', now())
  on conflict (sweep) do update set requested_at = excluded.requested_at;
  return null;
end $$;
revoke execute on function public.trigger_channel_quality_sweep() from public, anon, authenticated;
comment on function public.trigger_channel_quality_sweep() is
  'The channel-quality sweep''s clock (K9). Calls the edge (/api/cron/channel-quality) only when an active WhatsApp channel exists; otherwise records that it looked.';

insert into public.sweep_status (sweep, jobname, max_silence, judged_by, requested_at) values
  -- every six hours, recording itself each time: nineteen hours is three missed ticks and an hour.
  ('channel_quality', 'channel-quality-sweep', interval '19 hours', 'request', now())
on conflict (sweep) do update
   set jobname = excluded.jobname, max_silence = excluded.max_silence, judged_by = excluded.judged_by;

select cron.unschedule('channel-quality-sweep') where exists (select 1 from cron.job where jobname = 'channel-quality-sweep');
select cron.schedule('channel-quality-sweep', '41 */6 * * *', $$select public.trigger_channel_quality_sweep()$$);
```

- [ ] **Step 4: Apply it twice, record it, declare the kind, run the tests**

Apply `00297` twice, then `--record` and the stack's ledger row (`'00297'`, `'a_number_s_quality_is_read_on_a_clock'`).

In `packages/contracts/src/shared/enums.ts`, after `"channel.connected",` add:

```ts
  /** A WhatsApp number's quality rating, read on a clock, changed (00297): { from?, to }. Meta's own news of it is channel.phone_number_quality_update. */
  "channel.quality_rating",
```

In `packages/contracts/src/workspace/activity.ts`, add `"channel.quality_rating"` to `ACTIVITY_NOISE_KINDS` and `"channel.quality_rating": "A WhatsApp number's quality rating changed",` to `WORDS` (beside the other `channel.` entry if there is one, else after `"channel.connected"`'s). In `tooling/scripts/tests/workspace/activity.test.mjs`, beside the assertions the same way batch 2 added for its kinds:

```js
  assert.equal(activityWords("channel.quality_rating", { from: "GREEN", to: "YELLOW" }), "A WhatsApp number's quality rating changed");
  assert.equal(isActivityNoise("channel.quality_rating"), true, "a record Reports reads: hidden unless asked for by name");
  assert.equal(isActivityNoise("channel.connected"), false, "Meta's own account news and a connection still show");
```

In `tooling/scripts/tests/ops/sweep-registry.db.test.mjs`, add to `EVERY_CLOCK`:

```js
  // A connected WhatsApp number's rating (00297): a six-hour clock that asks the edge only when a number is connected,
  // and records that it looked otherwise.
  channel_quality: "channel-quality-sweep",
```

(request-judged: not in `RUN_JUDGED`). In `tooling/scripts/tests/ops/sweep-health.integration.test.mjs`, add the comment `// 00297 added 'channel_quality', the six-hourly read of each WhatsApp number's rating.` and `"channel_quality",` between `"calls"` and `"deadman"` in **both** name lists.

Regenerate the types the next task's tests need, then keep only what 00296 and 00297 explain: apply `corepack pnpm gen:db-types` and `corepack pnpm gen:schema-sets`, then `git diff` each of `packages/db/src/database.types.ts`, `packages/contracts/src/schema-sets.generated.ts` and `tooling/scripts/tests/_unique-keys.generated.json`, and restore every other hunk by hand: keep the table `sending_domain_days` (Row, Insert, Update), the functions `sending_domain_days_keep`, `channel_keep_quality` and `trigger_channel_quality_sweep`, the set `sending_domain_days.state` and the unique key `sending_domain_days_pkey`. `grep -c template_version packages/db/src/database.types.ts` must print 0. Then `corepack pnpm --filter "./packages/*" build`.

Run: `--db` the new file; `database/privileges.db.test.mjs`, `database/migration-head.db.test.mjs`, `ops/sweep-registry.db.test.mjs`, `ops/sweep-health.integration.test.mjs`, `database/generated/check-db-types.test.mjs` (may stay red for the other lane's objects: check object by object that no difference is this batch's); plain `workspace/activity.test.mjs`, `repo/event-kinds.test.mjs`, `ops/retention-words.test.mjs`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs tooling/scripts/tests/ops/sweep-registry.db.test.mjs tooling/scripts/tests/ops/sweep-health.integration.test.mjs packages/contracts/src/shared/enums.ts packages/contracts/src/workspace/activity.ts
git add supabase/migrations/00297_a_number_s_quality_is_read_on_a_clock.sql supabase/migrations-ledger.json tooling/scripts/tests/whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes.db.test.mjs tooling/scripts/tests/workspace/activity.test.mjs tooling/scripts/tests/ops/sweep-registry.db.test.mjs tooling/scripts/tests/ops/sweep-health.integration.test.mjs packages/contracts/src packages/db/src/database.types.ts tooling/scripts/tests/_unique-keys.generated.json
git add packages/contracts/dist packages/db/dist
```
(Stage the dist files that really changed only.)

---

### Task 4: The sweep that reads a number's rating (K9, the edge)

**Files:**
- Create: `apps/edge/lib/whatsapp/number-quality.ts`, `apps/edge/api/cron/channel-quality.ts`
- Create: `tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs`
- Modify: `packages/db/src/sweeps.ts` (the header list, two functions), `packages/db/src/index.ts` (the `./sweeps` export line and its types), `apps/edge/lib/log-events.ts`, `apps/edge/vercel.json`, `apps/edge/lib/ops/sweep-health.ts` (`CONSEQUENCE`), `tooling/scripts/tests/repo/ops-hygiene.test.mjs`

**Interfaces:**
- Consumes: `channel_keep_quality` and its types (Task 3), `phoneNumber(token, phoneNumberId)` (`apps/edge/lib/whatsapp/meta-graph.ts:81`, unchanged), `waCredentialsForTenant(db, tenantId)` (`apps/edge/lib/tenant-runtime.ts:310`: `present`, `absent` or `unavailable`, never the environment's pair for another workspace), `authorizeCron`.
- Produces (`packages/db`): `whatsappNumbersToRead(db, limit): Promise<WhatsappNumber[]>` with `WhatsappNumber = { channel_id; tenant_id; phone_number_id; read_at: string | null }`, the active WhatsApp channels, never-read first then the longest unread; `keepChannelQuality(db, tenantId, channelId, rating): Promise<"first" | "changed" | "same" | "gone">`, which calls the door and throws on its refusal or on an answer it does not know. Both live in `packages/db/src/sweeps.ts` (the sweeps' reads; `repositories/` is at its 20-module limit and a table named outside `packages/db` is a new offender in `tables.json`).
- Produces (edge): `readNumberQualities(p: QualityPorts): Promise<QualityTick>` in `apps/edge/lib/whatsapp/number-quality.ts`, with `QualityTick = { due, read, first, changed, same, gone, no_token, unreadable, not_a_rating, left }` (all counts), the route `POST /api/cron/channel-quality` answering `{ ok: true, ...QualityTick }`, `YIELD_AT_MS = 30_000` exported from the route (the tick starts no read after it), a `vercel.json` limit of 60 seconds.
- What a read is: for each number not read in the last `READ_EVERY_MS = 5 * HOUR_MS`, with that workspace's own token, Meta's `quality_rating`; kept only when it is one of Meta's five words (`GREEN`, `YELLOW`, `RED`, `NA`, `UNKNOWN`); an error, a word outside them, no credentials or a credential read that failed leaves the channel exactly as it was, is counted, and never stops the next number's read. A tick that is late or ran long does not double up (the five hours). The answer is 200 whatever Meta did (a Meta that is down is not a fault of ours, and the rows read next tick); 503 only when the channels cannot be read.
- Either deploy order: nothing reads the keys. **The edge goes before 00297** (Task 7).

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs`:

```js
/**
 * The channel-quality sweep, run (the Reports lenses spec, K9): POST /api/cron/channel-quality over a database in memory
 * and a captured wire to Meta's Graph API, which answers what the test writes and never reaches Meta. Each connected
 * number not read lately is read once with its own workspace's token, and what Meta says is kept through the door
 * (channel_keep_quality) only when it is a rating word; every way a read can come to nothing leaves the channel as it was
 * and the next number is read all the same; and a late tick does not read twice.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HOUR_MS } from "@chanlytics/contracts";
import { resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { at, knock, answer, vault, wire } from "../_cron-doors-world.mjs";

for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WHATSAPP_PHONE_ID", "WHATSAPP_ACCESS_TOKEN"])
  delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { POST, YIELD_AT_MS } = await import(at("apps/edge/api/cron/channel-quality.ts"));
const { readNumberQualities } = await import(at("apps/edge/lib/whatsapp/number-quality.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const T = (n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const channel = (n, over = {}) => ({
  id: `ch-${n}`,
  tenant_id: T(n),
  kind: "whatsapp",
  external_id: `10654000000000${n}`,
  status: "active",
  credentials_ref: `ref-${n}`,
  config: {},
  ...over,
});

/** The world: the channels, a vault, the credentials door, and the keeping door as the SQL answers it. */
function world(channels, over = {}) {
  const tables = { tenant_channels: channels };
  const kept = [];
  const db = fakeDb(
    tables,
    {},
    {
      ...vault,
      get_channel_credentials: ({ p_channel_id }) => (over.noToken?.includes(p_channel_id) ? {} : { access_token: `token-${p_channel_id}`, phone_id: "x" }),
      channel_keep_quality: ({ p_tenant_id, p_channel_id, p_rating }) => {
        if (over.refuse?.includes(p_channel_id)) throw new Error("the database refused");
        kept.push([p_tenant_id, p_channel_id, p_rating]);
        const ch = tables.tenant_channels.find((c) => c.id === p_channel_id);
        const was = ch.config.quality_read ?? null;
        ch.config = { ...ch.config, quality_read: p_rating, quality_read_at: new Date().toISOString() };
        return was === null ? "first" : was === p_rating ? "same" : "changed";
      },
    },
  );
  setPg(db);
  return { tables, db, kept };
}

/** Meta's Graph, as the test scripts it: one answer per phone number id. */
function graph(answers) {
  return wire((url, init) => {
    const id = /\/(\d{15})\?/.exec(url)?.[1];
    const a = answers[id] ?? { status: 404, body: { error: { message: "no such number" } } };
    if (a === "throws") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
  });
}
const rating = (word) => ({ body: { id: "x", quality_rating: word } });

test("the door: the cron key or nothing; no database is a 503", async () => {
  world([channel(1)]);
  const [status] = await answer(await knock(POST, "channel-quality", "wrong-key"));
  assert.ok(status === 401 || status === 403, `refused: ${status}`);
  setPg(null);
  const [s] = await answer(await knock(POST, "channel-quality"));
  assert.equal(s, 503);
});

test("a tick reads each due number once with its own workspace's token, and keeps what Meta says; a number read lately, a disabled one and a voice line are not asked", async () => {
  const w = world([
    channel(1), // never read
    channel(2, { config: { quality_read: "GREEN", quality_read_at: ago(HOUR_MS) } }), // read an hour ago: not due
    channel(3, { config: { quality_read: "GREEN", quality_read_at: ago(7 * HOUR_MS) } }), // due; Meta says RED now
    channel(4, { status: "disabled" }),
    channel(5, { kind: "voice" }),
  ]);
  const g = graph({ 106540000000001: rating("GREEN"), 106540000000003: rating("RED") });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true, due: 2, read: 2, first: 1, changed: 1, same: 0, gone: 0, no_token: 0, unreadable: 0, not_a_rating: 0, left: 0 });
    assert.deepEqual(w.kept, [
      [T(1), "ch-1", "GREEN"],
      [T(3), "ch-3", "RED"],
    ]);
    assert.equal(g.calls.length, 2, "two reads, not five");
    assert.deepEqual(
      g.calls.map((c) => [/\/(\d{15})\?/.exec(c.url)[1], c.init.headers.authorization]),
      [
        ["106540000000001", "Bearer token-ch-1"],
        ["106540000000003", "Bearer token-ch-3"],
      ],
      "each with its own workspace's token",
    );
    assert.ok(g.calls.every((c) => c.url.includes("fields=") && c.url.includes("quality_rating")));
  } finally {
    g.restore();
  }
});

test("a read that comes to nothing leaves the channel as it was and never costs the next number its read: an error, a word outside Meta's, no word, a dead network, no credentials, a refusing database", async () => {
  const w = world(
    [channel(1), channel(2), channel(3), channel(4), channel(5), channel(6), channel(7)],
    { noToken: ["ch-5"], refuse: ["ch-6"] },
  );
  const g = graph({
    106540000000001: { status: 400, body: { error: { message: "token revoked", code: 190 } } },
    106540000000002: rating("SHINY"),
    106540000000003: { body: { id: "x" } },
    106540000000004: "throws",
    106540000000005: rating("GREEN"),
    106540000000006: rating("YELLOW"),
    106540000000007: rating("na"),
  });
  try {
    const [status, body] = await answer(await knock(POST, "channel-quality"));
    assert.equal(status, 200, "Meta's trouble is not the sweep's failure");
    assert.deepEqual(
      [body.unreadable, body.not_a_rating, body.no_token, body.read],
      [3, 2, 1, 1],
      "the error, the dead network and the refusing database are unreadable; SHINY and no word are not a rating; one had no credentials",
    );
    assert.deepEqual(w.kept, [[T(7), "ch-7", "NA"]], "only the last was kept, and in capitals");
    for (const n of [1, 2, 3, 4, 5, 6]) assert.deepEqual(w.tables.tenant_channels[n - 1].config, {}, `channel ${n} is as it was`);
  } finally {
    g.restore();
  }
});

test("a tick that is out of time starts no read and says what it left; the longest unread are first next time", async () => {
  const channels = Array.from({ length: 9 }, (_, i) => channel(i + 1, { config: { quality_read_at: ago((20 - i) * HOUR_MS) } }));
  const w = world(channels);
  const t0 = Date.now();
  let clock = t0;
  const asked = [];
  const out = await readNumberQualities({
    db: w.db,
    log: { info() {}, warn() {}, error() {} },
    // The first batch is read at once; by the time the second is considered the tick is out of time.
    now: () => (clock += asked.length ? YIELD_AT_MS + 1_000 : 0),
    started: t0,
    yieldAtMs: YIELD_AT_MS,
    read: async (_token, id) => (asked.push(id), { ok: true, data: { quality_rating: "GREEN" } }),
  });
  assert.equal(asked.length, 4, "one batch of four");
  assert.deepEqual([out.due, out.read, out.left], [9, 4, 5]);
  assert.deepEqual(
    w.kept.map((k) => k[1]),
    ["ch-1", "ch-2", "ch-3", "ch-4"],
    "the four longest unread",
  );
});
```
(`wire()` answers every request the sweep makes and records it; it is `_cron-doors-world.mjs`'s, which already replaces `globalThis.fetch`, so Meta is never reached.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs`
Expected: FAIL: the route module is not found.

- [ ] **Step 3: The two reads in `packages/db/src/sweeps.ts`**

Add to the header list `whatsappNumbersToRead` ("the active WhatsApp numbers, the longest unread first: what the channel-quality sweep reads") and `keepChannelQuality` ("the one write that sweep makes, through channel_keep_quality"). Then, beside the other exported functions, with `Json` already imported:

```ts
/** A connected WhatsApp number as the channel-quality sweep sees it. */
export interface WhatsappNumber {
  channel_id: string;
  tenant_id: string;
  /** Meta's phone number id: the channel's external_id. */
  phone_number_id: string;
  /** When a rating was last kept for it (config.quality_read_at); null before its first read. */
  read_at: string | null;
}

/** The active WhatsApp numbers, never-read first and then the longest unread, at most `limit`. A read that fails throws. */
export async function whatsappNumbersToRead(db: Db, limit: number): Promise<WhatsappNumber[]>;

export type ChannelQualityKept = "first" | "changed" | "same" | "gone";

/**
 * A number's rating, kept (channel_keep_quality, 00297). Throws on the database's refusal and on an answer it does not
 * know, so a sweep counts the number as unread and tries it next tick.
 */
export async function keepChannelQuality(db: Db, tenantId: string, channelId: string, rating: string): Promise<ChannelQualityKept>;
```

Bodies: the read selects `id, tenant_id, external_id, config` where `kind = 'whatsapp'` and `status = 'active'`, `.limit(limit)`, maps each row (`read_at` is `config.quality_read_at` when `config` is an object and the value a string, else null) and sorts by `read_at` ascending with null first; the keep calls `db.rpc("channel_keep_quality", { p_tenant_id, p_channel_id, p_rating })`, throws `channel_keep_quality: <message>` on an error, returns the answer when it is one of the four words and throws on any other. In `packages/db/src/index.ts`, the `./sweeps` export line gains `whatsappNumbersToRead, keepChannelQuality` and a `export type { WhatsappNumber, ChannelQualityKept } from "./sweeps";`.

- [ ] **Step 4: The reading loop, `apps/edge/lib/whatsapp/number-quality.ts`**

```ts
export interface QualityTick {
  due: number; read: number; first: number; changed: number; same: number; gone: number;
  no_token: number; unreadable: number; not_a_rating: number; left: number;
}
export interface QualityPorts {
  db: SupabaseClient<Database>;
  log: Logger;
  now: () => number;
  /** When the tick began, and how long into it a read may still be started: the door's YIELD_AT_MS. */
  started: number;
  yieldAtMs: number;
  /** Meta's read of one number, and a workspace's token: the real ones unless a test hands others. */
  read?: (token: string, phoneNumberId: string) => ReturnType<typeof phoneNumber>;
  credentialsOf?: typeof waCredentialsForTenant;
}
export async function readNumberQualities(p: QualityPorts): Promise<QualityTick>;
```

Module-private constants: `RATINGS = new Set(["GREEN", "YELLOW", "RED", "NA", "UNKNOWN"])`, `READ_EVERY_MS = 5 * HOUR_MS` (from `contracts` `HOUR_MS`; a duration is never a bare number), `MAX_DUE = 500`, `AT_ONCE = 4`. The algorithm the signature and the tests do not determine: `whatsappNumbersToRead(db, MAX_DUE)`, keep those never read or read at least `READ_EVERY_MS` ago (a `read_at` that does not parse is never read), count them as `due`; in batches of `AT_ONCE`, before each batch stop if `now() - started > yieldAtMs` and count the rest as `left`; each number in its own try so a throw is `unreadable` and logs `channel_quality_row_failed`. One number: `credentialsOf(db, tenant_id)`: `absent` is `no_token`, `unavailable` is `unreadable`; `read(token, phone_number_id)`: not `ok` is `unreadable` (log `channel_quality_read_failed` with the channel id, Meta's status and code, never the token); the word is `data.quality_rating` trimmed and upper-cased, and outside `RATINGS` is `not_a_rating` (kept nowhere); otherwise `keepChannelQuality` and count its answer under its own name, and `read` counts every number whose word was kept. The log never carries a token or a number.

- [ ] **Step 5: The door, `apps/edge/api/cron/channel-quality.ts`**

Copy the shape of `apps/edge/api/cron/domains.ts` (header comment saying what the sweep is, the six-hourly clock `trigger_channel_quality_sweep` of 00297, the 200-whatever-Meta-did rule and the one 503): `door()`-wrapped `POST`, `const started = Date.now()`, `logger({ sweep: "channel_quality" })`, `pg()` null is `L.error("channel_quality_no_db")` and `refuse(503, "no_database")`, `authorizeCron`, `readNumberQualities({ db, log: L, now: Date.now, started, yieldAtMs: YIELD_AT_MS })`, a throw (the channels could not be read) is `L.error("channel_quality_unreadable", …)` and `refuse(503, "no_database")`, success is `L.info("channel_quality_swept", { ...out })` and `json(200, { ok: true, ...out })`. `export const YIELD_AT_MS = 30_000;` with the comment that the last read may start just before it and run `GRAPH_TIMEOUT_MS`.

In `apps/edge/lib/log-events.ts` add, each in its sorted place: `channel_quality_no_db`, `channel_quality_read_failed`, `channel_quality_row_failed`, `channel_quality_swept`, `channel_quality_unreadable`. In `apps/edge/vercel.json`, `"api/cron/channel-quality.ts": { "maxDuration": 60 }` after `"api/cron/calls.ts"` (the file is CRLF: byte-exact). In `apps/edge/lib/ops/sweep-health.ts`'s `CONSEQUENCE`, add `channel_quality: "a WhatsApp number's rating is no longer read, so the rating the channels page and a campaign's number check show goes on being the one read at connection"` and `sending_domain_days: "a sending domain's counters stop being kept day by day, so how its reputation went cannot be read later"`.

In `tooling/scripts/tests/repo/ops-hygiene.test.mjs`, beside the domains yield test (and its import at the top: `import { YIELD_AT_MS as QUALITY_YIELD_AT_MS } from "../../../../apps/edge/api/cron/channel-quality.ts";`, and `GRAPH_TIMEOUT_MS` from `apps/edge/lib/whatsapp/meta-graph.ts`), add:

```js
test("the channel-quality sweep yields before its limit, with a read of Meta still to come", () => {
  // Its last read may start just before QUALITY_YIELD_AT_MS (counted from the door's first line) and wait out Graph's own
  // bound, then write. Past the limit the platform kills the function mid-write.
  const WRITES_MS = 3_000;
  const ceiling = FUNCTIONS["api/cron/channel-quality.ts"].maxDuration * 1000;
  assert.ok(
    QUALITY_YIELD_AT_MS + GRAPH_TIMEOUT_MS + WRITES_MS <= ceiling,
    `${QUALITY_YIELD_AT_MS} + ${GRAPH_TIMEOUT_MS} + ${WRITES_MS} must fit in ${ceiling} ms`,
  );
});
```

- [ ] **Step 6: Build, run the tests and the ratchets**

Run: `corepack pnpm --filter "./packages/*" build` (restore only the `agrees` comment hunks of `packages/db/dist/index.d.ts` by hand); `git add` the new route first (`ops-hygiene` lists doors with `git ls-files`); then the new file, `cron/cron-auth.test.mjs`, `repo/ops-hygiene.test.mjs`, `repo/log-events.test.mjs`, `repo/hygiene.test.mjs`, `repo/contracts-barrels.test.mjs`; `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm check:dead-exports` (305, unchanged: `whatsappNumbersToRead`, `keepChannelQuality` and the two types are read by the edge), and the ratchets `repo/code-health-ratchets.test.mjs` and `types/index-reads-are-counted.test.mjs` (allowed reds: main's two).
Expected: PASS.

- [ ] **Step 7: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs apps/edge/lib/whatsapp/number-quality.ts apps/edge/api/cron/channel-quality.ts packages/db/src/sweeps.ts packages/db/src/index.ts apps/edge/lib/log-events.ts apps/edge/vercel.json apps/edge/lib/ops/sweep-health.ts tooling/scripts/tests/repo/ops-hygiene.test.mjs
git add tooling/scripts/tests/cron/cron-channel-quality-door.test.mjs apps/edge/lib/whatsapp/number-quality.ts apps/edge/api/cron/channel-quality.ts packages/db/src/sweeps.ts packages/db/src/index.ts apps/edge/lib/log-events.ts apps/edge/vercel.json apps/edge/lib/ops/sweep-health.ts tooling/scripts/tests/repo/ops-hygiene.test.mjs
git add packages/db/dist
```
(Stage the dist files with a real diff only.)

---

### Task 5: A day keeps what the lenses read, and what its calls cost (K10 and K8's first clause, migration 00298)

**Files:**
- Create: `supabase/migrations/00298_a_day_keeps_what_the_lenses_read.sql`
- Create: `tooling/scripts/tests/platform/a-day-keeps-what-the-lenses-read.db.test.mjs`

**Interfaces:**
- Produces (SQL): five nullable columns on `public.platform_metrics`: `handled jsonb` (customers' messages of the day by how each ended: `{ ai, held, handoff, blocked }`, a key only where its count is above zero), `topics jsonb` (what they asked about, texts and connected inbound calls together: the nine `BRAIN_INTENTS` words as keys), `ai_tokens jsonb` (the model's tokens of the day by purpose, all four kinds, the workspace's own calls: not a shadow's), `ai_usd jsonb` (the same by purpose in list-price dollars, a purpose with no priced call left out) and `voice_usd numeric(12,6)` (the day's calls' cost in dollars). `public.call_cost_usd(p_cost jsonb) returns numeric`: Retell's `call_cost.combined_cost` (cents) as dollars, null for anything else (a string, a negative, an array, past a hundred thousand dollars a call): the one place the product says what a call cost. `public.platform_metrics_roll(p_day date)` replaced: the first statement is 00277's day, unchanged; a second, in a block that traps its own failure, keeps the five columns and takes `tokens` from the ledger where the ledger holds the day.
- **Old days read absent, never zero.** Nothing is backfilled: a row rolled before this migration has null in all five, and `tokens` as the events counted it. A day nothing said anything about is null, not `{}` and not 0 (no stamped message: `handled` null; no priced call: `ai_usd` and `voice_usd` null).
- **What each reads, and why it is durable.** `handled` and `topics`: `messages.meta.handled` and `meta.intent` on inbound customer messages (K1, batch 1; the rows are kept) and `calls.analysis.topic` of connected inbound calls (K2; `call_connected`, phase A), each filtered to its closed set. `ai_*`: `ai_usage` (kept 400 days) rather than `usage.llm_tokens` and `usage.ask_tokens` events (purged at 30), and `not shadow`: a second model's opinion is the platform's cost, not the workspace's use. `voice_usd`: `calls.cost` (kept for the call's life). So any of the five can be re-rolled for a day from rows that still exist; the legacy event-derived columns cannot (below).
- **`tokens`** is the ledger's total (`usageTokens`' four kinds, every purpose) when the ledger holds the day for the workspace, and the events' count otherwise, so it never counts one call twice and a day before the ledger (29 Sep) reads as it did. The number rises on the first night: it was undercounting (the ledger exists because four paths wrote no event, defect 53).
- **Why a second statement in a block.** The first statement feeds the operator's answer-silence alarm and the back office's card. The new columns read more tables (`ai_usage`, `calls`, the messages' meta) and their words are data; one surprising row must cost the new columns alone. The block catches it, warns, and the roll answers. A workspace that has only new facts (a day of calls and nothing else) gets its row from the second statement, and the roll's answer counts it.
- **The re-run limit, stated.** The day's event-derived columns (`replies_*`, `brain_p95_ms`, `provider_failures`, and `tokens` where the ledger is empty) come from events purged at 30 days: re-rolling a day older than that replaces them with nothing. This batch rolls yesterday only. A backfill of the new columns for older days needs its own narrow function and is Ruben's call (notes).
- **UTC days, as 00277:** a lens in a workspace's own zone cannot re-bucket a day: month-on-month is exact to the day's edge, not to the minute.
- Either deploy order: nothing reads the columns yet. Apply it any time: `platform_metrics` is written once a night.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/platform/a-day-keeps-what-the-lenses-read.db.test.mjs`. Header comment (what is kept, and that the roll is global, so each case owns a day long past and its own workspaces), `URL_`, `KEY`, `skip` (the three-way check of `platform/platform-metrics.db.test.mjs:42-52` without the anon clause), `ROOT`, `CLI`, `DB_URL`, `CLI_TARGET` (copied from `platform/platform-metrics.db.test.mjs:33-41`; ROOT four levels up) and `rolledBack` (copied from `database/team-changes-and-their-audit.db.test.mjs:678-701`). Then:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { BRAIN_INTENTS, HANDLED_OUTCOMES } from "@chanlytics/contracts";

/** The day counted: long past, and nobody else's. */
const D = "2026-03-17";
const at = (time, day = D) => `${day}T${time}Z`;
const RUN = Date.now().toString(36);
let serial = 0;
let db;
const made = [];
const W = {};
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function workspace(tag) {
  const id = ok(
    await db.from("tenants").insert({ name: `Lenses ${tag} ${RUN}`, slug: `harbor-lenses-${tag}-${++serial}-${RUN}` }).select("id").single(),
    tag,
  ).id;
  made.push(id);
  W[tag] = id;
  return id;
}
/** A person with a thread: the ids messages are written into. */
async function thread(t) {
  const contact = ok(await db.from("contacts").insert({ tenant_id: t, phone_e164: `+1555013${String(++serial).padStart(4, "0")}` }).select("id").single()).id;
  const conversation = ok(await db.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single()).id;
  return { tenant_id: t, contact_id: contact, conversation_id: conversation };
}
/** Messages: [direction, sender, when, meta]. All WhatsApp. */
const messages = async (th, rows) =>
  ok(
    await db.from("messages").insert(
      rows.map(([direction, sender, when, meta]) => ({
        ...th, channel: "whatsapp", direction, sender, type: "text", body: "made-up words",
        status: direction === "inbound" ? "received" : "sent", created_at: when, meta: meta ?? {},
      })),
    ),
    "messages",
  );
const calls = async (t, rows) =>
  ok(
    await db.from("calls").insert(
      rows.map((r, i) => ({ tenant_id: t, retell_call_id: `lenses-${serial}-${i}-${RUN}`, direction: "inbound", status: "ended", ...r })),
    ),
    "calls",
  );
const ledger = async (t, rows) =>
  ok(
    await db.from("ai_usage").insert(
      rows.map((r) => ({ tenant_id: t, model_asked: "claude-sonnet-5", model: "claude-sonnet-5", outcome: "answered", cache_read_tokens: 0, cache_write_tokens: 0, ...r })),
    ),
    "ledger",
  );
const roll = async (day = D) => ok(await db.rpc("platform_metrics_roll", { p_day: day }), `roll ${day}`);
const rolled = async (t, day = D) =>
  ok(await db.from("platform_metrics").select("*").eq("tenant_id", t).eq("day", day), "row")[0];

const stamped = (handled, intent, extra = {}) => ({ handled, ...(intent ? { intent } : {}), ...extra });
```

`before` builds the day (comment each line with what it is for):

```js
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });

  // busy: every way a message ends, every way a word can be wrong, both edges of the day, a call of every kind, a ledger.
  const busy = await workspace("busy");
  const c1 = await thread(busy);
  await messages(c1, [
    ["inbound", "customer", at("10:00:00"), stamped("ai", "booking")],
    ["inbound", "customer", at("10:05:00"), stamped("ai", "pricing")],
    ["inbound", "customer", at("10:10:00"), stamped("held", "pricing")],
    ["inbound", "customer", at("10:15:00"), stamped("handoff", "complaint")],
    ["inbound", "customer", at("10:20:00"), stamped("blocked")],
    ["inbound", "customer", at("10:25:00")], // never stamped: counted in neither
    ["inbound", "customer", at("10:30:00"), stamped("banana", "banana")], // words outside the sets: never a key
    ["inbound", "customer", at("10:35:00"), stamped("ai", "booking", { backfill: true })], // history brought in
    ["outbound", "ai", at("11:00:00"), stamped("ai", "booking")], // the receptionist's own words are no customer's message
    ["inbound", "customer", at("00:00:00"), stamped("ai", "hours")], // the day's first instant is in
    ["inbound", "customer", at("23:59:59"), stamped("held", "location")], // its last second is in
    ["inbound", "customer", at("23:59:59", "2026-03-16"), stamped("ai", "booking")], // yesterday's
    ["inbound", "customer", at("00:00:00", "2026-03-18"), stamped("ai", "booking")], // tomorrow's first instant is out
  ]);
  await calls(busy, [
    { started_at: at("09:00:00"), duration_ms: 60000, analysis: { topic: "booking" }, cost: { combined_cost: 245 } },
    { started_at: at("09:10:00"), duration_ms: 30000, analysis: { topic: "pricing" }, cost: { combined_cost: 105.5 } },
    { started_at: at("09:20:00"), status: "error", duration_ms: 0, analysis: { topic: "pricing" }, cost: { combined_cost: 10 } }, // never connected: no topic, but it cost
    { started_at: at("09:30:00"), direction: "outbound", analysis: { topic: "location" }, cost: { combined_cost: 20 } }, // went out: no topic
    { started_at: at("09:40:00"), duration_ms: 1000, analysis: { topic: "banana" }, cost: { combined_cost: "12" } }, // neither
    { started_at: at("09:50:00"), duration_ms: 1000, cost: { combined_cost: -5 } },
    { started_at: at("09:51:00"), duration_ms: 1000, cost: [1, 2] },
    { started_at: at("09:52:00"), duration_ms: 1000, cost: { combined_cost: 99999999 } },
    { started_at: at("00:00:00", "2026-03-18"), duration_ms: 1000, analysis: { topic: "booking" }, cost: { combined_cost: 500 } }, // another day
  ]);
  await ledger(busy, [
    { purpose: "receptionist", input_tokens: 1000, output_tokens: 200, cache_read_tokens: 300, cache_write_tokens: 50, usd: 0.0123, created_at: at("10:01:00") },
    { purpose: "receptionist", input_tokens: 500, output_tokens: 100, usd: 0.005, created_at: at("10:06:00") },
    { purpose: "ask", input_tokens: 2000, output_tokens: 300, usd: 0.02, created_at: at("10:07:00") },
    { purpose: "lead_judge", input_tokens: 300, output_tokens: 100, usd: null, created_at: at("10:08:00") }, // no price: tokens, no dollars
    { purpose: "lead_judge", input_tokens: 9999, output_tokens: 0, usd: 0.5, shadow: true, port: "typesafe", question: "independent", created_at: at("10:09:00") }, // a second opinion
    { purpose: "ask", input_tokens: 7777, output_tokens: 0, usd: 7, created_at: at("23:59:59", "2026-03-16") }, // another day
  ]);
  // The same calls as the events the first statement counts tokens from: the ledger's total must win, not add.
  ok(
    await db.from("events").insert([
      { tenant_id: busy, kind: "usage.llm_tokens", category: "usage", data: { held: null, escalate: false, input_tokens: 100, output_tokens: 20 }, created_at: at("10:01:00") },
    ]),
    "events",
  );

  // junk: a message and nothing the roll can read from it; and a workspace whose only news is the events' tokens.
  await messages(await thread(await workspace("junk")), [["inbound", "customer", at("12:00:00"), stamped("banana", "banana")]]);
  const old = await workspace("events");
  await messages(await thread(old), [["inbound", "customer", at("12:00:00")]]);
  ok(
    await db.from("events").insert([
      { tenant_id: old, kind: "usage.llm_tokens", category: "usage", data: { held: null, escalate: false, input_tokens: 100, output_tokens: 20 }, created_at: at("12:01:00") },
      { tenant_id: old, kind: "usage.ask_tokens", category: "usage", data: { input_tokens: 25, output_tokens: 5 }, created_at: at("12:02:00") },
    ]),
    "events",
  );
  // voice: a day of calls and nothing else; quiet: a call of another day only.
  await calls(await workspace("voice"), [{ started_at: at("15:00:00"), duration_ms: 90000, cost: { combined_cost: 150 } }]);
  await calls(await workspace("quiet"), [{ started_at: at("15:00:00", "2026-03-19"), duration_ms: 90000, cost: { combined_cost: 150 } }]);
  // words: one message for each of the nine topics, each ended one of the four ways, to hold the SQL's copies to contracts' sets.
  const words = await thread(await workspace("words"));
  await messages(
    words,
    BRAIN_INTENTS.map((intent, i) => ["inbound", "customer", at(`16:0${i}:00`), stamped(HANDLED_OUTCOMES[i % HANDLED_OUTCOMES.length], intent)]),
  );
});

after(async () => {
  if (skip) return;
  for (const id of made) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
});
```

The cases:

```js
test("the day's lenses columns: how each customer message ended, what they asked about, the model's tokens and dollars by purpose, what the calls cost", { skip }, async () => {
  const wrote = await roll();
  const all = ok(await db.from("platform_metrics").select("tenant_id").eq("day", D), "rows");
  assert.equal(wrote, all.length, "it answers how many rows it wrote, a row the second statement made included");

  const busy = await rolled(W.busy);
  assert.deepEqual(busy.messages_in, { whatsapp: 9 }, "00277's counts are what they were: customers' messages, history and the edges out");
  assert.deepEqual(busy.handled, { ai: 3, held: 2, handoff: 1, blocked: 1 }, "stamped customer messages only; the unstamped, the backfilled, the receptionist's own and the unknown word are not counted");
  assert.deepEqual(busy.topics, { booking: 2, pricing: 3, complaint: 1, hours: 1, location: 1 }, "texts and connected inbound calls, in one list");
  assert.deepEqual(busy.ai_tokens, { receptionist: 2150, ask: 2300, lead_judge: 400 }, "all four kinds of tokens by purpose; a shadow and another day are not");
  assert.deepEqual(busy.ai_usd, { receptionist: 0.0173, ask: 0.02 }, "dollars by purpose; a purpose with no priced call has none");
  assert.equal(Number(busy.voice_usd), 3.805, "245 + 105.5 + 10 + 20 cents: a call that never connected or went out still cost; a cost that is no number, below nothing, an array or absurd is not one");
  assert.equal(busy.tokens, 4850, "the ledger's total for the day, not the ledger's plus the event's 120 for the same calls");
});

test("a day nothing said anything about is absent, not zero: unknown words, a workspace with only the events' tokens, and a day of calls and nothing else", { skip }, async () => {
  const junk = await rolled(W.junk);
  assert.deepEqual([junk.handled, junk.topics, junk.ai_tokens, junk.ai_usd, junk.voice_usd], [null, null, null, null, null]);
  assert.deepEqual(junk.messages_in, { whatsapp: 1 });

  const events = await rolled(W.events);
  assert.equal(events.tokens, 150, "no ledger rows: the events' count, as 00277 gave it");
  assert.deepEqual([events.ai_tokens, events.ai_usd, events.voice_usd], [null, null, null]);

  const voice = await rolled(W.voice);
  assert.equal(Number(voice.voice_usd), 1.5);
  assert.deepEqual([voice.asks, voice.messages_in, voice.handled, voice.ai_tokens], [0, {}, null, null], "its row is the second statement's, and what it did not count is an honest zero or empty");

  assert.equal(await rolled(W.quiet), undefined, "a call of another day makes no row for this one");
});

test("the SQL's copies of the closed sets are contracts' sets: every handled word and every topic lands, once", { skip }, async () => {
  const words = await rolled(W.words);
  const expectHandled = {};
  BRAIN_INTENTS.forEach((_, i) => {
    const h = HANDLED_OUTCOMES[i % HANDLED_OUTCOMES.length];
    expectHandled[h] = (expectHandled[h] ?? 0) + 1;
  });
  assert.deepEqual(words.handled, expectHandled);
  assert.deepEqual(words.topics, Object.fromEntries(BRAIN_INTENTS.map((w) => [w, 1])));
});

test("rolled again, the day's lenses columns are replaced and never doubled; tokens come from the ledger once", { skip }, async () => {
  const first = await rolled(W.busy);
  await ledger(W.busy, [{ purpose: "ask", input_tokens: 100, output_tokens: 0, usd: 0.001, created_at: at("11:30:00") }]);
  await roll();
  const second = await rolled(W.busy);
  assert.deepEqual(second.handled, first.handled);
  assert.deepEqual(second.topics, first.topics);
  assert.deepEqual(second.ai_tokens, { receptionist: 2150, ask: 2400, lead_judge: 400 }, "the new call is in, the old ones are not counted twice");
  assert.equal(second.tokens, 4950);
  assert.equal(Number(second.voice_usd), 3.805);
  assert.ok(Date.parse(second.rolled_at) >= Date.parse(first.rolled_at));
  assert.equal(
    ok(await db.from("platform_metrics").select("tenant_id").eq("tenant_id", W.busy).eq("day", D), "rows").length,
    1,
  );
});

test("call_cost_usd: Retell's cents as dollars, and nothing else is a cost", { skip }, async () => {
  const usd = async (p_cost) => ok(await db.rpc("call_cost_usd", { p_cost }), JSON.stringify(p_cost));
  assert.equal(Number(await usd({ combined_cost: 245 })), 2.45);
  assert.equal(Number(await usd({ combined_cost: 0 })), 0, "a call that cost nothing is a real zero");
  assert.equal(Number(await usd({ combined_cost: 12.5, product_costs: [] })), 0.125);
  for (const bad of [null, {}, [], "245", 245, { combined_cost: "245" }, { combined_cost: null }, { combined_cost: -1 }, { combined_cost: 10000000 }, [{ combined_cost: 1 }]])
    assert.equal(await usd(bad), null, `${JSON.stringify(bad)} is no cost`);
});

test("a failure in the new columns costs those columns alone: the day's existing counts are written and the roll answers", { skip }, async () => {
  const seen = rolledBack(`
    if not exists (select 1 from public.tenants where id = '${W.busy}') then raise exception 'not_this_database'; end if;
    perform public.platform_metrics_roll('${D}');
    seen := seen || jsonb_build_object('control', (select handled is not null from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'));
    delete from public.platform_metrics where day = '${D}';
    -- A table that refuses every one of the new columns' values, for the rows that exist already and the ones still to come.
    alter table public.platform_metrics add constraint __lenses_refused
      check (handled is null and topics is null and ai_tokens is null and ai_usd is null and voice_usd is null) not valid;
    seen := seen || jsonb_build_object('wrote', public.platform_metrics_roll('${D}'));
    seen := seen || jsonb_build_object(
      'asks', (select asks from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'),
      'in', (select messages_in from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'),
      'handled', (select handled from public.platform_metrics where tenant_id = '${W.busy}' and day = '${D}'),
      'rows', (select count(*) from public.platform_metrics where day = '${D}'));
  `);
  assert.equal(seen.control, true, "the control: without the refusing constraint the columns are kept");
  assert.deepEqual(seen.in, { whatsapp: 9 }, "00277's counts were written");
  assert.ok(seen.asks > 0);
  assert.equal(seen.handled, null, "and the lenses' columns were not");
  assert.ok(seen.wrote >= 4 && seen.rows === seen.wrote, "the roll answered, with the rows that did land");
});
```

(`seen.wrote >= 4`: busy, junk, events and words have a first-statement row; the voice workspace's row is the second statement's, which the constraint refused, so it is not counted.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/platform/a-day-keeps-what-the-lenses-read.db.test.mjs`
Expected: FAIL: `column "handled" does not exist` on the first insert's read (and `call_cost_usd` is not there).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00298_a_day_keeps_what_the_lenses_read.sql`:

```sql
-- 00298 · A day keeps what the lenses read.
--
-- The Reports lenses spec, K10, and the first clause of K8. The nightly roll (00277) counted a workspace's day from
-- events that are purged at thirty days, and kept nothing the receptionist did: how each customer's message ended, what
-- they asked about, what the model's tokens went on, what the day's calls cost. Five columns now keep them, read from rows
-- that last: handled (messages.meta.handled, K1: ai, held, handoff or blocked), topics (messages.meta.intent and a
-- connected inbound call's analysis.topic, K1 and K2: the nine words of contracts BRAIN_INTENTS), ai_tokens and ai_usd
-- (the ledger, 00273, by purpose, the workspace's own calls and never a shadow's), and voice_usd (calls.cost: Retell's
-- call_cost.combined_cost is in cents, and call_cost_usd is the one place the product says what a call cost in dollars).
-- tokens now reads the ledger where the ledger holds the day, so it counts a call once, and the events' count otherwise.
-- The dollars are the operator's, and stay in this service-role table: workspace_days (00299) is what an owner may read.
--
-- A day nothing said anything about is null, never {} and never zero; no word outside its closed set becomes a key; a
-- call cost that is not a number, is below nothing or is past a hundred thousand dollars is no cost. SQL repeats two
-- closed sets here (the four handled words, the nine topics); a database test holds them to contracts' sets.
--
-- The roll is two statements. The first is 00277's day, unchanged: the operator's answer-silence alarm and the back
-- office's card read it. The second keeps the five columns, in a block that traps its own failure, so a surprising row
-- costs the new columns alone and the roll still answers. A workspace with only new facts (a day of calls and nothing
-- else) gets its row from the second statement, and the roll's answer counts it.
--
-- Re-running a day replaces its row. The five columns can be re-rolled for any day whose messages, calls and ledger rows
-- still exist; the event-derived columns of the first statement (replies_*, brain_p95_ms, provider_failures, and tokens
-- where the ledger is empty) cannot, since their events are purged at thirty days: re-run a day older than that and they
-- are replaced with nothing. Nothing is backfilled; the nightly roll rolls yesterday only. UTC days, as 00277.
--
-- Either deploy order works (nothing reads the columns yet). platform_metrics is written once a night: its lock is
-- brief and the guard of 00259 is set.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

/* ------------------------------------------------------------------------- 1. the columns -- */

alter table public.platform_metrics add column if not exists handled   jsonb check (handled   is null or jsonb_typeof(handled)   = 'object');
alter table public.platform_metrics add column if not exists topics    jsonb check (topics    is null or jsonb_typeof(topics)    = 'object');
alter table public.platform_metrics add column if not exists ai_tokens jsonb check (ai_tokens is null or jsonb_typeof(ai_tokens) = 'object');
alter table public.platform_metrics add column if not exists ai_usd    jsonb check (ai_usd    is null or jsonb_typeof(ai_usd)    = 'object');
alter table public.platform_metrics add column if not exists voice_usd numeric(12, 6) check (voice_usd is null or voice_usd >= 0);

comment on column public.platform_metrics.handled is
  'How the day''s customer messages ended (K10): counts of meta.handled (ai, held, handoff, blocked) on inbound customer messages, a key only where its count is above zero. Null where no message of the day was stamped (a day before K1 included).';
comment on column public.platform_metrics.topics is
  'What the day''s customers asked about (K10): counts by the nine BRAIN_INTENTS words, from texts'' meta.intent and connected inbound calls'' analysis.topic. Null where nothing said.';
comment on column public.platform_metrics.ai_tokens is
  'The model''s tokens of the day by purpose (K10), all four kinds, from the ledger (ai_usage), the workspace''s own calls and never a shadow''s. Null where the ledger holds none.';
comment on column public.platform_metrics.ai_usd is
  'The same by purpose in list-price dollars (K10): the operator''s, never an owner''s. A purpose with no priced call is left out; null where none was priced.';
comment on column public.platform_metrics.voice_usd is
  'What the day''s calls cost in dollars (K8): the sum of call_cost_usd over calls.cost of the calls that started that day, whatever their direction or ending. The operator''s. Null where no call carried a cost.';

/* ------------------------------------------------------------------------ 2. what a call cost -- */

create or replace function public.call_cost_usd(p_cost jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  -- Retell's call_cost.combined_cost is in cents (its get-call reference). Not a number, below nothing, or past a hundred
  -- thousand dollars for one call is no cost: never an error and never a zero that is not the call's.
  select case when jsonb_typeof(p_cost -> 'combined_cost') = 'number'
              then case when (p_cost ->> 'combined_cost')::numeric between 0 and 9999900
                        then round((p_cost ->> 'combined_cost')::numeric / 100, 6) end
         end
$$;
revoke all on function public.call_cost_usd(jsonb) from public, anon;
grant execute on function public.call_cost_usd(jsonb) to authenticated, service_role;
comment on function public.call_cost_usd(jsonb) is
  'A call''s cost in dollars from the provider''s own call_cost (K8): combined_cost, in cents, divided by a hundred; null for anything that is not a plausible cost. The one place the product says it.';

/* ------------------------------------------------------------------------------ 3. the roll -- */

create or replace function public.platform_metrics_roll(p_day date default ((now() at time zone 'utc')::date - 1))
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_t0  timestamptz := p_day::timestamp at time zone 'utc';
  v_t1  timestamptz := (p_day + 1)::timestamp at time zone 'utc';
  v_n   integer;
  v_new integer;
begin
  -- The first statement is 00277's, byte for byte in what it counts.
  with
  -- Workspace by workspace, so each read is its (tenant_id, created_at) index's day (00016), never the whole table.
  msg_counts as (
    select t.id as tenant_id, m.channel,
           count(*) filter (where m.direction = 'inbound' and m.sender = 'customer') as n_in,
           count(*) filter (where m.direction = 'outbound' and m.status in ('sent', 'delivered', 'read')) as n_out
      from public.tenants t
      join public.messages m on m.tenant_id = t.id and m.created_at >= v_t0 and m.created_at < v_t1
     where coalesce(m.meta->>'backfill', 'false') <> 'true'
     group by t.id, m.channel
  ),
  msg as (
    select c.tenant_id,
           coalesce(jsonb_object_agg(c.channel, c.n_in) filter (where c.n_in > 0), '{}'::jsonb) as messages_in,
           coalesce(jsonb_object_agg(c.channel, c.n_out) filter (where c.n_out > 0), '{}'::jsonb) as messages_out
      from msg_counts c
     group by c.tenant_id
  ),
  -- The receptionist's own record of each reply (usage.llm_tokens with its quality signal): handed off, held for the
  -- veto window or low confidence, or answered at once. A reach-out reply's draft carries no `held` and is not one.
  replies as (
    select e.tenant_id,
           count(*) filter (where e.data->>'escalate' = 'true') as handed_off,
           count(*) filter (where coalesce(e.data->>'escalate', 'false') <> 'true' and e.data->>'held' is not null)
             as held,
           count(*) filter (where coalesce(e.data->>'escalate', 'false') <> 'true' and e.data->>'held' is null)
             as answered,
           percentile_cont(0.95) within group (
             order by case when e.data->>'latency_ms' ~ '^[0-9]+(\.[0-9]+)?$' then (e.data->>'latency_ms')::numeric end
           ) as p95
      from public.events e
     where e.kind = 'usage.llm_tokens' and e.created_at >= v_t0 and e.created_at < v_t1 and e.data ? 'held'
     group by e.tenant_id
  ),
  tokens as (
    select e.tenant_id,
           sum(case when e.data->>'input_tokens' ~ '^[0-9]+$' then (e.data->>'input_tokens')::bigint else 0 end
             + case when e.data->>'output_tokens' ~ '^[0-9]+$' then (e.data->>'output_tokens')::bigint else 0 end)
             as tokens
      from public.events e
     where e.kind in ('usage.llm_tokens', 'usage.ask_tokens') and e.created_at >= v_t0 and e.created_at < v_t1
     group by e.tenant_id
  ),
  -- A send that failed, by what it came to (channels providerFetch's outcomes): `unknown` is said on the row; of the
  -- rest, the provider's "not now" (408, 429) and no answer at all are calls that left nothing, any other 4xx a refusal.
  failure_rows as (
    select e.tenant_id,
           coalesce(e.data->>'outcome',
                    case when e.data->>'http_status' in ('408', '429') then 'retryable'
                         when e.data->>'http_status' ~ '^4[0-9][0-9]$' then 'refused'
                         when coalesce(e.data->>'http_status', '0') = '0' then 'retryable'
                         else 'unknown' end) as outcome
      from public.events e
     where e.kind = 'message.send_failed' and e.created_at >= v_t0 and e.created_at < v_t1
  ),
  failures as (
    select f.tenant_id, jsonb_object_agg(f.outcome, f.n) as provider_failures
      from (select tenant_id, outcome, count(*) as n from failure_rows group by tenant_id, outcome) f
     group by f.tenant_id
  ),
  active as (
    select tenant_id from msg union select tenant_id from replies
    union select tenant_id from tokens union select tenant_id from failures
  ),
  -- Customers' messages that day and whether anyone answered them (first_replies, the reports' one definition).
  asked as (
    select a.tenant_id, count(r.asked_at) as asks, count(r.asked_at) filter (where r.who in ('ai', 'you')) as answered
      from active a
      left join lateral public.first_replies(a.tenant_id, v_t0) r on r.asked_at < v_t1
     group by a.tenant_id
  ),
  written as (
    insert into public.platform_metrics as pm (
      tenant_id, day, messages_in, messages_out, asks, answered, replies_answered, replies_held, replies_handed_off,
      brain_p95_ms, provider_failures, tokens, rolled_at)
    select a.tenant_id, p_day,
           coalesce(m.messages_in, '{}'::jsonb), coalesce(m.messages_out, '{}'::jsonb),
           coalesce(q.asks, 0), coalesce(q.answered, 0),
           coalesce(r.answered, 0), coalesce(r.held, 0), coalesce(r.handed_off, 0),
           round(r.p95)::integer, coalesce(f.provider_failures, '{}'::jsonb), coalesce(t.tokens, 0), now()
      from active a
      left join msg m on m.tenant_id = a.tenant_id
      left join replies r on r.tenant_id = a.tenant_id
      left join tokens t on t.tenant_id = a.tenant_id
      left join failures f on f.tenant_id = a.tenant_id
      left join asked q on q.tenant_id = a.tenant_id
     where exists (select 1 from public.tenants x where x.id = a.tenant_id)
    on conflict (tenant_id, day) do update
       set messages_in = excluded.messages_in, messages_out = excluded.messages_out, asks = excluded.asks,
           answered = excluded.answered, replies_answered = excluded.replies_answered,
           replies_held = excluded.replies_held, replies_handed_off = excluded.replies_handed_off,
           brain_p95_ms = excluded.brain_p95_ms, provider_failures = excluded.provider_failures,
           tokens = excluded.tokens, rolled_at = excluded.rolled_at
    returning 1
  )
  select count(*)::integer into v_n from written;

  -- The second keeps what the lenses read, and fails alone.
  begin
    with
    stamped as (
      select t.id as tenant_id, m.meta ->> 'handled' as handled, count(*) as n
        from public.tenants t
        join public.messages m on m.tenant_id = t.id and m.created_at >= v_t0 and m.created_at < v_t1
       where m.direction = 'inbound' and m.sender = 'customer'
         and coalesce(m.meta ->> 'backfill', 'false') <> 'true'
         and m.meta ->> 'handled' in ('ai', 'held', 'handoff', 'blocked')
       group by t.id, m.meta ->> 'handled'
    ),
    handled as (
      select s.tenant_id, jsonb_object_agg(s.handled, s.n) as counts from stamped s group by s.tenant_id
    ),
    asked_about as (
      select t.id as tenant_id, m.meta ->> 'intent' as topic, count(*) as n
        from public.tenants t
        join public.messages m on m.tenant_id = t.id and m.created_at >= v_t0 and m.created_at < v_t1
       where m.direction = 'inbound' and m.sender = 'customer'
         and coalesce(m.meta ->> 'backfill', 'false') <> 'true'
         and m.meta ->> 'intent' in ('booking', 'pricing', 'money', 'hours', 'services', 'location', 'complaint', 'smalltalk', 'other')
       group by t.id, m.meta ->> 'intent'
      union all
      select t.id, c.analysis ->> 'topic', count(*)
        from public.tenants t
        join public.calls c on c.tenant_id = t.id and c.started_at >= v_t0 and c.started_at < v_t1
       where c.direction = 'inbound' and public.call_connected(c.status, c.duration_ms)
         and c.analysis ->> 'topic' in ('booking', 'pricing', 'money', 'hours', 'services', 'location', 'complaint', 'smalltalk', 'other')
       group by t.id, c.analysis ->> 'topic'
    ),
    topics as (
      select a.tenant_id, jsonb_object_agg(a.topic, a.n) as counts
        from (select tenant_id, topic, sum(n)::bigint as n from asked_about group by tenant_id, topic) a
       group by a.tenant_id
    ),
    ledger as (
      select u.tenant_id, u.purpose,
             sum(u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_tokens)::bigint as tokens,
             sum(u.usd) as usd
        from public.ai_usage u
       where u.created_at >= v_t0 and u.created_at < v_t1 and not u.shadow
       group by u.tenant_id, u.purpose
    ),
    ai as (
      select l.tenant_id,
             sum(l.tokens)::bigint as tokens,
             jsonb_object_agg(l.purpose, l.tokens) as tokens_by,
             jsonb_object_agg(l.purpose, round(l.usd, 6)) filter (where l.usd is not null) as usd_by
        from ledger l
       group by l.tenant_id
    ),
    voice as (
      select t.id as tenant_id, round(sum(public.call_cost_usd(c.cost)), 6) as usd
        from public.tenants t
        join public.calls c on c.tenant_id = t.id and c.started_at >= v_t0 and c.started_at < v_t1
       where public.call_cost_usd(c.cost) is not null
       group by t.id
    ),
    lenses as (
      select tenant_id from handled union select tenant_id from topics
      union select tenant_id from ai union select tenant_id from voice
    ),
    kept as (
      insert into public.platform_metrics as pm (tenant_id, day, handled, topics, ai_tokens, ai_usd, voice_usd, tokens, rolled_at)
      select l.tenant_id, p_day, h.counts, tp.counts, ai.tokens_by, ai.usd_by, vc.usd, coalesce(ai.tokens, 0), now()
        from lenses l
        left join handled h on h.tenant_id = l.tenant_id
        left join topics tp on tp.tenant_id = l.tenant_id
        left join ai on ai.tenant_id = l.tenant_id
        left join voice vc on vc.tenant_id = l.tenant_id
       where exists (select 1 from public.tenants x where x.id = l.tenant_id)
      on conflict (tenant_id, day) do update
         set handled = excluded.handled, topics = excluded.topics, ai_tokens = excluded.ai_tokens,
             ai_usd = excluded.ai_usd, voice_usd = excluded.voice_usd,
             -- the ledger's total where it holds the day, the events' count (the first statement's) where it does not
             tokens = case when excluded.ai_tokens is not null then excluded.tokens else pm.tokens end,
             rolled_at = excluded.rolled_at
      returning (xmax = 0) as inserted
    )
    select count(*) filter (where inserted)::integer into v_new from kept;
    v_n := v_n + coalesce(v_new, 0);
  exception when others then
    raise warning 'platform_metrics_roll: the lenses'' columns were not kept for %: %', p_day, sqlerrm;
  end;
  return v_n;
end $$;
revoke all on function public.platform_metrics_roll(date) from public, anon, authenticated;
grant execute on function public.platform_metrics_roll(date) to service_role;
comment on function public.platform_metrics_roll(date) is
  'Counts one UTC day (yesterday by default) for every workspace that did anything in it into platform_metrics, replacing the day''s rows (00277), then keeps what the lenses read: how each customer message ended, what they asked about, the model''s tokens and dollars by purpose and what the calls cost (00298), in a block that fails alone. Answers how many rows it wrote. The nightly clock''s, and the service role''s to re-run a day: not a day older than the events'' thirty, whose event-derived columns it would empty.';
```

- [ ] **Step 4: Apply it twice, record it, run the tests**

Apply `00298` twice (the second run is the proof the function and columns re-run), then `--record` and the stack's ledger row (`'00298'`, `'a_day_keeps_what_the_lenses_read'`).

Run, one per command, with the stack's environment: `--db` the new file; `platform/platform-metrics.db.test.mjs` (00277's own suite must not move: its `tokens` case has no ledger rows, so it reads the events as before), `database/tenancy.db.test.mjs` (`platform_metrics` stays `none`), `database/privileges.db.test.mjs`, `database/migration-head.db.test.mjs`, `ops/sweep-registry.db.test.mjs`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/platform/a-day-keeps-what-the-lenses-read.db.test.mjs
git add supabase/migrations/00298_a_day_keeps_what_the_lenses_read.sql supabase/migrations-ledger.json tooling/scripts/tests/platform/a-day-keeps-what-the-lenses-read.db.test.mjs
```

---

### Task 6: A member reads their workspace's days (K10, migration 00299)

**Files:**
- Create: `supabase/migrations/00299_a_member_reads_their_workspace_s_days.sql`
- Create: `tooling/scripts/tests/platform/a-member-reads-their-workspace-s-days.db.test.mjs`

**Interfaces:**
- Consumes: the rolled days (Task 5), `session_shows_second_factor()` (00013).
- Produces (SQL): `public.workspace_days(p_tenant_id uuid, p_from date, p_to date) returns table (day date, messages_in jsonb, messages_out jsonb, asks integer, answered integer, handled jsonb, topics jsonb, ai_tokens jsonb)`: the days of one workspace between two dates, oldest first, SECURITY DEFINER, executable by signed-in sessions only. It refuses (`42501`, "Not a member of this workspace.") a caller who is not a member of `p_tenant_id` (a partner's seat counts only on a session that showed its second factor, the one predicate `team_roster` and `recording_opened` already say) and a session with no user (the service role, anon); and (`22023`) a null date or a span of more than 800 days. A day rolled before 00298 returns null in `handled`, `topics` and `ai_tokens`.
- **It returns the owner's columns and none of the operator's.** `ai_usd`, `voice_usd`, `brain_p95_ms`, `provider_failures`, `replies_*` and the legacy `tokens` (events-derived, and now a second derivation of what `ai_tokens` says) are never in the answer; the test pins the list.
- **Why a definer and not the spec's SECURITY INVOKER read** (decision, notes 2): `platform_metrics` has no member policy on purpose (latency, provider failures and now dollars live in it), so an invoker read sees nothing; a member policy would hand an owner the dollars; column grants break `select *` and the tenancy harness. The membership check in the function is the floor here, and the route that will call it (`read({ scope: workspace, role })`, phase C/F) is the door; the role of the lens that reads `ai_tokens` (Usage: owner) is the route's.
- **No repository function and no route yet.** An exported function nothing calls is a dead export, which the baseline refuses, and "a tile is a door" says the reader arrives with its first tile. The function is called by name in its test only.
- Either deploy order: nothing reads it.

- [ ] **Step 1: Write the failing database test**

Create `tooling/scripts/tests/platform/a-member-reads-their-workspace-s-days.db.test.mjs`. Header comment, `URL_`, `KEY`, `ANON`, `skip` (the three-way check of `platform/platform-metrics.db.test.mjs:42-52`), then:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let ownerA;
let viewerA;
let ownerB;
const tenants = [];
const users = [];
const ok = (r, what = "") => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
const days = (client, tenant, from, to) => client.rpc("workspace_days", { p_tenant_id: tenant, p_from: from, p_to: to });

/** A signed-in member: the workspace's owner first (a workspace keeps one), then whoever else. */
async function member(tenant, role, tag) {
  const email = `days-${tag}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `membership ${tag}`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, signed.error?.message);
  return client;
}

const OWNER_SAFE = ["ai_tokens", "answered", "asks", "day", "handled", "messages_in", "messages_out", "topics"];

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const tag of ["a", "b"]) {
    tenants.push(ok(await db.from("tenants").insert({ slug: `harbor-days-${tag}-${stamp}`, name: `Harbor Days ${tag}` }).select("id").single()).id);
  }
  [A, B] = tenants;
  ownerA = await member(A, "owner", "owner-a");
  viewerA = await member(A, "viewer", "viewer-a");
  ownerB = await member(B, "owner", "owner-b");
  ok(
    await db.from("platform_metrics").insert([
      {
        tenant_id: A, day: "2026-04-01", asks: 3, answered: 2,
        messages_in: { whatsapp: 3 }, messages_out: { whatsapp: 2 },
        handled: { ai: 2, held: 1 }, topics: { booking: 2, pricing: 1 }, ai_tokens: { receptionist: 1200 },
        // the operator's: none of it may come back
        ai_usd: { receptionist: 0.01 }, voice_usd: 1.25, brain_p95_ms: 2100, provider_failures: { retryable: 1 },
        tokens: 999, replies_answered: 2, replies_held: 1, replies_handed_off: 0,
      },
      { tenant_id: A, day: "2026-04-02", asks: 1, answered: 1 }, // rolled before 00298: the new columns are null
      { tenant_id: A, day: "2026-04-05", asks: 7, answered: 5 },
      { tenant_id: B, day: "2026-04-01", asks: 99, answered: 99, handled: { ai: 99 } },
    ]),
    "days",
  );
});

after(async () => {
  if (skip) return;
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("a member reads their workspace's days, oldest first, in the owner's columns and no others; an old day is absent, not zero", { skip }, async () => {
  for (const client of [ownerA, viewerA]) {
    const rows = ok(await days(client, A, "2026-04-01", "2026-04-30"), "days");
    assert.deepEqual(rows.map((r) => r.day), ["2026-04-01", "2026-04-02", "2026-04-05"], "A's days, B's not");
    for (const r of rows) assert.deepEqual(Object.keys(r).sort(), OWNER_SAFE, "never ai_usd, voice_usd, brain_p95_ms, provider_failures, replies_* or the legacy tokens");
    const [first, old] = rows;
    assert.deepEqual([first.asks, first.answered, first.messages_in, first.handled, first.topics, first.ai_tokens], [3, 2, { whatsapp: 3 }, { ai: 2, held: 1 }, { booking: 2, pricing: 1 }, { receptionist: 1200 }]);
    assert.deepEqual([old.handled, old.topics, old.ai_tokens], [null, null, null], "a day rolled before 00298 says nothing of what it did not keep");
  }
});

test("the range is the caller's, inclusive; a backwards one is empty", { skip }, async () => {
  assert.deepEqual(ok(await days(ownerA, A, "2026-04-02", "2026-04-02")).map((r) => r.day), ["2026-04-02"]);
  assert.deepEqual(ok(await days(ownerA, A, "2026-04-03", "2026-04-04")), []);
  assert.deepEqual(ok(await days(ownerA, A, "2026-04-30", "2026-04-01")), []);
});

test("another workspace's owner, a workspace nobody owns, anon and the service role are refused; and a span of years, or no dates, is refused", { skip }, async () => {
  const refused = (r, code) => assert.equal(r.error?.code, code, `${r.error?.message}`);
  refused(await days(ownerB, A, "2026-04-01", "2026-04-30"), "42501");
  refused(await days(ownerA, "00000000-0000-4000-8000-000000000000", "2026-04-01", "2026-04-30"), "42501");
  refused(await days(db, A, "2026-04-01", "2026-04-30"), "42501");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  assert.ok((await days(anon, A, "2026-04-01", "2026-04-30")).error, "anon is refused");
  refused(await days(ownerA, A, "2020-01-01", "2026-04-30"), "22023");
  refused(await days(ownerA, A, null, "2026-04-30"), "22023");
  // And the table itself is still nobody's but the service role's.
  assert.ok((await ownerA.from("platform_metrics").select("asks").eq("tenant_id", A)).error, "the table is closed to a member");
  assert.deepEqual(ok(await days(ownerB, B, "2026-04-01", "2026-04-30")).map((r) => r.asks), [99], "B reads B");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tooling/scripts/checks/test.mjs --db tooling/scripts/tests/platform/a-member-reads-their-workspace-s-days.db.test.mjs`
Expected: FAIL: `Could not find the function public.workspace_days`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/00299_a_member_reads_their_workspace_s_days.sql`:

```sql
-- 00299 · A member reads their workspace's days.
--
-- The Reports lenses spec, K10. The rolled days (platform_metrics, 00277, widened by 00298) are the back office's table:
-- no member policy, because latency, provider failures and, since 00298, dollars live in it. The lenses past ninety days
-- (the Overview's trends, Usage's earlier periods) need the part of a day that is a workspace's own, so workspace_days
-- returns exactly those columns and no others, to a member of that workspace. It is SECURITY DEFINER and checks
-- membership itself (the guard team_roster and recording_opened carry: a partner's seat counts only on a session that
-- showed its second factor); a session with no user, anon and the service role are refused. A route above it declares the
-- role (Usage is the owner's); this is the floor. A day rolled before 00298 returns null where the new columns are:
-- absent, never zero. At most 800 days a call.
--
-- Either deploy order works (nothing reads it yet). No table is changed.
set local lock_timeout = '3s';
do $$
begin
  raise notice 'lock_timeout for this migration: %', current_setting('lock_timeout');
  if current_setting('lock_timeout') <> '3s' then
    raise warning 'this file was applied outside a transaction, so SET LOCAL did nothing: run it inside begin/commit, or set lock_timeout yourself before it';
  end if;
end $$;

create or replace function public.workspace_days(p_tenant_id uuid, p_from date, p_to date)
returns table (
  day          date,
  messages_in  jsonb,
  messages_out jsonb,
  asks         integer,
  answered     integer,
  handled      jsonb,
  topics       jsonb,
  ai_tokens    jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- THE guard. A definer function that reads a table no member may read and does not check who is asking is a read of
  -- every workspace at once.
  if auth.uid() is null or not exists (
    select 1 from public.memberships m
     where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
       and (m.role <> 'partner' or public.session_shows_second_factor())
  ) then
    raise exception 'Not a member of this workspace.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to - p_from > 799 then
    raise exception 'workspace_days: a range of at most 800 days, with both dates' using errcode = '22023';
  end if;
  -- Every reference is qualified: the OUT parameters are in scope for the whole body.
  return query
    select pm.day, pm.messages_in, pm.messages_out, pm.asks, pm.answered, pm.handled, pm.topics, pm.ai_tokens
      from public.platform_metrics pm
     where pm.tenant_id = p_tenant_id and pm.day >= p_from and pm.day <= p_to
     order by pm.day;
end $$;
revoke all on function public.workspace_days(uuid, date, date) from public, anon;
grant execute on function public.workspace_days(uuid, date, date) to authenticated;
comment on function public.workspace_days(uuid, date, date) is
  'A workspace''s rolled days between two dates, oldest first, for a member of that workspace (K10): the messages in and out by channel, the asks and how many were answered, how each customer message ended, what they asked about, and the model''s tokens by purpose. Never the operator''s columns (dollars, latency, provider failures). Checks membership itself (a partner''s seat only with its second factor shown); refuses a session with no user and a range over 800 days. A day rolled before 00298 reads null in the last three.';
```

- [ ] **Step 4: Apply it twice, record it, run the tests**

Apply `00299` twice, then `--record` and the stack's ledger row (`'00299'`, `'a_member_reads_their_workspace_s_days'`).

Run: `--db` the new file; `database/privileges.db.test.mjs` (no definer function is open to `anon`; the search path is pinned), `database/tenancy.db.test.mjs`, `database/migration-head.db.test.mjs`, `platform/platform-metrics.db.test.mjs`.
Expected: PASS.

- [ ] **Step 5: Stage**

```bash
corepack pnpm exec prettier --write tooling/scripts/tests/platform/a-member-reads-their-workspace-s-days.db.test.mjs
git add supabase/migrations/00299_a_member_reads_their_workspace_s_days.sql supabase/migrations-ledger.json tooling/scripts/tests/platform/a-member-reads-their-workspace-s-days.db.test.mjs
```

---

### Task 7: Regenerate, say it in the reference, prove the batch, hand Ruben his steps

**Files:**
- Regenerate: `supabase/schema.sql`, `packages/db/src/database.types.ts`, `docs/data-model.md` (and confirm `packages/contracts/src/schema-sets.generated.ts` and `tooling/scripts/tests/_unique-keys.generated.json` hold only what Task 3 kept)
- Modify: `docs/system-prd.md` (the paragraph "What the rows keep for the Reports", the clocks table in S-09, and the paragraph on the read functions)

- [ ] **Step 1: Regenerate, keeping only this batch's hunks**

With 00296-00299 applied to the stack: `corepack pnpm gen:schema-sets`, `corepack pnpm gen:db-types`, `corepack pnpm --filter "./packages/*" build`, `corepack pnpm gen:schema-snapshot`, `corepack pnpm gen:data-model`. The shared stack holds what this tree does not, so compare each generated file with its staged version (`git diff -- <file>`) and **keep only the hunks these four migrations explain**, restoring every other hunk to the staged bytes with the Edit tool, never `git checkout`:
- `supabase/schema.sql` and `database.types.ts`: the table `sending_domain_days` (its columns, primary key, index, row security, policy, grants, comments); the columns `handled`, `topics`, `ai_tokens`, `ai_usd` and `voice_usd` on `platform_metrics` with their checks and comments; the functions `sending_domain_days_keep`, `channel_keep_quality`, `trigger_channel_quality_sweep`, `call_cost_usd`, `workspace_days`, and `platform_metrics_roll` (the replaced body, with its comment and ACL lines);
- `docs/data-model.md`: the new table's section and its row in the table list, and the five `platform_metrics` columns;
- `schema-sets.generated.ts`: `sending_domain_days.state` only; `_unique-keys.generated.json`: `sending_domain_days_pkey` only;
- `grep -c template_version supabase/schema.sql packages/db/src/database.types.ts` must print 0 for both, and no `events_y20…` partition name may have moved.

Run: plain `database/migrations.test.mjs`, `database/migration-ledger.test.mjs`, `database/generated/check-db-types.test.mjs`, `database/generated/schema-snapshot.test.mjs`, `database/generated/a-function-lives-as-its-newest-migration-wrote-it.test.mjs` (`platform_metrics_roll` now lives as 00298 wrote it, byte for byte in `schema.sql`), `docs/data-model.test.mjs`; `--db` `database/migration-head.db.test.mjs`, `database/generated/unique-keys.db.test.mjs`.
Expected: PASS (`schema-snapshot.db` may stay red for the other lane's objects, as for batches 1 and 2: check object by object that no difference is this batch's).

- [ ] **Step 2: Say what the rows keep, and the two clocks**

In `docs/system-prd.md`, in the paragraph "What the rows keep for the Reports (00287–00295)…", change the range in its heading to `(00287–00299)` and add after its last bullet:

```markdown
- a template: its quality follows Meta's `message_template_quality_update` the moment it arrives (`mapQuality`, the sync's word too), where it waited for the next sync; the history is the kept `channel.message_template_quality_update` events;
- a WhatsApp number: the rating Meta holds, read every six hours by the channel-quality sweep (`/api/cron/channel-quality`, 00297) and kept in the channel's config as `quality_read` and `quality_read_at` **beside** the connect-time `quality_rating` that broadcasts are gated on, and a `channel.quality_rating { from, to }` event when it changes (no `from` on the first read);
- a sending domain: its state and counters (`sent`, `bounced`, `complaints`, `sent_days`, and when the domains sweep last read it), once a night for the day that ended, in `sending_domain_days` (`sending_domain_days_keep`, 00296);
- a workspace's day, in `platform_metrics` (`platform_metrics_roll`, 00298): `handled` (how its customers' messages ended), `topics` (what they asked about, texts and connected calls), `ai_tokens` and `ai_usd` (the model's tokens and list-price dollars by purpose, the workspace's own calls), `voice_usd` (what its calls cost, from Retell's `call_cost`, `call_cost_usd`), and `tokens` from the ledger where it holds the day; a member reads the owner's part of it through `workspace_days` (00299), never the dollars.
```

Change the sentence "The three new kinds (`lead.set_aside`, `call.transferred`, `booking_link.sent`) are hidden…" to "The four new kinds (`lead.set_aside`, `call.transferred`, `booking_link.sent`, `channel.quality_rating`) are hidden…". In the S-09 clocks table add the rows `channel-quality-sweep` (`:41, every sixth hour`, "edge `/api/cron/channel-quality`, only when a WhatsApp number is connected"), `sending-domain-days` ("nightly, 00:23", "SQL") and `platform-metrics-roll` ("nightly, 00:17", "SQL"; it was missing). In the paragraph beginning "**The read functions** are `SECURITY INVOKER`", add the sentence: "The one exception is `workspace_days` (00299): SECURITY DEFINER over `platform_metrics`, which no member may read, so it checks membership itself and returns no column that is the operator's." The file is CRLF: use the byte-exact helper.

- [ ] **Step 3: The checks CI runs, locally, file by file**

Run: `corepack pnpm --filter "./packages/*" build`, `corepack pnpm -r typecheck`, `corepack pnpm lint` (holds its baseline in `docs/debt.md`, or fewer), `git status --short packages/*/dist` (every dist file with a real diff staged; the `agrees` hunks of `packages/db/dist/index.d.ts` restored by hand), `corepack pnpm check:dead-exports` (305, unchanged), and the ratchets `node tooling/scripts/checks/test.mjs tooling/scripts/tests/repo/code-health-ratchets.test.mjs` and `tooling/scripts/tests/types/index-reads-are-counted.test.mjs`.
Expected: clean, except main's own two reds the earlier batches recorded (`dashboard-a-v2.css::brief-chip`, `today-brief-words.ts`). No `docs/debt.md` row is owed: nothing here raises a baseline, and nothing falls (no function is extracted).

- [ ] **Step 4: Every test this batch touched, once more**

One per command (plain): `whatsapp/{a-template-s-quality-follows-its-webhook,whatsapp-connect,whatsapp-door}`, `cron/{cron-channel-quality-door,cron-auth}`, `workspace/activity`, `ops/retention-words`, `repo/{event-kinds,log-events,hygiene,contracts-barrels,ops-hygiene}`, `platform/delete-tenant`. With the stack, `--db`: `email/domains/{a-sending-domain-keeps-each-day-s-counters,sending-domains,sending-domain-counts}`, `whatsapp/a-number-s-quality-is-kept-and-said-when-it-changes`, `platform/{a-day-keeps-what-the-lenses-read,a-member-reads-their-workspace-s-days,platform-metrics}`, `ops/{sweep-registry,sweep-health.integration}`, `database/{tenancy,privileges,migration-head,event-shapes}`.
Expected: PASS (`event-shapes` #11 and `schema-snapshot.db` as in Step 1).

- [ ] **Step 5: The three things the stack cannot show**

No provider and no production database is reached, and no page is drawn (the Templates pill is the one thing an owner can see move, and it is the existing `StatePill`, not new markup), so no browser run is owed. What is Meta's and production's alone: that Graph answers `quality_rating` for a number with the token a workspace already holds (the first `channel.quality_rating` event after deploy says so); that the first real `message_template_quality_update` after deploy moves a template's pill (its event is in the Activity log if asked for by name); and what the first night's roll holds. Each is a read, never an action.

- [ ] **Step 6: Hand back**

Tell Ruben, in his words: nothing a customer sees changes, and an owner sees one thing move: a template's quality pill follows Meta's word as it arrives instead of at the next sync. What starts being kept: each template's quality as Meta says it (its history was always kept as events); each connected WhatsApp number's rating, read every six hours, with a line when it changes; each sending domain's counters as they stood each day, so a Resume no longer erases the episode it answered; and each workspace's day, rolled with how its customers' messages ended, what they asked about, the model's tokens and dollars by purpose and what its calls cost, with the part an owner may read as one door that checks who is asking. Then his production steps, none of which this plan takes:

1. **Land in order:** Reports phase A, batch 1, batch 2, then this batch (stacked on all three), then D3b. Main has moved and holds its own 00287-00289 and 00296-00299: run `dev-tools/reports-renumber.mjs` on the stack (dry run, then `--apply`) **before** rebasing, and delete the old ledger keys and `--record`, as batch 2's hand-back says.
2. **The edge first, then the migrations.** Merge (it deploys the route `/api/cron/channel-quality`, its `vercel.json` limit, and the dashboard that hides the new kind by name), then `supabase db push --linked --dry-run`, which must list the four renumbered files for 00296-00299 and nothing else (never `--include-all`), then `--yes`. The one order that matters: **00297 after the edge is live**, or its first tick (00:41, 06:41, 12:41 or 18:41 UTC) asks for a route that is not there and `sweep_health` goes red until it is. The other three either side.
3. **Nothing to set**: no environment variable, no secret, no provider setting. The sweep reads each number with the token its workspace already holds (the pilot number's `WHATSAPP_ACCESS_TOKEN`), asking for `quality_rating`, a field of the phone-number node that token already reads at connection.
4. **To look at afterwards (reads, not actions):** the morning after, `select day, handled, topics, ai_tokens, ai_usd, voice_usd from platform_metrics where day = (now() at time zone 'utc')::date - 1`; after the next :41 tick, `select config->>'quality_read', config->>'quality_read_at' from tenant_channels where kind = 'whatsapp'` and the `channel.quality_rating` events; the rows `channel_quality` and `sending_domain_days` in `sweep_health()`. `tokens` rises on the first night (it now counts the ledger, which counts every model call).
5. **Decided by Ruben, before or after:** whether broadcasts should be gated on the refreshed rating (a one-line change at three readers, a behaviour change), whether the last ninety days of the new columns should be backfilled (a narrow function, not a re-run of the roll), and the plan bar's unit (§18-1), which decides whether `ai_tokens` is what Usage draws. The notes say what each costs.

Everything stays staged and uncommitted until he says to commit.

---

## Coverage of §10

| Spec row | Where |
| --- | --- |
| K8 `calls.cost` into the ledger's dollars (the first clause) | Task 5: `call_cost_usd`, and `platform_metrics.voice_usd` rolled from `calls.cost`; not a column on `calls` and not in `usage_ledger` (reasons in the anchors table) |
| K8, the other four clauses | D3b (`2026-10-04-reports-d3b-start-keeping.md`) |
| K9 template quality applied from its webhook | Task 1 (`mapQuality`, `applyTemplateQuality`; the sync says quality through the same function) |
| K9 WhatsApp `quality_rating` refreshed by a clock | Tasks 3 and 4: a new six-hourly sweep, `quality_read` beside `quality_rating`, a `channel.quality_rating` event on change |
| K9 a daily snapshot of the sending-domain counters | Task 2 (`sending_domain_days`, the nightly `sending_domain_days_keep`) |
| K10 a read of `platform_metrics` scoped to the caller's workspace | Task 6 (`workspace_days`, a definer that checks membership; the reason it is not an invoker read is in the anchors) |
| K10 the roll widened to read `ai_usage`, reply topics and held/handed counts | Task 5 (`ai_tokens`, `ai_usd`, `topics`, `handled`; `tokens` from the ledger) |

