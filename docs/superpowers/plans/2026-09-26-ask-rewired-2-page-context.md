# Ask Rewired, Phase 2: the page context and the warm call — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the page a person is on reaches the model before their question does, as data, so an on-page question is
answered in one round from the rows on screen; the snapshot and the regex prefetch go.

**Architecture:** the tab sends identities, never facts (`PageContext`: surface, route, view, focus, the rows on
screen). The server re-reads those ids through Phase 1's readers under RLS and writes one `search_result` block per row
plus one for the page's aggregate (citations off, a stable `source` each). `POST ask/warm` builds them when the palette
opens; the turn takes them from that cache. `system` becomes two byte-stable blocks (the rules and facts; the shape of
the workspace); the user message carries the context blocks, the cross-page reads, the clock and the person, then the
question.

**Tech stack:** TypeScript 5.9, Next 16 route handlers (`server/route.ts` `read`/`write`), zod 4 in contracts, the
Anthropic Messages API through the edge gateway (`search_result` content blocks, `cache_control`,
`output_config.format`), `node --test` over `_fake-db.mjs`, Playwright e2e, the eval runner
`tooling/scripts/eval-ask.mjs`. Runner flags for any suite that imports `.ts`:
`node --conditions=react-server --import tsx --test <files>`.

**Spec:** `docs/superpowers/specs/2026-09-25-ask-rewired-design.md` §4.1, §5.2, §5.5, §5.7, §5.9, §5.10, §9 (Phase 2).
Written against `origin/main` at `b6f22164` (#1124, PR 1.7; 26 Sep 2026) after a file-by-file map read at `4b4637df`
(#1118); the anchors below were re-read at `b6f22164`. PR 1.7 moved none of the files Phase 2 changes but `tools.ts`
(get_today's description is now `tools.ts:111`). Phase 1 plan: `docs/superpowers/plans/2026-09-25-ask-rewired-1-readers.md`.

---

## Where this fits, and what the code map found

Phase 1 put every read Ask makes outside the snapshot through `server/readers/` (28 readers, the kernel's turn cache,
the facts kept five minutes). Phase 2 is where the model's request changes for the first time. The map corrected the
spec in eleven places; the ones that shape this plan:

1. **The request today** (`server/ask/loop.ts:251-270`): `system` is four text blocks — the stable block (breakpoint 1),
   the snapshot (breakpoint 2, built every 20 s per person, with customers' words in it), the prefetch (uncached), and
   `turnSystem` (clock, person, surface, scope, language; uncached). The user message is one string (`foldHistory`,
   `loop.ts:167-181`, merges neighbours as strings).
2. **The budget counts uncached input only** (`apps/edge/lib/ask-gateway.ts:44-47`): the cached snapshot never counted;
   a context sent uncached in the user message would count on every round. At Opus 5.5's prices ($4/MTok uncached, $5
   write, $0.20 read) a 2,000-token context costs $0.008 a round uncached; a breakpoint on it pays for itself once about
   26% of turns take a second round.
3. **The warm cannot be a `read()`:** `route-policy.test.mjs:67-77` refuses any non-GET that is not `write()` with a
   role; and a POST through the typed client drops the tab's in-flight reads and runs the refresh map
   (`client/api.ts:200-206`) unless sent with `raw()`.
4. **The kernel forbids a TTL on any reader that reads `rc.now`** (`readers/index.ts:26-30`): calendar, people,
   playbooks, broadcasts, the pool and openings all do. The warm keeps its built blocks itself, per person and context
   hash, as `snapshot.ts:353-383` keeps the snapshot — per instance.
5. **Row kinds:** `RowKind`, the citation kinds and (by alias) the scope kinds are the same five; the answer's grammar is
   built from the citation kinds (`contracts/ask-answer.ts:482-487`) and `groundRef` refuses a page citation whose route
   carries a uuid (`ask-answer.ts:645-661`). Leads, searches, runs, playbooks and templates can ride in the context in
   Phase 2; they become citable in Phase 4.
6. **Surfaces:** today's nine are today, inbox, people, leads, conversations, live, reports, settings, other
   (`contracts/ask.ts:444-454`), not the spec's; the Pipeline reads as people; calendar, the campaign pages and start
   read as other; the palette is not mounted on `#/start` (Phase 7 mounts it).
7. **Rows on screen:** Today, Leads, Reports, Campaigns, Settings and (by computation) the Pipeline hold theirs in
   globals; the Inbox (bucket in tab memory), People (list, search, sort) and the Calendar (view, anchor) hold theirs in
   page state.
8. **The gateway needs nothing:** it rebuilds the request from an allowlist that keeps `system` (string or blocks),
   `messages` (any blocks) and block-level `cache_control` (`ask-gateway.ts:195-236`). Either deploy order holds.
9. **Grounding counts reads:** `isUngrounded(answer, reads + proposals)` (`loop.ts:636`) — the snapshot counted as one
   read; the context must, or every figure answered from the page is flagged.
10. **The proof's limits:** every real-model e2e test skips without `E2E_PAID_MODEL=1`, which the nightly never sets;
    the eval workspace has no calendar, playbook, broadcast or deal; all 28 eval cases are on today.
11. **Sizes** (ceiling 400, at `b6f22164`): `loop.ts` 692, `prompt.ts` 389, `snapshot.ts` 383, `prefetch.ts` 75,
    `tools.ts` 1,258, `proposals.ts` 1,214, `pages/ask-real.jsx` 911. Phase 2's new code lands in new files; `loop.ts`
    and `prompt.ts` shrink.

A stored scope has no CHECK on its kind: `ask_threads.scope` is `jsonb` with a column grant only
(`supabase/migrations/00040_ask.sql:21`, `:82`), so growing the scope kinds needs no migration.

## Decisions this plan takes (Ruben may overrule any; each names its PR)

| #   | Decision | Why | PR |
| --- | -------- | --- | -- |
| D1  | Thirteen surfaces: today, inbox, conversations, live, people, leads, pipeline, calendar, reports, campaigns, settings, start, other. Conversations and Live stay. | They are real pages, turns are stored under them and the suggestions branch on them; dropping them loses both. | 2.1 |
| D2  | Scope kinds and context row kinds each get their own list; citation kinds stay five until Phase 4. Scope grows by lead, search, run; context rows are thread, conversation, call, person, lead, search, run, playbook, template. | Growing the citation kinds changes the answer's grammar, which is Phase 4's; a row can ride as data without being citable. | 2.1 |
| D3  | The pages that hold their rows in state publish the ids they drew: the Inbox list, the People list and the Calendar write `window.__askOnScreen = { key, ids, view }` at draw time; the providers read it. | One derivation per fact: re-deriving the Inbox bucket's order or People's filter in a provider is a second copy that drifts. | 2.1 |
| D4  | Focus from the client: the row the route opens, or a row the words name on screen by an ordinal ("the second one", "el segundo", "#2") or by its display name. | The spec's §5.5; free on the client, where the rows and their names are. | 2.1 |
| D5  | The contract is a flat file, `packages/contracts/src/ask-context.ts`, beside `ask.ts`, `ask-shape.ts`, `ask-answer.ts`. | Contracts has no `ask/` directory; the barrel re-exports flat files. | 2.1 |
| D6  | The warm is `write({ scope: workspace, role: "viewer", rate: "aggregate", input: PageContextSchema })`, sent through `raw()`, answering `{ stamp }`. | The route policy test (finding 3); `raw()` so the tab keeps its reads and runs no refresh. | 2.2 |
| D7  | The warm keeps its built blocks itself: 60 s, per person and `stableJson({ surface, route, view, rows })` (never `askedAt`, never `focus`), FIFO 200, per instance; ReaderCache TTLs stay the facts' alone. The turn's shape records `warm: "hit" \| "miss"`. | The kernel's rule (finding 4); whether the warm and the question land on one instance is measured, not assumed. | 2.2 |
| D8  | Leads' rows ride through a pure move of `GET leads` into `readers/leads.ts`, byte-equal, the route a one-liner. | Leads is where Ask runs the finder; its rows are what an on-page question is about. The reader is the one Phase 4 needs anyway. | 2.2 |
| D9  | The shape of the workspace is a reader (`readers/shape.ts`, 5-minute TTL, the Ask route's `keep` only): channels connected, deals on, calendar and mailbox connected, the saved lists by name, the playbooks by name, trigger and state — sorted, no counter that ticks, ≤ 1,500 characters. | Breakpoint 2 must be byte-stable across the workspace's people; counters would miss it every turn. | 2.2 |
| D10 | The context carries a breakpoint from the start (`cache_control` on its last block, breakpoint 3 of 4). The spec deferred this to Phase 0's numbers. | Finding 2: without it the context counts against the daily budget every round, where the snapshot never did, and costs more from ~26% second-round turns up. With it, a one-round turn pays 1.25× on ~1,500 tokens (≈ $0.0019). PR 2.5 removes it if a day of numbers says it never reads. | 2.4 |
| D11 | The context is capped: ≤ 40 rows; a row's text ≤ 160 characters; the aggregate ≤ 1,200; all blocks ≤ 8,000 characters (≈ 2,000 tokens), cut in the page's order, the cut said in the aggregate. | The cost target turns on it (finding 2). | 2.2 |
| D12 | Held drafts leave the non-Inbox pages' context; the cross-page table gains HELD (drafts, held, waiting for approval) → `list_threads {filter: "held"}` off the Inbox. | Page-equal: Today's queue does not show them; the snapshot did, on every page. One read answers the question where it is asked. | 2.4 |
| D13 | The cross-page table keeps prefetch's regexes minus the surface's own nouns (a report off Reports, openings and the calendar off Calendar, playbooks and audiences off Campaigns, missed calls and calls off Today, Conversations and Live) plus HELD; its results ride as `search_result` blocks `read://<tool>`, not in `system`. | The spec's §5.2; customers' words belong in data blocks. | 2.4 |
| D14 | A refusal of the new blocks never costs the turn: a 400 on a request that carried context blocks is retried once without them (logged `ask_context_rejected`), before `featureRejected` may drop the answer format. | Nothing in the repo has sent a `search_result` block; a refusal must not silently turn off the answer's format (`sse.ts:79-81`, `loop.ts:486-495`). | 2.4 |
| D15 | §5.5's rounds (4 → 3) and ceiling (2,000 → 4,000) wait for Phase 3, which changes the request's tools and descriptions anyway. | One change to the request per phase, each measured. | — |
| D16 | No change to the nightly workspace's seed in Phase 2: per-surface cases on Calendar, Campaigns and the Pipeline grade how an empty page is said; seeding is Phase 4's. | The seed is what every e2e spec reads; widening it moves counts the specs pin. | 2.3 |
| D17 | Paid e2e and the gate stay Ruben's to run (`E2E_PAID_MODEL=1`; `eval-ask.mjs` with its turn count and cost said first). | They spend the receptionist's key. | 2.3, 2.4 |

### The spec amendments this plan makes (in the plan's PR)

- §5.2: the warm is a write in the aggregate bucket, sent raw (D6); its blocks are kept by the warm itself (D7); the
  contract's path (D5); thirteen surfaces (D1); the context's breakpoint from the start, measured (D10); the cap (D11).
- §9 Phase 2: four PRs and a fifth only if the numbers ask for it, as below.

## How every PR is proven (the same six checks, then each PR's own)

1. `corepack pnpm -r typecheck`; `corepack pnpm lint` (0 errors); `node tooling/scripts/gen-route-types.mjs --check`.
2. The full `corepack pnpm test`; the harness suite (`ask-turn.test.mjs`) runs every request the loop sends through a
   scripted model and asserts on `s.requests[i]`.
3. Contracts changes: dists rebuilt after formatting and committed (`corepack pnpm --filter "./packages/*" build`, then
   `git status` shows no drift).
4. `git diff origin/main --stat` limited to the PR's named files; no `app/api/v1/**` file but those named; every GET
   route's tests pass unedited.
5. The model's request: a PR that must not change it proves it byte-identical (`s.requests[0]` against main's, over the
   harness fixtures); a PR that changes it names every byte that moved.
6. Text pins converted to behaviour where a PR moves the text; `source-scan-baseline.json` only falls.

Each PR: its own worktree from that day's `origin/main`; one implementer; one combined review round; squash-merge on
green. Before every push: `git fetch origin main`, rebase, and check `git diff origin/main --stat` lists only this PR's
files.

---

# PR 2.1 · The contract, the surfaces and the client providers

**Branch:** `ask-rewired/2-1-page-context`. The tab builds and sends a `PageContext`; the route validates it, records
its size on the turn's shape, and otherwise ignores it. The model hears one change: the turn line names the new
surfaces ("They are on the pipeline page.").

### Task 1: The contract

**Files:** Create `packages/contracts/src/ask-context.ts`; modify `packages/contracts/src/ask.ts` (surfaces, scope
kinds, `AskScope`, `scopeFromRoute`, suggestions), `packages/contracts/src/index.ts` (barrel), the dists; test
`tooling/scripts/tests/ask-context-contract.test.mjs` (new).

- [ ] **Step 1: Write the failing tests** — the schema takes a well-formed context and refuses each malformed one; 41
      rows are refused; `scopeFromRoute` reads every address D2 names; `ASK_SCOPE_KINDS` no longer equals
      `ASK_CITATION_KINDS`; every surface has suggestions.

```js
test("a page context: identities and words, never facts, forty rows at most", () => {
  const ok = { v: 1, surface: "inbox", route: "inbox/th-" + T1, view: "needs_you",
    focus: { kind: "thread", id: T1, label: "Rosa" }, rows: [{ kind: "thread", id: T1 }], askedAt: 1_758_880_000_000 };
  assert.equal(PageContextSchema.safeParse(ok).success, true);
  const rows = Array.from({ length: 41 }, (_, i) => ({ kind: "person", id: `p${i}` }));
  assert.equal(PageContextSchema.safeParse({ ...ok, rows }).success, false, "forty at most");
  assert.equal(PageContextSchema.safeParse({ ...ok, surface: "billing" }).success, false);
  assert.equal(PageContextSchema.safeParse({ ...ok, rows: [{ kind: "deal", id: "x" }] }).success, false);
  assert.equal(PageContextSchema.safeParse({ ...ok, rows: [{ kind: "thread", id: T1, preview: "hi" }] }).success, false,
    "a row carries its kind and id and nothing else");
});

test("a scope from every address a page can open", () => {
  assert.deepEqual(scopeFromRoute("live", CALL), { kind: "call", id: CALL, label: "this call" });
  assert.deepEqual(scopeFromRoute("broadcasts", `run:${RUN}`), { kind: "run", id: RUN, label: "this run" });
  assert.equal(scopeFromRoute("clients", `leads:s-${S}:p-${L}`)?.kind, "lead");
  assert.equal(scopeFromRoute("clients", `leads:s-${S}`)?.kind, "search");
  assert.equal(scopeFromRoute("clients", `pipeline:v-open:p-${P}`)?.kind, "person");
  // conversations/<tab>:<id>: read pages/conversations.jsx:26-51 for the tabs and the kind each id is.
});
```

- [ ] **Step 2: Run it to see it fail:**
      `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-context-contract.test.mjs` — FAIL
      (`PageContextSchema` is not exported).

- [ ] **Step 3: The contract**

```ts
// packages/contracts/src/ask-context.ts
import { z } from "zod";
import { ASK_SCOPE_KINDS, ASK_SURFACES, type AskScope, type AskSurface } from "./ask";

/**
 * What the page a person is on sends with a question, and with the palette's warm (spec §5.2): identities and words,
 * never facts. The server re-reads every id under the person's RLS, so a row another workspace holds is a miss, and
 * nothing the tab says about a row is believed.
 */
export const ASK_CONTEXT_MAX_ROWS = 40;

/** The kinds of row a page shows. Wider than a citation may name until Phase 4 (ASK_CITATION_KINDS). */
export const ASK_CONTEXT_ROW_KINDS = [
  "thread", "conversation", "call", "person", "lead", "search", "run", "playbook", "template",
] as const;
export type AskContextRowKind = (typeof ASK_CONTEXT_ROW_KINDS)[number];

export interface PageContext {
  v: 1;
  surface: AskSurface;
  /** The hash route as the palette reads it (the page, then the rest joined). */
  route: string;
  /** A list token, a period ("30"), a calendar span ("2026-09-21/7"), a bucket, a Campaigns tab, a Settings pane. */
  view?: string | null;
  /** The row that is open, or the row the words name on screen. */
  focus?: AskScope | null;
  /** What is on screen, in the order shown. */
  rows: Array<{ kind: AskContextRowKind; id: string }>;
  askedAt: number;
}

const Id = z.string().min(1).max(120);

export const PageContextSchema = z
  .object({
    v: z.literal(1),
    surface: z.enum(ASK_SURFACES),
    route: z.string().max(200),
    view: z.string().max(80).nullish(),
    focus: z.object({ kind: z.enum(ASK_SCOPE_KINDS), id: Id, label: z.string().max(80) }).strict().nullish(),
    rows: z.array(z.object({ kind: z.enum(ASK_CONTEXT_ROW_KINDS), id: Id }).strict()).max(ASK_CONTEXT_MAX_ROWS),
    askedAt: z.number().int().nonnegative(),
  })
  .strict();
```

In `ask.ts`: `ASK_SURFACES` gains `pipeline`, `calendar`, `campaigns`, `start` before `other` (D1);
`ASK_SCOPE_KINDS = ["thread", "conversation", "call", "person", "page", "lead", "search", "run"] as const` (its own
list, D2) and `AskScope.kind` its element type; `scopeFromRoute` learns `live/<callId>`, `conversations/<tab>:<id>`,
`broadcasts/run:<id>`, and the Leads and Pipeline peeks through contracts' own `parseLeadsRoute` and
`parsePipelineRoute` (one parser each, never a second regex); `buildAskSuggestions` gives the four new surfaces
other's chips (no new chip in Phase 2). A stored scope's kind has no CHECK (`00040_ask.sql:21`: `jsonb`), so no
migration; if a later migration has added one by the day this runs, stop and report.

- [ ] **Step 4:** Run the tests; rebuild contracts; run `ask.test.mjs`: its alias pin (`:166-175`) and `scopeFromRoute`
      pin (`:302-306`) are rewritten to the new lists in the same commit, as behaviour.
- [ ] **Step 5:** Commit `The page context's contract: thirteen surfaces, scope kinds of their own, a scope from every
      address a page opens`.

### Task 2: The pages that hold their rows in state say what they drew (D3)

**Files:** `apps/dashboard/src/legacy/pages/inbox-list.jsx`, `clients-a.jsx` (the People list), `calendar-real.jsx`,
their `?v=` bumps; test through the legacy page harness.

Each page, after it draws, sets `window.__askOnScreen = { key: "inbox" | "people" | "calendar", ids, view }`: the Inbox
the conversation ids of the bucket it drew, in its order, and the bucket as `view`; People the person ids of the rows it
drew after its list, search and sort, and the list token; the Calendar no ids and its span as `view`
(`"YYYY-MM-DD/<days>"`), with the person ids of the appointments drawn when its VM carries them. At most 40 ids. A page
that is not drawn leaves the last value; the provider trusts it only when its `key` is the surface asked about.

- [ ] **Tests:** the harness draws each page over its fixture and reads `__askOnScreen` — the Inbox's needs-you bucket
      gives its ids in the page's order; People with a list and a search gives the rows it shows; the Calendar's week
      gives its span.
- [ ] Commit `The Inbox, People and the Calendar say which rows they drew`.

### Task 3: The client providers and focus from words

**Files:** Create `apps/dashboard/src/legacy-bridge/ask/context.ts`; modify `bridge/ask/palette.ts` (`surfaceFor`),
`bridge/ask.ts` (`installAsk` exposes `context`); test `tooling/scripts/tests/ask-palette.test.mjs`.

`surfaceFor`: `clients/leads…` → leads, `clients/pipeline…` → pipeline, `clients` → people, `calendar` → calendar,
`outbound`/`broadcasts`/`messages` → campaigns, `start` → start, the rest as today (read `surface-registry.ts` for
`segments` before placing it).

```ts
// bridge/ask/context.ts
type Row = { kind: AskContextRowKind; id: string; label?: string };
type Provided = { view?: string | null; rows: Row[]; focus?: AskScope | null };
type Provider = (w: Window, route: { page: string; param: string | null }) => Provided;

/** One provider per surface, over the globals the page already holds (the code map's table). */
const PROVIDERS: Partial<Record<AskSurface, Provider>> = {
  today, inbox, conversations, live, people, leads, pipeline, calendar, reports, campaigns, settings, start,
};

export function pageContext(w: Window, route: { page: string; param: string | null }, words?: string): PageContext {
  const surface = surfaceFor(route.page, route.param);
  const got = PROVIDERS[surface]?.(w, route) ?? { rows: [] };
  const rows = got.rows.slice(0, ASK_CONTEXT_MAX_ROWS);
  const focus = (words ? focusFromWords(words, rows) : null) ?? got.focus ?? scopeFromRoute(route.page, route.param);
  return {
    v: 1, surface, route: routeOf(route), view: got.view ?? null, focus: focus ?? null,
    rows: rows.map(({ kind, id }) => ({ kind, id })), // labels stay in the tab
    askedAt: Date.now(),
  };
}
```

Providers (each a few lines over its global; the anchors are in the code map's table of the pages' globals):

- **Today** — `TODAY_DATA.queue.rows` in order, a conversation's row as `thread`, a call's as `call`, a search's as
  `search`.
- **Inbox** — `__askOnScreen` (key `inbox`), view the bucket, focus the route's `th-<id>`.
- **Conversations** — `CONVERSATIONS_DATA` by the route's tab.
- **Live** — `__LIVE`'s calls now, then recent.
- **People** — `__askOnScreen` (key `people`), view the list token.
- **Leads** — `__LEADS.rows` in order, view from `__LEADS.view`, focus the peek or the search.
- **Pipeline** — `window.__pipeline(…)`'s groups in order, people as `person`, view `v-<view>`, focus `p-<person>`.
- **Calendar** — `__askOnScreen` (key `calendar`).
- **Reports** — view the days.
- **Campaigns** — the route's tab (outbound playbooks, broadcasts runs, messages templates), focus a run.
- **Settings** — view the pane.
- **Start** — view the step (Phase 7 mounts the palette there).

`focusFromWords(words, rows)`: an ordinal in English or Spanish ("the second", "2nd", "#2", "el segundo", "la tercera")
picks that row; otherwise a row whose label appears whole in the words (case- and accent-insensitive, the longest label
wins, a label under three characters never matches); otherwise null. Only kinds a scope may have.

- [ ] **Tests** (`ask-palette.test.mjs`, over fixture globals): each provider gives the page's rows in the page's order,
      at most forty, kind and id only; a foreign global shape gives no rows rather than throwing; "the second one" and
      "Ana's thread" set the focus from the rows; a route's open row is the focus when the words name none.
- [ ] Commit `Every page says what is on screen: one provider a surface, and the row the words name`.

### Task 4: The palette sends it; the route records it

**Files:** `bridge/ask/api.ts` (`send` carries `context`), `pages/ask-real.jsx` (build it at send with the words; `?v=`
bump), `pages/leads-finder.jsx` (the answer row sends Leads' context), `app/api/v1/ask/route.ts` (parse with
`PageContextSchema.safeParse`; a bad one is null and logged `ask_context_refused` with the first issue, never a refusal;
surface taken from the context when both are present and agree), `packages/contracts/src/ask-shape.ts`
(`context_rows: number | null`), `server/ask/loop.ts` (the input carries `context`, unused; the shape records its row
count), the dists.

- [ ] **Tests:** `ask-routes.test.mjs` — a turn with a context answers as without one, and the stored shape says its row
      count; a malformed context is ignored and logged, never refused; `ask-shape.test.mjs` — `context_rows`. The
      request: byte-identical to main's over the harness fixtures, except the turn line for a new surface (named in the
      PR).
- [ ] Commit `The palette sends the page; the route keeps its size and nothing else yet`.

### Task 5: Gates and the PR

The six checks; the PR names D1–D5, the surfaces' turn line, and the pins rewritten (`ask.test.mjs:166-175`,
`:302-306`, `:498-502`).

---

# PR 2.2 · The server providers, the leads reader, the shape, and `POST ask/warm`

**Branch:** `ask-rewired/2-2-warm`. The server can build the context and the shape; the palette warms them on open;
the turn does not read them yet, so the model's request is byte-identical to main's.

### Task 6: `readers/leads.ts`, a pure move (D8)

`app/api/v1/leads/route.ts:14-18` (`leadsPage`) moves into `readers/leads.ts` as Phase 1 moved every route: the body
verbatim, `new Date()` → `rc.now`; `rows: []`, because a lead is not a `RowKind` until Phase 4; the route keeps its
validation plus one `load`. Proof as Phase 1's: the route's suite untouched and passing, a capture over its fixtures at
the base and on the branch (payloads, errors and `seen` equal), a `seen`-order pin in `readers.test.mjs`.

### Task 7: `readers/shape.ts` (D9)

`shape: Reader<undefined, WorkspaceShape>` with `ttlMs: 5 * 60_000`, reading nothing that ticks and nothing of `rc.now`
or `rc.role` (the kernel's rule): the facts (name, zone), the config (calendar feed set; the booking link set),
`sells_by` (deals on), `tenant_channels` kinds and status (not the last inbound), the mailbox and Google connections
(the fields `setupDtoFor` reads for them, by the same queries), the saved lists (id, name, archived; no counts), the
playbooks (id, name, trigger, state; no totals). `shapeBlock(shape)` (in `server/ask/context.ts`) writes it sorted and
byte-stable, ≤ 1,500 characters: two workspaces with the same facts in a different row order write the same bytes.

- [ ] **Tests:** two reads within five minutes read once across turns (`keep`) and every time for a route; the block is
      identical for a reordered fixture; a counter's change (a new message, a run's send) changes nothing.

### Task 8: The server providers and the block cache

**Files:** Create `server/ask/context.ts` (`buildContext(rc, context)` → `{ blocks, refs, aggregate, chars, warm }`,
the cache, `shapeBlock`, the `search_result` builder) and `server/ask/context/<surface>.ts` (one provider each, ≤ 400
lines); test `tooling/scripts/tests/ask-context.test.mjs` (new, over `_fake-db.mjs`).

```ts
export interface SearchResultBlock {
  type: "search_result";
  source: string; // "thread://<id>", "call://<id>", "person://<id>", "lead://<id>", "run://<id>", "page://<surface>"
  title: string; // the display name the page shows
  content: Array<{ type: "text"; text: string }>;
  citations: { enabled: false };
}
```

A provider hydrates its ids through the surface's readers (the code map's server table: today, inbox and conversation,
calls/call, people/everyone/lists/person, leads + searches, the Pipeline's projection over everyone, sellsBy and the
pace, calendar, report + campaign-report, playbooks/broadcasts/broadcast/templates, settings/connections/autonomy/
channels), keeps the ids the reader returned (a foreign id is a miss and names nothing), and writes each row's text with
the page's own builder (`toTodayVM`, `toInboxThreadVM`, `poolRowOf`, `toLeadRowVM`, `pipelineOf`, `toCalendarVM`,
`toReportVM`, `toBroadcastVM`, the pane's DTO): who, state, last activity, where it opens (`route: …`), in ≤ 160
characters; and one `page://<surface>` block with the page's aggregate (the day's figures, the bucket counts, the list's
size, the report's numbers, the searches waiting), ≤ 1,200. The blocks are cut at 8,000 characters in the page's order,
and the aggregate says how many rows were left out (D11). `refs` are the RowRefs of citable kinds only (thread,
conversation, call, person, page).

