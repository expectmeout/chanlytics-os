# Ask Rewired, Phase 1: one read layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every row Ask reads is read the way the page reads it, once per turn, through one directory of readers that
the `/api/v1` GET routes read through too; nothing a route answers changes by a byte, and every place Ask's own
loaders disagreed with the pages is closed on purpose and named.

**Architecture:** `apps/dashboard/src/server/readers/` holds one reader per read: a named function of a
`ReaderContext` and typed arguments that returns `{ data, rows, stamp }`, where `data` is exactly what the GET route
answers today (the page's DTO) and `rows` are the references a citation may name. A `TurnCache` memoises by reader
and arguments for one turn (a failure is never kept); a per-instance `ReaderCache` keeps only the tenant's name and
zone across turns in this phase. A route's handler body moves into its reader verbatim and the route becomes one
line; an Ask tool reads the reader and applies the page's own view-model builder (the one the browser bridge applies),
so the number Ask says is the page's number by construction. Seven pull requests, each a pure move proven by the
existing route tests plus a query-log assertion, each branched from `main` after the previous merged.

**Tech stack:** pnpm monorepo, TypeScript 5.9, Next 16 route handlers (`read()` from `server/route.ts`), Supabase
under RLS through the session client, zod, `node --test` over `tooling/scripts/tests/_fake-db.mjs` (a database in
memory that logs every query in `supabase.seen`), committed package dists. Runner flags for any suite that imports
`.ts`: `node --conditions=react-server --import tsx --test <files>`.

---

## Where this fits, and what the code map found

The spec (`docs/superpowers/specs/2026-09-25-ask-rewired-design.md`, §5.1 and §9 Phase 1) was written before the
read layer was mapped file by file. The map (read at `origin/main` `e562b350`, 25 Sep 2026 evening) corrects three
things this plan takes as given:

1. **GET routes return DTOs; the browser builds the view models.** No `/api/v1` route calls a `to*VM(` builder; the
   bridge (`apps/dashboard/src/legacy-bridge/surface-data.ts`) does, after the fetch. Server-side view models exist
   only inside Ask (`server/ask/tools.ts`, `server/ask/snapshot.ts`). So a reader's `data` is the route's payload,
   and "the tool projects it for the model" means: the tool applies the same contracts builder the bridge applies
   (`toTodayVM`, `toInboxThreadVM`, `toCallVM`, `toPersonVM`, `toReportVM`, …) and projects that. The spec's
   `vm` field is renamed `data` here; PR 1.1 amends the spec's wording.
2. **The byte-equal harness is the route tests over the fake database.** There are no golden files. The route tests
   assert payload pieces with `deepEqual` and read the query log (`ctx.supabase.seen`). Around forty source-text
   pins in `ask.test.mjs`, `calendar-people.test.mjs`, `threads-people.test.mjs` and others scan the route and tool
   files; a pure move breaks them. Each PR converts the pins it breaks into behaviour (a `seen` assertion or a
   reader test) and lets `source-scan-baseline.json` fall; it never adds a scan.
3. **Ask's loaders disagree with the pages in thirteen places** (the ledger below), not three. Routes stay
   byte-equal; **tools become page-equal**, and every divergence closed is a deliberate change named in its PR. The
   snapshot (`server/ask/snapshot.ts`) keeps its own eight queries until Phase 2 replaces it: its block is a cached
   prompt prefix and touching it here changes the prompt for nothing.

### The divergence ledger (tools against the pages, at `e562b350`)

| #   | Tool                | Today                                                                                                                                                      | The page                                                                   | Closed in | Closed by |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- | --------- |
| 1   | get_report          | `report_series` only (`tools.ts:858`); a bad `days` becomes 30                                                                                             | series, then booking line, then deals (`reports/route.ts:43-58`); 400      | PR 1.5    | #1115     |
| 2   | get_today           | `toTodayVM` without the waiting searches (`tools.ts:331`)                                                                                                  | passes them (`surface-data.ts:489-496`)                                    | PR 1.2    | #1101     |
| 3   | get_person          | 9–12 queries in 3–4 rounds, its own smaller DTO (`tools.ts:649-785`)                                                                                       | one round of 18 (`contacts/[id]/route.ts:390-483`), `toPersonVM`           | PR 1.4    | #1113     |
| 4   | get_today           | 40 threads, 600 messages, no id tie-break, a failed calls read is `[]` (`tools.ts:245, 284, 328`)                                                          | 100 threads, 4000 messages paged with tie-break, calls `null`              | PR 1.2    | #1101     |
| 5   | get_thread          | messages without `channel` and `media` (`tools.ts:496-511`), so the window and the wire read as WhatsApp; newest open escalation                           | `conversations/[id]` carries both; the Inbox keeps the oldest escalation   | PR 1.3    | #1110     |
| 6   | list_threads        | never fetches escalated threads outside the newest 40                                                                                                      | the Inbox fetches them by `?ids=` (`surface-data.ts:391-400`)              | PR 1.2    | #1101     |
| 7   | search_people       | the whole pool in memory, matched on the first name only, ≥4 digits, JS order, 3 states (`tools.ts:600-647`)                                               | one SQL page with `p_query` (`contacts/route.ts:35-38`), 7 states          | PR 1.6    | #1118     |
| 8   | list_calls          | re-reads `tenantFacts` (`tools.ts:789`); today/missed filters over the newest 40                                                                            | GET calls: 100 newest                                                      | PR 1.2    | #1101     |
| 9   | list_audiences      | offers hidden templates (`tools.ts:969-975`)                                                                                                               | the composer filters `hidden_at` (`templates/route.ts:85`)                 | PR 1.6    | #1118     |
| 10  | list_playbooks      | pool rows for the asking member, the week's touches ignored, follow-ups read where deals are off (`tools.ts:1076-1092`)                                    | counts with no viewer, touches applied (`playbooks.ts:301-321`)            | PR 1.6    | #1118     |
| 11  | get_calendar        | `tenantFacts` twice, a one-day span from today, never adds people (`tools.ts:1186-1204`)                                                                   | a week from Monday; adds people when the caller may act                    | PR 1.5    | #1115     |
| 12  | list_lead_searches  | raw view rows, no counts (`tools.ts:1244-1266`)                                                                                                            | `searchesOf`: `toSearchDto` plus the six counts                            | PR 1.7    | this PR   |
| 13  | get_openings        | cuts `service` at 80 (`tools.ts:920`)                                                                                                                      | 160 (`ask/openings/route.ts:24`)                                           | PR 1.5    | #1115     |
| 14  | list_audiences      | offered templates the composer withholds as unsendable: a picture heading, or a value in a heading or a button, which the wire refuses (`tools.ts:842-849` at `4b4637df`) | offers `sendableTemplates` of them and says why (`broadcasts-real.jsx:165-171`); its further filter, every slot a broadcast can fill (`bcSlots`), stays open | PR 1.7    | this PR   |

Plus the repeated reads: `tenantFacts` up to five times a turn (`api/ask/route.ts:163`; `tools.ts:789, 881, 1074,
1186`; `calendar.ts:166, 332`; `openings.ts:194`), `sellsByOf` and `listPolicies` three to four times, `tenant_config`
read ad hoc in six places. PR 1.1 closes those.

## Decisions this plan takes (Ruben may overrule any; each names its PR)

| #   | Decision                                                | Taken as                                                                                                                                                                                                                                             | PR       |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D1  | What a reader returns                                   | `{ data, rows, stamp }` where `data` is the route's payload today, key for key; `rows` the row references (kind, id, route, label) the tool adds to the read set                                                                                      | 1.1      |
| D2  | The per-turn memo                                       | `TurnCache.get(rc, reader, args)`, keyed by reader name and the arguments' stable JSON; a rejected read is dropped from the cache (today's `memoised` kept failures for the whole turn)                                                                | 1.1      |
| D3  | The cross-turn cache                                    | Only readers that declare `ttlMs` go through it; in Phase 1 that is `facts` (the tenant's name and zone, five minutes); keyed by workspace and person; FIFO cap 500 like the snapshot's. Everything per person, per clock or with a side effect stays per turn | 1.1      |
| D4  | Where the reader context comes from                     | `readerContext(ctx, member)` in a route; Ask's `ToolContext` carries one (`t.rc`) built by the Ask route and handed through `runAskTurn`, so the route's own facts read and the tools' share one turn cache                                            | 1.1      |
| D5  | Routes are byte-equal, tools are page-equal             | A route's handler body moves verbatim; its tests pass unchanged and one query-log assertion per moved route pins what it reads. A tool reads the reader and applies the bridge's builder; each closed divergence is named in the PR                    | all      |
| D6  | Source pins                                             | A pin a move breaks is converted to a `seen` assertion or a reader test in the same PR; `source-scan-baseline.json` only falls; no PR adds a `readCode(` scan                                                                                         | all      |
| D7  | GETs with side effects                                  | The calendar's `addPeopleSeen` (a write inside `calendarWeek`) stays in the route, outside the reader; `lead-suggestions` (a model call and a write) is not a reader; export routes are untouched                                                      | 1.5      |
| D8  | Validation stays in the route                           | zod queries and `AppError` refusals stay where they are; a reader takes parsed arguments. A tool validates its own input and answers `{ error }` as today                                                                                             | all      |
| D9  | The snapshot                                            | Untouched (its queries and its 20 s cache) until Phase 2 replaces it; only its `tenantFacts` path benefits from the turn cache through `get_person` and `sellsByOf`                                                                                    | –        |
| D10 | Order                                                   | Kernel and facts; the day; the thread and the call; the person; reports, calendar, openings; people, lists, audiences, playbooks, broadcasts; settings, connections, notifications, activity, channels, policies, searches. Value first: the turn's first round reads the day | –        |

## How every PR is proven (the same six checks, named once)

1. `corepack pnpm --filter "./packages/*" build && git add -A && node tooling/scripts/check-dist.mjs` prints
   "dist in sync with src" (only PRs that touch `packages/`; Phase 1 should touch none, so this is a guard).
2. `corepack pnpm -r typecheck` prints no `error TS`.
3. `corepack pnpm lint` shows 0 errors.
4. `corepack pnpm test` shows 0 fail. The route tests of every moved route pass **unchanged** (not edited, except
   where a source pin is converted, which is a separate commit in the same PR titled "Pins to behaviour: …").
5. The pure-move proof in the PR description: for each moved route, `git diff origin/main -- <route> <reader>`
   shows the handler body removed from one file and added to the other with no other change than indentation, the
   import lines and the `return`; and the model request block in `loop.ts` is untouched
   (`git diff origin/main -- apps/dashboard/src/server/ask/loop.ts` shows only what the PR names).
6. `node tooling/scripts/gen-route-types.mjs --check` prints "route types: current" (a reader must not change a
   route's `OutputOf`).

Each PR: its own worktree from `origin/main` (`git worktree add ../cm-ask-1-<n> -b ask-rewired/1-<n>-<name> origin/main`,
then `corepack pnpm install --frozen-lockfile --prefer-offline`), one implementer per task group, one combined review
round, fix, squash-merge on green, worktree removed. Before every push: `git fetch origin main`, rebase, and check
`git diff origin/main --stat` lists only this PR's files (another session's fetch moves the shared `origin/main` ref
under you).

---

# PR 1.1 · The reader kernel, and the facts read once

**Branch:** `ask-rewired/1-1-kernel`. **Files created:** `apps/dashboard/src/server/readers/index.ts`,
`apps/dashboard/src/server/readers/facts.ts`, `tooling/scripts/tests/readers.test.mjs`. **Modified:**
`apps/dashboard/src/server/ask/tools.ts` (ToolContext gains `rc`; four `tenantFacts` reads and the config/policies/
sells-by reads go through the readers), `apps/dashboard/src/server/ask/loop.ts` (`TurnInput.rc`),
`apps/dashboard/app/api/v1/ask/route.ts` (builds the context, reads through it), `tooling/scripts/tests/ask.test.mjs`
(two pins), `docs/superpowers/specs/2026-09-25-ask-rewired-design.md` (§5.1 wording, §9 Phase 1).

### Task 1: The kernel

**Files:**

- Create: `apps/dashboard/src/server/readers/index.ts`
- Test: `tooling/scripts/tests/readers.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tooling/scripts/tests/readers.test.mjs`:

```js
/**
 * The reader kernel (Ask Rewired Phase 1, spec 5.1): one read per turn per
 * reader and arguments, a failure never kept, the tenant's facts kept across
 * turns for five minutes per workspace and person, and the reader context a
 * route or a turn builds. Executed over the database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { facts, sellsBy, policies, config } = await import(at("apps/dashboard/src/server/readers/facts.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "u1";
const ctxFor = (tables) => ({ supabase: fakeDb(tables, {}), userId: USER, email: "ada@example.com", metadata: {} });
const tables = () => ({
  tenants: [
    { id: A, name: "Harbor", timezone: "America/New_York", sells_by: "booking" },
    { id: B, name: "Bayside", timezone: "Europe/Madrid", sells_by: "booking" },
  ],
  tenant_config: [{ tenant_id: A, config: { hours: "9-5" }, version: 3 }],
  policies: [],
});

/** A reader that counts its reads and can be told to fail. */
const counting = (name, opts = {}) => {
  const r = {
    name,
    reads: 0,
    ...(opts.ttlMs ? { ttlMs: opts.ttlMs } : {}),
    async read(rc, args) {
      r.reads++;
      if (opts.fail && r.reads === 1) throw new Error("first read fails");
      return { data: { args, tenant: rc.tenantId }, rows: [{ kind: "page", id: "today", route: "today", label: "Today" }], stamp: Date.now() };
    },
  };
  return r;
};

test("stableJson: the same arguments in any key order are one key; undefined is its own key", () => {
  assert.equal(kernel.stableJson({ b: 1, a: [2, { d: 1, c: 2 }] }), kernel.stableJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  assert.notEqual(kernel.stableJson({ a: 1 }), kernel.stableJson({ a: 2 }));
  assert.equal(kernel.stableJson(undefined), "");
});

test("a turn reads a reader once per arguments: the same call again is the same promise, other arguments read again, and a read that failed is not kept", async () => {
  const rc = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "operator" });
  const r = counting("r");
  const a = kernel.load(rc, r, { days: 7 });
  const b = kernel.load(rc, r, { days: 7 });
  assert.equal(a, b, "the same promise");
  assert.deepEqual((await a).data, { args: { days: 7 }, tenant: A });
  await kernel.load(rc, r, { days: 30 });
  assert.equal(r.reads, 2, "other arguments are another read");
  const f = counting("f", { fail: true });
  await assert.rejects(kernel.load(rc, f, undefined), /first read fails/);
  const again = await kernel.load(rc, f, undefined);
  assert.deepEqual([f.reads, again.data.tenant], [2, A], "the failure was not kept: the second call read again");
  const other = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "operator" });
  await kernel.load(other, r, { days: 7 });
  assert.equal(r.reads, 3, "another turn is another read");
});

test("a reader with a ttl is kept across turns on this instance, per workspace and person, until the ttl; a failure is not kept; the cache is bounded", async () => {
  kernel.readerCache.clear();
  const r = counting("kept", { ttlMs: 60_000 });
  const t1 = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" });
  const t2 = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" });
  await kernel.load(t1, r, undefined);
  await kernel.load(t2, r, undefined);
  assert.equal(r.reads, 1, "the second turn read the kept value");
  const elsewhere = kernel.readerContext(ctxFor(tables()), { tenantId: B, role: "owner" });
  await kernel.load(elsewhere, r, undefined);
  assert.equal(r.reads, 2, "another workspace is another entry");
  const someoneElse = kernel.readerContext({ ...ctxFor(tables()), userId: "u2" }, { tenantId: A, role: "owner" });
  await kernel.load(someoneElse, r, undefined);
  assert.equal(r.reads, 3, "another person is another entry");
  kernel.readerCache.clear();
  const f = counting("kept-fail", { ttlMs: 60_000, fail: true });
  await assert.rejects(kernel.load(t1, f, undefined));
  await kernel.load(t2, f, undefined);
  assert.equal(f.reads, 2, "a failed read is not kept");
  kernel.readerCache.clear();
  const now = Date.now();
  const stale = counting("stale", { ttlMs: 10 });
  const old = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }, new Date(now));
  await kernel.load(old, stale, undefined);
  await new Promise((res) => setTimeout(res, 15));
  await kernel.load(kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "owner" }), stale, undefined);
  assert.equal(stale.reads, 2, "past the ttl the value is read again");
  assert.equal(kernel.READER_CACHE_CAP, 500);
});

test("the facts readers: the tenant's name and zone are read once and kept; sells_by, the policies and the config are read once per turn; each answers the row's fields and nothing else", async () => {
  kernel.readerCache.clear();
  const ctx = ctxFor(tables());
  const rc = kernel.readerContext(ctx, { tenantId: A, role: "operator" });
  const [f, s, p, c] = await Promise.all([
    kernel.load(rc, facts, undefined),
    kernel.load(rc, sellsBy, undefined),
    kernel.load(rc, policies, undefined),
    kernel.load(rc, config, undefined),
  ]);
  assert.deepEqual(f.data, { name: "Harbor", timezone: "America/New_York" });
  assert.equal(s.data, "booking");
  assert.deepEqual(p.data, []);
  assert.deepEqual(c.data, { config: { hours: "9-5" }, version: 3 });
  await Promise.all([kernel.load(rc, facts, undefined), kernel.load(rc, config, undefined)]);
  const reads = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
  assert.deepEqual([reads("tenants"), reads("tenant_config")], [2, 1], "tenants once for facts and once for sells_by; the config once");
  const later = kernel.readerContext(ctxFor(tables()), { tenantId: A, role: "operator" });
  const f2 = await kernel.load(later, facts, undefined);
  assert.deepEqual(f2.data, f.data);
  assert.equal(later.ctx.supabase.seen.filter((q) => q.table === "tenants").length, 0, "the next turn's facts came from the kept value");
  const none = kernel.readerContext(ctxFor({ tenants: [], tenant_config: [], policies: [] }), { tenantId: B, role: "viewer" });
  assert.deepEqual((await kernel.load(none, facts, undefined)).data, { name: "Workspace", timezone: "America/New_York" }, "tenantFacts' own defaults");
  assert.equal((await kernel.load(none, config, undefined)).data, null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/readers.test.mjs`
Expected: FAIL — cannot find `apps/dashboard/src/server/readers/index.ts`.

- [ ] **Step 3: Write the kernel**

Create `apps/dashboard/src/server/readers/index.ts`:

```ts
import "server-only";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";

/**
 * One read layer (Ask Rewired, spec 5.1).
 *
 * A reader is a named function of the request context and typed arguments
 * that returns what the page's route answers (`data`, key for key), the rows
 * it touched as references a citation may name, and a freshness stamp. The
 * GET routes, Ask's tools and, from Phase 2, the context providers all read
 * through here, so the number Ask says is the number the page shows by
 * construction. The repositories in packages/db and the view models in
 * packages/contracts stay where they are; readers compose them, and a tool
 * applies the page's own view-model builder to `data`.
 *
 * Two caches. The TurnCache memoises by reader and arguments for the life of
 * one turn or one request (the memo that lived in Ask's ToolContext,
 * generalised; a failure is never kept). The ReaderCache keeps a reader that
 * declares `ttlMs` across turns on this instance, per workspace and person;
 * in Phase 1 only the tenant's name and zone do.
 */

/** The kinds a row may be cited as (contracts AskReadSet) and a page. Phase 4 grows this to twelve. */
export type RowKind = "thread" | "conversation" | "call" | "person" | "page";

export interface RowRef {
  kind: RowKind;
  id: string;
  /** Where it opens, as the page opens it. */
  route: string;
  label: string;
}

export interface Read<T> {
  data: T;
  rows: RowRef[];
  /** When it was read (Date.now()). */
  stamp: number;
}

export interface Reader<A, T> {
  /** Unique in the directory: the first half of every cache key. */
  name: string;
  read(rc: ReaderContext, args: A): Promise<Read<T>>;
  /** Kept across turns on this instance for this long, per workspace and person. Unset: per turn only. */
  ttlMs?: number;
}

export interface ReaderContext {
  ctx: RouteContext;
  tenantId: string;
  userId: string;
  role: Member["role"];
  /** The turn's clock: every reader that says "today" says this day. */
  now: Date;
  turn: TurnCache;
}

/** The arguments as one key: the same fields in any order are the same key; undefined is the empty key. */
export function stableJson(v: unknown): string {
  if (v === undefined) return "";
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val as Record<string, unknown>).sort().map((k) => [k, (val as Record<string, unknown>)[k]]))
      : val,
  );
}

export const READER_CACHE_CAP = 500;

/** Across turns, per instance: only readers with a ttl, keyed by workspace, person, reader and arguments. */
class ReaderCache {
  private readonly kept = new Map<string, { at: number; read: Promise<Read<unknown>> }>();

  get<A, T>(rc: ReaderContext, r: Reader<A, T>, args: A, key: string): Promise<Read<T>> {
    const k = `${rc.tenantId}|${rc.userId}|${key}`;
    const had = this.kept.get(k);
    if (had && Date.now() - had.at < (r.ttlMs ?? 0)) return had.read as Promise<Read<T>>;
    const read = r.read(rc, args);
    this.kept.set(k, { at: Date.now(), read });
    // A failure is not a fact: the next turn reads again.
    read.catch(() => {
      if (this.kept.get(k)?.read === read) this.kept.delete(k);
    });
    // Bounded first-in-first-out, as the snapshot's cache is.
    if (this.kept.size > READER_CACHE_CAP) this.kept.delete(this.kept.keys().next().value as string);
    return read;
  }

  clear(): void {
    this.kept.clear();
  }
}

export const readerCache = new ReaderCache();

/** One turn's reads, by reader and arguments: the same rows are never fetched twice in a turn. */
export class TurnCache {
  private readonly hits = new Map<string, Promise<Read<unknown>>>();

  get<A, T>(rc: ReaderContext, r: Reader<A, T>, args: A): Promise<Read<T>> {
    const key = `${r.name}:${stableJson(args)}`;
    const had = this.hits.get(key) as Promise<Read<T>> | undefined;
    if (had) return had;
    const read = r.ttlMs ? readerCache.get(rc, r, args, key) : r.read(rc, args);
    this.hits.set(key, read);
    // memoised() in tools.ts kept a rejection for the whole turn, so a read
    // that failed once failed on every later call. Not here.
    read.catch(() => {
      if (this.hits.get(key) === read) this.hits.delete(key);
    });
    return read;
  }
}

/** Read through the turn's cache. The one call every route, tool and provider makes. */
export function load<A, T>(rc: ReaderContext, r: Reader<A, T>, args: A): Promise<Read<T>> {
  return rc.turn.get(rc, r, args);
}

/** The context a route builds from its resolved membership, or a turn from its own. */
export function readerContext(
  ctx: RouteContext,
  member: Pick<Member, "tenantId" | "role">,
  now: Date = new Date(),
): ReaderContext {
  return { ctx, tenantId: member.tenantId, userId: ctx.userId, role: member.role, now, turn: new TurnCache() };
}

/** A stamp for a read made now. */
export const stamp = (): number => Date.now();
```

- [ ] **Step 4: Write the facts readers**

Create `apps/dashboard/src/server/readers/facts.ts`:

```ts
import "server-only";
import { listPolicies } from "@chanlytics/db";
import { tenantFacts } from "../tenant";
import { sellsByOf } from "../deals";
import { stamp, type Reader } from "./index";

/**
 * The workspace's facts, read once.
 *
 * A turn used to read the tenant's name and zone up to five times (the Ask
 * route, list_calls, list_playbooks, get_calendar and the calendar itself),
 * sells_by three or four times and the policies twice. Each is one reader
 * now: the facts are kept five minutes across turns (they change by a
 * settings save nobody makes twice a day); the rest are read once per turn,
 * because a settings change must reach the very next question.
 */

export const facts: Reader<undefined, { name: string; timezone: string }> = {
  name: "facts",
  ttlMs: 5 * 60_000,
  async read(rc) {
    return { data: await tenantFacts(rc.ctx.supabase, rc.tenantId), rows: [], stamp: stamp() };
  },
};

export const sellsBy: Reader<undefined, Awaited<ReturnType<typeof sellsByOf>>> = {
  name: "sellsBy",
  async read(rc) {
    return { data: await sellsByOf(rc.ctx, rc.tenantId), rows: [], stamp: stamp() };
  },
};

export const policies: Reader<undefined, Awaited<ReturnType<typeof listPolicies>>> = {
  name: "policies",
  async read(rc) {
    return { data: await listPolicies(rc.ctx.supabase, rc.tenantId), rows: [], stamp: stamp() };
  },
};

export const config: Reader<undefined, { config: unknown; version: number } | null> = {
  name: "config",
  async read(rc) {
    const { data, error } = await rc.ctx.supabase
      .from("tenant_config")
      .select("config, version")
      .eq("tenant_id", rc.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { data: data ? { config: data.config, version: data.version } : null, rows: [], stamp: stamp() };
  },
};
```

If `sellsByOf`'s first parameter is typed narrower than `RouteContext` (the map says `Pick<RouteContext, "supabase">`),
`rc.ctx` satisfies it; if `listPolicies` is exported under another name from `@chanlytics/db`, use the name
`api/ask/route.ts` imports.

- [ ] **Step 5: Run the test, typecheck**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/readers.test.mjs && corepack pnpm --filter @chanlytics/dashboard typecheck`
Expected: PASS (4 tests); no `error TS`. If the fake database does not accept `.select("config, version")` with
`.maybeSingle()` the way the tools' read does, read `_fake-db.mjs` and match what `tools.ts:882` already does.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/server/readers/index.ts apps/dashboard/src/server/readers/facts.ts tooling/scripts/tests/readers.test.mjs
git commit -m "The reader kernel: one read per turn per reader and arguments, the facts kept five minutes"
```

### Task 2: The Ask turn reads its facts through the readers, once

**Files:**

- Modify: `apps/dashboard/src/server/ask/tools.ts` (`ToolContext`, `newToolContext`, the reads at ~789, ~881, ~1074, ~1186)
- Modify: `apps/dashboard/src/server/ask/loop.ts` (`TurnInput.rc`, the `newToolContext` call at ~185)
- Modify: `apps/dashboard/app/api/v1/ask/route.ts` (the four parallel reads at ~163-167)
- Modify: `tooling/scripts/tests/ask.test.mjs` (the two pins on the route's text, ~1179-1236)
- Test: `tooling/scripts/tests/ask-shape.test.mjs` (a new test), `tooling/scripts/tests/ask-turn.test.mjs` (unchanged, must pass)

- [ ] **Step 1: Write the failing test**

Append to `tooling/scripts/tests/ask-shape.test.mjs` (it already drives the Ask route with scripted ports and has
`routeTables`, `post`, `ctxFor`, `askRoute`, `setAskPorts`, `ROUND`, `text`, `answerJson`):

```js
test("one turn reads the workspace's facts once: the route's own read and the tools' reads share the turn cache (tenants, tenant_config, policies each once)", async () => {
  const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
  readerCache.clear();
  const tables = routeTables();
  const written = answerJson("Hours are nine to five.");
  // The model calls get_settings and list_calls in one round, then answers.
  let rounds = 0;
  setAskPorts({
    round: async (call, onText) => {
      rounds++;
      if (rounds === 1)
        return ROUND([
          { type: "tool_use", id: "t-get_settings", name: "get_settings", text: "", json: "{}" },
          { type: "tool_use", id: "t-list_calls", name: "list_calls", text: "", json: "{}" },
        ]);
      onText(written);
      return ROUND([text(written)], { stopReason: "end_turn" });
    },
    snapshot: async () => "",
  });
  const ctx = ctxFor(tables);
  try {
    const res = await askRoute.POST.run(post({ text: "what are our hours?", surface: "settings" }), ctx);
    await res.text();
    const selects = (table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select").length;
    assert.equal(selects("tenants"), 2, "name and zone once (facts), sells_by once (sellsBy): the tools re-read neither");
    assert.equal(selects("tenant_config"), 1, "the config once, for the prompt and for get_settings");
    assert.equal(selects("policies"), 1, "the policies once");
  } finally {
    setAskPorts(null);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-shape.test.mjs`
Expected: FAIL — `tenants` is selected three or more times (the route, list_calls, get_settings).

- [ ] **Step 3: The tool context carries a reader context**

In `apps/dashboard/src/server/ask/tools.ts`:

(a) Add the import `import { load, readerContext, type ReaderContext } from "../readers";` and
`import { facts, sellsBy, policies, config } from "../readers/facts";`.

(b) `ToolContext` gains, after `memo`:

```ts
  /** The turn's reader context: every read through the readers shares the route's turn cache. */
  rc: ReaderContext;
```

(c) `newToolContext` takes an optional context and builds one when a caller (a test) hands none:

```ts
export function newToolContext(
  ctx: RouteContext,
  tenantId: string,
  role: ToolContext["role"],
  timezone: string,
  now = new Date(),
  rc: ReaderContext = readerContext(ctx, { tenantId, role }, now),
): ToolContext {
  return { ctx, tenantId, role, timezone, read: emptyReadSet(), now, memo: new Map(), rc };
}
```

(d) Replace the four direct facts reads:

- `listCalls` (~789): `const { timezone } = await tenantFacts(supabase, t.tenantId);` (or whatever it reads the zone
  with) → `const { timezone } = (await load(t.rc, facts, undefined)).data;`. If the function only needs `t.timezone`
  (the map says the context already carries it), use `t.timezone` and delete the read.
- `getSettings` (~880-886): the five parallel reads become

```ts
  const [f, cfg, pols, channels, buys] = await Promise.all([
    load(t.rc, facts, undefined).then((r) => r.data),
    load(t.rc, config, undefined).then((r) => r.data),
    load(t.rc, policies, undefined).then((r) => r.data),
    supabase.from("tenant_channels").select(/* exactly what it selects today */),
    load(t.rc, sellsBy, undefined).then((r) => r.data),
  ]);
```

  keeping the channels read as it is (it becomes a reader in PR 1.7) and every later line that used the old
  variables reading from these (the config read used `config, version`: `cfg?.config`, `cfg?.version`).

- `listPlaybooks` (~1074-1075): `tenantFacts(...)` → `load(t.rc, facts, undefined).then((r) => r.data)`,
  `listPolicies(...)` → `load(t.rc, policies, undefined).then((r) => r.data)`.
- `getCalendar` (~1186): `tenantFacts(...)` → `load(t.rc, facts, undefined).then((r) => r.data)`. (`calendarWeek`'s own
  read inside `calendar.ts:332` stays until PR 1.5.)

Delete the now-unused `tenantFacts`/`listPolicies`/`sellsByOf` imports if nothing else in the file uses them
(`get_person` at ~691 still calls `sellsByOf`: change it to `load(t.rc, sellsBy, undefined).then((r) => r.data)` too).

- [ ] **Step 4: The loop hands the route's context through**

In `apps/dashboard/src/server/ask/loop.ts`: `TurnInput` gains `/** The route's reader context, so the turn's reads share
its cache; a test may omit it. */ rc?: ReaderContext;` (import the type from `../readers`), and the line
`const tc: ToolContext = newToolContext(input.ctx, input.tenantId, input.role, input.timezone, now);` becomes
`const tc: ToolContext = newToolContext(input.ctx, input.tenantId, input.role, input.timezone, now, input.rc);`.

- [ ] **Step 5: The route reads through the same context**

In `apps/dashboard/app/api/v1/ask/route.ts`, the block

```ts
    const [{ name, timezone }, cfg, policies, sellsBy] = await Promise.all([
      tenantFacts(ctx.supabase, tenantId),
      ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
      // The autonomy modes ride in the stable block, so "what can the receptionist do alone" needs no read.
      listPolicies(ctx.supabase, tenantId).catch(() => []),
      sellsByOf(ctx, tenantId),
    ]);
    if (cfg.error) throw new Error(cfg.error.message);
```

becomes

```ts
    const rc = readerContext(ctx, member);
    const [{ name, timezone }, cfg, policies, sellsBy] = await Promise.all([
      load(rc, readers.facts, undefined).then((r) => r.data),
      load(rc, readers.config, undefined).then((r) => r.data),
      // The autonomy modes ride in the stable block, so "what can the receptionist do alone" needs no read.
      load(rc, readers.policies, undefined).then((r) => r.data, () => []),
      load(rc, readers.sellsBy, undefined).then((r) => r.data),
    ]);
```

with `import { load, readerContext } from "@/server/readers"; import * as readers from "@/server/readers/facts";`
replacing the `tenantFacts`, `listPolicies` and `sellsByOf` imports; and every later use of `cfg.data?.config`
becomes `cfg?.config`. Pass `rc` into `runAskTurn({ ..., rc })`. The failed-config throw is now the reader's
(`throw new Error(error.message)`), the same sentence.

- [ ] **Step 6: The pins**

In `tooling/scripts/tests/ask.test.mjs`, the "speed pass" test (~line 1188) pins the route's text:
`route.includes("listPolicies(ctx.supabase, tenantId).catch(() => [])") && route.includes("cfg.data?.config ?? null, offered)")`.
Replace that assertion with:

```js
  assert.ok(
    route.includes("load(rc, readers.policies, undefined).then((r) => r.data, () => [])") &&
      route.includes("cfg?.config ?? null, offered)"),
    "the policies still ride in the stable block, read through the turn's cache and tolerated when they fail",
  );
```

(The `seen` test in Step 1 is the behavioural pin; this text pin replaces an older text pin one for one, so the
ratchet does not rise.)

- [ ] **Step 7: Run the Ask suites and typecheck**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/readers.test.mjs tooling/scripts/tests/ask-shape.test.mjs tooling/scripts/tests/ask-turn.test.mjs tooling/scripts/tests/ask-routes.test.mjs tooling/scripts/tests/ask.test.mjs tooling/scripts/tests/ask-model.test.mjs && corepack pnpm --filter @chanlytics/dashboard typecheck`
Expected: PASS, 0 fail; no `error TS`. `ask-turn.test.mjs`'s fourteen-tool test must pass unchanged: no tool's
output moved in this PR.

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/src/server/ask/tools.ts apps/dashboard/src/server/ask/loop.ts apps/dashboard/app/api/v1/ask/route.ts tooling/scripts/tests/ask.test.mjs tooling/scripts/tests/ask-shape.test.mjs
git commit -m "The Ask turn reads its facts once: the route and the tools share one turn cache"
```

### Task 3: The spec says what the map found

**Files:** Modify `docs/superpowers/specs/2026-09-25-ask-rewired-design.md`.

- [ ] **Step 1: Amend §5.1** — replace the sentence "The route serialises the view model; the tool projects it for the
model; the provider folds it into the block." with: "A reader's `data` is what the page's route answers today (the
DTO the browser builds its view model from), key for key, so a route that reads through a reader answers the same
bytes; a tool applies the page's own view-model builder to it and projects that; a provider folds it into the block."
Rename `vm` to `data` in the §5.1 code block and the `Read<T>` interface.

- [ ] **Step 2: Amend §9 Phase 1** — replace the Phase 1 paragraph with: "**Phase 1 · One read layer** (seven PRs; plan
`2026-09-25-ask-rewired-1-readers.md`). `server/readers/` with RowRefs and the two caches (the cross-turn cache
holds the tenant's facts only until Phase 2); the `/api/v1` GET routes Ask's world reads become one-liners over
their readers, byte-equal (their tests unchanged, a query-log pin each); every Ask tool reads the reader and applies
the page's builder, so thirteen named divergences close on purpose; `tenantFacts`, `sells_by`, the policies and the
config read once a turn. The snapshot keeps its queries until Phase 2 replaces it. No migration. **Proof:** route
tests unchanged and a pure-move diff per route; `ask-turn`'s tool test updated only where a divergence is named;
the eval set holds. This phase ships nothing else."

- [ ] **Step 3: Commit** `git add docs/superpowers/specs/2026-09-25-ask-rewired-design.md && git commit -m "The spec says what the read-layer map found: readers answer the page's DTO; Phase 1 is seven pure moves"`

### Task 4: Gates and the PR

- [ ] The six checks. Then push and open the PR:

```
Ask Rewired, Phase 1.1: the reader kernel, and the facts read once

Spec §5.1, plan PR 1.1. What changes for a customer: nothing. A turn reads the workspace's name and zone, its
sells_by, its policies and its config once instead of up to five times; the model request is byte-identical
(the loop's request block is untouched). What to set before merging: nothing. Deploy order: either.
```

One combined review round, fix, squash-merge on green.

---

# PR 1.2 · The day: metrics, conversations, escalations, calls, searches, and Today for Ask

**Branch:** `ask-rewired/1-2-the-day`. **Created:** `readers/metrics.ts`, `readers/conversations.ts`,
`readers/escalations.ts`, `readers/calls.ts`, `readers/searches.ts`, `readers/inbox.ts`, `readers/today.ts`.
**Modified:** the five routes (`api/v1/metrics`, `conversations`, `escalations`, `calls`, `lead-searches` GET),
`server/ask/tools.ts` (`get_today`, `list_threads`, `list_calls`; `loadConversations`/`loadCalls` deleted; `memo`
kept for the audience pool alone), `ask.test.mjs` (two pins become one), `ask-turn.test.mjs` (a behavioural pin),
`readers.test.mjs`, `workspace-scoping.test.mjs` (a source pin the move broke, converted to behaviour).

### Task 5: The five readers, each the route's body

- [ ] **Step 1: Write the failing tests.** Append to `readers.test.mjs` one test per reader that calls it over a
fixture and checks (a) `data` deep-equals what the route test for that route asserts today (copy the fixture and the
expected payload from the route test named in the map: `ask-routes.test.mjs:404` for metrics, `reads-routes.test.mjs:99`
and `inbox-server.test.mjs:152,178` for conversations, `inbox-routes.test.mjs:180` escalations, `:231` calls,
`lead-routes.test.mjs:1103` searches) and (b) `rows` lists every conversation as `{ kind: "thread", id, route:
\`inbox/th-${id}\`, label: <who> }` and every call as `{ kind: "call", id, route: \`conversations/cv-${id}\` }`, and
`searches` as `[]` (a search is not citable until Phase 4).

- [ ] **Step 2: Create the readers.** Each file holds the route's handler body verbatim, from its first read to its
`return`, with `ctx.supabase` → `rc.ctx.supabase`, `member.tenantId` → `rc.tenantId`, `userId` → `rc.userId`, the
parsed query as the arguments, and the `return { … }` wrapped as `{ data: { … }, rows, stamp: stamp() }`:

```ts
// apps/dashboard/src/server/readers/metrics.ts
import "server-only";
import { AppError, type MetricsSummaryDto } from "@chanlytics/contracts";
import { metricsSummaryFor } from "../metrics";
import { stamp, type Reader } from "./index";

/** GET metrics?days=N, as the route answers it: the numbers behind Today, on every wire. */
export const metrics: Reader<{ days: number }, { metrics: MetricsSummaryDto; workspaceId: string }> = {
  name: "metrics",
  async read(rc, { days }) {
    // The function answers the routing rows; the workspace's email line is
    // added beside them (server/metrics.ts), so Today counts every wire.
    const m = await metricsSummaryFor(rc.ctx.supabase, rc.tenantId, days);
    if (!m) throw new AppError("not_found", "Workspace metrics unavailable.", 404);
    return { data: { metrics: m, workspaceId: rc.tenantId }, rows: [], stamp: stamp() };
  },
};
```

```ts
// apps/dashboard/src/server/readers/conversations.ts
import "server-only";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";
import { CONVERSATION_COLUMNS, MESSAGE_COLUMNS, groupMessages, toConversationDto, type MessageRow } from "../dto";
import { stamp, type Reader, type RowRef } from "./index";

/** The most rows PostgREST answers for one select (supabase config max_rows): a longer read pages. */
const PAGE = 1000;
/** The Inbox's messages across the threads it shows, newest first. */
const MESSAGES_MAX = 4000;

/** Who a thread is with, as the Inbox row says it (the same fields toInboxThreadVM reads first). */
const whoOf = (c: ConversationDto): string =>
  c.contact.display_name || c.contact.wa_profile_name || c.contact.phone_e164 || c.contact.email || "Someone";

/**
 * GET conversations, as the route answers it: the hundred most recent
 * conversations of the workspace with their recent messages, as the Inbox
 * draws them, or the ones `ids` names (already validated by the route).
 */
export const conversations: Reader<{ ids: string[] | null }, { conversations: ConversationDto[] }> = {
  name: "conversations",
  async read(rc, { ids: asked }) {
    const { supabase } = rc.ctx;
    const base = supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", rc.tenantId);
    const { data: convs, error } = await (asked
      ? base.in("id", asked)
      : base.order("last_message_at", { ascending: false, nullsFirst: false }).limit(100));
    if (error) throw new Error(error.message);
    const ids = (convs ?? []).map((c) => c.id);
    let byConv = new Map<string, MessageDto[]>();
    if (ids.length) {
      // Paged: PostgREST answers a thousand rows whatever a select asks for (I5). The id breaks ties.
      const rows: MessageRow[] = [];
      for (let from = 0; from < MESSAGES_MAX; from += PAGE) {
        const { data: page, error: merr } = await supabase
          .from("messages")
          .select(MESSAGE_COLUMNS)
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, Math.min(from + PAGE, MESSAGES_MAX) - 1);
        if (merr) throw new Error(merr.message);
        rows.push(...((page ?? []) as MessageRow[]));
        if ((page ?? []).length < PAGE) break;
      }
      byConv = groupMessages(rows);
    }
    const list: ConversationDto[] = (convs ?? []).map((c) => toConversationDto(c, byConv.get(c.id) ?? [], rc.userId));
    const rows: RowRef[] = list.map((c) => ({ kind: "thread", id: c.id, route: `inbox/th-${c.id}`, label: whoOf(c) }));
    return { data: { conversations: list }, rows, stamp: stamp() };
  },
};
```

(Read `toInboxThreadVM` in `packages/contracts/src/viewmodels.ts:710` for the exact `who` expression and use the same
fields in the same order in `whoOf`; if a `personName`/`whoOf` helper already exists in contracts, import it instead.)

`escalations.ts` (`Reader<{ state: string }, { escalations: Array<EscalationDto & { conversation_id: string }> }>`,
rows `[]`), `calls.ts` (`Reader<{ conversationId?: string; status?: string }, { calls: CallDto[] }>`, rows one
`{ kind: "call", id, route: \`conversations/cv-${id}\`, label: <caller_name or from_e164> }` per call) and
`searches.ts` (`Reader<undefined, Awaited<ReturnType<typeof searchesOf>>>` over `searchesOf(rc.ctx, rc.tenantId)`,
rows `[]`) follow the same shape, each the route body verbatim.

- [ ] **Step 3: The routes become one line each.** `metrics/route.ts`'s handle becomes

```ts
  handle: async ({ ctx, member, input }) => {
    const days = Math.min(90, Math.max(1, Number(input.days ?? 1) || 1));
    return (await load(readerContext(ctx, member), metrics, { days })).data;
  },
```

`conversations/route.ts` keeps its `ids` parsing and the two `AppError`/`requireUuid` refusals, then
`return (await load(readerContext(ctx, member), conversations, { ids: asked })).data;`. `escalations`, `calls`
(`{ conversationId: input.conversation_id ? requireUuid(...) : undefined, status: input.status }`) and `lead-searches`
GET (`load(readerContext(ctx, member), searches, undefined)`) likewise. Every constant the body used moves with it;
the route keeps only zod, validation and the one line. Its header comment stays.

- [ ] **Step 4: Run the route tests unchanged.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/readers.test.mjs tooling/scripts/tests/ask-routes.test.mjs tooling/scripts/tests/reads-routes.test.mjs tooling/scripts/tests/inbox-server.test.mjs tooling/scripts/tests/inbox-routes.test.mjs tooling/scripts/tests/lead-routes.test.mjs` → PASS with those files untouched.

- [ ] **Step 5: Commit** `git commit -m "Five readers, each a route's body: metrics, conversations, escalations, calls, searches; the routes read through them"`.

### Task 6: The Inbox and Today, for Ask, each as its page composes it

- [ ] **Step 1: The tests.** Append to `readers.test.mjs`, over a fixture with 2 open escalations, one of them on a
conversation not among the newest 100: `inbox`'s `data.conversations` is `[...extra, ...newest]` in the bridge's
order (extra first, `surface-data.ts:402`), and the query log shows `conversations` selected twice (the newest hundred,
then the missing ids) and `messages` per page. `today`'s `data` is `{ metrics, conversations, escalations, calls,
searches }` with the newest hundred alone (the escalation outside them is read, its thread is not); `calls` is `null`
when the calls read throws (a fake-db fault on `calls`) and `searches` is `null` when the searches read throws; and
`inbox` read after `today` in the same turn selects only the missing ids.

- [ ] **Step 2: Two composite readers.** `readers/inbox.ts` is the Inbox's composition (`inboxOverride`), for
`list_threads`: `conversations({ ids: null })` and `escalations({ state: "open" })` at once, then every escalated
conversation outside the hundred in one read by id (`missing.slice(0, 100)`; a failed read is `[]`, logged
`inbox_escalated_fetch_failed` with the count); `data: { conversations: [...extra, ...newest], escalations }`, one
`thread` row per conversation (`whoOf`, exported from `conversations.ts`).

`readers/today.ts` is the Today page's five reads at once (`todayOverride`): `metrics({ days: 1 })`,
`conversations({ ids: null })`, `escalations({ state: "open" })`, `calls({})` and `searches`, the last two `null` on
failure (logged `today_calls_fetch_failed`, `today_searches_fetch_failed`). No fetch by id: the page makes none, and
`toTodayVM` counts an open escalation whose thread it was not handed as a customer waiting, named "Unknown": the
page's number, so Ask's. Every inner read goes through `load(rc, …)`, so when both run in a turn they share the
hundred and the escalations.

- [ ] **Step 3: The three tools read through them.** In `tools.ts`: delete `loadConversations`, `loadConversationsNow`,
`loadCalls`, `CONVERSATIONS`, `MESSAGES`, `memoised` and `EscRow`; the `memo` field stays for the audience pool
(`audiencePoolOnce`, in `tools.ts` and `proposals.ts`). `getToday` becomes:

```ts
async function getToday(t: ToolContext): Promise<unknown> {
  const r = await load(t.rc, today, undefined);
  const { metrics, conversations, escalations, calls, searches } = r.data;
  // The page's own builder, with the waiting searches the page passes (the queue reads them).
  const vm = toTodayVM(metrics, conversations, escalations, calls, t.now, searches);
  for (const x of vm.needsYou?.rows ?? []) t.read.thread.add(x.conversationId);
  for (const x of vm.windowClosing?.rows ?? []) t.read.thread.add(x.id.replace(/^wc-/, ""));
  for (const c of calls ?? []) t.read.call.add(c.id);
  return { /* the projection exactly as today, from `vm` and `metrics` */ };
}
```

`listThreads` reads `const { conversations, escalations } = (await load(t.rc, inbox, undefined)).data;` and keeps its
filter, cap and projection. `recent` alone is sorted newest first by `lastAtMs` (`last_message_at`, the column the
server orders the hundred by) before the cap; every other filter keeps the Inbox's order, the fetched threads first,
so the cap never drops a customer waiting outside the hundred. `listCalls` reads
`(await load(t.rc, calls, {})).data.calls` (a hundred newest, the route's) and uses `t.timezone` for its day filter; no
`tenantFacts`. Nothing else in `tools.ts` called the loaders (`get_call` reads one call by id).

- [ ] **Step 4: The pins.** `ask.test.mjs` ~1035-1046 pins `tools.includes("memo: new Map()") && tools.includes("return memoised(t, \`conversations:${limit}\`")`
and `const CONVERSATIONS = 40;` / `const MESSAGES = 600;` / `!tools.includes(".limit(2000)")`. Replace both assertions
with one: `tools.includes("load(t.rc, today, undefined)") && tools.includes("load(t.rc, inbox, undefined)") &&
!tools.includes("memoised(")`, "the day is read once through the readers". Add the behavioural pin to
`ask-turn.test.mjs` beside the tool test: a turn whose script calls `get_today`, `list_threads` and `list_calls` in one
round selects `conversations` twice at most (the hundred, shared; the missing ids, for the Inbox) and `calls` once
(`ctx.supabase.seen`); `needs_you` lists the fetched thread first and `recent` the newest twenty. The fourteen-tool
test needs no change; the fixture models `lead_list_counts`, so the searches read as `[]` inside a turn.

- [ ] **Step 5: Run** the Ask suites and `ask.test.mjs`; typecheck. **Commit** `"The Inbox and Today for Ask, as the
page composes them: get_today, list_threads and list_calls read the day once through the readers"`.

### Task 7: Gates and the PR

The six checks; the PR names the divergences it closes (#2, #4, #6, #8) and the deliberate change to the tools'
outputs; "what changes for a customer: Ask's Today, threads and calls now read exactly the rows the pages read; the
pages themselves answer the same bytes". One combined review round, fix, squash-merge on green.

---

# PR 1.3 · The thread and the call

**Branch:** `ask-rewired/1-3-thread-call`. **Created:** `readers/conversation.ts` (one thread with its messages: the
body of `api/v1/conversations/[id]/route.ts:25-80`, arguments `{ id, before }`, `rows` the thread and its person),
`readers/call.ts` (one call by id under RLS and the tenant filter, `CALL_COLUMNS` → `toCallDto`; no GET exists, Ask
and Phase 2's focus are its readers; `rows` the call and its person). **Modified:** `conversations/[id]/route.ts`
(the row-scoped route keeps `conversationScope` and becomes one line), `tools.ts` `get_thread` (reads `conversation`
with `more` → `before`/limit as today, and the open escalation from the `escalations` reader picking the same one
the Inbox picks: the last in newest-first order, i.e. the oldest — closes #5, the messages now carry `channel` and
`media`, so `window_open` and `channel` are the page's) and `get_call` (reads `call`). **Tests:** `readers.test.mjs`
two readers over the `inbox-routes.test.mjs:277` fixture; `ask-turn.test.mjs` tool test updated for #5 (a thread on
SMS reports its window by the SMS rule now). **Pins:** none known on these files; run `ask.test.mjs` and
`inbox-routes.test.mjs` unchanged. The PR names #5.

---

# PR 1.4 · The person

**Branch:** `ask-rewired/1-4-person`. **Created:** `readers/person.ts` ← the whole handler body of
`api/v1/contacts/[id]/route.ts:309-552` (the eighteen parallel reads and the DTO assembly at `:511-549`; every helper
the route file defines above the handler moves too), `Reader<{ id: string }, { person: PersonDetailDto }>`, `rows`
the person (`kind: "person"`, route `clients/${id}`), each of their conversations (`thread`) and calls (`call`).
**Modified:** the route (keeps `dynamic = "force-dynamic"` and `requireUuid`, becomes one line), `tools.ts`
`get_person` (reads `person`, applies `toPersonVM` the way `legacy-bridge/people-detail.ts:67-70` does, projects the
same fields it projects today: facts, about, timeline ≤ 20, notes ≤ 20, ≤ 5 conversations and calls; its own nine
queries and `PersonDetailDto` at `tools.ts:728-740` go — closes #3). **Pins to convert** (a separate commit "Pins to
behaviour: the person read"): `calendar-people.test.mjs:559-565` (`const visitsRead = personVisits(` → assert a
`calendar`/feed read happened via `seen` or the reader's rows), `:819-822` (`.eq("kind", "contact.added")` → assert
`seen` holds a select on `events` filtered by `kind = contact.added`), `:1104` and `:1569` (the two select strings →
`seen` filters on `contacts` and `tenant_config` columns), `threads-people.test.mjs:356` (`effective_reply_mode:
personPol…` → a payload assertion on `person.reply_mode`), `person-read-one-round.test.mjs:186-288` (already
behavioural over the route: keep; they must pass unchanged). **Tests:** `readers.test.mjs` runs `person` over the
`people-routes.test.mjs:224` fixture and deep-equals the route's payload; the route tests pass unchanged. The PR names
#3 and states the tool's one round.

---

# PR 1.5 · Reports, the calendar, the openings

**Branch:** `ask-rewired/1-5-reports-calendar`. **Created:** `readers/report.ts` ← `api/v1/reports/route.ts:23-60`
(`Reader<{ days: 7 | 30 | 90 }, { report; booking; deals }>`, the one `everyone` read shared as today, rows one
`page` "reports"), `readers/campaignReport.ts` ← `reports/campaigns/route.ts`, `readers/calendar.ts` ← the read half
of `calendarWeek` (`server/calendar.ts:325-472` minus the `addPeopleSeen` call at `:418-427`: split `calendarWeek`
into `calendarRead(ctx, tenantId, opts)` and the write, the route calling both in the same order as before so its
output and its side effect are unchanged; `Reader<{ from?: string; days?: number }, { calendar }>`, rows the people
with a visit), `readers/openings.ts` ← `openingsFor`. **Modified:** the three routes to one line (the calendar route
keeps `canAct` and calls `addPeopleSeen` after the reader when the caller may act), `tools.ts` `get_report` (reads
`report`; projects `report` as today plus `booking?.line` and `deals?.summary`; validates `days ∈ {7, 30, 90}` and
answers `{ error }` otherwise — closes #1), `get_calendar` (reads `calendar` with the page's default span; no
`tenantFacts`; never writes — closes #11), `get_openings` (reads `openings`; `service` cut at 160 — closes #13).
**Pins to convert:** `calendar-people.test.mjs:809-813` (`const canAct =` in the calendar route: keep, the route still
holds it), `:1018-1050` (`.then((rows) => bookingReport(` and `return { report, booking, deals };` in the reports
route → the reader's test asserts `seen` reads `report_series`, then `people_list`, then the feed, then `deals`, and the
payload keys `report, booking, deals` in order). **Tests:** `readers.test.mjs` over the `ask-routes.test.mjs:430/465`
fixtures (the "People read once" assertion at `:500` moves to the reader test unchanged in meaning),
`calendar-feed.test.mjs:497/705` and `calendar-counts.test.mjs:503` pass unchanged. The PR names #1, #11, #13.

---

# PR 1.6 · People, lists, the pool, playbooks, broadcasts

**Branch:** `ask-rewired/1-6-people-campaigns`. **Created:** `readers/people.ts` ← `api/v1/contacts/route.ts:28-81`
(two stages; `Reader<{ q?: string; page?: number; list?: string }, <the route's payload>>`, rows one `person` per row),
`readers/lists.ts` ← `segments/route.ts` (`savedListsFor`), `readers/audiencePool.ts` (the pool `audiencePool` at
`server/audience.ts:45-68` for the asking person; the turn cache keys it by arguments, so the `"audience_pool"`
memo that ignored `tz` and `now` (`audience.ts:70-84`) goes), `readers/playbooks.ts` ← `playbooks/route.ts:27-56`
(with `triggerPools` counted as the page counts them), `readers/broadcasts.ts` ← `broadcasts/route.ts:25-43` and
`readers/broadcast.ts` ← `broadcasts/[id]/route.ts`. **Modified:** the five routes to one line; `tools.ts`
`search_people` (one SQL page through `people` with `q`, the page's seven states, ≤ 12 rows, the pool no longer read —
closes #7), `list_audiences` (reads `audiencePool`, `lists`, the templates without `hidden_at` as the composer does —
closes #9), `list_playbooks` (reads `playbooks`; the page's counts — closes #10). **Pins to convert:**
`calendar-people.test.mjs:1018-1050` on `contacts/route.ts` (`const [out, sellsBy, nameSteps, pace, followUp] = await Promise.all([`,
`withVisits(ctx, tenantId, rows),`, `const buys = sellsByOf(ctx, tenantId);` → the reader test asserts the two stages
from `seen`: `people_list` and the contacts count first, then the feed, `team_roster`, deals and playbooks), the
switch-case regexes in `broadcasts.test.mjs:602-610`, `playbooks.test.mjs:504-515`, `visit-playbooks.test.mjs:321-327`
(read each: if it scans the tool's case, re-point it at the reader or convert to a tool-run assertion). **Tests:**
`readers.test.mjs` over the `people-routes.test.mjs:148`, `:561`, `outbound-routes.test.mjs:168/887` fixtures; the
route tests pass unchanged. The PR names #7, #9, #10.

---

# PR 1.7 · Settings, connections, notifications, activity, channels, policies, the searches' counts

**Branch:** `ask-rewired/1-7-workspace`. **As built.** **Created:** `readers/settings.ts` ← `settings/route.ts:56-113`,
with `knownFacts` (exported: the PUT still judges a changed transfer number with it) and `maskFeedUrl`; the `config`
reader widened to the row's `updated_by` and `updated_at`, so the settings read is the turn's one read of the row; the
prompt preview composed on the turn's clock and kept by nothing. `readers/connections.ts` ← `setup/route.ts`
(`setupDtoFor` for a member, on the turn's clock). `readers/notifications.ts` ← `notifications/route.ts:14-64` (thirty
days back from `rc.now`). `readers/activity.ts` ← `activity/route.ts` (owner only: the route keeps `role: "owner"`,
the rate and the query's checks; the reader trusts the caller). `readers/channels.ts` ← `channels/route.ts`.
`readers/autonomy.ts` ← `policies/route.ts` GET -- named for the pane it feeds rather than `policiesRoute.ts`: the
`policies` and `sellsBy` readers at once, the route's payload, fresh per request. `readers/templates.ts` ←
`templates/route.ts` GET (`{ all }`: the composers' read, or Settings' with what sends each; the route checks
`?all=`). **Modified:** the seven routes to one line each; `tools.ts`: `get_settings` composes the facts, config,
`policies`, `channels` and `sellsBy` readers and projects the same fields as today, the channels in the page's order --
not `settings`, whose prompt preview fetches the calendar feed and re-reads the policies, which a question about the
hours must not pay for; `list_audiences` reads `channels` (the number, as the Broadcasts page picks it) and the
composers' `templates`, split as the composer splits them, `cannot_send` saying why for the ones the wire refuses
(closes #14; the composer's slot filter stays open); `list_lead_searches` reads `searches`, the page's rows, and
carries the rail's six `counts` (closes #12). `server/audience.ts` `poolList` takes the turn's lists: `search_people`,
`propose_broadcast` and `propose_playbook` hand them for a list of the workspace's own; the send reads its own. After it
no tool reads the database itself (`tools.ts` holds no `.from(` or `.rpc(`); a proposal's own checks and the snapshot
keep theirs. **Pins:** re-pointed at the readers where no route run holds them (`back-office`, `setup`, the templates'
title and columns); converted where a route run already asserts them (`availability`, `facts`, `settings-truth`,
`broadcasts`, `notifications-durable`, the composers' filter in `starter-templates` and `templates-truth`); the
baseline falls by five. `settings-routes.test.mjs:637` passes unchanged. `tools.ts` is 1,229 lines, not the 700 hoped
for: what is left is the tools' own projections, which Phase 3's registry takes apart.

---

# The phase's exit

- [ ] Every one of the seven PRs merged; `git grep -n "tenantFacts(" apps/dashboard/src/server/ask` prints nothing;
      `git grep -n "memoised\|audiencePoolOnce" apps/dashboard/src/server` prints nothing.
- [ ] The eval set run once on the default model (Ruben's, 28 turns) shows no must-never regression against the
      Phase 0 gate; the day-of-numbers script shows the tools' one-round share unchanged or up.
- [ ] The wiring map's tool column re-read: a one-paragraph note in the spec's §9 Phase 1 saying which of the thirteen
      closed, with the PR numbers.
- [ ] Phase 2's plan is written against that day's main.