The cache: `${tenantId}|${userId}|${stableJson({ surface, route, view, rows })}`, 60 s, FIFO 200; a hit returns the
blocks and re-seeds nothing by itself (the turn seeds the read set from `refs`).

- [ ] **Tests** (`ask-context.test.mjs`): each provider's blocks over a fixture (titles, sources, the page's words); a
      foreign workspace's id is absent and no block or log names it; a second build within 60 s reads nothing
      (`supabase.seen` empty) and a changed row set reads again; forty rows and 8,000 characters at most, the cut said;
      focus is not in the key.

### Task 9: `POST /api/v1/ask/warm` and the palette's warm (D6)

**Files:** Create `app/api/v1/ask/warm/route.ts`; modify `tooling/scripts/tests/route-policy.json`
(`UPDATE_ROUTE_POLICY=1`), `apps/dashboard/src/client/routes.generated.ts` (`gen-route-types.mjs`), `bridge/ask/api.ts`
(`warm(context)` through `raw`, errors swallowed), `pages/ask-real.jsx` (warm on open, and in an effect on
`[open, route.page, route.param]`; guarded `A.warm &&` for the palette suite's fake; `?v=` bump).

```ts
export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "aggregate",
  input: PageContextSchema,
  handle: async ({ ctx, member, input }) => {
    const built = await buildContext(readerContext(ctx, member, undefined, { keep: true }), input);
    return { stamp: built.stamp };
  },
});
```

- [ ] **Tests:** `ask-routes.test.mjs` "ten declare their policy"; the warm answers a stamp and fills the cache (the
      turn's build right after reads nothing); a viewer may warm; a bad context is a 400 in words (the warm is its own
      door); the palette suite: opening warms once, a route change while open warms again.

### Task 10: Gates and the PR

The six checks; the request byte-identical to main's; the PR names D6–D9, D11, and the new route.

---

# PR 2.3 · The eval sees the page — the baseline before the switch

**Branch:** `ask-rewired/2-3-eval-surfaces`. May run beside PR 2.2 (no shared file).

**Files:** `tooling/scripts/eval-ask.mjs`, `tooling/evals/ask-cases.json`, `e2e/ask.spec.ts`,
`tooling/scripts/tests/eval-harness.test.mjs` if it pins the runner.

- A case may carry `context: { surface, route, view?, rows?: "<GET key>[:<n>]", focus?: "<ordinal>" }`, resolved at run
  time against the eval workspace through the GETs its page makes (the first n rows of `GET conversations`, of
  `GET contacts`, of `GET leads`…), then warmed (`POST ask/warm`) and sent with the question. `fromSnapshot` becomes
  `fromContext`: an on-page case passes with no read when its rows rode in the context.
- Cases (D16: on the nightly's workspace as it is): per surface, one that needs no tool (on the page), one that needs
  one (off the page), one that must decline; a focus-by-ordinal case; a scope case; a must-never case whose context
  names a row of another workspace (the answer names nothing of it). Inbox, People, Leads, Reports, Settings,
  Conversations with rows; Calendar, Campaigns and the Pipeline grading how an empty page is said.
- `e2e/ask.spec.ts`: one paid question on each of five surfaces (today, inbox, people, leads, reports), carrying its
  context (`E2E_PAID_MODEL=1`, D17).
- **Proof:** the runner's dry listing says the new cases, their turn count and their cost; the harness suite is
  untouched. Ruben's run on the loop as it is (the server records the context but does not use it) is every surface's
  baseline for PR 2.4.

---

# PR 2.4 · The turn reads the context; the snapshot and the regex prefetch go

**Branch:** `ask-rewired/2-4-the-turn-reads-the-page`.

### Task 11: The request

**Files:** `server/ask/loop.ts`, `server/ask/prompt.ts`, `server/ask/context.ts`, `app/api/v1/ask/route.ts`,
`server/ask/tools.ts` (get_today's description at `:111` names the snapshot: the one description that changes, and
why), `contracts/ask-shape.ts`, `tooling/scripts/ask-day.mjs`, the dists. Delete `server/ask/snapshot.ts` and
`server/ask/prefetch.ts`.

- `system = [stableSystem (breakpoint 1), shapeBlock (breakpoint 2)]`: identical bytes for everyone in the workspace and
  role; no customer's words in `system` again (`prompt.ts`'s header is true once more).
- The last user message = `[...context blocks (the last with cache_control: ephemeral, breakpoint 3, D10),
  ...cross-page blocks (D13), { type: "text", text: turnWords }, { type: "text", text: question }]`. `turnWords` is
  `turnSystem`'s words without the snapshot's and the prefetch's sentences; the rules at `prompt.ts:65`, `:67`, `:68`
  say the page is given as data before the words.
- `AskPorts.snapshot` becomes `AskPorts.context` (the warm's cache, or a fresh build); the focus row rides in full as
  the snapshot's `scoped` did (`runTool` `get_thread` / `get_call` / `get_person`, as a `search_result` block); a lead,
  search or run focus carries its context row only (their tools are Phase 4's).
- The read set is seeded from the context's `refs`; the context counts as one read for `isUngrounded` when it carried a
  row or an aggregate (finding 9); `foldHistory` folds a block array (history stays words).
- D14's retry; the shape gains `context_rows`, `context_chars`, `warm` (`hit | miss | none`), `cross_page` (the tools),
  and drops `snapshot_ms` and `prefetched`; `ask-day.mjs` reports the warm hit rate and the second-round share per
  surface.

### Task 12: The proof

- `ask-turn.test.mjs`: round 1's user message holds the blocks before the words, the last context block carries the
  breakpoint, `system` has two blocks and two breakpoints; the bytes before `messages` are identical on two surfaces and
  for two people of one workspace; a context row is citable and a foreign id is not; a failed context costs the context,
  never the turn; a cross-page noun reads and an on-page one does not; a 400 naming the blocks is retried without them
  and the answer's format is kept; an answer with a figure from the page is not ungrounded.
- The pins the snapshot and the prefetch leave (`ask.test.mjs` `:614-618`, `:978-1050`, `:1177-1307`;
  `ask-turn.test.mjs` `:240-246`, `:314-315`, `:745-787`, `:1045-1082`, `:2180-2186`; `ask-routes.test.mjs`
  `:172-185`, `:250-262`, `:548`, `:561-564`, `:643`, `:721`; `ask-shape.test.mjs` `:164`, `:221-222`, `:282`, `:333`,
  `:425`; `ask-model.test.mjs:116`; `eval-ask.mjs`'s `fromSnapshot`) converted to behaviour or deleted with the file
  they read; the baseline falls.
- Sizes: `loop.ts` and `prompt.ts` smaller than at the start of the phase; say both.
- Ruben's eval re-run against PR 2.3's baseline: per surface, the one-round share, the first words, must-never pass^k,
  cost per turn; and one turn on each model (Opus 5.5, Sonnet 5) on a local build against the production edge before
  the merge, the first request that carries `search_result` blocks.

---

# PR 2.5 · Only if a day of numbers asks for it

After a day on PR 2.4, `ask-day.mjs` gives, per surface: the second-round share, the warm hit rate, the cache hit
ratio, the context's tokens and the cost per turn. If the second-round share is under 26% and follow-ups inside five
minutes are rare, the context's breakpoint goes (one line and its test). If the warm rarely hits (the question lands on
another instance), the plan for Phase 3 says what the warm becomes. Otherwise there is no PR 2.5.

---

# The phase's exit

- [ ] PRs 2.1–2.4 merged; `git grep -n "snapshot\|prefetch" apps/dashboard/src/server/ask` names neither file.
- [ ] Ruben's eval on the default model: every surface's must-never holds; the one-round share on on-page questions and
      the first words against the spec's targets (≥ 80%, ≤ 2.0 s), from `ask-day.mjs` over a day.
- [ ] The spec's §9 Phase 2 paragraph notes what was measured and what PR 2.5 decided.
- [ ] Phase 3's plan is written against that day's `main`.
